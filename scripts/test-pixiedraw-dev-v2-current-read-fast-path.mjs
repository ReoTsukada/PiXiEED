import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-indexeddb-utils.js', 'utf8');
assert.match(source, /async function loadCurrentProjectSchemaRecords\(/);
assert.match(source, /readCurrentManifestReference\(id\)/);
assert.match(source, /checkpointStore\.get\(key\)/);
assert.match(source, /journalStore\.get\(key\)/);
assert.match(source, /fastPathUsed: true/);
assert.match(source, /const records = await loadAllProjectSchemaRecords\(projectId\)/);
console.log('PiXiEEDrawDEV V2 current-read fast-path wiring checks passed.');
