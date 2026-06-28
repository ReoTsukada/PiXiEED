(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createImageUtils({
    DEFAULT_IMPORT_FRAME_DURATION,
    IMPORT_FRAME_DURATION_MIN_MS,
    IMPORT_FRAME_DURATION_MAX_MS,
    MAX_IMAGE_IMPORT_SOURCE_SIZE,
    MAX_CANVAS_SIZE,
    clamp,
  } = {}) {
    function isImportableImageFile(file) {
      if (!file) return false;
      const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
      if (type === 'image/png' || type === 'image/gif') {
        return true;
      }
      const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
      return name.endsWith('.png') || name.endsWith('.gif');
    }

    function createImageImportError(message, cause) {
      const error = new Error(message);
      error.source = 'image-import';
      if (cause) {
        error.cause = cause;
      }
      return error;
    }

    function normalizeImportFrameDuration(durationMs) {
      const numeric = Number(durationMs);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return DEFAULT_IMPORT_FRAME_DURATION;
      }
      return clamp(Math.round(numeric), IMPORT_FRAME_DURATION_MIN_MS, IMPORT_FRAME_DURATION_MAX_MS);
    }

    function resolveImageImportTargetSize(width, height, { integerScaleFactor = 1 } = {}) {
      const sourceWidth = Math.max(1, Math.floor(Number(width) || 0));
      const sourceHeight = Math.max(1, Math.floor(Number(height) || 0));
      if (!sourceWidth || !sourceHeight) {
        throw createImageImportError('画像サイズが不正です');
      }
      if (sourceWidth > MAX_IMAGE_IMPORT_SOURCE_SIZE || sourceHeight > MAX_IMAGE_IMPORT_SOURCE_SIZE) {
        throw createImageImportError(`読み込み元画像は最大 ${MAX_IMAGE_IMPORT_SOURCE_SIZE}px までです`);
      }
      const normalizedScaleFactor = Math.max(1, Math.floor(Number(integerScaleFactor) || 1));
      const autoIntegerScaled = normalizedScaleFactor > 1
        && sourceWidth % normalizedScaleFactor === 0
        && sourceHeight % normalizedScaleFactor === 0;
      const effectiveSourceWidth = autoIntegerScaled
        ? Math.max(1, Math.floor(sourceWidth / normalizedScaleFactor))
        : sourceWidth;
      const effectiveSourceHeight = autoIntegerScaled
        ? Math.max(1, Math.floor(sourceHeight / normalizedScaleFactor))
        : sourceHeight;
      if (effectiveSourceWidth <= MAX_CANVAS_SIZE && effectiveSourceHeight <= MAX_CANVAS_SIZE) {
        return {
          sourceWidth,
          sourceHeight,
          width: effectiveSourceWidth,
          height: effectiveSourceHeight,
          scaled: autoIntegerScaled,
          integerScaleFactor: autoIntegerScaled ? normalizedScaleFactor : 1,
        };
      }
      const ratio = Math.min(MAX_CANVAS_SIZE / effectiveSourceWidth, MAX_CANVAS_SIZE / effectiveSourceHeight);
      const widthScaled = clamp(Math.floor(effectiveSourceWidth * ratio), 1, MAX_CANVAS_SIZE);
      const heightScaled = clamp(Math.floor(effectiveSourceHeight * ratio), 1, MAX_CANVAS_SIZE);
      return {
        sourceWidth,
        sourceHeight,
        width: widthScaled,
        height: heightScaled,
        scaled: widthScaled !== sourceWidth
          || heightScaled !== sourceHeight
          || autoIntegerScaled,
        integerScaleFactor: autoIntegerScaled ? normalizedScaleFactor : 1,
      };
    }

    function getImageImportCheckFrameIndexes(frameCount) {
      const total = Math.max(0, Math.floor(Number(frameCount) || 0));
      if (total <= 0) {
        return [];
      }
      if (total === 1) {
        return [0];
      }
      const indexes = [0, Math.floor((total - 1) / 2), total - 1];
      const seen = new Set();
      const output = [];
      for (let i = 0; i < indexes.length; i += 1) {
        const index = indexes[i];
        if (seen.has(index)) {
          continue;
        }
        seen.add(index);
        output.push(index);
      }
      return output;
    }

    function getGreatestCommonDivisor(a, b) {
      let x = Math.abs(Math.floor(Number(a) || 0));
      let y = Math.abs(Math.floor(Number(b) || 0));
      if (!x || !y) {
        return 0;
      }
      while (y !== 0) {
        const next = x % y;
        x = y;
        y = next;
      }
      return x;
    }

    return Object.freeze({
      isImportableImageFile,
      createImageImportError,
      normalizeImportFrameDuration,
      resolveImageImportTargetSize,
      getImageImportCheckFrameIndexes,
      getGreatestCommonDivisor,
    });
  }

  root.imageUtils = Object.freeze({
    createImageUtils,
  });
})();
