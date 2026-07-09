(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixieeDrawV2ZipAdapter({
    PROJECT_FILE_EXTENSION = '.pixieedraw',
    PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw',
    PROJECT_PACKAGE_TYPE = 'pixieedraw-project',
    buildPackagedProjectPayload,
    createAutosaveFileName,
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
    const ADAPTER_ID = 'pixieedraw-v2-zip-experimental';

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
        throw new Error('Blob is not available for project archive serialization');
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
        throw new Error('TextDecoder is not available');
      }
      return new TextDecoderCtor().decode(bytes);
    }

    function encodeText(text) {
      if (!TextEncoderCtor) {
        throw new Error('TextEncoder is not available');
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
        throw new Error('Project archive is not a ZIP payload');
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
          throw new Error('Unsupported ZIP entry signature in project archive');
        }
        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const filenameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        if (compressionMethod !== 0) {
          throw new Error('Compressed ZIP entries are not supported for project archive parsing');
        }
        const filenameStart = offset + 30;
        const filenameEnd = filenameStart + filenameLength;
        const extraEnd = filenameEnd + extraLength;
        const dataEnd = extraEnd + compressedSize;
        if (dataEnd > bytes.length) {
          throw new Error('Project archive entry exceeds byte length');
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
        throw new Error(`Missing project archive entry: ${filename}`);
      }
      return JSONGlobal.parse(decodeText(bytes));
    }

    async function compressProjectBytes(bytes) {
      if (typeof compressBytes === 'function') {
        return await compressBytes(bytes);
      }
      if (!CompressionStreamCtor || !ResponseCtor || !BlobCtor) {
        throw new Error('CompressionStream is not available for v2 project save');
      }
      const stream = new BlobCtor([bytes]).stream().pipeThrough(new CompressionStreamCtor('deflate'));
      return new Uint8Array(await new ResponseCtor(stream).arrayBuffer());
    }

    async function buildProjectZipBlob(tasks) {
      if (typeof buildZipBlobFromTasks === 'function') {
        return await buildZipBlobFromTasks(tasks);
      }
      if (!BlobCtor) {
        throw new Error('Blob is not available for fallback ZIP serialization');
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
        return await decompressBytes(bytes);
      }
      if (!DecompressionStreamCtor || !ResponseCtor || !BlobCtor) {
        throw new Error('DecompressionStream is not available for v2 project load');
      }
      const stream = new BlobCtor([bytes]).stream().pipeThrough(new DecompressionStreamCtor('deflate'));
      return new Uint8Array(await new ResponseCtor(stream).arrayBuffer());
    }

    async function digestProjectBytes(bytes) {
      if (typeof digestBytes === 'function') {
        return await digestBytes(bytes);
      }
      if (!CryptoGlobal?.subtle?.digest) {
        throw new Error('crypto.subtle.digest is not available for v2 project save');
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

    async function normalizeBitmapPayload(base64, width, height, {
      indicesBase64 = '',
      directOnly = false,
      onlyTransparentIndices = false,
      bitmapTasksByHash,
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
      const hash = await sha256Hex(cropped);
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

    async function normalizeCanvasForArchive(canvasPayload, bitmapTasksByHash) {
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
          });
          const importSourceCel = await normalizeBitmapPayload(layer.importSourceDirect, width, height, {
            directOnly: true,
            onlyTransparentIndices: false,
            bitmapTasksByHash,
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

    async function serializeArchiveProject(projectState, options = {}) {
      if (typeof buildPackagedProjectPayload !== 'function') {
        throw new Error('buildPackagedProjectPayload is required for v2 project serialization');
      }
      const snapshot = projectState?.snapshot || null;
      const session = projectState?.session || null;
      const packaged = buildPackagedProjectPayload(snapshot, {
        session,
        updatedAt: options?.updatedAt || '',
        includeSheets: options?.includeSheets === true,
      });
      const documentPayload = packaged?.document;
      if (!documentPayload || typeof documentPayload !== 'object') {
        throw new Error('Packaged project document is missing');
      }

      const bitmapTasksByHash = new Map();
      const { hadCanvases, canvases } = listCanvasSources(documentPayload);
      const normalizedCanvases = [];
      const canvasEntries = [];
      for (let index = 0; index < canvases.length; index += 1) {
        const canvasSource = canvases[index];
        const normalizedCanvas = await normalizeCanvasForArchive(canvasSource, bitmapTasksByHash);
        const canvasId = typeof normalizedCanvas?.id === 'string' && normalizedCanvas.id
          ? normalizedCanvas.id
          : `canvas-${index + 1}`;
        const canvasPath = `canvases/${normalizePathSegment(canvasId, `canvas-${index + 1}`)}.json`;
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

      const baseDocument = cloneJsonValue(documentPayload) || {};
      delete baseDocument.frames;
      delete baseDocument.canvases;
      const activeCanvasId = typeof documentPayload.activeCanvasId === 'string' && documentPayload.activeCanvasId
        ? documentPayload.activeCanvasId
        : (canvasEntries[0]?.id || '');

      const projectPayload = cloneJsonValue(packaged) || {};
      projectPayload.storageVersion = 2;
      projectPayload.storageAdapterId = ADAPTER_ID;
      projectPayload.hadCanvases = hadCanvases;
      projectPayload.canvasEntries = canvasEntries;
      projectPayload.document = {
        ...baseDocument,
        activeCanvasId,
      };

      const manifest = {
        format: 'pixieedraw',
        version: 2,
        storageAdapterId: ADAPTER_ID,
        packageType: packaged.type || PROJECT_PACKAGE_TYPE,
        packageVersion: Math.max(1, Math.round(Number(packaged.packageVersion) || 2)),
        documentVersion: Math.max(1, Math.round(Number(documentPayload.version) || Number(packaged.version) || 1)),
        width: Math.max(1, Math.round(Number(documentPayload.width) || 1)),
        height: Math.max(1, Math.round(Number(documentPayload.height) || 1)),
        canvasCount: canvasEntries.length,
        activeCanvasId,
        documentName: typeof documentPayload.documentName === 'string' ? documentPayload.documentName : '',
        updatedAt: typeof packaged.updatedAt === 'string' ? packaged.updatedAt : '',
      };

      const tasks = [
        {
          filename: 'manifest.json',
          blob: createJsonBlob(manifest),
        },
        {
          filename: 'project.json',
          blob: createJsonBlob(projectPayload),
        },
      ];
      normalizedCanvases.forEach(entry => {
        tasks.push({
          filename: entry.path,
          blob: createJsonBlob(entry.payload),
        });
      });
      bitmapTasksByHash.forEach(task => {
        tasks.push(task);
      });

      const blob = await buildProjectZipBlob(tasks);
      const fileNameBase = options?.fileNameBase || snapshot?.documentName || '';
      const filename = typeof createAutosaveFileName === 'function'
        ? createAutosaveFileName(fileNameBase)
        : `project${PROJECT_FILE_EXTENSION}`;
      return {
        packaged,
        archiveManifest: manifest,
        archiveProject: projectPayload,
        blob,
        filename,
        mimeType: PROJECT_FILE_MIME_TYPE,
        fileExtension: PROJECT_FILE_EXTENSION,
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
        const bitmapBytes = entries.get(String(layer.cel.bitmapRef || ''));
        if (!(bitmapBytes instanceof Uint8Array)) {
          throw new Error(`Missing bitmap entry: ${layer.cel.bitmapRef}`);
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
        const bitmapBytes = entries.get(String(layer.importSourceCel.bitmapRef || ''));
        if (!(bitmapBytes instanceof Uint8Array)) {
          throw new Error(`Missing import source bitmap entry: ${layer.importSourceCel.bitmapRef}`);
        }
        const inflated = await decompressProjectBytes(bitmapBytes);
        nextLayer.importSourceDirect = typeof encodeTypedArray === 'function'
          ? encodeTypedArray(inflateCroppedRgba(layer.importSourceCel, inflated, width, height))
          : null;
      } else {
        nextLayer.importSourceDirect = null;
      }

      nextLayer.directOnly = Boolean(layer.directOnly);
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

    async function restoreArchiveProject(entries) {
      const manifest = readJsonEntry(entries, 'manifest.json');
      const projectPayload = readJsonEntry(entries, 'project.json');
      if (manifest?.format !== 'pixieedraw' || Number(manifest?.version) !== 2) {
        throw new Error('Unsupported PiXiEEDraw archive manifest');
      }
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
      packaged.document = baseDocument;
      return packaged;
    }

    function canReadBytes(bytes) {
      return isZipSignature(bytes);
    }

    async function parseBytes(bytes) {
      const entries = parseStoredZipEntries(bytes);
      return await restoreArchiveProject(entries);
    }

    async function readManifestFromBytes(bytes) {
      const entries = parseStoredZipEntries(bytes);
      return readJsonEntry(entries, 'manifest.json');
    }

    async function serializeProject(projectState, options = {}) {
      return await serializeArchiveProject(projectState, options);
    }

    return Object.freeze({
      id: ADAPTER_ID,
      fileExtension: PROJECT_FILE_EXTENSION,
      mimeType: PROJECT_FILE_MIME_TYPE,
      canReadBytes,
      parseBytes,
      readManifestFromBytes,
      serializeProject,
    });
  }

  root.projectStorageV2ZipAdapter = Object.freeze({
    createPixieeDrawV2ZipAdapter,
  });
})();
