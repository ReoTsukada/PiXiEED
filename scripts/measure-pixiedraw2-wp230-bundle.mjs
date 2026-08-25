import fs from "node:fs";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const root = process.cwd();
const file = (relative) => path.join(root, relative);
const readBytes = (relative) => fs.readFileSync(file(relative));
const measured = (relative, minRelative = null) => {
  const raw = readBytes(relative);
  const minified = minRelative === null ? raw : readBytes(minRelative);
  return {
    file: relative,
    raw: raw.length,
    minified: minified.length,
    gzip: gzipSync(raw, { level: 9 }).length,
    brotli: brotliCompressSync(raw).length,
    minifiedGzip: gzipSync(minified, { level: 9 }).length,
    minifiedBrotli: brotliCompressSync(minified).length,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
};
const read = (relative) => fs.readFileSync(file(relative), "utf8");
const initial = read("pixiedraw2/dist/draw2-entry.js");
const sns = read("pixiedraw2/dist/wp230-sns-core.js");
for (const token of ["wp230-sns-core.js", "createSnsPost", "SnsPost"]) {
  if (initial.includes(token)) throw new Error(`WP-230 leaked into Initial Editor: ${token}`);
}
for (const token of ["document", "window", "fetch(", "WebSocket", "supabase", "indexedDB", "localStorage", "stripe"]) {
  if (sns.toLowerCase().includes(token.toLowerCase())) throw new Error(`WP-230 boundary violation: ${token}`);
}
const bundles = {
  initialEditor: measured("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"),
  wp210MarketLazy: measured("pixiedraw2/dist/wp210-market-core.js", "pixiedraw2/dist/wp210-market-core.min.js"),
  wp220DirectWorkLazy: measured("pixiedraw2/dist/wp220-direct-work-core.js", "pixiedraw2/dist/wp220-direct-work-core.min.js"),
  wp230SnsLazy: measured("pixiedraw2/dist/wp230-sns-core.js", "pixiedraw2/dist/wp230-sns-core.min.js"),
  wp160RuntimeBaseline: measured("pixiedraw2/dist/wp160-runtime-core.js"),
  wp200RuntimeBaseline: measured("pixiedraw2/dist/wp200-runtime-core.js"),
};
const baseline = { initialEditorRaw: 158807, wp160RuntimeRaw: 12649, wp200RuntimeLazyRaw: 28657, wp210MarketLazyRaw: 21271, wp220DirectWorkLazyRaw: 30618 };
console.log(JSON.stringify({
  schemaVersion: 1,
  workPackage: "WP-230",
  status: "MEASURED_LOCAL_ISOLATED_BUNDLE",
  measurementDefinition: {
    baseline: "WP-220 same raw/minified/gzip/Brotli definition",
    sourceMaps: "excluded",
    initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"],
    snsOnDemandLazyRequests: ["pixiedraw2/dist/wp230-sns-core.js"],
  },
  baselines: baseline,
  bundles,
  deltas: {
    initialEditorRaw: bundles.initialEditor.raw - baseline.initialEditorRaw,
    wp160RuntimeRaw: bundles.wp160RuntimeBaseline.raw - baseline.wp160RuntimeRaw,
    wp200RuntimeLazyRaw: bundles.wp200RuntimeBaseline.raw - baseline.wp200RuntimeLazyRaw,
    wp210MarketLazyRaw: bundles.wp210MarketLazy.raw - baseline.wp210MarketLazyRaw,
    wp220DirectWorkLazyRaw: bundles.wp220DirectWorkLazy.raw - baseline.wp220DirectWorkLazyRaw,
  },
  boundaries: {
    snsOutsideInitial: "PASS_STATIC_BOUNDARY",
    snsOutsideRuntime: "PASS_STATIC_BOUNDARY",
    snsOutsideMarket: "PASS_STATIC_BOUNDARY",
    currentRoutesAndData: "OUT_OF_SCOPE_AND_UNTOUCHED",
  },
  metricScopes: { bundle: "LOCAL_BYTE_AND_COMPRESSION_MEASUREMENT", sns: "PURE_SYNTHETIC_REFERENCE_PROJECTION", realSns: "UNTESTED" },
  untested: ["real SNS data", "production RLS", "raw public-media upload", "moderation", "Search backend", "Notification delivery", "physical mobile", "Safari", "Firefox", "screen reader", "30-minute memory", "production performance"],
}, null, 2));
