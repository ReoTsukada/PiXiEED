import { supabaseConfig } from '../../data/site-config.js?rev=20260921-globe-post-v1';
import { getCellById } from './geometry.mjs?v=20260921-grid11-1';

const SESSION_KEY = 'PiXiEED:supabase-session:v1';
const baseUrl = () => String(supabaseConfig.url || '').trim().replace(/\/$/, '');
const publicKey = () => String(supabaseConfig.publishableKey || '').trim();
const configured = () => Boolean(baseUrl() && publicKey());
const headers = (token = '') => ({ apikey: publicKey(), Authorization: `Bearer ${token || publicKey()}`, 'Content-Type': 'application/json', Accept: 'application/json' });

function readSession() {
  try { const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return session?.access_token ? session : null; } catch { return null; }
}
function saveSession(session) {
  try { session?.access_token ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}
async function readError(response) {
  try {
    const payload = await response.json();
    const code = String(payload?.error_description || payload?.msg || payload?.message || payload?.error || '');
    return ({ image_already_submitted: 'この画像はすでに投稿されています。', location_required: '地球のセルを選び直してください。', authentication_required: '投稿セッションを開始できませんでした。' })[code] || '投稿できませんでした。時間をおいてもう一度お試しください。';
  } catch { return '投稿できませんでした。時間をおいてもう一度お試しください。'; }
}
async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const response = await fetch(`${baseUrl()}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if (!response.ok) return null;
  const next = await response.json(); saveSession(next); return next;
}
async function ensureSession() {
  if (!configured()) throw new Error('投稿機能の接続設定がまだありません。');
  const current = readSession();
  if (current?.access_token && (!current.expires_at || Number(current.expires_at) * 1000 > Date.now() + 30_000)) return current;
  const refreshed = await refreshSession(current); if (refreshed?.access_token) return refreshed;
  const response = await fetch(`${baseUrl()}/auth/v1/signup`, { method: 'POST', headers: headers(), body: JSON.stringify({ data: { app: 'pixieed', mode: 'anonymous-globe-posting' } }) });
  if (!response.ok) throw new Error(await readError(response));
  const session = await response.json();
  if (!session?.access_token) throw new Error('投稿セッションを開始できませんでした。');
  saveSession(session); return session;
}
function imageUrl(path) {
  const bucket = encodeURIComponent(String(supabaseConfig.publicStorageBucket || 'post-public'));
  const safePath = String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return safePath ? `${baseUrl()}/storage/v1/object/public/${bucket}/${safePath}` : '';
}
function fromPublicRow(row) {
  try {
    const cell = getCellById(String(row.globe_cell_id || ''));
    const url = imageUrl(row.public_image_path); if (!url) return null;
    return { id: String(row.post_id), title: String(row.title || '地図の投稿'), caption: String(row.caption || ''), image: { dataUrl: url, width: 32, height: 32, colorCount: 0 }, pin: { latitude: cell.center.latitude, longitude: cell.center.longitude, cellId: cell.id, source: 'cell' }, author: { id: '', name: '' }, status: 'published', createdAt: Date.parse(row.published_at) || 0 };
  } catch { return null; }
}
const dataUrlBase64 = (dataUrl) => String(dataUrl || '').split(',', 2)[1] || '';

export function buildGlobePostPayload(post) {
  const cell = getCellById(post.pin.cellId);
  return {
    title: post.title,
    caption: post.caption,
    image: { mimeType: post.image.mimeType, size: post.image.size, width: post.image.width, height: post.image.height, colorCount: post.image.colorCount, base64: dataUrlBase64(post.image.dataUrl) },
    location: { globeCell: { id: cell.id, version: cell.version, band: cell.band, column: cell.column } }
  };
}

export function createSupabaseGlobeAuth() {
  const user = Object.freeze({ id: 'anonymous', name: 'ゲスト' });
  return { getUser: () => user, login: () => user, logout() {}, subscribe() { return () => {}; } };
}

export function createSupabaseGlobeStore() {
  let published = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const ready = (async () => {
    if (!configured()) return;
    const table = encodeURIComponent(String(supabaseConfig.publicMapTable || 'post_map_points'));
    const url = new URL(`${baseUrl()}/rest/v1/${table}`);
    url.searchParams.set('select', 'post_id,title,caption,public_image_path,published_at,globe_cell_id');
    url.searchParams.set('map_space', 'eq.globe');
    url.searchParams.set('published_at', 'not.is.null');
    url.searchParams.set('order', 'published_at.desc');
    url.searchParams.set('limit', String(Math.min(1000, Math.max(1, Number(supabaseConfig.publicMapLimit) || 500))));
    try {
      const response = await fetch(url, { headers: headers(), cache: 'no-store' });
      if (!response.ok) return;
      const rows = await response.json();
      published = Array.isArray(rows) ? rows.map(fromPublicRow).filter(Boolean) : [];
      notify();
    } catch { /* the globe remains usable while public posts are unavailable */ }
  })();
  return {
    ready,
    persistent: () => configured(),
    list: () => published,
    async add(post) {
      const session = await ensureSession();
      const response = await fetch(`${baseUrl()}/functions/v1/${encodeURIComponent(supabaseConfig.createPostFunction || 'create-post')}`, {
        method: 'POST', headers: headers(session.access_token),
        body: JSON.stringify(buildGlobePostPayload(post))
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      return { ...post, id: result.postId, status: result.status || 'pending', createdAt: Date.now() };
    },
    async remove() { throw new Error('公開後の削除は管理画面から行ってください。'); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
