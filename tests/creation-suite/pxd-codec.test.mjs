import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PXD_MAX_BYTES, PXD_MAX_ENTRIES, PxdCodecError, canonicalPxdJson, createPxdProject,
  decodePxd, encodePxd, getPxdJson, setPxdBytes, setPxdJson
} from '../../js/creation/pxd-codec.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sha = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((v) => v.toString(16).padStart(2, '0')).join('');
const u32le = (value) => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; };
const u32be = (value) => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, false); return bytes; };
function concat(...parts) { const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }

function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }

async function oldDraw2Fixture(version, sourcePath, payload) {
  const hash = await sha(payload);
  const descriptor = { path: sourcePath, offset: 0, bytes: payload.length, sha256: hash, oldDescriptorField: 'preserve' };
  const manifest = version === 1 ? { format: 'pxd', schemaVersion: 1, projectId: 'legacy-project', assets: [descriptor], unknownManifestField: { k: 1 } } : { format: 'pxd', schemaVersion: 2, projectId: 'legacy-project', entries: [descriptor], unknownManifestField: { k: 2 } };
  const json = encoder.encode(JSON.stringify(manifest)); return concat(encoder.encode('PXD\0'), new Uint8Array([version]), u32be(json.length), json, payload);
}

function storedZip(entries) {
  const localParts = []; const centralParts = []; let offset = 0;
  for (const { path, bytes } of entries) {
    const name = encoder.encode(path); const crc = crc32(bytes);
    const local = new Uint8Array(30); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(26, name.length, true); lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true);
    localParts.push(local, name, bytes);
    const central = new Uint8Array(46); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    centralParts.push(central, name); offset += local.length + name.length + bytes.length;
  }
  const centralSize = centralParts.reduce((n, item) => n + item.length, 0); const eocd = new Uint8Array(22); const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true); view.setUint32(12, centralSize, true); view.setUint32(16, offset, true);
  return concat(...localParts, ...centralParts, eocd);
}

test('v3 preserves RGBA/payload bytes, unknown manifest/descriptor JSON, and immutable edits', async () => {
  const pixels = new Uint8Array([255, 0, 10, 0, 1, 2, 3, 128]);
  const project = createPxdProject({ projectId: 'fixture-project', revisionId: 'fixture-r1', manifest: { futureManifestField: { z: true, a: 2 } }, entries: [
    { path: 'assets/image.rgba', bytes: pixels, futureDescriptorField: { keep: 'yes' } },
    { path: 'modules/audio/state.json', bytes: encoder.encode('{"z":1,"a":2}'), vendor: 'unknown' }
  ] });
  const original = await encodePxd(project); const decoded = await decodePxd(original);
  assert.deepEqual(decoded.manifest.futureManifestField, { z: true, a: 2 });
  assert.deepEqual(decoded.entries[0].bytes, pixels);
  assert.deepEqual(decoded.entries[0].futureDescriptorField, { keep: 'yes' });
  assert.deepEqual(getPxdJson(decoded, 'modules/audio/state.json'), { z: 1, a: 2 });
  const changed = setPxdJson(decoded, 'modules/audio/state.json', { z: 2, a: 1 });
  assert.deepEqual(getPxdJson(changed, 'modules/audio/state.json'), { a: 1, z: 2 });
  assert.deepEqual(decoded.entries[1].bytes, encoder.encode('{"z":1,"a":2}'), 'editing returns a new project');
  assert.deepEqual(changed.entries[0].bytes, pixels, 'untouched binary payload stays byte-exact');
  assert.deepEqual((await decodePxd(await encodePxd(changed))).entries[0].bytes, pixels);
  assert.match(canonicalPxdJson(JSON.parse('{"__proto__":{"safe":true},"b":1}')), /^\{"__proto__":\{"safe":true\},"b":1\}$/);
});

test('unreferenced v3 payload ranges survive decode and re-encode', async () => {
  const entryBytes = new Uint8Array([1, 2, 3]); const gap = new Uint8Array([90, 91, 92, 93]);
  const manifest = { format: 'PXD', version: 3, projectId: 'gap-project', revisionId: 'gap-r1', entries: [{ path: 'a.bin', offset: gap.length, length: entryBytes.length, sha256: await sha(entryBytes), extension: 'future' }] };
  const json = encoder.encode(canonicalPxdJson(manifest)); const container = concat(encoder.encode('PXD\0'), u32le(3), u32le(json.length), json, gap, entryBytes);
  const decoded = await decodePxd(container); assert.deepEqual(decoded.entries[0].bytes, entryBytes);
  const editedClone = setPxdJson(structuredClone(decoded), 'extra.json', { edited: true });
  const encoded = await encodePxd(editedClone); const roundTrip = await decodePxd(encoded);
  assert.deepEqual(roundTrip.entries[0].bytes, entryBytes);
  assert.ok(encoded.subarray(-gap.length).every((byte, i) => byte === gap[i]), 'unreferenced payload bytes are retained');
  assert.equal(roundTrip.entries[0].extension, 'future');
  assert.deepEqual(roundTrip.opaquePayloads[0].bytes, gap);
});

