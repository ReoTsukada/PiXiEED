import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const modulePath = new URL('../pixiedraw/assets/js/modules/canvas-render-workflow-utils.js', import.meta.url);
const context = {
  Map,
  Math,
  Number,
  Uint8ClampedArray,
  console,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, {
  filename: 'canvas-render-workflow-utils.js',
});

const frame = { id: 'frame-cache-test' };
const canvasCompositeFrameCache = {
  byFrame: new Map(),
  bytes: 0,
  maxBytes: 1024,
  hits: 0,
  misses: 0,
};
const cacheKey = `canvas-cache-test:${frame.id}`;
canvasCompositeFrameCache.byFrame.set(cacheKey, {
  width: 4,
  height: 4,
  bytes: 64,
  visualKey: 'test',
  imageData: { data: new Uint8ClampedArray(64) },
});
canvasCompositeFrameCache.bytes = 64;

const workflow = context.window.PiXiEEDrawModules.canvasRenderWorkflowUtils
  .createCanvasRenderWorkflowUtils({
    state: { width: 4, height: 4 },
    dirtyRegion: null,
    canvasCompositeFrameCache,
    getActiveProjectCanvasDocument: () => ({ id: 'canvas-cache-test' }),
    getActiveFrame: () => frame,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  });

workflow.markDirtyRect(1, 1, 2, 2);
assert.equal(
  workflow.getCanvasCompositeFrameCacheStats().entries,
  1,
  'partial redraws may retain the composite cache for region patching'
);

workflow.markDirtyRect(0, 0, 3, 3);
assert.equal(
  workflow.getCanvasCompositeFrameCacheStats().entries,
  0,
  'a full-canvas fill must invalidate the stale composite before rendering'
);
const dirtyRegion = workflow.takeDirtyRegion();
assert.equal(dirtyRegion?.x0, 0);
assert.equal(dirtyRegion?.y0, 0);
assert.equal(dirtyRegion?.x1, 3);
assert.equal(dirtyRegion?.y1, 3, 'the full dirty region must still be rendered after cache invalidation');

canvasCompositeFrameCache.byFrame.set(cacheKey, {
  width: 4,
  height: 4,
  bytes: 64,
  visualKey: 'test',
  imageData: { data: new Uint8ClampedArray(64) },
});
canvasCompositeFrameCache.bytes = 64;
workflow.markDirtyRect(0, 0, 1, 3);
workflow.markDirtyRect(2, 0, 3, 3);
assert.equal(
  workflow.getCanvasCompositeFrameCacheStats().entries,
  0,
  'accumulated dirty regions covering the full canvas must also invalidate the stale composite'
);

console.log('PiXiEEDraw canvas composite cache invalidation checks passed');
