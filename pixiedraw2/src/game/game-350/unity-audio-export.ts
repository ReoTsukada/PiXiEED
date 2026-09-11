/**
 * Unity import package for a rendered iAUDIO asset.
 *
 * PiXiEED emits one verified WAV, one canonical manifest, and a small Unity
 * Editor importer. Native Unity import/compile remains a separate acceptance
 * gate; this module does not claim to execute Unity.
 */

import {
  encodeStoredZip,
  type StoredZipEntry,
} from "../../draw2-export.ts";
import {
  asSha256,
  canonicalJson,
  type Sha256,
} from "../game-300/core.ts";

export const UNITY_AUDIO_IMPORT_SCHEMA_VERSION = "UNITY_AUDIO_IMPORT_V1" as const;
export const UNITY_AUDIO_IMPORT_PACKAGE_KIND = "PIXIEED_UNITY_AUDIO" as const;

export type UnityAudioRole = "BGM" | "SE" | "VOICE" | "MIX";
export type UnityAudioImportMimeType = "application/json" | "audio/wav" | "text/plain";

export interface UnityAudioSourceIdentity {
  readonly projectId: string;
  readonly stateHash: string;
  readonly projectRevision: number;
}

export interface UnityAudioSourceRange {
  readonly rangeId: string;
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly durationTick: number;
}

export interface UnityAudioExportInput {
  readonly assetId: string;
  readonly revisionId?: string;
  readonly assetName: string;
  readonly role: UnityAudioRole;
  readonly loop: boolean;
  readonly bytes: Uint8Array;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 8 | 16 | 24 | 32;
  readonly durationSeconds: number;
  readonly source: UnityAudioSourceIdentity;
  readonly sourceRange?: UnityAudioSourceRange;
}

export interface UnityAudioExportOptions {
  readonly creator?: { readonly creatorId: string; readonly displayName?: string };
  readonly collaborators?: readonly {
    readonly creatorId: string;
    readonly displayName?: string;
    readonly role?: string;
  }[];
  readonly license?: {
    readonly licenseId: string;
    readonly rights: readonly string[];
    readonly commercialUse?: boolean;
    readonly derivativeAllowed?: boolean;
    readonly attributionRequired?: boolean;
  };
}

export interface UnityAudioImportEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly mimeType: UnityAudioImportMimeType;
  readonly contentHash: Sha256;
}

export interface UnityAudioImportPackage {
  readonly schemaVersion: typeof UNITY_AUDIO_IMPORT_SCHEMA_VERSION;
  readonly packageKind: typeof UNITY_AUDIO_IMPORT_PACKAGE_KIND;
  readonly assetId: string;
  readonly revisionId?: string;
  readonly assetName: string;
  readonly role: UnityAudioRole;
  readonly loop: boolean;
  readonly audioPath: string;
  readonly manifestPath: string;
  readonly packageManifestPath: string;
  readonly contentHash: Sha256;
  readonly manifestHash: Sha256;
  readonly packageHash: Sha256;
  readonly entries: readonly UnityAudioImportEntry[];
  readonly nativeQualification: "UNTESTED";
}

export interface UnityAudioImportDiagnostic {
  readonly code: "INVALID_INPUT" | "INVALID_WAV" | "INVALID_WAV_METADATA" | "INVALID_OPTIONS";
  readonly path: string;
  readonly message: string;
}

export type UnityAudioImportResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly UnityAudioImportDiagnostic[] };

interface UnityAudioManifestDocument {
  readonly schemaVersion: typeof UNITY_AUDIO_IMPORT_SCHEMA_VERSION;
  readonly packageKind: typeof UNITY_AUDIO_IMPORT_PACKAGE_KIND;
  readonly assetId: string;
  readonly revisionId?: string;
  readonly identityScope: "REGISTERED_REVISION" | "LOCAL_RENDER";
  readonly displayName: string;
  readonly role: UnityAudioRole;
  readonly loop: boolean;
  readonly audioPath: string;
  readonly format: {
    readonly mimeType: "audio/wav";
    readonly sampleRateHz: number;
    readonly channels: 1 | 2;
    readonly bitDepth: 8 | 16 | 24 | 32;
  };
  readonly durationSeconds: number;
  readonly source: UnityAudioSourceIdentity;
  readonly sourceRange?: UnityAudioSourceRange;
  readonly contentHash: Sha256;
  readonly creator?: { readonly creatorId: string; readonly displayName?: string };
  readonly collaborators?: readonly {
    readonly creatorId: string;
    readonly displayName?: string;
    readonly role?: string;
  }[];
  readonly license?: UnityAudioExportOptions["license"];
}

