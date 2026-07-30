-- Realtime authorization runs as the connecting client role. Keep collab_v1
-- tables private and expose only a current-user/topic boolean to the policies.
-- Archived rooms must not authorize new Broadcast or Presence joins/sends.
create or replace function public.pixisync_can_access_realtime_topic(
  p_topic text,
  p_require_editor boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_topic like 'pixisync:room:%'
    and exists (
      select 1
      from collab_v1.rooms as room
      join collab_v1.room_members as member
        on member.room_id = room.id
      where p_topic = 'pixisync:room:' || room.id::text
        and room.status = 'active'
        and member.user_id = auth.uid()
        and member.revoked_at is null
        and (
          not p_require_editor
          or member.role in ('owner', 'editor')
        )
    )
$$;

revoke all on function public.pixisync_can_access_realtime_topic(text, boolean)
  from public, anon, authenticated;
grant execute on function public.pixisync_can_access_realtime_topic(text, boolean)
  to authenticated;

drop policy if exists pixisync_realtime_member_receive on realtime.messages;
create policy pixisync_realtime_member_receive
on realtime.messages
for select
to authenticated
using (
  public.pixisync_can_access_realtime_topic(realtime.topic(), false)
);

drop policy if exists pixisync_realtime_editor_send on realtime.messages;
create policy pixisync_realtime_editor_send
on realtime.messages
for insert
to authenticated
with check (
  public.pixisync_can_access_realtime_topic(realtime.topic(), true)
);
