import { strict as assert } from "node:assert";

const draw = await Deno.readTextFile("src/draw2-entry.ts");

Deno.test("PIXYNC-DRAW2-300 binds authenticated Draw identity only to the active project", () => {
  assert.match(draw, /"draw2:pixync-binding"/u);
  assert.match(draw, /detail\.projectId !== state\.projectId/u);
  assert.match(draw, /function activeDrawActorId/u);
  assert.match(draw, /function activeDrawClientId/u);
});

Deno.test("PIXYNC-DRAW2-300 publishes all first-slice Draw commit families", () => {
  assert.equal(
    draw.match(
      /publishDrawRasterCommit\(result\.result, state, before\.structureEpoch\)/gu,
    )?.length,
    6,
  );
  assert.match(draw, /"draw2:raster-operation-committed"/u);
  assert.match(draw, /commandType: "raster\.writeSet"/u);
  assert.match(draw, /commandType: "raster\.fill"/u);
  assert.match(draw, /commandType: "raster\.strokeCommit"/u);
  assert.match(draw, /commandType: "raster\.shapeCommit"/u);
  assert.match(draw, /commandType: "raster\.tileStamp"/u);
  assert.match(draw, /selection\.transformCommit/u);
  assert.match(draw, /compactPixelPath\(/u);
});
