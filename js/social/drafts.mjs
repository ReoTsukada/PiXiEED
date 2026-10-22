import { scheduleLocalWorkSave } from '../creation/local-work-save-hook.mjs';
const DATABASE = 'pixieed-social-drafts-v1';
const STORE = 'entries';
const AUDIO_STORE = 'audio';
const MODES = new Set(['text', 'art', 'photo', 'puzzle', 'music']);
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const COMMENT_TARGET = /^(?:sns|map|showcase):[a-f\d-]{36}$/i;
const MAX_DRAFT_CHARS = 4_000_000;
const MAX_SAVED = 20;

function indexedAdapter(indexedDBRef) {
  let database;
  const open = () => database ||= new Promise((resolve, reject) => {
    if (!indexedDBRef?.open) { reject(new Error('この環境では下書きを端末に保存できません。入力内容は画面に残っています。')); return; }
    let request; let settled = false; let blocked = false;
    try { request = indexedDBRef.open(DATABASE, 2); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      if (blocked || settled) { request.result.close?.(); return; }
      settled = true;
      request.result.onversionchange = () => { request.result.close?.(); database = null; };
      resolve(request.result);
    };
    request.onerror = () => { if (!settled) { settled = true; reject(new Error('下書き保存を開けませんでした。入力内容は画面に残っています。')); } };
    request.onblocked = () => { blocked = true; if (!settled) { settled = true; reject(new Error('別のタブが下書き保存を使用中です。時間をおいて再試行してください。')); } };
  }).catch(error => { database = null; throw error; });
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let value, request, tx;
      try { tx = db.transaction(STORE, mode); request = operation(tx.objectStore(STORE)); }
      catch { reject(new Error('下書き保存を開始できませんでした。')); return; }
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => { try { tx.abort(); } catch {} };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(new Error('端末に保存できませんでした。容量を確認して再試行してください。入力内容は保持しています。'));
    });
  }
  function multiTransaction(mode, operation) {
    return open().then(db => new Promise((resolve, reject) => {
      let value; let failure = null; let tx;
      try { tx = db.transaction([STORE, AUDIO_STORE], mode); operation(tx.objectStore(STORE), tx.objectStore(AUDIO_STORE), tx, result => { value = result; }, error => { failure = error; try { tx.abort(); } catch {} }); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => failure ? reject(failure) : resolve(value);
      tx.onabort = tx.onerror = () => reject(failure || new Error('端末に保存できませんでした。容量を確認して再試行してください。入力内容は保持しています。'));
    }));
  }
  return {
    async get(key) { return (await transaction('readonly', s => s.get(key)))?.value ?? null; },
    put(key, value) { return transaction('readwrite', s => s.put({ key, value })); },
    delete(key) { return transaction('readwrite', s => s.delete(key)); },
    async all() { return (await transaction('readonly', s => s.getAll())).map(row => ({ key: row.key, value: row.value })); },
    async commitDraft(key, value, audioRecord, { maxSaved = false } = {}) {
      const { assertAudioCapacity } = await import('./draft-audio.mjs');
      return multiTransaction('readwrite', (entries, audio, _tx, set, fail) => {
        const draftsRequest = entries.getAll();
        const audioRequest = audio.getAll(); let drafts; let audios;
        const commit = () => {
          if (!drafts || !audios) return;
          if (maxSaved && drafts.filter(row => row.key.startsWith('draft:')).length >= MAX_SAVED) { fail(new Error('保存した下書きが20件に達しました。不要な下書きを整理してください。')); return; }
          if (audioRecord?.reuseId && !audios.some(row => row.id === audioRecord.reuseId)) { fail(new Error('保存済みの音源が見つかりません。元の音源は保持しています。')); return; }
          if (audioRecord?.record) {
            const candidate = audioRecord.record;
            try { assertAudioCapacity(audios, candidate.size); }
            catch (error) { fail(error); return; }
            if (audios.some(row => row.id === candidate.id)) { fail(new Error('音源番号が重複しています。もう一度お試しください。')); return; }
            audio.add(candidate);
          }
          entries.put({ key, value });
          set({ value, audioId: audioRecord?.reuseId || audioRecord?.record?.id || value.audioId || null });
        };
        draftsRequest.onsuccess = () => { drafts = draftsRequest.result; commit(); };
        audioRequest.onsuccess = () => { audios = audioRequest.result; commit(); };
        draftsRequest.onerror = audioRequest.onerror = () => fail(new Error('下書きと音源を確認できませんでした。'));
      });
    },
    getAudio(id) { return open().then(db => new Promise((resolve, reject) => {
      let tx; try { tx=db.transaction(AUDIO_STORE,'readonly'); const request=tx.objectStore(AUDIO_STORE).get(id); request.onsuccess=()=>resolve(request.result||null); request.onerror=()=>reject(request.error); } catch(error) { reject(error); }
    })); },
    audioWithReferences() { return multiTransaction('readonly', (entries,audio,_tx,set,fail) => {
      const a=entries.getAll(), b=audio.getAll(); let drafts,audios;
      const done=()=>{if(!drafts||!audios)return;const counts=new Map();for(const row of drafts){const id=row.value?.audioId;if(UUID.test(String(id||'')))counts.set(id,(counts.get(id)||0)+1);}set(audios.map(row=>({...row,referenceCount:counts.get(row.id)||0})));};
      a.onsuccess=()=>{drafts=a.result;done();};b.onsuccess=()=>{audios=b.result;done();};a.onerror=b.onerror=()=>fail(new Error('保存した音源を確認できませんでした。'));
    }); },
    removeAudioIfUnreferenced(id) { return multiTransaction('readwrite', (entries,audio,_tx,set,fail) => {
      const a=entries.getAll(), b=audio.get(id); let drafts,record;
      const done=()=>{if(!drafts||record===undefined)return;if(!record){set(false);return;}if(drafts.some(row=>row.value?.audioId===id)){fail(new Error('下書きで使っている音源は削除できません。先に下書きから外してください。'));return;}audio.delete(id);set(true);};
      a.onsuccess=()=>{drafts=a.result;done();};b.onsuccess=()=>{record=b.result||null;done();};a.onerror=b.onerror=()=>fail(new Error('音源の参照を確認できませんでした。'));
    }); },
  };
}

