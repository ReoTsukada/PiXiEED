import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureHomePlayState, restoreHomePlayState, pushHomePlayHistory, settleHomePlayPieces, finishHomePlayIntro, HOME_PLAY_MAX_CELLS, HOME_PLAY_MAX_HISTORY } from '../../js/home-play-state.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('home: tool cards have working toys and creation links lead the page', () => {
  const html = read('index.html'); const source = read('js/home-play.mjs'); const toysSource = read('js/tool-toys.mjs');
  const toys = [...html.matchAll(/data-toy="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(toys.length >= 8);
  for (const toy of toys) assert.match(toysSource, new RegExp(`\\n  ${toy}\\(el\\) \\{`), toy);
  assert.match(source, /createToolToys\(\{ note, animate, interactive: true \}\)/, 'home uses the shared interactive previews');
  assert.match(html, /class="hp-creation-links"[\s\S]*?data-toy="editor" href="\/draw\/"[\s\S]*?data-toy="sound" href="\/audio\/"/);
  assert.doesNotMatch(html, /data-toy="game"/);
  assert.doesNotMatch(html, /PiXiEEDraw|PiXiEELENS|PXDraw/);
  assert.match(source, /prefers-reduced-motion/);
});

test('home hero: draw, let go and it drops; a full row clears; letters burst; stars can be caught', () => {
  const html = read('index.html'); const source = read('js/home-play.mjs');
  assert.match(html + source, /hpScore/);
  assert.match(source, /文字はタップ。指で描くなら「描く」。/);
  for (const fn of ['burstLetter', 'catchStar', 'inkAt', 'release', 'invite']) assert.match(source, new RegExp(`function ${fn}\\(`), fn);
  assert.match(source, /isSolid = \(x, y\) => y >= F/, 'pieces and letters land above the colour bar');
  assert.match(source, /const stop = \(\) => \{ if \(drawing\) release\(\);/, 'the drawing drops only when the finger lifts');
  assert.doesNotMatch(source, /now - d\.born > 700/, 'ink no longer crumbles on a timer');
  assert.match(source, /a full row vanishes/);
});

test('home hero: a tap and a drag never mix — a stroke draws and knocks letters loose, but never catches a star', () => {
  const source = read('js/home-play.mjs');
  assert.match(source, /const SLOP = \d+;/);
  assert.match(source, /Math\.hypot\(e\.clientX - press\.cx, e\.clientY - press\.cy\) < SLOP/);
  assert.match(source, /function tap\(x, y, quick, \{ drawBlank = true \} = \{\}\)/);
  const ink = source.match(/function inkAt\([\s\S]*?\n  \}/)[0];
  assert.match(ink, /burstLetter/, 'a stroke through the word still knocks letters loose');
  assert.doesNotMatch(ink, /catchStar|takeStar/, 'a stroke never catches a star');
  const down = source.match(/canvas\.addEventListener\('pointerdown'[\s\S]*?\n  \}\);/)[0];
  assert.doesNotMatch(down, /burstLetter|catchStar|inkAt/, 'nothing happens on touch-down');
});

test('home hero: the play leads somewhere — invitations matched to what the visitor enjoys', () => {
  const source = read('js/home-play.mjs');
  assert.match(source, /interest\.ink === \d+\) invite\('editor'\)/);
  assert.doesNotMatch(source, /invite\('game'\)/);
  assert.match(source, /invite\('sound'\)/); assert.match(source, /invite\('find'\)/);
  for (const kind of ['editor', 'find', 'sound']) assert.match(source, new RegExp(`\\n  ${kind}: \\[`), `icon ${kind}`);
  // keyboard play
  assert.match(source, /canvas\.tabIndex = 0/); assert.match(source, /ArrowLeft/);
});

