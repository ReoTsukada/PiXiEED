import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const session = read('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
const imports = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const imageUtils = read('PiXiEEDrawDEV/assets/js/modules/image-utils.js');
const app = read('PiXiEEDrawDEV/assets/js/app.js');

assert.match(session, /const normalizeExternalInputToV2 = options\?\.fileLoad === true \|\| options\?\.forceV2WorkingCopy === true/);
assert.match(session, /const mustCreateUnboundV2WorkingCopy = options\?\.fileLoad === true \|\| options\?\.forceV2WorkingCopy === true/);
assert.match(session, /autosaveHandle = null/);
assert.match(session, /clearActiveProjectSaveHandle\?\.\(\)/);
assert.match(session, /external-input-converted-to-v2-working-copy/);
assert.ok(
  session.indexOf('await restoreOpenProjectSheetsFromParsedDocument')
    < session.indexOf('if (mustCreateUnboundV2WorkingCopy)'),
  'external-input save binding must be cleared only after the new project session/tab mirror is restored'
);
assert.match(imports, /forceV2WorkingCopy: true/);
assert.match(imports, /sourceKind: candidate\.sourceKind \|\| 'import-image'/);
assert.match(app, /'import-image', 'import-gif', 'mixed'/);
assert.match(imports, /Open one project at a time/);
assert.match(imports, /image\/jpeg/);
assert.match(imports, /image\/webp/);
assert.match(imageUtils, /image\/jpeg/);
assert.match(imageUtils, /image\/webp/);
assert.match(app, /name\.endsWith\('\.jpeg'\)/);
assert.match(app, /name\.endsWith\('\.webp'\)/);

console.log('PiXiEEDraw DEV R3 external-input V2 normalization checks passed.');
