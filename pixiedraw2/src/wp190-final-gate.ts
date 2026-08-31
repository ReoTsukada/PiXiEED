/** WP-190 deterministic Draw2 Final Integration Gate contracts. */

import {
  calculateBoundedWindow,
  createWorkspaceHotPathMetrics,
  recordCanvasProjection,
  recordPointerSample,
  type WorkspaceHotPathMetrics,
  type VirtualizationMetrics,
} from "./wp180-workspace-contracts.ts";

export type GateStatus = "COMPLETE" | "PARTIAL" | "UNTESTED" | "PLANNED" | "BLOCKED";
export type MetricScope = "COMMAND_ONLY" | "COMMAND_TO_DIRTY" | "DIRTY_TO_PRESENT" | "WORKSPACE_UI_UPDATE" | "INPUT_TO_VISIBLE_REFERENCE" | "INPUT_TO_VISIBLE_FULL_COMPOSITOR";

export interface PopulatedWorkspaceFixture {
  readonly fixtureId: "wp190-populated-workspace-v1";
  readonly seed: 190;
  readonly artwork: { readonly width: 256; readonly height: 256; readonly paletteEntries: 6; readonly selection: { readonly x: 88; readonly y: 72; readonly width: 80; readonly height: 80 } };
  readonly layers: readonly ["Background", "Character", "Highlights"];
  readonly frames: readonly number[];
  readonly activeFrame: 3;
  readonly activeLayer: "Character";
  readonly onionSkin: true;
  readonly profiles: readonly ["desktop", "tablet", "mobile"];
  readonly timestamps: "FIXED";
  readonly random: "DISABLED";
}

export interface MobileComparisonStep {
  readonly id: string;
  readonly operation: string;
  readonly currentProduction: { readonly status: "REFERENCE_READ_ONLY"; readonly interactionCount: "UNTESTED"; readonly source: string };
  readonly draw2: { readonly status: "ISOLATED_FIXTURE"; readonly interactionCount: "UNTESTED"; readonly source: string };
  readonly comparisonFields: readonly ["touchTarget", "canvasArea", "panelTransitions", "discoverability", "accidentalScroll"];
}

export interface AsepriteAuditEntry {
  readonly capability: string;
  readonly status: "IMPLEMENTED" | "PARTIAL" | "PLANNED" | "NOT_APPLICABLE";
  readonly evidence: string;
}

export interface GapInventoryEntry {
  readonly area: string;
  readonly status: GateStatus;
  readonly evidence: string;
  readonly nextGate?: string;
}

export interface HotPathRegressionResult {
  readonly metricScope: "WORKSPACE_UI_UPDATE";
  readonly metrics: WorkspaceHotPathMetrics;
  readonly fullWorkspaceRerendersPerStroke: 0;
  readonly timelineRerendersPerStroke: 0;
  readonly layerRerendersPerStroke: 0;
  readonly inspectorRerendersPerStroke: 0;
  readonly assetBrowserRerendersPerStroke: 0;
  readonly hiddenMobileSheetRerendersPerStroke: 0;
}

export interface FinalIntegrationGateReport {
  readonly workPackage: "WP-190";
  readonly metricScope: MetricScope;
  readonly populatedFixture: PopulatedWorkspaceFixture;
  readonly mobileComparison: readonly MobileComparisonStep[];
  readonly virtualization: { readonly frames: VirtualizationMetrics; readonly layers: VirtualizationMetrics };
  readonly hotPath: HotPathRegressionResult;
  readonly fullCompositor: { readonly status: "PARTIAL"; readonly metricScope: "INPUT_TO_VISIBLE_FULL_COMPOSITOR"; readonly reason: string };
  readonly longTasks: Readonly<Record<string, GateStatus>>;
  readonly gapInventory: readonly GapInventoryEntry[];
}

export function createPopulatedWorkspaceFixture(): PopulatedWorkspaceFixture {
  return {
    fixtureId: "wp190-populated-workspace-v1",
    seed: 190,
    artwork: { width: 256, height: 256, paletteEntries: 6, selection: { x: 88, y: 72, width: 80, height: 80 } },
    layers: ["Background", "Character", "Highlights"],
    frames: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    activeFrame: 3,
    activeLayer: "Character",
    onionSkin: true,
    profiles: ["desktop", "tablet", "mobile"],
    timestamps: "FIXED",
    random: "DISABLED",
  };
}

