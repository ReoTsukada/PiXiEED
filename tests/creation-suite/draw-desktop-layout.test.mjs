import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAW_DESKTOP_LAYOUT_DEFAULTS,
  DRAW_DESKTOP_LAYOUT_STORAGE_KEY,
  normalizeDrawDesktopPreferences,
  readDrawDesktopPreferences,
  resolveDrawDesktopLayout,
  resizeDrawDesktopPreference,
  setDrawDesktopPreference,
  writeDrawDesktopPreferences
} from '../../js/creation/draw-desktop-layout.mjs';

function memoryStorage(initial = null, throws = false) {
  let value = initial;
  return {
    getItem(key) { assert.equal(key, DRAW_DESKTOP_LAYOUT_STORAGE_KEY); if (throws) throw new Error('blocked'); return value; },
    setItem(key, next) { assert.equal(key, DRAW_DESKTOP_LAYOUT_STORAGE_KEY); if (throws) throw new Error('blocked'); value = next; },
    read() { return value; }
  };
}

test('viewport clamping keeps the canvas lane at least 320px and restores saved preferences when space returns', () => {
  const preferences = { leftWidth: 400, rightWidth: 450, paletteHeight: 300, frameHeight: 180 };
  const compact = resolveDrawDesktopLayout(preferences, { width: 1100, height: 620 });
  assert.ok(compact.stageWidth >= 320);
  assert.equal(compact.leftWidth + compact.rightWidth + compact.stageWidth + 20, 1100);
  const wide = resolveDrawDesktopLayout(preferences, { width: 1600, height: 1000 });
  assert.equal(wide.leftWidth, 400);
  assert.equal(wide.rightWidth, 450);
  assert.equal(wide.paletteHeight, 300);
  assert.equal(wide.frameHeight, 180);
  assert.deepEqual(preferences, { leftWidth: 400, rightWidth: 450, paletteHeight: 300, frameHeight: 180 });
});

test('vertical lanes clamp to usable stage/layer minimums without overwriting preferences', () => {
  const preferences = { ...DRAW_DESKTOP_LAYOUT_DEFAULTS, paletteHeight: 700, frameHeight: 420 };
  const short = resolveDrawDesktopLayout(preferences, { width: 1366, height: 620 });
  assert.ok(short.stageHeight >= 300);
  assert.ok(short.frameHeight >= 108);
  assert.ok(short.paletteHeight + 10 + 112 + 18 <= 620);
  assert.equal(short.paletteHeight, 480);
  assert.equal(preferences.paletteHeight, 700);
  assert.equal(preferences.frameHeight, 420);
  const tall = resolveDrawDesktopLayout(preferences, { width: 1366, height: 1080 });
  assert.equal(tall.paletteHeight, 700);
  assert.equal(tall.frameHeight, 420);
});

test('corrupt, wrong-version, non-finite and out-of-range saved values recover safely', () => {
  const corrupt = readDrawDesktopPreferences(memoryStorage('{broken'));
  assert.equal(corrupt.recovered, true);
  assert.deepEqual(corrupt.preferences, DRAW_DESKTOP_LAYOUT_DEFAULTS);
  const wrongVersion = readDrawDesktopPreferences(memoryStorage(JSON.stringify({ version: 2, preferences: {} })));
  assert.equal(wrongVersion.recovered, true);
  const normalized = normalizeDrawDesktopPreferences({ leftWidth: Infinity, rightWidth: -500, paletteHeight: 1e9, frameHeight: NaN });
  assert.deepEqual(normalized, { leftWidth: 224, rightWidth: 68, paletteHeight: 720, frameHeight: 152 });
});

test('resizing one boundary updates only its preferred dimension and clamps to hard bounds', () => {
  const start = { ...DRAW_DESKTOP_LAYOUT_DEFAULTS };
  const next = resizeDrawDesktopPreference(start, 'rightWidth', 1000);
  assert.equal(next.rightWidth, 520);
  assert.equal(next.leftWidth, start.leftWidth);
  assert.equal(setDrawDesktopPreference(start, 'frameHeight', 90).frameHeight, 108);
  assert.equal(start.frameHeight, 152);
  assert.deepEqual(resizeDrawDesktopPreference(start, 'unknown', 10), start);
  assert.equal(setDrawDesktopPreference(start, 'leftWidth', 1).leftWidth, 62);
  assert.equal(setDrawDesktopPreference(start, 'rightWidth', 1).rightWidth, 68);
});

test('preference reads/writes tolerate storage access failures', () => {
  assert.equal(readDrawDesktopPreferences(memoryStorage(null, true)).recovered, true);
  assert.equal(writeDrawDesktopPreferences(DRAW_DESKTOP_LAYOUT_DEFAULTS, memoryStorage(null, true)), false);
  const storage = memoryStorage();
  assert.equal(writeDrawDesktopPreferences(DRAW_DESKTOP_LAYOUT_DEFAULTS, storage), true);
  assert.deepEqual(readDrawDesktopPreferences(storage).preferences, DRAW_DESKTOP_LAYOUT_DEFAULTS);
});
