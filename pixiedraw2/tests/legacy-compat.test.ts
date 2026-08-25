import { exportPxd } from "../src/draw2-export.ts";
import { createProject } from "../src/draw2-core.ts";
import { LegacyPxdCompatibilityError, importLegacyPxd, inspectPxd } from "../src/draw2-legacy-compat.ts";

type Entry = { path: string; bytes: Uint8Array };

function assertEquals<T>(actual: T, expected: T): void {
  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (actual.byteLength !== expected.byteLength || actual.some((value, index) => value !== expected[index])) throw new Error("Uint8Array values differ");
    return;
  }
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

async function assertRejects(action: () => Promise<unknown>, expected?: typeof LegacyPxdCompatibilityError, message?: string): Promise<void> {
  try {
    await action();
  } catch (cause) {
    if (expected !== undefined && !(cause instanceof expected)) throw new Error("Unexpected error class");
    if (message !== undefined && (!(cause instanceof Error) || !cause.message.includes(message))) throw new Error(`Unexpected error message: ${String(cause)}`);
    return;
  }
  throw new Error("Expected the operation to reject");
}

function write16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function write32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function storedZip(entries: readonly Entry[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let localSize = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path);
    const localHeader = new Uint8Array(30 + name.length);
    write32(localHeader, 0, 0x04034b50);
    write16(localHeader, 4, 20);
    write16(localHeader, 6, 0);
    write16(localHeader, 8, 0);
    write32(localHeader, 14, crc32(entry.bytes));
    write32(localHeader, 18, entry.bytes.byteLength);
    write32(localHeader, 22, entry.bytes.byteLength);
    write16(localHeader, 26, name.length);
    localHeader.set(name, 30);
    local.push(localHeader, entry.bytes);

    const centralHeader = new Uint8Array(46 + name.length);
    write32(centralHeader, 0, 0x02014b50);
    write16(centralHeader, 4, 20);
    write16(centralHeader, 6, 20);
    write16(centralHeader, 8, 0);
    write16(centralHeader, 10, 0);
    write32(centralHeader, 16, crc32(entry.bytes));
    write32(centralHeader, 20, entry.bytes.byteLength);
    write32(centralHeader, 24, entry.bytes.byteLength);
    write16(centralHeader, 28, name.length);
    write32(centralHeader, 42, localSize);
    centralHeader.set(name, 46);
    central.push(centralHeader);
    localSize += localHeader.byteLength + entry.bytes.byteLength;
  }
  const centralBytes = concat(...central);
  const end = new Uint8Array(22);
  write32(end, 0, 0x06054b50);
  write16(end, 8, entries.length);
  write16(end, 10, entries.length);
  write32(end, 12, centralBytes.byteLength);
  write32(end, 16, localSize);
  return concat(...local, centralBytes, end);
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bitmapHash(bytes: Uint8Array, width: number, height: number): Promise<string> {
  const prefix = new TextEncoder().encode(`rgba.zlib\0${width}\0${height}\0`);
  return await sha256(concat(prefix, bytes));
}

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

