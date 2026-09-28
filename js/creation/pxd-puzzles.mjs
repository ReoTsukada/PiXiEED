import { createPxdProject, getPxdJson } from './pxd-codec.mjs';
import { mergePxdJson, primaryPxdImageRole, putPxdDrawDocument, putPxdImage, readPxdDrawDocument, readPxdImage, imageToDrawDocument } from './pxd-project.mjs';
import { documentRgba } from './draw-core.mjs';
import { detectDifferenceCandidates, validateSpotDifferenceDraft } from './spot-difference-core.mjs?rev=20260927-spot-difference-1';
import { createHiddenObjectDraft, validateHiddenObjectDraft } from './hidden-object-core.mjs?rev=20260928-short-hitboxes-1';
import { createJigsawLayout, createJigsawWorkspace, validateJigsawWorkspace } from './jigsaw-workspace.mjs?rev=20260928-jigsaw-workspace-1';
import { validateJigsawSource } from './jigsaw-core.mjs?rev=20260928-jigsaw-pixfind-original-2';

export const PXD_PUZZLE_PATHS = Object.freeze({
  jigsaw: 'puzzles/jigsaw.json',
  spot_difference: 'puzzles/spot_difference.json',
  hidden_object: 'puzzles/hidden_object.json'
});
export function hasPxdPuzzle(project, tool) { return Boolean(project?.entries?.some((entry) => entry.path === puzzlePath(tool))); }

const clone = (value) => structuredClone(value);
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);

function puzzlePath(tool) {
  const path = PXD_PUZZLE_PATHS[tool];
  if (!path) throw new TypeError('このPXDパズル形式には対応していません。');
  return path;
}

function validatePuzzleDocument(tool, document) {
  if (tool === 'jigsaw') {
    if (document?.source?.type === 'file' && !document.source.dataUrl) {
      const candidate = clone(document); candidate.source.dataUrl = 'data:image/png;base64,AA==';
      return validateJigsawWorkspace(candidate);
    }
    return validateJigsawWorkspace(document);
  }
  if (tool === 'spot_difference') return validateSpotDifferenceDraft(document);
  if (tool === 'hidden_object') return validateHiddenObjectDraft(document);
  puzzlePath(tool);
}

function sourceRoles(tool, document) {
  if (tool === 'spot_difference') return ['spot-before', 'spot-after'];
  if (tool === 'hidden_object') return ['hidden'];
  if (tool === 'jigsaw' && document.source.type !== 'public') return ['jigsaw-main'];
  return [];
}

function originalRefs(tool, document) {
  if (tool === 'spot_difference') return { before: clone(document.before), after: clone(document.after) };
  if (tool === 'hidden_object') return { source: clone(document.source) };
  const source = clone(document.source);
  if (source.type === 'file') delete source.dataUrl;
  return { source };
}

function portableDocument(tool, document) {
  const result = clone(document);
  // The PXD images/<role>/pixels.rgba entry is the one canonical copy for owned images.
  if (tool === 'jigsaw' && result.source.type === 'file') delete result.source.dataUrl;
  return result;
}

function assertOriginalRefs(tool, document, refs) {
  if (!isPlainObject(refs)) throw new TypeError('PXD内の元作品参照がありません。');
  if (tool === 'spot_difference') {
    if (Object.keys(refs).sort().join(',') !== 'after,before') throw new TypeError('PXD内の差分画像参照が壊れています。');
    validateSpotDifferenceDraft({ ...document, before: refs.before, after: refs.after });
  } else if (tool === 'hidden_object') {
    if (Object.keys(refs).join(',') !== 'source') throw new TypeError('PXD内の元画像参照が壊れています。');
    validateHiddenObjectDraft({ ...document, source: refs.source });
  } else {
    if (Object.keys(refs).join(',') !== 'source') throw new TypeError('PXD内の元画像参照が壊れています。');
    const source = clone(refs.source);
    if (source?.type === 'pxd-image') {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.projectId || '') || !/^[A-Za-z0-9_-]{1,128}$/.test(source.revisionId || '') || !/^[a-z][a-z0-9-]{0,47}$/.test(source.role || '')) throw new TypeError('PXDの元画像履歴が壊れています。');
    } else {
      if (source?.type === 'file' && !source.dataUrl) source.dataUrl = 'data:image/png;base64,AA==';
      validateJigsawSource(source);
    }
  }
}

