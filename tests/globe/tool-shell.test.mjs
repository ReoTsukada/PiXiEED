import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('globe top is a single viewport tool surface', () => {
  const html = read('index.html');
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

test('time capsule keeps play as its only plain button and the sky lives on the view', () => {
  const source = read('js/globe/astro-ui.mjs');
  assert.match(source, /class: 'tc-play'/);
  assert.match(source, /function createTimeTape\(/);
  assert.match(source, /function attachScrub\(/, 'the capsule itself scrubs time when dragged');
  assert.match(source, /function orbitMarks\(/, 'Sun and Moon are labelled on the globe view');
  assert.match(source, /function scopeMarks\(/, 'Sun and Moon are labelled in the telescope view');
  assert.doesNotMatch(source, /1時間戻す|1時間進める|astro-collapse|astro-seg|scope-panel/);
  assert.doesNotMatch(source, /type: 'range'/, 'no sliders: speed is a switch, magnification is a pinch');
});
