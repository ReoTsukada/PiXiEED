import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [app, startup, sell, packageUtils, css] = await Promise.all([
  read('pixiedraw/assets/js/app.js'),
  read('pixiedraw/assets/js/modules/startup-workflow-utils.js'),
  read('market/sell.js'),
  read('market/listing-package-utils.js'),
  read('market/market.css'),
]);

assert.match(app, /async function exportProjectToMarket\(\)/);
assert.match(app, /serializeProjectStorageSnapshot\(\{ snapshot, session, packaged, thumbnail \}/);
assert.match(app, /pixieed-market-project-transfers/);
assert.match(app, /url\.searchParams\.set\('project_transfer', transferId\)/);
assert.match(startup, /async function openRecentProjectMarket\(entry, actionButton\)/);
assert.match(startup, /await exportProjectToMarket\(\)/);
assert.match(sell, /const projectTransferId = pageParams\.get\('project_transfer'\)/);
assert.match(sell, /async function consumePixieeDrawProjectTransfer\(\)/);
assert.match(sell, /sourceFiles\.delete\(entry\.path\)/);
assert.match(packageUtils, /async function extractPixieeDrawPreviewPng\(file\)/);
assert.match(packageUtils, /previewThumbnail/);
assert.match(css, /\.market-file-row__remove/);

console.log('PiXiEEDraw market PXD transfer and per-file removal guards passed.');
