import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';
import { getCellById } from './geometry.mjs?v=20260921-grid11-1';
import { projectLegacyShowcase } from './legacy-showcase.mjs';
import { createLegacyPlacementApi } from '../creation/legacy-placement.mjs?rev=20261001-free-tools-1';
import { isSafeJigsawPixfindOriginalUrl } from '../creation/jigsaw-core.mjs?rev=20261001-free-tools-1';

const SESSION_KEY = 'PiXiEED:supabase-session:v1';
const DELETION_KEY = 'PiXiEED:post-deletions:v1';
const AUTHOR_CHANGE_KEY = 'PiXiEED:post-author-change:v1';
const LEGACY_OWNER_SESSION_KEY = 'PiXiEED:legacy-owner-session:v1';
const baseUrl = () => String(supabaseConfig.url || '').trim().replace(/\/$/, '');
const publicKey = () => String(supabaseConfig.publishableKey || '').trim();
const configured = () => Boolean(baseUrl() && publicKey());
const headers = (token = '') => ({ apikey: publicKey(), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', Accept: 'application/json' });

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
    return ({ image_already_submitted: 'この画像はすでに投稿されています。', location_required: '地球のセルを選び直してください。', authentication_required: '投稿セッションを開始できませんでした。', image_type_invalid: '画像をPNGとして確認できませんでした。選び直してください。', image_size_invalid: '投稿用画像は512KB以内にしてください。', image_pixels_invalid: '画像の縦横サイズを確認できませんでした。選び直してください。', image_colors_invalid: '実画像の色数が128色を超えるか、表示した色数と一致しません。', image_decode_invalid: '画像を正しく読み取れませんでした。別の画像を選んでください。' })[code] || '投稿できませんでした。時間をおいてもう一度お試しください。';
  } catch { return '投稿できませんでした。時間をおいてもう一度お試しください。'; }
}
async function refreshSession(session, { persist = true } = {}) {
  if (!session?.refresh_token) return null;
  const response = await fetch(`${baseUrl()}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if (!response.ok) return null;
  const next = await response.json(); if (persist) saveSession(next); return next;
}
async function ensureSession() {
  if (!configured()) throw new Error('投稿機能の接続設定がまだありません。');
  const ownerApi = createLegacyPlacementApi();
  let ownerSessionExists;
  try { ownerSessionExists = ownerApi.hasSavedSession(); }
  catch { throw new Error('ログイン情報を読み取れません。もう一度ログインしてください。'); }
  if (ownerSessionExists) {
    let owner;
    try { owner = await ownerApi.restore(); }
    catch { throw new Error('ログイン状態を確認できません。もう一度ログインしてください。'); }
    if (!owner) throw new Error('ログイン状態を確認できません。もう一度ログインしてください。');
    try {
      const accessToken = await ownerApi.getAccessToken();
      if (!accessToken || ownerApi.user?.id !== owner.id) throw new Error('owner session changed');
      return { access_token: accessToken, owner };
    } catch {
      throw new Error('ログイン状態を確認できません。もう一度ログインしてください。');
    }
  }
  const current = readSession();
  if (current?.access_token && (!current.expires_at || Number(current.expires_at) * 1000 > Date.now() + 30_000)) return { ...current, owner: null };
  const refreshed = await refreshSession(current); if (refreshed?.access_token) return { ...refreshed, owner: null };
  const response = await fetch(`${baseUrl()}/auth/v1/signup`, { method: 'POST', headers: headers(), body: JSON.stringify({ data: { app: 'pixieed', mode: 'anonymous-globe-posting' } }) });
  if (!response.ok) throw new Error(await readError(response));
  const session = await response.json();
  if (!session?.access_token) throw new Error('投稿セッションを開始できませんでした。');
  saveSession(session); return { ...session, owner: null };
}
function imageUrl(path) {
  const bucket = encodeURIComponent(String(supabaseConfig.publicStorageBucket || 'post-public'));
  const safePath = String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return safePath ? `${baseUrl()}/storage/v1/object/public/${bucket}/${safePath}` : '';
}
function socialImageUrl(path) {
  const bucket = encodeURIComponent('social-posts');
  const safePath = String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return safePath ? `${baseUrl()}/storage/v1/object/public/${bucket}/${safePath}` : '';
}
function publicAuthorName(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.normalize('NFC').trim()).slice(0, 40).join('');
}
function fromPublicRow(row) {
  try {
    const cell = getCellById(String(row.globe_cell_id || ''));
    const url = imageUrl(row.public_image_path); if (!url) return null;
    return { id: String(row.post_id), title: String(row.title || '地図の投稿'), caption: String(row.caption || ''), postKind: row.post_kind === 'pixel_camera' ? 'pixel_camera' : 'pixel_art', puzzleMode: ['spot_difference', 'hidden_object'].includes(row.puzzle_mode) ? row.puzzle_mode : null, image: { dataUrl: url, width: 32, height: 32, colorCount: 0 }, pin: { latitude: cell.center.latitude, longitude: cell.center.longitude, cellId: cell.id, source: 'cell' }, author: { id: '', name: publicAuthorName(row.author_name) }, status: 'published', createdAt: Date.parse(row.published_at) || 0, likeable: true };
  } catch { return null; }
}
const dataUrlBase64 = (dataUrl) => String(dataUrl || '').split(',', 2)[1] || '';
const publicLimit = () => Math.min(1000, Math.max(1, Number(supabaseConfig.publicMapLimit) || 500));

async function fetchPublicMapRows(url, columns) {
  let optional = ['post_kind', 'puzzle_mode', 'author_name'];
  for (let attempt = 0; attempt < 7; attempt += 1) {
    url.searchParams.set('select', optional.length ? `${columns},${optional.join(',')}` : columns);
    const response = await fetch(url, { headers: headers(), cache: 'no-store' });
    if (response.status !== 400) return response;

    let message = '';
    try {
      const error = await response.json();
      message = String(error?.message || error?.details || error?.hint || '');
    } catch { /* keep compatibility with minimal fetch responses */ }
    const missing = ['author_name', 'puzzle_mode', 'post_kind'].find((column) => message.includes(column) && optional.includes(column));
    if (missing) {
      if (missing === 'post_kind' && optional.length > 1) optional = ['post_kind'];
      else optional = optional.filter((column) => column !== missing);
      continue;
    }
    if (optional.includes('author_name')) optional = optional.filter((column) => column !== 'author_name');
    else if (optional.includes('puzzle_mode')) optional = optional.filter((column) => column !== 'puzzle_mode');
    else if (optional.includes('post_kind')) optional = optional.filter((column) => column !== 'post_kind');
    else return response;
  }
  return { ok: false, status: 400, async json() { return {}; } };
}

async function loadCurrentMapPosts() {
  const table = encodeURIComponent(String(supabaseConfig.publicMapTable || 'post_map_points'));
  const url = new URL(`${baseUrl()}/rest/v1/${table}`);
  const columns = 'post_id,title,caption,public_image_path,published_at,globe_cell_id';
  url.searchParams.set('map_space', 'eq.globe');
  url.searchParams.set('published_at', 'not.is.null');
  url.searchParams.set('order', 'published_at.desc');
  url.searchParams.set('limit', String(publicLimit()));
  const response = await fetchPublicMapRows(url, columns);
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(fromPublicRow).filter(Boolean) : [];
}

export async function loadPublishedMapPostsByIds(inputIds) {
  const ids = [...new Set((Array.isArray(inputIds) ? inputIds : []).map((id) => String(id || '')).filter((id) => UUID.test(id)))];
  if (!configured() || !ids.length) return [];
  const table = encodeURIComponent(String(supabaseConfig.publicMapTable || 'post_map_points'));
  const output = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const url = new URL(`${baseUrl()}/rest/v1/${table}`);
    const chunkIds = ids.slice(offset, offset + 50);
    const columns = 'post_id,title,caption,public_image_path,published_at,globe_cell_id';
    url.searchParams.set('post_id', `in.(${chunkIds.join(',')})`);
    url.searchParams.set('map_space', 'eq.globe');
    url.searchParams.set('published_at', 'not.is.null');
    url.searchParams.set('limit', '50');
    const response = await fetchPublicMapRows(url, columns);
    if (!response.ok) throw new Error('公開投稿を読み込めませんでした。時間をおいて再試行してください。');
    const rows = await response.json();
    if (Array.isArray(rows)) output.push(...rows.filter((row) => chunkIds.includes(String(row?.post_id || ''))).map(fromPublicRow).filter(Boolean));
  }
  return output;
}

async function loadPlacedShowcases() {
  const placementUrl = new URL(`${baseUrl()}/rest/v1/social_post_map_points`);
  placementUrl.searchParams.set('select', 'social_post_id,globe_cell_id');
  placementUrl.searchParams.set('limit', String(publicLimit()));
  const placementResponse = await fetch(placementUrl, { headers: headers(), cache: 'no-store' });
  // This table is introduced separately; existing globe posts remain available until then.
  if (!placementResponse.ok) return [];
  const placements = await placementResponse.json();
  if (!Array.isArray(placements) || placements.length === 0) return [];
  const byId = new Map(placements.filter((point) => typeof point?.social_post_id === 'string').map((point) => [point.social_post_id, point]));
  const ids = [...byId.keys()];
  const results = [];
  for (let offset = 0; offset < ids.length; offset += 40) {
    const postsUrl = new URL(`${baseUrl()}/rest/v1/social_posts`);
    postsUrl.searchParams.set('select', 'id,title,caption,creator_display_name,media_object_path,published_at,status,post_kind,distribution_mode');
    postsUrl.searchParams.set('id', `in.(${ids.slice(offset, offset + 40).join(',')})`);
    postsUrl.searchParams.set('status', 'eq.published');
    postsUrl.searchParams.set('post_kind', 'eq.image');
    postsUrl.searchParams.set('distribution_mode', 'eq.showcase');
    const response = await fetch(postsUrl, { headers: headers(), cache: 'no-store' });
    if (!response.ok) continue;
    const posts = await response.json();
    if (!Array.isArray(posts)) continue;
    for (const post of posts) {
      const projected = projectLegacyShowcase(byId.get(post.id), post, baseUrl());
      if (projected) results.push(projected);
    }
  }
  return results;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getExistingLikeSession() {
  if (!configured()) return null;
  // The legacy placement API verifies real saved accounts and never creates a user.
  const ownerApi = createLegacyPlacementApi();
  if (ownerApi.hasSavedSession()) {
    const hostname = new URL(baseUrl()).hostname.split('.')[0];
    const sessionKey = localStorage.getItem(LEGACY_OWNER_SESSION_KEY) != null ? LEGACY_OWNER_SESSION_KEY : `sb-${hostname}-auth-token`;
    const raw = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    const initial = raw?.currentSession && typeof raw.currentSession === 'object' ? raw.currentSession : raw;
    if (!initial?.access_token || !initial?.refresh_token) throw new Error('ログイン状態を確認できません。いいね状態を再読み込みしてください。');
    let session = initial;
    if (session.expires_at && Number(session.expires_at) * 1000 <= Date.now() + 30_000) {
      session = await refreshSession(session, { persist: false });
      if (!session?.access_token) throw new Error('ログイン状態を確認できません。いいね状態を再読み込みしてください。');
    }
    const response = await fetch(`${baseUrl()}/auth/v1/user`, { headers: headers(session.access_token), cache: 'no-store' });
    if (!response.ok) throw new Error('ログイン状態を確認できません。いいね状態を再読み込みしてください。');
    const user = await response.json();
    const stillSaved = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    const current = stillSaved?.currentSession && typeof stillSaved.currentSession === 'object' ? stillSaved.currentSession : stillSaved;
    if (!UUID.test(String(user?.id || '')) || user.is_anonymous || (initial.user_id && initial.user_id !== user.id) || current?.access_token !== initial.access_token || current?.refresh_token !== initial.refresh_token) return null;
    session.user_id = user.id;
    // Keep future ownership checks on the refreshed token, but only after confirming the
    // original session remained present throughout refresh and user verification.
    localStorage.setItem(sessionKey, JSON.stringify(session));
    return { access_token: session.access_token, user_id: user.id };
  }
  let session = readSession();
  if (!session) return null;
  const initialToken = session.access_token;
  const initialRefreshToken = session.refresh_token;
  if (session.expires_at && Number(session.expires_at) * 1000 <= Date.now() + 30_000) {
    session = await refreshSession(session, { persist: false });
    if (!session?.access_token) throw new Error('ログイン状態を確認できません。いいね状態を再読み込みしてください。');
  }
  const response = await fetch(`${baseUrl()}/auth/v1/user`, { headers: headers(session.access_token), cache: 'no-store' });
  if (!response.ok) throw new Error('ログイン状態を確認できません。いいね状態を再読み込みしてください。');
  const user = await response.json();
  if (!UUID.test(String(user?.id || ''))) throw new Error('ログイン状態を確認できません。いいね状態を再読み込みしてください。');
  const stillSaved = readSession();
  if (stillSaved?.access_token !== initialToken || stillSaved?.refresh_token !== initialRefreshToken) return null;
  session.user_id = user.id;
  // Preserve a refreshed active session only after confirming logout did not remove or replace it.
  if (session.access_token !== initialToken) saveSession(session);
  else { session.user_id = user.id; saveSession(session); }
  return { access_token: session.access_token, user_id: user.id };
}

async function ownershipRows(path, filters, accessToken, columns) {
  const url = new URL(`${baseUrl()}/rest/v1/${encodeURIComponent(path)}`);
  url.searchParams.set('select', columns);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, `eq.${value}`);
  url.searchParams.set('limit', '2');
  const response = await fetch(url, { headers: headers(accessToken), cache: 'no-store' });
  if (!response.ok) throw new Error('ownership lookup failed');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') throw new Error('ambiguous ownership lookup');
  return rows[0];
}

function sourcePostId(source) {
  const postId = String(source?.postId || '');
  const map = /^map:([A-Za-z0-9_-]{1,128})$/.exec(postId);
  const showcase = /^showcase:([A-Za-z0-9_-]{1,128})$/.exec(postId);
  const pixfind = /^pixfind:([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{1,128})$/.exec(postId);
  if (map) return { type: 'map', postId: map[1] };
  if (showcase) return { type: 'showcase', postId: showcase[1] };
  if (pixfind) return { type: 'pixfind', postId: pixfind[1], puzzleId: pixfind[2] };
  return null;
}

/** Verify a public reference against the current authenticated owner's published rows. Read only. */
export async function verifyPublicWorkOwnership(source) {
  const parsed = sourcePostId(source);
  if (!configured() || !parsed || typeof source?.url !== 'string' || !source.url) return false;
  try {
    const session = await getExistingLikeSession();
    if (!session?.access_token || !UUID.test(String(session.user_id || ''))) return false;
    let imagePath = '';
    if (parsed.type === 'map') {
      const post = await ownershipRows('user_posts', { id: parsed.postId }, session.access_token, 'id,author_id,status');
      if (post.id !== parsed.postId || post.author_id !== session.user_id || post.status !== 'published') return false;
      const point = await ownershipRows('post_map_points', { post_id: parsed.postId }, session.access_token, 'post_id,public_image_path,published_at');
      if (point.post_id !== parsed.postId || !point.published_at) return false;
      imagePath = point.public_image_path;
    } else if (parsed.type === 'showcase') {
      const post = await ownershipRows('social_posts', { id: parsed.postId }, session.access_token, 'id,creator_user_id,status,post_kind,distribution_mode,media_object_path');
      if (post.id !== parsed.postId || post.creator_user_id !== session.user_id || post.status !== 'published' || post.post_kind !== 'image' || post.distribution_mode !== 'showcase') return false;
      imagePath = socialImageUrl(post.media_object_path);
    } else {
      if (source.puzzleId !== parsed.puzzleId) return false;
      const post = await ownershipRows('social_posts', { id: parsed.postId }, session.access_token, 'id,creator_user_id,status,post_kind,distribution_mode,pixfind_puzzle_id');
      if (post.id !== parsed.postId || post.creator_user_id !== session.user_id || post.status !== 'published' || post.post_kind !== 'pixfind' || post.distribution_mode !== 'pixfind' || post.pixfind_puzzle_id !== parsed.puzzleId) return false;
      const puzzle = await ownershipRows('pixfind_puzzles', { id: parsed.puzzleId }, session.access_token, 'id,original_url');
      if (puzzle.id !== parsed.puzzleId || typeof puzzle.original_url !== 'string' || puzzle.original_url !== source.url || !isSafeJigsawPixfindOriginalUrl(source.url, baseUrl(), parsed.puzzleId)) return false;
      imagePath = '';
    }
    if (parsed.type === 'map' && (!imagePath || imageUrl(imagePath) !== source.url)) return false;
    if (parsed.type === 'showcase' && (!imagePath || imagePath !== source.url)) return false;
    const current = await getExistingLikeSession();
    return current?.user_id === session.user_id && current?.access_token === session.access_token;
  } catch { return false; }
}

async function loadMyLikes() {
  const session = await getExistingLikeSession();
  if (!session) return new Set();
  const ids = new Set();
  let after = '';
  const pageSize = 200;
  for (;;) {
    const url = new URL(`${baseUrl()}/rest/v1/post_likes`);
    url.searchParams.set('select', 'post_id');
    url.searchParams.set('user_id', `eq.${session.user_id}`);
    url.searchParams.set('order', 'post_id.asc');
    url.searchParams.set('limit', String(pageSize));
    if (after) url.searchParams.set('post_id', `gt.${after}`);
    const response = await fetch(url, { headers: headers(session.access_token), cache: 'no-store' });
    if (!response.ok) throw new Error('いいね状態を読み込めませんでした。');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('いいね状態を読み込めませんでした。');
    for (const row of rows) {
      const id = String(row?.post_id || '');
      if (UUID.test(id)) ids.add(id);
    }
    if (rows.length < pageSize) break;
    const next = String(rows.at(-1)?.post_id || '');
    if (!UUID.test(next) || next === after) throw new Error('いいね状態を読み込めませんでした。');
    after = next;
  }
  return ids;
}

export async function listMyPublishedLikes() {
  return [...await loadMyLikes()];
}

async function hasLiked(postId) {
  if (!UUID.test(String(postId || ''))) return false;
  const session = await getExistingLikeSession();
  if (!session) return false;
  const url = new URL(`${baseUrl()}/rest/v1/post_likes`);
  url.searchParams.set('select', 'post_id');
  url.searchParams.set('post_id', `eq.${postId}`);
  url.searchParams.set('user_id', `eq.${session.user_id}`);
  const response = await fetch(url, { headers: headers(session.access_token), cache: 'no-store' });
  if (!response.ok) throw new Error('いいね状態を読み込めませんでした。もう一度お試しください。');
  const rows = await response.json();
  return Array.isArray(rows) && rows.some((row) => String(row?.post_id || '') === postId);
}

async function setPostLike(postId, liked) {
  if (!UUID.test(String(postId || ''))) throw new TypeError('この投稿にはいいねできません。');
  const session = await ensureSession();
  const url = new URL(`${baseUrl()}/rest/v1/post_likes`);
  if (liked) {
    const userId = session.user_id || session.user?.id || session.owner?.id;
    if (!UUID.test(String(userId || ''))) throw new Error('ログイン状態を確認できません。');
    const response = await fetch(url, { method: 'POST', headers: { ...headers(session.access_token), Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ post_id: postId, user_id: userId }) });
    if (!response.ok) throw new Error('いいねを保存できませんでした。時間をおいてお試しください。');
  } else {
    url.searchParams.set('post_id', `eq.${postId}`);
    const userId = session.user_id || session.user?.id || session.owner?.id;
    if (!UUID.test(String(userId || ''))) throw new Error('ログイン状態を確認できません。');
    url.searchParams.set('user_id', `eq.${userId}`);
    const response = await fetch(url, { method: 'DELETE', headers: headers(session.access_token) });
    if (!response.ok) throw new Error('いいねを取り消せませんでした。時間をおいてお試しください。');
  }
}

export function buildGlobePostPayload(post) {
  const cell = getCellById(post.pin.cellId);
  return {
    title: post.title,
    caption: post.caption,
    postKind: post.postKind === 'pixel_camera' ? 'pixel_camera' : 'pixel_art',
    image: { mimeType: post.image.mimeType, size: post.image.size, width: post.image.width, height: post.image.height, colorCount: post.image.colorCount, base64: dataUrlBase64(post.image.dataUrl) },
    location: { globeCell: { id: cell.id, version: cell.version, band: cell.band, column: cell.column } },
    ...(post.requestKey ? { requestKey: post.requestKey } : {}),
    ...(post.puzzle ? { puzzle: post.puzzle } : {})
  };
}

export function createSupabaseGlobeAuth() {
  const user = Object.freeze({ id: 'anonymous', name: 'ゲスト' });
  return { getUser: () => user, login: () => user, logout() {}, subscribe() { return () => {}; } };
}

export function createSupabaseGlobeStore() {
  let published = [];
  const withdrawn = new Set();
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const retireDeletedPosts = () => {
    try {
      const ids = JSON.parse(globalThis.localStorage?.getItem(DELETION_KEY) || '[]');
      if (!Array.isArray(ids)) return;
      for (const id of ids) if (UUID.test(String(id))) withdrawn.add(id);
      const next = published.filter((post) => !withdrawn.has(post.id));
      if (next.length !== published.length) { published = next; notify(); }
    } catch { /* private mode or an invalid local notice */ }
  };
  let initialLoaded = false;
  let authorRefresh = null;
  const authorNotice = () => { try { return globalThis.localStorage?.getItem(AUTHOR_CHANGE_KEY) || ''; } catch { return ''; } };
  let seenAuthorNotice = authorNotice();
  const refreshAuthorNames = () => {
    if (!initialLoaded || authorRefresh || authorNotice() === seenAuthorNotice) return authorRefresh;
    const notice = authorNotice();
    const ids = published.filter((post) => UUID.test(post.id) && !withdrawn.has(post.id)).map((post) => post.id);
    if (!ids.length) { seenAuthorNotice = notice; return null; }
    authorRefresh = (async () => {
      try {
        // Only refresh after an explicit name save, never on map zoom or pan.
        const names = new Map();
        for (let i = 0; i < ids.length; i += 50) {
          for (const post of await loadPublishedMapPostsByIds(ids.slice(i, i + 50))) names.set(post.id, post.author.name);
        }
        let changed = false;
        published = published.map((post) => {
          if (!names.has(post.id) || post.author?.name === names.get(post.id)) return post;
          changed = true;
          return { ...post, author: { ...post.author, name: names.get(post.id) } };
        });
        seenAuthorNotice = notice;
        if (changed) notify();
      } catch { /* A failed refresh keeps the displayed post and retries on the next page visit. */ }
    })().finally(() => {
      authorRefresh = null;
      if (seenAuthorNotice === notice && authorNotice() !== notice) void refreshAuthorNames();
    });
    return authorRefresh;
  };
  retireDeletedPosts();
  globalThis.addEventListener?.('storage', (event) => {
    if (event.key === DELETION_KEY) retireDeletedPosts();
    if (event.key === AUTHOR_CHANGE_KEY) void refreshAuthorNames();
  });
  globalThis.addEventListener?.('pageshow', () => { retireDeletedPosts(); return refreshAuthorNames(); });
  const upsertPublished = (post) => {
    if (withdrawn.has(post.id)) return;
    const next = published.filter((item) => item.id !== post.id);
    next.push(post);
    published = next.sort((left, right) => right.createdAt - left.createdAt);
    notify();
  };
  const ready = (async () => {
    if (!configured()) return;
    const [current, legacy] = await Promise.allSettled([loadCurrentMapPosts(), loadPlacedShowcases()]);
    const initial = [
      ...(current.status === 'fulfilled' ? current.value : []),
      ...(legacy.status === 'fulfilled' ? legacy.value : [])
    ];
    // A post may be added while the initial requests are in flight. Keep the
    // newer in-memory version for duplicate IDs instead of losing that update.
    const merged = new Map(initial.filter((post) => !withdrawn.has(post.id)).map((post) => [post.id, post]));
    for (const post of published) merged.set(post.id, post);
    published = [...merged.values()].sort((left, right) => right.createdAt - left.createdAt);
    initialLoaded = true;
    notify();
    void refreshAuthorNames();
  })();
  return {
    ready,
    persistent: () => configured(),
    list: () => published,
    async ensurePublishedById(id) {
      await ready;
      if (!UUID.test(String(id || ''))) return false;
      if (published.some((post) => post.id === id)) return true;
      const [post] = await loadPublishedMapPostsByIds([id]);
      if (!post) return false;
      upsertPublished(post);
      return true;
    },
    async add(post) {
      if (post?.puzzle && supabaseConfig.puzzlePublicationEnabled !== true) {
        throw new Error('パズル投稿は準備中です。公開機能の更新後にお試しください。');
      }
      const session = await ensureSession();
      const response = await fetch(`${baseUrl()}/functions/v1/${encodeURIComponent(supabaseConfig.createPostFunction || 'create-post')}`, {
        method: 'POST', headers: headers(session.access_token),
        body: JSON.stringify(buildGlobePostPayload(post))
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json();
      if (post?.puzzle && result?.puzzleMode !== post.puzzle.mode) {
        throw new Error('パズル投稿の公開設定を確認できませんでした。時間をおいて再試行してください。');
      }
      const submittedBy = session.owner
        ? { id: session.owner.id, name: post.author?.id === session.owner.id ? String(post.author.name || '') : '' }
        : post.author;
      const created = { ...post, author: submittedBy, id: result.postId, status: result.status || 'pending', puzzleMode: result.puzzleMode || null, createdAt: Date.now() };
      if (created.status === 'published' && UUID.test(String(created.id || ''))) {
        // Make the submitted image visible immediately; replace it with the canonical public projection when available.
        upsertPublished(created);
        try {
          const [canonical] = await loadPublishedMapPostsByIds([created.id]);
          if (canonical) upsertPublished(canonical);
          else {
            // A successful empty read is authoritative: a concurrent deletion may have won.
            withdrawn.add(created.id);
            published = published.filter((item) => item.id !== created.id);
            notify();
          }
        } catch { /* temporary public-read failures must not hide a successful submission */ }
      }
      return created;
    },
    listMyLikes: loadMyLikes,
    hasLiked,
    async setLike(postId, liked) {
      if (!published.some((post) => post.id === postId && post.likeable === true)) throw new TypeError('この投稿にはいいねできません。');
      return setPostLike(postId, Boolean(liked));
    },
    async remove() { throw new Error('公開後の削除は管理画面から行ってください。'); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
