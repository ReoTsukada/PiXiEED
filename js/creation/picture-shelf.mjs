/**
 * Each tool keeps its own picture. かんたんドット, 間違い探し, もの探し and ジグソー each hold a
 * separate local draft (their own history of saved versions); editing one never changes another.
 * Any tool can bring in another tool's picture with one tap: the newest version is copied into
 * the receiving tool's own draft as a new version, and the original stays where it was.
 */

import { createLocalDraftStore } from './local-drafts.mjs';
import { documentRgba, validateDrawDocument } from './draw-core.mjs';

export const PICTURE_TOOLS = Object.freeze({
  draw: Object.freeze({ label: 'かんたんドット', key: 'pixieed.simple-draw.last-draft.v1' }),
  'spot-difference': Object.freeze({ label: '間違い探し', key: 'pixieed:picture:spot-difference:v1' }),
  'hidden-object': Object.freeze({ label: 'もの探し', key: 'pixieed:picture:hidden-object:v1' }),
  jigsaw: Object.freeze({ label: 'ジグソー', key: 'pixieed:picture:jigsaw:v1' })
});

const LOCAL_OWNER = 'local-owner';
const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const readKey = (storage, key) => { try { return storage?.getItem(key) || null; } catch { return null; } };
const writeKey = (storage, key, value) => { try { storage?.setItem(key, value); return true; } catch { return false; } };

function toolOf(tool) {
  const entry = PICTURE_TOOLS[tool];
  if (!entry) throw new TypeError(`絵を持てないツールです: ${tool}`);
  return entry;
}

/** Revisions a tool may use as its picture: the person's own pixel-art drafts on this device. */
export function ownPixelArt(revision) {
  const asset = revision?.asset;
  if (!asset || asset.kind !== 'pixel_art' || asset.owner?.type !== 'local' || asset.owner.id !== LOCAL_OWNER || asset.visibility !== 'draft') return false;
  try { validateDrawDocument(revision.document); return true; } catch { return false; }
}

/** The draft id holding a tool's own picture, or null before it has one. */
export function pictureDraftId(tool, { storage = defaultStorage() } = {}) {
  return readKey(storage, toolOf(tool).key);
}

/** A tool's own saved versions, oldest first. */
export async function listOwnVersions(tool, { adapter, storage = defaultStorage() }) {
  const draftId = pictureDraftId(tool, { storage });
  if (!adapter || !draftId) return { draftId, versions: [] };
  const record = await adapter.get(draftId);
  if (!record || record.draftId !== draftId || !Array.isArray(record.revisions)) return { draftId, versions: [] };
  return { draftId, versions: record.revisions.filter(ownPixelArt) };
}

/**
 * Pictures that can be brought in: the newest version of every other tool's picture.
 * A picture identical to this tool's newest version is left out.
 */
export async function listBringable(tool, { adapter, storage = defaultStorage() }) {
  // Tools that do not keep a picture of their own (e.g. ドットで音楽) see every tool's picture.
  const own = PICTURE_TOOLS[tool] ? await listOwnVersions(tool, { adapter, storage }).catch(() => ({ versions: [] })) : { versions: [] };
  const ownLatest = own.versions.at(-1)?.documentHash || null;
  const seen = new Set(ownLatest ? [ownLatest] : []);
  const out = [];
  for (const [other, info] of Object.entries(PICTURE_TOOLS)) {
    if (other === tool) continue;
    const { draftId, versions } = await listOwnVersions(other, { adapter, storage }).catch(() => ({ versions: [] }));
    const latest = versions.at(-1);
    if (!latest || seen.has(latest.documentHash)) continue;
    seen.add(latest.documentHash);
    out.push({ tool: other, label: info.label, draftId, revision: latest });
  }
  return out;
}

/**
 * Copy a brought picture into this tool's own draft as a new version (creating the draft the
 * first time). The source draft is only read.
 */
