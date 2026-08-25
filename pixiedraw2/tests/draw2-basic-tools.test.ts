import { createProject } from "../src/draw2-core.ts";
import {
  createFillPreviewWriteSet,
  createIndexedGradientWriteSet,
  createPathWriteSet,
  createToolPreviewWriteSet,
  createWriteSet,
  colorToleranceDistanceToPercent,
  colorTolerancePercentToDistance,
  decodeArgb,
  normalizeToolOptions,
  nearestBrushCursor,
  selectByContiguousColor,
  selectByEllipse,
  selectByLasso,
  selectByOpaque,
  selectByPaletteColor,
  shapePixels,
  snapSelectionBoundsToGrid,
  stampBrush,
} from "../src/draw2-basic-tools.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Draw2 basic tool geometry is deterministic and bounded", () => {
  const bounds = { width: 16, height: 16 };
  const rectangle = shapePixels("rect", { x: 2, y: 3 }, { x: 7, y: 8 }, bounds);
  const filled = shapePixels("rect-fill", { x: 2, y: 3 }, { x: 7, y: 8 }, bounds);
  const ellipse = shapePixels("ellipse", { x: 2, y: 3 }, { x: 11, y: 9 }, bounds);
  assert(rectangle.length === 20, "rectangle outline has an unstable pixel count");
  assert(filled.length === 36, "rectangle fill did not cover the requested bounds");
  assert(ellipse.length > 0 && ellipse.every((point) => point.x >= 2 && point.x <= 11 && point.y >= 3 && point.y <= 9), "ellipse escaped its bounds");
  assert(JSON.stringify(shapePixels("line", { x: 1, y: 1 }, { x: 8, y: 4 }, bounds)) === JSON.stringify(shapePixels("line", { x: 1, y: 1 }, { x: 8, y: 4 }, bounds)), "line output is not deterministic");
});

Deno.test("Draw2 circle fits the short axis without clipping", () => {
  const bounds = { width: 64, height: 64 };
  const circle = shapePixels("circle", { x: 8, y: 20 }, { x: 40, y: 36 }, bounds);
  const filledCircle = shapePixels("circle-fill", { x: 8, y: 20 }, { x: 40, y: 36 }, bounds);
  assert(circle.length > 0 && filledCircle.length > circle.length, "circle geometry was empty or fill did not expand it");
  assert(circle.every((point) => point.x >= 16 && point.x <= 32 && point.y >= 20 && point.y <= 36), "circle escaped the fitted short-axis square");
  assert(filledCircle.some((point) => point.x === 24 && point.y === 28), "filled circle lost its center pixel");
});

Deno.test("Draw2 ellipse uses inclusive midpoint bounds with four-way symmetry", () => {
  const bounds = { width: 64, height: 64 };
  const ellipse = shapePixels("ellipse", { x: 8, y: 12 }, { x: 39, y: 28 }, bounds);
  const keys = new Set(ellipse.map((point) => `${point.x}:${point.y}`));
  assert(ellipse.length > 0, "ellipse midpoint output was empty");
  assert(ellipse.every((point) => point.x >= 8 && point.x <= 39 && point.y >= 12 && point.y <= 28), "ellipse escaped inclusive bounds");
  for (const point of ellipse) {
    assert(keys.has(`${47 - point.x}:${40 - point.y}`), "ellipse lost horizontal or vertical symmetry");
  }
  const filled = shapePixels("ellipse-fill", { x: 8, y: 12 }, { x: 39, y: 28 }, bounds);
  assert(filled.length > ellipse.length && filled.some((point) => point.x === 23 && point.y === 20), "ellipse fill did not cover its midpoint");
});

Deno.test("Draw2 brush size remains exact for even circular stamps", () => {
  const points = stampBrush([{ x: 8, y: 8 }], { brushSize: 4, brushShape: "square" }, { width: 32, height: 32 });
  assert(points.length === 16, "even brush size produced a non-square footprint");
});

Deno.test("Draw2 cursor footprint follows brush size and shape", () => {
  const bounds = { width: 32, height: 32 };
  const square = nearestBrushCursor({ x: 16, y: 16 }, { brushSize: 4, brushShape: "square" }, bounds);
  const circle = nearestBrushCursor({ x: 16, y: 16 }, { brushSize: 4, brushShape: "circle" }, bounds);
  assert(square.length === 16, "square cursor footprint did not match brush size");
  assert(circle.length < square.length && circle.some((point) => point.x === 16 && point.y === 16), "circle cursor footprint did not match brush shape");
  assert(square.every((point) => point.x >= 15 && point.x <= 18 && point.y >= 15 && point.y <= 18), "cursor footprint escaped the brush bounds");
});

Deno.test("Draw2 brush patterns and write sets deduplicate to one atomic pixel list", () => {
  const bounds = { width: 12, height: 12 };
  const checker = stampBrush([{ x: 5, y: 5 }], { brushSize: 5, pattern: "checker" }, bounds);
  const writes = createWriteSet("rect-fill", { x: 1, y: 1 }, { x: 4, y: 4 }, 2, { brushSize: 1, pattern: "solid" }, bounds);
  assert(checker.length > 1 && checker.length < 25, "checker pattern was not sparse");
  assert(writes.length === 16, "write set lost or duplicated rectangle pixels");
  assert(writes.every((left, index) => index === 0 || left.y > writes[index - 1]!.y || left.x > writes[index - 1]!.x), "write set is not sorted");
});

