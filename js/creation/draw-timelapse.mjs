export const DRAW_TIMELAPSE = Object.freeze({
  fps: 12,
  shortSeconds: 3,
  detailSeconds: 8,
  maxStoredBytes: 2 * 1024 * 1024,
  maxStoredFrames: 600,
  keyframeInterval: 60
});

function assertDocument(document) {
  if (!document || !Number.isSafeInteger(document.width) || !Number.isSafeInteger(document.height)
      || document.width < 1 || document.height < 1 || !Array.isArray(document.pixels)
      || document.pixels.length !== document.width * document.height || !Array.isArray(document.palette)) {
    throw new TypeError('Invalid Draw timelapse document');
  }
}

function rgbaForColor(color) {
  if (color < 0) return [0, 0, 0, 0];
  const hex = color.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
    .concat(hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255);
}

function snapshot(document) {
  const data = new Uint8Array(document.pixels.length * 4);
  const palette = document.palette.map((color) => rgbaForColor(color));
  for (let index = 0; index < document.pixels.length; index += 1) {
    data.set(palette[document.pixels[index]] || [0, 0, 0, 0], index * 4);
  }
  return { type: 'keyframe', width: document.width, height: document.height, data, bytes: data.byteLength };
}

function toDelta(document, indices) {
  if (!indices || !Number.isSafeInteger(indices.length)) return null;
  const unique = [...new Set(Array.from(indices).filter((index) => Number.isSafeInteger(index) && index >= 0 && index < document.pixels.length))];
  if (!unique.length) return null;
  const data = new Uint8Array(unique.length * 4); const palette = document.palette.map((color) => rgbaForColor(color));
  for (let slot = 0; slot < unique.length; slot += 1) data.set(palette[document.pixels[unique[slot]]] || [0, 0, 0, 0], slot * 4);
  const indexData = Uint32Array.from(unique);
  return { type: 'delta', width: document.width, height: document.height, indices: indexData, data, bytes: indexData.byteLength + data.byteLength };
}

function validateEvents(source, { maxBytes, maxFrames }) {
  if (!Array.isArray(source) || source.length < 1 || source.length > maxFrames || source[0]?.type !== 'keyframe') {
    throw new TypeError('Invalid Draw timelapse event sequence');
  }
  const first = source[0];
  if (!Number.isSafeInteger(first.width) || !Number.isSafeInteger(first.height) || first.width < 1 || first.height < 1 ||
      !Number.isSafeInteger(first.width * first.height) || first.width * first.height > Math.floor(Number.MAX_SAFE_INTEGER / 4)) {
    throw new TypeError('Invalid Draw timelapse dimensions');
  }
  const pixelCount = first.width * first.height, dataLength = pixelCount * 4;
  let totalBytes = 0, sinceKeyframe = 0;
  const copy = source.map((event, index) => {
    if (!event || (event.type !== 'keyframe' && event.type !== 'delta') ||
        event.width !== first.width || event.height !== first.height || !Number.isSafeInteger(event.bytes) || event.bytes < 1) {
      throw new TypeError('Invalid Draw timelapse event metadata');
    }
    if (event.type === 'keyframe') {
      if (!(event.data instanceof Uint8Array) || event.data.length !== dataLength || event.bytes !== event.data.byteLength) throw new TypeError('Invalid Draw timelapse keyframe');
      if (event.bytes > maxBytes - totalBytes) throw new RangeError('Draw timelapse snapshot exceeds its memory limit');
      sinceKeyframe = 0;
      totalBytes += event.data.byteLength;
      return { type: 'keyframe', width: first.width, height: first.height, data: new Uint8Array(event.data), bytes: event.bytes };
    }
    if (index === 0 || !(event.indices instanceof Uint32Array) || !(event.data instanceof Uint8Array) ||
        event.indices.length < 1 || event.indices.length > pixelCount || event.data.length !== event.indices.length * 4 ||
        event.bytes !== event.indices.byteLength + event.data.byteLength) throw new TypeError('Invalid Draw timelapse delta');
    if (event.bytes > maxBytes - totalBytes) throw new RangeError('Draw timelapse snapshot exceeds its memory limit');
    const seen = new Set();
    for (const cell of event.indices) {
      if (cell >= pixelCount || seen.has(cell)) throw new RangeError('Draw timelapse delta index is out of bounds or duplicated');
      seen.add(cell);
    }
    sinceKeyframe += 1;
    totalBytes += event.bytes;
    return { type: 'delta', width: first.width, height: first.height, indices: new Uint32Array(event.indices), data: new Uint8Array(event.data), bytes: event.bytes };
  });
  if (totalBytes > maxBytes) throw new RangeError('Draw timelapse snapshot exceeds its memory limit');
  return { events: copy, bytes: totalBytes, width: first.width, height: first.height, sinceKeyframe };
}

