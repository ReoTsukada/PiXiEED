import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    assert.match(entry.href,/^\/[a-z0-9/-]+\/$/);
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
