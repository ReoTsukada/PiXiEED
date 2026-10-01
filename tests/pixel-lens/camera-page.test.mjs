import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('camera layout: settings stay folded until requested, with one tray of choices', () => {
  const html = read('pixel-camera.html');
  assert.match(html, /id="flipCamera"/, 'top right switches front / back camera');
  assert.doesNotMatch(html, /id="stopCamera"|id="sizePopover"|id="ditherRail"/, 'no pause button, no settings sheet, no side rail');
  const tools = [...html.matchAll(/data-tool="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(new Set(tools), new Set(['look', 'dither', 'pixels', 'aspect', 'tone', 'zoom']));
  for (const panel of ['look', 'dither', 'pixels', 'aspect', 'tone', 'zoom']) assert.match(html, new RegExp(`data-panel="${panel}"[^>]*hidden`), `${panel} row starts folded`);
  assert.match(html, /id="cameraSettings"[^>]*aria-expanded="false"/);
  assert.match(html, /id="cameraSettingsPanel"[^>]*hidden/);
  assert.match(html, /id="gifRec"/);
  assert.match(html, /id="paletteStrip"/, 'the 色 row carries the editable palette');
  assert.match(html, /id="paletteSave"/);
});

test('camera starts at the displayed 128px preset and only renders choices through 256px', () => {
  const html = read('pixel-camera.html');
  const app = read('js/pixel-lens/app.mjs');
  assert.match(html, /data-tool="pixels"[^>]*>[\s\S]*?<b>128 px<\/b>/);
  assert.match(app, /size: normalizeOutputSize\(audioCameraRequest\?\.width \?\? 128\)/);
  assert.match(app, /for \(const size of sharedOutputSizes\(\)\) pixelsPanel\.appendChild/);
  assert.doesNotMatch(app, /for \(const size of OUTPUT_SIZES\)/);
  assert.match(app, /normalizeOutputSize\(audioCameraRequest\?\.width \?\? 128\)/);
  assert.match(app, /mark\(pixelsPanel, audioCameraRequest \|\| sharedImageTarget \? '' : String\(state\.size\)\)/);
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
  assert.match(css, /#pixelsPanel \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /#pixelsPanel button \{[^}]*min-height: 44px/);
  assert.match(css, /@media \(min-width: 720px\) \{ #pixelsPanel \{ grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(css, /#pixelsPanel button\[aria-checked="true"\] \{ background: #ffd35a/);
});
