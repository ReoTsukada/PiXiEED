-- Allow a creator to revise only their own PiXFiND post.  The creator-user
-- branch supports edits from another signed-in device; the client-id branch
-- retains compatibility for older local posts until they are claimed.
drop policy if exists pixfind_puzzles_update on public.pixfind_puzzles;
create policy pixfind_puzzles_update
on public.pixfind_puzzles
for update
to anon, authenticated
using (
  (auth.uid() is not null and creator_user_id = auth.uid())
  or (
    coalesce(client_id, '') <> ''
    and client_id = public.request_client_id()
  )
)
with check (
  (auth.uid() is not null and creator_user_id = auth.uid())
  or (
    coalesce(client_id, '') <> ''
    and client_id = public.request_client_id()
  )
);

-- Image replacements use Storage upsert.  Limit object replacement to the
-- owner of the post encoded as puzzles/{post-id}/...; new uploads still use
-- the pre-existing insert policy.
grant update on storage.objects to anon, authenticated;
drop policy if exists pixfind_puzzles_storage_update on storage.objects;
create policy pixfind_puzzles_storage_update
on storage.objects
for update
to anon, authenticated
using (
  bucket_id = 'pixfind-puzzles'
  and exists (
    select 1
    from public.pixfind_puzzles puzzle
    where puzzle.id = split_part(name, '/', 2)
      and (
        (auth.uid() is not null and puzzle.creator_user_id = auth.uid())
        or (
          coalesce(puzzle.client_id, '') <> ''
          and puzzle.client_id = public.request_client_id()
        )
      )
  )
)
with check (
  bucket_id = 'pixfind-puzzles'
  and exists (
    select 1
    from public.pixfind_puzzles puzzle
    where puzzle.id = split_part(name, '/', 2)
      and (
        (auth.uid() is not null and puzzle.creator_user_id = auth.uid())
        or (
          coalesce(puzzle.client_id, '') <> ''
          and puzzle.client_id = public.request_client_id()
        )
      )
  )
);
