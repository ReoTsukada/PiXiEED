import { composeAnimationFrame, setLayerProperties } from './animation-core.mjs?rev=20261012-animation-core-contract-1';

/** Compose an export image without changing the saved layer visibility. */
export function composeOutputFrame(animation, frameId, { includeMusic = false } = {}) {
  if (typeof includeMusic !== 'boolean') throw new TypeError('includeMusic must be a boolean');
  if (!includeMusic) return composeAnimationFrame(animation, frameId, { excludeMusic: true });

  const musicLayer = animation.layers.find(layer => layer.role === 'music');
  if (!musicLayer || musicLayer.visible) return composeAnimationFrame(animation, frameId);
  return composeAnimationFrame(setLayerProperties(animation, musicLayer.id, { visible: true }), frameId);
}
