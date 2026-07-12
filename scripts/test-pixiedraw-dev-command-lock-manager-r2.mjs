import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const managerPath = new URL('../PiXiEEDrawDEV/assets/js/modules/project-command-lock-utils.js', import.meta.url);
let now = 1000;
const diagnostics = [];
const context = { window: { PiXiEEDrawModules: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(managerPath, 'utf8'), context, { filename: 'project-command-lock-utils.js' });
const { createProjectCommandLockManager } = context.window.PiXiEEDrawModules.projectCommandLockUtils;
const manager = createProjectCommandLockManager({
  now: () => now,
  staleThresholdMs: 100,
  onDiagnostic: entry => diagnostics.push(entry),
});

assert.deepEqual({ ...manager.inspect() }, {
  locked: false, owner: null, command: null, acquiredAt: 0, lockAgeMs: 0, tokenPresent: false,
});

const lock = manager.acquire({ owner: 'png-import', command: 'import-image' });
assert.equal(lock.ok, true);
assert.equal(manager.inspect().locked, true);
assert.equal(manager.inspect().owner, 'png-import');
assert.equal(manager.inspect().command, 'import-image');
assert.equal(Object.hasOwn(manager.inspect(), 'token'), false, 'inspection never exposes a token');
assert.equal(manager.acquire({ owner: 'gif-import', command: 'import-gif' }).code, 'ERR_PROJECT_COMMAND_LOCKED');

const wrongToken = manager.release({ token: {}, owner: 'png-import' });
assert.equal(wrongToken.code, 'ERR_PROJECT_COMMAND_RELEASE_TOKEN_MISMATCH');
assert.equal(manager.inspect().locked, true);
const wrongOwner = manager.release({ token: lock.token, owner: 'gif-import' });
assert.equal(wrongOwner.code, 'ERR_PROJECT_COMMAND_RELEASE_OWNER_MISMATCH');
assert.equal(manager.inspect().locked, true);
assert.equal(manager.isHeldBy({ token: lock.token, owner: 'png-import' }), true);

now += 101;
const stale = manager.detectStale();
assert.equal(stale.stale, true);
assert.equal(stale.code, 'ERR_PROJECT_COMMAND_STALE');
assert.equal(manager.inspect().locked, true, 'stale diagnostics never auto-release a command');
assert.equal(manager.release({ token: lock.token, owner: 'png-import' }).ok, true);
assert.equal(manager.inspect().locked, false);

async function releaseInFinally({ throwError = false } = {}) {
  const active = manager.acquire({ owner: 'sheet-add', command: 'create-empty-sheet' });
  try {
    if (throwError) throw new Error('fixture');
    return 'ok';
  } finally {
    manager.release({ token: active.token, owner: active.owner });
  }
}
assert.equal(await releaseInFinally(), 'ok');
await assert.rejects(() => releaseInFinally({ throwError: true }), /fixture/);
assert.equal(manager.inspect().locked, false);
assert.ok(diagnostics.some(entry => entry.phase === 'command-lock-stale-detected'));

const appPath = new URL('../PiXiEEDrawDEV/assets/js/app.js', import.meta.url);
const importPath = new URL('../PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js', import.meta.url);
const switchPath = new URL('../PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js', import.meta.url);
const sheetPath = new URL('../PiXiEEDrawDEV/assets/js/modules/open-project-tab-sheet-actions.js', import.meta.url);
const updatePath = new URL('../PiXiEEDrawDEV/assets/js/modules/update-detection-utils.js', import.meta.url);
const buildPath = new URL('../PiXiEEDrawDEV/assets/js/build-info.js', import.meta.url);
const manifestPath = new URL('../PiXiEEDrawDEV/version.json', import.meta.url);
const app = fs.readFileSync(appPath, 'utf8');
const importer = fs.readFileSync(importPath, 'utf8');
const switcher = fs.readFileSync(switchPath, 'utf8');
const sheet = fs.readFileSync(sheetPath, 'utf8');
const update = fs.readFileSync(updatePath, 'utf8');
const build = fs.readFileSync(buildPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.doesNotMatch(importer, /openProjectTabBusy\s*=/);
assert.doesNotMatch(switcher, /openProjectTabBusy\s*=/);
assert.doesNotMatch(sheet, /setOpenProjectTabBusy/);
assert.match(importer, /acquireProjectCommandLock\(/);
assert.match(importer, /releaseProjectCommandLock\(/);
assert.match(switcher, /activationOwner = 'sheet-switch'/);
assert.match(switcher, /commandOwner = 'sheet-delete'/);
assert.match(sheet, /owner: 'sheet-add'/);
assert.match(app, /ERR_STARTUP_READY_WITH_COMMAND_LOCK/);
assert.match(app, /startupReady/);
assert.match(update, /setStatus\('current-newer', 'manifest-older'\)/);
assert.match(build, new RegExp(`buildId: '${manifest.buildId}'`));

console.log('PiXiEEDraw DEV R2 command lock manager checks passed');
