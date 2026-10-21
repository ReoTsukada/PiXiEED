const REGISTRY_DB = 'pixieed-local-work-ownership-v1';
const REGISTRY_VERSION = 1;
const REGISTRY_STORE = 'ownership';
const DEVICE_KEY = 'PiXiEED:local-work-device:v1';
const ACTIVE_KEY = 'PiXiEED:local-work-account:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[A-Za-z0-9:_-]{1,180}$/;
const SOURCES = Object.freeze([
  { namespace: 'pxd', database: 'pixieed-pxd-v1', store: 'projects', kind: 'project' },
  { namespace: 'creation-draft', database: 'pixieed-creation-drafts-v1', store: 'drafts', kind: 'draft' },
  { namespace: 'feed-draft', database: 'pixieed-social-drafts-v1', store: 'entries', kind: 'feed' }
]);

function registryKey(namespace, id) { return `${namespace}:${id}`; }
function validWork(namespace, id) {
  return SOURCES.some((source) => source.namespace === namespace) && typeof id === 'string' && KEY_RE.test(id);
}
function clone(value) { return value == null ? value : structuredClone(value); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function validRevision(value) { return value == null || typeof value === 'string' && value.length <= 180; }
function authStorageSnapshot(storage) {
  for (const key of ['PiXiEED:legacy-owner-session:v1', 'PiXiEED:supabase-session:v1']) {
    let raw;
    try { raw = storage?.getItem(key); } catch { throw new Error('ログイン状態を読み取れません。'); }
    if (raw != null) return { key, raw };
  }
  if (storage && Number.isInteger(storage.length) && typeof storage.key === 'function') {
    for (let index = 0; index < storage.length; index += 1) {
      let key;
      try { key = storage.key(index); } catch { throw new Error('ログイン状態を読み取れません。'); }
      if (typeof key === 'string' && /^sb-[A-Za-z0-9_-]+-auth-token$/.test(key)) {
        let raw;
        try { raw = storage.getItem(key); } catch { throw new Error('ログイン状態を読み取れません。'); }
        return { key, raw };
      }
    }
  }
  return null;
}
async function activeRecord(storage, fingerprintNow, initialSnapshot = authStorageSnapshot(storage)) {
  let raw;
  try { raw = storage?.getItem(ACTIVE_KEY); } catch { throw new Error('ローカルアカウント情報を読み取れません。'); }
  if (raw == null) return null;
  let record;
  try { record = JSON.parse(raw); } catch { throw new Error('ローカルアカウント情報を読み取れません。'); }
  if (!record || !UUID.test(String(record.accountId || '')) || !/^[a-f0-9]{64}$/i.test(String(record.sessionFingerprint || ''))) throw new Error('ローカルアカウント情報を読み取れません。');
  let current = '';
  try { current = String(await fingerprintNow?.() || ''); } catch { return null; }
  if (!same(initialSnapshot, authStorageSnapshot(storage))) return null;
  return current && current === record.sessionFingerprint ? { record, authSnapshot: initialSnapshot } : null;
}

function openRegistry(indexedDBRef) {
  return new Promise((resolve, reject) => {
    if (!indexedDBRef?.open) { reject(new Error('端末内の所有情報を利用できません。')); return; }
    let request;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) { if (fn === resolve) { try { value?.close(); } catch {} } return; }
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('所有情報データベースの応答がありません。')), 8000);
    try { request = indexedDBRef.open(REGISTRY_DB, REGISTRY_VERSION); } catch { finish(reject, new Error('端末内の所有情報を開けません。')); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REGISTRY_STORE)) db.createObjectStore(REGISTRY_STORE, { keyPath: 'key' });
    };
    request.onerror = () => finish(reject, new Error('端末内の所有情報を開けません。'));
    request.onblocked = () => finish(reject, new Error('別のタブが所有情報を使用中です。時間をおいて再試行してください。'));
    request.onsuccess = () => finish(resolve, request.result);
  });
}

