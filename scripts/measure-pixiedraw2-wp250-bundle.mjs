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
const lazy = read("pixiedraw2/dist/wp250-policy-economics-core.js").toString("utf8");
for (const token of ["wp250-policy-economics-core.js", "resolveWp250ConsentPolicy"]) if (initial.includes(token)) throw new Error(`WP-250 leaked into Initial Editor: ${token}`);
for (const token of ["document", "window", "fetch(", "supabase", "indexeddb", "localstorage", "stripe"]) if (lazy.toLowerCase().includes(token)) throw new Error(`WP-250 boundary violation: ${token}`);
console.log(JSON.stringify({
  schemaVersion: 1,
  workPackage: "WP-250",
  status: "MEASURED_LOCAL_ISOLATED_BUNDLE",
  measurementDefinition: { sourceMaps: "excluded", initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"], wp250OnDemandLazyRequests: ["pixiedraw2/dist/wp250-policy-economics-core.js"] },
  bundles: { initialEditor: measure("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"), wp240LazyBaseline: measure("pixiedraw2/dist/wp240-admin-analytics-ads-core.js", "pixiedraw2/dist/wp240-admin-analytics-ads-core.min.js"), wp250Lazy: measure("pixiedraw2/dist/wp250-policy-economics-core.js", "pixiedraw2/dist/wp250-policy-economics-core.min.js") },
  boundaries: { outsideInitial: "PASS_STATIC_BOUNDARY", outsideRuntime: "PASS_STATIC_BOUNDARY", currentRoutesAndData: "OUT_OF_SCOPE_AND_UNTOUCHED" },
  metricScopes: { bundle: "LOCAL_BYTE_AND_COMPRESSION_MEASUREMENT", core: "PURE_SYNTHETIC_REFERENCE_PROJECTION", realPolicy: "UNTESTED", productionFinance: "UNTESTED" },
  untested: ["real consent/region/age authority", "real ad provider delivery", "real Analytics transport", "real Admin authorization", "moderation console/workflow", "Ledger/Payout reconciliation", "browser/device performance", "production performance"],
}, null, 2));
