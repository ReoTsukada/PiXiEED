import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('home: every tool card has a working toy and a plain name', () => {
  const html = read('index.html'); const source = read('js/home-play.mjs');
  const toys = [...html.matchAll(/data-toy="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(toys.length >= 9);
  for (const toy of toys) assert.match(source, new RegExp(`\\n  ${toy}\\(el\\) \\{`), toy);
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
  assert.match(source, /invite\('game'\)/); assert.match(source, /invite\('sound'\)/); assert.match(source, /invite\('find'\)/);
  for (const kind of ['editor', 'game', 'find', 'sound']) assert.match(source, new RegExp(`\\n  ${kind}: \\[`), `icon ${kind}`);
  // keyboard play
  assert.match(source, /canvas\.tabIndex = 0/); assert.match(source, /ArrowLeft/);
});

test('home: two doors under the playground, soon-cards grouped, real posts drifting by', () => {
  const html = read('index.html'); const source = read('js/home-play.mjs');
  assert.match(html, /class="hp-go"[\s\S]*?href="\/globe\/"[^>]*>地図で絵をさがす[\s\S]*?href="\/pixel-camera\.html"[^>]*>カメラで撮る/);
  assert.match(source, /function groupToys\(/); assert.match(source, /もうすぐ/);
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

test('home hero: a finer grid (letters about 4 dots thick) and more to find — shooting star, cat, the pile as a score, tilt and shake', () => {
  const source = read('js/home-play.mjs');
  assert.match(source, /const scale = Math\.max\(2, Math\.min\(4,/);
  assert.match(source, /const BR = 2;/);
  for (const fn of ['catchShooter', 'catchCat', 'playPile', 'shake', 'askMotion', 'takeStar']) assert.match(source, new RegExp(`function ${fn}\\(`), fn);
  assert.match(source, /one burst catches at most three stars/);
  assert.match(source, /DeviceOrientationEvent\?\.requestPermission/);
  assert.match(source, /ctx\.putImageData\(img, 0, 0\)/, 'drawn through one ImageData');
});