function createIndexedDbOwnershipAdapter(indexedDBRef = globalThis.indexedDB) {
  const db = () => openRegistry(indexedDBRef);
  return {
    async all() {
      const database = await db();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(REGISTRY_STORE, 'readonly');
        const request = tx.objectStore(REGISTRY_STORE).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new Error('ローカル所有情報を読み込めません。'));
        tx.onabort = tx.onerror = () => reject(new Error('ローカル所有情報を読み込めません。'));
      }).finally(() => database.close());
    },
    async atomic(keys, decide) {
      const database = await db();
      return new Promise((resolve, reject) => {
        let tx;
        let rows = new Array(keys.length);
        let count = 0;
        let result;
        try {
          tx = database.transaction(REGISTRY_STORE, 'readwrite');
          const store = tx.objectStore(REGISTRY_STORE);
          if (!keys.length) throw new Error('empty transaction');
          keys.forEach((key, index) => {
            const request = store.get(key);
            request.onsuccess = () => {
              rows[index] = request.result || null;
              count += 1;
              if (count !== keys.length) return;
              try {
                const decision = decide(rows.map(clone));
                result = decision.result;
                try { for (const row of decision.writes || []) store.put(row); }
                catch (error) { try { tx.abort(); } catch {} reject(error); }
              } catch (error) { try { tx.abort(); } catch {} reject(error); }
            };
            request.onerror = () => { try { tx.abort(); } catch {} };
          });
          tx.oncomplete = () => resolve(result);
          tx.onabort = tx.onerror = () => reject(new Error('ローカル所有情報を保存できません。元の作品はそのままです。'));
        } catch (error) { reject(error); }
      }).finally(() => database.close());
    }
  };
}

function createMemoryLocalWorkOwnershipAdapter(seed = []) {
  const rows = new Map(seed.map((row) => [row.key, clone(row)]));
  let busy = Promise.resolve();
  return {
    async all() { return [...rows.values()].map(clone); },
    async atomic(keys, decide) {
      const op = busy.catch(() => {}).then(() => {
        const decision = decide(keys.map((key) => clone(rows.get(key) || null)));
        for (const row of decision.writes || []) rows.set(row.key, clone(row));
        return clone(decision.result);
      });
      busy = op.catch(() => {});
      return op;
    }
  };
}

function openExistingDatabase(indexedDBRef, name) {
  return new Promise((resolve, reject) => {
    if (!indexedDBRef?.open) { reject(new Error('IndexedDB is unavailable')); return; }
    let request;
    let missing = false;
    try { request = indexedDBRef.open(name); } catch { reject(new Error('legacy database open failed')); return; }
    request.onupgradeneeded = () => {
      missing = true;
      try { request.transaction.abort(); } catch {}
      try { request.result.close(); } catch {}
    };
    request.onerror = () => reject(new Error(missing ? 'legacy database missing' : 'legacy database open failed'));
    request.onblocked = () => reject(new Error('legacy database blocked'));
    request.onsuccess = () => {
      if (missing) { request.result.close(); reject(new Error('legacy database missing')); return; }
      resolve(request.result);
    };
  });
}

async function enumerateKeys(indexedDBRef, source) {
  const db = await openExistingDatabase(indexedDBRef, source.database);
  try {
    if (!db.objectStoreNames.contains(source.store)) return [];
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(source.store, 'readonly');
      const request = tx.objectStore(source.store).openKeyCursor();
      const keys = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const value = cursor.primaryKey;
        if (typeof value === 'string' && KEY_RE.test(value)) {
          if (source.kind !== 'feed' || /^draft:[a-f\d-]{36}$/i.test(value)) keys.push(value);
        }
        cursor.continue();
      };
      request.onerror = () => reject(new Error('legacy keys unavailable'));
      tx.oncomplete = () => resolve(keys);
      tx.onabort = tx.onerror = () => reject(new Error('legacy keys unavailable'));
    });
  } finally { db.close(); }
}

