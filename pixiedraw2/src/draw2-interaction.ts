/**
 * Draw2 Interaction Kernel.
 *
 * ToolSession is transient input state. It is not an EditorCommand and it does
 * not own a Project/asset revision. Preview writes stay in this local session;
 * the commit callback is the only boundary allowed to build a canonical
 * command and journal entry. FP-006 remains the pointer ownership authority.
 */

import {
  type BasicTool,
  type ColoredPixel,
  createWriteSet,
  normalizeToolOptions,
  type RasterBounds,
  stampBrush,
  type ToolOptions,
} from "./draw2-basic-tools.ts";
import {
  interpolatePixelLine,
  MAX_INTERPOLATED_STROKE_PIXELS,
  type PixelPoint,
} from "./draw2-core.ts";
import { StrokeInputController } from "./fp-006/input-state.ts";
import type {
  EditorInteractionState,
  InputEvent,
  InputSnapshot,
  PointerSample,
} from "./fp-006/contracts.ts";

export type TracePolicy = "ACCUMULATE" | "LAST" | "OVERLAP" | "IMMEDIATE";
export type ToolSessionLifecycle =
  | "NEW"
  | "ACTIVE"
  | "COMMITTED"
  | "CANCELLED";

const SHAPE_TOOLS: readonly BasicTool[] = [
  "line",
  "rect",
  "rect-fill",
  "ellipse",
  "ellipse-fill",
  "circle",
  "circle-fill",
];

export function tracePolicyForTool(tool: BasicTool): TracePolicy {
  if (
    tool === "pen" || tool === "eraser" || tool === "pixel-pen" ||
    tool === "select-polygon"
  ) return "ACCUMULATE";
  if (SHAPE_TOOLS.includes(tool)) return "LAST";
  if (
    tool === "eyedropper" || tool === "fill" || tool === "pan" ||
    tool === "tile-stamp"
  ) {
    return "IMMEDIATE";
  }
  if (tool === "text") return "LAST";
  return tool === "select-lasso" ? "ACCUMULATE" : "LAST";
}

export interface ToolSessionOptions {
  readonly sessionId: string;
  readonly tool: BasicTool;
  readonly bounds: RasterBounds;
  readonly colorIndex: number;
  readonly toolOptions?: Partial<ToolOptions>;
  readonly pointerId?: number;
}

export interface ToolSessionSnapshot {
  readonly sessionId: string;
  readonly tool: BasicTool;
  readonly tracePolicy: TracePolicy;
  readonly lifecycle: ToolSessionLifecycle;
  readonly pointerId?: number;
  readonly points: readonly PixelPoint[];
  readonly previewWrites: readonly ColoredPixel[];
}

export interface ToolSessionWriteCommit {
  readonly kind: "write-set";
  readonly sessionId: string;
  readonly tool: BasicTool;
  readonly tracePolicy: TracePolicy;
  readonly sourceOperationType: string;
  readonly colorIndex: number;
  readonly toolOptions: Partial<ToolOptions>;
  readonly points: readonly PixelPoint[];
  readonly writes: readonly ColoredPixel[];
}

export interface ToolSessionImmediateCommit {
  readonly kind: "immediate";
  readonly sessionId: string;
  readonly tool: BasicTool;
  readonly tracePolicy: "IMMEDIATE";
  readonly sourceOperationType: string;
  readonly colorIndex: number;
  readonly toolOptions: Partial<ToolOptions>;
  readonly point: PixelPoint;
  readonly points: readonly PixelPoint[];
}

export type ToolSessionCommit =
  | ToolSessionWriteCommit
  | ToolSessionImmediateCommit;

export type CommitErrorHandler = (
  error: unknown,
  commit: ToolSessionCommit,
) => void | Promise<void>;

/** Shared serialized ingress for canonical commit work across canvas sessions. */
export class SerializedCommitIngress {
  #tail: Promise<void> = Promise.resolve();

  enqueue(
    commit: ToolSessionCommit,
    task: (commit: ToolSessionCommit) => void | Promise<void>,
    onError?: CommitErrorHandler,
  ): void {
    const run = async (): Promise<void> => {
      try {
        await task(commit);
      } catch (error) {
        if (onError !== undefined) await onError(error, commit);
      }
    };
    this.#tail = this.#tail.then(run, run);
  }

  flush(): Promise<void> {
    return this.#tail;
  }
}

