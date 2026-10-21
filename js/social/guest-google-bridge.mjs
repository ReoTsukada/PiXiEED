import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';

const GUEST_KEY = 'PiXiEED:supabase-session:v1';
const INTENT_KEY = 'PiXiEED:google-guest-login-intent:v1';
const VERIFIER_KEY = 'PiXiEED:google-pkce-verifier:v1';
const DEVICE_KEY = 'PiXiEED:guest-device:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENT_TTL = 15 * 60 * 1000;

function safeJson(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }
function b64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Explicit Google-login continuation. No request is made until a user starts login or a callback is handled. */
export function createGuestGoogleBridge({
  windowRef = globalThis.window, storage = globalThis.localStorage, sessionStorage = globalThis.sessionStorage,
  api, auth, accountController, fetchImpl = globalThis.fetch, config = supabaseConfig,
  cryptoRef = globalThis.crypto, now = () => Date.now(), prepareLocal = null, completeLocal = null, cancelLocal = null
} = {}) {
  const project = new URL(String(config?.url || ''));
  const origin = project.origin;
  const key = String(config?.publishableKey || '');
  if (project.protocol !== 'https:' || !key) throw new Error('Googleログインの接続設定を確認できません。');
  const authUrl = (path) => `${origin}/auth/v1/${path}`;
  const headers = (token = '') => ({ apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/json', 'Content-Type': 'application/json' });
  const readIntent = () => {
    const intent = safeJson(storage?.getItem(INTENT_KEY));
    if (!intent || !UUID.test(String(intent.requestNonce || '')) || !UUID.test(String(intent.deviceId || '')) || intent.sourceGuestId && !UUID.test(String(intent.sourceGuestId)) || intent.targetId && !UUID.test(String(intent.targetId)) || !Number.isFinite(intent.createdAt) || !Number.isFinite(intent.expiresAt) || !['prepared', 'claiming', 'server_claimed', 'binding_local'].includes(intent.phase || 'prepared')) return null;
    return { phase: 'prepared', ...intent };
  };
  function assertCurrent(intent, phase = null) {
    const current = readIntent();
    if (!current || current.requestNonce !== intent.requestNonce || current.sourceGuestId !== intent.sourceGuestId || current.deviceId !== intent.deviceId || current.targetId !== intent.targetId || phase && current.phase !== phase || storage.getItem(DEVICE_KEY) !== intent.deviceId) throw new Error('Googleログインの準備状態が変わりました。元の作品を保持して再確認してください。');
    return current;
  }
  function setPhase(intent, phase, targetId = intent.targetId) {
    const current = assertCurrent(intent);
    const updated = { ...current, phase, ...(targetId ? { targetId } : {}) };
    storage.setItem(INTENT_KEY, JSON.stringify(updated));
    return updated;
  }
  function clearMatchingIntent(intent) {
    const current = readIntent();
    if (!current || current.requestNonce !== intent.requestNonce) throw new Error('別のGoogleログイン準備を保持しています。状態は変更しませんでした。');
    try {
      storage.removeItem(INTENT_KEY);
      const verifier = safeJson(sessionStorage?.getItem(VERIFIER_KEY));
      if (verifier?.requestNonce === intent.requestNonce) sessionStorage.removeItem(VERIFIER_KEY);
    } catch { throw new Error('Googleログインの準備状態を消去できません。'); }
    if (storage.getItem(INTENT_KEY) != null) throw new Error('Googleログインの準備状態を消去できません。');
  }
  function cancelPendingLogin() {
    const current = readIntent();
    if (!current) return;
    if (['claiming', 'server_claimed', 'binding_local'].includes(current.phase)) throw new Error('サーバー引き継ぎまたは端末への保存が進行中です。結果を確認するまで取り消せません。元の作品は保持されています。');
    if (current.snapshot != null && typeof cancelLocal !== 'function') throw new Error('端末の引き継ぎ準備を取り消せません。元の作品と準備状態は保持されています。');
    if (typeof cancelLocal === 'function') {
      const result = cancelLocal();
      if (result && typeof result.then === 'function') throw new Error('端末の引き継ぎ準備を同期的に取り消せません。保存状態を保持しています。');
    }
    clearMatchingIntent(current);
  }
  function cleanCallbackUrl() {
    const url = new URL(windowRef.location.href);
    const hasCallbackMaterial = url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('error_description') || Boolean(url.hash);
    if (!hasCallbackMaterial) return;
    url.searchParams.delete('code'); url.searchParams.delete('error'); url.searchParams.delete('error_description');
    url.hash = '';
    windowRef.history.replaceState(windowRef.history.state || {}, '', url);
  }
  async function verifyUser(token) {
    const response = await fetchImpl(authUrl('user'), { headers: headers(token), cache: 'no-store', redirect: 'error' });
    if (!response.ok) return null;
    let user; try { user = await response.json(); } catch { return null; }
    return UUID.test(String(user?.id || '')) ? user : null;
  }
  async function startGuestSource() {
    const rawGuest = storage?.getItem(GUEST_KEY);
    const guest = safeJson(rawGuest);
    if (!guest?.access_token || !guest?.refresh_token) return { id: '', accessToken: '' };
    let user = await verifyUser(guest.access_token);
    let verifiedSession = guest;
    if (storage.getItem(GUEST_KEY) !== rawGuest) throw new Error('ゲストのログイン状態が切り替わりました。');
    if (!user && typeof accountController?.captureGuest === 'function') {
      // An expired access token may be refreshed only through the existing
      // controller; verify the exact resulting stored token and its identity.
      const captured = await accountController.captureGuest();
      const refreshedRaw = storage.getItem(GUEST_KEY);
      verifiedSession = safeJson(refreshedRaw);
      if (!captured?.guestId || !captured?.accessToken || verifiedSession?.access_token !== captured.accessToken
          || !verifiedSession?.refresh_token || guest.user_id && captured.guestId !== guest.user_id) throw new Error('更新後のゲストログイン状態を確認できません。');
      user = await verifyUser(captured.accessToken);
      if (storage.getItem(GUEST_KEY) !== refreshedRaw) throw new Error('ゲストのログイン状態が切り替わりました。');
      if (!user || user.id !== captured.guestId || verifiedSession.user_id && verifiedSession.user_id !== user.id) throw new Error('更新後のゲストログイン状態を確認できません。');
    }
    if (!user || verifiedSession.user_id && verifiedSession.user_id !== user.id) throw new Error('ゲストのログイン状態を確認できません。');
    if (user.is_anonymous === false && user.email_confirmed_at) {
      // The same stored session may have been promoted to a registered account.
      // It is not a guest proof, so never ask the server to move it to another user.
      return { id: '', accessToken: '' };
    }
    if (user.is_anonymous !== true) throw new Error('ゲストのログイン状態を確認できません。');
    return { id: user.id, accessToken: verifiedSession.access_token };
  }
  async function beginGoogleLogin({ redirectTo = `${windowRef.location.origin}/profile/?view=posts`, includeLegacy = false } = {}) {
    if (!storage?.setItem || !sessionStorage?.setItem || !cryptoRef?.subtle || !cryptoRef?.getRandomValues) throw new Error('このブラウザーではGoogleログインを安全に開始できません。');
    if (readIntent()) throw new Error('Googleログインの準備が残っています。先に再試行するか取り消してください。');
    const source = await startGuestSource();
    const sourceGuestId = source.id;
    const currentDevice = storage.getItem(DEVICE_KEY);
    const deviceId = UUID.test(String(currentDevice || '')) ? currentDevice : cryptoRef.randomUUID();
    storage.setItem(DEVICE_KEY, deviceId);
    const requestNonce = cryptoRef.randomUUID();
    const intent = { sourceGuestId, deviceId, requestNonce, createdAt: now(), expiresAt: now() + INTENT_TTL };
    const snapshot = await prepareLocal?.({ sourceGuestId, deviceId, requestNonce, includeLegacy: includeLegacy === true }) ?? null;
    if (storage.getItem(DEVICE_KEY) !== deviceId) throw new Error('端末の引き継ぎ状態が変わりました。Googleログインは開始していません。');
    const latestGuest = safeJson(storage.getItem(GUEST_KEY));
    if (sourceGuestId && latestGuest?.access_token !== source.accessToken) throw new Error('ゲストログイン状態が変わりました。Googleログインは開始していません。');
    storage.setItem(INTENT_KEY, JSON.stringify({ ...intent, phase: 'prepared', snapshot }));
    const random = cryptoRef.getRandomValues(new Uint8Array(32));
    const verifier = b64url(random);
    const challenge = b64url(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    sessionStorage.setItem(VERIFIER_KEY, JSON.stringify({ requestNonce, verifier }));
    const url = new URL(`${origin}/auth/v1/authorize`);
    url.searchParams.set('provider', 'google');
    url.searchParams.set('redirect_to', redirectTo);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 's256');
    windowRef.location.assign(url.toString());
    return { requestNonce };
  }
  async function continueVerifiedTarget({ intent, verifiedTarget }) {
    assertCurrent(intent);
    const targetSession = await auth.getSession();
    assertCurrent(intent);
    const user = targetSession?.user;
    if (!targetSession?.access_token || user?.id !== verifiedTarget.id || user.is_anonymous !== false || !user.email_confirmed_at || intent.targetId && intent.targetId !== user.id) throw new Error('確認済みの登録アカウントを確認できません。引き継ぎは行いませんでした。');
    intent = setPhase(intent, intent.phase, user.id);
    if (typeof completeLocal !== 'function') throw new Error('この端末の作品保存機能を利用できないため、引き継ぎを開始できません。元の作品とログイン状態は保持されています。');
    let guestClaimed = false;
    if (intent.sourceGuestId) {
      assertCurrent(intent);
      const guestNow = safeJson(storage.getItem(GUEST_KEY));
      const sourceToken = guestNow?.access_token;
      const sourceUser = await verifyUser(sourceToken || '');
      assertCurrent(intent);
      const latestGuest = safeJson(storage.getItem(GUEST_KEY));
      if (!sourceUser || sourceUser.id !== intent.sourceGuestId || sourceUser.is_anonymous !== true || guestNow.user_id && guestNow.user_id !== sourceUser.id || latestGuest?.access_token !== sourceToken || latestGuest?.refresh_token !== guestNow.refresh_token) throw new Error('ログイン開始時のゲストアカウントを確認できません。引き継ぎは行いませんでした。');
      const claim = await accountController.claimForCurrentAccount({
        expectedTargetId: user.id,
        expectedGuestId: intent.sourceGuestId,
        beforeDispatch: () => {
          // The controller calls this synchronously inside its lock immediately
          // before dispatch, so cancellation or a changed intent fails closed.
          intent = setPhase(intent, 'claiming', user.id);
          assertCurrent(intent, 'claiming');
        }
      });
      assertCurrent(intent, 'claiming');
      const claimMatches = claim?.status === 'claimed'
        ? claim.userId === user.id && claim.guestId === intent.sourceGuestId && (!claim.requestKey || UUID.test(String(claim.requestKey)))
        : claim?.status === 'already_same_account' && claim.userId === user.id;
      if (!claimMatches) throw new Error('サーバーでゲスト投稿の引き継ぎを確認できませんでした。状態を保持して再試行してください。');
      const latestTarget = await auth.getSession();
      assertCurrent(intent, 'claiming');
      if (latestTarget?.user?.id !== user.id || latestTarget.user.is_anonymous !== false || !latestTarget.user.email_confirmed_at) throw new Error('引き継ぎ後のログイン先が変わりました。元のゲスト作品を保持しています。');
      guestClaimed = true;
      intent = setPhase(intent, 'server_claimed', user.id);
    } else {
      intent = setPhase(intent, 'server_claimed', user.id);
    }
    intent = setPhase(intent, 'binding_local', user.id);
    assertCurrent(intent, 'binding_local');
    const localResult = await completeLocal({ verifiedOwnerId: user.id, requestKey: intent.requestNonce, snapshot: intent.snapshot ?? null, guestClaimed });
    assertCurrent(intent, 'binding_local');
    if (localResult?.status !== 'bound' || localResult.ownerId !== user.id) throw new Error('端末の作品保存を確認できませんでした。元の作品と引き継ぎ状態を保持して再試行してください。');
    clearMatchingIntent(intent);
    windowRef.dispatchEvent(new CustomEvent('pixieed:guest-account-confirmed', { detail: { verifiedOwnerId: user.id, guestClaimed, requestKey: intent.requestNonce } }));
    return { status: 'verified', userId: user.id, guestClaimed, requestNonce: intent.requestNonce };
  }
  async function verifyAndRestore(session, intent = null) {
    if (!session?.access_token || !session?.refresh_token) throw new Error('Googleログイン情報を確認できません。');
    const preverified = await verifyUser(session.access_token);
    if (intent) assertCurrent(intent);
    if (!preverified || preverified.is_anonymous !== false || !preverified.email_confirmed_at) throw new Error('確認済みの登録アカウントを確認できません。引き継ぎは行いませんでした。');
    const verifiedTarget = await api.restore(session);
    if (intent) assertCurrent(intent);
    if (!verifiedTarget?.id || verifiedTarget.id !== preverified.id || !UUID.test(String(verifiedTarget.id))) throw new Error('ログイン先アカウントを確認できません。');
    return verifiedTarget;
  }
  async function handleCallback({ legacyCallback = null, callbackCode = '', callbackError = false } = {}) {
    const current = new URL(windowRef.location.href);
    const code = callbackCode || current.searchParams.get('code');
    const error = callbackError || current.searchParams.has('error');
    const hasLegacy = Boolean(legacyCallback?.session || legacyCallback?.error);
    if (!code && !error && !hasLegacy) return { status: 'none' };
    cleanCallbackUrl(); // Remove callback material before any asynchronous operation.
    if (error || legacyCallback?.error) {
      const pending = readIntent();
      if (pending) cancelPendingLogin();
      return { status: 'cancelled', message: 'ログインを完了できませんでした。必要ならもう一度Googleログインを選んでください。' };
    }
    const intent = readIntent();
    if (!intent) {
      // Older implicit callbacks can still restore an account, but never claim or bind local work.
      if (legacyCallback?.session) {
        const user = await verifyAndRestore(legacyCallback.session);
        return { status: 'login_only', userId: user.id };
      }
      return { status: 'ignored', message: 'ログイン開始時の確認が見つかりません。必要ならGoogleログインをやり直してください。' };
    }
    if ((intent.expiresAt < now() && intent.phase === 'prepared') || storage.getItem(DEVICE_KEY) !== intent.deviceId) {
      if (intent.phase === 'prepared') clearMatchingIntent(intent);
      return { status: 'ignored', message: 'ログイン開始時の端末確認が見つからないか、有効期限が切れています。必要ならGoogleログインをやり直してください。' };
    }
    if (!code && legacyCallback?.session) {
      // A fragment token cannot prove that this was the PKCE login started for this intent.
      // Keep the guest intent and verifier intact; only an exchanged code can authorize transfer.
      return { status: 'rejected', message: 'このログインは確認できませんでした。元のゲスト作品を保持しています。ログイン準備を取り消して、Googleログインをやり直してください。' };
    }
    const verifierRecord = safeJson(sessionStorage?.getItem(VERIFIER_KEY));
    if (!verifierRecord || verifierRecord.requestNonce !== intent.requestNonce || typeof verifierRecord.verifier !== 'string') throw new Error('Googleログインの確認情報が見つかりません。状態を保持して再試行してください。');
    const response = await fetchImpl(authUrl('token?grant_type=pkce'), {
      method: 'POST', headers: headers(), cache: 'no-store', redirect: 'error',
      body: JSON.stringify({ auth_code: code, code_verifier: verifierRecord.verifier })
    });
    assertCurrent(intent);
    if (!response.ok) throw new Error('Googleログインを確認できませんでした。ログイン準備を取り消してからGoogleログインをやり直してください。元の作品は保持されています。');
    const session = await response.json();
    assertCurrent(intent);
    const target = await verifyAndRestore(session, intent);
    assertCurrent(intent);
    return continueVerifiedTarget({ intent: assertCurrent(intent), verifiedTarget: target });
  }
  async function resumePendingLogin() {
    const intent = readIntent();
    if (!intent || !intent.targetId || intent.expiresAt < now() && intent.phase === 'prepared' || storage.getItem(DEVICE_KEY) !== intent.deviceId) throw new Error('確認済みのGoogleログイン先がありません。ログインをやり直してください。');
    const target = await api.restore();
    assertCurrent(intent);
    if (!target?.id || target.id !== intent.targetId) throw new Error('ログイン開始時のアカウントを確認できません。');
    return continueVerifiedTarget({ intent, verifiedTarget: target });
  }

  return Object.freeze({ beginGoogleLogin, handleCallback, resumePendingLogin, cancelPendingLogin, readPendingIntent: readIntent, get localAvailable() { return typeof prepareLocal === 'function' && typeof completeLocal === 'function'; } });
}
