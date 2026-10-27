import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
export const MANUAL_PAGES = [
  'welcome/index.html', 'tools/index.html', 'about/index.html', 'guide/index.html',
  'stores/index.html', 'stores/ecowashcafe-nakanoshima.html'
];
// The SNS home, feed, and explore screens are interactive; root-owned build logic no longer adds Auto Ads there.
export const SOURCE_AUTO_AD_PAGES = [];
const SOCIAL_NO_AD_PAGES = ['index.html', 'feed/index.html', 'explore/index.html'];
export const RESULT_PAGES = [
  'pixel-camera.html', 'draw/index.html', 'audio/index.html', 'draw/editor.html', 'audio/editor.html', 'jigsaw/index.html',
  'play/spot-difference/index.html', 'play/hidden-object/index.html'
];
export const WORKSPACE_PAGES = ['pixel-camera.html', 'globe-prototype.html', 'pixiee-lens/index.html', 'globe/index.html'];
const OFFERWALL_PAGE = 'output/work/index.html';
const COMPATIBILITY_PAGES = ['PiXiEEDraw/index.html', 'pixiedraw/index.html', 'pixiedraw2/index.html', 'studio/index.html'];
// Static reference pages have no manual units and never load a provider eagerly.
const REFERENCE_NO_AD_PAGES = [
  'help/index.html', 'glossary/index.html', 'projects/pixiedraw/index.html', 'projects/pixfind/index.html',
  'output/image-formats/index.html', 'output/audio-formats/index.html'
];
const ISOLATED_TEST_PAGES = ['admanager-rewarded-test/index.html'];
// These are source templates. The Pages build injects the informational loader
// only after checking its explicit route allowlist and generated-event set.
const eventCatalog = JSON.parse(await readFile(new URL('events/catalog.json', root), 'utf8'));
const EVENT_NO_AD_PAGES = ['events/index.html', ...eventCatalog.ids.map(id => `events/${id}/index.html`)];
const EXCLUDED_PAGES = [
  ...SOCIAL_NO_AD_PAGES,
  'privacy/index.html', 'terms/index.html', 'profile/index.html', 'collection/index.html', 'admin/index.html',
  '404.html', 'shops/index.html', 'game/index.html', 'camera-media-test.html', 'pixel-camera-studio.html',
  'home/index.html', 'works/index.html', 'pixfind/index.html', 'telescope/index.html',
  'output/index.html', 'camera/index.html', 'draw/about/index.html',
  'works/sea-cat.html', 'works/rainy-window.html', 'works/night-lantern.html', 'pass/index.html',
  'stores/cafe-hoshi.html', 'stores/kaze-machi.html', 'stores/yoru-akari.html',
  'spot-difference/index.html', 'hidden-object/index.html', 'globe-prototype.html', 'pixiee-lens/index.html'
];
const html = (path) => readFile(new URL(path, root), 'utf8');

for (const path of MANUAL_PAGES) test(`${path}: manual units own their lazy ad requests`, async () => {
  const source = await html(path);
  assert.match(source, /data-display-ad=/);
  assert.match(source, /src="\/js\/display-ads\.mjs\?rev=20261024-public-layout-1"/);
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

test('source HTML inventory has explicit loader decisions before route-scoped build injection', async () => {
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
  const established = [...new Set([...MANUAL_PAGES, ...RESULT_PAGES, ...WORKSPACE_PAGES, ...EXCLUDED_PAGES, OFFERWALL_PAGE])];
  const categorized = [...new Set([...established, ...SOURCE_AUTO_AD_PAGES])];
  const expected = [...new Set([...categorized, ...COMPATIBILITY_PAGES, ...EVENT_NO_AD_PAGES, ...REFERENCE_NO_AD_PAGES, ...ISOLATED_TEST_PAGES])].sort();
  assert.deepEqual((await entries()).sort(), expected, 'new pages must opt into manual/result loading or explicit no-loader coverage');
  assert.equal(established.length, 47);
  assert.equal(categorized.length, 47);
  assert.equal(expected.length, 47 + COMPATIBILITY_PAGES.length + EVENT_NO_AD_PAGES.length + REFERENCE_NO_AD_PAGES.length + ISOLATED_TEST_PAGES.length);
  for (const path of SOURCE_AUTO_AD_PAGES) {
    const source = await html(path);
    assert.doesNotMatch(source, /adsbygoogle|adsense-auto|display-ads|data-display-ad/, `${path}: source has no manual provider or slot`);
  }
  for (const path of [...COMPATIBILITY_PAGES, ...EVENT_NO_AD_PAGES, ...REFERENCE_NO_AD_PAGES, ...ISOLATED_TEST_PAGES]) {
    assert.doesNotMatch(await html(path), /adsbygoogle|adsense-auto|display-ads|data-display-ad|adsense-offerwall/, `${path}: compatibility and factual reference pages have no ad loader`);
  }
  for (const path of expected.filter(path => path !== OFFERWALL_PAGE)) assert.doesNotMatch(await html(path), /adsbygoogle\.js|adsense-auto\.js/, path);
  const output = await html(OFFERWALL_PAGE);
  assert.doesNotMatch(output, /adsense-auto\.js|adsbygoogle\.js/, 'output work no longer loads an unconditional provider');
  assert.match(output, /<script src="\/js\/adsense-offerwall-policy\.js\?rev=20261024-common-tool-start-1"><\/script>\s*<script type="module" src="\/js\/tool-offerwall-entry\.mjs\?rev=20261024-common-tool-start-1"><\/script>/);
  assert.doesNotMatch(await html('output/index.html'), /adsbygoogle\.js|adsense-auto\.js/);
});

test('ads.txt seller and privacy disclosure agree with the installed publisher', async () => {
  assert.equal((await html('ads.txt')).trim(), 'google.com, pub-9801602250480253, DIRECT, f08c47fec0942fa0');
  const privacy = await html('privacy/index.html');
  assert.match(privacy, /Google AdSense/);
  assert.match(privacy, /無料/);
  assert.match(privacy, /すべての制作機能を無料で利用できます。リワードによる個別の機能解放や期限付き特典は設けません/);
  assert.match(privacy, /ツールの利用開始前の入口では、GoogleのOfferwallを表示する場合があります/);
  assert.match(privacy, /広告視聴とアクセス条件は、Offerwallの画面で案内します/);
  assert.match(privacy, /作業の再開、制作・プレイの途中や保存時、保存済みの出力を確認する画面では、新たな表示を許可しない制御を行います/);
  assert.match(privacy, /配信元がすでに受け付けた案内の表示時点まではサイト側で保証できず/);
  assert.doesNotMatch(privacy, /期間限定で特典対象の全機能|開放期間中は、報酬型広告/);
  assert.doesNotMatch(privacy, /広告視聴で60分間のリワード記録を受け取れます/);
  assert.doesNotMatch(privacy, /広告を.*1時間追加|残り時間の上限は2時間/);
});
