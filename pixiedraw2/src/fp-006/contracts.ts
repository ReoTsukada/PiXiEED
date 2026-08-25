/**
 * FP-006 Draw2 input, device, and UX contracts.
 *
 * This package deliberately has no DOM, Canvas, framework, storage, network,
 * or current-site imports. Browser and native hosts adapt their events into
 * these stable records instead of creating a second editor state model.
 */

export type PointerPhase =
  | "down"
  | "move"
  | "up"
  | "cancel"
  | "lost_capture"
  | "browser_interrupt";
export type PointerType = "mouse" | "touch" | "pen" | "unknown";
export type InputTarget =
  | "canvas"
  | "viewport"
  | "panel"
  | "timeline"
  | "outside";
export type GestureOwner =
  | "idle"
  | "draw"
  | "pan"
  | "pinch"
  | "panel_scroll"
  | "timeline";
export type DrawTool = "pen" | "eraser";
export type InteractionTool =
  | DrawTool
  | "pixel-pen"
  | "line"
  | "rect"
  | "rect-fill"
  | "ellipse"
  | "ellipse-fill"
  | "circle"
  | "circle-fill"
  | "fill"
  | "eyedropper"
  | "select-rect"
  | "select-ellipse"
  | "select-lasso"
  | "select-color"
  | "select-polygon"
  | "move"
  | "tile-stamp"
  | "pan";

/**
 * Transient editor input state. This is an adapter-level state, not a second
 * Project/Command/Revision model. GestureOwner remains the FP-006 ownership
 * authority; this enum makes the editor-facing state explicit.
 */
export type EditorInteractionState =
  | "IDLE"
  | "DRAWING"
  | "SHAPE_PREVIEW"
  | "SELECTING"
  | "TRANSFORMING"
  | "PANNING"
  | "ZOOMING"
  | "PICKING"
  | "TIMELINE"
  | "PANEL";

export function editorInteractionStateFor(
  tool: InteractionTool,
  owner: GestureOwner,
): EditorInteractionState {
  if (owner === "panel_scroll") return "PANEL";
  if (owner === "timeline") return "TIMELINE";
  if (owner === "pinch") return "ZOOMING";
  if (owner === "pan") return "PANNING";
  if (owner === "idle") return "IDLE";
  if (tool === "pan") return "PANNING";
  if (tool === "eyedropper") return "PICKING";
  if (
    tool === "select-rect" || tool === "select-ellipse" ||
    tool === "select-lasso" || tool === "select-color" ||
    tool === "select-polygon" || tool === "move"
  ) return "SELECTING";
  if (
    tool === "line" || tool === "rect" || tool === "rect-fill" ||
    tool === "ellipse" || tool === "ellipse-fill" || tool === "circle" ||
    tool === "circle-fill"
  ) return "SHAPE_PREVIEW";
  return "DRAWING";
}

export interface PointerSample {
  readonly pointerId: number;
  readonly phase: PointerPhase;
  readonly pointerType: PointerType;
  readonly target: InputTarget;
  readonly isPrimary: boolean;
  readonly button: number;
  readonly buttons: number;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timeMs: number;
}

export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timeMs: number;
}

export interface StrokeRecord {
  readonly strokeId: string;
  readonly pointerId: number;
  readonly tool: InteractionTool;
  readonly points: readonly StrokePoint[];
  readonly startedAtMs: number;
  readonly endedAtMs: number;
}

export type InputEventKind =
  | "stroke_started"
  | "stroke_sampled"
  | "stroke_committed"
  | "stroke_cancelled"
  | "gesture_started"
  | "gesture_changed"
  | "gesture_ended"
  | "pointer_ignored";

export interface InputEvent {
  readonly kind: InputEventKind;
  readonly owner: GestureOwner;
  readonly pointerId?: number;
  readonly stroke?: StrokeRecord;
  readonly reason?: string;
}

