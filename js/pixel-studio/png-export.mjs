const TARGET_LONG_EDGE = 2048;
const MAX_SOURCE_EDGE = 8192;
const MAX_SOURCE_PIXELS = 16 * 1024 * 1024;
const PNG_ERROR = 'PNGを準備できませんでした。';

function validateDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError('width and height must be positive integers');
  }
  if (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE || width * height > MAX_SOURCE_PIXELS) {
    throw new RangeError(`source image must fit within ${MAX_SOURCE_EDGE}px per edge and ${MAX_SOURCE_PIXELS} pixels`);
  }
}

/** Return an integer-scale export size without changing the frame aspect ratio. */
export function pngExportGeometry(width, height) {
  validateDimensions(width, height);
  const longEdge = Math.max(width, height);
  const scale = Math.max(1, Math.floor(TARGET_LONG_EDGE / longEdge));
  return { width: width * scale, height: height * scale, scale };
}

/** Encode an opaque RGBA camera frame as an integer-scaled PNG. */
export async function encodeCameraPng(frame) {
  if (!frame || typeof frame !== 'object') throw new TypeError('frame must contain width, height, and RGBA data');
  const { width, height, data } = frame;
  validateDimensions(width, height);
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new TypeError('frame data must be a Uint8ClampedArray with one RGBA pixel per cell');
  }
  const geometry = pngExportGeometry(width, height);
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error(PNG_ERROR);
  }

  let sourceCanvas = null;
  let exportCanvas = null;
  try {
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext('2d');
    if (!sourceContext) throw new Error(PNG_ERROR);
    const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
    sourceContext.putImageData(imageData, 0, 0);

    exportCanvas = document.createElement('canvas');
    exportCanvas.width = geometry.width;
    exportCanvas.height = geometry.height;
    const exportContext = exportCanvas.getContext('2d');
    if (!exportContext) throw new Error(PNG_ERROR);
    exportContext.imageSmoothingEnabled = false;
    exportContext.drawImage(sourceCanvas, 0, 0, geometry.width, geometry.height);

    if (typeof exportCanvas.toBlob !== 'function') throw new Error(PNG_ERROR);
    const blob = await new Promise((resolve, reject) => {
      exportCanvas.toBlob((value) => value ? resolve(value) : reject(new Error(PNG_ERROR)),
        'image/png');
    });
    return { blob, ...geometry };
  } catch {
    throw new Error(PNG_ERROR);
  } finally {
    if (sourceCanvas) { sourceCanvas.width = 1; sourceCanvas.height = 1; }
    if (exportCanvas) { exportCanvas.width = 1; exportCanvas.height = 1; }
  }
}
