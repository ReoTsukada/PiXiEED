import test from 'node:test';
import assert from 'node:assert/strict';
import { ordinaryAdConfig } from '../../data/ordinary-ad-config.mjs';
import { connectOptionalFeedAds, createFeedAdRuntime, createPublicFeedGutterGate, isPublicFeedGutterEligible } from '../../js/ads/ordinary-ad-entry.mjs';

const unit = Object.freeze({
  client: 'ca-pub-1234567890123456', slot: '1234567890', format: 'display',
  placement: 'gutter', size: { width: 300, height: 600 }, verifiedActive: true,
});
const eligible = Object.freeze({
  enabled: true, provider() {}, unit, pathname: '/feed/', origin: 'https://pixieed.jp', topLevel: true,
  search: '', hash: '', historyState: null,
  viewportWidth: 1440, viewportHeight: 900, publicFeed: true, feedReady: true,
  partialWarning: false, loading: false, empty: false, privateView: false,
  composerOpen: false, detailOpen: false, fullscreen: false, editor: false,
  trustedContentEligible: true, eligiblePostCount: 24, pageVisible: true,
});

test('public-feed side slot uses the distinct configured 300x600 gutter unit', () => {
  assert.equal(ordinaryAdConfig.feed.unit.slot, '4842737836');
  assert.equal(ordinaryAdConfig.feed.unit.placement, 'inline');
  assert.equal(ordinaryAdConfig.informationGutter.unit.slot, '8825932060');
  assert.deepEqual(ordinaryAdConfig.informationGutter.unit.size, { width: 300, height: 600 });
  assert.notEqual(ordinaryAdConfig.feed.unit.slot, ordinaryAdConfig.informationGutter.unit.slot);
  assert.equal(isPublicFeedGutterEligible({ ...eligible, unit: ordinaryAdConfig.informationGutter.unit }), true);
});

test('side slot is limited to the primary public feed with complete ready content', () => {
  for (const blocked of [
    { pathname: '/explore/' }, { pathname: '/tools/' }, { origin: 'http://pixieed.jp' },
    { search: '?post=opaque' }, { search: '?compose=art' }, { search: '?output=opaque' }, { search: '?q=cat' },
    { search: '?view=saved' }, { search: '?view=feed&view=feed' }, { hash: '#restore' }, { historyState: { socialDetail: 'post' } },
    { historyState: { socialComposer: true } }, { historyState: { socialView: 'mine' } },
    { historyState: { post: 'opaque' } }, { historyState: { compose: 'art' } }, { historyState: { output: 'opaque' } },
    { topLevel: false }, { viewportWidth: 1190 }, { viewportHeight: 671 },
    { eligiblePostCount: 23 }, { feedReady: false }, { partialWarning: true },
    { loading: true }, { empty: true }, { privateView: true }, { composerOpen: true },
    { detailOpen: true }, { fullscreen: true }, { editor: true }, { pageVisible: false },
    { enabled: false }, { provider: undefined }, { unit: { ...unit, verifiedActive: false } },
  ]) assert.equal(isPublicFeedGutterEligible({ ...eligible, ...blocked }), false, JSON.stringify(blocked));
  assert.equal(isPublicFeedGutterEligible({ ...eligible, pathname: '/' }), true, 'the homepage is also the public feed');
});

test('configured gutter runtime is independent of inline-feed activation', async () => {
  const gutterConfig = { enabled: true, unit };
  const runtime = await createFeedAdRuntime({ enabled: false }, { gutterConfig, gutterContentEligible: true });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.unit, null);
  assert.equal(runtime.provider, undefined);
  assert.equal(runtime.gutter.enabled, true);
  assert.equal(runtime.gutter.unit, unit);
  assert.equal(runtime.gutter.trustedContentEligible, true);
  assert.equal(typeof runtime.gutter.provider, 'function');
  const disabled = await createFeedAdRuntime({ enabled: false }, { gutterConfig: { enabled: false, unit } });
  assert.equal(disabled.gutter.enabled, false);
  assert.equal(disabled.gutter.provider, undefined);

  const ordinaryAds = { enabled: false, gutter: { enabled: false } };
  let renders = 0;
  const stop = connectOptionalFeedAds({ render() { renders++; } }, ordinaryAds, () => runtime);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ordinaryAds.enabled, false);
  assert.equal(ordinaryAds.gutter.enabled, true);
  assert.equal(renders, 1, 'gutter-only runtime reaches the feed without enabling inline ads');
  stop();
});

test('once attempted or retired, the public-feed gutter cannot remount during this page lifetime', () => {
  const gate = createPublicFeedGutterGate();
  assert.equal(gate.canAttempt(), true);
  assert.equal(gate.markAttempt(), true);
  assert.equal(gate.canAttempt(), false);
  gate.retire();
  assert.equal(gate.retired, true);
  assert.equal(gate.markAttempt(), false);
});
