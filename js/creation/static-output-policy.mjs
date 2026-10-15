import { hasSiteReward, isSiteRewardPolicyEnabled } from '../ads/site-reward.mjs?rev=20261016-color-capability-1';
import { REWARD_LIMITS } from '../ads/site-reward-config.mjs?rev=20261016-color-capability-1';

// Keep the standard file size familiar, with an optional larger target during
// an active site reward. These limits apply only when enlarging still images.
export const STATIC_IMAGE_FREE_LONG_EDGE = REWARD_LIMITS.staticImage?.freeLongEdge ?? 2048;
export const STATIC_IMAGE_REWARD_LONG_EDGE = REWARD_LIMITS.staticImage?.rewardLongEdge ?? 4096;
export const STATIC_IMAGE_MAX_EDGE = 4096;
export const STATIC_IMAGE_MAX_PIXELS = 16 * 1024 * 1024;

export function resolveStaticImageLongEdge({
  policyEnabled = isSiteRewardPolicyEnabled(),
  entitled = hasSiteReward(),
  legacyLongEdge = STATIC_IMAGE_FREE_LONG_EDGE
} = {}) {
  if (!policyEnabled) return legacyLongEdge;
  return entitled ? STATIC_IMAGE_REWARD_LONG_EDGE : STATIC_IMAGE_FREE_LONG_EDGE;
}

/**
 * Return integer nearest-neighbour output geometry. An image already larger
 * than the target is kept at its original dimensions; target limits never
 * silently shrink an existing image.
 */
export function staticImageOutputGeometry(width, height, {
  longEdge = resolveStaticImageLongEdge(),
  maxEdge = STATIC_IMAGE_MAX_EDGE,
  maxPixels = STATIC_IMAGE_MAX_PIXELS
} = {}) {
  if (![width, height, longEdge, maxEdge, maxPixels].every(Number.isSafeInteger)
      || width < 1 || height < 1 || longEdge < 1 || maxEdge < 1 || maxPixels < 1) {
    throw new RangeError('invalid static image dimensions');
  }
  const currentLongEdge = Math.max(width, height);
  const edgeScale = Math.floor(Math.min(longEdge, maxEdge) / currentLongEdge);
  const pixelScale = Math.floor(Math.sqrt(maxPixels / (width * height)));
  const scale = Math.max(1, Math.min(edgeScale, pixelScale));
  return { width: width * scale, height: height * scale, scale };
}

/** Maximum new still-image dimension for Output's resize controls. */
export function resolveStaticImageOutputLimit({
  policyEnabled = isSiteRewardPolicyEnabled(),
  entitled = hasSiteReward(),
  sourceWidth = 0,
  sourceHeight = 0,
  maxEdge = STATIC_IMAGE_MAX_EDGE
} = {}) {
  const policyLimit = resolveStaticImageLongEdge({ policyEnabled, entitled });
  const originalLongEdge = Math.max(0, Number(sourceWidth) || 0, Number(sourceHeight) || 0);
  return Math.min(maxEdge, Math.max(policyLimit, originalLongEdge));
}

export function resolveStaticImageMaxScale(width, height, {
  policyEnabled = isSiteRewardPolicyEnabled(),
  entitled = hasSiteReward(),
  sourceWidth = width,
  sourceHeight = height,
  maxEdge = STATIC_IMAGE_MAX_EDGE,
  maxPixels = STATIC_IMAGE_MAX_PIXELS
} = {}) {
  if (![width, height, sourceWidth, sourceHeight, maxEdge, maxPixels].every(Number.isSafeInteger)
      || width < 1 || height < 1 || sourceWidth < 0 || sourceHeight < 0 || maxEdge < 1 || maxPixels < 1) {
    throw new RangeError('invalid static image dimensions');
  }
  const longEdgeLimit = resolveStaticImageOutputLimit({ policyEnabled, entitled, sourceWidth, sourceHeight, maxEdge });
  const edgeScale = Math.floor(longEdgeLimit / Math.max(width, height));
  const pixelScale = Math.floor(Math.sqrt(maxPixels / (width * height)));
  return Math.max(1, Math.min(edgeScale || 1, pixelScale || 1));
}

/** Gate only newly generated still images above the free long edge. */
export function isRewardedStaticImageSize(width, height, {
  policyEnabled = isSiteRewardPolicyEnabled(),
  sourceWidth = 0,
  sourceHeight = 0
} = {}) {
  if (!policyEnabled) return false;
  if (![width, height, sourceWidth, sourceHeight].every(Number.isSafeInteger)
      || width < 1 || height < 1 || sourceWidth < 0 || sourceHeight < 0) return false;
  const requestedEdge = Math.max(width, height);
  const originalEdge = Math.max(sourceWidth, sourceHeight);
  // Existing large source files remain ordinary saves and can be retained.
  return requestedEdge > STATIC_IMAGE_FREE_LONG_EDGE && requestedEdge > originalEdge;
}

/** Enlarging a pixel image must use the same positive integer factor on both axes. */
export function isIntegerStaticImageEnlargement(width, height, sourceWidth, sourceHeight) {
  if (![width, height, sourceWidth, sourceHeight].every(Number.isSafeInteger)
      || width < 1 || height < 1 || sourceWidth < 1 || sourceHeight < 1) return false;
  if (width <= sourceWidth && height <= sourceHeight) return true;
  return width % sourceWidth === 0
    && height % sourceHeight === 0
    && width / sourceWidth === height / sourceHeight;
}
