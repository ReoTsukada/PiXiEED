import fs from "node:fs";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative));
const measure = (file, minified) => {
  const raw = read(file);
  const min = read(minified);
  return {
    file,
    raw: raw.length,
    minified: min.length,
    gzip: gzipSync(raw, { level: 9 }).length,
    brotli: brotliCompressSync(raw).length,
    minifiedGzip: gzipSync(min, { level: 9 }).length,
    minifiedBrotli: brotliCompressSync(min).length,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
};
const initial = read("pixiedraw2/dist/draw2-entry.js").toString("utf8");
const core = read("pixiedraw2/dist/wp240-admin-analytics-ads-core.js").toString("utf8");
for (const token of ["wp240-admin-analytics-ads-core.js", "resolveWp240AdminProjection"]) if (initial.includes(token)) throw new Error(`WP-240 leaked into Initial Editor: ${token}`);
for (const token of ["document", "window", "fetch(", "supabase", "indexeddb", "localstorage", "stripe"]) if (core.toLowerCase().includes(token)) throw new Error(`WP-240 boundary violation: ${token}`);
console.log(JSON.stringify({
  schemaVersion: 1,
  workPackage: "WP-240",
  status: "MEASURED_LOCAL_ISOLATED_BUNDLE",
  measurementDefinition: { sourceMaps: "excluded", initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"], wp240OnDemandLazyRequests: ["pixiedraw2/dist/wp240-admin-analytics-ads-core.js"] },
  bundles: { initialEditor: measure("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"), wp240Lazy: measure("pixiedraw2/dist/wp240-admin-analytics-ads-core.js", "pixiedraw2/dist/wp240-admin-analytics-ads-core.min.js") },
  boundaries: { outsideInitial: "PASS_STATIC_BOUNDARY", outsideRuntime: "PASS_STATIC_BOUNDARY", currentRoutesAndData: "OUT_OF_SCOPE_AND_UNTOUCHED" },
  metricScopes: { bundle: "LOCAL_BYTE_AND_COMPRESSION_MEASUREMENT", core: "PURE_SYNTHETIC_REFERENCE_PROJECTION", realAdmin: "UNTESTED", productionFinance: "UNTESTED" },
  untested: ["real Admin RLS/RPC", "real Analytics pipeline", "ad provider delivery", "moderation console", "financial reconciliation", "browser/device performance", "production performance"],
}, null, 2));
