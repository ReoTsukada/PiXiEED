import assert from 'node:assert/strict';
import fs from 'node:fs';

const draw = fs.readFileSync('pixiedraw/index.html', 'utf8');
const tabBar = fs.readFileSync('scripts/shared-tab-bar.js', 'utf8');
const bottomNav = fs.readFileSync('scripts/shared-bottom-nav.js', 'utf8');
const fullscreen = fs.readFileSync('scripts/tool-fullscreen.js', 'utf8');

assert.match(draw, /<body class="app-preinit" data-pixieed-fullscreen-action="tabbar">/);
assert.match(draw, /<button aria-pressed="false" hidden id="fullscreenButton" type="button">拡大<\/button>/);
assert.match(draw, /id="pixieedPwaInstallButton" type="button">インストール案内を開く<\/button>/);
assert.match(tabBar, /id: 'fullscreen', label: '拡大', selector: '#fullscreenButton', icon: '拡大\.png', iconWhenPressed: '縮小\.png', mirrorState: true, mode: 'fullscreen', fullscreenController: 'tool', placement: 'leading'/);
assert.match(tabBar, /label: 'アプリとして使う', selector: '#pixieedPwaInstallButton'[\s\S]{0,160}mirrorDisabled: true/);
assert.match(tabBar, /const fullscreenActions = state\.actions\.filter\(isFullscreenAction\);/);
assert.match(tabBar, /\[myPage, state\.reloadAction, \.\.\.state\.details\.filter/);
assert.doesNotMatch(tabBar, /createActionControl\(state\.reloadAction, 'pixieed-common-tabbar__button'\)/);
assert.match(bottomNav, /shared-tab-bar\.js\?v=2026\.07\.20-draw-pwa1/);
assert.doesNotMatch(fullscreen, /html:fullscreen \.bottom-nav,html:fullscreen \.pixieed-shared-top-ad/);

console.log('PiXiEEDraw fullscreen common-action checks passed.');
