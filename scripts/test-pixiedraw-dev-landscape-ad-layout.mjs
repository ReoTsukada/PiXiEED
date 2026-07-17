import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const index = read('PiXiEEDrawDEV/index.html');
const sharedAdController = read('scripts/bottom-nav-footer-ad.js');

assert.match(index, /style\.css\?v=20260715-export-preview-ad-layout1/);
assert.match(sharedAdController, /@media \(orientation: landscape\)\{[\s\S]*?\.pixieed-shared-top-ad\{display:none!important\}/);
assert.match(sharedAdController, /if \(arePixieedAdsDisabled\(\)\s*\|\|\s*isLandscapeViewport\(\)\) \{\s*removeTopAd\(\);/,
  'the shared top banner must be removed in landscape on every page');

console.log('PiXiEEDraw DEV landscape rotated banner layout checks passed');
