#!/usr/bin/env node
/**
 * 公開済みPiXiEEDマーケット商品の静的SEOページと sitemap の商品URLを生成する。
 * GitHub Pages はSSRできないため、公開・更新後（DB migration適用後）に実行して生成物をコミットする。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteUrl = 'https://pixieed.jp';
const supabaseUrl = 'https://kyyiuakrqomzlikfaire.supabase.co';
const anonKey = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const itemTemplatePath = path.join(root, 'market/item.html');
const itemsRoot = path.join(root, 'market/items');
const sitemapPath = path.join(root, 'sitemap.xml');
const sitemapStart = '  <!-- market-seo-items:start -->';
const sitemapEnd = '  <!-- market-seo-items:end -->';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const escapeJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;
const itemUrl = (id) => `${siteUrl}/market/items/${encodeURIComponent(id)}/`;
const yen = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;

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

function staticPage(template, asset) {
  const title = text(asset.title, 'PiXiEEDマーケット素材');
  const description = text(asset.description, `${title}のドット絵素材。形式と利用条件をPiXiEEDマーケットで確認できます。`);
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
    .replaceAll('../', '../../')
    .replace('href="index.html"', 'href="../../index.html"')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)} | PiXiEEDマーケット</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`)
    .replace('<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">')
    .replace('  <link rel="icon"', `  <link rel="canonical" href="${url}">\n  <script type="application/ld+json">${escapeJson(product)}</script>\n  <script id="marketSeoAsset" type="application/json">${escapeJson(asset)}</script>\n  <link rel="icon"`)
    .replace('<article class="market-item" id="itemContent" hidden>', '<article class="market-item" id="itemContent">')
    .replace('<p class="market-sell-status" id="itemStatus" aria-live="polite">商品を読み込んでいます</p>', '<p class="market-sell-status" id="itemStatus" aria-live="polite" hidden>商品を読み込んでいます</p>');
  html = replaceElement(html, 'itemTitle', escapeHtml(title));
  html = replaceElement(html, 'itemDescription', escapeHtml(description));
  html = replaceElement(html, 'itemPrice', escapeHtml(yen(asset.sale_price_yen)));
  html = replaceElement(html, 'itemBasePrice', escapeHtml(yen(Math.max(0, Number(asset.sale_price_yen || 0) - Number(series.required_option_price_yen || 0)))));
  html = replaceElement(html, 'itemOptionPrice', escapeHtml(yen(series.required_option_price_yen)));
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

async function main() {
  const [template, assets] = await Promise.all([fs.readFile(itemTemplatePath, 'utf8'), getAssets()]);
  await fs.mkdir(itemsRoot, { recursive: true });
  await Promise.all(assets.map(async (asset) => {
    const directory = path.join(itemsRoot, asset.id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'index.html'), staticPage(template, asset));
  }));
  await updateSitemap(assets);
  console.log(`Generated ${assets.length} market SEO page(s) and updated sitemap.xml.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