function text(value, max, field) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`${field}が保存できる長さを超えています。`);
  return value;
}

/** Persist only the current composition, never a user session, private catalog or published-post cache. */
export function normalizeFeedDraft(input) {
  if (!input || typeof input !== 'object' || !MODES.has(input.mode)) throw new Error('下書きの形式を確認できません。');
  const result = {
    version: 1, mode: input.mode,
    title: text(input.title, 60, 'タイトル'), caption: text(input.caption, 180, '文章'),
    location: text(input.location, 400, '掲載先'),
  };
  if (input.visibility != null) {
    if (!['public', 'private'].includes(input.visibility)) throw new Error('公開範囲を確認できません。');
    result.visibility = input.visibility;
  }
  if (Number.isSafeInteger(input.version) && input.version > 0) result.version = input.version;
  if (input.image) {
    const i = input.image;
    if (typeof i.dataUrl !== 'string' || !/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(i.dataUrl) ||
      i.dataUrl.length > 710_000 || !Number.isInteger(i.width) || !Number.isInteger(i.height) || i.width < 1 || i.height < 1 ||
      i.width > 256 || i.height > 256 || !Number.isInteger(i.colorCount) || i.colorCount < 1 || i.colorCount > 128 ||
      !Number.isSafeInteger(i.size) || i.size < 1 || i.size > 512 * 1024 || !['image/png', 'image/webp'].includes(i.mimeType)) throw new Error('添付画像の保存形式を確認できません。');
    result.image = Object.fromEntries(['dataUrl', 'mimeType', 'size', 'width', 'height', 'colorCount'].map(k => [k, i[k]]));
  }
  if (['pixel_art', 'pixel_camera'].includes(input.postKind)) result.postKind = input.postKind;
  if (input.localPuzzle != null) {
    const source = input.localPuzzle;
    if (!['spot_difference','hidden_object','jigsaw'].includes(source.mode) || !UUID.test(String(source.draftId || '')) || input.puzzle && source.mode !== input.puzzle.mode) throw new Error('端末内パズルの試遊先を確認してください。');
    result.localPuzzle = {mode:source.mode,draftId:source.draftId};
  }
  if (input.puzzle && input.puzzlePublicationAttempt != null) {
    const attempt = input.puzzlePublicationAttempt;
    if (!UUID.test(String(attempt.requestKey || '')) || attempt.status !== 'uncertain' || input.requestKey !== attempt.requestKey || !/^[a-f0-9]{64}$/.test(String(input.requestDigest || ''))) throw new Error('パズルの送信確認記録が不正です。');
    result.puzzlePublicationAttempt = {requestKey:attempt.requestKey,status:'uncertain'};
  }
  for (const key of ['puzzle', 'handoffReceipt']) {
    if (input[key] != null) {
      let encoded; try { encoded = JSON.stringify(input[key]); } catch { throw new Error('下書きの引継ぎ情報を保存できません。'); }
      if (!encoded || encoded.length > 3_000_000 || typeof input[key] !== 'object') throw new Error('下書きの引継ぎ情報が大きすぎます。');
      result[key] = JSON.parse(encoded);
    }
  }
  if (input.outputId != null) {
    if (!UUID.test(input.outputId)) throw new Error('出力の参照を確認できません。');
    result.outputId = input.outputId;
  }
  if (input.audioId != null) {
    if (!UUID.test(input.audioId)) throw new Error('音源の参照を確認できません。');
    result.audioId = input.audioId;
  }
  if (input.requestKey != null) {
    if (!UUID.test(input.requestKey)) throw new Error('送信確認番号を確認できません。');
    result.requestKey = input.requestKey;
  }
  if (typeof input.requestDigest === 'string' && /^[a-f\d]{64}$/.test(input.requestDigest)) result.requestDigest = input.requestDigest;
  if (JSON.stringify(result).length > MAX_DRAFT_CHARS) throw new Error('下書きの保存上限を超えています。元の制作ツールの保存を使ってください。');
  return result;
}

