import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const app = read('PiXiEEDrawDEV/assets/js/app.js');
const session = read('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
const reload = read('PiXiEEDrawDEV/assets/js/modules/reload-session-workflow-utils.js');

assert.match(app, /legacyMultiProjectSourceId/);
assert.match(app, /projects: createdEntries\.map|const projects = nextEntries/);
assert.match(session, /const migration = await migrateLegacyMultiProjectPackage/);
assert.match(session, /ERR_LEGACY_MULTI_PROJECT_CONVERSION_FAILED/);
assert.match(session, /legacy-multi-project-split-ready/);
assert.match(reload, /Promise\.resolve\(restoreOpenProjectSheetsFromParsedDocument/);

console.log('PiXiEEDraw DEV R3 legacy multi-project split guards passed.');