export interface ToolSessionCancellation {
  readonly sessionId: string;
  readonly lifecycle: "CANCELLED";
  readonly reason: string;
}

export class ToolSessionLifecycleError extends Error {
  readonly code = "TOOL_SESSION_LIFECYCLE_REJECTED";

  constructor(message: string) {
    super(message);
    this.name = "ToolSessionLifecycleError";
  }
}

function pointFromSample(sample: PointerSample): PixelPoint {
  return { x: sample.x, y: sample.y };
}

function samePoint(left: PixelPoint | undefined, right: PixelPoint): boolean {
  return left?.x === right.x && left.y === right.y;
}

function clampPoint(point: PixelPoint, bounds: RasterBounds): PixelPoint {
  return {
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(point.y))),
  };
}

function previewPointKey(point: PixelPoint): string {
  return `${point.x}:${point.y}`;
}

function isPathPreviewTool(tool: BasicTool): boolean {
  return tool === "pen" || tool === "eraser" || tool === "pixel-pen";
}

function sortedColoredPixels(
  writes: readonly ColoredPixel[],
): readonly ColoredPixel[] {
  return [...writes].sort((left, right) =>
    left.y - right.y || left.x - right.x
  );
}

/** One transient tool lifecycle; it never mutates Canonical Project/Raster. */
export class ToolSession {
  readonly #options: ToolSessionOptions;
  readonly #tracePolicy: TracePolicy;
  readonly #pathPreviewOptions: ToolOptions;
  readonly #points: PixelPoint[] = [];
  readonly #previewWritesCache: ColoredPixel[] = [];
  readonly #previewWriteKeys = new Set<string>();
  #lifecycle: ToolSessionLifecycle = "NEW";
  #previewInterpolatedPixelCount = 0;

