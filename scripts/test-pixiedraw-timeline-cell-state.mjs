import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [timeline, drawing, app, css] = await Promise.all([
  readFile(new URL('../pixiedraw/assets/js/modules/timeline-layers.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/canvas-drawing-workflow-utils.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/css/style.css', import.meta.url), 'utf8'),
]);

assert.match(timeline, /visibilityToggle\.textContent = rowVisibility \? '●' : '×'/);
assert.match(timeline, /function markTimelineLayerRasterContent\(/);
assert.match(timeline, /function reconcileTimelineLayerRasterContent\(/);
assert.match(timeline, /timelineRasterContentMarkedLayers\.delete\(layer\)/);
assert.match(timeline, /marker\.remove\(\)/);
assert.match(timeline, /slot\.appendChild\(marker\)/);
assert.match(drawing, /function markRasterHistoryDirty\(layer\)/);
assert.match(drawing, /notifyTimelineLayerRasterContent\?\.\(layer\)/);
assert.match(drawing, /shouldReconcileContent = pointerState\.tool === 'eraser'/);
assert.match(drawing, /reconcileTimelineLayerRasterContent\?\.\(contentLayer\)/);
assert.match(app, /get notifyTimelineLayerRasterContent\(\)/);
assert.match(app, /get reconcileTimelineLayerRasterContent\(\)/);
assert.match(app, /notifyTimelineLayerRasterContent\(target\?\.layer, target\?\.frame, \{ verifyContent: true \}\)/);
assert.match(css, /\.timeline-visibility\[aria-pressed='false'\][\s\S]*background: rgba\(176, 52, 72, 0\.82\)/);

console.log('PiXiEEDraw timeline visibility and drawn-cell state checks passed');