test('rejects malformed identifiers, unsafe paths, unknown v3 versions, bad hashes, overlap and truncation', async () => {
  assert.throws(() => createPxdProject({ projectId: '../evil' }), { code: 'PXD_ID_INVALID' });
  assert.throws(() => createPxdProject({ entries: [{ path: 'a/../b', bytes: new Uint8Array() }] }), { code: 'PXD_PATH_INVALID' });
  assert.throws(() => createPxdProject({ entries: [{ path: 'https://host/file', bytes: new Uint8Array() }] }), { code: 'PXD_PATH_INVALID' });
  const encoded = await encodePxd(createPxdProject({ projectId: 'bad-project', revisionId: 'bad-r1', entries: [{ path: 'entry.bin', bytes: new Uint8Array([1, 2]) }] }));
  const corrupt = encoded.slice(); corrupt[corrupt.length - 1] ^= 1;
  await assert.rejects(decodePxd(corrupt), { code: 'PXD_HASH_MISMATCH' });
  await assert.rejects(decodePxd(encoded.subarray(0, encoded.length - 1)), { code: 'PXD_TRUNCATED' });
  const future = encoded.slice(); future[4] = 4;
  await assert.rejects(decodePxd(future), { code: 'PXD_VERSION_UNSUPPORTED' });
  const overlapManifest = { format: 'PXD', version: 3, projectId: 'overlap', revisionId: 'overlap-r', entries: [
    { path: 'one', offset: 0, length: 2, sha256: await sha(new Uint8Array([1, 2])) },
    { path: 'two', offset: 1, length: 1, sha256: await sha(new Uint8Array([2])) }
  ] };
  const json = encoder.encode(canonicalPxdJson(overlapManifest)); const overlap = concat(encoder.encode('PXD\0'), u32le(3), u32le(json.length), json, new Uint8Array([1, 2]));
  await assert.rejects(decodePxd(overlap), { code: 'PXD_ENTRY_OVERLAP' });
});

test('enforces entry and total-byte caps before encoding', () => {
  const tooMany = Array.from({ length: PXD_MAX_ENTRIES + 1 }, (_, i) => ({ path: `entry-${i}`, bytes: new Uint8Array() }));
  assert.throws(() => createPxdProject({ entries: tooMany }), { code: 'PXD_ENTRY_LIMIT' });
  const project = createPxdProject({ projectId: 'limit-project', revisionId: 'limit-r1' });
  assert.throws(() => setPxdBytes(project, 'too-large.bin', new Uint8Array(PXD_MAX_BYTES + 1)), { code: 'PXD_BYTES_INVALID' });
});

test('imports old Draw2 v1 and v2 payload entries while retaining the exact original bytes', async () => {
  for (const version of [1, 2]) {
    const old = await oldDraw2Fixture(version, 'objects/raw.raster', new Uint8Array([12, 0, 255, 127]));
    const project = await decodePxd(old);
    assert.equal(project.manifest.legacy.identity, `NEW_DRAW2_PXD_V${version}`);
    assert.deepEqual(project.entries.find((entry) => entry.path === 'legacy/original.pxd').bytes, old);
    assert.deepEqual(project.entries.find((entry) => entry.path === 'legacy/draw2/objects/raw.raster').bytes, new Uint8Array([12, 0, 255, 127]));
    const roundTrip = await decodePxd(await encodePxd(project));
    assert.deepEqual(roundTrip.entries.find((entry) => entry.path === 'legacy/original.pxd').bytes, old);
  }
});

test('imports stored legacy ZIP entries as inert bytes and rejects compressed or corrupt ZIPs', async () => {
  const zip = storedZip([{ path: 'manifest.json', bytes: encoder.encode('{"format":"pxd","version":2,"projectId":"zip-project"}') }, { path: 'project.json', bytes: encoder.encode('{"untrusted":true}') }, { path: 'canvases/frame.json', bytes: encoder.encode('{"pixels":[1]}') }]);
  const project = await decodePxd(zip);
  assert.equal(project.manifest.legacy.identity, 'LEGACY_PXD_ARCHIVE_V2');
  assert.deepEqual(project.entries.find((entry) => entry.path === 'legacy/original.pxd').bytes, zip);
  assert.deepEqual(project.entries.find((entry) => entry.path === 'legacy/zip/canvases/frame.json').bytes, encoder.encode('{"pixels":[1]}'));
  const corrupt = zip.slice(); corrupt[35] ^= 0x80;
  await assert.rejects(decodePxd(corrupt), (error) => error instanceof PxdCodecError);
  await assert.rejects(decodePxd(concat(encoder.encode('PXD\0'), new Uint8Array([5]))), { code: 'PXD_VERSION_UNSUPPORTED' });
});
