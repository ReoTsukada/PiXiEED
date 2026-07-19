import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const modulePath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/update-detection-utils.js');
const appPath = path.join(root, 'PiXiEEDrawDEV/assets/js/app.js');
const swPath = path.join(root, 'PiXiEEDrawDEV/service-worker.js');
const manifestPath = path.join(root, 'PiXiEEDrawDEV/version.json');
const buildInfoPath = path.join(root, 'PiXiEEDrawDEV/assets/js/build-info.js');

const listeners = new Map();
const documentStub = {
  getElementById() { return null; },
};
globalThis.document = documentStub;
globalThis.window = {
  PiXiEEDrawModules: {},
  location: { href: 'https://example.test/PiXiEEDrawDEV/' },
  navigator: { onLine: true },
  setTimeout,
  clearTimeout,
  setInterval() { return 0; },
  addEventListener(type, listener) { listeners.set(type, listener); },
};

vm.runInThisContext(fs.readFileSync(modulePath, 'utf8'), { filename: modulePath });
const utils = window.PiXiEEDrawModules.updateDetectionUtils;
assert.ok(utils);

const baseManifest = {
  schemaVersion: 1,
  edition: 'dev',
  version: '0.9.0-dev.1',
  buildId: '20260712-001',
  releasedAt: '2026-07-12T00:00:00+09:00',
  minimumCompatibleVersion: '0.9.0-dev.1',
};
const current = { edition: 'dev', version: '0.9.0-dev.1', buildId: '20260712-001' };

assert.deepEqual(utils.validateVersionManifest(baseManifest), baseManifest);
assert.equal(utils.validateVersionManifest({ ...baseManifest, version: 'invalid' }), null);
assert.equal(utils.compareSemver('1.2.3', '1.2.2'), 1);
assert.equal(utils.compareSemver('1.2.3-dev.2', '1.2.3-dev.10'), -1);
assert.equal(utils.compareSemver('1.2.3', '1.2.3-dev.10'), 1);
assert.equal(utils.compareBuildId('20260712-010', '20260712-002'), 1);

function createResponse(manifest, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => manifest };
}

function createHarness({ fetchImpl, online = true, protocol = 'https:' } = {}) {
  const notices = new Map();
  const fakeDocument = {
    getElementById(id) {
      if (!notices.has(id)) notices.set(id, { hidden: true, textContent: '', addEventListener() {} });
      return notices.get(id);
    },
  };
  const fakeWindow = {
    location: { protocol },
    navigator: { onLine: online },
    setTimeout,
    clearTimeout,
    setInterval() { return 0; },
    addEventListener() {},
    sessionStorage: { getItem() { return ''; }, setItem() {} },
  };
  const detector = utils.createUpdateDetector({
    manifestUrl: 'https://example.test/PiXiEEDrawDEV/version.json',
    getBuildInfo: () => current,
    fetchImpl,
    documentRef: fakeDocument,
    windowRef: fakeWindow,
    now: () => 1000,
  });
  detector.__testNotices = notices;
  return detector;
}

let detector = createHarness({ fetchImpl: async () => createResponse(baseManifest) });
let status = await detector.check({ force: true });
assert.equal(status.status, 'up-to-date');

detector = createHarness({ fetchImpl: async () => createResponse({ ...baseManifest, version: '0.9.1-dev.1', buildId: '20260713-001' }) });
status = await detector.check({ force: true });
assert.equal(status.status, 'update-available');
assert.equal(detector.__testNotices.get('versionUpdateNotice').hidden, false);
detector.dismiss();
assert.equal(detector.__testNotices.get('versionUpdateNotice').hidden, true);

detector = createHarness({ fetchImpl: async () => createResponse({ ...baseManifest, buildId: '20260712-002' }) });
status = await detector.check({ force: true });
assert.equal(status.status, 'update-available');

detector = createHarness({ fetchImpl: async () => createResponse({ ...baseManifest, edition: 'product' }) });
status = await detector.check({ force: true });
assert.equal(status.status, 'incompatible');

