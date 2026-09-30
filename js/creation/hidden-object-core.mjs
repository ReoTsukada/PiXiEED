import { hashCanonical, validateAsset } from './asset-contract.mjs';
import { validateDrawDocument } from './draw-core.mjs';

export const HIDDEN_OBJECT_SCHEMA_VERSION = 1;
export const HIDDEN_OBJECT_MAX_TARGETS = 128;
export const HIDDEN_OBJECT_MAX_PIXELS = 512 * 512;
export const HIDDEN_OBJECT_MAX_MASK_PIXELS = 128 * 1024;
export const HIDDEN_OBJECT_MIN_HIT_CSS_PX = 24;
export const HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH = 120;
// Kept for drafts confirmed before the short-screen play layout was measured.
export const HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH = 216;
const LOCAL_OWNER = 'local-owner';

export async function resolveLocalDrawRevision(adapter, draftId, revisionId) {
  if (!adapter || typeof adapter.get !== 'function' || typeof draftId !== 'string' || !draftId || typeof revisionId !== 'string' || !revisionId) throw new TypeError('元画像の保存版を特定できません');
  const record = await adapter.get(draftId);
  if (!record || record.schemaVersion !== 1 || record.draftId !== draftId || typeof record.assetId !== 'string' || !Array.isArray(record.revisions)) throw new Error('端末に保存した絵が見つかりません');
  const revision = record.revisions.find((item) => item?.revisionId === revisionId);
  if (!revision || revision.schemaVersion !== 1 || revision.hashScheme !== 'sha256-canonical-v1' || !/^[a-f0-9]{64}$/.test(revision.documentHash || '') || !revision.document) throw new Error('指定した保存版がありません。別の版へ自動変更しません');
  const asset = validateAsset(revision.asset);
  if (asset.assetId !== record.assetId || asset.revisionId !== revision.revisionId || asset.contentHash !== revision.documentHash || asset.hashScheme !== revision.hashScheme || asset.kind !== 'pixel_art' || asset.visibility !== 'draft' || asset.owner.type !== 'local' || asset.owner.id !== LOCAL_OWNER || asset.reusePermission !== 'owner_only') throw new Error('自分の端末に保存したドット絵だけを使えます');
  validateDrawDocument(revision.document);
  if (revision.document.width * revision.document.height > HIDDEN_OBJECT_MAX_PIXELS) throw new RangeError('画像が安全な処理上限を超えています');
  if (await hashCanonical(revision.document) !== revision.documentHash) throw new Error('保存版のhashと編集データが一致しません');
  return revision;
}

function assertSource(source) {
  if (!source || typeof source.draftId !== 'string' || !source.draftId || typeof source.assetId !== 'string' || !source.assetId || typeof source.revisionId !== 'string' || !source.revisionId || source.hashScheme !== 'sha256-canonical-v1' || !/^[a-f0-9]{64}$/.test(source.contentHash || '')) throw new TypeError('元画像の固定版参照が壊れています');
}

