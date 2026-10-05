import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('globe top is a single viewport tool surface', () => {
  const html = read('globe/index.html');
  assert.match(html, /app-page--tool-globe/);
  assert.match(html, /map-hero__globe-frame/);
  assert.doesNotMatch(html, /<footer\b/);
  assert.doesNotMatch(html, /data-home-works|data-home-stores/);
});

test('camera link from the embedded posting panel leaves the iframe', () => {
  const source = read('js/globe/post-ui.mjs');
  assert.match(source, /href="\/pixel-camera\.html\?from=globe"/);
  assert.match(source, /target="_top"/);
});

test('gallery keeps art and camera tabs and routes personal posts to the profile outside the iframe', () => {
  const source = read('js/globe/post-ui.mjs');
  assert.match(source, /data-tab="art"/);
  assert.match(source, /data-tab="camera"/);
  assert.doesNotMatch(source, /data-tab="mine"/);
  assert.match(source, /href="\/profile\/\?view=posts" target="_top"/);
  assert.match(source, /class="tabs__profile-link"[^>]*>投稿した絵<\/a>/);
  assert.match(source, /data-tab="art" aria-pressed="true"/);
  assert.doesNotMatch(source, /role="tablist"/);
  const css = read('css/globe-prototype.css');
  assert.match(css, /\.tabs__profile-link\s*\{[^}]*flex: 1;[^}]*min-width: 0;[^}]*white-space: nowrap;/);
});

test('viewer only offers deletion when the store explicitly advertises that capability', () => {
  const source = read('js/globe/post-ui.mjs');
  assert.match(source, /store\.canRemove === true \|\| store\.capabilities\?\.remove === true/);
  assert.match(source, /v\.del\.hidden = !isMine\(post\) \|\| !\(/);
  assert.match(source, /typeof store\.remove !== 'function'\) return/);
});

test('camera page owns one shared bottom navigation', () => {
  const html = read('pixel-camera.html');
  assert.equal((html.match(/<nav\b[^>]*class="app-tabs pc-nav"/g) || []).length, 1);
  assert.match(html, /data-nav="five"/);
});

test('globe is operated by gestures, not zoom/rotate buttons', () => {
  const html = read('globe-prototype.html');
  assert.doesNotMatch(html, /globe-controls|id="zoomIn"|id="zoomOut"|id="rotateLeft"|id="rotateRight"|id="resetView"/);
  assert.match(html, /id="gestureHint"/);
  const renderer = read('js/globe/renderer.mjs');
  assert.match(renderer, /function anchorView\(/, 'pinch/wheel zoom keeps the ground under the fingers');
  assert.match(renderer, /onLongPress/);
  assert.doesNotMatch(read('js/globe/prototype.mjs'), /#zoomIn|#rotateLeft|#resetView/);
});

test('stand-alone telescope keeps its time capsule and sky controls', () => {
  const source = read('js/globe/astro-ui.mjs');
  assert.match(source, /class: 'tc-play'/);
  assert.match(source, /function createTimeTape\(/);
  assert.match(source, /function attachScrub\(/, 'the capsule itself scrubs time when dragged');
  assert.match(source, /function orbitMarks\(/, 'Sun and Moon remain available as sky markers on the globe view');
  assert.match(source, /function scopeMarks\(/, 'Sun and Moon remain available as sky markers in the telescope view');
  assert.doesNotMatch(source, /1時間戻す|1時間進める|astro-collapse|astro-seg|scope-panel/);
  assert.doesNotMatch(source, /type: 'range'/, 'no sliders: speed is a switch, magnification is a pinch');
});

test('every control shares one size: 44px buttons, 48px single-line fields', () => {
  const css = read('css/globe-prototype.css');
  assert.match(css, /--control: 44px;/);
  assert.match(css, /--field: 48px;/);
  // No button-like rule may fall back to a hand-picked smaller height.
  const smallHeights = [...css.matchAll(/([^{}]+)\{[^}]*\bheight: (2\d|3\d|4[0-3])px/g)]
    .map((match) => match[1].trim())
    .filter((selector) => /button|chip|close|primary|ghost|danger|tabs|account|place-here|tc-play|tc-now|scope-chip|sky-mark|camera-link|post-fab|input|textarea/.test(selector) && !/icon|__draft|pin|::before|::after|img| i\b/.test(selector));
  assert.deepEqual(smallHeights, []);
});

test('stand-alone telescope retains the Solar System while map callbacks are disabled', () => {
  const renderer = read('js/globe/renderer.mjs');
  assert.match(renderer, /onZoomLimit/);
  const ui = read('js/globe/astro-ui.mjs');
  assert.match(ui, /function zoomLimit\(/);
  assert.match(ui, /function openOrrery\(/);
  assert.match(ui, /function closeOrrery\(/);
  const orrery = read('js/globe/orrery.mjs');
  assert.match(orrery, /onExit\(\)/, 'zooming into the Earth hands back to the globe');
  assert.match(read('js/globe/prototype.mjs'), /onZoomLimit/);
});


test('flat map exposes only posts/events and loads astronomy only for the telescope', () => {
  const html=read('globe-prototype.html'),source=read('js/globe/prototype.mjs');
  assert.match(html,/id="mapLayerSwitch"/);
  assert.match(html,/data-map-content="posts"/);
  assert.match(html,/data-map-content="events"/);
  assert.doesNotMatch(html,/data-astro-view|astroViewSwitch|長押しで空を見る|さらに縮小で太陽系/);
  assert.match(source,/const astronomy = telescopeTool \? await Promise\.all/);
  assert.match(source,/onLongPress: telescopeTool \?/);
  assert.match(source,/onZoomLimit: telescopeTool \?/);
  assert.doesNotMatch(source,/^import .*astro-ui\.mjs|^import .*real-sky\.mjs/m);
});
