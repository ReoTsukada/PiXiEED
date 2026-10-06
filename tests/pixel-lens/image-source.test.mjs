import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCameraImageFile } from '../../js/pixel-lens/image-source.mjs';

function blobOf(bytes, type) {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, 'name', { value: `sample.${type.split('/')[1]}` });
  return blob;
}

function pngHeader(width, height) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpegHeader(width, height) {
  const bytes = new Uint8Array(23);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, (height >>> 8) & 255, height & 255,
    (width >>> 8) & 255, width & 255, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00, 0xff, 0xd9]);
  return bytes;
}

function webpHeader(width, height) {
  const bytes = new Uint8Array(32);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58], 0);
  bytes[24] = (width - 1) & 255;
  bytes[25] = ((width - 1) >>> 8) & 255;
  bytes[26] = ((width - 1) >>> 16) & 255;
  bytes[27] = (height - 1) & 255;
  bytes[28] = ((height - 1) >>> 8) & 255;
  bytes[29] = ((height - 1) >>> 16) & 255;
  return bytes;
}

function imageBitmap(width, height) {
  return { width, height, closeCalls: 0, close() { this.closeCalls++; } };
}

function imageElement({ width, height, fail = false } = {}) {
  const image = {
    naturalWidth: 0,
    naturalHeight: 0,
    onload: null,
    onerror: null,
    attributes: {},
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
  };
  Object.defineProperty(image, 'src', {
    get() { return this.attributes.src ?? ''; },
    set(value) {
      this.attributes.src = value;
      queueMicrotask(() => {
        if (fail) image.onerror?.(new Error('decode failed'));
        else {
          image.naturalWidth = width;
          image.naturalHeight = height;
          image.onload?.();
        }
      });
    }
  });
  return image;
}

function fallbackRefs(image) {
  const calls = { created: [], revoked: [] };
  return {
    calls,
    documentRef: { createElement(tag) { assert.equal(tag, 'img'); calls.created.push(tag); return image; } },
    URLRef: {
      createObjectURL(blob) { assert.ok(blob instanceof Blob); return 'blob:camera-source'; },
      revokeObjectURL(url) { calls.revoked.push(url); }
    }
  };
}

test('decodes PNG from bounded header dimensions and closes its bitmap idempotently', async () => {
  const file = blobOf(pngHeader(64, 48), 'image/png');
  const bitmap = imageBitmap(64, 48);
  let received;
  const decoded = await decodeCameraImageFile(file, { createImageBitmapImpl: async (input) => { received = input; return bitmap; } });
  assert.equal(received, file);
  assert.equal(decoded.source, bitmap);
  assert.equal(decoded.width, 64);
  assert.equal(decoded.height, 48);
  decoded.dispose();
  decoded.dispose();
  assert.equal(bitmap.closeCalls, 1);
});

test('accepts JPEG EXIF orientation when decoded dimensions are swapped', async () => {
  const file = blobOf(jpegHeader(4032, 3024), 'image/jpeg');
  const bitmap = imageBitmap(3024, 4032);
  const decoded = await decodeCameraImageFile(file, { createImageBitmapImpl: async () => bitmap });
  assert.equal(decoded.width, 3024);
  assert.equal(decoded.height, 4032);
  decoded.dispose();
  assert.equal(bitmap.closeCalls, 1);
});

test('accepts WebP through the shared pixel header parser', async () => {
  const file = blobOf(webpHeader(35, 51), 'image/webp');
  const bitmap = imageBitmap(35, 51);
  const decoded = await decodeCameraImageFile(file, { createImageBitmapImpl: async () => bitmap });
  assert.deepEqual([decoded.width, decoded.height], [35, 51]);
  decoded.dispose();
});

test('sniffs a supported image signature when a local file has an empty MIME type', async () => {
  const file = blobOf(pngHeader(36, 24), '');
  const bitmap = imageBitmap(36, 24);
  const decoded = await decodeCameraImageFile(file, { createImageBitmapImpl: async (input) => {
    assert.equal(input.type, '');
    return bitmap;
  } });
  assert.deepEqual([decoded.width, decoded.height], [36, 24]);
  decoded.dispose();
});

