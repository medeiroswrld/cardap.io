alter table public.restaurants
 add column subtitle text not null default 'Feito com carinho. Servido na sua mesa.',
 add column phone text not null default '',
 add column address text not null default '',
 add column privacy_email text not null default '',
 add column retention_days integer not null default 180 check(retention_days between 1 and 730);

create function public.save_restaurant_settings(p_restaurant uuid,p_settings jsonb,p_tables integer) returns void
language plpgsql security definer set search_path=public as $$
declare slot jsonb;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_tables not between 1 and 100 or jsonb_typeof(p_settings->'opening_hours') <> 'array' then raise exception 'INVALID_SETTINGS'; end if;
 for slot in select * from jsonb_array_elements(p_settings->'opening_hours') loop
  if (slot->>'day')::int not between 0 and 6 or (slot->>'open')::time >= (slot->>'close')::time then raise exception 'INVALID_HOURS'; end if;
 end loop;
 update restaurants set name=p_settings->>'name',subtitle=p_settings->>'subtitle',phone=p_settings->>'phone',address=p_settings->>'address',privacy_email=p_settings->>'privacy_email',retention_days=(p_settings->>'retention_days')::int,accepting_orders=(p_settings->>'accepting_orders')::boolean,opening_hours=p_settings->'opening_hours' where id=p_restaurant;
 insert into dining_tables(restaurant_id,number,active) select p_restaurant,n,true from generate_series(1,p_tables) n on conflict(restaurant_id,number) do update set active=true;
 update dining_tables set active=false where restaurant_id=p_restaurant and number>p_tables;
end $$;
revoke all on function public.save_restaurant_settings(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_restaurant_settings(uuid,jsonb,integer) to authenticated;

create function public.move_and_remove_category(p_restaurant uuid,p_category uuid,p_destination uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_category=p_destination or not exists(select 1 from categories where restaurant_id=p_restaurant and id=p_destination) then raise exception 'INVALID_DESTINATION'; end if;
 perform id from categories where restaurant_id=p_restaurant and id in(p_category,p_destination) order by id for update;
 update products set category_id=p_destination where restaurant_id=p_restaurant and category_id=p_category;
 delete from categories where restaurant_id=p_restaurant and id=p_category;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.move_and_remove_category(uuid,uuid,uuid) from public,anon;
grant execute on function public.move_and_remove_category(uuid,uuid,uuid) to authenticated;

create function public.subscribe_guest(p_restaurant uuid,p_token_hash text,p_name text,p_phone text) returns void
language plpgsql security definer set search_path=public as $$
declare guest guest_sessions; contact_id uuid; restaurant_name text;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 if length(trim(p_name)) not between 2 and 80 or p_phone !~ '^[0-9]{10,11}$' then raise exception 'INVALID_CONTACT'; end if;
 if exists(select 1 from marketing_consent_events where restaurant_id=p_restaurant and source='newsletter:'||guest.id and created_at>now()-interval '1 minute') then raise exception 'RATE_LIMITED'; end if;
 select name into restaurant_name from restaurants where id=p_restaurant;
 -- An unverified visitor cannot change a pre-existing person's identity or opt-in.
 insert into contacts(restaurant_id,name,phone,marketing_status) values(p_restaurant,trim(p_name),p_phone,'authorized') on conflict(restaurant_id,phone) do nothing returning id into contact_id;
 if contact_id is not null then
  insert into marketing_consent_events(restaurant_id,contact_id,action,text_version,consent_text,source) values(p_restaurant,contact_id,'authorized','1','Quero receber novidades e ofertas do '||restaurant_name||' no WhatsApp. Posso cancelar quando quiser.','newsletter:'||guest.id);
 end if;
end $$;
revoke all on function public.subscribe_guest(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.subscribe_guest(uuid,text,text,text) to service_role;
