import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('home: every tool card has a working toy and a plain name', () => {
  const html = read('home/index.html'); const source = read('js/home-play.mjs');
  const toys = [...html.matchAll(/data-toy="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(toys.length >= 9);
  for (const toy of toys) assert.match(source, new RegExp(`\\n  ${toy}\\(el\\) \\{`), toy);
  assert.doesNotMatch(html, /PiXiEEDraw|PiXiEELENS|PXDraw/);
  assert.match(source, /prefers-reduced-motion/);
});

test('home hero: three simple plays on one canvas — draw into sand, knock letters, catch stars', () => {
  const html = read('home/index.html'); const source = read('js/home-play.mjs');
  assert.match(html + source, /hpScore/);
  assert.match(source, /なぞる・文字をたたく・星をつかまえる/);
  for (const fn of ['burstLetter', 'catchStar', 'inkAt']) assert.match(source, new RegExp(`function ${fn}\\(`), fn);
  assert.match(source, /isSolid = \(x, y\) => y >= F/, 'sand and letters land above the colour bar');
});
