import {
  createGoldenProject,
  type GoldenAssetInput,
} from "../../src/studio/golden-project.ts";
import {
  createStudioReleaseCandidate,
  type StudioAssetRegistryEntry,
} from "../../src/studio/package-publish.ts";
import {
  createStudioReadinessEvidence,
  evaluateStudioReadiness,
  STUDIO_READINESS_SCHEMA_VERSION,
  type StudioReadinessCheckId,
  type StudioReadinessEvidence,
} from "../../src/studio/release-readiness.ts";

const DRAW_HASH = "a".repeat(64);
const AUDIO_HASH = "b".repeat(64);
const CHECKS: readonly StudioReadinessCheckId[] = [
  "STAGING_DEPLOYMENT",
  "COLLABORATION_2_TO_3",
  "RECONNECT_RECOVERY",
  "DEVICE_BROWSER_MATRIX",
  "PERFORMANCE_BUDGET",
  "MONITORING_ALERTS",
  "ROLLBACK",
  "NATIVE_SHELL",
];

function asset(kind: GoldenAssetInput["kind"]): GoldenAssetInput {
  return {
    projectId: "studio:readiness",
    ownerId: "owner:local",
    kind,
    assetId: kind === "DRAW" ? "draw:hero" : "audio:theme",
    revisionId: kind === "DRAW" ? "draw:hero:r1" : "audio:theme:r1",
    contentHash: kind === "DRAW" ? DRAW_HASH : AUDIO_HASH,
    licenseId: kind === "DRAW" ? "license:draw" : "license:audio",
    permission: "READ",
    reviewStatus: "APPROVED",
    label: kind === "DRAW" ? "Hero" : "Theme",
  };
}

async function candidate() {
  const golden = await createGoldenProject({
    projectId: "studio:readiness",
    ownerId: "owner:local",
    name: "Readiness Project",
    draw: asset("DRAW"),
    audio: asset("AUDIO"),
  }, "PINNED");
  if (!golden.ok) throw new Error(JSON.stringify(golden.diagnostics));
  const value = golden.value;
  const assetRegistry: StudioAssetRegistryEntry[] = value.manifest.assetLocks
    .map((entry) => ({
      kind: entry.kind,
      assetId: entry.assetId,
      revisionId: entry.revisionId,
      contentHash: entry.contentHash,
      ownerId: entry.ownerId,
      licenseId: entry.licenseId,
      byteLength: 1_024,
      mimeType: entry.kind === "DRAW" ? "image/png" : "audio/ogg",
      sourcePackage: entry.kind === "DRAW" ? "PXD" : "AUDIO",
    }));
  const release = await createStudioReleaseCandidate({
    packageId: "studio:readiness",
    packageVersion: "1.0.0",
    project: value.project,
    integration: value.manifest,
    caller: value.caller,
    assetRegistry,
  });
  if (!release.ok || release.value === undefined) {
    throw new Error(JSON.stringify(release.diagnostics));
  }
  return release.value;
}

async function evidenceFor(
  release: Awaited<ReturnType<typeof candidate>>,
  status: StudioReadinessEvidence["status"],
  environment: StudioReadinessEvidence["environment"] = "STAGING",
  evidenceKind: StudioReadinessEvidence["evidenceKind"] = "LIVE_OBSERVATION",
): Promise<readonly StudioReadinessEvidence[]> {
  return Promise.all(CHECKS.map((checkId) =>
    createStudioReadinessEvidence({
      schemaVersion: STUDIO_READINESS_SCHEMA_VERSION,
      checkId,
      environment,
      status,
      evidenceKind,
      packageHash: release.manifest.packageHash,
      sourceIdentity: `${evidenceKind === "LIVE_OBSERVATION" ? "observed" : "fixture"}:${environment.toLowerCase()}:${checkId.toLowerCase()}`,
      capturedAt: "2026-08-27T00:00:00.000Z",
      summary: `${evidenceKind === "LIVE_OBSERVATION" ? "Observed" : "Fixture"} evidence for ${checkId}`,
      ...(checkId === "COLLABORATION_2_TO_3" ? { participants: 2 } : {}),
    })
  ));
}