function success<T>(value: T): UnityAudioImportResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(...diagnostics: UnityAudioImportDiagnostic[]): UnityAudioImportResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(
  code: UnityAudioImportDiagnostic["code"],
  path: string,
  message: string,
): UnityAudioImportDiagnostic {
  return { code, path, message };
}

function safeFilePart(value: string, fallback = "audio"): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/gu, "_").replace(
    /^_+|_+$/gu,
    "",
  );
  return normalized || fallback;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalJson(value)}\n`);
}

async function sha256Bytes(bytes: Uint8Array): Promise<Sha256> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer as ArrayBuffer,
  );
  return asSha256(
    [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) * 0x1000000);
}

function validateWav(input: UnityAudioExportInput): UnityAudioImportDiagnostic | undefined {
  if (
    input.bytes.byteLength < 44 ||
    ascii(input.bytes, 0, 4) !== "RIFF" ||
    ascii(input.bytes, 8, 4) !== "WAVE"
  ) {
    return diagnostic("INVALID_WAV", "bytes", "Unity出力にはRIFF/WAVE形式が必要です。");
  }
  if (
    readUint16(input.bytes, 20) !== 1 ||
    readUint16(input.bytes, 22) !== input.channels ||
    readUint32(input.bytes, 24) !== input.sampleRateHz ||
    readUint16(input.bytes, 34) !== input.bitDepth
  ) {
    return diagnostic(
      "INVALID_WAV_METADATA",
      "bytes",
      "WAVヘッダーと出力設定が一致しません。",
    );
  }
  if (readUint32(input.bytes, 40) > input.bytes.byteLength - 44) {
    return diagnostic("INVALID_WAV", "bytes", "WAVのPCMデータ長が不正です。");
  }
  return undefined;
}

function validateInput(
  input: UnityAudioExportInput,
  options: UnityAudioExportOptions,
): UnityAudioImportDiagnostic | undefined {
  if (input.assetId.trim().length === 0 || input.assetId.length > 255) {
    return diagnostic("INVALID_INPUT", "assetId", "Audio Asset IDを指定してください。");
  }
  if (input.revisionId !== undefined && input.revisionId.trim().length === 0) {
    return diagnostic("INVALID_INPUT", "revisionId", "revisionIdは空にできません。");
  }
  if (input.assetName.trim().length === 0) {
    return diagnostic("INVALID_INPUT", "assetName", "Audio Asset名を指定してください。");
  }
  if (!(["BGM", "SE", "VOICE", "MIX"] as readonly string[]).includes(input.role)) {
    return diagnostic("INVALID_INPUT", "role", "roleはBGM・SE・VOICE・MIXのいずれかです。");
  }
  if (typeof input.loop !== "boolean") {
    return diagnostic("INVALID_INPUT", "loop", "Loop設定を明示してください。");
  }
  if (
    !Number.isSafeInteger(input.sampleRateHz) ||
    input.sampleRateHz < 8_000 ||
    input.sampleRateHz > 192_000
  ) {
    return diagnostic("INVALID_INPUT", "sampleRateHz", "サンプルレートが範囲外です。");
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    return diagnostic("INVALID_INPUT", "durationSeconds", "再生時間は正の数値で指定してください。");
  }
  if (
    input.source.projectId.trim().length === 0 ||
    input.source.stateHash.trim().length === 0 ||
    !Number.isSafeInteger(input.source.projectRevision) ||
    input.source.projectRevision < 0
  ) {
    return diagnostic("INVALID_INPUT", "source", "Audio Projectの出典情報が不正です。");
  }
  if (options.creator !== undefined && options.creator.creatorId.trim().length === 0) {
    return diagnostic("INVALID_OPTIONS", "creator.creatorId", "制作者IDを指定してください。");
  }
  if (options.collaborators?.some((item) => item.creatorId.trim().length === 0)) {
    return diagnostic("INVALID_OPTIONS", "collaborators", "共同制作者IDを空にできません。");
  }
  if (options.license !== undefined && options.license.licenseId.trim().length === 0) {
    return diagnostic("INVALID_OPTIONS", "license.licenseId", "License IDを指定してください。");
  }
  return validateWav(input);
}

function unityAudioRuntimeSource(): string {
  return `using System;
using UnityEngine;

namespace PiXiEED {
    public enum PiXiEEDAudioRole { BGM, SE, VOICE, MIX }

