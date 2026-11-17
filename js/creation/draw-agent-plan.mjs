import {
  ANIMATION_MAX_DIMENSION, ANIMATION_MAX_PALETTE_ENTRIES, addAnimationFrame, addAnimationLayer,
  getAnimationCelDocument, moveAnimationFrame, moveAnimationLayer, removeAnimationFrame,
  removeAnimationLayer, resizeAnimation, setAnimationFrameDuration, setAnimationPalette,
  setLayerProperties, validateAnimation, writeAnimationCel,
} from './animation-core.mjs?rev=20261116-normal-release-2';
import { drawShapePixels, sprayPixels } from './draw-tool-operations.mjs?rev=20261116-normal-release-2';
import { floodFill, strokePixels } from './draw-core.mjs?rev=20261116-normal-release-2';
import { pixelLineCells } from './pixel-input.mjs?rev=20261001-connected-editor-1';
import { captureDrawSelection, projectDrawSelection } from './draw-selection-operations.mjs?rev=20261116-normal-release-2';
import { lassoDrawSelection } from './draw-selection-input.mjs?rev=20261116-normal-release-2';
import { getAnimationLayerPalette } from './animation-core.mjs?rev=20261116-normal-release-2';
import { normalizeDrawAgentOperation, prepareDrawAgentColorAdjustment } from './draw-agent-operations.mjs?rev=20261117-fast-store-draw-1';

export const DRAW_AGENT_MAX_BATCH_OPERATIONS = 32;
export const DRAW_AGENT_MAX_PLANNED_PIXELS = 8_000_000;

const sameActive = (a, b) => a?.frameId === b?.frameId && a?.layerId === b?.layerId;
const asCelBytes = document => Uint8Array.from(document.pixels, value => value + 1);
const PLANNED_TYPES = new Set(['pixel.set', 'pixels.set', 'stroke', 'spray', 'shape', 'fill', 'cel.clear', 'selection.transform',
  'palette.add', 'palette.replace', 'color.adjust', 'layer.select', 'layer.add', 'layer.rename', 'layer.visibility',
  'layer.opacity', 'layer.lock', 'layer.move', 'layer.remove', 'frame.select', 'frame.add', 'frame.duration',
  'frame.move', 'frame.remove', 'canvas.resize', 'canvas.scale']);
