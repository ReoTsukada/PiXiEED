import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('./baseline.fixture.json', import.meta.url), 'utf8'));

test('the old works route goes to the globe and the tools route remains reachable', () => {
  const home = read('index.html');
  const tools = read('tools/index.html');
  const oldWorks = read('works/index.html');
  assert.match(home, new RegExp(`href="${fixture.routes.tools}"`));
  assert.match(tools, new RegExp(`href="${fixture.routes.tools}"`));
  assert.match(oldWorks, /name="robots" content="noindex,follow"/);
  assert.match(oldWorks, /http-equiv="refresh" content="0;url=\/"/);
  assert.match(read('js/app.js'), /href="\/" data-menu-link>地図で作品を見る/);
  assert.match(read('css/site.css'), /\.mobile-nav a\[href="\/works\/"\]/);
});

test('the paused selling route is excluded from public discovery', () => {
  const oldShop = read('shops/index.html');
  const sitemap = read('sitemap.xml');
  const shell = read('js/app.js');
  assert.match(oldShop, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(oldShop, /4,500|購入|販売作品/);
  assert.doesNotMatch(sitemap, /\/(?:shops|works)\//);
  assert.doesNotMatch(shell, /href="\/shops\/"/);
});

test('map keeps a live globe entry and five-control camera navigation', () => {
  const home = read('index.html');
  assert.match(home, /map-hero__globe-frame/);
  const camera = read('pixel-camera.html');
  const nav = camera.match(/<nav\b[^>]*class="app-tabs pc-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, 'camera page has its bottom navigation');
  const keys = [...nav.matchAll(/data-nav="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, fixture.bottomNavigation.filter((key) => key !== 'capture'));
  assert.match(nav, /data-action="capture"/);
  assert.match(nav, /href="\/tools\/"/);
});

test('the public telescope route forwards into the globe tool', () => {
  const html = read('telescope/index.html');
  assert.match(html, /globe-prototype\.html\?embed=1&amp;tool=telescope/);
  assert.match(read('tools/index.html'), /href="\/telescope\/"/);
});

test('the creation tools list links to the five local creation routes', () => {
  const tools = read('tools/index.html');
  for (const [href, label] of [
    ['/audio/', 'かんたん音楽'],
    ['/jigsaw/', 'かんたんジグソー'],
    ['/spot-difference/', 'かんたん間違い探し'],
    ['/hidden-object/', 'かんたんもの探し'],
    ['/game/', 'かんたんゲーム'],
  ]) {
    assert.match(tools, new RegExp(`href="${href.replaceAll('/', '\\/')}"[\\s\\S]*?<h2>${label}</h2>`));
  }
});
