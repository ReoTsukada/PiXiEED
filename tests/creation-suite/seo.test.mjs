import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const pages = [
  ['index.html', '/', 'site'], ['globe/index.html', '/globe/', 'site'], ['tools/index.html', '/tools/', 'tools'],
  ['draw/index.html', '/draw/', 'draw'], ['audio/index.html', '/audio/', 'audio'], ['jigsaw/index.html', '/jigsaw/', 'jigsaw'],
  ['spot-difference/index.html', '/spot-difference/', 'spot-difference'], ['hidden-object/index.html', '/hidden-object/', 'hidden-object'],
  ['pixfind/index.html', '/pixfind/', 'pixfind'], ['game/index.html', '/game/', 'game'], ['pixel-camera.html', '/pixel-camera.html', 'camera'],
  ['telescope/index.html', '/telescope/', 'telescope'], ['about/index.html', '/about/', 'site'], ['guide/index.html', '/guide/', 'site'],
  ['privacy/index.html', '/privacy/', 'site'], ['stores/index.html', '/stores/', 'site'],
  ['stores/ecowashcafe-nakanoshima.html', '/stores/ecowashcafe-nakanoshima.html', 'site'], ['collection/index.html', '/collection/', 'site'],
];
const artworkLabels = {
  site: 'つくる・あそぶ・つながる', tools: '制作ツール', draw: 'ドット絵を描く', audio: '音をつくる',
  jigsaw: 'ジグソーパズル', 'spot-difference': 'まちがい探し', 'hidden-object': 'もの探し',
  pixfind: 'ピクスファインド', game: 'ゲームをつくる', camera: 'ドットカメラ', telescope: '天体を見つける',
};

function read(relativePath) { return readFileSync(resolve(root, relativePath), 'utf8'); }
function values(html, attribute, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...html.matchAll(new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escaped}["'])[^>]*\\bcontent=["']([^"']*)["'][^>]*>`, 'gi'))].map((match) => match[1]);
}
function pngDimensions(relativePath) {
  const png = readFileSync(resolve(root, relativePath));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', `${relativePath} is PNG`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test('public pages carry one canonical, branded OGP and Twitter preview with the assigned artwork', () => {
  for (const [file, path, imageName] of pages) {
    const source = read(file);
    const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
    assert.ok(head, `${file} has head`);
    assert.equal((head.match(/<title\b/gi) || []).length, 1, `${file} has one title`);
    const title = head.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = values(head, 'name', 'description');
    assert.ok(title && title.length > 3, `${file} has a useful title`);
    assert.equal(description.length, 1, `${file} has exactly one description`);
    assert.ok(description[0].length >= 20, `${file} has a specific description`);
    assert.match(head, new RegExp(`<link\\b(?=[^>]*rel=["']canonical["'])[^>]*href=["']https://pixieed\\.jp${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
    assert.equal(values(head, 'property', 'og:type')[0], 'website');
    for (const name of ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt']) {
      assert.equal(values(head, 'property', name).length, 1, `${file} has one ${name}`);
    }
    assert.equal(values(head, 'property', 'og:site_name')[0], 'PiXiEED');
    assert.equal(values(head, 'property', 'og:locale')[0], 'ja_JP');
    assert.equal(values(head, 'property', 'og:title')[0], title);
    assert.equal(values(head, 'property', 'og:description')[0], description[0]);
    assert.equal(values(head, 'property', 'og:url')[0], `https://pixieed.jp${path}`);
    const imageUrl = `https://pixieed.jp/assets/og/${imageName}.png`;
    assert.equal(values(head, 'property', 'og:image')[0], imageUrl);
    assert.equal(values(head, 'property', 'og:image:type')[0], 'image/png');
    assert.equal(values(head, 'property', 'og:image:width')[0], '1200');
    assert.equal(values(head, 'property', 'og:image:height')[0], '630');
    const expectedAlt = `PiXiEEDのロゴと「${artworkLabels[imageName]}」${imageName === 'site' ? '' : 'のアイコン'}`;
    assert.equal(values(head, 'property', 'og:image:alt')[0], expectedAlt);
    assert.deepEqual(values(head, 'name', 'twitter:card'), ['summary_large_image']);
    for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
      assert.equal(values(head, 'name', name).length, 1, `${file} has one ${name}`);
    }
    assert.equal(values(head, 'name', 'twitter:title')[0], title);
    assert.equal(values(head, 'name', 'twitter:description')[0], description[0]);
    assert.equal(values(head, 'name', 'twitter:image')[0], imageUrl);
    assert.equal(values(head, 'name', 'twitter:image:alt')[0], expectedAlt);
    assert.deepEqual(pngDimensions(`assets/og/${imageName}.png`), [1200, 630]);
    assert.equal((head.match(/rel=["']canonical["']/gi) || []).length, 1);
    assert.doesNotMatch(head, /assets\/brand\/pixieed-logo.*(?:og:image|twitter:image)/i);
  }
});

test('pages use the unified brand icons and app manifest', () => {
  assert.deepEqual(pngDimensions('favicon-96.png'), [96, 96]);
  assert.deepEqual(pngDimensions('apple-touch-icon.png'), [180, 180]);
  assert.equal(readFileSync(resolve(root, 'favicon.ico')).readUInt16LE(0), 0);
  assert.ok(read('manifest.webmanifest').includes('PiXiEED'));
  for (const [file] of pages) {
    const head = read(file).match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)[1];
    assert.match(head, /<link rel="icon" href="\/favicon-96\.png" sizes="96x96" type="image\/png">/);
    assert.match(head, /<link rel="icon" href="\/favicon\.ico" sizes="any">/);
    assert.match(head, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180">/);
    assert.match(head, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  }
});

test('sitemap lists the clean public page URLs without retired and private routes', () => {
  const sitemap = read('sitemap.xml');
  const actual = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = pages.map(([, path]) => `https://pixieed.jp${path}`);
  assert.deepEqual(actual, expected);
  assert.doesNotMatch(sitemap, /\/(?:profile|admin|sale|localdrafts|works|gallery)\//i);
});
