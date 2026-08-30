(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportPlanningUtils({
    MAX_EXPORT_DIMENSION,
    MAX_EXPORT_SCALE_OPTIONS,
    state,
    dom,
    getExportColorSpritesEnabled,
    normalizeExportFormat,
    shouldSaveSpriteMapCompanion,
    shouldAppendColorSpritesToPrimaryExport,
    compositeDocumentFrames,
    buildColorSpriteExportPlanFromFramePixels,
    normalizeColorValue,
    getPaletteColorKey,
  } = {}) {

    function computeSpriteSheetLayout(frameCount) {
      const safeCount = Math.max(1, Math.floor(Number(frameCount) || 0));
      const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount)));
      const rows = Math.max(1, Math.ceil(safeCount / columns));
      return { columns, rows };
    }
  
  
    function collectUsedColorsFromFramePixels(framePixels, palette = state.palette) {
      const frames = Array.isArray(framePixels) ? framePixels : [];
      const discoveredColors = [];
      const discoveredLookup = new Map();
      for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const pixels = frames[frameIndex];
        if (!(pixels instanceof Uint8ClampedArray)) {
          continue;
        }
        const pixelCount = Math.floor(pixels.length / 4);
        for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
          const base = pixelIndex * 4;
          const alpha = pixels[base + 3];
          if (!alpha) {
            continue;
          }
          const color = {
            r: pixels[base],
            g: pixels[base + 1],
            b: pixels[base + 2],
            a: alpha,
          };
          const key = getPaletteColorKey(color);
          if (!discoveredLookup.has(key)) {
            discoveredLookup.set(key, discoveredColors.length);
            discoveredColors.push(normalizeColorValue(color));
          }
        }
      }
      if (!discoveredColors.length) {
        return [];
      }
  
      const orderedColors = [];
      const orderedLookup = new Set();
      if (Array.isArray(palette) && palette.length) {
        palette.forEach((color) => {
          const normalized = normalizeColorValue(color);
          if (normalized.a <= 0) {
            return;
          }
          const key = getPaletteColorKey(normalized);
          if (discoveredLookup.has(key) && !orderedLookup.has(key)) {
            orderedLookup.add(key);
            orderedColors.push(normalized);
          }
        });
      }
      discoveredColors.forEach((color) => {
        const key = getPaletteColorKey(color);
        if (!orderedLookup.has(key)) {
          orderedLookup.add(key);
          orderedColors.push(color);
        }
      });
      return orderedColors;
    }
  
  
    function buildColorSpriteFramesFromColors(colors, frameWidth, frameHeight) {
      const safeFrameWidth = Math.max(1, Math.floor(Number(frameWidth) || 0));
      const safeFrameHeight = Math.max(1, Math.floor(Number(frameHeight) || 0));
      const orderedColors = Array.isArray(colors)
        ? colors
          .map(color => normalizeColorValue(color))
          .filter(color => color.a > 0)
        : [];
      if (!orderedColors.length) {
        return {
          framePixels: [],
          colorCount: 0,
          spriteCount: 0,
          swatchSize: 1,
          columns: safeFrameWidth,
          rows: safeFrameHeight,
          capacityPerSprite: safeFrameWidth * safeFrameHeight,
        };
      }
  
      const colorCellWidth = Math.max(1, Math.min(16, safeFrameWidth));
      const colorCellHeight = Math.max(1, Math.min(16, safeFrameHeight));
      const swatchSize = Math.max(1, Math.min(
        4,
        Math.floor(colorCellWidth / 4) || 1,
        Math.floor(colorCellHeight / 4) || 1
      ));
      const columns = Math.max(1, Math.min(4, Math.floor(colorCellWidth / swatchSize)));
      const rows = Math.max(1, Math.min(4, Math.floor(colorCellHeight / swatchSize)));
      const capacityPerSprite = Math.max(1, columns * rows);
      const framePixels = [];
      let colorIndex = 0;
      while (colorIndex < orderedColors.length) {
        const pixels = new Uint8ClampedArray(safeFrameWidth * safeFrameHeight * 4);
        const swatchCount = Math.min(capacityPerSprite, orderedColors.length - colorIndex);
        for (let swatchIndex = 0; swatchIndex < swatchCount; swatchIndex += 1) {
          const color = orderedColors[colorIndex + swatchIndex];
          const column = swatchIndex % columns;
          const row = Math.floor(swatchIndex / columns);
          const startX = column * swatchSize;
          const startY = row * swatchSize;
          const endX = Math.min(safeFrameWidth, startX + swatchSize);
          const endY = Math.min(safeFrameHeight, startY + swatchSize);
          for (let y = startY; y < endY; y += 1) {
            const rowBase = y * safeFrameWidth;
            for (let x = startX; x < endX; x += 1) {
              const base = (rowBase + x) * 4;
              pixels[base] = color.r;
              pixels[base + 1] = color.g;
              pixels[base + 2] = color.b;
              pixels[base + 3] = color.a;
            }
          }
        }
        framePixels.push(pixels);
        colorIndex += swatchCount;
      }
  
      return {
        framePixels,
        colorCount: orderedColors.length,
        spriteCount: framePixels.length,
        swatchSize,
        columns,
        rows,
        capacityPerSprite,
      };
    }
  
  
    function buildSpriteMapExportPlan(framePixels, frameWidth, frameHeight, palette = state.palette, options = {}) {
      const sourceFrames = Array.isArray(framePixels) ? framePixels : [];
      const safeFrameWidth = Math.max(1, Math.floor(Number(frameWidth) || 0));
      const safeFrameHeight = Math.max(1, Math.floor(Number(frameHeight) || 0));
      const baseLayout = computeSpriteSheetLayout(sourceFrames.length);
      const usedColors = collectUsedColorsFromFramePixels(sourceFrames, palette);
      const includeColorSprites = options.includeColorSprites !== false;
      const colorSpriteSet = includeColorSprites
        ? buildColorSpriteFramesFromColors(usedColors, safeFrameWidth, safeFrameHeight)
        : {
          framePixels: [],
          colorCount: usedColors.length,
          spriteCount: 0,
          swatchSize: 1,
          columns: safeFrameWidth,
          rows: safeFrameHeight,
          capacityPerSprite: safeFrameWidth * safeFrameHeight,
        };
      const tiles = [];
      for (let index = 0; index < sourceFrames.length; index += 1) {
        tiles.push({
          pixels: sourceFrames[index],
          column: index % baseLayout.columns,
          row: Math.floor(index / baseLayout.columns),
        });
      }
      const columns = colorSpriteSet.spriteCount > 0
        ? Math.max(1, baseLayout.columns + 1)
        : Math.max(1, baseLayout.columns);
      for (let index = 0; index < colorSpriteSet.framePixels.length; index += 1) {
        tiles.push({
          pixels: colorSpriteSet.framePixels[index],
          column: columns - 1,
          row: index,
        });
      }
      const rows = Math.max(1, baseLayout.rows, colorSpriteSet.spriteCount);
      return {
        framePixels: tiles.map(tile => tile.pixels),
        placements: tiles.map(tile => ({ column: tile.column, row: tile.row })),
        sourceFrameCount: sourceFrames.length,
        colorSpriteCount: colorSpriteSet.spriteCount,
        usedColorCount: colorSpriteSet.colorCount,
        colorSwatchSize: colorSpriteSet.swatchSize,
        baseColumns: baseLayout.columns,
        baseRows: baseLayout.rows,
        columns,
        rows,
        sheetWidth: safeFrameWidth * columns,
        sheetHeight: safeFrameHeight * rows,
      };
    }
  
  
    function getExportScaleCandidates(mode = dom.exportDialog?.format?.value || 'png', { allowFullScan = false } = {}) {
      const format = normalizeExportFormat(mode);
      const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
      const frameWidth = Math.max(1, state.width);
      const frameHeight = Math.max(1, state.height);
      const includeSpriteMapSheet = (format === 'spritemap' || format === 'allzip' || shouldSaveSpriteMapCompanion(format)) && frameCount > 0;
      const includeColorSpriteSheet = !includeSpriteMapSheet && shouldAppendColorSpritesToPrimaryExport(format) && frameCount > 0;
      // Dialog changes must not composite every animation frame just to decide
      // a scale slider range. Full colour-sprite dimensions are calculated
      // only after the user actually starts an export.
      const shouldScanAllFrames = allowFullScan === true && (includeSpriteMapSheet || includeColorSpriteSheet);
      const sourceFramePixels = shouldScanAllFrames
        ? compositeDocumentFrames(state.frames, frameWidth, frameHeight, state.palette)
        : null;
      const spriteMapPlan = shouldScanAllFrames && includeSpriteMapSheet
        ? buildSpriteMapExportPlan(
          sourceFramePixels,
          frameWidth,
          frameHeight,
          state.palette,
          { includeColorSprites: getExportColorSpritesEnabled() }
        )
        : null;
      const colorSpritePlan = shouldScanAllFrames && includeColorSpriteSheet
        ? buildColorSpriteExportPlanFromFramePixels(sourceFramePixels, frameWidth, frameHeight, state.palette)
        : null;
      const hasColorSpriteAppend = Boolean(colorSpritePlan?.spriteCount && colorSpritePlan.framePixels.length);
      const estimatedLayout = computeSpriteSheetLayout(frameCount);
      const { columns, rows } = spriteMapPlan || colorSpritePlan || estimatedLayout;
      const sheetWidth = spriteMapPlan
        ? Math.max(frameWidth, spriteMapPlan.sheetWidth)
        : (hasColorSpriteAppend ? frameWidth + colorSpritePlan.sheetWidth : (
          includeSpriteMapSheet ? frameWidth * estimatedLayout.columns : frameWidth
        ));
      const sheetHeight = spriteMapPlan
        ? Math.max(frameHeight, spriteMapPlan.sheetHeight)
        : (hasColorSpriteAppend ? Math.max(frameHeight, colorSpritePlan.sheetHeight) : (
          includeSpriteMapSheet ? frameHeight * estimatedLayout.rows : frameHeight
        ));
      const maxScaleWidth = Math.floor(MAX_EXPORT_DIMENSION / sheetWidth);
      const maxScaleHeight = Math.floor(MAX_EXPORT_DIMENSION / sheetHeight);
      const maxScale = Math.max(1, Math.min(
        Math.max(1, maxScaleWidth || 0),
        Math.max(1, maxScaleHeight || 0),
      ));
      const limit = Math.max(1, Math.min(MAX_EXPORT_SCALE_OPTIONS, maxScale));
      const options = [];
      for (let scale = 1; scale <= limit; scale += 1) {
        options.push({
          scale,
          width: sheetWidth * scale,
          height: sheetHeight * scale,
        });
      }
      return {
        options,
        maxScale,
        sheetWidth,
        sheetHeight,
        columns,
        rows,
      };
    }
  
  
    return {
      computeSpriteSheetLayout,
      collectUsedColorsFromFramePixels,
      buildColorSpriteFramesFromColors,
      buildSpriteMapExportPlan,
      getExportScaleCandidates,
    };
  }

  root.exportPlanningUtils = {
    createExportPlanningUtils,
  };
})();
