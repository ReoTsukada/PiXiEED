import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const html = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/app.js'), 'utf8');

for (const id of ['newProject', 'openDocument', 'showLocalProjects', 'exportProject']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.doesNotMatch(html, /id="projectFileMenuButton"|id="projectFileMenuItems"|data-project-file-command=/);
for (const api of ['executeProjectSave', 'executeProjectSaveAs', 'executeProjectSaveCopy', 'executeProjectOpen']) {
  assert.match(app, new RegExp(`await ${api}\\(`));
}
assert.match(app, /projectFileCommandInFlight/);
assert.match(app, /event\.isComposing/);
assert.match(app, /event\.preventDefault\(\)/);
assert.match(app, /openExportDialog\(\)/);
assert.match(app, /function bindCoreProjectActionButtons\(\)/);
assert.match(app, /bindCoreProjectActionButtons\(\);/);
console.log('PiXiEEDraw DEV Phase 5-A3 project file UI checks passed');
