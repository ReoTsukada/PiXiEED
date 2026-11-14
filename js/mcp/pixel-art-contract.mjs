export const PIXEL_SYMBOLS = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

export const PIXEL_ART_LIMITS = Object.freeze({
  maxWidth: 64,
  maxHeight: 64,
  maxPalette: 32,
  maxTitleCodePoints: 80,
  maxTokenLength: 10000
});

const INPUT_KEYS = new Set(['title', 'width', 'height', 'palette', 'rows']);
const TITLE_DEFAULT = 'AIで作ったドット絵';
const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export const PIXEL_ART_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['width', 'height', 'palette', 'rows'],
  properties: {
    title: { type: 'string', maxLength: PIXEL_ART_LIMITS.maxTitleCodePoints, description: '作品名。省略時は「AIで作ったドット絵」。制御文字は使えません。' },
    width: { type: 'integer', minimum: 1, maximum: PIXEL_ART_LIMITS.maxWidth },
    height: { type: 'integer', minimum: 1, maximum: PIXEL_ART_LIMITS.maxHeight },
    palette: {
      type: 'array', minItems: 1, maxItems: PIXEL_ART_LIMITS.maxPalette,
      items: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      description: '行データで使う#RRGGBB色の配列。記号0123456789ABCDEFGHIJKLMNOPQRSTUVが順に添字0〜31を参照します。'
    },
    rows: {
      type: 'array', minItems: 1, maxItems: PIXEL_ART_LIMITS.maxHeight,
      items: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[.0-9A-V]+$' },
      description: '上から順にheight本、左から右へwidth文字。`.`は透明。0123456789ABCDEFGHIJKLMNOPQRSTUVがpaletteの添字0〜31。存在する色だけ使用してください。'
    }
  }
});

function fail(message) {
  throw new TypeError(message);
}

function hasOnlyInputKeys(input) {
  return Object.keys(input).every((key) => INPUT_KEYS.has(key));
}

export function normalizePixelArt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('ドット絵の入力形式を確認してください。');
  if (!hasOnlyInputKeys(input)) fail('ドット絵に未対応の項目があります。');

  const title = input.title === undefined ? TITLE_DEFAULT : input.title;
  if (typeof title !== 'string' || /\p{Cc}/u.test(title) || Array.from(title).length > PIXEL_ART_LIMITS.maxTitleCodePoints) {
    fail('作品名は制御文字を含まない80文字以内で指定してください。');
  }
  const { width, height, palette, rows } = input;
  if (!Number.isInteger(width) || width < 1 || width > PIXEL_ART_LIMITS.maxWidth) fail('幅は1〜64の整数で指定してください。');
  if (!Number.isInteger(height) || height < 1 || height > PIXEL_ART_LIMITS.maxHeight) fail('高さは1〜64の整数で指定してください。');
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > PIXEL_ART_LIMITS.maxPalette) fail('パレットは1〜32色で指定してください。');
  const normalizedPalette = Array.from(palette, (color) => {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) fail('色は#RRGGBB形式で指定してください。');
    return color.toUpperCase();
  });
  if (!Array.isArray(rows) || rows.length !== height) fail('行の数は高さと一致させてください。');
  let hasPixel = false;
  const normalizedRows = Array.from(rows, (row) => {
    if (typeof row !== 'string' || row.length !== width || !/^[.0-9A-V]+$/.test(row)) fail('各行は幅と同じ文字数のASCII画素データで指定してください。');
    for (const symbol of row) {
      if (symbol === '.') continue;
      const colorIndex = PIXEL_SYMBOLS.indexOf(symbol);
      if (colorIndex < 0 || colorIndex >= normalizedPalette.length) fail('画素が参照する色がパレットにありません。');
      hasPixel = true;
    }
    return row;
  });
  if (!hasPixel) fail('すべて透明のドット絵は保存できません。');
  return { title, width, height, palette: normalizedPalette, rows: normalizedRows };
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeBase64Url(bytes) {
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset];
    const hasB = offset + 1 < bytes.length;
    const hasC = offset + 2 < bytes.length;
    const b = hasB ? bytes[offset + 1] : 0;
    const c = hasC ? bytes[offset + 2] : 0;
    output += BASE64URL[a >> 2];
    output += BASE64URL[((a & 3) << 4) | (b >> 4)];
    if (hasB) output += BASE64URL[((b & 15) << 2) | (c >> 6)];
    if (hasC) output += BASE64URL[c & 63];
  }
  return output;
}

function decodeBase64Url(token) {
  if (!/^[A-Za-z0-9_-]*$/.test(token) || token.length % 4 === 1) fail('保存データの形式を確認してください。');
  const output = new Uint8Array(Math.floor(token.length * 3 / 4));
  let cursor = 0;
  for (let offset = 0; offset < token.length; offset += 4) {
    const remaining = token.length - offset;
    const a = BASE64URL.indexOf(token[offset]);
    const b = BASE64URL.indexOf(token[offset + 1]);
    const c = remaining > 2 ? BASE64URL.indexOf(token[offset + 2]) : 0;
    const d = remaining > 3 ? BASE64URL.indexOf(token[offset + 3]) : 0;
    output[cursor++] = (a << 2) | (b >> 4);
    if (remaining > 2) output[cursor++] = ((b & 15) << 4) | (c >> 2);
    if (remaining > 3) output[cursor++] = ((c & 3) << 6) | d;
  }
  if (encodeBase64Url(output) !== token) fail('保存データの形式を確認してください。');
  return output;
}

export function encodePixelArt(input) {
  const normalized = normalizePixelArt(input);
  return encodeBase64Url(UTF8_ENCODER.encode(JSON.stringify({ v: 1, ...normalized })));
}

export function decodePixelArt(token) {
  if (typeof token !== 'string' || token.length > PIXEL_ART_LIMITS.maxTokenLength || !/^[\x00-\x7F]*$/.test(token)) {
    fail('保存データはASCIIの10000文字以内で指定してください。');
  }
  let value;
  try {
    value = JSON.parse(UTF8_DECODER.decode(decodeBase64Url(token)));
  } catch {
    fail('保存データを読み取れません。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1) fail('保存データのバージョンに対応していません。');
  const { v, ...input } = value;
  return normalizePixelArt(input);
}

export function toDrawDocument(input) {
  const normalized = normalizePixelArt(input);
  const pixels = [];
  for (const row of normalized.rows) {
    for (const symbol of row) pixels.push(symbol === '.' ? -1 : PIXEL_SYMBOLS.indexOf(symbol));
  }
  return {
    schemaVersion: 1,
    width: normalized.width,
    height: normalized.height,
    palette: [...normalized.palette],
    pixels
  };
}

export function pixelArtToRgba(input) {
  const normalized = normalizePixelArt(input);
  const data = new Uint8ClampedArray(normalized.width * normalized.height * 4);
  let pixel = 0;
  for (const row of normalized.rows) {
    for (const symbol of row) {
      const offset = pixel++ * 4;
      if (symbol === '.') continue;
      const color = normalized.palette[PIXEL_SYMBOLS.indexOf(symbol)];
      data[offset] = Number.parseInt(color.slice(1, 3), 16);
      data[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
      data[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
      data[offset + 3] = 255;
    }
  }
  return { width: normalized.width, height: normalized.height, data };
}
