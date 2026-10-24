-- Online orders: pickup and delivery alongside table orders. Payment happens at pickup/delivery.
alter table public.restaurants
  add column pickup_enabled boolean not null default false,
  add column delivery_enabled boolean not null default false,
  add column delivery_min_order_cents integer not null default 0
    check (delivery_min_order_cents between 0 and 1000000);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  fee_cents integer not null check (fee_cents between 0 and 100000),
  estimate_minutes integer not null check (estimate_minutes between 5 and 240),
  active boolean not null default true,
  position integer not null default 0 check (position between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (restaurant_id, id)
);
create unique index delivery_zones_name on public.delivery_zones(restaurant_id, lower(trim(name)));
alter table public.delivery_zones enable row level security;
revoke all on public.delivery_zones from anon, authenticated;
grant select on public.delivery_zones to anon, authenticated;
create policy public_zones on public.delivery_zones for select using (active or is_member(restaurant_id));

alter table public.orders
  add column fulfillment text not null default 'mesa' check (fulfillment in ('mesa','retirada','entrega')),
  add column delivery_fee_cents integer not null default 0 check (delivery_fee_cents between 0 and 100000),
  add column payment_method text check (payment_method in ('dinheiro','cartao','pix')),
  add column change_for_cents integer check (change_for_cents between 1 and 10000000);
alter table public.orders alter column table_id drop not null;
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('aguardando_aceite','recebido','em_preparo','pronto','saiu_para_entrega','entregue','recusado','cancelado'));
alter table public.orders add constraint orders_fulfillment_table check ((fulfillment = 'mesa') = (table_id is not null));
alter table public.orders add constraint orders_fulfillment_fee check (fulfillment = 'entrega' or delivery_fee_cents = 0);
alter table public.orders add constraint orders_fulfillment_payment check ((fulfillment = 'mesa') = (payment_method is null));
alter table public.orders add constraint orders_change check (
  change_for_cents is null or (payment_method = 'dinheiro' and change_for_cents >= total_cents));

-- Delivery address is personal data: separate table, members only, written by the RPC.
create table public.order_addresses (
  order_id uuid primary key,
  restaurant_id uuid not null,
  zone_id uuid not null,
  zone_name text not null,
  street text not null check (length(trim(street)) between 3 and 150),
  number text not null check (length(trim(number)) between 1 and 20),
  complement text not null default '' check (length(complement) <= 80),
  reference text not null default '' check (length(reference) <= 150),
  -- Matches the composite FK exactly so PostgREST embeds the address as one object, not an array.
  unique (restaurant_id, order_id),
  foreign key (restaurant_id, order_id) references public.orders(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, zone_id) references public.delivery_zones(restaurant_id, id)
);
alter table public.order_addresses enable row level security;
revoke all on public.order_addresses from anon, authenticated;
grant select on public.order_addresses to authenticated;
create policy member_read on public.order_addresses for select to authenticated using (is_member(restaurant_id));

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
 initial:=case when kind='mesa' then 'recebido' else 'aguardando_aceite' end;
 insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,idempotency_key,payload_hash,status,fulfillment,delivery_fee_cents,payment_method,change_for_cents)
 values(p_restaurant,guest.id,case when kind='mesa' then (p_payload->>'table_id')::uuid end,trim(p_payload->>'name'),p_payload->>'phone',total,p_key,fingerprint,initial,kind,fee,payment,change_for) returning * into created;
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
  (existing.status='aguardando_aceite' and p_status='recebido' and p_estimate is not null)
  or (existing.status='aguardando_aceite' and p_status='recusado' and with_reason)
  or (existing.status='recebido' and p_status='em_preparo')
  or (existing.status='em_preparo' and p_status='pronto')
  or (existing.status='pronto' and p_status='entregue' and existing.fulfillment<>'entrega')
  or (existing.status='pronto' and p_status='saiu_para_entrega' and existing.fulfillment='entrega')
  or (existing.status='saiu_para_entrega' and p_status='entregue')
  or (existing.status in ('recebido','em_preparo','saiu_para_entrega') and p_status='cancelado' and with_reason)
 ) then raise exception 'INVALID_TRANSITION'; end if;
 update orders set status=p_status,
  cancellation_reason=case when p_status in ('cancelado','recusado') then p_reason else null end,
  estimate_minutes=coalesce(p_estimate,estimate_minutes)
 where id=p_order;
 insert into order_status_events(restaurant_id,order_id,status,actor_id,reason) values(p_restaurant,p_order,p_status,auth.uid(),p_reason);
 return jsonb_build_object('id',p_order,'status',p_status);