async function fixture(options: { unknownField?: boolean; unsafeEntry?: boolean; futureVersion?: boolean; withCel?: boolean; mismatchCel?: boolean } = {}): Promise<{ bytes: Uint8Array; indices: Uint8Array; rgba: Uint8Array }> {
  const indices = new Uint8Array([0, 1, 0, 2]);
  const rgba = new Uint8Array([
    0, 0, 0, 0,
    255, 0, 0, 255,
    0, 0, 0, 0,
    0, 255, 0, 255,
  ]);
  const palette = [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 255, g: 0, b: 0, a: 255 },
    { r: 0, g: 255, b: 0, a: 255 },
  ];
  const layer: Record<string, unknown> = {
    id: "layer-1",
    name: "Pixels",
    visible: true,
    locked: false,
    indices: base64(indices),
  };
  const bitmapPath = "bitmaps/fixture.rgba.zlib";
  const bitmapPayload = options.mismatchCel
    ? new Uint8Array([0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 255, 0, 255])
    : rgba;
  if (options.withCel) {
    layer.cel = { x: 0, y: 0, w: 2, h: 2, bitmapRef: bitmapPath, encoding: "rgba.zlib", hash: await bitmapHash(bitmapPayload, 2, 2) };
  }
  const emptyLayer = { id: "layer-empty", name: "Empty Cel", visible: true, locked: false, indices: base64(new Uint8Array(4)) };
  if (options.unknownField) layer.futureToolHint = "preserve-me";
  const canvas = {
    id: "canvas-1",
    name: "Main Canvas",
    width: 2,
    height: 2,
    activeFrame: 0,
    activeLayer: "layer-1",
    frames: [
      { id: "frame-1", duration: 100, layers: [layer, emptyLayer] },
      { id: "frame-2", duration: 200, layers: [{ id: "layer-1", name: "Pixels", visible: true, locked: false, indices: base64(new Uint8Array([0, 2, 0, 1])) }] },
      { id: "frame-empty", duration: 300, layers: [] },
    ],
  };
  const manifest = {
    format: "pxd",
    version: options.futureVersion ? 99 : 2,
    storageAdapterId: "pxd-v2-zip",
    packageType: "pixieedraw-project",
    packageVersion: 2,
    documentVersion: 1,
    width: 2,
    height: 2,
    canvasCount: 1,
    activeCanvasId: "canvas-1",
    sheetCount: 0,
    documentName: "Legacy Fixture",
    certification: { schemaVersion: 1 },
  };
  const project = {
    projectId: "legacy-fixture-project",
    type: "pixieedraw-project",
    packageVersion: 2,
    storageVersion: 2,
    storageAdapterId: "pxd-v2-zip",
    document: { documentName: "Legacy Fixture", width: 2, height: 2, palette, activeFrame: 0, activeLayer: "layer-1" },
    canvasEntries: [{ id: "canvas-1", name: "Main Canvas", path: "canvases/canvas-1.json", width: 2, height: 2, frameCount: 3, layerCount: 2 }],
  };
  const entries: Entry[] = [
    { path: "manifest.json", bytes: json(manifest) },
    { path: "project.json", bytes: json(project) },
    { path: "canvases/canvas-1.json", bytes: json(canvas) },
  ];
  if (options.withCel) entries.push({ path: bitmapPath, bytes: bitmapPayload });
  if (options.unsafeEntry) entries.push({ path: "../escape.json", bytes: json({ unsafe: true }) });
  return { bytes: storedZip(entries), indices, rgba };
}

async function identityPreservingDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  return bytes.slice();
}

Deno.test("identifies current Legacy PXD and separates Draw2 PXD v1", async () => {
  const legacy = await fixture();
  const inspection = await inspectPxd(legacy.bytes);
  assertEquals(inspection.source.identity, "LEGACY_PXD_ARCHIVE_V2");
  assertEquals(inspection.formatVersion, 2);
  const newPxd = await exportPxd(createProject({ projectId: "new-v1", width: 2, height: 2 }));
  const newInspection = await inspectPxd(newPxd.bytes);
  assertEquals(newInspection.source.identity, "NEW_DRAW2_PXD_V1");
  assertEquals(newInspection.status, "UNSUPPORTED");
  await assertRejects(() => importLegacyPxd(newPxd.bytes), LegacyPxdCompatibilityError, "legacy adapter accepts only current archive-v2");
});

Deno.test("imports synthetic Legacy PXD as a read-only Draw2 working copy with pixel and structure equivalence", async () => {
  const legacy = await fixture();
  const beforeBytes = legacy.bytes.slice();
  const beforeHash = await sha256(legacy.bytes);
  const imported = await importLegacyPxd(legacy.bytes);
  const afterHash = await sha256(legacy.bytes);
  assertEquals(afterHash, beforeHash);
  assertEquals(legacy.bytes, beforeBytes);
  assertEquals(imported.source.originalBytesRetained, true);
  assertEquals(imported.compatibility.sourceReadOnly, true);
  assertEquals(imported.compatibility.copyRequired, true);
  assertEquals(imported.compatibility.originalHashPreserved, true);
  assertEquals(imported.state.name, "Legacy Fixture");
  assertEquals(imported.state.frames.length, 3);
  assertEquals(imported.state.layers.length, 2);
  assertEquals(imported.state.cels.length, 6);
  assertEquals(imported.equivalence.length, 2);
  assertEquals(imported.equivalence.every((item) => item.pixelEqual && item.structuralEqual), true);
  assertEquals(imported.state.assets[imported.state.activeAssetId] !== undefined, true);
});

