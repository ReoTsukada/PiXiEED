import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const html = read("pixiedraw2/index.html");
const entry = read("pixiedraw2/src/draw2-entry.ts");
const contract = read("pixiedraw2/src/pixync/collaboration-scope.ts");
const migration = read("supabase/migrations/20260910114500_collaboration_scope_consent.sql");
const policyMigration = read("supabase/migrations/20260910133000_pixisync_edit_scope_policy.sql");

for (const id of [
  "draw2CollaborationScopeOpen",
  "draw2CollaborationScopeDialog",
  "draw2CollaborationConsentCheck",
  "draw2CollaborationConsentAccept",
  "draw2CollaborationMasterPanel",
  "draw2CollaborationParticipantPanel",
  "draw2CollaborationEditGuard",
  "draw2CollaborationEditPolicy",
  "draw2CollaborationEditPolicyOpen",
  "draw2CollaborationEditPolicyAssignedOnly",
]) assert.match(html, new RegExp(`id="${id}"`), `${id} is missing`);

for (const marker of [
  "COLLABORATION_SCOPE_KEYS",
  "PENDING_MEMBER",
  "REMOVAL_REQUESTED",
  "COLLABORATION_EDIT_SCOPE_POLICIES",
  "ASSIGNED_ONLY",
]) assert.match(contract, new RegExp(marker), `${marker} is missing`);

for (const rpc of [
  "pixisync_accept_collaboration_consent_v1",
  "pixisync_list_scope_assignments_v1",
  "pixisync_set_scope_assignment_v1",
  "pixisync_request_scope_v1",
  "pixisync_review_scope_request_v1",
  "pixisync_respond_scope_v1",
]) {
  assert.match(entry, new RegExp(rpc), `${rpc} is not wired in Draw2`);
  assert.match(migration, new RegExp(rpc), `${rpc} is not defined in SQL`);
}
assert.match(entry, /pixisync_set_edit_scope_policy_v1/);
assert.match(policyMigration, /pixisync_set_edit_scope_policy_v1/);
assert.match(policyMigration, /edit_scope_policy.*OPEN/iu);
assert.match(policyMigration, /scope_allows_edit/);
assert.match(policyMigration, /scope_assignment_required/);
assert.match(policyMigration, /create trigger pixync_edit_scope_draw2_operation/);
assert.match(policyMigration, /create trigger pixync_edit_scope_game_revision/);
assert.match(policyMigration, /create trigger pixync_edit_scope_legacy_operation/);
assert.match(policyMigration, /revoke all on function collab_v1\.scope_allows_edit/);

assert.match(migration, /assignment_state = 'REMOVAL_REQUESTED'/);
assert.match(migration, /member_decided_at/);
assert.match(migration, /room_participation_consents/);
assert.match(migration, /COLLABORATION_NOTICE_V1/);
assert.match(migration, /current_user_consented/);
assert.match(migration, /revoke all on collab_v1\.room_scope_assignments/);
assert.match(migration, /revoke all on collab_v1\.room_participation_consents/);
assert.doesNotMatch(migration, /operation_count.*rights|pixel_count.*rights/iu);
assert.doesNotMatch(`${html}\n${entry}\n${contract}\n${migration}\n${policyMigration}`, /draw2CollaborationMode|COLLABORATION_MODES|set_collaboration_mode|collaboration_mode|\bMANAGED\b|\bCASUAL\b/);

console.log("collaboration scope consent contract: PASS");
