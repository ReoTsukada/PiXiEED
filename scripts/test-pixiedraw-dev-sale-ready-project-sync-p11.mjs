import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const app = read('PiXiEEDrawDEV/assets/js/app.js');
const autosave = read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');
const exportRendering = read('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');
const html = read('PiXiEEDrawDEV/index.html');

assert.match(html, /id="toggleAutosaveRequired"[^>]*checked[^>]*disabled|checked[^>]*disabled[^>]*id="toggleAutosaveRequired"/);
assert.match(html, /端末内V2自動保存（常時ON）/);
assert.match(html, /10操作ごとに差分をチェックポイントへ統合/);
assert.match(html, /外部ファイルへは自動出力しません/);
assert.match(app, /const pendingTimelapseArchiveWrites = new Set\(\)/);
assert.match(app, /waitForPendingTimelapseArchiveWrites\(\{ requireSuccess: requireComplete \}\)/);
assert.match(app, /throwOnError: requireComplete/);
assert.match(app, /ERR_TIMELAPSE_ARCHIVE_SYNC_FAILED/);
assert.match(app, /ERR_TIMELAPSE_DATA_INCOMPLETE/);
assert.match(app, /timelapse\.synchronization = \{/);
assert.match(autosave, /isAutosaveV2PrimaryEnabled\?\.\(\) !== true/);
assert.match(autosave, /writeAutosaveV2Primary/);
assert.doesNotMatch(autosave, /showSaveFilePicker|createWritable|syncDestination/);
assert.match(exportRendering, /projectExportIntegrity = \{/);
assert.match(exportRendering, /autosavePolicy: 'indexeddb-checkpoint-journal'/);
assert.match(exportRendering, /checkpointOperationInterval: 10/);
assert.match(exportRendering, /externalFileAutosave: false/);
assert.match(exportRendering, /approvalScope: 'sales-submission-only'/);
assert.match(exportRendering, /localApprovalChecked: false/);
assert.match(exportRendering, /markActiveLocalProjectJournalNeedsCheckpoint\(autosaveProjectId\)/);
assert.match(exportRendering, /writeAutosaveSnapshot\(true\)/);
assert.match(exportRendering, /timelapseSynchronized: session\?\.timelapse\?\.synchronization\?\.complete === true/);
assert.match(exportRendering, /saleCandidateDataComplete: session\?\.timelapse\?\.synchronization\?\.complete === true/);
assert.match(exportRendering, /reason: 'download-only'/);
assert.doesNotMatch(exportRendering, /connectAutosaveDestination|showSaveFilePicker|PiXiEEDWorkspace/);

console.log('PiXiEEDrawDEV sale-ready project synchronization checks passed.');
