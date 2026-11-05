const DECODED_OUTPUT_EXTENSIONS = new Set(['tif', 'tiff', 'tga', 'targa', 'qoi', 'ppm', 'pgm', 'pbm', 'pnm', 'pam']);
const MAX_EDGE = 4096;
const MAX_PIXELS = 16_777_216;
const MAX_FRAMES = 600;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

function extensionOf(filename) {
  const name = String(filename ?? '').split(/[\\/]/).pop();
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof DOMException === 'function') throw new DOMException('Preview decoding was aborted.', 'AbortError');
  const error = new Error('Preview decoding was aborted.');
  error.name = 'AbortError';
  throw error;
}

function validateFrame(frame) {
  const { width, height, data } = frame ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE
      || width * height > MAX_PIXELS || !ArrayBuffer.isView(data)
      || data.BYTES_PER_ELEMENT !== 1 || data.length !== width * height * 4) {
    throw new RangeError('Decoded preview frame has invalid dimensions or RGBA data.');
  }
  return frame;
}

export function needsDecodedOutputPreview(filename) {
  return DECODED_OUTPUT_EXTENSIONS.has(extensionOf(filename));
}

export async function decodeGeneratedPreview(
  { blob, filename, signal } = {},
  { loadFile, FileImpl = globalThis.File } = {}
) {
  if (!needsDecodedOutputPreview(filename)) return null;
  throwIfAborted(signal);
  if (!blob || typeof blob.slice !== 'function' || !Number.isFinite(blob.size)
      || blob.size < 1 || blob.size > MAX_FILE_BYTES) {
    throw new RangeError('Generated output blob must be between 1 byte and 64 MB.');
  }
  if (typeof FileImpl !== 'function') throw new TypeError('File is unavailable for local preview decoding.');
  const loader = loadFile || (async (...args) => {
    const { loadConversionFile } = await import('./conversion-service.mjs?rev=20261028-conversion-1');
    return loadConversionFile(...args);
  });
  if (typeof loader !== 'function') throw new TypeError('loadFile must be a function.');
  const file = new FileImpl([blob], String(filename), { type: blob.type || '' });
  const decoded = await loader(file, { signal });
  throwIfAborted(signal);
  const frames = decoded?.frames;
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > MAX_FRAMES) {
    throw new RangeError('Decoded output contains no valid preview frames.');
  }
  const frame = validateFrame(frames[0]);
  const firstPageOnly = ['tif', 'tiff'].includes(extensionOf(filename));
  return {
    width: frame.width,
    height: frame.height,
    data: frame.data,
    frameCount: frames.length,
    kind: 'decoded-output',
    partial: firstPageOnly || frames.length > 1,
    firstPageOnly,
    note: frame.note || decoded.note || ''
  };
}