function maskBounds(target, width, height, occupied) {
  if (!target || typeof target.id !== 'string' || !target.id || typeof target.name !== 'string' || !target.name.trim() || !Array.isArray(target.pixels) || !target.pixels.length) throw new TypeError('名前のない対象、または空のマスクがあります');
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (const pixel of target.pixels) {
    if (!Number.isInteger(pixel) || pixel < 0 || pixel >= width * height) throw new RangeError('マスクが画像の範囲外です');
    if (occupied?.[pixel]) throw new Error('対象マスクが重なっています。重ならないように消してください');
    if (occupied) occupied[pixel] = 1;
    const x = pixel % width; const y = Math.floor(pixel / width);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (new Set(target.pixels).size !== target.pixels.length) throw new Error('同じマスク内に重複した画素があります');
  return { minX, minY, maxX, maxY };
}

function expandBounds(bounds, width, height, requiredWidth, requiredHeight) {
  const expandAxis = (min, max, limit, required) => {
    if (required > limit) throw new Error('画像が小さく、押しやすい正解範囲を作れません');
    const current = max - min + 1; const extra = Math.max(0, required - current);
    let nextMin = min - Math.floor(extra / 2); let nextMax = max + Math.ceil(extra / 2);
    if (nextMin < 0) { nextMax = Math.min(limit - 1, nextMax - nextMin); nextMin = 0; }
    if (nextMax >= limit) { nextMin = Math.max(0, nextMin - (nextMax - limit + 1)); nextMax = limit - 1; }
    return [nextMin, nextMax];
  };
  const [minX, maxX] = expandAxis(bounds.minX, bounds.maxX, width, requiredWidth);
  const [minY, maxY] = expandAxis(bounds.minY, bounds.maxY, height, requiredHeight);
  return { minX, minY, maxX, maxY };
}

function boxesOverlap(a, b) { return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY; }

export function buildHiddenObjectHitBoxes(targets, width, height, cssCanvasWidth, { minTargetCssPx = HIDDEN_OBJECT_MIN_HIT_CSS_PX } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > HIDDEN_OBJECT_MAX_PIXELS || !Number.isFinite(cssCanvasWidth) || cssCanvasWidth <= 0 || !Number.isFinite(minTargetCssPx) || minTargetCssPx < 1) throw new TypeError('画像寸法または表示サイズが不正です');
  if (!Array.isArray(targets) || !targets.length || targets.length > HIDDEN_OBJECT_MAX_TARGETS) throw new RangeError('対象を1〜128個指定してください');
  validateTargetMasks(targets, width, height);
  const cellCss = cssCanvasWidth / width;
  const required = Math.max(1, Math.ceil(minTargetCssPx / cellCss));
  const rows = targets.map((target) => {
    const bounds = maskBounds(target, width, height);
    const hitBox = expandBounds(bounds, width, height, required, required);
    if ((hitBox.maxX - hitBox.minX + 1) * cellCss < minTargetCssPx || (hitBox.maxY - hitBox.minY + 1) * cellCss < minTargetCssPx) throw new Error('押しやすい大きさになるようマスクを広げてください');
    return { targetId: target.id, ...hitBox };
  });
  for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) if (boxesOverlap(rows[i], rows[j])) throw new Error('対象の押せる範囲が重なっています。対象を離してください');
  return rows;
}

function validateTargetMasks(targets, width, height) {
  if (!Array.isArray(targets) || targets.length > HIDDEN_OBJECT_MAX_TARGETS) throw new RangeError('対象は128個までです');
  const occupied = new Uint8Array(width * height); const names = new Set(); const ids = new Set(); let totalMaskPixels = 0;
  for (const target of targets) {
    const normalizedName = target?.name?.trim()?.toLocaleLowerCase('ja');
    if (ids.has(target.id) || names.has(normalizedName)) throw new Error('対象IDと名前はそれぞれ重複できません');
    ids.add(target.id); names.add(normalizedName);
    maskBounds(target, width, height, occupied);
    totalMaskPixels += target.pixels.length;
    if (totalMaskPixels > HIDDEN_OBJECT_MAX_MASK_PIXELS) throw new RangeError('対象マスクの合計が保存上限を超えました。範囲を減らしてください');
  }
  return true;
}

export function createHiddenObjectDraft({ gameId, source, width, height, targets = [], confirmed = false, hitBoxes = null, hitTestLayout = null }) {
  const draft = { schemaVersion: HIDDEN_OBJECT_SCHEMA_VERSION, gameId, source: structuredClone(source), width, height, targets: structuredClone(targets), confirmed, hitBoxes: hitBoxes ? structuredClone(hitBoxes) : null, hitTestLayout: hitTestLayout ? structuredClone(hitTestLayout) : null, publication: 'draft', published: false };
  return validateHiddenObjectDraft(draft);
}

