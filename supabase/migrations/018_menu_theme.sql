-- C: per-restaurant menu appearance. One validated JSON object; '{}' = current look.
alter table public.restaurants add column menu_theme jsonb not null default '{}'::jsonb;

create function public.hex_luminance(p_hex text) returns numeric
language sql immutable set search_path=public as $$
 select 0.2126*c[1]+0.7152*c[2]+0.0722*c[3] from (
  select array(
   select case when v<=0.03928 then v/12.92 else power((v+0.055)/1.055,2.4) end
   from (select (('x'||substr(p_hex,u.i,2))::bit(8)::int)/255.0 as v, u.n
         from unnest(array[2,4,6]) with ordinality as u(i,n)) s
   order by n
  ) as c
 ) t
$$;

create function public.contrast_ratio(p_a text,p_b text) returns numeric
language sql immutable set search_path=public as $$
 select (greatest(hex_luminance(p_a),hex_luminance(p_b))+0.05)/(least(hex_luminance(p_a),hex_luminance(p_b))+0.05)
$$;

-- Full validation (shape + contrast) as a boolean, used as a table CHECK so owners
-- cannot bypass save_menu_theme with a direct UPDATE.
create function public.valid_menu_theme(p_restaurant uuid,p_theme jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare k text; v jsonb; url_prefix text; bg text; surf text; txt text;
begin
 if p_theme is null or jsonb_typeof(p_theme)<>'object' then return false; end if;
 url_prefix:='^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/restaurant-media/'||p_restaurant::text||'/[A-Za-z0-9._-]+$';
 for k,v in select * from jsonb_each(p_theme) loop
  if jsonb_typeof(v)<>'string' then return false; end if;
  if k in ('brand','background','surface','text') then
   if (v#>>'{}') !~ '^#[0-9a-f]{6}$' then return false; end if;
  elsif k='preset' then
   if (v#>>'{}') not in ('brasa','pizzaria','japones','cafeteria','acai','noite','personalizado') then return false; end if;
  elsif k='mode' then
   if (v#>>'{}') not in ('light','dark') then return false; end if;
  elsif k='heading_font' then
   if (v#>>'{}') not in ('padrao','moderna','elegante','forte','rustica','divertida') then return false; end if;
  elsif k='body_font' then
   if (v#>>'{}') not in ('manrope','inter','nunito','lora') then return false; end if;
  elsif k='radius' then
   if (v#>>'{}') not in ('reto','suave','redondo') then return false; end if;
  elsif k in ('logo_url','cover_url') then
   if (v#>>'{}') !~ url_prefix or (v#>>'{}') like '%..%' then return false; end if;
  else
   return false;
  end if;
 end loop;
 bg:=coalesce(p_theme->>'background','#fff8f2');
 surf:=coalesce(p_theme->>'surface','#ffffff');
 txt:=coalesce(p_theme->>'text','#251c1a');
 if contrast_ratio(txt,bg)<4.5 or contrast_ratio(txt,surf)<4.5 then return false; end if;
 return true;
end $$;

alter table public.restaurants add constraint restaurants_menu_theme_check
 check (public.valid_menu_theme(id,menu_theme));

revoke all on function public.hex_luminance(text) from public,anon;
revoke all on function public.contrast_ratio(text,text) from public,anon;
revoke all on function public.valid_menu_theme(uuid,jsonb) from public,anon;
grant execute on function public.hex_luminance(text) to authenticated;
grant execute on function public.contrast_ratio(text,text) to authenticated;
grant execute on function public.valid_menu_theme(uuid,jsonb) to authenticated, service_role;
grant execute on function public.hex_luminance(text) to service_role;
grant execute on function public.contrast_ratio(text,text) to service_role;

create function public.save_menu_theme(p_restaurant uuid,p_theme jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare k text; v jsonb; url_prefix text; bg text; surf text; txt text;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_theme is null or jsonb_typeof(p_theme)<>'object' then raise exception 'INVALID_INPUT'; end if;
 url_prefix:='^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/restaurant-media/'||p_restaurant::text||'/[A-Za-z0-9._-]+$';
 for k,v in select * from jsonb_each(p_theme) loop
  if jsonb_typeof(v)<>'string' then raise exception 'INVALID_INPUT'; end if;
  if k in ('brand','background','surface','text') then
   if (v#>>'{}') !~ '^#[0-9a-f]{6}$' then raise exception 'INVALID_INPUT'; end if;
  elsif k='preset' then
   if (v#>>'{}') not in ('brasa','pizzaria','japones','cafeteria','acai','noite','personalizado') then raise exception 'INVALID_INPUT'; end if;
  elsif k='mode' then
   if (v#>>'{}') not in ('light','dark') then raise exception 'INVALID_INPUT'; end if;
  elsif k='heading_font' then
   if (v#>>'{}') not in ('padrao','moderna','elegante','forte','rustica','divertida') then raise exception 'INVALID_INPUT'; end if;
  elsif k='body_font' then
   if (v#>>'{}') not in ('manrope','inter','nunito','lora') then raise exception 'INVALID_INPUT'; end if;
  elsif k='radius' then
   if (v#>>'{}') not in ('reto','suave','redondo') then raise exception 'INVALID_INPUT'; end if;
  elsif k in ('logo_url','cover_url') then
   if (v#>>'{}') !~ url_prefix or (v#>>'{}') like '%..%' then raise exception 'INVALID_INPUT'; end if;
  else
   raise exception 'INVALID_INPUT';
  end if;
 end loop;
 bg:=coalesce(p_theme->>'background','#fff8f2');
 surf:=coalesce(p_theme->>'surface','#ffffff');
 txt:=coalesce(p_theme->>'text','#251c1a');
 if contrast_ratio(txt,bg)<4.5 or contrast_ratio(txt,surf)<4.5 then raise exception 'LOW_CONTRAST'; end if;
 update restaurants set menu_theme=p_theme where id=p_restaurant;
end $$;
revoke all on function public.save_menu_theme(uuid,jsonb) from public,anon;
grant execute on function public.save_menu_theme(uuid,jsonb) to authenticated;
