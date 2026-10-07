import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
export const MANUAL_PAGES = [
  'index.html', 'tools/index.html', 'about/index.html', 'guide/index.html',
  'stores/index.html', 'stores/ecowashcafe-nakanoshima.html'
];
export const RESULT_PAGES = [
  'pixel-camera.html', 'draw/index.html', 'audio/index.html', 'jigsaw/index.html',
  'play/spot-difference/index.html', 'play/hidden-object/index.html'
];
export const WORKSPACE_PAGES = ['pixel-camera.html', 'globe-prototype.html', 'pixiee-lens/index.html', 'globe/index.html'];
const EXCLUDED_PAGES = [
  'privacy/index.html', 'profile/index.html', 'collection/index.html', 'admin/index.html',
  '404.html', 'shops/index.html', 'game/index.html', 'camera-media-test.html', 'pixel-camera-studio.html',
  'home/index.html', 'works/index.html', 'pixfind/index.html', 'telescope/index.html',
  'works/sea-cat.html', 'works/rainy-window.html', 'works/night-lantern.html', 'pass/index.html',
  'stores/cafe-hoshi.html', 'stores/kaze-machi.html', 'stores/yoru-akari.html',
  'spot-difference/index.html', 'hidden-object/index.html', 'globe-prototype.html', 'pixiee-lens/index.html'
];
const html = (path) => readFile(new URL(path, root), 'utf8');

for (const path of MANUAL_PAGES) test(`${path}: manual units own their lazy ad requests`, async () => {
  const source = await html(path);
  assert.match(source, /data-display-ad=/);
  assert.match(source, /src="\/js\/display-ads\.mjs\?rev=20261007-lazy-ads-1"/);
  assert.match(source, /href="\/css\/display-ads\.css\?rev=20261007-lazy-ads-1"/);
  assert.doesNotMatch(source, /adsbygoogle\.js|adsense-auto\.js/);
});

for (const path of RESULT_PAGES) test(`${path}: editor pages defer provider loading until a result slot requests it`, async () => {
  const source = await html(path);
  assert.doesNotMatch(source, /adsbygoogle\.js|adsense-auto\.js/);
});

for (const path of WORKSPACE_PAGES) test(`${path}: workspace and map entrypoints never load ads eagerly`, async () => {
  const source = await html(path);
  assert.doesNotMatch(source, /adsbygoogle\.js|adsense-auto\.js/);
});

for (const path of EXCLUDED_PAGES) test(`${path}: no eager provider entrypoint`, async () => {
  const source = await html(path);
  assert.doesNotMatch(source, /adsbygoogle\.js|adsense-auto\.js/);
});

test('every non-fixture HTML entry has an explicit ad-loading decision', async () => {
  const ignored = new Set(['.git', 'node_modules', 'tests', 'assets', 'books', 'docs']);
  async function entries(directory = '') {
    const found = [];
    for (const entry of await readdir(new URL(directory || './', root), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) found.push(...await entries(`${path}/`));
      else if (entry.name.endsWith('.html') && !path.startsWith('play/hidden-object/puzzles/') && !path.startsWith('play/spot-difference/puzzles/')) found.push(path);
    }
    return found;
  }
  const expected = [...new Set([...MANUAL_PAGES, ...RESULT_PAGES, ...WORKSPACE_PAGES, ...EXCLUDED_PAGES])].sort();
  assert.deepEqual((await entries()).sort(), expected, 'new pages must opt into manual/result loading or explicit no-loader coverage');
  assert.equal(new Set(expected).size, 37);
  for (const path of expected) assert.doesNotMatch(await html(path), /adsbygoogle\.js|adsense-auto\.js/, path);
});

test('ads.txt seller and privacy disclosure agree with the installed publisher', async () => {
  assert.equal((await html('ads.txt')).trim(), 'google.com, pub-9801602250480253, DIRECT, f08c47fec0942fa0');
  const privacy = await html('privacy/index.html');
  assert.match(privacy, /Google AdSense/);
  assert.match(privacy, /無料/);
  assert.doesNotMatch(privacy, /広告を.*1時間追加|残り時間の上限は2時間/);
});