const normalizeActive = (animation, active) => {
  const frameId = active?.frameId ?? animation.frames[0]?.id;
  const layerId = active?.layerId ?? animation.layers.find(layer => layer.role !== 'music')?.id;
  if (!animation.frames.some(frame => frame.id === frameId) || !animation.layers.some(layer => layer.id === layerId)) throw new TypeError('Active Draw frame or layer does not exist');
  return { frameId, layerId };
};
const resolveActiveIds = (raw, active) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const next = { ...raw };
  if (next.frameId === '$active') next.frameId = active.frameId;
  if (next.layerId === '$active') next.layerId = active.layerId;
  return next;
};
function assertWritable(animation, layerId) {
  const layer = animation.layers.find(item => item.id === layerId);
  if (!layer) throw new TypeError('Target layer does not exist');
  if (layer.role === 'music') throw new TypeError('Music layers cannot be changed by Draw operations');
  if (layer.locked) throw new Error('The target layer is locked');
}
function assertWork(animation, work) {
  if (work > DRAW_AGENT_MAX_PLANNED_PIXELS) throw new RangeError(`Draw operation plan exceeds ${DRAW_AGENT_MAX_PLANNED_PIXELS} pixels of work`);
  const timelinePixels = animation.width * animation.height * animation.frames.length * animation.layers.length;
  if (timelinePixels > DRAW_AGENT_MAX_PLANNED_PIXELS * 4) throw new RangeError('Draw timeline is too large for a bounded agent operation');
}
function celDocument(animation, frameId, layerId) { return getAnimationCelDocument(animation, frameId, layerId); }
function writeDocument(animation, frameId, layerId, document) {
  return writeAnimationCel(animation, frameId, layerId, { width: document.width, height: document.height, pixels: asCelBytes(document) });
}
function estimateOperationWork(animation, raw) {
  const area = animation.width * animation.height;
  const type = raw?.type;
  if (type === 'pixels.set') return raw.pixels?.length ?? area;
  if (type === 'pixel.set') return 1;
  if (type === 'stroke') {
    const points = raw.points ?? [];
    if (points.length > 1024) return DRAW_AGENT_MAX_PLANNED_PIXELS + 1;
    const brushArea = Math.min(256, (Number.isInteger(raw.brushSize) ? raw.brushSize : 1) ** 2);
    let length = points.length ? 1 : 0;
    for (let index = 1; index < points.length; index++) length += Math.max(Math.abs(points[index].x - points[index - 1].x), Math.abs(points[index].y - points[index - 1].y)) + 1;
    return Math.ceil(length * brushArea);
  }
  if (type === 'spray') {
    const radius = raw.radius ?? 2;
    return Math.max(1, raw.passes ?? 1) * (radius ? Math.min(24, Math.ceil(Math.PI * radius * radius / 2)) : 1);
  }
  if (['shape', 'fill', 'cel.clear'].includes(type)) return area;
  if (type === 'selection.transform') {
    return area + Math.min(area, (raw.width ?? raw.bounds?.width ?? animation.width) * (raw.height ?? raw.bounds?.height ?? animation.height))
      + (raw.polygon ? animation.height * raw.polygon.length : 0);
  }
  if (type === 'color.adjust' && raw.scope === 'cel') return area;
  if (type === 'color.adjust' && raw.scope === 'whole' || ['canvas.resize', 'canvas.scale'].includes(type)) {
    const width = type === 'canvas.resize' ? raw.width : type === 'canvas.scale' ? Math.round(animation.width * raw.percent / 100) : animation.width;
    const height = type === 'canvas.resize' ? raw.height : type === 'canvas.scale' ? Math.round(animation.height * raw.percent / 100) : animation.height;
    return animation.width * animation.height * animation.frames.length * animation.layers.length
      + Math.max(1, width) * Math.max(1, height) * animation.frames.length * animation.layers.length;
  }
  if (type === 'palette.add' || type === 'palette.replace') return area * animation.frames.length * animation.layers.length;
  return 1;
}

