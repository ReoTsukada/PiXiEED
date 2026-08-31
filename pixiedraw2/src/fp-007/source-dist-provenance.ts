/** FP-007 Track 3: source-to-dist mapping and provenance chain. */

import {
  type CanonicalBuildManifest,
  canonicalJson,
  isSha256,
  type MappingProofMode,
  normalizeRepoRelativePath,
  sha256Hex,
} from "./build-manifest.ts";
import {
  type ArtifactManifest,
  type ArtifactRecord,
  validateArtifactDeclarations,
} from "./artifact-manifest.ts";

export const FP007_PROVENANCE_DOCUMENT =
  "PIXIEED-FP007-SOURCE-DIST-PROVENANCE-001" as const;
export const FP007_PROVENANCE_SCHEMA_VERSION = "1.0.0" as const;

export interface SourceDistMappingInput {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly distPath: string;
  readonly distSha256: string;
  readonly proofMode: MappingProofMode;
  readonly sourceReferences: readonly string[];
  readonly mappingEvidenceHash: string;
  readonly mapPath: string | null;
  readonly mapSha256: string | null;
}

export interface ProvenanceDeterministicInputs {
  readonly schemaRegistryDigest: string;
  readonly dependencyGraphHash: string;
  readonly lockfileHash: string;
  readonly toolchainHash: string;
  readonly allowlistedEnvironmentHash: string;
}

export interface SourceDistProvenanceChain {
  readonly documentId: typeof FP007_PROVENANCE_DOCUMENT;
  readonly schemaVersion: typeof FP007_PROVENANCE_SCHEMA_VERSION;
  readonly hashAlgorithm: "SHA-256";
  readonly buildManifestHash: string;
  readonly artifactManifestHash: string;
  readonly deterministicInputs: ProvenanceDeterministicInputs;
  readonly mappings: readonly SourceDistMappingInput[];
  readonly mappingRootHash: string;
  readonly provenanceHash: string;
}

export type ProvenanceDiagnosticCode =
  | "INVALID_HASH"
  | "BUILD_MANIFEST_HASH_MISMATCH"
  | "ARTIFACT_MANIFEST_HASH_MISMATCH"
  | "INVALID_PATH"
  | "MAPPING_MISSING"
  | "SOURCE_NOT_DECLARED"
  | "SOURCE_HASH_MISMATCH"
  | "DIST_NOT_DECLARED"
  | "DIST_HASH_MISMATCH"
  | "SOURCE_MAP_MISSING"
  | "SOURCE_MAP_HASH_MISMATCH"
  | "ALTERNATIVE_MAPPING_PROOF_MISSING"
  | "PROOF_MODE_MISMATCH"
  | "INITIAL_LAZY_OVERLAP"
  | "UNDECLARED_ARTIFACT"
  | "CHAIN_HASH_MISMATCH"
  | "MAPPING_EVIDENCE_INVALID";

export interface ProvenanceDiagnostic {
  readonly code: ProvenanceDiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export type ProvenanceResult<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly ProvenanceDiagnostic[];
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly ProvenanceDiagnostic[];
  };

function diagnostic(
  code: ProvenanceDiagnosticCode,
  message: string,
  path?: string,
): ProvenanceDiagnostic {
  return { code, message, ...(path === undefined ? {} : { path }) };
}

function sortedMappings(
  mappings: readonly SourceDistMappingInput[],
): SourceDistMappingInput[] {
  return [...mappings].sort((left, right) =>
    left.distPath < right.distPath
      ? -1
      : left.distPath > right.distPath
      ? 1
      : left.sourcePath < right.sourcePath
      ? -1
      : left.sourcePath > right.sourcePath
      ? 1
      : 0
  );
}

function validHash(value: unknown): value is string {
  return isSha256(value);
}

function validPath(value: unknown): value is string {
  return normalizeRepoRelativePath(value) !== null;
}

function recordFor(
  manifest: ArtifactManifest,
  path: string,
): ArtifactRecord | undefined {
  return manifest.artifacts.find((record) => record.path === path);
}

