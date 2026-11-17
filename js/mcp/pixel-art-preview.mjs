import { normalizePixelArt, pixelArtToRgba } from './pixel-art-contract.mjs';

const BACKGROUNDS = Object.freeze(['#F7F2E6', '#899790', '#24263D']);
const MAX_REVIEW_EDGE = 192;
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const GRAYSCALE_FORMULA = 'Y = floor((299*R + 587*G + 114*B + 500) / 1000); output RGB=(Y,Y,Y), alpha is preserved.';

function parseHex(hex) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

function grayscale(red, green, blue) {
  return Math.floor((299 * red + 587 * green + 114 * blue + 500) / 1000);
}

function makeRgba(width, height) {
  return new Uint8Array(width * height * 4);
}

function rgbaForArt(art) {
  const rgba = pixelArtToRgba(art);
  return { width: rgba.width, height: rgba.height, data: new Uint8Array(rgba.data) };
}

function countMetrics(art, rgba) {
  const colors = new Set();
  let opaquePixels = 0;
  let minX = art.width;
  let minY = art.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < art.height; y += 1) {
    for (let x = 0; x < art.width; x += 1) {
      const offset = (y * art.width + x) * 4;
      if (rgba.data[offset + 3] === 0) continue;
      opaquePixels += 1;
      colors.add(`${rgba.data[offset]},${rgba.data[offset + 1]},${rgba.data[offset + 2]}`);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    width: art.width,
    height: art.height,
    paletteEntries: art.palette.length,
    usedColors: colors.size,
    opaquePixels,
    transparentPixels: art.width * art.height - opaquePixels,
    bounds: opaquePixels === 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  };
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, false);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const payload = concatBytes([typeBytes, data]);
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  writeU32(view, 0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  writeU32(view, data.length + 8, crc32(payload));
  return result;
}

async function deflate(bytes) {
  if (typeof CompressionStream !== 'function') throw new Error('PNG圧縮に対応した実行環境が必要です。');
  const stream = new CompressionStream('deflate');
  const output = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return new Uint8Array(await output);
}

function toBase64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset];
    const hasB = offset + 1 < bytes.length;
    const hasC = offset + 2 < bytes.length;
    const b = hasB ? bytes[offset + 1] : 0;
    const c = hasC ? bytes[offset + 2] : 0;
    encoded += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)];
    encoded += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
    encoded += hasC ? alphabet[c & 63] : '=';
  }
  return encoded;
}

