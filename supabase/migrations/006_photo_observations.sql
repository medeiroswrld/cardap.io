create table public.photo_view_sessions (
 id uuid primary key, restaurant_id uuid not null references restaurants(id) on delete cascade,
 guest_session_id uuid not null, product_id uuid not null, photo_url text not null,
 visible_seconds numeric not null check(visible_seconds between 0 and 3600),
 qualified boolean not null, sequence integer not null check(sequence>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(restaurant_id,guest_session_id) references guest_sessions(restaurant_id,id),
 foreign key(restaurant_id,product_id) references products(restaurant_id,id)
);
alter table public.photo_view_sessions enable row level security;
revoke all on public.photo_view_sessions from anon,authenticated;
grant select on public.photo_view_sessions to authenticated;
create policy owner_read on public.photo_view_sessions for select to authenticated using(is_member(restaurant_id,true));
create index photo_views_tenant_time on public.photo_view_sessions(restaurant_id,created_at);

create function public.record_photo_view(p_restaurant uuid,p_token_hash text,p_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare guest guest_sessions; previous photo_view_sessions; seconds numeric; photo text;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 select p.photo_url into photo from products p join categories c on c.id=p.category_id and c.restaurant_id=p.restaurant_id
 where p.id=(p_payload->>'product_id')::uuid and p.restaurant_id=p_restaurant and p.published and not p.archived and c.visible;
 if photo is null or photo is distinct from p_payload->>'photo_url' then raise exception 'INVALID_PHOTO'; end if;
 seconds:=(p_payload->>'visible_seconds')::numeric;
 if seconds is null or seconds<0 or seconds>3600 or (p_payload->>'sequence')::int is null or (p_payload->>'sequence')::int<=0 then raise exception 'INVALID_OBSERVATION'; end if;
 select * into previous from photo_view_sessions where id=(p_payload->>'id')::uuid for update;
 if found then
  if previous.restaurant_id<>p_restaurant or previous.guest_session_id<>guest.id or previous.product_id<>(p_payload->>'product_id')::uuid or previous.photo_url<>photo then raise exception 'FORBIDDEN'; end if;
  if previous.sequence>=(p_payload->>'sequence')::int then return; end if;
  if seconds<previous.visible_seconds or seconds-previous.visible_seconds>extract(epoch from(now()-previous.updated_at))+2 then raise exception 'INVALID_INTERVAL'; end if;
 else
  if seconds>10 or (select count(*) from photo_view_sessions where guest_session_id=guest.id and created_at>now()-interval '1 minute')>=30 then raise exception 'RATE_LIMITED'; end if;
 end if;
 insert into photo_view_sessions(id,restaurant_id,guest_session_id,product_id,photo_url,visible_seconds,qualified,sequence)
 values((p_payload->>'id')::uuid,p_restaurant,guest.id,(p_payload->>'product_id')::uuid,photo,seconds,seconds>=1,(p_payload->>'sequence')::int)
 on conflict(id) do update set visible_seconds=excluded.visible_seconds,qualified=excluded.qualified,sequence=excluded.sequence,updated_at=now();
end $$;
revoke all on function public.record_photo_view(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_photo_view(uuid,text,jsonb) to service_role;

create function public.photo_associations(p_restaurant uuid,p_days integer default 30)
returns table(product_id uuid,photo_url text,viewer_sessions bigint,cart_sessions bigint,order_sessions bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_days not in(7,30) then raise exception 'INVALID_PERIOD'; end if;
 return query
 with viewers as(select distinct v.product_id,v.photo_url,v.guest_session_id from photo_view_sessions v where v.restaurant_id=p_restaurant and v.qualified and v.created_at>=now()-make_interval(days=>p_days))
 select v.product_id,v.photo_url,count(*),
 count(*) filter(where exists(select 1 from cart_add_events c where c.restaurant_id=p_restaurant and c.product_id=v.product_id and c.guest_session_id=v.guest_session_id and c.created_at>=now()-make_interval(days=>p_days))),
 count(*) filter(where exists(select 1 from orders o join order_items i on i.order_id=o.id and i.restaurant_id=o.restaurant_id where o.restaurant_id=p_restaurant and o.guest_session_id=v.guest_session_id and i.product_id=v.product_id and o.created_at>=now()-make_interval(days=>p_days)))
 from viewers v group by v.product_id,v.photo_url;
end $$;
revoke all on function public.photo_associations(uuid,integer) from public,anon;
grant execute on function public.photo_associations(uuid,integer) to authenticated;
