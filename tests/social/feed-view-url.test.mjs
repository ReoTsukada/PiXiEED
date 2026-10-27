import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedViewUrl, readFeedQuery } from '../../js/social/app.mjs';

test('switching to a non-feed view removes the hidden search query', () => {
  assert.equal(feedViewUrl('https://example.test/social/?q=lantern', 'mine'), '/social/?view=mine');
  assert.equal(feedViewUrl('https://example.test/social/?q=lantern', 'saved'), '/social/?view=saved');
});

test('returning to feed restores its saved query in the URL', () => {
  assert.equal(feedViewUrl('https://example.test/social/?view=mine', 'feed', 'lantern'), '/social/?q=lantern');
  assert.equal(readFeedQuery('https://example.test/social/?q=lantern', 'feed'), 'lantern');
});

test('startup ignores a query for a non-feed view and trims feed queries', () => {
  assert.equal(readFeedQuery('https://example.test/social/?q=lantern&view=mine'), '');
  assert.equal(readFeedQuery('https://example.test/social/?q=%20lantern%20'), 'lantern');
});

test('startup captures the feed query before a preference-driven view transition', () => {
  const source = readFileSync(new URL('../../js/social/app.mjs', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('async function start()'));
  const capture = start.indexOf('const initialQuery = readFeedQuery(windowRef.location.href, initialView);');
  const transition = start.indexOf("await navigateView(initialView, { push: false, restore: false });");
  const restore = start.indexOf('state.query = initialQuery;');
  assert.ok(capture >= 0 && transition > capture && restore > transition,
    'capture the synthetic startup query before navigation can replace its URL, then restore it');
});

test('clearing the query and returning through browser history preserve intended URLs', () => {
  const cleared = feedViewUrl('https://example.test/social/?q=lantern', 'feed', '');
  assert.equal(cleared, '/social/');
  const feedEntry = feedViewUrl('https://example.test/social/?q=lantern', 'feed', 'lantern');
  const mineEntry = feedViewUrl(feedEntry, 'mine', '');
  assert.equal(feedViewUrl(mineEntry, 'feed', 'lantern'), feedEntry);
});

test('view transitions preserve shared URL fragments and unrelated duplicate parameters', () => {
  const shared = 'https://example.test/social/?q=lantern&ref=share&ref=archive#post=fixture';
  const mine = feedViewUrl(shared, 'mine');
  assert.equal(mine, '/social/?ref=share&ref=archive&view=mine#post=fixture');
  assert.equal(feedViewUrl(mine, 'feed', 'lantern'), '/social/?ref=share&ref=archive&q=lantern#post=fixture');
});
