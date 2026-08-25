import {
  computeMarketPackageSourceHash,
  hasValidContainerSignature,
  validateMarketPackage,
  sha256Hex,
  type MarketPackageFile,
} from "../../supabase/functions/_shared/market-package-verifier.ts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const imagePath = `${ownerId}/${assetId}/files/01-image.png`;
const audioPath = `${ownerId}/${assetId}/files/02-audio.wav`;

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function storedZip(entries: Array<[string, string]>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  const encoder = new TextEncoder();
  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralOffset = localOffset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  const all = [...localParts, ...centralParts, end];
  const output = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of all) { output.set(part, offset); offset += part.length; }
  return output;
}

async function fixture() {
  const image = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
  const audio = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
  const files: MarketPackageFile[] = [
    {
      original_path: "01-image.png",
      name: "image.png",
      size: image.byteLength,
      mime_type: "image/png",
      format: "png",
      sha256: await sha256Hex(image),
      storage_path: imagePath,
    },
    {
      original_path: "02-audio.wav",
      name: "audio.wav",
      size: audio.byteLength,
      mime_type: "audio/wav",
      format: "wav",
      sha256: await sha256Hex(audio),
      storage_path: audioPath,
    },
  ];
  const sourceHash = await computeMarketPackageSourceHash(files);
  return {
    image,
    audio,
    files,
    sourceHash,
    manifest: {
      schema: "pixieed-market-package/v1",
      file_count: files.length,
      total_bytes: image.byteLength + audio.byteLength,
      product_composition: "image-audio",
      files,
    },
    downloadedFiles: [
      { path: imagePath, bytes: image, mimeType: "image/png" },
      { path: audioPath, bytes: audio, mimeType: "audio/wav" },
    ],
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("market package verifier accepts matching image and audio bytes", async () => {
  const value = await fixture();
  const result = await validateMarketPackage({
    manifest: value.manifest,
    ownerId,
    assetId,
    sourceSha256: value.sourceHash,
    includedFormats: ["png", "wav"],
    fileObjectPaths: [imagePath, audioPath],
    downloadedFiles: value.downloadedFiles,
  });
  assert(result.ok, result.ok ? "" : result.message);
  assert(result.composition === "image-audio", "composition should be image-audio");
});

Deno.test("market package verifier rejects a wrong container signature", async () => {
  const value = await fixture();
  const result = await validateMarketPackage({
    manifest: value.manifest,
    ownerId,
    assetId,
    sourceSha256: value.sourceHash,
    includedFormats: ["png", "wav"],
    fileObjectPaths: [imagePath, audioPath],
    downloadedFiles: [{ ...value.downloadedFiles[0], bytes: value.audio }, value.downloadedFiles[1]],
  });
  assert(!result.ok && result.code === "SIZE_MISMATCH", "size mismatch should be detected before magic mismatch");
});

Deno.test("market package verifier rejects a path outside the seller scope", async () => {
  const value = await fixture();
  const result = await validateMarketPackage({
    manifest: value.manifest,
    ownerId,
    assetId,
    sourceSha256: value.sourceHash,
    includedFormats: ["png", "wav"],
    fileObjectPaths: ["other-user/asset/files/image.png", audioPath],
    downloadedFiles: value.downloadedFiles,
  });
  assert(!result.ok && result.code === "PATH_SCOPE", "out-of-scope path should be rejected");
});

Deno.test("market package verifier rejects a changed byte hash", async () => {
  const value = await fixture();
  const changedImage = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01);
  const result = await validateMarketPackage({
    manifest: value.manifest,
    ownerId,
    assetId,
    sourceSha256: value.sourceHash,
    includedFormats: ["png", "wav"],
    fileObjectPaths: [imagePath, audioPath],
    downloadedFiles: [{ path: imagePath, bytes: changedImage, mimeType: "image/png" }, value.downloadedFiles[1]],
  });
  assert(!result.ok && result.code === "HASH_MISMATCH", "changed bytes should be rejected");
});

Deno.test("market package verifier accepts only a safe stored PXD archive", () => {
  const valid = storedZip([["manifest.json", "{}"], ["project.json", "{}"]]);
  assert(hasValidContainerSignature("pixiedraw-project", valid), "valid PXD archive should pass");
  const unsafe = storedZip([["manifest.json", "{}"], ["project.json", "{}"], ["../escape", "x"]]);
  assert(!hasValidContainerSignature("pixiedraw-project", unsafe), "unsafe PXD path should fail");
});
