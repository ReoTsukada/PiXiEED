import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('camera layout: status on top, five tools at the bottom, one tray of choices', () => {
  const html = read('pixel-camera.html');
  assert.match(html, /id="flipCamera"/, 'top right switches front / back camera');
  assert.doesNotMatch(html, /id="stopCamera"|id="sizePopover"|id="ditherRail"/, 'no pause button, no settings sheet, no side rail');
  const tools = [...html.matchAll(/data-tool="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tools, ['look', 'dither', 'pixels', 'aspect', 'tone']);
  for (const panel of ['look', 'dither', 'pixels', 'aspect', 'tone']) assert.match(html, new RegExp(`data-panel="${panel}"[^>]*hidden`), `${panel} row starts folded`);
  assert.match(html, /id="gifRec"/);
  assert.match(html, /id="paletteStrip"/, 'the 色 row carries the editable palette');
  assert.match(html, /id="paletteSave"/);
});

test('dither button: a plain switch while off, the pattern chooser while on', () => {
  const app = read('js/pixel-lens/app.mjs');
  assert.match(app, /if \(state\.gradientMode !== 'dither'\) \{\s*state\.gradientMode = 'dither'/);
  assert.match(app, /button\.dataset\.value === 'none'\) \{ state\.gradientMode = 'none'/);
  assert.match(app, /onSwipe/);
  assert.match(app, /function startGif\(/);
});

test('the tray can never widen the bottom area (16 colours scroll inside a fixed-size strip)', () => {
  const css = read('css/pixel-lens-camera.css');
  assert.match(css, /\.lc-bottom \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.lc-tray, \.lc-look, \.lc-tone, \.lc-palette-editor \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.lc-palette-strip \{[^}]*width: min\(calc\(100% - 1\.6rem\), 23rem\)[^}]*height: 2\.75rem/);
});
