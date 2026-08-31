import { strict as assert } from "node:assert";

const migration = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20260824090000_pixync_draw2_aggregate_authority.sql",
    import.meta.url,
  ),
);
const presenceMigration = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20260827202238_pixync_draw2_presence_authorization.sql",
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
  assert.match(migration, /draw2_payload_is_bounded/u);
  assert.match(
    migration,
    /bytes\|pixels\|pixeldata\|pcm\|samples\|sampledata\|audiobuffer\|arraybuffer\|imagedata/u,
  );
  assert.match(migration, /p_depth > 8/u);
  assert.match(migration, /jsonb_array_length\(p_value\) > 96/u);
  assert.match(migration, /clientSequence'\)::numeric <= 0/u);
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

Deno.test("PIXYNC-DRAW2-290 fails closed for null-shaped JSON and deep walks", () => {
  assert.match(
    migration,
    /if p_operation is null[\s\S]*?jsonb_typeof\(p_operation\) is distinct from 'object'/u,
  );
  assert.match(
    migration,
    /jsonb_typeof\(p_operation->'payload'\) is distinct from 'object'/u,
  );
  assert.match(
    migration,
    /jsonb_typeof\(p_operation->'compensation'\) is distinct from 'object'/u,
  );
  assert.match(
    migration,
    /draw2_has_forbidden_key\(v_child, p_depth \+ 1\)/u,
  );
  assert.match(migration, /if p_depth > 8 then return true;/u);
  assert.match(
    migration,
    /jsonb_typeof\(p_game_project\) is distinct from 'object'/u,
  );
  assert.match(
    migration,
    /p_game_project#>>'\{revision,sequence\}' is null/u,
  );
});

Deno.test("PIXYNC-DRAW2-290 keeps internal helper functions unreachable", () => {
  for (const signature of [
    "draw2_canonical_json(jsonb)",
    "draw2_has_forbidden_key(jsonb, integer)",
    "draw2_payload_is_bounded(jsonb, integer)",
    "draw2_membership_revision(uuid, uuid)",
  ]) {
    const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    assert.match(
      migration,
      new RegExp(
        `revoke all on function collab_v1\\.${escapedSignature}\\s+from public, anon, authenticated`,
      ),
    );
  }
});

Deno.test("PIXYNC-DRAW2-290 enforces a per-user Room rate window after idempotency", () => {
  assert.match(
    migration,
    /insert into collab_v1\.rate_windows as rate_window[\s\S]*?on conflict \(room_id, user_id\) do update/u,
  );
  assert.match(migration, /v_rate_operation_count integer/u);
  assert.match(migration, /v_rate_operation_count > 120/u);
  assert.match(migration, /pixync_draw2_rate_limited/u);
  const duplicateBoundary = migration.indexOf("if found then");
  const rateWindow = migration.indexOf(
    "insert into collab_v1.rate_windows as rate_window",
  );
  assert.ok(
    duplicateBoundary >= 0 && rateWindow > duplicateBoundary,
    "Rate counting must happen after the exact duplicate/idempotency return.",
  );
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

Deno.test("PIXYNC-DRAW2-290 separates editor Broadcast from member Presence", () => {
  assert.match(
    presenceMigration,
    /for select[\s\S]*realtime\.messages\.extension in \('broadcast', 'presence'\)[\s\S]*pixisync_can_access_realtime_topic\(realtime\.topic\(\), false\)/u,
  );
  assert.match(
    presenceMigration,
    /for insert[\s\S]*extension = 'broadcast'[\s\S]*pixisync_can_access_realtime_topic\(realtime\.topic\(\), true\)[\s\S]*extension = 'presence'[\s\S]*pixisync_can_access_realtime_topic\(realtime\.topic\(\), false\)/u,
  );
  assert.doesNotMatch(
    presenceMigration,
    /extension = 'presence'[\s\S]*pixisync_can_access_realtime_topic\(realtime\.topic\(\), true\)/u,
  );
});
