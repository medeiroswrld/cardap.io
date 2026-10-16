-- Ingredient removals and optional additions, priced and snapshotted by the server.
create function public.valid_ingredient_list(values_ text[]) returns boolean
language sql immutable set search_path=public as $$
 select values_ is not null and cardinality(values_) <= 30
 and not exists(select 1 from unnest(values_) v where v is null or length(trim(v)) not between 1 and 80 or v<>trim(v))
 and cardinality(values_)=(select count(distinct v) from unnest(values_) v)
$$;
alter table public.products add column removable_ingredients text[] not null default '{}' check(public.valid_ingredient_list(removable_ingredients));
alter table public.order_items add column removed_ingredients text[] not null default '{}',
 add column add_ons jsonb not null default '[]';

create table public.product_options (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 name text not null check(length(trim(name)) between 2 and 80),
 price_cents integer not null check(price_cents between 0 and 100000),
 active boolean not null default true,
 unique(restaurant_id,id)
);
create table public.product_option_links (
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 product_id uuid not null,
 option_id uuid not null,
 primary key(restaurant_id,product_id,option_id),
 foreign key(restaurant_id,product_id) references public.products(restaurant_id,id) on delete cascade,
 foreign key(restaurant_id,option_id) references public.product_options(restaurant_id,id) on delete cascade
);
create index on public.product_option_links(restaurant_id,option_id);
alter table public.product_options enable row level security;
alter table public.product_option_links enable row level security;
grant select on public.product_options,public.product_option_links to anon,authenticated;
grant all on public.product_options,public.product_option_links to service_role;
create policy read_options on public.product_options for select using(active or public.is_member(restaurant_id));
create policy read_option_links on public.product_option_links for select using(public.is_member(restaurant_id) or (
 exists(select 1 from public.products p where p.id=product_id and p.restaurant_id=product_option_links.restaurant_id and p.published and not p.archived)
 and exists(select 1 from public.product_options o where o.id=option_id and o.restaurant_id=product_option_links.restaurant_id and o.active)
));

create function public.save_product_option(p_restaurant uuid,p_id uuid,p_name text,p_price integer,p_active boolean,p_products uuid[]) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 -- Orders hold the same restaurant row FOR SHARE while resolving prices/links.
 perform id from restaurants where id=p_restaurant for update;
 if p_products is null or cardinality(p_products)>500 or
 cardinality(p_products)<>(select count(distinct v) from unnest(p_products) v) or
 exists(select 1 from unnest(p_products) v where not exists(select 1 from products p where p.id=v and p.restaurant_id=p_restaurant and not p.archived)) then raise exception 'INVALID_PRODUCTS'; end if;
 if exists(select 1 from product_options where id=p_id and restaurant_id<>p_restaurant) then raise exception 'FORBIDDEN'; end if;
 insert into product_options(id,restaurant_id,name,price_cents,active) values(p_id,p_restaurant,trim(p_name),p_price,p_active)
 on conflict(id) do update set name=excluded.name,price_cents=excluded.price_cents,active=excluded.active where product_options.restaurant_id=p_restaurant;
 if not found then raise exception 'FORBIDDEN'; end if;
 delete from product_option_links where restaurant_id=p_restaurant and option_id=p_id;
 insert into product_option_links(restaurant_id,product_id,option_id) select p_restaurant,v,p_id from unnest(p_products) v;
end $$;
revoke all on function public.save_product_option(uuid,uuid,text,integer,boolean,uuid[]) from public,anon;
grant execute on function public.save_product_option(uuid,uuid,text,integer,boolean,uuid[]) to authenticated;

create or replace function public.place_guest_order(p_restaurant uuid,p_token_hash text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare guest guest_sessions; rest restaurants; previous orders; created orders; item jsonb; product products;
 prepared jsonb:='[]'; selected_ids uuid[]; removed text[]; additions jsonb; unit_price integer;
 fingerprint text; total integer:=0; contact_id uuid; local_time timestamp; new_contact boolean:=false;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 fingerprint:=encode(digest(p_payload::text,'sha256'),'hex');
 select * into previous from orders where restaurant_id=p_restaurant and guest_session_id=guest.id and idempotency_key=p_key;
 if found then
  if previous.payload_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',previous.id,'number',previous.number,'total_cents',previous.total_cents);
 end if;
 if (select count(*) from orders where guest_session_id=guest.id and created_at>now()-interval '1 minute')>=3 then raise exception 'RATE_LIMITED'; end if;
 select * into rest from restaurants where id=p_restaurant for share;
 if not rest.accepting_orders then raise exception 'CLOSED'; end if;
 local_time:=now() at time zone rest.timezone;
 if not exists(select 1 from jsonb_array_elements(rest.opening_hours) h where (h->>'day')::int=extract(dow from local_time)::int and local_time::time >= (h->>'open')::time and local_time::time < (h->>'close')::time) then raise exception 'CLOSED'; end if;
 if not exists(select 1 from dining_tables where id=(p_payload->>'table_id')::uuid and restaurant_id=p_restaurant and active) then raise exception 'INVALID_TABLE'; end if;
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
 insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,idempotency_key,payload_hash)
 values(p_restaurant,guest.id,(p_payload->>'table_id')::uuid,trim(p_payload->>'name'),p_payload->>'phone',total,p_key,fingerprint) returning * into created;
 for item in select * from jsonb_array_elements(prepared) loop
  insert into order_items(restaurant_id,order_id,product_id,product_name,unit_price_cents,quantity,note,removed_ingredients,add_ons)
  values(p_restaurant,created.id,(item->>'product_id')::uuid,item->>'product_name',(item->>'price')::integer,(item->>'quantity')::integer,item->>'note',array(select v from jsonb_array_elements_text(item->'removed') v),item->'additions');
 end loop;
 insert into order_status_events(restaurant_id,order_id,status) values(p_restaurant,created.id,'recebido');
 insert into contacts(restaurant_id,name,phone,marketing_status) values(p_restaurant,trim(p_payload->>'name'),p_payload->>'phone',case when (p_payload->>'marketing_consent')::boolean then 'authorized' else 'not_authorized' end)
 on conflict(restaurant_id,phone) do nothing returning id into contact_id;
 new_contact:=contact_id is not null;
 if new_contact then
  insert into marketing_consent_events(restaurant_id,contact_id,action,text_version,consent_text,source)
  values(p_restaurant,contact_id,case when (p_payload->>'marketing_consent')::boolean then 'authorized' else 'not_authorized' end,'1','Quero receber novidades e ofertas do '||rest.name||' no WhatsApp. Posso cancelar quando quiser.','checkout');
 else
  update contacts set last_seen_at=now() where restaurant_id=p_restaurant and phone=p_payload->>'phone';
 end if;
 return jsonb_build_object('id',created.id,'number',created.number,'total_cents',created.total_cents);
end $$;
revoke all on function public.place_guest_order(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.place_guest_order(uuid,text,uuid,jsonb) to service_role;

