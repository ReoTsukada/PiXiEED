import {
  encodeApngFrames,
  encodeGifFrames,
  encodeStoredZip,
  exportAtlasJson,
  exportBmp,
  exportPng,
  exportRasterAnimationFrames,
  exportRasterRgba,
  exportSpriteSheet,
  exportSvg,
  exportTiff,
  exportTileset,
} from "../src/draw2-export.ts";
import {
  maxPngExportScale,
  normalizeExportFormats,
  pngExportScaleOptions,
  visibleExportFormats,
} from "../src/draw2-export-registry.ts";
import { createProject } from "../src/draw2-core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${message} expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

Deno.test("Export Registry exposes only implemented visible formats", () => {
  assertEquals(
    visibleExportFormats().map((definition) => definition.id).join(","),
    "png,jpeg,webp,avif,bmp,tiff,gif,apng,webm,wav,audio-webm,audio-ogg,svg,sprite-sheet,atlas-json,tileset,pxd",
    "Visible export formats are not aligned with the implemented exporters.",
  );
  assertEquals(
    normalizeExportFormats(["pxd", "png", "gif", "png", "glb"]).join(","),
    "png,gif,pxd",
    "Format selection was not normalized through the registry.",
  );
});

Deno.test("Image exporters cover raster, vector, animation, and atlas outputs", () => {
  const state = createProject({
    projectId: "export-image-formats",
    width: 2,
    height: 2,
    tileSize: 32,
  });
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("export fixture asset is missing");
  asset.raster.setPixel("export-image-formats", 0, 0, 1);
  asset.raster.setPixel("export-image-formats", 1, 1, 2);

  const svg = exportSvg(state, state.activeAssetId, { scale: 2 });
  assert(
    svg.bytes[0] === 0x3c && svg.bytes.includes(0x72),
    "SVG output is missing its XML payload.",
  );
  assertEquals(svg.width, 4, "SVG width did not scale.");

  const bmp = exportBmp(state, state.activeAssetId, { scale: 2 });
  assert(
    bmp.bytes[0] === 0x42 && bmp.bytes[1] === 0x4d,
    "BMP signature is invalid.",
  );

  const tiff = exportTiff(state, state.activeAssetId);
  assert(
    tiff.bytes[0] === 0x49 && tiff.bytes[1] === 0x49 && tiff.bytes[2] === 0x2a,
    "TIFF signature is invalid.",
  );

  const frames = exportRasterAnimationFrames(state);
  const gif = encodeGifFrames(frames);
  assert(
    gif[0] === 0x47 && gif[1] === 0x49 && gif[2] === 0x46 &&
      gif.at(-1) === 0x3b,
    "GIF framing is invalid.",
  );
  const apng = encodeApngFrames(frames);
  assert(
    apng[0] === 137 && apng.includes(0x61) && apng.includes(0x63) &&
      apng.includes(0x54) && apng.at(-12) !== undefined,
    "APNG framing is invalid.",
  );

  const spriteSheet = exportSpriteSheet(state);
  assert(
    spriteSheet.bytes[0] === 137 && spriteSheet.layout.sprites.length === 1,
    "Sprite sheet output is invalid.",
  );
  const tileset = exportTileset(state, state.activeAssetId, { scale: 2 });
  assert(
    tileset.bytes[0] === 137 && tileset.width === 4,
    "Tileset output is invalid.",
  );
  const atlas = exportAtlasJson(state, {
    imageFilename: "export-image-formats-spritesheet.png",
  });
  const atlasText = new TextDecoder().decode(atlas.bytes);
  assert(
    atlasText.includes("export-image-formats-spritesheet.png"),
    "Atlas metadata does not reference the sprite sheet.",
  );
});