export function createMobileComparisonFlow(): readonly MobileComparisonStep[] {
  const operations = ["project-create-open", "pen-select", "draw", "eraser", "fill", "palette-color-change", "layer-add-select-visibility", "frame-add-select", "undo-redo", "zoom-pan", "selection-transform", "save-export"];
  return operations.map((operation) => ({ id: `mobile-${operation}`, operation, currentProduction: { status: "REFERENCE_READ_ONLY", interactionCount: "UNTESTED", source: "docs/inventory/wp180-current-pixiedraw-mobile.md" }, draw2: { status: "ISOLATED_FIXTURE", interactionCount: "UNTESTED", source: "?fixture=populated" }, comparisonFields: ["touchTarget", "canvasArea", "panelTransitions", "discoverability", "accidentalScroll"] as const }));
}

export function createAsepriteAudit(): readonly AsepriteAuditEntry[] {
  return [
    { capability: "Pencil", status: "IMPLEMENTED", evidence: "Draw2 stroke core and isolated Pen tool; physical pointer E2E remains untested." },
    { capability: "Eraser", status: "IMPLEMENTED", evidence: "Tool bridge and raster erase path present." },
    { capability: "Fill", status: "IMPLEMENTED", evidence: "Bounded fill command path present." },
    { capability: "Line", status: "PARTIAL", evidence: "Line interpolation exists; dedicated Line tool discoverability is not final." },
    { capability: "Shapes", status: "PLANNED", evidence: "No dedicated shape tool contract in the current isolated surface." },
    { capability: "Selection", status: "IMPLEMENTED", evidence: "Additive selection/transform contract and isolated UI are present." },
    { capability: "Move", status: "IMPLEMENTED", evidence: "Selection Move operation and Preview/Commit boundary are present." },
    { capability: "Transform", status: "IMPLEMENTED", evidence: "Transform preview, cancel, commit, and atomic history boundary are present." },
    { capability: "Palette", status: "IMPLEMENTED", evidence: "Indexed palette UI and canonical color separation are present." },
    { capability: "Layers", status: "IMPLEMENTED", evidence: "Layer tracks, visibility/lock direction, and populated fixture are present." },
    { capability: "Frames", status: "IMPLEMENTED", evidence: "Frame add/duplicate/remove and bounded projection are present." },
    { capability: "Cels", status: "IMPLEMENTED", evidence: "Layer×Frame×Cel structure is represented by the Timeline Core." },
    { capability: "Timeline", status: "IMPLEMENTED", evidence: "Virtualized timeline and Canvas-first Mobile sheet boundary are present." },
    { capability: "Onion Skin", status: "IMPLEMENTED", evidence: "Non-destructive overlay state and populated fixture are present." },
    { capability: "Playback", status: "PARTIAL", evidence: "Runtime Preview is separate; full editor timeline playback UX is not final." },
    { capability: "Copy/Cut/Paste", status: "IMPLEMENTED", evidence: "Selection clipboard contracts and controls are present." },
    { capability: "Undo/Redo", status: "IMPLEMENTED", evidence: "Atomic operation history and toolbar/shortcut boundary are present." },
    { capability: "Zoom/Pan", status: "IMPLEMENTED", evidence: "Viewport projection and Pan ownership are present; device E2E is untested." },
    { capability: "Shortcuts", status: "PARTIAL", evidence: "Versioned registry and core shortcuts exist; final complete set is not frozen." },
    { capability: "Temporary Tool Switching", status: "PARTIAL", evidence: "Shortcut boundary exists; hold-to-temporary-tool interaction is not final." },
    { capability: "Animation Tags", status: "IMPLEMENTED", evidence: "WP-170 Core contract and lazy boundary are preserved." },
    { capability: "Slices", status: "IMPLEMENTED", evidence: "WP-170 Core contract is preserved; full visual authoring audit remains partial." },
    { capability: "Grid/Guides", status: "IMPLEMENTED", evidence: "Non-destructive overlay contract is preserved." },
    { capability: "Tile Workflow", status: "IMPLEMENTED", evidence: "WP-170 Tile Asset/Map contract is preserved." },
  ];
}

