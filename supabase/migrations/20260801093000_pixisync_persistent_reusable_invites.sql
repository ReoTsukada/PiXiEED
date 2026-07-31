-- Keep a PiXiSYNC share URL stable until its owner explicitly revokes it.
-- Raw invite tokens remain device-local; the database stores SHA-256 only.

alter table collab_v1.room_invites
  add column if not exists persistent boolean not null default false;

create or replace function public.pixisync_create_invite(
  p_room_id uuid,
  p_role text default 'editor',
  p_expires_at timestamptz default null,
  p_max_uses smallint default null
)
returns table (
  invite_id uuid,
  invite_token text,
  role text,
  expires_at timestamptz,
  max_uses smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room collab_v1.rooms%rowtype;
  v_invite_id uuid := gen_random_uuid();
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_persistent boolean := p_expires_at is null and p_max_uses is null;
  v_expires_at timestamptz := coalesce(p_expires_at, 'infinity'::timestamptz);
  v_max_uses smallint := coalesce(p_max_uses, 16);
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_role not in ('editor', 'viewer')
     or (not v_persistent and (
       v_expires_at <= timezone('utc', now())
       or v_expires_at > timezone('utc', now()) + interval '7 days'
       or v_max_uses not between 1 and 16
     )) then
    raise exception 'invalid_invite';
  end if;
  select * into v_room from collab_v1.rooms where id = p_room_id for update;
  if not found or v_room.owner_user_id <> v_user_id or v_room.status <> 'active' then
    raise exception 'active_owner_required';
  end if;
  insert into collab_v1.room_invites (
    id, room_id, token_sha256, role, created_by, expires_at, max_uses, persistent
  ) values (
    v_invite_id, p_room_id, extensions.digest(v_token, 'sha256'),
    p_role::collab_v1.member_role, v_user_id, v_expires_at, v_max_uses, v_persistent
  );
  return query select v_invite_id, v_token, p_role, v_expires_at, v_max_uses;
end
$$;

create or replace function public.pixisync_join_session(p_invite_token text)
returns table (
  room_id uuid,
  role text,
  can_edit boolean,
  status text,
  head_revision bigint,
  session_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite collab_v1.room_invites%rowtype;
  v_room collab_v1.rooms%rowtype;
  v_member collab_v1.room_members%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_invite_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid_invite_token'; end if;
  select * into v_invite
  from collab_v1.room_invites
  where token_sha256 = extensions.digest(p_invite_token, 'sha256')
  for update;
  if not found then raise exception 'invite_unavailable'; end if;
  select * into v_room from collab_v1.rooms where id = v_invite.room_id for update;
  if not found or v_room.status <> 'active' or v_room.active_checkpoint_id is null then
    raise exception 'room_not_active';
  end if;
  select * into v_member
  from collab_v1.room_members as member
  where member.room_id = v_room.id and member.user_id = v_user_id
  for update;
  if found then
    if v_member.revoked_at is not null then raise exception 'membership_revoked'; end if;
  else
    if v_invite.revoked_at is not null
       or (not v_invite.persistent and (
         v_invite.expires_at <= timezone('utc', now())
         or v_invite.use_count >= v_invite.max_uses
       )) then
      raise exception 'invite_unavailable';
    end if;
    insert into collab_v1.room_members (room_id, user_id, role)
    values (v_room.id, v_user_id, v_invite.role);
    v_member.role := v_invite.role;
    if not v_invite.persistent then
      update collab_v1.room_invites
      set use_count = use_count + 1
      where id = v_invite.id;
    end if;
  end if;
  return query
  select v_room.id, v_member.role::text, v_member.role in ('owner', 'editor'),
         v_room.status, v_room.head_revision, v_room.session_generation;
end
$$;

revoke all on function public.pixisync_create_invite(uuid, text, timestamptz, smallint) from public, anon;
grant execute on function public.pixisync_create_invite(uuid, text, timestamptz, smallint) to authenticated;
revoke all on function public.pixisync_join_session(text) from public, anon;
grant execute on function public.pixisync_join_session(text) to authenticated;
