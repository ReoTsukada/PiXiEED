import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const controller = read('scripts/bottom-nav-footer-ad.js');
const navigation = read('scripts/shared-bottom-nav.js');
const index = read('pixiedraw/index.html');

assert.match(controller, /function isLocalPiXiEEDrawPreview\(\)/);
assert.match(controller, /host === 'localhost' \|\| host === '127\.0\.0\.1'/);
assert.match(controller, /const localFilePreview = isLocalPiXiEEDrawPreview\(\)/);
assert.match(controller, /is-local-preview \.ad-block::after/);
assert.match(navigation, /bottom-nav-footer-ad\.js\?v=20260730-pixiedraw-local-preview1/);
assert.match(index, /shared-bottom-nav\.js\?v=20260730-pixiedraw-local-preview1/);

console.log('PiXiEEDraw portrait local ad preview checks passed.');
