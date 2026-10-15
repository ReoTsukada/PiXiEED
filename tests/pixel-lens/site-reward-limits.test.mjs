import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCameraGifLimits, resolveLensGifFpsLimit } from '../../js/creation/output-reward-policy.mjs';
import { REWARD_LIMITS } from '../../js/ads/site-reward-config.mjs';

test('camera GIF captures use configurable free/pass caps and keep the existing pass capture when policy is off', () => {
  const camera = REWARD_LIMITS.camera;
  const free = { maxMs: camera.freeGifSeconds * 1000, fps: camera.freeGifFps };
  const reward = { maxMs: camera.rewardGifSeconds * 1000, fps: camera.rewardGifFps };
  assert.deepEqual(resolveCameraGifLimits({ policyEnabled: true, entitled: false }), free);
  assert.deepEqual(resolveCameraGifLimits({ policyEnabled: true, entitled: true }), reward);
  assert.deepEqual(resolveCameraGifLimits({ policyEnabled: false, entitled: false }), reward);
});

test('LENS free FPS comes from the common reward configuration', () => {
  assert.equal(resolveLensGifFpsLimit({ policyEnabled: true, entitled: false }), REWARD_LIMITS.lens.freeGifFps);
  assert.equal(resolveLensGifFpsLimit({ policyEnabled: true, entitled: true }), REWARD_LIMITS.lens.rewardGifFps);
  assert.equal(resolveLensGifFpsLimit({ policyEnabled: false, entitled: false }), REWARD_LIMITS.lens.rewardGifFps);
});