Deno.test("validates a Legacy bitmap hash and rejects indexed/RGBA disagreement", async () => {
  const legacy = await fixture({ withCel: true });
  const imported = await importLegacyPxd(legacy.bytes, { decompressDeflate: identityPreservingDecompress });
  assertEquals(imported.equivalence[0]?.pixelEqual, true);
  const mismatch = await fixture({ withCel: true, mismatchCel: true });
  await assertRejects(() => importLegacyPxd(mismatch.bytes, { decompressDeflate: identityPreservingDecompress }), LegacyPxdCompatibilityError, "RGBA payload");
});

Deno.test("unknown fields remain reviewable and original-only", async () => {
  const legacy = await fixture({ unknownField: true });
  const inspection = await inspectPxd(legacy.bytes);
  assertEquals(inspection.status, "REVIEW_REQUIRED");
  assertEquals(inspection.unknownFieldPaths.includes("canvases/canvas-1.json.frames.0.layers.0.futureToolHint"), true);
  const imported = await importLegacyPxd(legacy.bytes);
  assertEquals(imported.compatibility.status, "REVIEW_REQUIRED");
  assertEquals(imported.compatibility.unknownFieldPolicy, "PRESERVE_IN_ORIGINAL_AND_REVIEW");
});

Deno.test("fails closed for unsafe, future, truncated, trailing, and active-content inputs without changing source bytes", async () => {
  const unsafe = await fixture({ unsafeEntry: true });
  const unsafeBefore = unsafe.bytes.slice();
  await assertRejects(() => importLegacyPxd(unsafe.bytes), LegacyPxdCompatibilityError, "Unsafe legacy PXD entry path");
  assertEquals(unsafe.bytes, unsafeBefore);

  const future = await fixture({ futureVersion: true });
  const futureInspection = await inspectPxd(future.bytes);
  assertEquals(futureInspection.status, "UNSUPPORTED");
  await assertRejects(() => importLegacyPxd(future.bytes), LegacyPxdCompatibilityError, "manifest version is unsupported");

  const truncated = (await fixture()).bytes.slice(0, -7);
  const truncatedBefore = truncated.slice();
  await assertRejects(() => importLegacyPxd(truncated), LegacyPxdCompatibilityError);
  assertEquals(truncated, truncatedBefore);

  const trailing = concat((await fixture()).bytes, new Uint8Array([0xaa]));
  await assertRejects(() => importLegacyPxd(trailing), LegacyPxdCompatibilityError, "trailing bytes");

  const active = await fixture();
  const activeEntries = [
    { path: "manifest.json", bytes: json({ format: "pxd", version: 2 }) },
    { path: "project.json", bytes: json({}) },
    { path: "canvases/canvas-1.json", bytes: json({}) },
    { path: "preview.svg", bytes: new TextEncoder().encode("<svg><script>alert(1)</script></svg>") },
  ];
  void active;
  await assertRejects(() => importLegacyPxd(storedZip(activeEntries)), LegacyPxdCompatibilityError, "Active content");
});

Deno.test("requires a decompressor for bitmap payloads and rejects malformed bitmap lengths", async () => {
  const legacy = await fixture({ withCel: true });
  await assertRejects(() => importLegacyPxd(legacy.bytes), LegacyPxdCompatibilityError, "deflate decompressor");
  await assertRejects(() => importLegacyPxd(legacy.bytes, { decompressDeflate: async () => new Uint8Array([1, 2, 3]) }), LegacyPxdCompatibilityError, "bitmap length");
});

Deno.test("preserves the Legacy/New exporter boundary and keeps the adapter DOM/network free", async () => {
  const source = await Deno.readTextFile(new URL("../src/draw2-legacy-compat.ts", import.meta.url));
  for (const forbidden of ["fetch(", "WebSocket", "indexedDB", "localStorage", "BroadcastChannel", "supabase", "draw2-entry"]) {
    if (source.includes(forbidden)) throw new Error(`Legacy adapter must not depend on ${forbidden}`);
  }
  if (source.includes("draw2-export")) throw new Error("Legacy adapter must not reverse the WP-140 exporter");
  assertEquals(source.includes("originalBytesRetained"), true);
  assertEquals(source.includes("LEGACY_PATH_UNSAFE"), true);
  assertEquals(source.includes("LEGACY_DECOMPRESSOR_REQUIRED"), true);
});
