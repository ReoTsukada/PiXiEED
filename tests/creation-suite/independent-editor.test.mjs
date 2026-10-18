import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('dedicated routes default to the scoped direct runtime with an explicit retained iframe fallback', () => {
  const shell = read('../../js/tool-shell.mjs');
  const directHost = read('../../js/tool-direct.mjs');
  const runtime = read('../../js/creation/creation-runtime.mjs');
  const modes = read('../../js/creation/creation-modes.mjs');
  assert.match(shell, /params\.get\('runtime'\) !== 'iframe'/);
  assert.match(shell, /if \(directCandidate\)[\s\S]*?installDirectToolShell/);
  assert.match(shell, /await import\('\/js\/tool-embed\.mjs/);
  assert.match(directHost, /await import\('\.\/creation\/creation-runtime\.mjs/);
  assert.match(runtime, /scope\.listen\(window, 'pagehide'/);
  assert.match(runtime, /async activate\(/);
  assert.match(runtime, /suspend\(\)/);
  assert.match(runtime, /dispose\(\)/);
  assert.match(modes, /await import\(`\.\/draw-music\.mjs/);
  for (const mode of ['draw', 'audio']) {
    const page = read(`../../${mode}/index.html`);
    const html = read(`../../${mode === 'draw' ? 'draw/editor.html' : 'audio/editor.html'}`);
    const entry = read(`../../js/creation/${mode}-entry.mjs`);
    assert.match(page, /tool-shell\.mjs/);
    assert.match(html, new RegExp(`/js/creation/${mode}-entry\\.mjs\\?rev=`));
    assert.doesNotMatch(html, /creation-app\.mjs/);
    if (mode === 'draw') assert.match(entry, /await import\('\.\/creation-runtime\.mjs/);
    else assert.match(entry, /await import\('\.\/audio-page\.mjs/);
    assert.doesNotMatch(entry, /popstate|setModeAdapter|creation-app/);
  }
});

test('Audio animation controls sit with music controls and have no push-to-music sync action', () => {
  const html = read('../../audio/editor.html');
  const palette = html.indexOf('id="audio-tracks"');
  const animationControls = html.indexOf('id="audio-animation-controls"');
  const workspace = html.indexOf('class="audio-workspace"');
  assert.ok(workspace < palette && palette < animationControls, 'animation strip follows the music palette inside its controls');
  assert.doesNotMatch(html, /audio-animation-sync|絵を曲に反映/);
});