    [CreateAssetMenu(menuName = "PiXiEED/Audio Asset")]
    public sealed class PiXiEEDAudio : ScriptableObject {
        [SerializeField] private AudioClip clip;
        [SerializeField] private string assetId;
        [SerializeField] private string revisionId;
        [SerializeField] private string displayName;
        [SerializeField] private PiXiEEDAudioRole role;
        [SerializeField] private bool loop;
        [SerializeField] private string licenseId;
        public AudioClip Clip => clip;
        public string AssetId => assetId;
        public string RevisionId => revisionId;
        public string DisplayName => displayName;
        public PiXiEEDAudioRole Role => role;
        public bool Loop => loop;
        public string LicenseId => licenseId;
        public void Configure(AudioClip sourceClip, string sourceAssetId, string sourceRevisionId,
            string sourceDisplayName, PiXiEEDAudioRole sourceRole, bool sourceLoop, string sourceLicenseId) {
            clip = sourceClip;
            assetId = sourceAssetId;
            revisionId = sourceRevisionId;
            displayName = sourceDisplayName;
            role = sourceRole;
            loop = sourceLoop;
            licenseId = sourceLicenseId;
        }
    }
}
`;
}

function unityAudioImporterSource(): string {
  return `using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace PiXiEED.Editor {
    [Serializable]
    internal sealed class PiXiEEDAudioManifest {
        public string assetId;
        public string revisionId;
        public string displayName;
        public string role;
        public bool loop;
        public string audioPath;
        public string licenseId;
    }

    public sealed class PiXiEEDAudioManifestImporter : AssetPostprocessor {
        static void OnPostprocessAllAssets(string[] importedAssets, string[] deletedAssets,
            string[] movedAssets, string[] movedFromAssetPaths) {
            foreach (var path in importedAssets) {
                if (!path.EndsWith("PiXiEEDAudio.json", StringComparison.Ordinal)) continue;
                var manifestPath = path;
                EditorApplication.delayCall += () => ImportManifest(manifestPath);
            }
        }

        private static void ImportManifest(string manifestPath) {
            var text = AssetDatabase.LoadAssetAtPath<TextAsset>(manifestPath);
            if (text == null) return;
            var manifest = JsonUtility.FromJson<PiXiEEDAudioManifest>(text.text);
            if (manifest == null || string.IsNullOrEmpty(manifest.audioPath)) return;
            var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(manifest.audioPath);
            if (clip == null) return;
            var assetPath = Path.ChangeExtension(manifestPath, ".asset");
            var asset = AssetDatabase.LoadAssetAtPath<PiXiEEDAudio>(assetPath);
            if (asset == null) {
                asset = ScriptableObject.CreateInstance<PiXiEEDAudio>();
                AssetDatabase.CreateAsset(asset, assetPath);
            }
            var role = PiXiEEDAudioRole.MIX;
            Enum.TryParse(manifest.role, true, out role);
            asset.Configure(clip, manifest.assetId, manifest.revisionId, manifest.displayName,
                role, manifest.loop, manifest.licenseId);
            EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssets();
        }
    }
}
`;
}

function unityAudioReadmeSource(): string {
  return `# PiXiEED Unity Audio Import

このZIPのAssetsフォルダーをUnityプロジェクトのルートへコピーしてください。

