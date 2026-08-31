import {
  canvasCoordinateToDiagonalMirrorGuideOffset,
  canvasCoordinateToMirrorGuide,
  diagonalMirrorGuideOffsetToCanvasCoordinate,
  mirrorGuideCenter,
  mirrorGuideToCanvasCoordinate,
  snapMirrorGuideCoordinate,
} from "../src/draw2-mirror.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("mirror guide keeps odd and even canvas centres exact", () => {
  assert(
    mirrorGuideCenter(21) === 10,
    "21px canvas should use its centre cell",
  );
  assert(
    mirrorGuideCenter(20) === 9.5,
    "20px canvas should use its centre boundary",
  );
  assert(
    mirrorGuideToCanvasCoordinate(10, 21) === 10.5,
    "odd centre must map to the canvas centre",
  );
  assert(
    mirrorGuideToCanvasCoordinate(9.5, 20) === 10,
    "even centre must map to the canvas centre",
  );
});

Deno.test("mirror guide snaps to cells and grid boundaries", () => {
  assert(
    snapMirrorGuideCoordinate(10.24, 21) === 10,
    "nearby cell centre should snap to the cell",
  );
  assert(
    snapMirrorGuideCoordinate(10.26, 21) === 10.5,
    "nearby boundary should snap to the half step",
  );
  assert(
    snapMirrorGuideCoordinate(-0.8, 21) === -0.5,
    "guide should clamp to the canvas edge",
  );
  assert(
    snapMirrorGuideCoordinate(20.8, 21) === 20.5,
    "guide should clamp to the opposite edge",
  );
});

Deno.test("mirror guide canvas conversion is reversible at half steps", () => {
  for (const guide of [-0.5, 0, 4.5, 10, 20.5]) {
    const canvasCoordinate = mirrorGuideToCanvasCoordinate(guide, 21);
    assert(
      canvasCoordinateToMirrorGuide(canvasCoordinate, 21) === guide,
      `conversion lost guide coordinate ${guide}`,
    );
  }
});

Deno.test("diagonal mirror offsets map to a reversible edge coordinate", () => {
  for (const offset of [-1, -0.5, 0, 0.5, 1]) {
    const coordinate = diagonalMirrorGuideOffsetToCanvasCoordinate(offset, 256);
    assert(
      canvasCoordinateToDiagonalMirrorGuideOffset(coordinate, 256) === offset,
      `diagonal conversion lost offset ${offset}`,
    );
  }
  assert(
    diagonalMirrorGuideOffsetToCanvasCoordinate(0, 256) === 128,
    "the default diagonal guide must stay at the edge midpoint",
  );
  assert(
    canvasCoordinateToDiagonalMirrorGuideOffset(192, 256) === 0.5,
    "edge dragging must produce a positive diagonal offset",
  );
});
