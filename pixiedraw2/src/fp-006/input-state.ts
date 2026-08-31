import { editorInteractionStateFor } from "./contracts.ts";
import type {
  GestureOwner,
  InputEvent,
  InputSnapshot,
  InteractionTool,
  PointerSample,
  RecoveryCheckpoint,
  StrokePoint,
  StrokeRecord,
} from "./contracts.ts";

export interface StrokeInputOptions {
  readonly tool?: InteractionTool;
  readonly nextStrokeId?: () => string;
}

function normalizedPressure(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.min(1, value) : 0.5;
}

function pointFrom(sample: PointerSample): StrokePoint {
  return {
    x: sample.x,
    y: sample.y,
    pressure: normalizedPressure(sample.pressure),
    timeMs: sample.timeMs,
  };
}

/**
 * DOM-free pointer ownership state machine for Canvas adapters.
 * A second touch pointer cancels an uncommitted stroke before owning Pinch;
 * capture loss/browser interruption always cancels without producing a write.
 */
export class StrokeInputController {
  readonly #tool: InteractionTool;
  readonly #nextStrokeId: () => string;
  readonly #pointers = new Map<number, PointerSample>();
  #owner: GestureOwner = "idle";
  #stroke: {
    id: string;
    pointerId: number;
    points: StrokePoint[];
    startedAtMs: number;
  } | undefined;
  #committedStrokeCount = 0;
  #cancelledStrokeCount = 0;
  #captureReleaseCount = 0;

  constructor(options: StrokeInputOptions = {}) {
    this.#tool = options.tool ?? "pen";
    let sequence = 0;
    this.#nextStrokeId = options.nextStrokeId ??
      (() => `fp006-stroke-${++sequence}`);
  }

  get owner(): GestureOwner {
    return this.#owner;
  }

  get interactionState(): InputSnapshot["interactionState"] {
    return editorInteractionStateFor(this.#tool, this.#owner);
  }

  /** Cancel the active transient input without creating a commit. */
  cancel(reason = "EXPLICIT_CANCEL"): readonly InputEvent[] {
    const events = this.#stroke === undefined ? [] : this.#cancelStroke(reason);
    this.#pointers.clear();
    this.#owner = "idle";
    return events;
  }

  handle(sample: PointerSample): readonly InputEvent[] {
    const events: InputEvent[] = [];
    if (!Number.isSafeInteger(sample.pointerId) || sample.pointerId < 0) {
      return [{
        kind: "pointer_ignored",
        owner: this.#owner,
        reason: "INVALID_POINTER_ID",
      }];
    }
    if (sample.phase === "down") return this.#down(sample);
    if (sample.phase === "move") return this.#move(sample);
    if (sample.phase === "up") return this.#up(sample);
    if (
      sample.phase === "cancel" || sample.phase === "lost_capture" ||
      sample.phase === "browser_interrupt"
    ) {
      if (this.#stroke?.pointerId === sample.pointerId) {
        const reason = sample.phase === "lost_capture"
          ? "LOST_POINTER_CAPTURE"
          : sample.phase === "browser_interrupt"
          ? "BROWSER_INTERRUPTION"
          : "POINTER_CANCELLED";
        events.push(...this.#cancelStroke(reason));
      } else if (this.#owner === "pinch" || this.#owner === "pan") {
        this.#pointers.delete(sample.pointerId);
        if (this.#pointers.size === 0) {
          this.#owner = "idle";
          events.push({
            kind: "gesture_ended",
            owner: "idle",
            pointerId: sample.pointerId,
          });
        }
      }
      this.#pointers.delete(sample.pointerId);
      return events;
    }
    return events;
  }

  snapshot(): InputSnapshot {
    return {
      owner: this.#owner,
      interactionState: this.interactionState,
      activePointerIds: [...this.#pointers.keys()].sort((a, b) => a - b),
      ...(this.#stroke === undefined
        ? {}
        : { activeStrokeId: this.#stroke.id }),
      activeStrokePointCount: this.#stroke?.points.length ?? 0,
      committedStrokeCount: this.#committedStrokeCount,
      cancelledStrokeCount: this.#cancelledStrokeCount,
      captureReleaseCount: this.#captureReleaseCount,
    };
  }

  recover(checkpoint: RecoveryCheckpoint): "RESUME" | "DISCARD" | "NOOP" {
    if (
      checkpoint.version !== 1 || checkpoint.state === "COMMITTED" ||
      checkpoint.state === "CANCELLED"
    ) return "NOOP";
    return checkpoint.pointCount > 0 ? "DISCARD" : "NOOP";
  }

  #down(sample: PointerSample): readonly InputEvent[] {
    this.#pointers.set(sample.pointerId, sample);
    if (
      this.#owner === "draw" && this.#stroke !== undefined &&
      sample.pointerId !== this.#stroke.pointerId &&
      sample.pointerType === "touch"
    ) {
      const cancelled = this.#cancelStroke("SECOND_POINTER_SWITCH_TO_PINCH");
      this.#owner = "pinch";
      return [...cancelled, {
        kind: "gesture_started",
        owner: "pinch",
        pointerId: sample.pointerId,
      }];
    }
    if (sample.target === "panel") {
      this.#owner = "panel_scroll";
      return [{
        kind: "gesture_started",
        owner: "panel_scroll",
        pointerId: sample.pointerId,
      }];
    }
    if (sample.target === "timeline") {
      this.#owner = "timeline";
      return [{
        kind: "gesture_started",
        owner: "timeline",
        pointerId: sample.pointerId,
      }];
    }
    if (sample.target !== "canvas" && sample.target !== "viewport") {
      return [{
        kind: "pointer_ignored",
        owner: this.#owner,
        pointerId: sample.pointerId,
        reason: "TARGET_NOT_OWNED",
      }];
    }
    if (sample.pointerType === "touch" && !sample.isPrimary) {
      this.#owner = "pinch";
      return [{
        kind: "gesture_started",
        owner: "pinch",
        pointerId: sample.pointerId,
      }];
    }
    if (this.#owner !== "idle") {
      return [{
        kind: "pointer_ignored",
        owner: this.#owner,
        pointerId: sample.pointerId,
        reason: "OWNER_ALREADY_ASSIGNED",
      }];
    }
    if (sample.button !== 0 && sample.pointerType !== "touch") {
      return [{
        kind: "pointer_ignored",
        owner: "idle",
        pointerId: sample.pointerId,
        reason: "NON_PRIMARY_BUTTON",
      }];
    }
    this.#owner = "draw";
    this.#stroke = {
      id: this.#nextStrokeId(),
      pointerId: sample.pointerId,
      points: [pointFrom(sample)],
      startedAtMs: sample.timeMs,
    };
    return [{
      kind: "stroke_started",
      owner: "draw",
      pointerId: sample.pointerId,
      reason: this.#tool,
    }];
  }

  #move(sample: PointerSample): readonly InputEvent[] {
    if (
      this.#owner === "draw" && this.#stroke?.pointerId === sample.pointerId
    ) {
      if ((sample.buttons & 1) === 0) {
        return this.#cancelStroke("BUTTON_RELEASE_WITHOUT_POINTERUP");
      }
      const point = pointFrom(sample);
      const previous = this.#stroke.points[this.#stroke.points.length - 1];
      if (
        previous?.x === point.x && previous.y === point.y &&
        previous.pressure === point.pressure
      ) return [];
      this.#stroke.points.push(point);
      this.#pointers.set(sample.pointerId, sample);
      return [{
        kind: "stroke_sampled",
        owner: "draw",
        pointerId: sample.pointerId,
      }];
    }
    if (
      this.#owner === "pinch" || this.#owner === "pan" ||
      this.#owner === "panel_scroll" || this.#owner === "timeline"
    ) {
      this.#pointers.set(sample.pointerId, sample);
      return [{
        kind: "gesture_changed",
        owner: this.#owner,
        pointerId: sample.pointerId,
      }];
    }
    return [];
  }

  #up(sample: PointerSample): readonly InputEvent[] {
    if (
      this.#owner === "draw" && this.#stroke?.pointerId === sample.pointerId
    ) {
      const point = pointFrom(sample);
      const previous = this.#stroke.points[this.#stroke.points.length - 1];
      if (
        previous?.x !== point.x || previous.y !== point.y ||
        previous.pressure !== point.pressure
      ) this.#stroke.points.push(point);
      const stroke: StrokeRecord = {
        strokeId: this.#stroke.id,
        pointerId: sample.pointerId,
        tool: this.#tool,
        points: [...this.#stroke.points],
        startedAtMs: this.#stroke.startedAtMs,
        endedAtMs: sample.timeMs,
      };
      this.#stroke = undefined;
      this.#pointers.delete(sample.pointerId);
      this.#owner = "idle";
      this.#committedStrokeCount += 1;
      this.#captureReleaseCount += 1;
      return [{
        kind: "stroke_committed",
        owner: "draw",
        pointerId: sample.pointerId,
        stroke,
      }];
    }
    this.#pointers.delete(sample.pointerId);
    if (this.#pointers.size === 0) {
      const owner = this.#owner;
      this.#owner = "idle";
      return owner === "idle" ? [] : [{
        kind: "gesture_ended",
        owner: "idle",
        pointerId: sample.pointerId,
      }];
    }
    if (this.#owner === "pinch") {
      this.#owner = "pan";
      return [{
        kind: "gesture_changed",
        owner: "pan",
        pointerId: sample.pointerId,
        reason: "PINCH_TO_PAN",
      }];
    }
    return [];
  }

  #cancelStroke(reason: string): readonly InputEvent[] {
    const pointerId = this.#stroke?.pointerId;
    this.#stroke = undefined;
    this.#cancelledStrokeCount += 1;
    this.#owner = this.#pointers.size > 1 ? "pinch" : "idle";
    this.#captureReleaseCount += 1;
    return [{
      kind: "stroke_cancelled",
      owner: this.#owner,
      ...(pointerId === undefined ? {} : { pointerId }),
      reason,
    }];
  }
}
