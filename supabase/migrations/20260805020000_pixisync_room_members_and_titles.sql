-- Return the canonical room title and active member profiles to every member.
-- The collaboration schema remains private; this narrow security-definer RPC
-- exposes only the room the authenticated caller already belongs to.
create function public.pixisync_list_room_members(p_room_id uuid)
returns table (
  room_id uuid,
  room_title text,
  user_id uuid,
  member_role text,
  nickname text,
  avatar text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    room.id,
    room.title,
    member.user_id,
    member.role::text,
    profile.nickname,
    profile.avatar,
    member.joined_at
  from collab_v1.rooms as room
  join collab_v1.room_members as member
    on member.room_id = room.id
   and member.revoked_at is null
  left join public.user_profiles as profile
    on profile.id = member.user_id
  where room.id = p_room_id
    and room.status = 'active'
    and exists (
      select 1
      from collab_v1.room_members as viewer
      where viewer.room_id = room.id
        and viewer.user_id = auth.uid()
        and viewer.revoked_at is null
    )
  order by member.joined_at, member.user_id;
$$;

revoke all on function public.pixisync_list_room_members(uuid) from public, anon;
grant execute on function public.pixisync_list_room_members(uuid) to authenticated;
