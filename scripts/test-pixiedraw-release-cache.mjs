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
assert.match(indexHtml, /assets\/css\/style\.css\?v=20260803-ad-responsive2/);
assert.match(indexHtml, /scripts\/card-feed-ads\.js\?v=20260803-leading-project-ad1/);
assert.match(indexHtml, /startup-workflow-utils\.js\?v=20260803-leading-project-ad1/);
assert.match(indexHtml, /shared-bottom-nav\.js\?v=20260803-details-ad-responsive2/);
assert.match(indexHtml, /controls-mirror\.js\?v=20260803-mobile-window-reset1/);
assert.match(indexHtml, /rail-tool-ui-utils\.js\?v=20260803-mobile-window-reset1/);
for (const moduleName of [
  'timelapse-replay-utils',
  'canvas-core-workflow-utils',
  'canvas-drawing-workflow-utils',
  'canvas-render-workflow-utils',
  'timeline-layers',
  'floating-preview-panel-utils',
  'export-rendering',
]) {
  assert.match(indexHtml, new RegExp(`${moduleName}\\.js\\?v=20260802-layer-transparency-visibility1`));
}
assert.match(indexHtml, /pixisync-operation-codec-utils\.js\?v=20260801-document-payload2/);
for (const moduleName of [
  'timeline-navigation-workflow-utils',
  'pixisync-lazy-cell-sync-utils',
  'pixisync-realtime-client-utils',
  'pixisync-collaboration-controller-utils',
]) {
  assert.match(indexHtml, new RegExp(`${moduleName}\\.js\\?v=20260802-pixisync-lazy-cell1`));
}
for (const moduleName of [
  'pixel-patch-history-utils',
  'palette-panel-utils',
  'pixisync-pixel-mutation-bridge-utils',
]) {
  assert.match(indexHtml, new RegExp(`${moduleName}\\.js\\?v=20260802-pixisync-offscreen-color1`));
}
assert.match(indexHtml, /pixisync-document-operation-utils\.js\?v=20260801-adaptive-output2/);
for (const assetName of [
  'assets\/js\/modules\/pixisync-minimal-ui-utils.js',
]) {
  assert.match(indexHtml, new RegExp(`${assetName}\\?v=20260801-startup-code1`));
}
for (const assetName of [
  'assets\/js\/modules\/open-project-tab-workflow-utils.js',
  'assets\/js\/modules\/open-import-workflow-utils.js',
  'assets\/js\/modules\/document-session-workflow-utils.js',
  'assets\/js\/modules\/pixisync-project-switch-utils.js',
]) {
  assert.match(indexHtml, new RegExp(`${assetName}\\?v=20260802-project-share-scope1`));
}
assert.match(indexHtml, /assets\/js\/modules\/pixisync-runtime-adapter-utils\.js\?v=20260803-pixisync-structure-controls1/);
assert.match(indexHtml, /assets\/js\/app\.js\?v=20260803-pixisync-structure-controls1/);
assert.match(serviceWorker, /fetch\(request, \{ cache: 'no-store' \}\)/);
assert.match(app, /serviceWorker\.register\(swUrl, \{ updateViaCache: 'none' \}\)/);
assert.match(app, /!startupReady && !controllerChangeReloaded && !isProjectCommandLocked\(\)/);
assert.match(app, /const syncPiXiSyncStructureControls = details =>/);
assert.match(app, /syncPiXiSyncStructureControls\(details\)/);

console.log('PiXiEEDraw release cache generation checks passed');
