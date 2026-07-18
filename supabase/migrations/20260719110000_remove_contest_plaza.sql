-- Retire the unused Contest / Plaza feature.
-- Storage objects under entries/, share/, and plaza/ are removed through the
-- Storage API before this migration is applied. The pixieed-contest bucket is
-- intentionally retained because PixFind still uses its puzzles/ prefix.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plaza_artworks'
  ) then
    alter publication supabase_realtime drop table public.plaza_artworks;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plaza_artwork_comments'
  ) then
    alter publication supabase_realtime drop table public.plaza_artwork_comments;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plaza_presence'
  ) then
    alter publication supabase_realtime drop table public.plaza_presence;
  end if;
end
$$;

drop policy if exists plaza_storage_select_public on storage.objects;
drop policy if exists plaza_storage_insert_authenticated on storage.objects;

drop table if exists public.plaza_artwork_comments cascade;
drop table if exists public.plaza_reports cascade;
drop table if exists public.plaza_blocks cascade;
drop table if exists public.plaza_presence cascade;
drop table if exists public.plaza_artworks cascade;
drop table if exists public.plaza_user_avatars cascade;
drop table if exists public.plaza_rooms cascade;
drop function if exists public.plaza_touch_updated_at() cascade;

drop table if exists public.contest_comments cascade;
drop table if exists public.contest_likes cascade;
drop table if exists public.contest_entries cascade;
