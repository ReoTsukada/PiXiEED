#!/usr/bin/env node
// Original, code-drawn category illustrations. No product photos, covers, logos,
// seller assets, fonts, or network requests are used. Geometry is intentionally
// generic: these pictures describe a type of item, not its actual appearance.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ink = '#334b50', paper = '#fffdf3', teal = '#579b8d', coral = '#dc876d', gold = '#e4b96e', blue = '#779dcc', purple = '#a08cba';
export const illustrationKinds = Object.freeze({
  'ebook-guide': '電子書籍とドット絵の描画',
  'paper-guide': '本とドット絵の描画',
  'paper-landscape': '背景の描き方を学ぶ本',
  'ebook-landscape': '背景の描き方を学ぶ電子書籍',
  'paper-gallery': 'ドット絵の作品集',
  'ebook-gallery': 'ドット絵の電子作品集',
  'ebook-games': 'ゲームのドット絵を紹介する電子書籍',
  'ebook-generic': '電子書籍',
  'ebook-textile': '糸を結ぶ手芸の電子書籍',
  'paper-stickers': 'シールを並べるパズルブック',
  'peg-toy': 'スティックを挿してつくるおもちゃ',
  'grid-notebook': 'マスを塗る方眼ノート',
  'wood-puzzle': '形を組み合わせる木製パズル',
  'pixel-display': 'ドット絵を表示するフレーム',
  'pixel-speaker': 'ドット絵表示と音を楽しむ機器',
  'white-baseplate': '白いブロック用の基礎板',
  'building-blocks': '組み立て用ブロック',
  'baseplate-set': '複数のブロック用基礎板',
  'cat-blocks': '猫を題材にしたブロック',
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
export function renderShopIllustration(kind) {
  if (!Object.hasOwn(illustrationKinds, kind)) throw new Error(`Unknown illustration: ${kind}`);
  const pixels = Buffer.alloc(96 * 96 * 4);
  function rect(x, y, w, h, color) {
    const rgb = color.match(/\w\w/g).map(value => parseInt(value, 16));
    for (let py = y * 2; py < (y + h) * 2; py++) for (let px = x * 2; px < (x + w) * 2; px++) {
      if (px < 0 || py < 0 || px >= 96 || py >= 96) throw new Error('Drawing outside canvas');
      pixels.set([...rgb, 255], (py * 96 + px) * 4);
    }
  }
  const tile = (x, y, color) => { rect(x, y, 4, 4, color); rect(x, y, 4, 1, '#ffffff'); };
  function star(x, y, color) { rect(x + 2, y, 2, 6, color); rect(x, y + 2, 6, 2, color); }
  function landscape(x, y, w = 20, h = 20) {
    rect(x, y, w, h, '#c1dedb'); rect(x + w - 6, y + 3, 3, 3, gold);
    for (let i = 0; i < w; i += 2) { const high = 3 + Math.max(0, 5 - Math.abs(i - 6)); rect(x + i, y + h - high, 2, high, teal); }
    rect(x, y + h - 3, w, 3, '#416f63');
  }
  function grid(x, y, cols, rows, color = '#d9ddd1') {
    for (let i = 0; i <= cols; i++) rect(x + i * 4, y, 1, rows * 4 + 1, color);
    for (let i = 0; i <= rows; i++) rect(x, y + i * 4, cols * 4 + 1, 1, color);
  }
  function book(ebook, motif) {
    rect(11, 41, 28, 2, '#dce5de');
    if (ebook) {
      rect(11, 5, 28, 35, ink); rect(13, 7, 24, 29, paper); rect(23, 37, 4, 1, '#a9bfb5');
    } else {
      rect(9, 6, 29, 34, ink); rect(12, 8, 24, 29, paper); rect(10, 8, 2, 29, teal);
      rect(12, 38, 25, 1, '#c4c8b5'); rect(13, 35, 23, 1, '#d7dbc9');
    }
    const x = 16, y = 12;
    if (motif === 'landscape') landscape(15, 11, 20, 20);
    else if (motif === 'gallery') {
      rect(16, 12, 17, 18, '#eadff1'); star(21, 17, purple); rect(17, 26, 5, 3, coral); rect(28, 13, 4, 4, gold);
    } else if (motif === 'games') {
      rect(x, y + 6, 18, 10, blue); rect(x + 2, y + 8, 5, 2, paper); rect(x + 3, y + 7, 2, 5, paper);
      rect(x + 13, y + 8, 2, 2, paper); rect(x + 10, y + 11, 2, 2, paper);
    } else if (motif === 'textile') {
      rect(16, 12, 17, 2, '#9b7960');
      for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) rect(17 + col * 4 + row % 2, 15 + row * 3, 2, 2, row % 2 ? coral : gold);
      for (let col = 0; col < 4; col++) rect(18 + col * 4, 29, 1, 4, '#b99579');
    } else if (motif === 'stickers') {
      grid(16, 12, 4, 4); tile(17, 13, teal); tile(21, 17, gold); tile(25, 21, coral);
      rect(31, 25, 8, 8, ink); rect(32, 26, 6, 6, paper); tile(33, 27, blue);
    } else if (motif === 'guide') {
      grid(16, 12, 4, 4); rect(21, 17, 3, 3, teal); rect(25, 17, 3, 3, gold); rect(21, 21, 3, 3, coral);
      for (let i = 0; i < 8; i++) rect(29 - i, 25 + i, 3, 3, i < 6 ? gold : ink);
    } else { rect(17, 14, 15, 2, teal); rect(17, 20, 15, 1, '#bccabf'); rect(17, 24, 11, 1, '#bccabf'); rect(17, 28, 13, 1, '#bccabf'); }
  }
  function baseplate(x, y, w, h, color) {
    rect(x + 1, y + h, w, 2, '#b8c9bf'); rect(x, y, w, h, color);
    for (let yy = y + 2; yy < y + h - 1; yy += 5) for (let xx = x + 2; xx < x + w - 1; xx += 5) {
      rect(xx, yy, 2, 2, '#ffffff'); rect(xx, yy + 2, 2, 1, '#c2cbbb');
    }
  }
  function block(x, y, w, h, color) {
    rect(x, y, w, h, ink); rect(x + 1, y + 1, w - 2, h - 3, color); rect(x + 1, y + h - 2, w - 2, 1, '#9bac9e');
    for (let i = 2; i < w - 2; i += 5) { rect(x + i, y - 2, 3, 2, color); rect(x + i, y - 2, 3, 1, paper); }
  }
  // A restrained square halo gives the icon space while keeping the PNG compact.
  rect(5, 6, 38, 37, '#edf3ee'); rect(2, 15, 3, 17, '#edf3ee'); rect(43, 15, 3, 17, '#edf3ee');
  if (/^(?:paper|ebook)-/.test(kind)) book(kind.startsWith('ebook'), kind.split('-')[1]);
  else if (kind === 'grid-notebook') {
    rect(9, 7, 28, 34, ink); rect(11, 9, 24, 30, paper); grid(13, 12, 5, 6);
    for (let y = 11; y <= 35; y += 6) { rect(8, y, 5, 2, '#77958d'); }
    [[18,17,teal],[22,17,teal],[18,21,teal],[22,21,gold],[26,25,coral]].forEach(a => rect(a[0], a[1], 3, 3, a[2]));
    for (let i = 0; i < 12; i++) rect(39 - Math.floor(i / 2), 18 + i, 3, 3, i < 10 ? gold : ink);
  } else if (kind === 'peg-toy') {
    baseplate(7, 30, 34, 9, '#cad8cf');
    [[12,22,coral],[19,15,gold],[26,10,teal],[33,20,blue]].forEach(([x,y,c]) => { rect(x,y,5,34-y,ink); rect(x+1,y+2,3,31-y,c); rect(x,y,5,3,c); rect(x+1,y,3,1,paper); });
  } else if (kind === 'wood-puzzle') {
    rect(7, 8, 34, 32, '#987756'); rect(9, 10, 30, 28, '#ead3aa');
    [[11,12,6,18,teal],[17,12,12,6,teal],[19,20,10,6,coral],[19,26,6,10,coral],[27,28,10,8,gold],[31,12,6,14,blue],[11,32,6,4,purple]].forEach(a=>rect(...a));
  } else if (kind === 'pixel-display' || kind === 'pixel-speaker') {
    rect(8, 9, 32, 29, ink); rect(11, 12, 26, 23, '#182f36');
    const colors = [teal,blue,gold,coral];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) rect(13+x*4,14+y*4,3,3,colors[(x+y)%4]);
    rect(12, 38, 24, 2, '#b8c9bf');
    if (kind === 'pixel-speaker') { rect(5, 18, 1, 10, teal); rect(2, 21, 1, 4, teal); rect(42, 18, 1, 10, teal); rect(45,21,1,4,teal); }
  } else if (kind === 'white-baseplate') baseplate(8, 10, 32, 28, '#e5e9df');
  else if (kind === 'baseplate-set') { baseplate(15, 8, 25, 24, '#c5d9d3'); baseplate(10, 15, 25, 23, '#d9d0e3'); baseplate(5, 22, 25, 19, '#dce6d0'); }
  else if (kind === 'building-blocks') { block(6,27,20,12,teal); block(23,21,18,12,coral); block(13,12,17,11,gold); }
  else if (kind === 'cat-blocks') {
    // A generic block-built cat silhouette, not a breed or a kit assembly guide.
    rect(13,10,6,7,ink); rect(29,10,6,7,ink); rect(13,17,22,14,ink); rect(15,18,18,11,gold);
    rect(15,12,3,6,gold); rect(30,12,3,6,gold); rect(18,21,2,2,ink); rect(28,21,2,2,ink); rect(23,25,2,2,coral);
    block(16,31,16,10,gold); rect(33,31,5,7,gold); rect(36,26,3,7,gold); rect(15,40,8,2,ink); rect(26,40,8,2,ink);
  }
  const scanlines = Buffer.alloc((96 * 4 + 1) * 96);
  for (let y = 0; y < 96; y++) pixels.copy(scanlines, y * 385 + 1, y * 384, (y + 1) * 384);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(96, 0); ihdr.writeUInt32BE(96, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
async function main() {
  const check = process.argv.includes('--check');
  const dir = path.join(root, 'assets/books/illustrations');
  if (!check) await mkdir(dir, { recursive: true });
  let bytes = 0;
  for (const kind of Object.keys(illustrationKinds)) {
    const png = renderShopIllustration(kind), target = path.join(dir, `${kind}.png`); bytes += png.length;
    if (check) {
      if (!(await readFile(target)).equals(png)) throw new Error(`Stale shop illustration: ${kind}`);
    } else await writeFile(target, png);
  }
  console.log(`${check ? 'Verified' : 'Generated'} ${Object.keys(illustrationKinds).length} original 96x96 illustrations (${bytes} bytes total)`);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
