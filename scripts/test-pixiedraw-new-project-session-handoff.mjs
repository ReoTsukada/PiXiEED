import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8');
const startup = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/startup-workflow-utils.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../pixiedraw/index.html', import.meta.url), 'utf8');

const createStart = startup.indexOf('async function createNewProject(');
const createEnd = startup.indexOf('\n  function createStartupQuickProjectName', createStart);
assert.ok(createStart >= 0 && createEnd > createStart, 'createNewProject body must be present');
const create = startup.slice(createStart, createEnd);

const cleanWithoutMirrorAt = create.indexOf('resetDocumentUnsavedChanges({ syncSession: false });');
const allocateIdAt = create.indexOf('const newProjectId = createAutosaveProjectId();');
const setAutosaveIdAt = create.indexOf('setActiveAutosaveProjectId(newProjectId);');
const resetTabsAt = create.indexOf('resetOpenProjectTabsToCurrentProject({');
const markDirtyAt = create.indexOf('markAutosaveDirty();');
const immediateSaveAt = create.indexOf('writeAutosaveSnapshot(true)');

assert.ok(cleanWithoutMirrorAt >= 0, 'new-document dirty tokens must reset without mirroring the closed project session');
assert.ok(allocateIdAt > cleanWithoutMirrorAt, 'the new project id must be allocated after the clean reset');
assert.ok(setAutosaveIdAt > allocateIdAt, 'the allocated id must become the autosave identity');
assert.ok(resetTabsAt > setAutosaveIdAt, 'tab and active session must switch after the autosave identity');
assert.ok(markDirtyAt > resetTabsAt, 'autosave dirtiness must begin after the identity handoff');
assert.ok(immediateSaveAt > markDirtyAt, 'immediate autosave must run only after the identity handoff');
assert.equal(
  [...create.matchAll(/resetOpenProjectTabsToCurrentProject\(\{/g)].length,
  1,
  'new-project tab/session reset must have one authoritative location'
);
assert.match(create, /resetOpenProjectTabsToCurrentProject\(\{[\s\S]{0,160}projectId: newProjectId,/);
assert.match(
  app,
  /function resetDocumentUnsavedChanges\(\{ syncSession = true \} = \{\}\) \{[\s\S]{0,180}if \(syncSession\) \{[\s\S]{0,100}syncActiveProjectSessionDirty\('document-reset-clean'\);/,
  'ordinary clean resets must still mirror session dirtiness by default'
);
assert.match(index, /startup-workflow-utils\.js\?v=20260720-pxd1/);
assert.match(index, /app\.js\?v=20260721-115/);

console.log('PiXiEEDraw new-project session identity handoff checks passed');
