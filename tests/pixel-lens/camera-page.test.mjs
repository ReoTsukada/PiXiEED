import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('camera is driven by gestures: no flip button, dither stays on screen, hold for GIF', () => {
  const html = read('pixel-camera.html');
  assert.doesNotMatch(html, /id="flipCamera"/);
  assert.match(html, /id="ditherToggle"[^>]*aria-pressed/);
  assert.match(html, /id="gifRec"/);
  const app = read('js/pixel-lens/app.mjs');
  assert.match(app, /onSwipe/);
  assert.match(app, /function startGif\(/);
});
