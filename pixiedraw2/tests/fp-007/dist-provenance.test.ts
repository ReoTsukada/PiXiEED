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
  validateArtifactRecord,
} from "../../src/fp-007/artifact-manifest.ts";
import {
  createProvenanceChain,
  type SourceDistProvenanceChain,
  verifyProvenanceChain,
} from "../../src/fp-007/source-dist-provenance.ts";
import {
  compareRepeatBuilds,
  createRepeatBuildSnapshot,
  qualifyRepeatBuild,
} from "../../src/fp-007/repeat-build-record.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function hasCode(
  result: { readonly diagnostics: readonly { readonly code: string }[] },
  code: string,
): boolean {
  return result.diagnostics.some((item) => item.code === code);
}

async function fixture(
  options: { readonly includeMap?: boolean; readonly extraArtifact?: boolean } =
    {},
): Promise<{
  readonly build: Awaited<ReturnType<typeof createBuildManifest>> & {
    readonly ok: true;
  };
  readonly artifacts: readonly ArtifactRecord[];
  readonly artifactManifest:
    & Awaited<ReturnType<typeof createArtifactManifest>>
    & { readonly ok: true };
  readonly sourceRecord: ArtifactRecord;
  readonly distRecord: ArtifactRecord;
  readonly source: Uint8Array;
  readonly dist: Uint8Array;
}> {
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
  assert(sourceRecord.ok && distRecord.ok);
  const records: ArtifactRecord[] = [sourceRecord.value, distRecord.value];
  let mapRecord: ArtifactRecord | undefined;
  if (options.includeMap) {
    const map = await createArtifactRecord({
      path: "dist/entry.js.map",
      role: "SOURCE_MAP",
      compression: "NONE",
      content: new TextEncoder().encode(
        '{"version":3,"sources":["src/main.ts"]}',
      ),
    });
    assert(map.ok);
    mapRecord = map.value;
    records.push(map.value);
  }
  if (options.extraArtifact) {
    const extra = await createArtifactRecord({
      path: "dist/undeclared.js",
      role: "GENERATED",
      compression: "NONE",
      content: new TextEncoder().encode("extra"),
    });
    assert(extra.ok);
    records.push(extra.value);
  }
  const sourceHash = await sha256Hex(source);
  const buildInput: BuildManifestInput = {
    buildCommand: ["fixture-build", "src/main.ts", "dist/entry.js"],
    entries: ["dist/entry.js"],
    initialChunks: ["dist/entry.js"],
    lazyChunks: [],
    sourceMapPolicy: options.includeMap
      ? {
        mode: "INCLUDED",
        mappingProof: "SOURCE_MAP",
        declaredMapPaths: ["dist/entry.js.map"],
      }
      : {
        mode: "EXCLUDED",
        mappingProof: "DIRECT_SOURCE_DIGEST_CHAIN",
        declaredMapPaths: [],
      },
    sourceFiles: [{
      path: "src/main.ts",
      bytes: source.byteLength,
      sha256: sourceHash,
    }],
    declaredArtifacts: [
      "src/main.ts",
      "dist/entry.js",
      ...(options.includeMap ? ["dist/entry.js.map"] : []),
    ],
    schemaRegistryDigest: "1".repeat(64),
    dependencyGraphHash: "2".repeat(64),
    lockfileHash: "3".repeat(64),
    toolchainHash: "4".repeat(64),
    allowlistedEnvironmentHash: "5".repeat(64),
  };
  const build = await createBuildManifest(buildInput);
  assert(build.ok);
  const artifactManifest = await createArtifactManifest(records);
  assert(artifactManifest.ok);
  return {
    build: build as typeof build & { readonly ok: true },
    artifacts: records,
    sourceRecord: sourceRecord.value,
    distRecord: distRecord.value,
    artifactManifest: artifactManifest as typeof artifactManifest & {
      readonly ok: true;
    },
    source,
    dist,
  };
}

Deno.test("FP007-DIST-001 proves source-to-dist mapping without a source map", async () => {
  const value = await fixture();
  const artifactManifestHash = await value.artifactManifest.value.manifestHash;
  const mappingEvidenceHash = await sha256Hex(
    canonicalJson({
      source: "src/main.ts",
      dist: "dist/entry.js",
      mode: "DIRECT_SOURCE_DIGEST_CHAIN",
    }),
  );
  const result = await createProvenanceChain({
    buildManifest: value.build.value.manifest,
    buildManifestHash: value.build.value.manifestHash,
    artifactManifest: value.artifactManifest.value.manifest,
    artifactManifestHash,
    mappings: [{
      sourcePath: "src/main.ts",
      sourceSha256: value.sourceRecord.sha256,
      distPath: "dist/entry.js",
      distSha256: value.distRecord.sha256,
      proofMode: "DIRECT_SOURCE_DIGEST_CHAIN",
      sourceReferences: ["src/main.ts"],
      mappingEvidenceHash,
      mapPath: null,
      mapSha256: null,
    }],
  });
  assert(result.ok, JSON.stringify(result.diagnostics));
  const verified = await verifyProvenanceChain(result.value, {
    buildManifest: value.build.value.manifest,
    artifactManifest: value.artifactManifest.value.manifest,
  });
  assert(verified.ok, JSON.stringify(verified.diagnostics));
});

