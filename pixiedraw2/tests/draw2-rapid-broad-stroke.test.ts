import {
  EditorCore,
  InMemoryLocalJournal,
  LocalAutosaveCoordinator,
  ReferenceRenderer,
  createProject,
  type EditorCommand,
} from "../src/draw2-core.ts";

function rapidStroke(
  projectId: string,
  assetId: string,
  pass: number,
  row: number,
  colorIndex: number,
): EditorCommand {
  const sequence = pass * 256 + row + 1;
  return {
    commandId: `rapid-broad-${pass}-${row}`,
    commandType: "raster.writeSet",
    schemaVersion: 1,
    projectId,
    assetId,
    actorId: "rapid-broad-test-actor",
    clientId: "rapid-broad-test-client",
    clientSequence: sequence,
    baseStructureEpoch: 1,
    createdAtMonotonicMs: sequence,
    payload: {
      writes: Array.from({ length: 256 }, (_, x) => ({
        x,
        y: row,
        colorIndex,
      })),
      sourceOperationType: "rapid-broad-stroke",
    },
  };
}

Deno.test("rapid broad strokes remain canonical, durable, and fully renderable", async () => {
  const initial = createProject({
    projectId: "project-rapid-broad-stroke",
    width: 256,
    height: 256,
    tileSize: 32,
  });
  const journal = new InMemoryLocalJournal();
  const autosave = new LocalAutosaveCoordinator(journal, 32);
  let state = initial;

  for (let pass = 0; pass < 4; pass += 1) {
    const colorIndex = pass % 2 === 0 ? 1 : 2;
    for (let row = 0; row < 256; row += 1) {
      const result = await new EditorCore(state).execute(
        rapidStroke(state.projectId, state.activeAssetId, pass, row, colorIndex),
      );
      if (!result.ok) {
        throw new Error(
          `rapid stroke failed at pass=${pass}, row=${row}: ${result.diagnostics.map((item) => item.code).join(",")}`,
        );
      }
      state = result.state;
      await autosave.record(state, result.result);
    }
  }

  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("rapid stroke asset disappeared");
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      if (asset.raster.getPixel(x, y) !== 2) {
        throw new Error(`final raster mismatch at ${x},${y}`);
      }
    }
  }

  const memory = asset.raster.memoryMetrics();
  if (
    memory.tileCount !== 64 ||
    memory.allocatedTileBytes !== 64 * 32 * 32 ||
    journal.operations.length !== 1024 ||
    journal.checkpoints.length !== 32 ||
    state.appliedCommandIds.length !== 1024
  ) {
    throw new Error(
      `rapid stroke durability metrics diverged: ${JSON.stringify({
        memory,
        operations: journal.operations.length,
        checkpoints: journal.checkpoints.length,
        appliedCommands: state.appliedCommandIds.length,
      })}`,
    );
  }

  const rendered = await new ReferenceRenderer().render({
    state,
    assetId: state.activeAssetId,
    dirtyTiles: [],
    mode: "FULL_REFRESH_GOLDEN",
  });
  if (
    !rendered.fullRefresh ||
    rendered.preparationPixelCount !== 256 * 256 ||
    rendered.presentPixelCount !== 256 * 256 ||
    rendered.canonicalPixelHash === undefined
  ) {
    throw new Error(
      `rapid stroke full render metrics diverged: ${JSON.stringify(rendered)}`,
    );
  }
});
