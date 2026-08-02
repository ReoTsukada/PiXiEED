import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [timeline, drawing, app, css] = await Promise.all([
  readFile(new URL('../pixiedraw/assets/js/modules/timeline-layers.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/canvas-drawing-workflow-utils.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/css/style.css', import.meta.url), 'utf8'),
]);

assert.match(timeline, /visibilityToggle\.textContent = '●'/);
assert.match(timeline, /getDisplayedLayerVisibility\(layer, true\) \? 1 : 0/);
assert.match(timeline, /isVisibilityHeader[\s\S]*rowVisible \? 'layer' : 'layerHidden'/);
assert.match(timeline, /applyTimelineCellFrame\(rowVisibilityCell, rowVisibility \? 'layer' : 'layerHidden'\)/);
assert.match(timeline, /header\.classList\.toggle\('is-active-layer-row', isActiveLayerRow\)/);
assert.match(timeline, /rowVisibilityCell\.classList\.add\('is-active-layer-row'\)/);
assert.match(timeline, /slot\.classList\.contains\('is-active'\) && !slot\.classList\.contains\('is-hidden'\)/);
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
assert.match(css, /\.timeline-visibility\[aria-pressed='false'\][\s\S]*background: rgba\(112, 122, 138, 0\.26\)/);
assert.match(css, /\.timeline-slot\.is-hidden\.is-active \.timeline-slot__marker\s*{\s*transform: none;/);
assert.match(css, /\.timeline-cell--layer\.is-active-layer-row\s*{\s*display: flex;/);

console.log('PiXiEEDraw timeline visibility and drawn-cell state checks passed');
