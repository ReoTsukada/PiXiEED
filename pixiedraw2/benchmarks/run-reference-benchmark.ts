import { runReferenceBenchmark, type BenchmarkEnvironment } from "../src/draw2-reference-benchmark.ts";

const environment: BenchmarkEnvironment = {
  deviceClass: "node-host-unknown",
  actualDevice: "Node runtime host; device model unavailable",
  browser: "OTHER",
  browserVersion: "not-applicable",
  os: "runtime-host-unknown",
  buildVersion: "pixiedraw2-reference-checkpoint-local",
  condition: "WARM",
  surface: "NODE_RUNTIME",
};

const result = await runReferenceBenchmark({ environment, iterations: 40 });
console.log(JSON.stringify(result, null, 2));
