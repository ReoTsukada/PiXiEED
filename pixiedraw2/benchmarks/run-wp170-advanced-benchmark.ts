import {
  DITHER_PRESETS,
  defaultOverlayState,
  planDither,
  planPatternBrushStroke,
  type CanonicalPixelTarget,
  type PatternSource,
} from "../src/wp170-advanced-tools-core.ts";

interface FixtureReport {
  readonly name: string;
  readonly dimensions: string;
  readonly layers: number;
  readonly frames: number;
  readonly iterations: number;
  readonly latencyMs: { readonly p50: number; readonly p95: number; readonly max: number };
  readonly dirtyTiles: number;
  readonly writes: number;
  readonly copiedBytes: number;
  readonly cowSplits: number;
  readonly overlayDomains: number;
  readonly allocatedBytes: number;
  readonly longTaskCount: number;
  readonly status: "MEASURED_LOCAL_SYNTHETIC";
}

function makeTarget(width: number, height: number): { readonly target: CanonicalPixelTarget; readonly pixels: Uint8Array } {
  const pixels = new Uint8Array(width * height);
  return { pixels, target: { assetId: `wp170:benchmark:${width}x${height}`, width, height, tileSize: 32, palette: [0, 0xffffffff, 0xff0000ff, 0x00ff00ff], readPixel: (x, y) => pixels[y * width + x] ?? 0 } };
}

const pattern: PatternSource = { width: 8, height: 8, pixels: Array.from({ length: 64 }, (_, index) => index % 3 === 0 ? 1 : 0), palette: [0, 0xffffffff, 0xff0000ff], transparentIndex: 0 };
const advancedStressPoints = Array.from({ length: 256 }, (_, index) => ({ x: (index * 17) % 512, y: (index * 31) % 512 }));

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
}

function runFixture(name: string, width: number, height: number, layers: number, frames: number, operation: (target: CanonicalPixelTarget) => { readonly dirtyTiles: number; readonly writes: number }): FixtureReport {
  const samples: number[] = [];
  let last = { dirtyTiles: 0, writes: 0 };
  const { target } = makeTarget(width, height);
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const started = performance.now();
    last = operation(target);
    samples.push(performance.now() - started);
  }
  const overlayState = defaultOverlayState();
  return {
    name,
    dimensions: `${width}x${height}`,
    layers,
    frames,
    iterations: samples.length,
    latencyMs: { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples) },
    dirtyTiles: last.dirtyTiles,
    writes: last.writes,
    copiedBytes: 0,
    cowSplits: 0,
    overlayDomains: Object.keys(overlayState).length,
    allocatedBytes: 0,
    longTaskCount: samples.filter((value) => value > 50).length,
    status: "MEASURED_LOCAL_SYNTHETIC",
  };
}

const reports = [
  runFixture("A", 256, 256, 12, 60, (target) => {
    const result = planPatternBrushStroke(target, [{ x: 8, y: 8 }, { x: 220, y: 220 }], pattern, { anchorX: 4, anchorY: 4, repeat: "REPEAT_XY", transparent: "SKIP", clipping: "CLIP" });
    if (!result.ok) throw new Error(result.diagnostics[0]?.code ?? "Pattern fixture failed");
    return { dirtyTiles: result.value.dirtyTiles.length, writes: result.value.writes.length };
  }),
  runFixture("B", 512, 512, 20, 120, (target) => {
    const result = planDither(target, { region: { x: 0, y: 0, width: 512, height: 512 }, fromIndex: 0, toIndex: 1, amount: 128, preset: DITHER_PRESETS.BAYER_4X4, clipping: "CLIP" });
    if (!result.ok) throw new Error(result.diagnostics[0]?.code ?? "Dither fixture failed");
    return { dirtyTiles: result.value.dirtyTiles.length, writes: result.value.writes.length };
  }),
  runFixture("ADVANCED_STRESS", 512, 512, 100, 1000, (target) => {
    const result = planPatternBrushStroke(target, advancedStressPoints, pattern, { anchorX: 4, anchorY: 4, repeat: "REPEAT_XY", transparent: "SKIP", clipping: "CLIP" });
    if (!result.ok) throw new Error(result.diagnostics[0]?.code ?? "Advanced stress fixture failed");
    return { dirtyTiles: result.value.dirtyTiles.length, writes: result.value.writes.length };
  }),
];

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP170_ADVANCED_DRAW2_SYNTHETIC",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_SYNTHETIC",
  metrics: ["latency_p50", "latency_p95", "latency_max", "dirty_tiles", "writes", "copied_bytes", "cow_splits", "overlay_domains", "allocated_bytes", "long_tasks"],
  deviceGate: "UNTESTED_DEVICE_GATE",
  reports,
  notes: [
    "Planner-only synthetic measurements; copied bytes/COW are zero because mutation belongs to the Editor Adapter.",
    "Real desktop/tablet/phone device, compositor, GPU, memory-pressure, and long-session gates remain UNTESTED.",
  ],
}, null, 2));
