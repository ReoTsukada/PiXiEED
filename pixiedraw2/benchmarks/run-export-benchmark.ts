import { EditorCore, createProject, sha256Hex } from "../src/draw2-core.ts";
import { exportPng, exportPxd, importPxdPackage } from "../src/draw2-export.ts";

const state = createProject({ projectId: "wp140-export-benchmark", name: "WP-140 Export Benchmark", width: 64, height: 64, tileSize: 32 });
const result = await new EditorCore(state).execute({
  commandId: "wp140-benchmark-stroke",
  commandType: "raster.strokeCommit",
  schemaVersion: 1,
  projectId: state.projectId,
  assetId: state.activeAssetId,
  actorId: "wp140-benchmark",
  clientId: "wp140-benchmark",
  clientSequence: 1,
  baseStructureEpoch: state.structureEpoch,
  createdAtMonotonicMs: 1,
  payload: { points: [{ x: 1, y: 1 }, { x: 32, y: 32 }, { x: 62, y: 10 }], colorIndex: 1 },
});
if (!result.ok) throw new Error("benchmark fixture command failed");

const started = performance.now();
const png = await exportPng(result.state);
const pngMs = performance.now() - started;
const pxdStarted = performance.now();
const pxd = await exportPxd(result.state);
const pxdMs = performance.now() - pxdStarted;
const importStarted = performance.now();
const imported = await importPxdPackage(pxd.bytes, { expectedPackageHash: pxd.packageHash });
const importMs = performance.now() - importStarted;
const sourcePixels = result.state.assets[result.state.activeAssetId]?.raster.toUint8Array();
const importedPixels = imported.state.assets[imported.state.activeAssetId]?.raster.toUint8Array();
const sourceCanonicalPixelHash = await sha256Hex(sourcePixels);
const importedCanonicalPixelHash = await sha256Hex(importedPixels);
const roundTrip = imported.state.projectId === result.state.projectId && sourceCanonicalPixelHash === importedCanonicalPixelHash;
if (!roundTrip) throw new Error("PXD benchmark round-trip changed project identity or indexed raster hash");
if (png.pixelHash !== pxd.manifest.assets[0]?.sha256) throw new Error("PNG/PXD indexed raster hash mismatch");

console.log(JSON.stringify({
  benchmark: "wp140-export-reference",
  status: "MEASURED_LOCAL_SYNTHETIC_REFERENCE",
  fixture: "64x64 indexed raster / one diagonal stroke",
  png: { bytes: png.bytes.byteLength, ms: Number(pngMs.toFixed(3)), indexedPixelHash: png.pixelHash },
  pxd: { bytes: pxd.bytes.byteLength, ms: Number(pxdMs.toFixed(3)), packageHash: pxd.packageHash, manifestHash: pxd.manifestHash, indexedPixelHash: pxd.manifest.assets[0]?.sha256 },
  import: { ms: Number(importMs.toFixed(3)), canonicalPixelHash: importedCanonicalPixelHash, sourceCanonicalPixelHash, roundTrip },
  deviceGate: "UNTESTED",
}, null, 2));
