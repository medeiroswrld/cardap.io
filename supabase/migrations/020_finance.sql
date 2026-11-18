-- N: owner finance — fees, expenses/other income, cash day, month result, bills.
alter table public.restaurants
 add column card_fee_percent numeric(4,2) not null default 0 check (card_fee_percent between 0 and 15),
 add column pix_fee_percent numeric(4,2) not null default 0 check (pix_fee_percent between 0 and 15);

create table public.finance_entries (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 kind text not null check (kind in ('expense','income')),
 description text not null,
 category text check (category in ('insumos','embalagens','funcionarios','aluguel','contas','marketing','impostos','outros')),
 amount_cents integer not null check (amount_cents > 0),
 entry_date date not null,
 due_date date,
 paid_at date,
 created_at timestamptz not null default now(),
 check ((kind='expense' and category is not null and length(trim(description)) between 2 and 80 and amount_cents <= 100000000 and (paid_at is not null or due_date is not null))
     or (kind='income' and category is null and due_date is null and paid_at = entry_date and length(trim(description)) between 2 and 60 and amount_cents <= 10000000))
);
create index finance_entries_restaurant_date on public.finance_entries(restaurant_id, entry_date);
create index finance_entries_open_bills on public.finance_entries(restaurant_id, due_date) where kind='expense' and paid_at is null;
alter table public.finance_entries enable row level security;
revoke all on public.finance_entries from anon, authenticated;
grant select on public.finance_entries to authenticated;
create policy owner_read on public.finance_entries for select to authenticated using (is_member(restaurant_id, true));

create function public.save_payment_fees(p_restaurant uuid,p_card numeric,p_pix numeric) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_card is null or p_pix is null or p_card<0 or p_card>15 or p_pix<0 or p_pix>15 then raise exception 'INVALID_INPUT'; end if;
 update restaurants set card_fee_percent=round(p_card,2),pix_fee_percent=round(p_pix,2) where id=p_restaurant;
end $$;
revoke all on function public.save_payment_fees(uuid,numeric,numeric) from public,anon;
grant execute on function public.save_payment_fees(uuid,numeric,numeric) to authenticated;

