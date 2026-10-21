import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedDraftStore } from '../../js/social/drafts.mjs';
import { assertAudioCapacity, MAX_AUDIO_FILE_BYTES } from '../../js/social/draft-audio.mjs';

const ids = [
  'a1c3e030-4d86-4f0d-b855-b8f4b9adcb71',
  'b2c3e030-4d86-4f0d-b855-b8f4b9adcb71',
  'c3c3e030-4d86-4f0d-b855-b8f4b9adcb71',
  'd4c3e030-4d86-4f0d-b855-b8f4b9adcb71',
];

function audioMemory() {
  const entries = new Map(); const audios = new Map(); let fail = false;
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : value;
  return {
    entries, audios, set fail(value) { fail = value; },
    async get(key) { return clone(entries.get(key) ?? null); },
    async put(key, value) { if (fail) throw new Error('quota'); entries.set(key, clone(value)); },
    async delete(key) { if (fail) throw new Error('quota'); entries.delete(key); },
    async all() { return [...entries].map(([key,value]) => ({ key, value: clone(value) })); },
    async commitDraft(key, value, audioOption, { maxSaved = false } = {}) {
      if (fail) throw new Error('quota');
      if (maxSaved && [...entries.keys()].filter(k => k.startsWith('draft:')).length >= 20) throw new Error('limit');
      const audioId = audioOption?.reuseId || audioOption?.record?.id || value.audioId;
      if (audioOption?.reuseId && !audios.has(audioOption.reuseId)) throw new Error('missing audio');
      if (audioOption?.record) {
        const candidate = audioOption.record;
        if (candidate.size + [...audios.values()].reduce((n,row)=>n+row.size,0) > 256*1024*1024) throw new Error('total bound');
        if (audios.has(candidate.id)) throw new Error('duplicate audio');
        // Commit both only after all checks, matching the IndexedDB transaction contract.
        audios.set(candidate.id, clone(candidate));
      }
      entries.set(key, clone({ ...value, ...(audioId ? { audioId } : {}) }));
      return { value: clone(value), audioId };
    },
    async getAudio(id) { return clone(audios.get(id) ?? null); },
    async audioWithReferences() {
      const refs = new Map();
      for (const value of entries.values()) if (value?.audioId) refs.set(value.audioId,(refs.get(value.audioId)||0)+1);
      return [...audios.values()].map(row => ({ ...clone(row), referenceCount: refs.get(row.id)||0 }));
    },
    async removeAudioIfUnreferenced(id) {
      if ([...entries.values()].some(value => value?.audioId === id)) throw new Error('referenced');
      return audios.delete(id);
    }
  };
}

function createStore(adapter, { idStart = 0 } = {}) {
  let index = idStart;
  return createFeedDraftStore({ adapter, makeId: () => ids[index++ % ids.length], now: () => 123 });
}
const musicDraft = { mode: 'music', title: '音源', caption: '説明', location: '' };
const wavBytes = Uint8Array.from([82,73,70,70,1,2,3,4,87,65,86,69]);
function wav() { return new Blob([wavBytes], { type: 'audio/wav' }); }

test('audio draft saves exact Blob bytes, MIME, filename, and SHA-256 separately from old outputId', async () => {
  const adapter = audioMemory(); const store = createStore(adapter);
  await store.saveActive({ ...musicDraft, outputId: ids[0] }, { audio: { blob: wav(), filename: 'song.wav', sourceOutputId: ids[0], returnUrl: '/output/work/?id=x' } });
  const draft = await store.loadActive();
  const saved = await store.readAudio(draft.audioId);
  assert.equal(saved.filename, 'song.wav');
  assert.equal(saved.mime, 'audio/wav');
  assert.equal(saved.sourceOutputId, ids[0]);
  assert.deepEqual([...new Uint8Array(await saved.blob.arrayBuffer())], [...wavBytes]);
  assert.equal(saved.sha256, 'c94d2322d4d744898e1db3192d1b04729d39fde46700a622be24a0799c1971ac');
  assert.equal(draft.outputId, ids[0]);
  assert.equal((await store.listAudio())[0].referenceCount, 1);
});

test('audio and draft attach commit together; quota failure preserves old draft and audio', async () => {
  const adapter = audioMemory(); const store = createStore(adapter);
  await store.saveActive(musicDraft, { audio: { blob: wav(), filename: 'first.wav' } });
  const prior = await store.loadActive(); const count = adapter.audios.size;
  adapter.fail = true;
  await assert.rejects(store.saveActive({ ...musicDraft, caption: 'new' }, { audio: { blob: new Blob([wavBytes], { type: 'audio/wav' }), filename: 'new.wav' } }), /quota/);
  assert.deepEqual(await store.loadActive(), prior);
  assert.equal(adapter.audios.size, count);
});

test('repeated autosaves with the same Blob reuse one durable audio record', async () => {
  const adapter = audioMemory(); const store = createStore(adapter); const blob = wav();
  await store.saveActive(musicDraft, { audio: { blob, filename: 'song.wav' } });
  const id = (await store.loadActive()).audioId;
  await store.saveActive({ ...musicDraft, caption: 'edited', audioId: id }, { audio: { blob, filename: 'song.wav' } });
  assert.equal((await store.loadActive()).audioId, id);
  assert.equal(adapter.audios.size, 1);
});

