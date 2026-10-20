-- Social interactions do not require a purchase. Orders remain server-verified.
alter table public.restaurants add column feedback_enabled boolean not null default true;
alter table public.product_feedback alter column order_id drop not null;
alter table public.product_feedback add column comment_hidden boolean not null default false;

create or replace function public.save_guest_feedback(p_restaurant uuid,p_token_hash text,p_order uuid,p_product uuid,p_liked boolean,p_comment text) returns void
language plpgsql security definer set search_path=public as $$
declare guest guest_sessions; verified_order uuid;
begin
 -- Serialize against the owner's switch, including requests from stale tabs.
 perform 1 from restaurants where id=p_restaurant and feedback_enabled for share;
 if not found then raise exception 'FEEDBACK_DISABLED'; end if;
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 if not exists(select 1 from products p join categories c on c.id=p.category_id and c.restaurant_id=p.restaurant_id
  where p.restaurant_id=p_restaurant and p.id=p_product and p.published and not p.archived and c.visible)
 then raise exception 'PRODUCT_NOT_FOUND'; end if;
 if p_liked is null or p_comment is null or length(p_comment)>1000 then raise exception 'INVALID_FEEDBACK'; end if;
 select o.id into verified_order from orders o where o.restaurant_id=p_restaurant and o.guest_session_id=guest.id and o.status='entregue'
  and exists(select 1 from order_items i where i.restaurant_id=p_restaurant and i.order_id=o.id and i.product_id=p_product)
  order by o.created_at desc limit 1;
 insert into product_feedback(restaurant_id,guest_session_id,order_id,product_id,liked,comment)
 values(p_restaurant,guest.id,verified_order,p_product,p_liked,trim(p_comment))
 on conflict(restaurant_id,guest_session_id,product_id) do update
 set liked=excluded.liked,comment=excluded.comment,order_id=excluded.order_id,updated_at=now();
 -- An edit cannot undo an owner's moderation decision.
end $$;

create or replace function public.read_guest_feedback(p_restaurant uuid,p_product uuid,p_token_hash text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare guest_id uuid; eligible uuid; own product_feedback; result jsonb; enabled boolean;
begin
 if not exists(select 1 from products p join categories c on c.id=p.category_id and c.restaurant_id=p.restaurant_id
  where p.restaurant_id=p_restaurant and p.id=p_product and p.published and not p.archived and c.visible)
 then raise exception 'PRODUCT_NOT_FOUND'; end if;
 select feedback_enabled into enabled from restaurants where id=p_restaurant;
 if not enabled then return jsonb_build_object('enabled',false,'likes',0,'commentCount',0,'comments','[]'::jsonb,'eligibleOrderId',null,'mine',null,'googleReviewUrl',''); end if;
 select id into guest_id from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now();
 select o.id into eligible from orders o where o.restaurant_id=p_restaurant and o.guest_session_id=guest_id and o.status='entregue'
  and exists(select 1 from order_items i where i.restaurant_id=p_restaurant and i.order_id=o.id and i.product_id=p_product)
  order by o.created_at desc limit 1;
 select * into own from product_feedback where restaurant_id=p_restaurant and product_id=p_product and guest_session_id=guest_id;
 select jsonb_build_object(
  'enabled',true,'likes',count(*) filter(where liked),
  'commentCount',count(*) filter(where comment<>'' and not comment_hidden),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'comment',f.comment,'liked',f.liked,'updated_at',f.updated_at,'verifiedPurchase',f.order_id is not null))
    from (select id,comment,liked,updated_at,order_id from product_feedback where restaurant_id=p_restaurant and product_id=p_product and comment<>'' and not comment_hidden order by updated_at desc,id limit 20) f),'[]'::jsonb),
  'eligibleOrderId',eligible,
  'mine',case when own.id is null then null else jsonb_build_object('liked',own.liked,'comment',own.comment,'commentHidden',own.comment_hidden) end,
  'googleReviewUrl',case when eligible is not null then (select google_review_url from restaurants where id=p_restaurant) else '' end
 ) into result from product_feedback where restaurant_id=p_restaurant and product_id=p_product;
 return result;
end $$;

create function public.set_feedback_enabled(p_restaurant uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_enabled is null then raise exception 'INVALID_SETTINGS'; end if;
 update restaurants set feedback_enabled=p_enabled where id=p_restaurant;
end $$;
create function public.moderate_feedback(p_restaurant uuid,p_feedback uuid,p_hidden boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_hidden is null then raise exception 'INVALID_SETTINGS'; end if;
 update product_feedback set comment_hidden=p_hidden where restaurant_id=p_restaurant and id=p_feedback;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.set_feedback_enabled(uuid,boolean) from public,anon;
revoke all on function public.moderate_feedback(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_feedback_enabled(uuid,boolean) to authenticated;
grant execute on function public.moderate_feedback(uuid,uuid,boolean) to authenticated;
