export type WorkspaceRegion =
  | "topbar"
  | "left_dock"
  | "canvas"
  | "right_dock"
  | "timeline"
  | "drawer"
  | "bottom_sheet"
  | "overlay"
  | "command_palette";

export type PanelKind =
  | "layers"
  | "color"
  | "inspector"
  | "history"
  | "navigator"
  | "assets"
  | "tileset"
  | "advanced"
  | "preview"
  | "export"
  | "game-scene"
  | "game-inspector"
  | "game-assets"
  | "game-build"
  | "audio"
  | "audio-inspector"
  | "audio-library"
  | "audio-preview";

/**
 * PC has three product surfaces.  The legacy six-mode Creator state remains
 * available to the mobile/fixture projections, while this contract keeps the
 * desktop shell intentionally specialized and mutually exclusive.
 */
export type DesktopCreatorMode = "DRAW" | "GAME" | "AUDIO";
export type CreatorModeFamily = "draw" | "game" | "audio";
export type DesktopModeTimelineSurface = "draw" | "game" | "audio";

export interface DesktopCreatorModeProfile {
  readonly mode: DesktopCreatorMode;
  readonly family: CreatorModeFamily;
  readonly defaultPanel: PanelKind;
  readonly allowedPanels: readonly PanelKind[];
  readonly showPalette: boolean;
  readonly showTimeline: boolean;
  readonly timelineSurface: DesktopModeTimelineSurface;
  readonly showDrawingTools: boolean;
  readonly summary: string;
}

const DRAW_DESKTOP_PANELS: readonly PanelKind[] = [
  "color",
  "layers",
  "inspector",
  "assets",
  "tileset",
  "advanced",
  "preview",
  "export",
];

export const DESKTOP_CREATOR_MODE_PROFILES: Readonly<
  Record<DesktopCreatorMode, DesktopCreatorModeProfile>
> = {
  DRAW: {
    mode: "DRAW",
    family: "draw",
    defaultPanel: "color",
    allowedPanels: DRAW_DESKTOP_PANELS,
    showPalette: true,
    showTimeline: true,
    timelineSurface: "draw",
    showDrawingTools: true,
    summary: "Draw + Animation",
  },
  GAME: {
    mode: "GAME",
    family: "game",
    defaultPanel: "preview",
    allowedPanels: [
      "preview",
      "game-scene",
      "game-inspector",
      "game-assets",
      "game-build",
      "export",
    ],
    showPalette: false,
    showTimeline: true,
    timelineSurface: "game",
    showDrawingTools: false,
    summary: "Play workspace",
  },
  AUDIO: {
    mode: "AUDIO",
    family: "audio",
    defaultPanel: "audio",
    allowedPanels: [
      "audio",
      "audio-inspector",
      "audio-library",
      "audio-preview",
      "export",
    ],
    showPalette: false,
    showTimeline: true,
    timelineSurface: "audio",
    showDrawingTools: false,
    summary: "Audio workspace",
  },
};

export function isDesktopCreatorMode(
  value: string,
): value is DesktopCreatorMode {
  return value === "DRAW" || value === "GAME" || value === "AUDIO";
}

export function resolveDesktopCreatorModeProfile(
  mode: DesktopCreatorMode,
): DesktopCreatorModeProfile {
  return DESKTOP_CREATOR_MODE_PROFILES[mode];
}

export type PanelMountState = "hidden" | "mounted" | "active";
export type WorkspacePreset = "professional" | "canvas_first" | "tablet_focus";
export type ThemeMode = "light" | "dark" | "system";
export type WorkspaceDetailMode = "guided" | "detailed";
export type PresentationProfile = "desktop" | "tablet" | "mobile" | "split";
export type TabletOrientation = "portrait" | "landscape";
export type TabletContextSurface = "compact_dock" | "split_deck";
export type TabletDeckSurface = "split" | "timeline";
export const TABLET_SQUARE_CONTROL_SIZE = 44 as const;
export const TABLET_PORTRAIT_DECK_CONTROLS = [
  "color",
  "layers",
  "timeline",
  "tags",
  "markers",
  "audio",
] as const;

