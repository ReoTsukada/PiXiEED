import { createProject } from "../../src/draw2-core.ts";
import { exportPxd } from "../../src/draw2-export.ts";
import { DRAW150_CONTRACT, importDraw2LegacyPxd, inspectDraw2LegacyPxd } from "../../src/draw2/draw-150/legacy-compat-contract.ts";

type Entry = { path: string; bytes: Uint8Array };

function write16(target: Uint8Array, offset: number, value: number): void { target[offset] = value & 0xff; target[offset + 1] = (value >>> 8) & 0xff; }
function write32(target: Uint8Array, offset: number, value: number): void { target[offset] = value & 0xff; target[offset + 1] = (value >>> 8) & 0xff; target[offset + 2] = (value >>> 16) & 0xff; target[offset + 3] = (value >>> 24) & 0xff; }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb883b0 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function concat(...parts: readonly Uint8Array[]): Uint8Array { const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.byteLength; } return result; }
function storedZip(entries: readonly Entry[]): Uint8Array {
  const local: Uint8Array[] = []; const central: Uint8Array[] = []; let localSize = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path); const localHeader = new Uint8Array(30 + name.length);
    write32(localHeader, 0, 0x04034b50); write16(localHeader, 4, 20); write32(localHeader, 14, crc32(entry.bytes)); write32(localHeader, 18, entry.bytes.length); write32(localHeader, 22, entry.bytes.length); write16(localHeader, 26, name.length); localHeader.set(name, 30); local.push(localHeader, entry.bytes);
    const centralHeader = new Uint8Array(46 + name.length); write32(centralHeader, 0, 0x02014b50); write16(centralHeader, 4, 20); write16(centralHeader, 6, 20); write32(centralHeader, 16, crc32(entry.bytes)); write32(centralHeader, 20, entry.bytes.length); write32(centralHeader, 24, entry.bytes.length); write16(centralHeader, 28, name.length); write32(centralHeader, 42, localSize); centralHeader.set(name, 46); central.push(centralHeader); localSize += localHeader.length + entry.bytes.length;
  }
  const centralBytes = concat(...central); const end = new Uint8Array(22); write32(end, 0, 0x06054b50); write16(end, 8, entries.length); write16(end, 10, entries.length); write32(end, 12, centralBytes.length); write32(end, 16, localSize); return concat(...local, centralBytes, end);
}
function json(value: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(value)); }
function base64(bytes: Uint8Array): string { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
function legacyFixture(extra: Entry[] = []): Uint8Array {
  const manifest = { format: "pxd", version: 2, storageAdapterId: "pxd-v2-zip", packageType: "pixieedraw-project", packageVersion: 2, documentVersion: 1, width: 2, height: 2, canvasCount: 1, activeCanvasId: "canvas-1", documentName: "D150 Fixture" };
  const project = { projectId: "d150-fixture", type: "pixieedraw-project", packageVersion: 2, storageVersion: 2, storageAdapterId: "pxd-v2-zip", document: { documentName: "D150 Fixture", width: 2, height: 2, palette: [{ r: 0, g: 0, b: 0, a: 0 }, { r: 255, g: 0, b: 0, a: 255 }], activeFrame: 0, activeLayer: "layer-1" }, canvasEntries: [{ id: "canvas-1", path: "canvases/canvas-1.json", width: 2, height: 2, frameCount: 1, layerCount: 1 }] };
  const canvas = { id: "canvas-1", name: "Canvas", width: 2, height: 2, activeFrame: 0, activeLayer: "layer-1", frames: [{ id: "frame-1", duration: 100, layers: [{ id: "layer-1", name: "Pixels", visible: true, locked: false, indices: base64(new Uint8Array([0, 1, 0, 0])) }] }] };
  return storedZip([{ path: "manifest.json", bytes: json(manifest) }, { path: "project.json", bytes: json(project) }, { path: "canvases/canvas-1.json", bytes: json(canvas) }, ...extra]);
}
function assertEqual<T>(actual: T, expected: T): void { if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`); }
function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void { assertEqual(actual.length, expected.length); for (let index = 0; index < actual.length; index += 1) assertEqual(actual[index], expected[index]); }

Deno.test("DRAW-150 identifies Legacy v2 and imports a read-only working copy", async () => {
  assertEqual(DRAW150_CONTRACT.sourceReadOnly, true); assertEqual(DRAW150_CONTRACT.copyRequired, true); assertEqual(DRAW150_CONTRACT.networkUpload, false);
  const source = legacyFixture(); const before = source.slice(); const inspection = await inspectDraw2LegacyPxd(source);
  assertEqual(inspection.source.identity, "LEGACY_PXD_ARCHIVE_V2"); assertEqual(inspection.formatVersion, 2);
  const imported = await importDraw2LegacyPxd(source);
  assertEqual(imported.compatibility.sourceReadOnly, true); assertEqual(imported.compatibility.originalHashPreserved, true); assertEqual(imported.state.frames.length, 1); assertEqual(imported.state.layers.length, 1); assertEqual(imported.equivalence[0]?.pixelEqual, true);
  assertBytesEqual(source, before);
});

Deno.test("DRAW-150 never treats Draw2 PXD v1 as Legacy", async () => {
  const pxd = await exportPxd(createProject({ projectId: "new-d150", width: 2, height: 2 })); const inspection = await inspectDraw2LegacyPxd(pxd.bytes); assertEqual(inspection.source.identity, "NEW_DRAW2_PXD_V1"); assertEqual(inspection.status, "UNSUPPORTED");
});

Deno.test("DRAW-150 fails closed for unsafe archive paths and trailing bytes", async () => {
  const unsafe = legacyFixture([{ path: "../escape.json", bytes: json({ bad: true }) }]); const unsafeInspection = await inspectDraw2LegacyPxd(unsafe); assertEqual(unsafeInspection.status, "UNSUPPORTED");
  const trailing = concat(legacyFixture(), new Uint8Array([0xaa])); const trailingInspection = await inspectDraw2LegacyPxd(trailing); assertEqual(trailingInspection.status, "UNSUPPORTED");
});
