import {
  detectAudioAssetization,
  detectDrawAssetization,
  finalizeAssetPackage,
  validateAssetPackageManifest,
  verifyAssetPackageManifest,
  type DrawAssetizationInput,
} from "../../src/game/game-350/assetization.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function input(overrides: Partial<DrawAssetizationInput> = {}): DrawAssetizationInput {
  return {
    sourceProjectId: "draw-project",
    sourceRevisionId: "draw-revision:1",
    sourceCanvasId: "canvas:hero",
    contentHash: "sha256:hero",
    selection: { x: 0, y: 0, width: 64, height: 32 },
    sourceFrames: [{ frameId: "frame:1", index: 0, durationMs: 90 }],
    selectedLayerIds: ["layer:body", "layer:shadow"],
    ...overrides,
  };
}

Deno.test("GAME350-ASSETIZATION-001 splits only an explicitly declared sprite grid", () => {
  const result = detectDrawAssetization(input({ grid: { cellWidth: 32, cellHeight: 32 }, roles: ["character"] }));
  assert(result.status === "DETERMINISTIC", "declared grid should be deterministic");
  assert(result.proposals.length === 2, "64×32 must create two cells");
  assert(result.proposals[0]?.frames[0]?.region.width === 32, "cell width must be preserved");
  assert(result.proposals[1]?.frames[0]?.region.x === 32, "cells must be row-major");
  assert(result.proposals[0]?.frames[0]?.layerIds.join(",") === "layer:body,layer:shadow", "selected layers must remain attached");
  assert(result.proposals[0]?.evidence.some((item) => item.code === "EXPLICIT_GRID"), "grid evidence must be recorded");
});

Deno.test("GAME350-ASSETIZATION-002 keeps an unmarked selected region as one asset", () => {
  const result = detectDrawAssetization(input({ selection: { x: 4, y: 6, width: 20, height: 24 } }));
  assert(result.status === "NO_SPLIT", "without an explicit split signal the region must not be subdivided");
  assert(result.proposal.frames.length === 1, "one source region should remain one frame");
  assert(result.proposal.frames[0]?.region.x === 4, "source selection must remain exact");
});

Deno.test("GAME350-ASSETIZATION-003 rejects a multi-frame sheet without explicit animation ranges", () => {
  const result = detectDrawAssetization(input({
    sourceFrames: [
      { frameId: "frame:1", index: 0, durationMs: 90 },
      { frameId: "frame:2", index: 1, durationMs: 120 },
    ],
  }));
  assert(result.status === "REVIEW_REQUIRED", "multiple frames must not be guessed into an animation");
  assert(result.reasons.some((reason) => reason.includes("explicit animation range")), "the stop reason must be actionable");
});

Deno.test("GAME350-ASSETIZATION-004 preserves cross-frame animation order and timing", () => {
  const result = detectDrawAssetization(input({
    selection: { x: 8, y: 10, width: 32, height: 32 },
    sourceFrames: [
      { frameId: "frame:walk-1", index: 4, durationMs: 80 },
      { frameId: "frame:walk-2", index: 7, durationMs: 110 },
      { frameId: "frame:walk-3", index: 9, durationMs: 95 },
    ],
    animationRanges: [{ animationId: "walk:down", label: "Walk Down", frameIds: ["frame:walk-1", "frame:walk-2", "frame:walk-3"], loop: "LOOP", roles: ["walk", "down"] }],
    roles: ["character"],
  }));
  assert(result.status === "DETERMINISTIC", "explicit frame range should be deterministic");
  assert(result.proposals.length === 1, "composite layer plan should create one animation");
  assert(result.proposals[0]?.kind === "ANIMATION", "range must become animation asset");
  assert(result.proposals[0]?.frames[1]?.sourceFrameId === "frame:walk-2", "explicit frame order must be preserved");
  assert(result.proposals[0]?.frames[1]?.durationMs === 110, "per-frame duration must be preserved");
  assert(result.proposals[0]?.roles.join(",") === "character,walk,down", "explicit roles must be combined without visual inference");
});

