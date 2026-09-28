const MAGIC = [0x50, 0x58, 0x44, 0x00];
const V3_HEADER_BYTES = 12;
const LEGACY_HEADER_BYTES = 9;
export const PXD_MAX_BYTES = 64 * 1024 * 1024;
export const PXD_MAX_ENTRIES = 512;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;

export class PxdCodecError extends Error {
  constructor(code, message = code) { super(message); this.name = 'PxdCodecError'; this.code = code; }
}

function fail(code, message) { throw new PxdCodecError(code, message); }

function randomId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function assertId(value, code = 'PXD_ID_INVALID') {
  if (typeof value !== 'string' || !ID_RE.test(value)) fail(code);
  return value;
}

function assertBytes(value, code = 'PXD_BYTES_INVALID') {
  if (!(value instanceof Uint8Array) || value.byteLength > PXD_MAX_BYTES) fail(code);
  return value;
}

function validPath(path) {
  if (typeof path !== 'string' || path.length < 1 || path.length > 512 || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\') || path.includes('\0') || path.includes(':') || path.includes('%') || /[\u0000-\u001f\u007f]/.test(path)) return false;
  const parts = path.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..');
}

function canonicalize(value, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('PXD_JSON_INVALID');
    return value;
  }
  if (Array.isArray(value)) {
    if (stack.has(value)) fail('PXD_JSON_INVALID');
    stack.add(value); const output = value.map((item) => canonicalize(item, stack)); stack.delete(value); return output;
  }
  if (typeof value === 'object') {
    if (stack.has(value)) fail('PXD_JSON_INVALID');
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail('PXD_JSON_INVALID');
    stack.add(value); const output = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) fail('PXD_JSON_INVALID');
      output[key] = canonicalize(value[key], stack);
    }
    stack.delete(value); return output;
  }
  fail('PXD_JSON_INVALID');
}

export function canonicalPxdJson(value) {
  try { return JSON.stringify(canonicalize(value)); }
  catch (error) { if (error instanceof PxdCodecError) throw error; fail('PXD_JSON_INVALID'); }
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) fail('PXD_CRYPTO_UNAVAILABLE');
  const result = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...result].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cloneBytes(bytes) { return new Uint8Array(bytes); }

function cloneProject(project, entries = project.entries) {
  return {
    format: 'PXD', version: 3, projectId: project.projectId, revisionId: project.revisionId,
    manifest: structuredClone(project.manifest ?? {}),
    opaquePayloads: (project.opaquePayloads ?? []).map(({ bytes }) => ({ bytes })),
    entries: entries.map((entry) => ({ ...structuredClone(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'bytes'))), bytes: entry.bytes }))
  };
}

export function createPxdProject({ projectId = randomId('project'), revisionId = randomId('revision'), manifest = {}, entries = [], opaquePayloads = [] } = {}) {
  assertId(projectId); assertId(revisionId);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('PXD_MANIFEST_INVALID');
  if (!Array.isArray(entries) || entries.length > PXD_MAX_ENTRIES) fail('PXD_ENTRY_LIMIT');
  if (!Array.isArray(opaquePayloads)) fail('PXD_PROJECT_INVALID');
  const project = { format: 'PXD', version: 3, projectId, revisionId, manifest: structuredClone(manifest), opaquePayloads: [], entries: [] };
  const paths = new Set(); let total = 0;
  for (const entry of entries) {
    if (!entry || !validPath(entry.path) || paths.has(entry.path)) fail('PXD_PATH_INVALID');
    assertBytes(entry.bytes); total += entry.bytes.byteLength; if (total > PXD_MAX_BYTES) fail('PXD_SIZE_LIMIT');
    paths.add(entry.path); project.entries.push({ ...structuredClone(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'bytes'))), bytes: cloneBytes(entry.bytes) });
  }
  for (const chunk of opaquePayloads) {
    assertBytes(chunk?.bytes); total += chunk.bytes.byteLength; if (total > PXD_MAX_BYTES) fail('PXD_SIZE_LIMIT');
    project.opaquePayloads.push({ bytes: cloneBytes(chunk.bytes) });
  }
  return project;
}

