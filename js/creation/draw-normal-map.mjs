export { DEFAULT_NORMAL_MAP_SETTINGS, normalizeNormalMapSettings, readNormalMapSettings, writeNormalMapSettings } from './draw-normal-map-settings.mjs?rev=20261117-normal-apply-1';

const MAX_SIDE = 1028;
const SQRT2 = Math.SQRT2;
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

function validateImage(image, name = 'image') {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
      || image.width < 1 || image.height < 1 || image.width > MAX_SIDE || image.height > MAX_SIDE) {
    throw new RangeError(`${name} dimensions must be safe integers from 1 to ${MAX_SIDE}`);
  }
  const pixelCount = image.width * image.height;
  if (!Number.isSafeInteger(pixelCount) || !(image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== pixelCount * 4) {
    throw new TypeError(`${name}.rgba must be a Uint8ClampedArray with exactly width * height * 4 values`);
  }
  return pixelCount;
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
  const { method = 'silhouette', strength = 2, radius = 3, invertHeight = false, format = 'opengl' } = options;
  if (!['silhouette', 'luminance'].includes(method)) throw new TypeError("method must be 'silhouette' or 'luminance'");
  if (!Number.isFinite(strength) || strength < 0 || strength > 8) throw new RangeError('strength must be between 0 and 8');
  if (!Number.isFinite(radius) || radius < 1 || radius > 32) throw new RangeError('radius must be between 1 and 32');
  if (typeof invertHeight !== 'boolean') throw new TypeError('invertHeight must be a boolean');
  if (!['opengl', 'directx'].includes(format)) throw new TypeError("format must be 'opengl' or 'directx'");
  return { method, strength, radius, invertHeight, format };
}

/**
 * Build an approximate tangent-space normal map for one RGBA frame.
 * The silhouette field uses a two-pass 8-neighbor chamfer distance (orthogonal=1,
 * diagonal=sqrt(2)); it is bounded O(width*height), but is not an exact Euclidean EDT.
 * It only measures alpha silhouettes and never treats the image border as background.
 */
export function createNormalMap(source, options = {}) {
  const count = validateImage(source, 'source');
  const { method, strength, radius, invertHeight, format } = validateOptions(options);
  const { width, height, rgba } = source;
  const heights = new Float32Array(count);

  if (method === 'silhouette') {
    const distance = new Float32Array(count);
    let hasTransparent = false;
    for (let index = 0; index < count; index += 1) {
      if (rgba[index * 4 + 3] === 0) { distance[index] = 0; hasTransparent = true; }
      else distance[index] = Infinity;
    }
    if (hasTransparent) {
      // Forward pass: north-west, north, north-east, west.
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        let value = distance[index];
        if (x > 0) value = Math.min(value, distance[index - 1] + 1);
        if (y > 0) {
          value = Math.min(value, distance[index - width] + 1);
          if (x > 0) value = Math.min(value, distance[index - width - 1] + SQRT2);
          if (x + 1 < width) value = Math.min(value, distance[index - width + 1] + SQRT2);
        }
        distance[index] = value;
      }
      // Reverse pass: south-west, south, south-east, east.
      for (let y = height - 1; y >= 0; y -= 1) for (let x = width - 1; x >= 0; x -= 1) {
        const index = y * width + x;
        let value = distance[index];
        if (x + 1 < width) value = Math.min(value, distance[index + 1] + 1);
        if (y + 1 < height) {
          value = Math.min(value, distance[index + width] + 1);
          if (x > 0) value = Math.min(value, distance[index + width - 1] + SQRT2);
          if (x + 1 < width) value = Math.min(value, distance[index + width + 1] + SQRT2);
        }
        distance[index] = value;
      }
      for (let index = 0; index < count; index += 1) {
        if (rgba[index * 4 + 3] !== 0) heights[index] = Math.min(1, distance[index] / radius);
      }
    }
    // If every pixel is opaque, the frame provides no silhouette boundary. Leave it flat.
  } else {
    // Rec. 709 luma. Transparent pixels have no height; their neighbors are ignored
    // during differentiation below, avoiding a false dark rim around alpha edges.
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      if (rgba[offset + 3] !== 0) heights[index] = (0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2]) / 255;
    }
  }

  if (invertHeight) for (let index = 0; index < count; index += 1) {
    if (rgba[index * 4 + 3] !== 0) heights[index] = 1 - heights[index];
  }

  const output = new Uint8ClampedArray(rgba.length);
  const sample = (x, y, center) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return center;
    const index = y * width + x;
    return rgba[index * 4 + 3] === 0 ? center : heights[index];
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x; const offset = index * 4; const alpha = rgba[offset + 3];
    output[offset + 3] = alpha;
    if (alpha === 0) {
      output[offset] = 128; output[offset + 1] = 128; output[offset + 2] = 255;
      continue;
    }
    const center = heights[index];
    const left = sample(x - 1, y, center); const right = sample(x + 1, y, center);
    const up = sample(x, y - 1, center); const down = sample(x, y + 1, center);
    const dx = (right - left) * 0.5; const dyImage = (down - up) * 0.5;
    // Canvas y points down. The +dyImage term converts to a y-up tangent normal.
    let nx = -strength * dx; let ny = strength * dyImage; let nz = 1;
    const length = Math.hypot(nx, ny, nz); nx /= length; ny /= length; nz /= length;
    output[offset] = Math.round((nx + 1) * 127.5);
    const green = Math.round((ny + 1) * 127.5);
    output[offset + 1] = format === 'directx' ? 255 - green : green;
    output[offset + 2] = Math.round((nz + 1) * 127.5);
  }
  return { width, height, rgba: output, heightValues: heights, format };
}

