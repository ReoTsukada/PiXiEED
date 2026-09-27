import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('home: plain tool names; only finished tools are links, upcoming ones are toys without a way in', () => {
  const html = read('home/index.html');
  const names = [...html.matchAll(/class="hp-toy-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(names, ['ドット絵カメラ', 'ドット絵マップ', '望遠鏡', 'ドット絵エディター', 'ドット絵サウンド', 'ドット絵ゲームメーカー', 'ドット絵ジグソーパズル', 'ドット絵間違い探し', 'ドット絵もの探し']);
  assert.doesNotMatch(html, /PiXiEEDraw|PiXiEELENS|PXDraw/);
  const links = [...html.matchAll(/<a class="hp-toy" href="([^"]+)" data-toy="([a-z]+)"/g)].map((m) => m[2]);
  assert.deepEqual(links, ['camera', 'map', 'telescope']);
  for (const toy of ['editor', 'sound', 'game', 'jigsaw', 'diff', 'find']) assert.match(html, new RegExp(`<div class="hp-toy" data-toy="${toy}"[^>]*>[\\s\\S]*?もうすぐ`));
  assert.match(html, /data-home-works/); assert.match(html, /data-home-stores/);
});

test('home toys: every card has a working toy', () => {
  const source = read('js/home-play.mjs');
  for (const toy of ['camera', 'map', 'telescope', 'editor', 'sound', 'game', 'jigsaw', 'diff', 'find']) assert.match(source, new RegExp(`\\n  ${toy}\\(el\\) \\{`));
  assert.match(source, /prefers-reduced-motion/);
});
