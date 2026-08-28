/**
 * Compact, deterministic selection masks for canonical raster commands.
 *
 * A selection is UI state, but a remote raster command needs a bounded way to
 * reproduce a non-rectangular selection.  Rows of inclusive pixel spans are
 * encoded as a small binary RLE stream and then base64 encoded so the wire
 * payload contains no unbounded JSON arrays.
 */

export interface RasterSelectionMaskPoint {
  readonly x: number;
  readonly y: number;
}

export interface RasterSelectionMask {
  readonly kind: "runs";
  readonly encoding: "rle-u16-base64-v1";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly selectedCount: number;
  readonly data: string;
}

export interface RasterSelectionMaskSpan {
  readonly x: number;
  readonly width: number;
}

export interface RasterSelectionMaskRow {
  readonly y: number;
  readonly spans: readonly RasterSelectionMaskSpan[];
}

export interface DecodedRasterSelectionMask {
  readonly kind: "runs";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly selectedCount: number;
  readonly rows: readonly RasterSelectionMaskRow[];
  readonly rowIndex: ReadonlyMap<number, readonly RasterSelectionMaskSpan[]>;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const MAX_UINT16 = 0xffff;

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
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
    value.length === 0 || value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    throw new Error("Selection mask data is not valid base64.");
  }
  const output: number[] = [];
  const decode = (character: string): number => {
    const index = BASE64_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Selection mask data has an invalid byte.");
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
      throw new Error("Selection mask base64 padding is not canonical.");
    }
    if (fourthCharacter === "=" && (third & 0x03) !== 0) {
      throw new Error("Selection mask base64 padding is not canonical.");
    }
    output.push((first << 2) | (second >> 4));
    if (thirdCharacter !== "=") {
      output.push(((second & 0x0f) << 4) | (third >> 2));
    }
    if (fourthCharacter !== "=") {
      output.push(((third & 0x03) << 6) | fourth);
    }
  }
  return Uint8Array.from(output);
}

