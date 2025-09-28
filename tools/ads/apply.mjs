#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const vendorsDir = path.join(projectRoot, 'ads', 'adsets', 'vendors');
const outputDir = path.join(projectRoot, 'ads', 'adsets', 'active');
const outputFile = path.join(outputDir, 'config.json');

const POSIX_PREFIX = 'ads/adsets/vendors';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const DEFAULT_IMAGE_NAMES = ['ogp.png', 'ogp.jpg', 'ogp.jpeg', 'ogp.webp', 'banner.png', 'banner.jpg'];
function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function resolveImagePath(vendor, imagePath) {
  if (!imagePath) return undefined;
  const trimmed = imagePath.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const posixPath = toPosix(trimmed);
  if (posixPath.startsWith('ads/')) return posixPath;
  return toPosix(path.posix.join(`${POSIX_PREFIX}/${vendor}`, posixPath));
}

function normalizeString(value) {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

const ogCache = new Map();

async function fetchOgpMetadata(url) {
  if (!url) return {};
  if (ogCache.has(url)) return ogCache.get(url);
  let result = {};
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PiXiEED-AdBot/1.0)'
      }
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const finalUrl = response.url || url;
    const html = await response.text();
    result = parseOgpFromHtml(html, finalUrl);
  } catch (error) {
    console.warn(`[ads] Failed to fetch OGP for ${url}: ${(error && error.message) || error}`);
    result = {};
  }
  ogCache.set(url, result);
  return result;
}

function parseOgpFromHtml(html, baseUrl) {
  const meta = {};
  const regex1 = /<meta\s+[^>]*(?:property|name)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
  const regex2 = /<meta\s+[^>]*content\s*=\s*["']([^"']*)["'][^>]*(?:property|name)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex1.exec(html))) {
    const key = match[1].toLowerCase();
    if (!meta[key]) meta[key] = match[2].trim();
  }
  while ((match = regex2.exec(html))) {
    const key = match[2].toLowerCase();
    if (!meta[key]) meta[key] = match[1].trim();
  }
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1].trim()) {
    meta['page:title'] = titleMatch[1].trim();
  }

  let image = meta['og:image'] || meta['twitter:image'];
  if (image) {
    try {
      image = new URL(image, baseUrl).toString();
    } catch (_) {
      // Leave as-is if it cannot be resolved
    }
  }

  let siteName = meta['og:site_name'];
  try {
    if (!siteName) siteName = new URL(baseUrl).hostname;
  } catch (_) {
    // ignore
  }

  return {
    title: meta['og:title'] || meta['twitter:title'] || meta['title'] || meta['page:title'] || null,
    description: meta['og:description'] || meta['twitter:description'] || meta['description'] || null,
    image: image || null,
    siteName: siteName || null
  };
}

async function enrichHero(entry) {
  const og = await fetchOgpMetadata(entry.sourceUrl);
  entry.title = entry.title || og.title || og.siteName || entry.link;
  entry.description = entry.description || og.description || '';
  entry.image = entry.image || og.image;
  entry.tag = entry.tag || og.siteName || 'スポンサー';
  entry.alt = entry.alt || entry.title || entry.tag || entry.link;
  if (!entry.image) {
    console.warn(`[ads] Skipping hero ad for vendor ${entry.vendor}: no image found.`);
    return null;
  }
  delete entry.sourceUrl;
  return entry;
}

async function enrichShowcase(entry) {
  const og = await fetchOgpMetadata(entry.sourceUrl);
  entry.title = entry.title || og.title || entry.link;
  entry.description = entry.description || og.description || '';
  entry.image = entry.image || og.image;
  entry.badge = entry.badge || og.siteName || 'Sponsor';
  entry.alt = entry.alt || entry.title || entry.badge || entry.link;
  if (!entry.image) {
    console.warn(`[ads] Skipping showcase ad for vendor ${entry.vendor}: no image found.`);
    return null;
  }
  delete entry.sourceUrl;
  return entry;
}

async function enrichFooter(entry) {
  const og = await fetchOgpMetadata(entry.sourceUrl);
  entry.label = entry.label || og.title || og.siteName || entry.link;
  entry.image = entry.image || og.image;
  entry.alt = entry.alt || entry.label || entry.link;
  delete entry.sourceUrl;
  return entry;
}

function parseInfoFile(content) {
  const lines = content.split(/\r?\n/);
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!key) continue;
    result[key.trim()] = rest.join('=').trim();
  }
  return result;
}

async function readInfoFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parseInfoFile(content);
  } catch (_) {
    return null;
  }
}

