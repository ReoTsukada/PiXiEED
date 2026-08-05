import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recentSource = await readFile(
  new URL('../pixiedraw/assets/js/modules/recent-project-workflow-utils.js', import.meta.url),
  'utf8'
);
assert.match(recentSource, /removedEntry\?\.pixisync\?\.roomId/);
assert.match(recentSource, /disconnectPiXiSyncDeletedProject\(removedEntry\)/);
assert.match(recentSource, /remote-detach-required/);
assert.ok(
  recentSource.indexOf('disconnectPiXiSyncDeletedProject(removedEntry)')
    < recentSource.indexOf('await saveRecentProjectsList(existingEntries, nextEntries)'),
  'the server-side share detach must complete before local project metadata is deleted'
);

const [migration, checkpointFix, app, runtime, startup] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260803062137_pixisync_detach_deleted_project.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260805002435_pixisync_fix_checkpoint_registration_and_delete_localization.sql', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/pixisync-runtime-adapter-utils.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/startup-workflow-utils.js', import.meta.url), 'utf8'),
]);
for (const contract of [
  /create function public\.pixisync_detach_deleted_project\(p_room_id uuid\)/,
  /v_room\.owner_user_id = v_user_id/,
  /set status = 'archived'/,
  /update collab_v1\.room_invites/,
  /update collab_v1\.room_members/,
  /grant execute on function public\.pixisync_detach_deleted_project\(uuid\) to authenticated/,
]) assert.match(migration, contract);
assert.match(app, /client\.rpc\('pixisync_detach_deleted_project'/);
assert.match(app, /typeof runtime\.archive === 'function'/);
assert.match(app, /remote-detach-unconfirmed/);
assert.match(runtime, /const registeredCheckpointId = String\(registered\?\.checkpoint_id \|\| checkpointId\)/);
assert.match(runtime, /p_final_checkpoint_id: registeredCheckpointId/);
assert.match(checkpointFix, /create or replace function public\.pixisync_register_checkpoint\(p_room_id uuid, p_checkpoint_id uuid\)/);
assert.match(checkpointFix, /v_existing\.status = 'verified'/);
assert.match(checkpointFix, /delete from collab_v1\.checkpoint_attestations/);
assert.match(checkpointFix, /storage_path = v_upload\.storage_path/);
assert.match(checkpointFix, /grant execute on function public\.pixisync_register_checkpoint\(uuid, uuid\) to authenticated/);
assert.match(startup, /シェア状態を終了し、参加者を切断してから端末内データを削除します/);
assert.match(startup, /シェア状態を終了できなかったため、プロジェクトは削除していません/);

console.log('PiXiSYNC project deletion tests passed');
