import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildPagesSite } from '../../scripts/build-pages-site.mjs';
import { jpegDimensions } from '../../scripts/generate-shop-illustrations.mjs';

const source = new URL('../../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, products, html = '<h1>Catalog</h1>') {
  const root = await mkdtemp(join(tmpdir(), 'pixieed-books-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const entries = {
    'books/index.html': html,
    'books/room-preview.html': '<h1>Private preview</h1>',
    'assets/books/room-products.json': JSON.stringify(products),
    'assets/books/room-commerce.json': '{}',
    'assets/books/room-scene.json': '{}',
    'assets/books/illustrations/unregistered.jpg': 'private draft',
  };
  for (const [name, value] of Object.entries(entries)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), value);
  }
  // Stage only the disposable fixture, never the user's worktree. Artwork stays
  // untracked, reproducing a pre-commit local preview build.
  execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

test('build ships all 25 card references and 21 exact JPEGs even before artwork is tracked', async t => {
  const products = JSON.parse(await readFile(new URL('assets/books/room-products.json', source), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('assets/books/illustrations-manifest.json', source), 'utf8'));
  const html = await readFile(new URL('books/index.html', source), 'utf8');
  const root = await fixture(t, products, html);
  // Arbitrary local work created after the fixture's tracked source list stays out.
  await mkdir(dirname(join(root, 'js/ads/arbitrary-untracked.mjs')), { recursive: true });
  await writeFile(join(root, 'js/ads/arbitrary-untracked.mjs'), 'must remain excluded');
  for (const asset of manifest.assets) await copyFile(new URL(asset.src.slice(1), source), join(root, asset.src.slice(1)));
  for (const name of ['data/shop-ad-config.mjs', 'js/ads/shop-ad.mjs']) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), 'export const reviewedShopSource = true;');
  }
  for (const name of ['data/project-gallery-ad-config.mjs', 'js/ads/project-gallery-ad.mjs']) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), 'export const reviewedProjectGallerySource = true;');
  }
  const output = join(root, 'dist');
  await buildPagesSite({ root, output });
  for (const name of ['data/shop-ad-config.mjs', 'js/ads/shop-ad.mjs']) assert.equal(await readFile(join(output, name), 'utf8'), 'export const reviewedShopSource = true;');
  for (const name of ['data/project-gallery-ad-config.mjs', 'js/ads/project-gallery-ad.mjs']) assert.equal(await readFile(join(output, name), 'utf8'), 'export const reviewedProjectGallerySource = true;');
  await assert.rejects(readFile(join(output, 'js/ads/arbitrary-untracked.mjs')), { code: 'ENOENT' });
  const builtHtml = await readFile(join(output, 'books/index.html'), 'utf8');
  const references = [...builtHtml.matchAll(/<img\b[^>]*src="(\/assets\/books\/illustrations\/[^" ]+\.jpg)"/g)].map(match => match[1]);
  assert.equal(references.length, 25);
  assert.equal(new Set(references).size, 21);
  const byPath = new Map(manifest.assets.map(asset => [asset.src, asset]));
  for (const src of references) {
    const bytes = await readFile(join(output, src.slice(1)));
    assert.equal(hash(bytes), byPath.get(src).sha256, src);
    assert.deepEqual(jpegDimensions(bytes), { width: 640, height: 640 }, src);
  }
  for (const name of ['books/room-preview.html', 'assets/books/room-scene.json', 'assets/books/illustrations/unregistered.jpg']) {
    await assert.rejects(readFile(join(output, name)), { code: 'ENOENT' });
  }
});

test('build keeps legacy thumbnails and excludes inactive, undocumented and unsafe JPEG registrations', async t => {
  const thumb = { kind: 'illustration', src: '/assets/books/illustrations/unused.jpg', width: 640, height: 640, alt: 'Concept', creator: 'AI', rights: 'Original', source: 'manifest' };
  const products = [
    ...[32, 96].map(size => ({ shopThumbnail: { src: `/assets/books/legacy-${size}.png`, width: size, height: size } })),
    ...[{ enabled: false }, { visible: false }, { sample: true }].map(state => ({ ...state, shopThumbnail: thumb })),
    ...['https://example.com/a.jpg', '/assets/books/illustrations/../a.jpg', '/assets/books/illustrations/%2e%2e/a.jpg', '/assets/books/illustrations/a.jpg?x=1', '/assets/books/illustrations//a.jpg'].map(src => ({ shopThumbnail: { ...thumb, src } })),
    { shopThumbnail: { ...thumb, kind: 'photo' } },
    { shopThumbnail: { ...thumb, creator: '' } },
    { shopThumbnail: { ...thumb, width: 96 } },
  ];
  const root = await fixture(t, products);
  for (const size of [32, 96]) await writeFile(join(root, `assets/books/legacy-${size}.png`), `legacy-${size}`);
  await buildPagesSite({ root, output: join(root, 'dist') });
  for (const size of [32, 96]) assert.equal(await readFile(join(root, `dist/assets/books/legacy-${size}.png`), 'utf8'), `legacy-${size}`);
  await assert.rejects(readFile(join(root, 'dist/assets/books/illustrations/unused.jpg')), { code: 'ENOENT' });
});

test('build fails closed on invalid JPEG bytes and symlinked illustration sources', async t => {
  const shopThumbnail = { kind: 'illustration', src: '/assets/books/illustrations/invalid.jpg', width: 640, height: 640, alt: 'Concept', creator: 'AI', rights: 'Original', source: 'manifest' };
  const root = await fixture(t, [{ shopThumbnail }]);
  const file = join(root, shopThumbnail.src.slice(1));
  await writeFile(file, 'not a JPEG');
  await assert.rejects(buildPagesSite({ root, output: join(root, 'dist') }), /JPEG/);
  await rm(file);
  await symlink(join(root, 'assets/books/illustrations/unregistered.jpg'), file);
  await assert.rejects(buildPagesSite({ root, output: join(root, 'dist') }), /regular local file/);
});
