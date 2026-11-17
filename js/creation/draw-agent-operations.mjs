import { adjustDrawColorAnimation, adjustDrawColorDocument } from './draw-color-adjustments.mjs?rev=20261116-normal-release-2';
import { getAnimationCelDocument, setAnimationPalette, writeAnimationCel } from './animation-core.mjs?rev=20261116-normal-release-2';

export const DRAW_AGENT_MAX_PIXEL_BATCH = 512;

const COLOR_HEX = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;
const COLOR_SETTING_KEYS = new Set(['brightness', 'contrast', 'saturation', 'curve', 'paletteMode']);
const ownKeysOnly = (value, allowed, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`Unsupported ${label} field: ${key}`);
};
const requireString = (value, label, max = 256) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError(`${label} is invalid`);
  return value;
};
const requireInt = (value, label, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} is out of range`);
  return value;
};

function requireExisting(id, items, label) {
  requireString(id, label);
  if (!Array.isArray(items) || !items.some(item => item.id === id)) throw new TypeError(`${label} does not exist`);
}

export function normalizeDrawAgentBinding(binding) {
  ownKeysOnly(binding, new Set(['projectId', 'openEpoch']), 'projectBinding');
  return {
    projectId: requireString(binding.projectId, 'projectId'),
    openEpoch: requireString(binding.openEpoch, 'openEpoch', 128),
  };
}

export function assertDrawAgentPrecondition({ expectedRevision, projectBinding }, current) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    const error = new TypeError('expectedRevision is required'); error.code = 'DRAW_AGENT_REVISION_REQUIRED'; throw error;
  }
  let binding;
  try { binding = normalizeDrawAgentBinding(projectBinding); }
  catch (error) { error.code = 'DRAW_AGENT_BINDING_REQUIRED'; throw error; }
  if (!current || expectedRevision !== current.revision) {
    const error = new Error('Draw changed since the last snapshot. Read the current state and retry.'); error.code = 'DRAW_AGENT_STALE_REVISION'; throw error;
  }
  if (!current.projectBinding || binding.projectId !== current.projectBinding.projectId || binding.openEpoch !== current.projectBinding.openEpoch) {
    const error = new Error('The open Draw project changed. Read the current state and retry.'); error.code = 'DRAW_AGENT_STALE_PROJECT'; throw error;
  }
  return true;
}

export function normalizeDrawAgentColorSettings(raw = {}) {
  ownKeysOnly(raw, COLOR_SETTING_KEYS, 'color settings');
  const numberSetting = (key, fallback, min, max) => {
    const value = raw[key] === undefined ? fallback : raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`${key} is out of range`);
    return value;
  };
  let curve = [0, 64, 128, 192, 255];
  if (raw.curve !== undefined) {
    if (!Array.isArray(raw.curve) || raw.curve.length !== 5 || raw.curve.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new RangeError('curve must contain five integer values from 0 to 255');
    }
    curve = [...raw.curve];
  }
  const paletteMode = raw.paletteMode === undefined ? 'exact' : raw.paletteMode;
  if (paletteMode !== 'exact' && paletteMode !== 'nearest') throw new TypeError('paletteMode must be exact or nearest');
  return {
    brightness: numberSetting('brightness', 0, -100, 100),
    contrast: numberSetting('contrast', 0, -100, 100),
    saturation: numberSetting('saturation', 100, 0, 200),
    curve,
    paletteMode,
  };
}

function normalizePixelChange(change, { width, height, paletteLength }) {
  ownKeysOnly(change, new Set(['x', 'y', 'colorIndex']), 'pixel');
  requireInt(change.x, 'x', 0, width - 1);
  requireInt(change.y, 'y', 0, height - 1);
  if (change.colorIndex !== null) requireInt(change.colorIndex, 'colorIndex', 0, paletteLength - 1);
  return { x: change.x, y: change.y, colorIndex: change.colorIndex };
}

export function normalizeDrawAgentOperation(raw, context = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.type !== 'string') throw new TypeError('operation is invalid');
  const { frames = [], layers = [], width, height, paletteLength } = context;
  const type = raw.type;
  const fields = {
    'pixel.set': ['type', 'frameId', 'layerId', 'x', 'y', 'colorIndex'],
    'pixels.set': ['type', 'frameId', 'layerId', 'pixels'],
    'palette.add': ['type', 'color'],
    'color.adjust': ['type', 'scope', 'frameId', 'layerId', 'settings'],
    'layer.select': ['type', 'layerId'],
    'layer.add': ['type', 'name', 'visible', 'locked'],
    'layer.rename': ['type', 'layerId', 'name'],
    'layer.visibility': ['type', 'layerId', 'visible'],
    'layer.opacity': ['type', 'layerId', 'opacity'],
    'layer.lock': ['type', 'layerId', 'locked'],
    'layer.move': ['type', 'layerId', 'index'],
    'layer.remove': ['type', 'layerId'],
    'frame.select': ['type', 'frameId'],
    'frame.add': ['type', 'sourceFrameId', 'copy'],
    'frame.duration': ['type', 'frameId', 'durationMs'],
    'frame.move': ['type', 'frameId', 'index'],
    'frame.remove': ['type', 'frameId'],
    undo: ['type'], redo: ['type'], save: ['type'],
  };
  const allowed = fields[type];
  if (!allowed) throw new TypeError(`Unsupported Draw operation: ${type}`);
  ownKeysOnly(raw, new Set(allowed), `operation ${type}`);
  const frameId = (value = raw.frameId) => { requireExisting(value, frames, 'frameId'); return value; };
  const layerId = (value = raw.layerId) => { requireExisting(value, layers, 'layerId'); return value; };
  const assertWritableLayer = id => {
    const layer = layers.find(item => item.id === id);
    if (layer?.role === 'music') throw new TypeError('Music layers cannot be changed by pixel operations');
    if (layer?.locked) throw new Error('The target layer is locked');
  };
  switch (type) {
    case 'pixel.set': {
      const cell = normalizePixelChange({ x: raw.x, y: raw.y, colorIndex: raw.colorIndex }, context);
      const targetLayerId = layerId(); assertWritableLayer(targetLayerId);
      return { type, frameId: frameId(), layerId: targetLayerId, ...cell };
    }
    case 'pixels.set': {
      if (!Array.isArray(raw.pixels) || raw.pixels.length < 1 || raw.pixels.length > DRAW_AGENT_MAX_PIXEL_BATCH) throw new RangeError(`pixels must contain 1-${DRAW_AGENT_MAX_PIXEL_BATCH} changes`);
      const cells = raw.pixels.map(change => normalizePixelChange(change, context));
      const unique = new Set(cells.map(cell => `${cell.x},${cell.y}`));
      if (unique.size !== cells.length) throw new TypeError('pixels contains duplicate coordinates');
      const targetLayerId = layerId(); assertWritableLayer(targetLayerId);
      return { type, frameId: frameId(), layerId: targetLayerId, pixels: cells };
    }
    case 'palette.add':
      if (typeof raw.color !== 'string' || !COLOR_HEX.test(raw.color)) throw new TypeError('color must be #RRGGBB or #RRGGBBAA');
      return { type, color: raw.color.toLowerCase() };
    case 'color.adjust':
      if (!['cel', 'whole'].includes(raw.scope)) throw new TypeError('scope must be cel or whole');
      if (raw.scope === 'whole' && layers.some(layer => layer.locked)) throw new Error('All layers must be unlocked for whole-animation color adjustment');
      const targetLayerId = layerId(); assertWritableLayer(targetLayerId);
      return { type, scope: raw.scope, frameId: frameId(), layerId: targetLayerId, settings: normalizeDrawAgentColorSettings(raw.settings) };
    case 'layer.select': return { type, layerId: layerId() };
    case 'layer.add': {
      const result = { type };
      if (raw.name !== undefined) result.name = requireString(raw.name, 'name', 120);
      if (raw.visible !== undefined) { if (typeof raw.visible !== 'boolean') throw new TypeError('visible must be boolean'); result.visible = raw.visible; }
      if (raw.locked !== undefined) { if (typeof raw.locked !== 'boolean') throw new TypeError('locked must be boolean'); result.locked = raw.locked; }
      return result;
    }
    case 'layer.rename': return { type, layerId: layerId(), name: requireString(raw.name, 'name', 120) };
    case 'layer.visibility':
      if (typeof raw.visible !== 'boolean') throw new TypeError('visible must be boolean');
      return { type, layerId: layerId(), visible: raw.visible };
    case 'layer.opacity':
      if (typeof raw.opacity !== 'number' || !Number.isFinite(raw.opacity) || raw.opacity < 0 || raw.opacity > 1) throw new RangeError('opacity must be from 0 to 1');
      return { type, layerId: layerId(), opacity: raw.opacity };
    case 'layer.lock':
      if (typeof raw.locked !== 'boolean') throw new TypeError('locked must be boolean');
      return { type, layerId: layerId(), locked: raw.locked };
    case 'layer.move': return { type, layerId: layerId(), index: requireInt(raw.index, 'index', 0, layers.length - 1) };
    case 'layer.remove': return { type, layerId: layerId() };
    case 'frame.select': return { type, frameId: frameId() };
    case 'frame.add':
      if (raw.copy !== undefined && typeof raw.copy !== 'boolean') throw new TypeError('copy must be boolean');
      return { type, sourceFrameId: frameId(raw.sourceFrameId ?? context.active?.frameId), copy: raw.copy ?? true };
    case 'frame.duration':
      if (typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs) || raw.durationMs < 1 || raw.durationMs > 60000) throw new RangeError('durationMs must be from 1 to 60000');
      return { type, frameId: frameId(), durationMs: raw.durationMs };
    case 'frame.move': return { type, frameId: frameId(), index: requireInt(raw.index, 'index', 0, frames.length - 1) };
    case 'frame.remove': return { type, frameId: frameId() };
    case 'undo': case 'redo': case 'save': return { type };
    default: throw new TypeError(`Unsupported Draw operation: ${type}`);
  }
}

export function applyDrawAgentPixelChanges(document, changes) {
  if (!document || !Number.isInteger(document.width) || !Number.isInteger(document.height)
      || !Array.isArray(document.pixels) || document.pixels.length !== document.width * document.height
      || !Array.isArray(changes) || changes.length < 1 || changes.length > DRAW_AGENT_MAX_PIXEL_BATCH) {
    throw new TypeError('Pixel change input is invalid');
  }
  const pixels = [...document.pixels];
  const unique = new Set();
  let changedCount = 0;
  for (const { x, y, colorIndex } of changes) {
    if (!Number.isInteger(x) || x < 0 || x >= document.width || !Number.isInteger(y) || y < 0 || y >= document.height
        || colorIndex !== null && (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= document.palette.length)) {
      throw new RangeError('Pixel change is out of range');
    }
    const index = y * document.width + x;
    if (unique.has(index)) throw new TypeError('Pixel change contains duplicate coordinates');
    unique.add(index);
    const next = colorIndex === null ? -1 : colorIndex;
    if (pixels[index] !== next) { pixels[index] = next; changedCount += 1; }
  }
  return { document: { ...document, palette: [...document.palette], pixels }, changed: changedCount > 0, changedCount };
}

/** Prepare a detached, indexed color result scoped to one cel or the full timeline. */
export async function prepareDrawAgentColorAdjustment(animation, operation, { maxPalette = 128 } = {}) {
  if (!animation || !operation || operation.type !== 'color.adjust') throw new TypeError('A normalized color.adjust operation is required');
  if (operation.scope === 'whole') return adjustDrawColorAnimation(animation, operation.settings);
  if (operation.scope !== 'cel') throw new TypeError('Color adjustment scope must be cel or whole');
  const cel = getAnimationCelDocument(animation, operation.frameId, operation.layerId);
  const adjusted = await adjustDrawColorDocument(cel, operation.settings, { maxPalette });
  if (adjusted === cel) return animation;
  let next = animation;
  if (adjusted.palette.length !== animation.palette.length || adjusted.palette.some((color, index) => color !== animation.palette[index])) {
    next = setAnimationPalette(next, adjusted.palette);
  }
  return writeAnimationCel(next, operation.frameId, operation.layerId, {
    width: adjusted.width, height: adjusted.height,
    pixels: Uint8Array.from(adjusted.pixels, value => value + 1),
  });
}
