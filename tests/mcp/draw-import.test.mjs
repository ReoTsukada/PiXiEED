import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStagedDrawImport, createDrawImportController, decodeDrawImportToken,
  DRAW_IMPORT_STAGE_KEY, parseDrawImportJson, readStagedDrawImport,
  saveDrawImportAsNewProject, stageDrawImportToken
} from '../../js/mcp/draw-import.mjs';
import { createPxdProject, decodePxd } from '../../js/creation/pxd-codec.mjs';
import { createMemoryPxdAdapter } from '../../js/creation/pxd-store.mjs';
import { createToolProjectStore } from '../../js/creation/tool-project-store.mjs';
import { readPxdImage, readPxdDrawDocument } from '../../js/creation/pxd-project.mjs';
import { encodePixelArt, normalizePixelArt, pixelArtToRgba } from '../../js/mcp/pixel-art-contract.mjs';

const art = normalizePixelArt({ title: 'Tiny test', width: 2, height: 2, palette: ['#ff0000', '#00ff00'], rows: ['0.', '.1'] });
const revisions = (() => { let n = 0; return () => `mcp-revision-${++n}`; })();

test('MCP import saves exact RGBA pixels as a new Draw PXD without changing an existing project', async () => {
  const adapter = createMemoryPxdAdapter();
  const store = createToolProjectStore('draw', { adapter, idFactory: revisions });
  const existing = await store.save(createPxdProject({ projectId: 'existing-project', revisionId: 'existing-initial', manifest: { title: 'Existing' } }), { expectedRevisionId: null });
  const oldBytes = await (await adapter.listLatest()).find((item) => item.projectId === existing.projectId).bytes;
  const { project, url } = await saveDrawImportAsNewProject(art, { store, now: 1234 });
  const saved = await store.load(project.projectId);
  assert.notEqual(saved.projectId, existing.projectId);
  assert.equal(saved.manifest.title, 'Tiny test');
  assert.equal(saved.manifest.createdAt, 1234);
  assert.deepEqual(saved.manifest.toolProject, { tool: 'draw', schemaVersion: 1 });
  assert.deepEqual(saved.manifest.source, { type: 'chatgpt_mcp_pixel_art', schemaVersion: 1 });
  assert.match(url, /^\/draw\/\?pxd=.*&pxdRevision=.*&pxdImage=main&workspace=1$/);
  const rgba = await readPxdImage(saved, 'main');
  assert.deepEqual([...rgba.rgba], [...pixelArtToRgba(art).data]);
  assert.deepEqual(await readPxdDrawDocument(saved, 'main'), { schemaVersion: 1, width: 2, height: 2, palette: ['#ff0000ff', '#00ff00ff'], pixels: [0, -1, -1, 1] });
  const latest = await adapter.listLatest();
  const oldAfter = latest.find((item) => item.projectId === existing.projectId);
  assert.equal(oldAfter.revisionId, existing.revisionId);
  assert.deepEqual([...oldAfter.bytes], [...oldBytes]);
});

test('failed save does not navigate and can be retried without duplicating a successful project', async () => {
  let calls = 0; let navigations = 0; let fail = true;
  const controller = createDrawImportController({ art, save: async () => {
    calls += 1;
    if (fail) { fail = false; throw new Error('quota'); }
    return { project: { projectId: 'new' }, url: '/draw/?new' };
  }, navigate: () => { navigations += 1; } });
  await assert.rejects(controller.apply(), /quota/);
  assert.equal(navigations, 0);
  await controller.apply();
  await controller.apply();
  assert.equal(calls, 2);
  assert.equal(navigations, 2);
});

test('navigation retry after a successful save reuses the same project', async () => {
  let saves = 0; let navigations = 0;
  const controller = createDrawImportController({ art, save: async () => {
    saves += 1; return { project: { projectId: 'one-project' }, url: '/draw/?pxd=one-project' };
  }, navigate: () => { navigations += 1; if (navigations === 1) throw new Error('navigation failed'); } });
  await assert.rejects(controller.apply(), /navigation failed/);
  await controller.apply();
  assert.equal(saves, 1);
  assert.equal(navigations, 2);
});

test('overlapping apply actions share one save and one navigation', async () => {
  let saves = 0; let navigations = 0;
  const controller = createDrawImportController({ art, save: async () => {
    saves += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { project: { projectId: 'one-project' }, url: '/draw/?pxd=one-project' };
  }, navigate: () => { navigations += 1; } });
  await Promise.all([controller.apply(), controller.apply()]);
  assert.equal(saves, 1);
  assert.equal(navigations, 1);
});

test('saved project round-trips through PXD bytes with exact RGBA content', async () => {
  const adapter = createMemoryPxdAdapter();
  const store = createToolProjectStore('draw', { adapter, idFactory: revisions });
  const { project } = await saveDrawImportAsNewProject(art, { store });
  const record = (await adapter.listLatest()).find((item) => item.projectId === project.projectId);
  const decoded = await decodePxd(record.bytes);
  assert.deepEqual([...(await readPxdImage(decoded, 'main')).rgba], [...pixelArtToRgba(art).data]);
});

test('staging restores only validated short lived payloads and supports removal', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const token = encodePixelArt(art);
  const staged = stageDrawImportToken(storage, token, 1000);
  assert.deepEqual(staged.art, art);
  assert.equal(readStagedDrawImport(storage, 1001).token, token);
  assert.equal(readStagedDrawImport(storage, 1000 + 10 * 60 * 1000 + 1), null);
  assert.throws(() => stageDrawImportToken(null, token, 1000), /一時保存/);
  values.set(DRAW_IMPORT_STAGE_KEY, JSON.stringify({ token: 'not.valid', createdAt: 1000 }));
  assert.equal(readStagedDrawImport(storage, 1001), null);
  clearStagedDrawImport(storage);
  assert.equal(values.has(DRAW_IMPORT_STAGE_KEY), false);
});

test('URL and pasted JSON use the strict pixel art schema', () => {
  const token = encodePixelArt(art);
  assert.deepEqual(decodeDrawImportToken(token).art, art);
  assert.deepEqual(parseDrawImportJson(JSON.stringify(art)).art, art);
  assert.throws(() => decodeDrawImportToken('x'.repeat(10001)));
  assert.throws(() => parseDrawImportJson(JSON.stringify({ ...art, rows: ['0.', '.2'] })));
});
