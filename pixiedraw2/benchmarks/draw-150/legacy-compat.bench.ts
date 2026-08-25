import { inspectPxd } from "../../src/draw2-legacy-compat.ts";
const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const started = performance.now();
const result = await inspectPxd(bytes);
console.log(JSON.stringify({ packageId: "DRAW-150", fixture: "malformed-legacy-signature", status: result.status, elapsedMs: performance.now() - started }));
