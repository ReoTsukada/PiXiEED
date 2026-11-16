import { createAnimationFromDraw, ensureAnimationMusicLayer, ensureAnimationNormalLayer, getAnimationCelDocument, getAnimationLayerPalette, NORMAL_MAP_PALETTE, composeAnimationFrame, composeAnimationFrameRgba, animationNeedsRgba, writeAnimationCel, setAnimationPalette } from './animation-core.mjs?rev=20261116-normal-release-2';
import { createDrawAnimationHistory } from './draw-animation-history.mjs?rev=20261116-normal-release-2';
import { validateDrawDocument } from './draw-core.mjs?rev=20261116-normal-release-2';

const normalRgba = NORMAL_MAP_PALETTE.map(color => [
  Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16), 255
]);

// Editor display only: normal colors sit above all art, independently of layer order.
// Transparent/erased normal pixels restore the exact art RGBA, including its alpha.
function overlayNormalCel(doc, background, target, visible, opacity = 1, changed = null) {
  const put = index => {
    const offset = index * 4, color = visible && normalRgba[doc.pixels[index]];
    if (!color || opacity === 0) {
      for (let channel = 0; channel < 4; channel++) target[offset + channel] = background[offset + channel];
      return;
    }
    const behindAlpha = background[offset + 3] / 255 * (1 - opacity), alpha = opacity + behindAlpha;
    for (let channel = 0; channel < 3; channel++) target[offset + channel] = Math.round((color[channel] * opacity + background[offset + channel] * behindAlpha) / alpha);
    target[offset + 3] = Math.round(alpha * 255);
  };
  if (changed) { for (const index of changed) put(index); }
  else for (let index = 0; index < doc.pixels.length; index++) put(index);
  return { width: doc.width, height: doc.height, rgba: target };
}

/** Prepare a new normal layer without changing an existing normal cel or any artwork. */
export function prepareDrawNormalLayer(animation, frameId, { initialFill = 'transparent' } = {}) {
  if (!['transparent', 'flat'].includes(initialFill)) throw new TypeError('ノーマルマップの作成方法を確認してください。');
  if (!animation.frames.some(frame => frame.id === frameId)) throw new TypeError('指定したフレームがありません。');
  if (animation.layers.some(layer => layer.role === 'normal')) return animation;
  let next = ensureAnimationNormalLayer(animation);
  if (initialFill === 'flat') {
    const source = composeAnimationFrameRgba(animation, frameId, { excludeMusic: true });
    const layer = next.layers.find(layer => layer.role === 'normal');
    const pixels = Uint8Array.from({ length: source.width * source.height }, (_, index) => source.rgba[index * 4 + 3] ? 1 : 0);
    next = writeAnimationCel(next, frameId, layer.id, { width: source.width, height: source.height, pixels });
  }
  return next;
}

