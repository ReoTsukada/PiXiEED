import { createAsepriteAudit, createFinalIntegrationGateReport, createMobileComparisonFlow, runHotPathRegression } from "../src/wp190-final-gate.ts";

Deno.test("WP-190 populated fixture is deterministic across all presentation profiles", () => {
  const first = createFinalIntegrationGateReport();
  const second = createFinalIntegrationGateReport();
  if (JSON.stringify(first.populatedFixture) !== JSON.stringify(second.populatedFixture)) throw new Error("Populated fixture is not deterministic.");
  if (first.populatedFixture.profiles.length !== 3 || first.populatedFixture.frames.length !== 12 || first.populatedFixture.onionSkin !== true) throw new Error("Realistic fixture coverage is incomplete.");
});

Deno.test("WP-190 mobile comparison exposes every required reference flow without mutating production", () => {
  const flow = createMobileComparisonFlow();
  for (const required of ["project-create-open", "pen-select", "draw", "palette-color-change", "layer-add-select-visibility", "frame-add-select", "undo-redo", "zoom-pan", "selection-transform", "save-export"]) if (!flow.some((step) => step.operation === required)) throw new Error(`Missing mobile comparison operation: ${required}`);
  if (flow.some((step) => step.currentProduction.status !== "REFERENCE_READ_ONLY" || step.currentProduction.interactionCount !== "UNTESTED")) throw new Error("Current production Mobile was not kept read-only/untested.");
});

Deno.test("WP-190 Aseprite audit is operationally classified, not inferred from file existence", () => {
  const audit = createAsepriteAudit();
  if (audit.length < 20 || !audit.some((entry) => entry.status === "PARTIAL") || !audit.some((entry) => entry.status === "PLANNED")) throw new Error("Aseprite audit lacks honest partial/planned classifications.");
});

Deno.test("WP-190 hot path reports zero unrelated Workspace renders per stroke", () => {
  const result = runHotPathRegression();
  if (result.metrics.pointerSamples !== 120 || result.metrics.canvasProjectionUpdates !== 120 || result.metrics.workspaceUpdates !== 0) throw new Error(`Hot path counters regressed: ${JSON.stringify(result.metrics)}`);
  if (result.timelineRerendersPerStroke !== 0 || result.layerRerendersPerStroke !== 0 || result.hiddenMobileSheetRerendersPerStroke !== 0) throw new Error("Unrelated Workspace render counter is non-zero.");
});

Deno.test("WP-190 virtualization keeps the approved 1000/16 and 100/10 bounds", () => {
  const result = createFinalIntegrationGateReport();
  if (result.virtualization.frames.totalItems !== 1000 || result.virtualization.frames.mountedItems !== 16) throw new Error(`Frame virtualization regression: ${JSON.stringify(result.virtualization.frames)}`);
  if (result.virtualization.layers.totalItems !== 100 || result.virtualization.layers.mountedItems !== 10) throw new Error(`Layer virtualization regression: ${JSON.stringify(result.virtualization.layers)}`);
});
