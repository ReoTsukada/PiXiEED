import { hashCanonical, validateAsset } from './asset-contract.mjs';
import { documentRgba, validateDrawDocument } from './draw-core.mjs';

export const SPOT_DIFFERENCE_SCHEMA_VERSION = 1;
export const SPOT_DIFFERENCE_MAX_PIXELS = 2 * 1024 * 1024;
// The author screen renders one row per candidate; cap this explicitly rather than silently dropping small regions.
export const SPOT_DIFFERENCE_MAX_CANDIDATES = 256;
const LOCAL_OWNER = 'local-owner';

function revisionShape(revision, draftId, assetId) {
  if (!revision || revision.schemaVersion !== 1 || !revision.document || !/^[a-f0-9]{64}$/.test(revision.documentHash || '') || revision.hashScheme !== 'sha256-canonical-v1') throw new TypeError('保存版の情報が壊れています');
  const asset = validateAsset(revision.asset);
  if (asset.assetId !== assetId || asset.revisionId !== revision.revisionId || asset.contentHash !== revision.documentHash || asset.hashScheme !== revision.hashScheme || asset.kind !== 'pixel_art' || asset.visibility !== 'draft' || asset.owner.type !== 'local' || asset.owner.id !== LOCAL_OWNER || asset.reusePermission !== 'owner_only') throw new Error('自分の端末に保存したドット絵だけを使えます');
  validateDrawDocument(revision.document);
  if (revision.document.width * revision.document.height > SPOT_DIFFERENCE_MAX_PIXELS) throw new RangeError('画像が安全な処理上限を超えています');
  return revision;
}

export async function resolveLocalDrawRevision(adapter, draftId, revisionId) {
  if (!adapter || typeof adapter.get !== 'function' || typeof draftId !== 'string' || !draftId || typeof revisionId !== 'string' || !revisionId) throw new TypeError('元画像の保存版を特定できません');
  const record = await adapter.get(draftId);
  if (!record || record.schemaVersion !== 1 || record.draftId !== draftId || typeof record.assetId !== 'string' || !Array.isArray(record.revisions)) throw new Error('端末に保存した絵が見つかりません');
  const revision = record.revisions.find((item) => item?.revisionId === revisionId);
  if (!revision) throw new Error('指定した保存版がありません。別の版へ自動変更しません');
  revisionShape(revision, draftId, record.assetId);
  if (await hashCanonical(revision.document) !== revision.documentHash) throw new Error('保存版のhashが編集データと一致しません');
  return revision;
}

function samePixel(a, b, index) {
  const offset = index * 4;
  if (a[offset + 3] === 0 && b[offset + 3] === 0) return true;
  return a[offset] === b[offset] && a[offset + 1] === b[offset + 1] && a[offset + 2] === b[offset + 2] && a[offset + 3] === b[offset + 3];
}

export function detectDifferenceCandidates(beforeDocument, afterDocument) {
  validateDrawDocument(beforeDocument); validateDrawDocument(afterDocument);
  if (beforeDocument.width !== afterDocument.width || beforeDocument.height !== afterDocument.height) throw new RangeError('比較する2枚は同じ大きさにしてください');
  const width = beforeDocument.width; const height = beforeDocument.height; const count = width * height;
  if (count > SPOT_DIFFERENCE_MAX_PIXELS) throw new RangeError('画像が安全な処理上限を超えています');
  const before = documentRgba(beforeDocument); const after = documentRgba(afterDocument); const changed = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) if (!samePixel(before, after, index)) changed[index] = 1;
  const visited = new Uint8Array(count); const candidates = []; const queue = new Uint32Array(count);
  for (let start = 0; start < count; start += 1) {
    if (!changed[start] || visited[start]) continue;
    let read = 0; let write = 0; queue[write++] = start; visited[start] = 1; const pixels = [];
    while (read < write) {
      const index = queue[read++]; pixels.push(index);
      const x = index % width; const y = Math.floor(index / width);
      const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
      for (const next of neighbors) if (next >= 0 && changed[next] && !visited[next]) { visited[next] = 1; queue[write++] = next; }
    }
    pixels.sort((a, b) => a - b);
    if (candidates.length >= SPOT_DIFFERENCE_MAX_CANDIDATES) throw new RangeError('候補が多すぎて安全に編集できません。変更範囲を減らしてからもう一度お試しください');
    candidates.push({ id: `candidate-${String(candidates.length + 1).padStart(4, '0')}`, pixels });
  }
  return { width, height, candidates };
}

