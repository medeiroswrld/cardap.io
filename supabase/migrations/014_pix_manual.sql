-- I1: manual Pix from the menu. Online orders paid by Pix wait for the
-- restaurant to confirm the payment before reaching the kitchen.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('aguardando_pagamento','aguardando_aceite','recebido','em_preparo','pronto','saiu_para_entrega','entregue','recusado','cancelado'));

-- The key is not in "restaurants" because that table is public.
create table public.restaurant_pix (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  pix_key text not null check (length(pix_key) between 1 and 77),
  merchant_name text not null check (length(merchant_name) between 1 and 25),
  merchant_city text not null check (length(merchant_city) between 1 and 15),
  updated_at timestamptz not null default now()
);
alter table public.restaurant_pix enable row level security;
revoke all on public.restaurant_pix from anon, authenticated;
grant select on public.restaurant_pix to authenticated;
grant select on public.restaurant_pix to service_role;
create policy member_read on public.restaurant_pix for select to authenticated using (is_member(restaurant_id));

create function public.save_restaurant_pix(p_restaurant uuid,p_key text,p_name text,p_city text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if length(trim(coalesce(p_key,'')))=0 then
  delete from restaurant_pix where restaurant_id=p_restaurant;
  return;
 end if;
 if length(trim(coalesce(p_name,'')))=0 or length(trim(coalesce(p_city,'')))=0 then raise exception 'INVALID_INPUT'; end if;
 insert into restaurant_pix(restaurant_id,pix_key,merchant_name,merchant_city,updated_at)
 values(p_restaurant,trim(p_key),trim(p_name),trim(p_city),now())
 on conflict(restaurant_id) do update set pix_key=excluded.pix_key,merchant_name=excluded.merchant_name,
  merchant_city=excluded.merchant_city,updated_at=now();
end $$;
revoke all on function public.save_restaurant_pix(uuid,text,text,text) from public,anon;
grant execute on function public.save_restaurant_pix(uuid,text,text,text) to authenticated;

create function public.restaurant_pix_enabled(p_restaurant uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from restaurant_pix where restaurant_id=p_restaurant)
$$;
revoke all on function public.restaurant_pix_enabled(uuid) from public;
grant execute on function public.restaurant_pix_enabled(uuid) to anon,authenticated,service_role;

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
 initial:=case
  when kind<>'mesa' and payment='pix' and exists(select 1 from restaurant_pix where restaurant_id=p_restaurant) then 'aguardando_pagamento'
  when kind='mesa' or rest.auto_accept_orders then 'recebido'
  else 'aguardando_aceite' end;
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

create or replace function public.advance_order(p_restaurant uuid,p_order uuid,p_expected text,p_status text,p_reason text default null,p_estimate integer default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare existing orders; with_reason boolean;
begin
 if not is_member(p_restaurant) then raise exception 'FORBIDDEN'; end if;
 select * into existing from orders where id=p_order and restaurant_id=p_restaurant for update;
 if not found or existing.status<>p_expected then raise exception 'STALE_ORDER'; end if;
 with_reason:=length(trim(coalesce(p_reason,'')))>=3;
 if not (
  (existing.status='aguardando_pagamento' and p_status='recebido')
  or (existing.status='aguardando_aceite' and p_status='recebido' and p_estimate is not null)
  or (existing.status='aguardando_aceite' and p_status='recusado' and with_reason)
  or (existing.status='recebido' and p_status='em_preparo')
  or (existing.status='em_preparo' and p_status='pronto')
  or (existing.status='pronto' and p_status='entregue' and existing.fulfillment<>'entrega')
  or (existing.status='pronto' and p_status='saiu_para_entrega' and existing.fulfillment='entrega')
  or (existing.status='saiu_para_entrega' and p_status='entregue')
  or (existing.status in ('aguardando_pagamento','recebido','em_preparo','saiu_para_entrega') and p_status='cancelado' and with_reason)
 ) then raise exception 'INVALID_TRANSITION'; end if;
 update orders set status=p_status,
  cancellation_reason=case when p_status in ('cancelado','recusado') then p_reason else null end,
  estimate_minutes=coalesce(p_estimate,
   case when existing.status='aguardando_pagamento' and existing.fulfillment='entrega' then
    (select least(z.estimate_minutes,180) from order_addresses a join delivery_zones z on z.id=a.zone_id and z.restaurant_id=a.restaurant_id where a.order_id=p_order)
   end,
   estimate_minutes)
 where id=p_order;
 insert into order_status_events(restaurant_id,order_id,status,actor_id,reason) values(p_restaurant,p_order,p_status,auth.uid(),p_reason);
 return jsonb_build_object('id',p_order,'status',p_status);
end $$;
revoke all on function public.advance_order(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.advance_order(uuid,uuid,text,text,text,integer) to authenticated;

-- Unpaid Pix orders are open too: erasing the customer would drop their address and notes.
create or replace function public.crm_erase_customer(p_restaurant uuid, p_contact uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c contacts; affected integer;
begin
  if not is_member(p_restaurant, true) then raise exception 'FORBIDDEN'; end if;
  select * into c from contacts where id = p_contact and restaurant_id = p_restaurant for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from orders where restaurant_id = p_restaurant and customer_phone = c.phone
      and status in ('aguardando_pagamento','aguardando_aceite','recebido','em_preparo','pronto','saiu_para_entrega')) then
    raise exception 'CUSTOMER_HAS_OPEN_ORDERS';
  end if;
  delete from order_addresses a using orders o
    where a.order_id = o.id and a.restaurant_id = o.restaurant_id and o.restaurant_id = p_restaurant and o.customer_phone = c.phone;
  -- Free text written by the customer or about the cancellation can hold personal data: clear it too.
  update order_items i set note = '' from orders o
    where i.order_id = o.id and i.restaurant_id = o.restaurant_id and o.restaurant_id = p_restaurant
      and o.customer_phone = c.phone and i.note <> '';
  update order_status_events e set reason = null from orders o
    where e.order_id = o.id and e.restaurant_id = o.restaurant_id and o.restaurant_id = p_restaurant
      and o.customer_phone = c.phone and e.reason is not null;
  update orders set customer_name = 'Cliente removido', customer_phone = '', cancellation_reason = null
    where restaurant_id = p_restaurant and customer_phone = c.phone;
  get diagnostics affected = row_count;
  delete from marketing_consent_events where restaurant_id = p_restaurant and contact_id = c.id;
  delete from contacts where id = c.id and restaurant_id = p_restaurant;
  insert into data_erasure_events(restaurant_id, actor_id, orders_affected) values (p_restaurant, auth.uid(), affected);
  return jsonb_build_object('orders_affected', affected);
end $$;
