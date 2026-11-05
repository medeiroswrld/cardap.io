-- Restaurant CRM: tags/notes on contacts, segment rules, owner-only analytics and LGPD erasure.
create function public.valid_crm_tags(p text[]) returns boolean
language sql immutable set search_path=public as $$
  select coalesce(cardinality(p),0) <= 10
    and not exists(select 1 from unnest(p) t where t <> trim(t) or length(t) not between 1 and 30)
    and (select count(distinct lower(t)) from unnest(p) t) = coalesce(cardinality(p),0)
$$;

alter table public.contacts
  add column tags text[] not null default '{}' check (public.valid_crm_tags(tags)),
  add column notes text not null default '' check (length(notes) <= 2000);

alter table public.restaurants
  add column crm_recurring_min_orders integer not null default 2 check (crm_recurring_min_orders between 2 and 50),
  add column crm_recurring_days integer not null default 60 check (crm_recurring_days between 7 and 365),
  add column crm_vip_min_orders integer not null default 5 check (crm_vip_min_orders between 2 and 100),
  add column crm_vip_min_spent_cents integer not null default 50000 check (crm_vip_min_spent_cents between 0 and 100000000),
  add column crm_vip_days integer not null default 90 check (crm_vip_days between 7 and 365),
  add column crm_lapsed_days integer not null default 30 check (crm_lapsed_days between 7 and 365);

create table public.data_erasure_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  orders_affected integer not null check (orders_affected >= 0),
  created_at timestamptz not null default now()
);
alter table public.data_erasure_events enable row level security;
revoke all on public.data_erasure_events from anon, authenticated;
grant select on public.data_erasure_events to authenticated;
create policy owner_read on public.data_erasure_events for select to authenticated using (is_member(restaurant_id, true));

create index orders_restaurant_phone on public.orders(restaurant_id, customer_phone, created_at desc);

-- Single source of truth for totals and segments. Internal: not executable by API roles; runs with the
-- privileges of the definer functions below that call it (security invoker, so it never elevates on its own).
create function public.crm_rows(p_restaurant uuid)
returns table(id uuid, name text, phone text, marketing_status text, tags text[], notes text,
  orders_count integer, spent_cents bigint, avg_ticket_cents integer,
  first_order_at timestamptz, last_order_at timestamptz, segment text)
language sql stable security invoker set search_path=public as $$
  with r as (select * from restaurants where id = p_restaurant),
  o as (
    select customer_phone as phone,
      count(*)::int as orders_count,
      sum(total_cents)::bigint as spent_cents,
      min(created_at) as first_at,
      max(created_at) as last_at,
      count(*) filter (where created_at >= now() - make_interval(days => (select crm_recurring_days from r)))::int as rec_orders,
      count(*) filter (where created_at >= now() - make_interval(days => (select crm_vip_days from r)))::int as vip_orders,
      coalesce(sum(total_cents) filter (where created_at >= now() - make_interval(days => (select crm_vip_days from r))), 0)::bigint as vip_spent
    from orders
    where restaurant_id = p_restaurant and status not in ('recusado','cancelado') and customer_phone <> ''
    group by customer_phone
  )
  select c.id, c.name, c.phone, c.marketing_status, c.tags, c.notes,
    coalesce(o.orders_count, 0),
    coalesce(o.spent_cents, 0),
    case when coalesce(o.orders_count, 0) = 0 then 0 else round(o.spent_cents::numeric / o.orders_count)::int end,
    o.first_at, o.last_at,
    case
      when coalesce(o.orders_count, 0) = 0 then 'sem_pedidos'
      when o.last_at < now() - make_interval(days => r.crm_lapsed_days) then 'sumido'
      when o.vip_orders >= r.crm_vip_min_orders
        or (r.crm_vip_min_spent_cents > 0 and o.vip_spent >= r.crm_vip_min_spent_cents) then 'vip'
      when o.rec_orders >= r.crm_recurring_min_orders then 'recorrente'
      else 'novo'
    end
  from contacts c cross join r left join o on o.phone = c.phone
  where c.restaurant_id = p_restaurant
$$;
revoke all on function public.crm_rows(uuid) from public, anon, authenticated;

