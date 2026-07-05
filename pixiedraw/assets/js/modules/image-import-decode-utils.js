(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createImageImportDecodeUtils({
    DEFAULT_IMPORT_FRAME_DURATION,
    IMPORT_INTEGER_SCALE_SAMPLE_GRID,
    MAX_IMPORTED_PALETTE_COLORS,
    clamp,
    createImageImportError,
    getImageImportCheckFrameIndexes,
    getGreatestCommonDivisor,
    quantizeRgbaColorEntriesWithMapping,
    normalizeColorValue,
    getPaletteColorKey,
    findNearestPaletteColorIndexByRgba,
    resolveTransparentStoragePaletteIndex,
    isGifFile,
    GifReader,
  } = {}) {

    function quickCheckImageDataNearestUpscale(imageData, factor) {
      if (!imageData || !(imageData.data instanceof Uint8ClampedArray)) {
        return false;
      }
      const width = Math.max(1, Math.floor(Number(imageData.width) || 0));
      const height = Math.max(1, Math.floor(Number(imageData.height) || 0));
      const scale = Math.max(1, Math.floor(Number(factor) || 1));
      if (scale <= 1 || width % scale !== 0 || height % scale !== 0) {
        return false;
      }
      const data = imageData.data;
      const sampleCols = Math.max(1, Math.min(IMPORT_INTEGER_SCALE_SAMPLE_GRID, Math.floor(width / scale)));
      const sampleRows = Math.max(1, Math.min(IMPORT_INTEGER_SCALE_SAMPLE_GRID, Math.floor(height / scale)));
      const stepX = width / sampleCols;
      const stepY = height / sampleRows;
      for (let row = 0; row < sampleRows; row += 1) {
        const sampleY = Math.min(height - 1, Math.floor((row + 0.5) * stepY));
        const blockY = Math.floor(sampleY / scale) * scale;
        for (let col = 0; col < sampleCols; col += 1) {
          const sampleX = Math.min(width - 1, Math.floor((col + 0.5) * stepX));
          const blockX = Math.floor(sampleX / scale) * scale;
          const sampleBase = (sampleY * width + sampleX) * 4;
          const blockBase = (blockY * width + blockX) * 4;
          if (
            data[sampleBase] !== data[blockBase]
            || data[sampleBase + 1] !== data[blockBase + 1]
            || data[sampleBase + 2] !== data[blockBase + 2]
            || data[sampleBase + 3] !== data[blockBase + 3]
          ) {
            return false;
          }
        }
      }
      return true;
    }
  
  
    function isImageDataNearestNeighborUpscaled(imageData, factor) {
      if (!imageData || !(imageData.data instanceof Uint8ClampedArray)) {
        return false;
      }
      const width = Math.max(1, Math.floor(Number(imageData.width) || 0));
      const height = Math.max(1, Math.floor(Number(imageData.height) || 0));
      const scale = Math.max(1, Math.floor(Number(factor) || 1));
      if (scale <= 1 || width % scale !== 0 || height % scale !== 0) {
        return false;
      }
      const data = imageData.data;
      let hasInterBlockDifference = false;
      const stride = width * 4;
      for (let blockY = 0; blockY < height; blockY += scale) {
        for (let blockX = 0; blockX < width; blockX += scale) {
          const blockBase = (blockY * width + blockX) * 4;
          const r = data[blockBase];
          const g = data[blockBase + 1];
          const b = data[blockBase + 2];
          const a = data[blockBase + 3];
          if (!hasInterBlockDifference) {
            if (blockX >= scale) {
              const leftBase = blockBase - (scale * 4);
              if (
                data[leftBase] !== r
                || data[leftBase + 1] !== g
                || data[leftBase + 2] !== b
                || data[leftBase + 3] !== a
              ) {
                hasInterBlockDifference = true;
              }
            }
            if (!hasInterBlockDifference && blockY >= scale) {
              const topBase = blockBase - (scale * stride);
              if (
                data[topBase] !== r
                || data[topBase + 1] !== g
                || data[topBase + 2] !== b
                || data[topBase + 3] !== a
              ) {
                hasInterBlockDifference = true;
              }
            }
          }
          for (let localY = 0; localY < scale; localY += 1) {
            let pixelBase = ((blockY + localY) * width + blockX) * 4;
            for (let localX = 0; localX < scale; localX += 1) {
              if (
                data[pixelBase] !== r
                || data[pixelBase + 1] !== g
                || data[pixelBase + 2] !== b
                || data[pixelBase + 3] !== a
              ) {
                return false;
              }
              pixelBase += 4;
            }
          }
        }
      }
      return hasInterBlockDifference;
    }
  
  
    function detectNearestNeighborIntegerScaleForFrames(frames, width, height) {
      if (!Array.isArray(frames) || !frames.length) {
        return 1;
      }
      const sourceWidth = Math.max(1, Math.floor(Number(width) || 0));
      const sourceHeight = Math.max(1, Math.floor(Number(height) || 0));
      const gcd = getGreatestCommonDivisor(sourceWidth, sourceHeight);
      if (gcd < 2) {
        return 1;
      }
      const frameIndexes = getImageImportCheckFrameIndexes(frames.length);
      if (!frameIndexes.length) {
        return 1;
      }
      for (let factor = gcd; factor >= 2; factor -= 1) {
        if (gcd % factor !== 0) {
          continue;
        }
        let quickValid = true;
        for (let i = 0; i < frameIndexes.length; i += 1) {
          const frameInfo = frames[frameIndexes[i]];
          const imageData = frameInfo?.imageData;
          if (!quickCheckImageDataNearestUpscale(imageData, factor)) {
            quickValid = false;
            break;
          }
        }
        if (!quickValid) {
          continue;
        }
        let fullValid = true;
        for (let i = 0; i < frameIndexes.length; i += 1) {
          const frameInfo = frames[frameIndexes[i]];
          const imageData = frameInfo?.imageData;
          if (!isImageDataNearestNeighborUpscaled(imageData, factor)) {
            fullValid = false;
            break;
          }
        }
        if (fullValid) {
          return factor;
        }
      }
      return 1;
    }
  
  
    function createImageDataFromPixels(pixels, width, height) {
      if (typeof ImageData === 'function') {
        try {
          return new ImageData(pixels, width, height);
        } catch (error) {
          // Fall through to canvas-based creation.
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d || typeof ctx2d.createImageData !== 'function') {
        throw createImageImportError('画像を処理できませんでした');
      }
      const imageData = ctx2d.createImageData(width, height);
      imageData.data.set(pixels);
      return imageData;
    }
  
  
    function resizeImageDataNearest(imageData, targetWidth, targetHeight) {
      if (!imageData || !Number.isFinite(imageData.width) || !Number.isFinite(imageData.height)) {
        throw createImageImportError('画像を処理できませんでした');
      }
      const sourceWidth = Math.max(1, Math.floor(imageData.width));
      const sourceHeight = Math.max(1, Math.floor(imageData.height));
      const width = Math.max(1, Math.floor(targetWidth));
      const height = Math.max(1, Math.floor(targetHeight));
      if (sourceWidth === width && sourceHeight === height) {
        return imageData;
      }
      const source = imageData.data instanceof Uint8ClampedArray ? imageData.data : null;
      if (!source || source.length < sourceWidth * sourceHeight * 4) {
        throw createImageImportError('画像を処理できませんでした');
      }
      const output = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        const srcY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height));
        const srcRow = srcY * sourceWidth;
        const dstRow = y * width;
        for (let x = 0; x < width; x += 1) {
          const srcX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width));
          const srcBase = (srcRow + srcX) * 4;
          const dstBase = (dstRow + x) * 4;
          output[dstBase] = source[srcBase];
          output[dstBase + 1] = source[srcBase + 1];
          output[dstBase + 2] = source[srcBase + 2];
          output[dstBase + 3] = source[srcBase + 3];
        }
      }
      return createImageDataFromPixels(output, width, height);
    }
  
  
    function resizeImportFrames(frames, targetWidth, targetHeight) {
      if (!Array.isArray(frames) || !frames.length) {
        return [];
      }
      return frames.map((frameInfo) => {
        const imageData = frameInfo?.imageData;
        if (!imageData || !Number.isFinite(imageData.width) || !Number.isFinite(imageData.height)) {
          return {
            ...frameInfo,
            imageData: null,
          };
        }
        const resized = resizeImageDataNearest(imageData, targetWidth, targetHeight);
        return {
          ...frameInfo,
          imageData: resized,
        };
      });
    }
  
  
    function buildIndexedPaletteFromFrameDataList(frameDataList, maxColors = MAX_IMPORTED_PALETTE_COLORS) {
      const frames = Array.isArray(frameDataList) ? frameDataList : [];
      const normalizedMaxColors = clamp(
        Math.round(Number(maxColors) || MAX_IMPORTED_PALETTE_COLORS),
        1,
        MAX_IMPORTED_PALETTE_COLORS
      );
      const orderedColors = [];
      const colorCounts = new Map();
      for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const data = frames[frameIndex];
        if (!(data instanceof Uint8ClampedArray)) {
          continue;
        }
        const pixelCount = Math.floor(data.length / 4);
        for (let i = 0; i < pixelCount; i += 1) {
          const base = i * 4;
          const a = data[base + 3];
          if (a === 0) {
            continue;
          }
          const r = data[base];
          const g = data[base + 1];
          const b = data[base + 2];
          const key = `${r},${g},${b},${a}`;
          const existing = colorCounts.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            const entry = { r, g, b, a, count: 1 };
            colorCounts.set(key, entry);
            orderedColors.push(entry);
          }
        }
      }
      const sourceColorCount = orderedColors.length;
      const quantized = sourceColorCount <= normalizedMaxColors
        ? null
        : quantizeRgbaColorEntriesWithMapping(orderedColors, normalizedMaxColors);
      let palette = quantized
        ? quantized.palette
        : orderedColors.map(color => normalizeColorValue(color));
      if (!palette.length) {
        palette = [{ r: 0, g: 0, b: 0, a: 0 }];
      }
      const dedupedPalette = [];
      const dedupedLookup = new Map();
      const paletteIndexRemap = [];
      palette.forEach((color, paletteIndex) => {
        const normalized = normalizeColorValue(color);
        const key = getPaletteColorKey(normalized);
        let dedupedIndex = dedupedLookup.get(key);
        if (!Number.isInteger(dedupedIndex) || dedupedIndex < 0) {
          dedupedIndex = dedupedPalette.length;
          dedupedLookup.set(key, dedupedIndex);
          dedupedPalette.push(normalized);
        }
        paletteIndexRemap[paletteIndex] = dedupedIndex;
      });
      palette = dedupedPalette.length ? dedupedPalette : [{ r: 0, g: 0, b: 0, a: 0 }];
      const colorMap = new Map();
      orderedColors.forEach((entry, sourceIndex) => {
        const key = getPaletteColorKey(entry);
        const exactIndex = dedupedLookup.get(key);
        if (Number.isInteger(exactIndex) && exactIndex >= 0) {
          colorMap.set(key, exactIndex);
          return;
        }
        const mappedIndex = quantized?.sourceIndexToPaletteIndex?.[sourceIndex];
        if (Number.isInteger(mappedIndex) && mappedIndex >= 0 && mappedIndex < palette.length) {
          const remappedIndex = paletteIndexRemap[mappedIndex];
          colorMap.set(key, Number.isInteger(remappedIndex) && remappedIndex >= 0 ? remappedIndex : mappedIndex);
          return;
        }
        colorMap.set(key, findNearestPaletteColorIndexByRgba(entry, palette, 0));
      });
  
      const frameIndices = frames.map((data) => {
        if (!(data instanceof Uint8ClampedArray)) {
          return new Int16Array(0);
        }
        const pixelCount = Math.floor(data.length / 4);
        const indices = new Int16Array(pixelCount).fill(resolveTransparentStoragePaletteIndex(palette));
        for (let i = 0; i < pixelCount; i += 1) {
          const base = i * 4;
          const a = data[base + 3];
          if (a === 0) {
            continue;
          }
          const r = data[base];
          const g = data[base + 1];
          const b = data[base + 2];
          const key = `${r},${g},${b},${a}`;
          const paletteIndex = colorMap.get(key);
          if (paletteIndex !== undefined) {
            indices[i] = paletteIndex;
          }
        }
        return indices;
      });
  
      return {
        palette,
        frameIndices,
        overflow: false,
        reduced: sourceColorCount > palette.length,
        sourceColorCount,
      };
    }
  
  
    async function decodeImageFileToFrames(file) {
      if (isGifFile(file)) {
        return await decodeGifFileToFrames(file);
      }
      const imageData = await decodeImageFileToImageData(file);
      if (!imageData) {
        throw createImageImportError('画像を読み込めませんでした');
      }
      return {
        width: imageData.width,
        height: imageData.height,
        frames: [
          {
            imageData,
            duration: DEFAULT_IMPORT_FRAME_DURATION,
          },
        ],
      };
    }
  
  
    async function decodeGifFileToFrames(file) {
      if (!file) {
        throw createImageImportError('ファイルが選択されていません');
      }
      let buffer;
      try {
        buffer = await file.arrayBuffer();
      } catch (error) {
        throw createImageImportError('画像を読み込めませんでした', error);
      }
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
        throw createImageImportError('画像を読み込めませんでした');
      }
  
      const bytes = new Uint8Array(buffer);
      return decodeGifWithReader(bytes);
    }
  
  
    async function decodeGifWithImageDecoder(buffer, mimeType) {
      let decoder;
      try {
        decoder = new ImageDecoder({ data: buffer, type: mimeType });
      } catch (error) {
        throw createImageImportError('画像を読み込めませんでした', error);
      }
      try {
        const track = decoder.tracks?.selectedTrack ?? decoder.tracks?.[0] ?? null;
        const frameCount = Number(track?.frameCount);
        const total = Number.isFinite(frameCount) && frameCount > 0 ? frameCount : 1;
        const frames = [];
        for (let i = 0; i < total; i += 1) {
          const result = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
          const bitmap = result?.image;
          const imageData = imageBitmapToImageData(bitmap);
          if (bitmap && typeof bitmap.close === 'function') {
            bitmap.close();
          }
          const durationSeconds = Number(result?.duration);
          frames.push({
            imageData,
            duration: Number.isFinite(durationSeconds) && durationSeconds > 0
              ? durationSeconds * 1000
              : DEFAULT_IMPORT_FRAME_DURATION,
          });
        }
        const width = frames[0]?.imageData?.width ?? 0;
        const height = frames[0]?.imageData?.height ?? 0;
        if (!frames.length || !width || !height) {
          throw new Error('GIF decode returned no frames');
        }
        return {
          frames,
          width,
          height,
          loopCount: typeof track?.repetitionCount === 'number' ? track.repetitionCount : null,
        };
      } catch (error) {
        throw createImageImportError('画像を読み込めませんでした', error);
      } finally {
        if (decoder && typeof decoder.close === 'function') {
          decoder.close();
        }
      }
    }
  
  
    function decodeGifWithReader(bytes) {
      if (!(bytes instanceof Uint8Array)) {
        bytes = new Uint8Array(bytes);
      }
      let reader;
      try {
        reader = new GifReader(bytes);
      } catch (error) {
        throw createImageImportError('画像を読み込めませんでした', error);
      }
      const width = Number(reader.width);
      const height = Number(reader.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw createImageImportError('画像サイズが不正です');
      }
      const frameCount = Number(reader.numFrames());
      if (!Number.isFinite(frameCount) || frameCount <= 0) {
        throw createImageImportError('GIFにフレームが含まれていません');
      }
      const pixels = new Uint8ClampedArray(width * height * 4);
      const restoreBuffer = new Uint8ClampedArray(pixels.length);
      const backgroundColor = typeof reader.getBackgroundColor === 'function' ? reader.getBackgroundColor() : null;
      const backgroundIndex = typeof reader.getBackgroundIndex === 'function' ? reader.getBackgroundIndex() : null;
      const frames = [];
      let previousFrameInfo = null;
  
      if (backgroundColor && backgroundColor.a > 0) {
        fillGifCanvas(pixels, backgroundColor);
      } else {
        pixels.fill(0);
      }
  
      for (let i = 0; i < frameCount; i += 1) {
        const info = reader.frameInfo(i);
  
        if (previousFrameInfo) {
          if (previousFrameInfo.disposal === 2) {
            const fillColor = resolveDisposalFillColor(previousFrameInfo, backgroundColor, backgroundIndex);
            clearGifFrameRect(pixels, width, height, previousFrameInfo, fillColor);
          } else if (previousFrameInfo.disposal === 3) {
            pixels.set(restoreBuffer);
          }
        }
  
        if (info.disposal === 3) {
          restoreBuffer.set(pixels);
        }
  
        reader.decodeAndBlitFrameRGBA(i, pixels);
        const framePixels = new Uint8ClampedArray(pixels);
        const delayHundredths = Number(info.delay);
        frames.push({
          imageData: new ImageData(framePixels, width, height),
          duration: Number.isFinite(delayHundredths) && delayHundredths > 0
            ? delayHundredths * 10
            : DEFAULT_IMPORT_FRAME_DURATION,
        });
  
        previousFrameInfo = info;
      }
  
      return {
        frames,
        width,
        height,
        loopCount: typeof reader.loopCount === 'function' ? reader.loopCount() : null,
      };
    }
  
  
    function fillGifCanvas(pixels, color) {
      if (!color) {
        pixels.fill(0);
        return;
      }
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = color.r;
        pixels[i + 1] = color.g;
        pixels[i + 2] = color.b;
        pixels[i + 3] = color.a;
      }
    }
  
  
    function resolveDisposalFillColor(frameInfo, backgroundColor, backgroundIndex) {
      if (!backgroundColor) {
        return null;
      }
      const transparentIndex = typeof frameInfo?.transparent_index === 'number' ? frameInfo.transparent_index : null;
      if (transparentIndex !== null && transparentIndex >= 0) {
        if (typeof backgroundIndex === 'number' && backgroundIndex === transparentIndex) {
          return null;
        }
      }
      return backgroundColor;
    }
  
  
    function clearGifFrameRect(pixels, width, height, frame, fillColor = null) {
      const rawX = Number(frame.x);
      const rawY = Number(frame.y);
      const rawW = Number(frame.width);
      const rawH = Number(frame.height);
      const x = clamp(Number.isFinite(rawX) ? rawX : 0, 0, width);
      const y = clamp(Number.isFinite(rawY) ? rawY : 0, 0, height);
      const availableW = width - x;
      const availableH = height - y;
      const w = clamp(Number.isFinite(rawW) ? rawW : availableW, 0, availableW);
      const h = clamp(Number.isFinite(rawH) ? rawH : availableH, 0, availableH);
      if (w === 0 || h === 0) {
        return;
      }
      for (let row = 0; row < h; row += 1) {
        const offset = ((y + row) * width + x) * 4;
        if (!fillColor) {
          pixels.fill(0, offset, offset + w * 4);
        } else {
          let cursor = offset;
          for (let col = 0; col < w; col += 1) {
            pixels[cursor] = fillColor.r;
            pixels[cursor + 1] = fillColor.g;
            pixels[cursor + 2] = fillColor.b;
            pixels[cursor + 3] = fillColor.a;
            cursor += 4;
          }
        }
      }
    }
  
  
    async function decodeImageFileToImageData(file) {
      if (!file) {
        throw createImageImportError('ファイルが選択されていません');
      }
      if (typeof createImageBitmap === 'function') {
        try {
          const bitmap = await createImageBitmap(file);
          try {
            return imageBitmapToImageData(bitmap);
          } finally {
            if (typeof bitmap.close === 'function') {
              bitmap.close();
            }
          }
        } catch (error) {
          console.warn('createImageBitmap failed, falling back to Image', error);
        }
      }
      return await imageElementToImageData(file);
    }
  
  
    function imageBitmapToImageData(bitmap) {
      if (!bitmap || !bitmap.width || !bitmap.height) {
        throw createImageImportError('画像サイズが不正です');
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw createImageImportError('画像を処理できませんでした');
      }
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  
  
    function imageElementToImageData(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          try {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            if (!width || !height) {
              throw createImageImportError('画像サイズが不正です');
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw createImageImportError('画像を処理できませんでした');
            }
            ctx.drawImage(image, 0, 0);
            const data = ctx.getImageData(0, 0, width, height);
            resolve(data);
          } catch (error) {
            reject(createImageImportError('画像を処理できませんでした', error));
          } finally {
            URL.revokeObjectURL(url);
          }
        };
        image.onerror = event => {
          URL.revokeObjectURL(url);
          reject(createImageImportError('画像の読み込みに失敗しました'));
        };
        image.src = url;
      });
    }
  
  
    return {
      quickCheckImageDataNearestUpscale,
      isImageDataNearestNeighborUpscaled,
      detectNearestNeighborIntegerScaleForFrames,
      createImageDataFromPixels,
      resizeImageDataNearest,
      resizeImportFrames,
      buildIndexedPaletteFromFrameDataList,
      decodeImageFileToFrames,
      decodeGifFileToFrames,
      decodeGifWithImageDecoder,
      decodeGifWithReader,
      fillGifCanvas,
      resolveDisposalFillColor,
      clearGifFrameRect,
      decodeImageFileToImageData,
      imageBitmapToImageData,
      imageElementToImageData,
    };
  }

  root.imageImportDecodeUtils = {
    createImageImportDecodeUtils,
  };
})();