detector = createHarness({ fetchImpl: async () => createResponse({ ...baseManifest, minimumCompatibleVersion: '1.0.0' }) });
status = await detector.check({ force: true });
assert.equal(status.status, 'incompatible');

detector = createHarness({ fetchImpl: async () => { throw new Error('malformed-json'); } });
status = await detector.check({ force: true });
assert.equal(status.status, 'failed');

detector = createHarness({ fetchImpl: async () => createResponse({}, 404) });
status = await detector.check({ force: true });
assert.equal(status.status, 'failed');

detector = createHarness({ fetchImpl: async () => createResponse({}, 500) });
status = await detector.check({ force: true });
assert.equal(status.status, 'failed');

detector = createHarness({ fetchImpl: async () => createResponse({}) });
status = await detector.check({ force: true });
assert.equal(status.status, 'failed');

detector = createHarness({ fetchImpl: async () => {
  const error = new Error('aborted');
  error.name = 'AbortError';
  throw error;
} });
status = await detector.check({ force: true });
assert.equal(status.status, 'failed');
assert.equal(status.reason, 'aborted');

const timeoutWindow = {
  navigator: { onLine: true },
  setTimeout(callback) { callback(); return 0; },
  clearTimeout() {},
  setInterval() { return 0; },
  addEventListener() {},
  sessionStorage: { getItem() { return ''; }, setItem() {} },
};
detector = utils.createUpdateDetector({
  getBuildInfo: () => current,
  fetchImpl: async (_url, options) => {
    assert.equal(options.signal.aborted, true);
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  },
  documentRef: { getElementById() { return null; } },
  windowRef: timeoutWindow,
  now: () => 1000,
});
status = await detector.check({ force: true });
assert.equal(status.status, 'failed');
assert.equal(status.reason, 'timeout');

detector = createHarness({ fetchImpl: async () => createResponse(baseManifest), online: false });
status = await detector.check({ force: true });
assert.equal(status.status, 'offline');

let fileFetchCount = 0;
detector = createHarness({
  protocol: 'file:',
  fetchImpl: async () => { fileFetchCount += 1; return createResponse(baseManifest); },
});
status = await detector.check({ force: true });
assert.equal(status.status, 'unavailable');
assert.equal(status.reason, 'unsupported-protocol');
assert.equal(fileFetchCount, 0, 'file:// must not fetch version.json');

let fetchCount = 0;
let resolveFetch;
const pendingFetch = new Promise(resolve => { resolveFetch = resolve; });
detector = createHarness({ fetchImpl: async () => { fetchCount += 1; return await pendingFetch; } });
const first = detector.check({ force: true });
const second = detector.check({ force: true });
resolveFetch(createResponse(baseManifest));
await Promise.all([first, second]);
assert.equal(fetchCount, 1, 'concurrent checks share one manifest request');

const source = fs.readFileSync(modulePath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const worker = fs.readFileSync(swPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const buildInfo = fs.readFileSync(buildInfoPath, 'utf8');
assert.match(source, /cache: 'no-store'/);
assert.match(source, /UPDATE_FETCH_TIMEOUT_MS/);
assert.match(source, /versionUpdateNotice/);
assert.match(source, /new windowRef\.BroadcastChannel\('pixieedraw-update-u2'\)/);
assert.match(buildInfo, /__PIXIEEDRAW_BUILD_INFO__/);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.edition, 'dev');
assert.match(worker, /url\.pathname\.endsWith\('\/version\.json'\)/,
  'the update manifest is network-first even when a service worker is active');
assert.doesNotMatch(worker, /skipWaiting\s*\(/);
assert.doesNotMatch(worker, /clients\.claim\s*\(/);
assert.doesNotMatch(app.slice(app.indexOf('function registerPwaServiceWorker'), app.indexOf('function resumeSharedProjectLocalOpsAfterConnectivityChange')), /scheduleAppReload\('pwa-controllerchange'\)/);

console.log('PiXiEEDraw DEV Phase U2 update detection checks passed');
