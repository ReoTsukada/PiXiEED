import type { HotPathSnapshot, HotPathTrace } from "./contracts.ts";

export class HotPathTraceRecorder {
  readonly #strokeId: string;
  #pointerSamples = 0;
  #canvasProjectionUpdates = 0;
  #workspaceUpdates = 0;
  #timelineUpdates = 0;
  #layerUpdates = 0;
  #paletteUpdates = 0;
  #inspectorUpdates = 0;
  #fullWorkspaceRerenders = 0;
  #globalStateWrites = 0;

  constructor(strokeId: string) {
    this.#strokeId = strokeId;
  }

  recordPointerSample(): void {
    this.#pointerSamples += 1;
    this.#canvasProjectionUpdates += 1;
  }
  recordCanvasProjection(): void {
    this.#canvasProjectionUpdates += 1;
  }
  recordWorkspaceUpdate(): void {
    this.#workspaceUpdates += 1;
  }
  recordTimelineUpdate(): void {
    this.#timelineUpdates += 1;
  }
  recordLayerUpdate(): void {
    this.#layerUpdates += 1;
  }
  recordPaletteUpdate(): void {
    this.#paletteUpdates += 1;
  }
  recordInspectorUpdate(): void {
    this.#inspectorUpdates += 1;
  }
  recordFullWorkspaceRerender(): void {
    this.#fullWorkspaceRerenders += 1;
  }
  recordGlobalStateWrite(): void {
    this.#globalStateWrites += 1;
  }

  snapshot(): HotPathSnapshot {
    return {
      pointerSamples: this.#pointerSamples,
      canvasProjectionUpdates: this.#canvasProjectionUpdates,
      workspaceUpdates: this.#workspaceUpdates,
      timelineUpdates: this.#timelineUpdates,
      layerUpdates: this.#layerUpdates,
      paletteUpdates: this.#paletteUpdates,
      inspectorUpdates: this.#inspectorUpdates,
      fullWorkspaceRerenders: this.#fullWorkspaceRerenders,
      globalStateWrites: this.#globalStateWrites,
    };
  }

  finish(): HotPathTrace {
    const violations: string[] = [];
    if (this.#workspaceUpdates > 0) {
      violations.push("WORKSPACE_UPDATE_ON_STROKE_HOT_PATH");
    }
    if (this.#timelineUpdates > 0) {
      violations.push("TIMELINE_UPDATE_ON_POINTER_SAMPLE");
    }
    if (this.#layerUpdates > 0) {
      violations.push("LAYER_UPDATE_ON_POINTER_SAMPLE");
    }
    if (this.#paletteUpdates > 0) {
      violations.push("PALETTE_UPDATE_ON_POINTER_SAMPLE");
    }
    if (this.#inspectorUpdates > 0) {
      violations.push("INSPECTOR_UPDATE_ON_POINTER_SAMPLE");
    }
    if (this.#fullWorkspaceRerenders > 0) {
      violations.push("FULL_WORKSPACE_RERENDER_ON_STROKE");
    }
    if (this.#globalStateWrites > 0) {
      violations.push("GLOBAL_STATE_WRITE_ON_POINTER_SAMPLE");
    }
    return { strokeId: this.#strokeId, ...this.snapshot(), violations };
  }
}

export function assertHotPathIsolated(trace: HotPathTrace): void {
  if (trace.violations.length > 0) {
    throw new Error(`FP006_HOT_PATH_VIOLATION:${trace.violations.join(",")}`);
  }
  if (
    trace.pointerSamples > 0 &&
    trace.canvasProjectionUpdates < trace.pointerSamples
  ) throw new Error("FP006_MISSING_CANVAS_PROJECTION");
}
