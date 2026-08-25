import {
  AnimationTagStore,
  BrushPresetStore,
  buildPaletteRamp,
  comparePixelRevisions,
  createLinkedCelBinding,
  createSelectionMask,
  DrawAudioReferenceStore,
  GuideStore,
  MacroRecorder,
  nineSliceRegions,
  normalizeDraw2TimelineMetadata,
  packAtlas,
  PaletteManager,
  pixelPerfectCurve,
  pixelPerfectLine,
  placeTile,
  radialSymmetryPoints,
  replacePaletteColors,
  resolveLinkedCel,
  searchCommandPalette,
  selectionBorder,
  selectionExpand,
  selectionInvert,
  selectionShrink,
  TileMapStore,
  TimelineMarkerStore,
  transformSelectionPixels,
  validateAnimationTag,
  validateSlice,
} from "../src/draw2-creator-features.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("creator P0 brush presets normalize and round-trip all editing attributes", () => {
  const store = new BrushPresetStore();
  const saved = store.save({
    id: "preset:ink",
    name: "  Ink  ",
    brushSize: 99,
    brushShape: "circle",
    pattern: "dots",
    dither: "BAYER_4X4",
    colorIndex: 4,
    opacity: 0.5,
  });
  assert(
    saved.name === "Ink" && saved.brushSize === 64 && saved.opacity === 0.5,
    "brush preset normalization lost a field",
  );
  assert(
    store.load("preset:ink")?.dither === "BAYER_4X4",
    "brush preset did not preserve dither",
  );
  assert(
    store.list().length === 1 && store.remove("preset:ink") &&
      store.list().length === 0,
    "brush preset lifecycle is not deterministic",
  );
});

Deno.test("creator P0 pixel-perfect line and curve contain endpoints without duplicates", () => {
  const line = pixelPerfectLine({ x: 0, y: 0 }, { x: 7, y: 3 });
  assert(
    line[0]?.x === 0 && line[0]?.y === 0 && line.at(-1)?.x === 7 &&
      line.at(-1)?.y === 3,
    "pixel-perfect line lost an endpoint",
  );
  assert(
    new Set(line.map((point) => `${point.x}:${point.y}`)).size === line.length,
    "pixel-perfect line contains duplicate pixels",
  );
  const curve = pixelPerfectCurve({ x: 0, y: 0 }, { x: 4, y: 8 }, {
    x: 8,
    y: 0,
  });
  assert(
    curve.length > line.length && curve.some((point) => point.y >= 3),
    "pixel-perfect curve did not follow its control point",
  );
});

Deno.test("creator P0 selection morphology supports expand, shrink, invert, and border", () => {
  const mask = createSelectionMask(5, 5, [{ x: 2, y: 2 }]);
  assert(
    selectionExpand(mask).selected.filter(Boolean).length === 5,
    "selection expand should use a four-neighbor radius",
  );
  const block = createSelectionMask(5, 5, [{ x: 1, y: 1 }, { x: 2, y: 1 }, {
    x: 1,
    y: 2,
  }, { x: 2, y: 2 }]);
  assert(
    selectionShrink(block).selected.filter(Boolean).length === 0,
    "selection shrink did not remove the one-pixel boundary",
  );
  assert(
    selectionInvert(mask).selected.filter(Boolean).length === 24,
    "selection invert changed the wrong number of pixels",
  );
  assert(
    selectionBorder(mask).selected.filter(Boolean).length > 1,
    "selection border did not produce a boundary",
  );
});

Deno.test("creator P0 transform gizmo applies nearest-neighbor and orientation operations", () => {
  const points = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
  const flipped = transformSelectionPixels(points, {
    operation: "FLIP_HORIZONTAL",
    bounds: { x: 1, y: 1, width: 2, height: 1 },
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  });
  assert(
    flipped.some((point) => point.x === 2) &&
      flipped.some((point) => point.x === 1),
    "flip gizmo did not preserve the selection footprint",
  );
  const scaled = transformSelectionPixels([{ x: 1, y: 1 }], {
    operation: "SCALE_NEAREST",
    bounds: { x: 1, y: 1, width: 1, height: 1 },
    scaleX: 2,
    scaleY: 2,
    offsetX: 0,
    offsetY: 0,
  });
  assert(
    scaled.length === 4 &&
      scaled.every((point) =>
        point.x >= 1 && point.x <= 2 && point.y >= 1 && point.y <= 2
      ),
    "nearest transform did not replicate the source pixel footprint",
  );
});

Deno.test("creator P0 animation tags and linked cels reject invalid ranges and cycles", () => {
  const tags = new AnimationTagStore();
  assert(
    tags.upsert({
      id: "tag:walk",
      name: "Walk",
      fromFrameIndex: 1,
      toFrameIndex: 3,
      loop: true,
    }, 4).name === "Walk",
    "valid animation tag was rejected",
  );
  assert(
    validateAnimationTag({
      id: "tag:bad",
      name: "Bad",
      fromFrameIndex: 3,
      toFrameIndex: 4,
      loop: false,
    }, 4).includes("TAG_FRAME_RANGE_INVALID"),
    "invalid animation tag range was accepted",
  );
  const link = createLinkedCelBinding("cel:2", "cel:1");
  assert(
    resolveLinkedCel("cel:2", [link]) === "cel:1",
    "linked cel did not resolve to source",
  );
  let cycleRejected = false;
  try {
    resolveLinkedCel("cel:1", [{
      celId: "cel:1",
      sourceCelId: "cel:2",
      mode: "LINKED",
    }, { celId: "cel:2", sourceCelId: "cel:1", mode: "LINKED" }]);
  } catch {
    cycleRejected = true;
  }
  assert(cycleRejected, "linked cel cycle was not rejected");
});

