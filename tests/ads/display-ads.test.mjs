import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { displayAdConfig } from '../../data/site-config.js';
import { resolveDisplayAd } from '../../js/display-ads.mjs';

const pages = [
  ['index.html', 'home', '/'], ['tools/index.html', 'tools', '/tools/'],
  ['about/index.html', 'info', '/about/'], ['guide/index.html', 'info', '/guide/'],
  ['stores/index.html', 'stores', '/stores/'],
  ['stores/ecowashcafe-nakanoshima.html', 'store-detail', '/stores/ecowashcafe-nakanoshima.html']
];
const config = { client: 'ca-pub-9801602250480253', slots: Object.fromEntries(pages.map(([, key]) => [key, '1234567890'])) };
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public placements use the owner-provided pages unit; blank configuration remains inactive', () => {
  const blank = { ...displayAdConfig, slots: {} };
  for (const [, key, path] of pages) {
    assert.deepEqual(resolveDisplayAd(displayAdConfig, key, path), { client: 'ca-pub-9801602250480253', slot: '8825932060' });
    assert.equal(resolveDisplayAd(blank, key, path), null);
  }
});
test('each configured placement belongs only to its explicit public page', () => {
  for (const [, key, path] of pages) {
    assert.deepEqual(resolveDisplayAd(config, key, path), { client: config.client, slot: '1234567890' });
    if (path.endsWith('/')) assert.ok(resolveDisplayAd(config, key, path + 'index.html'));
  }
});
test('blank, malformed and mistyped unit IDs never request advertising', () => {
  for (const slot of ['', ' ', '12345', 'abc', 'ca-pub-9801602250480253', '/23379831154/pixieed_rewarded', 1234567890, null]) {
    assert.equal(resolveDisplayAd({ ...config, slots: { home: slot } }, 'home', '/'), null);
  }
  assert.deepEqual(resolveDisplayAd({ ...config, slots: { home: ' 1234567890 ' } }, 'home', '/'), { client: config.client, slot: '1234567890' });
});
test('private and working screens stay excluded even with a valid unit ID', () => {
  for (const path of ['/privacy/', '/profile/', '/collection/', '/admin/', '/draw/', '/audio/', '/jigsaw/', '/globe/', '/pixel-camera.html', '/play/spot-difference/']) {
    for (const key of Object.keys(config.slots)) assert.equal(resolveDisplayAd(config, key, path), null);
  }
  assert.equal(resolveDisplayAd(config, 'info', '/stores/cafe-hoshi.html'), null);
});
test('incorrect publisher and unknown placement are rejected', () => {
  assert.equal(resolveDisplayAd({ ...config, client: '/23379831154/' }, 'home', '/'), null);
  assert.equal(resolveDisplayAd(config, 'draw', '/draw/'), null);
});
for (const [path, key] of pages) test(`${path}: one initially hidden flow-layout ad, outside interactive content`, async () => {
  const source = await read(path);
  assert.equal((source.match(/data-display-ad=/g) || []).length, 1);
  const ad = source.match(/<aside\b[^>]*data-display-ad="[^"]+"[^>]*>/)?.[0];
  assert.ok(ad.includes(`data-display-ad="${key}"`) && ad.includes('hidden'));
  const index = source.indexOf(ad);
  assert.ok(index > source.indexOf('<main') && index < source.indexOf('</main>'));
  assert.ok(!source.includes('<ins'), 'AdSense units are created only after a valid ID is configured');
  assert.equal((source.match(/src="\/js\/display-ads\.mjs/g) || []).length, 1);
  assert.equal((source.match(/href="\/css\/display-ads\.css/g) || []).length, 1);
  if (key === 'home') assert.ok(index > source.indexOf('class="hp-go-sub"') && index < source.indexOf('aria-labelledby="hpToysTitle"'));
  if (key === 'tools') assert.ok(index > source.indexOf('data-tool-preview="game"') && index < source.indexOf('tool-shell__head--games'));
});
test('working and private HTML has no manual slot or renderer', async () => {
  for (const path of ['pixel-camera.html', 'globe-prototype.html', 'draw/index.html', 'audio/index.html', 'jigsaw/index.html', 'spot-difference/index.html', 'hidden-object/index.html', 'play/spot-difference/index.html', 'play/hidden-object/index.html', 'profile/index.html', 'privacy/index.html']) {
    assert.doesNotMatch(await read(path), /data-display-ad=|src="\/js\/display-ads\.mjs/);
  }
});
test('unit CSS reserves size without cropping, floating or animating a creative', async () => {
  const css = await read('css/display-ads.css');
  assert.match(css, /\.px-display-ad\[hidden\]\s*\{\s*display: none !important/);
  assert.match(css, /height: 100px/);
  assert.match(css, /height: 90px/);
  assert.doesNotMatch(css, /overflow\s*:\s*hidden|position\s*:\s*(fixed|absolute)|transform\s*:|animation\s*:/);
});