Deno.test("GAME350-ASSETIZATION-004b preserves explicit per-frame mirror metadata", () => {
  const result = detectDrawAssetization(input({
    sourceFrames: [{
      frameId: "frame:mirror",
      index: 0,
      region: { x: 32, y: 0, width: 32, height: 32 },
      layerIds: ["layer:body"],
      flipX: true,
      flipY: false,
    }],
    animationRanges: [{
      animationId: "idle:right",
      label: "Idle Right",
      frameIds: ["frame:mirror"],
      loop: "LOOP",
    }],
  }));
  assert(result.status === "DETERMINISTIC", "explicit mirrored frame should be deterministic");
  assert(result.proposals[0]?.frames[0]?.flipX === true, "flipX must survive assetization");
  assert(result.proposals[0]?.frames[0]?.flipY === false, "flipY must survive assetization");
});

Deno.test("GAME350-ASSETIZATION-005 blocks invalid grid and ambiguous layer splits", () => {
  const invalidGrid = detectDrawAssetization(input({ grid: { cellWidth: 30, cellHeight: 32 } }));
  assert(invalidGrid.status === "REVIEW_REQUIRED", "non-divisible grid must stop for review");
  const invalidLayers = detectDrawAssetization(input({ layerMode: "SEPARATE", layerGroups: [{ groupId: "body", label: "Body", layerIds: ["layer:missing"] }] }));
  assert(invalidLayers.status === "REVIEW_REQUIRED", "a layer group without selected layers must stop for review");
});

Deno.test("GAME350-ASSETIZATION-006 records explicit layer groups without flattening", () => {
  const result = detectDrawAssetization(input({
    layerMode: "SEPARATE",
    layerGroups: [
      { groupId: "body", label: "Body", layerIds: ["layer:body"] },
      { groupId: "shadow", label: "Shadow", layerIds: ["layer:shadow"] },
    ],
    animationRanges: [{ animationId: "idle", label: "Idle", frameIds: ["frame:1"], loop: "LOOP" }],
  }));
  assert(result.status === "DETERMINISTIC", "explicit layer groups should be deterministic");
  assert(result.proposals.length === 2, "each declared layer group should remain addressable");
  assert(result.proposals[0]?.frames[0]?.layerIds.length === 1, "layer groups must not be flattened");
});

Deno.test("GAME350-ASSETIZATION-007 creates multiple SE Assets from one Track", () => {
  const result = detectAudioAssetization({
    sourceProjectId: "audio-project",
    sourceRevisionId: "audio-revision:3",
    contentHash: "sha256:audio",
    ranges: [
      { rangeId: "jump", label: "Jump", trackIds: ["track:se"], startTick: 0, durationTick: 120, role: "SE", markerId: "jump" },
      { rangeId: "step", label: "Step", trackIds: ["track:se"], startTick: 240, durationTick: 60, role: "SE", markerId: "step" },
      { rangeId: "attack", label: "Attack", trackIds: ["track:se"], startTick: 480, durationTick: 180, role: "SE", markerId: "attack" },
    ],
  });
  assert(result.status === "DETERMINISTIC", "explicit ranges on one track must be independently assetizable");
  assert(result.proposals.length === 3, "each range must remain an independent Asset");
  assert(result.proposals[0]?.trackIds.join(",") === "track:se", "source Track identity must remain");
  assert(result.proposals[1]?.startTick === 240, "range boundaries must remain exact");
  assert(new Set(result.proposals.map((proposal) => proposal.proposalId)).size === 3, "each range needs a stable distinct identity");
});

Deno.test("GAME350-ASSETIZATION-008 permits BGM and SE ranges on the same Track when roles are explicit", () => {
  const result = detectAudioAssetization({
    sourceProjectId: "audio-project",
    sourceRevisionId: "audio-revision:4",
    contentHash: "sha256:mixed",
    ranges: [
      { rangeId: "theme", label: "Theme", trackIds: ["track:mixed"], startTick: 0, durationTick: 1920, role: "BGM", loop: true },
      { rangeId: "jump", label: "Jump", trackIds: ["track:mixed"], startTick: 2400, durationTick: 120, role: "SE" },
    ],
  });
  assert(result.status === "DETERMINISTIC", "one Track can contain different explicit delivery roles");
  assert(result.proposals[0]?.role === "BGM" && result.proposals[0]?.loop, "BGM loop metadata must be preserved");
  assert(result.proposals[1]?.role === "SE" && !result.proposals[1]?.loop, "SE role must remain independent");
});

