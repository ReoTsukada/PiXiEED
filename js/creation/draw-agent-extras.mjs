import { ANIMATION_MAX_DIMENSION, composeAnimationFrameRgba, getAnimationCelDocument, writeAnimationCel } from './animation-core.mjs?rev=20261116-normal-release-2';
import { createNormalMap } from './draw-normal-map.mjs?rev=20261117-normal-apply-1';
import { prepareNormalMapApplication } from './draw-normal-apply.mjs?rev=20261117-normal-apply-1';
import { DRAW_TEXT_FONTS, applyTextMaskToDocument, loadDrawTextFont, rasterizeTextMask } from './draw-text.mjs?rev=20261116-normal-release-2';

const normalKeys = new Set(['type', 'frameId', 'method', 'strength', 'radius', 'invertHeight']);
const textKeys = new Set(['type', 'frameId', 'layerId', 'text', 'x', 'y', 'colorIndex', 'font', 'fontSize']);
const textFonts = new Map(DRAW_TEXT_FONTS.map(font => [font.id, font]));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.has(key));
}

function resolveFrame(animation, active, value) {
  const frameId = value === '$active' ? active?.frameId : value;
  if (typeof frameId !== 'string' || !animation.frames.some(frame => frame.id === frameId)) {
    throw new TypeError('指定したフレームがありません。');
  }
  return frameId;
}

function validateAnimationAndActive(animation, active) {
  if (!animation || !Array.isArray(animation.frames) || !Array.isArray(animation.layers)
      || !Number.isSafeInteger(animation.width) || !Number.isSafeInteger(animation.height)
      || animation.width < 1 || animation.height < 1
      || animation.width > ANIMATION_MAX_DIMENSION || animation.height > ANIMATION_MAX_DIMENSION) {
    throw new TypeError('アニメーションの状態が不正です。');
  }
  if (!isRecord(active) || typeof active.frameId !== 'string' || typeof active.layerId !== 'string') {
    throw new TypeError('アクティブなフレームとレイヤーを指定してください。');
  }
}

/** Prepare bounded normal generation and local text drawing as detached animation edits. */
export async function prepareDrawAgentExtraOperation(animation, active, raw) {
  if (!isRecord(raw) || typeof raw.type !== 'string' || !['normal.generate', 'text.draw'].includes(raw.type)) return null;
  validateAnimationAndActive(animation, active);

  if (raw.type === 'normal.generate') {
    if (!exactKeys(raw, normalKeys) || !Object.hasOwn(raw, 'frameId')) throw new TypeError('ノーマルマップ生成の項目を確認してください。');
    const frameId = resolveFrame(animation, active, raw.frameId);
    const options = {
      method: raw.method === undefined ? 'silhouette' : raw.method,
      strength: raw.strength === undefined ? 2 : raw.strength,
      radius: raw.radius === undefined ? 3 : raw.radius,
      invertHeight: raw.invertHeight === undefined ? false : raw.invertHeight,
      format: 'opengl'
    };
    if (!['silhouette', 'luminance'].includes(options.method)) throw new TypeError('ノーマルマップ生成方法が不正です。');
    if (!Number.isFinite(options.strength) || options.strength < 0 || options.strength > 8) throw new RangeError('strengthは0〜8で指定してください。');
    if (!Number.isInteger(options.radius) || options.radius < 1 || options.radius > 32) throw new RangeError('radiusは1〜32で指定してください。');
    if (typeof options.invertHeight !== 'boolean') throw new TypeError('invertHeightはbooleanで指定してください。');
    const source = composeAnimationFrameRgba(animation, frameId, { excludeMusic: true });
    const normal = createNormalMap(source, options);
    const existingNormalLayer = animation.layers.find(layer => layer.role === 'normal');
    const prepared = prepareNormalMapApplication(animation, frameId, normal);
    let nextAnimation = prepared.animation;
    if (existingNormalLayer) {
      const before = getAnimationCelDocument(animation, frameId, existingNormalLayer.id).pixels;
      const after = getAnimationCelDocument(prepared.animation, frameId, prepared.normalLayerId).pixels;
      let sameCel = before.length === after.length;
      for (let index = 0; sameCel && index < before.length; index += 1) sameCel = before[index] === after[index];
      if (sameCel) nextAnimation = animation;
    }
    return {
      animation: nextAnimation,
      active: { ...active },
      result: { changed: nextAnimation !== animation, type: raw.type, frameId, normalLayerId: prepared.normalLayerId, replacesExisting: prepared.replacesExisting }
    };
  }

  if (!exactKeys(raw, textKeys) || !['frameId', 'layerId', 'text', 'x', 'y', 'colorIndex'].every(key => Object.hasOwn(raw, key))) {
    throw new TypeError('文字描画の項目を確認してください。');
  }
  const frameId = resolveFrame(animation, active, raw.frameId);
  const layerId = raw.layerId === '$active' ? active.layerId : raw.layerId;
  if (typeof layerId !== 'string') throw new TypeError('指定したレイヤーがありません。');
  const layer = animation.layers.find(item => item.id === layerId);
  if (!layer) throw new TypeError('指定したレイヤーがありません。');
  if (layer.locked) throw new TypeError('レイヤーのロックを解除してください。');
  if (layer.role === 'music' || layer.role === 'normal') throw new TypeError('文字は通常の描画レイヤーに追加してください。');
  if (typeof raw.text !== 'string' || raw.text.length < 1 || raw.text.length > 256) throw new RangeError('文字は1〜256文字で指定してください。');
  if (!Number.isInteger(raw.x) || raw.x < -65535 || raw.x > 65535 || !Number.isInteger(raw.y) || raw.y < -65535 || raw.y > 65535) {
    throw new RangeError('文字の位置は-65535〜65535pxで指定してください。');
  }
  if (!Number.isInteger(raw.colorIndex) || raw.colorIndex < 0 || raw.colorIndex >= animation.palette.length) throw new RangeError('文字色をパレットから選んでください。');
  const fontId = raw.font === undefined ? 'sans' : raw.font;
  const font = textFonts.get(fontId);
  if (!font) throw new TypeError('利用できるフォントを指定してください。');
  const fontSize = raw.fontSize === undefined ? 8 : raw.fontSize;
  if (!Number.isInteger(fontSize) || fontSize < 1 || fontSize > 128) throw new RangeError('文字の大きさを1〜128pxで指定してください。');

  const documentRef = active.documentRef ?? globalThis.document;
  const fontFamily = await loadDrawTextFont(fontId);
  const mask = rasterizeTextMask({
    text: raw.text, font: fontFamily, fontSize, x: raw.x, y: raw.y,
    width: animation.width, height: animation.height, documentRef
  });
  const sourceCel = getAnimationCelDocument(animation, frameId, layerId);
  const editable = {
    width: animation.width,
    height: animation.height,
    palette: [...animation.palette],
    schemaVersion: 1,
    pixels: [...sourceCel.pixels]
  };
  const nextDocument = applyTextMaskToDocument(editable, mask, { colorIndex: raw.colorIndex });
  if (nextDocument === editable) {
    return { animation, active: { ...active }, result: { changed: false, type: raw.type, frameId, layerId } };
  }
  const nextAnimation = writeAnimationCel(animation, frameId, layerId, {
    width: animation.width, height: animation.height,
    pixels: Uint8Array.from(nextDocument.pixels, value => value + 1)
  });
  return { animation: nextAnimation, active: { ...active }, result: { changed: true, type: raw.type, frameId, layerId } };
}
