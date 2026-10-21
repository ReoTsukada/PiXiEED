import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';

const GUEST_SESSION_KEY = 'PiXiEED:supabase-session:v1';
const RECEIPT_KEY = 'PiXiEED:guest-account-confirmed:v1';
const PENDING_KEY = 'PiXiEED:guest-account-claim:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readJson(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') throw new Error('保存済みアカウント情報を読み取れません。');
  let raw;
  try { raw = storage.getItem(key); } catch { throw new Error('保存済みアカウント情報を読み取れません。'); }
  if (raw == null || raw === '') return null;
  try { return JSON.parse(raw); } catch { throw new Error('保存済みアカウント情報を読み取れません。'); }
}
function safePending(value) {
  if (!value || !UUID.test(String(value.guestId || '')) || !UUID.test(String(value.targetId || '')) || !UUID.test(String(value.requestKey || ''))) return null;
  return { guestId: value.guestId, targetId: value.targetId, requestKey: value.requestKey };
}

/** Guest-account operations are explicit. Constructing this controller makes no Auth request. */
export function createGuestAccountController({
  fetchImpl = globalThis.fetch, storage = globalThis.localStorage, config = supabaseConfig,
  auth, locks = globalThis.navigator?.locks, randomUUID = () => globalThis.crypto.randomUUID(), timeoutMs = 12_000
} = {}) {
  const origin = new URL(String(config?.url || '')).origin;
  const key = String(config?.publishableKey || '');
  if (!/^https:\/\//.test(origin) || !key) throw new Error('アカウントの接続設定を確認できません。');
  const headers = (token) => ({ apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' });
  async function boundedFetch(input, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, {once:true});
    try { return await fetchImpl(input, { ...options, signal: controller.signal }); }
    catch { throw new Error('アカウント確認の通信が完了しませんでした。時間をおいて再試行してください。'); }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  }
  const readGuest = () => readJson(storage, GUEST_SESSION_KEY);
  const getPending = () => {
    const raw = readJson(storage, PENDING_KEY);
    if (raw == null) return null;
    const pending = safePending(raw);
    if (!pending) throw new Error('引き継ぎ状態を読み取れません。再試行を停止してください。');
    return pending;
  };
  const savePending = (value) => {
    try {
      if (!storage?.setItem) throw new Error();
      const serialized = JSON.stringify(value);
      storage.setItem(PENDING_KEY, serialized);
      if (storage.getItem(PENDING_KEY) !== serialized) throw new Error();
    } catch { throw new Error('引き継ぎ情報を保存できません。'); }
  };
  const clearPending = () => {
    try {
      if (!storage?.removeItem) throw new Error();
      storage.removeItem(PENDING_KEY);
      if (storage.getItem(PENDING_KEY) != null) throw new Error();
    } catch { throw new Error('引き継ぎ状態を保存できません。もう一度状態を確認してください。'); }
  };
  let operationQueue = Promise.resolve();

  async function verifiedUser(token) {
    const response = await boundedFetch(`${origin}/auth/v1/user`, { headers: headers(token), cache: 'no-store', redirect: 'error' });
    if (!response.ok) return null;
    const user = await response.json();
    return UUID.test(String(user?.id || '')) ? user : null;
  }

  async function captureGuest() {
    let guestSession = readGuest();
    if (!guestSession?.access_token || !guestSession?.refresh_token) throw new Error('ゲストの投稿セッションが見つかりません。');
    let user = await verifiedUser(guestSession.access_token);
    if (!user && auth?.refreshGuest) {
      const refreshed = await auth.refreshGuest();
      guestSession = readGuest();
      user = refreshed?.user || await verifiedUser(guestSession?.access_token);
    }
    if (!user || user.is_anonymous !== true || guestSession.user_id && guestSession.user_id !== user.id) throw new Error('ゲストセッションを確認できません。');
    return { guestId: user.id, accessToken: guestSession.access_token, user };
  }

  async function captureSource() {
    let guestSession = readGuest();
    if (!guestSession?.access_token || !guestSession?.refresh_token) throw new Error('ゲストの投稿セッションが見つかりません。');
    let user = await verifiedUser(guestSession.access_token);
    if (!user && auth?.refreshGuest) {
      const refreshed = await auth.refreshGuest();
      guestSession = readGuest();
      user = refreshed?.user || await verifiedUser(guestSession?.access_token);
    }
    if (!user || !UUID.test(String(user.id)) || guestSession.user_id && guestSession.user_id !== user.id) throw new Error('ゲストセッションを確認できません。');
    return { guestId: user.id, accessToken: guestSession.access_token, user };
  }

  async function promoteCurrent({ email }) {
    if (!auth?.getSession || !auth?.beginEmailRegistration) throw new Error('メール登録には認証機能が必要です。');
    return runLocked(async () => {
      let before = await auth.getSession();
      if (!before && readGuest() == null && auth.ensureGuestSession) before = await auth.ensureGuestSession();
      const guest = await captureGuest();
      if (before?.user?.id !== guest.guestId || before?.user?.is_anonymous !== true) throw new Error('ゲストセッションが切り替わりました。');
      return auth.beginEmailRegistration(email);
    });
  }

  async function verifyEmailRegistration({ email, code, password }) {
    if (!auth?.verifyEmailRegistration) throw new Error('メール確認機能が必要です。');
    return runLocked(() => auth.verifyEmailRegistration({ email, code, password }));
  }

  async function sendExistingLoginCode(email) {
    if (!auth?.sendExistingLoginCode) throw new Error('ログイン機能が必要です。');
    return auth.sendExistingLoginCode(email);
  }

  async function verifyExistingLoginCode(credentials) {
    if (!auth?.verifyExistingLoginCode) throw new Error('ログイン機能が必要です。');
    return runLocked(() => auth.verifyExistingLoginCode(credentials));
  }

  async function claimForCurrentAccount({expectedTargetId, expectedGuestId, beforeDispatch, signal} = {}) {
    return runLocked(async () => {
      if (signal?.aborted) throw new Error('引き継ぎを中止しました。元の作品は保持しています。');
      const targetSession = await auth?.getSession?.();
      const target = targetSession?.user;
      if (!targetSession?.access_token || !UUID.test(String(target?.id || '')) || target.is_anonymous !== false || !target.email_confirmed_at) throw new Error('引き継ぎ先のアカウントにログインしてください。');
      if (expectedTargetId && target.id !== expectedTargetId) throw new Error('引き継ぎ先のログインが変わりました。移管していません。');
      const guest = await captureSource();
      if (expectedGuestId && guest.guestId !== expectedGuestId) throw new Error('引き継ぎ元のログインが変わりました。移管していません。');
      if (target.id === guest.guestId && guest.user.is_anonymous === false && guest.user.email_confirmed_at) return { status: 'already_same_account', userId: target.id };
      if (guest.user.is_anonymous !== true) throw new Error('引き継ぎ元がゲストアカウントではありません。');
      let pending = getPending();
      const confirmedRaw = readJson(storage, RECEIPT_KEY);
      const confirmed = confirmedRaw == null ? null : safePending(confirmedRaw);
      if (confirmedRaw && !confirmed) throw new Error('引き継ぎ確認記録を読み取れません。元の情報を保持しています。');
      if (pending && (pending.guestId !== guest.guestId || pending.targetId !== target.id)) throw new Error('別のアカウント向けの引き継ぎが保留中です。');
      if (!pending) {
        pending = { guestId: guest.guestId, targetId: target.id, requestKey: confirmed?.guestId === guest.guestId && confirmed?.targetId === target.id ? confirmed.requestKey : randomUUID() };
        savePending(pending);
      }
      // Ensure the two identities have not changed while the request was prepared.
      const currentGuest = readGuest();
      const currentTarget = await auth.getSession();
      if (currentGuest?.access_token !== guest.accessToken || currentTarget?.user?.id !== target.id || currentTarget?.access_token !== targetSession.access_token) throw new Error('ログイン状態が変わりました。引き継ぎを再試行してください。');
      if (signal?.aborted) throw new Error('引き継ぎを中止しました。元の作品は保持しています。');
      if (beforeDispatch) {
        const dispatched = beforeDispatch();
        if (dispatched && typeof dispatched.then === 'function') throw new Error('引き継ぎ開始の確認は同期処理で行ってください。');
      }
      const response = await boundedFetch(`${origin}/functions/v1/social-feed`, {
        method: 'POST', headers: headers(targetSession.access_token), cache: 'no-store', redirect: 'error', signal,
        body: JSON.stringify({ action: 'claim-guest', requestKey: pending.requestKey, guestAccessToken: guest.accessToken })
      });
      let result = null;
      try { result = await response.json(); } catch { /* failed or uncertain response is safely retryable */ }
      const claim = result?.claim;
      if (!response.ok || result?.ok !== true || claim?.requestKey !== pending.requestKey || claim?.guestId !== guest.guestId || claim?.ownerId !== target.id) throw new Error('引き継ぎを確認できませんでした。セッションを保持したまま再試行してください。');
      const latestGuest = readGuest();
      const latestTarget = await auth.getSession();
      if (latestGuest?.access_token !== guest.accessToken || latestTarget?.user?.id !== target.id || latestTarget?.access_token !== targetSession.access_token) throw new Error('引き継ぎはサーバーで確認されました。ログイン状態を更新してから再読み込みしてください。');
      try {
        storage.setItem(RECEIPT_KEY, JSON.stringify(pending));
        if (storage.getItem(RECEIPT_KEY) !== JSON.stringify(pending)) throw new Error();
      } catch { throw new Error('サーバーの引き継ぎは確認済みですが、端末への確認記録を保存できませんでした。同じ操作を再試行してください。'); }
      clearPending();
      // Keep the guest session itself: unrelated local drafts/audio and legacy data remain intact.
      return { status: 'claimed', userId: target.id, guestId: guest.guestId, requestKey:pending.requestKey };
    });
  }

  async function runLocked(operation) {
    if (locks?.request) return locks.request('pixieed-guest-account', { mode: 'exclusive' }, operation);
    const next = operationQueue.catch(() => {}).then(operation);
    operationQueue = next.catch(() => {});
    return next;
  }

  return Object.freeze({
    get pending() { return getPending(); },
    captureGuest,
    captureSource,
    promoteCurrent,
    verifyEmailRegistration,
    sendExistingLoginCode,
    verifyExistingLoginCode,
    claimForCurrentAccount
  });
}
