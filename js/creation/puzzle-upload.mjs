import { encodeDrawPng } from './draw-handoff.mjs';
import { validateAsset } from './asset-contract.mjs';
import { resolveLocalDrawRevision as resolveSpotRevision, validateSpotDifferenceDraft } from './spot-difference-core.mjs';
import { resolveLocalDrawRevision as resolveHiddenRevision, validateHiddenObjectDraft } from './hidden-object-core.mjs';
import { inspectPixelImage } from '../globe/post-image.mjs';

const LOCAL_OWNER = 'local-owner';
const HASH_SCHEME = 'sha256-canonical-v1';

function assertLocalPuzzleRevision(revision, draftId, mode) {
  if (!revision || revision.schemaVersion !== 1 || revision.hashScheme !== HASH_SCHEME || !/^[a-f0-9]{64}$/.test(revision.documentHash || '')) throw new TypeError('保存したパズル下書きが壊れています');
  const asset = validateAsset(revision.asset);
  if (asset.revisionId !== revision.revisionId || asset.contentHash !== revision.documentHash || asset.hashScheme !== HASH_SCHEME || asset.kind !== mode || asset.visibility !== 'draft' || asset.owner.type !== 'local' || asset.owner.id !== LOCAL_OWNER || asset.reusePermission !== 'owner_only') throw new Error('自分の確認済み下書きだけを使えます');
  if (revision.document?.gameId !== draftId || revision.asset?.owner?.id !== LOCAL_OWNER) throw new Error('パズル下書きIDが一致しません');
  return revision.document;
}

function sameRef(ref, revision) {
  return ref && ref.draftId && ref.assetId === revision.asset.assetId && ref.revisionId === revision.revisionId && ref.contentHash === revision.documentHash && ref.hashScheme === revision.hashScheme;
}

function sourceRef(ref) {
  return { draftId: ref.draftId, assetId: ref.assetId, revisionId: ref.revisionId, contentHash: ref.contentHash, hashScheme: ref.hashScheme };
}

function assertClaim(result, width, height) {
  if (!result || typeof result !== 'object' || typeof result.dataUrl !== 'string' || !result.dataUrl.startsWith('data:image/png;base64,') || result.mimeType !== 'image/png' || !Number.isSafeInteger(result.size) || result.size < 1 || result.size > 512 * 1024 || result.width !== width || result.height !== height || !Number.isInteger(result.colorCount) || result.colorCount < 1 || result.colorCount > 128) throw new TypeError('PNGの検査結果が不正です');
  const base64 = result.dataUrl.slice('data:image/png;base64,'.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new TypeError('正規化PNGを確認できません');
  let binary;
  try { binary = atob(base64); } catch { throw new TypeError('正規化PNGを確認できません'); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== result.size || bytes.length < 8 || ![137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)) throw new TypeError('PNGの実データと申告値が一致しません');
  if (btoa(binary) !== base64) throw new TypeError('正規化PNGを確認できません');
  return { mimeType: 'image/png', size: result.size, width, height, colorCount: result.colorCount, base64 };
}

async function imageClaim(document, encodeImage, inspectImage, width, height) {
  const blob = await encodeImage(document);
  if (!blob || blob.type !== 'image/png' || !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > 512 * 1024) throw new TypeError('DrawからPNGを作成できません');
  return assertClaim(await inspectImage(blob), width, height);
}

export async function preparePuzzleUpload({ mode, draftId, store, adapter, encodeImage = encodeDrawPng, inspectImage = inspectPixelImage } = {}) {
  if (mode !== 'spot_difference' && mode !== 'hidden_object') throw new TypeError('未対応のパズル形式です');
  if (!store || typeof store.load !== 'function' || !adapter || typeof adapter.get !== 'function') throw new TypeError('ローカル下書きストアが必要です');
  const saved = await store.load(draftId);
  const draft = assertLocalPuzzleRevision(saved, draftId, mode);
  if (draft.confirmed !== true || draft.publication !== 'draft' || draft.published === true) throw new Error('確認済みの未公開下書きだけを送信できます');

  const resolver = mode === 'spot_difference' ? resolveSpotRevision : resolveHiddenRevision;
  let originalRevision; let changedRevision = null;
  if (mode === 'spot_difference') {
    validateSpotDifferenceDraft(draft);
    if (draft.before.revisionId === draft.after.revisionId) throw new Error('間違い探しには異なる2つの保存版が必要です');
    [originalRevision, changedRevision] = await Promise.all([
      resolver(adapter, draft.before.draftId, draft.before.revisionId),
      resolver(adapter, draft.after.draftId, draft.after.revisionId),
    ]);
    if (!sameRef(draft.before, originalRevision) || !sameRef(draft.after, changedRevision)) throw new Error('間違い探しの固定版参照が一致しません');
    if (originalRevision.document.width !== draft.width || originalRevision.document.height !== draft.height || changedRevision.document.width !== draft.width || changedRevision.document.height !== draft.height) throw new Error('画像寸法と下書き定義が一致しません');
  } else {
    validateHiddenObjectDraft(draft);
    originalRevision = await resolver(adapter, draft.source.draftId, draft.source.revisionId);
    if (!sameRef(draft.source, originalRevision)) throw new Error('もの探しの固定版参照が一致しません');
    if (originalRevision.document.width !== draft.width || originalRevision.document.height !== draft.height) throw new Error('画像寸法と下書き定義が一致しません');
  }

  const originalClaim = await imageClaim(originalRevision.document, encodeImage, inspectImage, draft.width, draft.height);
  const definition = mode === 'spot_difference'
    ? { schemaVersion: 1, width: draft.width, height: draft.height, confirmed: true, candidates: structuredClone(draft.candidates) }
    : { schemaVersion: 1, width: draft.width, height: draft.height, confirmed: true, targets: structuredClone(draft.targets) };
  const source = { schemaVersion: 1, original: sourceRef(mode === 'spot_difference' ? draft.before : draft.source) };
  if (changedRevision) source.changed = sourceRef(draft.after);
  const puzzle = { mode, definition, source };
  if (changedRevision) puzzle.changedImage = await imageClaim(changedRevision.document, encodeImage, inspectImage, draft.width, draft.height);
  return { image: originalClaim, puzzle };
}
