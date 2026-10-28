/** Shared timing for preview and file output; never mutates the imported frames. */
import { getOutputTiming } from './output-timing.mjs?rev=20261009-fps-1';
import { fitOutputFrames } from './output-import.mjs?rev=20261020-format-conversion-1';
import { loadConversionFile, convertLocal } from './conversion-service.mjs?rev=20261028-conversion-1';

export const TIMELINE_LIMITS = Object.freeze({ files: 8, bytes: 128 * 1024 * 1024, frames: 600, pixels: 8_000_000 });
const abort = signal => { if (signal?.aborted) throw new DOMException('処理を中止しました。', 'AbortError'); };
export function validateTimeline(frames) {
  if (!Array.isArray(frames) || !frames.length || frames.length > TIMELINE_LIMITS.frames) throw new RangeError('画像は1〜600コマで指定してください。');
  let pixels = 0;
  for (const f of frames) {
    if (!Number.isSafeInteger(f?.width) || !Number.isSafeInteger(f?.height) || f.width < 1 || f.height < 1 || f.width > 4096 || f.height > 4096
      || !ArrayBuffer.isView(f.data) || f.data.BYTES_PER_ELEMENT !== 1 || f.data.length !== f.width * f.height * 4) throw new RangeError('画像データが不正です。');
    pixels += f.width * f.height;
  }
  if (pixels > TIMELINE_LIMITS.pixels) throw new RangeError('画像の合計が800万画素を超えています。画像を小さくするか、枚数を減らしてください。');
}

/** All-or-nothing import: an invalid later file never replaces a previous successful job. */
export async function loadTimelineFiles(files, { signal, load = loadConversionFile } = {}) {
  const selected = Array.from(files || []);
  if (!selected.length || selected.length > TIMELINE_LIMITS.files) throw new RangeError('一度に1〜8ファイルを選んでください。');
  if (selected.some(f => !f || !Number.isSafeInteger(f.size) || f.size < 1 || f.size > 64 * 1024 * 1024)
    || selected.reduce((n, f) => n + f.size, 0) > TIMELINE_LIMITS.bytes) throw new RangeError('1ファイル64MB、合計128MB以内で選んでください。');
  abort(signal);
  if (selected.length === 1) { const result = await load(selected[0], { signal }); abort(signal); return { ...result, sequence: false }; }
  const frames = []; const notes = [];
  for (const file of selected) {
    abort(signal);
    const next = await load(file, { signal });
    abort(signal);
    if (next.kind !== 'image' || next.video) throw new Error('複数選択は画像専用です。動画・音楽の組み合わせは詳細ワークスペースをご利用ください。');
    const still = next.frames.length === 1;
    frames.push(...next.frames.map((f, i) => ({ ...f, name: f.name || `${file.name}${still ? '' : ` · ${i + 1}`}`, delayMs: still ? 1000 : f.delayMs })));
    if (next.note) notes.push(next.note);
    validateTimeline(frames);
  }
  const fitted = fitOutputFrames(frames);
  return { kind: 'image', frames: fitted, totalPlays: 0, sequence: true, name: selected[0].name, inputFormat: 'sequence',
    note: [...new Set(notes), '選択した順に再生します。縦横比を保って共通サイズにそろえ、余白を追加します。'].join(' ') };
}

export function animationPlan(frames, { format = 'gif', playbackRate = 1, totalPlays = 0 } = {}) {
  validateTimeline(frames);
  if (!['gif', 'apng'].includes(format)) throw new RangeError('アニメーションはGIFまたはAPNGを選んでください。');
  const maxPlays = format === 'gif' ? 65536 : 0xffffffff;
  if (!Number.isSafeInteger(totalPlays) || totalPlays < 0 || totalPlays > maxPlays) throw new RangeError('再生回数が対応範囲を超えています。');
  const timing = getOutputTiming(frames, { format, playbackRate });
  const limit = format === 'gif' ? 655350 : 3_600_000;
  if (timing.frameDelaysMs.some(ms => ms > limit)) throw new RangeError('1コマの表示時間が長すぎます。再生速度か表示時間を調整してください。');
  const adjusted = timing.frameDelaysMs.some((ms, i) => Math.abs(ms - timing.sourceDelaysMs[i] / playbackRate) > .01);
  return { ...timing, adjusted, totalPlays,
    totalDurationMs: totalPlays === 0 ? null : timing.durationMs * totalPlays,
    frames: frames.map((f, i) => ({ ...f, delayMs: timing.frameDelaysMs[i] })) };
}

export function frameAt(plan, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !plan?.frameDelaysMs?.length || plan.durationMs <= 0) throw new RangeError('再生位置が不正です。');
  const done = plan.totalDurationMs !== null && elapsedMs >= plan.totalDurationMs;
  if (done) return { index: plan.frameDelaysMs.length - 1, done: true };
  let position = elapsedMs % plan.durationMs;
  for (let i = 0; i < plan.frameDelaysMs.length; i++) {
    if (position < plan.frameDelaysMs[i]) return { index: i, done: false };
    position -= plan.frameDelaysMs[i];
  }
  return { index: plan.frameDelaysMs.length - 1, done: false };
}

export function setFrameSeconds(frames, seconds, index = null) {
  if (!Number.isFinite(seconds) || seconds < .02 || seconds > 60) throw new RangeError('表示時間は0.02〜60秒で指定してください。');
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= frames.length)) throw new RangeError('コマの位置が不正です。');
  return frames.map((f, i) => index === null || index === i ? { ...f, delayMs: Math.round(seconds * 1000) } : f);
}
export function moveFrame(frames, index, direction) {
  if (!Number.isInteger(index) || ![-1, 1].includes(direction) || index < 0 || index >= frames.length) throw new RangeError('並べ替え位置が不正です。');
  const to = index + direction, result = [...frames];
  if (to >= 0 && to < frames.length) [result[index], result[to]] = [result[to], result[index]];
  return result;
}

/** Hand exactly the preview's quantized timing and loop count to the existing encoder. */
export async function convertWithTimeline(source, format, options, signal, onProgress, convert = convertLocal) {
  abort(signal);
  if (source.kind !== 'image' || !['gif', 'apng'].includes(format)) return convert(source, format, options, signal, onProgress);
  const plan = animationPlan(source.frames, { format, playbackRate: options.playbackRate ?? 1, totalPlays: options.totalPlays ?? source.totalPlays ?? 1 });
  return convert({ ...source, frames: plan.frames, totalPlays: plan.totalPlays }, format, options, signal, onProgress);
}
