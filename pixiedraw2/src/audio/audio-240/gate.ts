import { hashCanonical } from "../../wp160-contracts.ts";
import { validateAudioProject } from "../audio-200/state.ts";
import type { AudioEventBinding } from "../audio-210/contracts.ts";
import { validateAudioPackage } from "../audio-220/core.ts";
import { validateAudio230Geometry } from "../audio-230/geometry.ts";
import type {
  Audio240Diagnostic,
  Audio240EvidenceInput,
  Audio240GateOptions,
  Audio240GateResult,
  Audio240Result,
} from "./contracts.ts";
import { AUDIO240_SCHEMA_VERSION } from "./contracts.ts";

const SHA256 = /^[a-f0-9]{64}$/;
const fail = (
  code: Audio240Diagnostic["code"],
  message: string,
  path?: string,
): Audio240Diagnostic => ({
  code,
  message,
  ...(path === undefined ? {} : { path }),
});
const ok = (
  value: Audio240GateResult,
  diagnostics: readonly Audio240Diagnostic[] = [],
): Audio240Result<Audio240GateResult> => ({ ok: true, value, diagnostics });
const blocked = (
  diagnostics: readonly Audio240Diagnostic[],
): Audio240Result<Audio240GateResult> => ({ ok: false, diagnostics });

function stampDiagnostics(
  input: Audio240EvidenceInput,
  options: Audio240GateOptions,
): Audio240Diagnostic[] {
  const stamp = input.stamp;
  const captured = Date.parse(stamp.capturedAt);
  const validUntil = Date.parse(stamp.validUntil);
  if (
    !SHA256.test(stamp.sourceHash) || !stamp.sourceId ||
    !Number.isFinite(captured) || !Number.isFinite(validUntil) ||
    validUntil <= captured
  ) {
    return [
      fail("AUDIO240_INVALID_INPUT", "Evidence stamp is malformed.", "stamp"),
    ];
  }
  if (
    captured > options.nowMs || validUntil <= options.nowMs ||
    options.nowMs - captured > options.maxAgeMs
  ) {
    return [
      fail(
        "AUDIO240_STALE_EVIDENCE",
        "Evidence is stale, expired, or from the future.",
        "stamp",
      ),
    ];
  }
  if (
    !Number.isSafeInteger(options.maxAgeMs) || options.maxAgeMs < 0 ||
    !Number.isFinite(options.nowMs)
  ) {
    return [
      fail(
        "AUDIO240_INVALID_INPUT",
        "Gate clock options are invalid.",
        "options",
      ),
    ];
  }
  return [];
}

async function bindingHashMatches(
  binding: AudioEventBinding,
): Promise<boolean> {
  const { bindingHash: _bindingHash, ...unsigned } = binding;
  return await hashCanonical(unsigned) === binding.bindingHash;
}