function pushUint16(bytes: number[], value: number): void {
  assertInteger(value, "Selection mask binary value");
  if (value < 0 || value > MAX_UINT16) {
    throw new Error("Selection mask binary value exceeds uint16.");
  }
  bytes.push((value >>> 8) & 0xff, value & 0xff);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function normalizeRows(
  points: readonly RasterSelectionMaskPoint[],
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly RasterSelectionMaskRow[];
  readonly selectedCount: number;
} {
  if (points.length === 0) throw new Error("Selection mask cannot be empty.");
  const rowPoints = new Map<number, Set<number>>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    assertInteger(point.x, "Selection mask x");
    assertInteger(point.y, "Selection mask y");
    if (point.x < 0 || point.y < 0) {
      throw new Error("Selection mask coordinates must be non-negative.");
    }
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    const row = rowPoints.get(point.y) ?? new Set<number>();
    row.add(point.x);
    rowPoints.set(point.y, row);
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (width > MAX_UINT16 || height > MAX_UINT16) {
    throw new Error("Selection mask bounds exceed the compact coordinate range.");
  }
  const rows: RasterSelectionMaskRow[] = [];
  let selectedCount = 0;
  for (const absoluteY of [...rowPoints.keys()].sort((left, right) => left - right)) {
    const xs = [...(rowPoints.get(absoluteY) ?? [])].sort((left, right) => left - right);
    const spans: RasterSelectionMaskSpan[] = [];
    const first = xs[0];
    if (first === undefined) continue;
    let start = first;
    let previous = first;
    for (let index = 1; index < xs.length; index += 1) {
      const current = xs[index];
      if (current === undefined) continue;
      if (current !== previous + 1) {
        spans.push({ x: start - minX, width: previous - start + 1 });
        selectedCount += previous - start + 1;
        start = current;
      }
      previous = current;
    }
    spans.push({ x: start - minX, width: previous - start + 1 });
    selectedCount += previous - start + 1;
    rows.push({ y: absoluteY - minY, spans });
  }
  return { x: minX, y: minY, width, height, rows, selectedCount };
}

export function createRasterSelectionMask(
  points: readonly RasterSelectionMaskPoint[],
): RasterSelectionMask | undefined {
  if (points.length === 0) return undefined;
  const normalized = normalizeRows(points);
  const bytes: number[] = [];
  for (const row of normalized.rows) {
    pushUint16(bytes, row.y);
    pushUint16(bytes, row.spans.length);
    for (const span of row.spans) {
      pushUint16(bytes, span.x);
      pushUint16(bytes, span.width);
    }
  }
  return {
    kind: "runs",
    encoding: "rle-u16-base64-v1",
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
    selectedCount: normalized.selectedCount,
    data: encodeBase64(Uint8Array.from(bytes)),
  };
}

export function decodeRasterSelectionMask(
  value: unknown,
): DecodedRasterSelectionMask {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Selection mask must be an object.");
  }
  const mask = value as Record<string, unknown>;
  if (mask.kind !== "runs" || mask.encoding !== "rle-u16-base64-v1") {
    throw new Error("Selection mask encoding is not supported.");
  }
  for (const key of ["x", "y", "width", "height", "selectedCount"]) {
    const item = mask[key];
    if (!Number.isSafeInteger(item)) {
      throw new Error(`Selection mask ${key} must be a safe integer.`);
    }
  }
  const x = mask.x as number;
  const y = mask.y as number;
  const width = mask.width as number;
  const height = mask.height as number;
  const selectedCount = mask.selectedCount as number;
  if (x < 0 || y < 0 || width < 1 || height < 1 || width > MAX_UINT16 || height > MAX_UINT16) {
    throw new Error("Selection mask bounds are invalid.");
  }
  if (selectedCount < 1 || selectedCount > width * height) {
    throw new Error("Selection mask selectedCount is invalid.");
  }
  if (typeof mask.data !== "string") {
    throw new Error("Selection mask data must be a string.");
  }
  const bytes = decodeBase64(mask.data);
  if (bytes.length < 4) throw new Error("Selection mask data is empty.");
  const rows: RasterSelectionMaskRow[] = [];
  const rowIndex = new Map<number, readonly RasterSelectionMaskSpan[]>();
  let offset = 0;
  let previousRow = -1;
  let counted = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 4) {
      throw new Error("Selection mask row header is truncated.");
    }
    const rowY = readUint16(bytes, offset);
    const spanCount = readUint16(bytes, offset + 2);
    offset += 4;
    if (rowY <= previousRow || rowY >= height || spanCount < 1) {
      throw new Error("Selection mask rows are not canonical.");
    }
    const spans: RasterSelectionMaskSpan[] = [];
    let previousEnd = -1;
    for (let index = 0; index < spanCount; index += 1) {
      if (bytes.length - offset < 4) {
        throw new Error("Selection mask span is truncated.");
      }
      const spanX = readUint16(bytes, offset);
      const spanWidth = readUint16(bytes, offset + 2);
      offset += 4;
      if (
        spanWidth < 1 || spanX + spanWidth > width || spanX <= previousEnd
      ) {
        throw new Error("Selection mask spans are not canonical.");
      }
      spans.push({ x: spanX + x, width: spanWidth });
      previousEnd = spanX + spanWidth - 1;
      counted += spanWidth;
    }
    const absoluteY = rowY + y;
    const immutableSpans = spans.map((span) => ({ ...span }));
    rows.push({ y: absoluteY, spans: immutableSpans });
    rowIndex.set(absoluteY, immutableSpans);
    previousRow = rowY;
  }
  if (counted !== selectedCount || rows.length === 0) {
    throw new Error("Selection mask selectedCount does not match its data.");
  }
  return {
    kind: "runs",
    x,
    y,
    width,
    height,
    selectedCount,
    rows,
    rowIndex,
  };
}

export function rasterSelectionMaskIncludes(
  mask: DecodedRasterSelectionMask,
  point: RasterSelectionMaskPoint,
): boolean {
  const spans = mask.rowIndex.get(point.y);
  if (spans === undefined) return false;
  for (const span of spans) {
    if (point.x < span.x) return false;
    if (point.x < span.x + span.width) return true;
  }
  return false;
}