test('rejects unsupported MIME, oversized file, and oversized dimensions before decoding', async () => {
  let decodeCalls = 0;
  const decoder = async () => { decodeCalls++; return imageBitmap(1, 1); };
  await assert.rejects(decodeCameraImageFile(blobOf(pngHeader(10, 10), 'image/heic'), { createImageBitmapImpl: decoder }), /HEIC画像はJPEGまたはPNG/);

  const tooLarge = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' });
  await assert.rejects(decodeCameraImageFile(tooLarge, { createImageBitmapImpl: decoder }), /10MB以内/);

  const tooWide = blobOf(pngHeader(4097, 1), 'image/png');
  await assert.rejects(decodeCameraImageFile(tooWide, { createImageBitmapImpl: decoder }), /縦横4096px以下/);

  assert.equal(decodeCalls, 0);

  const maxPixels = blobOf(pngHeader(4096, 4096), 'image/png');
  const boundary = imageBitmap(4096, 4096);
  const decoded = await decodeCameraImageFile(maxPixels, { createImageBitmapImpl: async () => { decodeCalls++; return boundary; } });
  assert.deepEqual([decoded.width, decoded.height], [4096, 4096]);
  decoded.dispose();
  assert.equal(decodeCalls, 1);
});

test('closes a bitmap when its decoded dimensions disagree with the validated header', async () => {
  const bitmap = imageBitmap(80, 48);
  await assert.rejects(
    decodeCameraImageFile(blobOf(pngHeader(64, 48), 'image/png'), { createImageBitmapImpl: async () => bitmap }),
    /形式やサイズを確認/
  );
  assert.equal(bitmap.closeCalls, 1);
});

test('falls back to an img Blob URL when ImageBitmap is unavailable and releases it on dispose', async () => {
  const image = imageElement({ width: 64, height: 48 });
  const refs = fallbackRefs(image);
  const decoded = await decodeCameraImageFile(blobOf(pngHeader(64, 48), 'image/png'), {
    createImageBitmapImpl: undefined,
    ...refs
  });
  assert.equal(decoded.source, image);
  assert.deepEqual(refs.calls.created, ['img']);
  assert.equal(image.src, 'blob:camera-source');
  assert.deepEqual(refs.calls.revoked, []);
  decoded.dispose();
  decoded.dispose();
  assert.deepEqual(refs.calls.revoked, ['blob:camera-source']);
  assert.equal(image.src, '');
});

test('falls back to an img Blob URL when createImageBitmap rejects', async () => {
  const image = imageElement({ width: 64, height: 48 });
  const refs = fallbackRefs(image);
  const decoded = await decodeCameraImageFile(blobOf(pngHeader(64, 48), 'image/png'), {
    createImageBitmapImpl: async () => { throw new Error('unsupported'); },
    ...refs
  });
  assert.equal(decoded.source, image);
  decoded.dispose();
  assert.deepEqual(refs.calls.revoked, ['blob:camera-source']);
});

test('revokes the fallback URL and reports a concise error when image loading fails', async () => {
  const image = imageElement({ fail: true });
  const refs = fallbackRefs(image);
  await assert.rejects(decodeCameraImageFile(blobOf(pngHeader(64, 48), 'image/png'), {
    createImageBitmapImpl: null,
    ...refs
  }), /画像を読み込めませんでした/);
  assert.deepEqual(refs.calls.revoked, ['blob:camera-source']);
  assert.equal(image.src, '');
});

test('rejects a corrupt supported-type header without invoking a decoder', async () => {
  let decodeCalls = 0;
  const corrupt = blobOf(new Uint8Array(32), 'image/png');
  await assert.rejects(decodeCameraImageFile(corrupt, { createImageBitmapImpl: async () => { decodeCalls++; } }), /形式やサイズを確認/);
  assert.equal(decodeCalls, 0);
});

test('rejects fallback dimensions that disagree with PNG header and releases the URL', async () => {
  const image = imageElement({ width: 80, height: 48 });
  const refs = fallbackRefs(image);
  await assert.rejects(decodeCameraImageFile(blobOf(pngHeader(64, 48), 'image/png'), {
    createImageBitmapImpl: null,
    ...refs
  }), /形式やサイズを確認/);
  assert.deepEqual(refs.calls.revoked, ['blob:camera-source']);
});
