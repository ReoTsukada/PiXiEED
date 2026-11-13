import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { findHomeDestinations, normalizeHomeQuery, HOME_DESTINATIONS } from '../../js/home-portal.mjs';
import { getToolStartRoute } from '../../js/tool-start-routes.mjs';

const home = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const explore = readFileSync(new URL('../../explore/index.html', import.meta.url), 'utf8');
const homeCss = readFileSync(new URL('../../css/home-portal.css', import.meta.url), 'utf8');

test('every primary home entrance has a real source document', () => {
  const doors = home.match(/<div class="doors">([\s\S]*?)<div class="return">/)?.[1];
  const hrefs = [...doors.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(hrefs.length, 3);
  for (const href of hrefs) {
    const path = getToolStartRoute(href)?.sourcePath || href.slice(1) + 'index.html';
    assert.ok(existsSync(new URL('../../' + path, import.meta.url)), `${href} has a publishable source`);
  }
});

test('play entrance lists real existing games without starting an editor or creating work', () => {
  const play = readFileSync(new URL('../../play/index.html', import.meta.url), 'utf8');
  assert.match(play, /href="https:\/\/pixieed\.jp\/play\/"/);
  for (const href of ['/play/spot-difference/', '/play/hidden-object/', '/tools/start/jigsaw/']) {
    assert.ok(play.includes(`href="${href}"`));
    const path = getToolStartRoute(href)?.sourcePath || href.slice(1) + 'index.html';
    assert.ok(existsSync(new URL('../../' + path, import.meta.url)), href);
  }
  assert.equal((play.match(/class="play-card"/g) || []).length, 3);
  assert.doesNotMatch(play, /<script|<iframe|<canvas|assets\/screenshots/);
});

test('home is a navigation portal, not a second social timeline', () => {
  assert.match(home, /<main id="main" class="portal-main">/);
  assert.match(home, /href="\/explore\/"/);
  assert.match(home, /href="\/tools\/start\/draw\/"/);
  assert.match(home, /href="\/tools\/start\/convert\/"/);
  assert.match(home, /href="\/tools\/start\/camera\/"/);
  assert.match(home, /href="\/tools\/start\/audio\/"/);
  assert.match(home, /href="\/play\/"/);
  assert.match(home, /href="\/globe\/"/);
  assert.match(home, /<details class="portal-more-disclosure"/);
  assert.match(home, /type="search"/);
  assert.match(home, /\/js\/home-portal\.mjs/);
  assert.doesNotMatch(home, /id="socialApp"|id="composerDialog"|id="feedStatus"/);
  assert.doesNotMatch(home, /js\/social\/app\.mjs/);
  assert.match(home, /href="https:\/\/pixieed\.jp\/"/);
});
test('explore owns the complete existing SNS interface', () => {
  assert.match(explore, /data-social-page="explore"/);
  for (const selector of ['id="feed"', 'id="composerDialog"', 'id="socialSearch"', 'id="feedViews"', 'id="guestAccountDialog"']) {
    assert.ok(explore.includes(selector), selector);
  }
  assert.match(explore, /みんなの作品/);
  assert.match(explore, /js\/social\/app\.mjs/);
});
test('intent search is local, ranked, handles width and Japanese inputs', () => {
  assert.equal(normalizeHomeQuery('　ＧＩＦ　'), 'gif');
  assert.equal(findHomeDestinations('')[0], undefined);
  assert.equal(findHomeDestinations('GIF')[0].href, '/output/gif-speed/');
  assert.equal(findHomeDestinations('ドット絵')[0].href, '/tools/start/draw/');
  assert.equal(findHomeDestinations('SNS')[0].href, '/explore/');
  assert.equal(findHomeDestinations('文字')[0].href, '/output/text/');
  assert.ok(findHomeDestinations('qoi').some(x=>x.href==='/output/formats/qoi/'));
  assert.ok(findHomeDestinations('________').length===0);
  assert.ok(HOME_DESTINATIONS.length >= 25);
  for(const entry of HOME_DESTINATIONS){
    assert.match(entry.href,/^\/[a-z0-9/-]+\/(?:\?workspace=1)?$/);
    assert.ok(entry.title && entry.group && entry.terms);
    assert.ok(!/^https?:/.test(entry.href));
  }
});
test('whole-home layout retains three equal routes, responsive controls and keyboard focus', () => {
  assert.match(homeCss, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(homeCss, /@media\(max-width:359px\)/);
  assert.match(homeCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(homeCss, /:focus-visible/);
  assert.match(homeCss, /public-navigation\.css/);
  const doors = home.match(/<div class="doors">([\s\S]*?)<div class="return">/)?.[1];
  assert.ok(doors);
  assert.equal((doors.match(/class="door"/g) || []).length, 3);
  for (const label of ['描く', '作品を見る', '遊ぶ']) assert.ok(doors.includes(`<strong>${label}</strong>`));
  for (const href of ['/tools/start/draw/', '/explore/', '/play/']) assert.ok(doors.includes(`href="${href}"`));
  assert.ok(home.indexOf('class="doors"') < home.indexOf('class="portal-work-entry"'));
});

test('shop destination makes the external catalog and item categories clear', () => {
  const link = home.match(/<a href="\/books\/">ショップ：[\s\S]*?<\/a>/)?.[0];
  assert.ok(link);
  for (const label of ['本・おもちゃ・道具・ガジェット', '外部ショップの商品を紹介', '価格・在庫・購入は販売先で']) assert.ok(link.includes(label));
  assert.doesNotMatch(link, /<canvas|https?:|checkout|target=/);
  for (const query of ['ショップ', 'おもちゃ', '道具', 'books', 'shop', 'グッズ', 'ガジェット', '販売先']) assert.equal(findHomeDestinations(query)[0].href, '/books/', query);
});

test('one connected playground keeps complete accessible controls, not separate toy widgets', () => {
  for (const id of ['hpStage','hpCanvas','hpHint','hpColors','hpPalette','hpPaletteToggle','hpCurrentColor','hpStatus','hpScore','hpPlayback','hpPlaybackStatus','hpGyroStatus','hpSound','hpAnimation','hpUndo','hpClear','hpClearDialog','hpClearCancel','hpClearConfirm','hpKeyboardHelp']) assert.equal((home.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  assert.equal((home.match(/<canvas/g) || []).length, 1);
  assert.match(home, /aria-describedby="hpKeyboardHelp"/);
  assert.match(home, /id="hpSound" aria-pressed="true"/);
  assert.match(home, /id="hpAnimation" aria-pressed="true"/);
  assert.match(home, /Spaceで描く／離す、Enterでタップ/);
  assert.match(home, /<dialog id="hpClearDialog"/);
  assert.match(home, /id="hpClearCancel" autofocus/);
  assert.match(home, /src="\/js\/home-play\.mjs\?rev=20261113-home-world-1"/);
  assert.doesNotMatch(home, /hpToys|data-toy=|home-gallery\.mjs|assets\/home\/community\.svg/);
  assert.equal((home.match(/class="trip"/g) || []).length, 3);
  assert.equal((home.match(/class="tool-preview-card"/g) || []).length, 3);
  assert.equal((home.match(/class="tool-feature"/g) || []).length, 1);
});

test('retired decorative markup and unreferenced drawing previews stay removed', () => {
  for (const name of ['draw-scene', 'convert-scene', 'camera-art', 'audio-art', 'play-art', 'community-art', 'globe-art', 'shop-art']) {
    assert.ok(!home.includes(`portal-${name}`), name);
    assert.ok(!homeCss.includes(`.portal-${name}`), name);
  }
  for (const name of ['home-draw-empty.png', 'previews/home-draw-empty-480.webp', 'previews/home-draw-empty-960.webp']) {
    assert.equal(existsSync(new URL(`../../assets/screenshots/${name}`, import.meta.url)), false, name);
  }
});

const guide = readFileSync(new URL('../../guide/index.html', import.meta.url), 'utf8');
test('whole-home experience keeps a plus entry and real saved thumbnails', () => {
  assert.match(home, /描く。見る。<em>遊ぶ。/);
  assert.doesNotMatch(home, /今日は、|なにする？|制作は毎回、作品一覧/);
  assert.match(home, /class="portal-new-project" href="#portal-create"/);
  assert.match(home, /class="portal-new-icon" aria-hidden="true">＋/);
  assert.match(home, /class="section tool-showcase" id="portal-create"/);
  assert.match(home, /id="portal-recent-list"/);
  assert.match(home, /id="portal-recent-status"[^>]+role="status"/);
  assert.match(home, /このブラウザーに保存した絵を表示/);
  assert.match(home, /href="\/draw\/\?workspace=1">絵の作品一覧/);
  assert.match(home, /音・写真・ゲームの続きは<a href="\/tools\/">それぞれの道具/);
  assert.match(guide, /道具ごとの作品は絵の作品一覧には表示されません/);
  assert.match(home, /href="\/guide\/#save-work"/);
  for (const query of ['続き', '再開', '保存した作品', '制作中', 'PXD']) assert.equal(findHomeDestinations(query)[0].href, '/draw/?workspace=1', query);
});
test('guide explains local, backup, export and public destinations using the actual composer', () => {
  assert.doesNotMatch(guide, /ホームの［作品やことばを投稿する］|ホームで投稿を作成/);
  assert.match(explore, /data-compose[^>]*>作品を投稿する/);
  assert.match(guide, /href="\/explore\/">コミュニティで投稿を作成・作品を見る/);
  for (const text of ['［掲載設定］', '地図の掲載先', '［下書きに保存］', '自動同期されません', 'ブラウザーデータの削除', '編集データをバックアップ（PXD）', '出力画面', '［取り込む］', '作品保存やファイル出力だけでは公開されません']) assert.ok(guide.includes(text), text);
  assert.match(guide, /id="save-work"/);
  assert.match(guide, /id="publish-work"/);
});

const homeModule = readFileSync(new URL('../../js/home-portal.mjs', import.meta.url), 'utf8');
test('the home shelf defers its local preview reader until the shelf is visible', () => {
  assert.match(homeModule, /IntersectionObserver/);
  assert.match(homeModule, /entry.isIntersecting/);
  assert.match(homeModule, /rootMargin:'0px'/);
  assert.match(homeModule, /await import\('\.\/home-recent-projects\.mjs\?rev=20261112-home-community-1'\)/);
  assert.doesNotMatch(homeModule, /from .*pxd-store|from .*pxd-codec|from .*draw-page|cloneAsToolProject|forkProject/);
});

test("free drawing keeps vertical touch strokes inside the canvas", () => {
  assert.match(homeCss, /\.hp-stage canvas\{[^}]*touch-action:none/);
  assert.match(home, /ページのスクロールは、あそび場の外で/);
});

test('real-screen tool showcase replaces decorative tool illustrations without duplicate entries', () => {
  const showcase = home.match(/<section class="section tool-showcase"[\s\S]*?<\/section>/)?.[0];
  assert.ok(showcase);
  assert.ok(home.indexOf('class="portal-work-entry"') < home.indexOf('class="section tool-showcase"'));
  assert.ok(home.indexOf('class="section tool-showcase"') < home.indexOf('class="trips"'));
  assert.equal((home.match(/id="portal-create"/g) || []).length, 1);
  assert.match(showcase, /<picture><source media="\(max-width:760px\)" srcset="\/assets\/home\/tool-screens\/draw-mobile\.png" width="780" height="1688">/);
  const images = [...showcase.matchAll(/<img[^>]+src="([^"]+tool-screens[^"]+)"[^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, 4);
  for (const img of images) {
    assert.match(img, /width="2560" height="1600"/);
    assert.match(img, /loading="lazy" decoding="async"/);
    assert.match(img, /alt="[^"]+"/);
  }
  for (const name of ['camera','audio','convert']) {
    assert.match(showcase, new RegExp(`href="/assets/home/tool-screens/${name}-desktop.png" aria-label="[^"]+実画面を大きく見る"`));
    assert.match(showcase, new RegExp(`href="/tools/start/${name}/">この道具を開く`));
  }
  assert.equal((showcase.match(/作例を使った実際の操作画面/g) || []).length, 4);
  assert.doesNotMatch(home, /class="tool-list"|class="trip-art"|assets\/icons\/pixieed\/(?:camera|telescope)\.svg/);
  assert.match(homeCss, /image-rendering:auto/);
  assert.doesNotMatch(showcase, /<iframe|<canvas|autoplay|target=/);
});

test('home-only smooth icons leave shared site icons unchanged and artwork errors remain readable', () => {
  for (const name of ['camera','search']) {
    const icon = readFileSync(new URL(`../../assets/home/icons/${name}.svg`, import.meta.url), 'utf8');
    assert.match(icon, /stroke-width="1.8"/);
    assert.doesNotMatch(icon, /crispEdges|pixelated|<script|<image/);
    assert.ok(home.includes(`/assets/home/icons/${name}.svg`));
  }
  const fallback = home.match(/<div class="portal-artwork-fallback"[\s\S]*?<\/div>/)?.[0];
  assert.ok(fallback);
  assert.doesNotMatch(fallback, /<svg|<img|<canvas/);
  assert.match(fallback, /作品一覧/);
  assert.match(homeCss, /data-state="error"/);
  assert.match(homeCss, /data-state="image-error"/);
  assert.match(homeCss, /#portal-artwork-status\{position:static/);
});
