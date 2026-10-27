import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { encodeRaster, decodeRaster, sniffRaster } from '../../js/creation/conversion-raster.mjs';
import { encodePcm, decodePcm } from '../../js/creation/conversion-pcm.mjs';
const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const routes = ['image-formats', 'audio-formats'];
for (const route of routes) {
  const path = `output/${route}/index.html`;
  test(`${route}: unique canonical, metadata and a single descriptive heading`, async () => {
    const html = await read(path), url = `https://pixieed.jp/output/${route}/`;
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.ok(html.includes(`rel="canonical" href="${url}"`));
    assert.ok(html.includes(`property="og:url" content="${url}"`));
    assert.ok(html.match(/<meta name="description" content="[^"]{40,}"/));
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    assert.ok(title.length < 75);
    assert.ok(html.includes(`property="og:title" content="${title}"`));
    assert.doesNotMatch(html, /<meta[^>]+(?:noindex|http-equiv="refresh")|name="keywords"/i);
  });
  test(`${route}: visible content matches breadcrumb structured data`, async () => {
    const html = await read(path);
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const page = data['@graph'].find(x => x['@type'] === 'WebPage');
    const crumbs = data['@graph'].find(x => x['@type'] === 'BreadcrumbList');
    assert.equal(page.breadcrumb['@id'], crumbs['@id']);
    assert.equal(crumbs.itemListElement.at(-1).item, page.url);
    assert.equal(crumbs.itemListElement.at(-1).name, html.match(/<h1>(.*?)<\/h1>/)[1]);
    assert.deepEqual(crumbs.itemListElement.map(x => x.position), [1, 2, 3]);
    assert.doesNotMatch(JSON.stringify(data), /aggregateRating|reviewCount|FAQPage/);
  });
  test(`${route}: crawlable links and fragments resolve to existing documents`, async () => {
    const html = await read(path);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
      if (href.startsWith('#')) assert.ok(ids.includes(href.slice(1)), href);
      else if (href.startsWith('/')) {
        let target = href.split(/[?#]/)[0];
        if (target.endsWith('/')) target += 'index.html';
        await access(new URL(target.slice(1), root));
      }
    }
    assert.match(html, /href="\/output\/work\/\?mode=convert"/);
    assert.match(html, /href="\/output\/"/);
  });
  test(`${route}: substantive HTML is available without JavaScript or tracking`, async () => {
    const html = await read(path);
    const main = html.match(/<main\b[\s\S]*?<\/main>/)[0];
    assert.ok((main.match(/<h2\b/g) || []).length >= 5);
    assert.ok(main.replace(/<[^>]+>/g, '').length > 1500);
    assert.doesNotMatch(main, /<iframe|<input|data-output-guide-ad|adsbygoogle|\shidden(?:\s|=|>)/);
    assert.doesNotMatch(html, /googlesyndication|google-analytics|fetch\(/);
  });
}
test('public converter links to both guides without adding ads or changing file handling', async () => {
  const html = await read('output/index.html');
  for (const route of routes) assert.ok(html.includes(`href="/output/${route}/"`));
  assert.equal((html.match(/data-output-guide-ad aria/g) || []).length, 1);
  assert.doesNotMatch(html, /<input[^>]+type="file"/);
  assert.match(html, /data-output-guide-ui/);
  assert.match(html, /location\.replace\(`\/output\/work\/\?id=/);
  assert.match(html, /js\/ads\/output-guide-ad\.mjs\?rev=20261027-purpose-ui-1/);
});
test('dedicated sitemap is declared and lists only public canonical guides', async () => {
  const xml = await read('sitemap-conversions.xml'), robots = await read('robots.txt');
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\/pixieed.jp\/sitemap.xml/);
  assert.match(robots, /Sitemap: https:\/\/pixieed.jp\/sitemap-conversions.xml/);
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(x => x[1]);
  assert.deepEqual(urls, routes.map(r => `https://pixieed.jp/output/${r}/`));
  for (const url of urls) assert.doesNotMatch(url, /\/work\/|\?|#/);
  assert.doesNotMatch(xml, /<lastmod>|<priority>/);
});
test('support documentation separates input and output limitations', async () => {
  const image = await read('output/image-formats/index.html');
  const audio = await read('output/audio-formats/index.html');
  for (const value of ['32bit RGBA','非圧縮24bit','256×256px','先頭ページ','P4','P5','P6','P7','ベクター化']) assert.ok(image.includes(value), value);
  for (const value of ['120秒','4MB','8〜48kHz','32bit floatではありません','μ-law','A-law','無音']) assert.ok(audio.includes(value), value);
  assert.doesNotMatch(image + audio, /無制限|完全対応|必ず.*小さくなります|評価5|検索1位/);
});
const frame = { width: 3, height: 2, data: new Uint8ClampedArray([255,0,0,255,0,255,0,127,0,0,255,0,30,40,50,255,1,2,3,200,10,20,30,255]) };
for (const format of ['tga','qoi','tiff','bmp','ico','pbm','pgm','ppm','pam']) {
  test(`documented ${format.toUpperCase()} output is a real, decodable format`, async () => {
    const blob = encodeRaster(frame, format);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const decoded = decodeRaster(bytes, sniffRaster(bytes, `test.${format}`));
    assert.equal(decoded.width, frame.width); assert.equal(decoded.height, frame.height);
    if (['qoi','tga','tiff','ico','pam'].includes(format)) assert.deepEqual(decoded.data, frame.data);
    assert.ok((await read('output/image-formats/index.html')).includes(format.toUpperCase()));
  });
}
for (const format of ['aiff', 'au']) for (const bitDepth of [16, 24, 32]) {
  test(`documented ${format.toUpperCase()} ${bitDepth}bit PCM output roundtrips`, async () => {
    const source = { sampleRate: 16000, channels: [Float64Array.of(-.5, 0, .5)] };
    const blob = encodePcm(source, format, { bitDepth });
    const decoded = decodePcm(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(decoded.sampleRate, 16000);
    assert.deepEqual(decoded.channels[0], source.channels[0]);
  });
}