export async function bringPicture(tool, entry, { adapter, store = createLocalDraftStore(adapter), storage = defaultStorage(), newId = () => globalThis.crypto.randomUUID() }) {
  const info = toolOf(tool);
  if (!entry?.revision || !ownPixelArt(entry.revision)) throw new TypeError('持ってこられる絵ではありません。');
  let draftId = pictureDraftId(tool, { storage });
  if (!draftId) { draftId = newId(); if (!writeKey(storage, info.key, draftId)) throw new Error('端末に目印を保存できませんでした。'); }
  const revision = await store.save({
    draftId, kind: 'pixel_art', ownerId: LOCAL_OWNER, document: structuredClone(entry.revision.document),
    source: { type: 'local_draft_copy', assetId: entry.revision.asset.assetId, revisionId: entry.revision.revisionId, fromTool: entry.tool }
  });
  return { draftId, revision };
}

/** Save a picture made inside a tool as that tool's own new version. */
export async function savePicture(tool, document, { adapter, store = createLocalDraftStore(adapter), storage = defaultStorage(), newId = () => globalThis.crypto.randomUUID(), source = { type: 'hand_drawn', assetId: null, revisionId: null } }) {
  const info = toolOf(tool);
  validateDrawDocument(document);
  let draftId = pictureDraftId(tool, { storage });
  if (!draftId) { draftId = newId(); if (!writeKey(storage, info.key, draftId)) throw new Error('端末に目印を保存できませんでした。'); }
  const revision = await store.save({ draftId, kind: 'pixel_art', ownerId: LOCAL_OWNER, document, source });
  return { draftId, revision };
}

function thumbnail(document, size = 40) {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = document.width; canvas.height = document.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(documentRgba(document)), document.width, document.height), 0, 0);
  canvas.className = 'picture-shelf__thumb'; canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = `${size}px`; canvas.style.height = `${Math.round(size * document.height / document.width)}px`;
  return canvas;
}

/**
 * A row of one-tap chips, one per other tool's picture. Tapping copies it into this tool.
 * `onBrought({ draftId, revision, from })` runs after the copy is saved. A tool that keeps no
 * picture of its own passes `onPick(entry)` instead and takes its own copy. Returns { refresh }.
 */
export function mountPictureShelf(container, { tool, adapter, storage = defaultStorage(), onBrought, onPick, onError, heading = 'ほかのツールの絵を持ってくる' }) {
  if (!container) return { refresh: async () => {} };
  container.classList.add('picture-shelf');
  const store = createLocalDraftStore(adapter);
  let busy = false;
  async function refresh() {
    let entries = [];
    try { entries = adapter ? await listBringable(tool, { adapter, storage }) : []; } catch { entries = []; }
    container.replaceChildren();
    container.hidden = !entries.length;
    if (!entries.length) return;
    const title = globalThis.document.createElement('p'); title.className = 'picture-shelf__title'; title.textContent = heading;
    const row = globalThis.document.createElement('div'); row.className = 'picture-shelf__row'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', heading);
    for (const entry of entries) {
      const button = globalThis.document.createElement('button'); button.type = 'button'; button.className = 'picture-shelf__item';
      const { width, height } = entry.revision.document;
      button.setAttribute('aria-label', `${entry.label}の絵（${width}×${height}）を持ってくる`);
      const label = globalThis.document.createElement('span'); label.textContent = entry.label;
      button.append(thumbnail(entry.revision.document), label);
      button.addEventListener('click', async () => {
        if (busy) return; busy = true; button.disabled = true;
        try {
          if (onPick) await onPick(entry);
          else { const result = await bringPicture(tool, entry, { adapter, store, storage }); await onBrought?.({ ...result, from: entry }); }
        }
        catch (error) { onError?.(error); }
        finally { busy = false; button.disabled = false; await refresh(); }
      });
      row.append(button);
    }
    container.append(title, row);
  }
  void refresh();
  return { refresh };
}