/**
 * Write a known puzzle component into a PXD project while preserving every unrelated entry.
 * sourceDrawDocuments maps the tool's fixed source roles to validated Draw documents. For a
 * public Jigsaw source it must be omitted: the PXD stores only the public reference.
 */
export async function writePxdPuzzle(project, { tool, document, sourceDrawDocuments = {}, sourceImages = {}, portableOriginalRefs = null, sourceChanged = null }) {
  validatePuzzleDocument(tool, document);
  const previousPayload = project?.entries?.some((entry) => entry.path === puzzlePath(tool)) ? getPxdJson(project, puzzlePath(tool)) : null;
  let next = project || createPxdProject();
  const roles = sourceRoles(tool, document);
  for (const role of roles) {
    const drawDocument = sourceDrawDocuments[role];
    const image = sourceImages[role] || (drawDocument ? pxdImageFromDrawDocument(drawDocument) : null);
    if (!image) throw new TypeError(`PXDに必要な固定画像がありません: ${role}`);
    next = drawDocument ? await putPxdDrawDocument(next, drawDocument, role) : await putPxdImage(next, image, role);
  }
  const changedBySourceEdit = next.entries.some((entry) => entry.path === puzzlePath(tool)) ? getPxdJson(next, puzzlePath(tool)).sourceChanged === true : previousPayload?.sourceChanged === true;
  const payload = {
    schemaVersion: 1,
    tool,
    document: portableDocument(tool, document),
    portable: { originalRefs: clone(portableOriginalRefs || originalRefs(tool, document)) },
    sourceChanged: typeof sourceChanged === 'boolean' ? sourceChanged : changedBySourceEdit
  };
  return mergePxdJson(next, puzzlePath(tool), payload);
}

/**
 * Read and validate a PXD puzzle component and its exact source pixels. Unknown JSON fields
 * remain on `payload` for callers to retain on the next merge/export.
 */
export async function readPxdPuzzle(project, tool) {
  const payload = getPxdJson(project, puzzlePath(tool));
  if (!isPlainObject(payload) || payload.schemaVersion !== 1 || payload.tool !== tool || !isPlainObject(payload.document) || !isPlainObject(payload.portable)) throw new TypeError('PXDパズルデータの形式に対応していません。');
  if (tool === 'hidden_object' && Array.isArray(payload.document.hitBoxes)) {
    payload.document.hitBoxes = payload.document.hitBoxes.map((box) => ({ targetId: box.targetId, minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY }));
  }
  validatePuzzleDocument(tool, payload.document);
  assertOriginalRefs(tool, payload.document, payload.portable.originalRefs);
  const images = {};
  for (const role of sourceRoles(tool, payload.document)) {
    const image = await readPxdImage(project, role);
    if (!image) throw new TypeError('PXD内の固定画像が見つかりません。');
    let drawDocument = null;
    try { drawDocument = await readPxdDrawDocument(project, role); } catch (error) {
      if (tool !== 'jigsaw' || !(error instanceof RangeError)) throw error;
    }
    if (drawDocument && (image.width !== drawDocument.width || image.height !== drawDocument.height || !bytesEqual(image.rgba, documentRgba(drawDocument)))) throw new TypeError('PXDの固定画像とDrawデータが一致しません。');
    images[role] = { width: image.width, height: image.height, rgba: new Uint8Array(image.rgba), drawDocument };
  }
  return { payload: clone(payload), document: clone(payload.document), images, portableOriginalRefs: clone(payload.portable.originalRefs), sourceChanged: payload.sourceChanged === true };
}

function bytesEqual(left, right) {
  return left?.length === right?.length && left.every((byte, index) => byte === right[index]);
}

function localReference(draftId, revision) {
  return { draftId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme };
}

async function saveDrawCopy(store, image, draftId = globalThis.crypto.randomUUID()) {
  const drawDocument = image.drawDocument || imageToDrawDocument(image);
  const revision = await store.save({
    draftId, kind: 'pixel_art', ownerId: 'local-owner', document: drawDocument,
    source: { type: 'pxd_embedded_copy', assetId: null, revisionId: null }
  });
  return { draftId, revision, reference: localReference(draftId, revision), drawDocument };
}