/** Sidecar metadata registry. Artwork, project revisions, draft bodies, audio and visibility are never read or written here. */
export function createLocalWorkOwnership({ adapter, indexedDBRef = globalThis.indexedDB, storage = globalThis.localStorage, getSessionFingerprint = () => '' , randomUUID = () => globalThis.crypto.randomUUID() } = {}) {
  const registry = adapter || createIndexedDbOwnershipAdapter(indexedDBRef);

  function getDeviceId() {
    let current;
    try { current = storage?.getItem(DEVICE_KEY); } catch { throw new Error('この端末の所有者情報を読み取れません。'); }
    if (current && UUID.test(current)) return current;
    if (current != null) throw new Error('この端末の所有者情報を読み取れません。');
    const next = randomUUID();
    if (!UUID.test(String(next))) throw new Error('端末IDを作成できません。');
    try {
      if (!storage?.setItem) throw new Error();
      storage.setItem(DEVICE_KEY, next);
      if (storage.getItem(DEVICE_KEY) !== next) throw new Error();
    } catch { throw new Error('この端末の所有者情報を保存できません。'); }
    return next;
  }
  async function activateAccount({ accountId, sessionFingerprint, verified } = {}) {
    if (verified !== true || !UUID.test(String(accountId || '')) || !/^[a-f0-9]{64}$/i.test(String(sessionFingerprint || ''))) throw new Error('確認済みアカウント情報が必要です。');
    const before = authStorageSnapshot(storage);
    let current = '';
    try { current = String(await getSessionFingerprint?.() || ''); } catch { current = ''; }
    if (!current || current !== sessionFingerprint || !same(before, authStorageSnapshot(storage))) throw new Error('ログイン状態が切り替わりました。');
    const marker = JSON.stringify({ accountId, sessionFingerprint });
    try {
      if (!storage?.setItem) throw new Error();
      storage.setItem(ACTIVE_KEY, marker);
      if (storage.getItem(ACTIVE_KEY) !== marker) throw new Error();
    } catch { throw new Error('この端末のアカウント状態を保存できません。'); }
    return { accountId };
  }
  function clearActiveAccount() {
    try { if (!storage?.removeItem) throw new Error(); storage.removeItem(ACTIVE_KEY); if (storage.getItem(ACTIVE_KEY) != null) throw new Error(); }
    catch { throw new Error('この端末のアカウント状態を消去できません。'); }
  }
  async function ownerForNewSave() {
    const authSnapshot = authStorageSnapshot(storage);
    const active = await activeRecord(storage, getSessionFingerprint, authSnapshot);
    return { owner: active ? { kind: 'account', id: active.record.accountId } : { kind: 'device', id: getDeviceId() }, authSnapshot, deviceId: getDeviceId() };
  }
  function validateRow(row) {
    if (!row || !validWork(row.namespace, row.id) || !row.owner || !['device', 'account'].includes(row.owner.kind)
        || !UUID.test(String(row.owner.id || '')) || !['saved', 'legacy-unknown'].includes(row.provenance)
        || row.visibility !== 'device-private' || !validRevision(row.revisionId)) throw new Error('ローカル所有情報が不正です。');
  }
  function publicRow(row) {
    validateRow(row);
    return { namespace: row.namespace, id: row.id, owner: clone(row.owner), provenance: row.provenance, revisionId: row.revisionId, visibility: row.visibility };
  }
  async function recordSave({ namespace, id, revisionId = null, existingWork = false } = {}) {
    if (!validWork(namespace, id) || !validRevision(revisionId) || typeof existingWork !== 'boolean') throw new TypeError('ローカル作品IDを確認してください。');
    const key = registryKey(namespace, id);
    const { owner: proposedOwner, authSnapshot, deviceId } = await ownerForNewSave();
    return registry.atomic([key], ([current]) => {
      if (current) {
        validateRow(current);
        const updated = { ...current, revisionId };
        return { writes: [updated], result: publicRow(updated) };
      }
      const owner = existingWork ? { kind: 'device', id: deviceId }
        : proposedOwner.kind === 'account' && same(authSnapshot, authStorageSnapshot(storage)) ? proposedOwner : { kind: 'device', id: deviceId };
      const created = { key, namespace, id, owner, provenance: existingWork ? 'legacy-unknown' : 'saved', revisionId, visibility: 'device-private' };
      return { writes: [created], result: publicRow(created) };
    });
  }
  async function listOwnership() {
    return (await registry.all()).filter((row) => row && row.key && !row.key.startsWith('journal:')).map(publicRow);
  }
  async function discoverLegacy() {
    const output = [];
    for (const source of SOURCES) {
      let keys;
      try { keys = await enumerateKeys(indexedDBRef, source); }
      catch (error) { if (String(error?.message).includes('missing')) continue; throw error; }
      for (const id of keys) output.push({ namespace: source.namespace, id, owner: null, provenance: 'legacy-unknown', revisionId: null, visibility: 'device-private' });
    }
    const known = new Set((await listOwnership()).map((row) => registryKey(row.namespace, row.id)));
    return output.filter((row) => !known.has(registryKey(row.namespace, row.id)));
  }
  async function bindDeviceLegacy({ keys, includeLegacy } = {}) {
    if (includeLegacy !== true || !Array.isArray(keys) || !keys.length) throw new Error('旧いローカル作品を選ぶ操作が必要です。');
    const discovered = await discoverLegacy();
    const selected = keys.map((item) => typeof item === 'string' ? item : registryKey(item?.namespace, item?.id));
    const candidates = discovered.filter((row) => selected.includes(registryKey(row.namespace, row.id)));
    if (!candidates.length || candidates.length !== new Set(selected).size) throw new Error('選択した旧い作品を確認できません。');
    const deviceId = getDeviceId();
    const dbKeys = candidates.map((row) => registryKey(row.namespace, row.id));
    return registry.atomic(dbKeys, (currentRows) => {
      const writes = [];
      const result = [];
      for (let index = 0; index < candidates.length; index += 1) {
        const existing = currentRows[index];
        if (existing) {
          validateRow(existing);
          if (existing.owner.kind !== 'device' || existing.owner.id !== deviceId) throw new Error('別のアカウントが所有する作品は変更できません。');
          result.push(publicRow(existing));
        } else {
          const candidate = candidates[index];
          const row = { key: dbKeys[index], namespace: candidate.namespace, id: candidate.id, owner: { kind: 'device', id: deviceId }, provenance: 'legacy-unknown', revisionId: null, visibility: 'device-private' };
          writes.push(row); result.push(publicRow(row));
        }
      }
      return { writes, result };
    });
  }
  async function snapshotForLogin({ includeLegacy = false } = {}) {
    if (includeLegacy !== true && includeLegacy !== false) throw new TypeError('includeLegacy must be explicit');
    const deviceId = getDeviceId();
    const rows = await listOwnership();
    return rows.filter((row) => row.owner.kind === 'device' && row.owner.id === deviceId
      && (includeLegacy || row.provenance !== 'legacy-unknown'));
  }
  async function bindVerified({ accountId, sessionFingerprint, verified, requestKey, snapshot, serverClaim = null, includeLegacy = false } = {}) {
    const active = await activeRecord(storage, getSessionFingerprint);
    if (verified !== true || !active || active.record.accountId !== accountId || active.record.sessionFingerprint !== sessionFingerprint || !UUID.test(String(accountId || '')) || !UUID.test(String(requestKey || '')) || !Array.isArray(snapshot) || snapshot.length > 10000) throw new Error('確認済みアカウントと作品一覧が必要です。');
    const claim = serverClaim;
    if (claim && (claim.requestKey !== requestKey || claim.ownerId !== accountId || !UUID.test(String(claim.guestId || '')))) throw new Error('サーバーの引き継ぎ確認が一致しません。');
    const entries = snapshot.map((item) => {
      if (!validWork(item?.namespace, item?.id)) throw new Error('作品一覧に不正なIDがあります。');
      return { key: registryKey(item.namespace, item.id), item };
    });
    if (new Set(entries.map((entry) => entry.key)).size !== entries.length) throw new Error('作品一覧に重複したIDがあります。');
    const journalKey = `journal:${requestKey}`;
    const keys = [...entries.map((entry) => entry.key), journalKey];
    return registry.atomic(keys, (currentRows) => {
      if (!same(active.authSnapshot, authStorageSnapshot(storage))) throw new Error('ログイン状態が別のタブで切り替わりました。');
      const journal = currentRows.at(-1);
      const desired = entries.map(({ item }) => ({ namespace: item.namespace, id: item.id, revisionId: item.revisionId ?? null }));
      if (journal) {
        if (journal.type !== 'journal' || journal.ownerId !== accountId || !same(journal.items, desired)) throw new Error('この引き継ぎ番号は別の作品に使われています。');
        return { writes: [], result: { status: 'already_bound', items: journal.items } };
      }
      const writes = [];
      for (let index = 0; index < entries.length; index += 1) {
        const { item } = entries[index];
        const current = currentRows[index];
        if (!current) throw new Error('作品の所有情報が変わりました。もう一度一覧を読み込んでください。');
        validateRow(current);
        if (current.revisionId !== (item.revisionId ?? null) || current.provenance !== item.provenance || !same(current.owner, item.owner)) throw new Error('作品が別のタブで更新されました。もう一度一覧を読み込んでください。');
        if (current.provenance === 'legacy-unknown' && includeLegacy !== true) throw new Error('旧い作品を引き継ぐ明示的な選択が必要です。');
        const fromDevice = current.owner.kind === 'device' && current.owner.id === getDeviceId();
        const fromClaimedGuest = claim && current.owner.kind === 'account' && current.owner.id === claim.guestId;
        const alreadyTarget = current.owner.kind === 'account' && current.owner.id === accountId;
        if (!fromDevice && !fromClaimedGuest && !alreadyTarget) throw new Error('別のアカウントが所有する作品は引き継げません。');
        if (fromClaimedGuest && (!claim || claim.ownerId !== accountId)) throw new Error('サーバーで確認したゲスト引き継ぎが必要です。');
        if (!alreadyTarget) writes.push({ ...current, owner: { kind: 'account', id: accountId } });
      }
      const journalRow = { key: journalKey, type: 'journal', ownerId: accountId, items: desired };
      writes.push(journalRow);
      return { writes, result: { status: 'bound', items: desired } };
    });
  }

  return Object.freeze({ getDeviceId, activateAccount, clearActiveAccount, recordSave, listOwnership, discoverLegacy, bindDeviceLegacy, snapshotForLogin, bindVerified });
}

