import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile('PiXiEEDrawDEV/assets/js/app.js', 'utf8');
const documentSessionSource = await readFile(
  'PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js',
  'utf8'
);
const startupSource = await readFile(
  'PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js',
  'utf8'
);
const indexSource = await readFile('PiXiEEDrawDEV/index.html', 'utf8');

const documentScopeStart = appSource.indexOf('const documentSessionWorkflowUtilsModule =');
const documentScopeEnd = appSource.indexOf('const pixieedAccountWorkflowUtilsModule =', documentScopeStart);
assert.ok(documentScopeStart >= 0 && documentScopeEnd > documentScopeStart);
const documentScope = appSource.slice(documentScopeStart, documentScopeEnd);

assert.match(documentScope, /get dom\(\) \{ return dom; \}/);
assert.doesNotMatch(documentSessionSource, /enableAutosaveButton|bindOpenedProjectFile/);
assert.match(startupSource, /loadDeviceLocalWorkspaceEntries/);
assert.match(startupSource, /entry\?\.deviceLocalProject === true/);
assert.match(startupSource, /migrateLegacyLocalProjectsToTrueV2/);
assert.match(indexSource, /window\.__PIXIEEDRAW_AD_DEBUG__ !== true/);
assert.doesNotMatch(indexSource, /pixieed-workspace\.js|autosaveDestinationDialog|bindExportFolder/);
assert.match(indexSource, /startup-workflow-utils\.js\?v=20260715-local-true-v2-cleanup1/);
assert.match(indexSource, /document-session-workflow-utils\.js\?v=20260715-local-true-v2-cleanup1/);

console.log('PiXiEEDrawDEV workspace open guard checks passed');