create function public.save_finance_entry(p_restaurant uuid,p_id uuid,p_entry jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare k text:=p_entry->>'kind'; d date; paid boolean; due date; saved uuid;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_entry is null or jsonb_typeof(p_entry)<>'object' or k is null or k not in ('expense','income') then raise exception 'INVALID_INPUT'; end if;
 d:=(p_entry->>'entry_date')::date;
 if p_id is not null and not exists(select 1 from finance_entries where id=p_id and restaurant_id=p_restaurant and kind=k) then raise exception 'NOT_FOUND'; end if;
 if k='income' then
  insert into finance_entries(id,restaurant_id,kind,description,category,amount_cents,entry_date,due_date,paid_at)
  values(coalesce(p_id,gen_random_uuid()),p_restaurant,'income',trim(p_entry->>'description'),null,(p_entry->>'amount_cents')::int,d,null,d)
  on conflict(id) do update set description=excluded.description,amount_cents=excluded.amount_cents,entry_date=excluded.entry_date,paid_at=excluded.paid_at
  returning id into saved;
 else
  paid:=coalesce((p_entry->>'paid')::boolean,false);
  due:=nullif(p_entry->>'due_date','')::date;
  if not paid and due is null then raise exception 'DUE_DATE_REQUIRED'; end if;
  insert into finance_entries(id,restaurant_id,kind,description,category,amount_cents,entry_date,due_date,paid_at)
  values(coalesce(p_id,gen_random_uuid()),p_restaurant,'expense',trim(p_entry->>'description'),p_entry->>'category',(p_entry->>'amount_cents')::int,d,due,
   case when paid then coalesce(nullif(p_entry->>'paid_at','')::date,d) end)
  on conflict(id) do update set description=excluded.description,category=excluded.category,amount_cents=excluded.amount_cents,entry_date=excluded.entry_date,due_date=excluded.due_date,paid_at=excluded.paid_at
  returning id into saved;
 end if;
 return saved;
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then raise exception 'INVALID_INPUT';
end $$;
revoke all on function public.save_finance_entry(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_finance_entry(uuid,uuid,jsonb) to authenticated;

create function public.delete_finance_entry(p_restaurant uuid,p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 delete from finance_entries where id=p_id and restaurant_id=p_restaurant;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.delete_finance_entry(uuid,uuid) from public,anon;
grant execute on function public.delete_finance_entry(uuid,uuid) to authenticated;

create function public.set_entry_paid(p_restaurant uuid,p_id uuid,p_paid boolean) returns void
language plpgsql security definer set search_path=public as $$
declare tz text;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 select timezone into tz from restaurants where id=p_restaurant;
 update finance_entries set
  paid_at=case when p_paid then (now() at time zone tz)::date end,
  due_date=coalesce(due_date,entry_date)
 where id=p_id and restaurant_id=p_restaurant and kind='expense';
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.set_entry_paid(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_entry_paid(uuid,uuid,boolean) to authenticated;

-- Delivered Fome Play sales in [p_from, p_to) local dates, by method, plus fee estimates.
create function public.finance_sales(p_restaurant uuid,p_from date,p_to date) returns jsonb
language sql stable security definer set search_path=public as $$
 with r as (select timezone tz,card_fee_percent cardp,pix_fee_percent pixp from restaurants where id=p_restaurant),
 o as (
  select case when o.fulfillment='mesa' then 'mesa' else coalesce(o.payment_method,'outro') end m,o.total_cents,o.delivery_fee_cents,o.discount_cents
  from orders o,r where o.restaurant_id=p_restaurant and o.status='entregue'
   and o.created_at>=(p_from::timestamp at time zone r.tz) and o.created_at<(p_to::timestamp at time zone r.tz)),
 g as (select m,count(*)::int n,sum(total_cents)::bigint t from o group by m)
 select jsonb_build_object(
  'methods',coalesce((select jsonb_agg(jsonb_build_object('method',m,'orders',n,'total_cents',t) order by t desc,m) from g),'[]'::jsonb),
  'items_cents',coalesce((select sum(total_cents-delivery_fee_cents+discount_cents) from o),0),
  'delivery_fees_cents',coalesce((select sum(delivery_fee_cents) from o),0),
  'discount_cents',coalesce((select sum(discount_cents) from o),0),
  'sold_cents',coalesce((select sum(total_cents) from o),0),
  'machine_fee_cents',floor(coalesce((select t from g where m='cartao'),0)*(select cardp from r)/100.0)::bigint
                     +floor(coalesce((select t from g where m='pix'),0)*(select pixp from r)/100.0)::bigint)
$$;
revoke all on function public.finance_sales(uuid,date,date) from public,anon,authenticated;

create function public.cash_day(p_restaurant uuid,p_day date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s jsonb; inc jsonb; inc_total bigint;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_day is null then raise exception 'INVALID_INPUT'; end if;
 s:=finance_sales(p_restaurant,p_day,p_day+1);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'description',description,'amount_cents',amount_cents) order by created_at),'[]'::jsonb),coalesce(sum(amount_cents),0)
  into inc,inc_total from finance_entries where restaurant_id=p_restaurant and kind='income' and entry_date=p_day;
 return s||jsonb_build_object('day',p_day,'other_income',inc,'other_income_cents',inc_total,
  'net_cents',(s->>'sold_cents')::bigint-(s->>'machine_fee_cents')::bigint+inc_total);
end $$;
revoke all on function public.cash_day(uuid,date) from public,anon;
grant execute on function public.cash_day(uuid,date) to authenticated;

create function public.finance_month(p_restaurant uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare m date; prev date; s jsonb; ps jsonb; inc bigint; pinc bigint; exp bigint; pexp bigint; profit bigint; pprofit bigint;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_month is null then raise exception 'INVALID_INPUT'; end if;
 m:=date_trunc('month',p_month)::date; prev:=(m-interval '1 month')::date;
 s:=finance_sales(p_restaurant,m,(m+interval '1 month')::date);
 ps:=finance_sales(p_restaurant,prev,m);
 select coalesce(sum(amount_cents) filter (where kind='income' and entry_date>=m and entry_date<m+interval '1 month'),0),
        coalesce(sum(amount_cents) filter (where kind='income' and entry_date>=prev and entry_date<m),0),
        coalesce(sum(amount_cents) filter (where kind='expense' and entry_date>=m and entry_date<m+interval '1 month'),0),
        coalesce(sum(amount_cents) filter (where kind='expense' and entry_date>=prev and entry_date<m),0)
  into inc,pinc,exp,pexp from finance_entries where restaurant_id=p_restaurant and entry_date>=prev and entry_date<m+interval '1 month';
 profit:=(s->>'sold_cents')::bigint+inc-(s->>'machine_fee_cents')::bigint-exp;
 pprofit:=(ps->>'sold_cents')::bigint+pinc-(ps->>'machine_fee_cents')::bigint-pexp;
 return jsonb_build_object('month',m,'sales',s,'other_income_cents',inc,'expenses_cents',exp,'profit_cents',profit,'previous_profit_cents',pprofit,
  'by_category',coalesce((select jsonb_agg(jsonb_build_object('category',category,'total_cents',t) order by t desc,category) from
    (select category,sum(amount_cents)::bigint t from finance_entries where restaurant_id=p_restaurant and kind='expense' and entry_date>=m and entry_date<m+interval '1 month' group by category) c),'[]'::jsonb),
  'entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'description',description,'category',category,'amount_cents',amount_cents,'entry_date',entry_date,'due_date',due_date,'paid_at',paid_at) order by entry_date desc,created_at desc) from
    finance_entries where restaurant_id=p_restaurant and entry_date>=m and entry_date<m+interval '1 month'),'[]'::jsonb));
end $$;
revoke all on function public.finance_month(uuid,date) from public,anon;
grant execute on function public.finance_month(uuid,date) to authenticated;

create function public.bills_due(p_restaurant uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tz text; today date;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 select timezone into tz from restaurants where id=p_restaurant; today:=(now() at time zone tz)::date;
 return jsonb_build_object('today',today,
  'open',coalesce((select jsonb_agg(jsonb_build_object('id',id,'description',description,'category',category,'amount_cents',amount_cents,'entry_date',entry_date,'due_date',due_date) order by due_date,created_at) from
    finance_entries where restaurant_id=p_restaurant and kind='expense' and paid_at is null),'[]'::jsonb),
  'due_this_week',(select count(*) from finance_entries where restaurant_id=p_restaurant and kind='expense' and paid_at is null and due_date<=today+7),
  'recently_paid',coalesce((select jsonb_agg(jsonb_build_object('id',id,'description',description,'category',category,'amount_cents',amount_cents,'due_date',due_date,'paid_at',paid_at) order by paid_at desc,created_at desc) from
    finance_entries where restaurant_id=p_restaurant and kind='expense' and paid_at is not null and paid_at>=today-30),'[]'::jsonb));
end $$;
revoke all on function public.bills_due(uuid) from public,anon;
grant execute on function public.bills_due(uuid) to authenticated;