async function encodePng(width, height, rgba) {
  const rowLength = width * 4;
  const scanlines = new Uint8Array(height * (rowLength + 1));
  for (let y = 0; y < height; y += 1) scanlines.set(rgba.subarray(y * rowLength, (y + 1) * rowLength), y * (rowLength + 1) + 1);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  writeU32(view, 0, width);
  writeU32(view, 4, height);
  header[8] = 8;
  header[9] = 6;
  const compressed = await deflate(scanlines);
  const bytes = concatBytes([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', compressed), pngChunk('IEND', new Uint8Array())]);
  return { mimeType: 'image/png', data: toBase64(bytes), width, height };
}

function backgroundColor(hex) {
  return parseHex(hex);
}

function composeReview(art, artRgba, scale) {
  const padding = 8;
  const titleHeight = 12;
  const cellWidth = Math.min(MAX_REVIEW_EDGE, Math.max(96, art.width * scale + padding * 2));
  const cellHeight = Math.max(art.height * scale, art.height) + art.height + padding * 2;
  const sheetWidth = cellWidth * 3 + padding * 4;
  const sheetHeight = titleHeight + cellHeight * 2 + padding * 3;
  const sheet = makeRgba(sheetWidth, sheetHeight);
  const nativeXOffset = Math.floor((cellWidth - art.width) / 2);
  const zoomXOffset = Math.floor((cellWidth - art.width * scale) / 2);

  for (let mode = 0; mode < 2; mode += 1) {
    for (let bgIndex = 0; bgIndex < BACKGROUNDS.length; bgIndex += 1) {
      const background = backgroundColor(BACKGROUNDS[bgIndex]);
      const cellX = padding + bgIndex * (cellWidth + padding);
      const cellY = titleHeight + padding + mode * (cellHeight + padding);
      const nativeY = cellY + padding;
      const zoomY = nativeY + art.height + padding;
      fillBackground(sheet, sheetWidth, cellX, cellY, cellWidth, cellHeight, background);
      drawCellArt(sheet, sheetWidth, art, artRgba, scale, mode === 1, background, cellX, nativeY, zoomY, nativeXOffset, zoomXOffset);
    }
  }
  return { width: sheetWidth, height: sheetHeight, data: sheet };
}

function fillBackground(target, targetWidth, x, y, width, height, color) {
  const row = new Uint8Array(width * 4);
  for (let px = 0; px < width; px += 1) {
    const offset = px * 4;
    row[offset] = color[0];
    row[offset + 1] = color[1];
    row[offset + 2] = color[2];
    row[offset + 3] = 255;
  }
  for (let py = 0; py < height; py += 1) target.set(row, ((y + py) * targetWidth + x) * 4);
}

function drawCellArt(sheet, sheetWidth, art, artRgba, scale, grayscaleMode, background, cellX, nativeY, zoomY, nativeXOffset, zoomXOffset) {
  const nativeRow = new Uint8Array(art.width * 4);
  const zoomRow = new Uint8Array(art.width * scale * 4);
  for (let y = 0; y < art.height; y += 1) {
    nativeRow.fill(0);
    zoomRow.fill(0);
    for (let x = 0; x < art.width; x += 1) {
      const sourceOffset = (y * art.width + x) * 4;
      const nativeOffset = x * 4;
      let red = background[0];
      let green = background[1];
      let blue = background[2];
      if (artRgba.data[sourceOffset + 3] !== 0) {
        red = artRgba.data[sourceOffset];
        green = artRgba.data[sourceOffset + 1];
        blue = artRgba.data[sourceOffset + 2];
        if (grayscaleMode) red = green = blue = grayscale(red, green, blue);
      }
      nativeRow[nativeOffset] = red;
      nativeRow[nativeOffset + 1] = green;
      nativeRow[nativeOffset + 2] = blue;
      nativeRow[nativeOffset + 3] = 255;
      const zoomOffset = x * scale * 4;
      for (let dx = 0; dx < scale; dx += 1) {
        const offset = zoomOffset + dx * 4;
        zoomRow[offset] = red;
        zoomRow[offset + 1] = green;
        zoomRow[offset + 2] = blue;
        zoomRow[offset + 3] = 255;
      }
    }
    sheet.set(nativeRow, ((nativeY + y) * sheetWidth + cellX + nativeXOffset) * 4);
    for (let dy = 0; dy < scale; dy += 1) {
      sheet.set(zoomRow, ((zoomY + y * scale + dy) * sheetWidth + cellX + zoomXOffset) * 4);
    }
  }
}

/** Renders the normalized pixel art as transparent native PNG and a visual review sheet. */
export async function renderPixelArtPreviews(input) {
  const art = normalizePixelArt(input);
  const rgba = rgbaForArt(art);
  const scale = Math.min(8, Math.max(1, Math.floor(MAX_REVIEW_EDGE / Math.max(art.width, art.height))));
  const native = await encodePng(art.width, art.height, rgba.data);
  const reviewRgba = composeReview(art, rgba, scale);
  const review = await encodePng(reviewRgba.width, reviewRgba.height, reviewRgba.data);
  return {
    images: [
      { kind: 'native', ...native },
      { kind: 'review', ...review }
    ],
    metrics: countMetrics(art, rgba),
    review: {
      scale,
      backgrounds: [...BACKGROUNDS],
      layout: '3背景を横並び、上段は原色・下段はグレースケール。各背景セルは余白を挟んで原寸プレビューと最近傍拡大を配置します。',
      grayscaleMethod: GRAYSCALE_FORMULA
    }
  };
}