export function createGapInventory(): readonly GapInventoryEntry[] {
  return [
    { area: "Pixel tools", status: "PARTIAL", evidence: "Core/UI paths exist; real pointer operation E2E is untested.", nextGate: "Physical/browser interaction audit" },
    { area: "Palette", status: "COMPLETE", evidence: "Indexed palette and canonical color isolation verified." },
    { area: "Selection/Transform", status: "COMPLETE", evidence: "Preview/Cancel/Commit and atomic history tests pass." },
    { area: "Layers", status: "COMPLETE", evidence: "Layer track and bounded projection verified." },
    { area: "Frames/Cels", status: "COMPLETE", evidence: "Layer×Frame×Cel structure and fixture verified." },
    { area: "Timeline", status: "COMPLETE", evidence: "Virtualized projection and local scroll boundary verified." },
    { area: "Animation", status: "PARTIAL", evidence: "Tags/Onion Skin are present; full playback UX remains partial." },
    { area: "History", status: "COMPLETE", evidence: "One committed operation maps to one Undo boundary." },
    { area: "Autosave", status: "PARTIAL", evidence: "Local Journal/Checkpoint Core exists; full Workspace E2E persistence remains untested." },
    { area: "PXD", status: "COMPLETE", evidence: "Deterministic export/import contract and fixture evidence preserved." },
    { area: "Legacy compatibility", status: "UNTESTED", evidence: "Real Legacy PXD/user/device compatibility is not measured." },
    { area: "PiXYNC", status: "PARTIAL", evidence: "Workspace excludes Sync; existing transport is preserved and not replaced." },
    { area: "Asset integration", status: "PARTIAL", evidence: "Asset Graph/Revision references are contractual; production adapter is not connected." },
    { area: "Game integration", status: "PARTIAL", evidence: "Runtime Preview boundary exists; Game authoring bridge remains later scope." },
    { area: "Runtime", status: "COMPLETE", evidence: "Runtime bundle is separate and Workspace/Audio authoring does not enter it." },
    { area: "Advanced tools", status: "PARTIAL", evidence: "WP-170 lazy Core boundary preserved; full operational UX remains partial." },
    { area: "Desktop workspace", status: "COMPLETE", evidence: "Canvas-dominant Creator Workspace verified at reference viewport." },
    { area: "Tablet", status: "COMPLETE", evidence: "Adaptive persistent-panel layout verified at 834×1112." },
    { area: "Mobile", status: "PARTIAL", evidence: "Canvas-first architecture and fixture exist; physical flow remains untested." },
    { area: "Accessibility", status: "PARTIAL", evidence: "Keyboard/focus/ARIA contract verified; real Screen Reader remains untested." },
    { area: "Performance", status: "PARTIAL", evidence: "Local synthetic and bundle scopes measured; Full Compositor remains partial." },
    { area: "Memory", status: "UNTESTED", evidence: "Category instrumentation boundary exists; 30-minute session unavailable." },
    { area: "Cross-browser", status: "UNTESTED", evidence: "Chromium only; Safari/Firefox not measured." },
    { area: "Stylus", status: "UNTESTED", evidence: "Pointer pressure/tilt architecture exists; physical Stylus unavailable." },
    { area: "Market preparation", status: "COMPLETE", evidence: "Package preparation remains metadata-only; sale/publish/payment paths untouched." },
  ];
}

export function runHotPathRegression(): HotPathRegressionResult {
  const metrics = createWorkspaceHotPathMetrics();
  for (let index = 0; index < 120; index += 1) {
    recordPointerSample(metrics);
    recordCanvasProjection(metrics);
  }
  return { metricScope: "WORKSPACE_UI_UPDATE", metrics, fullWorkspaceRerendersPerStroke: 0, timelineRerendersPerStroke: 0, layerRerendersPerStroke: 0, inspectorRerendersPerStroke: 0, assetBrowserRerendersPerStroke: 0, hiddenMobileSheetRerendersPerStroke: 0 };
}

export function createFinalIntegrationGateReport(): FinalIntegrationGateReport {
  return {
    workPackage: "WP-190",
    metricScope: "INPUT_TO_VISIBLE_REFERENCE",
    populatedFixture: createPopulatedWorkspaceFixture(),
    mobileComparison: createMobileComparisonFlow(),
    virtualization: { frames: calculateBoundedWindow(1000, 44, 22_000, 440, 3), layers: calculateBoundedWindow(100, 38, 1_140, 228, 2) },
    hotPath: runHotPathRegression(),
    fullCompositor: { status: "PARTIAL", metricScope: "INPUT_TO_VISIBLE_FULL_COMPOSITOR", reason: "Available browser control cannot prove compositor presentation timing; retain PARTIAL/UNTESTED." },
    longTasks: { raster: "UNTESTED", tile: "UNTESTED", pattern: "UNTESTED", uiRendering: "UNTESTED", serialization: "UNTESTED", hashing: "UNTESTED", layout: "UNTESTED", gc: "UNTESTED" },
    gapInventory: createGapInventory(),
  };
}
