import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lens = fs.readFileSync(path.join(root, 'pixiee-lens/index.html'), 'utf8');
const sharedBar = fs.readFileSync(path.join(root, 'scripts/shared-tab-bar.js'), 'utf8');

assert.doesNotMatch(lens, /stampBtn|stampPanel|STAMP_LIBRARY|スタンプ/);
assert.doesNotMatch(lens, /paletteMenuBtn|id="paletteMenu"/);
assert.match(lens, /id="dotSettingsPanel"[\s\S]{0,900}id="paletteDisplay"[\s\S]{0,2200}id="dotScaleSelect"/);
assert.match(lens, /<button[^>]*aria-hidden="true"[^>]*disabled[^>]*id="clearPixelBtn"/);
assert.match(lens, /const canUndo = Boolean\(photoSourceImage \|\| overlays\.length > 0\)/);
assert.match(lens, /if \(photoSourceImage\) \{[\s\S]{0,120}clearPhotoSource\(\);[\s\S]{0,120}\} else \{[\s\S]{0,120}clearActiveOverlay\(\);/);
assert.match(sharedBar, /\{ id: 'clear', label: '読み込みを取り消す', selector: '#clearPixelBtn'/);
assert.match(sharedBar, /\{ id: 'dots', label: 'ドット・色設定', selector: '#dotModeBtn'/);
assert.doesNotMatch(sharedBar, /id: 'stamp'|id: 'color'/);

console.log('PiXiEELENS unified controls checks passed.');