export function createFeedDraftStore({ adapter, indexedDBRef = globalThis.indexedDB, now = Date.now, makeId = () => crypto.randomUUID() } = {}) {
  const store = adapter || indexedAdapter(indexedDBRef);
  async function persist(key, draft, audio, maxSaved = false) {
    const value = normalizeFeedDraft(draft);
    if (key.startsWith('draft:') && /^draft:[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(draft?.id || '')) && draft.id === key) {
      value.id = key;
      if (Number.isFinite(draft.savedAt)) value.savedAt = draft.savedAt;
      value.localOnly = true;
    }
    if (!audio && !value.audioId) { await store.put(key, value); return value; }
    const tools = audio || value.audioId ? await import('./draft-audio.mjs') : null;
    if (!audio) {
      if (typeof store.commitDraft !== 'function') throw new Error('音源の参照を確認できません。入力内容は保持しています。');
      await store.commitDraft(key, value, { reuseId: value.audioId }, { maxSaved });
      return value;
    }
    // Reject before reading large Blob bytes or asking WebCrypto to hash them.
    if (!audio.blob || !Number.isSafeInteger(audio.blob.size) || audio.blob.size > tools.MAX_AUDIO_FILE_BYTES) throw new RangeError('音源は1ファイル64 MiBまでです。元の音源は保持しています。');
    const rememberedId = tools.rememberedAudioId(audio.blob);
    const knownId = rememberedId && typeof store.getAudio === 'function' && await store.getAudio(rememberedId)
      ? rememberedId : null;
    let audioRecord;
    if (knownId) {
      value.audioId = knownId;
      audioRecord = { reuseId: knownId };
    } else {
      const record = await tools.createAudioRecord(audio, { makeId, now });
      value.audioId = record.id;
      audioRecord = { record };
    }
    if (typeof store.commitDraft !== 'function') throw new Error('音源と下書きを一緒に端末へ保存できません。入力内容と元の音源は保持しています。');
    await store.commitDraft(key, value, audioRecord, { maxSaved });
    if (audioRecord.record) tools.rememberAudioBlob(audio.blob, audioRecord.record.id);
    return value;
  }
  return {
    async loadActive() {
      const value = await store.get('active');
      return value == null ? null : normalizeFeedDraft(value);
    },
    async saveActive(draft, { audio } = {}) { return persist('active', draft, audio); },
    clearActive() { return store.delete('active'); },
    async archive(draft, { audio } = {}) {
      const value = normalizeFeedDraft(draft);
      const existing = (await store.all()).filter(row => row.key.startsWith('draft:'));
      if (!audio && existing.length >= MAX_SAVED) throw new Error('保存した下書きが20件に達しました。不要な下書きを整理してください。');
      const uuid = makeId(); if (!UUID.test(uuid)) throw new Error('下書き番号を作成できませんでした。');
      let record = { ...value, id: `draft:${uuid}`, savedAt: now(), localOnly: true };
      if (audio) record = { ...await persist(record.id, record, audio, true), id: record.id, savedAt: record.savedAt, localOnly: true };
      else if (record.audioId) record = await persist(record.id, record, null, true);
      else await store.put(record.id, record);
      void scheduleLocalWorkSave({namespace:'feed-draft',id:record.id,revisionId:null,existingWork:false});
      return record;
    },
    async list() {
      const rows = (await store.all()).filter(row => row.key.startsWith('draft:'));
      return rows.map(row => ({ ...normalizeFeedDraft(row.value), id: row.key, savedAt: row.value.savedAt, localOnly: true })).sort((a, b) => b.savedAt - a.savedAt);
    },
    async get(id) {
      if (!/^draft:[a-f\d-]{36}$/i.test(id)) return null;
      const value = await store.get(id);
      return value == null ? null : { ...normalizeFeedDraft(value), id, savedAt: value.savedAt, localOnly: true };
    },
    remove(id) {
      if (!/^draft:[a-f\d-]{36}$/i.test(id)) throw new Error('下書き番号を確認できません。');
      return store.delete(id);
    },
    async readAudio(id) {
      if (!UUID.test(String(id || '')) || typeof store.getAudio !== 'function') return null;
      const record = await store.getAudio(id);
      if (!record) return null;
      const tools = await import('./draft-audio.mjs');
      await tools.verifyAudioRecord(record, globalThis.crypto, id);
      tools.rememberAudioBlob(record.blob, record.id);
      return { id: record.id, blob: record.blob, filename: record.filename, mime: record.mime, size: record.size, sha256: record.sha256,
        ...(record.returnUrl ? { returnUrl: record.returnUrl } : {}), ...(record.sourceOutputId ? { sourceOutputId: record.sourceOutputId } : {}) };
    },
    async listAudio() {
      if (typeof store.audioWithReferences !== 'function') return [];
      const { audioMetadata } = await import('./draft-audio.mjs');
      return (await store.audioWithReferences()).map(audioMetadata).sort((a,b)=>a.filename.localeCompare(b.filename));
    },
    async getPendingComment(target) {
      if (typeof target !== 'string' || !COMMENT_TARGET.test(target)) return null;
      const value = await store.get(`comment-request:${target}`);
      if (!value || value.target !== target || !UUID.test(String(value.requestKey || '')) ||
          typeof value.body !== 'string' || !value.body.trim() || value.body.length > 180 ||
          !/^[a-f\d]{64}$/i.test(String(value.digest || ''))) return null;
      return { target, requestKey: value.requestKey, body: value.body, digest: value.digest };
    },
    async savePendingComment(target, { requestKey, body, digest } = {}) {
      if (typeof target !== 'string' || !COMMENT_TARGET.test(target) || !UUID.test(String(requestKey || '')) ||
          typeof body !== 'string' || !body.trim() || body.length > 180 || !/^[a-f\d]{64}$/i.test(String(digest || ''))) {
        throw new Error('コメントの再送情報を保存できません。');
      }
      await store.put(`comment-request:${target}`, { target, requestKey, body, digest });
    },
    clearPendingComment(target) {
      if (typeof target !== 'string' || !COMMENT_TARGET.test(target)) throw new Error('コメントの参照を確認できません。');
      return store.delete(`comment-request:${target}`);
    },
    async removeAudio(id) {
      if (!UUID.test(String(id || '')) || typeof store.removeAudioIfUnreferenced !== 'function') throw new Error('音源番号を確認できません。');
      return store.removeAudioIfUnreferenced(id);
    },
    async loadPreferences() {
      const value = await store.get('preferences') || {};
      return {
        filter: ['all', 'art', 'photo', 'puzzle', 'local', 'saved'].includes(value.filter) ? value.filter : 'all',
        bookmarks: Array.isArray(value.bookmarks) ? value.bookmarks.filter(id => /^(?:map|showcase):[a-f\d-]{36}$/i.test(id)).slice(0, 200) : [],
        scroll: Number.isFinite(value.scroll) ? Math.max(0, value.scroll) : 0,
      };
    },
    async savePreferences(value) {
      const previous = await this.loadPreferences();
      const next = { ...previous, ...value };
      if (JSON.stringify(next).length > 40_000) throw new Error('保存設定が大きすぎます。');
      await store.put('preferences', next);
    },
  };
}