test('shared audio remains protected until every active/archive reference is removed', async () => {
  const adapter = audioMemory(); const store = createStore(adapter);
  const blob = wav();
  await store.saveActive(musicDraft, { audio: { blob, filename: 'song.wav' } });
  const active = await store.loadActive();
  const archived = await store.archive({ ...musicDraft, audioId: active.audioId }, { audio: { blob, filename: 'song.wav' } });
  assert.equal((await store.listAudio())[0].referenceCount, 2);
  await assert.rejects(store.removeAudio(active.audioId), /referenced/);
  await store.clearActive();
  await assert.rejects(store.removeAudio(active.audioId), /referenced/);
  await store.remove(archived.id);
  assert.equal((await store.listAudio())[0].referenceCount, 0);
  assert.equal(await store.removeAudio(active.audioId), true);
  assert.equal(await store.readAudio(active.audioId), null);
});

test('audio archive keeps local archive metadata and metadata-only saves verify the audio reference atomically', async () => {
  const adapter = audioMemory(); const store = createStore(adapter);
  const blob = wav();
  await store.saveActive(musicDraft, { audio: { blob, filename: 'song.wav' } });
  const active = await store.loadActive();
  const archived = await store.archive({ ...musicDraft, audioId: active.audioId }, { audio: { blob, filename: 'song.wav' } });
  const restored = await store.get(archived.id);
  assert.equal(restored.localOnly, true);
  assert.equal(restored.savedAt, 123);
  assert.equal(restored.audioId, active.audioId);
  assert.equal(adapter.entries.get(archived.id).id, archived.id);

  const before = await store.loadActive();
  adapter.audios.delete(active.audioId); // models an independently removed/corrupt record
  await assert.rejects(store.saveActive({ ...before, caption: 'metadata edit' }), /missing audio/);
  assert.deepEqual(await store.loadActive(), before);
});

test('oversized Blob fails before reading content; metadata-only edit does not duplicate audio', async () => {
  const adapter = audioMemory(); const store = createStore(adapter);
  const tooLarge = { size: 64*1024*1024+1, type: 'audio/wav', slice() { return this; }, arrayBuffer() { throw new Error('must not read'); } };
  await assert.rejects(store.saveActive(musicDraft, { audio: { blob: tooLarge, filename: 'large.wav' } }), /64 MiB/);
  await store.saveActive(musicDraft, { audio: { blob: wav(), filename: 'song.wav' } });
  const prior = await store.loadActive();
  await store.saveActive({ ...prior, caption: 'metadata only' });
  assert.equal(adapter.audios.size, 1);
  assert.equal((await store.loadActive()).audioId, prior.audioId);
});

test('legacy outputId-only drafts load and remain valid without audioId', async () => {
  const adapter = audioMemory(); adapter.entries.set('active', { ...musicDraft, outputId: ids[0] });
  const store = createStore(adapter);
  assert.deepEqual(await store.loadActive(), { version: 1, ...musicDraft, outputId: ids[0] });
});

test('an explicitly deleted unreferenced file can be attached again from the same original Blob', async () => {
  const adapter = audioMemory(); const store = createStore(adapter); const blob = wav();
  const first = await store.saveActive(musicDraft, { audio: { blob, filename: 'original.wav' } });
  await store.clearActive();
  await store.removeAudio(first.audioId);
  const second = await store.saveActive(musicDraft, { audio: { blob, filename: 'original.wav' } });
  assert.notEqual(second.audioId, first.audioId);
  assert.deepEqual([...new Uint8Array(await (await store.readAudio(second.audioId)).blob.arrayBuffer())], [...wavBytes]);
});

test('audio capacity enforces the 64 MiB file and 256 MiB retained-byte limits', () => {
  assert.throws(() => assertAudioCapacity([], MAX_AUDIO_FILE_BYTES + 1), /64 MiB/);
  const full = Array.from({ length: 4 }, () => ({ size: MAX_AUDIO_FILE_BYTES }));
  assert.throws(() => assertAudioCapacity(full, 1), /256 MiB/);
  const almostFull = Array.from({ length: 3 }, () => ({ size: MAX_AUDIO_FILE_BYTES }));
  assert.equal(assertAudioCapacity(almostFull, MAX_AUDIO_FILE_BYTES), true);
});

test('readAudio rejects a mismatched stored digest and non-audio attachments', async () => {
  const adapter = audioMemory(); const store = createStore(adapter);
  await assert.rejects(store.saveActive(musicDraft, { audio: { blob: new Blob(['not audio'], { type: 'text/plain' }), filename: 'bad.txt' } }), /形式/);
  await store.saveActive(musicDraft, { audio: { blob: wav(), filename: 'song.wav' } });
  const id = (await store.loadActive()).audioId;
  const record = adapter.audios.get(id);
  adapter.audios.set(id, { ...record, sha256: '0'.repeat(64) });
  await assert.rejects(store.readAudio(id), /内容が一致/);
});
