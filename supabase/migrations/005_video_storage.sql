-- Menu videos are public, just like product photos. Uploads are authorized by
-- the owner-only media route using signed, non-overwriting object URLs.
-- No direct INSERT/UPDATE/DELETE policies are granted to browser clients.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-videos', 'restaurant-videos', true, 20971520, array['video/mp4','video/webm'])
on conflict (id) do nothing;
