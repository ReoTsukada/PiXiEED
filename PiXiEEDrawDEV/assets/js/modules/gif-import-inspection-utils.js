(() => {
  const host = typeof window !== 'undefined'
    ? window
    : (typeof self !== 'undefined' ? self : globalThis);
  if (!host) return;

  const root = host.PiXiEEDrawModules = host.PiXiEEDrawModules || {};

  function createGifImportInspectionUtils({ cryptoGlobal = typeof crypto !== 'undefined' ? crypto : null } = {}) {
    function toByteView(value) {
      if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      }
      if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
      }
      if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      }
      return null;
    }

    function bytesFromBase64(value) {
      if (typeof value !== 'string' || !value) return null;
      if (typeof atob !== 'function') return null;
      try {
        const text = atob(value);
        const bytes = new Uint8Array(text.length);
        for (let index = 0; index < text.length; index += 1) {
          bytes[index] = text.charCodeAt(index);
        }
        return bytes;
      } catch (_) {
        return null;
      }
    }

    function toInspectableBytes(value) {
      return toByteView(value) || bytesFromBase64(value);
    }

    function readFrameDuration(frame) {
      const value = Number(frame?.duration ?? frame?.durationMs);
      return Number.isFinite(value) && value >= 0 ? value : null;
    }

    function readDisposalMethod(frame) {
      const value = Number(frame?.disposal ?? frame?.disposalMethod);
      return Number.isFinite(value) ? value : null;
    }

    function createFallbackHash(bytes, width, height) {
      let hash = 2166136261;
      const feed = value => {
        hash ^= value & 0xff;
        hash = Math.imul(hash, 16777619) >>> 0;
      };
      [width, height, bytes.byteLength].forEach(value => {
        feed(value);
        feed(value >>> 8);
        feed(value >>> 16);
        feed(value >>> 24);
      });
      for (let index = 0; index < bytes.length; index += 1) feed(bytes[index]);
      return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
    }

    async function hashBitmap(bytes, width, height) {
      if (cryptoGlobal?.subtle?.digest && typeof TextEncoder === 'function') {
        const header = new TextEncoder().encode(`${width}x${height}:`);
        const source = new Uint8Array(header.byteLength + bytes.byteLength);
        source.set(header);
        source.set(bytes, header.byteLength);
        const digest = await cryptoGlobal.subtle.digest('SHA-256', source);
        return `sha256-${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')}`;
      }
      return createFallbackHash(bytes, width, height);
    }

    function readDecodedFrames(candidate) {
      const frames = Array.isArray(candidate?.frames) ? candidate.frames : [];
      return frames.map((frame, frameIndex) => ({
        frame,
        frameIndex,
        width: Math.max(0, Math.round(Number(frame?.imageData?.width ?? candidate?.width) || 0)),
        height: Math.max(0, Math.round(Number(frame?.imageData?.height ?? candidate?.height) || 0)),
        buffers: [{ role: 'decoded-rgba', value: frame?.imageData?.data }],
      }));
    }

    function readPackagedFrames(candidate) {
      const documentPayload = candidate?.project?.document || candidate?.document || null;
      const canvases = Array.isArray(documentPayload?.canvases) ? documentPayload.canvases : [];
      const entries = [];
      canvases.forEach(canvas => {
        const width = Math.max(0, Math.round(Number(canvas?.width ?? documentPayload?.width) || 0));
        const height = Math.max(0, Math.round(Number(canvas?.height ?? documentPayload?.height) || 0));
        (Array.isArray(canvas?.frames) ? canvas.frames : []).forEach((frame, frameIndex) => {
          (Array.isArray(frame?.layers) ? frame.layers : []).forEach(layer => {
            entries.push({
              frame,
              frameIndex,
              width,
              height,
              buffers: [
                { role: 'direct', value: layer?.direct },
                { role: 'import-source-direct', value: layer?.importSourceDirect },
              ],
            });
          });
        });
      });
      return entries;
    }

    /**
     * Inspection-only. It never changes the candidate, its typed arrays, or
     * ownership. Prefer decoded GIF output for a one-bitmap-per-frame view;
     * packaged candidates also include direct/import-source-direct buffers.
     */
    async function inspectGifImportMemoryMetrics(candidate) {
      const decodedFrames = readDecodedFrames(candidate);
      const frameSources = decodedFrames.length ? decodedFrames : readPackagedFrames(candidate);
      const frameDetails = [];
      const bitmapHashes = new Map();
      let bitmapCount = 0;
      let totalTypedBytes = 0;

      for (const source of frameSources) {
        const hashes = [];
        let frameTypedByteLength = 0;
        let transparent = false;
        for (const buffer of source.buffers) {
          const bytes = toInspectableBytes(buffer.value);
          if (!bytes) continue;
          for (let index = 3; index < bytes.length; index += 4) {
            if (bytes[index] === 0) {
              transparent = true;
              break;
            }
          }
          const hash = await hashBitmap(bytes, source.width, source.height);
          bitmapCount += 1;
          totalTypedBytes += bytes.byteLength;
          frameTypedByteLength += bytes.byteLength;
          hashes.push({ role: buffer.role, hash, typedByteLength: bytes.byteLength });
          if (!bitmapHashes.has(hash)) bitmapHashes.set(hash, bytes.byteLength);
        }
        if (!hashes.length) continue;
        frameDetails.push({
          frameIndex: source.frameIndex,
          width: source.width,
          height: source.height,
          durationMs: readFrameDuration(source.frame),
          disposalMethod: readDisposalMethod(source.frame),
          transparent,
          typedByteLength: frameTypedByteLength,
          bitmapId: hashes[0].hash,
          sharesBitmapWithPrevious: frameDetails.length > 0 && frameDetails[frameDetails.length - 1].bitmapId === hashes[0].hash,
          bitmaps: hashes,
        });
      }

      const uniqueTypedBytes = Array.from(bitmapHashes.values()).reduce((sum, value) => sum + value, 0);
      return {
        frameCount: frameDetails.length,
        bitmapCount,
        uniqueBitmapCountByHash: bitmapHashes.size,
        uniqueBitmapCount: bitmapHashes.size,
        duplicateBitmapCount: Math.max(0, bitmapCount - bitmapHashes.size),
        totalTypedBytes,
        uniqueTypedBytes,
        dedupePotentialBytes: Math.max(0, totalTypedBytes - uniqueTypedBytes),
        originalGifBytes: Math.max(0, Number(candidate?.originalGifBytes ?? candidate?.sourceFileBytes) || 0),
        loopCount: typeof candidate?.loopCount === 'number' ? candidate.loopCount : null,
        frames: frameDetails,
      };
    }

    return Object.freeze({
      inspectGifImportMemoryMetrics,
    });
  }

  root.gifImportInspectionUtils = {
    createGifImportInspectionUtils,
  };
})();