Deno.test("FP007-DIST-001 rejects missing mapping and missing included source map", async () => {
  const noMapping = await fixture();
  const noMappingHash = await noMapping.artifactManifest.value.manifestHash;
  const missingMapping = await createProvenanceChain({
    buildManifest: noMapping.build.value.manifest,
    buildManifestHash: noMapping.build.value.manifestHash,
    artifactManifest: noMapping.artifactManifest.value.manifest,
    artifactManifestHash: noMappingHash,
    mappings: [],
  });
  assert(!missingMapping.ok && hasCode(missingMapping, "MAPPING_MISSING"));

  const included = await fixture({ includeMap: true });
  const artifactWithoutMap = await createArtifactManifest(
    included.artifacts.slice(0, 2),
  );
  assert(artifactWithoutMap.ok);
  {
    const mapHash = await artifactWithoutMap.value.manifestHash;
    const missingMap = await createProvenanceChain({
      buildManifest: included.build.value.manifest,
      buildManifestHash: included.build.value.manifestHash,
      artifactManifest: artifactWithoutMap.value.manifest,
      artifactManifestHash: mapHash,
      mappings: [{
        sourcePath: "src/main.ts",
        sourceSha256: included.sourceRecord.sha256,
        distPath: "dist/entry.js",
        distSha256: included.distRecord.sha256,
        proofMode: "SOURCE_MAP",
        sourceReferences: ["src/main.ts"],
        mappingEvidenceHash: "6".repeat(64),
        mapPath: "dist/entry.js.map",
        mapSha256: "7".repeat(64),
      }],
    });
    assert(!missingMap.ok && hasCode(missingMap, "SOURCE_MAP_MISSING"));
  }
});

Deno.test("FP007-PROVENANCE-001 rejects undeclared artifacts and absolute paths", async () => {
  const value = await fixture({ extraArtifact: true });
  const artifactManifestHash = await value.artifactManifest.value.manifestHash;
  const result = await createProvenanceChain({
    buildManifest: value.build.value.manifest,
    buildManifestHash: value.build.value.manifestHash,
    artifactManifest: value.artifactManifest.value.manifest,
    artifactManifestHash,
    mappings: [{
      sourcePath: "src/main.ts",
      sourceSha256: value.sourceRecord.sha256,
      distPath: "dist/entry.js",
      distSha256: value.distRecord.sha256,
      proofMode: "DIRECT_SOURCE_DIGEST_CHAIN",
      sourceReferences: ["src/main.ts"],
      mappingEvidenceHash: "8".repeat(64),
      mapPath: null,
      mapSha256: null,
    }],
  });
  assert(!result.ok && hasCode(result, "UNDECLARED_ARTIFACT"));
  const absolute = validateArtifactRecord({
    path: "/Users/owner/dist.js",
    role: "ENTRY",
    bytes: 1,
    size: 1,
    sha256: "9".repeat(64),
    compression: "NONE",
  });
  assert(!absolute.ok && hasCode(absolute, "INVALID_PATH"));
});

Deno.test("FP007-SECRET-001 rejects secret-bearing source and source-map bytes without retaining content", async () => {
  const result = await createArtifactRecord({
    path: "src/secret.ts",
    role: "SOURCE",
    compression: "NONE",
    content: new TextEncoder().encode(
      "Authorization: Bearer very-secret-value-123456",
    ),
  });
  assert(!result.ok && hasCode(result, "SECRET_BEARING_ARTIFACT"));
  const map = await createArtifactRecord({
    path: "dist/entry.js.map",
    role: "SOURCE_MAP",
    compression: "NONE",
    content: new TextEncoder().encode(
      '{"sourcesContent":["password=super-secret-value"]}',
    ),
  });
  assert(!map.ok && hasCode(map, "SECRET_BEARING_ARTIFACT"));
});

