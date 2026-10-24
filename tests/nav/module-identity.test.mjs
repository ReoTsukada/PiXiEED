import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { posix } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const canonical = new Map([
  ['js/app.js', 'rev=20261024-common-tool-start-1'],
  ['js/site-header.mjs', 'rev=20261024-common-tool-start-1'],
  ['js/creation/output-page.mjs', 'rev=20261024-common-tool-start-1'],
  ['js/creation/project-workspace.mjs', 'rev=20261024-common-tool-start-1'],
  ['js/creation/pxd-ui.mjs', 'rev=20261024-common-tool-start-1'],
  ['js/tool-offerwall-entry.mjs', 'rev=20261024-common-tool-start-1'],
  ['js/tool-start-routes.mjs', 'rev=20261024-common-tool-start-1'],
  ['js/page-navigation.mjs', 'rev=20261024-common-tool-start-1'],
  ['js/display-ads.mjs', 'rev=20261024-public-layout-1'],
  ['js/tool-header-controls.mjs', 'rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1'],
  ['js/creation/draw-core.mjs', 'rev=20261011-tool-size-1'],
  ['js/creation/drawing-tool-icons.mjs', 'rev=20261004-canvas-settings-1'],
  ['js/pixel-png-metadata.mjs', 'rev=20260928-pixel-roundtrip-1'],
  ['js/creation/audio-timbres.mjs', 'rev=20261005-audio-drums-1'],
  ['js/creation/jigsaw-file.mjs', 'rev=20260929-claude-integration-1'],
]);
const templates = new Set(['scripts/generate-books-catalog.mjs', 'scripts/generate-event-pages.mjs']);
const skippedDirectories = new Set(['.git', '.agents', '.codex', 'assets', 'docs', 'tests', 'work', 'vendor', 'node_modules']);

async function sourceFiles(directory = '', result = []) {
  for (const entry of await readdir(new URL(directory ? `${directory}/` : './', root), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory() && skippedDirectories.has(entry.name) && path !== 'output/work') continue;
    if (entry.isDirectory()) await sourceFiles(path, result);
    else if (entry.isFile() && (path.endsWith('.html') || path.startsWith('js/') && /\.(?:js|mjs)$/.test(path) || templates.has(path))) result.push(path);
  }
  return result;
}

function references(source) {
  return [...source.matchAll(/["'`]([^"'`\s<>]+\.(?:mjs|js)(?:\?[^"'`\s<>]*)?)["'`]/g)].map(match => match[1]);
}

function targetFor(owner, value) {
  const path = value.split('?')[0];
  if (path.includes('://') || !path.startsWith('.') && !path.startsWith('/')) return null;
  return posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(owner), path));
}

test('all production and generated-template references use one URL per shared module', async () => {
  const names = (await sourceFiles()).sort();
  assert.ok(names.includes('output/work/index.html'), 'The public export workspace is part of the production URL contract.');
  const counts = new Map([...canonical.keys()].map(path => [path, 0]));
  for (const owner of names) {
    const source = await readFile(new URL(owner, root), 'utf8');
    for (const value of references(source)) {
      const target = targetFor(owner, value);
      if (!canonical.has(target)) continue;
      const query = value.split('?')[1] || '';
      if (query.includes('attempt=')) continue;
      counts.set(target, counts.get(target) + 1);
      assert.equal(query, canonical.get(target), `${owner} must use the canonical URL for ${target}`);
    }
  }
  for (const [target, count] of counts) assert.ok(count > 0, `production source references ${target}`);
});

test('URL normalization skips module bodies and remains idempotent', async () => {
  for (const target of canonical.keys()) {
    const source = await readFile(new URL(target, root), 'utf8');
    assert.doesNotMatch(source, /import\.meta\.url/, `${target} must not derive assets from its module URL`);
  }
  const script = new URL('scripts/performance-normalize-module-urls.mjs', root);
  const result = spawnSync(process.execPath, [script.pathname, '--check'], { cwd: new URL('.', root), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
