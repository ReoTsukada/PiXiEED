#!/usr/bin/env node
/**
 * 公開画像投稿の静的SEOページと sitemap URLを生成する。
 * 通常のSNS導線は生成待ちを避けるため /post/?id=... のままにする。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteUrl = 'https://pixieed.jp';
const supabaseUrl = 'https://kyyiuakrqomzlikfaire.supabase.co';
const publishableKey = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const bucket = 'social-posts';
const templatePath = path.join(root, 'post', 'index.html');
const postsRoot = path.join(root, 'posts');
const sitemapPath = path.join(root, 'sitemap.xml');
const sitemapStart = '  <!-- social-seo-posts:start -->';
const sitemapEnd = '  <!-- social-seo-posts:end -->';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const escapeJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;
const oneLine = (value) => text(value).replace(/\s+/g, ' ');
const postUrl = (id) => `${siteUrl}/posts/${encodeURIComponent(id)}/`;
const mediaUrl = (objectPath) => `${supabaseUrl}/storage/v1/object/public/${bucket}/${String(objectPath || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;

function avatarUrl(value) {
  const raw = text(value);
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
  const id = raw.toLowerCase();
  if (/^jerin[1-8]$/.test(id)) return `/character-dots/Jerin${id.slice(5)}.png`;
  if (/^jellnall([1-9]|1[0-9])$/.test(id)) return `/character-dots/${id.toUpperCase()}.png`;
  if (id === 'baburin') return '/character-dots/baburinpng.png';
  return '/character-dots/maousama.png';
}

function replaceElement(html, id, content) {
  const pattern = new RegExp(`(<[^>]+\\bid="${id}"[^>]*>)([\\s\\S]*?)(</[^>]+>)`);
  if (!pattern.test(html)) throw new Error(`template element #${id} was not found`);
  return html.replace(pattern, `$1${content}$3`);
}

export function staticPage(template, post) {
  const creator = text(post.creator_display_name, 'PiXiEEDクリエイター');
  const title = text(post.title, `${creator}のドット絵`);
  const caption = text(post.caption);
  const description = oneLine(caption || `${creator}によるドット絵作品「${title}」。PiXiEEDで作品詳細を見られます。`).slice(0, 160);
  const url = postUrl(post.id);
  const image = mediaUrl(post.media_object_path);
  const tagValues = Array.isArray(post.tags) ? post.tags.map((tag) => text(tag)).filter(Boolean).slice(0, 5) : [];
  const isFree = post.distribution_mode === 'free';
  const publishedAt = text(post.published_at);
  const modifiedAt = text(post.updated_at, publishedAt);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: title,
    articleBody: caption || undefined,
    url,
    mainEntityOfPage: url,
    image: { '@type': 'ImageObject', contentUrl: image, name: title, caption: caption || title },
    author: { '@type': 'Person', name: creator },
    publisher: { '@type': 'Organization', name: 'PiXiEED', url: siteUrl, logo: `${siteUrl}/icon/icon-512-4.png` },
    datePublished: publishedAt || undefined,
    dateModified: modifiedAt || undefined,
    keywords: tagValues.length ? tagValues.join(', ') : undefined,
    isAccessibleForFree: isFree,
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: Math.max(0, Number(post.like_count) || 0) },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: Math.max(0, Number(post.comment_count) || 0) }
    ]
  };
  const tagMarkup = tagValues.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('');
  const distributionLabel = isFree ? '無料素材' : '作品公開のみ';
  const distributionNote = isFree
    ? (post.derivative_allowed ? '無料でダウンロードできます。派生作品の投稿も許可されています。' : '無料でダウンロードできます。')
    : 'この作品は閲覧用に公開されています。';
  const primaryAction = isFree ? `<a class="post-detail__primary" id="postPrimaryAction" href="${escapeHtml(image)}">無料ダウンロード</a>` : '<a class="post-detail__primary" id="postPrimaryAction" href="#" hidden></a>';

  let html = template
    .replace('<meta name="robots" content="noindex,follow">', `<meta name="robots" content="index,follow">\n  <meta name="description" content="${escapeHtml(description)}">\n  <link rel="canonical" href="${url}">\n  <meta property="og:type" content="article">\n  <meta property="og:site_name" content="PiXiEED">\n  <meta property="og:title" content="${escapeHtml(title)}">\n  <meta property="og:description" content="${escapeHtml(description)}">\n  <meta property="og:url" content="${url}">\n  <meta property="og:image" content="${escapeHtml(image)}">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:title" content="${escapeHtml(title)}">\n  <meta name="twitter:description" content="${escapeHtml(description)}">\n  <meta name="twitter:image" content="${escapeHtml(image)}">\n  <script type="application/ld+json">${escapeJson(structuredData)}</script>`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)} | PiXiEED</title>`)
    .replace('<body>', `<body data-social-post-id="${post.id}">`)
    .replace('<p class="post-detail__status" id="postStatus">作品を読み込んでいます。</p>', '<p class="post-detail__status" id="postStatus" hidden>作品を読み込んでいます。</p>')
    .replace('<article id="postContent" hidden>', '<article id="postContent">')
    .replace(/<img id="postAuthorAvatar"[^>]*>/, `<img id="postAuthorAvatar" src="${escapeHtml(avatarUrl(post.creator_avatar))}" alt="">`)
    .replace(/<img id="postImage"[^>]*>/, `<img id="postImage" src="${escapeHtml(image)}" alt="${escapeHtml(`${title} - ${creator}のドット絵`)}">`)
    .replace('<p class="post-detail__caption" id="postCaption" hidden></p>', caption
      ? `<p class="post-detail__caption" id="postCaption">${escapeHtml(caption)}</p>`
      : '<p class="post-detail__caption" id="postCaption" hidden></p>')
    .replace('<a class="post-detail__primary" id="postPrimaryAction" href="#" hidden></a>', primaryAction);
  html = replaceElement(html, 'postAuthorName', escapeHtml(creator));
  html = replaceElement(html, 'postTitle', escapeHtml(title));
  html = replaceElement(html, 'postTags', tagMarkup);
  html = html.replace('id="postTags" aria-label="作品タグ" hidden', `id="postTags" aria-label="作品タグ"${tagValues.length ? '' : ' hidden'}`);
  html = replaceElement(html, 'postLikeCount', Math.max(0, Number(post.like_count) || 0).toLocaleString('ja-JP'));
  html = replaceElement(html, 'postDistributionLabel', distributionLabel);
  html = replaceElement(html, 'postDistributionNote', distributionNote);
  html = replaceElement(html, 'postCommentCount', Math.max(0, Number(post.comment_count) || 0).toLocaleString('ja-JP'));
  if (post.comments_enabled === false) {
    html = html.replace('<form class="post-comments__form" id="postCommentForm">', '<form class="post-comments__form" id="postCommentForm" hidden>');
    html = replaceElement(html, 'postCommentNotice', 'この作品はコメントを受け付けていません。');
  }
  return html;
}

async function getPosts() {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/social_public_seo_catalog_v1`, {
    method: 'POST',
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!response.ok) throw new Error(`social_public_seo_catalog_v1 failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('social_public_seo_catalog_v1 did not return an array');
  return data.filter((post) => uuidPattern.test(String(post?.id || '')) && text(post?.media_object_path));
}

async function removeStalePostPages(activeIds) {
  const entries = await fs.readdir(postsRoot, { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error));
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && uuidPattern.test(entry.name) && !activeIds.has(entry.name))
    .map((entry) => fs.rm(path.join(postsRoot, entry.name), { recursive: true })));
}

async function updateSitemap(posts) {
  const sitemap = await fs.readFile(sitemapPath, 'utf8');
  const urls = posts.map((post) => `  <url>\n    <loc>${postUrl(post.id)}</loc>\n    <lastmod>${text(post.updated_at, post.published_at || new Date().toISOString()).slice(0, 10)}</lastmod>\n  </url>`).join('\n');
  const block = `${sitemapStart}\n${urls}\n${sitemapEnd}`;
  const pattern = new RegExp(`${sitemapStart}[\\s\\S]*?${sitemapEnd}`);
  const next = pattern.test(sitemap) ? sitemap.replace(pattern, block) : sitemap.replace('</urlset>', `${block}\n</urlset>`);
  await fs.writeFile(sitemapPath, next);
}

async function main() {
  const [template, posts] = await Promise.all([fs.readFile(templatePath, 'utf8'), getPosts()]);
  await fs.mkdir(postsRoot, { recursive: true });
  await Promise.all(posts.map(async (post) => {
    const directory = path.join(postsRoot, post.id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'index.html'), staticPage(template, post));
  }));
  await removeStalePostPages(new Set(posts.map((post) => post.id)));
  await updateSitemap(posts);
  console.log(`Generated ${posts.length} social SEO page(s) and updated sitemap.xml.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