function freshGameId(document) {
  return { ...clone(document), gameId: globalThis.crypto.randomUUID() };
}

/**
 * Materialise PXD-owned source images into fresh, owner-local immutable Draw revisions. This
 * is the only path that makes an imported puzzle source editable; PXD metadata never grants
 * access to an existing account or public asset.
 */
export async function materializePxdPuzzle(readResult, { tool, store, verifyPublicSource, encodeJigsawFileImage }) {
  if (!readResult || readResult.payload?.tool !== tool || !store?.save) throw new TypeError('PXDパズルを端末内へ読み込めません。');
  let document = freshGameId(readResult.document);
  const images = readResult.images || {};
  const bindings = {};
  if (tool === 'jigsaw') {
    if (document.source.type !== 'public' && (!images['jigsaw-main'] || images['jigsaw-main'].width !== document.layout.width || images['jigsaw-main'].height !== document.layout.height)) throw new TypeError('PXD画像サイズと保存済みジグソー盤面が一致しません。端末内の作品は変更していません。');
    if (document.source.type === 'public') {
      if (typeof verifyPublicSource !== 'function') throw new TypeError('公開作品を再確認できません。PXDの参照は権限を引き継ぎません。');
      await verifyPublicSource(document.source);
    } else if (document.source.type === 'file') {
      if (typeof encodeJigsawFileImage !== 'function') throw new TypeError('端末画像をPXDから復元できません。元画像はファイル内に保持しています。');
      const encoded = await encodeJigsawFileImage(images['jigsaw-main']);
      if (!encoded || typeof encoded.dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(encoded.dataUrl) || !/^[a-f0-9]{64}$/.test(encoded.fingerprint || '') || !Number.isInteger(encoded.width) || !Number.isInteger(encoded.height) || encoded.width !== images['jigsaw-main']?.width || encoded.height !== images['jigsaw-main']?.height) throw new TypeError('端末画像の変換結果を検証できません。');
      document.source = { type: 'file', dataUrl: encoded.dataUrl, fingerprint: encoded.fingerprint, width: encoded.width, height: encoded.height };
    } else {
      const copy = await saveDrawCopy(store, images['jigsaw-main']);
      document.source = copy.reference;
      bindings.source = copy;
    }
    validateJigsawSource(document.source);
    validateJigsawWorkspace(document);
  } else if (tool === 'spot_difference') {
    const beforeImage = images['spot-before']; const afterImage = images['spot-after'];
    if (!beforeImage?.drawDocument || !afterImage?.drawDocument || beforeImage.width !== afterImage.width || beforeImage.height !== afterImage.height || document.width !== beforeImage.width || document.height !== beforeImage.height) throw new TypeError('PXDの比較画像サイズが間違い探しと一致しません。端末内の作品は変更していません。');
    const before = await saveDrawCopy(store, images['spot-before']);
    const after = await saveDrawCopy(store, images['spot-after'], before.draftId);
    document.before = before.reference; document.after = after.reference;
    if (readResult.sourceChanged) {
      const result = detectDifferenceCandidates(before.drawDocument, after.drawDocument);
      document.candidates = result.candidates; document.confirmed = false; document.publication = 'draft'; document.published = false;
    }
    validateSpotDifferenceDraft(document);
    bindings.before = before; bindings.after = after;
  } else if (tool === 'hidden_object') {
    if (!images.hidden?.drawDocument || document.width !== images.hidden.width || document.height !== images.hidden.height) throw new TypeError('PXD画像サイズがもの探しの保存版と一致しません。端末内の作品は変更していません。');
    const source = await saveDrawCopy(store, images.hidden);
    document.source = source.reference;
    if (readResult.sourceChanged) {
      document.confirmed = false; document.hitBoxes = null; document.hitTestLayout = null; document.publication = 'draft'; document.published = false;
    }
    validateHiddenObjectDraft(document);
    bindings.source = source;
  } else puzzlePath(tool);
  const sourcePixels = tool !== 'jigsaw' || document.source.type === 'public' ? null : document.source.type === 'file' ? images['jigsaw-main'] : pxdImageFromDrawDocument(bindings.source.drawDocument);
  return { document, bindings, portableOriginalRefs: clone(readResult.portableOriginalRefs), sourcePixels, sourceChanged: readResult.sourceChanged === true };
}

