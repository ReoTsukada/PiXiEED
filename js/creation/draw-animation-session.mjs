import { createAnimationFromDraw, ensureAnimationMusicLayer, getAnimationCelDocument, composeAnimationFrame, writeAnimationCel, setAnimationPalette } from './animation-core.mjs';
import { createDrawAnimationHistory } from './draw-animation-history.mjs';
import { validateDrawDocument } from './draw-core.mjs';

/** Only the active cel and two flattened neighbouring layer caches use full canvas buffers. */
export function createDrawAnimationSession(document, { musicLayer: musicMode = false } = {}) {
  let animation = createAnimationFromDraw(document);
  if (musicMode) animation = ensureAnimationMusicLayer(animation);
  let frameId = animation.frames[0].id, layerId = musicMode ? animation.layers.find((layer) => layer.role === 'music').id : animation.layers[0].id;
  let history = createDrawAnimationHistory(animation), below, above, composed;
  let selectionPast = [], selectionFuture = [];
  let currentSelection = { frameId, layerId };
  function rebuild() {
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
    selectionPast.push({ ...currentSelection }); selectionFuture = [];
    trimSelectionPast(); currentSelection = { ...selection }; return true;
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
    if (doc.palette.some((color, index) => color !== next.palette[index]) || doc.palette.length !== next.palette.length) next = setAnimationPalette(next, doc.palette);
    next = writeAnimationCel(next, frameId, layerId, { width: doc.width, height: doc.height, pixels: Uint8Array.from(doc.pixels, value => value + 1) });
    // Palette, indices and tile budgets have passed without changing either history.
    return () => {
      if (animation !== original || frameId !== originalFrame || layerId !== originalLayer) throw new TypeError('選択の対象が変わりました。');
      commitHistory(next); animation = next; remember();
    };
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
      nextFuture.forEach((item, index) => assertSelection(item, states.future[index]));
      // history.restore validates the animation snapshots and byte/entry limits before mutating.
      history.restore({ current: nextCurrent, past: nextPast, future: nextFuture });
      selectionPast = states.past.map((item) => ({ ...item }));
      currentSelection = { ...states.current };
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
      selectionFuture.push({ ...currentSelection }); currentSelection = selectionPast.pop() ?? { frameId: history.current.frames[0].id, layerId: musicMode ? history.current.layers.find((layer) => layer.role === 'music').id : history.current.layers.at(-1).id };
      return restore(history.current, currentSelection);
    },
    redo() {
      if (!history.redo()) return null;
      selectionPast.push({ ...currentSelection }); trimSelectionPast(); currentSelection = selectionFuture.pop() ?? { frameId: history.current.frames[0].id, layerId: musicMode ? history.current.layers.find((layer) => layer.role === 'music').id : history.current.layers.at(-1).id };
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
      else { history.reset(next); selectionPast = []; selectionFuture = []; }
      animation = next; remember(); rebuild();
      return getAnimationCelDocument(animation, frameId, musicId);
    },
    composite(doc, changed = null) {
      if (musicMode && animation.layers.find((layer) => layer.id === layerId)?.role === 'music') return { ...doc, pixels: new Int16Array(doc.pixels) };
      const visible = animation.layers.find((layer) => layer.id === layerId)?.visible;
      const put = (index) => { composed[index] = above[index] >= 0 ? above[index] : visible && doc.pixels[index] >= 0 ? doc.pixels[index] : below[index]; };
      if (changed) { for (const index of changed) put(index); } else for (let index = 0; index < composed.length; index++) put(index);
      return { ...doc, pixels: composed };
    }
  };
}
