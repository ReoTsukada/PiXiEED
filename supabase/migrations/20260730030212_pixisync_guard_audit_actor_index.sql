create index if not exists pixisync_operation_guard_audits_actor_user_idx
  on collab_v1.operation_guard_audits (actor_user_id);
