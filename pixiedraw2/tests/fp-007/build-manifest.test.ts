import {
  type BuildManifestInput,
  canonicalJson,
  createBuildManifest,
  sha256Hex,
} from "../../src/fp-007/build-manifest.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function hasCode(
  result: { readonly diagnostics: readonly { readonly code: string }[] },
  code: string,
): boolean {
  return result.diagnostics.some((item) => item.code === code);
}

const hash = "a".repeat(64);

function baseInput(): BuildManifestInput {
  return {
    buildCommand: [
      "deno",
      "bundle",
      "src/draw2-entry.ts",
      "dist/draw2-entry.js",
    ],
    entries: ["dist/draw2-entry.js"],
    initialChunks: ["dist/draw2-entry.js"],
    lazyChunks: ["dist/wp170-advanced-tools.js"],
    sourceMapPolicy: {
      mode: "EXCLUDED",
      mappingProof: "DIRECT_SOURCE_DIGEST_CHAIN",
      declaredMapPaths: [],
    },
    sourceFiles: [{ path: "src/draw2-entry.ts", bytes: 128, sha256: hash }],
    declaredArtifacts: [
      "src/draw2-entry.ts",
      "dist/draw2-entry.js",
      "dist/wp170-advanced-tools.js",
    ],
    schemaRegistryDigest: hash,
    dependencyGraphHash: "b".repeat(64),
    lockfileHash: "c".repeat(64),
    toolchainHash: "d".repeat(64),
    allowlistedEnvironmentHash: "e".repeat(64),
  };
}

Deno.test("FP007-BUILD-001 canonicalizes deterministic inputs without ambient fields", async () => {
  const first = await createBuildManifest(baseInput());
  const second = await createBuildManifest({
    ...baseInput(),
    entries: ["dist/draw2-entry.js"],
    lazyChunks: ["dist/wp170-advanced-tools.js"],
  });
  assert(first.ok && second.ok);
  assert(
    first.value.canonicalJson === second.value.canonicalJson,
    "canonical manifest bytes differ",
  );
  assert(
    first.value.manifestHash === second.value.manifestHash,
    "canonical manifest hash differs",
  );
  assert(!first.value.canonicalJson.includes("generatedAt"));
  assert(canonicalJson({ b: 2, a: 1 }) === '{"a":1,"b":2}');
});

Deno.test("FP007-BUILD-001 rejects timestamps, host paths, and mutable ambient values", async () => {
  const timestamp = await createBuildManifest(
    { ...baseInput(), timestamp: "2026-08-11T00:00:00Z" } as unknown,
  );
  const absolute = await createBuildManifest({
    ...baseInput(),
    buildCommand: ["deno", "/Users/owner/PiXiEED/src/draw2-entry.ts"],
  });
  const userPath = await createBuildManifest({
    ...baseInput(),
    sourceFiles: [{ path: "/Users/owner/source.ts", bytes: 1, sha256: hash }],
  });
  assert(!timestamp.ok && hasCode(timestamp, "FORBIDDEN_CANONICAL_INPUT"));
  assert(!absolute.ok && hasCode(absolute, "INVALID_COMMAND"));
  assert(!userPath.ok && hasCode(userPath, "INVALID_REPO_RELATIVE_PATH"));
});

