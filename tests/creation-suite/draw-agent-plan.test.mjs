import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationLayer, createAnimation, ensureAnimationMusicLayer, ensureAnimationNormalLayer, getAnimationCelDocument, getAnimationLayerPalette, setLayerProperties, writeAnimationCel } from '../../js/creation/animation-core.mjs?rev=20261116-normal-release-2';
import { prepareDrawAgentPlan } from '../../js/creation/draw-agent-plan.mjs';

function fixture(width = 5, height = 4) {
  let animation = createAnimation({ width, height, palette: ['#111111', '#eeeeee', '#ff0000'] });
  const frameId = animation.frames[0].id, layerId = animation.layers[0].id;
  animation = writeAnimationCel(animation, frameId, layerId, { width, height, pixels: new Uint8Array(width * height).fill(1) });
  return { animation, active: { frameId, layerId }, frameId, layerId };
}
const snapshot = (animation, frameId, layerId) => [...getAnimationCelDocument(animation, frameId, layerId).pixels];

test('stroke, shape, and fill prepare a detached cel edit', async () => {
  const { animation, active, frameId, layerId } = fixture();
  const result = await prepareDrawAgentPlan(animation, active, { type: 'batch', operations: [
    { type: 'stroke', frameId: '$active', layerId: '$active', points: [{ x: 1, y: 1 }, { x: 3, y: 1 }], colorIndex: 1 },
    { type: 'shape', frameId: '$active', layerId: '$active', shape: 'rect', from: { x: 1, y: 2 }, to: { x: 3, y: 3 }, colorIndex: 2, filled: true },
    { type: 'fill', frameId: '$active', layerId: '$active', x: 0, y: 0, colorIndex: 2 },
  ] });
  assert.notEqual(result.animation, animation);
  assert.equal(result.result.changed, true);
  assert.ok(result.result.changedCount > 0);
  assert.notDeepEqual(snapshot(result.animation, frameId, layerId), snapshot(animation, frameId, layerId));
  assert.deepEqual(snapshot(animation, frameId, layerId), Array(20).fill(0));
});

test('failed batches leave the source animation untouched and reject locked and music targets', async () => {
  let { animation, active, frameId, layerId } = fixture();
  animation = addAnimationLayer(animation, { name: 'Locked', locked: true });
  active = { frameId, layerId };
  const before = snapshot(animation, frameId, layerId);
  await assert.rejects(prepareDrawAgentPlan(animation, active, { type: 'batch', operations: [
    { type: 'pixel.set', frameId: '$active', layerId: '$active', x: 0, y: 0, colorIndex: 1 },
    { type: 'pixel.set', frameId: '$active', layerId: animation.layers[1].id, x: 1, y: 0, colorIndex: 1 },
  ] }), /locked/i);
  assert.deepEqual(snapshot(animation, frameId, layerId), before);
  const withMusic = ensureAnimationMusicLayer(animation);
  await assert.rejects(prepareDrawAgentPlan(withMusic, { frameId, layerId: withMusic.layers[0].id }, {
    type: 'cel.clear', frameId: '$active', layerId: '$active',
  }), /music/i);
});

test('selection transforms, resize, and nearest scale use detached animation results', async () => {
  let { animation, active, frameId, layerId } = fixture(3, 2);
  animation = writeAnimationCel(animation, frameId, layerId, { width: 3, height: 2, pixels: [1, 0, 0, 0, 0, 0] });
  const transformed = await prepareDrawAgentPlan(animation, active, { type: 'selection.transform', frameId: '$active', layerId: '$active',
    bounds: { x: 0, y: 0, width: 1, height: 1 }, x: 2, y: 1, copy: true, flipX: true });
  assert.equal(snapshot(transformed.animation, frameId, layerId)[5], 0);
  assert.equal(snapshot(animation, frameId, layerId)[0], 0);
  const resized = await prepareDrawAgentPlan(transformed.animation, transformed.active, { type: 'canvas.resize', width: 4, height: 3, anchor: 'center' });
  assert.equal(resized.animation.width, 4);
  assert.equal(resized.animation.height, 3);
  const scaled = await prepareDrawAgentPlan(resized.animation, resized.active, { type: 'canvas.scale', percent: 50 });
  assert.deepEqual([scaled.animation.width, scaled.animation.height], [2, 2]);
});

