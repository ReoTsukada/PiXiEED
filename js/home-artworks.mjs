/** Anonymous display of opted-in, independently reviewed public artworks. */
import { supabaseConfig } from '../data/site-config.js?rev=20261004-puzzle-share-1';
const REF = /^map:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const MAX_CANDIDATES = 24;
export function publicArtworkImage(origin, bucket, path) {
  if (typeof path !== 'string' || !path || path.length > 512 || path.startsWith('/') || /[?#%\\\u0000-\u001f\u007f]/.test(path)) return '';
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) return '';
  return new URL(`/storage/v1/object/public/${encodeURIComponent(bucket)}/${parts.map(encodeURIComponent).join('/')}`, origin).href;
}
function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.normalize('NFC').trim();
  return text && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) ? text : '';
}
function publicConfig(config) {
  const url = new URL(config?.url || '');
  const key = config?.publishableKey;
  const table = config?.publicMapTable || 'post_map_points';
  const bucket = config?.publicStorageBucket || 'post-public';
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || typeof key !== 'string' || !key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !/^[A-Za-z0-9_-]{1,100}$/.test(bucket)) throw Error('invalid_public_configuration');
  return { origin: url.origin, key, table, bucket };
}
/** The public reader enforces owner consent, current review and publication together.
 * The browser still validates every field and refuses unreviewed/changed bytes.
 */
