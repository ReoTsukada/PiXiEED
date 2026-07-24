-- A signed-in creator can manage their claimed PiXFiND posts from any device.
-- Keep the client-id branch for older posts until they are claimed after login.
drop policy if exists pixfind_puzzles_delete on public.pixfind_puzzles;
create policy pixfind_puzzles_delete
on public.pixfind_puzzles
for delete
to anon, authenticated
using (
  (auth.uid() is not null and creator_user_id = auth.uid())
  or (
    coalesce(client_id, '') <> ''
    and client_id = public.request_client_id()
  )
);
