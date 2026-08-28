/**
 * Draw2 editor preferences which are safe to restore after a page reload.
 *
 * Canonical pixels, palette entries, frames, layers and history live in the
 * Draw2 IndexedDB subdocument. This file only owns editor-facing preferences;
 * selection previews, clipboard contents, pointer gestures and the active
 * playback session are intentionally not represented here because restoring
 * them can target a stale cel or leave a half-finished operation active.
 * Playback mode and rate are safe editor preferences and are kept below.
 */

export const DRAW2_EDITOR_PREFERENCES_STORAGE_KEY =
  "pixieed:draw2:editor-preferences:v1" as const;

export type Draw2PreferenceMirrorMode = "NONE" | "ON";
export type Draw2PreferenceMirrorAxis =
  | "x"
  | "y"
  | "diagonalDown"
  | "diagonalUp";
export type Draw2PreferenceOnionColorMode = "TINTED" | "ORIGINAL";

export interface Draw2ProjectEditorPreferences {
  readonly selectedColor: number;
  readonly mirrorMode: Draw2PreferenceMirrorMode;
  readonly mirrorAxes: Readonly<Record<Draw2PreferenceMirrorAxis, boolean>>;
  readonly mirrorGuide: {
    readonly x: number;
    readonly y: number;
    readonly diagonalDown: number;
    readonly diagonalUp: number;
  };
  readonly viewport: {
    readonly zoom: number;
    readonly fit: boolean;
    readonly userSelected: boolean;
    readonly panX: number;
    readonly panY: number;
  };
  readonly onionSkin: {
    readonly enabled: boolean;
    readonly previousFrames: number;
    readonly nextFrames: number;
    readonly opacity: number;
    readonly colorMode: Draw2PreferenceOnionColorMode;
  };
}

export interface Draw2EditorPreferences {
  readonly tool: string;
  readonly brushSize: number;
  readonly brushShape: string;
  readonly brushPattern: string;
  readonly similarityPercent: number;
  readonly colorSelectionMode: string;
  readonly playbackLoopMode: string;
  readonly playbackFps: string;
  readonly playbackFpsCustom: number;
  readonly theme: "system" | "light" | "dark";
  readonly projects: Readonly<Record<string, Draw2ProjectEditorPreferences>>;
}

const DEFAULT_PROJECT_PREFERENCES: Draw2ProjectEditorPreferences = {
  selectedColor: 1,
  mirrorMode: "NONE",
  mirrorAxes: {
    x: false,
    y: false,
    diagonalDown: false,
    diagonalUp: false,
  },
  mirrorGuide: {
    x: 0,
    y: 0,
    diagonalDown: 0,
    diagonalUp: 0,
  },
  viewport: {
    zoom: 1,
    fit: true,
    userSelected: false,
    panX: 0,
    panY: 0,
  },
  onionSkin: {
    enabled: false,
    previousFrames: 1,
    nextFrames: 1,
    opacity: 0.5,
    colorMode: "TINTED",
  },
};

