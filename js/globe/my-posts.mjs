import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_KEY = 'PiXiEED:legacy-owner-session:v1';
const DEVICE_KEY = 'PiXiEED:supabase-session:v1';
const DELETION_KEY = 'PiXiEED:post-deletions:v1';
const AUTHOR_CHANGE_KEY = 'PiXiEED:post-author-change:v1';
const STATUSES = new Set(['pending', 'published', 'rejected', 'hidden']);
const sessionError = () => new Error('投稿した時のログイン状態を確認できません。再読み込みするか、もう一度ログインしてください。');
const safePath = (path) => typeof path === 'string' && path.length > 0 && !/(^\/|\.\.|\\)/.test(path);
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

/** Read existing owners only. Visiting a profile never creates a posting account. */
export function createMyPostsApi({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, config = supabaseConfig } = {}) {
  const base = String(config.url || '').replace(/\/$/, '');
  const key = String(config.publishableKey || '');
  if (!/^https:\/\/[^/]+$/.test(base) || !key) throw new Error('投稿機能の接続設定を確認できません。');
  const nativeKey = `sb-${new URL(base).hostname.split('.')[0]}-auth-token`;
  const headers = (token) => ({ apikey: key, Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' });
  const ownership = new Map();
  const profileOwners = new Map();
  let sessions = [];
  let restoring = null;
  let user = null;
  const rawSaved = (name) => storage?.getItem(name) ?? null;
  const stillActive = (session) => rawSaved(session.key) === session.raw;

  async function verifySaved(name, scope) {
    const raw = rawSaved(name);
    if (raw == null) return null;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw sessionError(); }
    const original = parsed?.currentSession && typeof parsed.currentSession === 'object' ? parsed.currentSession : parsed;
    if (!original?.access_token) throw sessionError();
    let next = original;
    if (next.expires_at && Number(next.expires_at) * 1000 <= Date.now() + 30_000) {
      if (!next.refresh_token) throw sessionError();
      const refreshed = await fetchImpl(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: next.refresh_token })
      });
      if (!refreshed.ok) throw sessionError();
      next = await refreshed.json();
      if (!next?.access_token) throw sessionError();
    }
    const response = await fetchImpl(`${base}/auth/v1/user`, { headers: headers(next.access_token), cache: 'no-store' });
    if (!response.ok) throw sessionError();
    const checked = await response.json();
    const claimedId = String(original.user_id || original.user?.id || '');
    if (!UUID.test(String(checked?.id || '')) || claimedId && claimedId !== checked.id || scope === 'account' && checked.is_anonymous) throw sessionError();
    if (rawSaved(name) !== raw) throw sessionError();
    // A refresh is persisted only while the original session is still present.
    const saved = { ...next, user_id: checked.id };
    const wrapper = parsed?.currentSession ? { ...parsed, currentSession: saved } : saved;
    const updated = JSON.stringify(wrapper);
    storage?.setItem(name, updated);
    return {
      key: name, raw: updated, accessToken: next.access_token, id: checked.id, scope,
      isAnonymous: checked.is_anonymous === true,
      name: checked.is_anonymous ? 'この端末の投稿' : String(checked.user_metadata?.display_name || checked.user_metadata?.full_name || 'あなたのアカウント').slice(0, 80)
    };
  }

  async function restore() {
    if (restoring) return restoring;
    restoring = (async () => {
      user = null;
      sessions = [];
      const accountKey = rawSaved(OWNER_KEY) != null ? OWNER_KEY : nativeKey;
      const account = await verifySaved(accountKey, 'account');
      const device = await verifySaved(DEVICE_KEY, 'device');
      sessions = [account, device].filter(Boolean).filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index);
      if (sessions.some((entry) => !stillActive(entry))) throw sessionError();
      const main = account || device;
      user = main ? { id: main.id, isAnonymous: main.isAnonymous, name: main.name } : null;
      return user;
    })();
    try { return await restoring; }
    finally { restoring = null; }
  }

  async function rows(table, token, params) {
    const url = new URL(`${base}/rest/v1/${table}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' });
    if (!response.ok) throw new Error('投稿を読み込めませんでした。再読み込みしてください。');
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error('投稿の一覧を確認できませんでした。');
    return result;
  }

  async function privateThumbnail(post, session) {
    if (!safePath(post.image_path)) return '';
    const path = encodePath(post.image_path);
    const response = await fetchImpl(`${base}/storage/v1/object/sign/post-quarantine/${path}`, {
      method: 'POST', headers: headers(session.accessToken), body: JSON.stringify({ expiresIn: 300 })
    });
    if (!response.ok) return '';
    const result = await response.json();
    const signed = result.signedURL || result.signedUrl;
    if (typeof signed !== 'string') return '';
    const url = new URL(signed.startsWith('/object/') ? `/storage/v1${signed}` : signed, base);
    if (url.origin !== new URL(base).origin || url.pathname !== `/storage/v1/object/sign/post-quarantine/${path}` || !url.searchParams.get('token')) return '';
    return url.href;
  }

  async function listPosts() {
    await restore();
    ownership.clear();
    const collected = [];
    for (const session of sessions) {
      let after = '';
      const ownedRows = [];
      for (;;) {
        const batch = await rows('user_posts', session.accessToken, {
          select: 'id,author_id,title,caption,status,post_kind,created_at,image_width,image_height,image_path,submission_puzzle_mode,author_name,deleted_at,delete_cleanup_completed_at',
          author_id: `eq.${session.id}`, or: '(deleted_at.is.null,delete_cleanup_completed_at.is.null)', order: 'id.asc', limit: '100', ...(after ? { id: `gt.${after}` } : {})
        });
        const own = batch.filter((post) => UUID.test(String(post?.id || '')) && post.author_id === session.id && (!post.deleted_at || !post.delete_cleanup_completed_at) && STATUSES.has(post.status) && ['pixel_art', 'pixel_camera'].includes(post.post_kind));
        ownedRows.push(...own);
        if (batch.length < 100) break;
        const next = String(batch.at(-1)?.id || '');
        if (!UUID.test(next) || next <= after) throw new Error('投稿の一覧を確認できませんでした。');
        after = next;
      }
      const publicImages = new Map();
      const publishedIds = ownedRows.filter((post) => post.status === 'published' && !post.deleted_at).map((post) => post.id);
      for (let offset = 0; offset < publishedIds.length; offset += 50) {
        const chunk = publishedIds.slice(offset, offset + 50);
        const points = await rows('post_map_points', session.accessToken, {
          select: 'post_id,public_image_path,published_at', post_id: `in.(${chunk.join(',')})`, published_at: 'not.is.null', limit: '50'
        });
        for (const point of points) if (chunk.includes(point.post_id) && point.published_at && safePath(point.public_image_path)) {
          publicImages.set(point.post_id, `${base}/storage/v1/object/public/${encodeURIComponent(config.publicStorageBucket || 'post-public')}/${encodePath(point.public_image_path)}`);
        }
      }
      // Keep signing requests bounded even for a large account.
      for (let offset = 0; offset < ownedRows.length; offset += 8) {
        collected.push(...await Promise.all(ownedRows.slice(offset, offset + 8).map(async (post) => ({
          id: post.id, title: String(post.title || '無題'), caption: String(post.caption || ''), status: post.status, authorName: String(post.author_name || ''),
          postKind: post.post_kind, puzzleMode: post.submission_puzzle_mode || null, createdAt: Date.parse(post.created_at) || 0,
          sessionScope: session.scope, deletionPending: Boolean(post.deleted_at && !post.delete_cleanup_completed_at),
          image: { dataUrl: post.deleted_at ? '' : publicImages.get(post.id) || await privateThumbnail(post, session).catch(() => ''), width: Number(post.image_width) || 32, height: Number(post.image_height) || 32 }
        }))));
      }
      if (!stillActive(session)) throw sessionError();
      for (const post of ownedRows) ownership.set(post.id, session.id);
    }
    return collected.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }

  async function remove(id) {
    if (!UUID.test(String(id || '')) || !ownership.has(id)) throw new Error('この投稿の所有者を確認できません。一覧を再読み込みしてください。');
    const expectedOwner = ownership.get(id);
    await restore();
    const session = sessions.find((entry) => entry.id === expectedOwner);
    if (!session || !stillActive(session)) throw sessionError();
    const response = await fetchImpl(`${base}/functions/v1/delete-post`, {
      method: 'POST', headers: headers(session.accessToken), body: JSON.stringify({ postId: id })
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('削除結果を確認できませんでした。もう一度削除を押してください。'); }
    if (result?.deleted === true) {
      // Also retire the image in an already-open map or a page restored from browser history.
      try {
        const previous = JSON.parse(storage?.getItem(DELETION_KEY) || '[]');
        const ids = Array.isArray(previous) ? previous.filter((entry) => UUID.test(String(entry))) : [];
        storage?.setItem(DELETION_KEY, JSON.stringify([...new Set([...ids, id])].slice(-1000)));
      } catch { /* A storage failure must not turn a successful server deletion into a failure. */ }
    }
    if (!response.ok || result?.ok !== true || result?.deleted !== true) {
      if (result?.deleted === true) throw new Error('投稿の公開は停止しました。画像の削除を完了するため、もう一度削除を押してください。');
      if (response.status === 401) throw sessionError();
      throw new Error('投稿を削除できませんでした。もう一度お試しください。');
    }
    ownership.delete(id);
    return { ok: true, deleted: true };
  }

  async function listAuthorProfiles() {
    await restore();
    const result = [];
    for (const session of sessions) {
      const profiles = await rows('post_author_profiles', session.accessToken, {
        select: 'author_id,display_name', author_id: `eq.${session.id}`, limit: '2'
      });
      if (!stillActive(session) || profiles.length > 1 || profiles.some((profile) => profile.author_id !== session.id)) throw sessionError();
      const name = String(profiles[0]?.display_name || '');
      profileOwners.set(session.scope, session.id);
      result.push({ id: session.id, sessionScope: session.scope, name, isAnonymous: session.isAnonymous });
      if (user?.id === session.id && name) user = { ...user, name };
    }
    return result;
  }

  async function saveAuthorName(scope, input) {
    const name = String(input || '').normalize('NFC').trim();
    if (!name || Array.from(name).length > 40 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error('作者名は改行を含めず、1〜40文字で入力してください。');
    const expectedOwner = profileOwners.get(scope);
    if (!expectedOwner) throw sessionError();
    await restore();
    const session = sessions.find((entry) => entry.scope === scope && entry.id === expectedOwner);
    if (!session || !stillActive(session)) throw sessionError();
    const response = await fetchImpl(`${base}/functions/v1/set-author-name`, {
      method: 'POST', headers: headers(session.accessToken), body: JSON.stringify({ name })
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('作者名の保存結果を確認できません。もう一度保存してください。'); }
    if (!response.ok || result?.ok !== true || result?.name !== name) {
      if (response.status === 401) throw sessionError();
      throw new Error('作者名を保存できませんでした。もう一度お試しください。');
    }
    if (!stillActive(session)) throw sessionError();
    if (user?.id === session.id) user = { ...user, name };
    try { storage?.setItem(AUTHOR_CHANGE_KEY, JSON.stringify({ at: Date.now(), nonce: Math.random().toString(36).slice(2) })); } catch { /* The server remains authoritative when local storage is unavailable. */ }
    return { ok: true, name };
  }

  return { restore, listPosts, remove, listAuthorProfiles, saveAuthorName, get user() { return user; } };
}
