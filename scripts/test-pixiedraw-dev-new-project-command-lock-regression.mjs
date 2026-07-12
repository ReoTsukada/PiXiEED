import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const startupPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/startup-workflow-utils.js');
const source = fs.readFileSync(startupPath, 'utf8');

function functionBody(name, nextName) {
  const start = source.indexOf(`async function ${name}(`);
  const end = [
    source.indexOf(`  async function ${nextName}(`, start),
    source.indexOf(`  function ${nextName}(`, start),
  ].filter(index => index > start).sort((left, right) => left - right)[0];
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

const submit = functionBody('handleNewProjectSubmit', 'promptNewProjectFallback');
const create = functionBody('createNewProject', 'createStartupQuickProjectName');

assert.doesNotMatch(
  submit,
  /acquireProjectCommandLock\(/,
  'the submit handler must not lock before its own active-tab flush'
);
assert.match(
  submit, /code: invalidDimensions \? 'invalid-canvas-size' : 'project-replacement-failed'/);

const closeTabsAt = create.indexOf('await closeAllOpenProjectTabsForProjectReplacement({ flushAutosave: true, showHome: false })');
const acquireLockAt = create.indexOf("acquireProjectCommandLock({ owner: 'new-project-create', command: 'create-new-project' })");
assert.ok(closeTabsAt >= 0, 'new project creation must flush existing tabs');
assert.ok(acquireLockAt > closeTabsAt, 'new project command lock must be acquired only after existing tabs are flushed');
assert.match(create, /releaseProjectCommandLock\(\{ token: projectCreationLock\.token, owner: projectCreationLock\.owner \}\)/);

console.log('PiXiEEDraw DEV new-project command-lock regression checks passed');
