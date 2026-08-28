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
    < recentSource.indexOf('const removed = await removeAutosaveV2ProjectData(normalizedId)'),
  'the server-side share detach must complete before local project data is deleted'
);
assert.ok(
  recentSource.indexOf('const removed = await removeAutosaveV2ProjectData(normalizedId)')
    < recentSource.indexOf('await saveRecentProjectsList(existingEntries, nextEntries)'),
  'local project data must be removed before the recent-project card is deleted'
);
assert.match(recentSource, /typeof removeAutosaveV2ProjectData !== 'function'/);
assert.match(recentSource, /const removed = await removeAutosaveV2ProjectData\(normalizedId\)/);
assert.match(recentSource, /removed !== true/);
assert.match(recentSource, /local-cleanup-unconfirmed/);
assert.match(recentSource, /waitForAutosaveWriteIdle/);
assert.match(recentSource, /claimRecentProjectDeletion/);
assert.match(recentSource, /completeRecentProjectDeletion/);
assert.match(recentSource, /cancelRecentProjectDeletion/);
assert.ok(
  recentSource.indexOf('claimRecentProjectDeletion(normalizedId)')
    < recentSource.indexOf('await waitForAutosaveWriteIdle()'),
  'the in-memory delete barrier must be claimed before an autosave can finish'
);

