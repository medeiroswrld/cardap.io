alter table public.video_view_sessions add column segments jsonb not null default '[]',add column updated_at timestamptz not null default now();
create function public.record_video_view(p_restaurant uuid,p_token_hash text,p_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare guest guest_sessions; media product_media; previous video_view_sessions; piece jsonb; duration numeric; covered numeric:=0; edge numeric:=0; watched numeric;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 select * into media from product_media where restaurant_id=p_restaurant and id=(p_payload->>'media_id')::uuid and product_id=(p_payload->>'product_id')::uuid and version=(p_payload->>'version')::uuid and state='ready';
 if not found or media.duration_seconds is null or media.duration_seconds<=0 then raise exception 'INVALID_MEDIA'; end if;
 if not exists(select 1 from products p join categories c on c.id=p.category_id and c.restaurant_id=p.restaurant_id where p.id=media.product_id and p.restaurant_id=p_restaurant and p.published and not p.archived and c.visible) then raise exception 'UNAVAILABLE'; end if;
 duration:=media.duration_seconds;watched:=(p_payload->>'watched_seconds')::numeric;
 if watched<0 or watched>3600 or jsonb_array_length(p_payload->'segments')>180 then raise exception 'INVALID_OBSERVATION'; end if;
 select * into previous from video_view_sessions where id=(p_payload->>'id')::uuid for update;
 if found then
  if previous.restaurant_id<>p_restaurant or previous.guest_session_id<>guest.id or previous.media_id<>media.id or previous.media_version<>media.version then raise exception 'FORBIDDEN'; end if;
  if previous.sequence>=(p_payload->>'sequence')::int then return; end if;
  if watched<previous.watched_seconds or watched-previous.watched_seconds>extract(epoch from (now()-previous.updated_at))+2 then raise exception 'INVALID_INTERVAL'; end if;
 else
  if watched>10 or (select count(*) from video_view_sessions where guest_session_id=guest.id and created_at>now()-interval '1 minute')>=30 then raise exception 'RATE_LIMITED'; end if;
 end if;
 -- Sorted non-overlapping ranges; seeking never counts unseen gaps.
 for piece in select * from jsonb_array_elements(p_payload->'segments') loop
  if (piece->>0)::numeric<edge or (piece->>1)::numeric<=(piece->>0)::numeric or (piece->>1)::numeric>duration+0.2 then raise exception 'INVALID_SEGMENTS'; end if;
  covered:=covered+least(duration,(piece->>1)::numeric)-(piece->>0)::numeric;edge:=(piece->>1)::numeric;
 end loop;
 if covered>watched*2.5+1 then raise exception 'INVALID_COVERAGE'; end if;
 insert into video_view_sessions(id,restaurant_id,guest_session_id,product_id,media_id,media_version,watched_seconds,coverage,qualified,sequence,position,segments)
 values((p_payload->>'id')::uuid,p_restaurant,guest.id,media.product_id,media.id,media.version,watched,least(1,covered/duration),watched>=1,(p_payload->>'sequence')::int,(p_payload->>'position')::int,p_payload->'segments')
 on conflict(id) do update set watched_seconds=excluded.watched_seconds,coverage=greatest(video_view_sessions.coverage,excluded.coverage),qualified=excluded.qualified,sequence=excluded.sequence,segments=excluded.segments,updated_at=now();
end $$;
revoke all on function public.record_video_view(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_video_view(uuid,text,jsonb) to service_role;
