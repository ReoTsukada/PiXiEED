import { createProject } from "../../src/draw2-core.ts";
import { createAssetDefinitionDraft } from "../../src/draw2-creator-workspace.ts";
import { DRAW140_CONTRACT, exportDraw2Png, exportDraw2Pxd, importDraw2Pxd } from "../../src/draw2/draw-140/export-contract.ts";
import type { PxdAssetDefinitionEntry } from "../../src/draw2-export.ts";

function assertEqual<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  assertEqual(actual.byteLength, expected.byteLength);
  for (let index = 0; index < actual.length; index += 1) assertEqual(actual[index], expected[index]);
}

async function projectFixture() {
  const state = createProject({ projectId: "draw-140-fixture", name: "D140", width: 4, height: 4, palette: [0, 0xff0000ff, 0x00ff00ff] });
  state.assets[state.activeAssetId]?.raster.setPixel("draw-140-fixture", 1, 1, 1);
  state.assets[state.activeAssetId]?.raster.setPixel("draw-140-fixture", 2, 2, 2);
  return state;
}

function assetDefinitionFixture(): PxdAssetDefinitionEntry {
  const result = createAssetDefinitionDraft({
    sourceProjectId: "draw-140-fixture",
    sourceCanvasId: "canvas-main",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["layer-body"],
    frameStart: 1,
    frameEnd: 1,
    frameSelection: { kind: "CURRENT_FRAME", frameId: "frame-1" },
    assetKind: "CHARACTER",
    pivot: "FEET",
    metadata: { name: "Hero", tags: ["player"] },
  });
  if (!result.ok) throw new Error(result.message);
  return { definitionId: "hero", definition: result.value };
}

Deno.test("DRAW-140 keeps export authority isolated and deterministic", async () => {
  assertEqual(DRAW140_CONTRACT.currentPxdMutation, false);
  assertEqual(DRAW140_CONTRACT.networkUpload, false);
  const first = await exportDraw2Pxd(await projectFixture());
  const second = await exportDraw2Pxd(await projectFixture());
  assertBytesEqual(first.bytes, second.bytes);
  assertEqual(first.packageHash, second.packageHash);
  assertEqual(first.manifestHash, second.manifestHash);
});

Deno.test("DRAW-140 PNG is canonical RGBA and agrees with indexed source", async () => {
  const state = await projectFixture();
  const png = await exportDraw2Png(state);
  assertEqual(png.mimeType, "image/png");
  assertEqual(png.width, 4);
  assertEqual(png.height, 4);
  assertEqual(png.bytes[0], 137);
  assertEqual(png.pixelHash, await (async () => {
    const indexed = new Uint8Array(state.assets[state.activeAssetId]?.raster.toUint8Array() ?? new Uint8Array());
    const digest = await crypto.subtle.digest("SHA-256", indexed.buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  })());
});

Deno.test("DRAW-140 PXD round-trips canonical state and rejects corruption", async () => {
  const state = await projectFixture();
  const exported = await exportDraw2Pxd(state);
  const imported = await importDraw2Pxd(exported.bytes, { expectedPackageHash: exported.packageHash });
  assertEqual(imported.state.projectId, state.projectId);
  assertEqual(imported.state.name, state.name);
  assertBytesEqual(imported.state.assets[imported.state.activeAssetId]?.raster.toUint8Array() ?? new Uint8Array(), state.assets[state.activeAssetId]?.raster.toUint8Array() ?? new Uint8Array());
  const corrupted = exported.bytes.slice();
  corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;
  try {
    await importDraw2Pxd(corrupted);
    throw new Error("corrupted PXD was accepted");
  } catch (cause) {
    const error = cause as Error & { code?: string };
    if (!(cause instanceof Error) || !/PXD_ASSET_HASH_MISMATCH|PXD_PACKAGE_HASH_MISMATCH/u.test(error.code ?? "")) throw cause;
  }
});

Deno.test("DRAW-140 PXD keeps Asset Definitions inside the project container", async () => {
  const state = await projectFixture();
  const assetDefinition = assetDefinitionFixture();
  const exported = await exportDraw2Pxd(state, { assetDefinitions: [assetDefinition] });
  const exportedAgain = await exportDraw2Pxd(state, { assetDefinitions: [assetDefinition] });
  assertBytesEqual(exported.bytes, exportedAgain.bytes);
  assertEqual(exported.manifest.assetDefinitions?.[0]?.definitionId, "hero");
  assertEqual(exported.manifest.assetDefinitions?.[0]?.definition.persistence, "LOCAL_DRAFT");
  const serializedDefinition = JSON.stringify(exported.manifest.assetDefinitions?.[0]?.definition);
  if (serializedDefinition.includes("pixelData") || serializedDefinition.includes("raster") || serializedDefinition.includes("blob")) {
    throw new Error("PXD Asset Definition must contain references, not embedded pixel data");
  }
  const imported = await importDraw2Pxd(exported.bytes);
  assertEqual(imported.assetDefinitions.length, 1);
  assertEqual(imported.assetDefinitions[0]?.definition.metadata.name, "Hero");
  assertEqual(imported.assetDefinitions[0]?.definition.sourceCanvasId, "canvas-main");
});

Deno.test("DRAW-140 rejects inline registered state and duplicate Asset Definitions", async () => {
  const state = await projectFixture();
  const entry = assetDefinitionFixture();
  try {
    await exportDraw2Pxd(state, {
      assetDefinitions: [
        { ...entry, registryIdentity: { assetId: "asset-1", revisionId: "revision-1" } },
        entry,
      ],
    });
    throw new Error("duplicate Asset Definitions were accepted");
  } catch (cause) {
    const error = cause as Error & { code?: string };
    if (!(cause instanceof Error) || error.code !== "PXD_ASSET_DEFINITION_DUPLICATE") throw cause;
  }
  try {
    await exportDraw2Pxd(state, {
      assetDefinitions: [{ ...entry, definition: { ...entry.definition, persistence: "REGISTERED_ASSET", assetId: "asset-1", revisionId: "revision-1" } as never }],
    });
    throw new Error("registered Asset Definition was accepted inside PXD");
  } catch (cause) {
    const error = cause as Error & { code?: string };
    if (!(cause instanceof Error) || error.code !== "PXD_ASSET_DEFINITION_PERSISTENCE_INVALID") throw cause;
  }
});

Deno.test("DRAW-140 rejects trailing bytes and does not mutate source bytes", async () => {
  const exported = await exportDraw2Pxd(await projectFixture());
  const input = new Uint8Array(exported.bytes.byteLength + 1);
  input.set(exported.bytes);
  input[input.length - 1] = 0xaa;
  const before = input.slice();
  try {
    await importDraw2Pxd(input);
    throw new Error("trailing PXD bytes were accepted");
  } catch (cause) {
    const error = cause as Error & { code?: string };
    if (!(cause instanceof Error) || error.code !== "PXD_TRAILING_BYTES") throw cause;
  }
  assertBytesEqual(input, before);
});