function normalizeBaseEntry(data, vendor) {
  if (!data || typeof data !== 'object') return null;
  const sourceUrl = normalizeString(data.url || data.link);
  if (!sourceUrl) return null;
  const priorityValue = normalizeString(data.priority);
  const parsedPriority = priorityValue !== undefined ? Number(priorityValue) : NaN;
  return {
    sourceUrl,
    priority: Number.isFinite(parsedPriority) ? parsedPriority : 100,
    title: normalizeString(data.title),
    description: normalizeString(data.description),
    link: normalizeString(data.link),
    image: resolveImagePath(vendor, data.image),
    alt: normalizeString(data.alt),
    vendor
  };
}

async function findOverrideImage(vendor, vendorPath, currentImage) {
  if (currentImage) return currentImage;
  const entries = await fs.readdir(vendorPath, { withFileTypes: true }).catch(() => []);
  const byName = new Map(entries.filter(e => e.isFile()).map(e => [e.name, e]));
  for (const name of DEFAULT_IMAGE_NAMES) {
    if (byName.has(name)) {
      return resolveImagePath(vendor, name);
    }
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      return resolveImagePath(vendor, entry.name);
    }
  }
  return undefined;
}

async function readVendorEntry(vendor) {
  const vendorPath = path.join(vendorsDir, vendor);
  const configPath = path.join(vendorPath, 'config.json');

  async function entryFromData(data) {
    const base = normalizeBaseEntry(data, vendor);
    if (!base) return null;
    base.image = await findOverrideImage(vendor, vendorPath, base.image);
    return base;
  }

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const json = JSON.parse(raw);
    const entry = await entryFromData(json);
    if (entry) return entry;
  } catch (_) {
    // ignore
  }

  const info = await readInfoFile(path.join(vendorPath, 'ogp.txt')) || await readInfoFile(path.join(vendorPath, 'info.txt'));
  if (info) {
    const entry = await entryFromData(info);
    if (entry) return entry;
  }

  return null;
}

function compact(entry) {
  if (!entry) return null;
  const { priority, vendor, index, sourceUrl, ...rest } = entry;
  const output = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== '') {
      output[key] = value;
    }
  }
  return Object.keys(output).length ? output : null;
}

async function buildConfig() {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(vendorsDir, { recursive: true });

  const dirents = await fs.readdir(vendorsDir, { withFileTypes: true }).catch(() => []);
  const vendors = dirents.filter(d => d.isDirectory()).map(d => d.name).sort();

  const heroPromises = [];
  const showcasePromises = [];
  const footerPromises = [];

  for (const vendor of vendors) {
    const baseEntry = await readVendorEntry(vendor);
    if (!baseEntry) {
      console.warn(`[ads] Skipping vendor '${vendor}': missing or invalid ogp.txt`);
      continue;
    }

    const heroBase = { ...baseEntry, index: heroPromises.length };
    const showcaseBase = { ...baseEntry, index: showcasePromises.length };
    const footerBase = { ...baseEntry, index: footerPromises.length };

    heroPromises.push(enrichHero(heroBase));
    showcasePromises.push(enrichShowcase(showcaseBase));
    footerPromises.push(enrichFooter(footerBase));
  }

  const heroEntries = (await Promise.all(heroPromises)).filter(Boolean);
  const showcaseEntries = (await Promise.all(showcasePromises)).filter(Boolean);
  const footerEntries = (await Promise.all(footerPromises)).filter(Boolean);

  const sortByPriority = (a, b) => {
    if (a.priority === b.priority) {
      if (a.vendor === b.vendor) return (a.index || 0) - (b.index || 0);
      return a.vendor.localeCompare(b.vendor);
    }
    return a.priority - b.priority;
  };

  heroEntries.sort(sortByPriority);
  footerEntries.sort(sortByPriority);
  showcaseEntries.sort(sortByPriority);

  const aggregated = {
    hero: heroEntries.slice(0, 3).map(compact).filter(Boolean),
    showcase: compact(showcaseEntries[0] || null),
    footer: footerEntries.slice(0, 3).map(compact).filter(Boolean)
  };

  await fs.writeFile(outputFile, `${JSON.stringify(aggregated, null, 2)}\n`, 'utf8');

  console.log('[ads] Aggregated configuration written to ads/adsets/active/config.json');
  console.log(`       Vendors processed: ${vendors.length}`);
  console.log(`       Hero entries: ${aggregated.hero.length}`);
  console.log(`       Showcase entry: ${aggregated.showcase ? 'yes' : 'no'}`);
  console.log(`       Footer entries: ${aggregated.footer.length}`);
}

buildConfig().catch(error => {
  console.error('[ads] Failed to build configuration:', error);
  process.exitCode = 1;
});
