import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const css = read('css/draw-compact-controls.css');

test('compact palette and both action rails share row origin and pitch', () => {
  const rails = css.match(/html:not\(\[data-game-draw-runtime="true"\]\) body\[data-page="draw"\] \.draw-controls > :is\(\.draw-fixed-left, \.draw-fixed-right\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(rails, 'the game editor keeps its own two-row layout');
  for (const declaration of ['box-sizing: border-box', 'height: 150px', 'padding-block: 3px', 'gap: 6px', 'align-content: start']) assert.ok(rails.includes(declaration), declaration);
  assert.match(css, /#draw-palette\s*\{[^}]*grid-template-rows:\s*repeat\(3, 44px\)[^}]*gap:\s*6px[^}]*padding:\s*3px/);
});

test('compact selected palette tiles stay centered without resizing their hit area', () => {
  assert.match(css, /\.draw-controls #draw-palette \.draw-color:is\(\[aria-pressed="true"\], :active\)\s*\{\s*transform:\s*none !important/);
  assert.match(read('css/draw-ui.css'), /\.draw-color\[aria-pressed="true"\]\s*\{[^}]*border-color:\s*#fff[^}]*box-shadow:/, 'selection ring remains visible');
  const revision = JSON.parse(read('tests/runtime-cache-revisions.json'))['css/draw-compact-controls.css'];
  assert.equal(revision, '20261108-palette-alignment-1');
  assert.ok(read('draw/editor.html').includes('draw-compact-controls.css?rev=' + revision));
});
