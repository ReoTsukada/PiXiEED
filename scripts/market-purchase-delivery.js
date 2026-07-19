(function () {
  'use strict';

  const TRANSFER_DB = 'pixieed-market-import-v1';
  const TRANSFER_STORE = 'imports';
  const ZIP32_MAX_BYTES = 0xFFFFFFFF;
  const ZIP_CRC_YIELD_BYTES = 2 * 1024 * 1024;
  const GIF_MAX_FRAMES = 1000;
  const GIF_MAX_SPRITE_PIXELS = 32 * 1024 * 1024;
  const GIF_MAX_CANVAS_EDGE = 16384;
  let crcTable = null;
  let gifReaderConstructor = null;

  function normalizePath(value, fallback = 'asset.bin') {
    const parts = String(value || '')
      .replaceAll('\\', '/')
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .map((part) => part.normalize('NFC').replace(/[\u0000-\u001f:*?"<>|]/g, '_').slice(0, 120));
    return parts.join('/') || fallback;
  }

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) crc = table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function yieldToBrowser() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function crc32Blob(blob, onProgress) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    let processed = 0;
    let yieldedAt = 0;
    const update = async (bytes) => {
      for (let offset = 0; offset < bytes.length; offset += ZIP_CRC_YIELD_BYTES) {
        const end = Math.min(bytes.length, offset + ZIP_CRC_YIELD_BYTES);
        for (let index = offset; index < end; index += 1) {
          crc = table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
        }
        processed += end - offset;
        onProgress?.(processed, blob.size);
        if (processed - yieldedAt >= ZIP_CRC_YIELD_BYTES) {
          yieldedAt = processed;
          await yieldToBrowser();
        }
      }
    };
    if (typeof blob.stream === 'function') {
      const reader = blob.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) await update(value);
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      for (let offset = 0; offset < blob.size; offset += ZIP_CRC_YIELD_BYTES) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + ZIP_CRC_YIELD_BYTES).arrayBuffer());
        await update(bytes);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1F),
      date: (((year - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F)
    };
  }

  async function buildZipBlob(tasks, onProgress) {
    if (!Array.isArray(tasks) || !tasks.length) throw new Error('ZIPに入れるファイルがありません。');
    if (tasks.length > 65535) throw new Error('ZIPのファイル数が多すぎます。');
    const encoder = new TextEncoder();
    const timestamp = dosDateTime();
    const localParts = [];
    const centralParts = [];
    let localSize = 0;
    const totalBytes = tasks.reduce((sum, task) => sum + Math.max(0, Number(task?.blob?.size) || 0), 0);
    let completedBytes = 0;
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const filename = normalizePath(task.filename, `asset-${index + 1}.bin`);
      const filenameBytes = encoder.encode(filename);
      const blob = task.blob instanceof Blob ? task.blob : new Blob([task.blob]);
      if (blob.size > ZIP32_MAX_BYTES) throw new Error(`${filename}はZIP出力できるサイズを超えています。`);
      const checksum = await crc32Blob(blob, (fileBytes) => onProgress?.({
        phase: 'checksum',
        fileIndex: index + 1,
        fileCount: tasks.length,
        filename,
        processedBytes: completedBytes + fileBytes,
        totalBytes,
      }));
      const local = new Uint8Array(30 + filenameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034B50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, timestamp.time, true);
      localView.setUint16(12, timestamp.date, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, blob.size, true);
      localView.setUint32(22, blob.size, true);
      localView.setUint16(26, filenameBytes.length, true);
      local.set(filenameBytes, 30);
      localParts.push(local, blob);

      const central = new Uint8Array(46 + filenameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014B50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, timestamp.time, true);
      centralView.setUint16(14, timestamp.date, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, blob.size, true);
      centralView.setUint32(24, blob.size, true);
      centralView.setUint16(28, filenameBytes.length, true);
      centralView.setUint32(42, localSize, true);
      central.set(filenameBytes, 46);
      centralParts.push(central);
      localSize += local.length + blob.size;
      if (localSize > ZIP32_MAX_BYTES) throw new Error('ZIP全体のサイズが大きすぎます。商品を形式ごとに分けて出力してください。');
      completedBytes += blob.size;
      onProgress?.({ phase: 'file-complete', fileIndex: index + 1, fileCount: tasks.length, filename, processedBytes: completedBytes, totalBytes });
      await yieldToBrowser();
    }
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054B50, true);
    endView.setUint16(8, tasks.length, true);
    endView.setUint16(10, tasks.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, localSize, true);
    onProgress?.({ phase: 'finalize', fileIndex: tasks.length, fileCount: tasks.length, processedBytes: totalBytes, totalBytes });
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  function getGifReaderConstructor() {
    if (gifReaderConstructor) return gifReaderConstructor;
    const factory = window.PiXiEEDrawModules?.colorCodecUtils?.createColorCodecUtils;
    if (typeof factory !== 'function') throw new Error('GIF変換機能を読み込めませんでした。ページを再読み込みしてください。');
    const codec = factory({
      clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0)),
      MAX_IMPORTED_PALETTE_COLORS: 256,
    });
    if (typeof codec?.GifReader !== 'function') throw new Error('GIF変換機能を初期化できませんでした。');
    gifReaderConstructor = codec.GifReader;
    return gifReaderConstructor;
  }

  function fillPixels(pixels, color) {
    if (!color) {
      pixels.fill(0);
      return;
    }
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = color.r;
      pixels[index + 1] = color.g;
      pixels[index + 2] = color.b;
      pixels[index + 3] = color.a;
    }
  }

  function clearGifRect(pixels, canvasWidth, canvasHeight, frameInfo, color) {
    const startX = Math.max(0, Math.floor(Number(frameInfo?.x) || 0));
    const startY = Math.max(0, Math.floor(Number(frameInfo?.y) || 0));
    const endX = Math.min(canvasWidth, startX + Math.max(0, Math.floor(Number(frameInfo?.width) || 0)));
    const endY = Math.min(canvasHeight, startY + Math.max(0, Math.floor(Number(frameInfo?.height) || 0)));
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const offset = (y * canvasWidth + x) * 4;
        pixels[offset] = color?.r || 0;
        pixels[offset + 1] = color?.g || 0;
        pixels[offset + 2] = color?.b || 0;
        pixels[offset + 3] = color?.a || 0;
      }
    }
  }

  function disposalFillColor(frameInfo, backgroundColor, backgroundIndex) {
    const transparentIndex = Number.isInteger(frameInfo?.transparent_index) ? frameInfo.transparent_index : -1;
    if (!backgroundColor || (transparentIndex >= 0 && transparentIndex === backgroundIndex)) return null;
    return backgroundColor;
  }

  function createCanvas(width, height, label) {
    if (width <= 0 || height <= 0 || width > GIF_MAX_CANVAS_EDGE || height > GIF_MAX_CANVAS_EDGE) {
      throw new Error(`${label}の画像サイズが大きすぎます（最大${GIF_MAX_CANVAS_EDGE}px）。`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error(`${label}を作成できませんでした。`);
    context.imageSmoothingEnabled = false;
    return { canvas, context };
  }

  function putPixels(context, pixels, width, height) {
    const imageData = context.createImageData(width, height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG画像を作成できませんでした。'));
    }, 'image/png'));
  }

  function gifOutputBasePath(filename) {
    const normalized = normalizePath(filename, 'animation.gif');
    const slash = normalized.lastIndexOf('/');
    const folder = slash >= 0 ? normalized.slice(0, slash + 1) : '';
    const leaf = (slash >= 0 ? normalized.slice(slash + 1) : normalized).replace(/\.gif$/i, '') || 'animation';
    return `${folder}${leaf}`;
  }

  function computeSpriteLayout(frameCount) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(frameCount)));
    return { columns, rows: Math.max(1, Math.ceil(frameCount / columns)) };
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

  function inspectNearestNeighborScale(pixels, width, height, factor) {
    const scale = Math.max(1, Math.floor(Number(factor) || 1));
    if (!(pixels instanceof Uint8ClampedArray) || scale <= 1 || width % scale || height % scale) {
      return { valid: false, hasInterBlockDifference: false };
    }
    let hasInterBlockDifference = false;
    const rowStride = width * 4;
    for (let blockY = 0; blockY < height; blockY += scale) {
      for (let blockX = 0; blockX < width; blockX += scale) {
        const blockBase = (blockY * width + blockX) * 4;
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
          let pixelBase = ((blockY + localY) * width + blockX) * 4;
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

  async function detectGifIntegerScale(reader, width, height, frameCount) {
    let commonFactor = greatestCommonDivisor(width, height);
    let hasInterBlockDifference = false;
    await visitCompositedGifFrames(reader, width, height, frameCount, ({ pixels }) => {
      if (commonFactor <= 1) return;
      for (let y = 0; y < height && commonFactor > 1; y += 1) {
        for (let x = 0; x < width && commonFactor > 1; x += 1) {
          const base = ((y * width) + x) * 4;
          if (x > 0) {
            const left = base - 4;
            if (
              pixels[base] !== pixels[left]
              || pixels[base + 1] !== pixels[left + 1]
              || pixels[base + 2] !== pixels[left + 2]
              || pixels[base + 3] !== pixels[left + 3]
            ) {
              hasInterBlockDifference = true;
              commonFactor = greatestCommonDivisor(commonFactor, x);
            }
          }
          if (y > 0 && commonFactor > 1) {
            const top = base - (width * 4);
            if (
              pixels[base] !== pixels[top]
              || pixels[base + 1] !== pixels[top + 1]
              || pixels[base + 2] !== pixels[top + 2]
              || pixels[base + 3] !== pixels[top + 3]
            ) {
              hasInterBlockDifference = true;
              commonFactor = greatestCommonDivisor(commonFactor, y);
            }
          }
        }
      }
    });
    return hasInterBlockDifference ? Math.max(1, commonFactor) : 1;
  }

  function downscaleGifPixels(pixels, sourceWidth, sourceHeight, factor) {
    const scale = Math.max(1, Math.floor(Number(factor) || 1));
    if (scale <= 1) return new Uint8ClampedArray(pixels);
    const width = Math.max(1, Math.floor(sourceWidth / scale));
    const height = Math.max(1, Math.floor(sourceHeight / scale));
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
    return output;
  }

  async function visitCompositedGifFrames(reader, width, height, frameCount, onFrame, { yieldBetweenFrames = true } = {}) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    const restore = new Uint8ClampedArray(pixels.length);
    const backgroundColor = typeof reader.getBackgroundColor === 'function' ? reader.getBackgroundColor() : null;
    const backgroundIndex = typeof reader.getBackgroundIndex === 'function' ? reader.getBackgroundIndex() : null;
    fillPixels(pixels, backgroundColor?.a > 0 ? backgroundColor : null);
    let previous = null;
    for (let index = 0; index < frameCount; index += 1) {
      const info = reader.frameInfo(index);
      if (previous?.disposal === 2) clearGifRect(pixels, width, height, previous, disposalFillColor(previous, backgroundColor, backgroundIndex));
      else if (previous?.disposal === 3) pixels.set(restore);
      if (info.disposal === 3) restore.set(pixels);
      reader.decodeAndBlitFrameRGBA(index, pixels);
      const durationMs = Math.max(10, (Math.max(0, Number(info.delay) || 0) || 10) * 10);
      await onFrame({ pixels, frameIndex: index, frameCount, durationMs });
      previous = info;
      if (yieldBetweenFrames) await yieldToBrowser();
    }
  }

  async function visitGifFrames(blob, onFrame, onProgress) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let reader;
    try {
      reader = new (getGifReaderConstructor())(bytes);
    } catch (error) {
      throw new Error('GIFを解析できませんでした。ファイルが破損していないか確認してください。', { cause: error });
    }
    const width = Math.max(0, Number(reader.width) || 0);
    const height = Math.max(0, Number(reader.height) || 0);
    const frameCount = Math.max(0, Number(reader.numFrames()) || 0);
    if (!width || !height || !frameCount) throw new Error('GIFに出力できるフレームがありません。');
    if (frameCount > GIF_MAX_FRAMES) throw new Error(`GIFのフレーム数が多すぎます（最大${GIF_MAX_FRAMES}枚）。`);
    const integerScaleFactor = await detectGifIntegerScale(reader, width, height, frameCount);
    const targetWidth = Math.max(1, Math.floor(width / integerScaleFactor));
    const targetHeight = Math.max(1, Math.floor(height / integerScaleFactor));
    const durations = [];
    await visitCompositedGifFrames(reader, width, height, frameCount, async ({ pixels, frameIndex, durationMs }) => {
      if (integerScaleFactor > 1 && !inspectNearestNeighborScale(pixels, width, height, integerScaleFactor).valid) {
        throw new Error('GIFの整数倍構造を全フレームで確認できませんでした。');
      }
      durations.push(durationMs);
      await onFrame({
        pixels: downscaleGifPixels(pixels, width, height, integerScaleFactor),
        width: targetWidth,
        height: targetHeight,
        frameIndex,
        frameCount,
        durationMs,
      });
      onProgress?.(frameIndex + 1, frameCount);
    });
    return {
      width: targetWidth,
      height: targetHeight,
      sourceWidth: width,
      sourceHeight: height,
      integerScaleFactor,
      frameCount,
      durations,
      loopCount: typeof reader.loopCount === 'function' ? reader.loopCount() : null,
    };
  }

  async function buildGifFramePngTasks(blob, filename, onProgress) {
    const basePath = gifOutputBasePath(filename);
    let frameCanvas = null;
    const tasks = [];
    const metadata = await visitGifFrames(blob, async ({ pixels, width, height, frameIndex }) => {
      if (!frameCanvas) frameCanvas = createCanvas(width, height, 'GIFフレーム');
      putPixels(frameCanvas.context, pixels, width, height);
      tasks.push({
        filename: `${basePath}-frames/frame-${String(frameIndex + 1).padStart(4, '0')}.png`,
        blob: await canvasToPngBlob(frameCanvas.canvas),
      });
    }, onProgress);
    tasks.push({
      filename: `${basePath}-frames/frames.json`,
      blob: new Blob([JSON.stringify({ schema: 'pixieed-gif-frames/v1', ...metadata }, null, 2)], { type: 'application/json' }),
    });
    return tasks;
  }

  async function collectFrameColors(colorCounts, pixels) {
    const chunkLength = ZIP_CRC_YIELD_BYTES * 4;
    for (let chunkStart = 0; chunkStart < pixels.length; chunkStart += chunkLength) {
      const chunkEnd = Math.min(pixels.length, chunkStart + chunkLength);
      for (let offset = chunkStart; offset < chunkEnd; offset += 4) {
        const key = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]},${pixels[offset + 3]}`;
        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
      }
      if (chunkEnd < pixels.length) await yieldToBrowser();
    }
  }

  async function buildGifSpriteMapTasks(blob, filename, onProgress) {
    const basePath = gifOutputBasePath(filename);
    let source = null;
    let sheet = null;
    let layout = null;
    const colorCounts = new Map();
    const metadata = await visitGifFrames(blob, async ({ pixels, width, height, frameIndex, frameCount }) => {
      if (!source) {
        layout = computeSpriteLayout(frameCount);
        const sheetWidth = layout.columns * width;
        const sheetHeight = layout.rows * height;
        if (sheetWidth * sheetHeight > GIF_MAX_SPRITE_PIXELS) {
          throw new Error('SpriteMAPが大きすぎます。各フレームPNGモードをご利用ください。');
        }
        source = createCanvas(width, height, 'GIFフレーム');
        sheet = createCanvas(sheetWidth, sheetHeight, 'SpriteMAP');
      }
      putPixels(source.context, pixels, width, height);
      sheet.context.drawImage(source.canvas, (frameIndex % layout.columns) * width, Math.floor(frameIndex / layout.columns) * height);
      await collectFrameColors(colorCounts, pixels);
    }, onProgress);
    const colors = Array.from(colorCounts, ([key, count], index) => {
      const [r, g, b, a] = key.split(',').map(Number);
      return { index, r, g, b, a, hex: `#${[r, g, b, a].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`, count };
    }).sort((a, b) => b.count - a.count).map((color, index) => ({ ...color, index }));
    const swatchSize = 16;
    const swatchColumns = Math.max(1, Math.min(16, Math.ceil(Math.sqrt(colors.length))));
    const swatchRows = Math.max(1, Math.ceil(colors.length / swatchColumns));
    const colorMap = createCanvas(swatchColumns * swatchSize, swatchRows * swatchSize, 'カラーマップ');
    colors.forEach((color, index) => {
      colorMap.context.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a / 255})`;
      colorMap.context.fillRect((index % swatchColumns) * swatchSize, Math.floor(index / swatchColumns) * swatchSize, swatchSize, swatchSize);
    });
    const spriteMetadata = {
      schema: 'pixieed-gif-spritemap/v1',
      ...metadata,
      columns: layout.columns,
      rows: layout.rows,
      sheetWidth: sheet.canvas.width,
      sheetHeight: sheet.canvas.height,
      colorCount: colors.length,
      colors,
    };
    return [
      { filename: `${basePath}-spritemap.png`, blob: await canvasToPngBlob(sheet.canvas) },
      { filename: `${basePath}-colormap.png`, blob: await canvasToPngBlob(colorMap.canvas) },
      { filename: `${basePath}-colormap.json`, blob: new Blob([JSON.stringify(spriteMetadata, null, 2)], { type: 'application/json' }) },
    ];
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = normalizePath(filename, 'pixieed-market.zip').replaceAll('/', '_');
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function openTransferDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(TRANSFER_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TRANSFER_STORE)) request.result.createObjectStore(TRANSFER_STORE, { keyPath: 'token' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('端末内の受け渡し領域を開けませんでした。'));
    });
  }

  async function stagePiXiEEDrawFile(blob, metadata = {}) {
    if (!(blob instanceof Blob)) throw new Error('PiXiEEDrawで開く素材を準備できませんでした。');
    const token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const db = await openTransferDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(TRANSFER_STORE, 'readwrite');
        transaction.objectStore(TRANSFER_STORE).put({
          token,
          blob,
          filename: normalizePath(metadata.filename, 'purchased.pixieedraw').split('/').pop(),
          assetId: String(metadata.assetId || ''),
          traceId: String(metadata.traceId || ''),
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000
        });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('PiXiEEDrawへの受け渡しを保存できませんでした。'));
        transaction.onabort = () => reject(transaction.error || new Error('PiXiEEDrawへの受け渡しが中断されました。'));
      });
    } finally {
      db.close();
    }
    return token;
  }

  window.PiXiEEDMarketDelivery = Object.freeze({
    buildGifFramePngTasks,
    buildGifSpriteMapTasks,
    buildZipBlob,
    normalizePath,
    saveBlob,
    stagePiXiEEDrawFile
  });
})();
