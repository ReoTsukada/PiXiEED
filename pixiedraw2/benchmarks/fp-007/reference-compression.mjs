import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const repoRoot = resolve(new URL("../../../", import.meta.url).pathname);
const manifestPath = "docs/inventory/fp-007-build.json";
const entrySourcePath = "pixiedraw2/src/draw2-entry.ts";
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, manifestPath), "utf8"),
);
const source = readFileSync(resolve(repoRoot, entrySourcePath));

if (manifest.package !== "FP-007") {
  throw new Error(`Unexpected manifest package: ${manifest.package}`);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gzipOptions = { level: 9, mtime: 0 };
const brotliOptions = {
  params: {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_QUALITY]: 11,
    [constants.BROTLI_PARAM_LGWIN]: 22,
    [constants.BROTLI_PARAM_SIZE_HINT]: source.byteLength,
  },
};

function measure() {
  const raw = Buffer.from(source);
  const gzip = gzipSync(raw, gzipOptions);
  const brotli = brotliCompressSync(raw, brotliOptions);
  return {
    inputSha256: sha256(raw),
    raw: { bytes: raw.byteLength, sha256: sha256(raw) },
    gzip: { bytes: gzip.byteLength, sha256: sha256(gzip) },
    brotli: { bytes: brotli.byteLength, sha256: sha256(brotli) },
  };
}

const first = measure();
const second = measure();
const deterministic = JSON.stringify(first) === JSON.stringify(second);

console.log(JSON.stringify(
  {
    documentId: "PIXIEED-FP007-REFERENCE-COMPRESSION-001",
    status: deterministic ? "REFERENCE_MEASURED" : "REFERENCE_NONDETERMINISTIC",
    evidenceLevel: "REFERENCE_ONLY",
    qualification: {
      realDistribution: "UNTESTED",
      provenance: "UNTESTED",
      cleanCheckout: "BLOCKED",
      browser: "UNTESTED",
      device: "UNTESTED",
      production: "UNTESTED",
    },
    input: {
      manifestPath,
      manifestDocumentId: manifest.documentId,
      entrySourcePath,
      normalizationOrder: [
        "resolve fixed repository-relative entry path",
        "read file bytes unchanged",
        "hash raw bytes",
        "gzip raw bytes",
        "Brotli-compress raw bytes",
      ],
      newlineNormalization: "NONE",
      encoding: "UTF-8 source bytes as stored",
    },
    compressionParameters: {
      raw: { transform: "NONE" },
      gzip: { level: 9, mtime: 0 },
      brotli: {
        mode: "TEXT",
        quality: 11,
        lgwin: 22,
        sizeHint: source.byteLength,
      },
    },
    measurements: { first, second },
    determinism: {
      status: deterministic ? "PASS" : "FAIL",
      compared: ["inputSha256", "bytes", "sha256"],
      runs: 2,
    },
    artifactAvailability: {
      minified: {
        path: "pixiedraw2/dist/draw2-entry.min.js",
        status: "PRESENT_NOT_MEASURED",
      },
      sourceMap: {
        path: "pixiedraw2/dist/draw2-entry.js.map",
        status: "NOT_APPLICABLE_NOT_PRESENT",
      },
      distribution: {
        path: "pixiedraw2/dist/draw2-entry.js",
        status: "PRESENT_NOT_QUALIFIED",
      },
    },
    notes: [
      "Isolated/reference compression of the existing FP-007 entry source; no build output was generated.",
      "This result does not qualify real distribution, provenance, clean checkout, Browser, Device, or Production.",
    ],
  },
  null,
  2,
));
