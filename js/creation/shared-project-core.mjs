import { validateAnimation, resizeAnimation, canvasResizeOffset, getAnimationCelDocument, serializeAnimationPool, createAnimationFromSerialized, ANIMATION_MAX_PALETTE_ENTRIES } from './animation-core.mjs?rev=20261016-color-capability-1';

const normalized = color => color.length === 7 ? `${color.toLowerCase()}ff` : color.toLowerCase();
const rgb = color => [1, 3, 5, 7].map(at => parseInt(color.slice(at, at + 2), 16));
function nearest(color, palette) {
  const value = rgb(normalized(color)); let best = 0, distance = Infinity;
  palette.forEach((candidate, index) => { const next = rgb(normalized(candidate)).reduce((sum, channel, axis) => sum + (channel - value[axis]) ** 2, 0); if (next < distance) { best = index; distance = next; } });
  return best;
}
/** A single immutable project change, including every hidden/locked cel. No inputs mutate. */
export function planSharedProjectSettings(animation, settings = {}) {
  validateAnimation(animation);
  const width = settings.width ?? animation.width, height = settings.height ?? animation.height;
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= 256)) throw new RangeError('幅と高さは1〜256pxの整数で指定してください。');
  const requestedPalette = settings.palette || animation.palette;
  const preservePalette = settings.palette == null || (Array.isArray(settings.palette)
    && settings.palette.length === animation.palette.length
    && settings.palette.every((color, index) => typeof color === 'string' && color.toLowerCase() === animation.palette[index].toLowerCase()));
  // Resizing without changing colors must preserve RGBA entries exactly. Only
  // explicit palette changes use the shared-project opaque-palette policy.
  const palette = preservePalette ? [...animation.palette] : requestedPalette.map(color => typeof color === 'string' ? color.toLowerCase() : color);
  if (!palette.length || palette.length > ANIMATION_MAX_PALETTE_ENTRIES || (!preservePalette && palette.some(color => typeof color !== 'string' || !/^#[\da-f]{6}(?:[\da-f]{2})?$/.test(color)))) throw new TypeError(`共有パレットはRGBAカラー1〜${ANIMATION_MAX_PALETTE_ENTRIES}色で指定してください。`);
  if (!preservePalette && new Set(palette.map(normalized)).size !== palette.length) throw new TypeError('同じ色が重複しています。色を統合する場合は重複を取り除いてください。');
  const mapping = preservePalette ? animation.palette.map((_color, index) => index) : animation.palette.map(color => { if (normalized(color).endsWith('00')) return -1; const exact = palette.findIndex(candidate => normalized(candidate) === normalized(color)); return exact >= 0 ? exact : nearest(color, palette); });
  let croppedPixels = 0;
  const offset = canvasResizeOffset(animation.width, animation.height, width, height, 'center');
  if (width < animation.width || height < animation.height) for (const frame of animation.frames) for (const layer of animation.layers) {
    if (layer.role === 'music') continue; // Independent music pages are summarized by the shared music model.
    const doc = getAnimationCelDocument(animation, frame.id, layer.id);
    for (let y = 0; y < animation.height; y++) for (let x = 0; x < animation.width; x++) if (doc.pixels[y * animation.width + x] >= 0 && (x + offset.x < 0 || x + offset.x >= width || y + offset.y < 0 || y + offset.y >= height)) croppedPixels++;
  }
  const paletteChanged = !preservePalette && (palette.length !== animation.palette.length || palette.some((color, index) => normalized(color) !== normalized(animation.palette[index])));
  const sizeChanged = width !== animation.width || height !== animation.height;
  let next = sizeChanged ? resizeAnimation(animation, width, height, { anchor: 'center' }) : animation;
  if (paletteChanged) {
    const pooled = new Map();
    const tiles = serializeAnimationPool(next).map(tile => {
      if (tile.bytes) pooled.set(tile.tileId, tile.bytes);
      return { ...tile, bytes: Uint8Array.from(tile.bytes || pooled.get(tile.tileId), value => value ? mapping[value - 1] + 1 : 0) };
    });
    next = createAnimationFromSerialized({ ...next, palette }, tiles);
  }
  const remappedColors = preservePalette ? 0 : animation.palette.filter((color, index) => !normalized(color).endsWith('00') && normalized(color) !== normalized(palette[mapping[index]])).length;
  const musicImpact = `全${animation.frames.length}コマ・${animation.layers.filter(layer=>layer.role!=='music').length}描画レイヤーに適用。${width !== animation.width ? '幅が変わるため列の時刻とコマ長に影響します（通常は1列120tick、旧作品は保存されたコマ時間を維持）。' : '列の時間は維持。'}${height !== animation.height ? '高さが変わるため行の音程対応を再計算します。' : '行の音程対応は維持。'}${remappedColors ? '減色・色統合では音の対応が変わるため、新色の割当を音楽設定で確認してください。' : '同じ色の音割当は並び順によらず維持。'}透明画素・コマ・レイヤー構成は保持し、1回のUndoで戻せます。`;
  return { animation: next, owner: animation, summary: { croppedPixels, remappedColors, musicImpact }, changed: paletteChanged || sizeChanged };
}
