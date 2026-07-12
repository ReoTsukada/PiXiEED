import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('PiXiEEDrawDEV/assets/js/app.js');
const autosave = read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');
const openImport = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');

assert.match(app, /function isAutosaveV2PrimaryEnabled\(\)/);
assert.match(app, /async function writeAutosaveV2Primary\(/);
assert.match(app, /writeSchemaV2JournalRevision\(/);
assert.match(app, /normalizeV2PixelPatchJournalOps\(/);
assert.match(app, /autosaveV2CheckpointReadyProjectIds\.add\(/);
assert.match(app, /fallbackPackagedPayload/);
assert.match(app, /await readAutosaveV2PrimaryProject\(normalizedProjectId\)/);
assert.match(app, /extractLocalProjectSheetPayload\(fallbackPackagedPayload, tab\?\.id \|\| ''\)/);
assert.match(app, /Autosave schema V2 write is missing sheet payload/);
assert.match(app, /autosaveSchemaVersion: Number\(manifest\.autosaveSchemaVersion\) \|\| 2/);
assert.match(app, /manifestKey: manifest\.key/);
assert.doesNotMatch(app, /const metadata = \{[\s\S]{0,800}\n\s*project:/);
assert.match(autosave, /const useV2Primary = isAutosaveV2PrimaryEnabled\?\.\(\) === true/);
assert.match(autosave, /isAutosaveV2JournalReady\?\.\(projectId\) === true/);
assert.match(autosave, /\? await writeAutosaveV2Primary\(\{/);
assert.match(autosave, /savePlan: useV2Journal \? journalOnlySavePlan : activeSavePlan/);
assert.match(openImport, /Number\(entry\.autosaveSchemaVersion\) === 2/);
assert.match(openImport, /await readAutosaveV2PrimaryProject\(entry\.id\)/);

console.log('PiXiEEDrawDEV V2 primary autosave regression checks passed.');