function validateFormat(format) {
  if (format !== 'opengl' && format !== 'directx') throw new TypeError("normal.format must be 'opengl' or 'directx'");
}

/** Render one directional light with an ambient floor and an optional Blinn-Phong highlight.
 * Renderer defaults retain the original diffuse-only preview; panel defaults opt into highlights.
 */
export function renderNormalMapLighting(source, normal, {
  azimuth = 315, elevation = 45, ambient = 0.25, intensity = 1, lightColor = '#ffffff',
  specular = 0, roughness = 0.5, shadeUnpainted = true
} = {}) {
  const count = validateImage(source, 'source');
  validateImage(normal, 'normal');
  if (source.width !== normal.width || source.height !== normal.height) throw new TypeError('source and normal dimensions must match');
  const format = normal.format ?? 'opengl'; validateFormat(format);
  if (!Number.isFinite(azimuth)) throw new TypeError('azimuth must be finite');
  if (!Number.isFinite(elevation) || elevation < 0 || elevation > 90) throw new RangeError('elevation must be between 0 and 90 degrees');
  if (!Number.isFinite(ambient) || ambient < 0 || ambient > 1) throw new RangeError('ambient must be between 0 and 1');
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2) throw new RangeError('intensity must be between 0 and 2');
  if (typeof lightColor !== 'string' || !/^#[\da-f]{6}$/i.test(lightColor)) throw new TypeError('lightColor must be a six-digit hex color');
  if (!Number.isFinite(specular) || specular < 0 || specular > 1) throw new RangeError('specular must be between 0 and 1');
  if (!Number.isFinite(roughness) || roughness < 0.05 || roughness > 1) throw new RangeError('roughness must be between 0.05 and 1');
  if (typeof shadeUnpainted !== 'boolean') throw new TypeError('shadeUnpainted must be a boolean');
  const az = azimuth * Math.PI / 180; const el = elevation * Math.PI / 180;
  const lx = Math.cos(az) * Math.cos(el); const ly = -Math.sin(az) * Math.cos(el); const lz = Math.sin(el);
  // View direction is +Z. A higher roughness widens the bounded specular lobe.
  const halfLength = Math.hypot(lx, ly, lz + 1);
  const hx = lx / halfLength, hy = ly / halfLength, hz = (lz + 1) / halfLength;
  const exponent = Math.max(1, 2 / (roughness * roughness) - 2);
  const light = [1, 3, 5].map(offset => Number.parseInt(lightColor.slice(offset, offset + 2), 16) / 255);
  const output = new Uint8ClampedArray(source.rgba.length);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const unpainted = normal.rgba[offset + 3] === 0;
    if (unpainted && !shadeUnpainted) {
      for (let channel = 0; channel < 4; channel++) output[offset + channel] = source.rgba[offset + channel];
      continue;
    }
    const alpha = source.rgba[offset + 3]; output[offset + 3] = alpha;
    if (!alpha) continue;
    let nx = unpainted ? 0 : normal.rgba[offset] / 127.5 - 1;
    let ny = unpainted ? 0 : normal.rgba[offset + 1] / 127.5 - 1;
    if (format === 'directx') ny = -ny;
    let nz = unpainted ? 1 : normal.rgba[offset + 2] / 127.5 - 1;
    const length = Math.hypot(nx, ny, nz) || 1; nx /= length; ny /= length; nz /= length;
    const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
    const direct = (1 - ambient) * diffuse * intensity;
    const highlight = specular && diffuse > 0 && nz > 0
      ? 255 * specular * intensity * Math.pow(Math.max(0, Math.min(1, nx * hx + ny * hy + nz * hz)), exponent)
      : 0;
    for (let channel = 0; channel < 3; channel++) {
      output[offset + channel] = Math.round(source.rgba[offset + channel] * (ambient + direct * light[channel]) + highlight * light[channel]);
    }
  }
  return { width: source.width, height: source.height, rgba: output };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function writeU32(bytes, offset, value) {
  bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value;
}
function writeChunk(output, offset, type, data) {
  writeU32(output, offset, data.length);
  for (let index = 0; index < 4; index += 1) output[offset + 4 + index] = type.charCodeAt(index);
  output.set(data, offset + 8);
  writeU32(output, offset + 8 + data.length, crc32(output.subarray(offset + 4, offset + 8 + data.length)));
  return offset + data.length + 12;
}

