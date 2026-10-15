const DEFAULT_LIMITS = Object.freeze({ colors: 32, rewardColors: 64, layers: 3, rewardLayers: 8, frames: 16, rewardFrames: 128 });

function colorKey(value) {
  const hex = String(value || '').toLowerCase();
  if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/.test(hex)) return null;
  const rgba = hex.length === 7 ? `${hex}ff` : hex;
  return rgba.endsWith('00') ? null : rgba;
}

/** Count distinct, visible RGBA colors used by indexed pixels. Fully transparent entries do not count. */
export function countDrawRgbaColors(palette, usedIndices) {
  const colors = new Set();
  for (const index of usedIndices || []) {
    if (index < 0) continue;
    const key = colorKey(palette?.[index]);
    if (key) colors.add(key);
  }
  return colors.size;
}

/** Assign the stable free-prefix by ascending used palette index, deduplicated by RGBA. */
export function getDrawBonusColorKeys(palette, usedIndices, freeLimit = 32) {
  if (!Number.isSafeInteger(freeLimit) || freeLimit < 0) throw new RangeError('freeLimit must be a non-negative integer');
  const keys = [];
  for (const index of [...new Set(usedIndices || [])].filter(value => Number.isInteger(value) && value >= 0).sort((a, b) => a - b)) {
    const key = colorKey(palette?.[index]);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys.slice(freeLimit);
}

/** True only when every old bonus-color pixel remains the same RGBA at that position. */
export function preservesDrawBonusColorPixels(beforePixels, afterPixels, beforePalette, afterPalette, bonusColors, { oneBased = false } = {}) {
  if (!beforePixels || !afterPixels || beforePixels.length !== afterPixels.length) return false;
  const protectedKeys = bonusColors instanceof Set ? bonusColors : new Set(bonusColors || []);
  const oldAt = value => colorKey(beforePalette?.[value - Number(oneBased)]);
  const nextAt = value => colorKey(afterPalette?.[value - Number(oneBased)]);
  for (let index = 0; index < beforePixels.length; index += 1) {
    const oldValue = beforePixels[index], nextValue = afterPixels[index];
    const oldColor = oneBased && oldValue === 0 || !oneBased && oldValue < 0 ? null : oldAt(oldValue);
    const nextColor = oneBased && nextValue === 0 || !oneBased && nextValue < 0 ? null : nextAt(nextValue);
    if ((protectedKeys.has(oldColor) || protectedKeys.has(nextColor)) && oldColor !== nextColor) return false;
  }
  return true;
}

export function createSiteRewardDrawPolicy({
  enabled = () => false,
  hasReward = () => false,
  requireReward = () => false,
  limits = DEFAULT_LIMITS
} = {}) {
  const active = () => Boolean(enabled());
  const rewarded = () => active() && Boolean(hasReward());
  const capture = (feature = 'draw', { request = false } = {}) => {
    const wasEnabled = active();
    const wasRewarded = wasEnabled && Boolean(hasReward());
    const requested = wasEnabled && request && !wasRewarded ? Boolean(requireReward(feature)) : false;
    return Object.freeze({ enabled: wasEnabled, entitled: wasRewarded || requested });
  };
  const deny = (reason) => ({ allowed: false, reason });
  function validate(before, after, { lease = capture(), target = null, mutation = 'edit' } = {}) {
    // A flag-off rollout must behave byte-for-byte like the existing editor.
    if (!lease?.enabled) return { allowed: true, reason: '' };
    const colorLimit = Number(limits.colors ?? DEFAULT_LIMITS.colors);
    const layerLimit = Number(limits.layers ?? DEFAULT_LIMITS.layers);
    const frameLimit = Number(limits.frames ?? DEFAULT_LIMITS.frames);
    const rewardColorLimit = Number(limits.rewardColors ?? DEFAULT_LIMITS.rewardColors);
    const rewardLayerLimit = Number(limits.rewardLayers ?? DEFAULT_LIMITS.rewardLayers);
    const rewardFrameLimit = Number(limits.rewardFrames ?? DEFAULT_LIMITS.rewardFrames);
    if (lease.entitled) {
      if (after.colors > rewardColorLimit) return deny(`使用中の色は最大${rewardColorLimit}色です。`);
      if (after.layers > rewardLayerLimit) return deny(`レイヤーは最大${rewardLayerLimit}枚です。`);
      if (after.frames > rewardFrameLimit) return deny(`コマは最大${rewardFrameLimit}個です。`);
      return { allowed: true, reason: '' };
    }
    if (target?.layerIndex >= layerLimit && mutation === 'edit') return deny(`レイヤー${layerLimit + 1}以降は特典中に編集できます。作品はそのまま表示されています。`);
    if (target?.frameIndex >= frameLimit && mutation === 'edit') return deny(`コマ${frameLimit + 1}以降は特典中に編集できます。作品はそのまま表示されています。`);
    if (after.layers > layerLimit && after.layers > before.layers) return deny(`レイヤーは無料では${layerLimit}枚までです。特典中は最大${limits.rewardLayers ?? 8}枚まで追加できます。`);
    if (after.frames > frameLimit && after.frames > before.frames) return deny(`コマは無料では${frameLimit}枚までです。特典中は最大${limits.rewardFrames ?? 128}枚まで追加できます。`);
    const beforeFreeColors = Number(before.freeColors ?? before.colors);
    const afterFreeColors = Number(after.freeColors ?? after.colors);
    if (afterFreeColors > colorLimit && afterFreeColors > beforeFreeColors) return deny(limits.rewardColors > colorLimit
      ? `無料で編集できる色は${colorLimit}色までです。特典中は最大${limits.rewardColors}色まで使えます。`
      : `使用中の色は最大${colorLimit}色です。`);
    return { allowed: true, reason: '' };
  }
  return Object.freeze({ enabled: active, hasReward: rewarded, capture, validate, limits: Object.freeze({ ...DEFAULT_LIMITS, ...limits }) });
}

export { DEFAULT_LIMITS as DEFAULT_DRAW_REWARD_LIMITS };
