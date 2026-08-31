import {
  type BuildManifestInput,
  canonicalJson,
  createBuildManifest,
  sha256Hex,
} from "../../src/fp-007/build-manifest.ts";
import {
  type ArtifactRecord,
  createArtifactManifest,
  createArtifactRecord,
} from "../../src/fp-007/artifact-manifest.ts";
import { createProvenanceChain } from "../../src/fp-007/source-dist-provenance.ts";
import {
  createRepeatBuildSnapshot,
  qualifyRepeatBuild,
} from "../../src/fp-007/repeat-build-record.ts";

async function compressedSize(
  content: Uint8Array,
  format: "gzip",
): Promise<number | "UNTESTED"> {
  try {
    const stream = new CompressionStream(format);
    const copy = new ArrayBuffer(content.byteLength);
    new Uint8Array(copy).set(content);
    const compressed = await new Response(
      new Blob([copy]).stream().pipeThrough(stream),
    ).arrayBuffer();
    return compressed.byteLength;
  } catch {
    return "UNTESTED";
  }
}

const source = new TextEncoder().encode("export const pixel = 1;\n");
const dist = new TextEncoder().encode("const pixel=1;\n");
const sourceRecord = await createArtifactRecord({
  path: "src/main.ts",
  role: "SOURCE",
  compression: "NONE",
  content: source,
});
const distRecord = await createArtifactRecord({
  path: "dist/entry.js",
  role: "ENTRY",
  compression: "NONE",
  content: dist,
});
if (!sourceRecord.ok || !distRecord.ok) {
  throw new Error("fixture artifact creation failed");
}
const records: readonly ArtifactRecord[] = [
  sourceRecord.value,
  distRecord.value,
];
const sourceHash = await sha256Hex(source);
const hash = (digit: string): string => digit.repeat(64);
const buildInput: BuildManifestInput = {
  buildCommand: ["fixture-build", "src/main.ts", "dist/entry.js"],
  entries: ["dist/entry.js"],
  initialChunks: ["dist/entry.js"],
  lazyChunks: [],
  sourceMapPolicy: {
    mode: "EXCLUDED",
    mappingProof: "DIRECT_SOURCE_DIGEST_CHAIN",
    declaredMapPaths: [],
  },
  sourceFiles: [{
    path: "src/main.ts",
    bytes: source.byteLength,
    sha256: sourceHash,
  }],
  declaredArtifacts: ["src/main.ts", "dist/entry.js"],
  schemaRegistryDigest: hash("1"),
  dependencyGraphHash: hash("2"),
  lockfileHash: hash("3"),
  toolchainHash: hash("4"),
  allowlistedEnvironmentHash: hash("5"),
};
const started = performance.now();
const build = await createBuildManifest(buildInput);
if (!build.ok) throw new Error(JSON.stringify(build.diagnostics));
const artifactManifestResult = await createArtifactManifest(records);
if (!artifactManifestResult.ok) {
  throw new Error(JSON.stringify(artifactManifestResult.diagnostics));
}
const artifactManifestHash = await artifactManifestResult.value.manifestHash;
const mappingEvidenceHash = await sha256Hex(
  canonicalJson({
    source: "src/main.ts",
    dist: "dist/entry.js",
    mode: "DIRECT_SOURCE_DIGEST_CHAIN",
  }),
);
const provenance = await createProvenanceChain({
  buildManifest: build.value.manifest,
  buildManifestHash: build.value.manifestHash,
  artifactManifest: artifactManifestResult.value.manifest,
  artifactManifestHash,
  mappings: [{
    sourcePath: "src/main.ts",
    sourceSha256: sourceRecord.value.sha256,
    distPath: "dist/entry.js",
    distSha256: distRecord.value.sha256,
    proofMode: "DIRECT_SOURCE_DIGEST_CHAIN",
    sourceReferences: ["src/main.ts"],
    mappingEvidenceHash,
    mapPath: null,
    mapSha256: null,
  }],
});
if (!provenance.ok) throw new Error(JSON.stringify(provenance.diagnostics));
const snapshotInput = {
  inputHash: build.value.manifestHash,
  buildManifestHash: build.value.manifestHash,
  manifestCanonicalJson: build.value.canonicalJson,
  toolchainHash: build.value.manifest.deterministicInputs.toolchainHash,
  artifactManifestHash,
  artifacts: records,
};
const first = await createRepeatBuildSnapshot(snapshotInput);
const second = await createRepeatBuildSnapshot(snapshotInput);
const repeat = qualifyRepeatBuild(first, second, "ISOLATED_FIXTURE");
const gzipRaw = await compressedSize(source, "gzip");
const gzipDist = await compressedSize(dist, "gzip");
const elapsedMs = performance.now() - started;

console.log(JSON.stringify(
  {
    documentId: "PIXIEED-FP007-TRACK3-BENCHMARK-001",
    status: "MEASURED_LOCAL_SYNTHETIC",
    repeatBuild: {
      status: repeat.status,
      scope: repeat.scope,
      evidenceLevel: repeat.evidenceLevel,
      comparison: repeat.comparison.status,
      manifestHash: build.value.manifestHash,
      artifactManifestHash,
      provenanceHash: provenance.value.provenanceHash,
    },
    measurements: {
      definition:
        "Small in-memory fixture; raw is source bytes, minified is the hand-authored dist fixture, gzip uses CompressionStream when available, Brotli is not claimed.",
      elapsedMs: Number(elapsedMs.toFixed(3)),
      rawBytes: source.byteLength,
      minifiedBytes: dist.byteLength,
      gzipRawBytes: gzipRaw,
      gzipDistBytes: gzipDist,
      brotliBytes: "UNTESTED",
      initialRequests: 1,
      lazyChunks: 0,
    },
    notes: [
      "Synthetic local Deno measurement only; not a browser, device, clean-checkout, staging, production, or release PASS.",
      "No generatedAt, host, absolute path, locale, random value, cache state, or network state enters the canonical manifest.",
      "Real repository qualification remains BLOCKED/UNTESTED while the worktree is dirty and existing build scripts are not changed by FP-007 Track 3.",
    ],
  },
  null,
  2,
));
