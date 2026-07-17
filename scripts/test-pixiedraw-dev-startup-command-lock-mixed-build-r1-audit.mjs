import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const devRoot = path.join(root, 'PiXiEEDrawDEV');
const updateModulePath = path.join(devRoot, 'assets/js/modules/update-detection-utils.js');
const buildInfoPath = path.join(devRoot, 'assets/js/build-info.js');
const manifestPath = path.join(devRoot, 'version.json');
const serviceWorkerPath = path.join(devRoot, 'service-worker.js');
const appPath = path.join(devRoot, 'assets/js/app.js');
const importWorkflowPath = path.join(devRoot, 'assets/js/modules/open-import-workflow-utils.js');
const tabWorkflowPath = path.join(devRoot, 'assets/js/modules/open-project-tab-workflow-utils.js');
const startupWorkflowPath = path.join(devRoot, 'assets/js/modules/startup-workflow-utils.js');
const recentWorkflowPath = path.join(devRoot, 'assets/js/modules/recent-project-workflow-utils.js');
const indexPath = path.join(devRoot, 'index.html');

const updateContext = {
  AbortController,
  URL,
  console: { info() {}, warn() {} },
  window: {
    PiXiEEDrawModules: {},
    location: { href: 'https://example.test/PiXiEEDrawDEV/' },
    navigator: { onLine: true },
    setTimeout,
    clearTimeout,
    setInterval() { return 0; },
    addEventListener() {},
  },
  document: { getElementById() { return null; } },
};
vm.createContext(updateContext);
vm.runInContext(fs.readFileSync(updateModulePath, 'utf8'), updateContext, { filename: updateModulePath });
const updateUtils = updateContext.window.PiXiEEDrawModules.updateDetectionUtils;
assert.ok(updateUtils, 'update detection utilities must load');

function createResponse(manifest) {
  return { ok: true, status: 200, json: async () => manifest };
}

function createDetector(current, manifest) {
  return updateUtils.createUpdateDetector({
    manifestUrl: 'https://example.test/PiXiEEDrawDEV/version.json',
    getBuildInfo: () => current,
    fetchImpl: async () => createResponse(manifest),
    documentRef: { getElementById() { return null; } },
    windowRef: {
      navigator: { onLine: true },
      setTimeout,
      clearTimeout,
      setInterval() { return 0; },
      addEventListener() {},
      sessionStorage: { getItem() { return ''; }, setItem() {} },
    },
    now: () => 1,
  });
}

const baseManifest = {
  schemaVersion: 1,
  edition: 'dev',
  version: '0.9.0-dev.1',
  buildId: '20260712-001',
  releasedAt: '2026-07-12T00:00:00+09:00',
  minimumCompatibleVersion: '0.9.0-dev.1',
};
const current001 = { edition: 'dev', version: '0.9.0-dev.1', buildId: '20260712-001' };
const current002 = { edition: 'dev', version: '0.9.0-dev.1', buildId: '20260712-002' };

assert.equal(updateUtils.compareBuildId('20260712-002', '20260712-001'), 1);
assert.equal(updateUtils.compareBuildId('20260712-001', '20260712-002'), -1);
assert.equal(updateUtils.compareBuildId('20260712-002', '20260712-002'), 0);

let status = await createDetector(current001, baseManifest).check({ force: true });
assert.equal(status.status, 'up-to-date');
assert.equal(status.reason, 'same-build');

status = await createDetector(current001, { ...baseManifest, buildId: '20260712-002' }).check({ force: true });
assert.equal(status.status, 'update-available');
assert.equal(status.reason, 'newer-build');

status = await createDetector(current002, baseManifest).check({ force: true });
assert.equal(status.status, 'current-newer');
assert.equal(status.reason, 'manifest-older');

status = await createDetector(current001, { ...baseManifest, buildId: '' }).check({ force: true });
assert.equal(status.status, 'failed', 'invalid manifests must not create an update action');

const buildInfo = fs.readFileSync(buildInfoPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.match(buildInfo, new RegExp(`buildId: '${manifest.buildId}'`), 'R2 keeps the deployed manifest aligned with the running build identity');

const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
assert.doesNotMatch(serviceWorker, /skipWaiting\s*\(/);
assert.doesNotMatch(serviceWorker, /clients\.claim\s*\(/);
assert.match(serviceWorker, /url\.pathname\.endsWith\('\/version\.json'\)/);
assert.match(serviceWorker, /fetch\(request\)/, 'version.json is network-first while online');

const app = fs.readFileSync(appPath, 'utf8');
const importWorkflow = fs.readFileSync(importWorkflowPath, 'utf8');
const tabWorkflow = fs.readFileSync(tabWorkflowPath, 'utf8');
const startupWorkflow = fs.readFileSync(startupWorkflowPath, 'utf8');
const recentWorkflow = fs.readFileSync(recentWorkflowPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

assert.match(app, /function isProjectCommandLocked\(\)/);
assert.match(app, /commandLocked: commandLock\.locked/);
assert.match(app, /lockOwner: commandLock\.owner/);
assert.match(importWorkflow, /acquireProjectCommandLock\(/);
assert.match(importWorkflow, /releaseProjectCommandLock\(/);
assert.match(tabWorkflow, /const guardedProjectTabIds = new Set\(\)/);
assert.match(tabWorkflow, /for \(const projectTabId of guardedProjectTabIds\)/);
assert.match(tabWorkflow, /acquireProjectCommandLock\(\{ owner: activationOwner, command: 'activate-project-sheet' \}\)/);
assert.match(tabWorkflow, /acquireProjectCommandLock\(\{ owner: commandOwner, command: 'remove-project-sheet' \}\)/);
assert.match(tabWorkflow, /releaseProjectCommandLock\(\{ token: lock\.token, owner: lock\.owner \}\)/);
assert.match(startupWorkflow, /function setupStartupScreen\(\)/);
assert.match(startupWorkflow, /function setupProjectHomeScreen\(\)/);
assert.match(startupWorkflow, /refreshRecentProjectsUI\(\)\.catch/);
assert.match(recentWorkflow, /async function refreshRecentProjectsUI\(options = \{\}\)/);
assert.match(app, /setupStartupScreen\(\);\s*setupProjectHomeScreen\(\);/);

const scriptVersions = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
assert.ok(scriptVersions.some(value => /build-info\.js\?v=20260717-100/.test(value)));
assert.ok(scriptVersions.some(value => /update-detection-utils\.js\?v=20260713-026/.test(value)));
assert.ok(scriptVersions.some(value => /open-import-workflow-utils\.js\?v=20260717-market-all-open1/.test(value)));

console.log('PiXiEEDraw DEV R1 startup / command-lock / mixed-build audit checks passed');
