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
const directWork = read("pixiedraw2/dist/wp220-direct-work-core.js").toString("utf8");
for (const token of ["wp220-direct-work-core.js", "wp220-direct-work-core", "createDirectWorkPayment"]) if (initial.includes(token)) throw new Error(`Direct Work leaked into Initial Editor: ${token}`);
for (const token of ["document", "window", "fetch(", "WebSocket", "supabase", "localStorage", "indexedDB", "market/index.html", "stripe"]) if (directWork.toLowerCase().includes(token.toLowerCase())) throw new Error(`WP-220 boundary violation: ${token}`);

const result = {
  schemaVersion: 1,
  workPackage: "WP-220",
  status: "MEASURED_LOCAL_ISOLATED_BUNDLE",
  measurementDefinition: { baseline: "WP-210 same raw/minified/gzip/Brotli definition", sourceMaps: "excluded", initialRequests: ["pixiedraw2/assets/draw2-shell.css", "pixiedraw2/dist/draw2-entry.js"], directWorkOnDemandLazyRequests: ["pixiedraw2/dist/wp220-direct-work-core.js"] },
  baselines: { initialEditorRaw: 158807, wp160RuntimeRaw: 12649, wp200RuntimeLazyRaw: 28657, wp210MarketLazyRaw: 21271 },
  bundles: { initialEditor: measured("pixiedraw2/dist/draw2-entry.js", "pixiedraw2/dist/draw2-entry.min.js"), wp210MarketLazy: measured("pixiedraw2/dist/wp210-market-core.js", "pixiedraw2/dist/wp210-market-core.min.js"), wp220DirectWorkLazy: measured("pixiedraw2/dist/wp220-direct-work-core.js", "pixiedraw2/dist/wp220-direct-work-core.min.js"), wp160RuntimeBaseline: measured("pixiedraw2/dist/wp160-runtime-core.js"), wp200RuntimeBaseline: measured("pixiedraw2/dist/wp200-runtime-core.js") },
  deltas: { initialEditorRaw: statSync(absolute("pixiedraw2/dist/draw2-entry.js")).size - 158807, wp160RuntimeRaw: statSync(absolute("pixiedraw2/dist/wp160-runtime-core.js")).size - 12649, wp200RuntimeLazyRaw: statSync(absolute("pixiedraw2/dist/wp200-runtime-core.js")).size - 28657, wp210MarketLazyRaw: statSync(absolute("pixiedraw2/dist/wp210-market-core.js")).size - 21271 },
  boundaries: { directWorkOutsideInitial: "PASS_STATIC_BOUNDARY", directWorkOutsideRuntime: "PASS_STATIC_BOUNDARY", currentRoutesAndData: "OUT_OF_SCOPE_AND_UNTOUCHED" },
  metricScopes: { bundle: "LOCAL_BYTE_AND_COMPRESSION_MEASUREMENT", directWork: "PURE_SYNTHETIC_STATE_AND_PAYMENT_RECONCILIATION", realCheckout: "UNTESTED" },
  untested: ["real checkout", "provider webhook signature/replay", "production rights reconciliation", "real legacy commerce data", "payout execution", "physical mobile", "Safari", "Firefox", "screen reader", "30-minute memory", "production performance"],
};
console.log(JSON.stringify(result, null, 2));
