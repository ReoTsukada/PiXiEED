/** Authenticated home selection client. Authority is checked by the Edge Function, never by this UI. */
import { supabaseConfig } from '../data/site-config.js?rev=20261004-puzzle-share-1';
import { parseHomeArtwork } from '../js/home-artworks.mjs?rev=20261112-posted-random-1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const STATES = ['pending', 'approved', 'held'];
export class ReviewError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'ReviewError'; this.status = status; }
}
export function reviewConfig(config = supabaseConfig) {
  const url = new URL(config.url || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || typeof config.publishableKey !== 'string' || !config.publishableKey.trim()) throw new ReviewError('invalid_configuration');
  return { origin: url.origin, key: config.publishableKey };
}
function displayName(value, max, fallback) {
  if (typeof value !== 'string') return { text: fallback, valid: false };
  const text = value.normalize('NFC').trim();
  const valid = Boolean(text) && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text);
  return { text: valid ? text : fallback, valid };
}
export function parseReviewArtwork(row, config) {
  if (!row || !UUID.test(row.postId || '') || row.id !== `map:${row.postId}` || !STATES.includes(row.reviewState) || !HASH.test(row.snapshotToken || '') || typeof row.eligible !== 'boolean') return null;
  const title = displayName(row.title, 60, '作品名の確認が必要です');
  const author = displayName(row.authorName, 40, '作者名未設定');
  const common = { id: row.id, postId: row.postId, title: title.text, authorName: author.text, eligible: row.eligible, approvalEligible: row.eligible && title.valid && author.valid, reviewState: row.reviewState, snapshotToken: row.snapshotToken };
  // Withdrawn/deleted/private posts expose no image path or current publication date.
  // Do not retain or fetch image data even if a malformed response supplies it.
  if (!row.eligible) return common;
  const parts = typeof row.imagePath === 'string' ? row.imagePath.split('/') : [];
  if (parts.length !== 2 || parts[0] !== row.postId || !UUID.test(parts[1]?.replace(/\.png$/, '') || '') || !parts[1].endsWith('.png')) return null;
  const artwork = parseHomeArtwork({ ...row, title: title.text, authorName: author.text }, config);
  return artwork ? { ...artwork, ...common, publishedAt: row.publishedAt } : null;
}
export function parseReviewPage(payload, config) {
  if (payload?.ok !== true || !Array.isArray(payload.artworks) || payload.artworks.length > 24 || !(payload.nextCursor === null || UUID.test(payload.nextCursor || ''))) throw new ReviewError('invalid_response');
  const artworks = [], seen = new Set(); let skippedCount = 0;
  for (const row of payload.artworks) {
    const artwork = parseReviewArtwork(row, config);
    if (!artwork || seen.has(artwork.postId)) { skippedCount++; continue; }
    seen.add(artwork.postId); artworks.push(artwork);
  }
  // Keep the server cursor, including when the last row was safely skipped.
  return { artworks, nextCursor: payload.nextCursor, skippedCount };
}
export function reviewActionBody({ postId, action, snapshotToken, confirmedStillImage, confirmedRights, confirmedContent }) {
  if (!UUID.test(postId || '') || !['approve', 'hold'].includes(action) || !HASH.test(snapshotToken || '')) throw new ReviewError('invalid_action');
  if (action === 'approve' && [confirmedStillImage, confirmedRights, confirmedContent].some(value => value !== true)) throw new ReviewError('confirmations_required');
  return { postId, action, snapshotToken, ...(action === 'approve' ? { confirmedStillImage: true, confirmedRights: true, confirmedContent: true } : {}) };
}
async function request(session, options, { config = supabaseConfig, fetchImpl = globalThis.fetch, signal, timeoutMs = 12000 } = {}) {
  const cfg = reviewConfig(config);
  if (!session?.access_token || typeof session.access_token !== 'string') throw new ReviewError('authentication_required', 401);
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const url = new URL('/functions/v1/home-artwork-review', cfg.origin);
    if (options.query) url.search = new URLSearchParams(options.query).toString();
    const response = await fetchImpl(url.href, { method: options.body ? 'POST' : 'GET', headers: { apikey: cfg.key, Authorization: `Bearer ${session.access_token}`, Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}), credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) throw new ReviewError(response.status === 409 ? 'snapshot_changed' : 'request_failed', response.status);
    const size = Number(response.headers?.get?.('content-length') || 0);
    if (size > 65536 || !response.body?.getReader) throw new ReviewError('invalid_response');
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 65536 || controller.signal.aborted) { await reader.cancel(); throw new ReviewError('invalid_response'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    if (controller.signal.aborted) throw new ReviewError('request_aborted');
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { payload: JSON.parse(new TextDecoder().decode(bytes)), cfg };
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export async function loadReviewArtworks(session, { state = 'pending', after = null, ...options } = {}) {
  if (!['all', ...STATES].includes(state) || after !== null && !UUID.test(after)) throw new ReviewError('invalid_query');
  const { payload, cfg } = await request(session, { query: { state, limit: '24', ...(after ? { after } : {}) } }, options);
  const page = parseReviewPage(payload, cfg);
  if (state !== 'all' && page.artworks.some(row => row.reviewState !== state)) throw new ReviewError('invalid_response');
  return page;
}
export async function submitReviewAction(session, values, options = {}) {
  const body = reviewActionBody(values), { payload } = await request(session, { body }, options);
  if (payload?.ok !== true || payload.postId !== body.postId || payload.reviewState !== (body.action === 'approve' ? 'approved' : 'held')) throw new ReviewError('invalid_response');
  return { postId: payload.postId, reviewState: payload.reviewState };
}
