const ALLOWED_SIZES = new Set([16, 32, 64, 128, 256, 512]);
const MAX_PIXELS = 512 * 512;
const MAX_SPOT_CANDIDATES = 256;
const MAX_HIDDEN_TARGETS = 128;
const MAX_MASK_PIXELS = 128 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertDefinition(definition, kind) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new TypeError('パズル定義が不正です');
  if (definition.schemaVersion !== 1) throw new Error('未対応のパズル定義バージョンです');
  // confirmed is only a client UI declaration; it does not prove author identity or that a person reviewed the puzzle.
  if (definition.confirmed !== true) throw new Error('確認済みのパズル定義が必要です');
  if (!ALLOWED_SIZES.has(definition.width) || !ALLOWED_SIZES.has(definition.height)) throw new RangeError('画像寸法が不正です');
  const pixelCount = definition.width * definition.height;
  if (pixelCount > MAX_PIXELS) throw new RangeError('画像寸法が上限を超えています');
  const rows = definition[kind];
  const max = kind === 'candidates' ? MAX_SPOT_CANDIDATES : MAX_HIDDEN_TARGETS;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > max) throw new RangeError(`定義は1〜${max}件必要です`);
  return { width: definition.width, height: definition.height, pixelCount, rows };
}

function validatePixels(pixels, pixelCount, label, occupied, maxLength = pixelCount) {
  if (!Array.isArray(pixels) || pixels.length < 1 || pixels.length > Math.min(pixelCount, maxLength)) throw new RangeError(`${label}の画素数が不正です`);
  const local = new Set();
  for (const pixel of pixels) {
    if (!Number.isInteger(pixel) || pixel < 0 || pixel >= pixelCount) throw new RangeError(`${label}が範囲外です`);
    if (local.has(pixel) || occupied?.has(pixel)) throw new Error(`${label}の画素が重複しています`);
    local.add(pixel);
    occupied?.add(pixel);
  }
  return [...local].sort((a, b) => a - b);
}

function validateImage(image, width, height, label) {
  if (!image || image.width !== width || image.height !== height || !(image.rgba instanceof Uint8Array)) throw new TypeError(`${label}の寸法またはRGBAデータが不正です`);
  const expected = width * height * 4;
  if (image.rgba.length !== expected) throw new RangeError(`${label}のRGBA長が不正です`);
}

function differs(original, changed, pixel) {
  const offset = pixel * 4;
  const aa = original.rgba[offset + 3]; const ba = changed.rgba[offset + 3];
  if (aa === 0 && ba === 0) return false;
  return original.rgba[offset] !== changed.rgba[offset]
    || original.rgba[offset + 1] !== changed.rgba[offset + 1]
    || original.rgba[offset + 2] !== changed.rgba[offset + 2]
    || aa !== ba;
}

export function validateSpotPuzzleDefinition(definition, original, changed) {
  const { width, height, pixelCount, rows } = assertDefinition(definition, 'candidates');
  validateImage(original, width, height, '元画像');
  validateImage(changed, width, height, '変更後画像');
  const ids = new Set(); const occupied = new Set(); const candidates = [];
  let hasActualDifference = false;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) if (differs(original, changed, pixel)) { hasActualDifference = true; break; }
  if (!hasActualDifference) throw new Error('画像に実際の差分がありません');
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !SAFE_ID.test(row.id) || ids.has(row.id)) throw new TypeError('候補IDが空または重複しています');
    ids.add(row.id);
    const pixels = validatePixels(row.pixels, pixelCount, '候補', occupied);
    for (const pixel of pixels) if (!differs(original, changed, pixel)) throw new Error('実際に異なる画素だけを正解にできます');
    candidates.push({ id: row.id, pixels });
  }
  return { schemaVersion: 1, width, height, confirmed: true, candidates };
}

function makeBounds(pixels, width) {
  let minX = width; let minY = Infinity; let maxX = -1; let maxY = -1;
  for (const pixel of pixels) { const x = pixel % width; const y = Math.floor(pixel / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { minX, minY, maxX, maxY };
}

function expandAxis(min, max, limit, required) {
  if (required > limit) throw new Error('画像が小さく24 CSS pxの対象範囲を作れません');
  const extra = Math.max(0, required - (max - min + 1));
  let nextMin = min - Math.floor(extra / 2); let nextMax = max + Math.ceil(extra / 2);
  if (nextMin < 0) { nextMax = Math.min(limit - 1, nextMax - nextMin); nextMin = 0; }
  if (nextMax >= limit) { nextMin = Math.max(0, nextMin - (nextMax - limit + 1)); nextMax = limit - 1; }
  return [nextMin, nextMax];
}

function overlap(a, b) { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }

export function validateHiddenPuzzleDefinition(definition, original) {
  const { width, height, pixelCount, rows } = assertDefinition(definition, 'targets');
  if (definition.prompt !== undefined && (typeof definition.prompt !== 'string' || definition.prompt.length > 180 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(definition.prompt))) throw new TypeError('共有画像の文言は180文字以内で入力してください');
  validateImage(original, width, height, '元画像');
  const ids = new Set(); const names = new Set(); const occupied = new Set(); let total = 0;
  const cellCss = 120 / width; const required = Math.ceil(24 / cellCss); const hitBoxes = []; const targets = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !SAFE_ID.test(row.id) || ids.has(row.id)) throw new TypeError('対象IDが空または重複しています');
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(row.name)) throw new TypeError('対象名が空または長すぎます');
    const name = row.name.trim(); const normalized = name.toLocaleLowerCase('ja');
    if (names.has(normalized)) throw new Error('対象名が重複しています');
    ids.add(row.id); names.add(normalized);
    const remainingMaskBudget = MAX_MASK_PIXELS - total;
    const pixels = validatePixels(row.pixels, pixelCount, '対象マスク', occupied, remainingMaskBudget);
    total += pixels.length;
    if (total > MAX_MASK_PIXELS) throw new RangeError('対象マスク合計が上限を超えています');
    const bounds = makeBounds(pixels, width);
    const [minX, maxX] = expandAxis(bounds.minX, bounds.maxX, width, required);
    const [minY, maxY] = expandAxis(bounds.minY, bounds.maxY, height, required);
    const hitBox = { targetId: row.id, minX, minY, maxX, maxY };
    if ((maxX - minX + 1) * cellCss < 24 || (maxY - minY + 1) * cellCss < 24) throw new Error('24 CSS pxの対象範囲を作れません');
    for (const previous of hitBoxes) if (overlap(previous, hitBox)) throw new Error('対象の当たり範囲が重なっています');
    hitBoxes.push(hitBox); targets.push({ id: row.id, name, pixels });
  }
  return { schemaVersion: 1, width, height, confirmed: true, targets, hitBoxes, ...(definition.prompt?.trim() ? { prompt: definition.prompt.trim() } : {}) };
}