export function confirmHiddenObjectTargets(draft) {
  validateHiddenObjectDraft(draft);
  const hitBoxes = buildHiddenObjectHitBoxes(draft.targets, draft.width, draft.height, HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH);
  return validateHiddenObjectDraft({ ...structuredClone(draft), confirmed: true, hitBoxes, hitTestLayout: { cssCanvasWidth: HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH, minTargetCssPx: HIDDEN_OBJECT_MIN_HIT_CSS_PX }, publication: 'draft', published: false });
}

export function validateHiddenObjectDraft(draft) {
  if (!draft || draft.schemaVersion !== HIDDEN_OBJECT_SCHEMA_VERSION || typeof draft.gameId !== 'string' || !draft.gameId) throw new TypeError('もの探しの保存データが壊れています');
  assertSource(draft.source);
  if (![draft.width, draft.height].every((side) => Number.isInteger(side) && side >= 1 && side <= 512) || draft.width * draft.height > HIDDEN_OBJECT_MAX_PIXELS) throw new RangeError('画像の寸法が安全な範囲ではありません');
  validateTargetMasks(draft.targets, draft.width, draft.height);
  if (draft.confirmed) {
    if (!draft.targets.length || !Array.isArray(draft.hitBoxes) || draft.hitBoxes.length !== draft.targets.length || !draft.hitTestLayout || ![HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH, HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH].includes(draft.hitTestLayout.cssCanvasWidth) || draft.hitTestLayout.minTargetCssPx !== HIDDEN_OBJECT_MIN_HIT_CSS_PX) throw new Error('作者の確認前のマスクは正解にできません');
    for (const box of draft.hitBoxes) if (!box || !Number.isInteger(box.minX) || !Number.isInteger(box.maxX) || !Number.isInteger(box.minY) || !Number.isInteger(box.maxY) || box.minX < 0 || box.minY < 0 || box.maxX >= draft.width || box.maxY >= draft.height || box.minX > box.maxX || box.minY > box.maxY) throw new TypeError('対象の正解範囲が壊れています');
    for (let i = 0; i < draft.hitBoxes.length; i += 1) for (let j = i + 1; j < draft.hitBoxes.length; j += 1) if (boxesOverlap(draft.hitBoxes[i], draft.hitBoxes[j])) throw new Error('対象の押せる範囲が重なっています');
    const expected = buildHiddenObjectHitBoxes(draft.targets, draft.width, draft.height, draft.hitTestLayout.cssCanvasWidth, { minTargetCssPx: draft.hitTestLayout.minTargetCssPx });
    if (JSON.stringify(expected) !== JSON.stringify(draft.hitBoxes)) throw new Error('保存した正解範囲が作者指定のマスクと一致しません');
  } else if (draft.hitBoxes !== null || draft.hitTestLayout !== null) throw new Error('未確定のマスクを正解として保存できません');
  if (draft.publication !== 'draft' || draft.published === true) throw new Error('Step13では公開できません');
  return draft;
}

export function mapClientPointToPixel(clientX, clientY, rect, width, height) {
  if (![clientX, clientY, rect?.left, rect?.top, rect?.width, rect?.height, width, height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return null;
  const x = Math.floor((clientX - rect.left) * width / rect.width); const y = Math.floor((clientY - rect.top) * height / rect.height);
  return x < 0 || y < 0 || x >= width || y >= height ? null : y * width + x;
}

export function targetAtPixel(draft, pixel) {
  if (!draft || !draft.confirmed || !Number.isInteger(pixel) || pixel < 0 || pixel >= draft.width * draft.height || !Array.isArray(draft.hitBoxes) || !Array.isArray(draft.targets)) return null;
  const x = pixel % draft.width; const y = Math.floor(pixel / draft.width);
  const match = draft.hitBoxes.filter((box) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY);
  return match.length === 1 ? draft.targets.find((target) => target.id === match[0].targetId) ?? null : null;
}

export function targetAtClientPoint(draft, clientX, clientY, rect) {
  const pixel = mapClientPointToPixel(clientX, clientY, rect, draft.width, draft.height);
  return pixel === null ? null : targetAtPixel(draft, pixel);
}
