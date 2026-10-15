import { REWARD_LIMITS } from '../ads/site-reward-config.mjs?rev=20261016-color-capability-1';

export const OUTPUT_FREE_BATCH_LIMIT = REWARD_LIMITS.output.freeBatch;
export const OUTPUT_REWARD_BATCH_LIMIT = REWARD_LIMITS.output.rewardBatch;
export const OUTPUT_REWARDED_FORMATS = new Set(['svg', 'apng', 'mp4', 'webm']);

export function isRewardedOutputFormat(format) {
  return OUTPUT_REWARDED_FORMATS.has(String(format || '').toLowerCase());
}

export function resolveOutputBatchSelection(items, selectedIds, { policyEnabled = false, entitled = false } = {}) {
  const selected = (items || []).filter((item) => selectedIds?.has?.(item.id));
  const limit = policyEnabled && !entitled ? OUTPUT_FREE_BATCH_LIMIT : OUTPUT_REWARD_BATCH_LIMIT;
  return { selected, limit, allowed: selected.length > 0 && selected.length <= limit };
}

export function triggerOutputBatchDownload(items, { documentRef = globalThis.document, urlForItem } = {}) {
  if (!documentRef?.createElement || !documentRef?.body || typeof urlForItem !== 'function') return 0;
  for (const item of items || []) {
    const link = documentRef.createElement('a');
    link.href = urlForItem(item);
    link.download = item.filename;
    link.hidden = true;
    documentRef.body.append(link);
    link.click();
    link.remove();
  }
  return (items || []).length;
}

export function resolveCameraGifLimits({ policyEnabled = false, entitled = false } = {}) {
  const camera = REWARD_LIMITS.camera;
  if (!policyEnabled) return { maxMs: camera.rewardGifSeconds * 1000, fps: camera.rewardGifFps };
  return entitled
    ? { maxMs: camera.rewardGifSeconds * 1000, fps: camera.rewardGifFps }
    : { maxMs: camera.freeGifSeconds * 1000, fps: camera.freeGifFps };
}

export function resolveLensGifFpsLimit({ policyEnabled = false, entitled = false } = {}) {
  return policyEnabled && !entitled ? REWARD_LIMITS.lens.freeGifFps : REWARD_LIMITS.lens.rewardGifFps;
}
