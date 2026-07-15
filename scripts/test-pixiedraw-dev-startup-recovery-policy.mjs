import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/app.js'), 'utf8');
const autosaveSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js'), 'utf8');
const reloadSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/reload-session-workflow-utils.js'), 'utf8');
const startupSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/index.html'), 'utf8');

assert.match(appSource, /const shouldAutoRestoreReloadSnapshot = false;/);
assert.match(appSource, /initializeAutosave\(\{ reusePreviousProjectId: shouldAutoRestoreReloadSnapshot \}\)/);
assert.match(appSource, /phase: 'startup-session-restore-skipped'/);
assert.match(appSource, /hideProjectHomeScreen\(\);\s*showStartupScreen\(\);/);

assert.match(autosaveSource, /const reusePreviousProjectId = options\?\.reusePreviousProjectId === true/);
assert.match(autosaveSource, /if \(!reusePreviousProjectId\) \{[\s\S]*?setActiveAutosaveProjectId\(createAutosaveProjectId\(\)\)/);

assert.match(startupSource, /function requestStartupRecoveryAction\(payload = null\)/);
assert.match(startupSource, /復帰しても保存先の \.pixieedraw ファイルは自動で上書きしません/);

assert.match(reloadSource, /function clearReloadRecoveryData\(\) \{[\s\S]*?RELOAD_SNAPSHOT_STORAGE_KEY[\s\S]*?RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY[\s\S]*?RELOAD_PROJECT_FALLBACK_STORAGE_KEY[\s\S]*?clearReloadTargetProjectId\(\)/);
assert.match(reloadSource, /return \{\s*at: timestamp,/);

for (const id of [
  'startupRecoveryDialog',
  'startupRecoveryMessage',
  'startupRecoveryDetail',
  'startupRecoveryDelete',
  'startupRecoveryLater',
  'startupRecoveryRestore',
]) {
  assert.match(htmlSource, new RegExp(`id=["']${id}["']`));
}

console.log('PiXiEEDrawDEV startup recovery policy checks passed.');