function assertProject(project) {
  if (!project || project.format !== 'PXD' || project.version !== 3 || !ID_RE.test(project.projectId ?? '') || !ID_RE.test(project.revisionId ?? '') || !project.manifest || typeof project.manifest !== 'object' || Array.isArray(project.manifest) || !Array.isArray(project.entries) || project.entries.length > PXD_MAX_ENTRIES) fail('PXD_PROJECT_INVALID');
  if (project.opaquePayloads !== undefined && (!Array.isArray(project.opaquePayloads) || project.opaquePayloads.some((chunk) => !chunk || !(chunk.bytes instanceof Uint8Array)))) fail('PXD_PROJECT_INVALID');
  let size = (project.opaquePayloads ?? []).reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0); const paths = new Set();
  for (const entry of project.entries) {
    if (!entry || !validPath(entry.path) || paths.has(entry.path)) fail('PXD_PATH_INVALID');
    assertBytes(entry.bytes); size += entry.bytes.byteLength; if (size > PXD_MAX_BYTES) fail('PXD_SIZE_LIMIT'); paths.add(entry.path);
  }
}

export function getPxdJson(project, path) {
  const entry = project?.entries?.find((item) => item.path === path);
  if (!entry || !(entry.bytes instanceof Uint8Array)) fail('PXD_ENTRY_MISSING');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes)); }
  catch { fail('PXD_JSON_ENTRY_INVALID'); }
}

export function setPxdJson(project, path, value) {
  assertProject(project); if (!validPath(path)) fail('PXD_PATH_INVALID');
  const bytes = new TextEncoder().encode(canonicalPxdJson(value));
  return replaceEntry(project, path, bytes);
}

export function setPxdBytes(project, path, bytes) {
  assertProject(project); if (!validPath(path)) fail('PXD_PATH_INVALID'); assertBytes(bytes);
  return replaceEntry(project, path, bytes);
}

function replaceEntry(project, path, bytes) {
  const found = project.entries.some((entry) => entry.path === path);
  const entries = found
    ? project.entries.map((entry) => entry.path === path ? { ...entry, bytes: cloneBytes(bytes) } : entry)
    : [...project.entries, { path, bytes: cloneBytes(bytes) }];
  if (entries.length > PXD_MAX_ENTRIES || entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0) + (project.opaquePayloads ?? []).reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0) > PXD_MAX_BYTES) fail('PXD_SIZE_LIMIT');
  return cloneProject(project, entries);
}

function readU32LE(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) fail('PXD_TRUNCATED');
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function writeU32LE(bytes, offset, value) { new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value, true); }

function hasMagic(bytes) { return MAGIC.every((byte, index) => bytes[index] === byte); }

function parseJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('PXD_MANIFEST_JSON_INVALID'); }
}

function validateManifest(manifest, version) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.format !== 'PXD' || manifest.version !== version) fail('PXD_MANIFEST_INVALID');
  assertId(manifest.projectId); assertId(manifest.revisionId);
  if (!Array.isArray(manifest.entries) || manifest.entries.length > PXD_MAX_ENTRIES) fail('PXD_ENTRY_LIMIT');
}

function extractV3Entries(manifest, payload) {
  const paths = new Set(); const ranges = []; const entries = [];
  for (const descriptor of manifest.entries) {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor) || !validPath(descriptor.path) || paths.has(descriptor.path)) fail('PXD_PATH_INVALID');
    const offset = descriptor.offset; const length = descriptor.length;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || !HEX_SHA256.test(descriptor.sha256 ?? '') || !Number.isSafeInteger(offset + length)) fail('PXD_ENTRY_BOUNDS');
    if (offset + length > payload.length) fail('PXD_TRUNCATED');
    paths.add(descriptor.path); ranges.push([offset, offset + length]);
    entries.push({ ...descriptor, bytes: payload.slice(offset, offset + length) });
  }
  ranges.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < ranges.length; index += 1) if (ranges[index][0] < ranges[index - 1][1]) fail('PXD_ENTRY_OVERLAP');
  return entries;
}

