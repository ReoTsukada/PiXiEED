import { strict as assert } from "node:assert";

const migration = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20260824090000_pixync_draw2_aggregate_authority.sql",
    import.meta.url,
  ),
);

Deno.test("PIXYNC-DRAW2-290 keeps Draw2 authority separate from legacy pixel revisions", () => {
  assert.match(migration, /collab_v1\.draw2_project_heads/u);
  assert.match(migration, /collab_v1\.draw2_operations/u);
  assert.doesNotMatch(
    migration,
    /insert into collab_v1\.operations/u,
  );
  assert.match(
    migration,
    /unique \(room_id, aggregate, aggregate_revision\)/u,
  );
});

Deno.test("PIXYNC-DRAW2-290 exposes the exact provider RPC argument contract", () => {
  assert.match(
    migration,
    /pixync_draw2_open_session_v1\([\s\S]*?p_project_id text,[\s\S]*?p_client_id text,[\s\S]*?p_session_generation bigint/u,
  );
  assert.match(
    migration,
    /pixync_draw2_commit_operation_v1\([\s\S]*?p_project_id text,[\s\S]*?p_client_id text,[\s\S]*?p_session_generation bigint,[\s\S]*?p_operation jsonb/u,
  );
  assert.match(
    migration,
    /pixync_draw2_get_operations_since_v1\([\s\S]*?p_project_id text,[\s\S]*?p_after_project_revision bigint,[\s\S]*?p_client_id text,[\s\S]*?p_session_generation bigint/u,
  );
});

Deno.test("PIXYNC-DRAW2-290 derives authority from auth and active room membership", () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/u);
  assert.match(
    migration,
    /from collab_v1\.room_members[\s\S]*?revoked_at is null/u,
  );
  assert.match(migration, /v_member\.role not in \('owner', 'editor'\)/u);
  assert.match(migration, /pixync_draw2_stale_session/u);
});

Deno.test("PIXYNC-DRAW2-290 validates canonical payloads and emits hint-only Broadcast", () => {
  assert.match(migration, /draw2_canonical_json/u);
  assert.match(migration, /pixync_draw2_payload_hash_mismatch/u);
  assert.match(migration, /draw2_has_forbidden_key/u);
  assert.match(
    migration,
    /perform realtime\.send\([\s\S]*?'pixync_hint'[\s\S]*?true/u,
  );
  const broadcast = migration.slice(
    migration.indexOf("perform realtime.send("),
    migration.indexOf("perform realtime.send(") + 300,
  );
  assert.doesNotMatch(broadcast, /v_committed/u);
});

Deno.test("PIXYNC-DRAW2-290 grants only authenticated RPC execution", () => {
  for (const name of [
    "pixync_draw2_open_session_v1",
    "pixync_draw2_commit_operation_v1",
    "pixync_draw2_get_operations_since_v1",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}`),
    );
  }
});
