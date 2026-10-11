import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const labels = (nav) => [...nav.matchAll(/<a\b[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

test('public shell labels all five destinations and sends the stores action to its real search field', () => {
  const app = read('js/app.js');
  const nav = app.match(/tabs\.innerHTML = `([^`]*)`/)[1];
  assert.deepEqual(labels(nav), ['世界地図', '撮影', 'ツール', 'マイページ']);
  assert.match(nav, /data-nav="map"[^>]*aria-label="世界地図"[\s\S]*app-tab-label">世界地図/);
  assert.match(nav, /data-nav="camera"[^>]*aria-label="撮影"[\s\S]*app-tab-label">撮影/);
  assert.match(nav, /\$\{contextAction\}[\s\S]*app-tab-label">ツール[\s\S]*app-tab-label">マイページ/);
  assert.match(app, /stores: '<a class="app-tab-context app-tab-context--stores" href="#store-search" aria-label="お店を探す"><img src="\/assets\/icons\/pixieed\/home\.svg" alt=""><span class="app-tab-label">お店を探す<\/span><\/a>'/);
  assert.doesNotMatch(app.match(/stores: '([^']+)'/)[1], /telescope\.svg|href="\/globe\//);
  assert.match(read('stores/index.html'), /id="store-search" name="search" type="search"/);
  assert.match(app, /href="\/globe\/">世界地図を見る<\/a>/);
  assert.match(app, /home: '<a href="\/draw\/" aria-label="PiXiEEDrawで絵を描く"><img src="\/assets\/icons\/pixieed\/add\.svg" alt=""><span class="app-tab-label">描く/);
  assert.match(app, /brandLink\.setAttribute\('href', '\/'\)/);
  assert.match(app, /tabs\.className = 'app-tabs app-tabs--labeled'/);
  assert.match(read('css/pixieed-design-system.css'), /\.app-tabs--labeled \.app-tab-label/);
});

test('shop entrances appear in the common menu and the home discovery section', () => {
  const menu = read('js/site-header.mjs');
  assert.match(menu, /href="\/books\/" data-menu-link>ドット絵の本・グッズ<\/a>/);
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
  const drawNav = read('draw/index.html').match(/<nav class="app-tabs"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const audioNav = read('audio/index.html').match(/<nav class="app-tabs"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.match(drawNav, /id="draw-animation-play"[^>]*aria-label="アニメーションを再生"/);
  assert.match(audioNav, /id="audio-play-toggle"[^>]*aria-label="曲を再生"/);
  assert.doesNotMatch(drawNav + audioNav, /app-tab-label/);
  assert.match(read('draw/index.html'), /id="draw-animation-play"/);
  assert.match(read('audio/index.html'), /id="audio-play-toggle"/);
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