Deno.test("STUDIO-030 allows staging and beta only at their explicit evidence gates", async () => {
  const release = await candidate();
  const partial = await evidenceFor(release, "UNTESTED");
  const { evidenceHash: _ignoredEvidenceHash, ...stagingBase } = partial[0]!;
  void _ignoredEvidenceHash;
  const stagingDeployment = await createStudioReadinessEvidence({
    ...stagingBase,
    checkId: "STAGING_DEPLOYMENT",
    status: "PASS",
  });
  const staging = await evaluateStudioReadiness({
    candidate: release,
    target: "STAGING",
    evidence: [stagingDeployment, ...partial.slice(1)],
  });
  if (!staging.ok || staging.value?.decision !== "READY_FOR_STAGING") {
    throw new Error(JSON.stringify(staging));
  }
  if (staging.value.untested.length !== CHECKS.length - 1) {
    throw new Error(
      "Staging readiness must keep later checks visible as UNTESTED.",
    );
  }

  const beta = await evaluateStudioReadiness({
    candidate: release,
    target: "BETA",
    evidence: await evidenceFor(release, "PASS"),
  });
  if (!beta.ok || beta.value?.decision !== "READY_FOR_BETA") {
    throw new Error(JSON.stringify(beta));
  }
});

Deno.test("STUDIO-030 keeps production blocked when staging evidence is reused", async () => {
  const release = await candidate();
  const result = await evaluateStudioReadiness({
    candidate: release,
    target: "PRODUCTION",
    evidence: await evidenceFor(release, "PASS", "STAGING"),
  });
  if (
    result.ok ||
    !result.diagnostics.some((item) => item.code === "ENVIRONMENT_MISMATCH")
  ) {
    throw new Error("Production must not reuse staging evidence.");
  }
});

Deno.test("STUDIO-030 rejects tampered evidence and preserves FAIL/BLOCKED semantics", async () => {
  const release = await candidate();
  const evidence = [...await evidenceFor(release, "PASS")];
  const tampered = { ...evidence[0]!, summary: "changed after capture" };
  const tamperResult = await evaluateStudioReadiness({
    candidate: release,
    target: "BETA",
    evidence: [tampered, ...evidence.slice(1)],
  });
  if (
    tamperResult.ok ||
    !tamperResult.diagnostics.some((item) => item.code === "HASH_MISMATCH")
  ) {
    throw new Error("Tampered evidence must fail closed.");
  }

  const blockedEvidence = await Promise.all(
    CHECKS.map((checkId) =>
      createStudioReadinessEvidence({
        schemaVersion: STUDIO_READINESS_SCHEMA_VERSION,
        checkId,
        environment: "STAGING",
        status: checkId === "ROLLBACK" ? "BLOCKED" : "PASS",
        evidenceKind: "LIVE_OBSERVATION",
        packageHash: release.manifest.packageHash,
        sourceIdentity: `observed:staging:${checkId.toLowerCase()}`,
        capturedAt: "2026-08-27T00:00:00.000Z",
        summary: `Observed evidence for ${checkId}`,
        ...(checkId === "COLLABORATION_2_TO_3" ? { participants: 2 } : {}),
      })
    ),
  );
  const blocked = await evaluateStudioReadiness({
    candidate: release,
    target: "BETA",
    evidence: blockedEvidence,
  });
  if (!blocked.ok || blocked.value?.decision !== "BLOCKED") {
    throw new Error(JSON.stringify(blocked));
  }
});

Deno.test("STUDIO-030 never promotes an isolated fixture PASS", async () => {
  const release = await candidate();
  const result = await evaluateStudioReadiness({
    candidate: release,
    target: "BETA",
    evidence: await evidenceFor(
      release,
      "PASS",
      "STAGING",
      "ISOLATED_FIXTURE",
    ),
  });
  if (
    result.ok ||
    !result.diagnostics.some((item) => item.code === "SYNTHETIC_EVIDENCE")
  ) {
    throw new Error("An isolated fixture must not qualify Beta readiness.");
  }
});

Deno.test("STUDIO-030 fails closed for unknown checks and mixed environments", async () => {
  const release = await candidate();
  const evidence = [...await evidenceFor(release, "PASS")];
  const unknown = {
    ...evidence[0]!,
    checkId: "UNKNOWN_CHECK",
  } as unknown as StudioReadinessEvidence;
  const unknownResult = await evaluateStudioReadiness({
    candidate: release,
    target: "BETA",
    evidence: [...evidence, unknown],
  });
  if (
    unknownResult.ok ||
    !unknownResult.diagnostics.some((item) => item.code === "INVALID_CHECK_ID")
  ) {
    throw new Error("Unknown readiness checks must be rejected.");
  }

  const productionEvidence = await createStudioReadinessEvidence({
    ...evidence[0]!,
    environment: "PRODUCTION",
  });
  const mixedResult = await evaluateStudioReadiness({
    candidate: release,
    target: "BETA",
    evidence: [productionEvidence, ...evidence.slice(1)],
  });
  if (
    mixedResult.ok ||
    !mixedResult.diagnostics.some((item) =>
      item.code === "ENVIRONMENT_MISMATCH"
    )
  ) {
    throw new Error("Mixed staging/production evidence must be rejected.");
  }
});
