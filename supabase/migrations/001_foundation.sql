-- Apply on a new Supabase project. Not validated against a live database yet.
create extension if not exists pgcrypto;

create table public.restaurants (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9-]{3,60}$'),
 name text not null check(length(name) between 2 and 80), accepting_orders boolean not null default false,
 timezone text not null default 'America/Sao_Paulo',
 opening_hours jsonb not null default '[]', -- [{day:0..6,open:"18:00",close:"23:00"}]; empty = closed
 created_at timestamptz not null default now()
);
create table public.restaurant_members (
 restaurant_id uuid not null references restaurants(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','operations')), primary key(restaurant_id,user_id)
);
create function public.is_member(tenant uuid, owner_only boolean default false) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from restaurant_members where restaurant_id=tenant and user_id=auth.uid() and (not owner_only or role='owner'));
$$;
revoke all on function public.is_member(uuid,boolean) from public;
grant execute on function public.is_member(uuid,boolean) to anon, authenticated;

create table public.categories (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 name text not null check(length(name) between 2 and 50), position integer not null default 0, visible boolean not null default true,
 unique(restaurant_id,id)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 category_id uuid not null, name text not null check(length(name) between 2 and 100), description text not null default '',
 ingredients text not null default '', allergens text not null default '', price_cents integer not null check(price_cents>0 and price_cents<=1000000),
 photo_url text, published boolean not null default false, available boolean not null default true, archived boolean not null default false,
 position integer not null default 0, created_at timestamptz not null default now(), unique(restaurant_id,id),
 foreign key(restaurant_id,category_id) references categories(restaurant_id,id)
);
create table public.product_media (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 product_id uuid not null, kind text not null check(kind in ('photo','video')), provider_asset_id text unique,
 version uuid not null default gen_random_uuid(), state text not null default 'uploading' check(state in ('uploading','processing','ready','failed')),
 playback_url text, duration_seconds numeric, created_at timestamptz not null default now(), unique(restaurant_id,id),
 foreign key(restaurant_id,product_id) references products(restaurant_id,id)
);
create table public.dining_tables (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 number integer not null check(number between 1 and 1000), active boolean not null default true,
 unique(restaurant_id,number), unique(restaurant_id,id)
);
create table public.guest_sessions (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64), expires_at timestamptz not null,
 created_at timestamptz not null default now(), unique(restaurant_id,id)
);
create table public.contacts (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 name text not null, phone text not null check(phone ~ '^[0-9]{10,11}$'), verified boolean not null default false,
 marketing_status text not null default 'not_authorized' check(marketing_status in ('authorized','not_authorized','revoked')),
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 unique(restaurant_id,phone), unique(restaurant_id,id)
);
create table public.marketing_consent_events (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 contact_id uuid not null, action text not null check(action in ('authorized','not_authorized','revoked')),
 purpose text not null default 'restaurant_offers', text_version text not null, consent_text text not null, source text not null,
 created_at timestamptz not null default now(), foreign key(restaurant_id,contact_id) references contacts(restaurant_id,id)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity,
 restaurant_id uuid not null references restaurants(id) on delete cascade, guest_session_id uuid not null, table_id uuid not null,
 customer_name text not null, customer_phone text not null, total_cents integer not null check(total_cents>0),
 status text not null default 'recebido' check(status in ('recebido','em_preparo','pronto','entregue','cancelado')),
 idempotency_key uuid not null, payload_hash text not null, estimate_minutes integer check(estimate_minutes between 1 and 180),
 cancellation_reason text, created_at timestamptz not null default now(), unique(restaurant_id,id),unique(restaurant_id,guest_session_id,idempotency_key),
 foreign key(restaurant_id,guest_session_id) references guest_sessions(restaurant_id,id),foreign key(restaurant_id,table_id) references dining_tables(restaurant_id,id)
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 order_id uuid not null, product_id uuid not null, product_name text not null, unit_price_cents integer not null check(unit_price_cents>0),
 quantity integer not null check(quantity between 1 and 20), note text not null default '' check(length(note)<=300),
 foreign key(restaurant_id,order_id) references orders(restaurant_id,id),foreign key(restaurant_id,product_id) references products(restaurant_id,id)
);
create table public.order_status_events (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 order_id uuid not null,status text not null,actor_id uuid references auth.users(id), reason text,created_at timestamptz not null default now(),
 foreign key(restaurant_id,order_id) references orders(restaurant_id,id)
);
create table public.video_view_sessions (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references restaurants(id) on delete cascade,
 guest_session_id uuid not null, product_id uuid not null, media_id uuid not null, media_version uuid not null,
 watched_seconds numeric not null default 0 check(watched_seconds between 0 and 3600),coverage numeric not null default 0 check(coverage between 0 and 1),
 qualified boolean not null default false,sequence integer not null default 0 check(sequence>=0),position integer not null default 0,
 created_at timestamptz not null default now(),unique(restaurant_id,guest_session_id,media_id,id),
 foreign key(restaurant_id,guest_session_id) references guest_sessions(restaurant_id,id),
 foreign key(restaurant_id,product_id) references products(restaurant_id,id),foreign key(restaurant_id,media_id) references product_media(restaurant_id,id)
);
create index orders_restaurant_created on orders(restaurant_id,created_at desc);
create index products_restaurant_category on products(restaurant_id,category_id,position);
create index contacts_restaurant_created on contacts(restaurant_id,last_seen_at desc);
create index views_restaurant_media on video_view_sessions(restaurant_id,media_id,created_at);
create index guests_expiration on guest_sessions(expires_at);
create index members_user on restaurant_members(user_id);