export function resolveWorkspaceDetailMode(
  value: unknown,
  fallback: WorkspaceDetailMode = "guided",
): WorkspaceDetailMode {
  return value === "guided" || value === "detailed" ? value : fallback;
}

export type WorkspaceTool =
  | "pen"
  | "eraser"
  | "fill"
  | "select"
  | "pan"
  | "line"
  | "rect"
  | "rect-fill"
  | "ellipse"
  | "ellipse-fill"
  | "circle"
  | "circle-fill"
  | "eyedropper"
  | "select-ellipse"
  | "select-color"
  | "select-lasso";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DeviceCapabilityInput {
  width: number;
  height: number;
  pointerCoarse: boolean;
  pointerFine: boolean;
  hover: boolean;
  touch: boolean;
  stylusCandidate: boolean;
  orientation: "portrait" | "landscape";
  safeArea: SafeAreaInsets;
}

export interface WorkspaceCapabilityProfile extends DeviceCapabilityInput {
  profile: PresentationProfile;
  splitView: boolean;
}

/**
 * Tablet is a presentation projection over the shared Core.  It deliberately
 * describes surfaces, not Project/PXD state, so a profile change cannot imply
 * a second raster, timeline, or undo store.
 */
export interface TabletPresentationProjection {
  profile: "tablet" | "split";
  orientation: TabletOrientation;
  toolRail: "shell_fixed";
  canvas: "primary";
  contextSurface: TabletContextSurface;
  timeline: "resizable" | "on_demand";
  maxActiveContextPanels: 1;
}

export interface CoalescedNotifier {
  request(): void;
  cancel(): void;
  pending(): boolean;
}

export interface WorkspaceState {
  readonly schemaVersion: 1;
  readonly preset: WorkspacePreset;
  readonly activePanel: PanelKind;
  readonly openPanels: ReadonlySet<PanelKind>;
  readonly panelSizes: Readonly<Record<WorkspaceRegion, number>>;
  readonly mobileSheetOpen: boolean;
  readonly timelineScroll: number;
  readonly activeTab: string;
  readonly localTool: WorkspaceTool;
  readonly localZoom: number;
  readonly hoverTarget?: string;
}

export interface WorkspaceStateSnapshot {
  preset: WorkspacePreset;
  activePanel: PanelKind;
  openPanels: PanelKind[];
  panelSizes: Record<WorkspaceRegion, number>;
  mobileSheetOpen: boolean;
  timelineScroll: number;
  activeTab: string;
  localTool: WorkspaceState["localTool"];
  localZoom: number;
  hoverTarget?: string;
}

export interface PanelMountRecord {
  panel: PanelKind;
  state: PanelMountState;
  mountCount: number;
  activeCount: number;
}

export interface VirtualizationMetrics {
  totalItems: number;
  visibleItems: number;
  overscan: number;
  mountedItems: number;
  startIndex: number;
  endIndex: number;
  itemSize: number;
}

export interface WorkspaceHotPathMetrics {
  pointerSamples: number;
  canvasProjectionUpdates: number;
  workspaceUpdates: number;
  timelineUpdates: number;
  layerUpdates: number;
  coreRecreationCount: number;
}

export interface WorkspaceCommandContext {
  readonly modalOpen: boolean;
  readonly sheetOpen: boolean;
  readonly inputEditing: boolean;
  readonly imeComposing: boolean;
}

export interface WorkspaceCommand {
  id: string;
  version: 1;
  label: string;
  shortcut?: string;
  regions: WorkspaceRegion[];
}

export interface ShortcutResolution {
  commandId: string;
  prevented: boolean;
}

export type InputOwner =
  | "canvas"
  | "viewport"
  | "selection"
  | "timeline"
  | "workspace"
  | "panel"
  | "page";

