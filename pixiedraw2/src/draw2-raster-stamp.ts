/**
 * Compact indexed raster sources for bounded Tile Stamp operations.
 *
 * Selection stamps live in the local creator metadata as convenient cell
 * records.  They must not be expanded into a JSON write set when they enter
 * PiXYNC.  This module provides a deterministic row-RLE wire representation
 * with a small palette table and no unbounded JSON pixel collection.
 */

export const RASTER_STAMP_ENCODING = "indexed-rle-u16-u8-base64-v1" as const;
export const MAX_RASTER_STAMP_DIMENSION = 0xffff;
export const MAX_RASTER_STAMP_CELLS = 65_536;
export const MAX_RASTER_STAMP_PALETTE = 256;
export const MAX_RASTER_STAMP_DATA_BYTES = 1_048_576;

export interface RasterStampCell {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

export interface IndexedRasterStampSource {
  readonly kind: "indexed-runs";
  readonly encoding: typeof RASTER_STAMP_ENCODING;
  readonly width: number;
  readonly height: number;
  readonly paletteEncoding: "argb-u32-base64-v1";
  readonly paletteCount: number;
  readonly paletteData: string;
  readonly occupiedCount: number;
  readonly data: string;
}

export interface RasterStampRun {
  readonly x: number;
  readonly width: number;
  readonly colorIndex: number;
}

export interface RasterStampRow {
  readonly y: number;
  readonly runs: readonly RasterStampRun[];
}

export interface DecodedIndexedRasterStamp {
  readonly kind: "indexed-runs";
  readonly width: number;
  readonly height: number;
  readonly palette: readonly number[];
  readonly occupiedCount: number;
  readonly rows: readonly RasterStampRow[];
  readonly rowIndex: ReadonlyMap<number, readonly RasterStampRun[]>;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertUInt16(value: number, label: string): void {
  if (!isSafeNonNegativeInteger(value) || value > MAX_RASTER_STAMP_DIMENSION) {
    throw new Error(`${label} must be a uint16 value.`);
  }
}

function assertPalette(palette: readonly number[]): readonly number[] {
  if (
    palette.length < 1 ||
    palette.length > MAX_RASTER_STAMP_PALETTE
  ) {
    throw new Error("Raster stamp palette is invalid.");
  }
  return palette.map((color, index) => {
    if (!isSafeNonNegativeInteger(color) || color > 0xffffffff) {
      throw new Error(`Raster stamp palette color ${index} is invalid.`);
    }
    return color >>> 0;
  });
}

function encodeBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64_ALPHABET[first >> 2];
    output += BASE64_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    output += second === undefined
      ? "="
      : BASE64_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    output += third === undefined
      ? "="
      : BASE64_ALPHABET[third & 0x3f];
  }
  return output;
}

function decodeBase64(value: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    throw new Error("Raster stamp data is not valid base64.");
  }
  const output: number[] = [];
  const decode = (character: string): number => {
    const index = BASE64_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Raster stamp data has an invalid byte.");
    return index;
  };
  for (let index = 0; index < value.length; index += 4) {
    const first = decode(value[index] ?? "");
    const second = decode(value[index + 1] ?? "");
    const thirdCharacter = value[index + 2] ?? "=";
    const fourthCharacter = value[index + 3] ?? "=";
    const third = thirdCharacter === "=" ? 0 : decode(thirdCharacter);
    const fourth = fourthCharacter === "=" ? 0 : decode(fourthCharacter);
    if (thirdCharacter === "=" && (second & 0x0f) !== 0) {
      throw new Error("Raster stamp base64 padding is not canonical.");
    }
    if (fourthCharacter === "=" && (third & 0x03) !== 0) {
      throw new Error("Raster stamp base64 padding is not canonical.");
    }
    output.push((first << 2) | (second >> 4));
    if (thirdCharacter !== "=") {
      output.push(((second & 0x0f) << 4) | (third >> 2));
    }
    if (fourthCharacter !== "=") {
      output.push(((third & 0x03) << 6) | fourth);
    }
  }
  if (output.length > MAX_RASTER_STAMP_DATA_BYTES) {
    throw new Error("Raster stamp data exceeds the bounded byte budget.");
  }
  return Uint8Array.from(output);
}

