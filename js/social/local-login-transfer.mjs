import { flushLocalWorkSaves } from '../creation/local-work-save-hook.mjs';
import { createGuestAuthAdapter } from './guest-auth-adapter.mjs';
import { getDefaultLocalWorkOwnership, localWorkSessionFingerprint } from '../creation/local-work-ownership.mjs';

const INTENT = 'PiXiEED:local-work-login:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Associates metadata on this device only. This is not a server ownership grant or cloud sync. */
export function createLocalLoginTransfer({
  auth = createGuestAuthAdapter(), storage = globalThis.localStorage,
  indexedDBRef = globalThis.indexedDB, ownership,
  fingerprint = () => localWorkSessionFingerprint(storage),
  randomUUID = () => crypto.randomUUID(), now = Date.now,
} = {}) {
  const registry = ownership || getDefaultLocalWorkOwnership({storage, indexedDBRef});
  function read() {
    let raw;
    try { raw = storage?.getItem(INTENT); } catch { throw new Error('端末内作品の引き継ぎ状態を読めません。'); }
    if (raw == null) return null;
    let record;
    try { record = JSON.parse(raw); } catch { throw new Error('端末内作品の引き継ぎ状態を確認できません。'); }
    if (!record || !UUID.test(record.requestNonce || '') || !UUID.test(record.deviceId || '') || !Array.isArray(record.items) || typeof record.includeLegacy !== 'boolean') throw new Error('端末内作品の引き継ぎ状態を確認できません。');
    return record;
  }
  function persist(record) {
    const serialized = JSON.stringify(record);
    try {
      if (typeof storage?.setItem !== 'function') throw new Error();
      storage.setItem(INTENT, serialized);
      if (storage.getItem(INTENT) !== serialized) throw new Error();
    } catch { throw new Error('端末内作品の引き継ぎ情報を保存できません。作品本体は保持しています。'); }
  }
  function requireIntent(snapshot) {
    const current = read();
    if (!current || current.requestNonce !== snapshot?.requestNonce || current.deviceId !== snapshot?.deviceId || JSON.stringify(current.items) !== JSON.stringify(snapshot.items)) throw new Error('端末内作品の引き継ぎが切り替わりました。作品本体は保持しています。');
    return current;
  }
  function clearMatching(nonce) {
    if (read()?.requestNonce !== nonce) throw new Error('別の引き継ぎ状態を上書きしません。');
    storage.removeItem(INTENT);
    if (storage.getItem(INTENT) != null) throw new Error('引き継ぎ確認記録を更新できません。再試行してください。');
  }
  async function prepareLocal({requestNonce = randomUUID(), includeLegacy = false, sourceGuestId} = {}) {
    if (!UUID.test(requestNonce) || typeof includeLegacy !== 'boolean' || sourceGuestId && !UUID.test(sourceGuestId)) throw new Error('引き継ぎ操作を確認できません。');
    let existing = read();
    if (existing?.phase === 'completed' && existing.requestNonce !== requestNonce) { clearMatching(existing.requestNonce); existing = null; }
    if (existing) {
      if (existing.requestNonce !== requestNonce) throw new Error('端末内作品の別の引き継ぎが保留中です。再試行かキャンセルを選んでください。');
      return existing;
    }
    await flushLocalWorkSaves();
    const deviceId = registry.getDeviceId();
    const legacy = await registry.discoverLegacy(); // Keys only; no artwork values or thumbnails.
    if (includeLegacy && legacy.length) await registry.bindDeviceLegacy({keys:legacy, includeLegacy:true});
    const snapshot = await registry.snapshotForLogin({includeLegacy});
    const knownUnknown = includeLegacy ? 0 : (await registry.listOwnership()).filter(row=>row.provenance === 'legacy-unknown' && row.owner.kind === 'device' && row.owner.id === deviceId).length;
    // Registered account A's local work is never imported into account B by a login.
    const items = snapshot.filter(item => item.owner.kind === 'device' && item.owner.id === deviceId);
    if (read()) throw new Error('別のタブで引き継ぎが始まりました。元の作品は保持しています。');
    const record = {requestNonce, deviceId, items, includeLegacy, legacyUnclaimedCount:includeLegacy ? 0 : legacy.length + knownUnknown, phase:'prepared', ...(sourceGuestId ? {sourceGuestId} : {}), createdAt:now()};
    persist(record);
    return record;
  }
  async function completeLocal({verifiedOwnerId, requestKey, snapshot, guestClaimed = false} = {}) {
    if (!UUID.test(verifiedOwnerId || '') || !UUID.test(requestKey || '')) throw new Error('確認済みの引き継ぎ先が必要です。');
    let intent = requireIntent(snapshot);
    if (intent.bindingKey && intent.bindingKey !== requestKey) throw new Error('前回と異なる引き継ぎ番号では再試行できません。');
    if (intent.ownerId && intent.ownerId !== verifiedOwnerId) throw new Error('前回と異なるアカウントへ作品を移しません。');
    const session = await auth.getSession();
    if (session?.user?.id !== verifiedOwnerId || session.user.is_anonymous !== false || !session.user.email_confirmed_at) throw new Error('引き継ぎ先の本人確認が完了していません。');
    intent = requireIntent(snapshot);
    const sessionFingerprint = await fingerprint();
    requireIntent(snapshot);
    const confirmed = await auth.getSession();
    requireIntent(snapshot);
    if (confirmed?.user?.id !== verifiedOwnerId || confirmed.user.is_anonymous !== false || confirmed.access_token !== session.access_token || await fingerprint() !== sessionFingerprint) throw new Error('ログイン状態が変わりました。作品を別のアカウントに移しません。');
    requireIntent(snapshot);
    if (!/^[a-f0-9]{64}$/.test(sessionFingerprint || '')) throw new Error('確認済みログインの保存状態を確認できません。');
    await flushLocalWorkSaves();
    requireIntent(snapshot);
    // Only refresh revisions for the exact device-owned IDs chosen before login.
    // Never broaden the set, change provenance, or adopt another account's work.
    let bindingItems = intent.bindingItems;
    if (!bindingItems) {
      const rows = await registry.listOwnership();
      requireIntent(snapshot);
      bindingItems = intent.items.map(item => {
        const current = rows.find(row => row.namespace === item.namespace && row.id === item.id);
        if (!current || current.owner.kind !== 'device' || current.owner.id !== intent.deviceId || current.provenance !== item.provenance) throw new Error('作品の所有情報が変わりました。作品本体は保持しています。');
        return current;
      });
    }
    intent = {...requireIntent(snapshot), ownerId:verifiedOwnerId, bindingKey:requestKey, bindingItems, phase:'binding', guestClaimed:guestClaimed === true};
    persist(intent);
    await registry.activateAccount({accountId:verifiedOwnerId, sessionFingerprint, verified:true});
    requireIntent(snapshot);
    try {
      await registry.bindVerified({accountId:verifiedOwnerId, sessionFingerprint, verified:true, requestKey, snapshot:bindingItems, includeLegacy:intent.includeLegacy});
    } catch (error) {
      const current = requireIntent(snapshot);
      persist({...current,phase:'retry', ...(/作品が別のタブで更新|作品の所有情報が変わり/.test(error?.message || '') ? {bindingItems:null} : {})});
      throw error;
    }
    requireIntent(snapshot);
    persist({...requireIntent(snapshot),phase:'completed'});
    return {status:'bound',ownerId:verifiedOwnerId,count:intent.items.length,legacyUnclaimedCount:intent.legacyUnclaimedCount};
  }
  function markServerDispatch(snapshot) {
    const intent = requireIntent(snapshot);
    persist({...intent,phase:'server_pending'});
  }
  function cancel() {
    const record = read();
    if (!record) return {cancelled:true};
    if (['binding','server_pending'].includes(record.phase)) throw new Error('関連付けを確認中です。完了または再試行の案内を待ってください。');
    clearMatching(record.requestNonce);
    return {cancelled:true};
  }
  async function listSummary({accountId} = {}) {
    const rows = await registry.listOwnership();
    const legacy = await registry.discoverLegacy();
    return {account:rows.filter(row=>row.owner.kind==='account' && row.owner.id === accountId).length,device:rows.filter(row=>row.owner.kind==='device').length,legacyUnknown:legacy.length + rows.filter(row=>row.provenance === 'legacy-unknown' && row.owner.kind === 'device').length,cloudSynced:false};
  }
  return Object.freeze({prepareLocal,completeLocal,markServerDispatch,cancel,listSummary,get pending(){return read();}});
}