let defaultStorage, defaultIndexedDB;
try { defaultStorage = globalThis.localStorage; } catch { defaultStorage = null; }
try { defaultIndexedDB = globalThis.indexedDB; } catch { defaultIndexedDB = null; }
let fingerprintOverride = null;
let ownershipCache = [];
export async function localWorkSessionFingerprint(storage = globalThis.localStorage) {
  const candidates = [ACTIVE_SESSION_KEY, GUEST_SESSION_KEY];
  let selected = null;
  let selectedKey = '';
  for (const key of candidates) {
    let raw;
    try { raw = storage?.getItem(key); } catch { return ''; }
    if (raw != null) { selected = raw; selectedKey = key; break; }
  }
  if (selected == null && storage && Number.isInteger(storage.length) && typeof storage.key === 'function') {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && /^sb-[A-Za-z0-9_-]+-auth-token$/.test(key)) {
        try { selected = storage.getItem(key); selectedKey = key; } catch { return ''; }
        if (selected != null) break;
      }
    }
  }
  if (selected == null || selected === '') return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${selectedKey}\n${selected}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
const ACTIVE_SESSION_KEY = 'PiXiEED:legacy-owner-session:v1';
const GUEST_SESSION_KEY = 'PiXiEED:supabase-session:v1';
export function getDefaultLocalWorkOwnership({ storage = defaultStorage, indexedDBRef = defaultIndexedDB } = {}) {
  let cached = ownershipCache.find((entry) => entry.storage === storage && entry.indexedDBRef === indexedDBRef);
  if (!cached) {
    const getSessionFingerprint = () => fingerprintOverride ? fingerprintOverride() : localWorkSessionFingerprint(storage);
    cached = { storage, indexedDBRef, ownership: createLocalWorkOwnership({ storage, indexedDBRef, getSessionFingerprint }) };
    ownershipCache.push(cached);
  }
  return cached.ownership;
}

