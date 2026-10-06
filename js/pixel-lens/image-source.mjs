import {
  MAX_PIXEL_FILE_BYTES,
  MAX_PIXEL_IMAGE_EDGE,
  MAX_PIXEL_IMAGE_PIXELS,
  readPixelImageDimensions
} from '../pixel-scale.mjs';

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const INVALID_IMAGE = '画像の形式やサイズを確認してください。PNG・JPEG・WebP形式に対応しています。';
const TOO_LARGE = '画像は10MB以内にしてください。';
const DIMENSIONS_TOO_LARGE = '画像は縦横4096px以下、合計1,600万画素以下にしてください。';
const DECODE_FAILED = '画像を読み込めませんでした。PNG・JPEG・WebP形式を確認してください。';

function validateDimensions({ width, height }, message = DIMENSIONS_TOO_LARGE) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > MAX_PIXEL_IMAGE_EDGE || height > MAX_PIXEL_IMAGE_EDGE
    || width * height > MAX_PIXEL_IMAGE_PIXELS) {
    throw new RangeError(message);
  }
}

function dimensionsMatch(actual, header, mimeType) {
  return (actual.width === header.width && actual.height === header.height)
    || (mimeType === 'image/jpeg' && actual.width === header.height && actual.height === header.width);
}

function validateDecodedSize(source, header, mimeType) {
  const actual = { width: source?.width ?? source?.naturalWidth, height: source?.height ?? source?.naturalHeight };
  validateDimensions(actual, INVALID_IMAGE);
  if (!dimensionsMatch(actual, header, mimeType)) throw new TypeError(INVALID_IMAGE);
  return actual;
}

function disposeBitmap(bitmap) {
  try { bitmap.close?.(); } catch { /* Releasing a decoded source is best-effort. */ }
}

function releaseUrl(URLRef, url) {
  try { URLRef?.revokeObjectURL?.(url); } catch { /* Releasing a local preview URL is best-effort. */ }
}

async function decodeWithImageElement(file, header, mimeType, { documentRef, URLRef }) {
  if (!documentRef?.createElement || typeof URLRef?.createObjectURL !== 'function') {
    throw new Error(DECODE_FAILED);
  }

  let image;
  let url;
  try {
    image = documentRef.createElement('img');
    const imageBlob = file.type ? file : file.slice(0, file.size, mimeType);
    url = URLRef.createObjectURL(imageBlob);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(DECODE_FAILED));
      image.src = url;
    });
    image.onload = null;
    image.onerror = null;
    const { width, height } = validateDecodedSize(image, header, mimeType);
    let disposed = false;
    return {
      source: image,
      width,
      height,
      dispose() {
        if (disposed) return;
        disposed = true;
        image.onload = null;
        image.onerror = null;
        image.removeAttribute?.('src');
        releaseUrl(URLRef, url);
      }
    };
  } catch (error) {
    if (image) {
      image.onload = null;
      image.onerror = null;
    }
    image?.removeAttribute?.('src');
    if (url) releaseUrl(URLRef, url);
    if (error instanceof RangeError || error instanceof TypeError && error.message === INVALID_IMAGE) throw error;
    throw new Error(DECODE_FAILED);
  }
}

/** Decode one bounded local camera image without allocating a full RGBA buffer. */
export async function decodeCameraImageFile(file, {
  documentRef = globalThis.document,
  createImageBitmapImpl = globalThis.createImageBitmap,
  URLRef = globalThis.URL
} = {}) {
  if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size)) {
    throw new TypeError(INVALID_IMAGE);
  }
  const declaredType = typeof file.type === 'string' ? file.type : '';
  if (declaredType && !SUPPORTED_TYPES.has(declaredType)) {
    throw new TypeError('PNG・JPEG・WebP画像を選んでください。HEIC画像はJPEGまたはPNGに変換してください。');
  }
  if (file.size > MAX_PIXEL_FILE_BYTES) throw new RangeError(TOO_LARGE);

  let header;
  try {
    const maxHeaderBytes = !declaredType || declaredType === 'image/jpeg' ? 64 * 1024 : 32;
    header = new Uint8Array(await file.slice(0, maxHeaderBytes).arrayBuffer());
  } catch {
    throw new TypeError(INVALID_IMAGE);
  }
  const mimeType = declaredType || [...SUPPORTED_TYPES].find((type) => readPixelImageDimensions(header, type));
  const headerDimensions = mimeType ? readPixelImageDimensions(header, mimeType) : null;
  if (!headerDimensions) throw new TypeError(INVALID_IMAGE);
  validateDimensions(headerDimensions);

  if (typeof createImageBitmapImpl === 'function') {
    let bitmap;
    try {
      bitmap = await createImageBitmapImpl(file);
    } catch {
      // Some browsers cannot decode a valid local image as an ImageBitmap.
      bitmap = null;
    }
    if (bitmap) {
      try {
        const { width, height } = validateDecodedSize(bitmap, headerDimensions, mimeType);
        let disposed = false;
        return {
          source: bitmap,
          width,
          height,
          dispose() {
            if (disposed) return;
            disposed = true;
            disposeBitmap(bitmap);
          }
        };
      } catch (error) {
        disposeBitmap(bitmap);
        throw error;
      }
    }
  }

  return decodeWithImageElement(file, headerDimensions, mimeType, { documentRef, URLRef });
}
