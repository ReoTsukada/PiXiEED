(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PiXiEEDMarketPackage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const hasSequence = (bytes, sequence) => {
    for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
      if (sequence.every((value, offset) => bytes[index + offset] === value)) return true;
    }
    return false;
  };
  const hasSignature = (bytes, signature) => signature.every((value, index) => bytes[index] === value);
  const extensionOf = (file) => (file.name.split('.').pop() || '').toLowerCase();
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  const GIF_MAX_OPTIMIZE_FRAMES = 1000;
  const DEFAULT_GIF_FRAME_DURATION = 100;
  let gifCodec = null;

  function readUint24LittleEndian(bytes, offset) {
    return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8) | ((bytes[offset + 2] || 0) << 16);
  }

  function readWebpDimensions(bytes) {
    if (!hasSignature(bytes, [82, 73, 70, 70]) || bytes[8] !== 87 || bytes[9] !== 69 || bytes[10] !== 66 || bytes[11] !== 80) {
      return null;
    }
    const chunk = String.fromCharCode(bytes[12] || 0, bytes[13] || 0, bytes[14] || 0, bytes[15] || 0);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      return { width: readUint24LittleEndian(bytes, 24) + 1, height: readUint24LittleEndian(bytes, 27) + 1 };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const packed = (bytes[21] || 0) | ((bytes[22] || 0) << 8) | ((bytes[23] || 0) << 16) | ((bytes[24] || 0) << 24);
      return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: (((bytes[27] || 0) << 8) | (bytes[26] || 0)) & 0x3fff,
        height: (((bytes[29] || 0) << 8) | (bytes[28] || 0)) & 0x3fff,
      };
    }
    return null;
  }

  async function readRasterDimensions(file) {
    if (!file || typeof file.slice !== 'function') return null;
    const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    if (hasSignature(bytes, PNG_SIGNATURE) && bytes.length >= 24) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
    }
    if (hasSignature(bytes, [71, 73, 70, 56]) && bytes.length >= 10) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    return readWebpDimensions(bytes);
  }

  async function detectFormat(file) {
    const extension = extensionOf(file);
    const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
    const isPng = hasSignature(bytes, PNG_SIGNATURE);
    const isGif = hasSignature(bytes, [71, 73, 70, 56]);
    const isWebp = hasSignature(bytes, [82, 73, 70, 70])
      && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;

    // .pxd is the current PiXiEEDraw extension. Keep the prior extension as
    // a read-only compatibility alias for existing creators and purchasers.
    if (extension === 'pxd' || extension === 'pixieedraw' || extension === 'pxdraw') return 'pixiedraw-project';
    if (extension === 'gif' && isGif) return 'gif';
    if (extension === 'webp' && isWebp) return 'webp';
    if ((extension === 'png' || extension === 'apng') && isPng) {
      if (extension === 'apng' || hasSequence(bytes, [97, 99, 84, 76])) return 'apng';
      if (/(?:sprite[-_ ]?(?:sheet|map)|sprites?)(?:[._ -]|$)/i.test(file.name)) return 'sprite-sheet-png';
      return 'png';
    }
    return null;
  }

  async function collectFilesFromHandle(handle, prefix = '') {
    if (!handle) return [];
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      return [{ file, path: `${prefix}${file.name}` }];
    }
    if (handle.kind !== 'directory') return [];
    const childPrefix = `${prefix}${handle.name}/`;
    const files = [];
    if (typeof handle.values === 'function') {
      for await (const child of handle.values()) files.push(...await collectFilesFromHandle(child, childPrefix));
      return files;
    }
    if (typeof handle.entries === 'function') {
      for await (const [, child] of handle.entries()) files.push(...await collectFilesFromHandle(child, childPrefix));
    }
    return files;
  }

  function decodeText(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function findStoredZipEntry(bytes, expectedName) {
    if (!hasSignature(bytes, [80, 75, 3, 4])) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
      const compressionMethod = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const nameEnd = nameStart + fileNameLength;
      const dataStart = nameEnd + extraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > bytes.length) return null;
      const name = decodeText(bytes.subarray(nameStart, nameEnd));
      if (name === expectedName) {
        if (compressionMethod !== 0) return null;
        return bytes.subarray(dataStart, dataEnd);
      }
      offset = dataEnd;
    }
    return null;
  }

  function previewDataUrlFromValue(value) {
    const candidates = [
      value?.previewThumbnail,
      value?.manifest?.previewThumbnail,
      value?.project?.previewThumbnail
    ];
    return candidates.find((candidate) => (
      typeof candidate === 'string'
      && candidate.length <= 400000
      && /^data:image\/png;base64,/i.test(candidate)
    )) || '';
  }

  function pngBlobFromDataUrl(dataUrl) {
    const encoded = String(dataUrl || '').replace(/^data:image\/png;base64,/i, '');
    if (!encoded) return null;
    let binary = '';
    try { binary = atob(encoded); } catch (_error) { return null; }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!hasSignature(bytes, PNG_SIGNATURE)) return null;
    return new Blob([bytes], { type: 'image/png' });
  }

  async function extractPixieeDrawPreviewPng(file) {
    if (!file || typeof file.slice !== 'function') return null;
    const headerBytes = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
    let parsed = null;
    if (hasSignature(headerBytes, [80, 75, 3, 4])) {
      const manifestBytes = findStoredZipEntry(headerBytes, 'manifest.json');
      if (!manifestBytes) return null;
      try { parsed = JSON.parse(decodeText(manifestBytes)); } catch (_error) { return null; }
      if (!['pxd', 'pixieedraw'].includes(parsed?.format) || Number(parsed?.version) !== 2) return null;
    } else {
      try { parsed = JSON.parse(await file.text()); } catch (_error) { return null; }
    }
    return pngBlobFromDataUrl(previewDataUrlFromValue(parsed));
  }

  function greatestCommonDivisor(first, second) {
    let left = Math.abs(Math.floor(Number(first) || 0));
    let right = Math.abs(Math.floor(Number(second) || 0));
    while (right) {
      const remainder = left % right;
      left = right;
      right = remainder;
    }
    return left;
  }

  function getGifCodec() {
    if (gifCodec) return gifCodec;
    const factory = globalThis.PiXiEEDrawModules?.colorCodecUtils?.createColorCodecUtils;
    if (typeof factory !== 'function') throw new Error('GIF最適化機能を読み込めませんでした');
    gifCodec = factory({
      clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0)),
      MAX_IMPORTED_PALETTE_COLORS: 256,
    });
    if (typeof gifCodec.GifReader !== 'function' || typeof gifCodec.buildGifFromPixels !== 'function') {
      throw new Error('GIF最適化機能を初期化できませんでした');
    }
    return gifCodec;
  }

  function fillGifPixels(pixels, color) {
    if (!color) {
      pixels.fill(0);
      return;
    }
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = color.r;
      pixels[offset + 1] = color.g;
      pixels[offset + 2] = color.b;
      pixels[offset + 3] = color.a;
    }
  }

  function clearGifFrameRect(pixels, canvasWidth, canvasHeight, frameInfo, color) {
    const startX = Math.max(0, Math.floor(Number(frameInfo?.x) || 0));
    const startY = Math.max(0, Math.floor(Number(frameInfo?.y) || 0));
    const endX = Math.min(canvasWidth, startX + Math.max(0, Math.floor(Number(frameInfo?.width) || 0)));
    const endY = Math.min(canvasHeight, startY + Math.max(0, Math.floor(Number(frameInfo?.height) || 0)));
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const offset = ((y * canvasWidth) + x) * 4;
        pixels[offset] = color?.r || 0;
        pixels[offset + 1] = color?.g || 0;
        pixels[offset + 2] = color?.b || 0;
        pixels[offset + 3] = color?.a || 0;
      }
    }
  }

  function gifDisposalFillColor(frameInfo, backgroundColor, backgroundIndex) {
    const transparentIndex = Number.isInteger(frameInfo?.transparent_index) ? frameInfo.transparent_index : -1;
    if (!backgroundColor || (transparentIndex >= 0 && transparentIndex === backgroundIndex)) return null;
    return backgroundColor;
  }

  async function visitCompositedGifFrames(reader, width, height, frameCount, visitor, { yieldEvery = 0 } = {}) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    const restore = new Uint8ClampedArray(pixels.length);
    const backgroundColor = typeof reader.getBackgroundColor === 'function' ? reader.getBackgroundColor() : null;
    const backgroundIndex = typeof reader.getBackgroundIndex === 'function' ? reader.getBackgroundIndex() : null;
    fillGifPixels(pixels, backgroundColor?.a > 0 ? backgroundColor : null);
    let previous = null;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const info = reader.frameInfo(frameIndex);
      if (previous?.disposal === 2) {
        clearGifFrameRect(pixels, width, height, previous, gifDisposalFillColor(previous, backgroundColor, backgroundIndex));
      } else if (previous?.disposal === 3) {
        pixels.set(restore);
      }
      if (info.disposal === 3) restore.set(pixels);
      reader.decodeAndBlitFrameRGBA(frameIndex, pixels);
      const delayHundredths = Number(info.delay);
      visitor({
        pixels,
        frameIndex,
        duration: Number.isFinite(delayHundredths) && delayHundredths > 0
          ? delayHundredths * 10
          : DEFAULT_GIF_FRAME_DURATION,
      });
      previous = info;
      if (yieldEvery > 0 && (frameIndex + 1) % yieldEvery === 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      }
    }
  }

  function inspectNearestNeighborScale(pixels, width, height, factor) {
    const scale = Math.max(1, Math.floor(Number(factor) || 1));
    if (!(pixels instanceof Uint8ClampedArray) || scale <= 1 || width % scale || height % scale) {
      return { valid: false, hasInterBlockDifference: false };
    }
    let hasInterBlockDifference = false;
    const rowStride = width * 4;
    for (let blockY = 0; blockY < height; blockY += scale) {
      for (let blockX = 0; blockX < width; blockX += scale) {
        const blockBase = ((blockY * width) + blockX) * 4;
        const red = pixels[blockBase];
        const green = pixels[blockBase + 1];
        const blue = pixels[blockBase + 2];
        const alpha = pixels[blockBase + 3];
        if (!hasInterBlockDifference && blockX >= scale) {
          const leftBase = blockBase - (scale * 4);
          hasInterBlockDifference = pixels[leftBase] !== red
            || pixels[leftBase + 1] !== green
            || pixels[leftBase + 2] !== blue
            || pixels[leftBase + 3] !== alpha;
        }
        if (!hasInterBlockDifference && blockY >= scale) {
          const topBase = blockBase - (scale * rowStride);
          hasInterBlockDifference = pixels[topBase] !== red
            || pixels[topBase + 1] !== green
            || pixels[topBase + 2] !== blue
            || pixels[topBase + 3] !== alpha;
        }
        for (let localY = 0; localY < scale; localY += 1) {
          let pixelBase = (((blockY + localY) * width) + blockX) * 4;
          for (let localX = 0; localX < scale; localX += 1) {
            if (
              pixels[pixelBase] !== red
              || pixels[pixelBase + 1] !== green
              || pixels[pixelBase + 2] !== blue
              || pixels[pixelBase + 3] !== alpha
            ) {
              return { valid: false, hasInterBlockDifference: false };
            }
            pixelBase += 4;
          }
        }
      }
    }
    return { valid: true, hasInterBlockDifference };
  }

  function downscaleGifPixels(pixels, sourceWidth, sourceHeight, factor) {
    const width = Math.max(1, Math.floor(sourceWidth / factor));
    const height = Math.max(1, Math.floor(sourceHeight / factor));
    const output = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const sourceRow = (y * factor) * sourceWidth;
      const outputRow = y * width;
      for (let x = 0; x < width; x += 1) {
        const sourceBase = (sourceRow + (x * factor)) * 4;
        const outputBase = (outputRow + x) * 4;
        output[outputBase] = pixels[sourceBase];
        output[outputBase + 1] = pixels[sourceBase + 1];
        output[outputBase + 2] = pixels[sourceBase + 2];
        output[outputBase + 3] = pixels[sourceBase + 3];
      }
    }
    return output;
  }

  function equalPixelBuffers(first, second) {
    if (!(first instanceof Uint8ClampedArray) || !(second instanceof Uint8ClampedArray) || first.length !== second.length) return false;
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) return false;
    }
    return true;
  }

  async function optimizeGifIntegerScale(file, { onProgress } = {}) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('GIFファイルを読み込めませんでした');
    const codec = getGifCodec();
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    let reader;
    try {
      reader = new codec.GifReader(sourceBytes);
    } catch (error) {
      throw new Error('GIFファイルを解析できませんでした', { cause: error });
    }
    const sourceWidth = Math.max(0, Number(reader.width) || 0);
    const sourceHeight = Math.max(0, Number(reader.height) || 0);
    const frameCount = Math.max(0, Number(reader.numFrames()) || 0);
    const loopCount = typeof reader.loopCount === 'function' ? reader.loopCount() : null;
    if (!sourceWidth || !sourceHeight || !frameCount) throw new Error('GIFに有効なフレームがありません');
    if (frameCount > GIF_MAX_OPTIMIZE_FRAMES) throw new Error(`GIFのフレーム数が多すぎます（最大${GIF_MAX_OPTIMIZE_FRAMES}枚）`);

    let integerScaleFactor = greatestCommonDivisor(sourceWidth, sourceHeight);
    let hasInterBlockDifference = false;
    await visitCompositedGifFrames(reader, sourceWidth, sourceHeight, frameCount, ({ pixels, frameIndex }) => {
      if (integerScaleFactor > 1) {
        for (let y = 0; y < sourceHeight && integerScaleFactor > 1; y += 1) {
          for (let x = 0; x < sourceWidth && integerScaleFactor > 1; x += 1) {
            const base = ((y * sourceWidth) + x) * 4;
            if (x > 0) {
              const left = base - 4;
              if (
                pixels[base] !== pixels[left]
                || pixels[base + 1] !== pixels[left + 1]
                || pixels[base + 2] !== pixels[left + 2]
                || pixels[base + 3] !== pixels[left + 3]
              ) {
                hasInterBlockDifference = true;
                integerScaleFactor = greatestCommonDivisor(integerScaleFactor, x);
              }
            }
            if (y > 0 && integerScaleFactor > 1) {
              const top = base - (sourceWidth * 4);
              if (
                pixels[base] !== pixels[top]
                || pixels[base + 1] !== pixels[top + 1]
                || pixels[base + 2] !== pixels[top + 2]
                || pixels[base + 3] !== pixels[top + 3]
              ) {
                hasInterBlockDifference = true;
                integerScaleFactor = greatestCommonDivisor(integerScaleFactor, y);
              }
            }
          }
        }
      }
      onProgress?.({ phase: 'analyze', completed: frameIndex + 1, total: frameCount });
    }, { yieldEvery: 2 });
    if (!hasInterBlockDifference || integerScaleFactor <= 1) {
      return {
        file,
        optimized: false,
        reason: 'native-scale',
        sourceWidth,
        sourceHeight,
        width: sourceWidth,
        height: sourceHeight,
        integerScaleFactor: 1,
        frameCount,
        loopCount,
      };
    }

    const width = Math.max(1, Math.floor(sourceWidth / integerScaleFactor));
    const height = Math.max(1, Math.floor(sourceHeight / integerScaleFactor));
    const framePixels = [];
    const frameDurations = [];
    await visitCompositedGifFrames(reader, sourceWidth, sourceHeight, frameCount, ({ pixels, frameIndex, duration }) => {
      const inspection = inspectNearestNeighborScale(pixels, sourceWidth, sourceHeight, integerScaleFactor);
      if (!inspection.valid) throw new Error('GIFの整数倍構造を全フレームで確認できませんでした');
      framePixels.push(downscaleGifPixels(pixels, sourceWidth, sourceHeight, integerScaleFactor));
      frameDurations.push(duration);
      onProgress?.({ phase: 'encode', completed: frameIndex + 1, total: frameCount });
    }, { yieldEvery: 2 });

    const outputBytes = codec.buildGifFromPixels(framePixels, frameDurations, width, height, {
      loopCount,
      preserveTiming: true,
    });
    const outputReader = new codec.GifReader(outputBytes);
    const outputLoopCount = typeof outputReader.loopCount === 'function' ? outputReader.loopCount() : null;
    let verified = Number(outputReader.width) === width
      && Number(outputReader.height) === height
      && Number(outputReader.numFrames()) === frameCount
      && outputLoopCount === loopCount;
    if (verified) {
      await visitCompositedGifFrames(outputReader, width, height, frameCount, ({ pixels, frameIndex, duration }) => {
        if (!equalPixelBuffers(pixels, framePixels[frameIndex]) || duration !== frameDurations[frameIndex]) verified = false;
      }, { yieldEvery: 8 });
    }
    if (!verified) {
      return {
        file,
        optimized: false,
        reason: 'verification-failed',
        sourceWidth,
        sourceHeight,
        width: sourceWidth,
        height: sourceHeight,
        integerScaleFactor: 1,
        detectedIntegerScaleFactor: integerScaleFactor,
        frameCount,
        loopCount,
      };
    }

    const optimizedFile = new File([outputBytes], file.name, {
      type: 'image/gif',
      lastModified: Number(file.lastModified) || Date.now(),
    });
    return {
      file: optimizedFile,
      optimized: true,
      reason: 'integer-nearest-neighbor-downscale',
      sourceWidth,
      sourceHeight,
      width,
      height,
      integerScaleFactor,
      frameCount,
      loopCount,
      durationMs: frameDurations.reduce((total, duration) => total + duration, 0),
      sourceBytes: file.size,
      outputBytes: optimizedFile.size,
    };
  }

  return { detectFormat, collectFilesFromHandle, extractPixieeDrawPreviewPng, optimizeGifIntegerScale, readRasterDimensions };
});
