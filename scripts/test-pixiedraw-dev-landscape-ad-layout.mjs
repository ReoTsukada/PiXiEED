import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const css = read('PiXiEEDrawDEV/assets/css/style.css');
const index = read('PiXiEEDrawDEV/index.html');
const sharedAdController = read('scripts/bottom-nav-footer-ad.js');

assert.match(index, /style\.css\?v=2026\.07\.11-landscape-rotated-ad-fix1/);
assert.match(css, /body\[data-pixieed-page="pixiedraw"\] \.pixieed-shared-top-ad \{[\s\S]*?--pixieed-landscape-side-ad-length: min\([\s\S]*?100dvh/);
assert.match(css, /body\[data-pixieed-page="pixiedraw"\] \.pixieed-shared-top-ad \{[\s\S]*?overflow: hidden !important;[\s\S]*?clip-path: inset\(0\);/);
assert.match(css, /\.pixieed-shared-top-ad \.ad-block \{[\s\S]*?width: var\(--pixieed-landscape-side-ad-length\) !important;[\s\S]*?height: 50px !important;/);
assert.match(css, /\.pixieed-shared-top-ad ins\.adsbygoogle iframe \{[\s\S]*?max-height: 50px !important;/);
assert.match(sharedAdController, /body\[data-pixieed-page="pixiedraw"\] \.pixieed-shared-top-ad \.ad-block,[\s\S]*?transform:translate\(-50%, -50%\) rotate\(90deg\);/);

console.log('PiXiEEDraw DEV landscape rotated banner layout checks passed');
