import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';

const GUEST_KEY = 'PiXiEED:supabase-session:v1';
const ACCOUNT_KEY = 'PiXiEED:legacy-owner-session:v1';
const RECOVERY_KEY = 'PiXiEED:auth-session-recovery:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP = /^[A-Za-z0-9]{6,12}$/;
const SESSION_KEYS = [GUEST_KEY, ACCOUNT_KEY];

function readRaw(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try { return storage.getItem(key); } catch { throw new Error('保存済みログイン情報を読み取れません。'); }
}
function readSession(storage, key) {
  const raw = readRaw(storage, key);
  if (raw == null || raw === '') return null;
  try {
    const value = JSON.parse(raw);
    const session = value?.currentSession && typeof value.currentSession === 'object' ? value.currentSession : value;
    if (!session || typeof session !== 'object' || Array.isArray(session) || typeof session.access_token !== 'string' || !session.access_token || typeof session.refresh_token !== 'string' || !session.refresh_token) {
      throw new Error('invalid session');
    }
    return session;
  } catch { throw new Error('保存済みログイン情報を読み取れません。'); }
}
function sessionUserId(session) { return String(session?.user_id || session?.user?.id || ''); }
function validateEmail(input) {
  const email = String(input || '').trim();
  if (!EMAIL.test(email)) throw new TypeError('メールアドレスを確認してください。');
  return email;
}
function validateCode(input) {
  const code = String(input || '').trim();
  if (!OTP.test(code)) throw new TypeError('確認コードを確認してください。');
  return code;
}

