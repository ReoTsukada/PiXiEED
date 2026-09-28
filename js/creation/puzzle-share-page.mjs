const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE_ORIGIN = 'https://pixieed.jp';
const IMAGE_SIZES = new Set([16, 32, 64, 128, 256, 512]);

export class PuzzleSharePageError extends Error {
  constructor(code) { super(code); this.name = 'PuzzleSharePageError'; this.code = code; }
}

function reject(code) { throw new PuzzleSharePageError(code); }
function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function publicImageUrl(value, postId, supabaseUrl) {
  if (typeof value !== 'string' || value.length > 2048) reject('share_image_url_invalid');
  // Reject paths before URL parsing, which silently normalizes dot segments.
  if (typeof supabaseUrl !== 'string' || !/^https:\/\/[^/?#]+\/?$/i.test(supabaseUrl)) reject('share_config_invalid');
  const rawPath = value.match(/^https:\/\/[^/?#]+([^?#]*)/i)?.[1];
  if (!rawPath || /[%\\?#]/.test(value) || rawPath.split('/').some((part) => part === '.' || part === '..')) reject('share_image_url_invalid');
  let project; let image;
  try { project = new URL(supabaseUrl); image = new URL(value); } catch { reject('share_image_url_invalid'); }
  if (project.pathname !== '/' || project.username || project.password || project.search || project.hash) reject('share_config_invalid');
  if (project.protocol !== 'https:' || image.protocol !== 'https:' || image.origin !== project.origin
      || image.username || image.password || image.search || image.hash) reject('share_image_url_invalid');
  const match = rawPath.match(/^\/storage\/v1\/object\/public\/post-public\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([A-Za-z0-9_-]{1,128}\.png)$/i);
  if (!match || match[1].toLowerCase() !== postId.toLowerCase()) reject('share_image_url_invalid');
  return image.href;
}

/** Draw only the original picture into a landscape OGP canvas with integer pixel scaling. */
export function drawOriginalPuzzleOgp(ctx, image, { width = 1280, height = 720, padding = 8 } = {}) {
  const sourceWidth = image?.naturalWidth || image?.width;
  const sourceHeight = image?.naturalHeight || image?.height;
  if (!ctx || !image || ![width, height, padding, sourceWidth, sourceHeight].every(Number.isInteger)
      || width < 1 || height < 1 || padding < 0 || sourceWidth < 1 || sourceHeight < 1) reject('share_ogp_dimensions_invalid');
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const integerScale = Math.floor(Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight));
  if (innerWidth < 1 || innerHeight < 1 || integerScale < 1) reject('share_ogp_image_too_large');
  const drawWidth = sourceWidth * integerScale;
  const drawHeight = sourceHeight * integerScale;
  const left = Math.floor((width - drawWidth) / 2);
  const top = Math.floor((height - drawHeight) / 2);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, left, top, drawWidth, drawHeight);
  return { x: left, y: top, width: drawWidth, height: drawHeight, scale: integerScale };
}

/**
 * Build a crawler-readable page from the public-post-puzzle endpoint response.
 * Only public title/author and the original image are emitted. The answer
 * definition and changed image are deliberately not consulted or serialized.
 */
export function createPuzzleSharePage(payload, { postId, supabaseUrl } = {}) {
  if (typeof postId !== 'string' || !UUID.test(postId)) reject('share_post_id_invalid');
  if (typeof supabaseUrl !== 'string') reject('share_config_invalid');
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.puzzle)) reject('share_puzzle_unavailable');

  const puzzle = payload.puzzle;
  if (typeof puzzle.postId !== 'string' || puzzle.postId.toLowerCase() !== postId.toLowerCase()) reject('share_post_id_mismatch');
  if (!['spot_difference', 'hidden_object'].includes(puzzle.mode)) reject('share_mode_invalid');
  if (typeof puzzle.title !== 'string' || !puzzle.title.trim() || Array.from(puzzle.title.trim()).length > 60
      || /[\u0000-\u001f\u007f]/.test(puzzle.title)) reject('share_title_invalid');
  if (typeof puzzle.author !== 'string' || !puzzle.author.trim() || Array.from(puzzle.author.trim()).length > 80
      || /[\u0000-\u001f\u007f]/.test(puzzle.author)) reject('share_author_invalid');

  const width = puzzle.originalImage?.width;
  const height = puzzle.originalImage?.height;
  if (!IMAGE_SIZES.has(width) || !IMAGE_SIZES.has(height)) reject('share_image_dimensions_invalid');
  const originalUrl = publicImageUrl(puzzle.originalImage?.url, postId, supabaseUrl);
  const canonicalUrl = `${SITE_ORIGIN}/pixfind/puzzles/${postId.toLowerCase()}/`;
  const playUrl = `${SITE_ORIGIN}/pixfind/?postPuzzle=${postId.toLowerCase()}`;
  const title = `PiXiEED | ${puzzle.title.trim()}`;
  const description = puzzle.mode === 'hidden_object'
    ? '公開されたもの探しをPiXiEEDで遊ぼう。'
    : '公開されたまちがい探しをPiXiEEDで遊ぼう。';

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}"/>
  <meta name="author" content="${escapeHtml(puzzle.author.trim())}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${escapeHtml(title)}"/>
  <meta property="og:description" content="${escapeHtml(description)}"/>
  <meta property="og:image" content="${escapeHtml(originalUrl)}"/>
  <meta property="og:image:width" content="${width}"/>
  <meta property="og:image:height" content="${height}"/>
  <meta property="og:image:alt" content="公開パズルの元画像"/>
  <meta property="og:url" content="${canonicalUrl}"/>
  <meta property="og:site_name" content="PiXiEED"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escapeHtml(title)}"/>
  <meta name="twitter:description" content="${escapeHtml(description)}"/>
  <meta name="twitter:image" content="${escapeHtml(originalUrl)}"/>
  <link rel="canonical" href="${canonicalUrl}"/>
  <meta http-equiv="refresh" content="0; url=${playUrl}"/>
</head>
<body>
  <main><h1>${escapeHtml(puzzle.title.trim())}</h1><p>作者：${escapeHtml(puzzle.author.trim())}</p><a href="${playUrl}">この問題を遊ぶ</a></main>
  <script>window.location.replace(${JSON.stringify(playUrl)});</script>
</body>
</html>`;
}