/** Create a fresh, unconfirmed puzzle from the PXD's owned `main` image when that tool's
 * puzzle component does not exist yet. Existing document/image components are never replaced. */
export async function createPxdPuzzleFromMain(project, { tool, store, encodeJigsawFileImage }) {
  puzzlePath(tool);
  if (!store?.save) throw new TypeError('端末内保存を利用できません。');
  const imageRole = primaryPxdImageRole(project);
  if (!imageRole) throw new TypeError('このPXDには編集可能な元画像がありません。原本は保持しています。');
  const image = await readPxdImage(project, imageRole);
  if (!image) throw new TypeError('このPXDには編集可能な元画像がありません。原本は保持しています。');
  let drawDocument = null;
  try { drawDocument = await readPxdDrawDocument(project, imageRole); } catch (error) {
    if (tool !== 'jigsaw' || !(error instanceof RangeError)) throw error;
  }
  if (tool !== 'jigsaw' && !drawDocument) throw new TypeError('この元画像をDrawの固定版へ正確に変換できません。PXD原本は保持しています。');
  const gameId = globalThis.crypto.randomUUID();
  if (tool === 'jigsaw' && !drawDocument) {
    if (typeof encodeJigsawFileImage !== 'function') throw new TypeError('PXD画像をジグソーの端末内画像へ変換できません。');
    const encoded = await encodeJigsawFileImage(image);
    if (!encoded || typeof encoded.dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(encoded.dataUrl) || !/^[a-f0-9]{64}$/.test(encoded.fingerprint || '') || encoded.width !== image.width || encoded.height !== image.height) throw new TypeError('端末画像のPNG復元検証に失敗しました。');
    const source = { type: 'file', dataUrl: encoded.dataUrl, fingerprint: encoded.fingerprint, width: encoded.width, height: encoded.height };
    const layout = createJigsawLayout({ width: image.width, height: image.height, pieceSize: 'auto', seed: gameId });
    const document = createJigsawWorkspace({ gameId, source, layout, seed: gameId });
    return { document, bindings: {}, portableOriginalRefs: { source: { type: 'pxd-image', projectId: project.projectId, revisionId: project.revisionId, role: imageRole } }, sourcePixels: image, sourceChanged: false };
  }
  const saved = await saveDrawCopy(store, { ...image, drawDocument });
  const refs = saved.reference;
  if (tool === 'jigsaw') {
    const layout = createJigsawLayout({ width: drawDocument.width, height: drawDocument.height, pieceSize: 'auto', seed: gameId });
    const document = createJigsawWorkspace({ gameId, source: refs, layout, seed: gameId });
    return { document, bindings: { source: saved }, portableOriginalRefs: { source: { type: 'pxd-image', projectId: project.projectId, revisionId: project.revisionId, role: imageRole } }, sourcePixels: image, sourceChanged: false };
  }
  if (tool === 'hidden_object') {
    const document = createHiddenObjectDraft({ gameId, source: refs, width: drawDocument.width, height: drawDocument.height });
    return { document, bindings: { source: saved }, portableOriginalRefs: { source: refs }, sourceChanged: false };
  }
  const after = await saveDrawCopy(store, { ...image, drawDocument }, saved.draftId);
  const document = validateSpotDifferenceDraft({ schemaVersion: 1, gameId, width: drawDocument.width, height: drawDocument.height, before: saved.reference, after: after.reference, candidates: [], confirmed: false, publication: 'draft', published: false });
  return { document, bindings: { before: saved, after }, portableOriginalRefs: { before: saved.reference, after: after.reference }, sourceChanged: false };
}

/** Make an exact Draw-document image record; no resize or colour reduction is performed. */
export function pxdImageFromDrawDocument(document) {
  return { width: document.width, height: document.height, rgba: new Uint8Array(documentRgba(document)) };
}

/** Preserve reference-only semantics for Jigsaw puzzles sourced from a public work. */
export function isReferenceOnlyPxdJigsaw(document) {
  return document?.source?.type === 'public';
}