export function createDrawTimelapse({ maxBytes = DRAW_TIMELAPSE.maxStoredBytes, maxFrames = DRAW_TIMELAPSE.maxStoredFrames, keyframeInterval = DRAW_TIMELAPSE.keyframeInterval } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxFrames) || maxFrames < 2
      || !Number.isSafeInteger(keyframeInterval) || keyframeInterval < 1) throw new RangeError('Invalid Draw timelapse limits');
  let events = []; let bytes = 0; let width = 0; let height = 0; let sinceKeyframe = 0;

  const replaceWithSnapshot = (document) => {
    const frame = snapshot(document); events = [frame]; bytes = frame.bytes;
    if (bytes > maxBytes) throw new RangeError('Draw timelapse snapshot exceeds its memory limit');
    width = document.width; height = document.height; sinceKeyframe = 0;
  };
  const trim = () => {
    while ((bytes > maxBytes || events.length > maxFrames) && events.length > 1) {
      const nextKeyframe = events.findIndex((event, index) => index > 0 && event.type === 'keyframe');
      if (nextKeyframe < 0) break;
      for (let index = 0; index < nextKeyframe; index += 1) bytes -= events[index].bytes;
      events = events.slice(nextKeyframe);
    }
  };

  return {
    reset(document) { assertDocument(document); replaceWithSnapshot(document); },
    record(document, step = null) {
      assertDocument(document);
      if (!events.length || width !== document.width || height !== document.height) {
        replaceWithSnapshot(document); return;
      }
      let event = step?.paletteChanged ? snapshot(document) : toDelta(document, step?.indices);
      if (!event) return;
      if (event.type !== 'keyframe' && (sinceKeyframe >= keyframeInterval || event.bytes >= document.pixels.length * 4)) event = snapshot(document);
      events.push(event); bytes += event.bytes;
      if (event.type === 'keyframe') sinceKeyframe = 0; else sinceKeyframe += 1;
      trim();
      if (bytes > maxBytes || events.length > maxFrames) replaceWithSnapshot(document);
    },
    restore(source) {
      const restored = validateEvents(source, { maxBytes, maxFrames });
      events = restored.events; bytes = restored.bytes; width = restored.width; height = restored.height; sinceKeyframe = restored.sinceKeyframe;
    },
    get frameCount() { return events.length; },
    get storedBytes() { return bytes; },
    snapshot() { return events.slice(); }
  };
}

function frameAt(events, selected) {
  const first = events[0]; const state = new Uint8Array(first.data); const frames = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (index > 0) {
      if (event.type === 'keyframe') state.set(event.data);
      else for (let slot = 0; slot < event.indices.length; slot += 1) state.set(event.data.subarray(slot * 4, slot * 4 + 4), event.indices[slot] * 4);
    }
    if (!selected.has(index)) continue;
    const data = new Uint8ClampedArray(state.length);
    for (let offset = 0; offset < state.length; offset += 4) {
      const alpha = state[offset + 3] / 255;
      data[offset] = Math.round(state[offset] * alpha + 255 * (1 - alpha));
      data[offset + 1] = Math.round(state[offset + 1] * alpha + 255 * (1 - alpha));
      data[offset + 2] = Math.round(state[offset + 2] * alpha + 255 * (1 - alpha));
      data[offset + 3] = 255;
    }
    frames.push({ width: first.width, height: first.height, data });
  }
  return frames;
}

export function selectDrawTimelapseFrames(events, { detail = false, fps = DRAW_TIMELAPSE.fps } = {}) {
  if (!Array.isArray(events) || !events.length || events[0].type !== 'keyframe') return [];
  if (!Number.isSafeInteger(fps) || fps < 1 || fps > 30) throw new RangeError('Invalid Draw timelapse frame rate');
  const seconds = detail ? DRAW_TIMELAPSE.detailSeconds : DRAW_TIMELAPSE.shortSeconds;
  const count = seconds * fps;
  const maxIndex = events.length - 1; const selected = new Set();
  for (let frame = 0; frame < count; frame += 1) selected.add(Math.round(frame * maxIndex / Math.max(1, count - 1)));
  const sampled = frameAt(events, selected);
  while (sampled.length < count) sampled.push({ ...sampled.at(-1), data: new Uint8ClampedArray(sampled.at(-1).data) });
  return sampled;
}