function encodePalette(palette: readonly number[]): string {
  const bytes = new Uint8Array(palette.length * 4);
  palette.forEach((color, index) => {
    const offset = index * 4;
    bytes[offset] = (color >>> 24) & 0xff;
    bytes[offset + 1] = (color >>> 16) & 0xff;
    bytes[offset + 2] = (color >>> 8) & 0xff;
    bytes[offset + 3] = color & 0xff;
  });
  return encodeBase64(bytes);
}

function decodePalette(value: string, count: number): readonly number[] {
  if (!isSafeNonNegativeInteger(count) || count < 1 || count > MAX_RASTER_STAMP_PALETTE) {
    throw new Error("Raster stamp palette count is invalid.");
  }
  const bytes = decodeBase64(value);
  if (bytes.byteLength !== count * 4) {
    throw new Error("Raster stamp palette data length is invalid.");
  }
  const palette: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    palette.push(
      (((bytes[offset] ?? 0) << 24) |
        ((bytes[offset + 1] ?? 0) << 16) |
        ((bytes[offset + 2] ?? 0) << 8) |
        (bytes[offset + 3] ?? 0)) >>> 0,
    );
  }
  return palette;
}

function pushUint16(bytes: number[], value: number, label: string): void {
  assertUInt16(value, label);
  bytes.push((value >>> 8) & 0xff, value & 0xff);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function normalizeCells(
  width: number,
  height: number,
  palette: readonly number[],
  cells: readonly RasterStampCell[],
): {
  readonly palette: readonly number[];
  readonly rows: readonly RasterStampRow[];
  readonly occupiedCount: number;
} {
  if (
    !isSafeNonNegativeInteger(width) || width < 1 ||
    width > MAX_RASTER_STAMP_DIMENSION ||
    !isSafeNonNegativeInteger(height) || height < 1 ||
    height > MAX_RASTER_STAMP_DIMENSION ||
    width * height > MAX_RASTER_STAMP_CELLS
  ) {
    throw new Error("Raster stamp dimensions are outside the bounded range.");
  }
  const normalizedPalette = assertPalette(palette);
  const rowsByY = new Map<number, Map<number, number>>();
  for (const cell of cells) {
    if (
      cell === null || typeof cell !== "object" ||
      !isSafeNonNegativeInteger(cell.x) ||
      !isSafeNonNegativeInteger(cell.y) ||
      !isSafeNonNegativeInteger(cell.colorIndex) ||
      cell.x >= width || cell.y >= height ||
      cell.colorIndex >= normalizedPalette.length
    ) {
      throw new Error("Raster stamp cell is invalid.");
    }
    if (cell.colorIndex === 0) continue;
    const row = rowsByY.get(cell.y) ?? new Map<number, number>();
    row.set(cell.x, cell.colorIndex);
    rowsByY.set(cell.y, row);
  }
  const rows: RasterStampRow[] = [];
  let occupiedCount = 0;
  for (const y of [...rowsByY.keys()].sort((left, right) => left - right)) {
    const entries = [...(rowsByY.get(y)?.entries() ?? [])].sort((left, right) => left[0] - right[0]);
    const runs: RasterStampRun[] = [];
    for (const [x, colorIndex] of entries) {
      const previous = runs[runs.length - 1];
      if (
        previous !== undefined &&
        previous.x + previous.width === x &&
        previous.colorIndex === colorIndex
      ) {
        runs[runs.length - 1] = {
          ...previous,
          width: previous.width + 1,
        };
      } else {
        runs.push({ x, width: 1, colorIndex });
      }
    }
    if (runs.length > 0) {
      rows.push({ y, runs });
      occupiedCount += entries.length;
    }
  }
  if (occupiedCount < 1) throw new Error("Raster stamp cannot be empty.");
  return { palette: normalizedPalette, rows, occupiedCount };
}

export function createIndexedRasterStampSource(input: {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly number[];
  readonly cells: readonly RasterStampCell[];
}): IndexedRasterStampSource {
  const normalized = normalizeCells(
    input.width,
    input.height,
    input.palette,
    input.cells,
  );
  const bytes: number[] = [];
  for (const row of normalized.rows) {
    pushUint16(bytes, row.y, "Raster stamp row");
    pushUint16(bytes, row.runs.length, "Raster stamp run count");
    for (const run of row.runs) {
      pushUint16(bytes, run.x, "Raster stamp run x");
      pushUint16(bytes, run.width, "Raster stamp run width");
      if (
        !isSafeNonNegativeInteger(run.colorIndex) ||
        run.colorIndex < 1 ||
        run.colorIndex >= normalized.palette.length ||
        run.colorIndex > 0xff
      ) {
        throw new Error("Raster stamp run color is invalid.");
      }
      bytes.push(run.colorIndex);
    }
  }
  if (bytes.length > MAX_RASTER_STAMP_DATA_BYTES) {
    throw new Error("Raster stamp data exceeds the bounded byte budget.");
  }
  return {
    kind: "indexed-runs",
    encoding: RASTER_STAMP_ENCODING,
    width: input.width,
    height: input.height,
    paletteEncoding: "argb-u32-base64-v1",
    paletteCount: normalized.palette.length,
    paletteData: encodePalette(normalized.palette),
    occupiedCount: normalized.occupiedCount,
    data: encodeBase64(Uint8Array.from(bytes)),
  };
}

export function decodeIndexedRasterStampSource(
  value: unknown,
): DecodedIndexedRasterStamp {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Raster stamp source must be an object.");
  }
  const source = value as Record<string, unknown>;
  if (source.kind !== "indexed-runs" || source.encoding !== RASTER_STAMP_ENCODING) {
    throw new Error("Raster stamp source encoding is not supported.");
  }
  if (
    !isSafeNonNegativeInteger(source.width) || source.width < 1 ||
    source.width > MAX_RASTER_STAMP_DIMENSION ||
    !isSafeNonNegativeInteger(source.height) || source.height < 1 ||
    source.width * source.height > MAX_RASTER_STAMP_CELLS ||
    !isSafeNonNegativeInteger(source.occupiedCount) ||
    source.occupiedCount < 1 ||
    source.occupiedCount > source.width * source.height ||
    source.paletteEncoding !== "argb-u32-base64-v1" ||
    !isSafeNonNegativeInteger(source.paletteCount) ||
    typeof source.paletteData !== "string" ||
    typeof source.data !== "string"
  ) {
    throw new Error("Raster stamp source metadata is invalid.");
  }
  const palette = decodePalette(source.paletteData, source.paletteCount);
  const bytes = decodeBase64(source.data);
  const rows: RasterStampRow[] = [];
  const rowIndex = new Map<number, readonly RasterStampRun[]>();
  let offset = 0;
  let previousY = -1;
  let occupiedCount = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 4) {
      throw new Error("Raster stamp row header is truncated.");
    }
    const y = readUint16(bytes, offset);
    const runCount = readUint16(bytes, offset + 2);
    offset += 4;
    if (y >= source.height || y <= previousY || runCount < 1) {
      throw new Error("Raster stamp row order is invalid.");
    }
    previousY = y;
    const runs: RasterStampRun[] = [];
    let previousEnd = -1;
    for (let index = 0; index < runCount; index += 1) {
      if (bytes.length - offset < 5) {
        throw new Error("Raster stamp run is truncated.");
      }
      const x = readUint16(bytes, offset);
      const width = readUint16(bytes, offset + 2);
      const colorIndex = bytes[offset + 4] ?? 0;
      offset += 5;
      if (
        width < 1 || x >= source.width || x + width > source.width ||
        x <= previousEnd || colorIndex < 1 || colorIndex >= palette.length
      ) {
        throw new Error("Raster stamp run is invalid.");
      }
      previousEnd = x + width - 1;
      occupiedCount += width;
      if (occupiedCount > source.occupiedCount) {
        throw new Error("Raster stamp occupiedCount is smaller than its data.");
      }
      runs.push({ x, width, colorIndex });
    }
    const row: RasterStampRow = { y, runs };
    rows.push(row);
    rowIndex.set(y, runs);
  }
  if (occupiedCount !== source.occupiedCount) {
    throw new Error("Raster stamp occupiedCount does not match its data.");
  }
  return {
    kind: "indexed-runs",
    width: source.width,
    height: source.height,
    palette,
    occupiedCount,
    rows,
    rowIndex,
  };
}

export function rasterStampColorAt(
  source: DecodedIndexedRasterStamp,
  x: number,
  y: number,
): number {
  if (
    !isSafeNonNegativeInteger(x) ||
    !isSafeNonNegativeInteger(y) ||
    x >= source.width ||
    y >= source.height
  ) return 0;
  for (const run of source.rowIndex.get(y) ?? []) {
    if (x < run.x) return 0;
    if (x < run.x + run.width) return run.colorIndex;
  }
  return 0;
}
