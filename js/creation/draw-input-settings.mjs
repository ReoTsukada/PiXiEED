/** Versioned editor preferences; colors resolve against a project's existing palette. */
export const DRAW_INPUT_SETTINGS_KEY = 'pixieed:draw:input-settings:v1';
export const DRAW_INPUT_TOOLS = Object.freeze(['pen', 'eraser', 'fill', 'line', 'rectangle', 'rectangle-fill', 'ellipse', 'ellipse-fill', 'spray', 'select', 'picker']);
const boundedInteger = (value, fallback, max) => Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
const boundedSpraySize = (value, legacyRadius) => {
  if (Number.isInteger(value) && value >= 1 && value <= 33 && value % 2 === 1) return value;
  if (Number.isInteger(legacyRadius) && legacyRadius >= 0 && legacyRadius <= 16) return legacyRadius * 2 + 1;
  return 5;
};
export function normalizeDrawInputSettings(value, palette) {
  const valid = value?.version === 1 ? value : {};
  const bindings = Object.fromEntries(['left', 'right'].map(side => {
    const binding = valid.bindings?.[side], fallback = Math.min(side === 'left' ? 2 : 4, palette.length - 1);
    const matching = typeof binding?.colorHex === 'string' ? palette.findIndex(hex => hex.toLowerCase() === binding.colorHex.toLowerCase()) : -1;
    const color = binding?.color === -1 ? -1 : matching >= 0 ? matching : Number.isInteger(binding?.color) && binding.color >= 0 && binding.color < palette.length ? binding.color : fallback;
    const normalized = { ...(binding && typeof binding === 'object' && !Array.isArray(binding) ? binding : {}), tool: DRAW_INPUT_TOOLS.includes(binding?.tool) ? binding.tool : 'pen', color };
    normalized.brushSize = boundedInteger(binding?.brushSize, 1, 16);
    normalized.spraySize = boundedSpraySize(binding?.spraySize, binding?.sprayRadius);
    normalized.contiguous = typeof binding?.contiguous === 'boolean' ? binding.contiguous : true;
    if (binding?.selectMode === 'color') normalized.selectMode = 'color';
    else if (binding?.selectMode === 'lasso') normalized.selectMode = 'lasso';
    else if (binding?.selectMode === 'rectangle') normalized.selectMode = 'rectangle';
    else delete normalized.selectMode;
    return [side, normalized];
  }));
  // Older saved settings exposed an editable L/R selector. Keep both bindings and
  // the control placement, but always restore editing to the shared left binding.
  return { ...valid, version: 1, bindings, editedSide: 'left', controlsSide: valid.controlsSide === 'left' ? 'left' : 'right' };
}
export function serializeDrawInputSettings(settings, palette) {
  return { ...settings, bindings: Object.fromEntries(['left', 'right'].map(side => [side, { ...settings.bindings[side], colorHex: settings.bindings[side].color < 0 ? null : palette[settings.bindings[side].color] }])) };
}
export function readDrawInputSettings(storage, palette) {
  try { return normalizeDrawInputSettings(JSON.parse(storage?.getItem(DRAW_INPUT_SETTINGS_KEY)), palette); }
  catch { return normalizeDrawInputSettings(null, palette); }
}
