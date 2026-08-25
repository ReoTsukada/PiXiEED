import { createFinalIntegrationGateReport } from "../src/wp190-final-gate.ts";

const start = performance.now();
const report = createFinalIntegrationGateReport();
const durationMs = Number((performance.now() - start).toFixed(3));
console.log(JSON.stringify({
  workPackage: "WP-190",
  status: "MEASURED_LOCAL_SYNTHETIC",
  metricScope: report.metricScope,
  fixture: report.populatedFixture.fixtureId,
  virtualization: report.virtualization,
  hotPath: report.hotPath,
  planningDurationMs: durationMs,
  fullCompositor: report.fullCompositor,
  longTasks: report.longTasks,
}, null, 2));
