import {
  createArgbColorRamp,
  decodeArgbColor,
  encodeArgbColor,
} from "../src/draw2-color-tools.ts";
import { createOutlineWriteSet } from "../src/draw2-outline-tools.ts";
import { createTextMaskWriteSet } from "../src/draw2-text-tools.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("iDRAW color ramps preserve indexed endpoints and selected space", () => {
  const start = encodeArgbColor({ alpha: 255, red: 255, green: 0, blue: 0 });
  const end = encodeArgbColor({ alpha: 128, red: 0, green: 0, blue: 255 });
  const ramp = createArgbColorRamp(start, end, 5, "RGB", "SHORT");
  assert(ramp.length === 5, "ramp step count is not clamped deterministically");
  assert(ramp[0] === start && ramp[4] === end, "ramp endpoints changed");
  const middle = decodeArgbColor(ramp[2] ?? 0);
  assert(
    middle.red === 128 && middle.green === 0 && middle.blue === 128 &&
      middle.alpha === 192,
    "RGB ramp midpoint did not interpolate channels",
  );
  const hsv = createArgbColorRamp(start, end, 3, "HSV", "SHORT");
  assert(hsv.length === 3 && hsv[0] === start && hsv[2] === end, "HSV ramp endpoints changed");
});

Deno.test("iDRAW outline planner supports inside/outside, connectivity, and bounds", () => {
  const pixels = new Array<number>(9).fill(0);
  pixels[4] = 1;
  const reader = {
    width: 3,
    height: 3,
    palette: [0, 0xffff0000, 0xff00ff00],
    getPixel(x: number, y: number): number { return pixels[y * 3 + x] ?? 0; },
  };
  const outside = createOutlineWriteSet(reader, {
    colorIndex: 2,
    placement: "OUTSIDE",
    thickness: 1,
    connectivity: 8,
  });
  assert(outside.length === 8, "outside outline did not cover the 8-neighbor ring");
  assert(!outside.some((write) => write.x === 1 && write.y === 1), "outside outline overwrote the source pixel");
  const inside = createOutlineWriteSet(reader, {
    colorIndex: 2,
    placement: "INSIDE",
    thickness: 1,
    connectivity: 4,
  });
  assert(inside.length === 1 && inside[0]?.x === 1 && inside[0]?.y === 1, "inside outline did not target the source boundary");
  const clipped = createOutlineWriteSet(reader, {
    colorIndex: 2,
    placement: "OUTSIDE",
    thickness: 1,
    connectivity: 8,
    allowedPixels: new Set(["0:0", "1:1"]),
  });
  assert(clipped.length === 1 && clipped[0]?.x === 0 && clipped[0]?.y === 0, "outline selection boundary was ignored");
});

Deno.test("iDRAW text mask planner makes fill win over stroke", () => {
  const fill = {
    width: 3,
    height: 2,
    alpha: new Uint8ClampedArray([255, 0, 0, 0, 255, 0]),
  };
  const stroke = {
    width: 3,
    height: 2,
    alpha: new Uint8ClampedArray([255, 255, 0, 255, 0, 255]),
  };
  const writes = createTextMaskWriteSet(fill, stroke, {
    fillColorIndex: 1,
    strokeColorIndex: 2,
    threshold: 160,
  });
  assert(writes.length === 5, "text mask lost opaque fill or stroke pixels");
  assert(writes.find((write) => write.x === 0 && write.y === 0)?.colorIndex === 1, "fill did not override stroke");
  assert(writes.find((write) => write.x === 1 && write.y === 0)?.colorIndex === 2, "stroke was not retained outside fill");
});