function unreferencedChunks(payload, descriptors) {
  const ranges = descriptors.map((entry) => [entry.offset, entry.offset + entry.length]).sort((a, b) => a[0] - b[0]);
  const result = []; let cursor = 0;
  for (const [start, end] of ranges) { if (start > cursor) result.push(payload.slice(cursor, start)); cursor = Math.max(cursor, end); }
  if (cursor < payload.length) result.push(payload.slice(cursor));
  return result;
}

export async function encodePxd(project) {
  assertProject(project);
  const payloads = []; const descriptors = []; let offset = 0;
  for (const entry of project.entries) {
    const bytes = cloneBytes(entry.bytes); const { bytes: _ignored, ...unknown } = entry;
    const descriptor = { ...unknown, path: entry.path, offset, length: bytes.byteLength, sha256: await sha256(bytes) };
    descriptors.push(descriptor); payloads.push(bytes); offset += bytes.byteLength;
  }
  const opaquePayloads = project.opaquePayloads ?? [];
  const payloadTotal = offset + opaquePayloads.reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0);
  if (descriptors.length > PXD_MAX_ENTRIES || payloadTotal + V3_HEADER_BYTES > PXD_MAX_BYTES) fail('PXD_SIZE_LIMIT');
  const manifest = {
    ...structuredClone(project.manifest), format: 'PXD', version: 3,
    projectId: project.projectId, revisionId: project.revisionId, entries: descriptors
  };
  const manifestBytes = new TextEncoder().encode(canonicalPxdJson(manifest));
  if (V3_HEADER_BYTES + manifestBytes.length + payloadTotal > PXD_MAX_BYTES) fail('PXD_SIZE_LIMIT');
  const output = new Uint8Array(V3_HEADER_BYTES + manifestBytes.length + payloadTotal);
  output.set(MAGIC, 0); writeU32LE(output, 4, 3); writeU32LE(output, 8, manifestBytes.length); output.set(manifestBytes, V3_HEADER_BYTES);
  let cursor = V3_HEADER_BYTES + manifestBytes.length;
  for (const bytes of payloads) { output.set(bytes, cursor); cursor += bytes.length; }
  for (const chunk of opaquePayloads) { output.set(chunk.bytes, cursor); cursor += chunk.bytes.length; }
  return output;
}

function normalizeDecodedManifest(manifest) {
  const { format: _format, version: _version, projectId: _id, revisionId: _revision, entries: _entries, ...unknown } = manifest;
  return unknown;
}

async function decodeV3(bytes) {
  if (bytes.length < V3_HEADER_BYTES) fail('PXD_TRUNCATED');
  const length = readU32LE(bytes, 8); const start = V3_HEADER_BYTES; const end = start + length;
  if (end > bytes.length) fail('PXD_TRUNCATED');
  const manifest = parseJson(bytes.subarray(start, end)); validateManifest(manifest, 3);
  const payload = bytes.subarray(end); const entries = extractV3Entries(manifest, payload);
  for (let i = 0; i < entries.length; i += 1) if (await sha256(entries[i].bytes) !== manifest.entries[i].sha256) fail('PXD_HASH_MISMATCH');
  const chunks = unreferencedChunks(payload, manifest.entries);
  return { format: 'PXD', version: 3, projectId: manifest.projectId, revisionId: manifest.revisionId, manifest: normalizeDecodedManifest(manifest), entries, opaquePayloads: chunks.map((bytes) => ({ bytes })) };
}

