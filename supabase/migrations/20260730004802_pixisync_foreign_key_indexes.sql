-- FK indexes keep membership checks, audit joins, and cleanup bounded as rooms grow.
create index if not exists pixisync_rooms_owner_user_idx on collab_v1.rooms (owner_user_id);
create index if not exists pixisync_rooms_active_checkpoint_idx on collab_v1.rooms (active_checkpoint_id) where active_checkpoint_id is not null;
create index if not exists pixisync_room_members_user_room_idx on collab_v1.room_members (user_id, room_id) where revoked_at is null;
create index if not exists pixisync_operations_actor_room_idx on collab_v1.operations (actor_user_id, room_id, revision desc);
create index if not exists pixisync_checkpoints_creator_room_idx on collab_v1.checkpoints (created_by, room_id, revision desc);
create index if not exists pixisync_checkpoint_attestations_user_idx on collab_v1.checkpoint_attestations (user_id, checkpoint_id);
create index if not exists pixisync_rate_windows_user_idx on collab_v1.rate_windows (user_id, room_id);
