import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
export const DIRECT_PAGES = [
  'index.html', 'tools/index.html', 'draw/index.html', 'audio/index.html', 'jigsaw/index.html',
  'spot-difference/index.html', 'hidden-object/index.html',
  'play/spot-difference/index.html', 'play/hidden-object/index.html',
  'globe/index.html', 'about/index.html', 'guide/index.html', 'stores/index.html',
  'stores/ecowashcafe-nakanoshima.html', 'stores/cafe-hoshi.html',
  'stores/kaze-machi.html', 'stores/yoru-akari.html'
];
export const STANDALONE_PAGES = ['pixel-camera.html', 'globe-prototype.html', 'pixiee-lens/index.html'];
const EXCLUDED_PAGES = [
  'privacy/index.html', 'profile/index.html', 'collection/index.html', 'admin/index.html',
  '404.html', 'shops/index.html', 'game/index.html',
  'camera-media-test.html', 'pixel-camera-studio.html',
  'home/index.html', 'works/index.html', 'pixfind/index.html', 'telescope/index.html',
  'works/sea-cat.html', 'works/rainy-window.html', 'works/night-lantern.html',
  // the Offerwall page adds the AdSense script itself, only when no pass is running
  'pass/index.html'
];
const GOOGLE_SOURCE = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
const LOADER_SOURCE = '/js/adsense-auto.js?rev=20260929-auto-ads-1';
const html = (path) => readFile(new URL(path, root), 'utf8');
const scripts = (source) => source.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];

for (const path of DIRECT_PAGES) test(`${path}: one official asynchronous AdSense script inside head`, async () => {
  const source = await html(path);
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  const ads = scripts(source).filter((script) => script.includes('adsbygoogle.js'));
  assert.equal(ads.length, 1);
  assert.ok(head.includes(ads[0]));
  assert.ok(ads[0].includes(`src="${GOOGLE_SOURCE}"`));
  assert.match(ads[0], /\basync\b/);
  assert.match(ads[0], /crossorigin="anonymous"/);
  assert.ok(!source.includes(LOADER_SOURCE), 'no second loader');
});

for (const path of STANDALONE_PAGES) test(`${path}: only the embedded-safe loader is present in head`, async () => {
  const source = await html(path);
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  const ads = scripts(source).filter((script) => script.includes('adsense-auto.js'));
  assert.equal(ads.length, 1);
  assert.ok(head.includes(ads[0]));
  assert.ok(ads[0].includes(`src="${LOADER_SOURCE}"`));
  assert.match(ads[0], /\bdefer\b/);
  assert.equal(scripts(source).filter((script) => script.includes('adsbygoogle.js')).length, 0);
});

for (const path of EXCLUDED_PAGES) test(`${path}: no Auto ads code on private, disabled, redirect or development pages`, async () => {
  const source = await html(path);
  assert.equal(scripts(source).filter((script) => /adsense-auto\.js|adsbygoogle\.js/.test(script)).length, 0);
});

test('every non-fixture HTML entry has an explicit advertising decision', async () => {
  const ignored = new Set(['.git', 'node_modules', 'tests', 'assets']);
  async function entries(directory = '') {
    const found = [];
    for (const entry of await readdir(new URL(directory || './', root), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) found.push(...await entries(`${path}/`));
      else if (entry.name.endsWith('.html')) found.push(path);
    }
    return found;
  }
  assert.deepEqual((await entries()).sort(), [...DIRECT_PAGES, ...STANDALONE_PAGES, ...EXCLUDED_PAGES].sort(),
    'new pages must explicitly opt in or out rather than inheriting ads from the header');
  assert.equal(new Set([...DIRECT_PAGES, ...STANDALONE_PAGES, ...EXCLUDED_PAGES]).size, 37);
});

const loader = await readFile(new URL('js/adsense-auto.js', root), 'utf8');
function harness({ embedded = false, protocol = 'https:', existing = false, search = '' } = {}) {
  const added = [];
  const frame = {};
  const context = vm.createContext({
    window: { top: embedded ? {} : frame, self: frame },
    location: { protocol, search },
    document: {
      querySelector: () => existing || added.length ? {} : null,
      createElement: () => ({}), head: { append: (script) => added.push(script) }
    }
  });
  const run = () => vm.runInContext(loader, context);
  return { added, run };
}
test('standalone tools append the correct official script once, without touching pass state', () => {
  const h = harness(); h.run(); h.run();
  assert.equal(h.added.length, 1);
  assert.deepEqual(h.added[0], { async: true, src: GOOGLE_SOURCE, crossOrigin: 'anonymous' });
});
test('an existing AdSense script is never loaded twice', () => {
  const h = harness({ existing: true }); h.run(); assert.equal(h.added.length, 0);
});
test('real iframe context skips Auto ads regardless of the embed query', () => {
  for (const search of ['', '?embed=1', '?embed=true']) {
    const h = harness({ embedded: true, search }); h.run(); assert.equal(h.added.length, 0);
  }
});
test('embed=1 in a standalone telescope URL still permits ads', () => {
  const h = harness({ search: '?embed=1&tool=telescope' }); h.run(); assert.equal(h.added.length, 1);
});
test('file preview never sends an ad request', () => {
  const h = harness({ protocol: 'file:' }); h.run(); assert.equal(h.added.length, 0);
});
test('ads.txt seller and privacy disclosure agree with the installed publisher', async () => {
  assert.equal((await html('ads.txt')).trim(), 'google.com, pub-9801602250480253, DIRECT, f08c47fec0942fa0');
  const privacy = await html('privacy/index.html');
  assert.match(privacy, /Google AdSense の通常広告を利用します/);
  assert.match(privacy, /通常広告の表示やクリックでは、特典時間は付与されません/);
});
