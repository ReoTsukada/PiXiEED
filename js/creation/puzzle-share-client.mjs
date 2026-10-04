const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GAMES = Object.freeze({ 'spot-difference': 'spot-difference', hidden_object: 'hidden-object', 'hidden-object': 'hidden-object', spot_difference: 'spot-difference' });

export class PuzzleShareError extends Error {
  constructor(code, message, { url = '' } = {}) {
    super(message);
    this.name = 'PuzzleShareError';
    this.code = code;
    this.url = url;
  }
}

function fail(code, message, options) { throw new PuzzleShareError(code, message, options); }

export function puzzleShareUrl({ mode, postId, origin } = {}) {
  const game = GAMES[mode];
  if (!game || typeof postId !== 'string' || !UUID.test(postId)) fail('puzzle_unavailable', 'この問題は共有できません。公開中の問題を開いてください。');
  let base;
  try { base = new URL(origin); } catch { fail('share_origin_invalid', '共有ページを確認できません。'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) fail('share_origin_invalid', '共有ページを確認できません。');
  return new URL(`/play/${game}/puzzles/${postId.toLowerCase()}/`, base.origin).href;
}

async function request(fetchImpl, url, method) {
  try {
    const signal = globalThis.AbortSignal?.timeout?.(15_000);
    return await fetchImpl(url, { method, cache: 'no-store', credentials: 'omit', redirect: 'error', ...(signal ? { signal } : {}) });
  } catch {
    fail('share_page_unavailable', '共有ページを確認できません。通信状態を確認して再試行してください。');
  }
}

/** Confirm the published static HTML and its OGP image before exposing a share URL. */
export async function verifyPuzzleSharePage({ mode, postId, origin, fetchImpl = globalThis.fetch, DOMParserImpl = globalThis.DOMParser } = {}) {
  const shareUrl = puzzleShareUrl({ mode, postId, origin });
  if (typeof fetchImpl !== 'function' || typeof DOMParserImpl !== 'function') fail('share_page_unavailable', '共有ページを確認できません。');

  const head = await request(fetchImpl, shareUrl, 'HEAD');
  if (head.status === 404) fail('share_page_not_ready', '個別の共有ページはまだ公開されていません。時間をおいて再試行してください。');
  if (!head.ok && ![405, 501].includes(head.status)) fail('share_page_unavailable', '共有ページを確認できません。通信状態を確認して再試行してください。');

  const response = await request(fetchImpl, shareUrl, 'GET');
  if (response.status === 404) fail('share_page_not_ready', '個別の共有ページはまだ公開されていません。時間をおいて再試行してください。');
  if (!response.ok || (response.url && new URL(response.url).href !== shareUrl)) fail('share_page_unavailable', '共有ページを確認できません。通信状態を確認して再試行してください。');
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('text/html')) fail('share_page_not_ready', '個別の共有ページはまだ準備中です。時間をおいて再試行してください。');

  let doc;
  try { doc = new DOMParserImpl().parseFromString(await response.text(), 'text/html'); }
  catch { fail('share_page_not_ready', '個別の共有ページはまだ準備中です。時間をおいて再試行してください。'); }
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const ogUrl = doc.querySelector('meta[property="og:url"]')?.getAttribute('content');
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');
  if (canonical !== shareUrl || ogUrl !== shareUrl || !ogTitle?.trim() || !ogDescription?.trim() || !ogImage) fail('share_page_not_ready', '個別の共有ページはまだ準備中です。時間をおいて再試行してください。');

  let imageUrl;
  try { imageUrl = new URL(ogImage, origin); } catch { fail('share_image_not_ready', '共有画像はまだ準備中です。時間をおいて再試行してください。'); }
  const pagePath = new URL(shareUrl).pathname;
  if (imageUrl.origin !== new URL(origin).origin || imageUrl.search || imageUrl.hash
      || !imageUrl.pathname.startsWith(pagePath) || !/^ogp(?:-[a-f0-9]{16})?\.png$/i.test(imageUrl.pathname.slice(pagePath.length))) {
    fail('share_image_not_ready', '共有画像はまだ準備中です。時間をおいて再試行してください。');
  }
  const imageHead = await request(fetchImpl, imageUrl.href, 'HEAD');
  const imageType = imageHead.headers?.get?.('content-type') || '';
  if (!imageHead.ok || !imageType.toLowerCase().startsWith('image/png')) fail('share_image_not_ready', '共有画像はまだ準備中です。時間をおいて再試行してください。');
  return shareUrl;
}

export async function copyVerifiedPuzzleShareUrl(options, clipboard = globalThis.navigator?.clipboard) {
  const url = await verifyPuzzleSharePage(options);
  if (!clipboard || typeof clipboard.writeText !== 'function') fail('clipboard_unavailable', 'URLをコピーできません。下の欄から手動でコピーしてください。', { url });
  try { await clipboard.writeText(url); }
  catch { fail('clipboard_unavailable', 'URLをコピーできません。下の欄から手動でコピーしてください。', { url }); }
  return url;
}
