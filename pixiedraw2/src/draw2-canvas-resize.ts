/**
 * Pure canvas-resize planning used by the Draw2 settings projection.
 *
 * The plan is deliberately independent from DOM, Canvas, and ProjectState so
 * the same anchor math can be reused by export, native shells, and tests.
 */

export type CanvasResizeAnchor =
  | "TOP_LEFT"
  | "TOP"
  | "TOP_RIGHT"
  | "LEFT"
  | "CENTER"
  | "RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM"
  | "BOTTOM_RIGHT";

export interface CanvasResizePlanInput {
  readonly oldWidth: number;
  readonly oldHeight: number;
  readonly newWidth: number;
  readonly newHeight: number;
  readonly anchor: CanvasResizeAnchor;
}

export interface CanvasResizePlan {
  readonly oldWidth: number;
  readonly oldHeight: number;
  readonly newWidth: number;
  readonly newHeight: number;
  readonly anchor: CanvasResizeAnchor;
  /** Destination coordinate of the old canvas' top-left pixel. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Intersection copied from the old canvas into the new canvas. */
  readonly sourceX: number;
  readonly sourceY: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly copyWidth: number;
  readonly copyHeight: number;
}

const ANCHOR_FRACTIONS: Readonly<Record<CanvasResizeAnchor, readonly [number, number]>> = {
  TOP_LEFT: [0, 0],
  TOP: [0.5, 0],
  TOP_RIGHT: [1, 0],
  LEFT: [0, 0.5],
  CENTER: [0.5, 0.5],
  RIGHT: [1, 0.5],
  BOTTOM_LEFT: [0, 1],
  BOTTOM: [0.5, 1],
  BOTTOM_RIGHT: [1, 1],
};

function positiveDimension(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 4096) {
    throw new Error(`${name} must be an integer from 1 through 4096.`);
  }
  return value;
}

export function calculateCanvasResizePlan(
  input: CanvasResizePlanInput,
): CanvasResizePlan {
  const oldWidth = positiveDimension(input.oldWidth, "oldWidth");
  const oldHeight = positiveDimension(input.oldHeight, "oldHeight");
  const newWidth = positiveDimension(input.newWidth, "newWidth");
  const newHeight = positiveDimension(input.newHeight, "newHeight");
  const fraction = ANCHOR_FRACTIONS[input.anchor];
  if (fraction === undefined) throw new Error("Canvas resize anchor is invalid.");

  const offsetX = Math.round((newWidth - oldWidth) * fraction[0]);
  const offsetY = Math.round((newHeight - oldHeight) * fraction[1]);
  const sourceX = Math.max(0, -offsetX);
  const sourceY = Math.max(0, -offsetY);
  const destinationX = Math.max(0, offsetX);
  const destinationY = Math.max(0, offsetY);
  const copyWidth = Math.max(
    0,
    Math.min(oldWidth - sourceX, newWidth - destinationX),
  );
  const copyHeight = Math.max(
    0,
    Math.min(oldHeight - sourceY, newHeight - destinationY),
  );

  return {
    oldWidth,
    oldHeight,
    newWidth,
    newHeight,
    anchor: input.anchor,
    offsetX,
    offsetY,
    sourceX,
    sourceY,
    destinationX,
    destinationY,
    copyWidth,
    copyHeight,
  };
}

export function describeCanvasResizePlan(plan: CanvasResizePlan): string {
  const growLeft = Math.max(0, plan.offsetX);
  const growRight = Math.max(
    0,
    plan.newWidth - plan.oldWidth - plan.offsetX,
  );
  const growTop = Math.max(0, plan.offsetY);
  const growBottom = Math.max(
    0,
    plan.newHeight - plan.oldHeight - plan.offsetY,
  );
  const cropLeft = Math.max(0, -plan.offsetX);
  const cropRight = Math.max(
    0,
    plan.oldWidth - plan.newWidth + plan.offsetX,
  );
  const cropTop = Math.max(0, -plan.offsetY);
  const cropBottom = Math.max(
    0,
    plan.oldHeight - plan.newHeight + plan.offsetY,
  );
  const horizontal = plan.newWidth >= plan.oldWidth
    ? `left +${growLeft}px · right +${growRight}px`
    : `left -${cropLeft}px · right -${cropRight}px`;
  const vertical = plan.newHeight >= plan.oldHeight
    ? `top +${growTop}px · bottom +${growBottom}px`
    : `top -${cropTop}px · bottom -${cropBottom}px`;
  return `${plan.oldWidth}×${plan.oldHeight} → ${plan.newWidth}×${plan.newHeight} · ${horizontal} · ${vertical}`;
}
