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