/** Only the active cel and flattened display caches use full canvas buffers. */
export function createDrawAnimationSession(document, { musicLayer: musicMode = false } = {}) {
  let animation = createAnimationFromDraw(document);
  if (musicMode) animation = ensureAnimationMusicLayer(animation);
  let frameId = animation.frames[0].id, layerId = musicMode ? animation.layers.find((layer) => layer.role === 'music').id : animation.layers[0].id;
  let history = createDrawAnimationHistory(animation), below, above, composed, rgba, normalBackground = null, cacheRgba = null;
  let selectionPast = [], selectionFuture = [];
  let normalOverlayOpacity = 1, normalOverlayDirty = true;
  let currentSelection = { frameId, layerId };
  // Keep the selection attached to the current history entry separate from
  // the user's temporary frame/layer selection. Redo must restore the layer
  // that was active when its timeline snapshot was committed.
  let historySelection = { ...currentSelection };
  function selectedLayer() { return animation.layers.find((layer) => layer.id === layerId); }
  function isNormalLayer() { return selectedLayer()?.role === 'normal'; }
  function rebuild() {
    cacheRgba = animationNeedsRgba(animation);
    normalBackground = null; normalOverlayDirty = true;
    if (isNormalLayer()) {
      below = above = composed = null;
      normalBackground = composeAnimationFrameRgba(animation, frameId).rgba;
      rgba = new Uint8ClampedArray(normalBackground);
      return;
    }
    if (cacheRgba) { below = above = composed = null; rgba = new Uint8ClampedArray(animation.width * animation.height * 4); return; }
    rgba = null;
    const index = animation.layers.findIndex((layer) => layer.id === layerId);
    below = Int16Array.from(composeAnimationFrame(animation, frameId, { layerIds: animation.layers.slice(0, index).map((layer) => layer.id) }).pixels);
    above = Int16Array.from(composeAnimationFrame(animation, frameId, { layerIds: animation.layers.slice(index + 1).map((layer) => layer.id) }).pixels);
    composed = new Int16Array(animation.width * animation.height);
  }
  function remember() { currentSelection = { frameId, layerId }; }
  function trimSelectionPast() {
    const count = history.snapshot().past.length;
    while (selectionPast.length > count) selectionPast.shift();
  }
  function commitHistory(next, selection = currentSelection) {
    if (!history.commit(next)) return false;
    // A mode/layer selection immediately before an edit belongs to the state
    // being left. Once committed, the new entry's selection is frozen here;
    // later view-only selection changes must not rewrite its redo destination.
    selectionPast.push({ ...currentSelection }); selectionFuture = [];
    trimSelectionPast(); currentSelection = { ...selection }; historySelection = { ...selection }; return true;
  }
  function assertSelection(item, value) {
    if (!value || typeof value.frameId !== 'string' || typeof value.layerId !== 'string' ||
        !item.frames.some((frame) => frame.id === value.frameId) || !item.layers.some((layer) => layer.id === value.layerId)) {
      throw new TypeError('アニメーションの選択状態が不正です。');
    }
  }
  function prepareDocument(doc) {
    // Validate signed values before the Uint8 adapter, so invalid values cannot wrap.
    validateDrawDocument(doc);
    const original = animation, originalFrame = frameId, originalLayer = layerId;
    let next = animation;
    if (isNormalLayer()) {
      const layerPalette = getAnimationLayerPalette(next, originalLayer);
      if (doc.palette.length !== NORMAL_MAP_PALETTE.length
          || doc.palette.some((color, index) => color !== NORMAL_MAP_PALETTE[index])
          || layerPalette.some((color, index) => color !== NORMAL_MAP_PALETTE[index])) {
        throw new TypeError('ノーマルマップの固定パレットを変更できません。');
      }
    } else if (doc.palette.some((color, index) => color !== next.palette[index]) || doc.palette.length !== next.palette.length) {
      next = setAnimationPalette(next, doc.palette);
    }
    next = writeAnimationCel(next, frameId, layerId, { width: doc.width, height: doc.height, pixels: Uint8Array.from(doc.pixels, value => value + 1) });
    // Palette, indices and tile budgets have passed without changing either history.
    const commit = () => {
      if (animation !== original || frameId !== originalFrame || layerId !== originalLayer) throw new TypeError('選択の対象が変わりました。');
      commitHistory(next); animation = next; remember();
    };
    Object.defineProperty(commit, 'animation', { value: next });
    return commit;
  }
  function prepareTimeline(next, selection = currentSelection, preferMusic = false) {
    if (!musicMode) return { next, selection };
    const wasMusic = animation.layers.find((layer) => layer.id === selection?.layerId)?.role === 'music';
    next = ensureAnimationMusicLayer(next);
    const nextMusic = next.layers.find((layer) => layer.role === 'music');
    const chosen = { ...selection };
    if (!next.frames.some((frame) => frame.id === chosen.frameId)) chosen.frameId = next.frames[0].id;
    if (!next.layers.some((layer) => layer.id === chosen.layerId) || wasMusic || preferMusic) chosen.layerId = nextMusic.id;
    return { next, selection: chosen };
  }
  function restore(next, selection = currentSelection) {
    animation = next;
    frameId = animation.frames.some((frame) => frame.id === selection?.frameId) ? selection.frameId : animation.frames[0].id;
    layerId = animation.layers.some((layer) => layer.id === selection?.layerId) ? selection.layerId : animation.layers.at(-1).id;
    remember(); rebuild(); return getAnimationCelDocument(animation, frameId, layerId);
  }
  remember(); rebuild();
  return {
    get animation() { return animation; }, get frameId() { return frameId; }, get layerId() { return layerId; },
    get canUndo() { return history.canUndo; }, get canRedo() { return history.canRedo; },
    get locked() { return animation.layers.find((layer) => layer.id === layerId)?.locked; },
    get musicLayerId() { return animation.layers.find((layer) => layer.role === 'music')?.id ?? null; },
    document() { return getAnimationCelDocument(animation, frameId, layerId); },
    /** Preserve each immutable timeline snapshot's active frame and layer. */
    snapshot() {
      const timeline = history.snapshot();
      return Object.freeze({ timeline, selections: Object.freeze({
        past: Object.freeze(selectionPast.map((item) => Object.freeze({ ...item }))),
        current: Object.freeze({ ...currentSelection }),
        historyCurrent: Object.freeze({ ...historySelection }),
        future: Object.freeze(selectionFuture.map((item) => Object.freeze({ ...item })))
      }) });
    },
    /** Restore history and all per-snapshot selections after validating everything first. */
    restore(snapshot) {
      const timeline = snapshot?.timeline, states = snapshot?.selections;
      if (!timeline || !states || !Array.isArray(states.past) || !Array.isArray(states.future) ||
          states.past.length !== timeline.past?.length || states.future.length !== timeline.future?.length) {
        throw new TypeError('アニメーション履歴のスナップショットが不正です。');
      }
      const nextPast = [...timeline.past], nextFuture = [...timeline.future], nextCurrent = timeline.current;
      nextPast.forEach((item, index) => assertSelection(item, states.past[index]));
      assertSelection(nextCurrent, states.current);
      const nextHistoryCurrent = states.historyCurrent ?? states.current;
      assertSelection(nextCurrent, nextHistoryCurrent);
      nextFuture.forEach((item, index) => assertSelection(item, states.future[index]));
      // history.restore validates the animation snapshots and byte/entry limits before mutating.
      history.restore({ current: nextCurrent, past: nextPast, future: nextFuture });
      selectionPast = states.past.map((item) => ({ ...item }));
      currentSelection = { ...states.current };
      historySelection = { ...nextHistoryCurrent };
      selectionFuture = states.future.map((item) => ({ ...item }));
      animation = nextCurrent; frameId = currentSelection.frameId; layerId = currentSelection.layerId;
      rebuild();
      return getAnimationCelDocument(animation, frameId, layerId);
    },
    select(frame, layer) { return restore(animation, { frameId: frame ?? frameId, layerId: layer ?? layerId }); },
    load(next, selection) {
      const preferred = selection ?? { frameId: next.frames[0].id, layerId: musicMode ? null : next.layers.at(-1).id };
      const prepared = prepareTimeline(next, preferred, musicMode && !selection);
      next = prepared.next;
      const chosen = musicMode ? prepared.selection : { frameId: selection?.frameId ?? next.frames[0].id, layerId: selection?.layerId ?? next.layers.at(-1).id };
      assertSelection(next, chosen);
      history = createDrawAnimationHistory(next); selectionPast = []; selectionFuture = [];
      historySelection = { ...chosen };
      return restore(next, chosen);
    },
    prepareDocument,
    commitDocument(doc) { prepareDocument(doc)(); },
    apply(next, selection) {
      const prepared = prepareTimeline(next, selection ?? currentSelection);
      next = prepared.next;
      const chosen = prepared.selection;
      assertSelection(next, chosen);
      commitHistory(next, chosen);
      return restore(history.current, chosen);
    },
    undo() {
      if (!history.undo()) return null;
      selectionFuture.push({ ...historySelection }); currentSelection = selectionPast.pop() ?? { frameId: history.current.frames[0].id, layerId: musicMode ? history.current.layers.find((layer) => layer.role === 'music').id : history.current.layers.at(-1).id };
      historySelection = { ...currentSelection };
      return restore(history.current, currentSelection);
    },
    redo() {
      if (!history.redo()) return null;
      selectionPast.push({ ...historySelection }); trimSelectionPast(); currentSelection = selectionFuture.pop() ?? { frameId: history.current.frames[0].id, layerId: musicMode ? history.current.layers.find((layer) => layer.role === 'music').id : history.current.layers.at(-1).id };
      historySelection = { ...currentSelection };
      return restore(history.current, currentSelection);
    },
    replaceMusicDocument(doc, { record = true } = {}) {
      if (!musicMode) throw new TypeError('音楽レイヤーが有効なセッションではありません。');
      if (typeof record !== 'boolean') throw new TypeError('履歴オプションが不正です。');
      validateDrawDocument(doc);
      const original = animation, originalFrame = frameId, originalLayer = layerId;
      let next = animation;
      if (doc.palette.some((color, index) => color !== next.palette[index]) || doc.palette.length !== next.palette.length) next = setAnimationPalette(next, doc.palette);
      const musicId = next.layers.find((layer) => layer.role === 'music')?.id;
      next = writeAnimationCel(next, frameId, musicId, { width: doc.width, height: doc.height, pixels: Uint8Array.from(doc.pixels, (value) => value + 1) });
      if (animation !== original || frameId !== originalFrame || layerId !== originalLayer) throw new TypeError('選択の対象が変わりました。');
      if (record) commitHistory(next, currentSelection);
      else { history.reset(next); selectionPast = []; selectionFuture = []; historySelection = { ...currentSelection }; }
      animation = next; remember(); rebuild();
      return getAnimationCelDocument(animation, frameId, musicId);
    },
    /** View-only opacity never changes layer opacity, pixels, history, or exported normals. */
    setNormalOverlayOpacity(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('重ね表示の濃度は0〜1で指定してください。');
      if (normalOverlayOpacity !== value) { normalOverlayOpacity = value; normalOverlayDirty = true; }
    },
    /** Playback preview follows the current edit domain without changing selection. */
    previewFrame(frame) {
      if (!isNormalLayer()) return animationNeedsRgba(animation) ? composeAnimationFrameRgba(animation, frame) : composeAnimationFrame(animation, frame);
      const doc = getAnimationCelDocument(animation, frame, layerId);
      const background = composeAnimationFrameRgba(animation, frame).rgba;
      return overlayNormalCel(doc, background, new Uint8ClampedArray(background), selectedLayer()?.visible !== false, normalOverlayOpacity);
    },
    composite(doc, changed = null) {
      if (isNormalLayer()) {
        if (normalOverlayDirty) changed = null;
        normalOverlayDirty = false;
        return overlayNormalCel(doc, normalBackground, rgba, selectedLayer()?.visible !== false, normalOverlayOpacity, changed);
      }
      if (cacheRgba !== animationNeedsRgba(animation)) { rebuild(); changed = null; }
      if (animationNeedsRgba(animation) || doc.palette.some(color => color.length === 9 && color.slice(7).toLowerCase() !== 'ff')) {
        if (!rgba || rgba.length !== doc.width * doc.height * 4) { rgba = new Uint8ClampedArray(doc.width * doc.height * 4); changed = null; }
        return composeAnimationFrameRgba(animation, frameId, { override: { layerId, document: doc }, target: rgba, ...(changed ? { changed } : {}) });
      }
      if (musicMode && animation.layers.find((layer) => layer.id === layerId)?.role === 'music') return { ...doc, pixels: new Int16Array(doc.pixels) };
      const visible = animation.layers.find((layer) => layer.id === layerId)?.visible;
      const put = (index) => { composed[index] = above[index] >= 0 ? above[index] : visible && doc.pixels[index] >= 0 ? doc.pixels[index] : below[index]; };
      if (changed) { for (const index of changed) put(index); } else for (let index = 0; index < composed.length; index++) put(index);
      return { ...doc, pixels: composed };
    }
  };
}

