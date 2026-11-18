-- O: subscription billing (Asaas) and plan state per restaurant.
create table public.restaurant_billing (
 restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
 plan text not null check (plan in ('essencial','profissional','agencia')),
 cycle text not null default 'mensal' check (cycle in ('mensal','anual')),
 status text not null check (status in ('pendente','ativo','atrasado','cancelado','cortesia')),
 founder boolean not null default false,
 price_cents integer not null default 0 check (price_cents >= 0),
 asaas_customer_id text,
 asaas_subscription_id text,
 setup_payment_id text,
 current_period_end date,
 overdue_since date,
 cancel_at date,
 pending_plan text check (pending_plan in ('essencial','profissional')),
 pending_cycle text check (pending_cycle in ('mensal','anual')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.restaurant_billing enable row level security;
revoke all on public.restaurant_billing from anon, authenticated;
grant select on public.restaurant_billing to authenticated;
create policy owner_read on public.restaurant_billing for select to authenticated using (is_member(restaurant_id, true));

create table public.billing_events (
 id text primary key,
 restaurant_id uuid references public.restaurants(id) on delete set null,
 type text not null,
 payload jsonb not null,
 received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- Existing restaurants keep working: courtesy on the profissional plan.
insert into public.restaurant_billing(restaurant_id,plan,status) select id,'profissional','cortesia' from public.restaurants
 on conflict (restaurant_id) do nothing;

-- Effective status. Cancelling keeps status and sets cancel_at (end of paid period):
-- cancelado once cancel_at is reached (restaurant-local date); atrasado for more than 7 days
-- counts as bloqueado; no row = pendente.
create function public.restaurant_billing_state(p_restaurant uuid) returns text
language sql stable security definer set search_path=public as $$
 select coalesce((select case
   when b.cancel_at is not null and b.cancel_at <= (now() at time zone r.timezone)::date then 'cancelado'
   when b.status='atrasado' and b.overdue_since is not null and b.overdue_since < (now() at time zone r.timezone)::date - 7 then 'bloqueado'
   else b.status end
  from restaurant_billing b join restaurants r on r.id=b.restaurant_id where b.restaurant_id=p_restaurant),'pendente')
$$;
-- Effective plan for feature gating: essencial unless an active-ish profissional/agencia.
create function public.restaurant_plan(p_restaurant uuid) returns text
language sql stable security definer set search_path=public as $$
 select case when restaurant_billing_state(p_restaurant) in ('ativo','atrasado','cortesia')
   and (select plan from restaurant_billing where restaurant_id=p_restaurant) in ('profissional','agencia') then 'profissional' else 'essencial' end
$$;
-- Founder slots (10 total): active/overdue founders plus pending ones younger than 48h (so abandoned checkouts
-- cannot squat a slot), none of them effectively cancelled.
create function public.founder_slots_left() returns integer
language sql stable security definer set search_path=public as $$
 select greatest(0,10-(select count(*) from restaurant_billing where founder
   and (status in ('ativo','atrasado') or (status='pendente' and created_at > now() - interval '48 hours'))
   and restaurant_billing_state(restaurant_id)<>'cancelado'))::int
$$;
-- Default privileges on Supabase grant EXECUTE directly to anon, so revoke from anon explicitly.
revoke all on function public.restaurant_billing_state(uuid) from public, anon;
revoke all on function public.restaurant_plan(uuid) from public, anon;
grant execute on function public.restaurant_billing_state(uuid) to authenticated, service_role;
grant execute on function public.restaurant_plan(uuid) to anon, authenticated, service_role;
revoke all on function public.founder_slots_left() from public, anon;
grant execute on function public.founder_slots_left() to anon, authenticated, service_role;

-- Every new restaurant gets a billing row (pendente until checkout).
create function public.restaurant_billing_init() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into restaurant_billing(restaurant_id,plan,status) values(new.id,'essencial','pendente') on conflict (restaurant_id) do nothing;
 return new;
end $$;
revoke all on function public.restaurant_billing_init() from public, anon, authenticated;
create trigger restaurants_billing_init after insert on public.restaurants
 for each row execute function public.restaurant_billing_init();

create function public.restaurant_billing_touch() returns trigger
language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
revoke all on function public.restaurant_billing_touch() from public, anon, authenticated;
create trigger restaurant_billing_touch before update on public.restaurant_billing
 for each row execute function public.restaurant_billing_touch();

-- Hardening (found while emulating Supabase default privileges in tests): 007 granted
-- select without revoking the defaults, so anon/authenticated also held TRUNCATE etc.
revoke all on public.product_options, public.product_option_links from anon, authenticated;
grant select on public.product_options, public.product_option_links to anon, authenticated;

-- Atomic checkout start. Serialises founder-slot claims, prices the plan and resets the row to
-- pendente (created_at = now() starts the 48h founder window at checkout). Service role only.
-- Prices (cents) mirror src/lib/plans.ts.
create function public.start_subscription(p_restaurant uuid, p_plan text, p_cycle text, p_want_founder boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cur restaurant_billing%rowtype; is_founder boolean; price integer; slots integer;
begin
 if p_plan not in ('essencial','profissional') or p_cycle not in ('mensal','anual') then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from restaurants where id=p_restaurant) then raise exception 'NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtext('founder_slots'));
 select * into cur from restaurant_billing where restaurant_id=p_restaurant;
 if found and cur.status in ('ativo','atrasado','cortesia') then raise exception 'STATE_CONFLICT'; end if;
 slots := founder_slots_left();
 -- a still-pending founder row already holds its own slot
 if found and cur.founder and cur.status='pendente' and cur.created_at > now() - interval '48 hours' then slots := slots + 1; end if;
 is_founder := coalesce(p_want_founder,false) and p_plan='profissional' and p_cycle='mensal' and slots > 0;
 price := case when is_founder then 17900
   when p_plan='essencial' and p_cycle='mensal' then 14900
   when p_plan='essencial' then 149000
   when p_cycle='mensal' then 24900
   else 249000 end;
 insert into restaurant_billing(restaurant_id,plan,cycle,status,founder,price_cents,created_at)
 values(p_restaurant,p_plan,p_cycle,'pendente',is_founder,price,now())
 on conflict (restaurant_id) do update set plan=excluded.plan, cycle=excluded.cycle, status='pendente',
   founder=excluded.founder, price_cents=excluded.price_cents, created_at=now(), cancel_at=null,
   overdue_since=null, pending_plan=null, pending_cycle=null;
 return jsonb_build_object('founder',is_founder,'price_cents',price);
end $$;
revoke all on function public.start_subscription(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.start_subscription(uuid,text,text,boolean) to service_role;

-- Per-client limit for the public subscribe route (no restaurant exists yet, so it cannot use
-- public_rate_limits). Subject is an HMAC digest; no raw IP is stored.
create table public.billing_rate_limits (
 subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,
 hits integer not null check (hits > 0),
 expires_at timestamptz not null,
 primary key (subject_hash, window_start)
);
create index billing_rate_limits_expiry on public.billing_rate_limits(expires_at);
alter table public.billing_rate_limits enable row level security;
revoke all on public.billing_rate_limits from anon, authenticated;
create function public.consume_billing_rate_limit(p_subject text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare max_hits integer := 8; period_seconds integer := 600; now_ timestamptz := clock_timestamp();
  starts timestamptz; ends timestamptz; used integer;
begin
 if p_subject is null or p_subject !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
 starts := to_timestamp(floor(extract(epoch from now_)/period_seconds)*period_seconds);
 ends := starts + make_interval(secs => period_seconds);
 insert into billing_rate_limits(subject_hash,window_start,hits,expires_at) values(p_subject,starts,1,ends)
 on conflict (subject_hash,window_start) do update set hits=least(billing_rate_limits.hits+1,max_hits+1)
 returning hits into used;
 delete from billing_rate_limits where (subject_hash,window_start) in (
  select subject_hash,window_start from billing_rate_limits where expires_at < now_ - interval '1 hour' order by expires_at limit 100);
 return jsonb_build_object('allowed',used<=max_hits,'retryAfter',greatest(1,ceil(extract(epoch from ends-now_))::integer));
end $$;
revoke all on function public.consume_billing_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_billing_rate_limit(text) to service_role;
