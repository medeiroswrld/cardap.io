-- Optional auto-accept: online orders skip "aguardando_aceite" and start as "recebido".
-- Delivery orders take the zone estimate; the team still moves preparing/ready/delivered.
alter table public.restaurants add column auto_accept_orders boolean not null default true;

create or replace function public.place_guest_order(p_restaurant uuid,p_token_hash text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare guest guest_sessions; rest restaurants; previous orders; created orders; item jsonb; product products;
 prepared jsonb:='[]'; selected_ids uuid[]; removed text[]; additions jsonb; unit_price integer;
 fingerprint text; total integer:=0; contact_id uuid; local_time timestamp; new_contact boolean:=false;
 kind text; payment text; change_for integer; fee integer:=0; zone delivery_zones; addr jsonb; initial text;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 fingerprint:=encode(digest(p_payload::text,'sha256'),'hex');
 select * into previous from orders where restaurant_id=p_restaurant and guest_session_id=guest.id and idempotency_key=p_key;
 if found then
  if previous.payload_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',previous.id,'number',previous.number,'total_cents',previous.total_cents,'status',previous.status);
 end if;
 if (select count(*) from orders where guest_session_id=guest.id and created_at>now()-interval '1 minute')>=3 then raise exception 'RATE_LIMITED'; end if;
 select * into rest from restaurants where id=p_restaurant for share;
 if not rest.accepting_orders then raise exception 'CLOSED'; end if;
 local_time:=now() at time zone rest.timezone;
 if not exists(select 1 from jsonb_array_elements(rest.opening_hours) h where (h->>'day')::int=extract(dow from local_time)::int and local_time::time >= (h->>'open')::time and local_time::time < (h->>'close')::time) then raise exception 'CLOSED'; end if;
 kind:=coalesce(p_payload->>'fulfillment','mesa');
 if kind not in ('mesa','retirada','entrega') then raise exception 'INVALID_INPUT'; end if;
 if kind='mesa' then
  if not exists(select 1 from dining_tables where id=(p_payload->>'table_id')::uuid and restaurant_id=p_restaurant and active) then raise exception 'INVALID_TABLE'; end if;
 else
  if kind='retirada' and not rest.pickup_enabled then raise exception 'PICKUP_DISABLED'; end if;
  if kind='entrega' and not rest.delivery_enabled then raise exception 'DELIVERY_DISABLED'; end if;
  payment:=p_payload->>'payment_method';
  if payment is null or payment not in ('dinheiro','cartao','pix') then raise exception 'INVALID_PAYMENT'; end if;
  change_for:=nullif(p_payload->>'change_for_cents','')::integer;
 end if;
 if kind='entrega' then
  addr:=p_payload->'address';
  if jsonb_typeof(addr)<>'object' then raise exception 'INVALID_ADDRESS'; end if;
  select * into zone from delivery_zones where id=(addr->>'zone_id')::uuid and restaurant_id=p_restaurant and active for share;
  if not found then raise exception 'INVALID_ZONE'; end if;
  -- The customer confirmed this fee in the checkout; a changed fee must be confirmed again.
  if (p_payload->>'expected_fee_cents')::integer is distinct from zone.fee_cents then raise exception 'PRICE_CHANGED'; end if;
  if length(trim(coalesce(addr->>'street',''))) not between 3 and 150 or length(trim(coalesce(addr->>'number',''))) not between 1 and 20
   or length(coalesce(addr->>'complement',''))>80 or length(coalesce(addr->>'reference',''))>150 then raise exception 'INVALID_ADDRESS'; end if;
 end if;
 if length(trim(p_payload->>'name')) not between 2 and 80 or coalesce(p_payload->>'phone','') !~ '^[0-9]{10,11}$' then raise exception 'INVALID_CUSTOMER'; end if;
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
 -- Lock catalog rows in deterministic order to prevent concurrent price changes/deadlocks.
 perform p.id from products p where p.restaurant_id=p_restaurant and p.id in(select (v->>'product_id')::uuid from jsonb_array_elements(p_payload->'items') v) order by p.id for share;
 for item in select * from jsonb_array_elements(p_payload->'items') loop
  select * into product from products where id=(item->>'product_id')::uuid and restaurant_id=p_restaurant;
  if not found or not product.published or not product.available or product.archived then raise exception 'UNAVAILABLE'; end if;
  if not exists(select 1 from categories where id=product.category_id and restaurant_id=p_restaurant and visible) then raise exception 'UNAVAILABLE'; end if;
  if (item->>'quantity')::integer not between 1 and 20 or length(coalesce(item->>'note',''))>300 then raise exception 'INVALID_QUANTITY'; end if;
  if jsonb_typeof(coalesce(item->'option_ids','[]'))<>'array' or jsonb_typeof(coalesce(item->'removed_ingredients','[]'))<>'array' then raise exception 'OPTIONS_CHANGED'; end if;
  selected_ids:=array(select v::uuid from jsonb_array_elements_text(coalesce(item->'option_ids','[]')) v);
  removed:=array(select v from jsonb_array_elements_text(coalesce(item->'removed_ingredients','[]')) v);
  if cardinality(selected_ids)>30 or cardinality(selected_ids)<>(select count(distinct v) from unnest(selected_ids) v)
   or not valid_ingredient_list(removed) or not removed <@ product.removable_ingredients then raise exception 'OPTIONS_CHANGED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'price_cents',o.price_cents) order by o.id),'[]'),product.price_cents+coalesce(sum(o.price_cents),0)
   into additions,unit_price from product_options o join product_option_links l on l.option_id=o.id and l.restaurant_id=o.restaurant_id
   where o.restaurant_id=p_restaurant and l.product_id=product.id and o.active and o.id=any(selected_ids);
  if jsonb_array_length(additions)<>cardinality(selected_ids) then raise exception 'OPTIONS_CHANGED'; end if;
  if unit_price is distinct from (item->>'expected_price')::integer then raise exception 'PRICE_CHANGED'; end if;
  prepared:=prepared||jsonb_build_array(jsonb_build_object('product_id',product.id,'product_name',product.name,'price',unit_price,'quantity',(item->>'quantity')::integer,'note',coalesce(item->>'note',''),'removed',to_jsonb(removed),'additions',additions));
  total:=total+unit_price*(item->>'quantity')::integer;
 end loop;
 if kind='entrega' then
  if total<rest.delivery_min_order_cents then raise exception 'BELOW_MINIMUM'; end if;
  fee:=zone.fee_cents;
  total:=total+fee;
 end if;
 if change_for is not null and (payment<>'dinheiro' or change_for<total) then raise exception 'INVALID_CHANGE'; end if;
 initial:=case when kind='mesa' or rest.auto_accept_orders then 'recebido' else 'aguardando_aceite' end;
 insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,idempotency_key,payload_hash,status,fulfillment,delivery_fee_cents,payment_method,change_for_cents,estimate_minutes)
 values(p_restaurant,guest.id,case when kind='mesa' then (p_payload->>'table_id')::uuid end,trim(p_payload->>'name'),p_payload->>'phone',total,p_key,fingerprint,initial,kind,fee,payment,change_for,
  case when kind='entrega' and initial='recebido' then least(zone.estimate_minutes,180) end) returning * into created;
 if kind='entrega' then
  insert into order_addresses(order_id,restaurant_id,zone_id,zone_name,street,number,complement,reference)
  values(created.id,p_restaurant,zone.id,zone.name,trim(addr->>'street'),trim(addr->>'number'),trim(coalesce(addr->>'complement','')),trim(coalesce(addr->>'reference','')));
 end if;
 for item in select * from jsonb_array_elements(prepared) loop
  insert into order_items(restaurant_id,order_id,product_id,product_name,unit_price_cents,quantity,note,removed_ingredients,add_ons)
  values(p_restaurant,created.id,(item->>'product_id')::uuid,item->>'product_name',(item->>'price')::integer,(item->>'quantity')::integer,item->>'note',array(select v from jsonb_array_elements_text(item->'removed') v),item->'additions');
 end loop;
 insert into order_status_events(restaurant_id,order_id,status) values(p_restaurant,created.id,initial);
 insert into contacts(restaurant_id,name,phone,marketing_status) values(p_restaurant,trim(p_payload->>'name'),p_payload->>'phone',case when (p_payload->>'marketing_consent')::boolean then 'authorized' else 'not_authorized' end)
 on conflict(restaurant_id,phone) do nothing returning id into contact_id;
 new_contact:=contact_id is not null;
 if new_contact then
  insert into marketing_consent_events(restaurant_id,contact_id,action,text_version,consent_text,source)
  values(p_restaurant,contact_id,case when (p_payload->>'marketing_consent')::boolean then 'authorized' else 'not_authorized' end,'1','Quero receber novidades e ofertas do '||rest.name||' no WhatsApp. Posso cancelar quando quiser.','checkout');
 else
  update contacts set last_seen_at=now() where restaurant_id=p_restaurant and phone=p_payload->>'phone';
 end if;
 return jsonb_build_object('id',created.id,'number',created.number,'total_cents',created.total_cents,'status',created.status);