/** Update a cached lit RGBA frame, optionally touching only known changed pixels. */
export function updateNormalLightingPixels(source, normal, options = {}, target = new Uint8ClampedArray(source?.rgba?.length ?? 0), changed = null) {
  if (!source || !normal || !Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height)
      || source.width < 1 || source.height < 1 || normal.width !== source.width || normal.height !== source.height
      || !(source.rgba instanceof Uint8ClampedArray) || !(normal.rgba instanceof Uint8ClampedArray)
      || source.rgba.length !== source.width * source.height * 4 || normal.rgba.length !== source.rgba.length
      || !(target instanceof Uint8ClampedArray) || target.length !== source.rgba.length) {
    throw new TypeError('normal lighting images must be matching RGBA buffers');
  }
  const { azimuth = 315, elevation = 45, ambient = 0.25, intensity = 1, lightColor = '#ffffff',
    specular = 0, roughness = 0.5, shadeUnpainted = true } = options;
  if (![azimuth, elevation, ambient, intensity, specular, roughness].every(Number.isFinite)
      || elevation < 0 || elevation > 90 || ambient < 0 || ambient > 1 || intensity < 0 || intensity > 2
      || specular < 0 || specular > 1 || roughness < 0.05 || roughness > 1
      || typeof lightColor !== 'string' || !/^#[\da-f]{6}$/i.test(lightColor)
      || typeof shadeUnpainted !== 'boolean') throw new TypeError('normal lighting settings are invalid');
  const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
  const lx = Math.cos(az) * Math.cos(el), ly = -Math.sin(az) * Math.cos(el), lz = Math.sin(el);
  const halfLength = Math.hypot(lx, ly, lz + 1);
  const hx = lx / halfLength, hy = ly / halfLength, hz = (lz + 1) / halfLength;
  const exponent = Math.max(1, 2 / (roughness * roughness) - 2);
  const light = [1, 3, 5].map(offset => Number.parseInt(lightColor.slice(offset, offset + 2), 16) / 255);
  const put = index => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= source.width * source.height) throw new RangeError('changed pixel is outside the image');
    const offset = index * 4, unpainted = normal.rgba[offset + 3] === 0;
    if (unpainted && !shadeUnpainted) { target.set(source.rgba.subarray(offset, offset + 4), offset); return; }
    const alpha = source.rgba[offset + 3]; target[offset + 3] = alpha;
    if (!alpha) { target[offset] = target[offset + 1] = target[offset + 2] = 0; return; }
    let nx = unpainted ? 0 : normal.rgba[offset] / 127.5 - 1;
    let ny = unpainted ? 0 : normal.rgba[offset + 1] / 127.5 - 1;
    if (normal.format === 'directx') ny = -ny;
    let nz = unpainted ? 1 : normal.rgba[offset + 2] / 127.5 - 1;
    const length = Math.hypot(nx, ny, nz) || 1; nx /= length; ny /= length; nz /= length;
    const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
    const direct = (1 - ambient) * diffuse * intensity;
    const highlight = specular && diffuse > 0 && nz > 0
      ? 255 * specular * intensity * Math.pow(Math.max(0, Math.min(1, nx * hx + ny * hy + nz * hz)), exponent) : 0;
    for (let channel = 0; channel < 3; channel += 1) {
      target[offset + channel] = Math.round(source.rgba[offset + channel] * (ambient + direct * light[channel]) + highlight * light[channel]);
    }
  };
  if (changed) for (const index of changed) put(index);
  else for (let index = 0; index < source.width * source.height; index += 1) put(index);
  return { width: source.width, height: source.height, rgba: target };
}
