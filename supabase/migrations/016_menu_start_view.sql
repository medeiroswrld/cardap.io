-- Each restaurant chooses how its menu opens: video reels or the classic list.
-- Existing restaurants start on the list (older customers struggled with reels);
-- new restaurants start on reels, the product's main focus.
alter table public.restaurants add column menu_start_view text not null default 'lista'
  check (menu_start_view in ('lista','reels'));
alter table public.restaurants alter column menu_start_view set default 'reels';

create function public.set_menu_start_view(p_restaurant uuid,p_view text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_view is null or p_view not in ('lista','reels') then raise exception 'INVALID_INPUT'; end if;
 update restaurants set menu_start_view=p_view where id=p_restaurant;
end $$;
revoke all on function public.set_menu_start_view(uuid,text) from public,anon;
grant execute on function public.set_menu_start_view(uuid,text) to authenticated;
