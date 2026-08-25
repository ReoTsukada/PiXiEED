import { createProject } from "../../src/draw2-core.ts";
import { exportDraw2Png, exportDraw2Pxd } from "../../src/draw2/draw-140/export-contract.ts";

const state = createProject({ projectId: "draw-140-benchmark", width: 64, height: 64 });
const started = performance.now();
const png = await exportDraw2Png(state);
const pxd = await exportDraw2Pxd(state);
console.log(JSON.stringify({ packageId: "DRAW-140", fixture: "64x64-empty", pngBytes: png.bytes.byteLength, pxdBytes: pxd.bytes.byteLength, elapsedMs: performance.now() - started }));
