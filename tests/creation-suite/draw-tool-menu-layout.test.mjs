import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const html = read('draw/editor.html');
const css = read('css/draw-tool-picker.css');
const featureCss = read('css/draw-selection-features.css');
const textIcon = read('assets/icons/pixieed/text.svg');
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
  assert.match(css, /\.draw-text-tool-slot > \.draw-text-opener\s*\{[\s\S]*?font-size:\s*0\s*!important/);
  assert.doesNotMatch(css, /\.draw-text-tool-slot > \.draw-text-opener\s*\{[^}]*\bfont\s*:/);
  assert.match(featureCss, /\.draw-text-opener\s*\{\s*--draw-action-icon:url\('\/assets\/icons\/pixieed\/text\.svg'\)/);
  assert.match(textIcon, /<path d="M5 7V4h14v3M12 4v16M8 20h8"\/>/);
  assert.match(css, /\.draw-tool-group > \.draw-select-tool-modes\s*\{[\s\S]*?grid-column:\s*1 \/ -1 !important/);
  assert.match(css, /\.draw-select-tool-modes > button\s*\{[\s\S]*?grid-template-rows:\s*28px 16px !important/);
  assert.match(html, /draw-tool-picker\.css\?rev=20261106-button-icon-audit-1/);
});

test('live pointer input queues changed pixels and final stroke paint cancels old frame', () => {
  assert.match(runtime, /createStrokePaintScheduler/);
  assert.match(runtime, /if \(deferPaint\) strokePaintScheduler\.queue\(changed\); else paint\(changed\)/);
  assert.match(runtime, /applyDrawPoint\(pointFromEvent\(sample, canvasRect\), null, true, canvasRect\)/);
  assert.match(runtime, /applyDrawPoint\(pointFromEvent\(event, canvasRect\), event, coalescedTool, canvasRect\)/);
  assert.match(runtime, /function endStroke\([\s\S]*?strokePaintScheduler\.cancel\(\)/);
  assert.match(runtime, /scope\.add\(\(\) => strokePaintScheduler\.dispose\(\)\)/);
});
