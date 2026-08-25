import { PIXEL_PERFECT_ZOOM_LEVELS, isViewportAt100Percent, pinchZoomFromDistance, snapPixelPerfectZoom, stepPixelPerfectZoom, zoomAtSourcePoint } from "../src/draw2-viewport.ts";
import {
  DRAW2_CHECKER_CELL_SIZE_PX,
  DRAW2_GRID_CELL_SIZE_PX,
  DRAW2_GRID_MAJOR_STEP_PX,
  buildPixelGridSvgPath,
  getPixelGridOpacityForScale,
  projectCheckerCellSize,
  projectPixelGridMetrics,
} from "../src/draw2-pixel-grid.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Draw2 zoom keeps the pointer anchor stable in viewport coordinates", () => {
  const zoomed = zoomAtSourcePoint({
    nextZoom: 2,
    sourceX: 168,
    sourceY: 88,
    rasterWidth: 256,
    rasterHeight: 256,
    presentationCenterX: 0,
    presentationCenterY: 0,
    anchorClientX: 80,
    anchorClientY: -40,
    displayScale: 2,
    snap: false,
  });
  assert(zoomed.zoom === 2, "zoom factor was not applied");
  assert(
    0 + zoomed.offsetX + ((168 - 128) * 2) === 80 &&
      0 + zoomed.offsetY + ((88 - 128) * 2) === -40,
    "zoom did not preserve the pointer anchor",
  );
});

Deno.test("Draw2 actual 100% is a distinct scale from responsive Fit", () => {
  assert(isViewportAt100Percent(1), "1.0 must be actual 100%");
  assert(!isViewportAt100Percent(0.719), "responsive Fit must not be treated as 100%");
  assert(snapPixelPerfectZoom(0.719) === 0.75, "Fit-to-zoom transition lost the first snapped scale");
  assert(stepPixelPerfectZoom(0.719, 1) === 0.75, "zoom-in from Fit skipped the first scale");
});

Deno.test("Draw2 zoom keeps the actual pointer source pixel fixed after a pan", () => {
  const zoomed = zoomAtSourcePoint({
    nextZoom: 4,
    sourceX: 180.25,
    sourceY: 46.5,
    rasterWidth: 256,
    rasterHeight: 256,
    presentationCenterX: 500,
    presentationCenterY: 400,
    anchorClientX: 742,
    anchorClientY: 74,
  });
  const projectedX = 500 + zoomed.offsetX + ((180.25 - 128) * zoomed.zoom);
  const projectedY = 400 + zoomed.offsetY + ((46.5 - 128) * zoomed.zoom);
  assert(projectedX === 742 && projectedY === 74, "source pixel did not remain under the pointer");
});

Deno.test("Draw2 mobile projection uses the responsive display scale", () => {
  const zoomed = zoomAtSourcePoint({
    nextZoom: 2,
    displayScale: 2.5,
    sourceX: 180.25,
    sourceY: 46.5,
    rasterWidth: 256,
    rasterHeight: 256,
    presentationCenterX: 500,
    presentationCenterY: 400,
    anchorClientX: 742,
    anchorClientY: 74,
  });
  const projectedX = 500 + zoomed.offsetX + ((180.25 - 128) * 2.5);
  const projectedY = 400 + zoomed.offsetY + ((46.5 - 128) * 2.5);
  assert(
    Math.abs(projectedX - 742) < 0.000001 &&
      Math.abs(projectedY - 74) < 0.000001,
    "responsive display scale did not preserve the source anchor",
  );
});

Deno.test("Draw2 mobile keeps a lower canvas point under the zoom anchor", () => {
  const viewportTop = 96;
  const viewportHeight = 184.2421875;
  const viewportCenterY = viewportTop + viewportHeight / 2;
  const anchorY = 260;
  const baseScale = viewportHeight / 256;
  const targetScale = baseScale * 1.125;
  const sourceY = 128 + (anchorY - viewportCenterY) / baseScale;
  const zoomed = zoomAtSourcePoint({
    nextZoom: 1.125,
    displayScale: targetScale,
    sourceX: 128,
    sourceY,
    rasterWidth: 256,
    rasterHeight: 256,
    presentationCenterX: 195,
    presentationCenterY: viewportCenterY,
    anchorClientX: 195,
    anchorClientY: anchorY,
    snap: false,
  });
  const projectedY = viewportCenterY + zoomed.offsetY +
    ((sourceY - 128) * targetScale);
  assert(
    Math.abs(projectedY - anchorY) < 0.000001,
    "lower mobile source point drifted toward the canvas centre",
  );
});