// Previous Draw2 writer: PXD\0 + one-byte archive version + uint32-BE manifest length.
async function decodeOldDraw2(bytes, versionByte) {
  if (bytes.length < LEGACY_HEADER_BYTES) fail('PXD_TRUNCATED');
  const length = new DataView(bytes.buffer, bytes.byteOffset + 5, 4).getUint32(0, false);
  const start = LEGACY_HEADER_BYTES; const end = start + length;
  if (end > bytes.length) fail('PXD_TRUNCATED');
  const manifest = parseJson(bytes.subarray(start, end));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.format !== 'pxd') fail('PXD_LEGACY_INVALID');
  const payload = bytes.subarray(end); const oldDescriptors = versionByte === 1 ? manifest.assets : manifest.entries;
  if (!Array.isArray(oldDescriptors) || oldDescriptors.length > PXD_MAX_ENTRIES - 1) fail('PXD_LEGACY_INVALID');
  const extracted = [];
  const ranges = [];
  for (const descriptor of oldDescriptors) {
    const path = descriptor?.path; const offset = descriptor?.offset; const lengthBytes = versionByte === 1 ? descriptor?.bytes : descriptor?.bytes;
    if (!validPath(path) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(lengthBytes) || lengthBytes < 0 || offset + lengthBytes > payload.length || !HEX_SHA256.test(descriptor.sha256 ?? '')) fail('PXD_LEGACY_ENTRY_INVALID');
    const bytesPart = payload.slice(offset, offset + lengthBytes);
    if (await sha256(bytesPart) !== descriptor.sha256) fail('PXD_HASH_MISMATCH');
    ranges.push({ offset, length: lengthBytes, path });
    extracted.push({ path: `legacy/draw2/${path}`, bytes: bytesPart, legacyDescriptor: structuredClone(descriptor) });
  }
  ranges.sort((a, b) => a.offset - b.offset);
  for (let index = 1; index < ranges.length; index += 1) if (ranges[index].offset < ranges[index - 1].offset + ranges[index - 1].length) fail('PXD_ENTRY_OVERLAP');
  const projectId = ID_RE.test(manifest.projectId ?? '') ? manifest.projectId : `legacy-${(await sha256(bytes)).slice(0, 32)}`;
  const revisionId = `legacy-${(await sha256(bytes)).slice(0, 32)}`;
  const entries = [{ path: 'legacy/original.pxd', bytes: cloneBytes(bytes), legacyIdentity: `draw2-v${versionByte}` }, ...extracted];
  const gaps = unreferencedChunks(payload, ranges.map((range) => ({ offset: range.offset, length: range.length })));
  gaps.forEach((chunk, index) => { if (chunk.length) entries.push({ path: `legacy/draw2/unreferenced-${index}.bin`, bytes: chunk }); });
  if (entries.length > PXD_MAX_ENTRIES) fail('PXD_ENTRY_LIMIT');
  return createPxdProject({ projectId, revisionId, manifest: { legacy: { identity: `NEW_DRAW2_PXD_V${versionByte}`, sourceVersion: versionByte, sourceManifest: manifest } }, entries });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEocd(bytes) {
  const first = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= first; offset -= 1) if (readU32LE(bytes, offset) === 0x06054b50) return offset;
  return -1;
}

function extractStoredZip(bytes) {
  const eocd = findEocd(bytes); if (eocd < 0) fail('PXD_ZIP_INVALID');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const disk = view.getUint16(eocd + 4, true); const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true); const totalEntries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true); const centralOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);
  if (disk || centralDisk || diskEntries !== totalEntries || totalEntries < 1 || totalEntries > PXD_MAX_ENTRIES - 1 || eocd + 22 + commentLength !== bytes.length || centralOffset + centralSize !== eocd) fail('PXD_ZIP_INVALID');
  const decoder = new TextDecoder('utf-8', { fatal: true }); const entries = []; const paths = new Set(); const localRanges = []; let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readU32LE(bytes, cursor) !== 0x02014b50 || cursor + 46 > eocd) fail('PXD_ZIP_INVALID');
    const flags = view.getUint16(cursor + 8, true); const method = view.getUint16(cursor + 10, true); const expectedCrc = view.getUint32(cursor + 16, true);
    const compressed = view.getUint32(cursor + 20, true); const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const noteLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true); const next = cursor + 46 + nameLength + extraLength + noteLength;
    if (next > eocd || (flags & ~0x0800) !== 0 || method !== 0 || compressed !== uncompressed) fail('PXD_ZIP_UNSUPPORTED');
    let path; try { path = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); } catch { fail('PXD_ZIP_PATH_INVALID'); }
    if (!validPath(path) || paths.has(path)) fail('PXD_ZIP_PATH_INVALID'); paths.add(path);
    if (readU32LE(bytes, localOffset) !== 0x04034b50 || localOffset + 30 > centralOffset) fail('PXD_ZIP_INVALID');
    const localFlags = view.getUint16(localOffset + 6, true); const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true); const localCompressed = view.getUint32(localOffset + 18, true); const localUncompressed = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength; const dataEnd = dataStart + compressed;
    let localPath; try { localPath = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)); } catch { fail('PXD_ZIP_PATH_INVALID'); }
    if (localFlags !== flags || localMethod !== method || localCrc !== expectedCrc || localCompressed !== compressed || localUncompressed !== uncompressed || dataEnd > centralOffset || localPath !== path) fail('PXD_ZIP_INVALID');
    const body = bytes.slice(dataStart, dataEnd); if (crc32(body) !== expectedCrc) fail('PXD_ZIP_CRC_MISMATCH');
    localRanges.push([localOffset, dataEnd]);
    entries.push({ path, bytes: body, legacyZip: { crc32: expectedCrc, compression: method } }); cursor = next;
  }
  if (cursor !== eocd) fail('PXD_ZIP_INVALID');
  localRanges.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < localRanges.length; index += 1) if (localRanges[index][0] < localRanges[index - 1][1]) fail('PXD_ZIP_INVALID');
  return entries;
}

