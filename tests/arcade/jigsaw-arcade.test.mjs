import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('jigsaw: the arcade layer is loaded after the page and keeps every page control in place', () => {
  const html = read('jigsaw/index.html');
  assert.match(html, /css\/arcade\.css/); assert.match(html, /css\/jigsaw-arcade\.css/);
  assert.ok(html.indexOf('jigsaw-page.mjs') < html.indexOf('jigsaw-arcade.mjs'), 'the page owns the controls; the arcade layer only dresses them');
  for (const id of ['jigsaw-source-kind', 'jigsaw-source-version', 'jigsaw-public-version', 'jigsaw-file', 'jigsaw-grid-size', 'jigsaw-start', 'jigsaw-resume', 'jigsaw-play', 'jigsaw-new']) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('jigsaw: difficulty is shown as levels, each cutting the picture to about its piece count', () => {
  const source = read('js/creation/jigsaw-arcade.mjs');
  const names = [...source.matchAll(/\{ name: '([^']+)', stars: (\d), target: (\d+) \}/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
  assert.deepEqual(names, [['かんたん', 1, 12], ['ふつう', 2, 36], ['むずかしい', 3, 100], ['げきむず', 4, 300]]);
  // the same count the engine uses: whole pieces across times whole pieces down
  assert.match(source, /Math\.max\(1, Math\.floor\(w \/ px\)\) \* Math\.max\(1, Math\.floor\(h \/ px\)\)/);
  assert.match(source, /grid\.dispatchEvent\(new Event\('change'/, 'a level sets the page\'s own piece-size control');
});

test('jigsaw: playing has a HUD, a click for every join and a celebration with best time', () => {
  const page = read('js/creation/jigsaw-page.mjs'); const source = read('js/creation/jigsaw-arcade.mjs'); const arcade = read('js/arcade.mjs');
  assert.match(page, /new CustomEvent\('jigsaw:state'/);
  assert.match(source, /addEventListener\('jigsaw:state'/);
  assert.match(source, /sfx\.snap\(combo\)/); assert.match(source, /winOverlay\(play,/); assert.match(source, /pixieed:jigsaw:best:/);
  for (const fn of ['pixelIcon', 'createTimer', 'confetti', 'assembleTitle', 'winOverlay', 'floatText']) assert.match(arcade, new RegExp(`export function ${fn}\\(`), fn);
  assert.match(arcade, /prefers-reduced-motion/);
});

test('jigsaw: the shared bottom bar and the logo home', () => {
  const html = read('jigsaw/index.html');
  const nav = html.match(/<nav class="app-tabs"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]), ['地球儀', '撮影', '途中の配置を端末に保存', 'ツール', 'マイページ']);
  assert.match(html, /<a class="brand" href="\/"/);
});
