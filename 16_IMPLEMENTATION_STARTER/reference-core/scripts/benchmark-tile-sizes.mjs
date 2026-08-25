import { performance } from "node:perf_hooks";

const canvasWidth = 512;
const canvasHeight = 512;
const operations = 100_000;

function benchmark(tileSize) {
  const tilesAcross = Math.ceil(canvasWidth / tileSize);
  const tilesDown = Math.ceil(canvasHeight / tileSize);
  const tileCount = tilesAcross * tilesDown;
  const tiles = Array.from(
    { length: tileCount },
    () => new Uint8Array(tileSize * tileSize)
  );

  let checksum = 0;
  const started = performance.now();

  for (let index = 0; index < operations; index += 1) {
    const x = (index * 17) % canvasWidth;
    const y = (index * 31) % canvasHeight;
    const tileX = Math.floor(x / tileSize);
    const tileY = Math.floor(y / tileSize);
    const tileIndex = tileY * tilesAcross + tileX;
    const localX = x % tileSize;
    const localY = y % tileSize;
    const pixelIndex = localY * tileSize + localX;
    const tile = tiles[tileIndex];

    tile[pixelIndex] = (tile[pixelIndex] + 1) & 0xff;
    checksum += tile[pixelIndex];
  }

  return {
    tileSize,
    tileCount,
    bytes: tileCount * tileSize * tileSize,
    operations,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    checksum,
  };
}

const results = [32, 64].map(benchmark);
console.log(JSON.stringify({
  warning: "Illustrative CPU microbenchmark only. Run browser/mobile workload benchmarks before choosing the production tile size.",
  results,
}, null, 2));
