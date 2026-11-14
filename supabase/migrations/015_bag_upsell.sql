-- I2: upsell in the bag. Options can be offered as "combo" in the bag and the
-- owner picks up to 3 products to suggest. Prices stay validated by place_guest_order.
alter table public.product_options add column offer_in_bag boolean not null default false;
alter table public.restaurants add column bag_suggestions uuid[] not null default '{}'
  check (cardinality(bag_suggestions) <= 3);

create function public.set_option_offer_in_bag(p_restaurant uuid,p_option uuid,p_offer boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 update product_options set offer_in_bag=coalesce(p_offer,false) where id=p_option and restaurant_id=p_restaurant;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.set_option_offer_in_bag(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_option_offer_in_bag(uuid,uuid,boolean) to authenticated;

create function public.save_bag_suggestions(p_restaurant uuid,p_products uuid[]) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_products is null or cardinality(p_products)>3
  or cardinality(p_products)<>(select count(distinct v) from unnest(p_products) v)
  or exists(select 1 from unnest(p_products) v where not exists(
   select 1 from products p where p.id=v and p.restaurant_id=p_restaurant and not p.archived))
 then raise exception 'INVALID_PRODUCTS'; end if;
 update restaurants set bag_suggestions=p_products where id=p_restaurant;
end $$;
revoke all on function public.save_bag_suggestions(uuid,uuid[]) from public,anon;
grant execute on function public.save_bag_suggestions(uuid,uuid[]) to authenticated;
