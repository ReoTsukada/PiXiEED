import { validateAsset } from './asset-contract.mjs';
import { resolveLocalDrawRevision } from './jigsaw-core.mjs?rev=20261001-free-tools-1';
import { validateJigsawWorkspace } from './jigsaw-workspace.mjs?rev=20261001-free-tools-1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEED = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_BYTES = 512 * 1024;
const MAX_COLORS = 128;
const MAX_SIZE = 256;
const MAX_PIECES = 4096;
const LOCAL_OWNER = 'local-owner';

function assertJigsawRevision(revision, draftId) {
  if (!revision || revision.schemaVersion !== 1 || revision.asset?.kind !== 'jigsaw' || revision.asset.owner?.type !== 'local'
      || revision.asset.owner.id !== LOCAL_OWNER || revision.asset.visibility !== 'draft' || revision.asset.reusePermission !== 'owner_only'
      || revision.document?.gameId !== draftId) throw new Error('自分の端末に保存したジグソーだけを投稿できます');
  validateAsset(revision.asset);
  return validateJigsawWorkspace(revision.document);
}

function assertClaim(claim, width, height) {
  if (!claim || claim.mimeType !== 'image/png' || claim.width !== width || claim.height !== height
      || width > MAX_SIZE || height > MAX_SIZE || !Number.isSafeInteger(claim.size) || claim.size < 1 || claim.size > MAX_BYTES
      || !Number.isInteger(claim.colorCount) || claim.colorCount < 1 || claim.colorCount > MAX_COLORS
      || typeof claim.dataUrl !== 'string' || !claim.dataUrl.startsWith('data:image/png;base64,')) throw new Error('この固定版は投稿用PNGのサイズ・色数上限を満たしていません。絵を調整してください');
  const base64 = claim.dataUrl.slice('data:image/png;base64,'.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new TypeError('投稿用PNGを確認できません');
  let binary;
  try { binary = atob(base64); } catch { throw new TypeError('投稿用PNGを確認できません'); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== claim.size || bytes.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) || btoa(binary) !== base64) throw new TypeError('投稿用PNGを確認できません');
  return { mimeType: 'image/png', size: bytes.length, width, height, colorCount: claim.colorCount, base64 };
}

/** Make a public payload from the saved game definition and its immutable local Draw revision only. */
export async function prepareJigsawUpload({ draftId, store, adapter, encodeImage, inspectImage } = {}) {
  if (typeof draftId !== 'string' || !UUID.test(draftId) || !store || typeof store.load !== 'function' || !adapter || typeof adapter.get !== 'function') throw new TypeError('保存したジグソーを確認できません');
  const revision = await store.load(draftId);
  const game = assertJigsawRevision(revision, draftId);
  if (game.sourceOrigin === 'pxd') throw new Error('PXDから開いたジグソーは投稿できません。自分の保存版から作り直してください');
  if (!game.source || (game.source.type && game.source.type !== 'draw') || !game.source.draftId || !game.source.revisionId) throw new Error('このジグソーの元画像は投稿できません。自分の保存版から作り直してください');
  if (game.layout.legacyGridSize !== undefined) throw new Error('旧分割のジグソーは端末内で遊べます。投稿する場合は新しいパズルを作ってください');
  if (game.layout.width > MAX_SIZE || game.layout.height > MAX_SIZE || game.layout.width < 8 || game.layout.height < 8) throw new Error('投稿できる画像は縦横8〜256pxです。元の保存版を選び直してください');
  const fixed = await resolveLocalDrawRevision(adapter, game.source.draftId, game.source.revisionId);
  if (fixed.asset.assetId !== game.source.assetId || fixed.documentHash !== game.source.contentHash || fixed.hashScheme !== game.source.hashScheme
      || fixed.document.width !== game.layout.width || fixed.document.height !== game.layout.height) throw new Error('元の固定保存版が一致しません');
  if (!encodeImage) ({encodeDrawPng:encodeImage} = await import('./draw-handoff.mjs'));
  if (!inspectImage) ({inspectPixelImage:inspectImage} = await import('../globe/post-image.mjs'));
  const blob = await encodeImage(fixed.document);
  if (!blob || blob.type !== 'image/png' || !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > MAX_BYTES) throw new Error('投稿用PNGが512KBを超えるか、作成できませんでした');
  const claim = assertClaim(await inspectImage(blob, { keepScale: true }), game.layout.width, game.layout.height);
  const definition = { schemaVersion: 1, width: game.layout.width, height: game.layout.height, confirmed: true, layoutVersion: 1, pieceSize: game.layout.pieceSize, seed: game.layout.seed };
  validateJigsawDefinition(definition);
  const original = Object.fromEntries(['draftId','assetId','revisionId','contentHash','hashScheme'].map(key => [key,game.source[key]]));
  return { image: claim, puzzle: { mode: 'jigsaw', definition, source:{schemaVersion:1,original} } };
}

