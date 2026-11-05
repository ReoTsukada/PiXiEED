import { TIMELINE_LIMITS, validateTimeline } from './conversion-timeline.mjs?rev=20261031-material-stage-1';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function createConversionRecoverySnapshot({ source = null, original = null, activeId = null, undoTicket = null, assetSequence = 0, settings } = {}) {
  return { schemaVersion: 1, source, original, activeId, undoTicket, assetSequence, settings: { ...settings } };
}

function validateAudio(audio) {
  if (!audio || !Number.isFinite(audio.sampleRate) || audio.sampleRate < 1 || !Array.isArray(audio.channels) || audio.channels.length < 1 || audio.channels.length > 2)
    throw new TypeError('音声素材の保存データが不正です。');
  const length = audio.channels[0]?.length;
  if (!Number.isSafeInteger(length) || length < 1 || audio.channels.some(channel => !(channel instanceof Float32Array || channel instanceof Float64Array) || channel.length !== length))
    throw new TypeError('音声サンプルの保存データが不正です。');
}

function validateFrames(frames, allowEmpty = false) {
  if (!Array.isArray(frames) || (!allowEmpty && !frames.length) || frames.length > TIMELINE_LIMITS.frames) throw new RangeError('保存されたコマ数が上限外です。');
  if (frames.length) validateTimeline(frames);
  for (const frame of frames) {
    if (frame.delayMs !== undefined && (!Number.isFinite(frame.delayMs) || frame.delayMs < 0 || frame.delayMs > 3_600_000)) throw new RangeError('コマ時間の保存値が不正です。');
  }
}

function validateSource(source, { allowNull = false } = {}) {
  if (source === null && allowNull) return;
  if (!source || !['image', 'audio'].includes(source.kind) || !Array.isArray(source.assets) || source.assets.length > TIMELINE_LIMITS.files)
    throw new TypeError('素材の保存データが不正です。');
  const bytes = source.assets.reduce((sum, asset) => sum + (Number.isSafeInteger(asset?.bytes) && asset.bytes >= 0 ? asset.bytes : NaN), 0);
  if (!Number.isFinite(bytes) || bytes > TIMELINE_LIMITS.bytes) throw new RangeError('素材の合計容量が上限外です。');
  if (!source.assets.every(asset => asset && typeof asset.id === 'string' && typeof asset.name === 'string' && ['image', 'audio'].includes(asset.kind))) throw new TypeError('素材一覧の保存データが不正です。');
  if (source.kind === 'image') {
    validateFrames(source.frames);
    for (const asset of source.assets) validateFrames(asset.rawFrames || asset.frames || [], true);
    if (source.frames.some(frame => !frame.assetId || !source.assets.some(asset => asset.id === frame.assetId))) throw new TypeError('コマと素材の対応が不正です。');
    if (source.totalPlays !== undefined && (!Number.isSafeInteger(source.totalPlays) || source.totalPlays < 0 || source.totalPlays > 0xffffffff)) throw new RangeError('繰り返し回数の保存値が不正です。');
  } else validateAudio(source.audio);
}

export function validateConversionRecovery(snapshot, { formats = [] } = {}) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !own(snapshot, 'source') || !own(snapshot, 'original') || !own(snapshot, 'undoTicket')) throw new TypeError('変換の保存データに対応していません。');
  validateSource(snapshot.source, { allowNull: true }); validateSource(snapshot.original, { allowNull: true });
  if (!Number.isSafeInteger(snapshot.assetSequence) || snapshot.assetSequence < 0) throw new RangeError('素材番号の保存値が不正です。');
  if (snapshot.source && snapshot.activeId !== null && !snapshot.source.assets.some(asset => asset.id === snapshot.activeId)) throw new TypeError('選択中の素材が見つかりません。');
  const settings = snapshot.settings;
  if (!settings || typeof settings !== 'object' || typeof settings.format !== 'string' || (formats.length > 0 && !formats.includes(settings.format))) throw new RangeError('保存形式が現在の素材で使えません。');
  for (const [key, min, max] of [['width', 1, 4096], ['height', 1, 4096], ['frame', 1, snapshot.source?.frames?.length || 1], ['quality', 50, 100], ['threshold', 0, 255]]) {
    const value = settings[key]; if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${key}の保存値が不正です。`);
  }
  if (!['16', '24', '32'].includes(String(settings.bits)) || typeof settings.ratio !== 'boolean' || !Number.isSafeInteger(settings.loop) || settings.loop < 0 || settings.loop > 0xffffffff || !Number.isFinite(settings.rate) || settings.rate < .25 || settings.rate > 4) throw new RangeError('変換設定の保存値が不正です。');
  if (typeof settings.background !== 'string' || !/^#[\da-f]{6}$/i.test(settings.background)) throw new TypeError('背景色の保存値が不正です。');
  if (snapshot.undoTicket !== null) {
    const ticket = snapshot.undoTicket;
    for (const part of [ticket.current, ticket.original].filter(Boolean)) {
      if (!part.asset || !Array.isArray(part.slots) || !Number.isSafeInteger(part.assetIndex) || part.assetIndex < 0) throw new TypeError('取り消し情報の保存データが不正です。');
      if (!part.slots.every(slot => slot && Number.isSafeInteger(slot.index) && slot.index >= 0 && slot.frame)) throw new TypeError('取り消しコマの保存データが不正です。');
      if(part.asset.kind === 'audio') validateSource({ ...part.base, kind:'audio', assets:[part.asset], frames:[] });
      else validateSource({ kind: 'image', assets: [part.asset], frames: part.slots.map(slot => slot.frame), totalPlays: part.base?.totalPlays ?? 0 });
    }
    if (ticket.activeIdBefore !== null && typeof ticket.activeIdBefore !== 'string') throw new TypeError('取り消し時の素材選択が不正です。');
    if (ticket.selectedFrameIdBefore != null && typeof ticket.selectedFrameIdBefore !== 'string') throw new TypeError('取り消し時のコマ選択が不正です。');
  }
  return snapshot;
}
