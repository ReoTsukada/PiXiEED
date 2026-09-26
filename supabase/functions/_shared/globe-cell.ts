export const GLOBE_GRID_VERSION = "v11-meridian-parallel-quarter-degree";
export const GLOBE_LATITUDE_STEP = 0.25;
const BAND_COUNT = 720;
const BASE_LONGITUDE_COUNT = 1440;

function longitudeCountChain(base: number) {
  const chain = new Set<number>();
  for (let offset = 12; offset <= 24; offset += 1) {
    const start = (base * offset) / 24;
    if (!Number.isInteger(start)) continue;
    let count = start;
    for (const factor of [2, 3, 5]) {
      chain.add(count);
      while (count % factor === 0 && count / factor >= 4) {
        count /= factor;
        chain.add(count);
      }
    }
  }
  return [...chain].sort((left, right) => right - left);
}

const LONGITUDE_COUNTS = longitudeCountChain(BASE_LONGITUDE_COUNT);

function longitudeCountForBand(band: number) {
  const north = 90 - band * GLOBE_LATITUDE_STEP;
  const midLatitude = north - GLOBE_LATITUDE_STEP / 2;
  const target = Math.max(
    4,
    (360 * Math.cos(midLatitude * Math.PI / 180)) / GLOBE_LATITUDE_STEP,
  );
  let best = LONGITUDE_COUNTS[0];
  for (const count of LONGITUDE_COUNTS) {
    if (
      Math.abs(Math.log(count / target)) <
        Math.abs(Math.log(best / target))
    ) best = count;
  }
  return best;
}

export type GlobeCell = {
  id: string;
  version: string;
  band: number;
  column: number;
};

export function normalizeGlobeCell(input: unknown): GlobeCell | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const version = String(value.version || "");
  const band = Number(value.band);
  const column = Number(value.column);
  if (
    version !== GLOBE_GRID_VERSION || !Number.isInteger(band) || band < 0 ||
    band >= BAND_COUNT
  ) return null;
  const longitudeCount = longitudeCountForBand(band);
  if (!Number.isInteger(column) || column < 0 || column >= longitudeCount) {
    return null;
  }
  const id = `globe:${version}:${band}:${column}`;
  if (String(value.id || value.cellId || "") !== id) return null;
  return { id, version, band, column };
}