Deno.test("GAME350-ASSETIZATION-009 blocks audio publication when role is missing or range is invalid", () => {
  const missingRole = detectAudioAssetization({
    sourceProjectId: "audio-project",
    sourceRevisionId: "audio-revision:5",
    contentHash: "sha256:missing-role",
    ranges: [{ rangeId: "range-1", label: "Range 1", trackIds: ["track:1"], startTick: 0, durationTick: 120 }],
  });
  assert(missingRole.status === "REVIEW_REQUIRED", "unclassified audio must stop before publication");
  assert(missingRole.reasons.some((reason) => reason.includes("delivery role")), "the missing role must be actionable");
  const invalid = detectAudioAssetization({
    sourceProjectId: "audio-project",
    sourceRevisionId: "audio-revision:5",
    contentHash: "sha256:invalid",
    ranges: [
      { rangeId: "dup", label: "A", trackIds: ["track:1"], startTick: 0, durationTick: 120, role: "SE" },
      { rangeId: "dup", label: "B", trackIds: ["track:1"], startTick: -1, durationTick: 0, role: "SE" },
    ],
  });
  assert(invalid.status === "REVIEW_REQUIRED" && invalid.candidates.length === 0, "invalid ranges must not create candidates for accidental commit");
});

Deno.test("GAME350-ASSET-PACKAGE-001 finalizes one deterministic visual Asset and binds its source", async () => {
  const result = detectDrawAssetization(input({ roles: ["character"] }));
  const finalized = await finalizeAssetPackage({
    title: "Hero sprite",
    description: "One explicitly selected character region.",
    offerKind: "ASSET",
    derivativePolicy: "DERIVATIVE_ALLOWED",
    confirmationRevision: "draw-revision:1",
    sellerId: "creator:test",
    items: [{
      kind: "DRAW",
      source: {
        kind: "DRAW",
        sourceId: "definition:hero",
        projectId: "draw-project",
        revisionId: "draw-revision:1",
        contentHash: "sha256:hero",
        canvasId: "canvas:hero",
      },
      result,
    }],
  });
  assert(finalized.ok, "a deterministic single region should finalize");
  assert(finalized.manifest.entries.length === 1, "ASSET must contain one child entry");
  assert(finalized.manifest.saleReadiness === "READY", "seller identity should make the package sale-ready");
  assert(finalized.manifest.derivativePolicy === "DERIVATIVE_ALLOWED", "derivative policy must be persisted");
  const verified = await verifyAssetPackageManifest(finalized.manifest);
  assert(verified.ok, "the finalized manifest must verify against its content hash");
});

Deno.test("GAME350-ASSET-PACKAGE-002 requires ASSET_PACK for a declared sprite sheet", async () => {
  const result = detectDrawAssetization(input({ grid: { cellWidth: 32, cellHeight: 32 } }));
  const source = {
    kind: "DRAW" as const,
    sourceId: "definition:sheet",
    projectId: "draw-project",
    revisionId: "draw-revision:1",
    contentHash: "sha256:hero",
    canvasId: "canvas:hero",
  };
  const single = await finalizeAssetPackage({
    title: "Sheet as one Asset",
    offerKind: "ASSET",
    derivativePolicy: "USE_ONLY",
    confirmationRevision: "draw-revision:1",
    items: [{ kind: "DRAW", source, result }],
  });
  assert(!single.ok && single.code === "ASSET_PACKAGE_CARDINALITY", "a multi-cell sheet cannot be mislabeled as one Asset");
  const pack = await finalizeAssetPackage({
    title: "Hero sheet",
    offerKind: "ASSET_PACK",
    derivativePolicy: "USE_ONLY",
    confirmationRevision: "draw-revision:1",
    items: [{ kind: "DRAW", source, result }],
  });
  assert(pack.ok && pack.manifest.entries.length === 2, "the same explicit cells should become an Asset Pack");
  assert(pack.manifest.saleReadiness === "ACCOUNT_REQUIRED", "local packages must expose the account gate");
});