Deno.test("FP007-BUILD-001 rejects nondeterministic nested strings and unsafe commands", async () => {
  const dynamic = await createBuildManifest({
    ...baseInput(),
    sourceMapPolicy: {
      mode: "EXCLUDED",
      mappingProof: "DIRECT_SOURCE_DIGEST_CHAIN",
      declaredMapPaths: [],
      metadata: {
        generatedBy: "Date.now()",
        host: "process.env.HOME",
        random: "crypto.randomUUID()",
      },
    },
  } as unknown);
  assert(
    !dynamic.ok &&
      dynamic.diagnostics.filter((item) =>
          item.code === "NONDETERMINISTIC_STRING_INPUT"
        ).length >= 3,
  );

  const locale = await createBuildManifest({
    ...baseInput(),
    buildCommand: [
      "deno",
      "bundle",
      "--locale=ja-JP",
      "src/draw2-entry.ts",
      "dist/draw2-entry.js",
    ],
  });
  assert(!locale.ok && hasCode(locale, "NONDETERMINISTIC_STRING_INPUT"));

  const network = await createBuildManifest({
    ...baseInput(),
    buildCommand: [
      "npm",
      "install",
      "https://registry.example.invalid/pkg.tgz",
    ],
  });
  assert(!network.ok && hasCode(network, "NONDETERMINISTIC_STRING_INPUT"));

  const fixed = await createBuildManifest({
    ...baseInput(),
    buildCommand: [
      "env",
      "SOURCE_DATE_EPOCH=0",
      "deno",
      "bundle",
      "src/draw2-entry.ts",
      "dist/draw2-entry.js",
    ],
  });
  assert(
    fixed.ok,
    fixed.ok ? "" : fixed.diagnostics.map((item) => item.message).join("; "),
  );
});

Deno.test("FP007-DIST-001 rejects a lazy chunk entering the initial boundary", async () => {
  const result = await createBuildManifest({
    ...baseInput(),
    initialChunks: ["dist/draw2-entry.js", "dist/wp170-advanced-tools.js"],
  });
  assert(!result.ok && hasCode(result, "INITIAL_LAZY_OVERLAP"));
});

Deno.test("FP007-PROVENANCE-001 changes identity after source mutation", async () => {
  const first = await createBuildManifest(baseInput());
  const second = await createBuildManifest({
    ...baseInput(),
    sourceFiles: [{
      path: "src/draw2-entry.ts",
      bytes: 129,
      sha256: "f".repeat(64),
    }],
  });
  assert(first.ok && second.ok);
  assert(
    first.value.manifestHash !== second.value.manifestHash,
    "source mutation did not change manifest identity",
  );
  assert(first.value.canonicalJson !== second.value.canonicalJson);
  assert(
    (await sha256Hex(first.value.canonicalJson)) === first.value.manifestHash,
  );
});

Deno.test("FP007-PROVENANCE-001 binds lockfile, toolchain, and allowlisted environment changes", async () => {
  const baseline = await createBuildManifest(baseInput());
  const lockChanged = await createBuildManifest({
    ...baseInput(),
    lockfileHash: "6".repeat(64),
  });
  const toolchainChanged = await createBuildManifest({
    ...baseInput(),
    toolchainHash: "7".repeat(64),
  });
  const environmentChanged = await createBuildManifest({
    ...baseInput(),
    allowlistedEnvironmentHash: "8".repeat(64),
  });
  assert(
    baseline.ok && lockChanged.ok && toolchainChanged.ok &&
      environmentChanged.ok,
  );
  assert(
    baseline.value.manifestHash !== lockChanged.value.manifestHash,
    "lockfile change was not bound",
  );
  assert(
    baseline.value.manifestHash !== toolchainChanged.value.manifestHash,
    "toolchain change was not bound",
  );
  assert(
    baseline.value.manifestHash !== environmentChanged.value.manifestHash,
    "environment change was not bound",
  );
});

Deno.test("FP007-DIST-001 requires an explicit alternative proof when maps are excluded", async () => {
  const missing = await createBuildManifest({
    ...baseInput(),
    sourceMapPolicy: {
      mode: "EXCLUDED",
      mappingProof: "SOURCE_MAP",
      declaredMapPaths: [],
    },
  });
  const includedWithoutPath = await createBuildManifest({
    ...baseInput(),
    sourceMapPolicy: {
      mode: "INCLUDED",
      mappingProof: "SOURCE_MAP",
      declaredMapPaths: [],
    },
  });
  assert(!missing.ok && hasCode(missing, "SOURCE_MAP_PROOF_MISSING"));
  assert(
    !includedWithoutPath.ok &&
      hasCode(includedWithoutPath, "SOURCE_MAP_PROOF_MISSING"),
  );
});
