import { imageToDrawDocument, putPxdDrawDocument, putPxdSharedImage } from './pxd-project.mjs?rev=20261001-components-1';
import { detachPxdAudioImage, readPxdAudioState, readPxdAudioLink, prepareSharedAudioImageImport, writePxdAudioState } from './pxd-draw-audio.mjs?rev=20261001-components-1';
import { freezePxdPuzzleImages, createPxdPuzzleFromMain, writePxdPuzzle } from './pxd-puzzles.mjs?rev=20261001-components-2';
import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { resolveLocalDrawRevision } from './spot-difference-core.mjs';
import { documentRgba } from './draw-core.mjs?rev=20260930-shared-canvas-5';

export const COMPONENTS = Object.freeze([
  { tool: 'draw', label: '絵', role: 'main' },
  { tool: 'audio', label: '曲', role: 'audio', path: 'audio/state.json' },
  { tool: 'jigsaw', label: 'ジグソー', role: 'jigsaw-main', path: 'puzzles/jigsaw.json' },
  { tool: 'spot_difference', label: '間違い探し', role: 'spot-after', path: 'puzzles/spot_difference.json' },
  { tool: 'hidden_object', label: 'もの探し', role: 'hidden', path: 'puzzles/hidden_object.json' }
]);
const has = (project, path) => Boolean(project?.entries?.some((entry) => entry.path === path));
export function componentImageRole(project, tool) {
  const part = COMPONENTS.find((part) => part.tool === tool);
  if (tool === 'camera') return 'main';
  if (!part) throw new TypeError('この制作ツールには対応していません。');
  if (has(project, `images/${part.role}/meta.json`)) return part.role;
  if (tool === 'draw' && has(project, 'images/draw/meta.json')) return 'draw';
  return 'main';
}
export function hasProjectComponent(project, tool) {
  const part = COMPONENTS.find((part) => part.tool === tool);
  return Boolean(part && (part.path ? has(project, part.path) : has(project, 'images/main/meta.json') || has(project, 'images/draw/meta.json')));
}

/** Freeze legacy live links before ANY tool can overwrite the shared source. */
export async function freezeProjectComponents(project, { resolveSourceImage } = {}) {
  if (!project?.entries?.length) return project;
  let adapter;
  const resolve = resolveSourceImage || (async (ref) => {
    adapter ||= createIndexedDbDraftAdapter();
    const fixed = await resolveLocalDrawRevision(adapter, ref.draftId, ref.revisionId);
    if (fixed.documentHash !== ref.contentHash || fixed.asset.assetId !== ref.assetId) throw new Error('パズルに使った絵の保存版を確認できません。');
    return { width: fixed.document.width, height: fixed.document.height, rgba: documentRgba(fixed.document) };
  });
  const next = await freezePxdPuzzleImages(project, { resolveSourceImage: resolve });
  return detachPxdAudioImage(next);
}

/** Replacing a source is explicit; callers confirm and save it as a new project revision. */
export async function replaceProjectComponentImage(project, tool, image, { store } = {}) {
  if (!hasProjectComponent(project, tool) || tool === 'draw') throw new Error('先に曲やパズルを作ってください。');
  let next = await freezeProjectComponents(project);
  if (tool === 'audio') {
    const song = readPxdAudioState(next); const link = readPxdAudioLink(next);
    const options = { colorToSlot: link?.colorToSlot || null };
    if (link?.rowPitchMap?.length === image.height) options.rowPitchMap = link.rowPitchMap;
    const plan = prepareSharedAudioImageImport(song, image, options);
    return writePxdAudioState(next, plan.song, { image: plan.image, link: plan.link });
  }
  // Build against a temporary source; the drawing itself is never replaced here.
  const temporary = await putPxdSharedImage(next, image);
  const draftStore = store || createLocalDraftStore(createIndexedDbDraftAdapter());
  const imported = await createPxdPuzzleFromMain(temporary, { tool, store: draftStore, preferredRole: 'main' });
  const sources = tool === 'spot_difference'
    ? { 'spot-before': imported.bindings.before.drawDocument, 'spot-after': imported.bindings.after.drawDocument }
    : tool === 'hidden_object' ? { hidden: imported.bindings.source.drawDocument }
      : { 'jigsaw-main': imported.bindings.source.drawDocument };
  return writePxdPuzzle(next, { tool, document: imported.document, sourceDrawDocuments: sources,
    portableOriginalRefs: imported.portableOriginalRefs, sourceChanged: false });
}

/** Same-sized inputs remain exact. A tool edits only its own working image. */
export async function putProjectComponentImage(project, tool, image, role = componentImageRole(project, tool)) {
  return putPxdDrawDocument(project, imageToDrawDocument(image), role);
}
