import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lens = fs.readFileSync(path.join(root, 'pixiee-lens/index.html'), 'utf8');
const sharedBar = fs.readFileSync(path.join(root, 'scripts/shared-tab-bar.js'), 'utf8');
const colorDepthControl = lens.match(/<select id="colorDepthSelect"[\s\S]*?<\/select>/)?.[0] || '';

assert.doesNotMatch(lens, /stampBtn|stampPanel|STAMP_LIBRARY|スタンプ/);
assert.doesNotMatch(lens, /paletteMenuBtn|id="paletteMenu"/);
assert.match(lens, /id="cameraSettingsPanel"[\s\S]{0,400}data-settings-tab="camera"[\s\S]{0,400}data-settings-tab="dot"/);
assert.match(lens, /id="dotSettingsPanel"[\s\S]{0,1800}id="paletteDisplay"/);
assert.match(lens, /id="paletteDisplay"[\s\S]{0,1400}id="dotScaleSelect"/);
assert.match(lens, /id="surfaceSimplifyRange"[\s\S]{0,300}value="55"/);
assert.doesNotMatch(lens, /id="dotModeBtn"/);
assert.match(lens, /const COLOR_DEPTHS = \['full', '16', '8', '4', '2'\]/);
assert.match(colorDepthControl, /<option value="2">1BIT（2色）<\/option>[\s\S]{0,160}<option value="8">3BIT（8色）<\/option>[\s\S]{0,160}<option value="16">4BIT（16色）<\/option>[\s\S]{0,160}<option value="full">フルカラー<\/option>/);
assert.doesNotMatch(colorDepthControl, /<option value="(?:32|64|128|256)">/);
assert.match(lens, /id="paletteModeSelect"[\s\S]{0,280}画像由来[\s\S]{0,280}GB固定4色/);
assert.match(lens, /function applySurfaceSimplify\(/);
assert.match(lens, /function removeSmallRegions\(/);
assert.match(lens, /strength < 75 \|\| width > 160 \|\| height > 160/);
assert.match(lens, /function buildSourcePalette\(/);
assert.match(lens, /function createEdgeMap\(/);
assert.match(lens, /const ditherStrength = useDither \? \(depth === '2' \? 48 : 32\) : 0;/);
assert.match(lens, /if \(useDither\) \{[\s\S]{0,280}DITHER_MATRIX_4X4/);
assert.match(lens, /<button[^>]*aria-hidden="true"[^>]*disabled[^>]*id="clearPixelBtn"/);
assert.match(lens, /const canUndo = Boolean\(photoSourceImage \|\| overlays\.length > 0\)/);
assert.match(lens, /if \(photoSourceImage\) \{[\s\S]{0,120}clearPhotoSource\(\);[\s\S]{0,120}\} else \{[\s\S]{0,120}clearActiveOverlay\(\);/);
assert.match(sharedBar, /\{ id: 'clear', label: '読み込みを取り消す', selector: '#clearPixelBtn'/);
assert.doesNotMatch(sharedBar, /id: 'dots'|#dotModeBtn/);
assert.doesNotMatch(sharedBar, /id: 'stamp'|id: 'color'/);

console.log('PiXiEELENS unified controls checks passed.');
