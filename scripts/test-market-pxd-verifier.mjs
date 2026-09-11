import assert from "node:assert/strict";

import { createProject } from "../pixiedraw2/src/draw2-core.ts";
import { exportPxd, exportPxdProject } from "../pixiedraw2/src/draw2-export.ts";
import {
  computeMarketPackageSourceHash,
  hasValidContainerSignature,
  sha256Hex,
  validateMarketPackage,
} from "../supabase/functions/_shared/market-package-verifier.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function writeUint16(value) {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
}

function writeUint32(value) {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function storedZip(entries) {
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const bytes = entry.bytes;
    const localHeader = concat(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      writeUint16(20),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint32(0),
      writeUint32(bytes.byteLength),
      writeUint32(bytes.byteLength),
      writeUint16(name.byteLength),
      writeUint16(0),
      name,
      bytes,
    );
    local.push(localHeader);
    central.push(concat(
      Uint8Array.from([0x50, 0x4b, 0x01, 0x02]),
      writeUint16(20),
      writeUint16(20),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint32(0),
      writeUint32(bytes.byteLength),
      writeUint32(bytes.byteLength),
      writeUint16(name.byteLength),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint16(0),
      writeUint32(0),
      writeUint32(localOffset),
      name,
    ));
    localOffset += localHeader.byteLength;
  }
  const localBytes = concat(...local);
  const centralBytes = concat(...central);
  return concat(
    localBytes,
    centralBytes,
    Uint8Array.from([0x50, 0x4b, 0x05, 0x06]),
    writeUint16(0),
    writeUint16(0),
    writeUint16(entries.length),
    writeUint16(entries.length),
    writeUint32(centralBytes.byteLength),
    writeUint32(localBytes.byteLength),
    writeUint16(0),
  );
}

function fixtureState() {
  return createProject({
    projectId: "market-pxd-fixture",
    name: "PXD Fixture",
    width: 2,
    height: 2,
    tileSize: 32,
    palette: [0, 0xff0000ff],
  });
}

async function marketInput(bytes, path = "owner/asset/files/project.pxd") {
  const hash = await sha256Hex(bytes);
  const file = {
    original_path: "project.pxd",
    name: "project.pxd",
    size: bytes.byteLength,
    mime_type: "application/vnd.pixieed.pxd",
    format: "pixiedraw-project",
    sha256: hash,
    storage_path: path,
  };
  const manifest = {
    schema: "pixieed-market-package/v1",
    files: [file],
    product_composition: "pixiedraw-project",
    file_count: 1,
    total_bytes: bytes.byteLength,
  };
  return {
    manifest,
    ownerId: "owner",
    assetId: "asset",
    sourceSha256: await computeMarketPackageSourceHash([file]),
    includedFormats: ["pixiedraw-project"],
    fileObjectPaths: [path],
    downloadedFiles: [{ path, bytes, mimeType: file.mime_type }],
  };
}

function withTrailingByte(bytes) {
  return concat(bytes, Uint8Array.from([0xaa]));
}

function replaceManifestName(bytes, nextName) {
  const manifestLength = (bytes[5] * 0x1000000) + (bytes[6] << 16) + (bytes[7] << 8) + bytes[8];
  const manifestStart = 9;
  const manifestEnd = manifestStart + manifestLength;
  const source = decoder.decode(bytes.slice(manifestStart, manifestEnd));
  const parsed = JSON.parse(source);
  const oldName = parsed.project.name;
  assert.equal(oldName.length, nextName.length, "fixture mutation must preserve manifest length");
  const mutated = source.replace(`"name":"${oldName}"`, `"name":"${nextName}"`);
  assert.equal(encoder.encode(mutated).byteLength, manifestLength, "fixture mutation must preserve manifest byte length");
  return concat(bytes.slice(0, manifestStart), encoder.encode(mutated), bytes.slice(manifestEnd));
}

function replaceManifestToken(bytes, from, to) {
  const manifestLength = (bytes[5] * 0x1000000) + (bytes[6] << 16) + (bytes[7] << 8) + bytes[8];
  const manifestStart = 9;
  const manifestEnd = manifestStart + manifestLength;
  const source = decoder.decode(bytes.slice(manifestStart, manifestEnd));
  assert.equal(from.length, to.length, "fixture mutation must preserve token length");
  assert.equal(source.includes(from), true, `fixture token must exist: ${from}`);
  const mutated = source.replace(from, to);
  assert.equal(encoder.encode(mutated).byteLength, manifestLength, "fixture mutation must preserve manifest byte length");
  return concat(bytes.slice(0, manifestStart), encoder.encode(mutated), bytes.slice(manifestEnd));
}

