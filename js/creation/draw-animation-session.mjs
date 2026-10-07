import { createAnimationFromDraw, getAnimationCelDocument, composeAnimationFrame, writeAnimationCel, setAnimationPalette } from './animation-core.mjs';
import { createDrawAnimationHistory } from './draw-animation-history.mjs';
import { validateDrawDocument } from './draw-core.mjs';

/** Only the active cel and two flattened neighbouring layer caches use full canvas buffers. */
export function createDrawAnimationSession(document) {
  let animation = createAnimationFromDraw(document);
  let frameId = animation.frames[0].id, layerId = animation.layers[0].id;
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
      const nextFrame = selection?.frameId ?? next.frames[0].id, nextLayer = selection?.layerId ?? next.layers.at(-1).id;
      assertSelection(next, { frameId: nextFrame, layerId: nextLayer });
      history = createDrawAnimationHistory(next); selectionPast = []; selectionFuture = [];
      return restore(next, { frameId: nextFrame, layerId: nextLayer });
    },
    prepareDocument,
    commitDocument(doc) { prepareDocument(doc)(); },
    apply(next, selection) {
      const chosen = selection ?? currentSelection;
      assertSelection(next, chosen);
      commitHistory(next, chosen);
      return restore(history.current, chosen);
    },
    undo() {
      if (!history.undo()) return null;
      selectionFuture.push({ ...currentSelection }); currentSelection = selectionPast.pop() ?? { frameId: history.current.frames[0].id, layerId: history.current.layers.at(-1).id };
      return restore(history.current, currentSelection);
    },
    redo() {
      if (!history.redo()) return null;
      selectionPast.push({ ...currentSelection }); trimSelectionPast(); currentSelection = selectionFuture.pop() ?? { frameId: history.current.frames[0].id, layerId: history.current.layers.at(-1).id };
      return restore(history.current, currentSelection);
    },
    composite(doc, changed = null) {
      const visible = animation.layers.find((layer) => layer.id === layerId)?.visible;
      const put = (index) => { composed[index] = above[index] >= 0 ? above[index] : visible && doc.pixels[index] >= 0 ? doc.pixels[index] : below[index]; };
      if (changed) { for (const index of changed) put(index); } else for (let index = 0; index < composed.length; index++) put(index);
      return { ...doc, pixels: composed };
    }
  };
}
