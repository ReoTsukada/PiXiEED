import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRewardedOutputFormat,
  resolveOutputBatchSelection,
  triggerOutputBatchDownload,
  OUTPUT_FREE_BATCH_LIMIT,
  OUTPUT_REWARD_BATCH_LIMIT
} from '../../js/creation/output-reward-policy.mjs';
import { REWARD_LIMITS } from '../../js/ads/site-reward-config.mjs';
import { isIntegerStaticImageEnlargement, isRewardedStaticImageSize, resolveStaticImageMaxScale, resolveStaticImageLongEdge, staticImageOutputGeometry } from '../../js/creation/static-output-policy.mjs';

test('advanced output formats are gated while ordinary exports stay free', () => {
  for (const format of ['svg', 'apng', 'mp4', 'webm']) assert.equal(isRewardedOutputFormat(format), true);
  for (const format of ['png', 'jpeg', 'gif', 'wav']) assert.equal(isRewardedOutputFormat(format), false);
});

test('static image output uses long-edge thresholds and keeps original large source dimensions', () => {
  assert.equal(resolveStaticImageLongEdge({ policyEnabled: true, entitled: false }), REWARD_LIMITS.staticImage.freeLongEdge);
  assert.equal(resolveStaticImageLongEdge({ policyEnabled: true, entitled: true }), REWARD_LIMITS.staticImage.rewardLongEdge);
  assert.equal(resolveStaticImageLongEdge({ policyEnabled: false, entitled: true }), REWARD_LIMITS.staticImage.freeLongEdge);
  assert.deepEqual(staticImageOutputGeometry(16, 16, { longEdge: 2048 }), { width: 2048, height: 2048, scale: 128 });
  assert.deepEqual(staticImageOutputGeometry(16, 16, { longEdge: 4096 }), { width: 4096, height: 4096, scale: 256 });
  assert.deepEqual(staticImageOutputGeometry(3000, 1500, { longEdge: 2048 }), { width: 3000, height: 1500, scale: 1 });
  assert.deepEqual(staticImageOutputGeometry(5000, 1500, { longEdge: 2048 }), { width: 5000, height: 1500, scale: 1 }, 'a target limit never silently shrinks source pixels');
  assert.deepEqual(staticImageOutputGeometry(16, 16, { longEdge: 4096, maxPixels: 1_000_000 }), { width: 992, height: 992, scale: 62 }, 'the existing pixel budget wins over the long-edge target');
});

test('only a newly requested still image above the free edge needs an active policy pass', () => {
  assert.equal(isRewardedStaticImageSize(2048, 1024, { policyEnabled: true, sourceWidth: 16, sourceHeight: 8 }), false);
  assert.equal(isRewardedStaticImageSize(4096, 2048, { policyEnabled: true, sourceWidth: 16, sourceHeight: 8 }), true);
  assert.equal(isRewardedStaticImageSize(3000, 1500, { policyEnabled: true, sourceWidth: 3000, sourceHeight: 1500 }), false);
  assert.equal(isRewardedStaticImageSize(4096, 2048, { policyEnabled: true, sourceWidth: 3000, sourceHeight: 1500 }), true);
  assert.equal(isRewardedStaticImageSize(4096, 2048, { policyEnabled: false, sourceWidth: 16, sourceHeight: 8 }), false);
  assert.equal(resolveStaticImageMaxScale(16, 8, { policyEnabled: true, entitled: false }), 128);
  assert.equal(resolveStaticImageMaxScale(16, 8, { policyEnabled: true, entitled: true }), 256);
});

test('static image enlargement preserves exact integer pixel multiples while retaining ordinary shrink behavior', () => {
  assert.equal(isIntegerStaticImageEnlargement(32, 16, 16, 8), true);
  assert.equal(isIntegerStaticImageEnlargement(48, 24, 16, 8), true);
  assert.equal(isIntegerStaticImageEnlargement(40, 20, 16, 8), false, 'non-integer scaling blurs pixel edges');
  assert.equal(isIntegerStaticImageEnlargement(32, 24, 16, 8), false, 'axis scales must match');
  assert.equal(isIntegerStaticImageEnlargement(16, 8, 16, 8), true);
  assert.equal(isIntegerStaticImageEnlargement(8, 4, 16, 8), true, 'ordinary shrink remains available');
  assert.equal(isIntegerStaticImageEnlargement(3000, 1500, 3000, 1500), true, 'saving a large source unchanged is allowed');
});

test('batch selection is one free item or at most eight with a pass, with no truncation', () => {
  const items = Array.from({ length: 9 }, (_, index) => ({ id: String(index), filename: `${index}.png` }));
  const one = new Set(['0']);
  assert.equal(resolveOutputBatchSelection(items, one, { policyEnabled: true, entitled: false }).allowed, true);
  const eight = new Set(items.slice(0, 8).map((item) => item.id));
  assert.equal(resolveOutputBatchSelection(items, eight, { policyEnabled: true, entitled: false }).allowed, false);
  assert.equal(resolveOutputBatchSelection(items, eight, { policyEnabled: true, entitled: true }).selected.length, 8);
  const nine = new Set(items.map((item) => item.id));
  const rejected = resolveOutputBatchSelection(items, nine, { policyEnabled: true, entitled: true });
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.selected.length, 9);
  assert.equal(OUTPUT_FREE_BATCH_LIMIT, REWARD_LIMITS.output.freeBatch);
  assert.equal(OUTPUT_REWARD_BATCH_LIMIT, REWARD_LIMITS.output.rewardBatch);
});

test('batch downloader triggers every selected item in order through a mocked browser', () => {
  const clicks = [];
  const anchors = [];
  const documentRef = {
    body: { append(link) { anchors.push(link); } },
    createElement(tag) {
      assert.equal(tag, 'a');
      return { click() { clicks.push(this.download); }, remove() { this.removed = true; } };
    }
  };
  const items = [{ id: 'a', filename: 'a.png' }, { id: 'b', filename: 'b.gif' }];
  const count = triggerOutputBatchDownload(items, { documentRef, urlForItem: (item) => `blob:${item.id}` });
  assert.equal(count, 2);
  assert.deepEqual(clicks, ['a.png', 'b.gif']);
  assert.deepEqual(anchors.map((anchor) => anchor.href), ['blob:a', 'blob:b']);
  assert.equal(anchors.every((anchor) => anchor.removed), true);
});
