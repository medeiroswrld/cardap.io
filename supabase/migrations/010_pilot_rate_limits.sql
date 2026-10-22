-- Shared, atomic limits. No raw IP, cookie, name, phone or comment is stored.
create table public.public_rate_limits (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  action text not null check (action in ('session','order','order_table','feedback','feedback_session')),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null,
  primary key (restaurant_id, action, subject_hash, window_start)
);
create index public_rate_limits_expiry on public.public_rate_limits(expires_at);
alter table public.public_rate_limits enable row level security;
revoke all on public.public_rate_limits from anon, authenticated;

create function public.consume_public_rate_limit(p_restaurant uuid, p_action text, p_subject text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare max_hits integer; period_seconds integer := 600; current_time_ timestamptz := clock_timestamp();
  starts timestamptz; ends timestamptz; used integer;
begin
  case p_action
    when 'session' then max_hits := 60;
    when 'order' then max_hits := 120;
    when 'order_table' then max_hits := 12;
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
