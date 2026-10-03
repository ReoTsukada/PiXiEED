const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE_ORIGIN = 'https://pixieed.jp';
const SPOT_OGP = Object.freeze({ width: 1200, height: 630, padding: 12, gap: 16, background: '#f7f8f6' });

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

/** Shared deterministic integer-scale geometry for browser and server OGP renderers. */
export function spotDifferenceOgpLayout(sourceWidth, sourceHeight, { width = 1200, height = 630, padding = 12, gap = 16 } = {}) {
  if (![sourceWidth, sourceHeight, width, height, padding, gap].every(Number.isInteger)
      || sourceWidth < 1 || sourceHeight < 1 || sourceWidth > 512 || sourceHeight > 512
      || width < 1 || height < 1 || padding < 0 || gap < 0) reject('share_ogp_dimensions_invalid');
  const usableWidth = width - padding * 2 - gap;
  const usableHeight = height - padding * 2;
  const scale = Math.floor(Math.min(usableWidth / (sourceWidth * 2), usableHeight / sourceHeight));
  if (scale < 1) reject('share_ogp_image_too_large');
  const imageWidth = sourceWidth * scale;
  const imageHeight = sourceHeight * scale;
  const pairWidth = imageWidth * 2 + gap;
  const x = Math.floor((width - pairWidth) / 2);
  const y = Math.floor((height - imageHeight) / 2);
  return {
    width, height, padding, gap, scale,
    original: { x, y, width: imageWidth, height: imageHeight },
    changed: { x: x + imageWidth + gap, y, width: imageWidth, height: imageHeight },
  };
}

/** Draw the original and changed images side by side with nearest-neighbor scaling. */
export function drawSpotDifferencePuzzleOgp(ctx, original, changed, options = {}) {
  const sourceWidth = original?.naturalWidth || original?.width;
  const sourceHeight = original?.naturalHeight || original?.height;
  const changedWidth = changed?.naturalWidth || changed?.width;
  const changedHeight = changed?.naturalHeight || changed?.height;
  if (!ctx || !original || !changed || ![sourceWidth, sourceHeight, changedWidth, changedHeight].every(Number.isInteger)
      || sourceWidth !== changedWidth || sourceHeight !== changedHeight) reject('share_image_dimensions_mismatch');
  const layout = spotDifferenceOgpLayout(sourceWidth, sourceHeight, options);
  ctx.fillStyle = SPOT_OGP.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.imageSmoothingEnabled = false;
  for (const [image, box] of [[original, layout.original], [changed, layout.changed]]) {
    ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, box.x, box.y, box.width, box.height);
  }
  return layout;
}

/** Only public instructions are passed to the text renderer; never target masks. */
export function hiddenObjectOgpText(definition) {
  if (!isRecord(definition) || !Array.isArray(definition.targets) || !definition.targets.length || definition.targets.length > 128) reject('share_targets_invalid');
  const names = definition.targets.map((target) => {
    if (typeof target?.name !== 'string' || !target.name.trim() || target.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(target.name)) reject('share_targets_invalid');
    return target.name.trim();
  });
  const prompt = definition.prompt;
  if (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > 180 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(prompt))) reject('share_prompt_invalid');
  return { prompt: prompt?.trim() || '', names };
}

export function hiddenObjectOgpLayout(sourceWidth, sourceHeight) {
  if (![sourceWidth, sourceHeight].every(value => Number.isInteger(value) && value > 0 && value <= 512)) reject('share_ogp_dimensions_invalid');
  const scale = Math.floor(Math.min(744 / sourceWidth, 582 / sourceHeight));
  const imageWidth = sourceWidth * scale, imageHeight = sourceHeight * scale;
  return { width: 1200, height: 630, scale, original: { x: 24 + Math.floor((744 - imageWidth) / 2), y: Math.floor((630 - imageHeight) / 2), width: imageWidth, height: imageHeight }, text: { x: 808, y: 126, width: 368, height: 456 } };
}

