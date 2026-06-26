alter table public.plaza_artworks
  alter column expires_at set default (timezone('utc', now()) + interval '24 hours');

alter table public.plaza_artwork_comments
  alter column expires_at set default (timezone('utc', now()) + interval '24 hours');

update public.plaza_artworks
set expires_at = least(expires_at, created_at + interval '24 hours')
where expires_at > created_at + interval '24 hours';

update public.plaza_artwork_comments
set expires_at = least(expires_at, created_at + interval '24 hours')
where expires_at > created_at + interval '24 hours';

drop policy if exists plaza_artworks_insert_own on public.plaza_artworks;
create policy plaza_artworks_insert_own
on public.plaza_artworks
for insert
to authenticated
with check (
  user_id = auth.uid()
  and room_id = 'main'
  and moderation_status = 'visible'
  and expires_at <= timezone('utc', now()) + interval '25 hours'
  and storage_path like 'plaza/%'
);
