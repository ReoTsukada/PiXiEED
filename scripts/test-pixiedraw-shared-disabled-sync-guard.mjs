import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

for (const appRoot of ['pixiedraw', 'PiXiEEDrawDEV']) {
  const app = read(`${appRoot}/assets/js/app.js`);
  const html = read(`${appRoot}/index.html`);
  const buildInfo = read(`${appRoot}/assets/js/build-info.js`);
  const version = JSON.parse(read(`${appRoot}/version.json`));

  assert.match(app, /const SHARED_PROJECTS_ENABLED = false;/);
  assert.match(
    app,
    /function getMaxSharedProjectCount\(\.\.\.args\) \{\s*const resolveLimit = pixieedSupportBenefitUtilsModule\.getMaxSharedProjectCount;\s*if \(typeof resolveLimit !== 'function'\) \{\s*return Math\.max\(1, Number\(SHARED_PROJECT_LIMIT_DEFAULT\) \|\| 1\);/,
    `${appRoot} must tolerate an older cached support-benefit module`
  );
  assert.match(
    app,
    /async function ensureSharedRecentProjectsAccountSynced\(\.\.\.args\) \{\s*if \(!SHARED_PROJECTS_ENABLED\) \{\s*return \[\];\s*\}\s*return recentProjectWorkflowUtilsModule\.ensureSharedRecentProjectsAccountSynced/,
    `${appRoot} must skip recovery-triggered account sync while shared projects are disabled`
  );
  assert.match(
    app,
    /async function syncSharedRecentProjectsFromAccount\(\.\.\.args\) \{\s*if \(!SHARED_PROJECTS_ENABLED\) \{\s*return \[\];\s*\}\s*return await sharedProjectWorkflowUtilsModule\.syncSharedRecentProjectsFromAccount/,
    `${appRoot} must skip direct account sync while shared projects are disabled`
  );
  assert.match(html, /pixieed-support-benefit-utils\.js\?v=20260717-shared-sync-guard1/);
  assert.match(html, /build-info\.js\?v=20260717-100/);
  assert.match(html, /app\.js\?v=20260717-100/);
  assert.match(buildInfo, /buildId: '20260717-100'/);
  assert.equal(version.buildId, '20260717-100');
}

console.log('PiXiEEDraw shared-project disabled sync guards passed.');
