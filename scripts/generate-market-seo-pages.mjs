#!/usr/bin/env node
/**
 * 公開済みPiXiEEDマーケット商品の静的SEOページと sitemap の商品URLを生成する。
 * GitHub Pages はSSRできないため、公開・更新後（DB migration適用後）に実行して生成物をコミットする。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteUrl = 'https://pixieed.jp';
const supabaseUrl = 'https://kyyiuakrqomzlikfaire.supabase.co';
const anonKey = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const itemTemplatePath = path.join(root, 'market/item.html');
const itemsRoot = path.join(root, 'market/items');
const shareFramePath = path.join(root, 'PiXiEEDMarket.png');
const sitemapPath = path.join(root, 'sitemap.xml');
const sitemapStart = '  <!-- market-seo-items:start -->';
const sitemapEnd = '  <!-- market-seo-items:end -->';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const escapeJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;
const attributeText = (value) => text(value).replace(/\s+/g, ' ');
const itemUrl = (id) => `${siteUrl}/market/items/${encodeURIComponent(id)}/`;
const yen = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;
const fallbackShareImageUrl = `${siteUrl}/PiXiEEDogp.png`;
const publicPreviewEndpoint = `${supabaseUrl}/functions/v1/market-public-preview`;
const previewMaxIds = 120;
const shareRibbonPolygon = [[0.146, 0.059], [0.333, 0.059], [0.031, 0.372], [0.031, 0.21]];

function formats(asset) {
  const values = Array.isArray(asset.included_formats) && asset.included_formats.length
    ? asset.included_formats : [asset.asset_format];
  const labels = { 'pixiedraw-project': 'PiXiEEDraw', png: 'PNG', webp: 'WebP', gif: 'GIF', apng: 'APNG', 'sprite-sheet-png': 'PNGスプライトシート' };
  return values.filter(Boolean).map((value) => labels[value] || value).join(' / ') || '画像素材';
}

function isSoldOut(asset) {
  const quantity = Number(asset.limited_quantity);
  return Number.isInteger(quantity) && quantity > 0 && Number(asset.limited_sold_count || 0) >= quantity;
}

function replaceElement(html, id, content) {
  const pattern = new RegExp(`(<[^>]+\\bid="${id}"[^>]*>)([\\s\\S]*?)(</[^>]+>)`);
  if (!pattern.test(html)) throw new Error(`template element #${id} was not found`);
  return html.replace(pattern, `$1${content}$3`);
}

function staticPage(template, asset, { ogImageUrl }) {
  const title = text(asset.title, 'PiXiEEDマーケット素材');
  const description = text(asset.description, `${title}のドット絵素材。形式と利用条件をPiXiEEDマーケットで確認できます。`);
  const metaTitle = attributeText(title);
  const metaDescription = attributeText(description);
  const format = formats(asset);
  const soldOut = isSoldOut(asset);
  const series = asset.series || {};
  const url = itemUrl(asset.id);
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description,
    url,
    category: `ドット絵素材 / ${format}`,
    brand: { '@type': 'Brand', name: 'PiXiEED' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'JPY',
      price: String(Math.max(0, Number(asset.sale_price_yen || 0))),
      availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };
  let html = template
    // 商品詳細は /market/items/{id}/ に出力するため、サイト直下の
    // assets/site/scripts は market/ を越えて 3 階層戻る必要がある。
    .replace(/(href|src)="\.\.\/(assets|site|scripts)\//g, '$1="../../../$2/')
    .replace('href="index.html"', 'href="../../index.html"')
    .replace('href="./"', 'href="../../"')
    .replace(/(href|src)="(market\.css|favorites\.js|market-ads\.js|pageview-rewards\.js|item\.js|media-protection\.js|help-tips\.js)/g, '$1="../../$2')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(metaTitle)} | PiXiEEDマーケット</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(metaDescription)}">`)
    .replace('<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">')
    .replace('  <link rel="icon"', `  <link rel="canonical" href="${url}">\n  <meta property="og:type" content="product">\n  <meta property="og:site_name" content="PiXiEEDマーケット">\n  <meta property="og:title" content="${escapeHtml(metaTitle)}">\n  <meta property="og:description" content="${escapeHtml(metaDescription)}">\n  <meta property="og:url" content="${url}">\n  <meta property="og:image" content="${ogImageUrl}">\n  <meta property="og:image:width" content="1536">\n  <meta property="og:image:height" content="1024">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:title" content="${escapeHtml(metaTitle)}">\n  <meta name="twitter:description" content="${escapeHtml(metaDescription)}">\n  <meta name="twitter:image" content="${ogImageUrl}">\n  <script type="application/ld+json">${escapeJson(product)}</script>\n  <script id="marketSeoAsset" type="application/json">${escapeJson(asset)}</script>\n  <link rel="icon"`)
    .replace('<article class="market-item" id="itemContent" hidden>', '<article class="market-item" id="itemContent">')
    .replace('<p class="market-sell-status" id="itemStatus" aria-live="polite">商品を読み込んでいます</p>', '<p class="market-sell-status" id="itemStatus" aria-live="polite" hidden>商品を読み込んでいます</p>');
  html = replaceElement(html, 'itemTitle', escapeHtml(title));
  html = replaceElement(html, 'itemDescription', escapeHtml(description));
  html = replaceElement(html, 'itemPrice', escapeHtml(yen(asset.sale_price_yen)));
  html = replaceElement(html, 'itemFormats', escapeHtml(format));
  html = replaceElement(html, 'itemProductType', escapeHtml(format.includes('PiXiEEDraw') ? 'PiXiEEDraw作品（編集用プロジェクト入り）' : '一般素材（画像・アニメーション）'));
  html = replaceElement(html, 'itemAuthor', `作者: ${escapeHtml(text(asset.creator_display_name, 'PiXiEEDクリエイター'))}`);
  html = replaceElement(html, 'itemDerivative', series.derivative_sales_allowed
    ? 'OK（改変した素材を独立商品として再販売可能・系列ロイヤリティーあり）'
    : 'NG（利用・改変できる範囲でも、素材または改変素材として再販売できません）');
  html = replaceElement(html, 'itemAvailability', soldOut ? '売り切れ' : '販売中');
  return html;
}

async function getAssets() {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/market_public_seo_catalog_v1`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!response.ok) throw new Error(`market_public_seo_catalog_v1 failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('market_public_seo_catalog_v1 did not return an array');
  return data.filter((asset) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(asset?.id || '')));
}

async function updateSitemap(assets) {
  const sitemap = await fs.readFile(sitemapPath, 'utf8');
  const urls = assets.map((asset) => `  <url>\n    <loc>${itemUrl(asset.id)}</loc>\n    <lastmod>${String(asset.published_at || new Date().toISOString()).slice(0, 10)}</lastmod>\n  </url>`).join('\n');
  const block = `${sitemapStart}\n${urls}\n${sitemapEnd}`;
  const pattern = new RegExp(`${sitemapStart}[\\s\\S]*?${sitemapEnd}`);
  const next = pattern.test(sitemap) ? sitemap.replace(pattern, block) : sitemap.replace('</urlset>', `${block}\n</urlset>`);
  await fs.writeFile(sitemapPath, next);
}

async function getPreviewUrls(assetIds) {
  const previews = {};
  for (let index = 0; index < assetIds.length; index += previewMaxIds) {
    const response = await fetch(publicPreviewEndpoint, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_ids: assetIds.slice(index, index + previewMaxIds) })
    });
    if (!response.ok) throw new Error(`market-public-preview failed: ${response.status} ${await response.text()}`);
    const data = await response.json();
    Object.assign(previews, data?.previews || {});
  }
  return previews;
}

function isInsidePolygon(x, y, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    if ((currentY > y) !== (previousY > y) && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) inside = !inside;
  }
  return inside;
}

async function shareFrameForeground() {
  const { data, info } = await sharp(shareFramePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ribbon = shareRibbonPolygon.map(([x, y]) => [x * info.width, y * info.height]);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const isBlack = data[offset] < 14 && data[offset + 1] < 14 && data[offset + 2] < 14;
      // 黒い台紙だけを透明化し、リボン上の黒文字は残す。
      if (isBlack && !isInsidePolygon(x, y, ribbon)) data[offset + 3] = 0;
    }
  }
  return {
    width: info.width,
    height: info.height,
    image: await sharp(data, { raw: info }).png().toBuffer()
  };
}

async function writeShareImage(directory, previewUrl, frame) {
  if (!previewUrl) return null;
  const response = await fetch(previewUrl);
  if (!response.ok) throw new Error(`preview download failed: ${response.status}`);
  const preview = Buffer.from(await response.arrayBuffer());
  const previewMeta = await sharp(preview).metadata();
  if (!previewMeta.width || !previewMeta.height) throw new Error('share image dimensions are unavailable');

  // 内枠を最大限使い、リボンと枠線は前面の台紙で保護する。
  const bounds = {
    left: Math.round(frame.width * 0.09), top: Math.round(frame.height * 0.12),
    width: Math.round(frame.width * 0.82), height: Math.round(frame.height * 0.76)
  };
  const scale = Math.min(bounds.width / previewMeta.width, bounds.height / previewMeta.height);
  const width = Math.max(1, Math.round(previewMeta.width * scale));
  const height = Math.max(1, Math.round(previewMeta.height * scale));
  const image = await sharp(preview).resize(width, height, { kernel: sharp.kernel.nearest }).png().toBuffer();
  await sharp({ create: { width: frame.width, height: frame.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: image, left: bounds.left + Math.round((bounds.width - width) / 2), top: bounds.top + Math.round((bounds.height - height) / 2) },
      { input: frame.image }
    ])
    .png()
    .toFile(path.join(directory, 'share.png'));
  return 'share.png';
}

async function main() {
  const [template, assets] = await Promise.all([fs.readFile(itemTemplatePath, 'utf8'), getAssets()]);
  const previews = await getPreviewUrls(assets.map((asset) => asset.id));
  const frame = await shareFrameForeground();
  await fs.mkdir(itemsRoot, { recursive: true });
  await Promise.all(assets.map(async (asset) => {
    const directory = path.join(itemsRoot, asset.id);
    await fs.mkdir(directory, { recursive: true });
    let previewImagePath = null;
    try {
      previewImagePath = await writeShareImage(directory, previews[asset.id], frame);
    } catch (error) {
      console.warn(`Could not generate a share image for ${asset.id}: ${error.message}`);
    }
    const ogImageUrl = previewImagePath ? `${itemUrl(asset.id)}${previewImagePath}` : fallbackShareImageUrl;
    await fs.writeFile(path.join(directory, 'index.html'), staticPage(template, asset, { ogImageUrl }));
  }));
  await updateSitemap(assets);
  console.log(`Generated ${assets.length} market SEO page(s) and updated sitemap.xml.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
