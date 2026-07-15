import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relativePath => readFile(relativePath, 'utf8');
const [
  app,
  autosave,
  startup,
  rendering,
  codec,
  html,
] = await Promise.all([
  read('PiXiEEDrawDEV/assets/js/app.js'),
  read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js'),
  read('PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js'),
  read('PiXiEEDrawDEV/assets/js/modules/export-rendering.js'),
  read('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js'),
  read('PiXiEEDrawDEV/index.html'),
]);

assert.match(app, /LOCAL_PROJECT_CHECKPOINT_HISTORY_INTERVAL = 10/);
assert.doesNotMatch(autosave, /EXTERNAL_FILE_AUTOSAVE_ENABLED|destinationSyncRequested|clearStoredAutosaveHandle|showSaveFilePicker|createWritable/);
assert.match(autosave, /writeAutosaveV2Primary/);
assert.match(autosave, /自動保存: 端末内V2へ保存済み/);

const createProjectStart = startup.indexOf('async function createNewProject(');
const createProjectEnd = startup.indexOf('\n  function createStartupQuickProjectName', createProjectStart);
assert.ok(createProjectStart >= 0 && createProjectEnd > createProjectStart);
const createProjectSource = startup.slice(createProjectStart, createProjectEnd);
assert.doesNotMatch(createProjectSource, /createProjectFileHandle/);
assert.doesNotMatch(createProjectSource, /bindActiveProjectSaveHandle/);
assert.match(createProjectSource, /writeAutosaveSnapshot\(true\)/);
assert.match(createProjectSource, /端末内V2へ保存しました/);

assert.match(startup, /const localEntries = \(await loadDeviceLocalWorkspaceEntries\(\)\)\.map/);
assert.doesNotMatch(startup, /workspaceConnect|createProjectFileHandle/);
assert.doesNotMatch(html, /id="startupWorkspaceConnect"|pixieed-workspace\.js/);
assert.match(html, /端末内プロジェクトを確認しています/);

assert.match(rendering, /markActiveLocalProjectJournalNeedsCheckpoint\(autosaveProjectId\)/);
assert.match(rendering, /writeAutosaveSnapshot\(true\)/);
assert.match(rendering, /ERR_ON_DEVICE_CHECKPOINT_INCOMPLETE/);
assert.match(rendering, /checkpointOperationInterval: 10/);
assert.match(rendering, /externalFileAutosave: false/);
assert.match(rendering, /approvalScope: 'sales-submission-only'/);
assert.match(rendering, /localApprovalChecked: false/);
assert.doesNotMatch(rendering, /connectAutosaveDestination|showSaveFilePicker|createWritable/);
assert.match(rendering, /reason: 'download-only'/);
const downloadOnlyProjectSaveStart = rendering.indexOf('async function saveProjectBundleAsNewFile(');
const downloadOnlyProjectSaveEnd = rendering.indexOf('\n  async function executeProjectSaveInternal', downloadOnlyProjectSaveStart);
assert.ok(downloadOnlyProjectSaveStart >= 0 && downloadOnlyProjectSaveEnd > downloadOnlyProjectSaveStart);
const downloadOnlyProjectSaveSource = rendering.slice(downloadOnlyProjectSaveStart, downloadOnlyProjectSaveEnd);
assert.doesNotMatch(downloadOnlyProjectSaveSource, /showSaveFilePicker|createProjectFileHandle|createWritable/);
assert.match(downloadOnlyProjectSaveSource, /preferShare: false/);
assert.match(downloadOnlyProjectSaveSource, /allowAnchorDownload: true/);

assert.match(codec, /approvalStatus: 'unsubmitted'/);
assert.match(codec, /approvalScope: 'sales-submission-only'/);
assert.match(codec, /serverAttested: false/);
assert.doesNotMatch(startup, /summary\.serverAttested|summary\.approvalStatus/);

assert.match(html, /build-info\.js\?v=20260715-093/);
assert.match(html, /app\.js\?v=20260715-093/);

console.log('PiXiEEDrawDEV IndexedDB-only autosave and manual export checks passed.');