export interface InputSnapshot {
  readonly owner: GestureOwner;
  readonly interactionState: EditorInteractionState;
  readonly activePointerIds: readonly number[];
  readonly activeStrokeId?: string;
  readonly activeStrokePointCount: number;
  readonly committedStrokeCount: number;
  readonly cancelledStrokeCount: number;
  readonly captureReleaseCount: number;
}

export interface DeviceCapabilities {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pointerCoarse: boolean;
  readonly pointerFine: boolean;
  readonly hover: boolean;
  readonly touch: boolean;
  readonly stylusCandidate: boolean;
  readonly orientation: "portrait" | "landscape";
  readonly safeArea: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly textScale: number;
  readonly imeVisible: boolean;
  readonly reducedMotion: boolean;
  readonly host: "browser" | "native" | "unknown";
}

export type DeviceProfile =
  | "desktop"
  | "tablet"
  | "mobile"
  | "split"
  | "unknown";

export interface DeviceProfileResult {
  readonly profile: DeviceProfile;
  readonly capabilities: DeviceCapabilities;
  readonly diagnostics: readonly DeviceDiagnostic[];
  readonly failClosed: boolean;
  readonly canvasFirst: boolean;
  readonly pageScrollAllowed: false;
  readonly minimumTouchTargetPx: 36 | 44;
}

export type DeviceDiagnosticCode =
  | "VIEWPORT_INVALID"
  | "SAFE_AREA_INVALID"
  | "TEXT_SCALE_INVALID"
  | "ORIENTATION_MISMATCH"
  | "CAPABILITY_AMBIGUOUS"
  | "IME_REQUIRES_INTERNAL_SCROLL"
  | "PAGE_SCROLL_FORBIDDEN"
  | "PHYSICAL_DEVICE_UNTESTED"
  | "STYLUS_UNTESTED";

export interface DeviceDiagnostic {
  readonly code: DeviceDiagnosticCode;
  readonly severity: "warning" | "error";
  readonly message: string;
}

export interface HotPathTrace {
  readonly strokeId: string;
  readonly pointerSamples: number;
  readonly canvasProjectionUpdates: number;
  readonly workspaceUpdates: number;
  readonly timelineUpdates: number;
  readonly layerUpdates: number;
  readonly paletteUpdates: number;
  readonly inspectorUpdates: number;
  readonly fullWorkspaceRerenders: number;
  readonly globalStateWrites: number;
  readonly violations: readonly string[];
}

export interface HotPathSnapshot {
  readonly pointerSamples: number;
  readonly canvasProjectionUpdates: number;
  readonly workspaceUpdates: number;
  readonly timelineUpdates: number;
  readonly layerUpdates: number;
  readonly paletteUpdates: number;
  readonly inspectorUpdates: number;
  readonly fullWorkspaceRerenders: number;
  readonly globalStateWrites: number;
}

export interface IconAction {
  readonly id: string;
  readonly icon: string;
  readonly accessibleName: string;
  readonly tooltip: string;
  readonly helpId: string;
  readonly creationGuideStep?: string;
  readonly shortcut?: string;
  readonly highRisk: boolean;
  readonly visibleLabel?: string;
  readonly disabled: boolean;
  readonly disabledReason?: string;
}

export interface CreationGuideStep {
  readonly id: string;
  readonly title: string;
  readonly actionId: string;
  readonly hint: string;
}

export interface ShortcutContext {
  readonly inputEditing: boolean;
  readonly modalOpen: boolean;
  readonly sheetOpen: boolean;
  readonly imeComposing: boolean;
  readonly disabled: boolean;
}

export interface RecoveryCheckpoint {
  readonly version: 1;
  readonly projectId: string;
  readonly strokeId: string;
  readonly state: "OPEN" | "COMMITTED" | "CANCELLED";
  readonly pointCount: number;
  readonly journalSequence: number;
  readonly createdAtMs: number;
}

export interface RecoveryDecision {
  readonly action: "RESUME" | "DISCARD" | "NOOP";
  readonly reason: string;
}