async function decodeLegacyZip(bytes) {
  const rawEntries = extractStoredZip(bytes);
  if (!rawEntries.some((entry) => entry.path === 'manifest.json') || !rawEntries.some((entry) => entry.path === 'project.json')) fail('PXD_ZIP_INVALID');
  const entries = [{ path: 'legacy/original.pxd', bytes: cloneBytes(bytes), legacyIdentity: 'LEGACY_PXD_ARCHIVE_V2' }];
  for (const entry of rawEntries) entries.push({ ...entry, path: `legacy/zip/${entry.path}` });
  if (entries.length > PXD_MAX_ENTRIES) fail('PXD_ENTRY_LIMIT');
  const manifestEntry = rawEntries.find((entry) => entry.path === 'manifest.json');
  const sourceManifest = parseJson(manifestEntry.bytes);
  if (!sourceManifest || !['pxd', 'pixieedraw'].includes(sourceManifest.format) || sourceManifest.version !== 2) fail('PXD_LEGACY_INVALID');
  const projectEntry = rawEntries.find((entry) => entry.path === 'project.json');
  const legacyProject = parseJson(projectEntry.bytes);
  if (!sourceManifest || typeof sourceManifest !== 'object' || !['pxd', 'pixiedraw'].includes(sourceManifest.format) || sourceManifest.version !== 2 || !legacyProject || typeof legacyProject !== 'object' || Array.isArray(legacyProject)) fail('PXD_LEGACY_INVALID');
  const digest = await sha256(bytes);
  const candidateId = sourceManifest.projectId ?? sourceManifest.id;
  const projectId = ID_RE.test(candidateId ?? '') ? candidateId : `legacy-${digest.slice(0, 32)}`;
  return createPxdProject({ projectId, revisionId: `legacy-${digest.slice(0, 32)}`, manifest: { legacy: { identity: 'LEGACY_PXD_ARCHIVE_V2', sourceManifest } }, entries });
}

export async function decodePxd(input) {
  assertBytes(input);
  if (!hasMagic(input)) {
    if (input[0] === 0x50 && input[1] === 0x4b && input[2] === 0x03 && input[3] === 0x04) return decodeLegacyZip(input);
    fail('PXD_MAGIC_INVALID');
  }
  if (input.length < 5) fail('PXD_TRUNCATED');
  if (input[4] === 3) {
    if (input.length < V3_HEADER_BYTES) fail('PXD_TRUNCATED');
    if (input[5] !== 0 || input[6] !== 0 || input[7] !== 0) fail('PXD_HEADER_INVALID');
    return decodeV3(input);
  }
  if (input[4] === 1 || input[4] === 2) return decodeOldDraw2(input, input[4]);
  fail('PXD_VERSION_UNSUPPORTED');
}
