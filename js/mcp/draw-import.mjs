import { PIXEL_ART_LIMITS, normalizePixelArt, decodePixelArt, pixelArtToRgba, toDrawDocument, encodePixelArt } from './pixel-art-contract.mjs?rev=20261114-mcp-1';
import { createPxdProject } from '../creation/pxd-codec.mjs';
import { putPxdDrawDocument, pxdToolUrl } from '../creation/pxd-project.mjs?rev=20261113-canvas1028-shared-2';
import { createToolProjectStore } from '../creation/tool-project-store.mjs?rev=20261113-canvas1028-shared-2';

export const DRAW_IMPORT_TOKEN_MAX = PIXEL_ART_LIMITS.maxTokenLength;
export const DRAW_IMPORT_JSON_MAX = 64 * 1024;
export const DRAW_IMPORT_STAGE_KEY = 'PiXiEED:ai-draw-stage:v1';
export const DRAW_IMPORT_STAGE_TTL_MS = 10 * 60 * 1000;

export function decodeDrawImportToken(token) {
  if (typeof token !== 'string' || token.length < 1 || token.length > DRAW_IMPORT_TOKEN_MAX || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new TypeError('受け取ったデータの形式またはサイズを確認できません。');
  }
  const art = decodePixelArt(token);
  const normalized = normalizePixelArt(art);
  const rgba = pixelArtToRgba(normalized);
  if (!rgba || rgba.width < 1 || rgba.height < 1 || rgba.width > PIXEL_ART_LIMITS.maxWidth || rgba.height > PIXEL_ART_LIMITS.maxHeight
      || !(rgba.data instanceof Uint8Array || rgba.data instanceof Uint8ClampedArray)
      || rgba.data.length !== rgba.width * rgba.height * 4) {
    throw new TypeError('64×64px以内の画素データではありません。');
  }
  return { art: normalized, rgba: { width: rgba.width, height: rgba.height, data: new Uint8ClampedArray(rgba.data) } };
}

export function parseDrawImportJson(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > DRAW_IMPORT_JSON_MAX) throw new TypeError('JSONは64KB以内で入力してください。');
  let input;
  try { input = JSON.parse(text); } catch { throw new TypeError('JSONの書式を確認してください。'); }
  const art = normalizePixelArt(input);
  const token = encodePixelArt(art);
  return { ...decodeDrawImportToken(token), token };
}

export function stageDrawImportToken(storage, token, createdAt = Date.now()) {
  const decoded = decodeDrawImportToken(token);
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new TypeError('受取時刻を確認できません。');
  if (typeof storage?.setItem !== 'function') throw new Error('一時保存を利用できません。');
  storage.setItem(DRAW_IMPORT_STAGE_KEY, JSON.stringify({ token, createdAt }));
  return decoded;
}

export function readStagedDrawImport(storage, now = Date.now()) {
  let serialized;
  try { serialized = storage?.getItem(DRAW_IMPORT_STAGE_KEY); } catch { return null; }
  if (typeof serialized !== 'string' || serialized.length > DRAW_IMPORT_TOKEN_MAX + 128) return null;
  try {
    const stage = JSON.parse(serialized);
    if (!Number.isSafeInteger(stage?.createdAt) || stage.createdAt > now || now - stage.createdAt > DRAW_IMPORT_STAGE_TTL_MS) return null;
    return { ...decodeDrawImportToken(stage.token), token: stage.token, createdAt: stage.createdAt };
  } catch { return null; }
}

export function clearStagedDrawImport(storage) {
  try { storage?.removeItem(DRAW_IMPORT_STAGE_KEY); } catch { /* Clearing is best-effort; stale records expire. */ }
}

export async function saveDrawImportAsNewProject(art, {
  store = createToolProjectStore('draw'), now = Date.now(),
  createProject = createPxdProject, putDocument = putPxdDrawDocument,
  makeDocument = toDrawDocument, makeUrl = pxdToolUrl
} = {}) {
  const normalized = normalizePixelArt(art);
  const rgba = pixelArtToRgba(normalized);
  if (!rgba || rgba.width < 1 || rgba.height < 1 || rgba.width > PIXEL_ART_LIMITS.maxWidth || rgba.height > PIXEL_ART_LIMITS.maxHeight
      || rgba.data.length !== rgba.width * rgba.height * 4) throw new TypeError('64×64px以内の画素データではありません。');
  const project = createProject({ manifest: {
    title: normalized.title,
    createdAt: now,
    lastMode: 'draw',
    toolProject: { tool: 'draw', schemaVersion: 1 },
    source: { type: 'chatgpt_mcp_pixel_art', schemaVersion: 1 }
  } });
  const populated = await putDocument(project, makeDocument(normalized));
  const saved = await store.save(populated, { expectedRevisionId: null });
  const destination = new URL(makeUrl('draw', saved, 'main'), 'https://pixieed.jp');
  // A project pointer alone opens Draw's introduction; this action opens the editor.
  destination.searchParams.set('workspace', '1');
  return { project: saved, url: `${destination.pathname}${destination.search}` };
}

export function createDrawImportController({ art, save = saveDrawImportAsNewProject, navigate = (url) => globalThis.location.assign(url) } = {}) {
  let pending = null;
  let saved = null;
  return {
    get busy() { return pending !== null; },
    get result() { return saved; },
    async apply() {
      if (saved) { navigate(saved.url); return saved; }
      if (pending) return pending;
      pending = Promise.resolve().then(() => save(art)).then((result) => {
        if (!result?.project || typeof result.url !== 'string') throw new TypeError('保存結果を確認できません。');
        saved = result;
        navigate(result.url);
        return result;
      }).finally(() => { pending = null; });
      return pending;
    }
  };
}