/** Configure the local session fingerprint source; this module never requests or stores Auth credentials. */
export function configureLocalWorkOwnership({ getSessionFingerprint } = {}) {
  if (typeof getSessionFingerprint !== 'function') throw new TypeError('getSessionFingerprint must be a function');
  fingerprintOverride = getSessionFingerprint;
  ownershipCache = [];
  return getDefaultLocalWorkOwnership();
}

/** Best-effort sidecar after a work save. A metadata failure never undoes the saved work. */
export async function recordLocalWorkSave(input) {
  try {
    if (!globalThis.indexedDB?.open) throw new Error('IndexedDB unavailable');
    return { ok: true, ownership: await getDefaultLocalWorkOwnership().recordSave(input), warning: '' };
  }
  catch { return { ok: false, ownership: null, warning: '作品は保存されましたが、端末内の所有情報を更新できませんでした。作品の内容は保持されています。' }; }
}

export async function prepareLocalWorkLogin({ includeLegacy = false, legacyKeys = [] } = {}) {
  const ownership = getDefaultLocalWorkOwnership();
  const legacyCandidates = await ownership.discoverLegacy();
  if (includeLegacy && legacyKeys.length) await ownership.bindDeviceLegacy({ keys: legacyKeys, includeLegacy: true });
  const snapshot = await ownership.snapshotForLogin({ includeLegacy });
  return { legacyCandidates, snapshot };
}

export async function completeLocalWorkLogin({ accountId, sessionFingerprint, verified, requestKey, snapshot, serverClaim = null, includeLegacy = false } = {}) {
  const ownership = getDefaultLocalWorkOwnership();
  await ownership.activateAccount({ accountId, sessionFingerprint, verified });
  return ownership.bindVerified({ accountId, sessionFingerprint, verified, requestKey, snapshot, serverClaim, includeLegacy });
}

export { createMemoryLocalWorkOwnershipAdapter };
