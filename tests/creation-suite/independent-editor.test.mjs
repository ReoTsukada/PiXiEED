import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Draw and Audio pages mount their own factories without shared mode switching', () => {
  for (const mode of ['draw', 'audio']) {
    const html = read(`../../${mode}/index.html`);
    const entry = read(`../../js/creation/${mode}-entry.mjs`);
    assert.match(html, new RegExp(`/js/creation/${mode}-entry\\.mjs\\?rev=`));
    assert.doesNotMatch(html, /creation-app\.mjs/);
    assert.match(entry, new RegExp(`mount${mode === 'draw' ? 'Draw' : 'Audio'}Mode`));
    assert.match(entry, /scope\.listen\(window, 'pagehide'/);
    assert.doesNotMatch(entry, /popstate|setModeAdapter|creation-app/);
  }
});

test('Audio animation controls sit with music controls and have no push-to-music sync action', () => {
  const html = read('../../audio/index.html');
  const palette = html.indexOf('id="audio-tracks"');
  const animationControls = html.indexOf('id="audio-animation-controls"');
  const workspace = html.indexOf('class="audio-workspace"');
  assert.ok(workspace < palette && palette < animationControls, 'animation strip follows the music palette inside its controls');
  assert.doesNotMatch(html, /audio-animation-sync|絵を曲に反映/);
});
