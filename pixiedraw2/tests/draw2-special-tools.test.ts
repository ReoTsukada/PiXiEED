import {
  pixelPerfectPath,
  polygonSelectionPoints,
  tileStampWrites,
} from "../src/draw2-special-tools.ts";

function reader(width = 8, height = 8) {
  const pixels = new Array<number>(width * height).fill(0);
  return {
    width,
    height,
    palette: [0, 0xff0000ff, 0x00ff00ff, 0x0000ffff],
    getPixel(x: number, y: number) {
      return pixels[y * width + x] ?? 0;
    },
    pixels,
  };
}

Deno.test("pixel perfect path is integer and deduplicated", () => {
  const path = pixelPerfectPath([{ x: 0, y: 0 }, { x: 4, y: 2 }, {
    x: 4,
    y: 2,
  }]);
  if (
    path.length < 5 ||
    new Set(path.map((point) => `${point.x}:${point.y}`)).size !== path.length
  ) throw new Error("path should be deterministic");
  if (!path.some((point) => point.x === 4 && point.y === 2)) {
    throw new Error("endpoint missing");
  }
});

Deno.test("polygon selection produces bounded interior pixels", () => {
  const points = polygonSelectionPoints(reader(6, 6), [{ x: 1, y: 1 }, {
    x: 4,
    y: 1,
  }, { x: 2, y: 4 }]);
  if (
    points.length < 3 ||
    points.some((point) =>
      point.x < 0 || point.y < 0 || point.x >= 6 || point.y >= 6
    )
  ) throw new Error("polygon bounds mismatch");
});

Deno.test("tile stamp clips to target and scales", () => {
  const writes = tileStampWrites(
    reader(4, 4),
    { width: 2, height: 2, pixels: [1, 0, 0, 2] },
    { x: 2, y: 2 },
    2,
  );
  if (
    writes.length !== 4 ||
    writes.some((write) =>
      write.x < 0 || write.y < 0 || write.x >= 4 || write.y >= 4
    )
  ) throw new Error("stamp should be clipped");
});
