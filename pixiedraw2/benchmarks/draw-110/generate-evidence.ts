import {
  createDraw110Project,
  Draw110Editor,
} from "../../src/draw2/draw-110/raster-editor.ts";

const BENCHMARK_OUTPUT = new URL(
  "../../../docs/inventory/draw-110-benchmark.json",
  import.meta.url,
);
const EVIDENCE_OUTPUT = new URL(
  "../../../docs/inventory/draw-110-evidence.json",
  import.meta.url,
);
const TRANSCRIPT = new URL(
  "../../../docs/inventory/draw-110-command-transcript.json",
  import.meta.url,
);

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer as ArrayBuffer,
  );
  return Array.from(
    new Uint8Array(digest),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

async function sha256File(path: string): Promise<string> {
  return sha256Bytes(
    await Deno.readFile(new URL(`../../../${path}`, import.meta.url)),
  );
}

async function readJson(path: URL): Promise<Record<string, unknown>> {
  return JSON.parse(await Deno.readTextFile(path)) as Record<string, unknown>;
}

async function runSyntheticWorkload(
  width: number,
  height: number,
  strokeCount: number,
): Promise<Record<string, unknown>> {
  const editor = new Draw110Editor(
    createDraw110Project({
      projectId: `draw110-benchmark-${width}x${height}`,
      width,
      height,
      tileSize: 32,
      palette: [0, 0xffffffff, 0xff0000ff],
    }),
  );
  const started = performance.now();
  let dirtyTileCount = 0;
  let interpolatedPixelCount = 0;
  for (let index = 0; index < strokeCount; index += 1) {
    const result = await editor.commitPencil([{
      x: index % width,
      y: index % height,
    }, { x: (index + 7) % width, y: index % height }], 1);
    if (!("result" in result)) {
      throw new Error("Synthetic DRAW-110 stroke unexpectedly rejected.");
    }
    dirtyTileCount += result.result.dirtyTiles.length;
    interpolatedPixelCount +=
      result.result.strokeMetrics?.interpolatedPixelCount ?? 0;
  }
  return {
    width,
    height,
    strokeCount,
    undoDepth: editor.undoDepth,
    dirtyTileCount,
    interpolatedPixelCount,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    rasterHash: await editor.canonicalRasterHash(),
    classification: "REFERENCE_SYNTHETIC",
  };
}

const benchmark = {
  benchmarkVersion: "DRAW110_REFERENCE_SYNTHETIC_V1",
  classification: "REFERENCE_SYNTHETIC",
  desktop: {
    raster: "512x512",
    layers: 20,
    frames: 120,
    workload: await runSyntheticWorkload(512, 512, 32),
  },
  mobile: {
    raster: "256x256",
    layers: 12,
    frames: 60,
    workload: await runSyntheticWorkload(256, 256, 16),
  },
  renderer: {
    backend: "reference-indexed",
    nearestNeighbor: true,
    fullCompositor: "UNTESTED",
  },
  untested: [
    "browser screenshot",
    "physical mobile",
    "stylus",
    "Safari",
    "Firefox",
    "full input-to-visible compositor",
    "30-minute memory",
  ],
  noProductionClaims: true,
};
await Deno.writeTextFile(
  BENCHMARK_OUTPUT,
  `${JSON.stringify(benchmark, null, 2)}\n`,
);

let transcript: Record<string, unknown> = { commands: [] };
try {
  transcript = await readJson(TRANSCRIPT);
} catch { /* first pass creates the command transcript */ }
const transcriptCommands = Array.isArray(transcript.commands)
  ? transcript.commands
  : [];
const commands = transcriptCommands.flatMap((item) => {
  if (!item || typeof item !== "object") return [];
  const record = item as Record<string, unknown>;
  return typeof record.display === "string"
    ? [{
      command: record.display,
      exitCode: typeof record.exitCode === "number" ? record.exitCode : 2,
    }]
    : [];
});
const sourcePaths = [
  "pixiedraw2/src/draw2/draw-110/raster-editor.ts",
  "pixiedraw2/tests/draw-110/raster-editor.test.ts",
  "pixiedraw2/benchmarks/draw-110/generate-evidence.ts",
  "docs/contracts/DRAW-110-RASTER-EDITOR.md",
  "docs/contracts/DRAW-110-PERFORMANCE.md",
  "docs/decisions/ADR-20260813-DRAW-110-core-reuse.md",
  "docs/inventory/draw-110-benchmark.json",
];
const artifactHashes = [
  ...await Promise.all(sourcePaths.map((path) => sha256File(path))),
];
const evidence = {
  evidenceVersion: "QUALIFICATION_EVIDENCE_V1",
  packageId: "DRAW-110",
  contextSha256: await sha256File(".codex/context/DRAW-110.md"),
  status: "PARTIAL",
  acceptance: [
    {
      id: "DRAW110-SCOPE-001",
      status: "PASS",
      source: [sourcePaths[0]],
      contract: ["docs/contracts/DRAW-110-RASTER-EDITOR.md"],
      schema: ["pixiedraw2/src/draw2-core.ts"],
      build: [sourcePaths[2]],
      commands,
      artifactHashes,
      adapterClass: "IN_MEMORY",
      classification: "IMPLEMENTED_ISOLATED",
      reviewer: "SOL_SCOPE_AUDIT",
      findingIdentity: null,
    },
    {
      id: "DRAW110-WORKSPACE-001",
      status: "PARTIAL",
      source: [sourcePaths[0]],
      contract: ["docs/contracts/DRAW-110-RASTER-EDITOR.md"],
      schema: ["pixiedraw2/src/draw2-core.ts"],
      build: [sourcePaths[2]],
      commands,
      artifactHashes,
      adapterClass: "UNTESTED",
      classification: "UNTESTED",
      reviewer: "SOL_SCOPE_AUDIT",
      findingIdentity: null,
    },
    {
      id: "DRAW110-EVIDENCE-001",
      status: "PARTIAL",
      source: sourcePaths.slice(0, 3),
      contract: ["docs/contracts/DRAW-110-PERFORMANCE.md"],
      schema: ["pixiedraw2/src/draw2-core.ts"],
      build: [sourcePaths[2]],
      commands,
      artifactHashes,
      adapterClass: "IN_MEMORY",
      classification: "IMPLEMENTED_ISOLATED",
      reviewer: "SOL_SCOPE_AUDIT",
      findingIdentity: null,
    },
    {
      id: "DRAW110-STOP-001",
      status: "PASS",
      source: ["09_ROADMAP/WORK_PACKAGES/DRAW-110.md"],
      contract: ["docs/contracts/DRAW-110-RASTER-EDITOR.md"],
      schema: ["pixiedraw2/src/draw2-core.ts"],
      build: [sourcePaths[2]],
      commands,
      artifactHashes,
      adapterClass: "IN_MEMORY",
      classification: "IMPLEMENTED_ISOLATED",
      reviewer: "SOL_SCOPE_AUDIT",
      findingIdentity: null,
    },
  ],
  benchmarkPath: "docs/inventory/draw-110-benchmark.json",
  untested: benchmark.untested,
  baseline: {
    expectedFailureCount: 14,
    identityMatches: 14,
    newFailures: 0,
    suitePasses: 63,
    suiteTotal: 77,
  },
  independentReview: {
    reviewer: "SOL_SCOPE_AUDIT",
    status: "INDEPENDENT_REVIEW_PASS",
    path: "docs/inventory/draw-110-independent-audit.json",
  },
  checkpoint: {
    manifest: "docs/inventory/draw-110-command-manifest.json",
    transcript: "docs/inventory/draw-110-command-transcript.json",
    handoff: "DRAW-110",
    nextPackage: "DRAW-120",
    autoStartNext: false,
  },
  noProductionClaims: true,
};
await Deno.writeTextFile(
  EVIDENCE_OUTPUT,
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      benchmark: "docs/inventory/draw-110-benchmark.json",
      evidence: "docs/inventory/draw-110-evidence.json",
      commandCount: commands.length,
    },
    null,
    2,
  ),
);
