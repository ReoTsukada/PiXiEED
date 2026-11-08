import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { jpegDimensions, validateIllustrations } from '../../scripts/generate-shop-illustrations.mjs';

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
    assert.equal(image.width, 640); assert.equal(image.height, 640);
    assert.match(image.src, /^\/assets\/books\/illustrations\/[a-z-]+\.jpg$/);
    assert.match(image.alt, /イメージイラスト（実物の外観ではありません）/);
    assert.equal(image.source, 'assets/books/illustrations-manifest.json');
    assert.match(image.creator, /AI生成/); assert.match(image.rights, /不使用/);
    if (product.category === 'books') {
      assert.match(image.src, product.format === 'Kindle版' ? /\/ebook-/ : /\/paper-/);
    }
    const bytes = await readFile(new URL(image.src.slice(1), root));
    assert.deepEqual(jpegDimensions(bytes), { width: image.width, height: image.height });
  }
  assert.deepEqual(counts, { books: 14, toys: 6, tools: 1, gadgets: 4 });
});

test('the JPEG set is documented, hash-verified and contains only used artwork', async () => {
  const result = await validateIllustrations();
  assert.equal(result.count, 21);
  assert.ok(result.bytes < 3_000_000, `total illustration payload: ${result.bytes}`);
  execFileSync(process.execPath, ['scripts/generate-shop-illustrations.mjs', '--check'], { cwd: fileURLToPath(root) });
});

test('JPEG dimensions reject wrong signatures, invalid lengths and missing frames', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from([137, 80, 78, 71]), Buffer.from([255, 216, 255, 224, 0, 1]), Buffer.from([255, 216, 255, 224, 0, 99]), Buffer.from([255, 216, 255, 217])]) {
    assert.throws(() => jpegDimensions(bytes), /JPEG/);
  }
  for (const frame of [0xc0, 0xc2]) {
    assert.deepEqual(jpegDimensions(Buffer.from([255, 216, 255, frame, 0, 8, 8, 2, 128, 2, 128, 1])), { width: 640, height: 640 });
  }
});

test('both generated routes expose illustration captions, alternatives and accurate image disclosure', async () => {
  for (const route of ['books/index.html', 'books/room-preview.html']) {
    const html = await read(route);
    assert.equal((html.match(/class="product-card__illustration-label"/g) || []).length, 25);
    assert.equal((html.match(/実物の外観ではありません）" width="640" height="640" loading="lazy" decoding="async"/g) || []).length, 25);
    assert.match(html, /実物の表紙・色・形状・付属品を再現したものではありません/);
    assert.doesNotMatch(html, /商品画像は未掲載|商品画像は使用許諾未確認/);
    assert.match(html, /assets\/brand\/pixieed-logo-48\.png/);
    assert.doesNotMatch(html, /<img[^>]+src="https?:\/\//);
  }
  const css = await read('css/books.css');
  assert.match(css, /\.product-detail__content \.product-card__illustration\[data-size\] img \{[^}]*image-rendering: auto/);
  assert.match(css, /background: #f4f2ec/);
  assert.match(css, /@media \(max-width: 599px\) \{\s*\.books-page \.product-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
