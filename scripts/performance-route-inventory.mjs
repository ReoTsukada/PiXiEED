#!/usr/bin/env node
// Static, dependency-free inventory of public HTML routes and their declared local assets.
// This is deliberately an over-approximation of possible dependencies, not a browser network trace.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'docs/performance-20261017/route-inventory.json');
const OUT_MD = path.join(ROOT, 'docs/performance-20261017/route-inventory.md');
const IGNORE = new Set(['.git', 'node_modules', 'docs', 'tests', '.claude-tmp']);
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i;
const MIME_EXT = /\.(?:css|mjs|js)$/i;
const read = p => fs.readFileSync(p, 'utf8');
const stat = p => { try { return fs.statSync(p); } catch { return null; } };
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && IGNORE.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
};
const unescapeHtml = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const attr = (tag, name) => {
  const m = tag.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? unescapeHtml(m[1] ?? m[2] ?? m[3] ?? '') : '';
};
const routeFromFile = f => {
  let r = '/' + rel(f).replace(/\\/g, '/');
  r = r.replace(/(?:^|\/)index\.html$/i, '/');
  return r;
};
const normalizeRoute = value => {
  try {
    const u = new URL(value, 'https://pixieed.jp');
    let p = decodeURI(u.pathname).replace(/\/+/g, '/');
    if (p.endsWith('/index.html')) p = p.slice(0, -10);
    if (!path.posix.extname(p) && !p.endsWith('/')) p += '/';
    return p || '/';
  } catch { return value; }
};
const stripQuery = s => s.split('#')[0].split('?')[0];
const localPath = (url, fromFile) => {
  if (!url || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(url)) return null;
  let pathname;
  try {
    const u = new URL(url, 'https://pixieed.jp' + routeFromFile(fromFile));
    if (u.origin !== 'https://pixieed.jp') return null;
    pathname = decodeURIComponent(u.pathname);
  } catch { return null; }
  if (!pathname.startsWith('/')) return null;
  let p = path.resolve(ROOT, '.' + pathname);
  if (!p.startsWith(ROOT + path.sep) && p !== ROOT) return null;
  if (!stat(p)) {
    const alt = [p + '.html', path.join(p, 'index.html')].find(x => stat(x)?.isFile());
    if (alt) p = alt;
  }
  return stat(p)?.isFile() ? p : null;
};
const bytesOf = p => stat(p)?.size ?? null;
function imageDimensions(p) {
  try {
    const b = fs.readFileSync(p);
    if (b.length >= 24 && b.toString('hex', 0, 8) === '89504e470d0a1a0a') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      if (b.toString('ascii', 12, 16) === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (b.toString('ascii', 12, 16) === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (b.toString('ascii', 12, 16) === 'VP8L') return { width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
    }
    if (/\.svg$/i.test(p)) {
      const s = b.toString('utf8', 0, 8192), m = s.match(/<svg\b[^>]*>/i)?.[0] || '';
      const w = m.match(/\bwidth=["']([\d.]+)/i)?.[1], h = m.match(/\bheight=["']([\d.]+)/i)?.[1];
      if (w && h) return { width: Number(w), height: Number(h) };
      const vb = m.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i);
      if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
    }
    if (/\.jpe?g$/i.test(p)) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1]; i += 2;
        if ([0xd8, 0xd9, 0x01].includes(marker) || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const len = b.readUInt16BE(i);
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { width: b.readUInt16BE(i + 5), height: b.readUInt16BE(i + 3) };
        i += len;
      }
    }
  } catch {}
  return null;
}
const assets = new Map();
const externalFonts = new Map();
function addAsset(p, kind, source, extra = {}) {
  if (!p) return null;
  const key = rel(p);
  if (!assets.has(key)) assets.set(key, { path: key, bytes: bytesOf(p), kinds: new Set(), references: new Set(), occurrences: 0, ...extra });
  const a = assets.get(key); a.kinds.add(kind); a.references.add(source); a.occurrences++;
  return { path: key, kind, bytes: a.bytes, source, ...extra };
}
const htmlFiles = walk(ROOT).filter(p => /\.html?$/i.test(p) && !rel(p).startsWith('docs/') && !rel(p).startsWith('tests/'));
const sitemapText = stat(path.join(ROOT, 'sitemap.xml')) ? read(path.join(ROOT, 'sitemap.xml')) : '';
const sitemapRoutes = new Set([...sitemapText.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(m => normalizeRoute(m[1])));
const routeByFile = new Map(htmlFiles.map(f => [f, routeFromFile(f)]));
const routes = [];
const moduleRefs = new Map();
const cssRefs = new Map();

function collectCss(file, fromRoute, seen = new Set()) {
  if (!file || seen.has(file)) return [];
  seen.add(file);
  const text = read(file), found = [];
  for (const m of text.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?/gi)) {
    const p = localPath(m[1], file); if (p && /\.css$/i.test(p)) { found.push(addAsset(p, 'css-import', fromRoute)); found.push(...collectCss(p, fromRoute, seen)); }
  }
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const value = m[1].trim(), p = localPath(value, file);
    if (p) found.push(addAsset(p, /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(p) ? 'font' : IMAGE_EXT.test(p) ? 'css-image' : 'css-url', fromRoute));
    else if (/\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(value)) {
      const key = new URL(value, 'https://pixieed.jp').href;
      if (!externalFonts.has(key)) externalFonts.set(key, new Set()); externalFonts.get(key).add(fromRoute);
    }
  }
  cssRefs.set(rel(file), found.map(x => x.path));
  return found;
}
function collectModule(file, fromRoute, seen = new Set()) {
  if (!file || seen.has(file) || !/\.(?:mjs|js)$/i.test(file)) return [];
  seen.add(file);
  const text = read(file), found = [addAsset(file, 'script', fromRoute)];
  // Static imports, re-exports, literal dynamic imports, and new URL('./asset', import.meta.url).
  const patterns = [/(?:\bimport\s*(?:[^'";]*?\sfrom\s*)?|\bexport\s+[^'";]*?\sfrom\s*)["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g, /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g];
  for (const pattern of patterns) for (const m of text.matchAll(pattern)) {
    const p = localPath(m[1], file); if (!p) continue;
    if (/\.css$/i.test(p)) { found.push(addAsset(p, 'js-css-import', fromRoute)); found.push(...collectCss(p, fromRoute)); }
    else { found.push(addAsset(p, 'module-import', fromRoute)); found.push(...collectModule(p, fromRoute, seen)); }
  }
  moduleRefs.set(rel(file), [...new Set(found.filter(Boolean).map(x => x.path))]);
  return found;
}
const allHtmlRoutes = htmlFiles.map(file => {
  const source = read(file), route = routeByFile.get(file), tags = [...source.matchAll(/<(script|link|img|source|video|audio|meta)\b[^>]*>/gi)].map(m => m[0]);
  const canonical = unescapeHtml(source.match(/<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i)?.[0] || '');
  const cUrl = attr(canonical, 'href');
  const noindex = /<meta\b[^>]*\bname=["'](?:robots|googlebot)["'][^>]*\bcontent=["'][^"']*noindex/i.test(source);
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().replace(/\s+/g, ' ') || '';
  const scripts = [], stylesheets = [], images = [], preloads = [], direct = [], routeExternalFonts = [];
  for (const tag of tags) {
    const type = tag.match(/^<(\w+)/i)?.[1]?.toLowerCase();
    if (type === 'script' && attr(tag, 'src')) {
      const src = attr(tag, 'src'), p = localPath(src, file), item = { src, type: attr(tag, 'type') || 'classic', async: /\basync\b/i.test(tag), defer: /\bdefer\b/i.test(tag), local: p ? rel(p) : null, bytes: p ? bytesOf(p) : null };
      scripts.push(item);
      if (p) { direct.push(addAsset(p, 'script', route)); if (item.type === 'module' || /\.mjs$/i.test(p)) direct.push(...collectModule(p, route)); }
    }
    if (type === 'link') {
      const href = attr(tag, 'href'), r = (attr(tag, 'rel') || '').toLowerCase(), as = attr(tag, 'as');
      const p = localPath(href, file);
      if (r.split(/\s+/).includes('stylesheet')) {
        stylesheets.push({ href, local: p ? rel(p) : null, bytes: p ? bytesOf(p) : null });
        if (p) { direct.push(addAsset(p, 'stylesheet', route)); direct.push(...collectCss(p, route)); }
      }
      if (r.split(/\s+/).some(x => ['preload','modulepreload','prefetch'].includes(x))) {
        const item = { rel: r, as, href, local: p ? rel(p) : null, bytes: p ? bytesOf(p) : null, crossorigin: attr(tag, 'crossorigin') || null };
        preloads.push(item); if (p) direct.push(addAsset(p, 'preload', route));
        if (as === 'font' && !p) routeExternalFonts.push(href);
      }
    }
    if (type === 'img' || type === 'source' || type === 'video' || type === 'audio') {
      const src = attr(tag, 'src') || attr(tag, 'poster');
      const srcset = attr(tag, 'srcset');
      const candidates = [src, ...srcset.split(',').map(x => x.trim().split(/\s+/)[0])].filter(Boolean);
      for (const candidate of candidates) {
        const p = localPath(candidate, file); if (!p) continue;
        const dims = IMAGE_EXT.test(p) ? imageDimensions(p) : null;
        const item = { tag: type, src: candidate, local: rel(p), bytes: bytesOf(p), sourceWidth: dims?.width ?? null, sourceHeight: dims?.height ?? null, loading: attr(tag, 'loading') || null, width: attr(tag, 'width') || null, height: attr(tag, 'height') || null, fetchpriority: attr(tag, 'fetchpriority') || null };
        images.push(item); direct.push(addAsset(p, type === 'img' || type === 'source' ? 'image' : 'media', route));
      }
    }
  }
  const lowerPath = route.toLowerCase();
  const internal = /(?:^|\/)(?:admin|tests?|test|prototype|debug|dev)(?:\/|-|\.|$)/i.test(lowerPath) || /(?:test|prototype|debug)/i.test(path.basename(route));
  const audience = internal || noindex ? 'internal-or-noindex' : /\/events?\//i.test(route) ? 'event' : /\/(?:tools?|draw|camera|audio|jigsaw|spot-difference|hidden-object|play|pixiedraw|pixiee-lens|studio|game|pass)(?:\/|$)/i.test(route) ? 'tool-or-product' : /\/(?:about|guide|help|glossary|privacy|shops|stores|works|collection|books)(?:\/|$)/i.test(route) ? 'content' : 'home-or-other';
  const canonicalRoute = cUrl ? normalizeRoute(cUrl) : null;
  const all = direct.filter(Boolean), uniquePaths = [...new Set(all.map(x => x.path))];
  const uniqueBytes = uniquePaths.reduce((n, x) => n + (assets.get(x)?.bytes || 0), 0);
  const directUnique = [...new Set([...scripts.map(x=>x.local), ...stylesheets.map(x=>x.local), ...images.filter(x=>x.loading !== 'lazy').map(x=>x.local), ...preloads.map(x=>x.local)].filter(Boolean))];
  const duplicateReferences = [...new Set(all.map(x=>x.path))].filter(p=>all.filter(x=>x.path===p).length>1).map(p=>({path:p, referenceCount:all.filter(x=>x.path===p).length}));
  const initialBytes = directUnique.reduce((n, x) => n + (assets.get(x)?.bytes || 0), 0);
  return { route, file: rel(file), title, audience, sitemap: sitemapRoutes.has(normalizeRoute(route)), canonical: canonicalRoute, aliasOf: canonicalRoute && canonicalRoute !== normalizeRoute(route) ? canonicalRoute : null, noindex, scripts, stylesheets, images, preloads, externalFonts: routeExternalFonts, staticDependencies: { uniqueFiles: uniquePaths.length, uniqueBytes, initialDeclaredFiles: directUnique.length, initialDeclaredBytes: initialBytes, duplicateReferences, dependencies: uniquePaths.map(p => ({ path: p, bytes: assets.get(p)?.bytes ?? null, kinds: [...assets.get(p).kinds] })) }, browserMeasurement: { status: 'NOT MEASURED', route: null, device: null, viewport: null, cache: null, networkBytes: null, transferRequests: null, lcpMs: null, notes: 'Populate from an actual browser performance capture; static analysis is not a measured transfer.' } };
});

// Duplicate module URLs referenced by the HTML. URL aliases and query revisions are kept explicit.
const moduleRefsInHtml = new Map();
for (const r of allHtmlRoutes) for (const s of r.scripts) if (s.local && /\.(?:mjs|js)$/i.test(s.local)) {
  const a = moduleRefsInHtml.get(s.local) || new Set(); a.add(r.route); moduleRefsInHtml.set(s.local, a);
}
const revisionGroups = new Map();
for (const f of walk(ROOT).filter(p => /\.(?:mjs|js)$/i.test(p))) {
  const text = read(f);
  for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+\.m?js(?:\?[^"']*)?)["']/g)) {
    const clean = stripQuery(m[1]), p = localPath(clean, f); if (!p) continue;
    const base = path.basename(p).replace(/-v?\d{8,}(?:-[\w-]+)?(?=\.)/g, '').replace(/\?[^?]*$/, '');
    if (!revisionGroups.has(base)) revisionGroups.set(base, new Map());
    const variants = revisionGroups.get(base); variants.set(rel(p), (variants.get(rel(p)) || new Set()).add(rel(f)));
  }
}
const revisionMismatches = [...revisionGroups.entries()].filter(([, variants]) => variants.size > 1).map(([module, variants]) => ({ module, variants: [...variants].map(([file, importers]) => ({ file, importers: [...importers] })) }));
const routeCounts = allHtmlRoutes.reduce((o, r) => (o[r.audience] = (o[r.audience] || 0) + 1, o), {});
const allSitemapFiles = new Set(allHtmlRoutes.filter(r => r.sitemap).map(r => r.route));
const sitemapUnmapped = [...sitemapRoutes].filter(r => !allSitemapFiles.has(r));
const missingSitemap = allHtmlRoutes.filter(r => !r.sitemap).map(r => r.route);
const totalUnique = [...new Set(allHtmlRoutes.flatMap(r => r.staticDependencies.dependencies.map(d => d.path)))];
const largest = [...assets.values()].sort((a,b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 30).map(a => ({ path:a.path, bytes:a.bytes, kinds:[...a.kinds], routes:a.references.size }));
const fonts = [...assets.values()].filter(a => /\.(?:woff2?|ttf|otf)$/i.test(a.path)).sort((a,b)=>(b.bytes||0)-(a.bytes||0)).map(a=>({path:a.path,bytes:a.bytes,routes:a.references.size}));
const screenshots = [...assets.values()].filter(a => /screenshot|preview|thumb|thumbnail/i.test(a.path) && IMAGE_EXT.test(a.path)).sort((a,b)=>(b.bytes||0)-(a.bytes||0)).map(a=>({path:a.path,bytes:a.bytes,routes:a.references.size}));
const report = {
  generatedAt: '2026-10-17',
  root: '.',
  methodology: { html: 'All .html/.htm files under repository root, excluding docs/, tests/, node_modules/, .git/, and .claude-tmp/.', route: 'index.html maps to its containing directory route; other HTML paths retain their filename.', sitemap: 'Exact normalized route membership in sitemap.xml; canonical aliases are reported independently.', static: 'Direct HTML declarations plus recursively discoverable CSS @import/url() and JS literal import/export/import() and new URL(..., import.meta.url) references. Dynamic/runtime requests, CSS media conditions, browser srcset selection, script execution, cookies, and cross-origin resource behavior are not measured.', bytes: 'Local file sizes in bytes (uncompressed on-disk source). Initial declared bytes sum distinct direct HTML script, stylesheet, image/media, and preload files only; they do not represent a browser waterfall or compressed transfer.', htmlImageDimensions: 'Intrinsic dimensions decoded from local PNG/JPEG/GIF/WebP/SVG headers; rendered width/height are the HTML attributes when declared.' },
  summary: { htmlRoutes: allHtmlRoutes.length, sitemapUrls: sitemapRoutes.size, routeCounts, sitemapUnmapped, htmlRoutesMissingFromSitemap: missingSitemap.length, htmlRoutesMissingFromSitemapList: missingSitemap, uniqueStaticDependencies: totalUnique.length, uniqueStaticDependencyBytes: totalUnique.reduce((n,p)=>n+(assets.get(p)?.bytes||0),0), revisionMismatches: revisionMismatches.length },
  sitemap: { file: 'sitemap.xml', manifest: 'manifest.webmanifest', manifestStartUrl: (()=>{try{return JSON.parse(read(path.join(ROOT,'manifest.webmanifest'))).start_url}catch{return null}})(), urls: [...sitemapRoutes] },
  largeFiles: largest,
  fonts,
  externalFonts: [...externalFonts.entries()].map(([url, routes])=>({url,routes:[...routes]})),
  screenshotLikeImages: screenshots,
  obviousModuleRevisionMismatches: revisionMismatches,
  routes: allHtmlRoutes.sort((a,b)=>a.route.localeCompare(b.route)),
  caveat: 'Static possible-dependency inventory only. Browser-measured data remains NOT MEASURED for every route until an actual browser capture is attached.'
};
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n');
const count = n => n.toLocaleString('en-US');
const md = [
  '# PiXiEED static route and asset inventory', '',
  `Generated ${report.generatedAt}. This is static source inspection, not a browser transfer measurement.`, '',
  `The scan found **${count(report.summary.htmlRoutes)} HTML routes** and **${count(report.summary.sitemapUrls)} sitemap URLs**. Route groups: ${Object.entries(routeCounts).map(([k,v])=>`${k} ${count(v)}`).join(', ')}. ${count(report.summary.htmlRoutesMissingFromSitemap)} HTML routes are absent from the sitemap; see the JSON list. The manifest start URL is \`${report.sitemap.manifestStartUrl}\`.`, '',
  `The HTML/CSS/JavaScript declarations reach ${count(report.summary.uniqueStaticDependencies)} distinct local files (${count(report.summary.uniqueStaticDependencyBytes)} on-disk bytes). Per-route direct declared bytes and recursive possible dependencies are in the JSON. Every route has an explicit **NOT MEASURED** browser data placeholder.`, '',
  '## Scope and interpretation', '',
  '- Includes all root HTML except docs/, tests/, node_modules/, .git/, and .claude-tmp/. Route paths map index.html to `/` or the containing directory.',
  '- Compares normalized sitemap membership and canonical aliases separately. Classification flags internal/test/admin/noindex, event, tool/product, content, and home/other routes.',
  '- Tracks direct scripts, stylesheets, preloads, images/media, HTML loading and dimensions, local file sizes, CSS imports and url() assets, and literal JS imports, re-exports, dynamic imports, and `new URL(..., import.meta.url)` assets.',
  '- Recursive dependency closure is a static possible-dependency over-approximation. It does not establish runtime execution or actual browser transfer. Conditional/dynamic/runtime requests, remote resources, compressed transfer sizes, browser cache, and srcset selection need browser capture.',
  '- Source dimensions are intrinsic local image dimensions where the format decoder supports them; declared HTML width/height are separate fields. Filesizes are uncompressed on-disk bytes. Initial-declared bytes exclude HTML images marked `loading="lazy"`.', '',
  '## Largest referenced local files', '',
  '| File | Bytes | Kinds | Routes referencing |', '|---|---:|---|---:|',
  ...largest.slice(0,15).map(x=>`| \`${x.path}\` | ${count(x.bytes||0)} | ${x.kinds.join(', ')} | ${count(x.routes)} |`), '',
  '## Fonts', '', ...(fonts.length ? fonts.map(x=>`- \`${x.path}\` — ${count(x.bytes||0)} bytes across ${count(x.routes)} route(s).`) : ['No locally referenced font files were found.']), ...(externalFonts.size ? [...externalFonts.entries()].map(([url, routes])=>`- External declaration: \`${url}\` across ${count(routes.size)} route(s); size unavailable to this local scanner.`) : []), '',
  '## Screenshot and preview assets', '', ...(screenshots.length ? screenshots.slice(0,20).map(x=>`- \`${x.path}\` — ${count(x.bytes||0)} bytes across ${count(x.routes)} route(s).`) : ['No screenshot-like local image references were found.']), '',
  '## Module revision mismatches', '', ...(revisionMismatches.length ? revisionMismatches.map(x=>`- **${x.module}:** ${x.variants.map(v=>`\`${v.file}\` (imported by ${v.importers.length} file(s))`).join('; ')}`) : ['No obvious same-basename versioned module import mismatches found.']), '',
  '## Browser-measured status', '',
  'All routes currently say `NOT MEASURED`. Fill those fields only from actual browser performance/network captures; the static sizes and dependency closure above cannot be presented as measured URLs, requests, or transfer bytes.', '',
  'Full route-level inventory and sitemap differences: [`route-inventory.json`](route-inventory.json).', ''
].join('\n');
fs.writeFileSync(OUT_MD, md);
console.log(`Wrote ${rel(OUT_JSON)} and ${rel(OUT_MD)}`);
console.log(JSON.stringify(report.summary, null, 2));