test('normal projects allow art palette changes while preserving fixed normal swatches', async () => {
  const { animation, active } = fixture(2, 2);
  let normal = ensureAnimationNormalLayer(animation);
  const normalLayerId = normal.layers.find(layer => layer.role === 'normal').id;
  normal = writeAnimationCel(normal, active.frameId, normalLayerId, { width: 2, height: 2, pixels: [1, 2, 3, 4] });
  const normalActive = { ...active, layerId: normalLayerId };
  const fixedPalette = getAnimationLayerPalette(normal, normalLayerId);
  const added = await prepareDrawAgentPlan(normal, normalActive, { type: 'palette.add', color: '#abcdef' });
  assert.equal(added.result.index, animation.palette.length);
  assert.deepEqual(getAnimationLayerPalette(added.animation, normalLayerId), fixedPalette);
  const replaced = await prepareDrawAgentPlan(added.animation, normalActive, { type: 'palette.replace', index: 0, color: '#222222' });
  assert.equal(replaced.animation.palette[0], '#222222');
  assert.deepEqual(getAnimationLayerPalette(replaced.animation, normalLayerId), fixedPalette);
  const lockedNormal = setLayerProperties(replaced.animation, normalLayerId, { locked: true });
  const beforeNormalPixels = snapshot(lockedNormal, active.frameId, normalLayerId);
  const adjusted = await prepareDrawAgentPlan(lockedNormal, normalActive, { type: 'color.adjust', scope: 'whole', frameId: '$active', layerId: '$active',
    settings: { brightness: 24, contrast: 0, saturation: 100, curve: [0, 64, 128, 192, 255], paletteMode: 'exact' } });
  assert.notDeepEqual(adjusted.animation.palette, lockedNormal.palette);
  assert.deepEqual(getAnimationLayerPalette(adjusted.animation, normalLayerId), fixedPalette);
  assert.deepEqual(snapshot(adjusted.animation, active.frameId, normalLayerId), beforeNormalPixels);
  assert.equal(adjusted.animation.layers.find(layer => layer.id === normalLayerId).locked, true);
});

test('batch applies timeline changes sequentially and newly added layer becomes active', async () => {
  const { animation, active } = fixture();
  const result = await prepareDrawAgentPlan(animation, active, { type: 'batch', operations: [
    { type: 'layer.add', name: 'Next' },
    { type: 'pixel.set', frameId: '$active', layerId: '$active', x: 0, y: 0, colorIndex: 1 },
    { type: 'frame.add', copy: true },
  ] });
  assert.equal(result.animation.layers.at(-1).name, 'Next');
  assert.equal(result.active.layerId, result.animation.layers.at(-1).id);
  assert.equal(result.animation.frames.length, 2);
  assert.equal(result.active.frameId, result.animation.frames.at(-1).id);
  assert.equal(snapshot(result.animation, result.active.frameId, result.active.layerId)[0], 1);
  assert.equal(animation.frames.length, 1);
});

test('normal-map cel edits use its fixed palette while rejecting out-of-range normal swatches', async () => {
  const { animation, active } = fixture(2, 2);
  const normal = ensureAnimationNormalLayer(animation);
  const normalLayerId = normal.layers.find(layer => layer.role === 'normal').id;
  const normalActive = { ...active, layerId: normalLayerId };
  const edited = await prepareDrawAgentPlan(normal, normalActive, { type: 'pixel.set', frameId: '$active', layerId: '$active', x: 1, y: 1, colorIndex: 16 });
  assert.equal(snapshot(edited.animation, active.frameId, normalLayerId)[3], 16);
  await assert.rejects(prepareDrawAgentPlan(normal, normalActive, { type: 'pixel.set', frameId: '$active', layerId: '$active', x: 1, y: 1, colorIndex: 17 }), /out of range/i);
  assert.equal(snapshot(normal, active.frameId, normalLayerId)[3], -1);
});

