-- J: monthly results report. Everything is computed here because the management
-- workspace only loads the last 200 orders.
alter table public.restaurants add column ifood_fee_percent numeric(5,2) not null default 27
  check (ifood_fee_percent between 0 and 60);

create function public.set_ifood_fee(p_restaurant uuid,p_percent numeric) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_percent is null or p_percent<0 or p_percent>60 then raise exception 'INVALID_INPUT'; end if;
 update restaurants set ifood_fee_percent=p_percent where id=p_restaurant;
end $$;
revoke all on function public.set_ifood_fee(uuid,numeric) from public,anon;
grant execute on function public.set_ifood_fee(uuid,numeric) to authenticated;

create function public.results_report(p_restaurant uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tz text; fee numeric; month_day date; m_start timestamptz; m_end timestamptz; prev_start timestamptz; result jsonb;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_month is null then raise exception 'INVALID_INPUT'; end if;
 select timezone,ifood_fee_percent into tz,fee from restaurants where id=p_restaurant;
 month_day:=date_trunc('month',p_month)::date;
 m_start:=month_day::timestamp at time zone tz;
 m_end:=(month_day+interval '1 month')::timestamp at time zone tz;
 prev_start:=(month_day-interval '1 month')::timestamp at time zone tz;
 with delivered as (
   select o.* from orders o where o.restaurant_id=p_restaurant and o.status='entregue'
 ), cur as (
   select * from delivered where created_at>=m_start and created_at<m_end
 ), prev as (
   select * from delivered where created_at>=prev_start and created_at<m_start
 ), phones as (
   select customer_phone as phone,min(created_at) as first_in_month from cur where customer_phone<>'' group by customer_phone
 ), history as (
   select p.phone,p.first_in_month,
     (select max(d.created_at) from delivered d where d.customer_phone=p.phone and d.created_at<m_start) as last_before
   from phones p
 ), items as (
   select i.product_id,i.product_name,i.quantity,i.unit_price_cents,o.created_at
   from order_items i join cur o on o.id=i.order_id and o.restaurant_id=i.restaurant_id
 ), dishes as (
   select product_id,(array_agg(product_name order by created_at desc))[1] as name,
     sum(quantity)::bigint as quantity,sum(quantity*unit_price_cents)::bigint as revenue_cents
   from items group by product_id
 ), viewers as (
   select distinct v.product_id,v.guest_session_id from video_view_sessions v
   where v.restaurant_id=p_restaurant and v.qualified and v.created_at>=m_start and v.created_at<m_end
 ), videos as (
   select v.product_id,count(*) as qualified_views,
     count(*) filter (where exists(select 1 from cart_add_events c where c.restaurant_id=p_restaurant
       and c.product_id=v.product_id and c.guest_session_id=v.guest_session_id
       and c.created_at>=m_start and c.created_at<m_end)) as adds
   from viewers v group by v.product_id
 )
 select jsonb_build_object(
  'month',to_char(month_day,'YYYY-MM-DD'),
  'timezone',tz,
  'fee_percent',fee,
  'orders',jsonb_build_object(
    'count',(select count(*) from cur),
    'revenue_cents',(select coalesce(sum(total_cents),0) from cur),
    'average_cents',(select coalesce(round(avg(total_cents)),0) from cur),
    'by_fulfillment',jsonb_build_object(
      'mesa',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from cur where fulfillment='mesa'),
      'retirada',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from cur where fulfillment='retirada'),
      'entrega',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from cur where fulfillment='entrega'))),
  'previous',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from prev),
  'ifood',(select jsonb_build_object('base_cents',coalesce(sum(total_cents),0),
     'saved_cents',round(coalesce(sum(total_cents),0)*fee/100)) from cur where fulfillment in ('retirada','entrega')),
  'customers',(select jsonb_build_object('total',count(*),
     'new',count(*) filter (where last_before is null),
     'returning',count(*) filter (where last_before is not null),
     'reactivated',count(*) filter (where last_before is not null and first_in_month-last_before>=interval '30 days')) from history),
  'top_quantity',coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'name',name,'quantity',quantity,'revenue_cents',revenue_cents)
     order by quantity desc,revenue_cents desc,name) from (select * from dishes order by quantity desc,revenue_cents desc,name limit 5) t),'[]'::jsonb),
  'top_revenue',coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'name',name,'quantity',quantity,'revenue_cents',revenue_cents)
     order by revenue_cents desc,quantity desc,name) from (select * from dishes order by revenue_cents desc,quantity desc,name limit 5) t),'[]'::jsonb),
  'top_videos',coalesce((select jsonb_agg(jsonb_build_object('product_id',t.product_id,'name',coalesce(p.name,'Produto removido'),
     'adds',t.adds,'qualified_views',t.qualified_views) order by t.adds desc,t.qualified_views desc,p.name)
     from (select * from videos order by adds desc,qualified_views desc limit 5) t
     left join products p on p.id=t.product_id and p.restaurant_id=p_restaurant),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.results_report(uuid,date) from public,anon;
grant execute on function public.results_report(uuid,date) to authenticated;
