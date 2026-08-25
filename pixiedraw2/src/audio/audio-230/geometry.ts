import type { Audio230Diagnostic, Audio230Geometry, Audio230Mode, Audio230Result, Audio230Viewport } from "./contracts.ts";

const bad = (code: string, message: string, path?: string): Audio230Result<never> => ({
  ok: false,
  diagnostics: [{ code, message, ...(path === undefined ? {} : { path }) }],
});
const finite = (n: number): boolean => Number.isFinite(n);
const positive = (n: number): boolean => finite(n) && n > 0;
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export function classifyAudio230Mode(width: number): Audio230Result<Audio230Mode> {
  if (!positive(width) || width > 100_000) return bad("AUDIO230_INVALID_VIEWPORT", "Viewport width must be finite and bounded.", "width");
  return { ok: true, value: width >= 1100 ? "DESKTOP" : width >= 700 ? "TABLET" : "MOBILE", diagnostics: [] };
}

export function createAudio230Geometry(viewport: Audio230Viewport): Audio230Result<Audio230Geometry> {
  const values = [viewport.width, viewport.height, viewport.textScale, viewport.keyboardInset, viewport.safeArea.top, viewport.safeArea.right, viewport.safeArea.bottom, viewport.safeArea.left];
  if (values.some((value) => !finite(value))) return bad("AUDIO230_INVALID_GEOMETRY", "Viewport and safe-area values must be finite.", "viewport");
  if (!positive(viewport.width) || !positive(viewport.height) || viewport.width > 100_000 || viewport.height > 100_000) return bad("AUDIO230_INVALID_GEOMETRY", "Viewport dimensions are outside the bounded range.", "viewport");
  if (viewport.textScale < 0.75 || viewport.textScale > 3 || viewport.keyboardInset < 0) return bad("AUDIO230_INVALID_GEOMETRY", "Text scale or keyboard inset is unsafe.", "viewport");
  if (Object.values(viewport.safeArea).some((value) => value < 0 || value > Math.min(viewport.width, viewport.height) / 2)) return bad("AUDIO230_INVALID_SAFE_AREA", "Safe-area inset is outside the viewport.", "safeArea");
  const modeResult = classifyAudio230Mode(viewport.width);
  if (!modeResult.ok) return modeResult;
  const mode = modeResult.value;
  const insetX = viewport.safeArea.left + viewport.safeArea.right;
  const insetY = viewport.safeArea.top + viewport.safeArea.bottom + viewport.keyboardInset;
  const contentWidth = viewport.width - insetX;
  const contentHeight = viewport.height - insetY;
  if (contentWidth < 240 || contentHeight < 160) return bad("AUDIO230_UNUSABLE_GEOMETRY", "Safe-area and keyboard insets leave insufficient workspace.", "content");
  const x = viewport.safeArea.left;
  const y = viewport.safeArea.top;
  const content = { x, y, width: contentWidth, height: contentHeight };
  type MutableRegions = { -readonly [Key in keyof Audio230Geometry["regions"]]: Audio230Geometry["regions"][Key] };
  const regions = {} as MutableRegions;
  if (mode === "DESKTOP") {
    const left = clamp(contentWidth * 0.18, 220, 300);
    const right = clamp(contentWidth * 0.22, 280, 360);
    const bottom = clamp(contentHeight * 0.16, 96, 150);
    regions.PROJECT_TRACKS = { x, y, width: left, height: contentHeight - bottom };
    regions.INSPECTOR_MIXER = { x: x + contentWidth - right, y, width: right, height: contentHeight - bottom };
    regions.CANVAS = { x: x + left, y, width: contentWidth - left - right, height: contentHeight - bottom };
    regions.TIMELINE = { x: x + left, y: y + contentHeight - bottom, width: contentWidth - left - right, height: bottom };
    regions.OUTPUT_DIAGNOSTIC = { x, y: y + contentHeight - bottom, width: left, height: bottom };
  } else if (mode === "TABLET") {
    const bottom = clamp(contentHeight * 0.28, 150, 240);
    regions.CANVAS = { x, y, width: contentWidth, height: contentHeight - bottom };
    regions.TIMELINE = { x, y: y + contentHeight - bottom, width: contentWidth, height: bottom };
    regions.PROJECT_TRACKS = { x, y, width: 0, height: 0 };
    regions.INSPECTOR_MIXER = { x, y, width: 0, height: 0 };
    regions.OUTPUT_DIAGNOSTIC = { x, y, width: 0, height: 0 };
  } else {
    const sheet = clamp(contentHeight * 0.34, 180, 300);
    regions.CANVAS = { x, y, width: contentWidth, height: contentHeight };
    regions.TIMELINE = { x, y: y + contentHeight - sheet, width: contentWidth, height: sheet };
    regions.PROJECT_TRACKS = { x, y, width: 0, height: 0 };
    regions.INSPECTOR_MIXER = { x, y, width: 0, height: 0 };
    regions.OUTPUT_DIAGNOSTIC = { x, y, width: 0, height: 0 };
  }
  return { ok: true, value: { mode, viewport, content, regions, pageScroll: { horizontal: false, vertical: false }, internalScrollOwners: mode === "DESKTOP" ? ["PROJECT_TRACKS", "TIMELINE", "INSPECTOR_MIXER", "OUTPUT_DIAGNOSTIC"] : ["TIMELINE", "INSPECTOR_MIXER"] }, diagnostics: [] };
}

export function validateAudio230Geometry(geometry: Audio230Geometry): readonly Audio230Diagnostic[] {
  if (geometry.pageScroll.horizontal || geometry.pageScroll.vertical) return [{ code: "AUDIO230_PAGE_SCROLL", message: "Page-level scrolling is forbidden; use bounded panel scrolling." }];
  if (geometry.content.width <= 0 || geometry.content.height <= 0) return [{ code: "AUDIO230_INVALID_GEOMETRY", message: "Content geometry must remain positive." }];
  return [];
}