Deno.test("Draw2 pixel grid uses 16px checker cells with an 8px major interval", () => {
  assert(DRAW2_CHECKER_CELL_SIZE_PX === 16, "checker cell must be exactly 16px");
  assert(DRAW2_GRID_CELL_SIZE_PX === 1, "minor grid interval must be exactly 1px");
  assert(DRAW2_GRID_MAJOR_STEP_PX === 8, "major grid interval must be exactly 8px");
  const metrics = projectPixelGridMetrics(256, 512, 1);
  assert(metrics.pixelStepCssPx === 2 && metrics.majorStepCssPx === 16, "grid projection was not deterministic");
});

Deno.test("Draw2 checker cell follows the displayed pixel lattice", () => {
  assert(projectCheckerCellSize(16, 1) === 16, "100% checker cell changed");
  assert(projectCheckerCellSize(16, 1.125) === 18, "112.5% checker cell is not aligned");
  assert(projectCheckerCellSize(16, 1.25) === 20, "125% checker cell is not aligned");
  assert(projectCheckerCellSize(16, 0.75) === 12, "responsive fit must scale checker cells below 100%");
});

Deno.test("Draw2 viewport uses smooth deterministic zoom steps without CSS scaling", () => {
  assert(PIXEL_PERFECT_ZOOM_LEVELS.includes(1.125), "fine zoom step is missing");
  assert(snapPixelPerfectZoom(1.06) === 1, "near-base zoom should stay at the base level");
  assert(snapPixelPerfectZoom(1.2) === 1.25, "zoom must resolve to the nearest fine level");
  assert(stepPixelPerfectZoom(1, 1) === 1.125, "zoom-in did not select the next fine level");
  assert(stepPixelPerfectZoom(2, -1) === 1.875, "zoom-out did not select the preceding fine level");
});

Deno.test("Draw2 mobile pinch uses the desktop zoom levels and sensitivity", () => {
  assert(pinchZoomFromDistance(1, 100, 112.5) === 1.125, "neutral pinch did not select the shared next level");
  assert(pinchZoomFromDistance(1, 100, 125, 0.5) === 1.125, "lower sensitivity should remain deterministic at this boundary");
  assert(pinchZoomFromDistance(2, 100, 70) === 1.375, "pinch zoom-out did not use the shared level sequence");
  assert(pinchZoomFromDistance(2, 100, 20) === 1 / 3, "pinch zoom-out did not reach the lower shared level");
});

Deno.test("Draw2 mobile pinch stays continuous while the gesture is active", () => {
  const continuous = pinchZoomFromDistance(1, 100, 130, 1, false);
  assert(
    Math.abs(continuous - 1.3) < 0.000001,
    "active pinch should not jump to a pixel-perfect level",
  );
  assert(
    pinchZoomFromDistance(1, 100, 130, 1, true) === 1.25,
    "settled pinch should still use the shared zoom levels",
  );
});

Deno.test("Draw2 SVG grid aligns minor and major boundaries deterministically", () => {
  const minor = buildPixelGridSvgPath(4, 4, 40, 40, 1);
  const major = buildPixelGridSvgPath(16, 16, 160, 160, DRAW2_GRID_MAJOR_STEP_PX);
  assert(minor.includes("M0.5 0 V40") && minor.includes("M40.5 0 V40"), "minor grid did not include raster boundaries");
  assert(major.includes("M0.5 0 V160") && major.includes("M80.5 0 V160"), "major grid did not use the 8px source interval");
  assert((minor.match(/M/g) ?? []).length === 10, "minor grid materialized an unstable number of lines");
});

Deno.test("Draw2 grid opacity fades at low zoom and reaches full strength", () => {
  assert(getPixelGridOpacityForScale(1) === 0, "minor grid must stay hidden at 1x");
  assert(getPixelGridOpacityForScale(1, { major: true }) === 0.56, "major grid low-zoom opacity changed");
  assert(getPixelGridOpacityForScale(2) === 0.26, "minor grid did not appear at editable scale");
  assert(getPixelGridOpacityForScale(20) === 0.74 && getPixelGridOpacityForScale(20, { major: true }) === 0.96, "grid opacity did not reach full strength");
});
