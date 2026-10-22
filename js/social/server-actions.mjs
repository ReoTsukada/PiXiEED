import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';
import { createLegacyPlacementApi } from '../creation/legacy-placement.mjs?rev=20261001-free-tools-1';

import { postingPolicy, requirePostingConsent, PostingConsentError } from '../../data/posting-policy.mjs?rev=20261022-posting-live-1';

const authQueues = new WeakMap();
const SESSION_KEY = 'PiXiEED:supabase-session:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SocialServerActionError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'SocialServerActionError';
    this.code = code;
    this.status = status;
  }
}

function safeConfig(config) {
  let url;
  try { url = new URL(String(config?.url || '')); }
  catch { throw new SocialServerActionError('not_configured', '投稿機能の接続設定を確認できません。'); }
  const key = String(config?.publishableKey || '').trim();
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !key) {
    throw new SocialServerActionError('not_configured', '投稿機能の接続設定を確認できません。');
  }
  return { origin: url.origin, key };
}

function readStored(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; }
}

function readRawStored(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try { return storage.getItem(key); }
  catch { throw new SocialServerActionError('authentication_required', 'ログイン状態を確認できません。'); }
}

function writeStored(storage, session) {
  try {
    if (typeof storage?.setItem !== 'function') throw new Error('storage unavailable');
    if (session?.access_token) storage.setItem(SESSION_KEY, JSON.stringify(session));
    else storage.removeItem(SESSION_KEY);
  } catch { throw new SocialServerActionError('authentication_required', '投稿セッションを保存できません。ブラウザーの保存設定を確認してください。'); }
}

function safeFailure(status, code = '') {
  const normalized = String(code || '').toLowerCase();
  if (['posting_policy_unavailable','posting_consent_required','posting_consent_version_mismatch'].includes(normalized)) return new SocialServerActionError(normalized, new PostingConsentError(normalized).message, status);
  if (['comments_disabled'].includes(normalized)) return new SocialServerActionError('comments_disabled', 'コメント機能は利用できません。', status);
  if (['guest_already_claimed','claim_conflict','claim_pending'].includes(normalized)) return new SocialServerActionError(normalized, '引き継ぎを確認できませんでした。元のデータを保持しています。投稿処理の完了後に再試行してください。', status);
  if (['post_not_found', 'target_not_found', 'comment_not_found', 'not_found'].includes(normalized)) {
    return new SocialServerActionError('not_found', '投稿またはコメントが見つからないか、公開されていません。', status);
  }
  if ((status === 404 && !normalized) || status === 405 || status === 501 || ['function_not_found', 'capability_unavailable'].includes(normalized)) {
    return new SocialServerActionError('capability_unavailable', '文章・音楽のサーバー投稿機能はまだ利用できません。');
  }
  if (status === 409 || normalized === 'conflict') return new SocialServerActionError('conflict', '内容が更新されています。最新の内容を読み込んでください。', status);
  if (status === 401 || status === 403) return new SocialServerActionError('authentication_required', 'ログイン状態を確認できません。もう一度お試しください。', status);
  if (status === 429) return new SocialServerActionError('rate_limited', '操作が集中しています。時間をおいてお試しください。', status);
  if (status === 413 || ['request_too_large', 'audio_size_invalid', 'music_capacity_reached'].includes(normalized)) {
    return new SocialServerActionError('size_limit', '音声ファイルがサイズ上限を超えています。小さいファイルを選んでください。', status);
  }
  if (status === 400 || ['audio_format_unsupported', 'audio_wav_invalid', 'audio_wav_ambiguous', 'audio_duration_invalid', 'audio_required', 'audio_invalid', 'post_invalid', 'comment_invalid', 'report_invalid'].includes(normalized)) {
    const message = normalized.includes('audio') || normalized.includes('wav') || normalized.includes('duration')
      ? '音声は対応するWAV形式（10分以内）を選んでください。'
      : '入力内容を確認してください。';
    return new SocialServerActionError('invalid_input', message, status);
  }
  return new SocialServerActionError('request_failed', '操作を完了できませんでした。時間をおいて再試行してください。', status);
}