export async function evaluateAudio240Gate(
  input: Audio240EvidenceInput,
  options: Audio240GateOptions,
): Promise<Audio240Result<Audio240GateResult>> {
  const diagnostics = stampDiagnostics(input, options);
  if (input?.schemaVersion !== AUDIO240_SCHEMA_VERSION) {
    diagnostics.push(
      fail(
        "AUDIO240_INVALID_INPUT",
        "Unsupported AUDIO-240 evidence schema.",
        "schemaVersion",
      ),
    );
  }
  if (diagnostics.length > 0) return blocked(diagnostics);
  const projectCheck = await validateAudioProject(input.project);
  const localDiagnostics: Audio240Diagnostic[] = [];
  if (!projectCheck.ok) {
    localDiagnostics.push(
      ...projectCheck.diagnostics.map((item) =>
        fail("AUDIO240_HASH_MISMATCH", item.message, item.path)
      ),
    );
  }
  const graph = input.graph;
  const project = input.project;
  if (
    graph.projectId !== project.projectId ||
    graph.projectRevision !== project.projectRevision
  ) {
    localDiagnostics.push(
      fail(
        "AUDIO240_CONTRADICTORY_EVIDENCE",
        "Event graph is stale or bound to another canonical project.",
        "graph",
      ),
    );
  }
  const expectedGraphHash = await hashCanonical({
    projectId: graph.projectId,
    projectRevision: graph.projectRevision,
    bindings: graph.bindings,
  });
  if (expectedGraphHash !== graph.stateHash) {
    localDiagnostics.push(
      fail(
        "AUDIO240_HASH_MISMATCH",
        "Event graph state hash does not match its canonical bindings.",
        "graph.stateHash",
      ),
    );
  }
  for (const [index, binding] of graph.bindings.entries()) {
    if (!(await bindingHashMatches(binding))) {
      localDiagnostics.push(
        fail(
          "AUDIO240_HASH_MISMATCH",
          "Event binding hash does not match its canonical fields.",
          `graph.bindings[${index}].bindingHash`,
        ),
      );
    }
    const revision = project.revisions.find((item) =>
      item.revisionId === binding.revisionId && item.assetId === binding.assetId
    );
    if (
      !revision || binding.projectRevision !== project.projectRevision ||
      binding.contentHash !== revision.source.metadata.contentHash
    ) {
      localDiagnostics.push(
        fail(
          "AUDIO240_CONTRADICTORY_EVIDENCE",
          "Event binding does not resolve to the canonical project revision.",
          `graph.bindings[${index}]`,
        ),
      );
    }
  }
  const geometryDiagnostics = validateAudio230Geometry(
    input.workspace.geometry,
  );
  if (
    geometryDiagnostics.length > 0 ||
    input.workspace.geometry.pageScroll.horizontal ||
    input.workspace.geometry.pageScroll.vertical
  ) {
    localDiagnostics.push(
      fail(
        "AUDIO240_PAGE_SCROLL",
        "Workspace evidence permits page-level scroll.",
        "workspace.geometry.pageScroll",
      ),
    );
  }
  if (
    input.workspace.counters.hiddenHeavyWork !== 0 ||
    input.workspace.panels.some((panel) =>
      panel.networkAllowed ||
      (panel.visibility === "LAZY" &&
        (panel.workAllowed || panel.decodeAllowed))
    )
  ) {
    localDiagnostics.push(
      fail(
        "AUDIO240_CONTRADICTORY_EVIDENCE",
        "Workspace hidden-heavy-work or network boundary is unsafe.",
        "workspace.panels",
      ),
    );
  }
  const crossToolValues = Object.values(input.crossTool);
  if (crossToolValues.some((value) => value !== true)) {
    localDiagnostics.push(
      fail(
        "AUDIO240_MISSING_EVIDENCE",
        "Cross-tool LIVE/PINNED and rollback evidence is incomplete.",
        "crossTool",
      ),
    );
  }
  const packageCheck = input.package === null
    ? null
    : await validateAudioPackage(input.package);
  if (packageCheck && !packageCheck.ok) {
    localDiagnostics.push(...packageCheck.diagnostics.map((item) =>
      fail(
        item.code === "AUDIO220_MANIFEST_TAMPERED" ||
          item.code === "AUDIO220_HASH_MISMATCH"
          ? "AUDIO240_HASH_MISMATCH"
          : "AUDIO240_CONTRADICTORY_EVIDENCE",
        item.message,
        item.path,
      )
    ));
  }
  if (
    input.package !== null &&
    input.package.manifest.projectId !== project.projectId
  ) {
    localDiagnostics.push(
      fail(
        "AUDIO240_CONTRADICTORY_EVIDENCE",
        "Package belongs to another project.",
        "package.manifest.projectId",
      ),
    );
  }
  if (
    input.package !== null &&
    input.package.manifest.graphHash !== graph.stateHash
  ) {
    localDiagnostics.push(
      fail(
        "AUDIO240_HASH_MISMATCH",
        "Package graph hash differs from the canonical event graph.",
        "package.manifest.graphHash",
      ),
    );
  }
  if (
    graph.bindings.some((binding) => binding.referenceMode === "LIVE") &&
    input.package !== null
  ) {
    localDiagnostics.push(
      fail(
        "AUDIO240_LIVE_PACKAGE_UNSAFE",
        "LIVE bindings cannot be represented as a publishable package lock.",
        "graph.bindings",
      ),
    );
  }
  const live =
    graph.bindings.filter((binding) => binding.referenceMode === "LIVE").length;
  const pinned =
    graph.bindings.filter((binding) => binding.referenceMode === "PINNED")
      .length;
  const hasHardFailure = localDiagnostics.some((item) =>
    [
      "AUDIO240_CONTRADICTORY_EVIDENCE",
      "AUDIO240_HASH_MISMATCH",
      "AUDIO240_LIVE_PACKAGE_UNSAFE",
      "AUDIO240_PAGE_SCROLL",
    ].includes(item.code)
  );
  const environmentUntested = Object.values(input.environment).some((status) =>
    status !== "PASS"
  );
  if (environmentUntested) {
    localDiagnostics.push(
      fail(
        "AUDIO240_ENVIRONMENT_UNTESTED",
        "Browser, device, or production evidence is not a PASS.",
        "environment",
      ),
    );
  }
  const decision = hasHardFailure
    ? "BLOCKED"
    : environmentUntested || input.package === null
    ? "UNTESTED"
    : "PASS";
  const result: Audio240GateResult = {
    schemaVersion: AUDIO240_SCHEMA_VERSION,
    decision,
    ready: decision === "PASS",
    projectId: project.projectId,
    projectRevision: project.projectRevision,
    projectStateHash: project.stateHash,
    graphHash: graph.stateHash,
    packageHash: input.package?.packageHash ?? null,
    referenceModes: { live, pinned },
    diagnostics: localDiagnostics,
    evidence: {
      project: projectCheck.ok ? "PASS" : "BLOCKED",
      event: localDiagnostics.some((item) => item.path?.startsWith("graph"))
        ? "BLOCKED"
        : "PASS",
      package: input.package === null
        ? "MISSING"
        : packageCheck?.ok
        ? "PASS"
        : "BLOCKED",
      workspace:
        localDiagnostics.some((item) => item.path?.startsWith("workspace"))
          ? "BLOCKED"
          : "PASS",
      crossTool: crossToolValues.every((value) => value === true)
        ? "PASS"
        : "BLOCKED",
      browser: input.environment.browser,
      device: input.environment.device,
      production: input.environment.production,
    },
    publishAllowed: false,
  };
  return ok(result, localDiagnostics);
}
