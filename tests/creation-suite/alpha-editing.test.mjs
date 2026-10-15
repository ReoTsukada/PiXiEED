import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  captureDrawSelection,
  cloneDrawSelection,
  projectDrawSelection,
  sampleDrawSelection,
  selectDrawColorMask
} from '../../js/creation/draw-selection-operations.mjs';

const doc = (pixels, palette) => ({ schemaVersion: 1, width: pixels.length, height: 1, palette: [...palette], pixels: [...pixels] });

test('mobile layer context menu exposes the shared opacity action with protected states', async () => {
  const source = await readFile(new URL('../../js/creation/animation-controls.mjs', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../css/creation-animation.css', import.meta.url), 'utf8');
  const menuStart = source.indexOf("const opacityLabel = node('label', 'animation-controls__context-opacity')");
  assert.notEqual(menuStart, -1, 'mobile layer context menu creates an opacity slider');
  const menu = source.slice(menuStart, source.indexOf("const rename = node('input', 'animation-controls__context-rename')", menuStart));
  assert.match(menu, /opacity\.dataset\.layerOpacity = String\(layer\.id\)/);
  assert.match(menu, /opacity\.disabled = musicLayer \|\| state\.readOnly \|\| pending > 0 \|\| Boolean\(layer\.locked\)/);
  assert.match(menu, /不透明度（全コマ共通）/);
  assert.match(source, /listen\(frameMenu, 'change', onChange\)/);
  assert.match(source, /listen\(frameMenu, 'input', onInput\)/);
  assert.match(source, /dispatch\(\{ type: 'layer-opacity', layerId: layer\.id, opacity:/);
  assert.match(styles, /\.animation-controls__context-opacity \{ grid-column: 1 \/ -1/);
  assert.match(styles, /\.animation-controls__context-opacity-heading \{ grid-column: 1 \/ -1/);
  assert.match(styles, /\.animation-controls__context-opacity \.animation-controls__layer-opacity-input \{ grid-column: 1; grid-row: 2; width: 100%/);
  assert.match(styles, /\.animation-controls__context-opacity \.animation-controls__layer-opacity-value \{ grid-column: 2; grid-row: 2/);
});

test('selection clipboard retains exact RGBA slots, including alpha zero, and keeps hole byte distinct', () => {
  const source = doc([0, 1, 2, -1], ['#ff0000f3', '#ff000080', '#ff000000']);
  const clip = captureDrawSelection(source, { x: 0, y: 0, width: 4, height: 1 });
  assert.equal(clip.version, 3);
  assert.deepEqual(clip.palette, ['#ff0000f3', '#ff000080', '#ff000000']);
  assert.deepEqual([...clip.indices], [1, 2, 3, 0]);
  assert.deepEqual([...sampleDrawSelection(clip, { width: 4, height: 1 })], [1, 2, 3, 0]);
  const pasted = projectDrawSelection(doc([-1, -1, -1, -1], ['#000000ff']), clip, { x: 0, y: 0, width: 4, height: 1 }).document;
  assert.deepEqual(pasted.palette, ['#000000ff', '#ff0000f3', '#ff000080', '#ff000000']);
  assert.deepEqual(pasted.pixels, [1, 2, 3, -1]);
});

test('same RGB with different alpha is a different color slot; alpha-zero slot selection is distinct from erased holes', () => {
  const source = doc([0, 1, 2, -1], ['#336699f3', '#336699f3', '#33669900']);
  const maskForOpaque = selectDrawColorMask(source, { x: 0, y: 0 });
  const maskForTransparentSlot = selectDrawColorMask(source, { x: 2, y: 0 });
  const maskForHole = selectDrawColorMask(source, { x: 3, y: 0 });
  assert.deepEqual([...maskForOpaque.mask], [1, 1, 0, 0]);
  assert.deepEqual([...maskForTransparentSlot.mask], [0, 0, 1, 0]);
  assert.deepEqual([...maskForHole.mask], [0, 0, 0, 1]);
});

test('palette limit failure is atomic when paste would exceed 64 exact RGBA colors', () => {
  const source = doc([0, 1], ['#ff0000f3', '#00ff0080']);
  const clip = cloneDrawSelection(captureDrawSelection(source, { x: 0, y: 0, width: 2, height: 1 }));
  const palette = Array.from({ length: 127 }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}ff`);
  const target = doc([-1, -1], palette), before = structuredClone(target);
  assert.throws(() => projectDrawSelection(target, clip, { x: 0, y: 0, width: 2, height: 1 }), /パレット/);
  assert.deepEqual(target, before);
});
