import { TIMELINE_LIMITS, validateTimeline } from './conversion-timeline.mjs?rev=20261031-material-stage-1';
import { fitOutputFrames } from './output-import.mjs?rev=20261020-format-conversion-1';

const rawFrames = asset => asset.rawFrames || asset.frames || [];
const fitNotice = '画像は共通サイズにそろえ、余白を追加して表示します。';
function fitMaterials(assets, workingFrames) {
  const rawByFrame = new Map(assets.flatMap(asset => rawFrames(asset).map(frame => [frame.frameId, frame])));
  const ordered = workingFrames.map(frame => {
    const raw = rawByFrame.get(frame.frameId) || frame;
    return { ...raw, delayMs: frame.delayMs, name: frame.name, assetId: frame.assetId, frameId: frame.frameId };
  });
  validateTimeline(ordered);
  const fitted = fitOutputFrames(ordered).map((frame, index) => ({ ...frame,
    assetId: ordered[index].assetId, frameId: ordered[index].frameId,
    delayMs: ordered[index].delayMs, name: ordered[index].name }));
  return { frames: fitted, assets };
}

export function validateConversionMaterialFiles(source, files) {
  const incoming = Array.from(files || []), assets = source?.assets || [];
  if (assets.length + incoming.length > TIMELINE_LIMITS.files) throw new RangeError('素材は合計8ファイルまで追加できます。');
  if (incoming.some(file => !Number.isSafeInteger(file?.size) || file.size < 1 || file.size > 64 * 1024 * 1024)
      || assets.reduce((sum, asset) => sum + (asset.bytes || 0), 0) + incoming.reduce((sum, file) => sum + file.size, 0) > TIMELINE_LIMITS.bytes)
    throw new RangeError('1ファイル64MB、素材の合計128MB以内で選んでください。');
  return incoming;
}

/** Snapshot editable frame metadata while retaining immutable decoded pixel buffers. */
export function snapshotConversionMaterialSource(next) {
  const assets = next.assets.map(asset => ({ ...asset, rawFrames: (asset.rawFrames || asset.frames || []).map((frame, index) => ({
    ...frame, assetId: frame.assetId || asset.id, frameId: frame.frameId || `${asset.id}:${index}`
  })) }));
  const indices = new Map();
  const frames = (next.frames || []).map(frame => {
    const assetId = frame.assetId || assets[0]?.id;
    const index = indices.get(assetId) || 0; indices.set(assetId, index + 1);
    return { ...frame, assetId, frameId: frame.frameId || `${assetId}:${index}` };
  });
  return { ...next, assets, frames };
}

/** Input files, rather than decoded frames, are the material-counting unit. */
export function describeConversionMaterials(source) {
  const assets = source?.assets || (source ? [{ id: source.assetId || 'material-1', name: source.name || '素材', kind: source.kind }] : []);
  return assets.map(({ id, name, kind, firstFrame }) => ({ id, name, kind, ...(firstFrame ? { firstFrame } : {}) }));
}
export const countConversionMaterialFrames = source => source?.frames?.length || 0;
export function firstConversionAssetFrameIndex(source, id) {
  return source?.frames?.findIndex(frame => frame.assetId === id) ?? -1;
}

/** Keep a surviving active material and frame stable after another material is removed. */
export function preserveConversionFrameAfterRemoval(source, nextSource, removedId, activeId, frameId) {
  const survivingActive = nextSource?.assets?.some(asset => asset.id === activeId) ? activeId : null;
  const survivingFrame = frameId ? nextSource?.frames?.findIndex(frame => frame.frameId === frameId) ?? -1 : -1;
  if (survivingActive && survivingFrame >= 0)
    return { activeId: survivingActive, frameIndex: survivingFrame, frameId };

  const removedIndex = Math.max(0, source?.assets?.findIndex(asset => asset.id === removedId) ?? 0);
  const nearest = nextSource?.assets?.[Math.min(removedIndex, (nextSource.assets.length || 1) - 1)] || nextSource?.assets?.[0];
  const frameIndex = nearest ? firstConversionAssetFrameIndex(nextSource, nearest.id) : -1;
  return frameIndex >= 0
    ? { activeId: nearest.id, frameIndex, frameId: nextSource.frames[frameIndex].frameId }
    : { activeId: nextSource?.assets?.[0]?.id || null, frameIndex: 0, frameId: nextSource?.frames?.[0]?.frameId || null };
}

/** Validate and compose additions without changing the existing source or frames. */
export function addConversionMaterials(source, additions) {
  const current = source?.assets || [];
  const incoming = Array.from(additions || []);
  if (!incoming.length) return source;
  if (incoming.some(asset => asset.kind !== 'image')) throw new TypeError('追加できる素材は画像だけです。動画・音声は「素材を変更」から1つずつ選んでください。');
  const assets = [...current, ...incoming];
  if (assets.length > TIMELINE_LIMITS.files) throw new RangeError('素材は合計8ファイルまで追加できます。');
  if (assets.reduce((sum, asset) => sum + asset.bytes, 0) > TIMELINE_LIMITS.bytes) throw new RangeError('素材の合計は128MB以内で選んでください。');
  const working = [...source.frames, ...incoming.flatMap(rawFrames)];
  const fitted = fitMaterials(assets, working);
  const frames = fitted.frames;
  const baseNote = String(source.note || '').replaceAll(fitNotice, '').trim();
  const note = assets.length > 1 ? [baseNote, fitNotice].filter(Boolean).join(' ') : baseNote;
  return { ...source, kind: 'image', name: assets[0]?.name || source.name, assets: fitted.assets,
    frames, sequence: assets.length > 1 || assets.some(asset => rawFrames(asset).length > 1),
    totalPlays: assets.length > 1 ? 0 : source.totalPlays, note };
}

