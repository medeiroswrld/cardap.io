-- M: coupons, lapsed customers and order origin.
create table public.coupons (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
 kind text not null check (kind in ('percent','fixed')),
 value integer not null check ((kind='percent' and value between 1 and 90) or (kind='fixed' and value between 1 and 50000)),
 min_order_cents integer not null default 0 check (min_order_cents between 0 and 100000),
 valid_until date,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique (restaurant_id, code)
);
alter table public.coupons enable row level security;
create policy member_read on public.coupons for select to authenticated using (is_member(restaurant_id));

create table public.order_origins (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 slug text not null check (slug ~ '^[a-z0-9-]{2,30}$' and slug not in ('mesa','ifood','instagram','direto')),
 name text not null check (length(trim(name)) between 2 and 40),
 created_at timestamptz not null default now(),
 unique (restaurant_id, slug)
);
alter table public.order_origins enable row level security;
create policy member_read on public.order_origins for select to authenticated using (is_member(restaurant_id));
revoke all on public.coupons, public.order_origins from anon, authenticated;
grant select on public.coupons,public.order_origins to authenticated;

alter table public.orders add column coupon_code text,
 add column discount_cents integer not null default 0 check (discount_cents >= 0),
 add column origin text check (origin is null or origin ~ '^[a-z0-9-]{2,30}$');

-- Shared rule: returns the discount in cents or raises COUPON_*.
create function public.coupon_discount(p_restaurant uuid,p_code text,p_subtotal integer) returns integer
language plpgsql volatile security definer set search_path=public as $$
declare c coupons; tz text;
begin
 -- Lock the coupon row so a concurrent delete/rename waits for this order transaction.
 select * into c from coupons where restaurant_id=p_restaurant and code=upper(trim(coalesce(p_code,''))) and active for share;
 if not found then raise exception 'COUPON_INVALID'; end if;
 select timezone into tz from restaurants where id=p_restaurant;
 if c.valid_until is not null and (now() at time zone tz)::date > c.valid_until then raise exception 'COUPON_EXPIRED'; end if;
 if p_subtotal < c.min_order_cents then raise exception 'COUPON_MIN_ORDER'; end if;
 return case when c.kind='percent' then floor(p_subtotal::bigint*c.value/100.0)::int else least(c.value,p_subtotal) end;
end $$;
revoke all on function public.coupon_discount(uuid,text,integer) from public,anon,authenticated;

