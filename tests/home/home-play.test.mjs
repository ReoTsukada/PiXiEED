import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureHomePlayState, restoreHomePlayState, pushHomePlayHistory, finishHomePlayIntro, HOME_PLAY_MAX_CELLS, HOME_PLAY_MAX_HISTORY } from '../../js/home-play-state.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('home: tool cards have working toys and creation links lead the page', () => {
  const html = read('welcome/index.html'); const source = read('js/home-play.mjs'); const toysSource = read('js/tool-toys.mjs');
  const toys = [...html.matchAll(/data-toy="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(toys.length >= 7);
  for (const toy of toys) assert.match(toysSource, new RegExp(`\\n  ${toy}\\(el\\) \\{`), toy);
  assert.match(source, /createToolToys\(\{ note, animate, interactive: false \}\)/, 'linked cards use non-interactive previews');
  assert.match(html, /class="hp-card-grid hp-create-grid"[\s\S]*?data-toy="editor" href="\/draw\/\?workspace=1"[\s\S]*?data-toy="sound" href="\/audio\/\?workspace=1"/);
  assert.doesNotMatch(html, /data-toy="game"/);
  assert.match(html, /data-toy="editor" href="\/draw\/\?workspace=1"[\s\S]*?PiXiEEDraw/);
  assert.doesNotMatch(html, /PXDraw/);
  assert.match(html, /<h3 class="hp-tool-title">写真をドット絵に<\/h3><span class="hp-toy-line">描かずに加工・PNG保存/);
  assert.match(html, /data-toy="sound" href="\/audio\/\?workspace=1"[\s\S]*?PiXiEEaudio/);
  assert.match(source, /prefers-reduced-motion/);
});

