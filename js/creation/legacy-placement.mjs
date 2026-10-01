import { supabaseConfig } from '../../data/site-config.js?rev=20261001-free-tools-1';
import { lookupCell } from '../globe/geometry.mjs';
import { parseLocationInput } from '../globe/geo-input.mjs';
import { publicImageUrl } from '../globe/legacy-showcase.mjs';

const SESSION_KEY = 'PiXiEED:legacy-owner-session:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_POST_STATUSES = new Set(['pending', 'published', 'rejected', 'hidden']);

function normalizeSession(value) {
  if (!value || typeof value.access_token !== 'string' || !value.access_token || typeof value.refresh_token !== 'string' || !value.refresh_token) return null;
  const userId = String(value.user_id || value.user?.id || '');
  return { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: Number(value.expires_at) || 0, user_id: UUID.test(userId) ? userId : '' };
}

export function readOwnerAuthCallback(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (params.has('error')) return { error: 'ログインを完了できませんでした。もう一度お試しください。' };
  if (!params.has('access_token') && !params.has('refresh_token')) return null;
  if (params.get('token_type')?.toLowerCase() !== 'bearer') return { error: 'ログイン情報を確認できませんでした。' };
  const expiresIn = Number(params.get('expires_in'));
  const session = normalizeSession({
    access_token: params.get('access_token'), refresh_token: params.get('refresh_token'),
    expires_at: Number(params.get('expires_at')) || (Number.isFinite(expiresIn) ? Math.floor(Date.now() / 1000) + expiresIn : 0)
  });
  return session ? { session } : { error: 'ログイン情報を確認できませんでした。' };
}

export function cellFromPlaceInput(input) {
  const location = parseLocationInput(input);
  if (!location.ok) throw new TypeError(location.message || '場所を読み取れませんでした。');
  return lookupCell(location.longitude, location.latitude);
}

