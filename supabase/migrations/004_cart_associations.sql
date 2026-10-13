create table public.cart_add_events (
 id uuid primary key,restaurant_id uuid not null references restaurants(id) on delete cascade,
 guest_session_id uuid not null,product_id uuid not null,created_at timestamptz not null default now(),
 foreign key(restaurant_id,guest_session_id) references guest_sessions(restaurant_id,id),
 foreign key(restaurant_id,product_id) references products(restaurant_id,id)
);
alter table public.cart_add_events enable row level security;
revoke all on public.cart_add_events from anon,authenticated;
grant select on public.cart_add_events to authenticated;
create policy owner_read on public.cart_add_events for select to authenticated using(is_member(restaurant_id,true));
create index cart_events_tenant_time on public.cart_add_events(restaurant_id,created_at);
create function public.record_cart_add(p_restaurant uuid,p_token_hash text,p_event uuid,p_product uuid) returns void
language plpgsql security definer set search_path=public as $$
declare guest guest_sessions;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 if not exists(select 1 from products p join categories c on c.id=p.category_id and c.restaurant_id=p.restaurant_id where p.id=p_product and p.restaurant_id=p_restaurant and p.published and p.available and not p.archived and c.visible) then raise exception 'UNAVAILABLE'; end if;
 if (select count(*) from cart_add_events where guest_session_id=guest.id and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMITED'; end if;
 insert into cart_add_events(id,restaurant_id,guest_session_id,product_id) values(p_event,p_restaurant,guest.id,p_product) on conflict(id) do nothing;
end $$;
revoke all on function public.record_cart_add(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_cart_add(uuid,text,uuid,uuid) to service_role;

create function public.video_associations(p_restaurant uuid,p_days integer default 30)
returns table(product_id uuid,media_version uuid,viewer_sessions bigint,cart_sessions bigint,order_sessions bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_days not in(7,30) then raise exception 'INVALID_PERIOD'; end if;
 return query
 with viewers as (select distinct v.product_id,v.media_version,v.guest_session_id from video_view_sessions v where v.restaurant_id=p_restaurant and v.qualified and v.created_at>=now()-make_interval(days=>p_days))
 select v.product_id,v.media_version,count(*),
 count(*) filter(where exists(select 1 from cart_add_events c where c.restaurant_id=p_restaurant and c.product_id=v.product_id and c.guest_session_id=v.guest_session_id and c.created_at>=now()-make_interval(days=>p_days))),
 count(*) filter(where exists(select 1 from orders o join order_items i on i.order_id=o.id and i.restaurant_id=o.restaurant_id where o.restaurant_id=p_restaurant and o.guest_session_id=v.guest_session_id and i.product_id=v.product_id and o.created_at>=now()-make_interval(days=>p_days)))
 from viewers v group by v.product_id,v.media_version;
end $$;
revoke all on function public.video_associations(uuid,integer) from public,anon;
grant execute on function public.video_associations(uuid,integer) to authenticated;