test('home hero: draw, let go and it drops; a full row clears; letters burst; stars can be caught', () => {
  const html = read('welcome/index.html'); const source = read('js/home-play.mjs');
  assert.match(html + source, /hpScore/);
  assert.match(source, /指で描けます。文字や星はタップ。/);
  for (const fn of ['burstLetter', 'catchStar', 'inkAt', 'release', 'invite']) assert.match(source, new RegExp(`function ${fn}\\(`), fn);
  assert.match(source, /isSolid = \(x, y\) => y >= F/, 'pieces and letters land above the colour bar');
  assert.match(source, /const stop = \(\) => \{ if \(drawing\) release\(\);/, 'the drawing drops only when the finger lifts');
  assert.doesNotMatch(source, /now - d\.born > 700/, 'ink no longer crumbles on a timer');
  assert.match(source, /a full row vanishes/);
});

test('home hero: pointer drawing is available immediately; a stroke draws and knocks letters loose, but never catches a star', () => {
  const source = read('js/home-play.mjs');
  assert.match(source, /const SLOP = \d+;/);
  assert.match(source, /Math\.hypot\(e\.clientX - press\.cx, e\.clientY - press\.cy\) < SLOP/);
  assert.match(source, /function tap\(x, y, quick, \{ drawBlank = true \} = \{\}\)/);
  const ink = source.match(/function inkAt\([\s\S]*?\n  \}/)[0];
  assert.match(ink, /burstLetter/, 'a stroke through the word still knocks letters loose');
  assert.doesNotMatch(ink, /catchStar|takeStar/, 'a stroke never catches a star');
  const down = source.match(/canvas\.addEventListener\('pointerdown'[\s\S]*?\n  \}\);/)[0];
  assert.match(down, /activateCanvasAudio/, 'a trusted canvas gesture activates sound');
  assert.match(down, /if \(e\.isTrusted\) activateCanvasAudio\(\)/, 'audio activation runs inside the user gesture');
  assert.doesNotMatch(source, /hpDrawMode|drawMode/, 'drawing has no mode toggle');
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

test('home: real creation tools lead the mini experience and gallery follows play', () => {
  const html = read('welcome/index.html'); const source = read('js/home-play.mjs');
  for (const path of ['/camera/?workspace=1', '/draw/#draw-how-to', '/globe/', '/jigsaw/', '/play/spot-difference/', '/play/hidden-object/', '/output/']) assert.ok(html.includes(`href="${path}"`), path);
  assert.match(html, /hp-link-card hp-visual-tool-card" data-toy="camera" href="\/camera\/\?workspace=1"/); assert.match(html, /hp-link-card" data-toy="map"/); assert.match(html, /hp-card-grid/); assert.match(html, /hp-output-card hp-visual-tool-card" href="\/output\/"/);
  assert.match(html, /id="homePrimaryToolsTitle">制作ツール/);
  assert.match(html, /data-toy="editor" href="\/draw\/\?workspace=1"[^>]*data-draw-cta data-draw-context="general"/);
  assert.match(html, /src="\/assets\/icons\/pixieed\/artwork\.svg"/);
  assert.match(html, /src="\/assets\/icons\/pixieed\/camera\.svg"/);
  assert.match(html, /src="\/assets\/icons\/pixieed\/music\.svg"/);
  const toolCards = html.slice(html.indexOf('<nav class="hp-card-grid hp-create-grid"'), html.indexOf('</nav>', html.indexOf('<nav class="hp-card-grid hp-create-grid"')));
  for (const tool of ['draw', 'camera', 'audio', 'output']) {
    if (tool === 'draw') {
      assert.match(toolCards, /src="\/assets\/screenshots\/draw-pc-maou\.png" width="2880" height="1920" alt="魔王様の作例を読み込んだPiXiEEDrawのPC画面"/);
      assert.match(toolCards, /\/assets\/screenshots\/previews\/draw-pc-maou-480\.webp 480w, \/assets\/screenshots\/previews\/draw-pc-maou-960\.webp 960w/);
      continue;
    }
    const revision = tool === 'camera' ? '\\?rev=20261019-photo16-preview-1' : '';
    assert.match(toolCards, new RegExp(`src="/assets/screenshots/home-${tool}-empty\\.png${revision}" width="960" height="540" alt="[^"]+"`), `${tool} has a 16:9 fallback and descriptive alt`);
    assert.match(toolCards, new RegExp(`/assets/screenshots/previews/home-${tool}-empty-480\\.webp${revision} 480w, /assets/screenshots/previews/home-${tool}-empty-960\\.webp${revision} 960w`), `${tool} has responsive full-PC previews`);
  }
  assert.match(toolCards, /src="\/assets\/screenshots\/home-camera-empty\.png\?rev=20261019-photo16-preview-1"[^>]*alt="写真調に生成した山と湖の風景をPiXiEELENSで写真から選ぶ16色・ディザなしで128×72へドット変換したPC横画面全体"/, 'camera preview describes the generated source-palette 16-color landscape without dithering and the full PC screen');
  const otherToolCards = toolCards.slice(toolCards.indexOf('hp-tool-screen--camera'));
  assert.doesNotMatch(otherToolCards, /maou/i, 'the approved Draw example is not reused for other tools');
  assert.match(toolCards, /fetchpriority="high"/, 'Draw keeps its high-priority image hint');
  assert.equal((toolCards.match(/loading="eager"/g) || []).length, 3, 'Camera, audio and output keep eager loading');
  assert.equal((toolCards.match(/sizes="\(min-width: 900px\) 360px, 240px"/g) || []).length, 4, 'all four cards retain their responsive image sizes');
  for (const href of ['/draw/?workspace=1', '/camera/?workspace=1', '/audio/?workspace=1', '/output/']) assert.ok(toolCards.includes(`href="${href}"`), href);
  assert.match(html, /hp-tools-about" href="\/draw\/#draw-how-to"/);
  assert.doesNotMatch(html, /class="container real-tool-screens"/);
  assert.match(toolCards, /class="hp-toy hp-link-card hp-visual-tool-card"[^>]*>[\s\S]*?hp-tool-screen[\s\S]*?<h3 class="hp-tool-title">[\s\S]*?hp-toy-line[\s\S]*?hp-tool-brandline[\s\S]*?hp-card-link/);
  assert.match(toolCards, /href="\/output\/"[\s\S]*?変換・合成ツールへ/);
  assert.doesNotMatch(html, /目的からはじめる/);
  const toolsIndex = html.indexOf('home-primary-tools');
  const playIndex = html.indexOf('class="hp-home-play"');
  const discoveryIndex = html.indexOf('class="home-discovery container"');
  assert.ok(toolsIndex >= 0 && playIndex > toolsIndex && discoveryIndex > playIndex, 'real tools lead, then the mini experience, then public works');
  assert.match(html, /data-home-gallery/);
  assert.match(source, /function groupToys\(/);
  assert.match(html, /class="hp-card-grid hp-discover-grid"/);
  const homeCss = read('css/home.css');
  assert.match(homeCss, /home-primary-tools \.hp-card-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(homeCss, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 8\.5rem\), 1fr\)\)/);
  assert.match(homeCss, /home-primary-tools \.hp-tool-screen img \{[^}]*object-fit: contain/);
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
  const html = read('welcome/index.html');
  assert.match(html, /id="hpPlayback"[^>]*>一時停止<\/button>/, 'hero motion has a visible play/pause control');
  assert.match(html, /id="hpPlaybackStatus" aria-live="polite"/);
  assert.match(source, /let playbackPaused = false;/, 'the hero starts automatically even when reduced motion is enabled');
  assert.match(source, /const heroMotionEnabled = \(\) => !playbackPaused;/, 'only the explicit control pauses hero playback');
  assert.match(source, /createHomeAudio\(\{ resumeOnVisible: true, onChange:/, 'audio resumes after visibility changes once activated by the visitor');
  assert.doesNotMatch(source, /onHeroPreferenceChange|playbackOverride/, 'global motion preference changes do not pause or override the hero');
  assert.match(html, /class="hp-gyro-status" id="hpGyroStatus" aria-live="polite"/, 'sensor status is visible below the controls');
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
  const saved = captureHomePlayState({ width: 8, height: 12, floor: 11, sand, pieces: [{ cells: [{ x: 1, y: 4, v: 7 }] }], ink, color: 3 });
  const restored = restoreHomePlayState(saved, 12, 8, 7);
  assert.ok(restored); assert.equal(restored.sand[1 * 12 + 5], 4);
  assert.deepEqual(restored.pieces[0].cells[0], { x: 2, y: 3, v: 7 });
  assert.deepEqual([...restored.ink.values()][0], { x: 6, y: 2, color: 2, born: 0 });
  assert.equal(restored.color, 3); assert.equal('frozen' in restored, false);
  assert.equal('frozen' in saved, false, 'new snapshots no longer persist the old stop flag');
  assert.equal('frozen' in restoreHomePlayState({ ...saved, frozen: true }, 12, 8, 7), false, 'legacy stopped sessions reopen with motion enabled');
  assert.equal(restoreHomePlayState({ ...saved, settled: [[NaN, 0, 2]] }, 12, 8, 7), null);
  assert.equal(restoreHomePlayState({ ...saved, pieces: Array(HOME_PLAY_MAX_CELLS + 1).fill([0, 0, 1]) }, 12, 8, 7), null);
  const dense = new Uint8Array((HOME_PLAY_MAX_CELLS + 1) * 2); dense.fill(1);
  assert.equal(captureHomePlayState({ width: HOME_PLAY_MAX_CELLS + 1, height: 2, floor: 2, sand: dense }).settled.length, HOME_PLAY_MAX_CELLS);
});

test('home hero state: undo snapshots stay one operation and bounded', () => {
  const history = Array.from({ length: HOME_PLAY_MAX_HISTORY }, (_, n) => n);
  assert.deepEqual(pushHomePlayHistory(history, 99), [...history.slice(1), 99]);
});

test('home hero controls keep gesture-gated sound, guarded clear and undo with scoped playback', () => {
  const html = read('welcome/index.html'); const source = read('js/home-play.mjs');
  assert.match(html, /id="hpPaletteToggle"[^>]*aria-expanded="false" aria-controls="hpPalette"/);
  assert.match(html, /id="hpPalette" hidden/); assert.match(html, /id="hpUndo"[^>]*disabled/);
  assert.match(html, /id="hpClearDialog"/); assert.match(html, /id="hpStatus"[^>]*aria-live="polite"/);
  assert.match(source, /createHomeAudio/);
  assert.match(source, /homeAudio\.canPlay\(\)/);
  assert.match(source, /hpClearConfirm/); assert.doesNotMatch(source, /hpFreeze|hpSound|HOME_SOUND_STOPPED_KEY|home-sound-stopped/); assert.doesNotMatch(source, /hpDrawMode/);
  assert.match(source, /ArrowRight.*ArrowDown/); assert.match(source, /b\.tabIndex = selected \? 0 : -1/);
  assert.match(source, /selectColor\(next\); colorBox\.children\[next\]\.focus\(\)/);
  assert.doesNotMatch(source.match(/colorBox\.addEventListener\('keydown'[\s\S]*?\n  \}\);/)[0], /\.click\(\)/);
  assert.match(html, /id="hpAudioState"/);
  assert.doesNotMatch(html, /id="hpFreeze"|id="hpSound"/);
  assert.match(source, /if \(heroReducedMotion\(\)\) finishIntroDots\(\)/);
  assert.match(source, /motionPreference\.addEventListener\('change', settleReducedIntro\)/);
  assert.match(source, /window\.addEventListener\('pagehide', \(\) => \{ persist\(\); homeAudio\.setVisible\(false\); \}\)/);
  assert.match(source, /window\.addEventListener\('pageshow', \(\) => \{ lastT = performance\.now\(\); sandTick = 0; sandBudget = 0; homeAudio\.setVisible\(/);
  assert.match(source, /document\.addEventListener\('visibilitychange', \(\) => \{ homeAudio\.setVisible\(/);
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

test('home state: reduced motion settles the intro to its static positions', () => {
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
