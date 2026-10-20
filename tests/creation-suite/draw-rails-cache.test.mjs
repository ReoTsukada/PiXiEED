import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

test('Draw rail, editor UI, and direct runtime changes invalidate every parent and editor entry', async () => {
  const root = new URL('../../', import.meta.url);
  const revisions = JSON.parse(await readFile(new URL('tests/runtime-cache-revisions.json', root), 'utf8'));
  const drawSearchRails = new Set([
    'js/creation/animation-controls.mjs', 'js/creation/draw-desktop-ui.mjs', 'js/creation/draw-brush-settings.mjs', 'js/creation/draw-page.mjs',
    'js/creation/draw-entry.mjs', 'js/creation/audio-page.mjs', 'js/creation/audio-entry.mjs',
    'js/creation/creation-runtime.mjs', 'js/tool-direct.mjs', 'js/tool-shell.mjs',
    'css/draw-desktop-ui.css', 'css/draw-color-adjustment-panel.css'
  ]);
  const previousRelease = new Set(['js/creation/draw-desktop-ui.mjs']);
  const cameraWorkEntry = new Set([
    'js/creation/creation-camera.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/engine.mjs', 'js/pixel-lens/entry.mjs',
    'js/creation/creation-modes.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/tool-direct.mjs', 'js/tool-shell.mjs'
  ]);
  const changed = new Set([
    'js/creation/editor-ui.mjs', 'js/creation/draw-page.mjs', 'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
    'js/creation/audio-page.mjs', 'js/creation/audio-entry.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs',
    'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs', 'js/creation/hidden-object-page.mjs',
    'js/creation/jigsaw-page.mjs', 'js/creation/spot-difference-page.mjs', 'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs'
  ]);
  const graph = {
    'js/creation/draw-desktop-ui.mjs': ['js/creation/draw-desktop-layout.mjs', 'css/draw-desktop-ui.css'],
    'js/creation/draw-page.mjs': ['js/creation/draw-desktop-ui.mjs', 'js/creation/draw-brush-settings.mjs', 'js/creation/draw-viewport-overlays.mjs', 'js/creation/animation-controls.mjs', 'js/creation/editor-ui.mjs', 'js/creation/project-workspace.mjs', 'js/creation/pxd-ui.mjs'],
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
    'js/pixel-lens/app.mjs': ['js/creation/pxd-ui.mjs', 'js/pixel-lens/engine.mjs'],
    'js/pixel-lens/entry.mjs': ['js/pixel-lens/app.mjs'],
    'js/tool-direct.mjs': ['js/creation/creation-runtime.mjs'],
    'js/tool-shell.mjs': ['js/tool-direct.mjs'],
    'draw/index.html': ['js/tool-shell.mjs'],
    'camera/index.html': ['js/tool-shell.mjs'],
    'audio/index.html': ['js/tool-shell.mjs'],
    'draw/editor.html': ['js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/project-workspace.mjs', 'css/creation-animation.css', 'css/draw-color-adjustment-panel.css'],
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
      if (target === 'js/tool-shell.mjs') assert.equal(revisions[target], '20261019-purpose-entry-1', 'entry copy changes invalidate the shell');
      else if (drawSearchRails.has(target)) assert.equal(revisions[target], '20261019-draw-search-rail-1', `${target} invalidates the Draw control and search guidance release`);
      else if (cameraWorkEntry.has(target)) assert.equal(revisions[target], '20261019-camera-original-color-1', `${target} invalidates the explicit camera entry release`);
      else if (changed.has(target)) assert.equal(revisions[target], '20261018-direct-runtime-2', `${target} carries the direct runtime release revision`);
      if (previousRelease.has(target) && !drawSearchRails.has(target)) assert.equal(revisions[target], '20261018-direct-runtime-1', `${target} keeps the previous release revision`);
      for (const value of urls) assert.equal(new URL(value, `https://local.invalid/${owner}`).searchParams.get('rev'), revisions[target], `${owner} invalidates ${target}`);
    }
  }
});