end $$;
revoke all on function public.advance_order(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.advance_order(uuid,uuid,text,text,text,integer) to authenticated;

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
  delivery_min_order_cents=coalesce((p_settings->>'delivery_min_order_cents')::integer,delivery_min_order_cents)
 where id=p_restaurant;
 insert into dining_tables(restaurant_id,number,active) select p_restaurant,n,true from generate_series(1,p_tables) n on conflict(restaurant_id,number) do update set active=true;
 update dining_tables set active=false where restaurant_id=p_restaurant and number>p_tables;
end $$;

create function public.save_delivery_zone(p_restaurant uuid,p_id uuid,p_name text,p_fee integer,p_estimate integer,p_active boolean,p_position integer) returns uuid
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if exists(select 1 from delivery_zones where id=p_id and restaurant_id<>p_restaurant) then raise exception 'FORBIDDEN'; end if;
 insert into delivery_zones(id,restaurant_id,name,fee_cents,estimate_minutes,active,position)
 values(p_id,p_restaurant,trim(p_name),p_fee,p_estimate,p_active,p_position)
 on conflict(id) do update set name=excluded.name,fee_cents=excluded.fee_cents,estimate_minutes=excluded.estimate_minutes,active=excluded.active,position=excluded.position
  where delivery_zones.restaurant_id=excluded.restaurant_id;
 return p_id;
end $$;
revoke all on function public.save_delivery_zone(uuid,uuid,text,integer,integer,boolean,integer) from public,anon;
grant execute on function public.save_delivery_zone(uuid,uuid,text,integer,integer,boolean,integer) to authenticated;

alter table public.public_rate_limits drop constraint public_rate_limits_action_check;
alter table public.public_rate_limits add constraint public_rate_limits_action_check
  check (action in ('session','order','order_table','order_online','feedback','feedback_session'));
create or replace function public.consume_public_rate_limit(p_restaurant uuid, p_action text, p_subject text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare max_hits integer; period_seconds integer := 600; current_time_ timestamptz := clock_timestamp();
  starts timestamptz; ends timestamptz; used integer;
begin
  case p_action
    when 'session' then max_hits := 60;
    when 'order' then max_hits := 120;
    when 'order_table' then max_hits := 12;
    when 'order_online' then max_hits := 12;
    when 'feedback' then max_hits := 120;
    when 'feedback_session' then max_hits := 30;
    else raise exception 'INVALID_INPUT';
  end case;
  if p_subject is null or p_subject !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from restaurants where id=p_restaurant) then raise exception 'NOT_FOUND'; end if;
  starts := to_timestamp(floor(extract(epoch from current_time_)/period_seconds)*period_seconds);
  ends := starts + make_interval(secs => period_seconds);
  insert into public_rate_limits(restaurant_id,action,subject_hash,window_start,hits,expires_at)
  values(p_restaurant,p_action,p_subject,starts,1,ends)
  on conflict(restaurant_id,action,subject_hash,window_start) do update
    set hits=least(public_rate_limits.hits+1,max_hits+1)
  returning hits into used;
  -- Bounded opportunistic cleanup, including rejected requests. No unbounded cron required for pilot.
  delete from public_rate_limits where (restaurant_id,action,subject_hash,window_start) in (
    select restaurant_id,action,subject_hash,window_start from public_rate_limits
    where expires_at < current_time_ - interval '1 hour' order by expires_at limit 100
  );
  return jsonb_build_object('allowed',used<=max_hits,'retryAfter',greatest(1,ceil(extract(epoch from ends-current_time_))::integer));
end $$;
revoke all on function public.consume_public_rate_limit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consume_public_rate_limit(uuid,text,text) to service_role;
