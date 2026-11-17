import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { getToolCatalog } from '../../js/mcp/tool-catalog.mjs';
import { TOOL_START_ROUTES } from '../../js/tool-start-routes.mjs';

test('MCP catalog follows real tool routes and exposes declared supported operations', async () => {
  const catalog = getToolCatalog();
  assert.deepEqual(catalog.map(tool => tool.id), TOOL_START_ROUTES.map(tool => tool.id));
  assert.deepEqual(catalog.filter(tool => tool.mcpSupport !== 'guide_only').map(tool => tool.id), ['draw']);
  const draw = catalog.find(tool => tool.id === 'draw');
  assert.equal(draw.mcpSupport, 'pixel_art_preview_and_live_draw');
  assert.match(draw.description, /プレビュー.*新規作品/);
  assert.match(draw.description, /明示接続した開いている作品.*直接編集/);
  for (const tool of catalog) {
    const route = TOOL_START_ROUTES.find(item => item.id === tool.id);
    await access(new URL(`../../${route.sourcePath}`, import.meta.url));
    assert.equal(tool.url, `https://pixieed.jp${route.startPath}`);
    assert.ok(tool.relatedTools.every(id => catalog.some(item => item.id === id)));
  }
  catalog[0].relatedTools.push('mutated');
  assert.ok(!getToolCatalog()[0].relatedTools.includes('mutated'));
});

test('Worker deployment config isolates public OAuth with free KV and existing SQLite bindings without observability', async () => {
  const config = JSON.parse(await readFile(new URL('../../scripts/mcp/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.main, 'store-worker.mjs');
  assert.equal(config.observability.enabled, false);
  assert.deepEqual(config.durable_objects.bindings, [
    { name: 'DRAW_SESSIONS', class_name: 'DrawSessionDO' },
    { name: 'DRAW_ADMISSION', class_name: 'DrawAdmissionDO' }
  ]);
  assert.deepEqual(config.migrations, [
    { tag: 'v1-draw-sessions', new_sqlite_classes: ['DrawSessionDO'] },
    { tag: 'v2-draw-admission', new_sqlite_classes: ['DrawAdmissionDO'] }
  ]);
  assert.deepEqual(Object.keys(config.vars), ['OPENAI_APPS_CHALLENGE']);
  assert.match(config.vars.OPENAI_APPS_CHALLENGE, /^[A-Za-z0-9._-]{1,512}$/);
  assert.deepEqual(config.kv_namespaces.map(item => item.binding), ['OAUTH_KV']);
  assert.match(config.kv_namespaces[0].id, /^[a-f0-9]{32}$/);
  assert.deepEqual(config.compatibility_flags, ['global_fetch_strictly_public']);
  assert.equal(config.r2_buckets, undefined);
});