function validGroups(groups, width, height) {
  if (!Array.isArray(groups) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new TypeError('差分候補が壊れています');
  const used = new Set(); const ids = new Set();
  for (const group of groups) {
    if (!group || typeof group.id !== 'string' || !group.id || !Array.isArray(group.pixels) || !group.pixels.length) throw new TypeError('空または不正な候補です');
    if (ids.has(group.id)) throw new TypeError('候補IDが重複しています'); ids.add(group.id);
    for (const pixel of group.pixels) {
      if (!Number.isInteger(pixel) || pixel < 0 || pixel >= width * height || used.has(pixel)) throw new TypeError('候補の画素が重複または範囲外です');
      used.add(pixel);
    }
  }
  return groups;
}

function orderPixels(pixels) { return [...pixels].sort((a, b) => a - b); }
export function mergeDifferenceCandidates(groups, ids, width, height) {
  validGroups(groups, width, height);
  if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length || ids.some((id) => !groups.some((g) => g.id === id))) throw new RangeError('まとめる候補を2つ以上選んでください');
  const selected = new Set(ids); const picked = groups.filter((group) => selected.has(group.id)); const firstIndex = groups.findIndex((group) => selected.has(group.id));
  const merged = { id: picked.map((group) => group.id).sort()[0], pixels: orderPixels(picked.flatMap((group) => group.pixels)) };
  const next = groups.filter((group) => !selected.has(group.id)); next.splice(Math.min(firstIndex, next.length), 0, merged);
  return validGroups(next, width, height);
}

export function splitDifferenceCandidate(groups, id, selectedPixels, width, height) {
  validGroups(groups, width, height);
  const index = groups.findIndex((group) => group.id === id); if (index < 0) throw new RangeError('候補がありません');
  const group = groups[index]; const selected = new Set(selectedPixels);
  if (!selected.size || selected.size >= group.pixels.length || [...selected].some((pixel) => !group.pixels.includes(pixel))) throw new RangeError('分割する画素を一部だけ選んでください');
  const left = orderPixels(group.pixels.filter((pixel) => !selected.has(pixel))); const right = orderPixels([...selected]);
  const usedIds = new Set(groups.map((item) => item.id)); let suffix = 1; let splitId;
  do { splitId = `${group.id}-split-${String(suffix++).padStart(2, '0')}`; } while (usedIds.has(splitId));
  const next = [...groups]; next.splice(index, 1, { id: group.id, pixels: left }, { id: splitId, pixels: right });
  if (next.some((item, i) => next.findIndex((other) => other.id === item.id) !== i)) throw new Error('分割IDが重複しました');
  return validGroups(next, width, height);
}

export function excludeDifferenceCandidate(groups, id, width, height) {
  validGroups(groups, width, height);
  if (!groups.some((group) => group.id === id)) throw new RangeError('除外する候補がありません');
  return groups.filter((group) => group.id !== id).map((group) => ({ id: group.id, pixels: [...group.pixels] }));
}

export function confirmDifferenceCandidates(draft) {
  validateSpotDifferenceDraft(draft);
  if (!draft.candidates.length) throw new Error('正解にする候補を1つ以上残してください');
  return { ...structuredClone(draft), confirmed: true, publication: 'draft', published: false };
}

export function validateSpotDifferenceDraft(draft) {
  if (!draft || draft.schemaVersion !== SPOT_DIFFERENCE_SCHEMA_VERSION || typeof draft.gameId !== 'string' || !draft.gameId) throw new TypeError('間違い探しの保存データが壊れています');
  for (const key of ['before', 'after']) {
    const ref = draft[key];
    if (!ref || typeof ref.draftId !== 'string' || typeof ref.assetId !== 'string' || typeof ref.revisionId !== 'string' || ref.hashScheme !== 'sha256-canonical-v1' || !/^[a-f0-9]{64}$/.test(ref.contentHash || '')) throw new TypeError('画像の固定版参照が壊れています');
  }
  if (draft.before.draftId !== draft.after.draftId || draft.before.assetId !== draft.after.assetId) throw new Error('同じ端末内の絵の保存版どうしを選んでください');
  const sizes = new Set([16, 32, 64, 128, 256, 512]);
  if (!sizes.has(draft.width) || !sizes.has(draft.height) || draft.width * draft.height > SPOT_DIFFERENCE_MAX_PIXELS) throw new RangeError('比較画像の寸法が安全な範囲ではありません');
  if (!Array.isArray(draft.candidates)) throw new TypeError('差分候補がありません');
  validGroups(draft.candidates, draft.width, draft.height);
  if (draft.confirmed !== true && draft.publication !== 'draft') throw new Error('確認前の候補は公開できません');
  if (draft.published === true || draft.publication === 'published') throw new Error('Step12では公開できません');
  return draft;
}

export function mapClientPointToPixel(clientX, clientY, rect, width, height) {
  if (![clientX, clientY, rect?.left, rect?.top, rect?.width, rect?.height, width, height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return null;
  const x = Math.floor((clientX - rect.left) * width / rect.width); const y = Math.floor((clientY - rect.top) * height / rect.height);
  return x < 0 || y < 0 || x >= width || y >= height ? null : y * width + x;
}
