import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const stylesheet = '/css/project-workspace.css?rev=20261006-header-controls-1';
const workspaceRevision = '20261018-direct-runtime-2';
const consumers = [
  'jigsaw/index.html',
  'spot-difference/index.html',
  'hidden-object/index.html'
];
const source = async file => readFile(new URL(file, root), 'utf8');

test('the three game entries predeclare the workspace stylesheet last', async () => {
  for (const file of consumers) {
    const html = await source(file);
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
    assert.ok(head, `${file} has a head`);
    const links = [...head.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)].map(x => x[0]);
    assert.ok(links.length, `${file} declares stylesheets`);
    assert.match(links.at(-1), new RegExp(`href=["']${stylesheet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`), `${file} declares project workspace CSS after the other styles`);
  }
});

test('public shells without a project workspace mount do not fetch its stylesheet', async () => {
  for (const file of ['draw/index.html', 'camera/index.html', 'audio/index.html', 'pixel-camera-studio.html', 'draw/editor.html', 'audio/editor.html', 'pixel-camera.html']) {
    assert.doesNotMatch(await source(file), /project-workspace\.css/, `${file} is only an entry shell or independent camera studio`);
  }
});

test('workspace reuses a predeclared stylesheet and removes only a stylesheet it created', async () => {
  const js = await source('js/creation/project-workspace.mjs');
  assert.match(js, /let css = \[\.\.\.document\.querySelectorAll\('link\[rel="stylesheet"\]'\)\]\.find\(link => link\.getAttribute\('href'\) === projectWorkspaceCssHref\)/);
  assert.match(js, /const ownsCss = !css/);
  assert.match(js, /if \(ownsCss\) \{ css = node\('link'\); css\.rel = 'stylesheet'; css\.href = projectWorkspaceCssHref; document\.head\.append\(css\); \}/);
  assert.match(js, /if \(ownsCss\) css\?\.remove\(\)/, 'dispose preserves a predeclared shared stylesheet');
});

test('direct workspace imports and modulepreload match the runtime cache manifest', async () => {
  const manifest = JSON.parse(await source('tests/runtime-cache-revisions.json'));
  assert.equal(manifest['js/creation/project-workspace.mjs'], workspaceRevision);
  for (const file of ['js/creation/creation-camera.mjs', 'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/audio-page.mjs', 'js/creation/pxd-ui.mjs']) {
    const js = await source(file);
    if (file === 'js/creation/draw-entry.mjs') {
      assert.match(js, new RegExp(`creation-runtime\\.mjs\\?rev=${manifest['js/creation/creation-runtime.mjs']}`), `${file} boots the shared runtime`);
      assert.match(await source('js/creation/creation-runtime.mjs'), new RegExp(`project-workspace\\.mjs\\?rev=${workspaceRevision}`), 'the shared runtime imports the bumped workspace module URL');
    } else assert.match(js, new RegExp(`project-workspace\\.mjs\\?rev=${workspaceRevision}`), `${file} imports the bumped workspace module URL`);
  }
  assert.match(await source('draw/editor.html'), new RegExp(`project-workspace\\.mjs\\?rev=${workspaceRevision}`));
});
