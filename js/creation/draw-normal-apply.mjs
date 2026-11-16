import { NORMAL_MAP_PALETTE, ensureAnimationNormalLayer, getAnimationCelDocument, hasAnimationCelContent, writeAnimationCel } from './animation-core.mjs?rev=20261116-normal-release-2';
import { updateNormalLightingPixels } from './draw-animation-session.mjs?rev=20261117-normal-apply-1';

const MAX_SIDE = 1028;
const paletteVectors = NORMAL_MAP_PALETTE.map(color => {
  const vector = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 127.5 - 1);
  const length = Math.hypot(...vector) || 1;
  return { color: [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16)), vector: vector.map(value => value / length) };
});

function validateNormal(normal, animation, frameId) {
  if (!normal || !Number.isSafeInteger(normal.width) || !Number.isSafeInteger(normal.height)
      || normal.width < 1 || normal.height < 1 || normal.width > MAX_SIDE || normal.height > MAX_SIDE) {
    throw new RangeError('ノーマルマップの大きさを確認してください。');
  }
  if (normal.width !== animation.width || normal.height !== animation.height) {
    throw new RangeError('ノーマルマップとキャンバスの大きさが一致しません。');
  }
  if (!(normal.rgba instanceof Uint8ClampedArray) || normal.rgba.length !== normal.width * normal.height * 4) {
    throw new TypeError('ノーマルマップのRGBAデータが不正です。');
  }
  if (normal.format !== 'opengl' && normal.format !== 'directx') {
    throw new TypeError('ノーマルマップの形式はOpenGLまたはDirectXを指定してください。');
  }
  if (!animation.frames.some(frame => frame.id === frameId)) throw new TypeError('指定したフレームがありません。');
}

/** Quantize generated RGBA normals to the animation's fixed 17-direction OpenGL palette. */
export function quantizeNormalMapForAnimation(normal) {
  if (!normal || !Number.isSafeInteger(normal.width) || !Number.isSafeInteger(normal.height)
      || normal.width < 1 || normal.height < 1 || normal.width > MAX_SIDE || normal.height > MAX_SIDE
      || !(normal.rgba instanceof Uint8ClampedArray) || normal.rgba.length !== normal.width * normal.height * 4
      || !['opengl', 'directx'].includes(normal.format)) {
    throw new TypeError('生成ノーマルマップの形式またはRGBAデータが不正です。');
  }
  const rgba = new Uint8ClampedArray(normal.rgba.length);
  const pixels = new Uint8Array(normal.width * normal.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    if (normal.rgba[offset + 3] === 0) {
      pixels[index] = 0;
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = rgba[offset + 3] = 0;
      continue;
    }
    let nx = normal.rgba[offset] / 127.5 - 1;
    let ny = normal.rgba[offset + 1] / 127.5 - 1;
    if (normal.format === 'directx') ny = -ny;
    let nz = normal.rgba[offset + 2] / 127.5 - 1;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    let bestIndex = 0, bestDot = -Infinity;
    for (let paletteIndex = 0; paletteIndex < paletteVectors.length; paletteIndex += 1) {
      const candidate = paletteVectors[paletteIndex].vector;
      const dot = nx * candidate[0] + ny * candidate[1] + nz * candidate[2];
      if (dot > bestDot) { bestDot = dot; bestIndex = paletteIndex; }
    }
    pixels[index] = bestIndex + 1;
    const color = paletteVectors[bestIndex].color;
    rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255;
  }
  return { width: normal.width, height: normal.height, pixels, rgba, format: 'opengl' };
}

