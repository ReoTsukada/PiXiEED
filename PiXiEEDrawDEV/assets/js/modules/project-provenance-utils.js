(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  // This module deliberately stores only short, irreversible identifiers.
  // It never puts an imported PNG/GIF's bytes into a project package.
  function createProjectProvenanceUtils() {
    async function sha256Hex(value) {
      if (!value || !globalThis.crypto?.subtle?.digest) return null;
      try {
        const buffer = value instanceof ArrayBuffer
          ? value
          : (ArrayBuffer.isView(value)
            ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
            : null);
        if (!buffer) return null;
        const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        console.warn('[pixieedraw-dev:provenance] fingerprint hash failed', error);
        return null;
      }
    }

    function resolveRasterFrames(project) {
      const documentValue = project?.document && typeof project.document === 'object' ? project.document : {};
      const canvas = Array.isArray(documentValue.canvases) && documentValue.canvases.length
        ? documentValue.canvases[0]
        : documentValue;
      const width = Math.max(1, Math.floor(Number(canvas?.width) || Number(documentValue.width) || 1));
      const height = Math.max(1, Math.floor(Number(canvas?.height) || Number(documentValue.height) || 1));
      const frames = Array.isArray(canvas?.frames) ? canvas.frames : [];
      return frames.map((frame, index) => {
        const layer = Array.isArray(frame?.layers) ? frame.layers[0] : null;
        const pixels = layer?.direct instanceof Uint8ClampedArray
          ? layer.direct
          : (layer?.importSourceDirect instanceof Uint8ClampedArray ? layer.importSourceDirect : null);
        return { index, width, height, pixels };
      }).filter(frame => frame.pixels && frame.pixels.byteLength === frame.width * frame.height * 4);
    }

    function createDHash64(pixels, width, height) {
      // A compact perceptual identifier for a detector to use as a candidate
      // filter. SHA-256 remains the exact-match identifier.
      let bits = '';
      for (let y = 0; y < 8; y += 1) {
        const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / 8));
        let previous = 0;
        for (let x = 0; x < 9; x += 1) {
          const sourceX = Math.min(width - 1, Math.floor(x * width / 9));
          const offset = (sourceY * width + sourceX) * 4;
          const alpha = (pixels[offset + 3] || 0) / 255;
          const luminance = Math.round((((pixels[offset] || 0) * 299) + ((pixels[offset + 1] || 0) * 587) + ((pixels[offset + 2] || 0) * 114)) * alpha / 1000);
          if (x > 0) bits += luminance >= previous ? '1' : '0';
          previous = luminance;
        }
      }
      let hex = '';
      for (let index = 0; index < bits.length; index += 4) {
        hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
      }
      return hex.padStart(16, '0');
    }

    async function createRasterImportProvenance({ file = null, project = null, kind = 'image' } = {}) {
      let fileBytes = null;
      try {
        fileBytes = file && typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : null;
      } catch (error) {
        // Fingerprinting must not make an otherwise readable image unusable.
        console.warn('[pixieedraw-dev:provenance] source file hash unavailable', error);
      }
      const frames = resolveRasterFrames(project);
      const normalizedFrames = await Promise.all(frames.map(async frame => ({
        frameIndex: frame.index,
        width: frame.width,
        height: frame.height,
        rgbaSha256: await sha256Hex(frame.pixels),
        dHash64: createDHash64(frame.pixels, frame.width, frame.height),
      })));
      return {
        schemaVersion: 1,
        kind: kind === 'gif' ? 'gif' : 'image',
        capturedAt: new Date().toISOString(),
        rawDataRetained: false,
        sourceFileSha256: await sha256Hex(fileBytes),
        normalizedFrameFingerprints: normalizedFrames,
        matchingAlgorithms: ['sha256', 'rgba-sha256', 'dhash-64'],
        commercialRestrictionState: {
          sourceDataSale: 'unverified',
          resale: 'unverified',
          modification: 'unverified',
        },
      };
    }

    return { createRasterImportProvenance };
  }

  root.projectProvenanceUtils = { createProjectProvenanceUtils };
})();