const [migration, checkpointFix, app, runtime, startup, html] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260803062137_pixisync_detach_deleted_project.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260805002435_pixisync_fix_checkpoint_registration_and_delete_localization.sql', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/pixisync-runtime-adapter-utils.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/startup-workflow-utils.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/index.html', import.meta.url), 'utf8'),
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
assert.match(app, /const resultRoomId = String\(resultRecord\?\.room_id/);
assert.match(app, /resultRoomId !== roomId/);
assert.match(app, /const validActionStatus/);
assert.match(app, /Number\.isSafeInteger\(resultGeneration\)/);
assert.match(app, /remote-detach-unconfirmed/);
assert.match(app, /COLD_HISTORY_MAX_ENTRIES_PER_DIRECTION/);
assert.match(app, /COLD_HISTORY_MAX_ENTRY_BYTES/);
assert.match(app, /Older Undo data for a large drawing stays within the current history limit/);
assert.match(app, /return Array\.isArray\(limitedEntries\) \? limitedEntries : normalizedEntries/);
assert.match(app, /RECENT_PROJECT_DELETION_KEY_PREFIX/);
assert.match(app, /recentProjectDeletionVersion: 1/);
assert.match(app, /isRecentProjectDeletionMarker/);
assert.match(app, /const recentProjectDeletionStates = new Map\(\)/);
assert.match(app, /entries\.filter\(entry => !isRecentProjectDeletionBlocked\(entry\?\.id \|\| ''\)\)/);
assert.match(runtime, /const registeredCheckpointId = String\(registered\?\.checkpoint_id \|\| checkpointId\)/);
assert.match(runtime, /p_final_checkpoint_id: registeredCheckpointId/);
assert.match(checkpointFix, /create or replace function public\.pixisync_register_checkpoint\(p_room_id uuid, p_checkpoint_id uuid\)/);
assert.match(checkpointFix, /v_existing\.status = 'verified'/);
assert.match(checkpointFix, /delete from collab_v1\.checkpoint_attestations/);
assert.match(checkpointFix, /storage_path = v_upload\.storage_path/);
assert.match(checkpointFix, /grant execute on function public\.pixisync_register_checkpoint\(uuid, uuid\) to authenticated/);
assert.match(startup, /シェア状態を終了し、参加者を切断してから端末内データを削除します/);
assert.match(startup, /シェア状態を終了できなかったため、プロジェクトは削除していません/);
assert.match(html, /recent-project-workflow-utils\.js\?v=20260828-project-list-light2/);
assert.match(html, /cold-history-store-utils\.js\?v=20260828-cold-history-delete1/);
assert.match(html, /memory-utils\.js\?v=20260828-history-retention1/);
assert.match(html, /open-import-workflow-utils\.js\?v=20260828-project-list-light1/);
assert.match(html, /project-package-workflow-utils\.js\?v=20260828-project-list-light1/);
assert.match(html, /app\.js\?v=20260828-delete-guard1/);

const loadRecentWorkflow = new Function(
  'window',
  `${recentSource}\nreturn window.PiXiEEDrawModules.recentProjectWorkflowUtils;`,
);
const recentWorkflow = loadRecentWorkflow({ PiXiEEDrawModules: {} })
  .createRecentProjectWorkflowUtils({
    AUTOSAVE_SUPPORTED: true,
    normalizeAutosaveProjectId: value => String(value || '').trim(),
    loadRecentProjectsMetadata: async () => [{
      id: 'project-delete-runtime',
      name: 'Delete runtime test',
      autosaveSchemaVersion: 2,
    }],
    removeAutosaveV2ProjectData: async () => false,
    claimRecentProjectDeletion: () => true,
    completeRecentProjectDeletion: () => {},
    cancelRecentProjectDeletion: projectId => {
      assert.equal(projectId, 'project-delete-runtime');
    },
    recentProjectsCache: new Map(),
    dom: { startup: {} },
    window: { setTimeout, clearTimeout },
    recentProjectsRenderTimer: null,
    recentProjectsLastRenderSignature: '',
    recentProjectsPendingRenderEntries: null,
    HTMLButtonElement: class {},
    HTMLElement: class {},
    saveRecentProjectsList: async () => {
      throw new Error('Recent card must not be saved after failed local cleanup.');
    },
    setRecentProjectsCache: () => {},
    isSharedRecentProjectEntry: () => false,
    getSharedProjectKeyFromProjectId: () => '',
    closeOpenProjectTabsForDeletedProject: () => {},
  });
await assert.rejects(
  () => recentWorkflow.removeRecentProjectEntry('project-delete-runtime'),
  /local-cleanup-unconfirmed/,
);

const legacyCleanupCalls = [];
const legacyDeletionLifecycle = [];
const legacyWorkflow = loadRecentWorkflow({ PiXiEEDrawModules: {} })
  .createRecentProjectWorkflowUtils({
    AUTOSAVE_SUPPORTED: true,
    normalizeAutosaveProjectId: value => String(value || '').trim(),
    loadRecentProjectsMetadata: async () => [{
      id: 'legacy-project-delete-runtime',
      name: 'Legacy delete runtime test',
      autosaveSchemaVersion: 1,
    }],
    removeAutosaveV2ProjectData: async projectId => {
      legacyCleanupCalls.push(projectId);
      return true;
    },
    claimRecentProjectDeletion: () => {
      legacyDeletionLifecycle.push('claim');
      return true;
    },
    completeRecentProjectDeletion: projectId => {
      legacyDeletionLifecycle.push(`complete:${projectId}`);
    },
    cancelRecentProjectDeletion: projectId => {
      legacyDeletionLifecycle.push(`cancel:${projectId}`);
    },
    recentProjectsCache: new Map(),
    dom: { startup: {} },
    window: { setTimeout, clearTimeout },
    recentProjectsRenderTimer: null,
    recentProjectsLastRenderSignature: '',
    recentProjectsPendingRenderEntries: null,
    HTMLButtonElement: class {},
    HTMLElement: class {},
    saveRecentProjectsList: async () => {},
    setRecentProjectsCache: () => {},
    isSharedRecentProjectEntry: () => false,
    getSharedProjectKeyFromProjectId: () => '',
    closeOpenProjectTabsForDeletedProject: () => {},
  });
assert.equal(
  await legacyWorkflow.removeRecentProjectEntry('legacy-project-delete-runtime'),
  true,
  'legacy project deletion did not complete'
);
assert.deepEqual(
  legacyCleanupCalls,
  ['legacy-project-delete-runtime'],
  'legacy project deletion skipped related local-history cleanup'
);
assert.deepEqual(
  legacyDeletionLifecycle,
  ['claim', 'complete:legacy-project-delete-runtime'],
  'successful deletion must keep the in-memory delete barrier through cache update'
);

console.log('PiXiSYNC project deletion tests passed');
