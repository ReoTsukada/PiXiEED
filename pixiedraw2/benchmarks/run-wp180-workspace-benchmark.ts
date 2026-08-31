import {
  calculateBoundedWindow,
  createWorkspaceHotPathMetrics,
  recordCanvasProjection,
  recordPointerSample,
} from "../src/wp180-workspace-contracts.ts";

function measure(name: string, operation: () => unknown): { name: string; durationMs: number; category: string } {
  const start = performance.now();
  operation();
  return { name, durationMs: Number((performance.now() - start).toFixed(3)), category: name.includes("virtual") ? "list_materialization" : "ui_projection" };
}

const results = [
  measure("virtual-timeline-1000x", () => calculateBoundedWindow(1000, 44, 13_200, 528, 3)),
  measure("virtual-layer-100x", () => calculateBoundedWindow(100, 38, 1_140, 228, 2)),
  measure("hot-path-120-pointer-samples", () => {
    const metrics = createWorkspaceHotPathMetrics();
    for (let index = 0; index < 120; index += 1) {
      recordPointerSample(metrics);
      recordCanvasProjection(metrics);
    }
    return metrics;
  }),
];

console.log(JSON.stringify({
  workPackage: "WP-180",
  status: "MEASURED_LOCAL_SYNTHETIC",
  results,
  hotPathRule: "pointer samples update Canvas projection only; Workspace updates are commit/panel scoped",
  longTaskClassification: "This small contract benchmark did not observe a long task; browser compositor, raster, GC, serialization, hashing and 30-minute memory remain UNTESTED.",
}, null, 2));