/** Full image at an integer scale, with readable search instructions beside it. */
export function drawHiddenObjectPuzzleOgp(ctx, image, text) {
  const sourceWidth = image?.naturalWidth || image?.width, sourceHeight = image?.naturalHeight || image?.height;
  if (!ctx || !image || typeof text?.prompt !== 'string' || !Array.isArray(text.names)) reject('share_targets_invalid');
  const layout = hiddenObjectOgpLayout(sourceWidth, sourceHeight), box = layout.original, area = layout.text;
  ctx.fillStyle = SPOT_OGP.background; ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, box.x, box.y, box.width, box.height);
  ctx.fillStyle = '#e75445'; ctx.fillRect(area.x, 48, 12, 40);
  ctx.fillStyle = '#14283e'; ctx.textBaseline = 'top';
  const font = size => `${size}px "Hiragino Sans", "Noto Sans CJK JP", "Yu Gothic", sans-serif`;
  ctx.font = `bold ${font(36)}`; ctx.fillText('探すもの', area.x + 28, 46);
  const wrap = value => {
    const lines = []; let line = '';
    for (const character of value) {
      if (character === '\n') { lines.push(line); line = ''; continue; }
      if (line && ctx.measureText(line + character).width > area.width) { lines.push(line); line = ''; }
      line += character;
    }
    if (line) lines.push(line); return lines;
  };
  let size = 32, lines = [], hiddenNames = 0;
  if (text.prompt) {
    do { ctx.font = font(size); lines = wrap(text.prompt.replace(/\s+/g, ' ')); if (lines.length * (size + 8) <= area.height) break; size -= 2; } while (size >= 18);
    if (lines.length * (size + 8) > area.height) reject('share_prompt_layout_invalid');
  } else {
    size = 28; ctx.font = font(size);
    const budget = Math.floor(area.height / (size + 8));
    for (let index = 0; index < text.names.length; index += 1) {
      const item = wrap(text.names[index]);
      const reserve = index < text.names.length - 1 ? 1 : 0;
      if (lines.length + item.length + reserve > budget) { hiddenNames = text.names.length - index; break; }
      lines.push(...item);
    }
    if (hiddenNames) lines.push(`ほか${hiddenNames}個`);
  }
  ctx.font = font(size); lines.forEach((line, index) => ctx.fillText(line, area.x, area.y + index * (size + 8)));
  return { ...layout, textLines: lines, fontSize: size, hiddenNames };
}

/** Where a puzzle's share page lives: under its own game, 間違い探し or もの探し. */
export function sharePagePath(game, postId) {
  return `/play/${game}/puzzles/${String(postId).toLowerCase()}/`;
}

/**
 * Build a crawler-readable page from the public-post-puzzle endpoint response.
 * Both games use separately generated images. Answer coordinates are never serialized.
 */
export function createPuzzleSharePage(payload, { postId, supabaseUrl, ogpImagePath } = {}) {
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
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512) {
    reject('share_image_dimensions_invalid');
  }
  publicImageUrl(puzzle.originalImage?.url, postId, supabaseUrl);
  const game = puzzle.mode === 'hidden_object' ? 'hidden-object' : 'spot-difference';
  if (puzzle.mode === 'spot_difference') {
    const changed = puzzle.changedImage;
    if (!Number.isInteger(changed?.width) || !Number.isInteger(changed?.height)
        || changed.width !== width || changed.height !== height) reject('share_image_dimensions_mismatch');
    publicImageUrl(changed?.url, postId, supabaseUrl);
  } else hiddenObjectOgpText(puzzle.definition);
  const pageFolder = sharePagePath(game, postId);
  const imagePath = ogpImagePath ?? `${pageFolder}ogp.png`;
  if (typeof imagePath !== 'string' || !imagePath.startsWith(pageFolder)
      || !/^ogp(?:-[a-f0-9]{16})?\.png$/i.test(imagePath.slice(pageFolder.length))) reject('share_ogp_path_invalid');
  const ogImageUrl = `${SITE_ORIGIN}${imagePath}`;
  const canonicalUrl = `${SITE_ORIGIN}${sharePagePath(game, postId)}`;
  const playUrl = `${SITE_ORIGIN}/play/${game}/?postPuzzle=${postId.toLowerCase()}`;
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
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:image:alt" content="${puzzle.mode === 'spot_difference' ? 'まちがい探しの元画像と変更後の画像' : 'もの探しの絵と探すもの'}"/>
  <meta property="og:url" content="${canonicalUrl}"/>
  <meta property="og:site_name" content="PiXiEED"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escapeHtml(title)}"/>
  <meta name="twitter:description" content="${escapeHtml(description)}"/>
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}"/>
  <link rel="canonical" href="${canonicalUrl}"/>
  <meta http-equiv="refresh" content="0; url=${playUrl}"/>
</head>
<body>
  <main><h1>${escapeHtml(puzzle.title.trim())}</h1><p>作者：${escapeHtml(puzzle.author.trim())}</p><a href="${playUrl}">この問題を遊ぶ</a></main>
  <script>window.location.replace(${JSON.stringify(playUrl)});</script>
</body>
</html>`;
}
