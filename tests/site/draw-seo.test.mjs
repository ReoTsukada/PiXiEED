import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const page = read('draw/index.html');
const head = page.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const main = page.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
const shellScript = read('js/tool-shell.mjs');

function metaValue(attribute, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...head.matchAll(new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escaped}["'])[^>]*\\bcontent=["']([^"']*)["'][^>]*>`, 'gi'))]
    .map((match) => match[1]);
}

test('draw page metadata describes its pixel art and GIF features and keeps the public canonical', () => {
  const title = head.match(/<title>([^<]+)<\/title>/i)?.[1];
  const description = metaValue('name', 'description');
  assert.match(title ?? '', /ドット絵.*ピクセルアート.*GIF/);
  assert.equal(description.length, 1);
  assert.match(description[0], /Pixel Art/);
  assert.match(description[0], /アニメーション/);
  assert.match(description[0], /PNG画像・GIFアニメーション/);
  assert.equal(metaValue('property', 'og:title')[0], title);
  assert.equal(metaValue('property', 'og:description')[0], description[0]);
  assert.equal(metaValue('name', 'twitter:title')[0], title);
  assert.equal(metaValue('name', 'twitter:description')[0], description[0]);
  assert.equal((head.match(/rel=["']canonical["']/gi) ?? []).length, 1);
  assert.match(head, /rel="canonical" href="https:\/\/pixieed\.jp\/draw\/"/);
  assert.equal((read('sitemap.xml').match(/<loc>https:\/\/pixieed\.jp\/draw\/<\/loc>/g) ?? []).length, 1);
  assert.doesNotMatch(read('robots.txt'), /Disallow:\s*\/draw(?:\/|\s|$)/i);
});

test('visible draw guidance explains frame duplication, onion skin, playback, and the implemented exports', () => {
  const title = head.match(/<title>([^<]+)<\/title>/i)?.[1];
  const h1 = main.match(/<h1[^>]*data-shell-title[^>]*>([^<]+)<\/h1>/i)?.[1];
  const lead = main.match(/<p[^>]*data-shell-lead[^>]*>([^<]+)<\/p>/i)?.[1];
  assert.equal(h1, 'ドット絵・ピクセルアートを描く');
  assert.equal(lead, 'ピクセルアート（Pixel Art）でゲーム素材などの小さな絵を描き、コマをつないでGIFも作れます。');
  const drawCopy = shellScript.match(/draw:\s*\{([\s\S]*?)\n\s*\},\n\s*camera:/i)?.[1] ?? '';
  assert.match(drawCopy, new RegExp(`title:\\s*'${h1}'`));
  assert.match(drawCopy, new RegExp(`documentTitle:\\s*'${title}'`));
  assert.match(drawCopy, new RegExp(`lead:\\s*'${lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.match(shellScript, /document\.title = copy\.documentTitle/);
  assert.match(main, /フレーム一覧でコマを複製/);
  assert.match(main, /オニオンスキン/);
  assert.match(main, /再生ボタン/);
  assert.match(main, /［セル表］やフレーム操作の［GIFを書き出す］/);
  assert.match(main, /画面下部の［出力］からPNG/);
  assert.match(main, /共有シートに渡して保存/);
  assert.match(main, /20ms以上/);
  assert.match(main, /GIFは半透明を保存できません/);
  assert.match(main, /href="\/camera\/"/);
  assert.match(main, /href="\/audio\/"/);
  assert.match(main, /href="\/output\/"/);
  assert.match(main, /アニメーションGIFはどこから保存できますか/);

  const animationControls = read('js/creation/animation-controls.mjs');
  const drawPage = read('js/creation/draw-page.mjs');
  const gifEncoder = read('js/pixel-lens/gif.mjs');
  assert.match(animationControls, /button\('GIFを書き出す'/);
  assert.match(drawPage, /if \(action\.type === 'export-gif'\) return exportAnimation\(\)/);
  assert.match(drawPage, /delayMs: Math\.max\(20, frame\.durationMs\)/);
  assert.match(drawPage, /encodeAnimatedGif\(frames/);
  assert.match(gifEncoder, /GIFは半透明を保存できません/);
  assert.match(gifEncoder, /gif-partial-alpha-unsupported/);
});