end $$;
revoke all on function public.place_guest_order(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.place_guest_order(uuid,text,uuid,jsonb) to service_role;

create or replace function public.save_restaurant_settings(p_restaurant uuid,p_settings jsonb,p_tables integer) returns void
language plpgsql security definer set search_path=public as $$
declare slot jsonb;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_tables not between 1 and 100 or jsonb_typeof(p_settings->'opening_hours') <> 'array' then raise exception 'INVALID_SETTINGS'; end if;
 for slot in select * from jsonb_array_elements(p_settings->'opening_hours') loop
  if (slot->>'day')::int not between 0 and 6 or (slot->>'open')::time >= (slot->>'close')::time then raise exception 'INVALID_HOURS'; end if;
 end loop;
 update restaurants set name=p_settings->>'name',subtitle=p_settings->>'subtitle',phone=p_settings->>'phone',address=p_settings->>'address',privacy_email=p_settings->>'privacy_email',retention_days=(p_settings->>'retention_days')::int,accepting_orders=(p_settings->>'accepting_orders')::boolean,opening_hours=p_settings->'opening_hours',google_review_url=coalesce(p_settings->>'google_review_url',google_review_url),
  pickup_enabled=coalesce((p_settings->>'pickup_enabled')::boolean,pickup_enabled),
  delivery_enabled=coalesce((p_settings->>'delivery_enabled')::boolean,delivery_enabled),
  delivery_min_order_cents=coalesce((p_settings->>'delivery_min_order_cents')::integer,delivery_min_order_cents),
  auto_accept_orders=coalesce((p_settings->>'auto_accept_orders')::boolean,auto_accept_orders)
 where id=p_restaurant;
 insert into dining_tables(restaurant_id,number,active) select p_restaurant,n,true from generate_series(1,p_tables) n on conflict(restaurant_id,number) do update set active=true;
 update dining_tables set active=false where restaurant_id=p_restaurant and number>p_tables;
end $$;
