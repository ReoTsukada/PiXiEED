import { strict as assert } from "node:assert";
import { validateArchive, validateArchiveBytes } from "../../src/fp-005/archive-validation.ts";
import { validateContent, validateContentBytes } from "../../src/fp-005/content-validation.ts";
import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";

function u16(value: number): number[] { return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value: number): number[] { return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]; }
function concat(...parts: readonly number[][]): Uint8Array { return Uint8Array.from(parts.flat()); }
function bytes(text: string): Uint8Array { return new TextEncoder().encode(text); }
function crc32(value: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipFixtureEntry { path: string; data?: Uint8Array; expanded?: number; externalAttributes?: number; }

function zipFixture(specs: readonly ZipFixtureEntry[]): Uint8Array {
  const locals: number[][] = [];
  const centrals: number[][] = [];
  let localOffset = 0;
  for (const spec of specs) {
    const name = bytes(spec.path);
    const data = spec.data ?? bytes("ok");
    const expanded = spec.expanded ?? data.byteLength;
    const checksum = crc32(data);
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(checksum), ...u32(data.byteLength), ...u32(expanded), ...u16(name.byteLength), ...u16(0),
      ...name, ...data,
    ];
    locals.push(local);
    const central = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(checksum), ...u32(data.byteLength), ...u32(expanded), ...u16(name.byteLength), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(spec.externalAttributes ?? 0), ...u32(localOffset), ...name,
    ];
    centrals.push(central);
    localOffset += local.length;
  }
  const centralOffset = localOffset;
  const centralSize = centrals.reduce((total, item) => total + item.length, 0);
  return concat(...locals, ...centrals, [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(specs.length), ...u16(specs.length),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0),
  ]);
}

function validPng(): Uint8Array {
  return concat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0],
  );
}

const validZip = zipFixture([{ path: "docs/readme.txt", data: bytes("ok") }]);

Deno.test("FP005 finalization accepts real small PNG and ZIP fixtures", () => {
  assert.equal(validateContentBytes({ data: validPng(), mimeType: "image/png" }).ok, true);
  const archive = validateArchiveBytes(validZip);
  assert.equal(archive.ok, true);
  if (archive.ok) {
    assert.equal(archive.value.verifiedFromBytes, true);
    assert.equal(archive.value.entryCount, 1);
  }
});

Deno.test("FP005 finalization rejects metadata-only and truncated content", () => {
  assert.equal(validateContent({ data: { byteLength: 4 }, mimeType: "application/octet-stream" } as never).ok, false);
  assert.equal(validateArchive([{ path: "docs/readme.txt" }]).ok, false);
  assert.equal(validateContentBytes({ data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mimeType: "image/png" }).ok, false);
  assert.equal(validateContentBytes({ data: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), mimeType: "image/jpeg" }).ok, false);
  assert.equal(validateContentBytes({ data: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0, 0]), mimeType: "image/gif" }).ok, false);
});

Deno.test("FP005 finalization rejects active content hidden by octet-stream or MIME", () => {
  const html = validateContentBytes({ data: bytes("<svg><script>alert(1)</script>"), mimeType: "application/octet-stream" });
  assert.equal(html.ok, false);
  if (!html.ok) assert.equal(html.diagnostics[0]?.code, FP005_ERROR_CODES.ACTIVE_CONTENT_REJECTED);
  assert.equal(validateContentBytes({ data: bytes("anything"), mimeType: "application/x-unknown" }).ok, false);
});

Deno.test("FP005 finalization rejects ZIP traversal, duplicate, symlink, ratio, and active Office entries", () => {
  for (const archive of [
    zipFixture([{ path: "../escape.txt" }]),
    zipFixture([{ path: "same.txt" }, { path: "same.txt" }]),
    zipFixture([{ path: "link", externalAttributes: 0xa0000000 }]),
    zipFixture([{ path: "bomb.bin", data: Uint8Array.of(0), expanded: 101 }]),
    zipFixture([{ path: "word/vbaProject.bin" }]),
  ]) assert.equal(validateArchiveBytes(archive).ok, false);
});

Deno.test("FP005 finalization rejects malformed ZIP local/central boundaries", () => {
  assert.equal(validateArchiveBytes(validZip.subarray(0, validZip.byteLength - 1)).ok, false);
  const broken = validZip.slice();
  broken[0] = 0;
  assert.equal(validateArchiveBytes(broken).ok, false);
});
