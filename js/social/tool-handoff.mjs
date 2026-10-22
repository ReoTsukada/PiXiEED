import { isValidatedSocialHost } from './tool-return.mjs?rev=20261021-jigsaw-public-1';
export { getSocialReturnUrl, navigateToSocialReturn } from './tool-return.mjs?rev=20261021-jigsaw-public-1';

const MAX_HANDOFF_AGE_MS = 10 * 60 * 1000;
const HANDOFF_KEYS = Object.freeze({
  draw: { key: 'PiXiEED:draw-handoff:v1', storage: 'sessionStorage', source: 'draw' },
  'pixel-camera': { key: 'PiXiEED:camera-handoff:v1', storage: 'localStorage', source: 'pixel-camera' },
  'spot-difference': { key: 'PiXiEED:puzzle-handoff:v1', metaKey: 'PiXiEED:puzzle-handoff-meta:v1', storage: 'sessionStorage', source: 'spot-difference', mode: 'spot_difference' },
  jigsaw: { key: 'PiXiEED:puzzle-handoff:v1', metaKey: 'PiXiEED:puzzle-handoff-meta:v1', storage: 'sessionStorage', source: 'jigsaw', mode: 'jigsaw' },
  'hidden-object': { key: 'PiXiEED:puzzle-handoff:v1', metaKey: 'PiXiEED:puzzle-handoff-meta:v1', storage: 'sessionStorage', source: 'hidden-object', mode: 'hidden_object' }
});
export const creatorLinks = Object.freeze([
  { kind: 'draw', label: '描く', href: '/draw/?workspace=1&social=1' },
  { kind: 'pixel-camera', label: '撮影', href: '/camera/?workspace=1&social=1' },
  { kind: 'spot-difference', label: '間違い探し', href: '/spot-difference/?social=1' },
  { kind: 'jigsaw', label: 'ジグソー', href: '/jigsaw/?social=1' },
  { kind: 'hidden-object', label: 'もの探し', href: '/hidden-object/?social=1' }
]);

function readRaw(windowRef, spec) {
  try { return windowRef?.[spec.storage]?.getItem(spec.key) || null; } catch { return null; }
}

function readMetadata(windowRef, spec) {
  if (!spec.metaKey) return { raw: null, value: null };
  let raw = null; let value = null;
  try {
    raw = windowRef?.sessionStorage?.getItem(spec.metaKey) || null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed;
    }
  } catch { /* optional retry state */ }
  return { raw, value };
}

export async function adoptSocialHandoff(kind, { windowRef = globalThis.window, locationRef = windowRef?.location, now = Date.now() } = {}) {
  const spec = HANDOFF_KEYS[kind];
  if (!spec || !locationRef || !isValidatedSocialHost(windowRef, locationRef)) return null;
  const url = new URL(locationRef.href);
  if (url.pathname !== '/feed/' || url.searchParams.get('compose') !== kind) return null;
  const serialized = readRaw(windowRef, spec);
  if (!serialized) return null;
  const meta = readMetadata(windowRef, spec);
  const receipt = { key: spec.key, metaKey: spec.metaKey || null, storage: spec.storage, serialized, metadataSerialized: meta.raw };

  if (kind === 'draw' || kind === 'pixel-camera') {
    const { decodePngHandoff } = await import('../creation/draw-handoff.mjs');
    const decoded = decodePngHandoff(serialized, spec.source, now);
    if (!decoded) return null;
    const dataUrl = await blobToDataUrl(decoded.file);
    return {
      kind, source: spec.source,
      image: { file: decoded.file, dataUrl, mimeType: 'image/png', size: decoded.file.size, revisionId: decoded.revisionId },
      metadata: null, receipt
    };
  }

  const { decodePuzzleHandoff } = await import('../creation/puzzle-handoff.mjs?rev=20261021-jigsaw-public-1');
  const handoff = decodePuzzleHandoff(serialized, now);
  if (!handoff || handoff.mode !== spec.mode) return null;
  const bytes = base64ToBytes(handoff.payload.image.base64);
  if (!bytes || bytes.length !== handoff.payload.image.size || !hasPngSignature(bytes)) return null;
  const file = new Blob([bytes], { type: 'image/png' });
  return {
    kind, source: spec.source, mode: handoff.mode, payload: handoff.payload,
    localPuzzle: handoff.localDraftId ? {mode:handoff.mode,draftId:handoff.localDraftId} : null, publicationIntent:handoff.publicationIntent,
    image: { file, dataUrl: handoff.payload.image.dataUrl || ('data:image/png;base64,' + handoff.payload.image.base64), mimeType: 'image/png', size: bytes.length, width: handoff.payload.image.width, height: handoff.payload.image.height, colorCount: handoff.payload.image.colorCount },
    metadata: meta.value, receipt
  };
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); } catch { return null; }
}

function hasPngSignature(bytes) {
  return bytes?.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
}

function blobToDataUrl(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return 'data:image/png;base64,' + btoa(binary);
  });
}

export function consumeSocialHandoff(receipt, windowRef = globalThis.window) {
  if (!receipt || typeof receipt !== 'object') return false;
  const ownKeys = Object.keys(receipt).sort();
  if (ownKeys.join(',') !== 'key,metaKey,metadataSerialized,serialized,storage') return false;
  const allowed = Object.values(HANDOFF_KEYS).find((spec) =>
    spec.key === receipt.key && spec.storage === receipt.storage
      && (spec.metaKey || null) === receipt.metaKey);
  if (!allowed || typeof receipt.serialized !== 'string'
    || (allowed.metaKey ? !(receipt.metadataSerialized === null || typeof receipt.metadataSerialized === 'string') : receipt.metadataSerialized !== null)) return false;
  try {
    const storage = windowRef?.[receipt.storage];
    if (!storage || storage.getItem(receipt.key) !== receipt.serialized) return false;
    if (receipt.metaKey && storage.getItem(receipt.metaKey) !== receipt.metadataSerialized) return false;
    storage.removeItem(receipt.key);
    if (receipt.metaKey) storage.removeItem(receipt.metaKey);
    return true;
  } catch { return false; }
}

export async function loadSocialOutput(id, { readToolOutput = null, indexedDBRef = globalThis.indexedDB, now = Date.now } = {}) {
  let read = readToolOutput;
  if (!read) {
    ({ readToolOutput: read } = await import('../creation/output-handoff.mjs?rev=20261020-format-conversion-1'));
  }
  const record = await read(id, { indexedDBRef, now });
  if (!record?.blob || typeof record.mime !== 'string') return null;
  const originalBlob = record.sourceBlob || record.blob;
  const originalMime = String(originalBlob.type || record.mime).toLowerCase().split(';', 1)[0];
  if (!originalMime.startsWith('audio/')) return null;
  return {
    id: record.id, blob: originalBlob, sourceBlob: originalBlob, currentBlob: record.blob,
    mime: originalMime, filename: record.sourceFilename || record.filename, metadata: record.metadata || {},
    returnUrl: record.returnUrl, expiresAt: record.expiresAt
  };
}

export function socialOutputUrl(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id)) return null;
  return '/feed/?output=' + encodeURIComponent(id);
}

export const SOCIAL_HANDOFF_MAX_AGE_MS = MAX_HANDOFF_AGE_MS;
