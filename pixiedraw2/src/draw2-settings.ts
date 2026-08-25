export interface Draw2VisualSettings {
  readonly zoomSensitivity: number;
  readonly checkerA: string;
  readonly checkerB: string;
  readonly gridMinor: string;
  readonly gridMajor: string;
  readonly themeAccent: string;
}

export const DRAW2_SETTINGS_STORAGE_KEY = "pixieedraw2:visual-settings:v1";

export const DEFAULT_DRAW2_VISUAL_SETTINGS: Draw2VisualSettings = {
  zoomSensitivity: 1,
  checkerA: "#D9DCE2",
  checkerB: "#B4BAC5",
  gridMinor: "#1B3147",
  gridMajor: "#0D7E93",
  themeAccent: "#8AE3D2",
};

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeDraw2VisualSettings(value: unknown): Draw2VisualSettings {
  const source = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  const sensitivity = Math.max(0.25, Math.min(2, finiteNumber(source.zoomSensitivity, DEFAULT_DRAW2_VISUAL_SETTINGS.zoomSensitivity)));
  return {
    zoomSensitivity: Math.round(sensitivity * 4) / 4,
    checkerA: isHexColor(source.checkerA) ? source.checkerA.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.checkerA,
    checkerB: isHexColor(source.checkerB) ? source.checkerB.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.checkerB,
    gridMinor: isHexColor(source.gridMinor) ? source.gridMinor.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.gridMinor,
    gridMajor: isHexColor(source.gridMajor) ? source.gridMajor.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.gridMajor,
    themeAccent: isHexColor(source.themeAccent) ? source.themeAccent.toUpperCase() : DEFAULT_DRAW2_VISUAL_SETTINGS.themeAccent,
  };
}

export function readDraw2VisualSettings(storage: Storage | undefined): Draw2VisualSettings {
  if (storage === undefined) return DEFAULT_DRAW2_VISUAL_SETTINGS;
  try {
    const raw = storage.getItem(DRAW2_SETTINGS_STORAGE_KEY);
    return raw === null ? DEFAULT_DRAW2_VISUAL_SETTINGS : normalizeDraw2VisualSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_DRAW2_VISUAL_SETTINGS;
  }
}

export function writeDraw2VisualSettings(storage: Storage | undefined, settings: Draw2VisualSettings): void {
  if (storage === undefined) return;
  try {
    storage.setItem(DRAW2_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeDraw2VisualSettings(settings)));
  } catch {
    // Private browsing or a blocked storage area must not stop the editor.
  }
}
