import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const html = read('draw/editor.html');
const css = read('css/draw-tool-picker.css');
const runtime = read('js/creation/draw-page.mjs');

test('compact tool menu keeps its paint, shapes and selection controls together', () => {
  for (const role of ['paint', 'shapes', 'select']) {
    assert.match(html, new RegExp(`id="draw-tool-group-${role}"`));
  }
  for (const tool of ['pen', 'eraser', 'fill', 'spray', 'line', 'rectangle', 'rectangle-fill', 'ellipse', 'ellipse-fill', 'picker']) {
    assert.ok(html.includes(`data-draw-tool="${tool}"`), tool);
  }
  for (const mode of ['rectangle', 'lasso', 'color']) assert.match(html, new RegExp(`data-selection-mode="${mode}"`));
  assert.match(runtime, /\.draw-tool-menu \.draw-tool-group'\)\.append\(textSlot\)/);
  assert.match(css, /\.draw-text-tool-slot > \.draw-text-opener\s*\{[\s\S]*?min-height:\s*52px\s*!important/);
  assert.match(css, /\.draw-tool-group > \.draw-select-tool-modes\s*\{[\s\S]*?grid-column:\s*1 \/ -1 !important/);
  assert.match(css, /\.draw-select-tool-modes > button\s*\{[\s\S]*?grid-template-rows:\s*28px 16px !important/);
  assert.match(html, /draw-tool-picker\.css\?rev=20261029-layout-1/);
});

test('live pointer input queues changed pixels and final stroke paint cancels old frame', () => {
  assert.match(runtime, /createStrokePaintScheduler/);
  assert.match(runtime, /if \(deferPaint\) strokePaintScheduler\.queue\(changed\); else paint\(changed\)/);
  assert.match(runtime, /applyDrawPoint\(pointFromEvent\(sample\), null, true\)/);
  assert.match(runtime, /applyDrawPoint\(pointFromEvent\(event\), event, coalescedTool\)/);
  assert.match(runtime, /function endStroke\([\s\S]*?strokePaintScheduler\.cancel\(\)/);
  assert.match(runtime, /scope\.add\(\(\) => strokePaintScheduler\.dispose\(\)\)/);
});