Deno.test("Draw2 pen path write set follows every sampled turn instead of drawing one endpoint line", () => {
  const bounds = { width: 16, height: 16 };
  const writes = createPathWriteSet(
    "pen",
    [{ x: 1, y: 1 }, { x: 1, y: 7 }, { x: 7, y: 7 }],
    3,
    { brushSize: 2, brushShape: "square", pattern: "solid" },
    bounds,
  );
  assert(writes.some((point) => point.x <= 1 && point.y >= 4), "vertical path segment was lost");
  assert(writes.some((point) => point.x >= 4 && point.y >= 7), "horizontal path segment was lost");
  assert(!writes.some((point) => point.x === 5 && point.y === 5), "path collapsed into a diagonal endpoint preview");
  assert(writes.every((point) => point.colorIndex === 3), "pen path changed the selected palette index");

  const erased = createPathWriteSet("eraser", [{ x: 2, y: 2 }, { x: 9, y: 2 }], 7, { brushSize: 3 }, bounds);
  assert(erased.length > 0 && erased.every((point) => point.colorIndex === 0), "eraser path did not resolve to transparent index zero");
});

Deno.test("Draw2 hover preview reuses the exact single-click write set", () => {
  const bounds = { width: 20, height: 20 };
  const point = { x: 8, y: 9 };
  const options = { brushSize: 5, brushShape: "circle" as const, pattern: "checker" as const };
  const penPreview = createToolPreviewWriteSet("pen", point, 2, options, bounds);
  const penClick = createPathWriteSet("pen", [point], 2, options, bounds);
  const circlePreview = createToolPreviewWriteSet("circle-fill", point, 2, options, bounds);
  const circleClick = createWriteSet("circle-fill", point, point, 2, options, bounds);
  const fillPreview = createToolPreviewWriteSet("fill", point, 2, options, bounds);
  assert(JSON.stringify(penPreview) === JSON.stringify(penClick), "pen preview diverged from the click write set");
  assert(JSON.stringify(circlePreview) === JSON.stringify(circleClick), "shape preview diverged from the click write set");
  assert(fillPreview.length === 0, "fill hover preview must not plan a full flood write set");
});

Deno.test("Draw2 fill preview plans the same bounded connected region without mutation", () => {
  const reader = {
    width: 5,
    height: 4,
    getPixel(x: number, y: number): number { return x === 2 && y < 3 ? 1 : 0; },
  };
  const preview = createFillPreviewWriteSet(reader, { x: 0, y: 0 }, 2);
  assert(preview.length === 17 && preview.every((point) => point.colorIndex === 2), "fill preview did not resolve the connected region");
  assert(createFillPreviewWriteSet(reader, { x: 0, y: 0 }, 0).length === 0, "same-color fill preview should be empty");
});

Deno.test("Draw2 indexed gradient quantises a drag back to the active palette", () => {
  const reader = {
    width: 5,
    height: 1,
    getPixel(): number { return 1; },
  };
  const palette = [0, 0xffff0000, 0xff0000ff];
  const writes = createIndexedGradientWriteSet(
    reader,
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }],
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    1,
    2,
    palette,
  );
  assert(writes.some((point) => point.x === 4 && point.colorIndex === 2), "gradient did not reach the selected end colour");
  assert(!writes.some((point) => point.x === 0), "gradient rewrote its unchanged start pixel");
  const solid = createIndexedGradientWriteSet(
    reader,
    [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    1,
    2,
    palette,
  );
  assert(solid.length === 2 && solid.every((point) => point.colorIndex === 2), "zero-length drag did not become a solid fill");
});

Deno.test("Draw2 palette ARGB decodes to Canvas RGBA without channel rotation", () => {
  const color = decodeArgb(0xff3366cc);
  assert(
    color.alpha === 0xff && color.red === 0x33 && color.green === 0x66 && color.blue === 0xcc,
    "ARGB palette color no longer matches Canvas RGBA output",
  );
});