/** REST-only Auth adapter. It performs no requests until one of its methods is called. */
export function createGuestAuthAdapter({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, config = supabaseConfig, timeoutMs = 12_000 } = {}) {
  const url = new URL(String(config?.url || ''));
  const origin = url.origin;
  const projectRef = url.hostname.split('.')[0];
  const oauthSessionKey = `sb-${projectRef}-auth-token`;
  const key = String(config?.publishableKey || '');
  if (url.protocol !== 'https:' || !key) throw new Error('アカウントの接続設定を確認できません。');
  const headers = (token = '') => ({ apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/json', 'Content-Type': 'application/json' });
  const snapshot = () => Object.fromEntries([...SESSION_KEYS, oauthSessionKey].map((name) => [name, readRaw(storage, name)]));
  const unchanged = (before, names = Object.keys(before)) => names.every((name) => before[name] === readRaw(storage, name));
  function assertUnchanged(before, names) { if (!unchanged(before, names)) throw new Error('ログイン状態が切り替わりました。再試行してください。'); }
  async function fingerprint(value) {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  async function recoveryRecord({ kind, targetKey, expectedId, session, before }) {
    const sourceFingerprints = {};
    for (const name of Object.keys(before)) sourceFingerprints[name] = await fingerprint(before[name]);
    return { kind, targetKey, expectedId, session, sourceFingerprints };
  }
  function readRecovery() {
    const raw = readRaw(storage, RECOVERY_KEY);
    if (raw == null) return null;
    let record;
    try { record = JSON.parse(raw); } catch { throw new Error('認証復旧情報を読み取れません。'); }
    const allowedKind = ['guest_refresh', 'guest_signup', 'registered_refresh', 'email_verify', 'existing_login'];
    const allowedTarget = [GUEST_KEY, ACCOUNT_KEY, oauthSessionKey];
    if (!record || !allowedKind.includes(record.kind) || !allowedTarget.includes(record.targetKey) || !UUID.test(String(record.expectedId || '')) || !record.session?.access_token || !record.session?.refresh_token || !record.sourceFingerprints || typeof record.sourceFingerprints !== 'object') throw new Error('認証復旧情報を読み取れません。');
    return record;
  }
  function saveRecovery(record) {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('認証復旧情報を保存できません。');
    const serialized = JSON.stringify(record);
    try { storage.setItem(RECOVERY_KEY, serialized); } catch { throw new Error('認証復旧情報を保存できません。'); }
    if (readRaw(storage, RECOVERY_KEY) !== serialized) throw new Error('認証復旧情報を保存できません。');
  }
  function clearRecovery() {
    try { if (!storage?.removeItem) throw new Error(); storage.removeItem(RECOVERY_KEY); } catch { throw new Error('認証復旧状態を更新できません。再読み込みして確認してください。'); }
    if (readRaw(storage, RECOVERY_KEY) != null) throw new Error('認証復旧状態を更新できません。再読み込みして確認してください。');
  }
  async function assertRecoverySources(record) {
    for (const [name, digest] of Object.entries(record.sourceFingerprints)) {
      if (name === record.targetKey) {
        const committed = readSession(storage, name);
        if (sessionUserId(committed) === record.expectedId && committed.access_token === record.session.access_token && committed.refresh_token === record.session.refresh_token) continue;
      }
      if (await fingerprint(readRaw(storage, name)) !== digest) throw new Error('ログイン状態が切り替わりました。復旧情報を保持したまま確認してください。');
    }
  }
  function recoveryPolicy(record, user) {
    if (!user || user.id !== record.expectedId) return false;
    if (['guest_refresh','guest_signup'].includes(record.kind)) return user.is_anonymous === true;
    return user.is_anonymous === false && Boolean(user.email_confirmed_at);
  }
  async function recoverPending() {
    const record = readRecovery();
    if (!record) return null;
    await assertRecoverySources(record);
    const user = await userFor(record.session);
    if (!recoveryPolicy(record, user)) throw new Error('認証結果を確認できません。復旧情報を保持して再試行してください。');
    await assertRecoverySources(record);
    const saved = { ...record.session, user, user_id: user.id };
    store(record.targetKey, saved);
    clearRecovery();
    return { ...saved, user };
  }
  async function savePendingResponse({ kind, targetKey, expectedId, session, before }) {
    if (!UUID.test(String(expectedId || '')) || !session?.access_token || !session?.refresh_token) throw new Error('認証応答を確認できません。');
    assertUnchanged(before);
    const record = await recoveryRecord({ kind, targetKey, expectedId, session, before });
    assertUnchanged(before);
    saveRecovery(record);
    assertUnchanged(before);
    return record;
  }
  async function boundedFetch(input, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    try { return await fetchImpl(input, { ...options, signal: controller.signal }); }
    catch { throw new Error('認証サーバーに接続できませんでした。時間をおいて再試行してください。'); }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  }
  async function request(path, { token = '', method = 'POST', body } = {}) {
    const response = await boundedFetch(`${origin}/auth/v1/${path}`, { method, headers: headers(token), body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error' });
    let payload = null;
    try { payload = await response.json(); } catch { /* invalid response stays opaque */ }
    if (!response.ok) throw new Error('認証を完了できませんでした。入力内容を確認して再試行してください。');
    return payload;
  }
  async function userFor(session) {
    if (!session?.access_token) return null;
    const response = await boundedFetch(`${origin}/auth/v1/user`, { headers: headers(session.access_token), cache: 'no-store', redirect: 'error' });
    if (!response.ok) return null;
    let user;
    try { user = await response.json(); } catch { return null; }
    return UUID.test(String(user?.id || '')) ? user : null;
  }
  function store(keyName, session) {
    if (!session?.access_token || !session?.refresh_token) throw new Error('ログイン情報を保存できません。');
    if (!storage || typeof storage.setItem !== 'function') throw new Error('ログイン情報を保存できません。');
    try { storage.setItem(keyName, JSON.stringify({ ...session, user_id: session.user?.id || session.user_id })); }
    catch { throw new Error('ログイン情報を保存できません。'); }
    if (readRaw(storage, keyName) !== JSON.stringify({ ...session, user_id: session.user?.id || session.user_id })) {
      // Storage implementations may canonicalize values; confirm a usable session instead.
      const saved = readSession(storage, keyName);
      if (saved?.access_token !== session.access_token || saved?.refresh_token !== session.refresh_token) throw new Error('ログイン情報を保存できません。');
    }
  }
  async function refreshStored(keyName, original, before) {
    if (!original?.refresh_token) throw new Error('ログイン状態を確認できません。もう一度ログインしてください。');
    const expectedId = sessionUserId(original);
    if (!UUID.test(expectedId)) throw new Error('登録済みアカウントの所有者を確認できません。もう一度ログインしてください。');
    const refreshed = await request('token?grant_type=refresh_token', { body: { refresh_token: original.refresh_token } });
    const pending = await savePendingResponse({ kind: 'registered_refresh', targetKey: keyName, expectedId, session: refreshed, before });
    const user = await userFor(refreshed);
    if (!user || user.is_anonymous !== false || !user.email_confirmed_at || expectedId && user.id !== expectedId) throw new Error('登録済みアカウントのログインを更新できません。もう一度ログインしてください。');
    await assertRecoverySources(pending);
    const saved = { ...refreshed, user_id: user.id, user };
    store(keyName, saved);
    clearRecovery();
    return { ...saved, user };
  }
  async function refreshGuest() {
    const pending = readRecovery();
    if (pending) {
      if (pending.kind !== 'guest_refresh') throw new Error('別の認証操作の復旧が必要です。再読み込みして確認してください。');
      return recoverPending();
    }
    const before = snapshot();
    const guest = readSession(storage, GUEST_KEY);
    if (!guest?.refresh_token) throw new Error('ゲストセッションを更新できません。');
    const refreshed = await request('token?grant_type=refresh_token', { body: { refresh_token: guest.refresh_token } });
    const expectedId = sessionUserId(guest);
    if (!UUID.test(expectedId)) throw new Error('ゲストセッションの所有者を確認できません。');
    const recovery = await savePendingResponse({ kind: 'guest_refresh', targetKey: GUEST_KEY, expectedId, session: refreshed, before });
    const user = await userFor(refreshed);
    if (!user || user.is_anonymous !== true || user.id !== expectedId) throw new Error('ゲストセッションを確認できません。');
    await assertRecoverySources(recovery);
    const value = { ...refreshed, user_id: user.id };
    store(GUEST_KEY, value);
    clearRecovery();
    return { ...value, user };
  }
  async function getSession() {
    const recovered = await recoverPending();
    if (recovered) return recovered;
    const before = snapshot();
    // The app's explicit registered session is authoritative over Supabase SDK OAuth storage.
    for (const [name, keyName] of [[ACCOUNT_KEY, ACCOUNT_KEY], [oauthSessionKey, oauthSessionKey]]) {
      const registered = readSession(storage, name);
      if (!registered) continue;
      const user = await userFor(registered);
      if (user?.is_anonymous === false && user.email_confirmed_at && (!sessionUserId(registered) || sessionUserId(registered) === user.id)) {
        assertUnchanged(before);
        return { ...registered, user };
      }
      return refreshStored(keyName, registered, before);
    }
    const guest = readSession(storage, GUEST_KEY);
    if (!guest?.access_token || !guest?.refresh_token) return null;
    const user = await userFor(guest);
    if (user?.is_anonymous === true && (!sessionUserId(guest) || sessionUserId(guest) === user.id)) {
      assertUnchanged(before);
      return { ...guest, user };
    }
    return refreshGuest();
  }
  // Explicit registration only: a person may have drawn locally without ever posting.
  async function ensureGuestSession() {
    const recovered = await recoverPending();
    if (recovered) {
      if (recovered.user?.is_anonymous !== true) throw new Error('登録済みのアカウントで続行してください。');
      return recovered;
    }
    const before = snapshot();
    if (before[ACCOUNT_KEY] != null || before[oauthSessionKey] != null) throw new Error('保存済みのアカウントでログイン状態を確認してください。');
    const existing = readSession(storage, GUEST_KEY);
    if (existing) {
      const user = await userFor(existing);
      if (user?.is_anonymous === true && (!sessionUserId(existing) || user.id === sessionUserId(existing))) {
        assertUnchanged(before); return {...existing,user};
      }
      return refreshGuest();
    }
    const session = await request('signup', {body:{data:{app:'pixieed',mode:'anonymous-local-registration'}}});
    const expectedId = sessionUserId(session);
    const pending = await savePendingResponse({kind:'guest_signup',targetKey:GUEST_KEY,expectedId,session,before});
    const user = await userFor(session);
    if (user?.id !== expectedId || user.is_anonymous !== true) throw new Error('登録用のゲストセッションを確認できませんでした。');
    await assertRecoverySources(pending);
    const saved = {...session,user,user_id:user.id};
    store(GUEST_KEY,saved);clearRecovery();return saved;
  }
  async function sendExistingLoginCode(input) {
    const email = validateEmail(input);
    await request('otp', { body: { email, create_user: false } });
    return { status: 'code_sent' };
  }
  async function verifyExistingLoginCode({ email: inputEmail, code: inputCode }) {
    const pendingRecovery = readRecovery();
    if (pendingRecovery) {
      if (pendingRecovery.kind !== 'existing_login') throw new Error('別の認証操作の復旧が必要です。再読み込みして確認してください。');
      return recoverPending();
    }
    const email = validateEmail(inputEmail), code = validateCode(inputCode), before = snapshot();
    const session = await request('verify', { body: { email, token: code, type: 'email' } });
    const expectedId = sessionUserId(session);
    const pending = await savePendingResponse({ kind: 'existing_login', targetKey: ACCOUNT_KEY, expectedId, session, before });
    const user = await userFor(session);
    if (!user || user.is_anonymous !== false || !user.email_confirmed_at) throw new Error('確認済みアカウントを読み込めませんでした。');
    await assertRecoverySources(pending);
    const saved = { ...session, user, user_id: user.id };
    store(ACCOUNT_KEY, saved);
    clearRecovery();
    return { access_token: session.access_token, refresh_token: session.refresh_token, user };
  }
  async function beginEmailRegistration(inputEmail) {
    const email = validateEmail(inputEmail);
    const before = await getSession();
    if (!before?.user || before.user.is_anonymous !== true) throw new Error('ゲストアカウントで続行してください。');
    const beforeSnapshot = snapshot();
    const guestRaw = readRaw(storage, GUEST_KEY);
    await request('user', { token: before.access_token, method: 'PUT', body: { email } });
    assertUnchanged(beforeSnapshot);
    if (guestRaw !== readRaw(storage, GUEST_KEY)) throw new Error('ゲストセッションが切り替わりました。確認コードを再送してください。');
    return { status: 'verification_required', userId: before.user.id };
  }
  async function verifyEmailRegistration({ email: inputEmail, code: inputCode, password = '' }) {
    const email = validateEmail(inputEmail), code = validateCode(inputCode);
    const existingRecovery = readRecovery();
    if (existingRecovery) {
      if (existingRecovery.kind !== 'email_verify') throw new Error('別の認証操作の復旧が必要です。再読み込みして確認してください。');
      const recovered = await recoverPending();
      if (recovered.user.id !== sessionUserId(readSession(storage, GUEST_KEY))) throw new Error('確認したアカウントがゲストと一致しません。');
      return { status: 'promoted', user: recovered.user, passwordSet: false };
    }
    const beforeSnapshot = snapshot();
    const before = readSession(storage, GUEST_KEY);
    const guestId = sessionUserId(before);
    if (!before?.access_token || !UUID.test(guestId)) throw new Error('ゲストセッションが見つかりません。');
    const verifiedSession = await request('verify', { body: { email, token: code, type: 'email_change' } });
    const pending = await savePendingResponse({ kind: 'email_verify', targetKey: ACCOUNT_KEY, expectedId: guestId, session: verifiedSession, before: beforeSnapshot });
    const verifiedUser = await userFor(verifiedSession);
    if (!verifiedUser || verifiedUser.id !== guestId || verifiedUser.is_anonymous !== false || !verifiedUser.email_confirmed_at) throw new Error('同じゲストアカウントのメール確認を完了できませんでした。');
    await assertRecoverySources(pending);
    const saved = { ...verifiedSession, user: verifiedUser, user_id: guestId };
    store(ACCOUNT_KEY, saved);
    clearRecovery();
    if (String(password || '').length > 0) {
      await request('user', { token: verifiedSession.access_token, method: 'PUT', body: { password } });
      const finalUser = await userFor(verifiedSession);
      if (!finalUser || finalUser.id !== guestId || finalUser.is_anonymous !== false || !finalUser.email_confirmed_at) throw new Error('登録結果を確認できませんでした。ログイン状態は保存されています。');
    }
    return { status: 'promoted', user: verifiedUser, passwordSet: String(password || '').length > 0 };
  }
  return Object.freeze({ getSession, refreshGuest, ensureGuestSession, sendExistingLoginCode, verifyExistingLoginCode, beginEmailRegistration, verifyEmailRegistration });
}