test('home: discovery follows the mini experience and links to published tools', () => {
  const html = read('index.html'); const source = read('js/home-play.mjs');
  assert.match(html, /この先で、作品をつくる/);
  for (const path of ['/pixel-camera.html', '/globe/', '/jigsaw/', '/play/spot-difference/', '/play/hidden-object/', '/output/']) assert.ok(html.includes(`href="${path}"`), path);
  assert.match(html, /hp-feature-card--camera/); assert.match(html, /hp-feature-card--map/); assert.match(html, /hp-compact-grid/); assert.match(html, /hp-output-card/);
  assert.match(html, /ホームの体験はお試し。保存・編集は、制作ツールで。/);
  assert.match(source, /function groupToys\(/);
  assert.match(html, /data-home-feed hidden/); assert.match(source, /async function feed\(/);
});

test('home hero: each colour is its own instrument — drawing, landing and cleared rows all play it', () => {
  const source = read('js/home-play.mjs');
  const names = source.match(/const INSTRUMENTS = \[([^\]]+)\]/)[1].split(',').map((n) => n.trim().replace(/'/g, ''));
  assert.deepEqual(names, ['ピアノ', '鉄琴', 'マリンバ', 'フルート', 'ベース', 'オルゴール', 'ドラム']);
  for (let i = 0; i < 6; i++) assert.match(source, new RegExp(`case ${i}: `), `instrument ${i}`);
  assert.match(source, /play\(color, Math\.round\(\(H - c\.y\)/, 'the pen plays its colour');
  assert.match(source, /play\(mid\.v - 1,/, 'a landing piece plays its colour');
  assert.match(source, /play\(row\[x\],/, 'a cleared row plays its colours');
});

test('home hero: a finer grid (letters about 4 dots thick), shooting star and pile score', () => {
  const source = read('js/home-play.mjs');
  assert.match(source, /const scale = Math\.max\(2, Math\.min\(4,/);
  assert.match(source, /const BR = 2;/);
  for (const fn of ['catchShooter', 'playPile', 'shake', 'takeStar']) assert.match(source, new RegExp(`function ${fn}\\(`), fn);
  assert.match(source, /one burst catches at most three stars/);
  assert.match(source, /createHomeMotion/);
  assert.doesNotMatch(source, /catchCat|nextCat|wordTop|wordBottom|CAT\s*=/);
  assert.match(source, /ctx\.putImageData\(img, 0, 0\)/, 'drawn through one ImageData');
  const html = read('index.html');
  assert.doesNotMatch(html, /id="hpGyro"/, 'motion starts from a play gesture without a visible start control');
  assert.match(html, /class="hp-gyro-status visually-hidden" id="hpGyroStatus" aria-live="polite"/);
  assert.match(source, /createHomeMotion\(\{ button: document.getElementById\('hpMotion'\), status: gyroStatus,/);
  assert.doesNotMatch(source, /gyroButton/);
  const homeCss = read('css/home.css');
  assert.match(homeCss, /\.hp-invite \{ position: absolute; top: 3\.25rem; left: 1rem;/);
  assert.match(homeCss, /\.hp-invite \{[^}]*max-width: calc\(100% - 7rem\); min-height: 44px;/);
  assert.doesNotMatch(html, /猫|ネコ|ねこ/);
});

test('home hero state: sparse drawings remap between portrait and landscape grids and reject invalid or oversized data', () => {
  const sand = new Uint8Array(8 * 12); sand[2 * 8 + 3] = 4; sand[10 * 8 + 6] = 2;
  const ink = new Map([['4,3', { x: 4, y: 3, color: 2, born: 10 }]]);
  const saved = captureHomePlayState({ width: 8, height: 12, floor: 11, sand, pieces: [{ cells: [{ x: 1, y: 4, v: 7 }] }], ink, color: 3, frozen: true });
  const restored = restoreHomePlayState(saved, 12, 8, 7);
  assert.ok(restored); assert.equal(restored.sand[1 * 12 + 5], 4);
  assert.deepEqual(restored.pieces[0].cells[0], { x: 2, y: 3, v: 7 });
  assert.deepEqual([...restored.ink.values()][0], { x: 6, y: 2, color: 2, born: 0 });
  assert.equal(restored.color, 3); assert.equal(restored.frozen, true);
  assert.equal(restoreHomePlayState({ ...saved, settled: [[NaN, 0, 2]] }, 12, 8, 7), null);
  assert.equal(restoreHomePlayState({ ...saved, pieces: Array(HOME_PLAY_MAX_CELLS + 1).fill([0, 0, 1]) }, 12, 8, 7), null);
  const dense = new Uint8Array((HOME_PLAY_MAX_CELLS + 1) * 2); dense.fill(1);
  assert.equal(captureHomePlayState({ width: HOME_PLAY_MAX_CELLS + 1, height: 2, floor: 2, sand: dense }).settled.length, HOME_PLAY_MAX_CELLS);
});

test('home hero state: undo snapshots stay one operation and bounded', () => {
  const history = Array.from({ length: HOME_PLAY_MAX_HISTORY }, (_, n) => n);
  assert.deepEqual(pushHomePlayHistory(history, 99), [...history.slice(1), 99]);
});

test('home hero controls expose opt-in sound, guarded clear, freeze, draw mode and undo contracts', () => {
  const html = read('index.html'); const source = read('js/home-play.mjs');
  assert.match(html, /id="hpPaletteToggle"[^>]*aria-expanded="false" aria-controls="hpPalette"/);
  assert.match(html, /id="hpPalette" hidden/); assert.match(html, /id="hpUndo"[^>]*disabled/);
  assert.match(html, /id="hpClearDialog"/); assert.match(html, /id="hpStatus"[^>]*aria-live="polite"/);
  assert.match(source, /let audio = null; let soundOn = false/);
  assert.match(source, /if \(!soundOn \|\| !audioVisible\) return/);
  assert.match(source, /hpClearConfirm/); assert.match(source, /hpFreeze/); assert.match(source, /hpDrawMode/);
  assert.match(source, /ArrowRight.*ArrowDown/); assert.match(source, /b\.tabIndex = selected \? 0 : -1/);
  assert.match(source, /selectColor\(next\); colorBox\.children\[next\]\.focus\(\)/);
  assert.doesNotMatch(source.match(/colorBox\.addEventListener\('keydown'[\s\S]*?\n  \}\);/)[0], /\.click\(\)/);
  assert.match(source, /settleHomePlayPieces\(sand, pieces, W, H, F\)/);
  assert.match(source, /if \(frozen \|\| reduced\) finishIntroDots\(\)/);
  assert.match(source, /motionPreference\.addEventListener\('change', settleReducedIntro\)/);
  assert.match(source, /HOME_PLAY_STORAGE_KEY/); assert.match(source, /pointercancel/);
});

test('home state: restoring an identical grid preserves every floor-adjacent cell exactly', () => {
  const width = 37; const height = 41; const floor = 36; const sand = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) sand[(floor - 1) * width + x] = (x % 7) + 1;
  sand[3 * width + 11] = 2;
  const pieces = [{ cells: [{ x: 36, y: 35, v: 5 }, { x: 0, y: 0, v: 3 }] }];
  const saved = captureHomePlayState({ width, height, floor, sand, pieces });
  const restored = restoreHomePlayState(saved, width, height, floor);
  assert.deepEqual(restored.sand, sand);
  assert.deepEqual(restored.pieces[0].cells, pieces[0].cells);
});

test('home state: freezing settles moving pieces into the pile and paused intro letters become visible', () => {
  const sand = new Uint8Array(12 * 10); sand[7 * 12 + 2] = 1;
  const result = settleHomePlayPieces(sand, [{ cells: [{ x: 4, y: 6, v: 5 }, { x: 5, y: 6, v: 3 }] }], 12, 10, 9);
  assert.equal(result.sand[6 * 12 + 4], 5); assert.equal(result.sand[6 * 12 + 5], 3);
  assert.deepEqual(result.pieces, []); assert.equal(result.grains, 3);
  const dots = [{ state: 'intro', x: 0, y: -8, hx: 7, hy: 4, vx: 8, vy: 9 }, { state: 'free', x: 3, y: 2 }];
  assert.equal(finishHomePlayIntro(dots), dots);
  assert.deepEqual(dots[0], { state: 'home', x: 7, y: 4, hx: 7, hy: 4, vx: 0, vy: 0 });
  assert.deepEqual(dots[1], { state: 'free', x: 3, y: 2 });
});


test('offscreen falling dots cannot invalidate a saved picture or undo snapshot', () => {
  const saved = captureHomePlayState({ width: 4, height: 4, floor: 4, sand: new Uint8Array(16), pieces: [{ cells: [{ x: -1, y: 1, v: 1 }, { x: 2, y: 2, v: 3 }, { x: 4, y: 2, v: 2 }, { x: 1, y: 4, v: 2 }] }], ink: new Map([['bad', { x: 2, y: -1, color: 0 }]]) });
  const restored = restoreHomePlayState(saved, 4, 4, 4);
  assert.deepEqual(restored.pieces[0].cells, [{ x: 2, y: 2, v: 3 }]);
  assert.equal(restored.ink.size, 0);
});