export function createSocialServerActions({ postingPolicy: policy = postingPolicy, config = supabaseConfig, fetchImpl = globalThis.fetch, storage = globalThis.localStorage, ownerApiFactory = (options) => createLegacyPlacementApi(options), timeoutMs = 12_000, locks = globalThis.navigator?.locks } = {}) {
  const cfg = safeConfig(config);
  const endpoint = `${cfg.origin}/functions/v1/social-feed`;
  const baseHeaders = (token = '') => ({ apikey: cfg.key, Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });

  async function boundedFetch(input, options = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    try {
      return await fetchImpl(input, { ...options, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new SocialServerActionError('timeout', 'ログイン状態の確認が時間切れになりました。再試行してください。');
      if (options.signal?.aborted) throw new SocialServerActionError('aborted', '操作を中止しました。');
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async function callAuth(path, body, token = '') {
    const response = await boundedFetch(`${cfg.origin}/auth/v1/${path}`, {
      method: 'POST', headers: { ...baseHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', redirect: 'error'
    });
    if (!response.ok) return null;
    try { return await response.json(); } catch { return null; }
  }

  async function verifyAccessToken(token) {
    const response = await boundedFetch(`${cfg.origin}/auth/v1/user`, { headers: baseHeaders(token), cache: 'no-store', redirect: 'error' });
    if (!response.ok) return null;
    let user;
    try { user = await response.json(); } catch { return null; }
    return UUID.test(String(user?.id || '')) ? user : null;
  }

  async function existingOwnerToken() {
    const ownerApi = ownerApiFactory({ fetchImpl: boundedFetch, storage, config });
    let saved;
    try { saved = ownerApi.hasSavedSession(); } catch { throw new SocialServerActionError('authentication_required', 'ログイン状態を確認できません。'); }
    if (!saved) return null;
    let owner;
    try { owner = await ownerApi.restore(); } catch { owner = null; }
    if (!owner || !UUID.test(String(owner.id || ''))) throw new SocialServerActionError('authentication_required', 'ログイン状態を確認できません。もう一度ログインしてください。');
    try {
      const accessToken = await ownerApi.getAccessToken();
      if (!accessToken || ownerApi.user?.id !== owner.id) throw new Error('owner session changed');
      return { access_token: accessToken, user_id: owner.id, owner: true };
    } catch { throw new SocialServerActionError('authentication_required', 'ログイン状態を確認できません。もう一度ログインしてください。'); }
  }

  const authLockTarget = storage && typeof storage === 'object' ? storage : {};
  async function ensureWriteSession() {
    const operation = () => ensureWriteSessionUnlocked();
    if (locks?.request) return locks.request('pixieed-guest-account', {mode:'exclusive'}, operation);
    const prior = authQueues.get(authLockTarget) || Promise.resolve();
    const next = prior.catch(() => {}).then(operation);
    authQueues.set(authLockTarget, next.catch(() => {}));
    return next;
  }
  async function recoveredAuthSession() {
    if (readRawStored(storage, 'PiXiEED:auth-session-recovery:v1') === null) return null;
    try {
      const { createGuestAuthAdapter } = await import('./guest-auth-adapter.mjs');
      const restored = await createGuestAuthAdapter({config, storage, fetchImpl:boundedFetch, timeoutMs}).getSession();
      if (!restored?.access_token || !UUID.test(String(restored.user?.id || ''))) throw new Error('unverified');
      return {...restored,user_id:restored.user.id,owner:restored.user.is_anonymous === false};
    } catch { throw new SocialServerActionError('authentication_required', '認証更新の確認が完了していません。アカウントの引き継ぎ画面から再試行してください。元の情報は保持しています。'); }
  }
  async function ensureWriteSessionUnlocked() {
    const recovered = await recoveredAuthSession();
    if (recovered) return recovered;
    const owner = await existingOwnerToken();
    if (owner) return owner;
    const savedRaw = readRawStored(storage, SESSION_KEY);
    let session = null;
    if (savedRaw !== null) {
      try { session = JSON.parse(savedRaw); } catch { throw new SocialServerActionError('authentication_required', '保存済みログイン情報を読み取れません。もう一度ログインしてください。'); }
      if (!session || typeof session !== 'object' || Array.isArray(session)) throw new SocialServerActionError('authentication_required', '保存済みログイン情報を読み取れません。もう一度ログインしてください。');

      if (typeof session.access_token === 'string' && session.access_token && (!session.expires_at || Number(session.expires_at) * 1000 > Date.now() + 30_000)) {
        const user = await verifyAccessToken(session.access_token);
        if (user) {
          if (session.user_id && session.user_id !== user.id) throw new SocialServerActionError('authentication_required', '保存済みログイン情報を確認できません。もう一度ログインしてください。');
          if (readRawStored(storage, SESSION_KEY) !== savedRaw) throw new SocialServerActionError('authentication_required', 'ログイン状態が変わりました。もう一度お試しください。');
          return { ...session, user_id: user.id, owner: false };
        }
      }

      if (typeof session.refresh_token === 'string' && session.refresh_token) {
        const refreshed = await callAuth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
        if (!refreshed?.access_token) throw new SocialServerActionError('authentication_required', '保存済みログインの更新に失敗しました。もう一度ログインしてください。');
        const user = await verifyAccessToken(refreshed.access_token);
        if (!user || session.user_id && session.user_id !== user.id) throw new SocialServerActionError('authentication_required', '保存済みログイン情報を確認できません。もう一度ログインしてください。');
        if (readRawStored(storage, SESSION_KEY) !== savedRaw) throw new SocialServerActionError('authentication_required', 'ログイン状態が変わりました。もう一度お試しください。');
        session = { ...refreshed, user_id: user.id };
        writeStored(storage, session);
        return { ...session, owner: false };
      }

      throw new SocialServerActionError('authentication_required', '保存済みログインの確認に失敗しました。もう一度ログインしてください。');
    }

    const created = await callAuth('signup', { data: { app: 'pixieed', mode: 'anonymous-globe-posting' } });
    if (!created?.access_token) throw new SocialServerActionError('authentication_required', '投稿セッションを開始できませんでした。');
    const user = await verifyAccessToken(created.access_token);
    if (!user) throw new SocialServerActionError('authentication_required', '投稿セッションを確認できませんでした。');
    if (readRawStored(storage, SESSION_KEY) !== savedRaw) throw new SocialServerActionError('authentication_required', 'ログイン状態が変わりました。元の投稿セッションを保持しています。');
    const verified = { ...created, user_id: user.id };
    writeStored(storage, verified);
    return { ...verified, owner: false };
  }

  async function requireOwnerSession() {
    const session = await existingAuthSession();
    if (!session?.access_token) throw new SocialServerActionError('authentication_required', '自分の投稿を確認するにはログインしてください。');
    return session;
  }

  async function existingAuthSession() {
    const recovered = await recoveredAuthSession();
    if (recovered) return recovered;
    const owner = await existingOwnerToken();
    if (owner) return owner;
    let session = readStored(storage, SESSION_KEY);
    if (!session?.access_token && !session?.refresh_token) return null;
    if (session.expires_at && Number(session.expires_at) * 1000 <= Date.now() + 30_000) {
      const refreshed = await callAuth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      if (!refreshed?.access_token) return null;
      session = { ...refreshed, user_id: session.user_id };
      writeStored(storage, session);
    }
    const user = await verifyAccessToken(session.access_token);
    if (!user || session.user_id && session.user_id !== user.id) return null;
    // Confirm the same stored credentials remain active after server verification.
    const current = readStored(storage, SESSION_KEY);
    if (current?.access_token !== session.access_token || current?.refresh_token !== session.refresh_token) return null;
    session.user_id = user.id;
    return { ...session, owner: false };
  }

  async function request(action, payload = {}, { auth = false, ownerOnly = false, existingAuth = false, audio = null, signal } = {}) {
    if (['create', 'edit'].includes(action) && payload.visibility === 'public') payload = { ...payload, postingConsent: requirePostingConsent(payload.postingConsent, policy) };
    const session = ownerOnly ? await requireOwnerSession() : auth ? await ensureWriteSession() : existingAuth ? await existingAuthSession() : null;
    const headers = baseHeaders(session?.access_token || '');
    let body;
    if (audio) {
      const form = new FormData();
      form.set('payload', JSON.stringify({ action, ...payload }));
      form.set('audio', audio.blob, audio.filename || 'audio.wav');
      body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ action, ...payload });
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetchImpl(endpoint, { method: 'POST', headers, body, cache: 'no-store', redirect: 'error', signal: controller.signal });
      let result;
      try { result = await response.json(); } catch { result = null; }
      if (!response.ok || result?.ok !== true) {
        if (!response.ok && response.status === 404) throw safeFailure(response.status, result?.error);
        throw safeFailure(response.status || 502, result?.error);
      }
      return result;
    } catch (error) {
      if (error instanceof SocialServerActionError) throw error;
      if (timedOut) throw new SocialServerActionError('timeout', 'サーバーの応答が時間切れになりました。結果を確認してから再試行してください。');
      if (signal?.aborted) throw new SocialServerActionError('aborted', '操作を中止しました。');
      throw new SocialServerActionError('network_error', 'サーバーに接続できませんでした。結果を確認してから再試行してください。');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }

  async function fetchOwnedAudio(postId) {
    if (!UUID.test(String(postId || ''))) throw new TypeError('投稿IDを確認してください。');
    const session = await requireOwnerSession();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const url = new URL(endpoint);
    url.searchParams.set('action', 'audio');
    url.searchParams.set('postId', postId);
    try {
      const response = await fetchImpl(url, { headers: baseHeaders(session.access_token), cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!response.ok) {
        let result = null;
        try { result = await response.json(); } catch { /* stream errors may have no JSON body */ }
        throw safeFailure(response.status, result?.error);
      }
      return await response.blob();
    } catch (error) {
      if (error instanceof SocialServerActionError) throw error;
      if (timedOut) throw new SocialServerActionError('timeout', '音声の読み込みが時間切れになりました。');
      throw new SocialServerActionError('network_error', '音声を読み込めませんでした。時間をおいて再試行してください。');
    } finally { clearTimeout(timer); }
  }

  return Object.freeze({
    list: (payload) => request('list', payload),
    get: (payload, options = {}) => request('get', payload, { existingAuth: options.authenticated === true, signal: options.signal }),
    mine: () => request('mine', {}, { ownerOnly: true }),
    submit: (payload) => {
      const { audio = null, ...data } = payload || {};
      return request('create', data, { auth: true, audio });
    },
    edit: (payload) => request('edit', payload, { auth: true }),
    remove: (postId) => request('delete', { postId }, { auth: true }),
    comments: () => { throw new SocialServerActionError('comments_disabled', 'コメント機能は利用できません。'); },
    createComment: () => { throw new SocialServerActionError('comments_disabled', 'コメント機能は利用できません。'); },
    editComment: () => { throw new SocialServerActionError('comments_disabled', 'コメント機能は利用できません。'); },
    removeComment: () => { throw new SocialServerActionError('comments_disabled', 'コメント機能は利用できません。'); },
    report: (payload) => request('report', payload, { auth: true }),
    getAudio: fetchOwnedAudio
  });
}
