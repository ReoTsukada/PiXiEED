/**
 * AUDIO-230 host-neutral workspace contracts.
 *
 * This layer describes UI intent and bounded projections only. It must not
 * import DOM, AudioContext, network, filesystem, storage, or native adapters.
 */

export const AUDIO230_SCHEMA_VERSION = "AUDIO-230_V1" as const;

export type Audio230Mode = "DESKTOP" | "TABLET" | "MOBILE";
export type Audio230Panel =
  | "PROJECT_TRACKS"
  | "TIMELINE"
  | "INSPECTOR_MIXER"
  | "OUTPUT_DIAGNOSTIC";
export type Audio230PanelVisibility = "HIDDEN" | "LAZY" | "MOUNTED" | "ACTIVE";
export type Audio230FocusTarget =
  | "canvas"
  | "timeline"
  | "track-list"
  | "inspector"
  | "mixer"
  | "output"
  | "panel-toggle";

export interface Audio230Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export type Audio230Result<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Audio230Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Audio230Diagnostic[] };

export interface Audio230SafeArea {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Audio230Viewport {
  readonly width: number;
  readonly height: number;
  readonly safeArea: Audio230SafeArea;
  readonly textScale: number;
  readonly keyboardInset: number;
}

export interface Audio230Geometry {
  readonly mode: Audio230Mode;
  readonly viewport: Audio230Viewport;
  readonly content: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly regions: Readonly<Record<Audio230Panel | "CANVAS", { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>>;
  readonly pageScroll: { readonly horizontal: false; readonly vertical: false };
  readonly internalScrollOwners: readonly Audio230Panel[];
}

export interface Audio230DeviceClaim {
  readonly kind: "OUTPUT" | "INPUT" | "MIDI";
  readonly id: string;
  readonly label?: string;
  readonly state: "AVAILABLE" | "PERMISSION_REQUIRED" | "UNAVAILABLE";
  readonly channels?: 1 | 2;
  readonly sampleRateHz?: number;
}

export interface Audio230SafeDevice {
  readonly kind: Audio230DeviceClaim["kind"];
  readonly id: string;
  readonly label: string;
  readonly state: Audio230DeviceClaim["state"];
  readonly capabilities: { readonly channels?: 1 | 2; readonly sampleRateHz?: number };
  readonly trust: "CLAIM_ONLY";
}

export interface Audio230PanelState {
  readonly panel: Audio230Panel;
  readonly visibility: Audio230PanelVisibility;
  readonly selectedTab?: string;
  readonly workAllowed: boolean;
  readonly decodeAllowed: boolean;
  readonly networkAllowed: false;
}

export interface Audio230A11yMetadata {
  readonly role: "region" | "application" | "dialog";
  readonly label: string;
  readonly keyboard: readonly string[];
  readonly touchAction: "none" | "pan-x" | "pan-y" | "manipulation";
  readonly focusable: boolean;
  readonly focusRestoreTarget: Audio230FocusTarget | null;
  readonly live: "off" | "polite" | "assertive";
}

export interface Audio230PerformanceCounters {
  readonly projectionCalls: number;
  readonly projectedItems: number;
  readonly waveformBinsRead: number;
  readonly waveformBinsProjected: number;
  readonly panelsMounted: number;
  readonly hiddenHeavyWork: number;
  readonly longTaskMs: number;
}

export interface Audio230WorkspaceProjection {
  readonly schemaVersion: typeof AUDIO230_SCHEMA_VERSION;
  readonly mode: Audio230Mode;
  readonly geometry: Audio230Geometry;
  readonly panels: readonly Audio230PanelState[];
  readonly a11y: Readonly<Record<Audio230Panel | "CANVAS", Audio230A11yMetadata>>;
  readonly counters: Audio230PerformanceCounters;
}