  constructor(options: ToolSessionOptions) {
    this.#options = {
      ...options,
      ...(options.toolOptions === undefined
        ? {}
        : { toolOptions: { ...options.toolOptions } }),
    };
    this.#tracePolicy = tracePolicyForTool(options.tool);
    this.#pathPreviewOptions = normalizeToolOptions(
      options.tool === "pixel-pen"
        ? {
          ...(options.toolOptions ?? {}),
          brushSize: 1,
          brushShape: "square",
          pattern: "solid",
        }
        : options.toolOptions,
    );
  }

  get lifecycle(): ToolSessionLifecycle {
    return this.#lifecycle;
  }

  get sessionId(): string {
    return this.#options.sessionId;
  }

  get pointerId(): number | undefined {
    return this.#options.pointerId;
  }

  snapshot(): ToolSessionSnapshot {
    return {
      sessionId: this.#options.sessionId,
      tool: this.#options.tool,
      tracePolicy: this.#tracePolicy,
      lifecycle: this.#lifecycle,
      ...(this.#options.pointerId === undefined
        ? {}
        : { pointerId: this.#options.pointerId }),
      points: [...this.#points],
      previewWrites: this.#previewWrites(),
    };
  }

  begin(point: PixelPoint): ToolSessionSnapshot {
    this.#require("NEW", "begin");
    this.#points.push(point);
    this.#lifecycle = "ACTIVE";
    if (isPathPreviewTool(this.#options.tool)) {
      this.#appendPathPreview(undefined, point);
    }
    return this.snapshot();
  }

  update(point: PixelPoint): ToolSessionSnapshot {
    this.#require("ACTIVE", "update");
    if (!samePoint(this.#points[this.#points.length - 1], point)) {
      const previous = this.#points[this.#points.length - 1];
      this.#points.push(point);
      if (isPathPreviewTool(this.#options.tool)) {
        this.#appendPathPreview(previous, point);
      }
    }
    return this.snapshot();
  }

  commit(): ToolSessionCommit {
    this.#require("ACTIVE", "commit");
    const first = this.#points[0];
    if (first === undefined) {
      throw new ToolSessionLifecycleError(
        "Cannot commit an empty ToolSession.",
      );
    }
    const points = [...this.#points];
    this.#lifecycle = "COMMITTED";
    if (this.#tracePolicy === "IMMEDIATE") {
      return {
        kind: "immediate",
        sessionId: this.#options.sessionId,
        tool: this.#options.tool,
        tracePolicy: "IMMEDIATE",
        sourceOperationType: `tool.${this.#options.tool}`,
        colorIndex: this.#options.colorIndex,
        toolOptions: { ...(this.#options.toolOptions ?? {}) },
        point: points[points.length - 1] ?? first,
        points,
      };
    }
    return {
      kind: "write-set",
      sessionId: this.#options.sessionId,
      tool: this.#options.tool,
      tracePolicy: this.#tracePolicy,
      sourceOperationType: `tool.${this.#options.tool}`,
      colorIndex: this.#options.colorIndex,
      toolOptions: { ...(this.#options.toolOptions ?? {}) },
      points,
      writes: this.#writeSet(),
    };
  }

  cancel(reason: string): ToolSessionCancellation {
    this.#require("ACTIVE", "cancel");
    this.#points.length = 0;
    this.#previewWritesCache.length = 0;
    this.#previewWriteKeys.clear();
    this.#previewInterpolatedPixelCount = 0;
    this.#lifecycle = "CANCELLED";
    return {
      sessionId: this.#options.sessionId,
      lifecycle: "CANCELLED",
      reason,
    };
  }

  #require(expected: ToolSessionLifecycle, action: string): void {
    if (this.#lifecycle !== expected) {
      throw new ToolSessionLifecycleError(
        `${action} rejected for ${this.#lifecycle} ToolSession; expected ${expected}.`,
      );
    }
  }

  #previewWrites(): readonly ColoredPixel[] {
    if (this.#lifecycle !== "ACTIVE" || this.#tracePolicy === "IMMEDIATE") {
      return [];
    }
    if (isPathPreviewTool(this.#options.tool)) {
      return this.#previewWritesCache;
    }
    return this.#writeSet();
  }

  #writeSet(): readonly ColoredPixel[] {
    const first = this.#points[0];
    const last = this.#points[this.#points.length - 1] ?? first;
    if (first === undefined || last === undefined) return [];
    if (this.#tracePolicy === "ACCUMULATE") {
      if (
        this.#options.tool !== "pen" && this.#options.tool !== "eraser" &&
        this.#options.tool !== "pixel-pen"
      ) {
        return [];
      }
      // The transient path is accumulated segment-by-segment as input
      // arrives. Sorting is deferred until commit so pointermove stays close
      // to O(the newly traversed pixels), rather than rebuilding the whole
      // path for every sample.
      return sortedColoredPixels(this.#previewWritesCache);
    }
    return createWriteSet(
      this.#options.tool,
      first,
      last,
      this.#options.colorIndex,
      this.#options.toolOptions ?? {},
      this.#options.bounds,
    );
  }

  #appendPathPreview(
    from: PixelPoint | undefined,
    to: PixelPoint,
  ): void {
    const start = clampPoint(from ?? to, this.#options.bounds);
    const end = clampPoint(to, this.#options.bounds);
    const remaining = MAX_INTERPOLATED_STROKE_PIXELS -
      this.#previewInterpolatedPixelCount;
    if (remaining <= 0) return;
    let segment: readonly PixelPoint[];
    try {
      segment = interpolatePixelLine(
        start,
        end,
        this.#pathPreviewOptions.brushAlgorithm,
      );
    } catch {
      // Preview input is disposable. A malformed or oversized segment must
      // never strand the active pointer session; canonical commit validation
      // remains responsible for rejecting the same invalid gesture.
      return;
    }
    const newSegment = from === undefined ? segment : segment.slice(1);
    const boundedSegment = newSegment.length > remaining
      ? newSegment.slice(0, remaining)
      : newSegment;
    this.#previewInterpolatedPixelCount += boundedSegment.length;
    const colorIndex = this.#options.tool === "eraser"
      ? 0
      : this.#options.colorIndex;
    for (
      const point of stampBrush(
        boundedSegment,
        this.#pathPreviewOptions,
        this.#options.bounds,
      )
    ) {
      const key = previewPointKey(point);
      if (this.#previewWriteKeys.has(key)) continue;
      this.#previewWriteKeys.add(key);
      this.#previewWritesCache.push({ ...point, colorIndex });
    }
  }
}

export interface InteractionKernelOptions
  extends Omit<ToolSessionOptions, "sessionId"> {
  readonly nextSessionId?: () => string;
  readonly onPreview?: (preview: ToolSessionSnapshot | undefined) => void;
  /**
   * Receives the final transient projection before the canonical commit is
   * queued. Adapters can keep that projection visible while async persistence
   * and rendering complete.
   */
  readonly onCommitQueued?: (
    commit: ToolSessionCommit,
    preview: ToolSessionSnapshot,
  ) => void;
  readonly onCommit: (commit: ToolSessionCommit) => void | Promise<void>;
  readonly onCommitError?: CommitErrorHandler;
  readonly commitIngress?: SerializedCommitIngress;
}

export interface InteractionKernelSnapshot {
  readonly editorState: EditorInteractionState;
  readonly input: InputSnapshot;
  readonly session?: ToolSessionSnapshot;
}

/**
 * Composes FP-006 ownership with exactly one ToolSession per canvas gesture.
 * Panel/Timeline input is consumed by FP-006 and cannot create a session.
 */
export class Draw2InteractionKernel {
  readonly #options: InteractionKernelOptions;
  readonly #input: StrokeInputController;
  readonly #commitIngress: SerializedCommitIngress;
  #session: ToolSession | undefined;

  constructor(options: InteractionKernelOptions) {
    this.#options = options;
    this.#commitIngress = options.commitIngress ??
      new SerializedCommitIngress();
    let sequence = 0;
    this.#input = new StrokeInputController({
      tool: options.tool,
      nextStrokeId: options.nextSessionId ??
        (() => `${options.tool}-session-${++sequence}`),
    });
  }

  get input(): StrokeInputController {
    return this.#input;
  }

  get activePointerId(): number | undefined {
    return this.#session?.pointerId;
  }

  get session(): ToolSessionSnapshot | undefined {
    return this.#session?.snapshot();
  }

  flushCommits(): Promise<void> {
    return this.#commitIngress.flush();
  }

  snapshot(): InteractionKernelSnapshot {
    const input = this.#input.snapshot();
    return {
      editorState: input.interactionState,
      input,
      ...(this.#session === undefined
        ? {}
        : { session: this.#session.snapshot() }),
    };
  }

  handle(sample: PointerSample): readonly InputEvent[] {
    const events = this.#input.handle(sample);
    for (const event of events) {
      if (event.kind === "stroke_started") {
        this.#begin(sample);
      } else if (event.kind === "stroke_sampled") {
        this.#update(sample);
      } else if (event.kind === "stroke_committed") {
        this.#update(sample);
        this.#commit();
      } else if (event.kind === "stroke_cancelled") {
        this.#cancelSession(event.reason ?? "INPUT_CANCELLED");
      }
    }
    return events;
  }

  /** Esc/blur/visibilitychange adapter entry point. */
  cancel(reason = "EXPLICIT_CANCEL"): readonly InputEvent[] {
    return this.#processInputEvents(this.#input.cancel(reason));
  }

  #processInputEvents(events: readonly InputEvent[]): readonly InputEvent[] {
    for (const event of events) {
      if (event.kind === "stroke_cancelled") {
        this.#cancelSession(event.reason ?? "INPUT_CANCELLED");
      }
    }
    return events;
  }

  #begin(sample: PointerSample): void {
    if (this.#session !== undefined) return;
    this.#session = new ToolSession({
      sessionId: sample.pointerId === undefined
        ? `${this.#options.tool}-session`
        : this.#input.snapshot().activeStrokeId ??
          `${this.#options.tool}-session`,
      tool: this.#options.tool,
      bounds: this.#options.bounds,
      colorIndex: this.#options.colorIndex,
      ...(this.#options.toolOptions === undefined
        ? {}
        : { toolOptions: this.#options.toolOptions }),
      pointerId: sample.pointerId,
    });
    this.#session.begin(pointFromSample(sample));
    this.#options.onPreview?.(this.#session.snapshot());
  }

  #update(sample: PointerSample): void {
    if (this.#session?.lifecycle !== "ACTIVE") return;
    this.#session.update(pointFromSample(sample));
    this.#options.onPreview?.(this.#session.snapshot());
  }

  #commit(): void {
    const session = this.#session;
    if (session === undefined) return;
    const preview = session.snapshot();
    const commit = session.commit();
    this.#session = undefined;
    this.#options.onCommitQueued?.(commit, preview);
    this.#options.onPreview?.(undefined);
    this.#commitIngress.enqueue(
      commit,
      this.#options.onCommit,
      this.#options.onCommitError,
    );
  }

  #cancelSession(reason: string): void {
    const session = this.#session;
    if (session === undefined) return;
    session.cancel(reason);
    this.#session = undefined;
    this.#options.onPreview?.(undefined);
  }
}