function mappingPayload(
  mapping: SourceDistMappingInput,
): Record<string, unknown> {
  return {
    sourcePath: mapping.sourcePath,
    sourceSha256: mapping.sourceSha256,
    distPath: mapping.distPath,
    distSha256: mapping.distSha256,
    proofMode: mapping.proofMode,
    sourceReferences: [...mapping.sourceReferences].sort(),
    mappingEvidenceHash: mapping.mappingEvidenceHash,
    mapPath: mapping.mapPath,
    mapSha256: mapping.mapSha256,
  };
}

function chainPayload(
  chain: Omit<SourceDistProvenanceChain, "provenanceHash">,
): Record<string, unknown> {
  return {
    documentId: chain.documentId,
    schemaVersion: chain.schemaVersion,
    hashAlgorithm: chain.hashAlgorithm,
    buildManifestHash: chain.buildManifestHash,
    artifactManifestHash: chain.artifactManifestHash,
    deterministicInputs: chain.deterministicInputs,
    mappings: chain.mappings.map(mappingPayload),
    mappingRootHash: chain.mappingRootHash,
  };
}

export async function createProvenanceChain(input: {
  readonly buildManifest: CanonicalBuildManifest;
  readonly buildManifestHash: string;
  readonly artifactManifest: ArtifactManifest;
  readonly artifactManifestHash: string;
  readonly mappings: readonly SourceDistMappingInput[];
}): Promise<ProvenanceResult<SourceDistProvenanceChain>> {
  const diagnostics: ProvenanceDiagnostic[] = [];
  if (!validHash(input.buildManifestHash)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "buildManifestHash must be SHA-256.",
        "buildManifestHash",
      ),
    );
  }
  if (!validHash(input.artifactManifestHash)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "artifactManifestHash must be SHA-256.",
        "artifactManifestHash",
      ),
    );
  }
  const computedBuildManifestHash = await sha256Hex(
    canonicalJson(input.buildManifest),
  );
  if (input.buildManifestHash !== computedBuildManifestHash) {
    diagnostics.push(
      diagnostic(
        "BUILD_MANIFEST_HASH_MISMATCH",
        "Declared build manifest digest does not match the supplied manifest body.",
        "buildManifestHash",
      ),
    );
  }
  const computedArtifactManifestHash = await sha256Hex(
    canonicalJson(input.artifactManifest),
  );
  if (input.artifactManifestHash !== computedArtifactManifestHash) {
    diagnostics.push(
      diagnostic(
        "ARTIFACT_MANIFEST_HASH_MISMATCH",
        "Declared artifact manifest digest does not match the supplied manifest body.",
        "artifactManifestHash",
      ),
    );
  }
  const deterministicInputs: ProvenanceDeterministicInputs =
    input.buildManifest.deterministicInputs;
  for (const [key, value] of Object.entries(deterministicInputs)) {
    if (!validHash(value)) {
      diagnostics.push(
        diagnostic(
          "INVALID_HASH",
          `${key} must be SHA-256.`,
          `deterministicInputs.${key}`,
        ),
      );
    }
  }
  const sourceByPath = new Map(
    input.buildManifest.sourceFiles.map((source) => [source.path, source]),
  );
  const mappings = sortedMappings(input.mappings);
  if (mappings.length === 0) {
    diagnostics.push(
      diagnostic(
        "MAPPING_MISSING",
        "At least one source-to-dist mapping is required.",
        "mappings",
      ),
    );
  }
  const mappedDistPaths = new Set<string>();
  for (const [index, mapping] of mappings.entries()) {
    const path = `mappings[${index}]`;
    if (!validPath(mapping.sourcePath) || !validPath(mapping.distPath)) {
      diagnostics.push(
        diagnostic(
          "INVALID_PATH",
          "Mapping paths must be repo-relative.",
          path,
        ),
      );
    }
    if (!validHash(mapping.sourceSha256) || !validHash(mapping.distSha256)) {
      diagnostics.push(
        diagnostic(
          "INVALID_HASH",
          "Mapping source/dist hashes must be SHA-256.",
          path,
        ),
      );
    }
    if (!validHash(mapping.mappingEvidenceHash)) {
      diagnostics.push(
        diagnostic(
          "MAPPING_EVIDENCE_INVALID",
          "Mapping evidence must be represented by a SHA-256 digest.",
          `${path}.mappingEvidenceHash`,
        ),
      );
    }
    if (!mapping.sourceReferences.includes(mapping.sourcePath)) {
      diagnostics.push(
        diagnostic(
          "MAPPING_EVIDENCE_INVALID",
          "Mapping evidence must name the source path it proves.",
          `${path}.sourceReferences`,
        ),
      );
    }
    const source = sourceByPath.get(mapping.sourcePath);
    if (source === undefined) {
      diagnostics.push(
        diagnostic(
          "SOURCE_NOT_DECLARED",
          `Source '${mapping.sourcePath}' is absent from the build manifest.`,
          mapping.sourcePath,
        ),
      );
    } else if (source.sha256 !== mapping.sourceSha256) {
      diagnostics.push(
        diagnostic(
          "SOURCE_HASH_MISMATCH",
          `Source hash for '${mapping.sourcePath}' does not match the build manifest.`,
          mapping.sourcePath,
        ),
      );
    }
    const dist = recordFor(input.artifactManifest, mapping.distPath);
    if (dist === undefined) {
      diagnostics.push(
        diagnostic(
          "DIST_NOT_DECLARED",
          `Dist artifact '${mapping.distPath}' is absent from the artifact manifest.`,
          mapping.distPath,
        ),
      );
    } else if (dist.sha256 !== mapping.distSha256) {
      diagnostics.push(
        diagnostic(
          "DIST_HASH_MISMATCH",
          `Dist hash for '${mapping.distPath}' does not match the artifact manifest.`,
          mapping.distPath,
        ),
      );
    }
    if (
      ![
        ...input.buildManifest.entries,
        ...input.buildManifest.initialChunks,
        ...input.buildManifest.lazyChunks,
      ].includes(mapping.distPath)
    ) {
      diagnostics.push(
        diagnostic(
          "DIST_NOT_DECLARED",
          `Dist artifact '${mapping.distPath}' is not part of the declared browser topology.`,
          mapping.distPath,
        ),
      );
    }
    if (mappedDistPaths.has(mapping.distPath)) {
      diagnostics.push(
        diagnostic(
          "MAPPING_MISSING",
          `Dist artifact '${mapping.distPath}' is mapped more than once.`,
          mapping.distPath,
        ),
      );
    }
    mappedDistPaths.add(mapping.distPath);
    if (input.buildManifest.sourceMapPolicy.mode === "INCLUDED") {
      if (
        mapping.proofMode !== "SOURCE_MAP" || mapping.mapPath === null ||
        mapping.mapSha256 === null
      ) {
        diagnostics.push(
          diagnostic(
            "SOURCE_MAP_MISSING",
            "Included source-map policy requires a map path and digest.",
            path,
          ),
        );
      } else {
        if (
          !input.buildManifest.sourceMapPolicy.declaredMapPaths.includes(
            mapping.mapPath,
          )
        ) {
          diagnostics.push(
            diagnostic(
              "SOURCE_MAP_MISSING",
              `Source map '${mapping.mapPath}' is not declared by the source-map policy.`,
              mapping.mapPath,
            ),
          );
        }
        const map = recordFor(input.artifactManifest, mapping.mapPath);
        if (map === undefined || map.role !== "SOURCE_MAP") {
          diagnostics.push(
            diagnostic(
              "SOURCE_MAP_MISSING",
              `Source map '${mapping.mapPath}' is not declared.`,
              mapping.mapPath,
            ),
          );
        } else if (map.sha256 !== mapping.mapSha256) {
          diagnostics.push(
            diagnostic(
              "SOURCE_MAP_HASH_MISMATCH",
              `Source map hash for '${mapping.mapPath}' does not match.`,
              mapping.mapPath,
            ),
          );
        }
      }
    } else {
      if (
        mapping.proofMode !==
          input.buildManifest.sourceMapPolicy.mappingProof ||
        mapping.proofMode === "SOURCE_MAP"
      ) {
        diagnostics.push(
          diagnostic(
            "PROOF_MODE_MISMATCH",
            "Excluded source maps require the declared alternative mapping proof.",
            path,
          ),
        );
      }
      if (mapping.mapPath !== null || mapping.mapSha256 !== null) {
        diagnostics.push(
          diagnostic(
            "SOURCE_MAP_MISSING",
            "Excluded source-map policy cannot carry a map artifact.",
            path,
          ),
        );
      }
      if (mapping.sourceReferences.length === 0) {
        diagnostics.push(
          diagnostic(
            "ALTERNATIVE_MAPPING_PROOF_MISSING",
            "An excluded map requires explicit source references.",
            `${path}.sourceReferences`,
          ),
        );
      }
    }
  }
  const declaredDist = [
    ...input.buildManifest.entries,
    ...input.buildManifest.initialChunks,
    ...input.buildManifest.lazyChunks,
  ];
  for (const path of new Set(declaredDist)) {
    if (!mappedDistPaths.has(path)) {
      diagnostics.push(
        diagnostic(
          "MAPPING_MISSING",
          `Declared browser artifact '${path}' has no source mapping.`,
          path,
        ),
      );
    }
  }
  diagnostics.push(
    ...validateArtifactDeclarations(
      input.artifactManifest.artifacts,
      input.buildManifest.declaredArtifacts,
    ).map((item) => diagnostic("UNDECLARED_ARTIFACT", item.message, item.path)),
  );
  const initial = new Set(input.buildManifest.initialChunks);
  for (const chunk of input.buildManifest.lazyChunks) {
    if (initial.has(chunk)) {
      diagnostics.push(
        diagnostic(
          "INITIAL_LAZY_OVERLAP",
          `Lazy chunk '${chunk}' is also initial.`,
          chunk,
        ),
      );
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const mappingJson = canonicalJson(mappings.map(mappingPayload));
  const mappingRootHash = await sha256Hex(mappingJson);
  const body: Omit<SourceDistProvenanceChain, "provenanceHash"> = {
    documentId: FP007_PROVENANCE_DOCUMENT,
    schemaVersion: FP007_PROVENANCE_SCHEMA_VERSION,
    hashAlgorithm: "SHA-256",
    buildManifestHash: input.buildManifestHash,
    artifactManifestHash: input.artifactManifestHash,
    deterministicInputs,
    mappings,
    mappingRootHash,
  };
  const provenanceHash = await sha256Hex(canonicalJson(chainPayload(body)));
  return { ok: true, value: { ...body, provenanceHash }, diagnostics: [] };
}

export async function verifyProvenanceChain(
  chain: SourceDistProvenanceChain,
  manifests: {
    readonly buildManifest: CanonicalBuildManifest;
    readonly artifactManifest: ArtifactManifest;
  },
): Promise<ProvenanceResult<true>> {
  const { provenanceHash, ...body } = chain;
  if (!validHash(provenanceHash)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "INVALID_HASH",
          "provenanceHash must be SHA-256.",
          "provenanceHash",
        ),
      ],
    };
  }
  const rebuilt = await createProvenanceChain({
    buildManifest: manifests.buildManifest,
    buildManifestHash: chain.buildManifestHash,
    artifactManifest: manifests.artifactManifest,
    artifactManifestHash: chain.artifactManifestHash,
    mappings: chain.mappings,
  });
  if (!rebuilt.ok) return { ok: false, diagnostics: rebuilt.diagnostics };
  if (canonicalJson(rebuilt.value) !== canonicalJson(chain)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "CHAIN_HASH_MISMATCH",
          "Provenance chain does not exactly bind the supplied manifest bodies and canonical mapping set.",
          "provenanceHash",
        ),
      ],
    };
  }
  const expected = await sha256Hex(canonicalJson(chainPayload(body)));
  if (expected !== provenanceHash) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "CHAIN_HASH_MISMATCH",
          "Provenance chain hash does not match its canonical body.",
          "provenanceHash",
        ),
      ],
    };
  }
  return { ok: true, value: true, diagnostics: [] };
}
