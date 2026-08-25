import { brotliCompressSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const absolute = (relative) => path.join(root, relative);
const read = (relative) => readFileSync(absolute(relative));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const compression = (value) => ({ gzip: gzipSync(value, { level: 9 }).byteLength, brotli: brotliCompressSync(value).byteLength });
const measured = (relative, minifiedRelative) => {
  const raw = read(relative);
  const minified = minifiedRelative === undefined ? raw : read(minifiedRelative);
  const rawCompression = compression(raw);
  const minCompression = compression(minified);
  return { file: relative, raw: raw.byteLength, minified: minified.byteLength, gzip: rawCompression.gzip, brotli: rawCompression.brotli, minifiedGzip: minCompression.gzip, minifiedBrotli: minCompression.brotli, sha256: digest(raw) };
};

const initial = read("pixiedraw2/dist/draw2-entry.js").toString("utf8");
const market = read("pixiedraw2/dist/wp210-market-core.js").toString("utf8");
for (const token of ["wp210-market-core.js", "wp210-market-rights-core", "createProductProjection"]) if (initial.includes(token)) throw new Error(`Market Core leaked into Initial Editor: ${token}`);
for (const token of ["document", "window", "fetch(", "WebSocket", "supabase", "localStorage", "indexedDB", "market/index.html"]) if (market.toLowerCase().includes(token.toLowerCase())) throw new Error(`WP-210 boundary violation: ${token}`);

const result = {
  schemaVersion: 1,
  workPackage: "WP-210",
  status: "MEASURED_LOCAL_ISOLATED_BUNDLE",
  measurementDefinition: { baseline: "WP-200 same raw/minified/gzip/Brotli definition", sourceMaps: "excluded", initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"], marketOnDemandLazyRequests: ["pixiedraw2/dist/wp210-market-core.js"] },
  baselines: { initialEditorRaw: 158807, workspaceLazyRaw: 20295, audioLazyRaw: 15725, wp160RuntimeRaw: 12649, wp200GameLazyRaw: 45919, wp200RuntimeLazyRaw: 28657 },
  bundles: { initialEditor: measured("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"), wp210MarketLazy: measured("pixiedraw2/dist/wp210-market-core.js", "pixiedraw2/dist/wp210-market-core.min.js"), wp160RuntimeBaseline: measured("pixiedraw2/dist/wp160-runtime-core.js"), wp200GameLazyBaseline: measured("pixiedraw2/dist/wp200-game-core.js"), wp200RuntimeLazyBaseline: measured("pixiedraw2/dist/wp200-runtime-core.js") },
  deltas: { initialEditorRaw: statSync(absolute("pixiedraw2/dist/draw2-entry.js")).size - 158807, wp160RuntimeRaw: statSync(absolute("pixiedraw2/dist/wp160-runtime-core.js")).size - 12649, wp200GameLazyRaw: statSync(absolute("pixiedraw2/dist/wp200-game-core.js")).size - 45919, wp200RuntimeLazyRaw: statSync(absolute("pixiedraw2/dist/wp200-runtime-core.js")).size - 28657 },
  boundaries: { marketOutsideInitial: "PASS_STATIC_BOUNDARY", marketOutsideRuntime: "PASS_STATIC_BOUNDARY", currentRoutesAndData: "OUT_OF_SCOPE_AND_UNTOUCHED" },
  metricScopes: { bundle: "LOCAL_BYTE_AND_COMPRESSION_MEASUREMENT", commerce: "PURE_SYNTHETIC_RECONCILIATION", realCheckout: "UNTESTED" },
  untested: ["real checkout", "provider webhook replay", "live entitlement reconciliation", "real legacy user/project data", "physical devices", "full compositor", "production performance", "Safari", "Firefox", "30-minute memory"],
};
console.log(JSON.stringify(result, null, 2));
