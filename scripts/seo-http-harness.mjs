#!/usr/bin/env node
// Serve only the checked-in SEO fixtures over loopback. No app JS or external requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stores as storeData } from '../data/site-data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eventCatalog = JSON.parse(await readFile(resolve(root, 'events/catalog.json'), 'utf8'));
const eventRoutes = ['/events/', ...eventCatalog.ids.map(id => `/events/${id}/`)];
const pages = ['/', '/output/', '/globe/', '/tools/', '/draw/', '/audio/', '/jigsaw/', '/spot-difference/', '/hidden-object/', '/play/spot-difference/', '/play/hidden-object/', '/game/', '/pixel-camera.html', '/pixiee-lens/', '/telescope/', '/about/', '/guide/', '/privacy/', '/stores/', '/stores/ecowashcafe-nakanoshima.html', '/collection/'];
const indexableRoutes = ['/', '/globe/', '/tools/', '/output/', '/draw/', '/audio/', '/jigsaw/', '/spot-difference/', '/hidden-object/', '/play/spot-difference/', '/play/hidden-object/', '/pixel-camera.html', '/pixiee-lens/', '/about/', '/guide/', '/privacy/', '/stores/', '/stores/ecowashcafe-nakanoshima.html'];
indexableRoutes.push(...eventRoutes);
const images = ['site', 'tools', 'draw', 'audio', 'jigsaw', 'spot-difference', 'hidden-object', 'spot-game', 'find-game', 'game', 'camera', 'telescope', 'output', 'globe', 'events', 'stores'];
const icons = new Map([['/favicon-96.png', 96], ['/apple-touch-icon.png', 180], ['/assets/brand/app-icon-192.png', 192], ['/assets/brand/app-icon-512.png', 512]]);
const paths = new Map(pages.map((url) => [url, url.endsWith('/') ? `${url}index.html` : url]));
for (const path of eventRoutes) paths.set(path, `${path}index.html`);
for (const name of images) paths.set(`/assets/og/${name}.png`, `/assets/og/${name}.png`);
paths.set('/pixiee-lens/ogp.png', '/pixiee-lens/ogp.png');
for (const name of [...icons.keys(), '/favicon.ico', '/manifest.webmanifest', '/sitemap.xml', '/robots.txt']) paths.set(name, name);
const mime = (path) => path.endsWith('.png') ? 'image/png' : path.endsWith('.ico') ? 'image/vnd.microsoft.icon' : path.endsWith('.webmanifest') ? 'application/manifest+json' : path.endsWith('.xml') ? 'application/xml' : path.endsWith('.txt') ? 'text/plain' : 'text/html';
const server = createServer(async (request, response) => {
  try {
    const path = paths.get(new URL(request.url, 'http://localhost').pathname);
    if (!path || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end(); return; }
    const bytes = await readFile(resolve(root, `.${path}`));
    response.writeHead(200, { 'Content-Type': `${mime(path)}${path.endsWith('.html') ? '; charset=utf-8' : ''}`, 'Content-Length': String(bytes.length) });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(500); response.end(); }
});
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((match) => [match[1].toLowerCase(), match[3]]));
let checks = 0;
try {
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(path) {
    const response = await fetch(`${base}${path}`, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'facebookexternalhit/1.1 (local fixture test)' } });
    assert.equal(response.status, 200, path);
    return response;
  }
  for (const path of pages) {
    for (const query of ['', '?v=seo-local-test']) {
      const response = await get(path + query);
      assert.match(response.headers.get('content-type'), /^text\/html;/);
      const html = await response.text();
      const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1];
      assert.ok(head, path);
      const tags = [...head.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(([tag]) => attributes(tag));
      function meta(key) {
        const found = tags.filter((tag) => (tag.name || tag.property) === key);
        assert.equal(found.length, 1, `${path}: ${key}`);
        assert.ok(found[0].content?.trim(), `${path}: empty ${key}`);
        return found[0].content;
      }
      const canonical = tags.filter((tag) => tag.rel === 'canonical');
      assert.equal(canonical.length, 1);
      assert.equal(canonical[0].href, `https://pixieed.jp${path}`);
      if (indexableRoutes.includes(path)) {
        const robots = tags.find((tag) => tag.name === 'robots');
        assert.ok(!/noindex/i.test(robots?.content || ''), `${path}: indexable sitemap route is not noindex`);
      }
      assert.equal(meta('og:url'), canonical[0].href);
      assert.equal(meta('og:site_name'), 'PiXiEED');
      assert.equal(meta('og:locale'), 'ja_JP');
      if (path === '/pixiee-lens/') {
        // The established lens page uses a compact legacy head; validate its
        // canonical and factual JSON-LD without imposing the newer OG bundle.
        assert.ok(meta('description'));
        assert.ok(meta('og:title'));
        assert.ok(meta('og:description'));
        assert.equal(meta('og:image'), 'https://pixieed.jp/pixiee-lens/ogp.png');
        const image = new URL(meta('og:image'));
        assert.equal(image.origin, 'https://pixieed.jp');
        assert.ok(paths.has(image.pathname));
        const structured = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
          .map(([, json]) => JSON.parse(json));
        assert.ok(structured.length > 0, 'lens structured data remains valid JSON');
        checks++;
        continue;
      }
      assert.equal(meta('og:type'), 'website');
      assert.equal(meta('og:image:width'), '1200'); assert.equal(meta('og:image:height'), '630');
      assert.equal(meta('og:image:type'), 'image/png');
      assert.equal(meta('twitter:card'), 'summary_large_image');
      assert.equal(meta('twitter:image'), meta('og:image'));
      const image = new URL(meta('og:image'));
      assert.equal(image.origin, 'https://pixieed.jp');
      assert.ok(paths.has(image.pathname), `unknown OG asset ${path}`);
      assert.equal(image.search, '');
      for (const key of ['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt']) meta(key);
      assert.ok(tags.some((tag) => tag.rel === 'icon' && tag.href === '/favicon-96.png' && tag.sizes === '96x96'));
      assert.ok(tags.some((tag) => tag.rel === 'apple-touch-icon' && tag.href === '/apple-touch-icon.png' && tag.sizes === '180x180'));
      assert.ok(tags.some((tag) => tag.rel === 'manifest' && tag.href === '/manifest.webmanifest'));
      checks++;
    }
  }
  for (const path of eventRoutes) {
    const html = await (await get(path)).text();
    assert.ok(html.includes(`href="https://pixieed.jp${path}"`));
    assert.match(html, /<h1[ >]/);
    assert.doesNotMatch(html, /name="robots"[^>]*noindex/);
    assert.match(html, /href="\/globe\/"/);
    checks++;
  }
  for (const [path, width, height] of [...images.map((name) => [`/assets/og/${name}.png`, 1200, 630]), ...[...icons].map(([path, size]) => [path, size, size])]) {
    const response = await get(path); assert.equal(response.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), width); assert.equal(bytes.readUInt32BE(20), height);
    checks++;
  }
  const ico = Buffer.from(await (await get('/favicon.ico')).arrayBuffer());
  const png = Buffer.from(await (await get('/favicon-96.png')).arrayBuffer());
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico[6], 96); assert.equal(ico[7], 96); assert.equal(ico.readUInt32LE(18), 22);
  assert.deepEqual(ico.subarray(22), png); checks++;
  const manifest = await (await get('/manifest.webmanifest')).json();
  assert.equal(manifest.name, 'PiXiEED'); assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) assert.ok(icons.has(icon.src)); checks++;
  const sitemap = await (await get('/sitemap.xml')).text();
  const sitemapRoutes = [...sitemap.matchAll(/<loc>https:\/\/pixieed\.jp([^<]*)<\/loc>/g)].map(([, route]) => route);
  assert.deepEqual(sitemapRoutes, indexableRoutes, 'sitemap contains only the canonical indexable routes in source order');
  for (const path of ['/game/', '/telescope/', '/collection/']) assert.ok(!sitemapRoutes.includes(path), `${path} is non-indexable`);
  assert.doesNotMatch(sitemap, /https:\/\/pixieed\.jp\/(?:admin|profile|works|shops)\//); checks++;
  const stores = await (await get('/stores/')).text();
  assert.equal(stores.length > 0, true);
  for (const store of storeData) {
    assert.ok(stores.includes(store.name)); assert.ok(stores.includes(store.status));
    assert.ok(stores.includes(`/stores/${store.id}.html`));
  }
  checks++;
  const detail = await (await get('/stores/ecowashcafe-nakanoshima.html')).text();
  for (const store of storeData) {
    assert.ok(detail.includes(`<h1>${store.name}</h1>`));
    assert.ok(detail.includes(store.status)); assert.ok(detail.includes(store.address));
  }
  checks++;
  for (const path of ['/game/', '/telescope/', '/collection/']) {
    const html = await (await get(path)).text();
    assert.match(html, /<meta name="robots" content="noindex,follow"/i, `${path} stays served but excluded from the sitemap`);
    checks++;
  }
  const retired = await fetch(`${base}/shops/`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(retired.status, 404, 'retired shop route has no source fallback'); checks++;
  assert.match(await (await get('/robots.txt')).text(), /Sitemap: https:\/\/pixieed\.jp\/sitemap\.xml/); checks++;
  console.log(`SEO HTTP fixtures: ${checks} checks PASS (JavaScript is not executed; loopback only).`);
  console.log('Production crawling, per-puzzle OGP, and social-platform cache refresh are not tested here.');
} finally {
  server.closeAllConnections();
  await new Promise((accept) => server.close(accept));
}
