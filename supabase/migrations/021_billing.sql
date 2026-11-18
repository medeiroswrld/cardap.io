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
