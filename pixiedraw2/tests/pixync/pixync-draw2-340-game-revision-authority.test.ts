import { strict as assert } from "node:assert";

const sql = await Deno.readTextFile(
  "../supabase/migrations/20260824090000_pixync_draw2_aggregate_authority.sql",
);

Deno.test("PIXYNC-DRAW2-340 stores Game revisions separately from lightweight operations", () => {
  assert.match(
    sql,
    /create table if not exists collab_v1\.draw2_game_revisions/,
  );
  assert.match(sql, /pixync_draw2_put_game_revision_v1/);
  assert.match(sql, /pixync_draw2_get_game_revision_v1/);
  assert.match(sql, /p_game_project->>'projectId' is distinct from p_project_id/);
  assert.match(
    sql,
    /p_game_project#>>'\{revision,snapshotHash\}' is distinct from p_snapshot_hash/,
  );
  assert.match(sql, /octet_length\([\s\S]*p_game_project[\s\S]*> 524288/);
  assert.match(
    sql,
    /alter table collab_v1\.draw2_game_revisions enable row level security/,
  );
  assert.match(
    sql,
    /grant execute on function public\.pixync_draw2_put_game_revision_v1[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(sql, /grant select on collab_v1\.draw2_game_revisions/);
});