const DEFAULT_PANEL_SIZES: Record<WorkspaceRegion, number> = {
  topbar: 56,
  left_dock: 56,
  canvas: 1,
  right_dock: 300,
  timeline: 220,
  drawer: 360,
  bottom_sheet: 360,
  overlay: 0,
  command_palette: 480,
};

export function createWorkspaceState(): WorkspaceState {
  return {
    schemaVersion: 1,
    preset: "professional",
    activePanel: "color",
    openPanels: new Set<PanelKind>(["color"]),
    panelSizes: { ...DEFAULT_PANEL_SIZES },
    mobileSheetOpen: false,
    timelineScroll: 0,
    activeTab: "color",
    localTool: "pen",
    localZoom: 1,
  };
}

export function snapshotWorkspaceState(
  state: WorkspaceState,
): WorkspaceStateSnapshot {
  return {
    preset: state.preset,
    activePanel: state.activePanel,
    openPanels: [...state.openPanels],
    panelSizes: { ...state.panelSizes },
    mobileSheetOpen: state.mobileSheetOpen,
    timelineScroll: state.timelineScroll,
    activeTab: state.activeTab,
    localTool: state.localTool,
    localZoom: state.localZoom,
    ...(state.hoverTarget === undefined
      ? {}
      : { hoverTarget: state.hoverTarget }),
  };
}

export function resolvePresentationProfile(
  input: DeviceCapabilityInput,
): WorkspaceCapabilityProfile {
  const narrow = input.width < 700;
  const tablet = input.width >= 700 && input.width < 1120;
  const splitView = input.width >= 700 && input.width < 980 &&
    input.height < input.width;
  const profile: PresentationProfile = narrow
    ? "mobile"
    : splitView
    ? "split"
    : tablet || (input.pointerCoarse && !input.hover)
    ? "tablet"
    : "desktop";
  return { ...input, profile, splitView };
}

export function projectTabletPresentation(
  profile: WorkspaceCapabilityProfile,
): TabletPresentationProjection | undefined {
  if (profile.profile !== "tablet" && profile.profile !== "split") {
    return undefined;
  }
  const landscape = profile.orientation === "landscape" ||
    profile.profile === "split";
  return {
    profile: profile.profile,
    orientation: landscape ? "landscape" : "portrait",
    toolRail: "shell_fixed",
    canvas: "primary",
    contextSurface: landscape ? "compact_dock" : "split_deck",
    timeline: landscape ? "resizable" : "on_demand",
    maxActiveContextPanels: 1,
  };
}

/** Only one heavy Tablet Portrait deck surface is active at a time. */
export function resolveTabletDeckSurface(
  timelineActive: boolean,
): TabletDeckSurface {
  return timelineActive ? "timeline" : "split";
}

/** Coalesce resize/orientation notifications without retaining a stale callback. */
export function createCoalescedNotifier(
  schedule: (callback: () => void) => number,
  cancelScheduled: (handle: number) => void,
  notify: () => void,
): CoalescedNotifier {
  let handle: number | undefined;
  const request = (): void => {
    if (handle !== undefined) return;
    handle = schedule(() => {
      handle = undefined;
      notify();
    });
  };
  return {
    request,
    cancel: (): void => {
      if (handle === undefined) return;
      cancelScheduled(handle);
      handle = undefined;
    },
    pending: (): boolean => handle !== undefined,
  };
}

/** Closed groups contribute no visible or interactive flyout surface. */
export function countVisibleToolPopovers(
  groupOpenStates: readonly boolean[],
): number {
  return groupOpenStates.reduce((count, open) => count + (open ? 1 : 0), 0);
}