async function applyOne(animation, active, raw, { checkFresh, prepareExtraOperation, workRef }) {
  await checkFresh?.();
  if (!PLANNED_TYPES.has(raw?.type)) {
    if (!prepareExtraOperation) throw new TypeError(`Unsupported Draw operation: ${raw?.type}`);
    workRef.consume(animation.width * animation.height * animation.frames.length * animation.layers.length);
    const extra = await prepareExtraOperation(animation, active, raw);
    if (!extra || !Object.hasOwn(extra, 'animation')) throw new TypeError(`Unsupported Draw operation: ${raw?.type}`);
    await checkFresh?.();
    return { animation: extra.animation, active: normalizeActive(extra.animation, extra.active ?? active),
      result: extra.result ?? { type: raw.type, changed: extra.animation !== animation || !sameActive(active, extra.active ?? active) } };
  }
  if (raw?.type === 'frame.add' && raw.sourceFrameId === '$active') raw = { ...raw, sourceFrameId: active.frameId };
  const input = resolveActiveIds(raw, active);
  workRef.consume(estimateOperationWork(animation, input));
  const targetLayer = input?.layerId && input.layerId !== '$active' ? animation.layers.find(layer => layer.id === input.layerId) : animation.layers.find(layer => layer.id === active.layerId);
  const palette = input.type === 'palette.replace' ? animation.palette
    : targetLayer?.role === 'normal' ? getAnimationLayerPalette(animation, targetLayer.id) : animation.palette;
  const operation = normalizeDrawAgentOperation(input, { width: animation.width, height: animation.height, paletteLength: palette.length,
    frames: animation.frames, layers: animation.layers, active });
  let next = animation, chosen = active, result = { type: operation.type, changed: false };
  const setCel = (frameId, layerId, doc) => { next = writeDocument(next, frameId, layerId, doc); };

  if (['pixel.set', 'pixels.set', 'stroke', 'spray', 'shape', 'fill', 'cel.clear', 'selection.transform'].includes(operation.type)) {
    assertWritable(animation, operation.layerId);
    const originalCel = celDocument(animation, operation.frameId, operation.layerId);
    const doc = { ...originalCel, palette: [...originalCel.palette], pixels: [...originalCel.pixels] };
    let changedCount = 0;
    if (operation.type === 'pixel.set' || operation.type === 'pixels.set') {
      const edits = operation.type === 'pixel.set' ? [{ x: operation.x, y: operation.y, colorIndex: operation.colorIndex }] : operation.pixels;
      for (const edit of edits) { const index = edit.y * doc.width + edit.x; const value = edit.colorIndex === null ? -1 : edit.colorIndex; if (doc.pixels[index] !== value) { doc.pixels[index] = value; changedCount++; } }
    } else if (operation.type === 'stroke') {
      let previous = operation.points[0];
      for (const point of operation.points) {
        const from = previous ?? point;
        changedCount += strokePixels(doc, from, point, operation.colorIndex === null ? -1 : operation.colorIndex, { trusted: true, brushSize: operation.brushSize }).length;
        previous = point;
      }
    } else if (operation.type === 'spray') {
      let seed = operation.seed >>> 0;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
      for (let pass = 0; pass < operation.passes; pass++) {
        changedCount += sprayPixels(doc, { x: operation.x, y: operation.y }, { x: operation.x, y: operation.y },
          operation.colorIndex === null ? -1 : operation.colorIndex, { radius: operation.radius, random }).length;
      }
    } else if (operation.type === 'shape') {
      const value = operation.colorIndex === null ? -1 : operation.colorIndex;
      if (operation.shape === 'line') {
        const cells = pixelLineCells({ x: Math.floor(operation.from.x), y: Math.floor(operation.from.y) }, { x: Math.floor(operation.to.x), y: Math.floor(operation.to.y) });
        for (const { x, y } of cells) if (x >= 0 && y >= 0 && x < doc.width && y < doc.height) { const index = y * doc.width + x; if (doc.pixels[index] !== value) { doc.pixels[index] = value; changedCount++; } }
      } else changedCount = drawShapePixels(doc, operation.from, operation.to, value, { shape: operation.shape === 'rect' ? 'rectangle' : 'ellipse', filled: operation.filled ?? false }).length;
    } else if (operation.type === 'fill') {
      changedCount = floodFill(doc, operation.x, operation.y, operation.colorIndex === null ? -1 : operation.colorIndex, { trusted: true, contiguous: operation.contiguous }).length;
    } else if (operation.type === 'cel.clear') {
      for (let i = 0; i < doc.pixels.length; i++) if (doc.pixels[i] !== -1) { doc.pixels[i] = -1; changedCount++; }
    } else {
      const lasso = operation.polygon ? lassoDrawSelection(operation.polygon, doc.width, doc.height) : null;
      const clip = operation.polygon ? lasso && captureDrawSelection(doc, operation.bounds, { mask: lasso.mask }) : captureDrawSelection(doc, operation.bounds);
      if (clip) {
        const transform = { x: operation.x, y: operation.y,
          width: operation.width ?? operation.bounds.width, height: operation.height ?? operation.bounds.height,
          ...(operation.angle === undefined ? { turns: operation.turns ?? 0 } : { angle: operation.angle }),
          flipX: operation.flipX ?? false, flipY: operation.flipY ?? false };
        const transformed = projectDrawSelection(doc, clip, transform, {
          sourceBounds: operation.copy ? null : operation.bounds, enforceLimits: false, maxPalette: ANIMATION_MAX_PALETTE_ENTRIES,
        });
        if (transformed.document !== doc) {
          for (let index = 0; index < doc.pixels.length; index++) if (doc.pixels[index] !== transformed.document.pixels[index]) changedCount++;
          doc.pixels = transformed.document.pixels; doc.palette = transformed.document.palette;
        }
      }
    }
    assertWork(animation, doc.width * doc.height);
    if (changedCount || doc.palette.some((color, index) => color !== originalCel.palette[index])) setCel(operation.frameId, operation.layerId, doc);
    result = { type: operation.type, changed: changedCount > 0, changedCount };
  } else if (operation.type === 'palette.add') {
    const existing = animation.palette.findIndex(color => color.toLowerCase() === operation.color);
    if (existing >= 0) result = { type: operation.type, changed: false, index: existing, added: false };
    else {
      if (animation.palette.length >= ANIMATION_MAX_PALETTE_ENTRIES) throw new RangeError(`Draw palette capacity is ${ANIMATION_MAX_PALETTE_ENTRIES}`);
      next = setAnimationPalette(animation, [...animation.palette, operation.color]);
      result = { type: operation.type, changed: true, index: animation.palette.length, added: true };
    }
  } else if (operation.type === 'palette.replace') {
    const updated = [...animation.palette]; updated[operation.index] = operation.color;
    const changed = updated[operation.index] !== animation.palette[operation.index];
    if (changed) {
      if (animation.layers.some(layer => layer.role !== 'normal' && layer.locked)) throw new Error('Unlock all artwork layers before replacing a palette color');
      next = setAnimationPalette(animation, updated);
    }
    result = { type: operation.type, changed };
  } else if (operation.type === 'color.adjust') {
    const target = animation.layers.find(layer => layer.id === operation.layerId);
    if (operation.scope === 'cel' && target?.role === 'normal') throw new Error('Normal-map palettes cannot be color adjusted');
    let base = animation;
    const lockedNormalLayers = operation.scope === 'whole' ? animation.layers.filter(layer => layer.role === 'normal' && layer.locked) : [];
    for (const layer of lockedNormalLayers) base = setLayerProperties(base, layer.id, { locked: false });
    let adjusted = await prepareDrawAgentColorAdjustment(base, operation, { maxPalette: ANIMATION_MAX_PALETTE_ENTRIES });
    if (adjusted === base) adjusted = animation;
    else for (const layer of lockedNormalLayers) adjusted = setLayerProperties(adjusted, layer.id, { locked: true });
    next = adjusted;
    result = { type: operation.type, changed: next !== animation };
  } else if (operation.type === 'layer.select') {
    if (animation.layers.find(layer => layer.id === operation.layerId)?.role === 'music') throw new Error('Music layers cannot be selected');
    chosen = { ...active, layerId: operation.layerId }; result = { type: operation.type, changed: !sameActive(active, chosen) };
  } else if (operation.type.startsWith('layer.')) {
    const layer = operation.layerId && animation.layers.find(item => item.id === operation.layerId);
    if (layer?.role === 'music') throw new Error('Music layers are outside the Draw agent editing scope');
    if (layer?.locked && operation.type !== 'layer.lock') throw new Error('Unlock the target layer before changing it');
    switch (operation.type) {
      case 'layer.add': next = addAnimationLayer(animation, { name: operation.name || `レイヤー ${animation.layers.length + 1}`, visible: operation.visible ?? true, locked: operation.locked ?? false }); chosen = { ...active, layerId: next.layers.at(-1).id }; result.layerId = chosen.layerId; break;
      case 'layer.rename': next = setLayerProperties(animation, operation.layerId, { name: operation.name }); break;
      case 'layer.visibility': next = setLayerProperties(animation, operation.layerId, { visible: operation.visible }); break;
      case 'layer.opacity': next = setLayerProperties(animation, operation.layerId, { opacity: operation.opacity }); break;
      case 'layer.lock': next = setLayerProperties(animation, operation.layerId, { locked: operation.locked }); break;
      case 'layer.move': next = moveAnimationLayer(animation, operation.layerId, operation.index); break;
      case 'layer.remove': {
        next = removeAnimationLayer(animation, operation.layerId);
        if (operation.layerId === active.layerId) chosen = { ...active, layerId: next.layers.findLast(item => item.role !== 'music').id };
        break;
      }
      default: break;
    }
    result.changed = next !== animation || !sameActive(active, chosen);
  } else if (operation.type.startsWith('frame.')) {
    if (['frame.add', 'frame.remove', 'frame.move', 'frame.duration'].includes(operation.type) && animation.layers.some(layer => layer.locked)) throw new Error('Unlock all layers before changing frames');
    switch (operation.type) {
      case 'frame.select': chosen = { ...active, frameId: operation.frameId }; break;
      case 'frame.add': next = addAnimationFrame(animation, { sourceFrameId: operation.sourceFrameId, copy: operation.copy }); chosen = { ...active, frameId: next.frames.at(-1).id }; result.frameId = chosen.frameId; break;
      case 'frame.duration': next = setAnimationFrameDuration(animation, operation.frameId, operation.durationMs); break;
      case 'frame.move': next = moveAnimationFrame(animation, operation.frameId, operation.index); break;
      case 'frame.remove': next = removeAnimationFrame(animation, operation.frameId); if (operation.frameId === active.frameId) chosen = { ...active, frameId: next.frames[0].id }; break;
    }
    result.changed = next !== animation || !sameActive(active, chosen);
  } else if (operation.type === 'canvas.resize') {
    if (animation.layers.some(layer => layer.locked)) throw new Error('Unlock all layers before resizing the canvas');
    assertWork(animation, operation.width * operation.height * animation.frames.length * animation.layers.length);
    next = resizeAnimation(animation, operation.width, operation.height, { anchor: operation.anchor });
    result.changed = next !== animation;
  } else if (operation.type === 'canvas.scale') {
    if (animation.layers.some(layer => layer.locked)) throw new Error('Unlock all layers before scaling the canvas');
    const width = Math.round(animation.width * operation.percent / 100);
    const height = Math.round(animation.height * operation.percent / 100);
    if (width < 1 || height < 1 || width > ANIMATION_MAX_DIMENSION || height > ANIMATION_MAX_DIMENSION) throw new RangeError(`Scaled canvas dimensions must be 1-${ANIMATION_MAX_DIMENSION}px`);
    assertWork(animation, width * height * animation.frames.length * animation.layers.length);
    next = resizeAnimation(animation, width, height, { resample: 'nearest' });
    result = { type: operation.type, changed: next !== animation, width, height };
  } else throw new TypeError(`Unsupported Draw operation: ${operation.type}`);
  await checkFresh?.();
  return { animation: next, active: chosen, result };
}