/** Prepare a one-cel normal replacement without mutating the source timeline. */
export function prepareNormalMapApplication(animation, frameId, normal) {
  validateNormal(normal, animation, frameId);
  const mapped = quantizeNormalMapForAnimation(normal);
  const withLayer = ensureAnimationNormalLayer(animation);
  const layer = withLayer.layers.find(item => item.role === 'normal');
  if (!layer || layer.locked) throw new TypeError('ノーマルマップレイヤーのロックを解除してください。');
  const replacesExisting = hasAnimationCelContent(withLayer, frameId, layer.id);
  const nextAnimation = writeAnimationCel(withLayer, frameId, layer.id, {
    width: mapped.width, height: mapped.height, pixels: mapped.pixels
  });
  return {
    animation: nextAnimation,
    normalLayerId: layer.id,
    frameId,
    replacesExisting,
    mapped: { width: mapped.width, height: mapped.height, rgba: mapped.rgba, format: 'opengl' }
  };
}

/** Convert a compositor frame, updating only dirty indexed pixels when a target exists. */
export function normalSourceRgba(document, target = null, changed = null) {
  const width = document?.width, height = document?.height, length = width * height * 4;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
    throw new TypeError('照明表示用の元画像が不正です。');
  }
  if (document.rgba) {
    if (!(document.rgba instanceof Uint8Array || document.rgba instanceof Uint8ClampedArray) || document.rgba.length !== length) throw new TypeError('照明表示用RGBAの画素数が不正です。');
    return document.rgba instanceof Uint8ClampedArray ? document.rgba : new Uint8ClampedArray(document.rgba);
  }
  if (!Array.isArray(document.palette) || !document.pixels || document.pixels.length !== width * height) throw new TypeError('照明表示用の色番号が不正です。');
  if (!(target instanceof Uint8ClampedArray) || target.length !== length) { target = new Uint8ClampedArray(length); changed = null; }
  const colors = document.palette.map(color => {
    if (typeof color !== 'string' || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color)) throw new TypeError('照明表示用の色が不正です。');
    return [1, 3, 5, 7].map((offset, channel) => channel === 3 && color.length === 7 ? 255 : Number.parseInt(color.slice(offset, offset + 2), 16));
  });
  const put = index => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= width * height) throw new RangeError('照明表示用の更新位置が不正です。');
    const paletteIndex = document.pixels[index], offset = index * 4;
    if (!Number.isSafeInteger(paletteIndex) || paletteIndex < -1 || paletteIndex >= colors.length) throw new TypeError('照明表示用の色番号が不正です。');
    if (paletteIndex === -1) target.fill(0, offset, offset + 4);
    else target.set(colors[paletteIndex], offset);
  };
  if (changed) for (const index of changed) put(index);
  else for (let index = 0; index < width * height; index += 1) put(index);
  return target;
}

/** One active frame: bounded normal/source/light buffers, including canvases above 4 MiB. */
export function createNormalLightingFrameCache() {
  let current = null;
  return {
    clear() { current = null; },
    render(animation, frameId, normalLayer, sourceDocument, options, changed = null) {
      if (!animation || !normalLayer || normalLayer.role !== 'normal' || !normalLayer.visible) { current = null; return sourceDocument; }
      if (sourceDocument.width !== animation.width || sourceDocument.height !== animation.height) throw new RangeError('照明表示と作品の大きさが一致しません。');
      const settingsKey = JSON.stringify(options);
      const fresh = !current || current.animation !== animation || current.frameId !== frameId || current.layerId !== normalLayer.id || current.settingsKey !== settingsKey;
      if (fresh) {
        const cel = getAnimationCelDocument(animation, frameId, normalLayer.id);
        current = {
          animation, frameId, layerId: normalLayer.id, settingsKey,
          source: normalSourceRgba(sourceDocument),
          normal: { width: cel.width, height: cel.height, rgba: normalSourceRgba(cel), format: 'opengl' },
          rendered: { width: sourceDocument.width, height: sourceDocument.height, rgba: new Uint8ClampedArray(sourceDocument.width * sourceDocument.height * 4) }
        };
      } else current.source = normalSourceRgba(sourceDocument, current.source, changed);
      updateNormalLightingPixels({ width: sourceDocument.width, height: sourceDocument.height, rgba: current.source }, current.normal, options, current.rendered.rgba, fresh ? null : changed);
      return current.rendered;
    }
  };
}
