import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const commandTest = path.join(repoRoot, 'scripts/test-pixiedraw-dev-project-storage-phase4j-v2-overwrite-fix.mjs');
const source = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/export-rendering.js'), 'utf8');

for (const api of [
  'executeProjectSave',
  'executeProjectSaveAs',
  'executeProjectSaveCopy',
  'executeProjectOpen',
  'resolveProjectSameHandleOverwriteEligibility',
]) {
  assert.match(source, new RegExp(`function ${api}`));
}
assert.match(source, /multiSheetCandidate\?\.complete === true/);
assert.match(source, /forcePicker: forceSaveAs/);
assert.match(source, /applyExternalSaveEffects: !preserveCurrentProjectState/);

const result = spawnSync(process.execPath, [commandTest], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr || result.stdout);
console.log('PiXiEEDraw DEV Phase 5-A2 project file command checks passed');