Deno.test("Draw2 exact, similar, and lasso selections return bounded masks", () => {
  const project = createProject({ projectId: "basic-tools-selection", width: 6, height: 6, tileSize: 32, palette: [0, 0xffffffff, 0xff0000ff, 0xff0000fe] });
  const asset = project.assets[project.activeAssetId];
  assert(asset !== undefined, "selection fixture asset is missing");
  asset.raster.setPixel(asset.id, 1, 1, 1);
  asset.raster.setPixel(asset.id, 2, 1, 2);
  asset.raster.setPixel(asset.id, 3, 1, 3);
  const exact = selectByPaletteColor(asset.raster, 1, "exact", asset.palette);
  const similar = selectByPaletteColor(asset.raster, 2, "similar", asset.palette, 2);
  const lasso = selectByLasso(asset.raster, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
  assert(exact.pixels.length === 1 && exact.pixels[0]?.x === 1, "exact color selection missed the target");
  assert(similar.pixels.length >= 2, "similar color selection did not use the threshold");
  assert(lasso.pixels.length > 0 && lasso.pixels.every((point) => point.x < 4 && point.y < 4), "lasso selection escaped its polygon");
});

Deno.test("Draw2 color tolerance exposes a bounded percentage without changing RGB semantics", () => {
  assert(colorTolerancePercentToDistance(0) === 0, "0% tolerance must be exact RGB");
  assert(
    colorTolerancePercentToDistance(100) >= 441,
    "100% tolerance must cover the full RGB distance",
  );
  assert(
    colorToleranceDistanceToPercent(colorTolerancePercentToDistance(25)) === 25,
    "percentage conversion must be stable at the UI value",
  );
  assert(colorToleranceDistanceToPercent(-1) === 0, "negative distance must clamp to zero");
  assert(colorToleranceDistanceToPercent(Number.POSITIVE_INFINITY) === 0, "non-finite distance must use the safe default");
});

Deno.test("Unified color selection normalizes all four modes", () => {
  for (const mode of ["similar", "exact", "magic", "opaque"] as const) {
    assert(
      normalizeToolOptions({ selectionMode: mode }).selectionMode === mode,
      `selection mode ${mode} was not preserved`,
    );
  }
  assert(
    normalizeToolOptions().selectionMode === "similar",
    "color selection should default to similar mode",
  );
});

Deno.test("Draw2 contiguous similar selection follows the same RGB tolerance", () => {
  const project = createProject({
    projectId: "basic-tools-contiguous-similar",
    width: 5,
    height: 1,
    tileSize: 32,
    palette: [0, 0xff0000ff, 0xff0000f5, 0xff00ff00],
  });
  const asset = project.assets[project.activeAssetId];
  assert(asset !== undefined, "similar contiguous fixture asset is missing");
  asset.raster.setPixel(asset.id, 1, 0, 1);
  asset.raster.setPixel(asset.id, 2, 0, 2);
  asset.raster.setPixel(asset.id, 3, 0, 3);
  const exact = selectByContiguousColor(asset.raster, { x: 1, y: 0 }, "exact", asset.palette, 0);
  const similar = selectByContiguousColor(asset.raster, { x: 1, y: 0 }, "similar", asset.palette, 12);
  assert(exact.pixels.length === 1, "exact contiguous selection crossed a palette index");
  assert(similar.pixels.length === 2, "similar contiguous selection did not include the adjacent RGB-near color");
});

Deno.test("Draw2 ellipse, contiguous, and opaque selections stay intuitive and bounded", () => {
  const project = createProject({
    projectId: "basic-tools-selection-advanced",
    width: 8,
    height: 8,
    tileSize: 32,
    palette: [0, 0xffffffff, 0xff0000ff],
  });
  const asset = project.assets[project.activeAssetId];
  assert(asset !== undefined, "advanced selection fixture asset is missing");
  asset.raster.setPixel(asset.id, 1, 1, 1);
  asset.raster.setPixel(asset.id, 2, 1, 1);
  asset.raster.setPixel(asset.id, 1, 2, 1);
  asset.raster.setPixel(asset.id, 6, 6, 2);
  const ellipse = selectByEllipse(asset.raster, { x: 1, y: 1 }, { x: 5, y: 5 });
  const contiguous = selectByContiguousColor(
    asset.raster,
    { x: 1, y: 1 },
    "exact",
    asset.palette,
  );
  const opaque = selectByOpaque(asset.raster, asset.palette);
  assert(ellipse.pixels.length > 0 && ellipse.pixels.every((point) => point.x >= 1 && point.x <= 5 && point.y >= 1 && point.y <= 5), "ellipse selection escaped its drag bounds");
  assert(contiguous.pixels.length === 3 && !contiguous.pixels.some((point) => point.x === 6 && point.y === 6), "contiguous selection crossed a disconnected region");
  assert(opaque.pixels.length === 4, "opaque selection did not include every visible pixel");
});

Deno.test("Draw2 grid selection snaps complete 16px cells and clips raster edges", () => {
  const wide = snapSelectionBoundsToGrid(
    { x: 7, y: 9 },
    { x: 32, y: 17 },
    { width: 64, height: 48 },
  );
  const reverse = snapSelectionBoundsToGrid(
    { x: 32, y: 17 },
    { x: 7, y: 9 },
    { width: 64, height: 48 },
  );
  const edge = snapSelectionBoundsToGrid(
    { x: 48, y: 32 },
    { x: 63, y: 47 },
    { width: 64, height: 48 },
  );
  assert(JSON.stringify(wide) === JSON.stringify({ x: 0, y: 0, width: 48, height: 32 }), "grid selection did not expand to complete cells");
  assert(JSON.stringify(reverse) === JSON.stringify(wide), "grid selection changed when dragged backwards");
  assert(JSON.stringify(edge) === JSON.stringify({ x: 48, y: 32, width: 16, height: 16 }), "grid selection did not clip cleanly at the raster edge");
});
