import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { TOOL_OGP_CARDS, TOOL_OGP_EXTRA_ICONS, toolOgpMarkup } from './lib/tool-ogp-design.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try {
  const override = process.env.PIXIEED_PLAYWRIGHT_MODULE;
  const playwright = override
    ? await import(pathToFileURL(resolve(override)).href)
    : await import('playwright');
  chromium = playwright.chromium;
} catch (error) {
  if (process.env.PIXIEED_PLAYWRIGHT_MODULE) throw error;
  throw new Error('Playwright が見つからずPNGを再生成できません。PIXIEED_PLAYWRIGHT_MODULE に利用可能なPlaywright entry moduleの絶対パスを設定するか、Playwrightを含む環境でこのスクリプトを再実行してください。', { cause: error });
}
if (!chromium?.launch) throw new Error('指定されたPlaywright moduleにchromium.launchがありません。PIXIEED_PLAYWRIGHT_MODULEを確認してください。');
const outputDir = resolve(root, 'assets/og');
const logo = (await readFile(resolve(root, 'assets/brand/pixieed-logo-48.png'))).toString('base64');
const args = process.argv.slice(2);
const toolsOnly = args.includes('--tool-ogp-only');
const renderOutputDir = toolsOnly ? await mkdtemp(join(tmpdir(), 'pixieed-tool-ogp-')) : outputDir;
const reviewIndex = args.indexOf('--review-dir');
if (reviewIndex >= 0 && !args[reviewIndex + 1]) throw new Error('--review-dir requires a directory');
const reviewDir = reviewIndex >= 0 ? resolve(root, args[reviewIndex + 1]) : null;
const toolCards = new Map(TOOL_OGP_CARDS.map(card => [card.name, card]));

const images = [
  ['site', 'つくる・あそぶ・つながる', 'brand'],
  ['tools', '制作ツール', 'tools'],
  ['draw', 'ドット絵を描く', 'artwork'],
  ['audio', '音をつくる', 'music'],
  ['jigsaw', 'ジグソーパズル', 'jigsaw'],
  ['spot-difference', 'まちがい探し', 'spot-difference'],
  ['hidden-object', 'もの探し', 'hidden-object'],
  ['spot-game', 'ドット絵間違い探し', 'spot-difference'],
  ['find-game', 'ドット絵もの探し', 'hidden-object'],
  ['game', 'ゲームをつくる', 'solar-system'],
  ['camera', 'ドットカメラ', 'camera'],
  ['telescope', '天体を見つける', 'telescope'],
];
for (const card of TOOL_OGP_CARDS) {
  if (!images.some(([name]) => name === card.name)) images.push([card.name, '', card.icon]);
}
const selectedImages = toolsOnly ? images.filter(([name]) => toolCards.has(name)) : images;

const toDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function ogMarkup(title, iconData, isBrand = false) {
  const iconClass = isBrand ? 'tool-icon tool-icon--brand' : 'tool-icon';
  const cardClass = isBrand ? 'icon-card icon-card--brand' : 'icon-card';
  const miniLogo = isBrand ? '' : `<img class="mini-logo" src="data:image/png;base64,${logo}">`;
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}
    body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif;color:#172333;background:#f7f4ec}
    .frame{position:relative;width:1200px;height:630px;padding:72px 86px;background:
      radial-gradient(circle at 12px 12px,rgba(16,59,80,.09) 1.5px,transparent 1.7px) 0 0/24px 24px,#f7f4ec;}
    .frame:before{content:"";position:absolute;inset:28px;border:2px solid rgba(16,59,80,.14);border-radius:24px;pointer-events:none}
    .eyebrow{position:relative;display:flex;align-items:center;gap:14px;font:700 18px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#185d78}
    .eyebrow:before{content:"";width:28px;height:7px;background:#dd6a4d;box-shadow:8px 0 #e9bd55}
    .wordmark{position:relative;margin-top:54px;font:800 78px/.98 ui-monospace,monospace;letter-spacing:-.075em;color:#103b50}
    .wordmark b{color:#dd6a4d;font-weight:800}
    .title{position:relative;max-width:750px;margin-top:26px;font-size:38px;font-weight:750;letter-spacing:.035em;line-height:1.35}
    .rule{position:relative;width:150px;height:8px;margin-top:32px;background:#103b50;box-shadow:12px 0 #dd6a4d,24px 0 #e9bd55}
    .icon-card{position:absolute;right:105px;top:158px;display:grid;place-items:center;width:264px;height:264px;border:2px solid rgba(16,59,80,.18);border-radius:34px;background:#fffdf8;box-shadow:12px 12px 0 #e9bd55}
    .icon-card--brand{background:#103b50}
    .icon-card:before{content:"";position:absolute;inset:17px;border:1px dashed rgba(16,59,80,.22);border-radius:22px}
    .tool-icon{position:relative;width:150px;height:150px;image-rendering:pixelated}
    .tool-icon--brand{width:192px;height:192px;image-rendering:pixelated}
    .mini-logo{position:absolute;right:16px;bottom:14px;width:30px;height:30px;padding:4px;border-radius:50%;background:#103b50;image-rendering:pixelated}
  </style><body><main class="frame"><div class="eyebrow">PIXEL CREATION STUDIO</div><div class="wordmark">PiXi<b>EED</b></div><div class="title">${esc(title)}</div><div class="rule"></div><div class="${cardClass}"><img class="${iconClass}" src="${iconData}">${miniLogo}</div></main></body></html>`;
}

function iconMarkup(size, margin) {
  const inner = size - margin * 2;
  return `<!doctype html><html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:${size}px;height:${size}px}body{display:grid;place-items:center;background:#103b50}.tile{width:${size}px;height:${size}px;display:grid;place-items:center;background:#103b50}.tile img{width:${inner}px;height:${inner}px;image-rendering:pixelated;object-fit:contain}</style><body><div class="tile"><img src="data:image/png;base64,${logo}"></div></body></html>`;
}

async function capture(page, html, path, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  const bounds = await page.locator('[data-ogp-bound]').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect();
    return { name: element.getAttribute('data-ogp-bound'), x: r.x, y: r.y, right: r.right, bottom: r.bottom,
      overflow: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1 };
  }));
  for (const rect of bounds) {
    if (rect.x < 0 || rect.y < 0 || rect.right > width || rect.bottom > height || rect.overflow) {
      throw new Error(`OGP content exceeds its bounds: ${path}: ${JSON.stringify(rect)}`);
    }
  }
  // These areas carry separate content. In-bounds text can still collide.
  for (const [a, b] of [['brand', 'eyebrow'], ['title', 'tile'], ['title', 'description'],
    ['title', 'scene'], ['description', 'scene'], ['scene', 'tile'],
    ['scene', 'tile-label'], ['scene', 'action-name']]) {
    const first = bounds.find(rect => rect.name === a);
    const second = bounds.find(rect => rect.name === b);
    if (first && second && first.x < second.right && second.x < first.right
      && first.y < second.bottom && second.y < first.bottom) {
      throw new Error(`OGP content overlaps: ${path}: ${a} / ${b}`);
    }
  }
  const pixelGeometry = await page.locator('.pixel-cell').evaluateAll(elements => {
    const bad = [];
    const clipped = [];
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      const coordinates = [rect.x, rect.y, rect.width, rect.height];
      if (coordinates.some(value => Math.abs(value - Math.round(value)) > .01)
        || Math.abs(rect.width - rect.height) > .01 || rect.width < 1) {
        bad.push(coordinates);
      }
      const viewport = element.closest('svg')?.getBoundingClientRect();
      if (viewport && (rect.left < viewport.left - .01 || rect.top < viewport.top - .01
        || rect.right > viewport.right + .01 || rect.bottom > viewport.bottom + .01)) clipped.push(coordinates);
    }
    return { cells: elements.length, invalid: bad.slice(0, 5), clipped: clipped.slice(0, 5) };
  });
  if (pixelGeometry.invalid.length) throw new Error(`OGP pixel cells are not square/integer-aligned: ${path}: ${JSON.stringify(pixelGeometry)}`);
  if (pixelGeometry.clipped.length) throw new Error(`OGP pixel artwork is clipped: ${path}: ${JSON.stringify(pixelGeometry)}`);
  const illustrationGeometry = await page.locator('svg path,svg rect,svg circle,svg ellipse,svg polygon,svg polyline,svg line,svg use').evaluateAll(elements => {
    const visible = elements.filter(element => !element.closest('defs,clipPath,mask') && element.getBoundingClientRect().width > 0);
    const clipped = visible.filter(element => {
      const r = element.getBoundingClientRect();
      const viewport = element.closest('svg').getBoundingClientRect();
      return r.left < viewport.left - .01 || r.top < viewport.top - .01
        || r.right > viewport.right + .01 || r.bottom > viewport.bottom + .01;
    }).map(element => ({ tag: element.tagName, bounds: element.getBoundingClientRect().toJSON() }));
    return { shapes: visible.length, clipped: clipped.slice(0, 5) };
  });
  if (illustrationGeometry.clipped.length) throw new Error(`OGP illustration is clipped: ${path}: ${JSON.stringify(illustrationGeometry)}`);
  const textCollisions = await page.evaluate(() => {
    const graphics = [...document.querySelectorAll('svg path,svg rect,svg circle,svg ellipse,svg polygon,svg polyline,svg line,svg use')]
      .filter(element => !element.closest('defs,clipPath,mask')).map(element => element.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    const collisions = [];
    let text;
    while ((text = walker.nextNode())) {
      if (!text.textContent.trim() || text.parentElement.closest('style,script,title')) continue;
      const range = document.createRange(); range.selectNodeContents(text);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (graphics.some(graphic => rect.left < graphic.right && graphic.left < rect.right
        && rect.top < graphic.bottom && graphic.top < rect.bottom)) collisions.push(text.textContent.trim());
    }
    return collisions;
  });
  if (textCollisions.length) throw new Error(`OGP illustration overlaps text: ${path}: ${JSON.stringify(textCollisions)}`);
  await page.screenshot({ path, type: 'png' });
  return { bounds, pixelGeometry, illustrationGeometry };
}

async function writePngIco(pngPath, icoPath, width, height) {
  const png = await readFile(pngPath);
  const headerSize = 6;
  const entrySize = 16;
  const pngOffset = headerSize + entrySize;
  const ico = Buffer.alloc(pngOffset + png.length);
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // ICO resource type
  ico.writeUInt16LE(1, 4); // one image entry
  ico.writeUInt8(width < 256 ? width : 0, 6);
  ico.writeUInt8(height < 256 ? height : 0, 7);
  ico.writeUInt8(0, 8); // palette is not used for PNG payloads
  ico.writeUInt8(0, 9);
  ico.writeUInt16LE(1, 10); // planes
  ico.writeUInt16LE(32, 12); // bit depth
  ico.writeUInt32LE(png.length, 14);
  ico.writeUInt32LE(pngOffset, 18);
  png.copy(ico, pngOffset);
  await writeFile(icoPath, ico);

  const generated = await readFile(icoPath);
  const payloadOffset = generated.readUInt32LE(18);
  const payloadSize = generated.readUInt32LE(14);
  if (generated.readUInt16LE(0) !== 0 || generated.readUInt16LE(2) !== 1 || generated.readUInt16LE(4) !== 1
    || generated.readUInt8(6) !== width || generated.readUInt8(7) !== height
    || payloadOffset !== pngOffset || payloadSize !== png.length
    || !generated.subarray(payloadOffset, payloadOffset + payloadSize).equals(png)) {
    throw new Error(`ICO validation failed: ${icoPath}`);
  }
  if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw new Error(`ICO PNG payload dimensions mismatch: ${pngPath}`);
}

await mkdir(outputDir, { recursive: true });
if (reviewDir) await mkdir(reviewDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const verification = [];
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  for (const [name, title, legacyIcon] of selectedImages) {
    const card = toolCards.get(name);
    const iconName = card?.icon || legacyIcon;
    const isBrand = iconName === 'brand';
    const iconData = isBrand
      ? `data:image/png;base64,${logo}`
      : toDataUri(TOOL_OGP_EXTRA_ICONS[iconName] || await readFile(resolve(root, `assets/icons/pixieed/${iconName}.svg`), 'utf8'));
    const html = card ? toolOgpMarkup(card, { logoData: `data:image/png;base64,${logo}`, iconData }) : ogMarkup(title, iconData, isBrand);
    const { bounds, pixelGeometry, illustrationGeometry } = await capture(page, html, resolve(renderOutputDir, `${name}.png`), 1200, 630);
    const png = await readFile(resolve(renderOutputDir, `${name}.png`));
    verification.push({ name, dimensions: [png.readUInt32BE(16), png.readUInt32BE(20)],
      sha256: createHash('sha256').update(png).digest('hex'), bounds, pixelGeometry, illustrationGeometry });
    if (reviewDir && card) {
      await writeFile(resolve(reviewDir, `${name}.html`), html);
      await writeFile(resolve(reviewDir, `${name}.png`), png);
    }
  }
  if (!toolsOnly) {
  await capture(page, iconMarkup(96, 0), resolve(root, 'favicon-96.png'), 96, 96);
  await writePngIco(resolve(root, 'favicon-96.png'), resolve(root, 'favicon.ico'), 96, 96);
  await capture(page, iconMarkup(180, 18), resolve(root, 'apple-touch-icon.png'), 180, 180);
  await capture(page, iconMarkup(192, 24), resolve(root, 'assets/brand/app-icon-192.png'), 192, 192);
  await capture(page, iconMarkup(512, 64), resolve(root, 'assets/brand/app-icon-512.png'), 512, 512);
  }

  for (const [file, width, height] of [
    ...selectedImages.map(([name]) => [resolve(renderOutputDir, `${name}.png`), 1200, 630]),
    ...(!toolsOnly ? [
    [resolve(root, 'favicon-96.png'), 96, 96],
    [resolve(root, 'apple-touch-icon.png'), 180, 180],
    [resolve(root, 'assets/brand/app-icon-192.png'), 192, 192],
    [resolve(root, 'assets/brand/app-icon-512.png'), 512, 512],
    ] : []),
  ]) {
    const bytes = await readFile(file);
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG signature: ${file}`);
    const actualWidth = bytes.readUInt32BE(16);
    const actualHeight = bytes.readUInt32BE(20);
    if (actualWidth !== width || actualHeight !== height) throw new Error(`Unexpected PNG dimensions: ${file}`);
    await page.setContent(`<img src="data:image/png;base64,${bytes.toString('base64')}">`, { waitUntil: 'load' });
    const dimensions = await page.locator('img').evaluate(async (image) => {
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
    if (dimensions[0] !== width || dimensions[1] !== height) throw new Error(`PNG decode failed: ${file}`);
  }
  // Replace working files only after every requested card validates.
  if (toolsOnly) {
    for (const [name] of selectedImages) await writeFile(resolve(outputDir, `${name}.png`), await readFile(resolve(renderOutputDir, `${name}.png`)));
  }
  if (reviewDir) {
    const sources = {};
    for (const source of ['scripts/lib/tool-ogp-design.mjs', 'scripts/generate-site-brand-assets.mjs']) {
      sources[source] = createHash('sha256').update(await readFile(resolve(root, source))).digest('hex');
    }
    await writeFile(resolve(reviewDir, 'verification.json'), JSON.stringify({ size: [1200, 630], externalRequests: 'blocked', sources, cards: verification }, null, 2) + '\n');
    const previews = [];
    for (const card of TOOL_OGP_CARDS) {
      const bytes = await readFile(resolve(outputDir, `${card.name}.png`));
      previews.push(`<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt="${esc(card.alt || card.name)}"><figcaption>${esc(card.name)}</figcaption></figure>`);
      for (const width of [600, 300]) {
        await page.setViewportSize({ width, height: Math.ceil(width * 630 / 1200) });
        await page.setContent(`<style>body{margin:0}img{display:block;width:${width}px;height:auto}</style><img src="data:image/png;base64,${bytes.toString('base64')}">`, { waitUntil: 'load' });
        await page.locator('img').evaluate(image => image.decode());
        await page.screenshot({ path: resolve(reviewDir, `${card.name}-${width}.png`), type: 'png' });
      }
    }
    await writeFile(resolve(reviewDir, 'index.html'), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PiXiEED ツールOGP一覧</title><style>body{margin:0;padding:24px;background:#e8edf0;font:16px system-ui,sans-serif}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;max-width:1240px;margin:auto}figure{margin:0}img{display:block;width:100%;height:auto}figcaption{padding:6px;font-weight:700}@media(max-width:680px){main{grid-template-columns:1fr}}h1{max-width:1240px;margin:0 auto 20px;font-size:24px}</style><h1>PiXiEED ツールOGP一覧</h1><main>${previews.join('')}</main></html>`);
    await page.setViewportSize({ width: 1200, height: 1735 });
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#dde4e6;font:600 16px sans-serif}main{display:grid;grid-template-columns:600px 600px}figure{margin:0;height:347px;display:flex;flex-direction:column}figcaption{height:32px;padding:6px 12px;order:-1}img{display:block;width:600px;height:315px}</style><main>${previews.join('')}</main>`, { waitUntil: 'load' });
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(reviewDir, 'overview-600.png'), type: 'png' });
    await page.setViewportSize({ width: 1500, height: 376 });
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#dde4e6;font:600 14px sans-serif}main{display:grid;grid-template-columns:repeat(5,300px)}figure{margin:0;height:188px;display:flex;flex-direction:column}figcaption{height:30px;padding:6px 12px;order:-1}img{display:block;width:300px;height:157.5px}</style><main>${previews.join('')}</main>`, { waitUntil: 'load' });
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(reviewDir, 'overview-300.png'), type: 'png' });
  }
} finally {
  await browser.close();
  if (toolsOnly) await rm(renderOutputDir, { recursive: true, force: true });
}

console.log(`Generated ${selectedImages.length} OGP images${toolsOnly ? ' (app icons unchanged)' : ', 4 app icons and a validated PNG-backed favicon.ico'} in ${outputDir}`);