-- Explicitly enable RLS for every table, including service-only tables.
do $$ declare table_name text; begin
 foreach table_name in array array['restaurants','restaurant_members','categories','products','product_media','dining_tables','guest_sessions','contacts','marketing_consent_events','orders','order_items','order_status_events','video_view_sessions'] loop
 execute format('alter table public.%I enable row level security',table_name);
 execute format('revoke all on public.%I from anon, authenticated',table_name);
 end loop;
end $$;
grant select on restaurants,categories,products,product_media,dining_tables to anon,authenticated;
grant select on restaurant_members,orders,order_items,order_status_events,contacts,marketing_consent_events,video_view_sessions to authenticated;
grant insert,update,delete on categories,products,dining_tables to authenticated;
-- product_media writes are server-only: browser cannot claim an upload is ready.
grant update on restaurants to authenticated;
create policy public_restaurant on restaurants for select using(true);
create policy owner_restaurant on restaurants for update to authenticated using(is_member(id,true)) with check(is_member(id,true));
create policy members_read on restaurant_members for select to authenticated using(user_id=auth.uid() or is_member(restaurant_id,true));
create policy public_categories on categories for select using(visible or is_member(restaurant_id));
create policy public_products on products for select using((published and not archived and exists(select 1 from categories c where c.id=category_id and c.restaurant_id=products.restaurant_id and c.visible)) or is_member(restaurant_id));
create policy public_media on product_media for select using((state='ready' and exists(select 1 from products p where p.id=product_id and p.restaurant_id=product_media.restaurant_id and p.published and not p.archived)) or is_member(restaurant_id));
create policy public_tables on dining_tables for select using(active or is_member(restaurant_id));
do $$ declare table_name text; begin
 foreach table_name in array array['categories','products','product_media','dining_tables'] loop
 execute format('create policy owner_insert on public.%I for insert to authenticated with check(public.is_member(restaurant_id,true))',table_name);
 execute format('create policy owner_update on public.%I for update to authenticated using(public.is_member(restaurant_id,true)) with check(public.is_member(restaurant_id,true))',table_name);
 end loop;
 foreach table_name in array array['categories','products','dining_tables'] loop
 execute format('create policy owner_delete on public.%I for delete to authenticated using(public.is_member(restaurant_id,true))',table_name);
 end loop;
 foreach table_name in array array['orders','order_items','order_status_events'] loop
 execute format('create policy member_read on public.%I for select to authenticated using(public.is_member(restaurant_id))',table_name);
 end loop;
 foreach table_name in array array['contacts','marketing_consent_events','video_view_sessions'] loop
 execute format('create policy owner_read on public.%I for select to authenticated using(public.is_member(restaurant_id,true))',table_name);
 end loop;
end $$;

