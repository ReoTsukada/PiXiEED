import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCameraPlacementMapping,
  createCameraPlacementRenderer,
  sampleCameraFrameToPlacement
} from '../../js/creation/camera-placement-preview.mjs';
import { cameraPixels, planCameraReplacement } from '../../js/creation/draw-camera-core.mjs?rev=20261012-animation-core-contract-1';

function rgba(width, height, colors) {
  const data = new Uint8ClampedArray(width * height * 4);
  colors.forEach((color, index) => data.set(color, index * 4));
  return { width, height, data };
}
function map({ sourceWidth=1, sourceHeight=1, width, height, bounds={ x:0, y:0, width, height }, cells, mask=null }) {
  return createCameraPlacementMapping({ sourceWidth, sourceHeight, width, height, bounds, cells, mask });
}
function snapshot({ width, height, palette=['#ff0000', '#0000ff'], below, active, above, ...extra }) {
  return { width, height, palette, below:Int16Array.from(below), active:Int16Array.from(active), above:Int16Array.from(above), allowedIndices:palette.map((_, i) => i), ...extra };
}

 test('placement sampling uses pixel-center nearest-neighbour mapping for a centered crop', () => {
  const mapping = map({ sourceWidth:4, sourceHeight:2, width:2, height:2, cells:[0,1,2,3] });
  const frame = rgba(4, 2, [
    [0,0,0,255], [10,0,0,255], [20,0,0,255], [30,0,0,255],
    [40,0,0,255], [50,0,0,255], [60,0,0,255], [70,0,0,255]
  ]);
  const before = new Uint8ClampedArray(frame.data);
  const sampled = sampleCameraFrameToPlacement(frame, mapping);
  assert.deepEqual([...sampled.filter((_, i) => i % 4 === 0)], [10,20,50,60]);
  assert.deepEqual(frame.data, before);
});

test('placement replaces only active-layer selected cells and leaves upper artwork above it', () => {
  const mapping = map({ width:3, height:1, cells:[1] });
  const renderer = createCameraPlacementRenderer(snapshot({ width:3, height:1, below:[0,-1,-1], active:[-1,0,-1], above:[-1,-1,1] }), mapping);
  const preview = renderer.render(rgba(1,1,[[0,255,0,255]]));
  assert.deepEqual([...preview], [255,0,0,255, 0,255,0,255, 0,0,255,255]);
});

test('a transparent sampled pixel reveals the cached lower artwork', () => {
  const mapping = map({ width:1, height:1, cells:[0] });
  const renderer = createCameraPlacementRenderer(snapshot({ width:1, height:1, below:[0], active:[1], above:[-1] }), mapping);
  assert.deepEqual([...renderer.render(rgba(1,1,[[0,0,0,0]]))], [255,0,0,255]);
});

test('an irregular selection preserves holes and produces internal boundary edges', () => {
  const mask = Uint8Array.from([1,1,1, 1,0,1, 1,1,1]);
  const cells = Uint32Array.from([0,1,2,3,5,6,7,8]);
  const mapping = map({ width:3, height:3, cells, mask });
  const renderer = createCameraPlacementRenderer(snapshot({ width:3, height:3, below:Array(9).fill(-1), active:Array(9).fill(0), above:Array(9).fill(-1) }), mapping);
  const preview = renderer.render(rgba(1,1,[[0,255,0,255]]));
  assert.deepEqual([...preview.slice(4 * 4, 5 * 4)], [255,0,0,255]);
  assert.deepEqual([...preview.slice(0,4)], [0,255,0,255]);
  const boundary = new Set(mapping.edges);
  assert.ok(boundary.has(1 * 4 + 2)); // top-center bottom edge faces the hole
  assert.ok(boundary.has(7 * 4)); // bottom-center top edge faces the hole
  assert.ok(boundary.has(3 * 4 + 1)); // middle-left right edge faces the hole
  assert.ok(boundary.has(5 * 4 + 3)); // middle-right left edge faces the hole
});

test('fixed-palette placement uses the same nearest-slot choices as camera application', () => {
  const palette = ['#000000', '#808080', '#ffffff'];
  const mapping = map({ sourceWidth:2, width:2, height:1, cells:[0,1] });
  const source = rgba(2,1,[[32,32,32,255],[223,223,223,255]]);
  const sourceBefore = new Uint8ClampedArray(source.data);
  const renderer = createCameraPlacementRenderer(snapshot({ width:2, height:1, palette, below:[-1,-1], active:[-1,-1], above:[-1,-1] }), mapping);
  const preview = renderer.render(source, { paletteFixed:true });
  const expectedSlots = cameraPixels(source.data, palette, [0,1,2]);
  const expected = [...expectedSlots].flatMap(index => {
    const color = palette[index]; return [1,3,5].map(n => Number.parseInt(color.slice(n,n+2),16)).concat(255);
  });
  assert.deepEqual([...preview], expected);
  assert.deepEqual(source.data, sourceBefore);
});

test('hidden and locked targets show cached artwork without applying camera pixels', () => {
  const mapping = map({ sourceWidth:2, width:2, height:1, cells:[0,1] });
  const base = snapshot({ width:2, height:1, below:[0,0], active:[1,1], above:[-1,-1], activeLocked:true });
  const locked = createCameraPlacementRenderer(base, mapping);
  const raw = rgba(2,1,[[0,255,0,255],[0,255,0,255]]);
  assert.deepEqual([...locked.render(raw)], [0,0,255,255, 0,0,255,255]);
  const hidden = createCameraPlacementRenderer({ ...base, activeLocked:false, activeVisible:false }, mapping);
  assert.deepEqual([...hidden.render(raw)], [255,0,0,255, 255,0,0,255]);
});

test('a hidden active music cel previews exactly the edited cel shown by the music-only canvas', () => {
  const palette = ['#ff0000', '#00ff00'];
  const source = rgba(1,1,[[0,255,0,255]]);
  const target = { width:1, height:1, cells:Uint32Array.of(0), palette, allowedIndices:[0,1], document:{ width:1, height:1, palette, pixels:[0] } };
  const planned = planCameraReplacement(target, source.data, { paletteFixed:true });
  const mapping = map({ width:1, height:1, cells:[0] });
  const renderer = createCameraPlacementRenderer(snapshot({ width:1, height:1, palette, below:[0], active:[0], above:[-1], activeVisible:false, musicOnly:true }), mapping);
  const preview = renderer.render(source, { paletteFixed:true });
  const applied = palette[planned.document.pixels[0]];
  assert.deepEqual([...preview], [1,3,5].map(n => Number.parseInt(applied.slice(n,n+2),16)).concat(255));
});

test('render and sampling buffers are reused across frames', () => {
  const mapping = map({ sourceWidth:2, width:2, height:1, cells:[0,1] });
  const renderer = createCameraPlacementRenderer(snapshot({ width:2, height:1, below:[-1,-1], active:[-1,-1], above:[-1,-1] }), mapping);
  const first = renderer.render(rgba(2,1,[[1,2,3,255],[4,5,6,255]]));
  const sampleBuffer = mapping.sampled;
  const second = renderer.render(rgba(2,1,[[7,8,9,255],[10,11,12,255]]));
  assert.equal(second, first);
  assert.equal(mapping.sampled, sampleBuffer);
});