/** Build a detached plan. A batch is normalized and applied step-by-step against its evolving draft. */
export async function prepareDrawAgentPlan(animation, active, rawOperation, options = {}) {
  validateAnimation(animation);
  active = normalizeActive(animation, active);
  if (options.checkFresh !== undefined && typeof options.checkFresh !== 'function') throw new TypeError('checkFresh must be a function');
  if (options.prepareExtraOperation !== undefined && typeof options.prepareExtraOperation !== 'function') throw new TypeError('prepareExtraOperation must be a function');
  const isBatch = rawOperation?.type === 'batch';
  let operations = [rawOperation], save = false;
  if (isBatch) {
    if (Object.keys(rawOperation).some(key => !['type', 'operations', 'save'].includes(key))) throw new TypeError('Unsupported batch field');
    if (!Array.isArray(rawOperation.operations) || rawOperation.operations.length < 1 || rawOperation.operations.length > DRAW_AGENT_MAX_BATCH_OPERATIONS) throw new RangeError(`batch operations must contain 1-${DRAW_AGENT_MAX_BATCH_OPERATIONS} items`);
    if (rawOperation.save !== undefined && typeof rawOperation.save !== 'boolean') throw new TypeError('save must be boolean');
    operations = rawOperation.operations; save = rawOperation.save ?? false;
    if (operations.some(item => ['batch', 'undo', 'redo', 'save'].includes(item?.type))) throw new TypeError('batch children cannot be batch, undo, redo, or save');
    if (operations.some(item => ['view.configure', 'normal.configure'].includes(item?.type))) throw new TypeError('view.configure and normal.configure cannot be used inside a batch');
  }
  let draft = animation, chosen = active, work = 0;
  const workRef = { consume(amount) { work += amount; assertWork(draft, work); } };
  const results = [];
  for (const raw of operations) {
    const planned = await applyOne(draft, chosen, raw, { ...options, workRef });
    draft = planned.animation; chosen = normalizeActive(draft, planned.active); results.push(planned.result);
  }
  const changed = draft !== animation || !sameActive(active, chosen);
  return { animation: draft, active: chosen, result: isBatch
    ? { changed, changedCount: results.reduce((sum, item) => sum + (item.changedCount ?? 0), 0), results, ...(save ? { save: true } : {}) }
    : { ...results[0], changed: results[0].changed || changed } };
}
