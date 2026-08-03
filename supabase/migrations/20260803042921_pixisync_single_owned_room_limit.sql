-- A user may own at most one open PiXiSYNC room. Membership in rooms owned by
-- other users does not consume this slot, and archiving the owned room frees it.
--
-- The advisory transaction lock makes the existence check safe when the same
-- account starts a room concurrently from multiple tabs or devices. Existing
-- duplicate rooms are left untouched so this migration never archives user data.
create function collab_v1.enforce_single_owned_open_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Existing open rooms may continue from initializing to active unchanged.
  -- Check only a newly inserted room or an update that newly consumes a slot.
  if new.status in ('initializing', 'active')
    and (
      tg_op = 'INSERT'
      or old.status not in ('initializing', 'active')
      or new.owner_user_id is distinct from old.owner_user_id
    )
  then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.owner_user_id::text, 20260803)
    );

    if exists (
      select 1
      from collab_v1.rooms as room
      where room.owner_user_id = new.owner_user_id
        and room.status in ('initializing', 'active')
        and room.id <> new.id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'pixisync_owner_room_limit_reached';
    end if;
  end if;

  return new;
end
$$;

revoke all on function collab_v1.enforce_single_owned_open_room() from public, anon, authenticated;

create trigger pixisync_single_owned_open_room
before insert or update of owner_user_id, status on collab_v1.rooms
for each row
execute function collab_v1.enforce_single_owned_open_room();
