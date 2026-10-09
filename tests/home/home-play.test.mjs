import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.match(source, /描いて、はなして、そろえて消す/);
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
  assert.match(source, /function tap\(x, y, quick\)/);
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
  assert.match(html, /class="hp-go container"[\s\S]*?href="#hpToysTitle"[\s\S]*?次のあそびを見つける/);
  for (const path of ['/pixel-camera.html', '/globe/', '/jigsaw/', '/play/spot-difference/', '/play/hidden-object/', '/output/']) assert.ok(html.includes(`href="${path}"`), path);
  assert.match(html, /hp-feature-card--camera/); assert.match(html, /hp-feature-card--map/); assert.match(html, /hp-compact-grid/); assert.match(html, /hp-output-card/);
  assert.match(html, /保存や編集は各制作ツールでどうぞ/);
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
  assert.match(source, /createHomeMotion\(\{ status: gyroStatus, alwaysOn: true, activationTarget: stage,/);
  assert.doesNotMatch(source, /gyroButton/);
  const homeCss = read('css/home.css');
  assert.match(homeCss, /\.hp-invite \{ position: absolute; top: 3\.25rem; left: 1rem;/);
  assert.match(homeCss, /\.hp-invite \{[^}]*max-width: calc\(100% - 7rem\); min-height: 44px;/);
  assert.doesNotMatch(html, /猫|ネコ|ねこ/);
});
