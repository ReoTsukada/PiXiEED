import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('camera layout: six setting categories share a contextual rail without a separate settings button', () => {
  const html = read('pixel-camera.html');
  assert.match(html, /id="flipCamera"/, 'top right switches front / back camera');
  assert.doesNotMatch(html, /id="stopCamera"|id="sizePopover"|id="ditherRail"/, 'no pause button, no settings sheet, no side rail');
  const tools = [...html.matchAll(/data-tool="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(new Set(tools), new Set(['look', 'dither', 'pixels', 'aspect', 'tone', 'zoom']));
  assert.doesNotMatch(html, /id="cameraSettings"/, 'no separate settings launcher covers the preview');
  assert.match(html, /id="toolbarContextBack"/, 'the context has an explicit route back to the six settings');
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

test('the existing five navigation destinations and central shutter are retained', () => {
  const html = read('pixel-camera.html');
  const nav = html.match(/<nav class="app-tabs pc-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'the camera keeps the shared bottom navigation');
  const destinations = [...nav.matchAll(/data-nav="(map|camera|tools|profile)"/g)].map((m) => m[1]);
  assert.deepEqual(destinations, ['map', 'camera', 'tools', 'profile']);
  assert.match(nav, /id="capture"[^>]*data-action="capture"/);
  assert.match(nav, /class="pc-nav-shutter"/);
  assert.match(nav, /長押しでGIF/);
});


test('camera gestures use immediate tap palette refresh and hold-to-merge without double tap', () => {
  const html = read('pixel-camera.html');
  const app = read('js/pixel-lens/app.mjs');
  assert.match(html, /タップで色を選び直してピント合わせを要求/);
  assert.match(html, /長押しでその位置の色をライブ統合/);
  assert.doesNotMatch(html, /ダブルタップでその位置の色をライブ統合/);
  assert.match(app, /doubleTapEnabled: false,[\s\S]*?onTap: \(event\) => \{[\s\S]*?refreshObjects\(\);[\s\S]*?requestCameraFocusAt\(event\.clientX, event\.clientY, \{ silent: true \}\)/);
  assert.match(app, /onLongPress: \(event\) => \{[\s\S]*?beginRegionMerge\(event\.clientX, event\.clientY\)/);
});
