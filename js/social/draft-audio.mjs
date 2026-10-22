export const MAX_AUDIO_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_AUDIO_TOTAL_BYTES = 256 * 1024 * 1024;

const blobIds = new WeakMap();
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export function assertAudioCapacity(records, candidateSize) {
  if (!Number.isSafeInteger(candidateSize) || candidateSize < 1 || candidateSize > MAX_AUDIO_FILE_BYTES) throw new RangeError('音源は1ファイル64 MiBまでです。元の音源は保持しています。');
  const total = records.reduce((sum, record) => {
    if (!Number.isSafeInteger(record?.size) || record.size < 1 || record.size > MAX_AUDIO_FILE_BYTES) throw new Error('端末内の音源保存を確認できません。');
    return sum + record.size;
  }, 0);
  if (total + candidateSize > MAX_AUDIO_TOTAL_BYTES) throw new RangeError('端末内の音源保存は合計256 MiBまでです。不要な音源を明示的に削除してください。元の音源は保持しています。');
  return true;
}

export function rememberedAudioId(blob) { return blob && typeof blob === 'object' ? blobIds.get(blob) || null : null; }
export function rememberAudioBlob(blob, id) { if (blob && typeof blob === 'object' && UUID.test(id)) blobIds.set(blob, id); }

function safeFilename(value) {
  const name = String(value || 'audio').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
  return name || 'audio';
}

function safeReturnUrl(value) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\u0000-\u0020\\]/.test(value)) throw new TypeError('音源の戻り先を確認できません。');
  const url = new URL(value, 'https://pixieed.invalid');
  if (url.origin !== 'https://pixieed.invalid') throw new TypeError('音源の戻り先を確認できません。');
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function createAudioRecord(audio, { makeId, now = Date.now, cryptoRef = globalThis.crypto } = {}) {
  const blob = audio?.blob;
  if (!blob || typeof blob.slice !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 1) throw new TypeError('保存する音源を確認できません。');
  if (blob.size > MAX_AUDIO_FILE_BYTES) throw new RangeError('音源は1ファイル64 MiBまでです。元の音源は保持しています。');
  const mime = String(audio.mime || blob.type || '').split(';', 1)[0].trim().toLowerCase();
  if (!mime.startsWith('audio/') || (blob.type && String(blob.type).split(';', 1)[0].trim().toLowerCase() !== mime)) throw new TypeError('音源の形式を確認できません。');
  let id = typeof makeId === 'function' ? makeId() : cryptoRef?.randomUUID?.();
  if (!UUID.test(String(id || ''))) throw new Error('音源番号を作成できませんでした。');
  if (!cryptoRef?.subtle?.digest) throw new Error('音源の確認機能を利用できません。元の音源は保持しています。');
  const bytes = await blob.arrayBuffer();
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const sourceOutputId = audio.sourceOutputId == null ? undefined : String(audio.sourceOutputId);
  if (sourceOutputId != null && !UUID.test(sourceOutputId)) throw new TypeError('元の出力番号を確認できません。');
  return {
    id, blob, filename: safeFilename(audio.filename), mime, size: blob.size, sha256,
    createdAt: now(), ...(audio.returnUrl ? { returnUrl: safeReturnUrl(audio.returnUrl) } : {}),
    ...(sourceOutputId ? { sourceOutputId } : {})
  };
}

export async function verifyAudioRecord(record, cryptoRef = globalThis.crypto, expectedId = record?.id) {
  const mime = String(record?.mime || '').split(';', 1)[0].trim().toLowerCase();
  const blobMime = String(record?.blob?.type || '').split(';', 1)[0].trim().toLowerCase();
  if (!record?.blob || record.id !== expectedId || !UUID.test(String(record.id || '')) || record.blob.size !== record.size || !Number.isSafeInteger(record.size) || record.size < 1 || record.size > MAX_AUDIO_FILE_BYTES ||
      !mime.startsWith('audio/') || (blobMime && blobMime !== mime) || !/^[a-f\d]{64}$/i.test(String(record.sha256 || '')) || !cryptoRef?.subtle?.digest) {
    throw new Error('保存した音源を確認できません。');
  }
  const digest = await cryptoRef.subtle.digest('SHA-256', await record.blob.arrayBuffer());
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== record.sha256.toLowerCase()) throw new Error('保存した音源の内容が一致しません。');
  return record;
}

export function audioMetadata(record) {
  return { id: record.id, filename: record.filename, mime: record.mime, size: record.size, sha256: record.sha256,
    ...(record.returnUrl ? { returnUrl: record.returnUrl } : {}), ...(record.sourceOutputId ? { sourceOutputId: record.sourceOutputId } : {}),
    ...(Number.isSafeInteger(record.referenceCount) ? { referenceCount: record.referenceCount } : {}) };
}
