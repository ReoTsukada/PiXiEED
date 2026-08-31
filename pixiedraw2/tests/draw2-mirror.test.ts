import {
  canvasCoordinateToMirrorGuide,
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
