-- Draw2 Presence is ephemeral metadata. Every active member may publish it,
-- while durable Broadcast hints remain editor-only and contain no operation.
-- The topic helper binds both lanes to the authenticated user and active room.

drop policy if exists pixisync_realtime_member_receive on realtime.messages;
create policy pixisync_realtime_member_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and public.pixisync_can_access_realtime_topic(realtime.topic(), false)
);

drop policy if exists pixisync_realtime_editor_send on realtime.messages;
create policy pixisync_realtime_editor_send
on realtime.messages
for insert
to authenticated
with check (
  (
    realtime.messages.extension = 'broadcast'
    and public.pixisync_can_access_realtime_topic(realtime.topic(), true)
  )
  or (
    realtime.messages.extension = 'presence'
    and public.pixisync_can_access_realtime_topic(realtime.topic(), false)
  )
);
