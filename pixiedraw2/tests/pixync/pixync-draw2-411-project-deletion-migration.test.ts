import { strict as assert } from "node:assert";

const migration = await Deno.readTextFile(
  new URL(
    "../../../supabase/migrations/20260828120000_pixisync_detach_require_localized_owner_record.sql",
    import.meta.url,
  ),
);
const start = migration.indexOf(
  "create or replace function public.pixisync_detach_deleted_project",
);
const end = migration.indexOf(
  "revoke all on function public.pixisync_detach_deleted_project",
  start,
);
const detachFunction = migration.slice(start, end);

Deno.test("PIXYNC-DRAW2-411 final detach RPC requires server-side authentication", () => {
  assert.ok(start >= 0 && end > start, "Final detach RPC definition is missing.");
  assert.match(detachFunction, /v_user_id uuid := auth\.uid\(\)/u);
  assert.match(detachFunction, /if v_user_id is null then raise exception 'authentication_required'/u);
});

Deno.test("PIXYNC-DRAW2-411 final detach RPC blocks an unlocalized owner", () => {
  assert.match(
    detachFunction,
    /if v_room\.status in \('initializing', 'active'\) then[\s\S]*?raise exception 'pixisync_localization_required'/u,
  );
  assert.match(
    detachFunction,
    /if not exists \([\s\S]*?target\.user_id = v_user_id[\s\S]*?target\.localized_at is not null[\s\S]*?raise exception 'pixisync_localization_required'/u,
  );
  assert.doesNotMatch(detachFunction, /'owner_archived'/u);
});

Deno.test("PIXYNC-DRAW2-411 final detach RPC exposes only localized owner and participant actions", () => {
  assert.match(detachFunction, /'owner_localized'::text/u);
  assert.match(detachFunction, /'participant_left'::text/u);
  assert.match(detachFunction, /'already_detached'::text/u);
  assert.match(
    migration,
    /revoke all on function public\.pixisync_detach_deleted_project\(uuid\) from public, anon/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.pixisync_detach_deleted_project\(uuid\) to authenticated/u,
  );
});