Deno.test("FP007-BUILD-001 distinguishes isolated repeatability from dirty-repository qualification", async () => {
  const value = await fixture();
  const artifactManifestHash = await value.artifactManifest.value.manifestHash;
  const input = {
    inputHash: value.build.value.manifestHash,
    buildManifestHash: value.build.value.manifestHash,
    manifestCanonicalJson: value.build.value.canonicalJson,
    toolchainHash: value.build.value.manifest.deterministicInputs.toolchainHash,
    artifactManifestHash,
    artifactManifest: value.artifactManifest.value.manifest,
  };
  const first = await createRepeatBuildSnapshot({
    ...input,
    artifacts: input.artifactManifest.artifacts,
  });
  const second = await createRepeatBuildSnapshot({
    ...input,
    artifacts: input.artifactManifest.artifacts,
  });
  assert(compareRepeatBuilds(first, second).status === "PASS");
  assert(
    qualifyRepeatBuild(first, second, "ISOLATED_FIXTURE").status === "PASS",
  );
  assert(
    qualifyRepeatBuild(first, second, "REAL_DIRTY_WORKTREE").status ===
      "BLOCKED",
  );
  const changedToolchain = await createRepeatBuildSnapshot({
    ...input,
    toolchainHash: "a".repeat(64),
    artifacts: input.artifactManifest.artifacts,
  });
  const comparison = compareRepeatBuilds(first, changedToolchain);
  assert(
    comparison.status === "FAIL" &&
      comparison.differences.some((item) => item.code === "TOOLCHAIN_CHANGED"),
  );
});

Deno.test("FP007-PROVENANCE-001 binds declared digests to manifest bodies", async () => {
  const value = await fixture();
  const mappingEvidenceHash = await sha256Hex(canonicalJson({
    source: "src/main.ts",
    dist: "dist/entry.js",
    mode: "DIRECT_SOURCE_DIGEST_CHAIN",
  }));
  const mappings = [{
    sourcePath: "src/main.ts",
    sourceSha256: value.sourceRecord.sha256,
    distPath: "dist/entry.js",
    distSha256: value.distRecord.sha256,
    proofMode: "DIRECT_SOURCE_DIGEST_CHAIN" as const,
    sourceReferences: ["src/main.ts"],
    mappingEvidenceHash,
    mapPath: null,
    mapSha256: null,
  }];
  const originalSourceFile = value.build.value.manifest.sourceFiles[0];
  assert(originalSourceFile !== undefined);
  const wrongBuildHash = await createProvenanceChain({
    buildManifest: {
      ...value.build.value.manifest,
      sourceFiles: [{
        ...originalSourceFile,
        sha256: "a".repeat(64),
      }],
    },
    buildManifestHash: value.build.value.manifestHash,
    artifactManifest: value.artifactManifest.value.manifest,
    artifactManifestHash: value.artifactManifest.value.manifestHash,
    mappings,
  });
  assert(
    !wrongBuildHash.ok &&
      hasCode(wrongBuildHash, "BUILD_MANIFEST_HASH_MISMATCH"),
    "a changed manifest body cannot reuse another manifest digest",
  );

  const valid = await createProvenanceChain({
    buildManifest: value.build.value.manifest,
    buildManifestHash: value.build.value.manifestHash,
    artifactManifest: value.artifactManifest.value.manifest,
    artifactManifestHash: value.artifactManifest.value.manifestHash,
    mappings,
  });
  assert(valid.ok);
  const clonedAndMutated = JSON.parse(JSON.stringify({
    ...valid.value,
    mappings: valid.value.mappings.map((mapping) => ({
      ...mapping,
      distSha256: "b".repeat(64),
    })),
  })) as SourceDistProvenanceChain;
  const forged = await verifyProvenanceChain(clonedAndMutated, {
    buildManifest: value.build.value.manifest,
    artifactManifest: value.artifactManifest.value.manifest,
  });
  assert(
    !forged.ok && hasCode(forged, "DIST_HASH_MISMATCH"),
    "JSON clone/spread mutation must not preserve a valid provenance chain",
  );

  const reusedArtifactHash = await verifyProvenanceChain(valid.value, {
    buildManifest: value.build.value.manifest,
    artifactManifest: {
      ...value.artifactManifest.value.manifest,
      artifacts: value.artifactManifest.value.manifest.artifacts.map((
        artifact,
      ) => ({
        ...artifact,
        bytes: artifact.bytes + 1,
        size: artifact.size + 1,
      })),
    },
  });
  assert(
    !reusedArtifactHash.ok &&
      hasCode(reusedArtifactHash, "ARTIFACT_MANIFEST_HASH_MISMATCH"),
    "a provenance hash cannot be reused with another artifact manifest body",
  );
});
