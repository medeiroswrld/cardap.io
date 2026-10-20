-- Feedback belongs to a verified delivered purchase and never exposes customer data.
alter table public.restaurants add column google_review_url text not null default '';
alter table public.restaurants add constraint google_review_url_valid check (
 google_review_url = '' or (length(google_review_url)<=500 and google_review_url ~ '^https://(g\.page/[^?#]+/review|search\.google\.com/local/writereview\?placeid=[^&]+|www\.google\.com/maps/[^[:space:]]+|maps\.app\.goo\.gl/[^[:space:]]+)$')
);

create table public.product_feedback (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references restaurants(id) on delete cascade,
 guest_session_id uuid not null,
 order_id uuid not null,
 product_id uuid not null,
 liked boolean not null default false,
 comment text not null default '' check(length(comment)<=1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(restaurant_id,guest_session_id,product_id),
 foreign key(restaurant_id,guest_session_id) references guest_sessions(restaurant_id,id),
 foreign key(restaurant_id,order_id) references orders(restaurant_id,id),
 foreign key(restaurant_id,product_id) references products(restaurant_id,id)
);
create index product_feedback_product on public.product_feedback(restaurant_id,product_id,updated_at desc);
alter table public.product_feedback enable row level security;
revoke all on public.product_feedback from anon,authenticated;
grant select on public.product_feedback to authenticated;
create policy feedback_owner_read on public.product_feedback for select to authenticated using(is_member(restaurant_id,true));

create function public.save_guest_feedback(p_restaurant uuid,p_token_hash text,p_order uuid,p_product uuid,p_liked boolean,p_comment text) returns void
language plpgsql security definer set search_path=public as $$
declare guest guest_sessions;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 if not exists(select 1 from orders o join order_items i on i.order_id=o.id and i.restaurant_id=o.restaurant_id
   where o.restaurant_id=p_restaurant and o.id=p_order and o.guest_session_id=guest.id and o.status='entregue' and i.product_id=p_product)
 then raise exception 'DELIVERED_PURCHASE_REQUIRED'; end if;
 if p_liked is null or p_comment is null or length(p_comment)>1000 then raise exception 'INVALID_FEEDBACK'; end if;
 insert into product_feedback(restaurant_id,guest_session_id,order_id,product_id,liked,comment)
 values(p_restaurant,guest.id,p_order,p_product,p_liked,trim(p_comment))
 on conflict(restaurant_id,guest_session_id,product_id) do update
 set liked=excluded.liked,comment=excluded.comment,updated_at=now();
end $$;
revoke all on function public.save_guest_feedback(uuid,text,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.save_guest_feedback(uuid,text,uuid,uuid,boolean,text) to service_role;

create function public.read_guest_feedback(p_restaurant uuid,p_product uuid,p_token_hash text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare guest_id uuid; eligible uuid; own product_feedback; result jsonb;
begin
 if not exists(select 1 from products p join categories c on c.id=p.category_id and c.restaurant_id=p.restaurant_id
  where p.restaurant_id=p_restaurant and p.id=p_product and p.published and not p.archived and c.visible)
 then raise exception 'PRODUCT_NOT_FOUND'; end if;
 select id into guest_id from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now();
 select o.id into eligible from orders o where o.restaurant_id=p_restaurant and o.guest_session_id=guest_id and o.status='entregue'
  and exists(select 1 from order_items i where i.restaurant_id=p_restaurant and i.order_id=o.id and i.product_id=p_product)
  order by o.created_at desc limit 1;
 select * into own from product_feedback where restaurant_id=p_restaurant and product_id=p_product and guest_session_id=guest_id;
 select jsonb_build_object(
  'likes',count(*) filter(where liked),
  'commentCount',count(*) filter(where comment<>''),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'comment',f.comment,'liked',f.liked,'updated_at',f.updated_at))
    from (select id,comment,liked,updated_at from product_feedback where restaurant_id=p_restaurant and product_id=p_product and comment<>'' order by updated_at desc,id limit 20) f),'[]'::jsonb),
  'eligibleOrderId',eligible,
  'mine',case when own.id is null then null else jsonb_build_object('liked',own.liked,'comment',own.comment) end,
  'googleReviewUrl',case when eligible is not null then (select google_review_url from restaurants where id=p_restaurant) else '' end
 ) into result from product_feedback where restaurant_id=p_restaurant and product_id=p_product;
 return result;
end $$;
revoke all on function public.read_guest_feedback(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_guest_feedback(uuid,uuid,text) to service_role;

-- Keep settings and table updates in the same transaction.
create or replace function public.save_restaurant_settings(p_restaurant uuid,p_settings jsonb,p_tables integer) returns void
language plpgsql security definer set search_path=public as $$
declare slot jsonb;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_tables not between 1 and 100 or jsonb_typeof(p_settings->'opening_hours') <> 'array' then raise exception 'INVALID_SETTINGS'; end if;
 for slot in select * from jsonb_array_elements(p_settings->'opening_hours') loop
  if (slot->>'day')::int not between 0 and 6 or (slot->>'open')::time >= (slot->>'close')::time then raise exception 'INVALID_HOURS'; end if;
 end loop;
 update restaurants set name=p_settings->>'name',subtitle=p_settings->>'subtitle',phone=p_settings->>'phone',address=p_settings->>'address',privacy_email=p_settings->>'privacy_email',retention_days=(p_settings->>'retention_days')::int,accepting_orders=(p_settings->>'accepting_orders')::boolean,opening_hours=p_settings->'opening_hours',google_review_url=coalesce(p_settings->>'google_review_url',google_review_url) where id=p_restaurant;
 insert into dining_tables(restaurant_id,number,active) select p_restaurant,n,true from generate_series(1,p_tables) n on conflict(restaurant_id,number) do update set active=true;
 update dining_tables set active=false where restaurant_id=p_restaurant and number>p_tables;
end $$;
