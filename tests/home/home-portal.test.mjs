import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { findHomeDestinations, normalizeHomeQuery, HOME_DESTINATIONS } from '../../js/home-portal.mjs';

const home = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const explore = readFileSync(new URL('../../explore/index.html', import.meta.url), 'utf8');
const homeCss = readFileSync(new URL('../../css/home-portal.css', import.meta.url), 'utf8');

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
test('visual cards are responsive with reduced-motion and keyboard focus', () => {
  assert.match(homeCss, /grid-template-columns:repeat\(12/);
  assert.match(homeCss, /@media\(max-width:530px\)/);
  assert.match(homeCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(homeCss, /:focus-visible/);
  assert.match(homeCss, /public-navigation\.css/);
});

test('shop card makes the external catalog and item categories clear', () => {
  const card = home.match(/<a class="portal-card portal-shop"[\s\S]*?<\/a>/)?.[0];
  assert.ok(card);
  assert.match(card, /href="\/books\/"/);
  for (const label of ['ショップ', '本・おもちゃ・道具・ガジェット', '外部ショップの商品を紹介', '価格・在庫・購入は販売先で']) assert.ok(card.includes(label));
  assert.match(card, /src="\/assets\/home\/shop\.svg" alt="" aria-hidden="true"/);
  assert.doesNotMatch(card, /<canvas|https?:|checkout|target=/);
  assert.match(homeCss, /\.portal-shop\{grid-column:span 12/);
  assert.match(home, /src="\/assets\/brand\/pixieed-logo-48\.png"/);
  for (const query of ['ショップ', 'おもちゃ', '道具', 'books', 'shop', 'グッズ', 'ガジェット', '販売先']) {
    assert.equal(findHomeDestinations(query)[0].href, '/books/', query);
  }
});

test('all eight cards have original lightweight explanatory scenes and readable actions', () => {
  const names = ['draw', 'convert', 'camera', 'audio', 'play', 'community', 'globe', 'shop'];
  const evidence = ['動くGIF', '使いたい形式', '粗さ・色数', 'マス目に音', '間違い探し', '投稿する', 'イベント', '外部ショップ'];
  let bytes = 0;
  for (const [index, name] of names.entries()) {
    const card = home.match(new RegExp(`<a class="portal-card portal-${name}"[\\s\\S]*?<\\/a>`))?.[0];
    assert.ok(card, name);
    assert.ok(card.includes(evidence[index]), name);
    assert.match(card, /class="portal-card-cta"/);
    assert.match(card, /width="480" height="240"/);
    assert.match(card, /alt="" aria-hidden="true"/);
    const path = new URL(`../../assets/home/${name}.svg`, import.meta.url);
    const asset = readFileSync(path, 'utf8');
    bytes += statSync(path).size;
    assert.match(asset, /viewBox="0 0 480 240"/);
    assert.match(asset, /<title>[^<]+<\/title>/);
    assert.doesNotMatch(asset, /<script|<image|<foreignObject|<animate|href=|onload=|data:/);
  }
  assert.ok(bytes < 100_000, 'all eight SVG scenes total under 100KB before compression');
  assert.equal((home.match(/class="portal-card portal-/g) || []).length, 8);
  assert.doesNotMatch(home, /intro-pending|assets\/screenshots|portal-(camera-art|audio-art|play-art|community-art|globe-art|shop-art)/);
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
test('home distinguishes a fresh creation from returning to local works without bypassing the gallery', () => {
  assert.match(home, /href="#portal-create"><strong>新しくつくる/);
  assert.match(home, /id="portal-create" class="portal-bento"/);
  assert.match(home, /href="\/draw\/\?workspace=1"><strong>保存した絵を開く/);
  assert.match(home, /制作は毎回、作品一覧から始まります/);
  assert.match(home, /ゲームなどの続きは、<a href="\/tools\/">作成した道具/);
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
