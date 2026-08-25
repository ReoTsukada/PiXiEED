import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [html, source, bundle, sell, pxdTest] = await Promise.all([
  read('pixiedraw2/index.html'),
  read('pixiedraw2/src/draw2-entry.ts'),
  read('pixiedraw2/dist/draw2-entry.js'),
  read('market/sell.js'),
  read('pixiedraw2/tests/draw-140/project-pxd.test.ts'),
]);

assert.match(html, /id="draw2ExportToMarket"/);
assert.match(html, /Marketで出品準備/);
assert.match(html, /Local \/ Market handoff/);
assert.match(html, /draw2-entry\.js\?v=20260825-igame-market-handoff-v78/);
assert.match(source, /async function storePxdMarketTransfer\(file: File\)/);
assert.match(source, /pixieed-market-project-transfers/);
assert.match(source, /expiresAt: Date\.now\(\) \+ \(15 \* 60 \* 1000\)/);
assert.match(source, /async function handoffPxdProjectToMarket\(\)/);
assert.match(source, /createPxdProjectArtifact\(\s*exportModule/);
assert.match(source, /url\.searchParams\.set\("project_transfer", transferId\)/);
assert.match(source, /exportToMarket\.addEventListener\("click"/);
assert.match(bundle, /pixieed-market-project-transfers/);
assert.match(bundle, /project_transfer/);
assert.match(sell, /const projectTransferId = pageParams\.get\('project_transfer'\)/);
assert.match(sell, /consumePixieeDrawProjectTransfer/);
assert.match(pxdTest, /integrated PXD v2 contains independent Audio\/Game entries/);
assert.match(pxdTest, /GAME_EDITOR_PERSISTENCE_V1/);
assert.doesNotMatch(source, /market_create_root_asset|market_attach_listing_package/);

console.log('PiXiEEDraw2 iGAME PXD-to-Market handoff contract: OK');
