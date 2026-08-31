import type { Audio230PerformanceCounters, Audio230Result } from "./contracts.ts";

export interface Audio230TimelineItem { readonly id: string; readonly startTick: number; readonly durationTick: number; readonly kind: "CLIP" | "NOTE" | "MARKER"; }
export interface Audio230TimelineProjection { readonly startTick: number; readonly endTick: number; readonly items: readonly { readonly id: string; readonly x: number; readonly width: number; readonly kind: Audio230TimelineItem["kind"] }[]; readonly truncated: boolean; }
export interface Audio230WaveformProjection { readonly bins: readonly number[]; readonly sourceBinsRead: number; readonly truncated: boolean; }
export interface Audio230CanvasProjection { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly timeline: Audio230TimelineProjection; readonly waveform: Audio230WaveformProjection; }
const fail = (code: string, message: string, path?: string): Audio230Result<never> => ({ ok: false, diagnostics: [{ code, message, ...(path === undefined ? {} : { path }) }] });

export function projectAudio230Canvas(x: number, y: number, width: number, height: number, items: readonly Audio230TimelineItem[], samples: readonly number[], startTick: number, endTick: number, maxItems = 512, targetBins = 512): Audio230Result<Audio230CanvasProjection> {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return fail("AUDIO230_INVALID_CANVAS", "Canvas geometry must be finite and positive.");
  const timeline = projectAudio230Timeline(items, startTick, endTick, width, maxItems);
  if (!timeline.ok) return timeline;
  const waveform = projectAudio230Waveform(samples, targetBins);
  if (!waveform.ok) return waveform;
  return { ok: true, value: { x, y, width, height, timeline: timeline.value, waveform: waveform.value }, diagnostics: [] };
}

export function projectAudio230Timeline(items: readonly Audio230TimelineItem[], startTick: number, endTick: number, width: number, maxItems = 512): Audio230Result<Audio230TimelineProjection> {
  if (!Number.isFinite(startTick) || !Number.isFinite(endTick) || endTick <= startTick || !Number.isFinite(width) || width <= 0 || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 4096) return fail("AUDIO230_INVALID_PROJECTION", "Timeline bounds and item limit must be finite, positive, and bounded.");
  const visible = items.filter((item) => Number.isFinite(item.startTick) && Number.isFinite(item.durationTick) && item.durationTick > 0 && item.startTick < endTick && item.startTick + item.durationTick > startTick).slice(0, maxItems);
  const span = endTick - startTick;
  return { ok: true, value: { startTick, endTick, items: visible.map((item) => ({ id: item.id, x: Math.max(0, ((item.startTick - startTick) / span) * width), width: Math.max(1, (Math.min(endTick, item.startTick + item.durationTick) - Math.max(startTick, item.startTick)) / span * width), kind: item.kind })), truncated: visible.length < items.length }, diagnostics: [] };
}

export function projectAudio230Waveform(samples: readonly number[], targetBins: number, maxSourceBins = 1_000_000): Audio230Result<Audio230WaveformProjection> {
  if (!Number.isInteger(targetBins) || targetBins < 1 || targetBins > 4096 || !Number.isInteger(maxSourceBins) || maxSourceBins < 1) return fail("AUDIO230_INVALID_WAVEFORM", "Waveform target and source limits must be bounded.");
  const source = samples.slice(0, maxSourceBins);
  const bins = Array.from({ length: Math.min(targetBins, source.length || 1) }, (_, index) => {
    const from = Math.floor(index * source.length / Math.min(targetBins, source.length || 1));
    const to = Math.max(from + 1, Math.floor((index + 1) * source.length / Math.min(targetBins, source.length || 1)));
    let peak = 0;
    for (let cursor = from; cursor < Math.min(to, source.length); cursor += 1) { const value = source[cursor]; if (value !== undefined && Number.isFinite(value)) peak = Math.max(peak, Math.min(1, Math.abs(value))); }
    return peak;
  });
  return { ok: true, value: { bins, sourceBinsRead: source.length, truncated: source.length < samples.length }, diagnostics: [] };
}

export function createAudio230Counters(previous: Audio230PerformanceCounters, change: Partial<Audio230PerformanceCounters>): Audio230PerformanceCounters {
  const next = { ...previous };
  for (const key of Object.keys(next) as (keyof Audio230PerformanceCounters)[]) next[key] = Math.max(0, (next[key] + (change[key] ?? 0)));
  return next;
}
