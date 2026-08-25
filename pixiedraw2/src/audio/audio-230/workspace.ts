import type { Audio230A11yMetadata, Audio230FocusTarget, Audio230Geometry, Audio230Panel, Audio230PanelState, Audio230Result, Audio230WorkspaceProjection } from "./contracts.ts";
import { AUDIO230_SCHEMA_VERSION } from "./contracts.ts";

const panels: readonly Audio230Panel[] = ["PROJECT_TRACKS", "TIMELINE", "INSPECTOR_MIXER", "OUTPUT_DIAGNOSTIC"];
const names: Record<Audio230Panel | "CANVAS", string> = { CANVAS: "Audio canvas preview", PROJECT_TRACKS: "Project and tracks", TIMELINE: "Audio timeline", INSPECTOR_MIXER: "Inspector and mixer", OUTPUT_DIAGNOSTIC: "Output and diagnostics" };
const a11y = (region: keyof typeof names, focusRestoreTarget: Audio230FocusTarget | null): Audio230A11yMetadata => ({ role: region === "CANVAS" ? "application" : "region", label: names[region], keyboard: region === "TIMELINE" ? ["ArrowLeft", "ArrowRight", "Home", "End", "Space"] : ["Enter", "Escape", "Tab"], touchAction: region === "CANVAS" ? "none" : "manipulation", focusable: true, focusRestoreTarget, live: region === "OUTPUT_DIAGNOSTIC" ? "polite" : "off" });

export function createAudio230Workspace(geometry: Audio230Geometry, activePanel: Audio230Panel | null = geometry.mode === "DESKTOP" ? "TIMELINE" : null): Audio230Result<Audio230WorkspaceProjection> {
  if (geometry.pageScroll.horizontal || geometry.pageScroll.vertical) return { ok: false, diagnostics: [{ code: "AUDIO230_PAGE_SCROLL", message: "Workspace requires page-level scroll to remain disabled." }] };
  if (activePanel !== null && !panels.includes(activePanel)) return { ok: false, diagnostics: [{ code: "AUDIO230_INVALID_FOCUS", message: "Active panel is not in the canonical panel set.", path: "activePanel" }] };
  const panelStates: Audio230PanelState[] = panels.map((panel) => {
    const visible = geometry.regions[panel].width > 0 && geometry.regions[panel].height > 0;
    const active = panel === activePanel && visible;
    return { panel, visibility: active ? "ACTIVE" : visible ? "MOUNTED" : "LAZY", workAllowed: active, decodeAllowed: active && panel === "TIMELINE", networkAllowed: false };
  });
  const metadata = { CANVAS: a11y("CANVAS", "canvas"), PROJECT_TRACKS: a11y("PROJECT_TRACKS", "track-list"), TIMELINE: a11y("TIMELINE", "timeline"), INSPECTOR_MIXER: a11y("INSPECTOR_MIXER", "inspector"), OUTPUT_DIAGNOSTIC: a11y("OUTPUT_DIAGNOSTIC", "output") };
  return { ok: true, value: { schemaVersion: AUDIO230_SCHEMA_VERSION, mode: geometry.mode, geometry, panels: panelStates, a11y: metadata, counters: { projectionCalls: 0, projectedItems: 0, waveformBinsRead: 0, waveformBinsProjected: 0, panelsMounted: panelStates.filter((panel) => panel.visibility === "MOUNTED" || panel.visibility === "ACTIVE").length, hiddenHeavyWork: 0, longTaskMs: 0 } }, diagnostics: [] };
}

export function restoreAudio230Focus(target: Audio230FocusTarget | null, available: readonly Audio230FocusTarget[]): Audio230Result<Audio230FocusTarget> {
  if (target === null || !available.includes(target)) return { ok: false, diagnostics: [{ code: "AUDIO230_INVALID_FOCUS", message: "Focus restore target is unavailable; focus must remain fail-closed." }] };
  return { ok: true, value: target, diagnostics: [] };
}