-- Preview for the menu, served through the API (no subtotal check here; the menu checks the minimum itself and the order revalidates).
create function public.check_coupon(p_restaurant uuid,p_code text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c coupons; tz text;
begin
 select * into c from coupons where restaurant_id=p_restaurant and code=upper(trim(coalesce(p_code,''))) and active;
 if not found then raise exception 'COUPON_INVALID'; end if;
 select timezone into tz from restaurants where id=p_restaurant;
 if c.valid_until is not null and (now() at time zone tz)::date > c.valid_until then raise exception 'COUPON_EXPIRED'; end if;
 return jsonb_build_object('code',c.code,'kind',c.kind,'value',c.value,'min_order_cents',c.min_order_cents,'valid_until',c.valid_until);
end $$;
-- Called only by the Next.js API with the service client (which rate-limits it).
revoke all on function public.check_coupon(uuid,text) from public,anon,authenticated;
grant execute on function public.check_coupon(uuid,text) to service_role;

create function public.save_coupon(p_restaurant uuid,p_id uuid,p_coupon jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare existing coupons; new_code text:=upper(trim(coalesce(p_coupon->>'code',''))); saved uuid;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_id is not null then
  select * into existing from coupons where id=p_id and restaurant_id=p_restaurant for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if existing.code<>new_code and exists(select 1 from orders where restaurant_id=p_restaurant and coupon_code=existing.code) then raise exception 'COUPON_USED'; end if;
 end if;
 if exists(select 1 from coupons where restaurant_id=p_restaurant and code=new_code and id is distinct from p_id) then raise exception 'COUPON_DUPLICATE'; end if;
 insert into coupons(id,restaurant_id,code,kind,value,min_order_cents,valid_until,active)
 values(coalesce(p_id,gen_random_uuid()),p_restaurant,new_code,p_coupon->>'kind',(p_coupon->>'value')::int,coalesce((p_coupon->>'min_order_cents')::int,0),nullif(p_coupon->>'valid_until','')::date,coalesce((p_coupon->>'active')::boolean,true))
 on conflict(id) do update set code=excluded.code,kind=excluded.kind,value=excluded.value,min_order_cents=excluded.min_order_cents,valid_until=excluded.valid_until,active=excluded.active
 returning id into saved;
 return saved;
exception when check_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or not_null_violation then raise exception 'INVALID_INPUT';
 when unique_violation then raise exception 'COUPON_DUPLICATE';
end $$;
revoke all on function public.save_coupon(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_coupon(uuid,uuid,jsonb) to authenticated;

create function public.delete_coupon(p_restaurant uuid,p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c coupons;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 select * into c from coupons where id=p_id and restaurant_id=p_restaurant for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from orders where restaurant_id=p_restaurant and coupon_code=c.code) then raise exception 'COUPON_USED'; end if;
 delete from coupons where id=p_id;
end $$;
revoke all on function public.delete_coupon(uuid,uuid) from public,anon;
grant execute on function public.delete_coupon(uuid,uuid) to authenticated;

create function public.coupon_stats(p_restaurant uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 return coalesce((select jsonb_object_agg(coupon_code,jsonb_build_object('uses',n,'discount_cents',d))
  from (select coupon_code,count(*)::int n,sum(discount_cents)::bigint d from orders
        where restaurant_id=p_restaurant and coupon_code is not null and status not in ('recusado','cancelado') group by coupon_code) s),'{}'::jsonb);
end $$;
revoke all on function public.coupon_stats(uuid) from public,anon;
grant execute on function public.coupon_stats(uuid) to authenticated;

create function public.save_origin(p_restaurant uuid,p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare base text; candidate text; n int:=1; created order_origins;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 perform 1 from restaurants where id=p_restaurant for update;
 if length(trim(coalesce(p_name,''))) not between 2 and 40 then raise exception 'INVALID_INPUT'; end if;
 if (select count(*) from order_origins where restaurant_id=p_restaurant)>=20 then raise exception 'LIMIT_REACHED'; end if;
 base:=trim(both '-' from left(trim(both '-' from regexp_replace(translate(lower(trim(p_name)),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),'[^a-z0-9]+','-','g')),26));
 if length(base)<2 then base:='origem'; end if;
 candidate:=base;
 while candidate in ('mesa','ifood','instagram','direto') or exists(select 1 from order_origins where restaurant_id=p_restaurant and slug=candidate) loop
  n:=n+1; candidate:=base||'-'||n;
 end loop;
 insert into order_origins(restaurant_id,slug,name) values(p_restaurant,candidate,trim(p_name)) returning * into created;
 return jsonb_build_object('id',created.id,'slug',created.slug,'name',created.name);
end $$;
revoke all on function public.save_origin(uuid,text) from public,anon;
grant execute on function public.save_origin(uuid,text) to authenticated;

create function public.delete_origin(p_restaurant uuid,p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 delete from order_origins where id=p_id and restaurant_id=p_restaurant;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.delete_origin(uuid,uuid) from public,anon;
grant execute on function public.delete_origin(uuid,uuid) to authenticated;

create function public.lapsed_customers(p_restaurant uuid,p_days integer,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_days not in (30,60,90) or p_offset is null or p_offset<0 then raise exception 'INVALID_INPUT'; end if;
 return jsonb_build_object(
  'total',(select count(*) from crm_rows(p_restaurant) where marketing_status='authorized' and last_order_at < now()-make_interval(days=>p_days)),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'phone',x.phone,'last_order_at',x.last_order_at,'orders_count',x.orders_count,'spent_cents',x.spent_cents) order by x.last_order_at asc,x.id)
   from (select * from crm_rows(p_restaurant) where marketing_status='authorized' and last_order_at < now()-make_interval(days=>p_days)
         order by last_order_at asc,id offset p_offset limit 50) x),'[]'::jsonb));
end $$;
revoke all on function public.lapsed_customers(uuid,integer,integer) from public,anon;
grant execute on function public.lapsed_customers(uuid,integer,integer) to authenticated;

create function public.origin_report(p_restaurant uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tz text; m_start timestamptz; m_end timestamptz;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_month is null then raise exception 'INVALID_INPUT'; end if;
 select timezone into tz from restaurants where id=p_restaurant;
 m_start:=date_trunc('month',p_month)::date::timestamp at time zone tz;
 m_end:=(date_trunc('month',p_month)::date+interval '1 month')::timestamp at time zone tz;
 return coalesce((select jsonb_agg(jsonb_build_object('origin',k,'orders',n,'total_cents',t) order by t desc,k)
  from (select case when fulfillment='mesa' then 'mesa' else coalesce(origin,'direto') end k,count(*)::int n,sum(total_cents)::bigint t
        from orders where restaurant_id=p_restaurant and status='entregue' and created_at>=m_start and created_at<m_end group by 1) s),'[]'::jsonb);
end $$;
revoke all on function public.origin_report(uuid,date) from public,anon;
grant execute on function public.origin_report(uuid,date) to authenticated;

create or replace function public.place_guest_order(p_restaurant uuid,p_token_hash text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare guest guest_sessions; rest restaurants; previous orders; created orders; item jsonb; product products;
 prepared jsonb:='[]'; selected_ids uuid[]; removed text[]; additions jsonb; unit_price integer;
 fingerprint text; total integer:=0; contact_id uuid; local_time timestamp; new_contact boolean:=false;
 kind text; payment text; discount integer:=0; coupon text; origin_slug text; change_for integer; fee integer:=0; zone delivery_zones; addr jsonb; initial text;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 fingerprint:=encode(digest(p_payload::text,'sha256'),'hex');
 select * into previous from orders where restaurant_id=p_restaurant and guest_session_id=guest.id and idempotency_key=p_key;
 if found then
  if previous.payload_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',previous.id,'number',previous.number,'total_cents',previous.total_cents,'status',previous.status,'discount_cents',previous.discount_cents);
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
 coupon:=nullif(upper(trim(coalesce(p_payload->>'coupon_code',''))),'');
 if coupon is not null then
  discount:=coupon_discount(p_restaurant,coupon,total);
  if discount is distinct from (p_payload->>'expected_discount_cents')::integer then raise exception 'PRICE_CHANGED'; end if;
 end if;
 if kind='entrega' then
  if total<rest.delivery_min_order_cents then raise exception 'BELOW_MINIMUM'; end if;
  fee:=zone.fee_cents;
 end if;
 total:=total-discount+fee;
 -- A coupon worth the whole order is rejected: orders.total_cents must stay positive.
 if total<=0 then raise exception 'COUPON_EXCEEDS_TOTAL'; end if;
 origin_slug:=nullif(p_payload->>'origin','');
 if not (kind<>'mesa' and origin_slug is not null and (origin_slug in ('ifood','instagram') or exists(select 1 from order_origins where restaurant_id=p_restaurant and slug=origin_slug))) then origin_slug:=null; end if;
 if change_for is not null and (payment<>'dinheiro' or change_for<total) then raise exception 'INVALID_CHANGE'; end if;
 initial:=case
  when kind<>'mesa' and payment='pix' and exists(select 1 from restaurant_pix where restaurant_id=p_restaurant) then 'aguardando_pagamento'
  when kind='mesa' or rest.auto_accept_orders then 'recebido'
  else 'aguardando_aceite' end;
 insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,idempotency_key,payload_hash,status,fulfillment,delivery_fee_cents,payment_method,change_for_cents,estimate_minutes,coupon_code,discount_cents,origin)
 values(p_restaurant,guest.id,case when kind='mesa' then (p_payload->>'table_id')::uuid end,trim(p_payload->>'name'),p_payload->>'phone',total,p_key,fingerprint,initial,kind,fee,payment,change_for,
  case when kind='entrega' and initial='recebido' then least(zone.estimate_minutes,180) end,coupon,discount,origin_slug) returning * into created;
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
 return jsonb_build_object('id',created.id,'number',created.number,'total_cents',created.total_cents,'status',created.status,'discount_cents',created.discount_cents);
end $$;
revoke all on function public.place_guest_order(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.place_guest_order(uuid,text,uuid,jsonb) to service_role;
