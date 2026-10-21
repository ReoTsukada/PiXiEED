import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_TOOL_CARDS, planFeedFlow, feedViewUrl, readFeedView } from '../../js/social/app.mjs';

const root = new URL('../../', import.meta.url);
const posts = (count, offset = 0) => Array.from({ length: count }, (_, index) => ({
  id: `post-${index + offset}`,
  title: `作品 ${index + offset}`
}));

test('view URLs preserve shared post, creation output, campaign queries and hash', () => {
  const href = '/feed/?post=map%3Aabc&output=synthetic&campaign=kept#work';
  const next = feedViewUrl(href, 'local');
  const url = new URL(next, 'https://pixieed.invalid');
  assert.equal(url.searchParams.get('post'), 'map:abc');
  assert.equal(url.searchParams.get('output'), 'synthetic');
  assert.equal(url.searchParams.get('campaign'), 'kept');
  assert.equal(url.hash, '#work');
  assert.equal(url.searchParams.get('view'), 'drafts');
  assert.equal(readFeedView(next), 'local');
  assert.equal(readFeedView(feedViewUrl(next, 'feed')), 'feed');
  assert.equal(readFeedView('/feed/?view=mine'), 'mine');
  assert.equal(readFeedView('/feed/?view=unknown'), 'feed');
});

test('feed flow keeps real posts in order and introduces no tools before eight posts', () => {
  const short = posts(7);
  assert.deepEqual(planFeedFlow(short), short.map((post) => ({ kind: 'post', post })));

  const full = posts(18);
  const plan = planFeedFlow(full);
  assert.deepEqual(plan.filter((entry) => entry.kind === 'post').map((entry) => entry.post), full);
  assert.deepEqual(plan.filter((entry) => entry.kind === 'tool').map((entry) => entry.anchorId), ['post-7', 'post-15']);
  assert.equal(plan.filter((entry) => entry.kind === 'tool').length, 2);
  assert.equal(plan.some((entry, index) => entry.kind !== 'post' && plan[index + 1]?.kind !== 'post'), false);
});

test('tool anchors and card choices survive prepended posts when the prior plan is supplied', () => {
  const original = planFeedFlow(posts(24));
  const originalTools = original.filter((entry) => entry.kind === 'tool');
  const refreshed = planFeedFlow(posts(30, -6), { previousPlan: original });
  const refreshedTools = refreshed.filter((entry) => entry.kind === 'tool');
  for (const oldEntry of originalTools) {
    assert.ok(refreshedTools.some((entry) => entry.anchorId === oldEntry.anchorId && entry.card.id === oldEntry.card.id));
  }
  assert.deepEqual(refreshed.filter((entry) => entry.kind === 'post').map((entry) => entry.post.id), posts(30, -6).map((post) => post.id));
  assert.ok(refreshedTools.length <= 2);
});

test('disabled views contain only posts and do not mutate the source objects', () => {
  const source = posts(20);
  const before = structuredClone(source);
  const plan = planFeedFlow(source, { enabled: false, previewAds: true });
  assert.ok(plan.every((entry) => entry.kind === 'post'));
  assert.deepEqual(source, before);
});

test('advertising placeholder is separate, sparse, and opt-in for local preview only', () => {
  assert.equal(planFeedFlow(posts(30)).some((entry) => entry.kind === 'ad-preview'), false);
  const preview = planFeedFlow(posts(30), { previewAds: true });
  const ads = preview.filter((entry) => entry.kind === 'ad-preview');
  assert.equal(ads.length, 1);
  assert.equal(ads[0].anchorId, 'post-23');
  assert.equal(preview.filter((entry) => entry.kind === 'tool').length, 2);
  assert.ok(preview.some((entry) => entry.kind === 'post' && entry.post.id === 'post-23'));
});

test('official tool cards use existing SVG icons and the feed handoff routes', () => {
  const expected = new Map([
    ['pixel-drawing', ['/draw/?workspace=1&social=1', '/assets/icons/pixieed/artwork.svg']],
    ['pixel-camera', ['/camera/?workspace=1&social=1', '/assets/icons/pixieed/camera.svg']],
    ['pixel-audio', ['/audio/?workspace=1&social=1', '/assets/icons/pixieed/music.svg']],
    ['spot-difference', ['/spot-difference/?social=1', '/assets/icons/pixieed/spot-difference.svg']]
  ]);
  assert.deepEqual(OFFICIAL_TOOL_CARDS.map((card) => card.id), [...expected.keys()]);
  for (const card of OFFICIAL_TOOL_CARDS) {
    assert.deepEqual([card.href, card.icon], expected.get(card.id));
    assert.ok(card.title && card.description);
    assert.ok(card.href.startsWith('/') && !card.href.startsWith('//'));
    assert.ok(existsSync(fileURLToPath(new URL(card.icon.slice(1), root))));
  }
});

test('feed hides comment controls and explains guest recovery limits', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../feed/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /data-pane="comments"|comment-form|コメントを送信|data-action="comment/);
  assert.match(html, /ゲストの作品や下書きは、このブラウザーセッションから利用できます/);
  assert.match(html, /別の端末・ブラウザー/);
  assert.match(html, /guestAccountDialog/);
  assert.match(html, /value="private" selected/);
  assert.match(html, /value="public">公開（フィードに掲載）/);
});
