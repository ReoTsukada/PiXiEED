import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

test('Draw rail and shared animation changes invalidate every runtime parent and editor entry', async () => {
  const root = new URL('../../', import.meta.url);
  const revisions = JSON.parse(await readFile(new URL('tests/runtime-cache-revisions.json', root), 'utf8'));
  const graph = {
    'js/creation/draw-desktop-ui.mjs': ['js/creation/draw-desktop-layout.mjs', 'css/draw-desktop-ui.css'],
    'js/creation/draw-page.mjs': ['js/creation/draw-desktop-ui.mjs', 'js/creation/draw-viewport-overlays.mjs', 'js/creation/animation-controls.mjs'],
    'js/creation/draw-entry.mjs': ['js/creation/draw-page.mjs'],
    'js/creation/audio-page.mjs': ['js/creation/animation-controls.mjs'],
    'js/creation/audio-entry.mjs': ['js/creation/audio-page.mjs'],
    'draw/editor.html': ['js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'css/creation-animation.css'],
    'audio/editor.html': ['js/creation/audio-entry.mjs', 'css/creation-animation.css']
  };
  for (const [owner, targets] of Object.entries(graph)) {
    const source = await readFile(new URL(owner, root), 'utf8');
    const references = [...source.matchAll(/["'`]([^"'`\s]+\.(?:mjs|css)(?:\?[^"'`\s]*)?)["'`]/g)].map(match => match[1]);
    for (const target of targets) {
      const urls = references.filter(value => {
        const path = value.split('?')[0];
        return (path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(owner), path))) === target;
      });
      assert.ok(urls.length, `${owner} references ${target}`);
      assert.equal(revisions[target], '20261017-layer-minimum-1', `${target} has a release revision`);
      for (const value of urls) assert.equal(new URL(value, `https://local.invalid/${owner}`).searchParams.get('rev'), revisions[target], `${owner} invalidates ${target}`);
    }
  }
});
