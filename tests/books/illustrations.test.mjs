import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { illustrationKinds, renderShopIllustration } from '../../scripts/generate-shop-illustrations.mjs';

const root = new URL('../../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('all 25 products use original, documented illustrations without claiming product photos', async () => {
  const products = JSON.parse(await read('assets/books/room-products.json')).filter(p => !p.sample && p.enabled !== false && p.visible !== false);
  assert.equal(products.length, 25);
  const counts = {};
  for (const product of products) {
    counts[product.category] = (counts[product.category] || 0) + 1;
    const image = product.shopThumbnail;
    assert.equal(product.image, null);
    assert.equal(image.kind, 'illustration');
    assert.equal(image.width, 96); assert.equal(image.height, 96);
    assert.match(image.src, /^\/assets\/books\/illustrations\/[a-z-]+\.png$/);
    assert.match(image.alt, /イメージイラスト（実物の外観ではありません）/);
    assert.equal(image.source, 'scripts/generate-shop-illustrations.mjs');
    assert.ok(image.creator); assert.match(image.rights, /不使用/);
    if (product.category === 'books') {
      assert.match(image.src, product.format === 'Kindle版' ? /\/ebook-/ : /\/paper-/);
    }
    const bytes = await readFile(new URL(image.src.slice(1), root));
    assert.equal(bytes.readUInt32BE(16), image.width); assert.equal(bytes.readUInt32BE(20), image.height);
  }
  assert.deepEqual(counts, { books: 14, toys: 6, tools: 1, gadgets: 4 });
});

test('the small PNG set is reproducible and contains only the declared original motifs', async () => {
  const names = Object.keys(illustrationKinds);
  const files = await readdir(new URL('assets/books/illustrations/', root));
  assert.deepEqual(files.sort(), names.map(name => `${name}.png`).sort());
  let size = 0;
  for (const kind of names) {
    const actual = await readFile(new URL(`assets/books/illustrations/${kind}.png`, root));
    assert.deepEqual(actual, renderShopIllustration(kind)); size += actual.length;
  }
  assert.ok(size < 20000, `total illustration payload: ${size}`);
  execFileSync(process.execPath, ['scripts/generate-shop-illustrations.mjs', '--check'], { cwd: fileURLToPath(root) });
});

test('both generated routes expose illustration captions, alternatives and accurate image disclosure', async () => {
  for (const route of ['books/index.html', 'books/room-preview.html']) {
    const html = await read(route);
    assert.equal((html.match(/class="product-card__illustration-label"/g) || []).length, 25);
    assert.equal((html.match(/実物の外観ではありません）" width="96" height="96" loading="lazy" decoding="async"/g) || []).length, 25);
    assert.match(html, /実物の表紙・色・形状・付属品を再現したものではありません/);
    assert.doesNotMatch(html, /商品画像は未掲載|商品画像は使用許諾未確認/);
    assert.match(html, /assets\/brand\/pixieed-logo-48\.png/);
    assert.doesNotMatch(html, /<img[^>]+src="https?:\/\//);
  }
  const css = await read('css/books.css');
  assert.match(css, /\.product-detail__content \.product-card__illustration\[data-size\] img \{ flex: none; width: 144px; height: 144px/);
  assert.match(css, /@media \(max-width: 599px\) \{\s*\.books-page \.product-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
