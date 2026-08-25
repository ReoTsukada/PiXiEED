/// <reference lib="dom" />

import {
  runReferenceBenchmark,
  type BenchmarkEnvironment,
  type LongTaskSnapshot,
} from "./draw2-reference-benchmark.ts";

const runButton = document.querySelector<HTMLButtonElement>("#runReferenceCheckpoint");
const statusElement = document.querySelector<HTMLElement>("#referenceStatus");
const outputElement = document.querySelector<HTMLElement>("#referenceOutput");
const canvas512 = document.querySelector<HTMLCanvasElement>("#referenceCanvas512");
const canvas256 = document.querySelector<HTMLCanvasElement>("#referenceCanvas256");

if (runButton === null || statusElement === null || outputElement === null || canvas512 === null || canvas256 === null) {
  throw new Error("Reference benchmark entry is missing a required element.");
}
const runControl = runButton;
const status = statusElement;
const output = outputElement;
const benchmarkCanvas512 = canvas512;
const benchmarkCanvas256 = canvas256;

const canvases = new Map<number, HTMLCanvasElement>([[512, benchmarkCanvas512], [256, benchmarkCanvas256]]);
const contexts = new Map<number, CanvasRenderingContext2D>();
for (const [size, canvas] of canvases) {
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) throw new Error(`Reference benchmark could not acquire Canvas2D ${size}.`);
  contexts.set(size, context);
}

function environment(): BenchmarkEnvironment {
  const userAgent = navigator.userAgent;
  const browser = /Firefox\//.test(userAgent) ? "FIREFOX" : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) ? "SAFARI" : /Chrome\//.test(userAgent) ? "CHROMIUM" : "OTHER";
  const versionMatch = userAgent.match(/(?:Chrome|Firefox|Version)\/([\d.]+)/);
  return {
    deviceClass: "browser-host-unknown",
    actualDevice: "Codex In-app Browser host; device model unavailable",
    browser,
    browserVersion: versionMatch?.[1] ?? "unknown",
    os: navigator.platform || "unknown",
    buildVersion: "pixiedraw2-reference-checkpoint-local",
    condition: "WARM",
    surface: "ACTUAL_BROWSER",
  };
}

function collectLongTasks(): { snapshot: LongTaskSnapshot; disconnect: () => void } {
  const entries: PerformanceEntry[] = [];
  if (!("PerformanceObserver" in window)) {
    return {
      snapshot: { available: false, count: 0, totalMs: 0, maxMs: 0, note: "PerformanceObserver unavailable." },
      disconnect: () => {},
    };
  }
  const observer = new PerformanceObserver((list) => entries.push(...list.getEntries()));
  try {
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    return {
      snapshot: { available: false, count: 0, totalMs: 0, maxMs: 0, note: "Long Task entry type unavailable." },
      disconnect: () => observer.disconnect(),
    };
  }
  return {
    snapshot: { available: true, count: 0, totalMs: 0, maxMs: 0 },
    disconnect: () => observer.disconnect(),
  };
}

function longTaskSnapshot(entriesBefore: PerformanceEntry[], available: boolean): LongTaskSnapshot {
  const entries = entriesBefore.filter((entry) => entry.entryType === "longtask");
  const totalMs = entries.reduce((total, entry) => total + entry.duration, 0);
  return { available, count: entries.length, totalMs, maxMs: Math.max(0, ...entries.map((entry) => entry.duration)) };
}

async function present(state: Parameters<NonNullable<Parameters<typeof runReferenceBenchmark>[0]["present"]>>[0], assetId: string, regions: Parameters<NonNullable<Parameters<typeof runReferenceBenchmark>[0]["present"]>>[2]): Promise<void> {
  const asset = state.assets[assetId];
  if (asset === undefined) throw new Error("Reference benchmark asset is missing.");
  const canvas = canvases.get(asset.width);
  const context = contexts.get(asset.width);
  if (canvas === undefined || context === undefined) throw new Error(`Reference benchmark canvas ${asset.width} is missing.`);
  for (const region of regions) {
    const snapshot = asset.raster.readRegion(region.x, region.y, region.width, region.height);
    const image = context.createImageData(region.width, region.height);
    for (let index = 0; index < snapshot.pixels.length; index += 1) {
      const color = asset.palette[snapshot.pixels[index] ?? 0] ?? 0;
      const target = index * 4;
      image.data[target] = (color >>> 24) & 0xff;
      image.data[target + 1] = (color >>> 16) & 0xff;
      image.data[target + 2] = (color >>> 8) & 0xff;
      image.data[target + 3] = color & 0xff;
    }
    context.putImageData(image, region.x, region.y);
  }
}

async function run(): Promise<void> {
  runControl.disabled = true;
  status.textContent = "Measuring isolated Reference Path…";
  output.textContent = "";
  const longTaskState = collectLongTasks();
  const beforeEntries = performance.getEntriesByType("longtask");
  try {
    const result = await runReferenceBenchmark({
      environment: environment(),
      iterations: 40,
      present,
      longTasks: longTaskState.snapshot,
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const resources = performance.getEntriesByType("resource").map((entry) => ({ name: entry.name, duration: entry.duration, transferSize: (entry as PerformanceResourceTiming).transferSize }));
    const resultPayload = {
      ...result,
      browserEvidence: {
        viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
        userAgent: navigator.userAgent,
        resourceRequests: resources,
        longTasks: longTaskSnapshot([...beforeEntries, ...performance.getEntriesByType("longtask")], true),
      },
    };
    window.__pixieedDraw2ReferenceCheckpoint = resultPayload;
    output.textContent = JSON.stringify(resultPayload, null, 2);
    status.textContent = "Measured. Formal p95/device gates remain UNTESTED.";
  } finally {
    longTaskState.disconnect();
    runControl.disabled = false;
  }
}

declare global {
  interface Window {
    __pixieedDraw2ReferenceCheckpoint?: unknown;
  }
}

runControl.addEventListener("click", () => { void run(); });