export function removeConversionMaterial(source, id) {
  if (!source?.assets?.length) return source;
  const assets = source.assets.filter(asset => asset.id !== id);
  if (assets.length === source.assets.length) return source;
  if (!assets.length) return null;
  const working = source.frames.filter(frame => frame.assetId !== id);
  const fitted = fitMaterials(assets, working);
  const frames = fitted.frames;
  const baseNote = String(source.note || '').replaceAll(fitNotice, '').trim();
  const note = assets.length > 1 ? [baseNote, fitNotice].filter(Boolean).join(' ') : baseNote;
  return { ...source, assets: fitted.assets, frames, name: assets[0].name,
    sequence: assets.length > 1 || assets.some(asset => rawFrames(asset).length > 1), totalPlays: assets.length > 1 ? 0 : source.totalPlays, note };
}

/** Remove one input and retain its exact global frame slots for a single undo. */
export function removeConversionMaterialWithTicket(source, id) {
  const assetIndex = source?.assets?.findIndex(asset => asset.id === id) ?? -1;
  if (assetIndex < 0) return { source, ticket: null };
  const slots = source.frames.flatMap((frame, index) => frame.assetId === id ? [{
    frame: { ...frame }, index,
    afterId: source.frames.slice(0, index).reverse().find(item => item.assetId !== id)?.frameId || null,
    beforeId: source.frames.slice(index + 1).find(item => item.assetId !== id)?.frameId || null,
  }] : []);
  const asset = source.assets[assetIndex];
  const ticket = { id, assetIndex, asset: { ...asset, rawFrames: rawFrames(asset).map(frame => ({ ...frame })) }, slots,
    base: Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'assets' && key !== 'frames')) };
  return { source: source.assets.length === 1 ? null : removeConversionMaterial(source, id), ticket };
}

/** Restore near surviving neighbors; current surviving edits and later additions win. */
export function restoreConversionMaterial(source, ticket) {
  if (!ticket?.asset || !Array.isArray(ticket.slots)) return source;
  if (!source && ticket.asset.kind !== 'image' && ticket.slots.length === 0)
    return { ...ticket.base, assets: [ticket.asset], frames: [] };
  const assets = [...(source?.assets || [])];
  if (assets.some(asset => asset.id === ticket.id)) return source;
  const bytes = assets.reduce((sum, asset) => sum + (asset.bytes || 0), ticket.asset.bytes || 0);
  if (assets.length >= TIMELINE_LIMITS.files || bytes > TIMELINE_LIMITS.bytes)
    throw new RangeError('Undoすると素材のファイル数または合計容量の上限を超えます。先に素材を減らしてください。');
  assets.splice(Math.min(ticket.assetIndex, assets.length), 0, ticket.asset);
  const frames = [...(source?.frames || [])], afterOffsets = new Map();
  for (const slot of ticket.slots) {
    let at = slot.beforeId ? frames.findIndex(frame => frame.frameId === slot.beforeId) : -1;
    if (at < 0 && slot.afterId) {
      const anchor = frames.findIndex(frame => frame.frameId === slot.afterId);
      if (anchor >= 0) { const offset = afterOffsets.get(slot.afterId) || 1; at = anchor + offset; afterOffsets.set(slot.afterId, offset + 1); }
    }
    if (at < 0) at = Math.max(0, Math.min(frames.length, slot.index));
    frames.splice(at, 0, { ...slot.frame });
  }
  const base = source || ticket.base, fitted = fitMaterials(assets, frames);
  const note = String(base?.note || '').replaceAll(fitNotice, '').trim();
  return { ...base, kind: 'image', name: assets[0]?.name || base?.name, assets, frames: fitted.frames,
    sequence: assets.length > 1 || assets.some(asset => rawFrames(asset).length > 1),
    totalPlays: assets.length > 1 ? 0 : base?.totalPlays,
    note: assets.length > 1 ? [note, fitNotice].filter(Boolean).join(' ') : note };
}

export function moveConversionMaterial(source, id, direction) {
  if (!source?.assets?.length || ![-1, 1].includes(direction)) return source;
  const from = source.assets.findIndex(asset => asset.id === id), to = from + direction;
  if (from < 0 || to < 0 || to >= source.assets.length) return source;
  const assets = [...source.assets]; [assets[from], assets[to]] = [assets[to], assets[from]];
  const selected = source.frames.filter(frame => frame.assetId === id);
  const frames = source.frames.filter(frame => frame.assetId !== id);
  const neighborId = source.assets[to].id;
  const neighborSlots = frames.flatMap((frame, index) => frame.assetId === neighborId ? [index] : []);
  const insertion = direction < 0 ? neighborSlots[0] : neighborSlots.at(-1) + 1;
  frames.splice(Number.isInteger(insertion) ? insertion : frames.length, 0, ...selected);
  return { ...source, assets, frames: fitMaterials(assets, frames).frames };
}
