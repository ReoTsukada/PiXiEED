import { createAnimationFromDraw, createAnimationHistory, getAnimationCelDocument, composeAnimationFrame, writeAnimationCel, setAnimationPalette } from './animation-core.mjs';

/** Only the active cel and two flattened neighbouring layer caches use full canvas buffers. */
export function createDrawAnimationSession(document) {
  let animation = createAnimationFromDraw(document);
  let frameId = animation.frames[0].id, layerId = animation.layers[0].id;
  let history = createAnimationHistory(animation), below, above, composed;
  const selections = new WeakMap();
  function rebuild() {
    const index = animation.layers.findIndex((layer) => layer.id === layerId);
    below = Int16Array.from(composeAnimationFrame(animation, frameId, { layerIds: animation.layers.slice(0, index).map((layer) => layer.id) }).pixels);
    above = Int16Array.from(composeAnimationFrame(animation, frameId, { layerIds: animation.layers.slice(index + 1).map((layer) => layer.id) }).pixels);
    composed = new Int16Array(animation.width * animation.height);
  }
  function remember() { selections.set(animation, { frameId, layerId }); }
  function restore(next, selection = selections.get(next)) {
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
    select(frame, layer) { return restore(animation, { frameId: frame ?? frameId, layerId: layer ?? layerId }); },
    load(next, selection) { history = createAnimationHistory(next); return restore(next, selection); },
    commitDocument(doc) {
      let next = animation;
      if (doc.palette.some((color, index) => color !== next.palette[index]) || doc.palette.length !== next.palette.length) next = setAnimationPalette(next, doc.palette);
      next = writeAnimationCel(next, frameId, layerId, { width: doc.width, height: doc.height, pixels: Uint8Array.from(doc.pixels, (value) => value + 1) });
      history.commit(next); animation = next; remember();
    },
    apply(next, selection) { history.commit(next); return restore(next, selection ?? { frameId, layerId }); },
    undo() { return history.undo() ? restore(history.current) : null; },
    redo() { return history.redo() ? restore(history.current) : null; },
    composite(doc, changed = null) {
      const visible = animation.layers.find((layer) => layer.id === layerId)?.visible;
      const put = (index) => { composed[index] = above[index] >= 0 ? above[index] : visible && doc.pixels[index] >= 0 ? doc.pixels[index] : below[index]; };
      if (changed) { for (const index of changed) put(index); } else for (let index = 0; index < composed.length; index++) put(index);
      return { ...doc, pixels: composed };
    }
  };
}
