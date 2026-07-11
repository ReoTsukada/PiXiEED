import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const html = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/app.js'), 'utf8');

for (const command of ['new', 'open', 'recent', 'save', 'save-as', 'copy', 'add-sheet', 'export']) {
  assert.match(html, new RegExp(`data-project-file-command="${command}"`));
}
assert.doesNotMatch(html.match(/<div class="project-file-menu"[\s\S]*?<\/div>\s*<div class="field-group/m)?.[0] || '', /PiXiEELENS|QR/);
for (const api of ['executeProjectSave', 'executeProjectSaveAs', 'executeProjectSaveCopy', 'executeProjectOpen']) {
  assert.match(app, new RegExp(`await ${api}\\(`));
}
assert.match(app, /projectFileCommandInFlight/);
assert.match(app, /event\.isComposing/);
assert.match(app, /event\.preventDefault\(\)/);
assert.match(app, /sheetAddKind: 'project'/);
assert.match(app, /openExportDialog\(\)/);
console.log('PiXiEEDraw DEV Phase 5-A3 project file UI checks passed');
