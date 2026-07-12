import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const importer = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const autosave = read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');
const packaging = read('PiXiEEDrawDEV/assets/js/modules/project-package-workflow-utils.js');

for (const phase of [
  'pixiedraw-dev:import:total',
  'pixiedraw-dev:import:decode',
  'pixiedraw-dev:import:resize',
  'pixiedraw-dev:import:runtime-frames',
  'pixiedraw-dev:import:apply-history-snapshot',
  'pixiedraw-dev:import:canonical-normalize',
  'pixiedraw-dev:import:canonical-validate',
]) {
  assert.ok(importer.includes(phase), `missing import performance phase: ${phase}`);
}

for (const phase of [
  'pixiedraw-dev:autosave:total',
  'pixiedraw-dev:autosave:make-history-snapshot',
  'pixiedraw-dev:autosave:record-recent-project',
  'pixiedraw-dev:autosave:v2-shadow-queue',
]) {
  assert.ok(autosave.includes(phase), `missing autosave performance phase: ${phase}`);
}

for (const phase of [
  'pixiedraw-dev:autosave:package',
  'pixiedraw-dev:autosave:thumbnail',
  'pixiedraw-dev:autosave:indexeddb-write',
]) {
  assert.ok(packaging.includes(phase), `missing packaging performance phase: ${phase}`);
}

assert.match(importer, /performance\]', \{/);
assert.match(autosave, /performance\]', \{/);
assert.match(packaging, /performance\]', \{/);

console.log('PiXiEEDraw DEV performance instrumentation checks passed.');
