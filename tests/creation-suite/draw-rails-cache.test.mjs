import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

test('Draw rail, editor UI, and direct runtime changes invalidate every parent and editor entry', async () => {
  const root = new URL('../../', import.meta.url);
  const revisions = JSON.parse(await readFile(new URL('tests/runtime-cache-revisions.json', root), 'utf8'));
  const previousRelease = new Set(['js/creation/draw-desktop-ui.mjs']);
  const changed = new Set([
    'js/creation/editor-ui.mjs', 'js/creation/draw-page.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/creation/audio-page.mjs', 'js/creation/audio-entry.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs',
    'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs', 'js/creation/hidden-object-page.mjs',
    'js/creation/jigsaw-page.mjs', 'js/creation/spot-difference-page.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs'
  ]);
  const graph = {
    'js/creation/draw-desktop-ui.mjs': ['js/creation/draw-desktop-layout.mjs', 'css/draw-desktop-ui.css'],
    'js/creation/draw-page.mjs': ['js/creation/draw-desktop-ui.mjs', 'js/creation/draw-viewport-overlays.mjs', 'js/creation/animation-controls.mjs', 'js/creation/editor-ui.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs'],
    'js/creation/creation-runtime.mjs': ['js/creation/draw-page.mjs', 'js/creation/project-workspace.mjs', 'js/creation/creation-modes.mjs'],
    'js/creation/draw-entry.mjs': ['js/creation/draw-page.mjs', 'js/creation/creation-runtime.mjs'],
    'js/creation/audio-page.mjs': ['js/creation/animation-controls.mjs', 'js/creation/editor-ui.mjs', 'js/creation/project-workspace.mjs'],
    'js/creation/audio-entry.mjs': ['js/creation/audio-page.mjs'],
    'js/creation/pxd-ui.mjs': ['js/creation/project-workspace.mjs'],
    'js/creation/creation-camera.mjs': ['js/creation/project-workspace.mjs', 'js/pixel-lens/app.mjs'],
    'js/creation/creation-modes.mjs': ['js/creation/creation-camera.mjs'],
    'js/creation/hidden-object-page.mjs': ['js/creation/pxd-ui.mjs'],
    'js/creation/jigsaw-page.mjs': ['js/creation/pxd-ui.mjs'],
    'js/creation/spot-difference-page.mjs': ['js/creation/pxd-ui.mjs'],
    'js/pixel-lens/app.mjs': ['js/creation/pxd-ui.mjs'],
    'js/pixel-lens/entry.mjs': ['js/pixel-lens/app.mjs'],
    'draw/editor.html': ['js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/project-workspace.mjs', 'css/creation-animation.css'],
    'audio/editor.html': ['js/creation/audio-entry.mjs', 'css/creation-animation.css'],
    'hidden-object/index.html': ['js/creation/hidden-object-page.mjs'],
    'jigsaw/index.html': ['js/creation/jigsaw-page.mjs'],
    'spot-difference/index.html': ['js/creation/spot-difference-page.mjs'],
    'pixel-camera.html': ['js/pixel-lens/entry.mjs']
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
      assert.ok(revisions[target], `${target} has a release revision`);
      if (changed.has(target)) assert.equal(revisions[target], '20261018-direct-runtime-2', `${target} carries the direct runtime release revision`);
      if (previousRelease.has(target)) assert.equal(revisions[target], '20261018-direct-runtime-1', `${target} keeps the previous release revision`);
      for (const value of urls) assert.equal(new URL(value, `https://local.invalid/${owner}`).searchParams.get('rev'), revisions[target], `${owner} invalidates ${target}`);
    }
  }
});