Deno.test("creator P1 palette, tile, atlas, and nine-slice contracts are deterministic", () => {
  const ramp = buildPaletteRamp(0x000000ff, 0xffffffff, 3);
  assert(
    ramp.length === 3 && ramp[1] === 0x808080ff,
    "palette ramp is not deterministic",
  );
  assert(
    replacePaletteColors([0, 0x010203ff, 0x040506ff], { 1: 0xaabbccff })[1] ===
      0xaabbccff,
    "palette replacement changed the wrong entry",
  );
  assert(
    placeTile(
      { id: "tiles:main", tileWidth: 16, tileHeight: 16, tileCount: 4 },
      { x: 2, y: 3, tileIndex: 1 },
    ).tileIndex === 1,
    "tile placement contract rejected a valid tile",
  );
  const atlas = packAtlas([{ id: "b", width: 4, height: 4 }, {
    id: "a",
    width: 8,
    height: 2,
  }], { maxWidth: 32, padding: 2, extrude: 1 });
  assert(
    atlas.sprites[0]?.id === "a" && atlas.width <= 32,
    "atlas packing is not stable or bounded",
  );
  const slice = {
    id: "slice:panel",
    name: "Panel",
    x: 0,
    y: 0,
    width: 16,
    height: 16,
  };
  assert(
    validateSlice(slice, { width: 32, height: 32 }).length === 0 &&
      nineSliceRegions(slice, { left: 2, top: 2, right: 2, bottom: 2 }).center
          .width === 12,
    "nine-slice regions are incorrect",
  );
});

Deno.test("creator P1 guides/reference symmetry and P2 macro/palette/revision/markers remain pure", () => {
  const palette = new PaletteManager();
  palette.setGroup({
    id: "group:skin",
    name: "Skin",
    colorIndices: [3, 1, 3, 999],
  });
  palette.recordHistory(0x123456ff, 1);
  assert(
    palette.listGroups()[0]?.colorIndices.join(",") === "1,3" &&
      palette.history()[0]?.atSequence === 1,
    "palette manager did not normalize group/history state",
  );
  const tileMap = new TileMapStore({
    id: "tiles:main",
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 4,
  });
  tileMap.set({ x: 1, y: 2, tileIndex: 3 });
  assert(
    tileMap.get(1, 2)?.tileIndex === 3 && tileMap.remove(1, 2) &&
      tileMap.list().length === 0,
    "tile map store lifecycle failed",
  );
  const guides = new GuideStore();
  guides.setGuide({ id: "guide:x", axis: "X", position: 7.6 });
  guides.setReferenceImage({
    assetId: "asset:ref",
    opacity: 0.5,
    x: 0,
    y: 0,
    scale: 1,
    locked: true,
  });
  assert(
    guides.listGuides()[0]?.position === 8 &&
      guides.referenceImage()?.locked === true,
    "guide/reference store did not normalize state",
  );
  const markers = new TimelineMarkerStore();
  markers.upsert({
    id: "marker:audio",
    frameIndex: 2,
    kind: "AUDIO",
    label: "Cue",
  });
  assert(
    markers.list(2).length === 1 && markers.remove("marker:audio"),
    "timeline marker store lifecycle failed",
  );
  const audioReferences = new DrawAudioReferenceStore();
  const audioReference = audioReferences.upsert({
    id: "audio-ref:theme",
    audioAssetId: "audio:theme",
    audioRevisionId: "audio-revision:theme:1",
    kind: "BGM",
    label: "Theme",
    startFrame: 2,
    durationFrames: 8,
    loop: true,
    gain: 1,
  }, 4);
  assert(
    audioReference.startFrame === 2 && audioReference.durationFrames === 4 &&
      audioReferences.remove(audioReference.id),
    "Draw Audio reference store did not normalize and remove a reference",
  );
  let invalidMarkerRejected = false;
  try {
    normalizeDraw2TimelineMetadata({
      schemaVersion: 2,
      animationTags: [],
      markers: [{
        id: "marker:outside",
        frameIndex: 4,
        kind: "NOTE",
        label: "Outside",
      }],
      audioReferences: [],
    }, 4);
  } catch {
    invalidMarkerRejected = true;
  }
  assert(invalidMarkerRejected, "out-of-range timeline metadata was accepted");
  const symmetric = radialSymmetryPoints({ x: 3, y: 2 }, {
    centerX: 0,
    centerY: 0,
    spokes: 4,
    reflect: false,
  });
  assert(
    symmetric.length === 4,
    "radial symmetry did not create the requested spokes",
  );
  const recorder = new MacroRecorder();
  recorder.start();
  recorder.record({ commandId: "tool:pen", payload: { size: 2 } });
  assert(
    recorder.stop().length === 1 && !recorder.isRecording,
    "macro recorder lifecycle failed",
  );
  const commands = searchCommandPalette([{
    id: "tool:pen",
    title: "Pen",
    keywords: ["draw"],
  }, { id: "view:grid", title: "Grid", keywords: ["display"] }], "draw");
  assert(
    commands.length === 1 && commands[0]?.id === "tool:pen",
    "command palette search ignored keywords",
  );
  const before = {
    width: 2,
    height: 2,
    getPixel: (x: number, y: number) => x === 0 && y === 0 ? 1 : 0,
  };
  const after = {
    width: 2,
    height: 2,
    getPixel: (x: number, y: number) => x === 1 && y === 1 ? 1 : 0,
  };
  const diff = comparePixelRevisions(before, after);
  assert(
    diff.changedPixels === 2 && diff.changedBounds?.width === 2,
    "revision comparison missed changed pixels",
  );
});
