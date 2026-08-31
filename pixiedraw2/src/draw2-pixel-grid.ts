export const DRAW2_CHECKER_CELL_SIZE_PX = 16;
export const DRAW2_GRID_CELL_SIZE_PX = 1;
export const DRAW2_GRID_MAJOR_STEP_PX = 8;

export interface PixelGridMetrics {
  readonly pixelStepCssPx: number;
  readonly majorStepCssPx: number;
}

export interface PixelGridSvgOptions {
  readonly major?: boolean;
}

/**
 * Keeps the 16px source checker aligned with the displayed pixel lattice.
 * Fractional CSS pixels are intentional here: the desktop viewport fit can
 * make one source pixel smaller than 1 CSS px, and rounding would accumulate
 * a visible phase drift across the checker pattern.
 */
export function projectCheckerCellSize(cellSize: number, zoom: number): number {
  const safeCellSize = Math.max(1, Number.isFinite(cellSize) ? cellSize : DRAW2_CHECKER_CELL_SIZE_PX);
  const safeZoom = Math.max(0.01, Number.isFinite(zoom) ? zoom : 1);
  return Math.max(0.25, safeCellSize * safeZoom);
}

/**
 * Keep SVG coordinates short and deterministic while retaining the half-pixel
 * alignment used by the production PiXiEEDraw grid renderer.
 */
export function formatPixelGridSvgCoord(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Number(numeric.toFixed(3)).toString();
}

/**
 * Projects source-pixel boundaries into a single SVG path. This keeps the
 * grid as a bounded overlay: no per-pixel DOM nodes and no raster mutations.
 */
export function buildPixelGridSvgPath(
  width: number,
  height: number,
  displayWidth: number,
  displayHeight: number,
  step = 1,
): string {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const safeDisplayWidth = Math.max(1, Number(displayWidth) || safeWidth);
  const safeDisplayHeight = Math.max(1, Number(displayHeight) || safeHeight);
  const safeStep = Math.max(1, Math.round(Number(step) || 1));
  const cellWidth = safeDisplayWidth / safeWidth;
  const cellHeight = safeDisplayHeight / safeHeight;
  const lineOffset = 0.5;
  const commands: string[] = [];

  for (let x = 0; x <= safeWidth; x += safeStep) {
    const screenX = (x * cellWidth) + lineOffset;
    commands.push(`M${formatPixelGridSvgCoord(screenX)} 0`, `V${formatPixelGridSvgCoord(safeDisplayHeight)}`);
  }
  for (let y = 0; y <= safeHeight; y += safeStep) {
    const screenY = (y * cellHeight) + lineOffset;
    commands.push(`M0 ${formatPixelGridSvgCoord(screenY)}`, `H${formatPixelGridSvgCoord(safeDisplayWidth)}`);
  }
  return commands.join(" ");
}

/**
 * Match PiXiEEDraw's low-zoom fade so a dense 1px grid does not overpower the
 * artwork, while major lines remain discoverable sooner.
 */
export function getPixelGridOpacityForScale(scale: number, options: PixelGridSvgOptions = {}): number {
  const normalizedScale = Math.max(Number(scale) || 1, 1);
  // A one-screen-pixel minor grid at 1× only muddies the checkerboard. Keep
  // the 8px major cadence visible at 1×, then reveal the individual pixel
  // lattice once a source pixel has room to be read as an editable cell.
  if (options.major !== true && normalizedScale < 2) return 0;
  const threshold = options.major === true ? 1 : 2;
  const range = options.major === true ? 7 : 4;
  const progress = Math.min(1, Math.max(0, (normalizedScale - threshold) / range));
  const eased = progress * progress * (3 - (2 * progress));
  const minimum = options.major === true ? 0.56 : 0.26;
  const maximum = options.major === true ? 0.96 : 0.74;
  return minimum + ((maximum - minimum) * eased);
}

/**
 * Projects one raster pixel and one 8-pixel major interval into the current
 * CSS viewport. `layoutWidthCssPx` is the actual rendered stack width; callers
 * that own an already-zoomed stack pass a viewport zoom of 1 so the value is
 * never multiplied twice.
 */
export function projectPixelGridMetrics(
  rasterWidth: number,
  layoutWidthCssPx: number,
  viewportZoom: number,
): PixelGridMetrics {
  const safeRasterWidth = Math.max(1, Number.isFinite(rasterWidth) ? rasterWidth : 1);
  const safeLayoutWidth = Math.max(1, Number.isFinite(layoutWidthCssPx) ? layoutWidthCssPx : safeRasterWidth);
  const safeZoom = Math.max(0.5, Number.isFinite(viewportZoom) ? viewportZoom : 1);
  const pixelStepCssPx = Math.max(0.25, (safeLayoutWidth / safeRasterWidth) * safeZoom * DRAW2_GRID_CELL_SIZE_PX);
  return {
    pixelStepCssPx,
    majorStepCssPx: pixelStepCssPx * DRAW2_GRID_MAJOR_STEP_PX,
  };
}
