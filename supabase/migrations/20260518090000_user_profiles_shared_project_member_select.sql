drop policy if exists "user_profiles_select_shared_project_member" on public.user_profiles;
create policy "user_profiles_select_shared_project_member"
on public.user_profiles
for select
to authenticated
using (
  auth.uid() = id
  or exists (
    select 1
    from public.shared_project_members as viewer_members
    join public.shared_project_members as profile_members
      on profile_members.project_key = viewer_members.project_key
    where viewer_members.user_id = auth.uid()
      and profile_members.user_id = user_profiles.id
  )
);