export function calculateBoundedWindow(
  totalItems: number,
  itemSize: number,
  scrollOffset: number,
  viewportSize: number,
  overscan: number,
): VirtualizationMetrics {
  const total = Math.max(0, Math.floor(totalItems));
  const size = Math.max(1, itemSize);
  const viewport = Math.max(0, viewportSize);
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const firstVisible = Math.min(
    total,
    Math.max(0, Math.floor(Math.max(0, scrollOffset) / size)),
  );
  const visibleCount = Math.min(
    total - firstVisible,
    Math.max(0, Math.ceil(viewport / size)),
  );
  const startIndex = Math.max(0, firstVisible - safeOverscan);
  const endIndex = Math.min(total, firstVisible + visibleCount + safeOverscan);
  return {
    totalItems: total,
    visibleItems: visibleCount,
    overscan: safeOverscan,
    mountedItems: Math.max(0, endIndex - startIndex),
    startIndex,
    endIndex,
    itemSize: size,
  };
}

export function createWorkspaceHotPathMetrics(): WorkspaceHotPathMetrics {
  return {
    pointerSamples: 0,
    canvasProjectionUpdates: 0,
    workspaceUpdates: 0,
    timelineUpdates: 0,
    layerUpdates: 0,
    coreRecreationCount: 0,
  };
}

export function recordPointerSample(metrics: WorkspaceHotPathMetrics): void {
  metrics.pointerSamples += 1;
}

export function recordCanvasProjection(metrics: WorkspaceHotPathMetrics): void {
  metrics.canvasProjectionUpdates += 1;
}

export function recordWorkspaceUpdate(
  metrics: WorkspaceHotPathMetrics,
  regions: WorkspaceRegion[] = [],
): void {
  metrics.workspaceUpdates += 1;
  if (regions.includes("timeline")) metrics.timelineUpdates += 1;
  if (regions.includes("right_dock")) metrics.layerUpdates += 1;
}

export function transitionPanelMount(
  record: PanelMountRecord,
  next: PanelMountState,
): PanelMountRecord {
  if (record.state === next) return { ...record };
  return {
    ...record,
    state: next,
    mountCount: record.state === "hidden" && next !== "hidden"
      ? record.mountCount + 1
      : record.mountCount,
    activeCount: next === "active"
      ? record.activeCount + 1
      : record.activeCount,
  };
}

export function createPanelMountRecord(panel: PanelKind): PanelMountRecord {
  return { panel, state: "hidden", mountCount: 0, activeCount: 0 };
}

export function createWorkspaceCommandRegistry(
  commands: WorkspaceCommand[],
): ReadonlyMap<string, WorkspaceCommand> {
  const registry = new Map<string, WorkspaceCommand>();
  for (const command of commands) {
    if (command.version !== 1 || registry.has(command.id)) continue;
    registry.set(command.id, { ...command, regions: [...command.regions] });
  }
  return registry;
}

export function resolveShortcut(
  key: string,
  modifiers: { meta: boolean; ctrl: boolean; shift: boolean; alt: boolean },
  context: WorkspaceCommandContext,
  registry: ReadonlyMap<string, WorkspaceCommand>,
): ShortcutResolution | undefined {
  if (
    context.modalOpen || context.sheetOpen || context.inputEditing ||
    context.imeComposing
  ) return undefined;
  const normalized = `${modifiers.meta || modifiers.ctrl ? "mod+" : ""}${
    modifiers.shift ? "shift+" : ""
  }${modifiers.alt ? "alt+" : ""}${key.toLowerCase()}`;
  for (const command of registry.values()) {
    if (command.shortcut?.toLowerCase() === normalized) {
      return { commandId: command.id, prevented: true };
    }
  }
  return undefined;
}

export function resolveInputOwner(
  target:
    | "canvas"
    | "viewport"
    | "selection"
    | "timeline"
    | "resize"
    | "panel"
    | "page",
): InputOwner {
  if (target === "resize") return "workspace";
  return target;
}

export function isWorkspaceOnlyStateKey(key: string): boolean {
  return new Set([
    "preset",
    "activePanel",
    "openPanels",
    "panelSizes",
    "mobileSheetOpen",
    "timelineScroll",
    "activeTab",
    "localTool",
    "localZoom",
    "hoverTarget",
  ]).has(key);
}
