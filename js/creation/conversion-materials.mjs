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
