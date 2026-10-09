import {
  ANIMATION_MAX_DIMENSION, ANIMATION_METADATA_BUDGET, ANIMATION_PIXEL_BUDGET, estimateRetainedAnimationBytes,
  resizeAnimation, validateAnimation,
} from './animation-core.mjs';
import { DRAW_ANIMATION_HISTORY_MAX_BYTES } from './draw-animation-history.mjs';

export const DRAW_SPRITE_SCALE_MEMORY_MAX_BYTES = 64 * 1024 * 1024;
const TILE_BYTES = 32 * 32;

function status(animation, percent, width, height, changed, allowed, reason = null, reasonCode = null, details = {}) {
  return { ...details, width, height, percent, changed, allowed, reason, ...(reasonCode ? { reasonCode } : {}) };
}

/**
 * Preflight one uniform, nearest-neighbour sprite scale. The peak estimate
 * conservatively sums current retained state, a full existing undo allowance,
 * two copies of the target logical pool (resizeAnimation builds a pool, then
 * makeAnimation copies its tile buffers), source rendering and its 8-byte per
 * pixel Array.from array, target cel working buffers, two metadata-sized
 * allocations, one tile scratch buffer, and composition scratch (13 bytes per
 * target canvas pixel for number-array and Int16 caches). It is a deterministic
 * safety estimate, not an engine-level measurement; it does not rely on GC.
 */
export function planSpriteScale(animation, percent) {
  validateAnimation(animation);
  if (!Number.isFinite(percent) || percent <= 0) {
    return status(animation, percent, null, null, false, false, '倍率は0より大きい有限数で指定してください。', 'SPRITE_SCALE_PERCENT_INVALID');
  }
  const rawWidth = Math.round(animation.width * percent / 100);
  const rawHeight = Math.round(animation.height * percent / 100);
  const width = Math.max(1, rawWidth); const height = Math.max(1, rawHeight);
  const changed = width !== animation.width || height !== animation.height;
  const area = width * height;
  const sourcePixels = animation.width * animation.height;
  const targetLogicalPixels = area * animation.frames.length * animation.layers.length;
  const retainedSourceBytes = estimateRetainedAnimationBytes([animation]);
  const details = { targetLogicalPixels, retainedSourceBytes, historyMaxBytes: DRAW_ANIMATION_HISTORY_MAX_BYTES };
  if (!changed) return status(animation, percent, width, height, false, true, '丸め後の寸法が同じため、元データを維持します。', 'SPRITE_SCALE_NOOP', details);
  if (width > ANIMATION_MAX_DIMENSION || height > ANIMATION_MAX_DIMENSION) {
    return status(animation, percent, width, height, true, false, `変更後の寸法 ${width}×${height}px は上限の${ANIMATION_MAX_DIMENSION}pxを超えます。`, 'SPRITE_SCALE_DIMENSION_LIMIT', details);
  }
  if (targetLogicalPixels > ANIMATION_PIXEL_BUDGET) {
    return status(animation, percent, width, height, true, false,
      `全${animation.frames.length}コマ・${animation.layers.length}レイヤーの画素数 ${targetLogicalPixels.toLocaleString('ja-JP')} は上限 ${ANIMATION_PIXEL_BUDGET.toLocaleString('ja-JP')} を超えます。`,
      'SPRITE_SCALE_PIXEL_BUDGET', details);
  }
  if (retainedSourceBytes > DRAW_ANIMATION_HISTORY_MAX_BYTES) {
    return status(animation, percent, width, height, true, false,
      `現在のデータ ${retainedSourceBytes.toLocaleString('ja-JP')} bytes はUndo履歴上限 ${DRAW_ANIMATION_HISTORY_MAX_BYTES.toLocaleString('ja-JP')} bytesを超えるため、倍率変更できません。`,
      'SPRITE_SCALE_HISTORY_LIMIT', details);
  }
  const sourceCelRenderBytes = sourcePixels;
  const sourceCelNumberArrayBytes = sourcePixels * 8;
  const targetCelWorkingBytes = area * 2 + TILE_BYTES;
  const compositeScratchBytes = area * 13;
  const existingHistoryBytes = DRAW_ANIMATION_HISTORY_MAX_BYTES;
  const targetPoolCopiesBytes = targetLogicalPixels * 2;
  const metadataWorkingBytes = ANIMATION_METADATA_BUDGET * 2;
  const estimatedPeakBytes = retainedSourceBytes + existingHistoryBytes + targetPoolCopiesBytes
    + sourceCelRenderBytes + sourceCelNumberArrayBytes + metadataWorkingBytes
    + targetCelWorkingBytes + compositeScratchBytes;
  Object.assign(details, { existingHistoryBytes, targetPoolCopiesBytes, metadataWorkingBytes });
  details.estimatedPeakBytes = estimatedPeakBytes;
  details.memoryMaxBytes = DRAW_SPRITE_SCALE_MEMORY_MAX_BYTES;
  if (estimatedPeakBytes > DRAW_SPRITE_SCALE_MEMORY_MAX_BYTES) {
    return status(animation, percent, width, height, true, false,
      `一時メモリ見積もり ${estimatedPeakBytes.toLocaleString('ja-JP')} bytes は上限 ${DRAW_SPRITE_SCALE_MEMORY_MAX_BYTES.toLocaleString('ja-JP')} bytesを超えます。`,
      'SPRITE_SCALE_MEMORY_LIMIT', details);
  }
  return status(animation, percent, width, height, true, true, null, null, details);
}

/** Scale every frame and layer uniformly; rejected operations leave the immutable source untouched. */
export function scaleSpriteAnimation(animation, percent) {
  const plan = planSpriteScale(animation, percent);
  if (!plan.allowed) {
    const error = new RangeError(plan.reason);
    error.code = plan.reasonCode;
    error.plan = plan;
    throw error;
  }
  if (!plan.changed) return animation;
  const scaled = resizeAnimation(animation, plan.width, plan.height, { resample: 'nearest' });
  const targetRetainedBytes = estimateRetainedAnimationBytes([scaled]);
  if (targetRetainedBytes > DRAW_ANIMATION_HISTORY_MAX_BYTES) {
    const reason = `倍率変更後のデータ ${targetRetainedBytes.toLocaleString('ja-JP')} bytes はUndo履歴上限 ${DRAW_ANIMATION_HISTORY_MAX_BYTES.toLocaleString('ja-JP')} bytesを超えます。元データと履歴は変更していません。`;
    const error = new RangeError(reason);
    error.code = 'SPRITE_SCALE_TARGET_HISTORY_LIMIT';
    error.plan = status(animation, percent, plan.width, plan.height, true, false, reason, error.code, {
      ...plan, targetRetainedBytes,
    });
    throw error;
  }
  return scaled;
}
