import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(
  new URL('../PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js', import.meta.url),
  'utf8'
);
const lifecycle = fs.readFileSync(
  new URL('../PiXiEEDrawDEV/assets/js/modules/open-project-tab-lifecycle.js', import.meta.url),
  'utf8'
);

assert.match(
  workflow,
  /persistActiveOpenProjectTab\(\{\s*\/\/ The tab payload[\s\S]*?flushAutosave: false,[\s\S]*?retainProjectPayload: true,/,
  'tab switching must not synchronously flush the complete autosave payload'
);
assert.doesNotMatch(
  lifecycle,
  /const residentProjectPayload = retainProjectPayload/,
  'tab persistence must not build a second resident project payload'
);
assert.match(
  lifecycle,
  /const canReuseResidentLocalPayload = Boolean\(/,
  'unchanged local tabs must reuse their resident payload rather than clone every GIF frame'
);
assert.match(
  lifecycle,
  /!hasDocumentUnsavedChanges\(\)/,
  'a full local tab snapshot is required only after an actual document change'
);
assert.doesNotMatch(
  workflow,
  /openProjectTabs\.forEach\(\(tab, index\) => \{[\s\S]{0,500}project: null/,
  'switching tabs must not discard resident payload references'
);

console.log('PiXiEEDrawDEV tab-switch performance regression checks passed.');