export const DEFAULT_DRAW2_EDITOR_PREFERENCES: Draw2EditorPreferences = {
  tool: "pen",
  brushSize: 1,
  brushShape: "square",
  brushPattern: "solid",
  similarityPercent: 0,
  colorSelectionMode: "similar",
  playbackLoopMode: "loop",
  playbackFps: "24",
  playbackFpsCustom: 24,
  theme: "system",
  projects: {},
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.max(
    minimum,
    Math.min(maximum, finiteNumber(value, fallback)),
  );
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.round(boundedNumber(value, minimum, maximum, fallback));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeMirrorAxes(value: unknown): Draw2ProjectEditorPreferences["mirrorAxes"] {
  const source = asRecord(value);
  return {
    x: source.x === true,
    y: source.y === true,
    diagonalDown: source.diagonalDown === true,
    diagonalUp: source.diagonalUp === true,
  };
}

function normalizeProjectPreferences(
  value: unknown,
): Draw2ProjectEditorPreferences {
  const source = asRecord(value);
  const mirrorMode = source.mirrorMode === "ON" ? "ON" : "NONE";
  const mirrorGuide = asRecord(source.mirrorGuide);
  const viewport = asRecord(source.viewport);
  const onionSkin = asRecord(source.onionSkin);
  return {
    selectedColor: boundedInteger(source.selectedColor, 0, 4096, 1),
    mirrorMode,
    mirrorAxes: normalizeMirrorAxes(source.mirrorAxes),
    mirrorGuide: {
      // X/Y are stored in raster-pixel space. Keep a generous bound here and
      // clamp to the active asset dimensions at the Draw2 boundary.
      x: boundedNumber(mirrorGuide.x, -100000, 100000, 0),
      y: boundedNumber(mirrorGuide.y, -100000, 100000, 0),
      diagonalDown: boundedNumber(mirrorGuide.diagonalDown, -1, 1, 0),
      diagonalUp: boundedNumber(mirrorGuide.diagonalUp, -1, 1, 0),
    },
    viewport: {
      zoom: boundedNumber(viewport.zoom, 0.25, 8, 1),
      fit: viewport.fit !== false,
      userSelected: viewport.userSelected === true,
      panX: boundedNumber(viewport.panX, -100000, 100000, 0),
      panY: boundedNumber(viewport.panY, -100000, 100000, 0),
    },
    onionSkin: {
      enabled: onionSkin.enabled === true,
      previousFrames: boundedInteger(onionSkin.previousFrames, 0, 4, 1),
      nextFrames: boundedInteger(onionSkin.nextFrames, 0, 4, 1),
      opacity: boundedNumber(onionSkin.opacity, 0, 1, 0.5),
      colorMode: onionSkin.colorMode === "ORIGINAL" ? "ORIGINAL" : "TINTED",
    },
  };
}

function normalizePreferences(value: unknown): Draw2EditorPreferences {
  const source = asRecord(value);
  const projectsSource = asRecord(source.projects);
  const projects: Record<string, Draw2ProjectEditorPreferences> = {};
  for (const [projectId, project] of Object.entries(projectsSource)) {
    if (projectId.trim().length === 0) continue;
    projects[projectId] = normalizeProjectPreferences(project);
  }
  const theme = source.theme === "light" || source.theme === "dark"
    ? source.theme
    : "system";
  const playbackLoopMode = source.playbackLoopMode === "bounce" ||
      source.playbackLoopMode === "off"
    ? source.playbackLoopMode
    : "loop";
  const playbackFps = typeof source.playbackFps === "string" &&
      ["12", "24", "30", "60", "custom"].includes(source.playbackFps)
    ? source.playbackFps
    : "24";
  return {
    tool: typeof source.tool === "string" ? source.tool : "pen",
    brushSize: boundedInteger(source.brushSize, 1, 32, 1),
    brushShape: typeof source.brushShape === "string"
      ? source.brushShape
      : "square",
    brushPattern: typeof source.brushPattern === "string"
      ? source.brushPattern
      : "solid",
    similarityPercent: boundedInteger(source.similarityPercent, 0, 100, 0),
    colorSelectionMode: typeof source.colorSelectionMode === "string"
      ? source.colorSelectionMode
      : "similar",
    playbackLoopMode,
    playbackFps,
    playbackFpsCustom: boundedInteger(source.playbackFpsCustom, 1, 120, 24),
    theme,
    projects,
  };
}

export function readDraw2EditorPreferences(
  storage: Storage | undefined,
): Draw2EditorPreferences {
  if (storage === undefined) return DEFAULT_DRAW2_EDITOR_PREFERENCES;
  try {
    const raw = storage.getItem(DRAW2_EDITOR_PREFERENCES_STORAGE_KEY);
    return raw === null
      ? DEFAULT_DRAW2_EDITOR_PREFERENCES
      : normalizePreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_DRAW2_EDITOR_PREFERENCES;
  }
}

export function writeDraw2EditorPreferences(
  storage: Storage | undefined,
  preferences: Draw2EditorPreferences,
): void {
  if (storage === undefined) return;
  try {
    storage.setItem(
      DRAW2_EDITOR_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizePreferences(preferences)),
    );
  } catch {
    // A blocked/private storage area must never interrupt drawing.
  }
}

export function draw2ProjectEditorPreferences(
  preferences: Draw2EditorPreferences,
  projectId: string,
): Draw2ProjectEditorPreferences {
  return preferences.projects[projectId] ?? DEFAULT_PROJECT_PREFERENCES;
}

export function withDraw2ProjectEditorPreferences(
  preferences: Draw2EditorPreferences,
  projectId: string,
  projectPreferences: Draw2ProjectEditorPreferences,
): Draw2EditorPreferences {
  return {
    ...preferences,
    projects: {
      ...preferences.projects,
      [projectId]: normalizeProjectPreferences(projectPreferences),
    },
  };
}

export function withoutDraw2ProjectEditorPreferences(
  preferences: Draw2EditorPreferences,
  projectId: string,
): Draw2EditorPreferences {
  const projects = {
    ...preferences.projects,
  } as Record<string, Draw2ProjectEditorPreferences>;
  delete projects[projectId];
  return {
    ...preferences,
    projects,
  };
}
