(() => {
  const host = typeof window !== 'undefined'
    ? window
    : (typeof self !== 'undefined' ? self : globalThis);
  if (!host) {
    return;
  }

  const root = host.PiXiEEDrawModules = host.PiXiEEDrawModules || {};

  function createProjectStorageV2ArchiveCodec({
    buildZipBlobFromTasks,
    decodeBase64,
    encodeTypedArray,
    JSONGlobal = JSON,
    BlobCtor = typeof Blob === 'function' ? Blob : null,
    TextEncoderCtor = typeof TextEncoder === 'function' ? TextEncoder : null,
    TextDecoderCtor = typeof TextDecoder === 'function' ? TextDecoder : null,
    CompressionStreamCtor = typeof CompressionStream === 'function' ? CompressionStream : null,
    DecompressionStreamCtor = typeof DecompressionStream === 'function' ? DecompressionStream : null,
    ResponseCtor = typeof Response === 'function' ? Response : null,
    CryptoGlobal = typeof crypto !== 'undefined' ? crypto : null,
    compressBytes = null,
    decompressBytes = null,
    digestBytes = null,
  } = {}) {
    function createCodecError(code, message, extras = {}) {
      const error = new Error(message);
      error.code = code;
      Object.assign(error, extras);
      return error;
    }

    function cloneJsonValue(value) {
      if (value == null) {
        return value;
      }
      return JSONGlobal.parse(JSONGlobal.stringify(value));
    }

    function normalizePathSegment(value, fallback = 'entry') {
      const normalized = String(value || '')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      return normalized || fallback;
    }

    function createJsonBlob(value) {
      if (!BlobCtor) {
        throw createCodecError(
          'ERR_MISSING_BLOB_CTOR',
          'Blob is not available for project archive serialization'
        );
      }
      return new BlobCtor([JSONGlobal.stringify(value)], { type: 'application/json' });
    }

    let zipCrc32Table = null;

    function getZipCrc32Table() {
      if (zipCrc32Table) {
        return zipCrc32Table;
      }
      zipCrc32Table = new Uint32Array(256);
      for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
          value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        zipCrc32Table[index] = value >>> 0;
      }
      return zipCrc32Table;
    }

    function computeCrc32(bytes) {
      const table = getZipCrc32Table();
      let crc = 0xFFFFFFFF;
      for (let index = 0; index < bytes.length; index += 1) {
        crc = table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function createZipDosDateTime(date = new Date()) {
      const year = Math.max(1980, date.getFullYear());
      const month = Math.min(Math.max(date.getMonth() + 1, 1), 12);
      const day = Math.min(Math.max(date.getDate(), 1), 31);
      const hours = Math.min(Math.max(date.getHours(), 0), 23);
      const minutes = Math.min(Math.max(date.getMinutes(), 0), 59);
      const seconds = Math.min(Math.max(Math.floor(date.getSeconds() / 2), 0), 29);
      return {
        time: ((hours & 0x1F) << 11) | ((minutes & 0x3F) << 5) | (seconds & 0x1F),
        date: (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F),
      };
    }

    function decodeText(bytes) {
      if (!TextDecoderCtor) {
        throw createCodecError('ERR_MISSING_TEXT_DECODER', 'TextDecoder is not available');
      }
      return new TextDecoderCtor().decode(bytes);
    }

    function encodeText(text) {
      if (!TextEncoderCtor) {
        throw createCodecError('ERR_MISSING_TEXT_ENCODER', 'TextEncoder is not available');
      }
      return new TextEncoderCtor().encode(String(text || ''));
    }

    function isZipSignature(bytes) {
      return bytes instanceof Uint8Array
        && bytes.length >= 4
        && bytes[0] === 0x50
        && bytes[1] === 0x4b
        && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
        && (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
    }

    function parseStoredZipEntries(bytes) {
      if (!isZipSignature(bytes)) {
        throw createCodecError('ERR_NOT_ZIP_ARCHIVE', 'Project archive is not a ZIP payload');
      }
      const entries = new Map();
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 0;
      while (offset + 4 <= bytes.length) {
        const signature = view.getUint32(offset, true);
        if (signature === 0x02014b50 || signature === 0x06054b50) {
          break;
        }
        if (signature !== 0x04034b50) {
          throw createCodecError(
            'ERR_UNSUPPORTED_ZIP_ENTRY',
            'Unsupported ZIP entry signature in project archive'
          );
        }
        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const filenameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        if (compressionMethod !== 0) {
          throw createCodecError(
            'ERR_UNSUPPORTED_ZIP_ENTRY',
            'Compressed ZIP entries are not supported for project archive parsing'
          );
        }
        const filenameStart = offset + 30;
        const filenameEnd = filenameStart + filenameLength;
        const extraEnd = filenameEnd + extraLength;
        const dataEnd = extraEnd + compressedSize;
        if (dataEnd > bytes.length) {
          throw createCodecError(
            'ERR_UNSUPPORTED_ZIP_ENTRY',
            'Project archive entry exceeds byte length'
          );
        }
        const filename = decodeText(bytes.subarray(filenameStart, filenameEnd));
        entries.set(filename, bytes.slice(extraEnd, dataEnd));
        offset = dataEnd;
      }
      return entries;
    }

    function readJsonEntry(entries, filename) {
      const bytes = entries.get(filename);
      if (!(bytes instanceof Uint8Array)) {
        throw createCodecError('ERR_MISSING_ARCHIVE_ENTRY', `Missing project archive entry: ${filename}`, {
          entryPath: filename,
        });
      }
      try {
        return JSONGlobal.parse(decodeText(bytes));
      } catch (cause) {
        throw createCodecError(
          'ERR_INVALID_JSON_ENTRY',
          cause?.message || `Invalid JSON entry: ${filename}`,
          { cause, entryPath: filename }
        );
      }
    }

    async function compressProjectBytes(bytes) {
      if (typeof compressBytes === 'function') {
        try {
          return await compressBytes(bytes);
        } catch (cause) {
          throw createCodecError('ERR_DEFLATE_FAILED', cause?.message || 'Bitmap compression failed', { cause });
        }
      }
      if (!CompressionStreamCtor || !ResponseCtor || !BlobCtor) {
        throw createCodecError('ERR_DEFLATE_FAILED', 'CompressionStream is not available for v2 project save');
      }
      try {
        const stream = new BlobCtor([bytes]).stream().pipeThrough(new CompressionStreamCtor('deflate'));
        return new Uint8Array(await new ResponseCtor(stream).arrayBuffer());
      } catch (cause) {
        throw createCodecError('ERR_DEFLATE_FAILED', cause?.message || 'Bitmap compression failed', { cause });
      }
    }

    async function buildProjectZipBlob(tasks) {
      if (typeof buildZipBlobFromTasks === 'function') {
        return await buildZipBlobFromTasks(tasks);
      }
      if (!BlobCtor) {
        throw createCodecError('ERR_MISSING_BLOB_CTOR', 'Blob is not available for fallback ZIP serialization');
      }
      const now = createZipDosDateTime(new Date());
      const localParts = [];
      const centralParts = [];
      let localSize = 0;
      for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index];
        const filename = String(task.filename || `entry-${index + 1}`);
        const filenameBytes = encodeText(filename);
        const dataBytes = new Uint8Array(await task.blob.arrayBuffer());
        const crc32 = computeCrc32(dataBytes);
        const localHeader = new Uint8Array(30 + filenameBytes.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034B50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, now.time, true);
        localView.setUint16(12, now.date, true);
        localView.setUint32(14, crc32, true);
        localView.setUint32(18, dataBytes.length, true);
        localView.setUint32(22, dataBytes.length, true);
        localView.setUint16(26, filenameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(filenameBytes, 30);
        localParts.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + filenameBytes.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014B50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, now.time, true);
        centralView.setUint16(14, now.date, true);
        centralView.setUint32(16, crc32, true);
        centralView.setUint32(20, dataBytes.length, true);
        centralView.setUint32(24, dataBytes.length, true);
        centralView.setUint16(28, filenameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, localSize, true);
        centralHeader.set(filenameBytes, 46);
        centralParts.push(centralHeader);

        localSize += localHeader.length + dataBytes.length;
      }
      const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
      const endRecord = new Uint8Array(22);
      const endView = new DataView(endRecord.buffer);
      endView.setUint32(0, 0x06054B50, true);
      endView.setUint16(4, 0, true);
      endView.setUint16(6, 0, true);
      endView.setUint16(8, tasks.length, true);
      endView.setUint16(10, tasks.length, true);
      endView.setUint32(12, centralSize, true);
      endView.setUint32(16, localSize, true);
      endView.setUint16(20, 0, true);
      return new BlobCtor([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
    }

    async function decompressProjectBytes(bytes) {
      if (typeof decompressBytes === 'function') {
        try {
          return await decompressBytes(bytes);
        } catch (cause) {
          throw createCodecError('ERR_INFLATE_FAILED', cause?.message || 'Bitmap decompression failed', { cause });
        }
      }
      if (!DecompressionStreamCtor || !ResponseCtor || !BlobCtor) {
        throw createCodecError('ERR_INFLATE_FAILED', 'DecompressionStream is not available for v2 project load');
      }
      try {
        const stream = new BlobCtor([bytes]).stream().pipeThrough(new DecompressionStreamCtor('deflate'));
        return new Uint8Array(await new ResponseCtor(stream).arrayBuffer());
      } catch (cause) {
        throw createCodecError('ERR_INFLATE_FAILED', cause?.message || 'Bitmap decompression failed', { cause });
      }
    }

    async function digestProjectBytes(bytes) {
      if (typeof digestBytes === 'function') {
        return await digestBytes(bytes);
      }
      if (!CryptoGlobal?.subtle?.digest) {
        throw createCodecError('ERR_MISSING_DIGEST', 'crypto.subtle.digest is not available for v2 project save');
      }
      const digest = await CryptoGlobal.subtle.digest('SHA-256', bytes);
      return new Uint8Array(digest);
    }

    async function sha256Hex(bytes) {
      const digest = await digestProjectBytes(bytes);
      let output = '';
      for (let index = 0; index < digest.length; index += 1) {
        output += digest[index].toString(16).padStart(2, '0');
      }
      return output;
    }

    function buildBitmapHashSourceBytes(bytes, { encoding = 'rgba.zlib', width = 0, height = 0 } = {}) {
      const payloadBytes = ArrayBuffer.isView(bytes)
        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : (bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(0));
      const safeWidth = Math.max(0, Math.round(Number(width) || 0));
      const safeHeight = Math.max(0, Math.round(Number(height) || 0));
      const headerBytes = encodeText(`${String(encoding || 'rgba.zlib')}\0${safeWidth}\0${safeHeight}\0`);
      const output = new Uint8Array(headerBytes.length + payloadBytes.length);
      output.set(headerBytes, 0);
      output.set(payloadBytes, headerBytes.length);
      return output;
    }

    function isPlainObject(value) {
      return Boolean(value && typeof value === 'object' && !Array.isArray(value));
    }

    function buildEmptyTimelapsePayload(source = null) {
      const fps = Math.max(1, Math.round(Number(source?.fps) || 12));
      return {
        enabled: false,
        fps,
        byCanvas: {},
        operationLogsByCanvas: {},
      };
    }

    function normalizeTimelapseArchivePayload(payload, { strict = false } = {}) {
      if (!isPlainObject(payload)) {
        if (strict) {
          throw createCodecError('ERR_INVALID_TIMELAPSE_PAYLOAD', 'Invalid timelapse archive payload');
        }
        return buildEmptyTimelapsePayload();
      }
      const byCanvas = isPlainObject(payload.byCanvas)
        ? cloneJsonValue(payload.byCanvas)
        : null;
      const operationLogsByCanvas = isPlainObject(payload.operationLogsByCanvas)
        ? cloneJsonValue(payload.operationLogsByCanvas)
        : null;
      if (strict && (!byCanvas || !operationLogsByCanvas)) {
        throw createCodecError('ERR_INVALID_TIMELAPSE_PAYLOAD', 'Invalid timelapse archive payload shape');
      }
      return {
        enabled: Boolean(payload.enabled),
        fps: Math.max(1, Math.round(Number(payload.fps) || 12)),
        byCanvas: byCanvas || {},
        operationLogsByCanvas: operationLogsByCanvas || {},
      };
    }

    function buildTimelapseArchivePath(basePath = '') {
      return `${basePath}timelapse/session.json`;
    }

    function buildTimelapseArchiveMetadata(timelapsePath = '', { included = false } = {}) {
      if (included === true) {
        return {
          version: 1,
          included: true,
          path: timelapsePath,
        };
      }
      return {
        version: 1,
        included: false,
      };
    }

    function splitSessionForArchive(sessionPayload, { basePath = '', includeTimelapse = true } = {}) {
      const nextSession = cloneJsonValue(sessionPayload) || {};
      const sourceTimelapse = normalizeTimelapseArchivePayload(nextSession.timelapse, { strict: false });
      const timelapsePath = buildTimelapseArchivePath(basePath);
      nextSession.timelapse = buildEmptyTimelapsePayload(sourceTimelapse);
      nextSession.timelapseArchive = buildTimelapseArchiveMetadata(timelapsePath, {
        included: includeTimelapse === true,
      });
      return {
        sessionPayload: nextSession,
        timelapseTask: includeTimelapse === true
          ? {
              filename: timelapsePath,
              blob: createJsonBlob(sourceTimelapse),
            }
          : null,
      };
    }

    function restoreSessionFromArchive(sessionPayload, entries) {
      const nextSession = cloneJsonValue(sessionPayload) || {};
      const fallbackTimelapse = buildEmptyTimelapsePayload(nextSession.timelapse);
      const archiveMeta = isPlainObject(nextSession.timelapseArchive)
        ? nextSession.timelapseArchive
        : null;
      delete nextSession.timelapseArchive;
      if (archiveMeta?.included === true) {
        if (typeof archiveMeta.path !== 'string' || !archiveMeta.path) {
          throw createCodecError('ERR_INVALID_TIMELAPSE_PAYLOAD', 'Timelapse archive reference is missing path');
        }
        const timelapsePayload = readJsonEntry(entries, archiveMeta.path);
        nextSession.timelapse = normalizeTimelapseArchivePayload(timelapsePayload, { strict: true });
        return nextSession;
      }
      nextSession.timelapse = fallbackTimelapse;
      return nextSession;
    }

    function decodeIndicesBase64(indicesBase64, pixelCount) {
      if (typeof indicesBase64 !== 'string' || !indicesBase64.length || typeof decodeBase64 !== 'function') {
        return null;
      }
      const bytes = decodeBase64(indicesBase64);
      if (!(bytes instanceof Uint8Array) || bytes.length !== pixelCount * 2) {
        return null;
      }
      const view = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const output = new Int16Array(view.length);
      output.set(view);
      return output;
    }

    function decodeRgbaBase64(base64, expectedLength) {
      if (typeof base64 !== 'string' || !base64.length || typeof decodeBase64 !== 'function') {
        return null;
      }
      const bytes = decodeBase64(base64);
      if (!(bytes instanceof Uint8Array) || bytes.length !== expectedLength) {
        return null;
      }
      const output = new Uint8ClampedArray(bytes.length);
      output.set(bytes);
      return output;
    }

    function findCropBounds(rgba, width, height, { indices = null, onlyTransparentIndices = false } = {}) {
      if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
        return null;
      }
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const pixelIndex = (y * width) + x;
          const base = pixelIndex * 4;
          const alpha = rgba[base + 3];
          if (alpha <= 0) {
            continue;
          }
          if (onlyTransparentIndices && indices instanceof Int16Array && indices[pixelIndex] >= 0) {
            continue;
          }
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY) {
        return null;
      }
      return {
        x: minX,
        y: minY,
        w: (maxX - minX) + 1,
        h: (maxY - minY) + 1,
      };
    }

    function cropRgbaToBounds(rgba, width, height, bounds, { indices = null, onlyTransparentIndices = false } = {}) {
      const cropped = new Uint8ClampedArray(bounds.w * bounds.h * 4);
      for (let y = 0; y < bounds.h; y += 1) {
        for (let x = 0; x < bounds.w; x += 1) {
          const sourceX = bounds.x + x;
          const sourceY = bounds.y + y;
          const pixelIndex = (sourceY * width) + sourceX;
          if (onlyTransparentIndices && indices instanceof Int16Array && indices[pixelIndex] >= 0) {
            continue;
          }
          const sourceBase = pixelIndex * 4;
          const targetBase = ((y * bounds.w) + x) * 4;
          if (rgba[sourceBase + 3] <= 0) {
            continue;
          }
          cropped[targetBase] = rgba[sourceBase];
          cropped[targetBase + 1] = rgba[sourceBase + 1];
          cropped[targetBase + 2] = rgba[sourceBase + 2];
          cropped[targetBase + 3] = rgba[sourceBase + 3];
        }
      }
      return cropped;
    }

    function inflateCroppedRgba({ x = 0, y = 0, w = 0, h = 0 }, rgba, width, height) {
      const output = new Uint8ClampedArray(width * height * 4);
      if (!(rgba instanceof Uint8Array) || rgba.length !== w * h * 4) {
        return output;
      }
      for (let row = 0; row < h; row += 1) {
        for (let column = 0; column < w; column += 1) {
          const sourceBase = ((row * w) + column) * 4;
          const targetX = x + column;
          const targetY = y + row;
          if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) {
            continue;
          }
          const targetBase = ((targetY * width) + targetX) * 4;
          output[targetBase] = rgba[sourceBase];
          output[targetBase + 1] = rgba[sourceBase + 1];
          output[targetBase + 2] = rgba[sourceBase + 2];
          output[targetBase + 3] = rgba[sourceBase + 3];
        }
      }
      return output;
    }

    function listCanvasSources(documentPayload) {
      if (Array.isArray(documentPayload?.canvases) && documentPayload.canvases.length) {
        return {
          hadCanvases: true,
          canvases: documentPayload.canvases.map(canvas => cloneJsonValue(canvas)),
        };
      }
      return {
        hadCanvases: false,
        canvases: [{
          id: typeof documentPayload?.activeCanvasId === 'string' && documentPayload.activeCanvasId
            ? documentPayload.activeCanvasId
            : 'canvas-1',
          name: typeof documentPayload?.documentName === 'string' && documentPayload.documentName
            ? documentPayload.documentName
            : 'Canvas 1',
          width: documentPayload?.width,
          height: documentPayload?.height,
          activeFrame: documentPayload?.activeFrame,
          activeLayer: documentPayload?.activeLayer,
          mirror: cloneJsonValue(documentPayload?.mirror),
          selectionMask: documentPayload?.selectionMask || null,
          selectionContentMask: documentPayload?.selectionContentMask || null,
          selectionBounds: cloneJsonValue(documentPayload?.selectionBounds),
          frames: cloneJsonValue(documentPayload?.frames || []),
        }],
      };
    }

    function countCanvasLayers(canvasPayload) {
      if (!Array.isArray(canvasPayload?.frames)) {
        return 0;
      }
      return canvasPayload.frames.reduce((max, frame) => (
        Math.max(max, Array.isArray(frame?.layers) ? frame.layers.length : 0)
      ), 0);
    }

    function createArchiveDocumentBase(documentPayload = null) {
      const baseDocument = cloneJsonValue(documentPayload) || {};
      delete baseDocument.frames;
      delete baseDocument.canvases;
      const activeCanvasId = typeof documentPayload?.activeCanvasId === 'string' && documentPayload.activeCanvasId
        ? documentPayload.activeCanvasId
        : '';
      return {
        baseDocument,
        activeCanvasId,
      };
    }

    async function normalizeBitmapPayload(base64, width, height, {
      indicesBase64 = '',
      directOnly = false,
      onlyTransparentIndices = false,
      bitmapTasksByHash,
      diagnostics,
    } = {}) {
      const pixelCount = Math.max(1, width * height);
      const rgba = decodeRgbaBase64(base64, pixelCount * 4);
      if (!(rgba instanceof Uint8ClampedArray)) {
        return null;
      }
      const indices = onlyTransparentIndices
        ? decodeIndicesBase64(indicesBase64, pixelCount)
        : null;
      const bounds = findCropBounds(rgba, width, height, {
        indices,
        onlyTransparentIndices,
      });
      if (!bounds) {
        return null;
      }
      const cropped = cropRgbaToBounds(rgba, width, height, bounds, {
        indices,
        onlyTransparentIndices,
      });
      const hash = await sha256Hex(buildBitmapHashSourceBytes(cropped, {
        encoding: 'rgba.zlib',
        width: bounds.w,
        height: bounds.h,
      }));
      diagnostics.bitmapReferenceCount += 1;
      if (!bitmapTasksByHash.has(hash)) {
        const compressed = await compressProjectBytes(cropped);
        bitmapTasksByHash.set(hash, {
          filename: `bitmaps/${hash}.rgba.zlib`,
          blob: new BlobCtor([compressed], { type: 'application/octet-stream' }),
        });
      }
      return {
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        bitmapRef: `bitmaps/${hash}.rgba.zlib`,
        hash,
        encoding: 'rgba.zlib',
        directOnly: Boolean(directOnly),
      };
    }

    async function normalizeCanvasForArchive(canvasPayload, bitmapTasksByHash, diagnostics) {
      const nextCanvas = cloneJsonValue(canvasPayload) || {};
      const width = Math.max(1, Math.round(Number(nextCanvas.width) || 1));
      const height = Math.max(1, Math.round(Number(nextCanvas.height) || 1));
      nextCanvas.frames = await Promise.all((Array.isArray(canvasPayload?.frames) ? canvasPayload.frames : []).map(async frame => {
        const nextFrame = cloneJsonValue(frame) || {};
        nextFrame.layers = await Promise.all((Array.isArray(frame?.layers) ? frame.layers : []).map(async layer => {
          if (!layer || typeof layer !== 'object' || layer.type === 'simulation') {
            return cloneJsonValue(layer);
          }
          const nextLayer = cloneJsonValue(layer) || {};
          const cel = await normalizeBitmapPayload(layer.direct, width, height, {
            indicesBase64: layer.indices,
            directOnly: Boolean(layer.directOnly),
            onlyTransparentIndices: Boolean(layer.directOnly) !== true,
            bitmapTasksByHash,
            diagnostics,
          });
          const importSourceCel = await normalizeBitmapPayload(layer.importSourceDirect, width, height, {
            directOnly: true,
            onlyTransparentIndices: false,
            bitmapTasksByHash,
            diagnostics,
          });
          delete nextLayer.direct;
          delete nextLayer.importSourceDirect;
          if (cel) {
            nextLayer.cel = cel;
          }
          if (importSourceCel) {
            nextLayer.importSourceCel = importSourceCel;
          }
          nextLayer.directOnly = Boolean(layer.directOnly);
          return nextLayer;
        }));
        return nextFrame;
      }));
      return nextCanvas;
    }

    async function serializePackagedProjectBody(
      packagedProject,
      bitmapTasksByHash,
      diagnostics,
      { adapterId = '', basePath = '', stripSheets = true, includeTimelapse = true } = {}
    ) {
      const documentPayload = packagedProject?.document;
      if (!documentPayload || typeof documentPayload !== 'object') {
        throw createCodecError('ERR_INVALID_PROJECT_PAYLOAD', 'Packaged project document is missing');
      }
      const { hadCanvases, canvases } = listCanvasSources(documentPayload);
      const normalizedCanvases = [];
      const canvasEntries = [];
      for (let index = 0; index < canvases.length; index += 1) {
        const canvasSource = canvases[index];
        const normalizedCanvas = await normalizeCanvasForArchive(canvasSource, bitmapTasksByHash, diagnostics);
        const canvasId = typeof normalizedCanvas?.id === 'string' && normalizedCanvas.id
          ? normalizedCanvas.id
          : `canvas-${index + 1}`;
        const canvasPath = `${basePath}canvases/${normalizePathSegment(canvasId, `canvas-${index + 1}`)}.json`;
        normalizedCanvases.push({ path: canvasPath, payload: normalizedCanvas });
        canvasEntries.push({
          id: canvasId,
          name: typeof normalizedCanvas?.name === 'string' ? normalizedCanvas.name : `Canvas ${index + 1}`,
          path: canvasPath,
          width: Math.max(1, Math.round(Number(normalizedCanvas?.width) || Number(documentPayload.width) || 1)),
          height: Math.max(1, Math.round(Number(normalizedCanvas?.height) || Number(documentPayload.height) || 1)),
          frameCount: Array.isArray(normalizedCanvas?.frames) ? normalizedCanvas.frames.length : 0,
          layerCount: countCanvasLayers(normalizedCanvas),
        });
      }

      const { baseDocument, activeCanvasId } = createArchiveDocumentBase(documentPayload);
      const projectPayload = cloneJsonValue(packagedProject) || {};
      projectPayload.storageVersion = 2;
      projectPayload.storageAdapterId = adapterId || '';
      projectPayload.hadCanvases = hadCanvases;
      projectPayload.canvasEntries = canvasEntries;
      const splitSession = splitSessionForArchive(projectPayload.session, {
        basePath,
        includeTimelapse,
      });
      projectPayload.session = splitSession.sessionPayload;
      projectPayload.document = {
        ...baseDocument,
        activeCanvasId: activeCanvasId || (canvasEntries[0]?.id || ''),
      };
      if (stripSheets) {
        delete projectPayload.sheets;
        delete projectPayload.activeSheetId;
      }

      return {
        projectPayload,
        canvasTasks: normalizedCanvases.map(entry => ({
          filename: entry.path,
          blob: createJsonBlob(entry.payload),
        })),
        timelapseTasks: splitSession.timelapseTask ? [splitSession.timelapseTask] : [],
        activeCanvasId: projectPayload.document.activeCanvasId,
      };
    }

    function createFallbackSheetEntries(packagedProject = null) {
      if (!packagedProject || typeof packagedProject !== 'object') {
        return [];
      }
      const fallbackDocumentName = typeof packagedProject?.document?.documentName === 'string'
        ? packagedProject.document.documentName
        : 'Sheet 1';
      return [{
        id: 'sheet-1',
        fileName: fallbackDocumentName,
        label: 'Sheet 1',
        project: cloneJsonValue(packagedProject),
        unsaved: false,
        source: 'sheet',
        updatedAt: packagedProject.updatedAt || new Date().toISOString(),
      }];
    }

    function buildSheetArchiveDirectory(sheetId = '', index = 0, usedPaths = new Set()) {
      const baseName = normalizePathSegment(sheetId, `sheet-${index + 1}`);
      let nextName = baseName;
      let suffix = 2;
      while (usedPaths.has(nextName)) {
        nextName = `${baseName}-${suffix}`;
        suffix += 1;
      }
      usedPaths.add(nextName);
      return `sheets/${nextName}/`;
    }

    function buildSheetArchiveManifestEntry(sheet = null, {
      sheetId = '',
      fallbackFileName = '',
      fallbackLabel = '',
      projectPath = '',
      fallbackUpdatedAt = '',
    } = {}) {
      const nextSheet = cloneJsonValue(sheet) || {};
      delete nextSheet.project;
      return {
        ...nextSheet,
        id: typeof sheetId === 'string' && sheetId ? sheetId : (typeof nextSheet.id === 'string' && nextSheet.id ? nextSheet.id : ''),
        fileName: typeof nextSheet.fileName === 'string' && nextSheet.fileName
          ? nextSheet.fileName
          : fallbackFileName,
        label: typeof nextSheet.label === 'string' && nextSheet.label
          ? nextSheet.label
          : fallbackLabel,
        updatedAt: typeof nextSheet.updatedAt === 'string' && nextSheet.updatedAt
          ? nextSheet.updatedAt
          : fallbackUpdatedAt,
        path: projectPath,
      };
    }

    function countArchiveBitmaps(entries) {
      let count = 0;
      entries.forEach((_value, key) => {
        if (typeof key === 'string' && key.startsWith('bitmaps/') && key.endsWith('.rgba.zlib')) {
          count += 1;
        }
      });
      return count;
    }

    function resolveTimelapseIncluded(projectPayload = null) {
      if (projectPayload?.session?.timelapseArchive?.included === true) {
        return true;
      }
      if (!Array.isArray(projectPayload?.sheets)) {
        return false;
      }
      return projectPayload.sheets.some(sheet => sheet?.project?.session?.timelapseArchive?.included === true);
    }

    function assertPackagedCanvasLimit(packaged) {
      const documents = [];
      if (packaged?.document && typeof packaged.document === 'object') documents.push(packaged.document);
      if (Array.isArray(packaged?.sheets)) {
        packaged.sheets.forEach(sheet => {
          if (sheet?.project?.document && typeof sheet.project.document === 'object') {
            documents.push(sheet.project.document);
          }
        });
      }
      for (const documentPayload of documents) {
        const canvasCount = Array.isArray(documentPayload.canvases) ? documentPayload.canvases.length : 1;
        if (canvasCount > 4) {
          throw createCodecError(
            'ERR_CANVAS_LIMIT_EXCEEDED',
            `A sheet can contain at most 4 canvases (received ${canvasCount})`,
            { canvasCount, maximum: 4 }
          );
        }
      }
    }

    async function encodePackagedProject(packaged, options = {}) {
      assertPackagedCanvasLimit(packaged);
      const adapterId = typeof options?.adapterId === 'string' ? options.adapterId : '';
      const packageType = typeof options?.packageType === 'string' && options.packageType
        ? options.packageType
        : 'pixieedraw-project';
      const fileExtension = typeof options?.fileExtension === 'string' && options.fileExtension
        ? options.fileExtension
        : '.pixieedraw';
      const mimeType = typeof options?.mimeType === 'string' && options.mimeType
        ? options.mimeType
        : 'application/x-pixieedraw';
      // New V2 archives have a single root project. The option remains
      // accepted for old callers but cannot re-enable the retired layout.
      const includeSheets = false;
      const includeTimelapse = options?.includeTimelapse !== false;
      const bitmapTasksByHash = new Map();
      const diagnostics = {
        bitmapCount: 0,
        dedupedBitmapCount: 0,
        sheetCount: 0,
        timelapseIncluded: includeTimelapse,
        bitmapReferenceCount: 0,
      };
      let projectPayload = null;
      let tasks = [];
      let activeCanvasId = '';
      if (includeSheets) {
        const sourceSheets = Array.isArray(packaged?.sheets) && packaged.sheets.length
          ? packaged.sheets
          : createFallbackSheetEntries(packaged);
        const resolvedActiveSheetId = typeof packaged?.activeSheetId === 'string' && packaged.activeSheetId
          ? packaged.activeSheetId
          : (typeof sourceSheets[0]?.id === 'string' ? sourceSheets[0].id : 'sheet-1');
        const usedSheetPaths = new Set();
        const usedSheetIds = new Set();
        const sheetManifests = [];
        const sheetTasks = [];
        let activeSheetProject = null;
        diagnostics.sheetCount = sourceSheets.length;

        for (let index = 0; index < sourceSheets.length; index += 1) {
          const sheet = sourceSheets[index];
          const sheetId = typeof sheet?.id === 'string' && sheet.id ? sheet.id : `sheet-${index + 1}`;
          if (usedSheetIds.has(sheetId)) {
            throw createCodecError('ERR_DUPLICATE_SHEET_ID', `Duplicate packaged project sheet id: ${sheetId}`);
          }
          usedSheetIds.add(sheetId);
          const sheetProject = sheet?.project && typeof sheet.project === 'object'
            ? sheet.project
            : (sheetId === resolvedActiveSheetId ? packaged : null);
          if (!sheetProject || typeof sheetProject !== 'object') {
            throw createCodecError('ERR_INVALID_PROJECT_PAYLOAD', `Packaged project sheet is missing payload: ${sheetId}`);
          }
          if (!activeSheetProject && sheetId === resolvedActiveSheetId) {
            activeSheetProject = sheetProject;
          }
          const sheetDirectory = buildSheetArchiveDirectory(sheetId, index, usedSheetPaths);
          const sheetProjectPath = `${sheetDirectory}project.json`;
          const serializedSheet = await serializePackagedProjectBody(sheetProject, bitmapTasksByHash, diagnostics, {
            adapterId,
            basePath: sheetDirectory,
            stripSheets: true,
            includeTimelapse,
          });
          sheetTasks.push(
            {
              filename: sheetProjectPath,
              blob: createJsonBlob(serializedSheet.projectPayload),
            },
            ...serializedSheet.canvasTasks,
            ...serializedSheet.timelapseTasks,
          );
          sheetManifests.push(buildSheetArchiveManifestEntry(sheet, {
            sheetId,
            fallbackFileName: typeof sheetProject?.document?.documentName === 'string' ? sheetProject.document.documentName : `Sheet ${index + 1}`,
            fallbackLabel: `Sheet ${index + 1}`,
            projectPath: sheetProjectPath,
            fallbackUpdatedAt: typeof sheetProject?.updatedAt === 'string' ? sheetProject.updatedAt : new Date().toISOString(),
          }));
        }

        if (!activeSheetProject || typeof activeSheetProject !== 'object') {
          activeSheetProject = sourceSheets[0]?.project && typeof sourceSheets[0].project === 'object'
            ? sourceSheets[0].project
            : packaged;
        }
        const { baseDocument, activeCanvasId: rootActiveCanvasId } = createArchiveDocumentBase(activeSheetProject?.document || packaged?.document || null);
        projectPayload = cloneJsonValue(packaged) || {};
        projectPayload.storageVersion = 2;
        projectPayload.storageAdapterId = adapterId;
        delete projectPayload.hadCanvases;
        delete projectPayload.canvasEntries;
        const splitRootSession = splitSessionForArchive(projectPayload.session, {
          basePath: '',
          includeTimelapse,
        });
        projectPayload.session = splitRootSession.sessionPayload;
        projectPayload.document = {
          ...baseDocument,
          activeCanvasId: rootActiveCanvasId,
        };
        projectPayload.sheets = sheetManifests;
        projectPayload.activeSheetId = resolvedActiveSheetId;
        activeCanvasId = rootActiveCanvasId;
        tasks = [
          ...sheetTasks,
          ...(splitRootSession.timelapseTask ? [splitRootSession.timelapseTask] : []),
        ];
      } else {
        const serializedRoot = await serializePackagedProjectBody(packaged, bitmapTasksByHash, diagnostics, {
          adapterId,
          basePath: '',
          stripSheets: true,
          includeTimelapse,
        });
        projectPayload = serializedRoot.projectPayload;
        tasks = [
          ...serializedRoot.canvasTasks,
          ...serializedRoot.timelapseTasks,
        ];
        activeCanvasId = serializedRoot.activeCanvasId;
        diagnostics.sheetCount = 0;
      }

      const projectOriginality = packaged?.canonicalSourceMetadata?.projectOriginality;
      const projectExportIntegrity = packaged?.session?.projectExportIntegrity;
      const previewThumbnail = typeof packaged?.previewThumbnail === 'string'
        && packaged.previewThumbnail.startsWith('data:image/')
        && packaged.previewThumbnail.length <= 240000
        ? packaged.previewThumbnail
        : '';
      const manifest = {
        format: 'pixieedraw',
        version: 2,
        storageAdapterId: adapterId,
        packageType: packaged?.type || packageType,
        packageVersion: Math.max(1, Math.round(Number(packaged?.packageVersion) || 2)),
        documentVersion: Math.max(1, Math.round(Number(packaged?.document?.version) || Number(packaged?.version) || 1)),
        width: Math.max(1, Math.round(Number(packaged?.document?.width) || 1)),
        height: Math.max(1, Math.round(Number(packaged?.document?.height) || 1)),
        canvasCount: Array.isArray(packaged?.document?.canvases) && packaged.document.canvases.length
          ? packaged.document.canvases.length
          : 1,
        activeCanvasId,
        sheetCount: Array.isArray(projectPayload?.sheets) ? projectPayload.sheets.length : 0,
        documentName: typeof packaged?.document?.documentName === 'string' ? packaged.document.documentName : '',
        updatedAt: typeof packaged?.updatedAt === 'string' ? packaged.updatedAt : '',
        previewThumbnail,
        certification: {
          schemaVersion: 1,
          nativeCreated: projectOriginality?.saleEligibility === 'eligible'
            && projectOriginality?.createdWith === 'pixieedraw-native'
            && projectOriginality?.externalInputDetected !== true,
          externalInputDetected: projectOriginality?.externalInputDetected === true,
          completeProjectSave: projectExportIntegrity?.completeProjectSave === true,
          timelapseSynchronized: projectExportIntegrity?.timelapseSynchronized === true,
          saleCandidateDataComplete: projectExportIntegrity?.saleCandidateDataComplete === true,
        },
      };

      const archiveTasks = [
        {
          filename: 'manifest.json',
          blob: createJsonBlob(manifest),
        },
        {
          filename: 'project.json',
          blob: createJsonBlob(projectPayload),
        },
        ...tasks,
      ];
      bitmapTasksByHash.forEach(task => {
        archiveTasks.push(task);
      });

      const blob = await buildProjectZipBlob(archiveTasks);
      diagnostics.bitmapCount = diagnostics.bitmapReferenceCount;
      diagnostics.dedupedBitmapCount = bitmapTasksByHash.size;
      delete diagnostics.bitmapReferenceCount;

      return {
        blob,
        archiveManifest: manifest,
        archiveProject: projectPayload,
        packaged: cloneJsonValue(packaged),
        diagnostics,
        mimeType,
        fileExtension,
      };
    }

    async function restoreCanvasLayer(layer, width, height, entries) {
      if (!layer || typeof layer !== 'object' || layer.type === 'simulation') {
        return cloneJsonValue(layer);
      }
      const nextLayer = cloneJsonValue(layer) || {};
      delete nextLayer.cel;
      delete nextLayer.importSourceCel;

      if (layer.cel && typeof layer.cel === 'object') {
        const bitmapRef = String(layer.cel.bitmapRef || '');
        const bitmapBytes = entries.get(bitmapRef);
        if (!(bitmapBytes instanceof Uint8Array)) {
          throw createCodecError('ERR_MISSING_BITMAP_ENTRY', `Missing bitmap entry: ${layer.cel.bitmapRef}`, {
            entryPath: bitmapRef,
          });
        }
        const inflated = await decompressProjectBytes(bitmapBytes);
        nextLayer.direct = typeof encodeTypedArray === 'function'
          ? encodeTypedArray(inflateCroppedRgba(layer.cel, inflated, width, height))
          : null;
      } else if (layer.directOnly === true && typeof encodeTypedArray === 'function') {
        nextLayer.direct = encodeTypedArray(new Uint8ClampedArray(width * height * 4));
      } else {
        nextLayer.direct = null;
      }

      if (layer.importSourceCel && typeof layer.importSourceCel === 'object') {
        const bitmapRef = String(layer.importSourceCel.bitmapRef || '');
        const bitmapBytes = entries.get(bitmapRef);
        if (!(bitmapBytes instanceof Uint8Array)) {
          throw createCodecError(
            'ERR_MISSING_BITMAP_ENTRY',
            `Missing import source bitmap entry: ${layer.importSourceCel.bitmapRef}`,
            { entryPath: bitmapRef }
          );
        }
        const inflated = await decompressProjectBytes(bitmapBytes);
        nextLayer.importSourceDirect = typeof encodeTypedArray === 'function'
          ? encodeTypedArray(inflateCroppedRgba(layer.importSourceCel, inflated, width, height))
          : null;
      } else {
        nextLayer.importSourceDirect = null;
      }

      nextLayer.directOnly = Boolean(layer.directOnly);
      if (typeof nextLayer.indices !== 'string' && typeof encodeTypedArray === 'function') {
        const transparentIndices = new Int16Array(width * height);
        transparentIndices.fill(-1);
        nextLayer.indices = encodeTypedArray(transparentIndices);
      }
      return nextLayer;
    }

    async function restoreCanvasPayload(canvasPayload, entries) {
      const nextCanvas = cloneJsonValue(canvasPayload) || {};
      const width = Math.max(1, Math.round(Number(nextCanvas.width) || 1));
      const height = Math.max(1, Math.round(Number(nextCanvas.height) || 1));
      nextCanvas.frames = await Promise.all((Array.isArray(canvasPayload?.frames) ? canvasPayload.frames : []).map(async frame => {
        const nextFrame = cloneJsonValue(frame) || {};
        nextFrame.layers = await Promise.all((Array.isArray(frame?.layers) ? frame.layers : []).map(layer => (
          restoreCanvasLayer(layer, width, height, entries)
        )));
        return nextFrame;
      }));
      return nextCanvas;
    }

    async function restorePackagedProjectBody(projectPayload, entries) {
      const packaged = cloneJsonValue(projectPayload) || {};
      const canvasEntries = Array.isArray(projectPayload?.canvasEntries) ? projectPayload.canvasEntries : [];
      const restoredCanvases = [];
      for (let index = 0; index < canvasEntries.length; index += 1) {
        const canvasEntry = canvasEntries[index];
        const canvasPayload = readJsonEntry(entries, canvasEntry.path);
        restoredCanvases.push(await restoreCanvasPayload(canvasPayload, entries));
      }

      const baseDocument = cloneJsonValue(projectPayload?.document) || {};
      const activeCanvasId = typeof baseDocument.activeCanvasId === 'string' && baseDocument.activeCanvasId
        ? baseDocument.activeCanvasId
        : (restoredCanvases[0]?.id || '');
      const activeCanvas = restoredCanvases.find(canvas => canvas?.id === activeCanvasId) || restoredCanvases[0] || null;
      if (projectPayload?.hadCanvases && restoredCanvases.length) {
        baseDocument.canvases = restoredCanvases;
      } else {
        delete baseDocument.canvases;
      }
      if (activeCanvas) {
        baseDocument.width = Math.max(1, Math.round(Number(baseDocument.width) || Number(activeCanvas.width) || 1));
        baseDocument.height = Math.max(1, Math.round(Number(baseDocument.height) || Number(activeCanvas.height) || 1));
        baseDocument.frames = cloneJsonValue(activeCanvas.frames || []);
        if (!Number.isFinite(Number(baseDocument.activeFrame))) {
          baseDocument.activeFrame = Math.max(0, Math.round(Number(activeCanvas.activeFrame) || 0));
        }
        if (typeof baseDocument.activeLayer !== 'string' || !baseDocument.activeLayer) {
          baseDocument.activeLayer = typeof activeCanvas.activeLayer === 'string' ? activeCanvas.activeLayer : '';
        }
        if (!baseDocument.mirror && activeCanvas.mirror) {
          baseDocument.mirror = cloneJsonValue(activeCanvas.mirror);
        }
        if (!baseDocument.selectionMask && activeCanvas.selectionMask) {
          baseDocument.selectionMask = activeCanvas.selectionMask;
        }
        if (!baseDocument.selectionContentMask && activeCanvas.selectionContentMask) {
          baseDocument.selectionContentMask = activeCanvas.selectionContentMask;
        }
        if (!baseDocument.selectionBounds && activeCanvas.selectionBounds) {
          baseDocument.selectionBounds = cloneJsonValue(activeCanvas.selectionBounds);
        }
      }

      delete packaged.storageVersion;
      delete packaged.storageAdapterId;
      delete packaged.hadCanvases;
      delete packaged.canvasEntries;
      packaged.session = restoreSessionFromArchive(projectPayload?.session, entries);
      packaged.document = baseDocument;
      return packaged;
    }

    function isSheetArchiveManifestEntry(sheet = null) {
      return Boolean(
        sheet
        && typeof sheet === 'object'
        && typeof sheet.path === 'string'
        && sheet.path.startsWith('sheets/')
        && sheet.path.endsWith('/project.json')
        && !Object.prototype.hasOwnProperty.call(sheet, 'project')
      );
    }

    async function restoreArchiveProject(entries) {
      const manifest = readJsonEntry(entries, 'manifest.json');
      const projectPayload = readJsonEntry(entries, 'project.json');
      if (manifest?.format !== 'pixieedraw' || Number(manifest?.version) !== 2) {
        throw createCodecError('ERR_UNSUPPORTED_ARCHIVE_MANIFEST', 'Unsupported PiXiEEDraw archive manifest');
      }
      const sheetManifests = Array.isArray(projectPayload?.sheets)
        ? projectPayload.sheets.filter(isSheetArchiveManifestEntry)
        : [];
      if (!sheetManifests.length) {
        return {
          packaged: await restorePackagedProjectBody(projectPayload, entries),
          archiveManifest: manifest,
          archiveProject: projectPayload,
        };
      }

      const restoredSheets = [];
      for (let index = 0; index < sheetManifests.length; index += 1) {
        const sheetManifest = sheetManifests[index];
        const sheetProjectPayload = readJsonEntry(entries, sheetManifest.path);
        const restoredProject = await restorePackagedProjectBody(sheetProjectPayload, entries);
        const restoredSheet = cloneJsonValue(sheetManifest) || {};
        delete restoredSheet.path;
        restoredSheet.project = restoredProject;
        restoredSheets.push(restoredSheet);
      }

      const packaged = cloneJsonValue(projectPayload) || {};
      const activeSheetId = typeof projectPayload?.activeSheetId === 'string' && projectPayload.activeSheetId
        ? projectPayload.activeSheetId
        : (restoredSheets[0]?.id || '');
      const activeSheet = restoredSheets.find(sheet => sheet?.id === activeSheetId) || restoredSheets[0] || null;
      const activeSheetDocument = activeSheet?.project?.document && typeof activeSheet.project.document === 'object'
        ? cloneJsonValue(activeSheet.project.document)
        : {};
      const rootDocumentFallback = cloneJsonValue(projectPayload?.document) || {};
      const mergedRootDocument = {
        ...rootDocumentFallback,
        ...activeSheetDocument,
      };
      delete packaged.storageVersion;
      delete packaged.storageAdapterId;
      delete packaged.hadCanvases;
      delete packaged.canvasEntries;
      packaged.session = restoreSessionFromArchive(projectPayload?.session, entries);
      packaged.document = mergedRootDocument;
      packaged.sheets = restoredSheets;
      packaged.activeSheetId = activeSheetId;
      return {
        packaged,
        archiveManifest: manifest,
        archiveProject: projectPayload,
      };
    }

    function canReadBytes(bytes) {
      return isZipSignature(bytes);
    }

    async function decodeArchiveBytes(bytes, _options = {}) {
      const entries = parseStoredZipEntries(bytes);
      const restored = await restoreArchiveProject(entries);
      assertPackagedCanvasLimit(restored.packaged);
      return {
        packaged: restored.packaged,
        archiveManifest: restored.archiveManifest,
        archiveProject: restored.archiveProject,
        diagnostics: {
          sheetCount: Array.isArray(restored.archiveProject?.sheets) ? restored.archiveProject.sheets.length : 0,
          bitmapCount: countArchiveBitmaps(entries),
          timelapseIncluded: resolveTimelapseIncluded(restored.archiveProject),
        },
      };
    }

    async function readManifestFromBytes(bytes) {
      const entries = parseStoredZipEntries(bytes);
      return readJsonEntry(entries, 'manifest.json');
    }

    async function readManifestFromBlob(blob) {
      if (!blob || typeof blob.slice !== 'function') {
        throw createCodecError('ERR_NOT_ZIP_ARCHIVE', 'Project archive blob is not readable');
      }
      const headerBytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
      if (!isZipSignature(headerBytes) || headerBytes.length < 30) {
        throw createCodecError('ERR_NOT_ZIP_ARCHIVE', 'Project archive is not a ZIP payload');
      }
      const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
      if (view.getUint32(0, true) !== 0x04034b50 || view.getUint16(8, true) !== 0) {
        throw createCodecError('ERR_UNSUPPORTED_ZIP_ENTRY', 'Unsupported manifest ZIP entry');
      }
      const compressedSize = view.getUint32(18, true);
      const filenameLength = view.getUint16(26, true);
      const extraLength = view.getUint16(28, true);
      const dataEnd = 30 + filenameLength + extraLength + compressedSize;
      const manifestBytes = new Uint8Array(await blob.slice(0, dataEnd).arrayBuffer());
      return await readManifestFromBytes(manifestBytes);
    }

    return Object.freeze({
      canReadBytes,
      readManifestFromBytes,
      readManifestFromBlob,
      encodePackagedProject,
      decodeArchiveBytes,
    });
  }

  root.projectStorageV2ArchiveCodec = Object.freeze({
    createProjectStorageV2ArchiveCodec,
  });
})();