test('quarter-turn move uses exact indexed pixels and clears the source once', async () => {
  let animation = createAnimation({ width: 6, height: 4, palette: ['#110000', '#220000', '#330000', '#440000', '#550000', '#660000'] });
  const frameId = animation.frames[0].id, layerId = animation.layers[0].id;
  animation = writeAnimationCel(animation, frameId, layerId, { width: 6, height: 4, pixels: [1, 2, 0, 0, 0, 0, 3, 4, 0, 0, 0, 0, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  const plan = await prepareDrawAgentPlan(animation, { frameId, layerId }, { type: 'selection.transform', frameId: '$active', layerId: '$active',
    bounds: { x: 0, y: 0, width: 2, height: 3 }, x: 3, y: 1, width: 3, height: 2, turns: 1, copy: false });
  const pixels = snapshot(plan.animation, frameId, layerId);
  assert.deepEqual(pixels.slice(0, 2), [-1, -1]);
  assert.deepEqual([pixels[1 * 6 + 3], pixels[1 * 6 + 4], pixels[1 * 6 + 5], pixels[2 * 6 + 3], pixels[2 * 6 + 4], pixels[2 * 6 + 5]], [4, 2, 0, 5, 3, 1]);
});

test('no-op normal swatch edit preserves animation identity and oversized scaling rejects', async () => {
  const { animation, active } = fixture(2, 2);
  const normal = ensureAnimationNormalLayer(animation);
  const normalLayerId = normal.layers.find(layer => layer.role === 'normal').id;
  const normalActive = { ...active, layerId: normalLayerId };
  const noOp = await prepareDrawAgentPlan(normal, normalActive, { type: 'pixel.set', frameId: '$active', layerId: '$active', x: 0, y: 0, colorIndex: null });
  assert.equal(noOp.animation, normal);
  let wide = createAnimation({ width: 200, height: 2, palette: ['#000000'] });
  await assert.rejects(prepareDrawAgentPlan(wide, { frameId: wide.frames[0].id, layerId: wide.layers[0].id }, { type: 'canvas.scale', percent: 800 }), /dimensions/i);
});

test('batch rejects undo before preparing any child operation', async () => {
  const { animation, active, frameId, layerId } = fixture();
  await assert.rejects(prepareDrawAgentPlan(animation, active, { type: 'batch', operations: [
    { type: 'pixel.set', frameId: '$active', layerId: '$active', x: 0, y: 0, colorIndex: 1 }, { type: 'undo' },
  ] }), /cannot be batch, undo, redo, or save/i);
  assert.equal(snapshot(animation, frameId, layerId)[0], 0);
});

test('same palette replacement is a no-op and normal/map extras count toward batch work',async()=>{
 const {animation,active}=fixture(2,2);
 const same=await prepareDrawAgentPlan(animation,active,{type:'palette.replace',index:0,color:'#111111'});
 assert.equal(same.animation,animation);assert.equal(same.result.changed,false);
 const large=createAnimation({width:1028,height:1028,palette:['#111111']});let calls=0;
 await assert.rejects(prepareDrawAgentPlan(large,{frameId:large.frames[0].id,layerId:large.layers[0].id},
 {type:'batch',operations:Array.from({length:9},()=>({type:'normal.generate',frameId:'$active'}))},
 {prepareExtraOperation:(value,selection)=>{calls++;return {animation:value,active:selection,result:{changed:false}}}}),/work/);
 assert.ok(calls>0 && calls<9);
});

test('spray dabs are deterministic, bounded at canvas edges, and preserve normal palettes', async () => {
  const { animation, active, frameId, layerId } = fixture(8, 8);
  const empty = writeAnimationCel(animation, frameId, layerId, { width: 8, height: 8, pixels: new Uint8Array(64) });
  const spray = { type: 'spray', frameId: '$active', layerId: '$active', x: 0, y: 0, colorIndex: 1, radius: 6, passes: 4, seed: 71 };
  const first = await prepareDrawAgentPlan(empty, active, spray);
  const second = await prepareDrawAgentPlan(empty, active, spray);
  assert.deepEqual(snapshot(first.animation, frameId, layerId), snapshot(second.animation, frameId, layerId));
  assert.ok(snapshot(first.animation, frameId, layerId).some(value => value === 1));
  assert.deepEqual(snapshot(empty, frameId, layerId), Array(64).fill(-1));
  let normal = ensureAnimationNormalLayer(empty);
  const normalLayerId = normal.layers.find(layer => layer.role === 'normal').id;
  const normalActive = { frameId, layerId: normalLayerId };
  const normalPalette = getAnimationLayerPalette(normal, normalLayerId);
  const normalSpray = await prepareDrawAgentPlan(normal, normalActive, { ...spray, layerId: '$active', colorIndex: 16 });
  assert.deepEqual(getAnimationLayerPalette(normalSpray.animation, normalLayerId), normalPalette);
  assert.ok(snapshot(normalSpray.animation, frameId, normalLayerId).every(value => value === -1 || value === 16));
  await assert.rejects(prepareDrawAgentPlan(empty, active, { ...spray, passes: 33 }), /out of range/i);
});

test('selection rotation and polygon mask use existing raster helpers', async () => {
  let animation = createAnimation({ width: 6, height: 6, palette: ['#111111', '#eeeeee'] });
  const frameId = animation.frames[0].id, layerId = animation.layers[0].id;
  animation = writeAnimationCel(animation, frameId, layerId, { width: 6, height: 6, pixels: Array.from({ length: 36 }, (_, index) => index < 16 ? 2 : 0) });
  const active = { frameId, layerId };
  const polygon = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
  const clipped = await prepareDrawAgentPlan(animation, active, { type: 'selection.transform', frameId: '$active', layerId: '$active',
    bounds: { x: 0, y: 0, width: 4, height: 4 }, x: 2, y: 2, polygon, copy: true });
  const pixels = snapshot(clipped.animation, frameId, layerId);
  assert.deepEqual([pixels[2 * 6 + 2], pixels[2 * 6 + 3], pixels[3 * 6 + 2], pixels[3 * 6 + 3]], [1, 1, 1, 1]);
  assert.equal(pixels[4 * 6 + 4], -1);
  const rotated = await prepareDrawAgentPlan(animation, active, { type: 'selection.transform', frameId: '$active', layerId: '$active',
    bounds: { x: 0, y: 0, width: 4, height: 4 }, x: 1, y: 1, angle: 22.5, copy: true });
  assert.notDeepEqual(snapshot(rotated.animation, frameId, layerId), snapshot(animation, frameId, layerId));
  await assert.rejects(prepareDrawAgentPlan(animation, active, { type: 'selection.transform', frameId: '$active', layerId: '$active',
    bounds: { x: 0, y: 0, width: 4, height: 4 }, x: 1, y: 1, angle: 45, turns: 1 }), /cannot both/i);
});
