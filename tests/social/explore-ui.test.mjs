import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const explore = read('explore/index.html');
const home = read('index.html');
const feed = read('feed/index.html');
const script = read('js/social/app.mjs');
const css = read('css/social-explore.css');

test('Explore is the community experience and matches the home visual language', () => {
  assert.match(home, /class="portal-bento"/);
  assert.match(explore, /data-social-page="explore"/);
  assert.match(explore, /class="explore-hero"/);
  assert.match(explore, /class="explore-hero-art"/);
  assert.match(explore, /class="explore-maker-feature"/);
  assert.match(explore, /class="explore-world-feature"/);
  assert.match(explore, /css\/social-explore\.css\?rev=/);
  assert.match(explore, /js\/social\/app\.mjs\?rev=20261029-explore-1/);
  assert.match(explore, /href="\/"/);
  assert.match(explore, /href="\/globe\/"/);
  assert.match(explore, /href="\/tools\/"/);
  assert.doesNotMatch(explore, /data-social-page="home"/);
  assert.ok(!feed.includes('social-explore.css'), 'legacy feed keeps its own original styling');
});

test('Search, view tabs, safe composer and account handoff keep their original contracts', () => {
  for (const id of ['socialApp','socialSearch','feedViews','feedFilters','feedFilterWrap','pageTitle',
    'viewDescription','refreshFeed','guestAccountOpen','composerDialog','composerForm',
    'feed','feedStatus','feedWarningDetails','feedWarningList','feedRetry','draftsPanel',
    'localDrafts','guestAccountDialog','guestAccountForm','detailDialog','toolsDialog']) {
    assert.equal((explore.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} stays unique`);
  }
  for (const view of ['feed','saved','local','mine'])
    assert.match(explore, new RegExp(`data-view="${view}"`));
  for (const kind of ['art','photo','puzzle','text','music'])
    assert.match(explore, new RegExp(`data-action="filter" data-type="${kind}"`));
  assert.match(explore, /class="explore-search"[^>]*>[\s\S]*?id="socialSearch"[\s\S]*?<\/label>[\s\S]*?class="explore-search-note"/);
  assert.match(explore, /data-compose data-type="art"/);
  assert.match(explore, /id="composerVisibility"/);
  assert.match(explore, /id="composerPostingConsent"/);
  assert.match(explore, /class="explore-tools-more"/);
  assert.match(explore, /id="guestAccountStatus"/);
  assert.doesNotMatch(explore, /src="[^"]*home-portal\.mjs/);
});

test('Context-aware view changes preserve search limitation and show only relevant controls', () => {
  assert.match(script, /documentRef\.body\.dataset\.exploreView = view/);
  assert.match(script, /searchLabel\.hidden = view !== 'feed'/);
  assert.match(script, /filters\.hidden = view !== 'feed'/);
  assert.match(script, /state\.filter === 'local'/);
  assert.match(script, /updateFilters\(\)/);
  assert.match(explore, /検索できるのは読み込んだ最新30件/);
  assert.match(explore, /class="feed-list" id="feed"/);
  assert.match(explore, /class="drafts-panel" id="draftsPanel"/);
  assert.doesNotMatch(explore, /サンプル投稿|架空の投稿|偽の投稿/);
});

test('Explore CSS is scoped, responsive, keyboard accessible and does not add an ad gate', () => {
  assert.match(css, /body\[data-social-page="explore"\]/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:400px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /explore-tools-more\[open\]/);
  assert.match(css, /:focus-within/);
  assert.match(explore, /<details class="explore-tools-more"/);
  assert.doesNotMatch(explore, /data-wait-seconds|data-ad-countdown/);
});
