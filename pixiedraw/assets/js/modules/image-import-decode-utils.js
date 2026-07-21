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

    const integerScaleSampleGrid = Math.max(1, Math.floor(Number(IMPORT_INTEGER_SCALE_SAMPLE_GRID) || 8));
    const resolveImageImportCheckFrameIndexes = typeof getImageImportCheckFrameIndexes === 'function'
      ? getImageImportCheckFrameIndexes
      : (frameCount) => {
          const count = Math.max(0, Math.floor(Number(frameCount) || 0));
          return count ? Array.from(new Set([0, Math.floor((count - 1) / 2), count - 1])) : [];
        };
    const resolveGreatestCommonDivisor = typeof getGreatestCommonDivisor === 'function'
      ? getGreatestCommonDivisor
      : (first, second) => {
          let left = Math.abs(Math.floor(Number(first) || 0));
          let right = Math.abs(Math.floor(Number(second) || 0));
          while (right) {
            const remainder = left % right;
            left = right;
            right = remainder;
          }
          return left;
        };

    function areRgbaPixelsVisuallyEqual(data, firstBase, secondBase) {
      const firstAlpha = data[firstBase + 3];
      const secondAlpha = data[secondBase + 3];
      if (firstAlpha === 0 && secondAlpha === 0) {
        return true;
      }
      return (
        data[firstBase] === data[secondBase]
        && data[firstBase + 1] === data[secondBase + 1]
        && data[firstBase + 2] === data[secondBase + 2]
        && firstAlpha === secondAlpha
      );
    }

    function packExactRgbaColor(data, base) {
      return (
        (data[base] * 0x1000000)
        + (data[base + 1] * 0x10000)
        + (data[base + 2] * 0x100)
        + data[base + 3]
      ) >>> 0;
    }

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
      const sampleCols = Math.max(1, Math.min(integerScaleSampleGrid, Math.floor(width / scale)));
      const sampleRows = Math.max(1, Math.min(integerScaleSampleGrid, Math.floor(height / scale)));
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
          if (!areRgbaPixelsVisuallyEqual(data, sampleBase, blockBase)) {
            return false;
          }
        }
      }
      return true;
    }
  
  
    function inspectImageDataNearestNeighborUpscale(imageData, factor) {
      if (!imageData || !(imageData.data instanceof Uint8ClampedArray)) {
        return { valid: false, hasInterBlockDifference: false };
      }
      const width = Math.max(1, Math.floor(Number(imageData.width) || 0));
      const height = Math.max(1, Math.floor(Number(imageData.height) || 0));
      const scale = Math.max(1, Math.floor(Number(factor) || 1));
      if (scale <= 1 || width % scale !== 0 || height % scale !== 0) {
        return { valid: false, hasInterBlockDifference: false };
      }
      const data = imageData.data;
      let hasInterBlockDifference = false;
      const stride = width * 4;
      for (let blockY = 0; blockY < height; blockY += scale) {
        for (let blockX = 0; blockX < width; blockX += scale) {
          const blockBase = (blockY * width + blockX) * 4;
          if (!hasInterBlockDifference) {
            if (blockX >= scale) {
              const leftBase = blockBase - (scale * 4);
              if (!areRgbaPixelsVisuallyEqual(data, leftBase, blockBase)) {
                hasInterBlockDifference = true;
              }
            }
            if (!hasInterBlockDifference && blockY >= scale) {
              const topBase = blockBase - (scale * stride);
              if (!areRgbaPixelsVisuallyEqual(data, topBase, blockBase)) {
                hasInterBlockDifference = true;
              }
            }
          }
          for (let localY = 0; localY < scale; localY += 1) {
            let pixelBase = ((blockY + localY) * width + blockX) * 4;
            for (let localX = 0; localX < scale; localX += 1) {
              if (!areRgbaPixelsVisuallyEqual(data, pixelBase, blockBase)) {
                return { valid: false, hasInterBlockDifference: false };
              }
              pixelBase += 4;
            }
          }
        }
      }
      return { valid: true, hasInterBlockDifference };
    }


    function isImageDataNearestNeighborUpscaled(imageData, factor) {
      const inspection = inspectImageDataNearestNeighborUpscale(imageData, factor);
      return inspection.valid && inspection.hasInterBlockDifference;
    }
  
  
    function detectNearestNeighborIntegerScaleForFrames(frames, width, height) {
      if (!Array.isArray(frames) || !frames.length) {
        return 1;
      }
      const sourceWidth = Math.max(1, Math.floor(Number(width) || 0));
      const sourceHeight = Math.max(1, Math.floor(Number(height) || 0));
      const gcd = resolveGreatestCommonDivisor(sourceWidth, sourceHeight);
      if (gcd < 2) {
        return 1;
      }
      const frameIndexes = resolveImageImportCheckFrameIndexes(frames.length);
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
        let hasInterBlockDifference = false;
        for (let i = 0; i < frameIndexes.length; i += 1) {
          const frameInfo = frames[frameIndexes[i]];
          const imageData = frameInfo?.imageData;
          const inspection = inspectImageDataNearestNeighborUpscale(imageData, factor);
          if (!inspection.valid) {
            fullValid = false;
            break;
          }
          hasInterBlockDifference ||= inspection.hasInterBlockDifference;
        }
        if (fullValid && hasInterBlockDifference) {
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


    function createIntegerDownscaledImageDataFromPixels(pixels, sourceWidth, sourceHeight, factor) {
      const scale = Math.max(1, Math.floor(Number(factor) || 1));
      const width = Math.max(1, Math.floor(sourceWidth / scale));
      const height = Math.max(1, Math.floor(sourceHeight / scale));
      if (scale <= 1) {
        return createImageDataFromPixels(new Uint8ClampedArray(pixels), sourceWidth, sourceHeight);
      }
      const output = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        const sourceRow = (y * scale) * sourceWidth;
        const outputRow = y * width;
        for (let x = 0; x < width; x += 1) {
          const sourceBase = (sourceRow + (x * scale)) * 4;
          const outputBase = (outputRow + x) * 4;
          output[outputBase] = pixels[sourceBase];
          output[outputBase + 1] = pixels[sourceBase + 1];
          output[outputBase + 2] = pixels[sourceBase + 2];
          output[outputBase + 3] = pixels[sourceBase + 3];
        }
      }
      return createImageDataFromPixels(output, width, height);
    }


    function detectGifCommonIntegerScale(reader, width, height, frameCount) {
      let commonFactor = resolveGreatestCommonDivisor(width, height);
      let hasInterBlockDifference = false;
      visitGifCompositedFrames(reader, width, height, frameCount, ({ pixels }) => {
        if (commonFactor <= 1) return false;
        for (let y = 0; y < height && commonFactor > 1; y += 1) {
          for (let x = 0; x < width && commonFactor > 1; x += 1) {
            const base = ((y * width) + x) * 4;
            if (x > 0) {
              const left = base - 4;
              if (!areRgbaPixelsVisuallyEqual(pixels, base, left)) {
                hasInterBlockDifference = true;
                commonFactor = resolveGreatestCommonDivisor(commonFactor, x);
              }
            }
            if (y > 0 && commonFactor > 1) {
              const top = base - (width * 4);
              if (!areRgbaPixelsVisuallyEqual(pixels, base, top)) {
                hasInterBlockDifference = true;
                commonFactor = resolveGreatestCommonDivisor(commonFactor, y);
              }
            }
          }
        }
        // Once this reaches one, no later frame can restore an integer scale.
        // Stop the preflight pass here; the actual import pass below still
        // decodes every frame and preserves the full GIF exactly.
        return commonFactor > 1;
      });
      return hasInterBlockDifference ? Math.max(1, commonFactor) : 1;
    }


    function visitGifCompositedFrames(reader, width, height, frameCount, visitor) {
      const pixels = new Uint8ClampedArray(width * height * 4);
      const restoreBuffer = new Uint8ClampedArray(pixels.length);
      const backgroundColor = typeof reader.getBackgroundColor === 'function' ? reader.getBackgroundColor() : null;
      const backgroundIndex = typeof reader.getBackgroundIndex === 'function' ? reader.getBackgroundIndex() : null;
      let previousFrameInfo = null;

      if (backgroundColor && backgroundColor.a > 0) {
        fillGifCanvas(pixels, backgroundColor);
      } else {
        pixels.fill(0);
      }

      for (let index = 0; index < frameCount; index += 1) {
        const info = reader.frameInfo(index);
        if (previousFrameInfo) {
          if (previousFrameInfo.disposal === 2) {
            const fillColor = resolveDisposalFillColor(previousFrameInfo, backgroundColor, backgroundIndex);
            clearGifFrameRect(pixels, width, height, previousFrameInfo, fillColor);
          } else if (previousFrameInfo.disposal === 3) {
            pixels.set(restoreBuffer);
          }
        }
        if (info.disposal === 3) restoreBuffer.set(pixels);
        reader.decodeAndBlitFrameRGBA(index, pixels);
        const delayHundredths = Number(info.delay);
        const shouldContinue = visitor({
          index,
          pixels,
          duration: Number.isFinite(delayHundredths) && delayHundredths > 0
            ? delayHundredths * 10
            : DEFAULT_IMPORT_FRAME_DURATION,
        });
        previousFrameInfo = info;
        if (shouldContinue === false) break;
      }
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
      const resizedFrames = new Array(frames.length);
      for (let index = 0; index < frames.length; index += 1) {
        let sourceFrame = frames[index];
        let resizedFrame = null;
        try {
          const sourceImageData = sourceFrame?.imageData;
          if (!sourceImageData || !Number.isFinite(sourceImageData.width) || !Number.isFinite(sourceImageData.height)) {
            resizedFrame = {
              ...sourceFrame,
              imageData: null,
            };
          } else {
            const resizedImageData = resizeImageDataNearest(sourceImageData, targetWidth, targetHeight);
            const sourcePixels = sourceImageData.data;
            const resizedPixels = resizedImageData?.data;
            const dimensionsChanged = sourceImageData.width !== resizedImageData?.width
              || sourceImageData.height !== resizedImageData?.height;
            const viewsOverlap = (
              sourcePixels instanceof Uint8ClampedArray
              && resizedPixels instanceof Uint8ClampedArray
              && sourcePixels.buffer === resizedPixels.buffer
              && sourcePixels.byteOffset < resizedPixels.byteOffset + resizedPixels.byteLength
              && resizedPixels.byteOffset < sourcePixels.byteOffset + sourcePixels.byteLength
            );
            if (
              dimensionsChanged
              && viewsOverlap
            ) {
              throw createImageImportError('画像の縮小処理で元データを共有しています');
            }
            resizedFrame = {
              ...sourceFrame,
              imageData: resizedImageData,
            };
          }
          resizedFrames[index] = resizedFrame;
          resizedFrame = null;
        } finally {
          // `resizedFrames` owns the converted ImageData. Once it has been
          // transferred, retain neither the original ImageData nor its RGBA
          // buffer through the decoder result array.
          if (sourceFrame && typeof sourceFrame === 'object') {
            sourceFrame.imageData = null;
          }
          frames[index] = null;
          sourceFrame = null;
          resizedFrame = null;
        }
      }
      return resizedFrames;
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


    function buildExactIndexedPaletteFromImageFrames(frameDataList, maxColors = MAX_IMPORTED_PALETTE_COLORS) {
      const frames = Array.isArray(frameDataList) ? frameDataList : [];
      const normalizedMaxColors = clamp(
        Math.round(Number(maxColors) || MAX_IMPORTED_PALETTE_COLORS),
        1,
        MAX_IMPORTED_PALETTE_COLORS
      );
      const palette = [{ r: 0, g: 0, b: 0, a: 0 }];
      const colorToIndex = new Map();
      for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const data = frames[frameIndex]?.imageData?.data;
        if (!(data instanceof Uint8ClampedArray)) {
          return null;
        }
        for (let base = 0; base + 3 < data.length; base += 4) {
          if (data[base + 3] === 0) {
            continue;
          }
          const key = packExactRgbaColor(data, base);
          if (colorToIndex.has(key)) {
            continue;
          }
          if (palette.length >= normalizedMaxColors) {
            return null;
          }
          const paletteIndex = palette.length;
          colorToIndex.set(key, paletteIndex);
          palette.push({
            r: data[base],
            g: data[base + 1],
            b: data[base + 2],
            a: data[base + 3],
          });
        }
      }
      if (palette.length === 1) {
        // Runtime index 0 is reserved for transparency. Keep one opaque color
        // available so a completely transparent import can be drawn on.
        palette.push({ r: 0, g: 0, b: 0, a: 255 });
      }
      return {
        palette,
        colorToIndex,
        sourceColorCount: colorToIndex.size,
      };
    }


    function writeExactIndexedPixelsFromRgba(data, indices, colorToIndex) {
      if (
        !(data instanceof Uint8ClampedArray)
        || !(indices instanceof Int16Array || indices instanceof Uint8Array)
        || !(colorToIndex instanceof Map)
      ) {
        return false;
      }
      const pixelCount = Math.min(indices.length, Math.floor(data.length / 4));
      indices.fill(indices instanceof Uint8Array ? 0 : -1);
      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const base = pixelIndex * 4;
        if (data[base + 3] === 0) {
          continue;
        }
        const paletteIndex = colorToIndex.get(packExactRgbaColor(data, base));
        if (!Number.isInteger(paletteIndex) || paletteIndex < 0) {
          return false;
        }
        indices[pixelIndex] = paletteIndex;
      }
      return true;
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
      const integerScaleFactor = detectGifCommonIntegerScale(reader, width, height, frameCount);

      const targetWidth = Math.max(1, Math.floor(width / integerScaleFactor));
      const targetHeight = Math.max(1, Math.floor(height / integerScaleFactor));
      const frames = [];
      visitGifCompositedFrames(reader, width, height, frameCount, ({ pixels, duration }) => {
        if (integerScaleFactor > 1) {
          const inspection = inspectImageDataNearestNeighborUpscale(
            { data: pixels, width, height },
            integerScaleFactor
          );
          if (!inspection.valid) throw createImageImportError('GIFの整数倍構造を全フレームで確認できませんでした');
        }
        frames.push({
          imageData: createIntegerDownscaledImageDataFromPixels(
            pixels,
            width,
            height,
            integerScaleFactor
          ),
          duration,
        });
      });

      return {
        frames,
        width: targetWidth,
        height: targetHeight,
        sourceWidth: width,
        sourceHeight: height,
        integerScaleFactor,
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
      buildExactIndexedPaletteFromImageFrames,
      writeExactIndexedPixelsFromRgba,
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