- WAVはUnityのAudioClipとして通常どおり読み込まれます。
- PiXiEEDAudio.jsonを検出するとPiXiEEDAudio.assetを自動生成します。
- 役割はBGM / SE / VOICE / MIXです。Loop設定はManifestとPiXiEEDAudio.assetへ明示的に保持します。
- PiXiEED側でWAVヘッダーと出典ハッシュを検証済みです。
- Unity EditorのImport／Compile／実機再生は利用するUnityプロジェクトで別途確認してください。
- ローカルレンダーは権利許諾済みとは扱いません。
`;
}

/** Creates a deterministic, drag-and-drop Unity package for one rendered WAV. */
export async function createUnityAudioImportPackage(
  input: UnityAudioExportInput,
  options: UnityAudioExportOptions = {},
): Promise<UnityAudioImportResult<UnityAudioImportPackage>> {
  const invalid = validateInput(input, options);
  if (invalid !== undefined) return failure(invalid);
  const assetId = input.assetId.trim();
  const revisionId = input.revisionId?.trim();
  const root = `Assets/PiXiEED/Generated/Audio/${safeFilePart(assetId)}/${safeFilePart(revisionId ?? "local")}`;
  const audioPath = `${root}/${safeFilePart(input.assetName, "audio")}.wav`;
  const manifestPath = `${root}/PiXiEEDAudio.json`;
  const packageManifestPath = `${root}/PiXiEEDPackage.json`;
  const contentHash = await sha256Bytes(input.bytes);
  const entries: UnityAudioImportEntry[] = [];
  const addEntry = async (
    path: string,
    bytes: Uint8Array,
    mimeType: UnityAudioImportMimeType,
  ): Promise<void> => {
    entries.push({ path, bytes, mimeType, contentHash: await sha256Bytes(bytes) });
  };
  await addEntry(audioPath, new Uint8Array(input.bytes), "audio/wav");
  const manifestBase: UnityAudioManifestDocument = {
    schemaVersion: UNITY_AUDIO_IMPORT_SCHEMA_VERSION,
    packageKind: UNITY_AUDIO_IMPORT_PACKAGE_KIND,
    assetId,
    ...(revisionId === undefined ? {} : { revisionId }),
    identityScope: revisionId === undefined ? "LOCAL_RENDER" : "REGISTERED_REVISION",
    displayName: input.assetName.trim(),
    role: input.role,
    loop: input.loop,
    audioPath,
    format: {
      mimeType: "audio/wav",
      sampleRateHz: input.sampleRateHz,
      channels: input.channels,
      bitDepth: input.bitDepth,
    },
    durationSeconds: input.durationSeconds,
    source: input.source,
    ...(input.sourceRange === undefined ? {} : { sourceRange: input.sourceRange }),
    contentHash,
    ...(options.creator === undefined ? {} : { creator: options.creator }),
    ...(options.collaborators === undefined ? {} : { collaborators: options.collaborators }),
    ...(options.license === undefined ? {} : { license: options.license }),
  };
  const manifestHash = await sha256Bytes(jsonBytes(manifestBase));
  await addEntry(
    manifestPath,
    jsonBytes({ ...manifestBase, manifestHash }),
    "application/json",
  );
  await addEntry(
    "Assets/PiXiEED/Runtime/PiXiEEDAudio.cs",
    new TextEncoder().encode(unityAudioRuntimeSource()),
    "text/plain",
  );
  await addEntry(
    "Assets/Editor/PiXiEED/PiXiEEDAudioImporter.cs",
    new TextEncoder().encode(unityAudioImporterSource()),
    "text/plain",
  );
  await addEntry(
    "Assets/PiXiEED/Generated/Audio/README.md",
    new TextEncoder().encode(unityAudioReadmeSource()),
    "text/plain",
  );
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const packageHash = await sha256Bytes(jsonBytes({
    schemaVersion: UNITY_AUDIO_IMPORT_SCHEMA_VERSION,
    packageKind: UNITY_AUDIO_IMPORT_PACKAGE_KIND,
    assetId,
    revisionId: revisionId ?? null,
    contentHash,
    manifestHash,
    entries: entries.map((entry) => ({ path: entry.path, contentHash: entry.contentHash })),
  }));
  await addEntry(
    packageManifestPath,
    jsonBytes({
      schemaVersion: UNITY_AUDIO_IMPORT_SCHEMA_VERSION,
      packageKind: UNITY_AUDIO_IMPORT_PACKAGE_KIND,
      assetId,
      revisionId: revisionId ?? null,
      manifestPath,
      audioPath,
      contentHash,
      manifestHash,
      packageHash,
      packageHashScope: "ENTRIES_EXCLUDING_PACKAGE_MANIFEST",
      entries: entries.map((entry) => ({ path: entry.path, contentHash: entry.contentHash })),
    }),
    "application/json",
  );
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return success({
    schemaVersion: UNITY_AUDIO_IMPORT_SCHEMA_VERSION,
    packageKind: UNITY_AUDIO_IMPORT_PACKAGE_KIND,
    assetId,
    ...(revisionId === undefined ? {} : { revisionId }),
    assetName: input.assetName.trim(),
    role: input.role,
    loop: input.loop,
    audioPath,
    manifestPath,
    packageManifestPath,
    contentHash,
    manifestHash,
    packageHash,
    entries,
    nativeQualification: "UNTESTED",
  });
}

/** Encodes a Unity audio package as a deterministic stored ZIP. */
export function encodeUnityAudioImportPackageZip(
  packageValue: UnityAudioImportPackage,
): Uint8Array {
  const entries: StoredZipEntry[] = packageValue.entries.map((entry) => ({
    filename: entry.path,
    bytes: entry.bytes,
  }));
  return encodeStoredZip(entries);
}