export function validateJigsawDefinition(definition) {
  if (!definition || Object.keys(definition).length !== 7 || definition.schemaVersion !== 1 || definition.confirmed !== true || definition.layoutVersion !== 1
      || !Number.isSafeInteger(definition.width) || !Number.isSafeInteger(definition.height) || definition.width < 8 || definition.height < 8
      || definition.width > MAX_SIZE || definition.height > MAX_SIZE || !Number.isSafeInteger(definition.pieceSize)
      || definition.pieceSize < 3 || definition.pieceSize > Math.max(definition.width, definition.height)
      || typeof definition.seed !== 'string' || !SEED.test(definition.seed)) throw new TypeError('公開ジグソーの定義が不正です');
  const pieces = Math.max(1,Math.floor(definition.width / definition.pieceSize)) * Math.max(1,Math.floor(definition.height / definition.pieceSize));
  if (pieces < 1 || pieces > MAX_PIECES) throw new RangeError('ピース数上限を超えています');
  return definition;
}

/** Validate only the server response shape and exact first-party public image URL. */
export function preparePublicJigsaw(payload, postId, projectUrl) {
  if (typeof postId !== 'string' || !UUID.test(postId) || !payload || payload.ok !== true || !payload.puzzle || payload.puzzle.postId?.toLowerCase() !== postId.toLowerCase() || payload.puzzle.mode !== 'jigsaw') throw new Error('この公開ジグソーは利用できません');
  let origin;
  try {
    const project = new URL(projectUrl);
    if (project.protocol !== 'https:' || project.username || project.password || project.search || project.hash || !['', '/'].includes(project.pathname)) throw new Error('bad project URL');
    origin = project.origin;
  } catch { throw new TypeError('公開作品の接続先を確認できません'); }
  const puzzle = payload.puzzle;
  const expectedPrefix = `${origin}/storage/v1/object/public/post-public/${postId.toLowerCase()}/`;
  const expected = puzzle.originalImage?.url;
  const relative = typeof expected === 'string' && expected.startsWith(expectedPrefix) ? expected.slice(expectedPrefix.length) : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.png$/.test(relative) || relative.includes('..') || Object.hasOwn(puzzle,'changedImage')
      || typeof puzzle.title !== 'string' || !puzzle.title.trim() || !Number.isSafeInteger(puzzle.originalImage.width) || !Number.isSafeInteger(puzzle.originalImage.height)
      || puzzle.definition?.width !== puzzle.originalImage.width || puzzle.definition?.height !== puzzle.originalImage.height) throw new Error('公開ジグソーの画像参照が不正です');
  validateJigsawDefinition(puzzle.definition);
  const definition = Object.fromEntries(['schemaVersion', 'width', 'height', 'confirmed', 'layoutVersion', 'pieceSize', 'seed'].map((key) => [key, puzzle.definition[key]]));
  return { id: postId.toLowerCase(), title: String(puzzle.title || '').slice(0, 60), mode: 'jigsaw', url: expected, width: puzzle.originalImage.width, height: puzzle.originalImage.height, definition };
}
