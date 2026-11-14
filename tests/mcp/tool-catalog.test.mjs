import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { getToolCatalog } from '../../js/mcp/tool-catalog.mjs';
import { TOOL_START_ROUTES } from '../../js/tool-start-routes.mjs';

test('MCP catalog follows real tool routes and exposes only Draw image preparation', async () => {
  const catalog = getToolCatalog();
  assert.deepEqual(catalog.map(tool => tool.id), TOOL_START_ROUTES.map(tool => tool.id));
  assert.deepEqual(catalog.filter(tool => tool.mcpSupport !== 'guide_only').map(tool => tool.id), ['draw']);
  for (const tool of catalog) {
    const route = TOOL_START_ROUTES.find(item => item.id === tool.id);
    await access(new URL(`../../${route.sourcePath}`, import.meta.url));
    assert.equal(tool.url, `https://pixieed.jp${route.startPath}`);
    assert.ok(tool.relatedTools.every(id => catalog.some(item => item.id === id)));
  }
  catalog[0].relatedTools.push('mutated');
  assert.ok(!getToolCatalog()[0].relatedTools.includes('mutated'));
});

test('Worker deployment configuration has no billable bindings or body logging', async () => {
  const config = JSON.parse(await readFile(new URL('../../scripts/mcp/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), ['$schema', 'compatibility_date', 'main', 'name', 'observability', 'workers_dev'].sort());
  assert.equal(config.main, 'worker.mjs');
  assert.equal(config.observability.enabled, false);
});
