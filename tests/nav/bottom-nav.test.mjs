import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const labels = (nav) => [...nav.matchAll(/<a\b[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

test('public navigation restores four historical entrances around the page primary action', () => {
  const app = read('js/app.js');
  const nav = app.match(/tabs\.innerHTML = `([^`]*)`/)[1];
  assert.deepEqual(labels(nav), ['世界地図', '撮影', 'ツール', 'マイページ']);
  assert.deepEqual([...nav.matchAll(/data-nav="([^"]+)"/g)].map(match => match[1]), ['map','camera','tools','profile']);
  const sides = nav.split('${contextAction}');
  assert.equal(sides.length, 2);
  assert.equal((sides[0].match(/<a\b/g) || []).length, 2, 'two entrances precede the original primary');
  assert.equal((sides[1].match(/<a\b/g) || []).length, 2, 'two entrances follow the original primary');
  assert.match(app, /data-page-action="post"[^>]*aria-label="ドット絵を投稿する"/);
  assert.match(app, /href="#store-search" aria-label="お店を探す"/);
  assert.match(read('stores/index.html'), /id="store-search" name="search" type="search"/);
  assert.doesNotMatch(app, /tabs\.hidden = !contextAction/);
  assert.doesNotMatch(read('js/site-header.mjs'), /function separateWorkNavigation/);
  assert.match(app, /tabs\.setAttribute\('aria-label', 'アプリナビゲーション'\)/);
  assert.match(app, /brandLink\.setAttribute\('href', '\/'\)/);
});

test('shop entrances remain visible in the home discovery section', () => {
  const home = read('index.html');
  assert.match(home, /class="hp-card-grid hp-discover-grid"[\s\S]*class="hp-link-card hp-catalog-card" href="\/books\/"/);
  assert.match(home, /<h3 class="hp-toy-name">ドット絵の本・グッズ<\/h3><span class="hp-toy-line">本、おもちゃ、制作道具を探す<\/span>[\s\S]*商品を見る/);
  assert.match(read('css/home.css'), /\.hp-catalog-card \{ grid-column: 1 \/ -1; display: flex/);
});

test('profile brand links labeled as home route to the real homepage', () => {
  const profile = read('profile/index.html');
  assert.equal((profile.match(/class="brand" href="\/" aria-label="PiXiEED ホーム"/g) || []).length, 2);
  assert.doesNotMatch(profile, /class="brand" href="\/globe\/" aria-label="PiXiEED ホーム"/);
});

test('camera and creation-editor operator controls remain authored in their original navs', () => {
  for (const file of ['pixel-camera.html', 'pixel-camera-studio.html']) {
    const nav = read(file).match(/<nav class="app-tabs pc-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual(labels(nav), ['世界地図', '撮影', 'ツール', 'マイページ'], file);
    assert.match(nav, /aria-label="撮影" aria-current="page"/, file);
    assert.match(nav, /aria-label="撮影"[^>]*>[^]*?data-action="capture"[^]*?aria-label="ツール"/, file);
  }
  const drawNav = read('draw/editor.html').match(/<nav class="app-tabs"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const audioNav = read('audio/editor.html').match(/<nav class="app-tabs"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.match(drawNav, /id="draw-animation-play"[^>]*aria-label="アニメーションを再生"/);
  assert.match(audioNav, /id="audio-play-toggle"[^>]*aria-label="曲を再生"/);
  assert.doesNotMatch(drawNav + audioNav, /app-tab-label/);
  assert.match(read('draw/editor.html'), /id="draw-animation-play"/);
  assert.match(read('audio/editor.html'), /id="audio-play-toggle"/);
});

test('all static store detail map CTAs describe the world map destination', () => {
  for (const file of ['stores/ecowashcafe-nakanoshima.html', 'stores/cafe-hoshi.html', 'stores/kaze-machi.html', 'stores/yoru-akari.html']) {
    const html = read(file);
    assert.match(html, /data-page="store-detail" data-store-id=/, file);
    if (file.endsWith('ecowashcafe-nakanoshima.html')) assert.match(html, /href="\/globe\/">世界地図を見る<\/a>/, file);
    assert.doesNotMatch(html, /href="\/globe\/">地図でお店を探す<\/a>/, file);
  }
  assert.match(read('js/app.js'), /href="\/globe\/">世界地図を見る<\/a>/);
});