function audioOptions() {
  return {
    audio: {
      schemaVersion: "AUDIO-200_PERSISTENCE_V1",
      record: { projectId: "market-pxd-fixture", checkpoint: { projectRevision: 1 } },
      assets: [{ revisionId: "audio-revision-1", mediaType: "audio/wav", bytes: Uint8Array.from([1, 2, 3]) }],
    },
  };
}

function gameOptions(projectId) {
  return {
    game: {
      schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
      record: {
        schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
        projectId,
        canonicalProject: {
          schemaVersion: 1,
          projectId,
          scenes: [{ sceneId: "scene:start", entities: [] }],
          prefabs: [],
          dependencies: [],
          behaviors: [],
          editorTimeline: { tracks: [] },
        },
      },
    },
  };
}

async function assertMarketAccepts(bytes, message) {
  const result = await validateMarketPackage(await marketInput(bytes));
  assert.equal(result.ok, true, message);
}

async function assertMarketRejects(bytes, code, message) {
  const result = await validateMarketPackage(await marketInput(bytes));
  assert.equal(result.ok, false, message);
  assert.equal(result.code, code, message);
}

Deno.test("Market verifier accepts current Draw2 PXD v1 and integrated v2", async () => {
  const state = fixtureState();
  const v1 = (await exportPxd(state)).bytes;
  const v2 = (await exportPxdProject(state, audioOptions())).bytes;
  const v2Game = (await exportPxdProject(state, gameOptions(state.projectId))).bytes;
  assert.equal(v1[0], 0x50);
  assert.equal(v1[1], 0x58);
  assert.equal(v1[2], 0x44);
  assert.equal(v1[3], 0x00);
  assert.equal(v1[4], 1);
  assert.equal(v2[4], 2);
  assert.equal(hasValidContainerSignature("pixiedraw-project", v1), true);
  assert.equal(hasValidContainerSignature("pixiedraw-project", v2), true);
  await assertMarketAccepts(v1, "PXD v1 must be accepted by the Market verifier");
  await assertMarketAccepts(v2, "PXD v2 must be accepted by the Market verifier");
  const gameResult = await validateMarketPackage(await marketInput(v2Game));
  assert.equal(gameResult.ok, true, "PXD v2 with a Game module must be accepted");
  assert.deepEqual(gameResult.gameProjectIds, [state.projectId], "Game module identity must be exposed to the server verification result");
});

Deno.test("Market verifier rejects PXD manifest, payload, and trailing-byte tampering", async () => {
  const state = fixtureState();
  const source = (await exportPxd(state)).bytes;
  const headerVersionTampered = source.slice();
  headerVersionTampered[4] = 2;
  await assertMarketRejects(headerVersionTampered, "MAGIC_MISMATCH", "header/archive version mismatch must be rejected");
  await assertMarketRejects(replaceManifestToken(source, '"schemaVersion":1', '"schemaVersion":2'), "MAGIC_MISMATCH", "schema version mismatch must be rejected");
  await assertMarketRejects(replaceManifestName(source, "PXD Tamper!"), "PXD_MANIFEST_HASH_MISMATCH", "manifest tampering must be rejected");

  const payloadTampered = source.slice();
  payloadTampered[payloadTampered.length - 1] ^= 0xff;
  await assertMarketRejects(payloadTampered, "PXD_PAYLOAD_HASH_MISMATCH", "payload tampering must be rejected");
  await assertMarketRejects(withTrailingByte(source), "PXD_TRAILING_BYTES", "trailing bytes must be rejected");
});

Deno.test("Existing stored ZIP PXD verification remains accepted", async () => {
  const zip = storedZip([
    { name: "manifest.json", bytes: encoder.encode("{}") },
    { name: "project.json", bytes: encoder.encode("{}") },
  ]);
  assert.equal(hasValidContainerSignature("pixiedraw-project", zip), true);
  await assertMarketAccepts(zip, "the existing stored ZIP PXD contract must remain accepted");
});