export function parseHomeArtwork(row, config) {
  if (!row || !REF.test(row.id || '')) return null;
  const title = cleanText(row.title, 60), authorName = cleanText(row.authorName, 40);
  if (!title || !authorName || !Number.isFinite(Date.parse(row.publishedAt)) || Date.parse(row.publishedAt) <= 0) return null;
  if (!Number.isSafeInteger(row.imageBytes) || row.imageBytes < 1 || row.imageBytes > 262144 || !/^[a-f0-9]{64}$/.test(row.imageSha256 || '')) return null;
  if (typeof row.imagePath !== 'string' || !/\.(png|jpe?g|webp)$/i.test(row.imagePath)) return null;
  const src = publicArtworkImage(config.origin, 'post-public', row.imagePath);
  return src ? { id: row.id.toLowerCase(), title, authorName, src, imageBytes: row.imageBytes, imageSha256: row.imageSha256, href: `/feed/?post=${encodeURIComponent(row.id.toLowerCase())}` } : null;
}
/** A fresh, unbiased order without repeats. No timers, persistent history or tracking. */
export function chooseHomeArtworks(artworks, limit = 3, random = Math.random) {
  const unique = [], seen = new Set();
  for (const artwork of artworks) {
    const identity = artwork.imageSha256 || artwork.src;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity); unique.push(artwork);
  }
  for (let i = unique.length - 1; i > 0; i--) {
    const value = random();
    const j = Math.floor((Number.isFinite(value) && value >= 0 && value < 1 ? value : 0.5) * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, Math.max(1, Math.min(3, Number(limit) || 3)));
}
/** Download once, bound bytes and verify the reviewed content before decoding it. */
export async function loadHomeArtworkImage(artwork, { fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto, URLImpl = globalThis.URL, signal, timeoutMs = 6000 } = {}) {
  if (signal?.aborted || !cryptoImpl?.subtle || !/^[a-f0-9]{64}$/.test(artwork?.imageSha256 || '') || !Number.isSafeInteger(artwork.imageBytes) || artwork.imageBytes < 1 || artwork.imageBytes > 262144) throw Error('unverified_artwork');
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  let reader;
  try {
    const response = await fetchImpl(artwork.src, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok || controller.signal.aborted) throw Error('image_unavailable');
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    if (contentLength && contentLength !== artwork.imageBytes) throw Error('image_changed');
    const chunks = []; let length = 0;
    if (!response.body?.getReader) throw Error('bounded_stream_unavailable');
    reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > artwork.imageBytes || controller.signal.aborted) { await reader.cancel(); throw Error('image_changed'); }
      chunks.push(value);
    }
    if (length !== artwork.imageBytes || controller.signal.aborted) throw Error('image_changed');
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const hash = [...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== artwork.imageSha256 || controller.signal.aborted) throw Error('image_changed');
    const mime = /\.png$/i.test(new URL(artwork.src).pathname) ? 'image/png' : /\.webp$/i.test(new URL(artwork.src).pathname) ? 'image/webp' : 'image/jpeg';
    return URLImpl.createObjectURL(new Blob([bytes], { type: mime }));
  } finally { reader?.releaseLock(); clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export async function loadHomeArtworks({ config = supabaseConfig, fetchImpl = globalThis.fetch, limit = 3, random = Math.random, signal, timeoutMs = 4500 } = {}) {
  if (signal?.aborted) return [];
  const cfg = publicConfig(config);
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const url = new URL('/functions/v1/home-artworks', cfg.origin);
    const response = await fetchImpl(url.href, { method: 'GET', headers: { apikey: cfg.key, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) throw Error('public_artwork_unavailable');
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    if (contentLength > 49152) throw Error('oversized_response');
    const text = await response.text();
    if (text.length > 49152) throw Error('oversized_response');
    const payload = JSON.parse(text);
    if (payload?.ok !== true || !Array.isArray(payload.artworks) || payload.artworks.length > MAX_CANDIDATES) throw Error('invalid_response');
    if (controller.signal.aborted) { if (signal?.aborted) return []; throw Error('artwork_timeout'); }
    const seenIds = new Set();
    const artworks = payload.artworks.flatMap(row => {
      const artwork = parseHomeArtwork(row, cfg);
      if (!artwork || seenIds.has(artwork.id)) return [];
      seenIds.add(artwork.id); return [artwork];
    });
    return chooseHomeArtworks(artworks, limit, random);
  } catch (error) { if (signal?.aborted) return []; throw error; }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export function initHomeArtworks({ doc = globalThis.document, win = globalThis.window, load = loadHomeArtworks } = {}) {
  const root = doc?.getElementById?.('portal-artworks');
  if (!root || !win) return null;
  const grid = doc.getElementById('portal-artwork-grid');
  const fallback = doc.getElementById('portal-artwork-fallback');
  const status = doc.getElementById('portal-artwork-status');
  const label = doc.getElementById('portal-artwork-label');
  let disposed = false, epoch = 0, active = null, observer = null;
  const objectURLs = new Set();
  const setFallback = () => {
    for (const url of objectURLs) win.URL.revokeObjectURL(url);
    objectURLs.clear();
    grid.replaceChildren(); grid.hidden = true; fallback.hidden = false;
    label.textContent = 'ひとつひとつの「好き」が、つながる。'; status.textContent = '';
  };
  const run = async () => {
    if (disposed || doc.visibilityState === 'hidden') return;
    const current = ++epoch;
    active?.abort(); active = new AbortController();
    observer?.disconnect(); setFallback(); root.dataset.state = 'loading';
    // A single card on reduced-data connections. Never request hidden thumbnails.
    const limit = win.navigator?.connection?.saveData ? 1 : win.matchMedia?.('(max-width:760px)').matches ? 2 : 3;
    let artworks = [], failed = false;
    try { artworks = await load({ limit, signal: active.signal }); } catch { failed = true; }
    if (disposed || current !== epoch || active.signal.aborted) return;
    if (!artworks.length) { root.dataset.state = failed ? 'error' : 'empty'; status.textContent = failed ? '作品を読み込めませんでした。作品一覧をご利用ください。' : '掲載できる作品を準備しています。作品一覧から公開作品をご覧いただけます。'; return; }
    let loaded = 0, settled = 0;
    const update = () => {
      if (disposed || current !== epoch) return;
      if (loaded) {
        fallback.hidden = true; grid.hidden = false; root.dataset.state = 'ready';
        grid.dataset.count = String(loaded); label.textContent = 'みんなのドット絵から、ひらめきを。';
        status.textContent = `${loaded}点の公開作品。作品名を選ぶと詳細が開きます。`;
      } else if (settled === artworks.length) { root.dataset.state = 'image-error'; status.textContent = '作品画像を表示できませんでした。作品一覧をご利用ください。'; }
    };
    for (const artwork of artworks.slice(0, limit)) {
      const card = doc.createElement('a'); card.className = 'portal-posted-card'; card.href = artwork.href; card.hidden = true;
      const image = doc.createElement('img'); image.width = 256; image.height = 256; image.alt = ''; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
      const caption = doc.createElement('span'); caption.className = 'portal-posted-caption';
      const title = doc.createElement('strong'); title.textContent = artwork.title;
      const author = doc.createElement('span'); author.textContent = `by ${artwork.authorName}`;
      caption.append(title, author); card.append(image, caption); grid.append(card);
      image.onload = () => { settled++; loaded++; card.hidden = false; update(); };
      image.onerror = () => { settled++; card.remove(); update(); };
      void loadHomeArtworkImage(artwork, { fetchImpl: win.fetch.bind(win), cryptoImpl: win.crypto, URLImpl: win.URL, signal: active.signal }).then(url => {
        if (disposed || current !== epoch) { win.URL.revokeObjectURL(url); return; }
        objectURLs.add(url); image.src = url;
      }).catch(() => { if (!disposed && current === epoch) image.onerror(); });
    }
  };
  const hide = () => { ++epoch; active?.abort(); setFallback(); root.dataset.state = 'paused'; };
  const onVisibility = () => { if (doc.visibilityState === 'hidden') hide(); else void run(); };
  const onPageShow = event => { if (event.persisted) void run(); };
  const onPreferenceChange = event => { if (event.key == null || event.key === 'PiXiEED:home-artwork-preference:v1') { hide(); void run(); } };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', hide); win.addEventListener('pageshow', onPageShow); win.addEventListener('storage', onPreferenceChange);
  if (typeof win.IntersectionObserver === 'function') {
    observer = new win.IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void run(); }, { rootMargin: '0px' }); observer.observe(root);
  } else void run();
  return { dispose() { disposed = true; hide(); observer?.disconnect(); doc.removeEventListener('visibilitychange', onVisibility); win.removeEventListener('pagehide', hide); win.removeEventListener('pageshow', onPageShow); win.removeEventListener('storage', onPreferenceChange); } };
}