create function public.crm_customers(p_restaurant uuid, p_search text, p_segment text, p_tag text,
  p_marketing_only boolean, p_sort text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s text := nullif(trim(coalesce(p_search, '')), ''); pattern text; digits text; sort text := coalesce(p_sort, 'last_order'); result jsonb;
begin
  if not is_member(p_restaurant, true) then raise exception 'FORBIDDEN'; end if;
  if p_segment is not null and p_segment not in ('novo','recorrente','vip','sumido','sem_pedidos') then raise exception 'INVALID_INPUT'; end if;
  if sort not in ('last_order','spent','orders','name') or p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset < 0 or length(coalesce(p_search, '')) > 80 then raise exception 'INVALID_INPUT'; end if;
  pattern := '%' || replace(replace(replace(lower(coalesce(s, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- Phone search only when the term is digits plus phone punctuation with at least 3 digits; otherwise name only.
  if s ~ '^[0-9()+\s.-]+$' then
    digits := regexp_replace(s, '\D', '', 'g');
    if length(digits) < 3 then digits := null; end if;
  end if;
  with base as (select * from crm_rows(p_restaurant)),
  filtered as (
    select * from base
    where (s is null or lower(name) like pattern or (digits is not null and phone like '%' || digits || '%'))
      and (p_segment is null or segment = p_segment)
      and (nullif(trim(coalesce(p_tag, '')), '') is null or exists(select 1 from unnest(tags) t where lower(t) = lower(trim(p_tag))))
      and (not coalesce(p_marketing_only, false) or marketing_status = 'authorized')
  ),
  ranked as (
    select f.*, row_number() over (order by
      case when sort = 'last_order' then last_order_at end desc nulls last,
      case when sort = 'spent' then spent_cents end desc,
      case when sort = 'orders' then orders_count end desc,
      case when sort = 'name' then lower(name) end asc,
      id) as rn
    from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'segments', (select jsonb_build_object(
      'novo', count(*) filter (where segment = 'novo'),
      'recorrente', count(*) filter (where segment = 'recorrente'),
      'vip', count(*) filter (where segment = 'vip'),
      'sumido', count(*) filter (where segment = 'sumido'),
      'sem_pedidos', count(*) filter (where segment = 'sem_pedidos')) from base),
    'customers', coalesce((select jsonb_agg(to_jsonb(x) - 'notes' - 'rn' order by x.rn) from ranked x
      where x.rn > p_offset and x.rn <= p_offset + p_limit), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.crm_customer(p_restaurant uuid, p_contact uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare cust jsonb; ph text;
begin
  if not is_member(p_restaurant, true) then raise exception 'FORBIDDEN'; end if;
  select to_jsonb(b), b.phone into cust, ph from crm_rows(p_restaurant) b where b.id = p_contact;
  if cust is null then raise exception 'NOT_FOUND'; end if;
  return cust || jsonb_build_object(
    'favorites', coalesce((select jsonb_agg(jsonb_build_object('product_name', f.product_name, 'quantity', f.q) order by f.q desc, f.product_name)
      from (select i.product_name, sum(i.quantity)::int as q
            from order_items i join orders o on o.id = i.order_id and o.restaurant_id = i.restaurant_id
            where o.restaurant_id = p_restaurant and o.customer_phone = ph and o.status not in ('recusado','cancelado')
            group by i.product_name order by q desc, i.product_name limit 3) f), '[]'::jsonb),
    'fulfillment_mix', (select jsonb_build_object(
        'mesa', count(*) filter (where fulfillment = 'mesa'),
        'retirada', count(*) filter (where fulfillment = 'retirada'),
        'entrega', count(*) filter (where fulfillment = 'entrega'))
      from orders where restaurant_id = p_restaurant and customer_phone = ph and status not in ('recusado','cancelado')),
    'addresses', coalesce((select jsonb_agg(y.a order by y.at desc) from (
        select * from (
          select distinct on (lower(a.street), lower(a.number), lower(a.complement))
            jsonb_build_object('zone_name', a.zone_name, 'street', a.street, 'number', a.number,
              'complement', a.complement, 'reference', a.reference) as a, o.created_at as at
          from order_addresses a join orders o on o.id = a.order_id and o.restaurant_id = a.restaurant_id
          where o.restaurant_id = p_restaurant and o.customer_phone = ph
          order by lower(a.street), lower(a.number), lower(a.complement), o.created_at desc) x
        order by x.at desc limit 3) y), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(z.j order by z.created_at desc) from (
        select jsonb_build_object('id', id, 'number', number, 'created_at', created_at, 'status', status,
          'fulfillment', fulfillment, 'total_cents', total_cents) as j, created_at
        from orders where restaurant_id = p_restaurant and customer_phone = ph
        order by created_at desc limit 20) z), '[]'::jsonb)
  );
end $$;

create function public.crm_save_customer(p_restaurant uuid, p_contact uuid, p_tags text[], p_notes text) returns void
language plpgsql security definer set search_path=public as $$
declare clean text[];
begin
  if not is_member(p_restaurant, true) then raise exception 'FORBIDDEN'; end if;
  select coalesce(array_agg(t order by ord), '{}') into clean from (
    select distinct on (lower(trim(v))) trim(v) as t, ord
    from unnest(coalesce(p_tags, '{}')) with ordinality as u(v, ord)
    where trim(v) <> ''
    order by lower(trim(v)), ord) z;
  if not valid_crm_tags(clean) or length(coalesce(p_notes, '')) > 2000 then raise exception 'INVALID_INPUT'; end if;
  update contacts set tags = clean, notes = coalesce(p_notes, '') where id = p_contact and restaurant_id = p_restaurant;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create function public.crm_campaign(p_restaurant uuid, p_segment text, p_tag text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tag text := nullif(trim(coalesce(p_tag, '')), '');
begin
  if not is_member(p_restaurant, true) then raise exception 'FORBIDDEN'; end if;
  if (p_segment is null and tag is null)
    or (p_segment is not null and p_segment not in ('novo','recorrente','vip','sumido','sem_pedidos')) then raise exception 'INVALID_INPUT'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'phone', x.phone, 'segment', x.segment,
      'last_order_at', x.last_order_at, 'spent_cents', x.spent_cents) order by x.last_order_at desc nulls last, x.id)
    from (select * from crm_rows(p_restaurant)
          where marketing_status = 'authorized'
            and (p_segment is null or segment = p_segment)
            and (tag is null or exists(select 1 from unnest(tags) t where lower(t) = lower(tag)))
          order by last_order_at desc nulls last, id limit 1000) x), '[]'::jsonb);
end $$;

create function public.crm_save_settings(p_restaurant uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_member(p_restaurant, true) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_settings) <> 'object' or exists(
    select 1 from unnest(array['recurring_min_orders','recurring_days','vip_min_orders','vip_min_spent_cents','vip_days','lapsed_days']) k
    where jsonb_typeof(p_settings -> k) is distinct from 'number') then raise exception 'INVALID_INPUT'; end if;
  update restaurants set
    crm_recurring_min_orders = (p_settings ->> 'recurring_min_orders')::int,
    crm_recurring_days = (p_settings ->> 'recurring_days')::int,
    crm_vip_min_orders = (p_settings ->> 'vip_min_orders')::int,
    crm_vip_min_spent_cents = (p_settings ->> 'vip_min_spent_cents')::int,
    crm_vip_days = (p_settings ->> 'vip_days')::int,
    crm_lapsed_days = (p_settings ->> 'lapsed_days')::int
  where id = p_restaurant;
end $$;

create function public.crm_erase_customer(p_restaurant uuid, p_contact uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c contacts; affected integer;
begin
  if not is_member(p_restaurant, true) then raise exception 'FORBIDDEN'; end if;
  select * into c from contacts where id = p_contact and restaurant_id = p_restaurant for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from orders where restaurant_id = p_restaurant and customer_phone = c.phone
      and status in ('aguardando_aceite','recebido','em_preparo','pronto','saiu_para_entrega')) then
    raise exception 'CUSTOMER_HAS_OPEN_ORDERS';
  end if;
  delete from order_addresses a using orders o
    where a.order_id = o.id and a.restaurant_id = o.restaurant_id and o.restaurant_id = p_restaurant and o.customer_phone = c.phone;
  -- Free text written by the customer or about the cancellation can hold personal data: clear it too.
  update order_items i set note = '' from orders o
    where i.order_id = o.id and i.restaurant_id = o.restaurant_id and o.restaurant_id = p_restaurant
      and o.customer_phone = c.phone and i.note <> '';
  update order_status_events e set reason = null from orders o
    where e.order_id = o.id and e.restaurant_id = o.restaurant_id and o.restaurant_id = p_restaurant
      and o.customer_phone = c.phone and e.reason is not null;
  update orders set customer_name = 'Cliente removido', customer_phone = '', cancellation_reason = null
    where restaurant_id = p_restaurant and customer_phone = c.phone;
  get diagnostics affected = row_count;
  delete from marketing_consent_events where restaurant_id = p_restaurant and contact_id = c.id;
  delete from contacts where id = c.id and restaurant_id = p_restaurant;
  insert into data_erasure_events(restaurant_id, actor_id, orders_affected) values (p_restaurant, auth.uid(), affected);
  return jsonb_build_object('orders_affected', affected);
end $$;

revoke all on function public.crm_customers(uuid,text,text,text,boolean,text,integer,integer) from public, anon;
revoke all on function public.crm_customer(uuid,uuid) from public, anon;
revoke all on function public.crm_save_customer(uuid,uuid,text[],text) from public, anon;
revoke all on function public.crm_campaign(uuid,text,text) from public, anon;
revoke all on function public.crm_save_settings(uuid,jsonb) from public, anon;
revoke all on function public.crm_erase_customer(uuid,uuid) from public, anon;
grant execute on function public.crm_customers(uuid,text,text,text,boolean,text,integer,integer) to authenticated;
grant execute on function public.crm_customer(uuid,uuid) to authenticated;
grant execute on function public.crm_save_customer(uuid,uuid,text[],text) to authenticated;
grant execute on function public.crm_campaign(uuid,text,text) to authenticated;
grant execute on function public.crm_save_settings(uuid,jsonb) to authenticated;
grant execute on function public.crm_erase_customer(uuid,uuid) to authenticated;
