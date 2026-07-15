import assert from 'node:assert/strict';
import fs from 'node:fs';

const appPath = new URL('../PiXiEEDrawDEV/assets/js/app.js', import.meta.url);
const source = fs.readFileSync(appPath, 'utf8');

assert.doesNotMatch(
  source,
  /loadDocumentFromText\(JSON\.stringify\(latestPackagedProject\)/,
  'V2 IndexedDB payloads must not expand typed pixel buffers through JSON.stringify'
);
assert.match(
  source,
  /loadDocumentFromProjectPayload\(latestPackagedProject,\s*\{/,
  'recent V2 projects must use the in-memory parsed-payload loader'
);
assert.match(
  source,
  /sourcePersistenceState:\s*\{\s*sourceKind: 'recent',\s*sourceStorageAdapterId: null,\s*lastSavedStorageAdapterId: null,/,
  'the direct loader must retain recent-project persistence metadata'
);
assert.match(
  source,
  /trustedAutosaveSchemaVersion: restoredFromV2Primary \? 2 : 0/,
  'only a payload read successfully from a V2 manifest may bypass the V1 adapter label'
);
assert.match(source, /phase: 'project-payload-apply-complete'/);

console.log('PiXiEEDraw DEV V2 typed-array recent-open regression checks passed.');
