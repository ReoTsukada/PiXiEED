import { canonicalJson, createProject } from "../../src/draw2-core.ts";
import {
  exportPxdProject,
  importPxdProject,
} from "../../src/draw2-export.ts";
import {
  detectDrawAssetization,
  finalizeAssetPackage,
  verifyAssetPackageManifest,
} from "../../src/game/game-350/assetization.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

Deno.test("PXD v2 carries a finalized Asset Package without duplicating source media", async () => {
  const project = createProject({
    projectId: "project-pxd-asset-package",
    name: "Asset Package Source",
    width: 32,
    height: 32,
    tileSize: 32,
  });
  const detection = detectDrawAssetization({
    sourceProjectId: project.projectId,
    sourceRevisionId: "draw-revision:7",
    sourceCanvasId: project.activeAssetId,
    contentHash: "sha256:draw-source",
    selection: { x: 0, y: 0, width: 32, height: 32 },
    sourceFrames: [{ frameId: project.activeFrameId, index: 0, durationMs: 100 }],
    selectedLayerIds: [project.activeLayerId],
    roles: ["character", "idle"],
  });
  const finalized = await finalizeAssetPackage({
    title: "Hero idle",
    description: "One explicitly selected Draw range.",
    offerKind: "ASSET",
    derivativePolicy: "DERIVATIVE_ALLOWED",
    confirmationRevision: "draw-revision:7",
    items: [{
      kind: "DRAW",
      source: {
        kind: "DRAW",
        sourceId: "definition:hero-idle",
        projectId: project.projectId,
        revisionId: "draw-revision:7",
        contentHash: "sha256:draw-source",
        canvasId: project.activeAssetId,
      },
      result: detection,
    }],
  });
  assert(finalized.ok, "the explicit source should finalize");
  assert((await verifyAssetPackageManifest(finalized.manifest)).ok, "the package hash should verify before export");

  const exported = await exportPxdProject(project, {
    assetPackages: [finalized.manifest],
  });
  assertEquals(exported.manifest.assetPackages?.length, 1, "PXD manifest should expose the package");
  assertEquals(exported.manifest.assetPackages?.[0]?.packageId, finalized.manifest.packageId, "package identity should be stable");

  const imported = await importPxdProject(exported.bytes, {
    expectedPackageHash: exported.packageHash,
  });
  assertEquals(imported.assetPackages.length, 1, "PXD import should restore one package");
  assertEquals(
    canonicalJson(imported.assetPackages[0]),
    canonicalJson(finalized.manifest),
    "PXD round-trip must preserve the finalized manifest exactly",
  );
  assert(exported.bytes.byteLength < 20_000, "metadata-only package export must stay compact");
});