-- No direct writes to orders from browser roles. Entire order is one transaction.
create function public.place_guest_order(p_restaurant uuid,p_token_hash text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare guest guest_sessions; rest restaurants; previous orders; created orders; item jsonb; product products;
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
  if product.price_cents<>(item->>'expected_price')::integer then raise exception 'PRICE_CHANGED'; end if;
  total:=total+product.price_cents*(item->>'quantity')::integer;
 end loop;
 insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,idempotency_key,payload_hash)
 values(p_restaurant,guest.id,(p_payload->>'table_id')::uuid,trim(p_payload->>'name'),p_payload->>'phone',total,p_key,fingerprint) returning * into created;
 for item in select * from jsonb_array_elements(p_payload->'items') loop
  select * into product from products where id=(item->>'product_id')::uuid and restaurant_id=p_restaurant;
  insert into order_items(restaurant_id,order_id,product_id,product_name,unit_price_cents,quantity,note)
  values(p_restaurant,created.id,product.id,product.name,product.price_cents,(item->>'quantity')::integer,coalesce(item->>'note',''));
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

create function public.advance_order(p_restaurant uuid,p_order uuid,p_expected text,p_status text,p_reason text default null,p_estimate integer default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare existing orders;
begin
 if not is_member(p_restaurant) then raise exception 'FORBIDDEN'; end if;
 select * into existing from orders where id=p_order and restaurant_id=p_restaurant for update;
 if not found or existing.status<>p_expected then raise exception 'STALE_ORDER'; end if;
 if not ((existing.status='recebido' and p_status='em_preparo') or (existing.status='em_preparo' and p_status='pronto') or (existing.status='pronto' and p_status='entregue') or (existing.status in('recebido','em_preparo') and p_status='cancelado' and length(trim(p_reason))>=3)) then raise exception 'INVALID_TRANSITION'; end if;
 update orders set status=p_status,cancellation_reason=case when p_status='cancelado' then p_reason else null end,estimate_minutes=coalesce(p_estimate,estimate_minutes) where id=p_order;
 insert into order_status_events(restaurant_id,order_id,status,actor_id,reason) values(p_restaurant,p_order,p_status,auth.uid(),p_reason);
 return jsonb_build_object('id',p_order,'status',p_status);
end $$;
revoke all on function public.advance_order(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.advance_order(uuid,uuid,text,text,text,integer) to authenticated;

create function public.onboard_restaurant(p_name text,p_slug text) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 if exists(select 1 from restaurant_members where user_id=auth.uid() and role='owner') then raise exception 'ALREADY_ONBOARDED'; end if;
 insert into restaurants(name,slug) values(trim(p_name),p_slug) returning id into tenant;
 insert into restaurant_members values(tenant,auth.uid(),'owner');
 insert into categories(restaurant_id,name,position) values(tenant,'Lanches',0),(tenant,'Porções',1),(tenant,'Bebidas',2);
 return tenant;
end $$;
revoke all on function public.onboard_restaurant(text,text) from public,anon;
grant execute on function public.onboard_restaurant(text,text) to authenticated;

create function public.revoke_marketing(p_restaurant uuid,p_contact uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 update contacts set marketing_status='revoked' where id=p_contact and restaurant_id=p_restaurant;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into marketing_consent_events(restaurant_id,contact_id,action,text_version,consent_text,source) values(p_restaurant,p_contact,'revoked','1','Revogação solicitada ao restaurante.','owner');
end $$;
revoke all on function public.revoke_marketing(uuid,uuid) from public,anon;
grant execute on function public.revoke_marketing(uuid,uuid) to authenticated;

-- Realtime postgres_changes checks SELECT RLS for each subscriber.
alter publication supabase_realtime add table public.orders;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('restaurant-media','restaurant-media',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy media_public on storage.objects for select using(bucket_id='restaurant-media');
create policy media_owner_insert on storage.objects for insert to authenticated with check(bucket_id='restaurant-media' and public.is_member(((storage.foldername(name))[1])::uuid,true));
create policy media_owner_update on storage.objects for update to authenticated using(bucket_id='restaurant-media' and public.is_member(((storage.foldername(name))[1])::uuid,true)) with check(bucket_id='restaurant-media' and public.is_member(((storage.foldername(name))[1])::uuid,true));
create policy media_owner_delete on storage.objects for delete to authenticated using(bucket_id='restaurant-media' and public.is_member(((storage.foldername(name))[1])::uuid,true));