Deno.test("Export RGBA keeps Draw2 ARGB palette channels in canvas order", () => {
  const state = createProject({
    projectId: "export-argb-order",
    width: 1,
    height: 1,
    tileSize: 32,
    palette: [0, 0xff112233],
  });
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("ARGB fixture asset is missing");
  asset.raster.setPixel("export-argb-order", 0, 0, 1);
  const raster = exportRasterRgba(state, state.activeAssetId);
  assertEquals(raster.rgba[0], 0x11, "Red channel was not decoded from ARGB.");
  assertEquals(
    raster.rgba[1],
    0x22,
    "Green channel was not decoded from ARGB.",
  );
  assertEquals(raster.rgba[2], 0x33, "Blue channel was not decoded from ARGB.");
  assertEquals(
    raster.rgba[3],
    0xff,
    "Alpha channel was not decoded from ARGB.",
  );
});

Deno.test("Stored ZIP keeps multiple outputs as packaging, not as a format", () => {
  const bytes = encodeStoredZip([
    { filename: "sprite.png", bytes: Uint8Array.from([1, 2, 3]) },
    { filename: "project.pxd", bytes: Uint8Array.from([4, 5]) },
  ]);
  assert(
    bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 &&
      bytes[3] === 0x04,
    "ZIP local header is missing.",
  );
  const end = bytes.length - 22;
  assert(
    bytes[end] === 0x50 && bytes[end + 1] === 0x4b &&
      bytes[end + 2] === 0x05 && bytes[end + 3] === 0x06,
    "ZIP end record is missing.",
  );
  assertEquals(bytes[end + 10], 2, "ZIP entry count was not written.");
});

Deno.test("PNG scale uses nearest-neighbour dimensions", async () => {
  const state = createProject({
    projectId: "export-scale",
    width: 2,
    height: 1,
    tileSize: 32,
  });
  const output = await exportPng(state, state.activeAssetId, { scale: 2 });
  assertEquals(output.width, 4, "PNG width did not scale.");
  assertEquals(output.height, 2, "PNG height did not scale.");
  const readUint32 = (offset: number): number =>
    ((output.bytes[offset] ?? 0) << 24) |
    ((output.bytes[offset + 1] ?? 0) << 16) |
    ((output.bytes[offset + 2] ?? 0) << 8) |
    (output.bytes[offset + 3] ?? 0);
  assertEquals(readUint32(16), 4, "PNG IHDR width is inconsistent.");
  assertEquals(readUint32(20), 2, "PNG IHDR height is inconsistent.");
});

Deno.test("PNG export supports large pixel-art scales and reports progress", async () => {
  const state = createProject({
    projectId: "export-large-scale",
    width: 2,
    height: 1,
    tileSize: 32,
  });
  const progress: number[] = [];
  const output = await exportPng(state, state.activeAssetId, {
    scale: 16,
    onProgress: (value) => {
      progress.push(value);
    },
  });
  assertEquals(output.width, 32, "Large PNG width did not scale to 16x.");
  assertEquals(output.height, 16, "Large PNG height did not scale to 16x.");
  assert(progress.length >= 3, "Large PNG export did not report progress.");
  assertEquals(
    progress[0],
    0.06,
    "Progress did not start at the preparation phase.",
  );
  assertEquals(
    progress[progress.length - 1],
    1,
    "Progress did not finish at 100%.",
  );
});

Deno.test("PNG scale presets expand for tiny canvases within the output budget", () => {
  assertEquals(
    maxPngExportScale(16, 16),
    256,
    "A 16px canvas should expose a presentation-sized maximum scale.",
  );
  assertEquals(
    maxPngExportScale(256, 256),
    16,
    "A 256px canvas should keep the same bounded output budget.",
  );
  assertEquals(
    pngExportScaleOptions(16, 16).at(-1),
    256,
    "Tiny canvases did not receive the 256x preset.",
  );
  assertEquals(
    pngExportScaleOptions(256, 256).at(-1),
    16,
    "Large canvases exposed an unsafe scale preset.",
  );
});