/** Encode raw RGBA8 PNG bytes with stored DEFLATE blocks (no browser color conversion). */
export function encodeNormalMapPng(image) {
  const { width, height } = image; validateImage(image, 'image');
  const stride = width * 4; const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) scanlines.set(image.rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const blockCount = Math.ceil(scanlines.length / 65535);
  const zlib = new Uint8Array(2 + scanlines.length + blockCount * 5 + 4); zlib[0] = 0x78; zlib[1] = 0x01;
  let sourceOffset = 0; let targetOffset = 2;
  while (sourceOffset < scanlines.length) {
    const length = Math.min(65535, scanlines.length - sourceOffset); const finalBlock = sourceOffset + length === scanlines.length;
    zlib[targetOffset++] = finalBlock ? 1 : 0; zlib[targetOffset++] = length & 255; zlib[targetOffset++] = length >>> 8;
    zlib[targetOffset++] = (~length) & 255; zlib[targetOffset++] = ((~length) >>> 8) & 255;
    zlib.set(scanlines.subarray(sourceOffset, sourceOffset + length), targetOffset); sourceOffset += length; targetOffset += length;
  }
  let a = 1; let b = 0;
  for (const byte of scanlines) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  writeU32(zlib, targetOffset, ((b << 16) | a) >>> 0);
  const ihdr = new Uint8Array(13); writeU32(ihdr, 0, width); writeU32(ihdr, 4, height); ihdr[8] = 8; ihdr[9] = 6;
  const png = new Uint8Array(PNG_SIGNATURE.length + ihdr.length + zlib.length + 36);
  png.set(PNG_SIGNATURE); let offset = writeChunk(png, 8, 'IHDR', ihdr); offset = writeChunk(png, offset, 'IDAT', zlib); writeChunk(png, offset, 'IEND', new Uint8Array());
  return png;
}


/** Keep painted directions exact; transparent pixels preview as a neutral surface. */
export function convertPaintedNormalMap(source, { format = 'opengl' } = {}) {
  validateImage(source, 'painted normal map'); validateFormat(format);
  const rgba = new Uint8ClampedArray(source.rgba);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (!rgba[offset + 3]) { rgba[offset] = 128; rgba[offset + 1] = 128; rgba[offset + 2] = 255; }
    else if (format === 'directx') rgba[offset + 1] = 255 - rgba[offset + 1];
  }
  return { width: source.width, height: source.height, rgba, format };
}
