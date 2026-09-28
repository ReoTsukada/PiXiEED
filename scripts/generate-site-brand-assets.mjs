import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const images = [
  ['site', 'つくる・あそぶ・つながる', 'brand'],
  ['tools', '制作ツール', 'tools'],
  ['draw', 'ドット絵を描く', 'artwork'],
  ['audio', '音をつくる', 'music'],
  ['jigsaw', 'ジグソーパズル', 'jigsaw'],
  ['spot-difference', 'まちがい探し', 'spot-difference'],
  ['hidden-object', 'もの探し', 'hidden-object'],
  ['pixfind', 'ピクスファインド', 'tools'],
  ['game', 'ゲームをつくる', 'solar-system'],
  ['camera', 'ドットカメラ', 'camera'],
  ['telescope', '天体を見つける', 'telescope'],
];

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
  await page.screenshot({ path, type: 'png' });
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
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, title, iconName] of images) {
    const isBrand = iconName === 'brand';
    const iconData = isBrand
      ? `data:image/png;base64,${logo}`
      : toDataUri(await readFile(resolve(root, `assets/icons/pixieed/${iconName}.svg`), 'utf8'));
    await capture(page, ogMarkup(title, iconData, isBrand), resolve(outputDir, `${name}.png`), 1200, 630);
  }
  await capture(page, iconMarkup(96, 0), resolve(root, 'favicon-96.png'), 96, 96);
  await writePngIco(resolve(root, 'favicon-96.png'), resolve(root, 'favicon.ico'), 96, 96);
  await capture(page, iconMarkup(180, 18), resolve(root, 'apple-touch-icon.png'), 180, 180);
  await capture(page, iconMarkup(192, 24), resolve(root, 'assets/brand/app-icon-192.png'), 192, 192);
  await capture(page, iconMarkup(512, 64), resolve(root, 'assets/brand/app-icon-512.png'), 512, 512);

  for (const [file, width, height] of [
    ...images.map(([name]) => [resolve(outputDir, `${name}.png`), 1200, 630]),
    [resolve(root, 'favicon-96.png'), 96, 96],
    [resolve(root, 'apple-touch-icon.png'), 180, 180],
    [resolve(root, 'assets/brand/app-icon-192.png'), 192, 192],
    [resolve(root, 'assets/brand/app-icon-512.png'), 512, 512],
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
} finally {
  await browser.close();
}

console.log(`Generated ${images.length} OGP images, 4 app icons, and a validated PNG-backed favicon.ico in ${outputDir}`);
