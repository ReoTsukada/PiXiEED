(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportRenderingModule(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function buildVoxelPreviewAnimationFrameSet() {
    if (!isVoxelExtensionModeEnabled()) {
      return null;
    }
    const resolved = getVoxelExtensionResolvedCanvases();
    if (!resolved?.front || !resolved?.back || !resolved?.left || !resolved?.right || !resolved?.top || !resolved?.bottom) {
      return null;
    }
    const sourceCanvases = [resolved.front, resolved.back, resolved.left, resolved.right, resolved.top, resolved.bottom];
    const frameCount = sourceCanvases.reduce((max, canvasDoc) => (
      Math.max(max, Array.isArray(canvasDoc?.frames) ? canvasDoc.frames.length : 0)
    ), 0);
    if (frameCount <= 0) {
      return null;
    }
    const framePixels = [];
    const frameDurations = [];
    let previewWidth = 0;
    let previewHeight = 0;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const orientation = getVoxelPreviewOrientationForFrameIndex(
        frameIndex,
        voxelExtensionState.previewYawDeg,
        voxelExtensionState.previewPitchDeg
      );
      const rendered = buildVoxelPreviewPixels(
        resolved.front,
        resolved.back,
        resolved.left,
        resolved.right,
        resolved.top,
        resolved.bottom,
        {
          frameIndex,
          yawDeg: orientation.yawDeg,
          pitchDeg: orientation.pitchDeg,
        }
      );
      const scaledPreview = scaleVoxelPreviewPixels(
        rendered.pixels,
        rendered.width,
        rendered.height,
        1
      );
      framePixels.push(scaledPreview.pixels);
      frameDurations.push(
        clamp(
          Math.round(
            Number(getProjectCanvasFrameAt(resolved.front, frameIndex)?.duration)
            || Number(state.frames?.[frameIndex]?.duration)
            || (1000 / 12)
          ),
          16,
          2000
        )
      );
      previewWidth = scaledPreview.width;
      previewHeight = scaledPreview.height;
    }
    return {
      framePixels,
      frameDurations,
      width: Math.max(1, previewWidth),
      height: Math.max(1, previewHeight),
      frameCount,
    };
  }

  async function buildSpriteMapExportTasks({
    scale = 1,
    includeOriginal = false,
  } = {}) {
    const frameCount = state.frames.length;
    if (!frameCount) {
      return {
        tasks: [],
        frameCount: 0,
        layoutLabel: '',
        selectedScale: Math.max(1, Math.floor(Number(scale) || 1)),
        includeOriginal: false,
        spriteMapPlan: null,
      };
    }
    const { width, height } = state;
    const selectedScale = Math.max(1, Math.floor(Number(scale) || 1));
    const framePixels = compositeDocumentFrames(state.frames, width, height, state.palette);
    const spriteMapPlan = buildSpriteMapExportPlan(framePixels, width, height, state.palette, {
      includeColorSprites: exportColorSpritesEnabled,
    });
    const variants = [{ scale: selectedScale, isOriginal: false }];
    if (includeOriginal) {
      variants.push({ scale: 1, isOriginal: true });
    }
    const tasks = [];
    const layoutLabel = `${spriteMapPlan.columns}x${spriteMapPlan.rows}`;
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
      const variant = variants[variantIndex];
      const spriteMap = buildSpriteMapCanvas(spriteMapPlan.framePixels, width, height, {
        scale: variant.scale,
        columns: spriteMapPlan.columns,
        rows: spriteMapPlan.rows,
        placements: spriteMapPlan.placements,
      });
      const blob = await canvasToBlob(spriteMap.canvas, 'image/png');
      if (!blob) {
        throw new Error('Failed to create SpriteMAP blob');
      }
      let suffix = 'spritemap';
      if (variant.scale > 1 || includeOriginal) {
        suffix += `_x${variant.scale}`;
      }
      tasks.push({
        blob,
        filename: createExportFileName('png', suffix),
        mimeType: 'image/png',
        fileExtensions: ['.png'],
        shareText: `SpriteMAPを書き出しました (${layoutLabel}${spriteMapPlan.colorSpriteCount > 0 ? ` / 色${spriteMapPlan.usedColorCount}` : ''}${variant.scale > 1 ? ` / ×${variant.scale}` : ''})`,
      });
    }
    return {
      tasks,
      frameCount,
      layoutLabel,
      selectedScale,
      includeOriginal,
      spriteMapPlan,
    };
  }

  function buildColorSpriteExportPlanFromFramePixels(framePixels, width, height, palette = state.palette) {
    const usedColors = collectUsedColorsFromFramePixels(framePixels, palette);
    const colorSpriteSet = buildColorSpriteFramesFromColors(usedColors, width, height);
    return {
      framePixels: colorSpriteSet.framePixels,
      colorCount: colorSpriteSet.colorCount,
      spriteCount: colorSpriteSet.spriteCount,
      columns: 1,
      rows: Math.max(1, colorSpriteSet.spriteCount),
      sheetWidth: Math.max(1, width),
      sheetHeight: Math.max(1, height) * Math.max(1, colorSpriteSet.spriteCount),
    };
  }

  function copyPixelBlockToBuffer(sourcePixels, sourceWidth, sourceHeight, targetPixels, targetWidth, offsetX = 0, offsetY = 0) {
    const safeSourceWidth = Math.max(1, Math.floor(Number(sourceWidth) || 0));
    const safeSourceHeight = Math.max(1, Math.floor(Number(sourceHeight) || 0));
    const safeTargetWidth = Math.max(1, Math.floor(Number(targetWidth) || 0));
    const startX = Math.max(0, Math.floor(Number(offsetX) || 0));
    const startY = Math.max(0, Math.floor(Number(offsetY) || 0));
    if (!(sourcePixels instanceof Uint8ClampedArray) || !(targetPixels instanceof Uint8ClampedArray)) {
      return;
    }
    for (let y = 0; y < safeSourceHeight; y += 1) {
      const sourceStart = y * safeSourceWidth * 4;
      const targetStart = ((startY + y) * safeTargetWidth * 4) + (startX * 4);
      targetPixels.set(sourcePixels.subarray(sourceStart, sourceStart + (safeSourceWidth * 4)), targetStart);
    }
  }

  function buildColorSpriteAppendAreaFromFramePixels(framePixels, width, height, palette = state.palette) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 0));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 0));
    const plan = buildColorSpriteExportPlanFromFramePixels(framePixels, safeWidth, safeHeight, palette);
    if (!plan.spriteCount || !plan.framePixels.length) {
      return null;
    }
    const areaWidth = Math.max(1, plan.sheetWidth);
    const areaHeight = Math.max(1, plan.sheetHeight);
    const pixels = new Uint8ClampedArray(areaWidth * areaHeight * 4);
    plan.framePixels.forEach((spritePixels, spriteIndex) => {
      copyPixelBlockToBuffer(spritePixels, safeWidth, safeHeight, pixels, areaWidth, 0, spriteIndex * safeHeight);
    });
    return {
      pixels,
      width: areaWidth,
      height: areaHeight,
      colorCount: plan.colorCount,
      spriteCount: plan.spriteCount,
    };
  }

  function appendColorSpriteAreaToFramePixels(basePixels, width, height, colorSpriteArea) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 0));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 0));
    if (!(basePixels instanceof Uint8ClampedArray) || !colorSpriteArea?.pixels) {
      return {
        pixels: basePixels instanceof Uint8ClampedArray ? basePixels : new Uint8ClampedArray(safeWidth * safeHeight * 4),
        width: safeWidth,
        height: safeHeight,
      };
    }
    const areaWidth = Math.max(1, Math.floor(Number(colorSpriteArea.width) || 0));
    const areaHeight = Math.max(1, Math.floor(Number(colorSpriteArea.height) || 0));
    const outputWidth = safeWidth + areaWidth;
    const outputHeight = Math.max(safeHeight, areaHeight);
    const outputPixels = new Uint8ClampedArray(outputWidth * outputHeight * 4);
    copyPixelBlockToBuffer(basePixels, safeWidth, safeHeight, outputPixels, outputWidth, 0, 0);
    copyPixelBlockToBuffer(colorSpriteArea.pixels, areaWidth, areaHeight, outputPixels, outputWidth, safeWidth, 0);
    return {
      pixels: outputPixels,
      width: outputWidth,
      height: outputHeight,
    };
  }

  function buildColorSpriteAppendAreaForCurrentExport(mode) {
    if (!shouldAppendColorSpritesToPrimaryExport(mode)) {
      return null;
    }
    const exportFrameSet = buildExportFrameSet();
    if (!exportFrameSet?.frameCount || !Array.isArray(exportFrameSet.framePixels) || !exportFrameSet.framePixels.length) {
      return null;
    }
    return buildColorSpriteAppendAreaFromFramePixels(
      exportFrameSet.framePixels,
      exportFrameSet.width,
      exportFrameSet.height,
      state.palette
    );
  }

  function appendColorSpriteAreaToStillFrameSet(stillFrame, mode, colorSpriteArea = null) {
    if (!stillFrame || !shouldAppendColorSpritesToPrimaryExport(mode)) {
      return stillFrame;
    }
    const area = colorSpriteArea || buildColorSpriteAppendAreaForCurrentExport(mode);
    if (!area) {
      return stillFrame;
    }
    const appended = appendColorSpriteAreaToFramePixels(stillFrame.pixels, stillFrame.width, stillFrame.height, area);
    return {
      ...stillFrame,
      pixels: appended.pixels,
      width: appended.width,
      height: appended.height,
      colorSpriteCount: area.spriteCount,
      usedColorCount: area.colorCount,
    };
  }

  function appendColorSpriteAreaToFrameSet(frameSet, mode) {
    if (!frameSet || !shouldAppendColorSpritesToPrimaryExport(mode)) {
      return frameSet;
    }
    const framePixels = Array.isArray(frameSet.framePixels) ? frameSet.framePixels : [];
    if (!framePixels.length) {
      return frameSet;
    }
    const area = buildColorSpriteAppendAreaFromFramePixels(framePixels, frameSet.width, frameSet.height, state.palette);
    if (!area) {
      return frameSet;
    }
    const appendedFrames = framePixels.map(pixels => appendColorSpriteAreaToFramePixels(
      pixels,
      frameSet.width,
      frameSet.height,
      area
    ).pixels);
    return {
      ...frameSet,
      width: Math.max(1, Math.floor(Number(frameSet.width) || 0)) + area.width,
      height: Math.max(Math.max(1, Math.floor(Number(frameSet.height) || 0)), area.height),
      framePixels: appendedFrames,
      colorSpriteCount: area.spriteCount,
      usedColorCount: area.colorCount,
    };
  }

  async function exportProjectAsSpriteMap(options = {}) {
    const companionExport = Boolean(options?.companionExport);
    const includeProjectCompanion = options?.includeProjectCompanion !== undefined
      ? Boolean(options.includeProjectCompanion)
      : shouldSaveProjectCompanion('spritemap');
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'spritemap' })) {
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true };
    }
    const frameCount = state.frames.length;
    if (!frameCount) {
      if (!companionExport) {
        updateAutosaveStatus('SpriteMAPにまとめるフレームがありません', 'warn');
      }
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true };
    }
    try {
      const spriteMapExport = await buildSpriteMapExportTasks({
        scale: 1,
        includeOriginal: false,
      });
      const { tasks, layoutLabel, spriteMapPlan } = spriteMapExport;

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/png',
        fileExtensions: ['.png'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'SpriteMAPを書き出しました',
        mode: 'spritemap',
        includeProjectCompanion,
        archiveSuffix: 'spritemap',
        archiveShareText: includeProjectCompanion
          ? 'SpriteMAP一式をZIPで書き出し、.pxdを同期しました'
          : 'SpriteMAP一式をZIPで書き出しました',
      });
      const detailParts = [`全${frameCount}フレーム`, `配置 ${layoutLabel}`];
      if (spriteMapPlan.colorSpriteCount > 0) {
        detailParts.push(`使用色 ${spriteMapPlan.usedColorCount}色`);
        detailParts.push(`色スプライト ${spriteMapPlan.colorSpriteCount}枚`);
      }
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';

      if (!companionExport) {
        if (result.exportedCount === result.total) {
          updateAutosaveStatus(`SpriteMAPを書き出しました${detail}`, 'success');
        } else if (result.wasCancelled) {
          const remaining = result.total - result.exportedCount;
          updateAutosaveStatus(remaining === result.total
            ? 'SpriteMAPの書き出しをキャンセルしました'
            : `SpriteMAPを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
        } else if (result.exportedCount > 0 && result.hadFailure) {
          updateAutosaveStatus(`SpriteMAPを書き出しましたが ${result.total - result.exportedCount} 件エクスポートできませんでした`, 'warn');
        } else {
          updateAutosaveStatus('SpriteMAPの書き出しに失敗しました', 'error');
        }
      }
      if (result.exportedCount > 0) {
        markDocumentDurablySaved();
        if (result.exportedCount === result.total && !result.wasCancelled && !result.hadFailure) {
          const companionResult = includeProjectCompanion
            ? (result.projectCompanionResult || 'failed')
            : 'skipped';
          if (!companionExport) {
            announceProjectCompanionSaveResult('spritemap', companionResult);
          }
        }
        if (!companionExport) {
          showLoginPromptAfterExport();
        }
      }
      return result;
    } catch (error) {
      console.error('SpriteMAP export failed', error);
      if (!companionExport) {
        updateAutosaveStatus('SpriteMAPの書き出しに失敗しました', 'error');
      }
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true, error };
    }
  }

  function createJpegCanvasFromSourceCanvas(sourceCanvas) {
    if (!(sourceCanvas instanceof HTMLCanvasElement)) {
      throw new Error('JPEG変換対象キャンバスが不正です');
    }
    const output = document.createElement('canvas');
    output.width = Math.max(1, sourceCanvas.width);
    output.height = Math.max(1, sourceCanvas.height);
    const ctx = output.getContext('2d');
    if (!ctx) {
      throw new Error('JPEG出力キャンバスのコンテキストを取得できませんでした');
    }
    ctx.imageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(sourceCanvas, 0, 0, output.width, output.height);
    return output;
  }

  function toSvgColorHex(r, g, b) {
    const toHex = value => clamp(Math.round(Number(value) || 0), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function toSvgOpacity(alpha) {
    const normalized = clamp(Math.round(Number(alpha) || 0), 0, 255) / 255;
    return Number(normalized.toFixed(4)).toString();
  }

  function buildSvgMarkupFromPixels(pixels, width, height, scale = 1) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 0));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 0));
    const pixelScale = Math.max(1, Math.floor(Number(scale) || 1));
    const expectedLength = safeWidth * safeHeight * 4;
    if (!(pixels instanceof Uint8ClampedArray) || pixels.length < expectedLength) {
      throw new Error('SVG出力に必要なピクセルデータが不正です');
    }

    const outputWidth = safeWidth * pixelScale;
    const outputHeight = safeHeight * pixelScale;
    const parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}" shape-rendering="crispEdges">`,
    ];

    for (let y = 0; y < safeHeight; y += 1) {
      const rowBase = y * safeWidth * 4;
      let x = 0;
      while (x < safeWidth) {
        const base = rowBase + x * 4;
        const alpha = pixels[base + 3];
        if (!alpha) {
          x += 1;
          continue;
        }
        const red = pixels[base];
        const green = pixels[base + 1];
        const blue = pixels[base + 2];
        let runLength = 1;
        while (x + runLength < safeWidth) {
          const nextBase = rowBase + (x + runLength) * 4;
          if (
            pixels[nextBase] !== red
            || pixels[nextBase + 1] !== green
            || pixels[nextBase + 2] !== blue
            || pixels[nextBase + 3] !== alpha
          ) {
            break;
          }
          runLength += 1;
        }
        const rectX = x * pixelScale;
        const rectY = y * pixelScale;
        const rectWidth = runLength * pixelScale;
        const rectHeight = pixelScale;
        const fillColor = toSvgColorHex(red, green, blue);
        if (alpha >= 255) {
          parts.push(`<rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" fill="${fillColor}"/>`);
        } else {
          parts.push(
            `<rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" fill="${fillColor}" fill-opacity="${toSvgOpacity(alpha)}"/>`
          );
        }
        x += runLength;
      }
    }

    parts.push('</svg>');
    return parts.join('');
  }

  function buildSvgBlobFromPixels(pixels, width, height, scale = 1) {
    const svg = buildSvgMarkupFromPixels(pixels, width, height, scale);
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  async function exportProjectAsJpeg() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'jpeg' })) {
      return;
    }
    const frameCount = getCurrentExportFrames().length;
    if (!frameCount) {
      updateAutosaveStatus('JPEGを書き出すフレームがありません', 'warn');
      return;
    }
    try {
      const candidates = getExportScaleCandidates(undefined, { allowFullScan: true });
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const includeOriginal = shouldExportOriginalCompanion('jpeg', selectedScale);
      const colorSpriteArea = buildColorSpriteAppendAreaForCurrentExport('jpeg');
      const tasks = [];
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const stillFrame = appendColorSpriteAreaToStillFrameSet(
          buildStillExportFrameSet(frameIndex),
          'jpeg',
          colorSpriteArea
        );
        const { width, height, pixels } = stillFrame;
        const frameNumber = String(frameIndex + 1).padStart(2, '0');
        const baseCanvas = createFrameCanvas(pixels, width, height);
        const variants = [{ scale: selectedScale, isOriginal: false }];
        if (includeOriginal) {
          variants.push({ scale: 1, isOriginal: true });
        }
        for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
          const variant = variants[variantIndex];
          const scaledCanvas = scaleCanvasNearestNeighbor(baseCanvas, variant.scale);
          const jpegCanvas = createJpegCanvasFromSourceCanvas(scaledCanvas);
          const blob = await canvasToBlob(jpegCanvas, 'image/jpeg', 0.92);
          if (!blob) {
            throw new Error('Failed to create JPEG blob');
          }
          let suffix = frameCount > 1 ? `frame_${frameNumber}` : '';
          if (variant.scale > 1 || includeOriginal) {
            suffix = suffix ? `${suffix}_x${variant.scale}` : `x${variant.scale}`;
          }
          tasks.push({
            blob,
            filename: createExportFileName('jpg', suffix),
            shareText: `フレーム${frameIndex + 1}のJPEGを書き出しました${variant.scale > 1 ? ` (×${variant.scale})` : ''}`,
          });
        }
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/jpeg',
        fileExtensions: ['.jpg', '.jpeg'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'JPEGを書き出しました',
        mode: 'jpeg',
        includeProjectCompanion: shouldSaveProjectCompanion('jpeg'),
        archiveSuffix: 'jpeg_frames',
        archiveShareText: shouldSaveProjectCompanion('jpeg')
          ? 'JPEG一式をZIPで書き出し、.pxdを同期しました'
          : 'JPEG一式をZIPで書き出しました',
      });
      const detailParts = [];
      if (frameCount > 1) {
        detailParts.push(`全${frameCount}フレーム`);
      }
      if (selectedScale > 1) {
        detailParts.push(`×${selectedScale}`);
      }
      if (includeOriginal) {
        detailParts.push('原寸も追加');
      }
      if (colorSpriteArea) {
        detailParts.push(`カラースプライト ${colorSpriteArea.colorCount}色`);
      }
      detailParts.push('透明部分は白背景');
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';

      if (result.exportedCount === result.total) {
        updateAutosaveStatus(`JPEGを書き出しました${detail}`, 'success');
      } else if (result.wasCancelled) {
        const remaining = result.total - result.exportedCount;
        updateAutosaveStatus(remaining === result.total
          ? 'JPEGの書き出しをキャンセルしました'
          : `JPEGを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
      } else if (result.exportedCount > 0 && result.hadFailure) {
        updateAutosaveStatus(`JPEGを書き出しましたが ${result.total - result.exportedCount} 件エクスポートできませんでした`, 'warn');
      } else {
        updateAutosaveStatus('JPEGの書き出しに失敗しました', 'error');
      }
      if (result.exportedCount > 0) {
        markDocumentDurablySaved();
        if (result.exportedCount === result.total && !result.wasCancelled && !result.hadFailure) {
          const companionResult = shouldSaveProjectCompanion('jpeg')
            ? (result.projectCompanionResult || 'failed')
            : await maybeSaveProjectCompanionAfterExport('jpeg', {
              exportedCount: result.exportedCount,
              wasCancelled: result.wasCancelled,
            });
          announceProjectCompanionSaveResult('jpeg', companionResult);
        }
        showLoginPromptAfterExport();
      }
    } catch (error) {
      console.error('JPEG export failed', error);
      updateAutosaveStatus('JPEGの書き出しに失敗しました', 'error');
    }
  }

  async function exportProjectAsSvg() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'svg' })) {
      return;
    }
    const frameCount = getCurrentExportFrames().length;
    if (!frameCount) {
      updateAutosaveStatus('SVGを書き出すフレームがありません', 'warn');
      return;
    }
    try {
      const candidates = getExportScaleCandidates(undefined, { allowFullScan: true });
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const includeOriginal = shouldExportOriginalCompanion('svg', selectedScale);
      const colorSpriteArea = buildColorSpriteAppendAreaForCurrentExport('svg');
      const tasks = [];
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const stillFrame = appendColorSpriteAreaToStillFrameSet(
          buildStillExportFrameSet(frameIndex),
          'svg',
          colorSpriteArea
        );
        const { width, height, pixels } = stillFrame;
        const frameNumber = String(frameIndex + 1).padStart(2, '0');
        const variants = [{ scale: selectedScale, isOriginal: false }];
        if (includeOriginal) {
          variants.push({ scale: 1, isOriginal: true });
        }
        for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
          const variant = variants[variantIndex];
          const blob = buildSvgBlobFromPixels(pixels, width, height, variant.scale);
          let suffix = frameCount > 1 ? `frame_${frameNumber}` : '';
          if (variant.scale > 1 || includeOriginal) {
            suffix = suffix ? `${suffix}_x${variant.scale}` : `x${variant.scale}`;
          }
          tasks.push({
            blob,
            filename: createExportFileName('svg', suffix),
            shareText: `フレーム${frameIndex + 1}のSVGを書き出しました${variant.scale > 1 ? ` (×${variant.scale})` : ''}`,
          });
        }
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/svg+xml',
        fileExtensions: ['.svg'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'SVGを書き出しました',
        mode: 'svg',
        includeProjectCompanion: shouldSaveProjectCompanion('svg'),
        archiveSuffix: 'svg_frames',
        archiveShareText: shouldSaveProjectCompanion('svg')
          ? 'SVG一式をZIPで書き出し、.pxdを同期しました'
          : 'SVG一式をZIPで書き出しました',
      });
      const detailParts = [];
      if (frameCount > 1) {
        detailParts.push(`全${frameCount}フレーム`);
      }
      if (selectedScale > 1) {
        detailParts.push(`×${selectedScale}`);
      }
      if (includeOriginal) {
        detailParts.push('原寸も追加');
      }
      if (colorSpriteArea) {
        detailParts.push(`カラースプライト ${colorSpriteArea.colorCount}色`);
      }
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';

      if (result.exportedCount === result.total) {
        updateAutosaveStatus(`SVGを書き出しました${detail}`, 'success');
      } else if (result.wasCancelled) {
        const remaining = result.total - result.exportedCount;
        updateAutosaveStatus(remaining === result.total
          ? 'SVGの書き出しをキャンセルしました'
          : `SVGを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
      } else if (result.exportedCount > 0 && result.hadFailure) {
        updateAutosaveStatus(`SVGを書き出しましたが ${result.total - result.exportedCount} 件エクスポートできませんでした`, 'warn');
      } else {
        updateAutosaveStatus('SVGの書き出しに失敗しました', 'error');
      }
      if (result.exportedCount > 0) {
        markDocumentDurablySaved();
        if (result.exportedCount === result.total && !result.wasCancelled && !result.hadFailure) {
          const companionResult = shouldSaveProjectCompanion('svg')
            ? (result.projectCompanionResult || 'failed')
            : await maybeSaveProjectCompanionAfterExport('svg', {
              exportedCount: result.exportedCount,
              wasCancelled: result.wasCancelled,
            });
          announceProjectCompanionSaveResult('svg', companionResult);
        }
        showLoginPromptAfterExport();
      }
    } catch (error) {
      console.error('SVG export failed', error);
      updateAutosaveStatus('SVGの書き出しに失敗しました', 'error');
    }
  }

  async function exportProjectAsGlb() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'glb' })) {
      return;
    }
    if (!canExportVoxelGlbInCurrentState()) {
      updateAutosaveStatus(
        localizeText(
          'GLB はボクセルモードの6面入力がそろっている時だけ書き出せます',
          'GLB export requires voxel mode with all 6 source faces'
        ),
        'warn'
      );
      return;
    }
    try {
      const resolved = getVoxelExtensionResolvedCanvases();
      const glbBytes = buildVoxelGlbBinaryFromCanvases(
        resolved.front,
        resolved.back,
        resolved.left,
        resolved.right,
        resolved.top,
        resolved.bottom,
        {
          modelName: normalizeDocumentName(state.documentName || DEFAULT_DOCUMENT_NAME),
        }
      );
      const tasks = [{
        blob: new Blob([glbBytes], { type: 'model/gltf-binary' }),
        filename: createExportFileName('glb'),
        shareText: localizeText('GLBを書き出しました', 'Exported GLB'),
      }];
      const result = await deliverExportTasks(tasks, {
        mimeType: 'model/gltf-binary',
        fileExtensions: ['.glb'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: localizeText('GLBを書き出しました', 'Exported GLB'),
        mode: 'glb',
        allowNativePhotoLibrary: false,
      });
      if (result.exportedCount === result.total) {
        updateAutosaveStatus(
          localizeText(
            'GLBを書き出しました（頂点色 / フラット法線 / 隠れ面削減）',
            'Exported GLB (vertex colors / flat normals / hidden-face culling)'
          ),
          'success'
        );
      } else if (result.wasCancelled) {
        updateAutosaveStatus(localizeText('GLBの書き出しをキャンセルしました', 'GLB export was canceled'), 'warn');
      } else {
        updateAutosaveStatus(localizeText('GLBの書き出しに失敗しました', 'GLB export failed'), 'error');
      }
      if (result.exportedCount > 0) {
        markDocumentDurablySaved();
        showLoginPromptAfterExport();
      }
    } catch (error) {
      console.error('GLB export failed', error);
      updateAutosaveStatus(localizeText('GLBの書き出しに失敗しました', 'GLB export failed'), 'error');
    }
  }

  async function exportProjectAsGif() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'gif' })) {
      return;
    }
    const exportFrameSet = appendColorSpriteAreaToFrameSet(buildExportFrameSet(), 'gif');
    const frameCount = exportFrameSet.frameCount;
    if (!frameCount) {
      updateAutosaveStatus('GIFを書き出すフレームがありません', 'warn');
      return;
    }
    try {
      const candidates = getExportScaleCandidates(undefined, { allowFullScan: true });
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const includeOriginal = shouldExportOriginalCompanion('gif', selectedScale);
      const {
        width,
        height,
        framePixels,
        frameDurations,
        isVoxelComposite,
      } = exportFrameSet;
      const scaledSet = scaleFrameSetNearestNeighbor(framePixels, width, height, selectedScale);
      const tasks = [];
      const scaledGifBytes = buildGifFromPixels(
        scaledSet.framePixels,
        frameDurations,
        scaledSet.width,
        scaledSet.height
      );
      tasks.push({
        blob: new Blob([scaledGifBytes], { type: 'image/gif' }),
        filename: createExportFileName('gif', selectedScale > 1 ? `animation_x${selectedScale}` : 'animation'),
        shareText: `GIFを書き出しました${selectedScale > 1 ? ` (×${selectedScale})` : ''}`,
      });
      if (includeOriginal) {
        const originalGifBytes = buildGifFromPixels(framePixels, frameDurations, width, height);
        tasks.push({
          blob: new Blob([originalGifBytes], { type: 'image/gif' }),
          filename: createExportFileName('gif', 'animation_x1'),
          shareText: 'GIFを書き出しました (原寸)',
        });
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/gif',
        fileExtensions: ['.gif'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'GIFを書き出しました',
        mode: 'gif',
        includeProjectCompanion: shouldSaveProjectCompanion('gif'),
        archiveSuffix: 'gif',
        archiveShareText: shouldSaveProjectCompanion('gif')
          ? 'GIF一式をZIPで書き出し、.pxdを同期しました'
          : 'GIF一式をZIPで書き出しました',
      });
      const detailParts = [];
      if (isVoxelComposite) {
        detailParts.push(localizeText('立体表示', 'Voxel View'));
      }
      if (selectedScale > 1) {
        detailParts.push(`×${selectedScale}`);
      }
      if (includeOriginal) {
        detailParts.push('原寸も追加');
      }
      if (exportFrameSet.colorSpriteCount > 0) {
        detailParts.push(`カラースプライト ${exportFrameSet.usedColorCount}色`);
      }
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';
      if (result.exportedCount === result.total) {
        updateAutosaveStatus(`GIFを書き出しました${detail}`, 'success');
      } else if (result.wasCancelled) {
        const remaining = result.total - result.exportedCount;
        updateAutosaveStatus(remaining === result.total
          ? 'GIFの書き出しをキャンセルしました'
          : `GIFを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
      } else if (result.exportedCount > 0 && result.hadFailure) {
        updateAutosaveStatus(`GIFを書き出しましたが ${result.total - result.exportedCount} 件エクスポートできませんでした`, 'warn');
      } else {
        updateAutosaveStatus('GIFの書き出しに失敗しました', 'error');
      }
      if (result.exportedCount > 0) {
        markDocumentDurablySaved();
        if (result.exportedCount === result.total && !result.wasCancelled && !result.hadFailure) {
          const companionResult = shouldSaveProjectCompanion('gif')
            ? (result.projectCompanionResult || 'failed')
            : await maybeSaveProjectCompanionAfterExport('gif', {
              exportedCount: result.exportedCount,
              wasCancelled: result.wasCancelled,
            });
          announceProjectCompanionSaveResult('gif', companionResult);
        }
        showLoginPromptAfterExport();
      }
    } catch (error) {
      console.error('GIF export failed', error);
      updateAutosaveStatus('GIFの書き出しに失敗しました', 'error');
    }
  }

  const ALL_ZIP_EXPORT_FORMATS = Object.freeze(['png', 'gif', 'svg', 'jpeg', 'spritemap', 'gridpng', 'project']);

  function getSelectedBatchZipFormats() {
    const padChoices = Array.isArray(dom.exportDialog?.formatChoices)
      ? dom.exportDialog.formatChoices
      : [];
    const padSelected = padChoices
      .filter(choice => choice instanceof HTMLButtonElement && choice.getAttribute('aria-pressed') === 'true' && !choice.disabled)
      .map(choice => String(choice.dataset.exportFormatChoice || '').trim().toLowerCase())
      .filter(format => ALL_ZIP_EXPORT_FORMATS.includes(format));
    if (padSelected.length) {
      return [...new Set(padSelected)];
    }
    const toggles = Array.isArray(dom.exportDialog?.batchFormatToggles)
      ? dom.exportDialog.batchFormatToggles
      : [];
    const selected = toggles
      .filter(toggle => toggle instanceof HTMLInputElement && toggle.checked && !toggle.disabled)
      .map(toggle => String(toggle.value || '').trim().toLowerCase())
      .filter(format => ALL_ZIP_EXPORT_FORMATS.includes(format));
    return [...new Set(selected)];
  }

  function normalizeZipExportFormats(selectedFormats) {
    if (!Array.isArray(selectedFormats)) {
      return [...ALL_ZIP_EXPORT_FORMATS];
    }
    const selected = selectedFormats
      .map(format => String(format || '').trim().toLowerCase())
      .filter(format => ALL_ZIP_EXPORT_FORMATS.includes(format));
    return [...new Set(selected)];
  }

  async function exportProjectAsAllFormatsZip({ selectedFormats = null } = {}) {
    const formats = normalizeZipExportFormats(selectedFormats);
    const isSelectedBatchZip = Array.isArray(selectedFormats);
    const exportMode = isSelectedBatchZip ? 'batchzip' : 'allzip';
    const zipLabel = isSelectedBatchZip
      ? localizeText('選択形式ZIP', 'Selected formats ZIP')
      : localizeText('全形式ZIP', 'All formats ZIP');
    if (!formats.length) {
      updateAutosaveStatus(localizeText('ZIPに含める形式を1つ以上選択してください', 'Select at least one format for the ZIP'), 'warn');
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true };
    }
    if (!ensureCurrentClientCanExportProject({ announce: true, format: exportMode })) {
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true };
    }
    if (formats.includes('project') && !canExportFormatInCurrentState('project')) {
      updateAutosaveStatus(
        localizeText(
          'PiXiEEDrawプロジェクトを含めるには、プロジェクト保存を利用できる状態が必要です',
          'Including PiXiEEDraw requires project export to be available'
        ),
        'warn'
      );
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true };
    }
    const needsFrames = formats.some(format => format !== 'project');
    const hasScalableFormat = formats.some(format => (
      format === 'png' || format === 'gif' || format === 'svg' || format === 'jpeg'
    ));
    const sourceFrameSet = needsFrames ? buildExportFrameSet() : null;
    if (needsFrames && (!sourceFrameSet?.frameCount || !Array.isArray(sourceFrameSet.framePixels))) {
      updateAutosaveStatus(localizeText('ZIPへまとめるフレームがありません', 'No frames are available for the ZIP bundle'), 'warn');
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true };
    }

    try {
      updateAutosaveStatus(localizeText(`${zipLabel}を準備中…`, `Preparing ${zipLabel}…`), 'info');
      // The final ZIP may need every frame, but it is intentionally generated
      // only after the user confirms export; dialog preview never does this.
      const candidates = hasScalableFormat
        ? getExportScaleCandidates(exportMode, { allowFullScan: true })
        : [1];
      const selectedScale = hasScalableFormat ? applyExportScaleConstraints(candidates) : 1;
      syncExportScaleInputs();
      const primaryFrameSet = needsFrames
        ? appendColorSpriteAreaToFrameSet(sourceFrameSet, exportMode)
        : null;
      const { width = 0, height = 0, framePixels = [], frameDurations = [], frameCount = 0 } = primaryFrameSet || {};
      const includeOriginal = hasScalableFormat && shouldExportOriginalCompanion(exportMode, selectedScale);
      const tasks = [];
      const frameDigits = Math.max(2, String(frameCount).length);
      const addTask = (task, folder) => {
        tasks.push({
          ...task,
          // ZIP entries are flat because the lightweight ZIP writer sanitizes
          // path separators. A format prefix keeps every generated file unique.
          filename: `${folder}_${task.filename}`,
        });
      };

      const needsStillFrames = formats.includes('png') || formats.includes('jpeg') || formats.includes('svg');
      for (let frameIndex = 0; needsStillFrames && frameIndex < frameCount; frameIndex += 1) {
        const pixels = framePixels[frameIndex];
        const needsRasterCanvas = formats.includes('png') || formats.includes('jpeg');
        const scales = includeOriginal ? [selectedScale, 1] : [selectedScale];
        for (const scale of [...new Set(scales)]) {
          const suffix = `frame_${String(frameIndex + 1).padStart(frameDigits, '0')}${scale > 1 ? `_x${scale}` : '_x1'}`;
          const scaledCanvas = needsRasterCanvas
            ? scaleCanvasNearestNeighbor(createFrameCanvas(pixels, width, height), scale)
            : null;
          if (formats.includes('png')) {
            const pngBlob = await canvasToBlob(scaledCanvas, 'image/png');
            if (!pngBlob) throw new Error('Failed to create PNG for ZIP');
            addTask({ blob: pngBlob, filename: createExportFileName('png', suffix), mimeType: 'image/png' }, 'PNG');
          }
          if (formats.includes('jpeg')) {
            const jpegCanvas = createJpegCanvasFromSourceCanvas(scaledCanvas);
            const jpegBlob = await canvasToBlob(jpegCanvas, 'image/jpeg', 0.92);
            if (!jpegBlob) throw new Error('Failed to create JPEG for ZIP');
            addTask({ blob: jpegBlob, filename: createExportFileName('jpg', suffix), mimeType: 'image/jpeg' }, 'JPEG');
          }
          if (formats.includes('svg')) {
            const svgBlob = buildSvgBlobFromPixels(pixels, width, height, scale);
            addTask({ blob: svgBlob, filename: createExportFileName('svg', suffix), mimeType: 'image/svg+xml' }, 'SVG');
          }
        }
        if ((frameIndex + 1) % 4 === 0) {
          await new Promise(resolve => window.setTimeout(resolve, 0));
        }
      }

      if (formats.includes('gif')) {
        for (const scale of [...new Set(includeOriginal ? [selectedScale, 1] : [selectedScale])]) {
          const scaledGif = scaleFrameSetNearestNeighbor(framePixels, width, height, scale);
          const gifBytes = buildGifFromPixels(scaledGif.framePixels, frameDurations, scaledGif.width, scaledGif.height);
          addTask({
            blob: new Blob([gifBytes], { type: 'image/gif' }),
            filename: createExportFileName('gif', `animation_x${scale}`),
            mimeType: 'image/gif',
          }, 'GIF');
        }
      }

      if (formats.includes('spritemap')) {
        const spriteMapPlan = buildSpriteMapExportPlan(sourceFrameSet.framePixels, sourceFrameSet.width, sourceFrameSet.height, state.palette, {
          includeColorSprites: exportColorSpritesEnabled,
        });
        const spriteMap = buildSpriteMapCanvas(spriteMapPlan.framePixels, sourceFrameSet.width, sourceFrameSet.height, {
          scale: 1,
          columns: spriteMapPlan.columns,
          rows: spriteMapPlan.rows,
          placements: spriteMapPlan.placements,
        });
        const spriteMapBlob = await canvasToBlob(spriteMap.canvas, 'image/png');
        if (!spriteMapBlob) throw new Error('Failed to create SpriteMAP for ZIP');
        addTask({
          blob: spriteMapBlob,
          filename: createExportFileName('png', 'spritemap_x1'),
          mimeType: 'image/png',
        }, 'SPRITEMAP');
      }

      if (formats.includes('gridpng')) {
        const gridFrameSet = appendColorSpriteAreaToFrameSet(sourceFrameSet, 'gridpng');
        const gridWidth = normalizeExportGridTileSize(exportGridTileWidth, 8);
        const gridHeight = normalizeExportGridTileSize(exportGridTileHeight, 8);
        const rowSegments = buildGridRowSegmentsTopToBottom(gridFrameSet.height, gridHeight);
        const columnSegments = buildGridColumnSegmentsRightToLeft(gridFrameSet.width, gridWidth);
        const rowDigits = Math.max(2, String(rowSegments.length).length);
        const columnDigits = Math.max(2, String(columnSegments.length).length);
        for (let frameIndex = 0; frameIndex < gridFrameSet.frameCount; frameIndex += 1) {
          const frameCanvas = createFrameCanvas(gridFrameSet.framePixels[frameIndex], gridFrameSet.width, gridFrameSet.height);
          for (let rowIndex = 0; rowIndex < rowSegments.length; rowIndex += 1) {
            for (let columnIndex = 0; columnIndex < columnSegments.length; columnIndex += 1) {
              const row = rowSegments[rowIndex];
              const column = columnSegments[columnIndex];
              const gridBlob = await canvasRegionToBlob(frameCanvas, column.start, row.start, column.size, row.size, 'image/png');
              addTask({
                blob: gridBlob,
                filename: createExportFileName('png', `grid_frame_${String(frameIndex + 1).padStart(frameDigits, '0')}_r${String(rowIndex + 1).padStart(rowDigits, '0')}_c${String(columnIndex + 1).padStart(columnDigits, '0')}_x1`),
                mimeType: 'image/png',
              }, 'GRIDPNG');
            }
          }
        }
      }

      if (formats.includes('project')) {
        const projectBundle = await buildProjectExportBundle(
          getExportFileNameBase() || state.documentName,
          {
            includeSheets: false,
            includeTimelapse: true,
            useWorker: true,
            preferredStorageAdapterId: 'pxd-v2-zip',
          }
        );
        if (!(projectBundle?.blob instanceof Blob) || !projectBundle?.filename) {
          throw new Error('Failed to create PiXiEEDraw project for ZIP');
        }
        addTask({
          blob: projectBundle.blob,
          filename: projectBundle.filename,
          mimeType: PROJECT_FILE_MIME_TYPE,
        }, 'PROJECT');
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'application/zip',
        fileExtensions: ['.zip'],
        forceZip: true,
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: localizeText(`${zipLabel}をZIPへまとめました`, `Bundled ${zipLabel}`),
        mode: exportMode,
        archiveSuffix: isSelectedBatchZip ? 'selected_formats' : 'all_formats',
        archiveShareText: localizeText(`${formats.join('・')} をZIPへまとめました`, `Bundled ${formats.join(', ')} into ZIP`),
      });
      if (result.exportedCount === result.total && !result.wasCancelled && !result.hadFailure) {
        markDocumentDurablySaved();
        updateAutosaveStatus(
          localizeText(`${zipLabel}を書き出しました（${frameCount}フレーム / ${tasks.length}ファイル）`, `Exported ${zipLabel} (${frameCount} frames / ${tasks.length} files)`),
          'success'
        );
        showLoginPromptAfterExport();
      } else if (result.wasCancelled) {
        updateAutosaveStatus(localizeText(`${zipLabel}の書き出しをキャンセルしました`, `${zipLabel} export was canceled`), 'warn');
      } else {
        updateAutosaveStatus(localizeText(`${zipLabel}の書き出しに失敗しました`, `${zipLabel} export failed`), 'error');
      }
      return result;
    } catch (error) {
      console.error('ZIP export failed', error);
      const timelapseSyncFailed = String(error?.code || '').startsWith('ERR_TIMELAPSE_');
      updateAutosaveStatus(
        timelapseSyncFailed
          ? localizeText(`${zipLabel}: タイムラプスを完全同期できないため中止しました`, `${zipLabel} stopped because timelapse could not be synchronized`)
          : localizeText(`${zipLabel}の書き出しに失敗しました`, `${zipLabel} export failed`),
        'error'
      );
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: true, error };
    }
  }

  function compositeDocumentFrames(frames, width, height, palette) {
    return frames.map(frame => compositeFramePixels(frame, width, height, palette));
  }

  function getCurrentExportFrames() {
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (Array.isArray(activeCanvasDoc?.frames) && activeCanvasDoc.frames.length) {
      return activeCanvasDoc.frames;
    }
    return Array.isArray(state.frames) ? state.frames : [];
  }

  function buildStillExportFrameSet(frameIndex = state.activeFrame) {
    const exportFrames = getCurrentExportFrames();
    if (isVoxelExtensionModeEnabled()) {
      const imageData = buildVoxelPreviewCanvasCompositeImageDataForFrameIndex(frameIndex);
      if (imageData?.data instanceof Uint8ClampedArray) {
        return {
          pixels: new Uint8ClampedArray(imageData.data),
          width: Math.max(1, Math.round(Number(imageData.width) || 1)),
          height: Math.max(1, Math.round(Number(imageData.height) || 1)),
          frameIndex: clamp(Math.round(Number(frameIndex) || 0), 0, Math.max(0, exportFrames.length - 1)),
          isVoxelComposite: true,
        };
      }
    }
    const width = Math.max(1, Math.round(Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(state.height) || 1));
    const normalizedFrameIndex = clamp(Math.round(Number(frameIndex) || 0), 0, Math.max(0, exportFrames.length - 1));
    const frame = exportFrames[normalizedFrameIndex] || null;
    return {
      pixels: compositeFramePixels(frame, width, height, state.palette, {
        useLocalLayerPreviewVisibility: true,
        useLocalLayerPreviewOpacity: true,
      }),
      width,
      height,
      frameIndex: normalizedFrameIndex,
      isVoxelComposite: false,
    };
  }

  function buildExportFrameSet() {
    if (isVoxelExtensionModeEnabled()) {
      const voxelPreviewSet = buildVoxelPreviewAnimationFrameSet();
      if (voxelPreviewSet?.frameCount) {
        return {
          ...voxelPreviewSet,
          isVoxelComposite: true,
        };
      }
      const previewCanvasDoc = getProjectCanvasDocumentById(voxelExtensionState.previewCanvasId);
      const frameCount = Math.max(
        Array.isArray(state.frames) ? state.frames.length : 0,
        Array.isArray(previewCanvasDoc?.frames) ? previewCanvasDoc.frames.length : 0
      );
      if (frameCount > 0) {
        const frameImages = [];
        const frameDurations = [];
        let width = 0;
        let height = 0;
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
          const imageData = buildVoxelPreviewCanvasCompositeImageDataForFrameIndex(frameIndex);
          if (!(imageData?.data instanceof Uint8ClampedArray)) {
            continue;
          }
          frameImages.push(imageData);
          width = Math.max(width, Math.round(Number(imageData.width) || 1));
          height = Math.max(height, Math.round(Number(imageData.height) || 1));
          const duration = Number(getProjectCanvasFrameAt(previewCanvasDoc, frameIndex)?.duration)
            || Number(state.frames?.[frameIndex]?.duration)
            || (1000 / 12);
          frameDurations.push(clamp(Math.round(duration), 16, 2000));
        }
        if (frameImages.length) {
          const safeWidth = Math.max(1, width);
          const safeHeight = Math.max(1, height);
          const framePixels = frameImages.map(imageData => {
            const sourceWidth = Math.max(1, Math.round(Number(imageData.width) || 1));
            const sourceHeight = Math.max(1, Math.round(Number(imageData.height) || 1));
            const sourceData = imageData.data instanceof Uint8ClampedArray
              ? imageData.data
              : new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
            if (sourceWidth === safeWidth && sourceHeight === safeHeight) {
              return new Uint8ClampedArray(sourceData);
            }
            const padded = new Uint8ClampedArray(safeWidth * safeHeight * 4);
            const offsetX = Math.floor((safeWidth - sourceWidth) / 2);
            const offsetY = Math.floor((safeHeight - sourceHeight) / 2);
            for (let y = 0; y < sourceHeight; y += 1) {
              const srcRowStart = y * sourceWidth * 4;
              const destRowStart = ((y + offsetY) * safeWidth * 4) + (offsetX * 4);
              padded.set(sourceData.subarray(srcRowStart, srcRowStart + (sourceWidth * 4)), destRowStart);
            }
            return padded;
          });
          return {
            framePixels,
            frameDurations,
            width: safeWidth,
            height: safeHeight,
            frameCount: framePixels.length,
            isVoxelComposite: true,
          };
        }
      }
    }
    const exportFrames = getCurrentExportFrames();
    const width = state.width;
    const height = state.height;
    return {
      framePixels: compositeDocumentFrames(exportFrames, width, height, state.palette),
      frameDurations: exportFrames.map(frame => clamp(Math.round(Number(frame.duration) || 0), 16, 2000)),
      width,
      height,
      frameCount: exportFrames.length,
      isVoxelComposite: false,
    };
  }

  function getSimulationActiveLayer(frame = getActiveFrame()) {
    if (!frame || !Array.isArray(frame.layers)) {
      return null;
    }
    const layer = frame.layers.find(item => item?.id === state.activeLayer) || null;
    return isSimulationLayer(layer) ? layer : null;
  }

  function updateSimulationElementPaletteUi() {
    const selected = clamp(Math.round(Number(simulationEditorState.element) || 0), 0, SIM_ELEMENT_LIGHT);
    [dom.controls.simulationElementPalette, dom.controls.leftSimulationElementPalette].forEach(container => {
      if (!(container instanceof HTMLElement)) {
        return;
      }
      const buttons = container.querySelectorAll('[data-simulation-element]');
      buttons.forEach(button => {
        const value = clamp(Math.round(Number(button.getAttribute('data-simulation-element')) || 0), 0, SIM_ELEMENT_LIGHT);
        button.classList.toggle('is-active', value === selected);
        button.setAttribute('aria-pressed', value === selected ? 'true' : 'false');
      });
    });
    if (dom.controls.leftSimulationElementPaletteWrap instanceof HTMLElement) {
      dom.controls.leftSimulationElementPaletteWrap.hidden = true;
    }
    if (dom.controls.simulationShowLeftPaletteValue) {
      dom.controls.simulationShowLeftPaletteValue.textContent = simulationEditorState.showLeftPalette ? 'ON' : 'OFF';
    }
  }

  function buildSimulationElementPaletteButtons(container) {
    if (!(container instanceof HTMLElement) || container.dataset.simulationPaletteBuilt === 'true') {
      return;
    }
    container.dataset.simulationPaletteBuilt = 'true';
    const labels = ['EMPTY', 'WALL', 'WATER', 'SAND', 'METAL', 'FIRE', 'SMOKE', 'LIGHT'];
    labels.forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pixel-button pixel-frame';
      button.dataset.simulationElement = String(index);
      button.textContent = label;
      button.addEventListener('click', () => {
        simulationEditorState.element = index;
        if (dom.controls.simulationElement instanceof HTMLSelectElement) {
          dom.controls.simulationElement.value = String(index);
        }
        updateSimulationElementPaletteUi();
      });
      container.appendChild(button);
    });
  }

  function mixSimulationColor(a, b, amount) {
    const t = clamp(Number(amount), 0, 1);
    return {
      r: Math.round((a.r * (1 - t)) + (b.r * t)),
      g: Math.round((a.g * (1 - t)) + (b.g * t)),
      b: Math.round((a.b * (1 - t)) + (b.b * t)),
      a: Math.round((a.a * (1 - t)) + (b.a * t)),
    };
  }

  function brightenSimulationColor(color, amount, tint = null) {
    const source = cloneSimulationColor(color, { r: 255, g: 255, b: 255, a: 255 });
    const highlight = tint ? mixSimulationColor(source, cloneSimulationColor(tint, source), 0.35) : { ...source };
    return mixSimulationColor(source, {
      r: Math.min(255, Math.round(highlight.r + ((255 - highlight.r) * 0.85))),
      g: Math.min(255, Math.round(highlight.g + ((255 - highlight.g) * 0.85))),
      b: Math.min(255, Math.round(highlight.b + ((255 - highlight.b) * 0.85))),
      a: source.a,
    }, amount);
  }

  function sampleSimulationPaletteColor(layer, element, index, width, height, baseColor, tickSeed = 0) {
    const style = layer?.elementStyle?.[element];
    const depth = layer?.depthMap?.[index] || 0;
    const light = layer?.lightMap?.[index] || 0;
    const air = layer?.airMap?.[index] || 0;
    const aux = layer?.auxMap?.[index] || 0;
    let paletteColor = baseColor;
    if (element === SIM_ELEMENT_WATER) {
      const palette = style?.palette || {};
      paletteColor = depth < 72
        ? cloneSimulationColor(palette.shallow, baseColor)
        : depth < 168
          ? cloneSimulationColor(palette.mid, baseColor)
          : cloneSimulationColor(palette.deep, baseColor);
      if (aux === 2 || aux === 3) {
        paletteColor = mixSimulationColor(paletteColor, cloneSimulationColor(palette.foam, paletteColor), 0.45);
      }
      const x = index % width;
      const y = Math.floor(index / width);
      const above = y > 0 ? layer.elementMap[index - width] : SIM_ELEMENT_EMPTY;
      if (above === SIM_ELEMENT_EMPTY || above === SIM_ELEMENT_SMOKE) {
        const shimmer = ((x * 17) + (y * 31) + tickSeed) & 7;
        if (shimmer < 2) {
          paletteColor = mixSimulationColor(paletteColor, cloneSimulationColor(palette.highlight, paletteColor), 0.35 + ((light / 255) * 0.18));
        }
      }
    } else if (element === SIM_ELEMENT_FIRE) {
      const palette = style?.palette || {};
      const flicker = (((index * 13) + tickSeed) & 15) / 15;
      paletteColor = flicker > 0.68
        ? cloneSimulationColor(palette.core, baseColor)
        : flicker > 0.34
          ? cloneSimulationColor(palette.mid, baseColor)
          : cloneSimulationColor(palette.edge, baseColor);
    } else if (element === SIM_ELEMENT_METAL) {
      const palette = style?.palette || {};
      paletteColor = cloneSimulationColor(palette.base, baseColor);
      if (light > 96) {
        paletteColor = mixSimulationColor(paletteColor, cloneSimulationColor(palette.highlight, paletteColor), Math.min(0.5, light / 255));
      }
    } else if (element === SIM_ELEMENT_SMOKE) {
      const palette = style?.palette || {};
      paletteColor = air > 140
        ? cloneSimulationColor(palette.light, baseColor)
        : cloneSimulationColor(palette.dark, baseColor);
    } else if (element === SIM_ELEMENT_LIGHT) {
      paletteColor = cloneSimulationColor(style?.palette?.core, baseColor);
    } else if (element === SIM_ELEMENT_WALL) {
      paletteColor = baseColor;
    }
    return paletteColor;
  }

  function resolveSimulationPixelColor(layer, index, width, height, underlying) {
    const element = layer?.elementMap?.[index] || 0;
    if (element === SIM_ELEMENT_EMPTY) {
      return null;
    }
    const sourceBase = layer?.sourceColorMap instanceof Uint8ClampedArray && ((index * 4) + 3) < layer.sourceColorMap.length
      ? {
        r: layer.sourceColorMap[index * 4],
        g: layer.sourceColorMap[(index * 4) + 1],
        b: layer.sourceColorMap[(index * 4) + 2],
        a: layer.sourceColorMap[(index * 4) + 3],
      }
      : (underlying && underlying.a > 0
        ? underlying
        : { r: 0, g: 0, b: 0, a: 0 });
    const style = layer?.elementStyle?.[element] || { displayMode: SIM_SOURCE_COLOR, mixStrength: 0, palette: {} };
    const tickSeed = ((Date.now() / 80) | 0);
    const paletteColor = sampleSimulationPaletteColor(layer, element, index, width, height, sourceBase.a > 0 ? sourceBase : { r: 255, g: 255, b: 255, a: 255 }, tickSeed);
    let color;
    if (style.displayMode === SIM_ELEMENT_PALETTE) {
      color = paletteColor;
    } else if (style.displayMode === SIM_MIXED) {
      color = mixSimulationColor(sourceBase.a > 0 ? sourceBase : paletteColor, paletteColor, style.mixStrength);
    } else {
      color = sourceBase.a > 0 ? { ...sourceBase } : paletteColor;
    }
    const light = layer.lightMap?.[index] || 0;
    if (element === SIM_ELEMENT_FIRE || element === SIM_ELEMENT_LIGHT) {
      const emissive = brightenSimulationColor(sourceBase.a > 0 ? sourceBase : paletteColor, 0.45 + (light / 400), { r: 255, g: 220, b: 120, a: 255 });
      color = mixSimulationColor(color, emissive, 0.25 + (light / 510));
    } else if (element === SIM_ELEMENT_METAL && layer.settings?.metalReflectionEnabled !== false) {
      const reflection = brightenSimulationColor(sourceBase.a > 0 ? sourceBase : cloneSimulationColor(style?.palette?.reflection, color), Math.max(0.2, light / 255), { r: 220, g: 236, b: 255, a: 255 });
      color = mixSimulationColor(color, reflection, Math.max(0, ((light / 255) * 0.45) - ((layer.depthMap?.[index] || 0) / 700)));
    } else if (element === SIM_ELEMENT_WATER && layer.settings?.waterEffectEnabled !== false) {
      const speed = Math.min(1, (Math.abs(layer.velXMap?.[index] || 0) + Math.abs(layer.velYMap?.[index] || 0)) / 4);
      const reflection = brightenSimulationColor(sourceBase.a > 0 ? sourceBase : cloneSimulationColor(style?.palette?.highlight, color), 0.22 + (light / 600) + (speed * 0.1), { r: 210, g: 244, b: 255, a: 255 });
      color = mixSimulationColor(color, reflection, (light / 255) * 0.2 + speed * 0.18);
    }
    if (layer.settings?.lightingEnabled !== false && light > 0) {
      const boost = 1 + (light / 255) * 0.22;
      color = {
        r: clamp(Math.round(color.r * boost), 0, 255),
        g: clamp(Math.round(color.g * boost), 0, 255),
        b: clamp(Math.round(color.b * boost), 0, 255),
        a: color.a,
      };
    }
    if (layer.settings?.atmosphereEnabled !== false) {
      const fog = ((layer.depthMap?.[index] || 0) / 255) * ((layer.airMap?.[index] || 0) / 255) * clamp(Number(layer.settings?.atmosphereStrength), 0, 1);
      color = mixSimulationColor(color, cloneSimulationColor(layer.settings?.fogColor, SIM_DEFAULT_SETTINGS.fogColor), fog);
    }
    if (color.a <= 0) {
      color.a = 255;
    }
    return color;
  }

  function compositeSimulationLayerRegion(data, frame, layer, width, height, x0, y0, x1, y1) {
    const opacity = getDisplayedLayerPreviewOpacity(layer, 1);
    const blendMode = normalizeLayerBlendMode(layer.blendMode);
    const regionWidth = x1 - x0 + 1;
    for (let py = y0; py <= y1; py += 1) {
      const rowOffset = (py - y0) * regionWidth * 4;
      const layerRow = py * width;
      for (let px = x0; px <= x1; px += 1) {
        const pixelIndex = layerRow + px;
        const destIndex = rowOffset + ((px - x0) * 4);
        const underlying = {
          r: data[destIndex],
          g: data[destIndex + 1],
          b: data[destIndex + 2],
          a: data[destIndex + 3],
        };
        const resolved = resolveSimulationPixelColor(layer, pixelIndex, width, height, underlying);
        if (!resolved || resolved.a <= 0) {
          continue;
        }
        compositeLayerPixelNormalized(data, destIndex, resolved.r, resolved.g, resolved.b, resolved.a, opacity, blendMode);
      }
    }
  }

  function compositeFramePixels(frame, width, height, palette, options = {}) {
    const includeHiddenLayers = Boolean(options && options.includeHiddenLayers);
    const useLocalLayerPreviewVisibility = Boolean(options && options.useLocalLayerPreviewVisibility);
    const useLocalLayerPreviewOpacity = Boolean(options && options.useLocalLayerPreviewOpacity);
    const pixelCount = width * height;
    const output = new Uint8ClampedArray(pixelCount * 4);
    if (!frame || !Array.isArray(frame.layers)) {
      return output;
    }
    let singleDirectLayer = null;
    let drawableLayerCount = 0;
    for (let layerIndex = 0; layerIndex < frame.layers.length; layerIndex += 1) {
      const layer = frame.layers[layerIndex];
      const layerVisible = useLocalLayerPreviewVisibility
        ? getDisplayedLayerVisibility(layer, true)
        : (layer?.visible !== false);
      const layerOpacity = useLocalLayerPreviewOpacity
        ? getDisplayedLayerPreviewOpacity(layer, 1)
        : normalizeLayerOpacity(layer?.opacity);
      if (!layer || (!includeHiddenLayers && !layerVisible) || layerOpacity <= 0) {
        continue;
      }
      drawableLayerCount += 1;
      if (drawableLayerCount > 1 || isSimulationLayer(layer)) {
        singleDirectLayer = null;
        break;
      }
      const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= pixelCount * 4 ? layer.direct : null;
      if (!direct || layerOpacity < 1 || normalizeLayerBlendMode(layer.blendMode) !== DEFAULT_LAYER_BLEND_MODE) {
        singleDirectLayer = null;
        continue;
      }
      let hasIndexedPixels = false;
      if (layer.directOnly !== true) {
        for (let i = 0; i < pixelCount; i += 1) {
          const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
            ? getStoredRasterLayerPaletteIndex(layer, i)
            : (layer.indices instanceof Int16Array ? layer.indices[i] : -1);
          if (paletteIndex >= 0) {
            hasIndexedPixels = true;
            break;
          }
        }
      }
      singleDirectLayer = hasIndexedPixels ? null : direct;
    }
    if (drawableLayerCount === 1 && singleDirectLayer) {
      output.set(singleDirectLayer.subarray(0, pixelCount * 4));
      return output;
    }
    frame.layers.forEach(layer => {
      const layerVisible = useLocalLayerPreviewVisibility
        ? getDisplayedLayerVisibility(layer, true)
        : (layer?.visible !== false);
      const layerOpacity = useLocalLayerPreviewOpacity
        ? getDisplayedLayerPreviewOpacity(layer, 1)
        : normalizeLayerOpacity(layer?.opacity);
      if (!layer || (!includeHiddenLayers && !layerVisible) || layerOpacity <= 0) {
        return;
      }
      if (isSimulationLayer(layer)) {
        compositeSimulationLayerRegion(output, frame, layer, width, height, 0, 0, width - 1, height - 1);
        return;
      }
      const layerBlendMode = normalizeLayerBlendMode(layer.blendMode);
      const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= pixelCount * 4 ? layer.direct : null;
      for (let i = 0; i < pixelCount; i += 1) {
        const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
          ? getStoredRasterLayerPaletteIndex(layer, i)
          : (layer.indices instanceof Int16Array ? layer.indices[i] : -1);
        let srcR;
        let srcG;
        let srcB;
        let srcA;
        if (paletteIndex >= 0 && palette && palette[paletteIndex]) {
          const color = palette[paletteIndex];
          srcR = color.r;
          srcG = color.g;
          srcB = color.b;
          srcA = color.a;
        } else if (direct) {
          const base = i * 4;
          srcR = direct[base];
          srcG = direct[base + 1];
          srcB = direct[base + 2];
          srcA = direct[base + 3];
        } else {
          continue;
        }
        if (!Number.isFinite(srcA) || srcA <= 0) {
          continue;
        }
        const destIndex = i * 4;
        compositeLayerPixelNormalized(output, destIndex, srcR, srcG, srcB, srcA, layerOpacity, layerBlendMode);
      }
    });
    return output;
  }

  // The export dialog is a settings surface, not the exporter itself.  Never
  // build every animation frame (or a full-size SpriteMAP) merely to refresh
  // this small preview canvas.  Sampling keeps the visual result useful while
  // bounding work for large animations.
  function compositeFramePixelsForExportPreview(frame, width, height, palette, maxEdge = 256) {
    const sourceWidth = Math.max(1, Math.floor(Number(width) || 1));
    const sourceHeight = Math.max(1, Math.floor(Number(height) || 1));
    const sourcePixelCount = sourceWidth * sourceHeight;
    const scale = Math.min(1, Math.max(1, Math.floor(Number(maxEdge) || 256)) / Math.max(sourceWidth, sourceHeight));
    const previewWidth = Math.max(1, Math.round(sourceWidth * scale));
    const previewHeight = Math.max(1, Math.round(sourceHeight * scale));
    const output = new Uint8ClampedArray(previewWidth * previewHeight * 4);
    if (!frame || !Array.isArray(frame.layers)) {
      return { pixels: output, width: previewWidth, height: previewHeight };
    }

    const sourceXFor = x => Math.min(sourceWidth - 1, Math.floor(((x + 0.5) * sourceWidth) / previewWidth));
    const sourceYFor = y => Math.min(sourceHeight - 1, Math.floor(((y + 0.5) * sourceHeight) / previewHeight));
    frame.layers.forEach(layer => {
      if (!layer || layer.visible === false) {
        return;
      }
      const opacity = normalizeLayerOpacity(layer.opacity);
      if (opacity <= 0) {
        return;
      }
      const blendMode = normalizeLayerBlendMode(layer.blendMode);
      const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= sourcePixelCount * 4
        ? layer.direct
        : null;
      for (let previewY = 0; previewY < previewHeight; previewY += 1) {
        const sourceY = sourceYFor(previewY);
        for (let previewX = 0; previewX < previewWidth; previewX += 1) {
          const sourceX = sourceXFor(previewX);
          const sourceIndex = (sourceY * sourceWidth) + sourceX;
          const outputIndex = ((previewY * previewWidth) + previewX) * 4;
          let color = null;
          if (isSimulationLayer(layer)) {
            color = resolveSimulationPixelColor(layer, sourceIndex, sourceWidth, sourceHeight, {
              r: output[outputIndex],
              g: output[outputIndex + 1],
              b: output[outputIndex + 2],
              a: output[outputIndex + 3],
            });
          } else {
            const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
              ? getStoredRasterLayerPaletteIndex(layer, sourceIndex)
              : (layer.indices instanceof Int16Array ? layer.indices[sourceIndex] : -1);
            if (paletteIndex >= 0 && palette?.[paletteIndex]) {
              color = palette[paletteIndex];
            } else if (direct) {
              const directIndex = sourceIndex * 4;
              color = {
                r: direct[directIndex],
                g: direct[directIndex + 1],
                b: direct[directIndex + 2],
                a: direct[directIndex + 3],
              };
            }
          }
          if (!color || !Number.isFinite(color.a) || color.a <= 0) {
            continue;
          }
          compositeLayerPixelNormalized(
            output,
            outputIndex,
            color.r,
            color.g,
            color.b,
            color.a,
            opacity,
            blendMode
          );
        }
      }
    });
    return { pixels: output, width: previewWidth, height: previewHeight };
  }

  const exportPlanningUtils = window.PiXiEEDrawModules?.exportPlanningUtils?.createExportPlanningUtils?.({
    MAX_EXPORT_DIMENSION,
    MAX_EXPORT_SCALE_OPTIONS,
    state,
    dom,
    getExportColorSpritesEnabled: () => exportColorSpritesEnabled,
    normalizeExportFormat: (...args) => normalizeExportFormat(...args),
    shouldSaveSpriteMapCompanion: (...args) => shouldSaveSpriteMapCompanion(...args),
    shouldAppendColorSpritesToPrimaryExport: (...args) => shouldAppendColorSpritesToPrimaryExport(...args),
    compositeDocumentFrames: (...args) => compositeDocumentFrames(...args),
    buildColorSpriteExportPlanFromFramePixels: (...args) => buildColorSpriteExportPlanFromFramePixels(...args),
    normalizeColorValue: (...args) => normalizeColorValue(...args),
    getPaletteColorKey: (...args) => getPaletteColorKey(...args),
  }) || {};
  const {
    computeSpriteSheetLayout,
    collectUsedColorsFromFramePixels,
    buildColorSpriteFramesFromColors,
    buildSpriteMapExportPlan,
    getExportScaleCandidates,
  } = exportPlanningUtils;

  function resetExportScaleDefaults() {
    exportScale = 1;
    exportScaleUserOverride = false;
  }

  function normalizeExportFormat(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'gif') return 'gif';
    if (normalized === 'timelapse') return 'timelapse';
    if (normalized === 'jpeg' || normalized === 'jpg') return 'jpeg';
    if (normalized === 'svg') return 'svg';
    if (normalized === 'voxelpreview' || normalized === 'voxel-preview' || normalized === 'previewpng') return 'voxelpreview';
    if (normalized === 'glb') return 'glb';
    if (normalized === 'spritemap' || normalized === 'sprite-map' || normalized === 'spritesheet' || normalized === 'sprite-sheet') return 'spritemap';
    if (normalized === 'allzip' || normalized === 'all-zip' || normalized === 'bundle') return 'allzip';
    if (normalized === 'batchzip' || normalized === 'batch-zip' || normalized === 'selectedzip' || normalized === 'selected-zip') return 'batchzip';
    if (normalized === 'png') return 'png';
    if (normalized === 'gridpng' || normalized === 'grid') return 'gridpng';
    if (normalized === 'project') return 'project';
    return 'png';
  }

  function getExportFormatLabel(mode) {
    const normalized = normalizeExportFormat(mode);
    if (normalized === 'jpeg') return 'JPEG';
    if (normalized === 'svg') return 'SVG';
    if (normalized === 'voxelpreview') return localizeText('立体プレビューPNG', 'Voxel Preview PNG');
    if (normalized === 'glb') return 'GLB';
    if (normalized === 'spritemap') return 'SpriteMAP';
    if (normalized === 'batchzip') return localizeText('選択形式ZIP', 'Selected formats ZIP');
    if (normalized === 'allzip') return localizeText('全形式ZIP', 'All formats ZIP');
    if (normalized === 'gridpng') return localizeText('PNG（グリッド分割）', 'PNG (Grid Split)');
    if (normalized === 'gif') return 'GIF';
    if (normalized === 'timelapse') return localizeText('タイムラプスGIF', 'Timelapse GIF');
    if (normalized === 'project') return localizeText('プロジェクト保存', 'Project Save');
    return 'PNG';
  }

  function canExportVoxelGlbInCurrentState() {
    if (!isVoxelExtensionModeEnabled()) {
      return false;
    }
    const resolved = getVoxelExtensionResolvedCanvases();
    return Boolean(
      resolved?.front
      && resolved?.back
      && resolved?.left
      && resolved?.right
      && resolved?.top
      && resolved?.bottom
    );
  }

  function getFormatSpecificExportDisabledReason(mode = 'png') {
    const format = normalizeExportFormat(mode);
    if (format === 'voxelpreview') {
      if (!isVoxelExtensionModeEnabled() || !(voxelExtensionPreviewPixels instanceof Uint8ClampedArray) || !voxelExtensionPreviewMeta) {
        return localizeText(
          '立体プレビューPNGはボクセルモード中のみ利用できます',
          'Voxel preview PNG is available only in voxel mode'
        );
      }
      return '';
    }
    if (format !== 'glb') {
      return '';
    }
    if (!isVoxelExtensionModeEnabled()) {
      return localizeText(
        'GLB はボクセルモードでのみ利用できます',
        'GLB export is available only in voxel mode'
      );
    }
    if (!canExportVoxelGlbInCurrentState()) {
      return localizeText(
        'GLB 書き出しには Front / Back / Left / Right / Top / Bottom の6面キャンバスが必要です',
        'GLB export requires Front / Back / Left / Right / Top / Bottom source canvases'
      );
    }
    return '';
  }

  function getExportDisabledReason(mode = 'png') {
    const format = normalizeExportFormat(mode);
    if (format === 'batchzip' && !getSelectedBatchZipFormats().length) {
      return localizeText('ZIPに含める形式を1つ以上選択してください', 'Select at least one format for the ZIP');
    }
    return getMultiExportDisabledReason(format) || getFormatSpecificExportDisabledReason(format);
  }

  function canExportFormatInCurrentState(mode = 'png') {
    return !getExportDisabledReason(mode);
  }

  function resolveSelectedExportDialogFormat(mode = '') {
    return normalizeExportFormat(mode || dom.exportDialog?.format?.value || 'png');
  }

  function updateExportFormatAvailability() {
    const config = dom.exportDialog;
    const select = config?.format;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    updateBatchZipFormatOptions();
    const isSelectableFormat = mode => {
      const format = normalizeExportFormat(mode);
      return !(getMultiExportDisabledReason(format) || getFormatSpecificExportDisabledReason(format));
    };
    const options = Array.from(select.options || []);
    let firstAllowedValue = '';
    options.forEach(option => {
      const mode = normalizeExportFormat(option.value || 'png');
      const allowed = isSelectableFormat(mode);
      option.disabled = !allowed;
      if (allowed && !firstAllowedValue) {
        firstAllowedValue = option.value || mode;
      }
    });

    const hasAllowedMode = Boolean(firstAllowedValue);
    const currentMode = resolveSelectedExportDialogFormat();
    if (!isSelectableFormat(currentMode) && firstAllowedValue) {
      select.value = firstAllowedValue;
    }
    select.disabled = !hasAllowedMode;

    if (config?.confirm instanceof HTMLButtonElement) {
      const activeMode = resolveSelectedExportDialogFormat();
      const canConfirm = hasAllowedMode && canExportFormatInCurrentState(activeMode);
      config.confirm.disabled = !canConfirm;
      const reason = canConfirm ? '' : getExportDisabledReason(activeMode);
      if (reason) {
        config.confirm.title = reason;
      } else {
        config.confirm.removeAttribute('title');
      }
    }
    updateExportFormatPadState();
  }

  function updateExportFormatPadState() {
    const config = dom.exportDialog;
    const selectedFormat = normalizeExportFormat(config?.format?.value || 'png');
    const optionByFormat = new Map(
      Array.from(config?.format?.options || []).map(option => [normalizeExportFormat(option.value), option])
    );
    const choices = Array.isArray(config?.formatChoices) ? config.formatChoices : [];
    const selectedPadFormats = choices
      .filter(choice => choice instanceof HTMLButtonElement && choice.getAttribute('aria-pressed') === 'true')
      .map(choice => normalizeExportFormat(choice.dataset.exportFormatChoice));
    const activeFormats = selectedFormat === 'batchzip'
      ? selectedPadFormats
      : [selectedFormat];
    if (activeFormats.length > 1) {
      if (config?.padConsole instanceof HTMLElement) config.padConsole.dataset.exportTone = 'batchzip';
      if (config?.dialog instanceof HTMLElement) config.dialog.dataset.exportTone = 'batchzip';
    }
    choices.forEach(choice => {
      if (!(choice instanceof HTMLButtonElement)) {
        return;
      }
      const format = normalizeExportFormat(choice.dataset.exportFormatChoice);
      const active = activeFormats.includes(format);
      const option = optionByFormat.get(format);
      choice.disabled = Boolean(option?.disabled);
      choice.setAttribute('aria-pressed', String(active));
      choice.classList.toggle('is-active', active);
      if (option?.disabled && option.title) {
        choice.title = option.title;
      } else {
        choice.removeAttribute('title');
      }
      if (active && activeFormats.length === 1 && config?.padConsole instanceof HTMLElement) {
        config.padConsole.dataset.exportTone = choice.dataset.exportTone || format;
      }
      if (active && activeFormats.length === 1 && config?.dialog instanceof HTMLElement) {
        config.dialog.dataset.exportTone = choice.dataset.exportTone || format;
      }
    });
  }

  function isGridPngExportMode(mode) {
    return normalizeExportFormat(mode) === 'gridpng';
  }

  function canOfferProjectCompanionExport(mode) {
    const format = normalizeExportFormat(mode);
    const supportsCompanionFormat = format === 'png'
      || format === 'voxelpreview'
      || format === 'jpeg'
      || format === 'svg'
      || format === 'spritemap'
      || format === 'gif'
      || format === 'gridpng'
      || format === 'timelapse';
    if (!supportsCompanionFormat) {
      return false;
    }
    return canCurrentClientExportProject('project');
  }

  function shouldSaveProjectCompanion(mode) {
    return false;
  }

  function canOfferSpriteMapCompanionExport(mode) {
    const format = normalizeExportFormat(mode);
    if (format === 'project') {
      return false;
    }
    if (!canCurrentClientExportProject('spritemap')) {
      return false;
    }
    return Array.isArray(state.frames) && state.frames.length > 0;
  }

  function shouldSaveSpriteMapCompanion(mode) {
    return false;
  }

  function canOfferColorSpriteExport(mode) {
    const format = normalizeExportFormat(mode);
    if (format === 'project') {
      return false;
    }
    if (!canCurrentClientExportProject('spritemap')) {
      return false;
    }
    return Array.isArray(state.frames) && state.frames.length > 0;
  }

  function shouldAppendColorSpritesToPrimaryExport(mode) {
    return exportColorSpritesEnabled
      && canOfferColorSpriteExport(mode);
  }

  function updateExportProjectCompanionToggleUI() {
    const toggle = dom.exportDialog?.saveProjectCompanionToggle;
    const mode = normalizeExportFormat(dom.exportDialog?.format?.value || 'png');
    if (!(toggle instanceof HTMLInputElement)) {
      return;
    }
    const canOffer = canOfferProjectCompanionExport(mode);
    toggle.checked = canOffer ? exportSaveProjectCompanion : false;
    toggle.disabled = !canOffer;
    const reason = canOffer ? '' : getMultiExportDisabledReason('project');
    if (reason) {
      toggle.title = reason;
    } else {
      toggle.removeAttribute('title');
    }
  }

  function updateExportSpriteMapCompanionToggleUI() {
    const toggle = dom.exportDialog?.saveSpriteMapCompanionToggle;
    const row = dom.exportDialog?.saveSpriteMapCompanionRow;
    const mode = normalizeExportFormat(dom.exportDialog?.format?.value || 'png');
    const canOffer = canOfferSpriteMapCompanionExport(mode);
    if (row instanceof HTMLElement) {
      row.hidden = false;
    }
    if (!(toggle instanceof HTMLInputElement)) {
      return;
    }
    if (!canOffer) {
      toggle.checked = false;
    } else {
      toggle.checked = exportSaveSpriteMapCompanion;
    }
    toggle.disabled = !canOffer;
    const reason = canOffer ? '' : (
      getMultiExportDisabledReason('spritemap') || localizeText('SpriteMAPにまとめるフレームがありません', 'No frames available for SpriteMAP')
    );
    if (reason) {
      toggle.title = reason;
    } else {
      toggle.removeAttribute('title');
    }
  }

  function normalizeExportGridTileSize(value, fallback = 8) {
    const base = Number.isFinite(Number(fallback)) ? Number(fallback) : 8;
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) {
      return clamp(Math.round(base), EXPORT_GRID_TILE_MIN_SIZE, EXPORT_GRID_TILE_MAX_SIZE);
    }
    return clamp(parsed, EXPORT_GRID_TILE_MIN_SIZE, EXPORT_GRID_TILE_MAX_SIZE);
  }

  function canOfferOriginalCompanionExport(mode, scale = exportScale) {
    const format = normalizeExportFormat(mode);
    const normalizedScale = Math.max(1, Math.floor(Number(scale) || 1));
    if (format === 'batchzip') {
      return normalizedScale > 1 && getSelectedBatchZipFormats().some(selectedFormat => (
        selectedFormat === 'png' || selectedFormat === 'gif' || selectedFormat === 'jpeg' || selectedFormat === 'svg'
      ));
    }
    return normalizedScale > 1
      && (format === 'png' || format === 'voxelpreview' || format === 'jpeg' || format === 'svg' || format === 'gif');
  }

  function shouldExportOriginalCompanion(mode, scale = exportScale) {
    return exportIncludeOriginalSize && canOfferOriginalCompanionExport(mode, scale);
  }

  function doesExportFormatUseScale(mode) {
    const format = normalizeExportFormat(mode);
    if (format === 'batchzip') {
      return getSelectedBatchZipFormats().some(selectedFormat => (
        selectedFormat === 'png' || selectedFormat === 'gif' || selectedFormat === 'jpeg' || selectedFormat === 'svg'
      ));
    }
    return format === 'png'
      || format === 'allzip'
      || format === 'voxelpreview'
      || format === 'jpeg'
      || format === 'svg'
      || format === 'gif'
      || format === 'timelapse';
  }

  function doesExportFormatSupportProjectCompanion(mode) {
    const format = normalizeExportFormat(mode);
    return format === 'png'
      || format === 'voxelpreview'
      || format === 'jpeg'
      || format === 'svg'
      || format === 'spritemap'
      || format === 'gif'
      || format === 'gridpng'
      || format === 'timelapse';
  }

  function updateExportOptionVisibility(mode) {
    const format = resolveSelectedExportDialogFormat(mode);
    const isBatchZip = format === 'batchzip';
    const isZipBundle = isBatchZip || format === 'allzip';
    const batchFormatOptions = dom.exportDialog?.batchFormatOptions;
    if (batchFormatOptions instanceof HTMLElement) {
      batchFormatOptions.hidden = !isBatchZip;
    }
    updateBatchZipFormatOptions();
    const scaleControls = dom.exportDialog?.scaleControls;
    if (scaleControls instanceof HTMLElement) {
      scaleControls.hidden = !doesExportFormatUseScale(format);
    }
    const scaleHint = dom.exportDialog?.scaleHint;
    if (scaleHint instanceof HTMLElement) {
      scaleHint.hidden = !doesExportFormatUseScale(format);
    }

    const originalRow = dom.exportDialog?.includeOriginalRow;
    if (originalRow instanceof HTMLElement) {
      originalRow.hidden = !canOfferOriginalCompanionExport(format, exportScale);
    }

    const companionRow = dom.exportDialog?.saveProjectCompanionRow;
    if (companionRow instanceof HTMLElement) {
      companionRow.hidden = isBatchZip || !doesExportFormatSupportProjectCompanion(format);
    }
    updateExportSpriteMapCompanionToggleUI();

    const spriteMapCompanionRow = dom.exportDialog?.saveSpriteMapCompanionRow;
    if (spriteMapCompanionRow instanceof HTMLElement && isZipBundle) {
      spriteMapCompanionRow.hidden = true;
    }

    const spriteMapColorSpritesRow = dom.exportDialog?.spriteMapColorSpritesRow;
    if (spriteMapColorSpritesRow instanceof HTMLElement) {
      spriteMapColorSpritesRow.hidden = format === 'project'
        || (isBatchZip && !getSelectedBatchZipFormats().some(selectedFormat => selectedFormat !== 'project'));
    }
    const spriteMapColorSpritesToggle = dom.exportDialog?.spriteMapColorSpritesToggle;
    if (spriteMapColorSpritesToggle instanceof HTMLInputElement) {
      const canOffer = canOfferColorSpriteExport(format);
      spriteMapColorSpritesToggle.checked = canOffer ? exportColorSpritesEnabled : false;
      spriteMapColorSpritesToggle.disabled = !canOffer;
      const reason = canOffer ? '' : (getMultiExportDisabledReason('spritemap') || localizeText('カラースプライトにまとめるフレームがありません', 'No frames available for color sprites'));
      if (reason) {
        spriteMapColorSpritesToggle.title = reason;
      } else {
        spriteMapColorSpritesToggle.removeAttribute('title');
      }
    }
  }

  function updateBatchZipFormatOptions() {
    const toggles = Array.isArray(dom.exportDialog?.batchFormatToggles)
      ? dom.exportDialog.batchFormatToggles
      : [];
    toggles.forEach(toggle => {
      if (!(toggle instanceof HTMLInputElement)) {
        return;
      }
      const format = normalizeExportFormat(toggle.value);
      const unavailableReason = getMultiExportDisabledReason(format) || getFormatSpecificExportDisabledReason(format);
      toggle.disabled = Boolean(unavailableReason);
      if (toggle.disabled) {
        toggle.checked = false;
        toggle.title = unavailableReason;
      } else {
        toggle.removeAttribute('title');
      }
    });
  }

  function updateExportOriginalToggleUI() {
    const toggle = dom.exportDialog?.includeOriginalToggle;
    const mode = resolveSelectedExportDialogFormat();
    const isGridMode = isGridPngExportMode(mode);
    if (toggle instanceof HTMLInputElement) {
      const canOffer = canOfferOriginalCompanionExport(mode, exportScale);
      toggle.checked = exportIncludeOriginalSize;
      toggle.disabled = !canOffer;
    }
    const gridSettings = dom.exportDialog?.gridSettings;
    if (gridSettings instanceof HTMLElement) {
      gridSettings.hidden = !isGridMode;
    }
    const gridHint = dom.exportDialog?.gridHint;
    if (gridHint instanceof HTMLElement) {
      gridHint.hidden = !isGridMode;
    }
    if (isGridMode) {
      syncExportGridInputs();
    }
    updateExportOptionVisibility(mode);
    updateExportProjectCompanionToggleUI();
  }

  async function maybeSaveProjectCompanionAfterExport(mode, { exportedCount = 0, wasCancelled = false } = {}) {
    if (!shouldSaveProjectCompanion(mode)) {
      return 'skipped';
    }
    if (!Number.isFinite(exportedCount) || exportedCount <= 0 || wasCancelled) {
      return 'skipped';
    }
    const result = await saveProjectAsPixieedraw({ announceStatus: false });
    if (result?.saved) {
      return 'saved';
    }
    if (result?.cancelled) {
      return 'cancelled';
    }
    return 'failed';
  }

  function announceProjectCompanionSaveResult(mode, result) {
    if (result === 'skipped') {
      return;
    }
    const format = normalizeExportFormat(mode);
    const label = format === 'gridpng'
      ? 'グリッド分割PNG'
      : (format === 'timelapse'
        ? 'タイムラプスGIF'
        : (format === 'jpeg' ? 'JPEG' : String(format || '').toUpperCase()));
    if (result === 'saved') {
      updateAutosaveStatus(`${label}出力後: PiXiEEDrawファイルもダウンロードしました`, 'success');
      return;
    }
    if (result === 'cancelled') {
      updateAutosaveStatus(`${label}出力後: PiXiEEDrawファイルのダウンロードをキャンセルしました`, 'warn');
      return;
    }
    updateAutosaveStatus(`${label}出力後: PiXiEEDrawファイルのダウンロードに失敗しました`, 'warn');
  }

  function applyExportScaleConstraints(candidates) {
    exportSheetInfo = {
      sheetWidth: candidates.sheetWidth,
      sheetHeight: candidates.sheetHeight,
      columns: candidates.columns,
      rows: candidates.rows,
    };
    const options = candidates.options;
    exportMaxScale = options.length ? options[options.length - 1].scale : 1;
    if (!options.length) {
      exportScale = 1;
      return exportScale;
    }
    const maxAllowed = exportMaxScale;
    if (!exportScaleUserOverride) {
      const baseDimension = Math.max(exportSheetInfo.sheetWidth, exportSheetInfo.sheetHeight);
      const recommendedScale = baseDimension > 0 ? Math.round(TARGET_EXPORT_OUTPUT_SIZE / baseDimension) : 1;
      const clampedRecommendation = Math.max(1, Math.min(maxAllowed, recommendedScale));
      exportScale = clampedRecommendation;
    }
    if (exportScale > maxAllowed) {
      exportScale = maxAllowed;
    }
    if (exportScale < 1) {
      exportScale = 1;
    }
    return exportScale;
  }

  function updateExportScaleHint() {
    const hintNode = dom.exportDialog?.scaleHint;
    if (!hintNode) return;
    if (!exportSheetInfo) {
      hintNode.textContent = '';
      return;
    }
    const width = exportSheetInfo.sheetWidth * exportScale;
    const height = exportSheetInfo.sheetHeight * exportScale;
    hintNode.textContent = localizeText(
      `書き出しサイズ: ${width} × ${height}PX (倍率 ×${exportScale})`,
      `Output size: ${width} × ${height}px (scale ×${exportScale})`
    );
  }

  function syncExportScaleInputs() {
    const slider = dom.exportDialog?.scaleSlider;
    if (slider) {
      slider.disabled = exportMaxScale <= 1;
      slider.min = '1';
      slider.max = String(exportMaxScale);
      slider.step = '1';
      slider.value = String(exportScale);
    }

    const scaleInput = dom.exportDialog?.scaleInput;
    if (scaleInput) {
      scaleInput.disabled = exportMaxScale <= 1;
      scaleInput.min = '1';
      scaleInput.max = String(exportMaxScale);
      scaleInput.step = '1';
      scaleInput.value = String(exportScale);
    }

    const widthInput = dom.exportDialog?.pixelWidthInput;
    const heightInput = dom.exportDialog?.pixelHeightInput;
    if (!exportSheetInfo) {
      if (widthInput) {
        widthInput.disabled = true;
        widthInput.value = '';
      }
      if (heightInput) {
        heightInput.disabled = true;
        heightInput.value = '';
      }
    } else {
      const baseWidth = Math.max(1, exportSheetInfo.sheetWidth);
      const baseHeight = Math.max(1, exportSheetInfo.sheetHeight);
      const maxWidth = Math.max(baseWidth, baseWidth * exportMaxScale);
      const maxHeight = Math.max(baseHeight, baseHeight * exportMaxScale);
      if (widthInput) {
        widthInput.disabled = exportMaxScale <= 1;
        widthInput.min = String(baseWidth);
        widthInput.max = String(maxWidth);
        widthInput.step = String(baseWidth);
        widthInput.value = String(baseWidth * exportScale);
      }
      if (heightInput) {
        heightInput.disabled = exportMaxScale <= 1;
        heightInput.min = String(baseHeight);
        heightInput.max = String(maxHeight);
        heightInput.step = String(baseHeight);
        heightInput.value = String(baseHeight * exportScale);
      }
    }

    updateExportScaleHint();
    updateExportScalePadState();
    updateExportOriginalToggleUI();
  }

  function updateExportScalePadState() {
    const choices = Array.isArray(dom.exportDialog?.scaleChoices) ? dom.exportDialog.scaleChoices : [];
    choices.forEach(choice => {
      if (!(choice instanceof HTMLButtonElement)) {
        return;
      }
      const scale = Math.max(1, Math.round(Number(choice.dataset.exportScaleChoice) || 1));
      const available = scale <= Math.max(1, exportMaxScale || 1);
      const active = scale === exportScale;
      choice.disabled = !available;
      choice.setAttribute('aria-pressed', String(active));
      choice.classList.toggle('is-active', active);
    });
  }

  function syncExportGridInputs() {
    const widthInput = dom.exportDialog?.gridWidthInput;
    const heightInput = dom.exportDialog?.gridHeightInput;
    exportGridTileWidth = normalizeExportGridTileSize(exportGridTileWidth, 8);
    exportGridTileHeight = normalizeExportGridTileSize(exportGridTileHeight, 8);
    if (widthInput instanceof HTMLInputElement) {
      widthInput.min = String(EXPORT_GRID_TILE_MIN_SIZE);
      widthInput.max = String(EXPORT_GRID_TILE_MAX_SIZE);
      widthInput.step = '1';
      widthInput.value = String(exportGridTileWidth);
    }
    if (heightInput instanceof HTMLInputElement) {
      heightInput.min = String(EXPORT_GRID_TILE_MIN_SIZE);
      heightInput.max = String(EXPORT_GRID_TILE_MAX_SIZE);
      heightInput.step = '1';
      heightInput.value = String(exportGridTileHeight);
    }
  }

  function setExportScale(value) {
    const maxAllowed = exportMaxScale || 1;
    const normalized = clamp(Math.round(Number(value) || exportScale || 1), 1, maxAllowed);
    exportScale = normalized;
    syncExportScaleInputs();
    updateExportPreview();
  }

  function refreshExportScaleControls() {
    const candidates = getExportScaleCandidates(resolveSelectedExportDialogFormat());
    applyExportScaleConstraints(candidates);
    syncExportScaleInputs();
    updateExportPreview();
  }

  function setExportPreviewMeta(text = '') {
    const meta = dom.exportDialog?.previewMeta;
    if (meta instanceof HTMLElement) {
      meta.textContent = text;
    }
  }

  function getExportPreviewOutputCards(mode) {
    const format = normalizeExportFormat(mode);
    const selectedFormats = format === 'batchzip'
      ? getSelectedBatchZipFormats()
      : (format === 'allzip' ? ALL_ZIP_EXPORT_FORMATS : [format]);
    const scalableFormats = new Set(['png', 'gif', 'svg', 'jpeg', 'voxelpreview']);
    const cards = [];
    const add = (label, detail, marker, tone = '', previewType = 'frame') => {
      cards.push({ label, detail, marker, tone, previewType });
    };

    selectedFormats.forEach(selectedFormat => {
      const normalized = normalizeExportFormat(selectedFormat);
      if (normalized === 'project') {
        add('PiXiEEDraw', '.pxd 編集データ', 'FILE', 'project', 'project');
        return;
      }
      if (normalized === 'spritemap') {
        add('SpriteMAP', '全フレームを PNG ×1 で配置', 'MAP', 'spritemap', 'spritemap');
        return;
      }
      if (normalized === 'gridpng') {
        add('グリッドPNG', '分割タイルを PNG ×1 で配置', 'GRID', 'gridpng', 'grid');
        return;
      }
      const label = getExportFormatLabel(normalized);
      const scale = scalableFormats.has(normalized) ? Math.max(1, exportScale) : 1;
      add(label, `メイン出力・倍率 ×${scale}`, label, normalized, 'frame');
    });

    if (shouldExportOriginalCompanion(format, exportScale)) {
      add('原寸 ×1', 'メイン画像と並べて追加', '×1', 'original', 'frame');
    }
    if (shouldAppendColorSpritesToPrimaryExport(format)) {
      add('カラースプライト', '画像に合成して追加', 'CLR', 'color', 'color');
    }
    if (dom.exportDialog?.timelapseToggle instanceof HTMLInputElement
      && dom.exportDialog.timelapseToggle.checked) {
      add('タイムラプスGIF', '記録済みの工程を追加出力', 'REC', 'gif', 'frame');
    }
    return cards;
  }

  function createExportPreviewThumbnailCanvas(sourceCanvas, maxEdge = 42) {
    const sourceWidth = Math.max(1, Math.floor(Number(sourceCanvas?.width) || 1));
    const sourceHeight = Math.max(1, Math.floor(Number(sourceCanvas?.height) || 1));
    const scale = Math.min(1, Math.max(1, Math.floor(Number(maxEdge) || 42)) / Math.max(sourceWidth, sourceHeight));
    const canvas = createBlankExportPreviewCanvas(
      Math.max(1, Math.round(sourceWidth * scale)),
      Math.max(1, Math.round(sourceHeight * scale))
    );
    const context = canvas.getContext('2d');
    if (!context || !(sourceCanvas instanceof HTMLCanvasElement)) {
      return canvas;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function createGridExportPreviewThumbnail(previewData) {
    const sourceCanvas = previewData?.thumbnailCanvas;
    const canvas = createExportPreviewThumbnailCanvas(sourceCanvas);
    const context = canvas.getContext('2d');
    if (!context || !(sourceCanvas instanceof HTMLCanvasElement)) {
      return canvas;
    }
    const sourceWidth = Math.max(1, sourceCanvas.width);
    const sourceHeight = Math.max(1, sourceCanvas.height);
    const frameWidth = Math.max(1, Number(previewData?.frameWidth) || sourceWidth);
    const frameHeight = Math.max(1, Number(previewData?.frameHeight) || sourceHeight);
    const scaleX = canvas.width / sourceWidth;
    const scaleY = canvas.height / sourceHeight;
    context.save();
    context.strokeStyle = 'rgba(229, 255, 238, 0.92)';
    context.lineWidth = 1;
    context.setLineDash([2, 1]);
    buildGridColumnSegmentsRightToLeft(frameWidth, exportGridTileWidth).forEach(segment => {
      const x = Math.round(segment.start * (sourceWidth / frameWidth) * scaleX) + 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
    });
    buildGridRowSegmentsTopToBottom(frameHeight, exportGridTileHeight).forEach(segment => {
      const y = Math.round(segment.start * (sourceHeight / frameHeight) * scaleY) + 0.5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    });
    context.restore();
    return canvas;
  }

  function createColorSpriteExportPreviewThumbnail(previewData) {
    const activePreview = previewData?.activePreview;
    if (!(activePreview?.pixels instanceof Uint8ClampedArray)) {
      return createExportPreviewThumbnailCanvas(previewData?.thumbnailCanvas);
    }
    const colors = collectUsedColorsFromFramePixels([activePreview.pixels], state.palette);
    const colorSprites = buildColorSpriteFramesFromColors(
      colors,
      Math.max(1, Math.min(16, activePreview.width)),
      Math.max(1, Math.min(16, activePreview.height))
    );
    if (!colorSprites.framePixels.length) {
      return createExportPreviewThumbnailCanvas(previewData?.thumbnailCanvas);
    }
    const visibleSpriteCount = Math.min(4, colorSprites.framePixels.length);
    const sheet = createBlankExportPreviewCanvas(
      Math.max(1, Math.min(16, activePreview.width)),
      Math.max(1, Math.min(16, activePreview.height)) * visibleSpriteCount
    );
    const context = sheet.getContext('2d');
    if (!context) {
      return sheet;
    }
    for (let index = 0; index < visibleSpriteCount; index += 1) {
      context.putImageData(
        new ImageData(colorSprites.framePixels[index], sheet.width, Math.max(1, Math.min(16, activePreview.height))),
        0,
        index * Math.max(1, Math.min(16, activePreview.height))
      );
    }
    return createExportPreviewThumbnailCanvas(sheet);
  }

  function createExportPreviewOutputVisual(card, previewData) {
    if (card.previewType === 'project') {
      return null;
    }
    if (card.previewType === 'spritemap') {
      return createExportPreviewThumbnailCanvas(previewData?.spriteMapCanvas || previewData?.thumbnailCanvas);
    }
    if (card.previewType === 'grid') {
      return createGridExportPreviewThumbnail(previewData);
    }
    if (card.previewType === 'color') {
      return createColorSpriteExportPreviewThumbnail(previewData);
    }
    return createExportPreviewThumbnailCanvas(previewData?.thumbnailCanvas);
  }

  function renderExportPreviewOutputs(mode, previewData = null) {
    const container = dom.exportDialog?.previewOutputs;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    container.replaceChildren();
    const cards = getExportPreviewOutputCards(mode);
    if (!cards.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    cards.forEach(card => {
      const item = document.createElement('div');
      item.className = 'export-preview-output';
      if (card.tone) {
        item.dataset.exportTone = card.tone;
      }
      const visual = createExportPreviewOutputVisual(card, previewData);
      const marker = visual instanceof HTMLCanvasElement
        ? visual
        : document.createElement('span');
      marker.className = visual instanceof HTMLCanvasElement
        ? 'export-preview-output__thumbnail'
        : 'export-preview-output__marker';
      if (!(visual instanceof HTMLCanvasElement)) {
        marker.textContent = card.marker;
      }
      const copy = document.createElement('span');
      copy.className = 'export-preview-output__copy';
      const label = document.createElement('strong');
      label.textContent = card.label;
      const detail = document.createElement('small');
      detail.textContent = card.detail;
      copy.append(label, detail);
      item.append(marker, copy);
      container.append(item);
    });
  }

  function drawExportPreviewCanvas(sourceCanvas, metaText = '') {
    const preview = dom.exportDialog?.previewCanvas;
    if (!(preview instanceof HTMLCanvasElement) || !(sourceCanvas instanceof HTMLCanvasElement)) {
      setExportPreviewMeta(metaText);
      return;
    }
    const cssWidth = Math.max(1, Math.round(preview.clientWidth || 240));
    const cssHeight = Math.max(1, Math.round(preview.clientHeight || 160));
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    preview.width = Math.max(1, Math.round(cssWidth * dpr));
    preview.height = Math.max(1, Math.round(cssHeight * dpr));
    const ctx = preview.getContext('2d');
    if (!ctx) {
      setExportPreviewMeta(metaText);
      return;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.clearRect(0, 0, preview.width, preview.height);
    const tile = Math.max(6, Math.round(8 * dpr));
    for (let y = 0; y < preview.height; y += tile) {
      for (let x = 0; x < preview.width; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) % 2 === 0)
          ? 'rgba(230, 244, 255, 0.18)'
          : 'rgba(10, 16, 26, 0.56)';
        ctx.fillRect(x, y, tile, tile);
      }
    }
    const fitScale = Math.min(
      preview.width / Math.max(1, sourceCanvas.width),
      preview.height / Math.max(1, sourceCanvas.height)
    );
    const scale = fitScale >= 1 ? Math.max(1, Math.floor(fitScale)) : Math.max(0.01, fitScale);
    const drawWidth = Math.max(1, Math.floor(sourceCanvas.width * scale));
    const drawHeight = Math.max(1, Math.floor(sourceCanvas.height * scale));
    const x = Math.floor((preview.width - drawWidth) / 2);
    const y = Math.floor((preview.height - drawHeight) / 2);
    ctx.drawImage(sourceCanvas, x, y, drawWidth, drawHeight);
    setExportPreviewMeta(metaText);
  }

  function createBlankExportPreviewCanvas(width = 1, height = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(Number(width) || 1));
    canvas.height = Math.max(1, Math.floor(Number(height) || 1));
    return canvas;
  }

  function buildLightweightSpriteMapPreviewCanvas(frames, width, height) {
    const safeFrames = Array.isArray(frames) ? frames : [];
    const layout = computeSpriteSheetLayout(safeFrames.length);
    // 100 frames becomes a 10 x 10 map of at most 40px cells: a small,
    // representative canvas rather than a full-size export in the dialog.
    const cellMaxEdge = 40;
    const first = compositeFramePixelsForExportPreview(
      safeFrames[0] || null,
      width,
      height,
      state.palette,
      cellMaxEdge
    );
    const canvas = createBlankExportPreviewCanvas(
      Math.max(1, first.width * layout.columns),
      Math.max(1, first.height * layout.rows)
    );
    const context = canvas.getContext('2d');
    if (!context) {
      return { canvas, layout, cellWidth: first.width, cellHeight: first.height };
    }
    context.imageSmoothingEnabled = false;
    for (let frameIndex = 0; frameIndex < safeFrames.length; frameIndex += 1) {
      const thumbnail = frameIndex === 0
        ? first
        : compositeFramePixelsForExportPreview(
            safeFrames[frameIndex],
            width,
            height,
            state.palette,
            cellMaxEdge
          );
      const column = frameIndex % layout.columns;
      const row = Math.floor(frameIndex / layout.columns);
      context.putImageData(
        new ImageData(thumbnail.pixels, thumbnail.width, thumbnail.height),
        column * first.width,
        row * first.height
      );
    }
    return { canvas, layout, cellWidth: first.width, cellHeight: first.height };
  }

  function buildExportPreviewSourceCanvas(format) {
    const frames = getCurrentExportFrames();
    const width = Math.max(1, state.width);
    const height = Math.max(1, state.height);
    if (!frames.length) {
      return {
        canvas: createBlankExportPreviewCanvas(width, height),
        meta: localizeText('フレームがありません', 'No frames'),
        thumbnailCanvas: createBlankExportPreviewCanvas(1, 1),
        spriteMapCanvas: null,
        activePreview: null,
        frameWidth: width,
        frameHeight: height,
      };
    }
    const normalizedFormat = normalizeExportFormat(format);
    const outputScale = Math.max(1, Math.floor(Number(exportScale) || 1));
    const activeFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, frames.length - 1);
    const activePreview = compositeFramePixelsForExportPreview(
      frames[activeFrameIndex] || frames[0],
      width,
      height,
      state.palette
    );
    const frameCanvas = createFrameCanvas(activePreview.pixels, activePreview.width, activePreview.height);
    const previewSizeLabel = activePreview.width === width && activePreview.height === height
      ? ''
      : ` / preview ${activePreview.width}x${activePreview.height}px`;
    const batchFormats = normalizedFormat === 'batchzip' ? getSelectedBatchZipFormats() : [];
    const includesSpriteMap = normalizedFormat === 'spritemap'
      || normalizedFormat === 'allzip'
      || batchFormats.includes('spritemap')
      || shouldSaveSpriteMapCompanion(normalizedFormat);
    if (includesSpriteMap) {
      const previewMap = buildLightweightSpriteMapPreviewCanvas(frames, width, height);
      const outputWidth = width * previewMap.layout.columns;
      const outputHeight = height * previewMap.layout.rows;
      const label = normalizedFormat === 'allzip'
        ? 'All formats ZIP'
        : (normalizedFormat === 'batchzip' ? `Selected ZIP (${batchFormats.join(', ') || 'none'})` : 'SpriteMAP');
      return {
        canvas: previewMap.canvas,
        meta: `${label} / SpriteMAP ${previewMap.layout.columns}x${previewMap.layout.rows} / 出力 ${outputWidth}x${outputHeight}px / 軽量プレビュー ${previewMap.cellWidth}x${previewMap.cellHeight}px × ${frames.length}フレーム`,
        thumbnailCanvas: frameCanvas,
        spriteMapCanvas: previewMap.canvas,
        activePreview,
        frameWidth: width,
        frameHeight: height,
      };
    }
    if (shouldAppendColorSpritesToPrimaryExport(normalizedFormat)) {
      return {
        canvas: frameCanvas,
        meta: `${getExportFormatLabel(normalizedFormat)} + Color sprites / ${width * outputScale}x${height * outputScale}px / Frame ${activeFrameIndex + 1}/${frames.length}${previewSizeLabel}`,
        thumbnailCanvas: frameCanvas,
        spriteMapCanvas: null,
        activePreview,
        frameWidth: width,
        frameHeight: height,
      };
    }
    const formatLabel = normalizedFormat === 'batchzip'
      ? `Selected ZIP (${batchFormats.join(', ') || 'none'})`
      : getExportFormatLabel(normalizedFormat);
    const outputWidth = width * outputScale;
    const outputHeight = height * outputScale;
    return {
      canvas: frameCanvas,
      meta: `${formatLabel} / Frame ${activeFrameIndex + 1}/${frames.length} / ${outputWidth}x${outputHeight}px${previewSizeLabel}`,
      thumbnailCanvas: frameCanvas,
      spriteMapCanvas: null,
      activePreview,
      frameWidth: width,
      frameHeight: height,
    };
  }

  function updateExportPreview() {
    const dialog = dom.exportDialog?.dialog;
    if (dialog instanceof HTMLDialogElement && !dialog.open) {
      return;
    }
    const format = resolveSelectedExportDialogFormat();
    try {
      const previewData = buildExportPreviewSourceCanvas(format);
      const { canvas, meta } = previewData;
      drawExportPreviewCanvas(canvas, meta);
      renderExportPreviewOutputs(format, previewData);
    } catch (error) {
      console.warn('Failed to update export preview', error);
      drawExportPreviewCanvas(createBlankExportPreviewCanvas(1, 1), localizeText('プレビューを更新できませんでした', 'Preview unavailable'));
      renderExportPreviewOutputs(format);
    }
  }

  function createFrameCanvas(pixels, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('フレーム描画用キャンバスのコンテキストを取得できませんでした');
    }
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas;
  }

  function scaleCanvasNearestNeighbor(sourceCanvas, scale) {
    const numericScale = Math.max(1, Math.floor(Number(scale) || 1));
    if (numericScale <= 1) {
      return sourceCanvas;
    }
    const output = document.createElement('canvas');
    output.width = Math.max(1, sourceCanvas.width * numericScale);
    output.height = Math.max(1, sourceCanvas.height * numericScale);
    const ctx = output.getContext('2d');
    if (!ctx) {
      throw new Error('拡大先キャンバスのコンテキストを取得できませんでした');
    }
    ctx.imageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.drawImage(sourceCanvas, 0, 0, output.width, output.height);
    return output;
  }

  function buildGridRowSegmentsTopToBottom(totalHeight, tileHeight) {
    const fullHeight = Math.max(1, Math.floor(Number(totalHeight) || 0));
    const step = normalizeExportGridTileSize(tileHeight, exportGridTileHeight);
    const segments = [];
    for (let top = 0; top < fullHeight; top += step) {
      const bottom = Math.min(fullHeight, top + step);
      segments.push({
        start: top,
        size: Math.max(1, bottom - top),
      });
    }
    return segments;
  }

  function buildGridColumnSegmentsRightToLeft(totalWidth, tileWidth) {
    const fullWidth = Math.max(1, Math.floor(Number(totalWidth) || 0));
    const step = normalizeExportGridTileSize(tileWidth, exportGridTileWidth);
    const segments = [];
    for (let right = fullWidth; right > 0; right -= step) {
      const left = Math.max(0, right - step);
      segments.push({
        start: left,
        size: Math.max(1, right - left),
      });
    }
    return segments;
  }

  async function canvasRegionToBlob(sourceCanvas, x, y, width, height, mimeType = 'image/png') {
    const sx = Math.max(0, Math.floor(Number(x) || 0));
    const sy = Math.max(0, Math.floor(Number(y) || 0));
    const sw = Math.max(1, Math.floor(Number(width) || 0));
    const sh = Math.max(1, Math.floor(Number(height) || 0));
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = sw;
    tileCanvas.height = sh;
    const ctx = tileCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('分割キャンバスのコンテキストを取得できませんでした');
    }
    ctx.imageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvasToBlob(tileCanvas, mimeType);
  }

  function scaleFramePixelsNearestNeighbor(pixels, width, height, scale) {
    const numericScale = Math.max(1, Math.floor(Number(scale) || 1));
    if (numericScale <= 1) {
      return {
        width,
        height,
        pixels: pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels),
      };
    }
    const targetWidth = width * numericScale;
    const targetHeight = height * numericScale;
    const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let y = 0; y < targetHeight; y += 1) {
      const sourceY = Math.floor(y / numericScale);
      const sourceRow = sourceY * width;
      const targetRow = y * targetWidth;
      for (let x = 0; x < targetWidth; x += 1) {
        const sourceX = Math.floor(x / numericScale);
        const sourceIndex = (sourceRow + sourceX) * 4;
        const targetIndex = (targetRow + x) * 4;
        output[targetIndex] = pixels[sourceIndex];
        output[targetIndex + 1] = pixels[sourceIndex + 1];
        output[targetIndex + 2] = pixels[sourceIndex + 2];
        output[targetIndex + 3] = pixels[sourceIndex + 3];
      }
    }
    return { width: targetWidth, height: targetHeight, pixels: output };
  }

  function scaleFrameSetNearestNeighbor(framePixels, width, height, scale) {
    const numericScale = Math.max(1, Math.floor(Number(scale) || 1));
    if (numericScale <= 1) {
      return { width, height, framePixels };
    }
    const targetWidth = width * numericScale;
    const targetHeight = height * numericScale;
    const scaledFrames = framePixels.map(pixels => scaleFramePixelsNearestNeighbor(pixels, width, height, numericScale).pixels);
    return { width: targetWidth, height: targetHeight, framePixels: scaledFrames };
  }

  function buildSpriteMapCanvas(framePixels, frameWidth, frameHeight, {
    scale = 1,
    columns: requestedColumns = 0,
    rows: requestedRows = 0,
    placements = null,
  } = {}) {
    const safeFrameWidth = Math.max(1, Math.floor(Number(frameWidth) || 0));
    const safeFrameHeight = Math.max(1, Math.floor(Number(frameHeight) || 0));
    const frames = Array.isArray(framePixels) ? framePixels : [];
    const frameCount = Math.max(1, frames.length);
    const fallbackLayout = computeSpriteSheetLayout(frameCount);
    const normalizedPlacements = Array.isArray(placements) ? placements : [];
    const placementColumns = normalizedPlacements.reduce((max, placement) => {
      const value = Math.floor(Number(placement?.column) || 0);
      return Math.max(max, value + 1);
    }, 0);
    const placementRows = normalizedPlacements.reduce((max, placement) => {
      const value = Math.floor(Number(placement?.row) || 0);
      return Math.max(max, value + 1);
    }, 0);
    const explicitColumns = Math.max(0, Math.floor(Number(requestedColumns) || 0));
    const columns = explicitColumns > 0
      ? explicitColumns
      : (placementColumns > 0 ? placementColumns : fallbackLayout.columns);
    const explicitRows = Math.max(0, Math.floor(Number(requestedRows) || 0));
    const rows = Math.max(
      1,
      explicitRows,
      placementRows,
      Math.ceil(frameCount / columns)
    );
    const scaledSet = scaleFrameSetNearestNeighbor(frames, safeFrameWidth, safeFrameHeight, scale);
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = Math.max(1, scaledSet.width * columns);
    sheetCanvas.height = Math.max(1, scaledSet.height * rows);
    const ctx = sheetCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('SpriteMAP用キャンバスのコンテキストを取得できませんでした');
    }
    ctx.imageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    for (let index = 0; index < scaledSet.framePixels.length; index += 1) {
      const pixels = scaledSet.framePixels[index];
      if (!(pixels instanceof Uint8ClampedArray)) {
        continue;
      }
      const placement = normalizedPlacements[index];
      const column = placement && Number.isFinite(Number(placement.column))
        ? clamp(Math.floor(Number(placement.column) || 0), 0, Math.max(0, columns - 1))
        : index % columns;
      const row = placement && Number.isFinite(Number(placement.row))
        ? clamp(Math.floor(Number(placement.row) || 0), 0, Math.max(0, rows - 1))
        : Math.floor(index / columns);
      const x = column * scaledSet.width;
      const y = row * scaledSet.height;
      const frameCanvas = createFrameCanvas(pixels, scaledSet.width, scaledSet.height);
      ctx.drawImage(frameCanvas, x, y);
    }
    return {
      canvas: sheetCanvas,
      columns,
      rows,
      frameWidth: scaledSet.width,
      frameHeight: scaledSet.height,
      sheetWidth: sheetCanvas.width,
      sheetHeight: sheetCanvas.height,
    };
  }

  async function deliverExportTasks(tasks, options = {}) {
    const normalizedTasks = Array.isArray(tasks) ? tasks.slice() : [];
    const shouldSyncProjectCompanion = options.includeProjectCompanion === true
      && doesExportFormatSupportProjectCompanion(options.mode || '');
    const finalizeDeliveryResult = async result => {
      if (!shouldSyncProjectCompanion) {
        return { ...result, projectCompanionResult: 'skipped' };
      }
      if (
        result.exportedCount !== result.total
        || result.wasCancelled
        || result.hadFailure
      ) {
        return { ...result, projectCompanionResult: 'skipped' };
      }
      const projectResult = await saveProjectAsPixieedraw({ announceStatus: false });
      return {
        ...result,
        projectCompanionResult: projectResult?.saved
          ? 'saved'
          : (projectResult?.cancelled ? 'cancelled' : 'failed'),
      };
    };
    const total = normalizedTasks.length;
    if (!total) {
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: false };
    }
    if (total > 1 || options.forceZip) {
      try {
        const zipBlob = await buildZipBlobFromTasks(normalizedTasks);
        const zipFilename = createExportFileName('zip', options.archiveSuffix || 'export_bundle');
        const deliveryResult = await triggerDownloadFromBlob(zipBlob, zipFilename, {
          mimeType: 'application/zip',
          fileExtensions: ['.zip'],
          shareTitle: options.shareTitle || state.documentName || 'PiXiEEDraw',
          shareText: options.archiveShareText || options.shareText || 'ZIPを書き出しました',
          preferShare: false,
          allowAnchorDownload: true,
          forceAnchorDownload: false,
          allowNativePhotoLibrary: false,
          allowNativeSave: false,
          nativeDirectory: options.nativeDirectory,
          nativeSubdirectory: options.nativeSubdirectory,
        });
        switch (deliveryResult) {
          case 'native':
          case 'directory':
          case 'picker':
          case 'download':
          case 'share':
          case 'window':
            return await finalizeDeliveryResult({ exportedCount: total, total, wasCancelled: false, hadFailure: false });
          case 'picker-cancel':
          case 'share-cancel':
            return await finalizeDeliveryResult({ exportedCount: 0, total, wasCancelled: true, hadFailure: false });
          default:
            return await finalizeDeliveryResult({ exportedCount: 0, total, wasCancelled: false, hadFailure: true });
        }
      } catch (error) {
        console.warn('ZIP export packaging failed', error);
        return await finalizeDeliveryResult({ exportedCount: 0, total, wasCancelled: false, hadFailure: true });
      }
    }
    let exportedCount = 0;
    let wasCancelled = false;
    let hadFailure = false;
    for (let index = 0; index < normalizedTasks.length; index += 1) {
      const task = normalizedTasks[index];
      const deliveryResult = await triggerDownloadFromBlob(task.blob, task.filename, {
        mimeType: task.mimeType || options.mimeType,
        fileExtensions: task.fileExtensions || options.fileExtensions,
        shareTitle: options.shareTitle,
        shareText: task.shareText || options.shareText,
        preferShare: false,
        allowAnchorDownload: true,
        forceAnchorDownload: false,
        allowNativePhotoLibrary: false,
        allowNativeSave: false,
        nativeDirectory: options.nativeDirectory,
        nativeSubdirectory: options.nativeSubdirectory,
      });
      switch (deliveryResult) {
        case 'gallery':
        case 'native':
        case 'directory':
        case 'picker':
        case 'download':
        case 'share':
        case 'window':
          exportedCount += 1;
          break;
        case 'picker-cancel':
        case 'share-cancel':
          wasCancelled = true;
          break;
        default:
          hadFailure = true;
          break;
      }
      if (wasCancelled || hadFailure) {
        break;
      }
    }
    return await finalizeDeliveryResult({ exportedCount, total, wasCancelled, hadFailure });
  }

  async function buildProjectExportBundle(fileNameBase = state.documentName, options = {}) {
    commitHistory();
    // A sale file must be generated from the same durable on-device head that
    // appears in Projects. Compact any remaining 1-9 replay patches before
    // packaging, while explicitly keeping external file autosave disabled.
    if (
      autosaveProjectId
      && typeof markActiveLocalProjectJournalNeedsCheckpoint === 'function'
      && typeof markAutosaveDirty === 'function'
      && typeof writeAutosaveSnapshot === 'function'
    ) {
      markActiveLocalProjectJournalNeedsCheckpoint(autosaveProjectId);
      markAutosaveDirty();
      const checkpointCommitted = await writeAutosaveSnapshot(true);
      if (!checkpointCommitted) {
        const error = new Error('On-device V2 checkpoint commit is required before project export');
        error.code = 'ERR_ON_DEVICE_CHECKPOINT_INCOMPLETE';
        throw error;
      }
    }
    const snapshot = options?.snapshot || makeHistorySnapshot();
    if (typeof buildProjectSessionPayloadWithPersistedTimelapse !== 'function') {
      const error = new Error('Complete timelapse synchronization is unavailable');
      error.code = 'ERR_TIMELAPSE_SYNC_UNAVAILABLE';
      throw error;
    }
    const session = options?.session || await buildProjectSessionPayloadWithPersistedTimelapse({
      requireComplete: true,
    });
    if (session?.timelapse?.synchronization?.complete !== true) {
      const error = new Error('Complete timelapse synchronization is required');
      error.code = 'ERR_TIMELAPSE_DATA_INCOMPLETE';
      throw error;
    }
    session.projectExportIntegrity = {
      schemaVersion: 1,
      completeProjectSave: true,
      autosavePolicy: 'indexeddb-checkpoint-journal',
      autosaveRequired: true,
      checkpointOperationInterval: 10,
      externalFileAutosave: false,
      autosaveDestinationConnectedBySave: false,
      timelapseRequired: true,
      timelapseSynchronized: session?.timelapse?.synchronization?.complete === true,
      saleCandidateDataComplete: session?.timelapse?.synchronization?.complete === true,
      approvalScope: 'sales-submission-only',
      localApprovalChecked: false,
      generatedAt: new Date().toISOString(),
    };
    const previewThumbnail = typeof generateSnapshotThumbnail === 'function'
      ? await generateSnapshotThumbnail(snapshot)
      : null;
    const serializedProject = typeof serializeProjectStorageSnapshot === 'function'
      ? await serializeProjectStorageSnapshot({
          snapshot,
          session,
          packaged: options?.packaged || null,
          thumbnail: previewThumbnail,
        }, {
          fileNameBase: fileNameBase || state.documentName,
          // Project tabs are no longer a saved project feature. V2 files
          // always contain the active document only.
          includeSheets: false,
          includeTimelapse: options?.includeTimelapse !== false,
          useWorker: options?.useWorker !== false,
          requireWorker: options?.requireWorker === true,
          preferredAdapterId: options?.preferredStorageAdapterId || '',
        })
      : null;
    const packaged = serializedProject?.packaged || options?.packaged || buildPackagedProjectPayload(snapshot, { session });
    const json = typeof serializedProject?.text === 'string'
      ? serializedProject.text
      : JSON.stringify(packaged);
    const blob = serializedProject?.blob instanceof Blob
      ? serializedProject.blob
      : new Blob([json], { type: PROJECT_FILE_MIME_TYPE });
    const filename = typeof serializedProject?.filename === 'string' && serializedProject.filename
      ? serializedProject.filename
      : createAutosaveFileName(fileNameBase || state.documentName);
    return {
      snapshot,
      session,
      packaged,
      blob,
      filename,
      storageAdapterId: typeof serializedProject?.adapterId === 'string' ? serializedProject.adapterId : '',
      workerUsed: serializedProject?.workerUsed === true,
    };
  }

  function buildProjectFileNameBase(fileNameBase = '') {
    const raw = String(fileNameBase || '').trim() || String(state.documentName || '').trim() || 'project';
    return raw.replace(/\.(?:pxd|pixieedraw|pxdraw)$/i, '');
  }

  async function saveProjectBundleAsNewFile(bundle, options = {}) {
    if (!(bundle?.blob instanceof Blob)) {
      throw new Error('Project bundle blob is required');
    }
    const resolvedFilename = typeof bundle?.filename === 'string' && bundle.filename
      ? bundle.filename
      : createAutosaveFileName(buildProjectFileNameBase(state.documentName));
    const deliveryResult = await triggerDownloadFromBlob(bundle.blob, resolvedFilename, {
      mimeType: PROJECT_FILE_MIME_TYPE,
      shareTitle: options?.shareTitle || `${state.documentName || 'PiXiEEDraw'} v2`,
      shareText: options?.shareText || `${state.documentName || 'PiXiEEDraw'} (PiXiEEDraw v2)`,
      preferShare: false,
      allowAnchorDownload: true,
      forceAnchorDownload: false,
    });
    if (deliveryResult && !String(deliveryResult).endsWith('cancel')) {
      return {
        saved: true,
        cancelled: false,
        savedAsNewFile: true,
        filename: resolvedFilename,
        method: String(deliveryResult),
      };
    }
    if (String(deliveryResult || '').endsWith('cancel')) {
      return {
        saved: false,
        cancelled: true,
        savedAsNewFile: false,
        filename: resolvedFilename,
        method: '',
      };
    }
    return {
      saved: false,
      cancelled: false,
      savedAsNewFile: false,
      filename: resolvedFilename,
      method: '',
    };
  }

  async function executeProjectSaveInternal(options = {}) {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'project' })) {
      return { saved: false, cancelled: false, skipped: true };
    }
    const announceStatus = options?.announceStatus !== false;
    try {
      const {
        snapshot,
        packaged,
        blob,
        filename,
        storageAdapterId,
        workerUsed,
      } = await buildProjectExportBundle(
        options?.fileNameBase || getExportFileNameBase() || state.documentName,
        {
          includeSheets: false,
          includeTimelapse: options?.includeTimelapse !== false,
          useWorker: options?.useWorker !== false,
          requireWorker: options?.requireWorker === true,
          preferredStorageAdapterId: 'pxd-v2-zip',
        }
      );
      const selectedStorageAdapterId = storageAdapterId || 'pxd-v2-zip';
      if (selectedStorageAdapterId !== 'pxd-v2-zip') {
        throw new Error('True V2 project export is required');
      }
      const savePlan = {
        sourceStorageAdapterId: '',
        targetStorageAdapterId: selectedStorageAdapterId,
        sourceKind: 'on-device',
        isConversionSave: false,
        isDowngradeSave: false,
        allowSameHandleOverwrite: false,
        forceSaveAsNewFile: true,
        reason: 'download-only',
      };
      const saveResult = await saveProjectBundleAsNewFile({
        snapshot,
        packaged,
        blob,
        filename,
        storageAdapterId: selectedStorageAdapterId,
        workerUsed,
      }, {
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: `${state.documentName || 'PiXiEEDraw'} (PiXiEEDraw v2)`,
      });
      if (saveResult.saved) {
        markDocumentDurablySaved();
        const savedDotStats = resolvePackagedProjectDotStats(packaged);
        if (savedDotStats) {
          setTrackedProjectDotBaseline(snapshot, savedDotStats);
        }
        if (announceStatus) {
          updateAutosaveStatus('手動保存: 真V2ファイルをダウンロードしました', 'success');
        }
        return {
          saved: true,
          cancelled: false,
          savedAsNewFile: true,
          outputKind: 'download',
          storageAdapterId: selectedStorageAdapterId,
          workerUsed: workerUsed === true,
          savePlan,
        };
      }
      if (saveResult.cancelled) {
        return { saved: false, cancelled: true, savePlan };
      }
      if (announceStatus) {
        updateAutosaveStatus('手動保存: ファイルをダウンロードできませんでした', 'error');
      }
      return { saved: false, cancelled: false, savePlan };
    } catch (error) {
      console.error('Manual project save failed', error);
      if (announceStatus) {
        const timelapseSyncFailed = String(error?.code || '').startsWith('ERR_TIMELAPSE_');
        updateAutosaveStatus(
          timelapseSyncFailed
            ? '手動保存: タイムラプスを完全同期できないため保存を中止しました'
            : '手動保存: ファイルをダウンロードできませんでした',
          'error'
        );
      }
      return { saved: false, cancelled: false, error };
    }
  }


  function buildProjectFileCommandResult(legacyResult = null, {
    commandMode = 'save',
    adapterId = null,
  } = {}) {
    const result = legacyResult && typeof legacyResult === 'object' ? legacyResult : {};
    const saved = result.saved === true;
    const cancelled = result.cancelled === true;
    const blocked = result.blocked === true;
    const isCopy = commandMode === 'copy';
    const savedAsNewFile = result.savedAsNewFile === true;
    const outputKind = result.outputKind || (saved ? 'download' : 'none');
    return {
      ok: saved,
      status: saved
        ? (isCopy ? 'copy-saved' : (savedAsNewFile ? 'saved-as' : 'saved'))
        : (cancelled ? 'cancelled' : (blocked ? 'blocked' : 'failed')),
      reason: cancelled
        ? 'picker-cancel'
        : (result.savePlan?.reason || (blocked ? 'incomplete-project' : null)),
      adapterId: result.storageAdapterId || adapterId || null,
      outputKind,
      bindingChanged: false,
      dirtyChanged: result.dirtyChanged === true || (saved && !isCopy),
      fileNameChanged: false,
      error: result.error instanceof Error ? result.error : null,
      legacyResult: result,
    };
  }

  async function executeProjectSave(options = {}) {
    const result = await executeProjectSaveInternal({ ...options, commandMode: 'save' });
    return buildProjectFileCommandResult(result, {
      commandMode: 'save',
      adapterId: result?.storageAdapterId || options?.preferredStorageAdapterId || null,
    });
  }

  async function executeProjectSaveAs(options = {}) {
    const result = await executeProjectSaveInternal({ ...options, commandMode: 'save-as' });
    return buildProjectFileCommandResult(result, {
      commandMode: 'save-as',
      adapterId: result?.storageAdapterId || options?.preferredStorageAdapterId || null,
    });
  }

  async function executeProjectSaveCopy(options = {}) {
    const result = await executeProjectSaveInternal({ ...options, commandMode: 'copy' });
    return buildProjectFileCommandResult(result, {
      commandMode: 'copy',
      adapterId: result?.storageAdapterId || options?.preferredStorageAdapterId || null,
    });
  }

  async function executeProjectOpen(options = {}) {
    if (typeof openDocumentDialog !== 'function') {
      return {
        ok: false,
        status: 'failed',
        reason: 'unsupported-browser',
        adapterId: null,
        outputKind: 'none',
        bindingChanged: false,
        dirtyChanged: false,
        fileNameChanged: false,
        error: null,
      };
    }
    const opened = await openDocumentDialog({
      ...options,
      mode: options?.mode || EXTERNAL_IMPORT_MODE_NEW_PROJECT,
    });
    return {
      ok: opened === true,
      status: opened === true ? 'opened' : 'cancelled',
      reason: opened === true ? null : 'picker-cancel',
      adapterId: null,
      outputKind: 'none',
      bindingChanged: false,
      dirtyChanged: false,
      fileNameChanged: false,
      error: null,
    };
  }

  // Legacy callers still receive the established saved/cancelled result shape.
  async function saveProjectAsPixieedraw(options = {}) {
    return await executeProjectSaveInternal({ ...options, commandMode: 'save' });
  }
























  // GifWriter implementation adapted from https://github.com/deanm/omggif (MIT License).


  // GifReader implementation adapted from https://github.com/deanm/omggif (MIT License).




  function encodeTypedArray(view) {
    return encodeTypedArrayBinary(view);
  }

  function decodeBase64(value) {
    return decodeBase64Binary(value);
  }

        return Object.freeze({
          buildVoxelPreviewAnimationFrameSet,
          buildSpriteMapExportTasks,
          buildColorSpriteExportPlanFromFramePixels,
          copyPixelBlockToBuffer,
          buildColorSpriteAppendAreaFromFramePixels,
          appendColorSpriteAreaToFramePixels,
          buildColorSpriteAppendAreaForCurrentExport,
          appendColorSpriteAreaToStillFrameSet,
          appendColorSpriteAreaToFrameSet,
          exportProjectAsSpriteMap,
          exportProjectAsAllFormatsZip,
          exportProjectAsJpeg,
          exportProjectAsSvg,
          exportProjectAsGlb,
          exportProjectAsGif,
          createJpegCanvasFromSourceCanvas,
          toSvgColorHex,
          toSvgOpacity,
          buildSvgMarkupFromPixels,
          buildSvgBlobFromPixels,
          compositeDocumentFrames,
          getCurrentExportFrames,
          buildStillExportFrameSet,
          buildExportFrameSet,
          getSelectedBatchZipFormats,
          getSimulationActiveLayer,
          updateSimulationElementPaletteUi,
          buildSimulationElementPaletteButtons,
          mixSimulationColor,
          brightenSimulationColor,
          sampleSimulationPaletteColor,
          resolveSimulationPixelColor,
          compositeSimulationLayerRegion,
          compositeFramePixels,
          resetExportScaleDefaults,
          normalizeExportFormat,
          getExportFormatLabel,
          canExportVoxelGlbInCurrentState,
          getFormatSpecificExportDisabledReason,
          getExportDisabledReason,
          canExportFormatInCurrentState,
          updateExportFormatAvailability,
          isGridPngExportMode,
          canOfferProjectCompanionExport,
          shouldSaveProjectCompanion,
          canOfferSpriteMapCompanionExport,
          shouldSaveSpriteMapCompanion,
          canOfferColorSpriteExport,
          shouldAppendColorSpritesToPrimaryExport,
          updateExportProjectCompanionToggleUI,
          updateExportSpriteMapCompanionToggleUI,
          normalizeExportGridTileSize,
          getExportScaleCandidates,
          canOfferOriginalCompanionExport,
          shouldExportOriginalCompanion,
          doesExportFormatUseScale,
          doesExportFormatSupportProjectCompanion,
          updateExportOptionVisibility,
          updateExportOriginalToggleUI,
          maybeSaveProjectCompanionAfterExport,
          announceProjectCompanionSaveResult,
          applyExportScaleConstraints,
          updateExportScaleHint,
          syncExportScaleInputs,
          syncExportGridInputs,
          setExportScale,
          refreshExportScaleControls,
          setExportPreviewMeta,
          drawExportPreviewCanvas,
          createBlankExportPreviewCanvas,
          buildExportPreviewSourceCanvas,
          updateExportPreview,
          createFrameCanvas,
          canvasRegionToBlob,
          scaleCanvasNearestNeighbor,
          buildGridRowSegmentsTopToBottom,
          buildGridColumnSegmentsRightToLeft,
          scaleFramePixelsNearestNeighbor,
          scaleFrameSetNearestNeighbor,
          buildSpriteMapCanvas,
          deliverExportTasks,
          buildProjectExportBundle,
          executeProjectSave,
          executeProjectSaveAs,
          executeProjectSaveCopy,
          executeProjectOpen,
          saveProjectAsPixieedraw,
        });
      }
    })(scope);
  }

  root.exportRendering = {
    createExportRenderingModule,
  };
})();
