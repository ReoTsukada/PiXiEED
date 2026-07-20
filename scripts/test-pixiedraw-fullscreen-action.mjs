import assert from 'node:assert/strict';
import fs from 'node:fs';

const draw = fs.readFileSync('pixiedraw/index.html', 'utf8');
const devDraw = fs.readFileSync('PiXiEEDrawDEV/index.html', 'utf8');
const tabBar = fs.readFileSync('scripts/shared-tab-bar.js', 'utf8');
const bottomNav = fs.readFileSync('scripts/shared-bottom-nav.js', 'utf8');

assert.match(draw, /<body class="app-preinit" data-pixieed-fullscreen-action="tabbar">/);
assert.match(draw, /<button aria-pressed="false" hidden id="fullscreenButton" type="button">拡大<\/button>/);
assert.match(devDraw, /<body class="app-preinit" data-pixieed-fullscreen-action="tabbar">/);
assert.match(devDraw, /<button aria-pressed="false" hidden id="fullscreenButton" type="button">拡大<\/button>/);
assert.match(tabBar, /id: 'fullscreen', label: '拡大', selector: '#fullscreenButton', icon: 'expand\.png', iconWhenPressed: 'shrink\.png', mirrorState: true, mode: 'fullscreen', fullscreenController: 'tool', placement: 'trailing'/);
assert.match(bottomNav, /shared-tab-bar\.js\?v=2026\.07\.20-draw-fullscreen1/);

console.log('PiXiEEDraw fullscreen common-action checks passed.');
