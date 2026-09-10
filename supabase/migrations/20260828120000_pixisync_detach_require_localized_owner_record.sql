-- Tighten the owner deletion boundary after the localization rollout.
-- An archived legacy Room without a localization member record must not be
-- treated as localized. The prior migration is already applied remotely, so
-- this replacement is intentionally isolated in a new migration.

create or replace function public.pixisync_detach_deleted_project(p_room_id uuid)
returns table (
  room_id uuid,
  action text,
  room_status text,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_member collab_v1.room_members%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found then
    return query select p_room_id, 'already_detached'::text, 'missing'::text, 0::bigint;
    return;
  end if;
  if v_room.owner_user_id = v_user_id then
    if v_room.status in ('initializing', 'active') then
      raise exception 'pixisync_localization_required';
    end if;
    if not exists (
      select 1
      from collab_v1.room_localization_members as target
      where target.room_id = p_room_id
        and target.user_id = v_user_id
        and target.localized_at is not null
    ) then
      raise exception 'pixisync_localization_required';
    end if;
    return query select v_room.id, 'owner_localized'::text, v_room.status, v_room.session_generation;
    return;
  end if;
  select * into v_member
  from collab_v1.room_members as member
  where member.room_id = p_room_id and member.user_id = v_user_id
  for update;
  if not found then raise exception 'membership_required'; end if;
  if v_member.revoked_at is null then
    update collab_v1.room_members
    set revoked_at = timezone('utc', now())
    where collab_v1.room_members.room_id = p_room_id and user_id = v_user_id;
  end if;
  return query select v_room.id, 'participant_left'::text, v_room.status, v_room.session_generation;
end
$$;

revoke all on function public.pixisync_detach_deleted_project(uuid) from public, anon;
grant execute on function public.pixisync_detach_deleted_project(uuid) to authenticated;

