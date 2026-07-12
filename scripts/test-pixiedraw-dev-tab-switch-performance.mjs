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
  /createLocalOpenProjectTabFromCurrentState\(current,/,
  'the single local-tab payload build must remain in place'
);

console.log('PiXiEEDrawDEV tab-switch performance regression checks passed.');
