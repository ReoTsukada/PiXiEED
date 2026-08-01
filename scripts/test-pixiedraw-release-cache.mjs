import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [buildInfo, versionJson, indexHtml, serviceWorker, app] = await Promise.all([
  readFile(new URL('../pixiedraw/assets/js/build-info.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/version.json', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/service-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
]);

const buildId = /buildId:\s*'([^']+)'/.exec(buildInfo)?.[1] || '';
const release = JSON.parse(versionJson);

assert.match(buildId, /^\d{8}-\d+$/, 'build-info must publish a cache-safe build id');
assert.equal(release.buildId, buildId, 'version.json must advertise the same deployed build');
assert.match(indexHtml, new RegExp(`build-info\\.js\\?v=${buildId}`));
assert.match(serviceWorker, new RegExp(`build-info\\.js\\?v=${buildId}`));
assert.match(indexHtml, /pixisync-operation-codec-utils\.js\?v=20260801-document-payload2/);
for (const moduleName of [
  'pixel-patch-history-utils',
  'pixisync-realtime-client-utils',
  'pixisync-pixel-mutation-bridge-utils',
  'pixisync-collaboration-controller-utils',
  'pixisync-runtime-adapter-utils',
]) {
  assert.match(indexHtml, new RegExp(`${moduleName}\\.js\\?v=20260801-sync-convergence1`));
}
assert.match(indexHtml, /pixisync-document-operation-utils\.js\?v=20260801-adaptive-output2/);
assert.match(indexHtml, /app\.js\?v=20260801-sync-convergence1/);
assert.match(serviceWorker, /fetch\(request, \{ cache: 'no-store' \}\)/);
assert.match(app, /serviceWorker\.register\(swUrl, \{ updateViaCache: 'none' \}\)/);
assert.match(app, /!startupReady && !controllerChangeReloaded && !isProjectCommandLocked\(\)/);

console.log('PiXiEEDraw release cache generation checks passed');