Deno.test("GAME350-ASSET-PACKAGE-003 refuses a review-required visual source", async () => {
  const result = detectDrawAssetization(input({
    sourceFrames: [
      { frameId: "frame:1", index: 0, durationMs: 90 },
      { frameId: "frame:2", index: 1, durationMs: 90 },
    ],
  }));
  const finalized = await finalizeAssetPackage({
    title: "Ambiguous animation",
    offerKind: "ASSET",
    derivativePolicy: "USE_ONLY",
    confirmationRevision: "draw-revision:1",
    items: [{
      kind: "DRAW",
      source: {
        kind: "DRAW",
        sourceId: "definition:ambiguous",
        projectId: "draw-project",
        revisionId: "draw-revision:1",
        contentHash: "sha256:hero",
        canvasId: "canvas:hero",
      },
      result,
    }],
  });
  assert(!finalized.ok && finalized.code === "ASSET_PACKAGE_REVIEW_REQUIRED", "ambiguous frames must stop before package creation");
});

Deno.test("GAME350-ASSET-PACKAGE-004 keeps multiple delivery ranges from one mixed Track independent", async () => {
  const result = detectAudioAssetization({
    sourceProjectId: "audio-project",
    sourceRevisionId: "audio-revision:9",
    contentHash: "sha256:mixed-track",
    ranges: [
      { rangeId: "theme", label: "Theme", trackIds: ["track:mix"], startTick: 0, durationTick: 1920, role: "BGM", loop: true },
      { rangeId: "jump", label: "Jump", trackIds: ["track:mix"], startTick: 2040, durationTick: 120, role: "SE" },
    ],
  });
  const finalized = await finalizeAssetPackage({
    title: "Stage audio set",
    offerKind: "ASSET_PACK",
    derivativePolicy: "REDISTRIBUTION_ALLOWED",
    confirmationRevision: "audio-revision:9",
    items: [
      {
        kind: "AUDIO",
        source: { kind: "AUDIO", sourceId: "theme", projectId: "audio-project", revisionId: "audio-revision:9", contentHash: "sha256:mixed-track" },
        result,
      },
      {
        kind: "AUDIO",
        source: { kind: "AUDIO", sourceId: "jump", projectId: "audio-project", revisionId: "audio-revision:9", contentHash: "sha256:mixed-track" },
        result,
      },
    ],
  });
  assert(finalized.ok, "two explicit ranges on one Track should make a valid pack");
  assert(finalized.manifest.entries.length === 2, "BGM and SE must remain separate entries");
  assert(finalized.manifest.entries[0]?.kind === "AUDIO" && finalized.manifest.entries[0].proposal.rangeId === "theme", "BGM range identity must remain");
  assert(finalized.manifest.entries[1]?.kind === "AUDIO" && finalized.manifest.entries[1].proposal.rangeId === "jump", "SE range identity must remain");
});

Deno.test("GAME350-ASSET-PACKAGE-005 rejects malformed persisted manifests without throwing", () => {
  const malformed = validateAssetPackageManifest({
    schemaVersion: 1,
    status: "FINALIZED",
    detectorVersion: "PIXIEED_ASSETIZATION_V1",
    confirmationRevision: "revision:1",
    packageId: "asset-package:broken",
    packageHash: "sha256:broken",
    title: "Broken",
    description: "",
    offerKind: "ASSET",
    derivativePolicy: "USE_ONLY",
    saleReadiness: "ACCOUNT_REQUIRED",
    entries: [{ entryId: "entry:1", kind: "DRAW", label: "Broken", source: null, proposal: null }],
  });
  assert(!malformed.ok, "malformed untrusted data must be rejected");
  assert(malformed.reasons.some((reason) => reason.includes("source")), "source shape failure must be visible");
});
