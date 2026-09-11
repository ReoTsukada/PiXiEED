import {
  createUnityAudioImportPackage,
  encodeUnityAudioImportPackageZip,
  type UnityAudioExportInput,
} from "../../src/game/game-350/unity-audio-export.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function wavFixture(sampleRateHz = 48_000, channels = 2, bitDepth = 16): Uint8Array {
  const frameCount = 4;
  const dataBytes = frameCount * channels * (bitDepth / 8);
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * channels * (bitDepth / 8), true);
  view.setUint16(32, channels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 44; index < bytes.length; index += 1) bytes[index] = index & 0xff;
  return bytes;
}

function input(overrides: Partial<UnityAudioExportInput> = {}): UnityAudioExportInput {
  return {
    assetId: "audio:theme",
    revisionId: "revision:7",
    assetName: "Theme",
    role: "BGM",
    loop: true,
    bytes: wavFixture(),
    sampleRateHz: 48_000,
    channels: 2,
    bitDepth: 16,
    durationSeconds: 1.25,
    source: {
      projectId: "project:audio",
      stateHash: "sha256:state",
      projectRevision: 7,
    },
    ...overrides,
  };
}

Deno.test("GAME350-UNITY-AUDIO-001 exports deterministic WAV and Unity importer package", async () => {
  const first = await createUnityAudioImportPackage(input(), {
    creator: { creatorId: "creator:one", displayName: "Creator One" },
    license: {
      licenseId: "license:audio:7",
      rights: ["COMMERCIAL_USE"],
      commercialUse: true,
    },
  });
  const second = await createUnityAudioImportPackage(input(), {
    creator: { creatorId: "creator:one", displayName: "Creator One" },
    license: {
      licenseId: "license:audio:7",
      rights: ["COMMERCIAL_USE"],
      commercialUse: true,
    },
  });
  assert(first.ok && second.ok, "valid WAV should export");
  assert(first.value.packageHash === second.value.packageHash, "package hash must be deterministic");
  const firstZip = encodeUnityAudioImportPackageZip(first.value);
  const secondZip = encodeUnityAudioImportPackageZip(second.value);
  assert(firstZip.length === secondZip.length, "ZIP length must be deterministic");
  assert(firstZip.every((byte, index) => byte === secondZip[index]), "ZIP bytes must be deterministic");
  assert(first.value.entries.some((entry) => entry.path.endsWith("/Theme.wav")), "WAV must be included");
  assert(first.value.entries.some((entry) => entry.path.endsWith("/PiXiEEDAudio.json")), "audio manifest must be included");
  assert(first.value.entries.some((entry) => entry.path.endsWith("PiXiEEDAudio.cs")), "runtime asset must be included");
  assert(first.value.entries.some((entry) => entry.path.endsWith("PiXiEEDAudioImporter.cs")), "Unity importer must be included");
  const manifestEntry = first.value.entries.find((entry) => entry.path.endsWith("/PiXiEEDAudio.json"));
  assert(manifestEntry !== undefined, "manifest should be readable");
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.bytes)) as Record<string, any>;
  assert(manifest.schemaVersion === "UNITY_AUDIO_IMPORT_V1", "manifest schema must be explicit");
  assert(manifest.role === "BGM", "audio role must be retained");
  assert(manifest.loop === true, "loop setting must be retained");
  assert(manifest.format.sampleRateHz === 48_000 && manifest.format.channels === 2, "WAV format must be retained");
  assert(manifest.license.licenseId === "license:audio:7", "license metadata must be retained");
});

Deno.test("GAME350-UNITY-AUDIO-002 rejects a WAV/header mismatch before packaging", async () => {
  const result = await createUnityAudioImportPackage(input({ sampleRateHz: 44_100 }));
  assert(!result.ok, "metadata mismatch must fail closed");
  assert(result.diagnostics[0]?.code === "INVALID_WAV_METADATA", "mismatch should be diagnosed");
});

Deno.test("GAME350-UNITY-AUDIO-003 supports local renders without inventing a registered revision", async () => {
  const local = input({
    role: "MIX",
    loop: false,
    assetName: "Master Render",
  });
  const { revisionId: _revisionId, ...localInput } = local;
  const result = await createUnityAudioImportPackage(localInput);
  assert(result.ok, "local render should export");
  assert(result.value.revisionId === undefined, "local export must not invent a revision id");
  const manifest = result.value.entries.find((entry) => entry.path.endsWith("/PiXiEEDAudio.json"));
  assert(manifest !== undefined, "local manifest should be included");
  const manifestValue = JSON.parse(new TextDecoder().decode(manifest.bytes)) as Record<string, any>;
  assert(manifestValue.identityScope === "LOCAL_RENDER", "local identity scope must be explicit");
  assert(manifestValue.role === "MIX", "master render should be marked as MIX");
});
