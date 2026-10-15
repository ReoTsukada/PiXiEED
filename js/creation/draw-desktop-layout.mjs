export const DRAW_DESKTOP_LAYOUT_STORAGE_KEY = 'pixieed:draw:desktop-layout:v1';
export const DRAW_DESKTOP_LAYOUT_VERSION = 1;
export const DRAW_DESKTOP_LAYOUT_DEFAULTS = Object.freeze({
  leftWidth: 224,
  rightWidth: 264,
  paletteHeight: 260,
  frameHeight: 152
});

export const DRAW_DESKTOP_LAYOUT_LIMITS = Object.freeze({
  leftWidth: Object.freeze({ min: 196, max: 440 }),
  rightWidth: Object.freeze({ min: 216, max: 520 }),
  paletteHeight: Object.freeze({ min: 96, max: 720 }),
  frameHeight: Object.freeze({ min: 108, max: 480 })
});

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function normalizeDrawDesktopPreferences(value) {
  const input = isRecord(value?.preferences) ? value.preferences : value;
  const result = {};
  for (const [key, defaults] of Object.entries(DRAW_DESKTOP_LAYOUT_DEFAULTS)) {
    const bounds = DRAW_DESKTOP_LAYOUT_LIMITS[key];
    result[key] = Math.round(clamp(finite(input?.[key], defaults), bounds.min, bounds.max));
  }
  return result;
}

export function readDrawDesktopPreferences(storage = safeStorage()) {
  if (!storage) return { preferences: { ...DRAW_DESKTOP_LAYOUT_DEFAULTS }, recovered: false };
  try {
    const serialized = storage.getItem(DRAW_DESKTOP_LAYOUT_STORAGE_KEY);
    if (!serialized) return { preferences: { ...DRAW_DESKTOP_LAYOUT_DEFAULTS }, recovered: false };
    let record;
    try { record = JSON.parse(serialized); } catch { return { preferences: { ...DRAW_DESKTOP_LAYOUT_DEFAULTS }, recovered: true }; }
    if (record?.version !== DRAW_DESKTOP_LAYOUT_VERSION || !isRecord(record.preferences)) {
      return { preferences: { ...DRAW_DESKTOP_LAYOUT_DEFAULTS }, recovered: true };
    }
    return { preferences: normalizeDrawDesktopPreferences(record.preferences), recovered: false };
  } catch {
    return { preferences: { ...DRAW_DESKTOP_LAYOUT_DEFAULTS }, recovered: true };
  }
}

export function writeDrawDesktopPreferences(preferences, storage = safeStorage()) {
  if (!storage) return false;
  const record = { version: DRAW_DESKTOP_LAYOUT_VERSION, preferences: normalizeDrawDesktopPreferences(preferences) };
  try { storage.setItem(DRAW_DESKTOP_LAYOUT_STORAGE_KEY, JSON.stringify(record)); return true; }
  catch { return false; }
}

export function resolveDrawDesktopLayout(preferences, { width, height } = {}) {
  const saved = normalizeDrawDesktopPreferences(preferences);
  const shellWidth = Math.max(0, finite(width, 0));
  const shellHeight = Math.max(0, finite(height, 0));
  const leftBounds = DRAW_DESKTOP_LAYOUT_LIMITS.leftWidth;
  const rightBounds = DRAW_DESKTOP_LAYOUT_LIMITS.rightWidth;
  const laneBudget = Math.max(leftBounds.min + rightBounds.min, shellWidth - 320 - 20);
  let leftWidth = clamp(saved.leftWidth, leftBounds.min, Math.min(leftBounds.max, laneBudget - rightBounds.min));
  let rightWidth = clamp(saved.rightWidth, rightBounds.min, Math.min(rightBounds.max, laneBudget - leftBounds.min));
  const overflow = leftWidth + rightWidth - laneBudget;
  if (overflow > 0) {
    const leftFlex = leftWidth - leftBounds.min;
    const rightFlex = rightWidth - rightBounds.min;
    const flexTotal = leftFlex + rightFlex;
    if (flexTotal > 0) {
      const budgetFlex = Math.max(0, laneBudget - leftBounds.min - rightBounds.min);
      leftWidth = leftBounds.min + budgetFlex * (leftFlex / flexTotal);
      rightWidth = rightBounds.min + budgetFlex * (rightFlex / flexTotal);
    }
  }

  const frameBounds = DRAW_DESKTOP_LAYOUT_LIMITS.frameHeight;
  const frameMax = Math.max(frameBounds.min, Math.min(frameBounds.max, shellHeight - 300 - 10));
  const frameHeight = clamp(saved.frameHeight, frameBounds.min, frameMax);
  const paletteBounds = DRAW_DESKTOP_LAYOUT_LIMITS.paletteHeight;
  // Reserve the dock's 18px outer inset (border plus default 8px padding),
  // the 10px separator, and the layer list's 112px minimum.
  const paletteMax = Math.max(paletteBounds.min, Math.min(paletteBounds.max, shellHeight - 112 - 10 - 18));
  const paletteHeight = clamp(saved.paletteHeight, paletteBounds.min, paletteMax);

  return {
    leftWidth: Math.round(leftWidth),
    rightWidth: Math.round(rightWidth),
    paletteHeight: Math.round(paletteHeight),
    frameHeight: Math.round(frameHeight),
    stageWidth: Math.max(0, Math.round(shellWidth - leftWidth - rightWidth - 20)),
    stageHeight: Math.max(0, Math.round(shellHeight - frameHeight - 10)),
    limits: {
      leftWidth: { min: leftBounds.min, max: Math.max(leftBounds.min, Math.min(leftBounds.max, laneBudget - rightBounds.min)) },
      rightWidth: { min: rightBounds.min, max: Math.max(rightBounds.min, Math.min(rightBounds.max, laneBudget - leftBounds.min)) },
      paletteHeight: { min: paletteBounds.min, max: paletteMax },
      frameHeight: { min: frameBounds.min, max: frameMax }
    }
  };
}

export function resizeDrawDesktopPreference(preferences, key, delta) {
  const current = normalizeDrawDesktopPreferences(preferences);
  if (!Object.hasOwn(DRAW_DESKTOP_LAYOUT_LIMITS, key)) return current;
  const bounds = DRAW_DESKTOP_LAYOUT_LIMITS[key];
  current[key] = Math.round(clamp(current[key] + finite(delta, 0), bounds.min, bounds.max));
  return current;
}

export function setDrawDesktopPreference(preferences, key, value) {
  const current = normalizeDrawDesktopPreferences(preferences);
  if (!Object.hasOwn(DRAW_DESKTOP_LAYOUT_LIMITS, key)) return current;
  const bounds = DRAW_DESKTOP_LAYOUT_LIMITS[key];
  current[key] = Math.round(clamp(finite(value, current[key]), bounds.min, bounds.max));
  return current;
}