export function createLegacyPlacementApi({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, config = supabaseConfig } = {}) {
  const projectUrl = String(config.url || '').replace(/\/$/, '');
  const key = String(config.publishableKey || '');
  if (!/^https:\/\/[^/]+$/.test(projectUrl) || !key) throw new Error('作品の接続設定を確認できません。');
  const oldSessionKey = `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`;
  let session = null;
  let user = null;
  const headers = (token = '') => ({ apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/json', 'Content-Type': 'application/json' });
  const endpoint = (path) => `${projectUrl}${path}`;
  const getSaved = (name) => {
    try { return normalizeSession(JSON.parse(storage?.getItem(name) || 'null')); } catch { return null; }
  };
  const persistSession = () => {
    try { if (session) storage?.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* browser private mode */ }
  };
  const saveSession = (value) => {
    session = normalizeSession(value);
    if (session) persistSession();
    else { try { storage?.removeItem(SESSION_KEY); } catch { /* browser private mode */ } }
  };
  const clearActiveSession = () => { session = null; user = null; };
  const refresh = async ({ persist = true } = {}) => {
    if (!session?.refresh_token) return false;
    const response = await fetchImpl(endpoint('/auth/v1/token?grant_type=refresh_token'), {
      method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) return false;
    const refreshed = await response.json();
    session = normalizeSession({ ...refreshed, user_id: session.user_id });
    if (!session) return false;
    if (persist) persistSession();
    return true;
  };
  const verifyUser = async () => {
    if (!session) return null;
    const response = await fetchImpl(endpoint('/auth/v1/user'), { headers: headers(session.access_token), cache: 'no-store' });
    if (!response.ok) return null;
    const candidate = await response.json();
    return UUID.test(String(candidate?.id || '')) && !candidate.is_anonymous ? { id: candidate.id } : null;
  };
  const requireUser = () => {
    if (!user || !session) throw new Error('旧アカウントでログインしてください。');
    return user;
  };
  const activeToken = async () => {
    const owner = requireUser();
    if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
      if (!await refresh({ persist: false })) throw new Error('ログインの有効期限が切れました。再度ログインしてください。');
      const checked = await verifyUser();
      if (checked?.id !== owner.id) { clearActiveSession(); throw new Error('ログイン状態が変わりました。再度ログインしてください。'); }
      session.user_id = owner.id;
      persistSession();
    }
    return session.access_token;
  };
  const api = {
    get user() { return user; },
    hasSavedSession() {
      if (!storage) return false;
      return storage.getItem(SESSION_KEY) != null || storage.getItem(oldSessionKey) != null;
    },
    async getAccessToken() {
      requireUser();
      return activeToken();
    },
    async restore(callbackSession = null) {
      if (callbackSession) saveSession(callbackSession);
      else session = getSaved(SESSION_KEY) || getSaved(oldSessionKey);
      user = null;
      if (!session) { user = null; return null; }
      const expectedUserId = session.user_id;
      if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) await refresh({ persist: false });
      user = await verifyUser();
      if (!user && await refresh({ persist: false })) user = await verifyUser();
      if (!user || expectedUserId && user.id !== expectedUserId) { clearActiveSession(); return null; }
      session.user_id = user.id;
      persistSession();
      return user;
    },
    oauthUrl(redirectTo) {
      const url = new URL(endpoint('/auth/v1/authorize'));
      url.searchParams.set('provider', 'google');
      url.searchParams.set('redirect_to', redirectTo);
      return url.toString();
    },
    async sendEmailLink(email, redirectTo) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) throw new TypeError('メールアドレスを確認してください。');
      const url = new URL(endpoint('/auth/v1/otp'));
      url.searchParams.set('redirect_to', redirectTo);
      const response = await fetchImpl(url, { method: 'POST', headers: headers(), body: JSON.stringify({ email: email.trim(), create_user: false }) });
      if (!response.ok) throw new Error('メールを送れませんでした。しばらくしてからお試しください。');
    },
    async listWorks() {
      const owner = requireUser();
      const token = await activeToken();
      const url = new URL(endpoint('/rest/v1/social_posts'));
      url.searchParams.set('select', 'id,title,caption,media_object_path,published_at,creator_display_name,status,post_kind,distribution_mode');
      url.searchParams.set('creator_user_id', `eq.${owner.id}`);
      url.searchParams.set('status', 'eq.published');
      url.searchParams.set('post_kind', 'eq.image');
      url.searchParams.set('distribution_mode', 'eq.showcase');
      url.searchParams.set('media_object_path', 'not.is.null');
      url.searchParams.set('order', 'published_at.desc');
      url.searchParams.set('limit', '100');
      const response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' });
      if (!response.ok) throw new Error('公開作品を読み込めませんでした。');
      const rows = await response.json();
      return Array.isArray(rows) ? rows.filter((row) => UUID.test(String(row.id || '')) && row.status === 'published' && row.post_kind === 'image' && row.distribution_mode === 'showcase' && publicImageUrl(projectUrl, row.media_object_path) && Number.isFinite(Date.parse(row.published_at))) : [];
    },
    async listUserPosts() {
      const owner = requireUser();
      const token = await activeToken();
      const url = new URL(endpoint('/rest/v1/user_posts'));
      const columns = 'id,author_id,title,status,post_kind';
      url.searchParams.set('select', columns);
      url.searchParams.set('author_id', `eq.${owner.id}`);
      url.searchParams.set('order', 'created_at.desc');
      url.searchParams.set('limit', '100');
      let response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' });
      const hasPostKind = response.ok;
      if (response.status === 400) {
        url.searchParams.set('select', 'id,author_id,title,status');
        response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' });
      }
      if (!response.ok) throw new Error('新しい投稿を読み込めませんでした。');
      const rows = await response.json();
      if (!Array.isArray(rows)) return [];
      return rows.filter((row) => {
        const id = String(row?.id || '');
        const authorId = String(row?.author_id || '');
        return UUID.test(id) && UUID.test(authorId) && authorId.toLowerCase() === owner.id.toLowerCase()
          && typeof row.title === 'string' && row.title.trim().length > 0
          && USER_POST_STATUSES.has(row.status)
          && (!hasPostKind || row.post_kind === 'pixel_art' || row.post_kind === 'pixel_camera');
      }).map((row) => ({
        id: String(row.id),
        title: row.title.trim(),
        postKind: hasPostKind && row.post_kind === 'pixel_camera' ? 'pixel_camera' : 'pixel_art',
        status: row.status
      }));
    },
    async listPlacements(workIds) {
      const token = await activeToken();
      const ids = workIds.filter((id) => UUID.test(String(id))).slice(0, 100);
      if (!ids.length) return new Map();
      const url = new URL(endpoint('/rest/v1/social_post_map_points'));
      url.searchParams.set('select', 'social_post_id,globe_cell_id');
      url.searchParams.set('social_post_id', `in.(${ids.join(',')})`);
      const response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' });
      if (!response.ok) throw new Error('地球儀の配置を読み込めませんでした。');
      const rows = await response.json();
      return new Map(Array.isArray(rows) ? rows.filter((row) => ids.includes(row.social_post_id)).map((row) => [row.social_post_id, row.globe_cell_id]) : []);
    },
    async place(workId, input) {
      const token = await activeToken();
      if (!UUID.test(String(workId))) throw new TypeError('作品IDが不正です。');
      const cell = cellFromPlaceInput(input);
      const url = new URL(endpoint('/rest/v1/social_post_map_points'));
      url.searchParams.set('on_conflict', 'social_post_id');
      const response = await fetchImpl(url, {
        method: 'POST', headers: { ...headers(token), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ social_post_id: workId, globe_cell_id: cell.id, projection_version: cell.version, globe_band: cell.band, globe_column: cell.column })
      });
      if (!response.ok) throw new Error('場所を保存できませんでした。旧アカウントと作品を確認してください。');
      return cell;
    },
    signOut() {
      clearActiveSession(); saveSession(null);
      try { storage?.removeItem(oldSessionKey); } catch { /* browser private mode */ }
    }
  };
  return api;
}
