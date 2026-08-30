(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createColorCodecUtils({
    clamp,
    MAX_IMPORTED_PALETTE_COLORS,
  } = {}) {

    function buildGifFromPixels(framePixels, frameDurations, width, height, options = {}) {
      const { palette, indexedFrames, transparentIndex } = buildIndexedFramesForGif(framePixels, width, height);
      const gifPalette = ensureGifPalette(palette);
      const writerBaseOptions = { palette: gifPalette };
      const hasExplicitLoopCount = Object.prototype.hasOwnProperty.call(options, 'loopCount');
      const requestedLoopCount = hasExplicitLoopCount ? options.loopCount : 0;
      if (Number.isInteger(requestedLoopCount) && requestedLoopCount >= 0 && requestedLoopCount <= 65535) {
        writerBaseOptions.loop = requestedLoopCount;
      }
      const preserveTiming = options?.preserveTiming === true;
      const estimatedSize = Math.max(width * height * indexedFrames.length * 4 + gifPalette.length * 6 + 2048, 4096);
      let bufferSize = estimatedSize;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const buffer = new Uint8Array(bufferSize);
        try {
          const writer = new GifWriter(buffer, width, height, writerBaseOptions);
          indexedFrames.forEach((indexedPixels, index) => {
            const durationMs = preserveTiming
              ? clamp(Math.round(Number(frameDurations[index]) || 0), 10, 655350)
              : clamp(Math.round(Number(frameDurations[index]) || 0), 16, 2000);
            const delayHundredths = clamp(Math.round(durationMs / 10), preserveTiming ? 1 : 2, 65535);
            const hasTransparency = transparentIndex !== null;
            const frameOptions = {
              delay: delayHundredths,
              disposal: hasTransparency ? 2 : 0,
            };
            if (hasTransparency) {
              frameOptions.transparent = transparentIndex;
            }
            writer.addFrame(0, 0, width, height, indexedPixels, frameOptions);
          });
          const size = writer.end();
          return buffer.slice(0, size);
        } catch (error) {
          if (attempt === 3) {
            throw error;
          }
          bufferSize *= 2;
        }
      }
      throw new Error('Unable to encode GIF');
    }

    function buildIndexedFramesForGif(framePixels, width, height) {
      const pixelCount = width * height;
      const colorCounts = new Map();
      let hasTransparency = false;
      framePixels.forEach(pixels => {
        for (let i = 0; i < pixelCount; i += 1) {
          const base = i * 4;
          const alpha = pixels[base + 3];
          if (!alpha) {
            hasTransparency = true;
            continue;
          }
          const key = encodeColorKey(pixels[base], pixels[base + 1], pixels[base + 2]);
          colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        }
      });
      const maxOpaqueColors = hasTransparency ? 255 : 256;
      const opaqueEntries = [];
      colorCounts.forEach((count, key) => {
        const decoded = decodeColorKey(key);
        opaqueEntries.push({ r: decoded.r, g: decoded.g, b: decoded.b, count });
      });
      const paletteColors = quantizeOpaqueColors(opaqueEntries, maxOpaqueColors);
      if (!paletteColors.length) {
        paletteColors.push({ r: 0, g: 0, b: 0 });
      }
      const palette = [];
      let transparentIndex = null;
      if (hasTransparency) {
        palette.push(0);
        transparentIndex = 0;
      }
      paletteColors.forEach(color => {
        const rgb = (color.r << 16) | (color.g << 8) | color.b;
        palette.push(rgb);
      });
      const paletteRgb = palette.map(rgb => ({
        r: (rgb >> 16) & 0xff,
        g: (rgb >> 8) & 0xff,
        b: rgb & 0xff,
      }));
      const colorIndexMap = new Map();
      const indexedFrames = framePixels.map(pixels => {
        const frameIndices = new Uint8Array(pixelCount);
        for (let i = 0; i < pixelCount; i += 1) {
          const base = i * 4;
          const alpha = pixels[base + 3];
          if (!alpha) {
            frameIndices[i] = transparentIndex ?? 0;
            continue;
          }
          const key = encodeColorKey(pixels[base], pixels[base + 1], pixels[base + 2]);
          let paletteIndex = colorIndexMap.get(key);
          if (paletteIndex === undefined) {
            paletteIndex = findNearestPaletteIndex(pixels[base], pixels[base + 1], pixels[base + 2], paletteRgb, transparentIndex);
            colorIndexMap.set(key, paletteIndex);
          }
          frameIndices[i] = paletteIndex;
        }
        return frameIndices;
      });
      return { palette, indexedFrames, transparentIndex };
    }

    function ensureGifPalette(palette) {
      const padded = palette.slice();
      if (padded.length < 2) {
        padded.push(padded[0] ?? 0);
      }
      let size = 1;
      while (size < padded.length && size < 256) {
        size <<= 1;
      }
      if (size > 256) {
        size = 256;
      }
      while (padded.length < size) {
        padded.push(padded[padded.length - 1]);
      }
      return padded;
    }

    function findNearestPaletteIndex(r, g, b, paletteRgb, transparentIndex) {
      let bestIndex = transparentIndex === 0 ? 1 : 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < paletteRgb.length; i += 1) {
        if (i === transparentIndex) {
          continue;
        }
        const color = paletteRgb[i];
        const dr = color.r - r;
        const dg = color.g - g;
        const db = color.b - b;
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
          if (distance === 0) {
            break;
          }
        }
      }
      if (bestDistance === Number.POSITIVE_INFINITY) {
        return transparentIndex ?? 0;
      }
      return bestIndex;
    }

    function quantizeOpaqueColors(colors, maxColors) {
      if (!colors.length) {
        return [];
      }
      if (colors.length <= maxColors) {
        return colors.map(color => ({ r: color.r, g: color.g, b: color.b }));
      }
      const boxes = [createColorBox(colors)];
      while (boxes.length < maxColors) {
        boxes.sort((a, b) => {
          if (b.range === a.range) {
            return b.totalCount - a.totalCount;
          }
          return b.range - a.range;
        });
        const box = boxes.shift();
        if (!box || box.colors.length <= 1) {
          if (box) {
            boxes.push(box);
          }
          break;
        }
        const split = splitColorBox(box);
        if (!split) {
          boxes.push(box);
          break;
        }
        boxes.push(split[0], split[1]);
      }
      return boxes.map(box => averageColorFromBox(box.colors));
    }

    function quantizeRgbaColors(colors, maxColors) {
      if (!colors.length) {
        return [];
      }
      const normalizedMaxColors = clamp(Math.round(Number(maxColors) || 0), 1, MAX_IMPORTED_PALETTE_COLORS);
      return quantizeRgbaColorEntriesWithMapping(colors, normalizedMaxColors).palette;
    }

    function normalizeRgbaQuantizeEntries(colors) {
      return Array.isArray(colors)
        ? colors.map((color, index) => ({
          ...normalizeColorValue(color),
          count: Math.max(1, Math.round(Number(color?.count) || 1)),
          sourceIndex: Number.isInteger(color?.sourceIndex) && color.sourceIndex >= 0 ? color.sourceIndex : index,
          sourceIndices: Array.isArray(color?.sourceIndices) && color.sourceIndices.length
            ? color.sourceIndices.slice()
            : [Number.isInteger(color?.sourceIndex) && color.sourceIndex >= 0 ? color.sourceIndex : index],
        }))
        : [];
    }

    function quantizeRgbaColorEntriesWithMapping(colors, maxColors) {
      const normalizedMaxColors = clamp(Math.round(Number(maxColors) || 0), 1, MAX_IMPORTED_PALETTE_COLORS);
      const entries = normalizeRgbaQuantizeEntries(colors).filter(color => color.a > 0);
      const sourceIndexToPaletteIndex = [];
      if (!entries.length) {
        return { palette: [], sourceIndexToPaletteIndex };
      }
      if (entries.length <= normalizedMaxColors) {
        const palette = entries.map(color => normalizeColorValue(color));
        entries.forEach((entry, paletteIndex) => {
          (entry.sourceIndices || [entry.sourceIndex]).forEach(sourceIndex => {
            sourceIndexToPaletteIndex[sourceIndex] = paletteIndex;
          });
        });
        return { palette, sourceIndexToPaletteIndex };
      }
      if (entries.length <= 8192) {
        return quantizeRgbaColorEntriesWithWeightedKMeans(entries, normalizedMaxColors);
      }
      const boxes = [createRgbaColorBox(entries)];
      while (boxes.length < normalizedMaxColors) {
        boxes.sort((a, b) => {
          if (b.range === a.range) {
            return b.totalCount - a.totalCount;
          }
          return b.range - a.range;
        });
        const box = boxes.shift();
        if (!box || box.colors.length <= 1) {
          if (box) {
            boxes.push(box);
          }
          break;
        }
        const split = splitRgbaColorBox(box);
        if (!split) {
          boxes.push(box);
          break;
        }
        boxes.push(split[0], split[1]);
      }
      const palette = boxes.map(box => averageRgbaColorFromBox(box.colors));
      boxes.forEach((box, paletteIndex) => {
        box.colors.forEach(color => {
          (color.sourceIndices || [color.sourceIndex]).forEach(sourceIndex => {
            sourceIndexToPaletteIndex[sourceIndex] = paletteIndex;
          });
        });
      });
      return { palette, sourceIndexToPaletteIndex };
    }

    function quantizeRgbaColorEntriesWithWeightedKMeans(colors, maxColors) {
      const entries = normalizeRgbaQuantizeEntries(colors).filter(color => color.a > 0);
      const targetCount = Math.min(
        entries.length,
        clamp(Math.round(Number(maxColors) || 0), 1, MAX_IMPORTED_PALETTE_COLORS)
      );
      const sourceIndexToPaletteIndex = [];
      if (!entries.length || targetCount <= 0) {
        return { palette: [], sourceIndexToPaletteIndex };
      }
      if (entries.length <= targetCount) {
        const palette = entries.map(color => normalizeColorValue(color));
        entries.forEach((entry, paletteIndex) => {
          (entry.sourceIndices || [entry.sourceIndex]).forEach(sourceIndex => {
            sourceIndexToPaletteIndex[sourceIndex] = paletteIndex;
          });
        });
        return { palette, sourceIndexToPaletteIndex };
      }
  
      const centers = [];
      const selected = new Set();
      let firstIndex = 0;
      for (let index = 1; index < entries.length; index += 1) {
        if ((entries[index].count || 1) > (entries[firstIndex].count || 1)) {
          firstIndex = index;
        }
      }
      centers.push(normalizeColorValue(entries[firstIndex]));
      selected.add(firstIndex);
      const nearestDistances = new Array(entries.length).fill(Number.POSITIVE_INFINITY);
      while (centers.length < targetCount) {
        const lastCenter = centers[centers.length - 1];
        let bestIndex = -1;
        let bestScore = -1;
        for (let index = 0; index < entries.length; index += 1) {
          const distance = getRgbaMergeDistance(entries[index], lastCenter);
          if (distance < nearestDistances[index]) {
            nearestDistances[index] = distance;
          }
          if (selected.has(index)) {
            continue;
          }
          const score = nearestDistances[index] * Math.sqrt(Math.max(1, entries[index].count || 1));
          if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }
        if (bestIndex < 0) {
          break;
        }
        centers.push(normalizeColorValue(entries[bestIndex]));
        selected.add(bestIndex);
      }
  
      const assignments = new Int16Array(entries.length).fill(-1);
      const iterationCount = entries.length > 4096 ? 5 : 8;
      for (let iteration = 0; iteration < iterationCount; iteration += 1) {
        const totals = centers.map(() => ({ r: 0, g: 0, b: 0, a: 0, count: 0 }));
        let changed = false;
        for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
          const entry = entries[entryIndex];
          let bestIndex = 0;
          let bestDistance = Number.POSITIVE_INFINITY;
          for (let centerIndex = 0; centerIndex < centers.length; centerIndex += 1) {
            const distance = getRgbaMergeDistance(entry, centers[centerIndex]);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = centerIndex;
              if (distance === 0) {
                break;
              }
            }
          }
          if (assignments[entryIndex] !== bestIndex) {
            assignments[entryIndex] = bestIndex;
            changed = true;
          }
          const weight = Math.max(1, entry.count || 1);
          const total = totals[bestIndex];
          total.r += entry.r * weight;
          total.g += entry.g * weight;
          total.b += entry.b * weight;
          total.a += entry.a * weight;
          total.count += weight;
        }
        totals.forEach((total, centerIndex) => {
          if (total.count > 0) {
            centers[centerIndex] = normalizeColorValue({
              r: Math.round(total.r / total.count),
              g: Math.round(total.g / total.count),
              b: Math.round(total.b / total.count),
              a: Math.round(total.a / total.count),
            });
          }
        });
        if (!changed && iteration > 0) {
          break;
        }
      }
  
      const usedCenterIndices = new Set();
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex];
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let centerIndex = 0; centerIndex < centers.length; centerIndex += 1) {
          const distance = getRgbaMergeDistance(entry, centers[centerIndex]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = centerIndex;
            if (distance === 0) {
              break;
            }
          }
        }
        assignments[entryIndex] = bestIndex;
        usedCenterIndices.add(bestIndex);
      }
  
      const centerIndexRemap = new Map();
      const palette = [];
      centers.forEach((center, centerIndex) => {
        if (!usedCenterIndices.has(centerIndex)) {
          return;
        }
        centerIndexRemap.set(centerIndex, palette.length);
        palette.push(normalizeColorValue(center));
      });
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex];
        const remappedIndex = centerIndexRemap.get(assignments[entryIndex]);
        if (!Number.isInteger(remappedIndex) || remappedIndex < 0) {
          continue;
        }
        (entry.sourceIndices || [entry.sourceIndex]).forEach(sourceIndex => {
          sourceIndexToPaletteIndex[sourceIndex] = remappedIndex;
        });
      }
      return { palette, sourceIndexToPaletteIndex };
    }

    function getRgbaMergeDistance(leftColor, rightColor) {
      const left = normalizeColorValue(leftColor);
      const right = normalizeColorValue(rightColor);
      const dr = left.r - right.r;
      const dg = left.g - right.g;
      const db = left.b - right.b;
      const da = left.a - right.a;
      return (dr * dr * 3) + (dg * dg * 4) + (db * db * 2) + (da * da * 8);
    }

    function mergeWeightedRgbaColors(leftColor, rightColor) {
      const left = normalizeColorValue(leftColor);
      const right = normalizeColorValue(rightColor);
      const leftWeight = Math.max(1, Math.round(Number(leftColor?.count) || 1));
      const rightWeight = Math.max(1, Math.round(Number(rightColor?.count) || 1));
      const total = leftWeight + rightWeight;
      return {
        r: Math.round(((left.r * leftWeight) + (right.r * rightWeight)) / total),
        g: Math.round(((left.g * leftWeight) + (right.g * rightWeight)) / total),
        b: Math.round(((left.b * leftWeight) + (right.b * rightWeight)) / total),
        a: Math.round(((left.a * leftWeight) + (right.a * rightWeight)) / total),
        count: total,
      };
    }

    function reduceRgbaColorsByClosestPairs(colors, maxColors) {
      return reduceRgbaColorEntriesByClosestPairsWithMapping(colors, maxColors).palette;
    }

    function reduceRgbaColorEntriesByClosestPairsWithMapping(colors, maxColors) {
      const targetCount = clamp(Math.round(Number(maxColors) || 0), 1, MAX_IMPORTED_PALETTE_COLORS);
      const reduced = normalizeRgbaQuantizeEntries(colors).filter(color => color.a > 0);
      while (reduced.length > targetCount) {
        let bestLeft = -1;
        let bestRight = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let left = 0; left < reduced.length - 1; left += 1) {
          for (let right = left + 1; right < reduced.length; right += 1) {
            const distance = getRgbaMergeDistance(reduced[left], reduced[right]);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestLeft = left;
              bestRight = right;
              if (distance === 0) {
                break;
              }
            }
          }
          if (bestDistance === 0) {
            break;
          }
        }
        if (bestLeft < 0 || bestRight < 0) {
          break;
        }
        const merged = mergeWeightedRgbaColors(reduced[bestLeft], reduced[bestRight]);
        reduced[bestLeft] = {
          ...merged,
          sourceIndices: [
            ...(Array.isArray(reduced[bestLeft].sourceIndices) ? reduced[bestLeft].sourceIndices : [reduced[bestLeft].sourceIndex]),
            ...(Array.isArray(reduced[bestRight].sourceIndices) ? reduced[bestRight].sourceIndices : [reduced[bestRight].sourceIndex]),
          ],
        };
        reduced.splice(bestRight, 1);
      }
      const sourceIndexToPaletteIndex = [];
      reduced.forEach((entry, paletteIndex) => {
        (entry.sourceIndices || [entry.sourceIndex]).forEach(sourceIndex => {
          sourceIndexToPaletteIndex[sourceIndex] = paletteIndex;
        });
      });
      return {
        palette: reduced.map(color => normalizeColorValue(color)),
        sourceIndexToPaletteIndex,
      };
    }

    function createRgbaColorBox(colors) {
      let rMin = 255;
      let rMax = 0;
      let gMin = 255;
      let gMax = 0;
      let bMin = 255;
      let bMax = 0;
      let aMin = 255;
      let aMax = 0;
      let totalCount = 0;
      colors.forEach(color => {
        rMin = Math.min(rMin, color.r);
        rMax = Math.max(rMax, color.r);
        gMin = Math.min(gMin, color.g);
        gMax = Math.max(gMax, color.g);
        bMin = Math.min(bMin, color.b);
        bMax = Math.max(bMax, color.b);
        aMin = Math.min(aMin, color.a);
        aMax = Math.max(aMax, color.a);
        totalCount += color.count || 1;
      });
      const rRange = rMax - rMin;
      const gRange = gMax - gMin;
      const bRange = bMax - bMin;
      const aRange = aMax - aMin;
      return {
        colors: colors.slice(),
        rMin,
        rMax,
        gMin,
        gMax,
        bMin,
        bMax,
        aMin,
        aMax,
        rRange,
        gRange,
        bRange,
        aRange,
        range: Math.max(rRange, gRange, bRange, aRange * 1.35),
        totalCount,
      };
    }

    function splitRgbaColorBox(box) {
      const channel = selectRgbaSplitChannel(box);
      const sorted = box.colors.slice().sort((a, b) => a[channel] - b[channel]);
      if (!sorted.length) {
        return null;
      }
      const total = sorted.reduce((sum, color) => sum + (color.count || 1), 0);
      const target = total / 2;
      let run = 0;
      let pivot = 0;
      for (; pivot < sorted.length - 1; pivot += 1) {
        run += sorted[pivot].count || 1;
        if (run >= target) {
          break;
        }
      }
      const left = sorted.slice(0, pivot + 1);
      const right = sorted.slice(pivot + 1);
      if (!left.length || !right.length) {
        return null;
      }
      return [createRgbaColorBox(left), createRgbaColorBox(right)];
    }

    function selectRgbaSplitChannel(box) {
      const weightedAlphaRange = box.aRange * 1.35;
      if (weightedAlphaRange >= box.rRange && weightedAlphaRange >= box.gRange && weightedAlphaRange >= box.bRange) {
        return 'a';
      }
      if (box.rRange >= box.gRange && box.rRange >= box.bRange) {
        return 'r';
      }
      if (box.gRange >= box.rRange && box.gRange >= box.bRange) {
        return 'g';
      }
      return 'b';
    }

    function averageRgbaColorFromBox(colors) {
      let total = 0;
      let rTotal = 0;
      let gTotal = 0;
      let bTotal = 0;
      let aTotal = 0;
      colors.forEach(color => {
        const weight = color.count || 1;
        total += weight;
        rTotal += color.r * weight;
        gTotal += color.g * weight;
        bTotal += color.b * weight;
        aTotal += color.a * weight;
      });
      if (!total) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      return normalizeColorValue({
        r: Math.round(rTotal / total),
        g: Math.round(gTotal / total),
        b: Math.round(bTotal / total),
        a: Math.round(aTotal / total),
      });
    }

    function createColorBox(colors) {
      let rMin = 255;
      let rMax = 0;
      let gMin = 255;
      let gMax = 0;
      let bMin = 255;
      let bMax = 0;
      let totalCount = 0;
      colors.forEach(color => {
        rMin = Math.min(rMin, color.r);
        rMax = Math.max(rMax, color.r);
        gMin = Math.min(gMin, color.g);
        gMax = Math.max(gMax, color.g);
        bMin = Math.min(bMin, color.b);
        bMax = Math.max(bMax, color.b);
        totalCount += color.count || 1;
      });
      const range = Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
      return {
        colors: colors.slice(),
        rMin,
        rMax,
        gMin,
        gMax,
        bMin,
        bMax,
        range,
        totalCount,
      };
    }

    function splitColorBox(box) {
      const channel = selectSplitChannel(box);
      const sorted = box.colors.slice().sort((a, b) => a[channel] - b[channel]);
      if (!sorted.length) {
        return null;
      }
      const total = sorted.reduce((sum, color) => sum + (color.count || 1), 0);
      const target = total / 2;
      let run = 0;
      let pivot = 0;
      for (; pivot < sorted.length - 1; pivot += 1) {
        run += sorted[pivot].count || 1;
        if (run >= target) {
          break;
        }
      }
      const left = sorted.slice(0, pivot + 1);
      const right = sorted.slice(pivot + 1);
      if (!left.length || !right.length) {
        return null;
      }
      return [createColorBox(left), createColorBox(right)];
    }

    function selectSplitChannel(box) {
      const rRange = box.rMax - box.rMin;
      const gRange = box.gMax - box.gMin;
      const bRange = box.bMax - box.bMin;
      if (rRange >= gRange && rRange >= bRange) {
        return 'r';
      }
      if (gRange >= rRange && gRange >= bRange) {
        return 'g';
      }
      return 'b';
    }

    function averageColorFromBox(colors) {
      let total = 0;
      let rTotal = 0;
      let gTotal = 0;
      let bTotal = 0;
      colors.forEach(color => {
        const weight = color.count || 1;
        total += weight;
        rTotal += color.r * weight;
        gTotal += color.g * weight;
        bTotal += color.b * weight;
      });
      if (!total) {
        return { r: 0, g: 0, b: 0 };
      }
      return {
        r: Math.round(rTotal / total),
        g: Math.round(gTotal / total),
        b: Math.round(bTotal / total),
      };
    }

    function encodeColorKey(r, g, b) {
      return (r << 16) | (g << 8) | b;
    }

    function decodeColorKey(key) {
      return {
        r: (key >> 16) & 0xff,
        g: (key >> 8) & 0xff,
        b: key & 0xff,
      };
    }

    function GifWriter(buf, width, height, gopts) {
      let p = 0;
  
      gopts = gopts === undefined ? {} : gopts;
      const loop_count = gopts.loop === undefined ? null : gopts.loop;
      const global_palette = gopts.palette === undefined ? null : gopts.palette;
  
      if (width <= 0 || height <= 0 || width > 65535 || height > 65535) {
        throw new Error('Width/Height invalid.');
      }
  
      function check_palette_and_num_colors(palette) {
        let num_colors = palette.length;
        if (num_colors < 2 || num_colors > 256 || (num_colors & (num_colors - 1))) {
          throw new Error('Invalid code/color length, must be power of 2 and 2 .. 256.');
        }
        return num_colors;
      }
  
      buf[p++] = 0x47; buf[p++] = 0x49; buf[p++] = 0x46;
      buf[p++] = 0x38; buf[p++] = 0x39; buf[p++] = 0x61;
  
      let gp_num_colors_pow2 = 0;
      let background = 0;
      if (global_palette !== null) {
        let gp_num_colors = check_palette_and_num_colors(global_palette);
        while (gp_num_colors >>= 1) gp_num_colors_pow2 += 1;
        gp_num_colors = 1 << gp_num_colors_pow2;
        gp_num_colors_pow2 -= 1;
        if (gopts.background !== undefined) {
          background = gopts.background;
          if (background >= gp_num_colors) {
            throw new Error('Background index out of range.');
          }
          if (background === 0) {
            throw new Error('Background index explicitly passed as 0.');
          }
        }
      }
  
      buf[p++] = width & 0xff; buf[p++] = (width >> 8) & 0xff;
      buf[p++] = height & 0xff; buf[p++] = (height >> 8) & 0xff;
      buf[p++] = (global_palette !== null ? 0x80 : 0) | gp_num_colors_pow2;
      buf[p++] = background;
      buf[p++] = 0;
  
      if (global_palette !== null) {
        for (let i = 0, il = global_palette.length; i < il; ++i) {
          const rgb = global_palette[i];
          buf[p++] = (rgb >> 16) & 0xff;
          buf[p++] = (rgb >> 8) & 0xff;
          buf[p++] = rgb & 0xff;
        }
      }
  
      if (loop_count !== null) {
        if (loop_count < 0 || loop_count > 65535) {
          throw new Error('Loop count invalid.');
        }
        buf[p++] = 0x21; buf[p++] = 0xff; buf[p++] = 0x0b;
        buf[p++] = 0x4e; buf[p++] = 0x45; buf[p++] = 0x54; buf[p++] = 0x53;
        buf[p++] = 0x43; buf[p++] = 0x41; buf[p++] = 0x50; buf[p++] = 0x45;
        buf[p++] = 0x32; buf[p++] = 0x2e; buf[p++] = 0x30;
        buf[p++] = 0x03; buf[p++] = 0x01;
        buf[p++] = loop_count & 0xff; buf[p++] = (loop_count >> 8) & 0xff;
        buf[p++] = 0x00;
      }
  
      let ended = false;
  
      this.addFrame = function addFrame(x, y, w, h, indexed_pixels, opts) {
        if (ended === true) {
          p -= 1;
          ended = false;
        }
  
        opts = opts === undefined ? {} : opts;
  
        if (x < 0 || y < 0 || x > 65535 || y > 65535) {
          throw new Error('x/y invalid.');
        }
        if (w <= 0 || h <= 0 || w > 65535 || h > 65535) {
          throw new Error('Width/Height invalid.');
        }
        if (indexed_pixels.length < w * h) {
          throw new Error('Not enough pixels for the frame size.');
        }
  
        let using_local_palette = true;
        let palette = opts.palette;
        if (palette === undefined || palette === null) {
          using_local_palette = false;
          palette = global_palette;
        }
        if (palette === undefined || palette === null) {
          throw new Error('Must supply either a local or global palette.');
        }
  
        let num_colors = check_palette_and_num_colors(palette);
        let min_code_size = 0;
        while (num_colors >>= 1) min_code_size += 1;
        num_colors = 1 << min_code_size;
  
        const delay = opts.delay === undefined ? 0 : opts.delay;
        const disposal = opts.disposal === undefined ? 0 : opts.disposal;
        if (disposal < 0 || disposal > 3) {
          throw new Error('Disposal out of range.');
        }
  
        let use_transparency = false;
        let transparent_index = 0;
        if (opts.transparent !== undefined && opts.transparent !== null) {
          use_transparency = true;
          transparent_index = opts.transparent;
          if (transparent_index < 0 || transparent_index >= num_colors) {
            throw new Error('Transparent color index.');
          }
        }
  
        if (disposal !== 0 || use_transparency || delay !== 0) {
          buf[p++] = 0x21; buf[p++] = 0xf9;
          buf[p++] = 4;
          buf[p++] = (disposal << 2) | (use_transparency === true ? 1 : 0);
          buf[p++] = delay & 0xff; buf[p++] = (delay >> 8) & 0xff;
          buf[p++] = transparent_index;
          buf[p++] = 0;
        }
  
        buf[p++] = 0x2c;
        buf[p++] = x & 0xff; buf[p++] = (x >> 8) & 0xff;
        buf[p++] = y & 0xff; buf[p++] = (y >> 8) & 0xff;
        buf[p++] = w & 0xff; buf[p++] = (w >> 8) & 0xff;
        buf[p++] = h & 0xff; buf[p++] = (h >> 8) & 0xff;
        buf[p++] = using_local_palette === true ? (0x80 | (min_code_size - 1)) : 0;
  
        if (using_local_palette === true) {
          for (let i = 0, il = palette.length; i < il; ++i) {
            const rgb = palette[i];
            buf[p++] = (rgb >> 16) & 0xff;
            buf[p++] = (rgb >> 8) & 0xff;
            buf[p++] = rgb & 0xff;
          }
        }
  
        p = GifWriterOutputLZWCodeStream(buf, p, min_code_size < 2 ? 2 : min_code_size, indexed_pixels);
        return p;
      };
  
      this.end = function end() {
        if (ended === false) {
          buf[p++] = 0x3b;
          ended = true;
        }
        return p;
      };
  
      this.getOutputBuffer = function getOutputBuffer() { return buf; };
      this.setOutputBuffer = function setOutputBuffer(v) { buf = v; };
      this.getOutputBufferPosition = function getOutputBufferPosition() { return p; };
      this.setOutputBufferPosition = function setOutputBufferPosition(v) { p = v; };
    }

    function GifWriterOutputLZWCodeStream(buf, p, min_code_size, index_stream) {
      buf[p++] = min_code_size;
      let cur_subblock = p++;
  
      const clear_code = 1 << min_code_size;
      const code_mask = clear_code - 1;
      const eoi_code = clear_code + 1;
      let next_code = eoi_code + 1;
  
      let cur_code_size = min_code_size + 1;
      let cur_shift = 0;
      let cur = 0;
  
      function emit_bytes_to_buffer(bit_block_size) {
        while (cur_shift >= bit_block_size) {
          buf[p++] = cur & 0xff;
          cur >>= 8;
          cur_shift -= 8;
          if (p === cur_subblock + 256) {
            buf[cur_subblock] = 255;
            cur_subblock = p++;
          }
        }
      }
  
      function emit_code(c) {
        cur |= c << cur_shift;
        cur_shift += cur_code_size;
        emit_bytes_to_buffer(8);
      }
  
      let ib_code = index_stream[0] & code_mask;
      let code_table = {};
  
      emit_code(clear_code);
  
      for (let i = 1, il = index_stream.length; i < il; ++i) {
        const k = index_stream[i] & code_mask;
        const cur_key = (ib_code << 8) | k;
        const cur_code = code_table[cur_key];
  
        if (cur_code === undefined) {
          cur |= ib_code << cur_shift;
          cur_shift += cur_code_size;
          while (cur_shift >= 8) {
            buf[p++] = cur & 0xff;
            cur >>= 8;
            cur_shift -= 8;
            if (p === cur_subblock + 256) {
              buf[cur_subblock] = 255;
              cur_subblock = p++;
            }
          }
  
          if (next_code === 4096) {
            emit_code(clear_code);
            next_code = eoi_code + 1;
            cur_code_size = min_code_size + 1;
            code_table = {};
          } else {
            if (next_code >= (1 << cur_code_size)) {
              cur_code_size += 1;
            }
            code_table[cur_key] = next_code++;
          }
  
          ib_code = k;
        } else {
          ib_code = cur_code;
        }
      }
  
      emit_code(ib_code);
      emit_code(eoi_code);
      emit_bytes_to_buffer(1);
  
      if (cur_subblock + 1 === p) {
        buf[cur_subblock] = 0;
      } else {
        buf[cur_subblock] = p - cur_subblock - 1;
        buf[p++] = 0;
      }
      return p;
    }

    function GifReader(buf) {
      let p = 0;
  
      if (buf[p++] !== 0x47 || buf[p++] !== 0x49 || buf[p++] !== 0x46 ||
          buf[p++] !== 0x38 || (buf[p++] + 1 & 0xfd) !== 0x38 || buf[p++] !== 0x61) {
        throw new Error('Invalid GIF 87a/89a header.');
      }
  
      const width = buf[p++] | buf[p++] << 8;
      const height = buf[p++] | buf[p++] << 8;
      const pf0 = buf[p++];
      const globalPaletteFlag = pf0 >> 7;
      const numGlobalColorsPow2 = pf0 & 0x7;
      const numGlobalColors = 1 << (numGlobalColorsPow2 + 1);
      const background = buf[p++];
      buf[p++];
  
      let globalPaletteOffset = null;
      let globalPaletteSize = null;
  
      if (globalPaletteFlag) {
        globalPaletteOffset = p;
        globalPaletteSize = numGlobalColors;
        p += numGlobalColors * 3;
      }
  
      let noEof = true;
      const frames = [];
  
      let delay = 0;
      let transparentIndex = null;
      let disposal = 0;
      let loopCount = null;
  
      this.width = width;
      this.height = height;
  
      while (noEof && p < buf.length) {
        switch (buf[p++]) {
          case 0x21: {
            const label = buf[p++];
            if (label === 0xff) {
              if (buf[p] === 0x0b &&
                  buf[p + 1] === 0x4e && buf[p + 2] === 0x45 && buf[p + 3] === 0x54 &&
                  buf[p + 4] === 0x53 && buf[p + 5] === 0x43 && buf[p + 6] === 0x41 &&
                  buf[p + 7] === 0x50 && buf[p + 8] === 0x45 && buf[p + 9] === 0x32 &&
                  buf[p + 10] === 0x2e && buf[p + 11] === 0x30 &&
                  buf[p + 12] === 0x03 && buf[p + 13] === 0x01 && buf[p + 16] === 0) {
                p += 14;
                loopCount = buf[p++] | buf[p++] << 8;
                p++;
              } else {
                p += 12;
                while (true) {
                  const blockSize = buf[p++];
                  if (!(blockSize >= 0)) throw new Error('Invalid block size');
                  if (blockSize === 0) break;
                  p += blockSize;
                }
              }
            } else if (label === 0xf9) {
              if (buf[p++] !== 0x4 || buf[p + 4] !== 0) {
                throw new Error('Invalid graphics extension block.');
              }
              const pf1 = buf[p++];
              delay = buf[p++] | buf[p++] << 8;
              transparentIndex = buf[p++];
              if ((pf1 & 1) === 0) transparentIndex = null;
              disposal = pf1 >> 2 & 0x7;
              p++;
            } else if (label === 0x01 || label === 0xfe) {
              while (true) {
                const blockSize = buf[p++];
                if (!(blockSize >= 0)) throw new Error('Invalid block size');
                if (blockSize === 0) break;
                p += blockSize;
              }
            } else {
              throw new Error(`Unknown graphic control label: 0x${buf[p - 1].toString(16)}`);
            }
            break;
          }
  
          case 0x2c: {
            const x = buf[p++] | buf[p++] << 8;
            const y = buf[p++] | buf[p++] << 8;
            const w = buf[p++] | buf[p++] << 8;
            const h = buf[p++] | buf[p++] << 8;
            const pf2 = buf[p++];
            const localPaletteFlag = pf2 >> 7;
            const interlaceFlag = pf2 >> 6 & 1;
            const numLocalColorsPow2 = pf2 & 0x7;
            const numLocalColors = 1 << (numLocalColorsPow2 + 1);
            let paletteOffset = globalPaletteOffset;
            let paletteSize = globalPaletteSize;
            if (localPaletteFlag) {
              paletteOffset = p;
              paletteSize = numLocalColors;
              p += numLocalColors * 3;
            }
  
            const dataOffset = p;
            p++;
            while (true) {
              const blockSize = buf[p++];
              if (!(blockSize >= 0)) throw new Error('Invalid block size');
              if (blockSize === 0) break;
              p += blockSize;
            }
  
            frames.push({
              x,
              y,
              width: w,
              height: h,
              has_local_palette: Boolean(localPaletteFlag),
              palette_offset: paletteOffset,
              palette_size: paletteSize,
              data_offset: dataOffset,
              data_length: p - dataOffset,
              transparent_index: transparentIndex,
              interlaced: Boolean(interlaceFlag),
              delay,
              disposal,
            });
            // Graphic Control Extension applies only to the immediately following image block.
            delay = 0;
            transparentIndex = null;
            disposal = 0;
            break;
          }
  
          case 0x3b:
            noEof = false;
            break;
  
          default:
            throw new Error(`Unknown gif block: 0x${buf[p - 1].toString(16)}`);
        }
      }
  
      this.numFrames = function numFrames() {
        return frames.length;
      };
  
      this.loopCount = function loopCountFn() {
        return loopCount;
      };
  
      this.getBackgroundIndex = function getBackgroundIndexFn() {
        if (!globalPaletteFlag) {
          return null;
        }
        if (background < 0 || background >= numGlobalColors) {
          return null;
        }
        return background;
      };
  
      this.getBackgroundColor = function getBackgroundColorFn() {
        const bgIndex = this.getBackgroundIndex();
        if (bgIndex === null || globalPaletteOffset === null) {
          return null;
        }
        const colorOffset = globalPaletteOffset + bgIndex * 3;
        if (colorOffset + 2 >= buf.length) {
          return null;
        }
        return {
          r: buf[colorOffset],
          g: buf[colorOffset + 1],
          b: buf[colorOffset + 2],
          a: 255,
        };
      };
  
      this.frameInfo = function frameInfo(frameNum) {
        if (frameNum < 0 || frameNum >= frames.length) {
          throw new Error('Frame index out of range.');
        }
        return frames[frameNum];
      };
  
      this.decodeAndBlitFrameRGBA = function decodeAndBlitFrameRGBA(frameNum, pixels) {
        const frame = this.frameInfo(frameNum);
        const numPixels = frame.width * frame.height;
        const indexStream = new Uint8Array(numPixels);
        GifReaderLZWOutputIndexStream(buf, frame.data_offset, indexStream, numPixels);
        const paletteOffset = frame.palette_offset;
  
        let trans = frame.transparent_index;
        if (trans === null) trans = 256;
  
        const frameWidth = frame.width;
        const frameHeight = frame.height;
        let streamIndex = 0;
        const writeRow = localY => {
          let op = ((frame.y + localY) * width + frame.x) * 4;
          for (let localX = 0; localX < frameWidth; localX += 1) {
            if (streamIndex >= indexStream.length) {
              return false;
            }
            const index = indexStream[streamIndex++];
            if (index === trans) {
              op += 4;
              continue;
            }
            const r = buf[paletteOffset + index * 3];
            const g = buf[paletteOffset + index * 3 + 1];
            const b = buf[paletteOffset + index * 3 + 2];
            pixels[op++] = r;
            pixels[op++] = g;
            pixels[op++] = b;
            pixels[op++] = 255;
          }
          return true;
        };
  
        if (frame.interlaced === true) {
          const passes = [
            { start: 0, step: 8 },
            { start: 4, step: 8 },
            { start: 2, step: 4 },
            { start: 1, step: 2 },
          ];
          for (let passIndex = 0; passIndex < passes.length; passIndex += 1) {
            const pass = passes[passIndex];
            for (let localY = pass.start; localY < frameHeight; localY += pass.step) {
              if (!writeRow(localY)) {
                return;
              }
            }
          }
          return;
        }
  
        for (let localY = 0; localY < frameHeight; localY += 1) {
          if (!writeRow(localY)) {
            return;
          }
        }
      };
    }

    function GifReaderLZWOutputIndexStream(codeStream, p, output, outputLength) {
      const minCodeSize = codeStream[p++];
  
      const clearCode = 1 << minCodeSize;
      const eoiCode = clearCode + 1;
      let codeSize = minCodeSize + 1;
      let codeMask = (1 << codeSize) - 1;
      let nextCode = eoiCode + 1;
      let bitBuffer = 0;
      let bitCount = 0;
      let subblockSize = codeStream[p++];
  
      const prefix = new Int16Array(4096);
      const suffix = new Uint8Array(4096);
      const stack = new Uint8Array(4096);
  
      let outPos = 0;
      let prevCode = -1;
      let firstByte = 0;
  
      const readCode = () => {
        while (bitCount < codeSize) {
          if (subblockSize === 0) {
            return null;
          }
          bitBuffer |= codeStream[p++] << bitCount;
          bitCount += 8;
          subblockSize -= 1;
          if (subblockSize === 0) {
            subblockSize = codeStream[p++];
          }
        }
        const code = bitBuffer & codeMask;
        bitBuffer >>= codeSize;
        bitCount -= codeSize;
        return code;
      };
  
      while (true) {
        const code = readCode();
        if (code === null) {
          break;
        }
  
        if (code === clearCode) {
          codeSize = minCodeSize + 1;
          codeMask = (1 << codeSize) - 1;
          nextCode = eoiCode + 1;
          prevCode = -1;
          continue;
        }
        if (code === eoiCode) {
          break;
        }
  
        let current = code;
        let stackTop = 0;
  
        if (current >= nextCode) {
          if (prevCode < 0) {
            continue;
          }
          stack[stackTop++] = firstByte;
          current = prevCode;
        }
  
        while (current > clearCode) {
          stack[stackTop++] = suffix[current];
          current = prefix[current];
        }
  
        firstByte = current & 0xff;
        stack[stackTop++] = firstByte;
  
        while (stackTop > 0) {
          if (outPos >= outputLength) {
            return;
          }
          output[outPos++] = stack[--stackTop];
        }
  
        if (prevCode >= 0 && nextCode < 4096) {
          prefix[nextCode] = prevCode;
          suffix[nextCode] = firstByte;
          nextCode += 1;
          if (nextCode === (1 << codeSize) && codeSize < 12) {
            codeSize += 1;
            codeMask = (1 << codeSize) - 1;
          }
        }
        prevCode = code;
      }
    }

    function createTextCompression() {
      const lz = createLzString();
      return {
        compressToUTF16(input) {
          if (typeof input !== 'string' || input.length === 0) {
            return '';
          }
          return lz.compressToUTF16(input);
        },
        decompressFromUTF16(input) {
          if (typeof input !== 'string' || input.length === 0) {
            return '';
          }
          return lz.decompressFromUTF16(input) || '';
        },
      };
    }

    function createLzString() {
      const f = String.fromCharCode;
      const LZ = {
        compressToUTF16(input) {
          if (input == null) return '';
          return LZ._compress(input, 15, value => f(value + 32)) + ' ';
        },
        decompressFromUTF16(compressed) {
          if (compressed == null) return '';
          if (compressed === '') return '';
          return LZ._decompress(compressed.length, 16384, index => compressed.charCodeAt(index) - 32);
        },
        _compress(uncompressed, bitsPerChar, getCharFromInt) {
          if (uncompressed == null) return '';
          let i;
          let value;
          const contextDictionary = Object.create(null);
          const contextDictionaryToCreate = Object.create(null);
          let contextC = '';
          let contextWC = '';
          let contextW = '';
          let contextEnlargeIn = 2;
          let contextDictSize = 3;
          let contextNumBits = 2;
          const contextData = [];
          let contextDataVal = 0;
          let contextDataPosition = 0;
          for (let ii = 0; ii < uncompressed.length; ii += 1) {
            contextC = uncompressed.charAt(ii);
            if (!Object.prototype.hasOwnProperty.call(contextDictionary, contextC)) {
              contextDictionary[contextC] = contextDictSize;
              contextDictSize += 1;
              contextDictionaryToCreate[contextC] = true;
            }
            contextWC = contextW + contextC;
            if (Object.prototype.hasOwnProperty.call(contextDictionary, contextWC)) {
              contextW = contextWC;
            } else {
              if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
                if (contextW.charCodeAt(0) < 256) {
                  for (i = 0; i < contextNumBits; i += 1) {
                    contextDataVal <<= 1;
                    if (contextDataPosition === bitsPerChar - 1) {
                      contextDataPosition = 0;
                      contextData.push(getCharFromInt(contextDataVal));
                      contextDataVal = 0;
                    } else {
                      contextDataPosition += 1;
                    }
                  }
                  value = contextW.charCodeAt(0);
                  for (i = 0; i < 8; i += 1) {
                    contextDataVal = (contextDataVal << 1) | (value & 1);
                    if (contextDataPosition === bitsPerChar - 1) {
                      contextDataPosition = 0;
                      contextData.push(getCharFromInt(contextDataVal));
                      contextDataVal = 0;
                    } else {
                      contextDataPosition += 1;
                    }
                    value >>= 1;
                  }
                } else {
                  value = 1;
                  for (i = 0; i < contextNumBits; i += 1) {
                    contextDataVal = (contextDataVal << 1) | value;
                    if (contextDataPosition === bitsPerChar - 1) {
                      contextDataPosition = 0;
                      contextData.push(getCharFromInt(contextDataVal));
                      contextDataVal = 0;
                    } else {
                      contextDataPosition += 1;
                    }
                    value = 0;
                  }
                  value = contextW.charCodeAt(0);
                  for (i = 0; i < 16; i += 1) {
                    contextDataVal = (contextDataVal << 1) | (value & 1);
                    if (contextDataPosition === bitsPerChar - 1) {
                      contextDataPosition = 0;
                      contextData.push(getCharFromInt(contextDataVal));
                      contextDataVal = 0;
                    } else {
                      contextDataPosition += 1;
                    }
                    value >>= 1;
                  }
                }
                contextEnlargeIn -= 1;
                if (contextEnlargeIn === 0) {
                  contextEnlargeIn = 2 ** contextNumBits;
                  contextNumBits += 1;
                }
                delete contextDictionaryToCreate[contextW];
              } else {
                value = contextDictionary[contextW];
                for (i = 0; i < contextNumBits; i += 1) {
                  contextDataVal = (contextDataVal << 1) | (value & 1);
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                  value >>= 1;
                }
              }
              contextEnlargeIn -= 1;
              if (contextEnlargeIn === 0) {
                contextEnlargeIn = 2 ** contextNumBits;
                contextNumBits += 1;
              }
              contextDictionary[contextWC] = contextDictSize;
              contextDictSize += 1;
              contextW = String(contextC);
            }
          }
          if (contextW !== '') {
            if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
              if (contextW.charCodeAt(0) < 256) {
                for (i = 0; i < contextNumBits; i += 1) {
                  contextDataVal <<= 1;
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                }
                value = contextW.charCodeAt(0);
                for (i = 0; i < 8; i += 1) {
                  contextDataVal = (contextDataVal << 1) | (value & 1);
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                  value >>= 1;
                }
              } else {
                value = 1;
                for (i = 0; i < contextNumBits; i += 1) {
                  contextDataVal = (contextDataVal << 1) | value;
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                  value = 0;
                }
                value = contextW.charCodeAt(0);
                for (i = 0; i < 16; i += 1) {
                  contextDataVal = (contextDataVal << 1) | (value & 1);
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                  value >>= 1;
                }
              }
              contextEnlargeIn -= 1;
              if (contextEnlargeIn === 0) {
                contextEnlargeIn = 2 ** contextNumBits;
                contextNumBits += 1;
              }
              delete contextDictionaryToCreate[contextW];
            } else {
              value = contextDictionary[contextW];
              for (i = 0; i < contextNumBits; i += 1) {
                contextDataVal = (contextDataVal << 1) | (value & 1);
                if (contextDataPosition === bitsPerChar - 1) {
                  contextDataPosition = 0;
                  contextData.push(getCharFromInt(contextDataVal));
                  contextDataVal = 0;
                } else {
                  contextDataPosition += 1;
                }
                value >>= 1;
              }
            }
            contextEnlargeIn -= 1;
            if (contextEnlargeIn === 0) {
              contextEnlargeIn = 2 ** contextNumBits;
              contextNumBits += 1;
            }
          }
          value = 2;
          for (i = 0; i < contextNumBits; i += 1) {
            contextDataVal = (contextDataVal << 1) | (value & 1);
            if (contextDataPosition === bitsPerChar - 1) {
              contextDataPosition = 0;
              contextData.push(getCharFromInt(contextDataVal));
              contextDataVal = 0;
            } else {
              contextDataPosition += 1;
            }
            value >>= 1;
          }
          while (true) {
            contextDataVal <<= 1;
            if (contextDataPosition === bitsPerChar - 1) {
              contextData.push(getCharFromInt(contextDataVal));
              break;
            } else {
              contextDataPosition += 1;
            }
          }
          return contextData.join('');
        },
        _decompress(length, resetValue, getNextValue) {
          if (length === 0) return '';
          const dictionary = [];
          let next;
          let enlargeIn = 4;
          let dictSize = 4;
          let numBits = 3;
          let entry = '';
          const result = [];
          let w;
          let bits;
          let resb;
          let maxpower;
          let power;
          let c;
          const data = { val: getNextValue(0), position: resetValue, index: 1 };
          for (let i = 0; i < 3; i += 1) {
            dictionary[i] = i;
          }
          maxpower = 4;
          power = 1;
          bits = 0;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index);
              data.index += 1;
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          switch (next = bits) {
            case 0: {
              maxpower = 256;
              power = 1;
              bits = 0;
              while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index);
                  data.index += 1;
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = f(bits);
              break;
            }
            case 1: {
              maxpower = 65536;
              power = 1;
              bits = 0;
              while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index);
                  data.index += 1;
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = f(bits);
              break;
            }
            case 2:
              return '';
            default:
              c = '';
              break;
          }
          dictionary[3] = c;
          w = c;
          result.push(c);
          while (true) {
            if (data.index > length) {
              return '';
            }
            maxpower = 2 ** numBits;
            power = 1;
            bits = 0;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index);
                data.index += 1;
              }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            switch (c = bits) {
              case 0: {
                maxpower = 256;
                power = 1;
                bits = 0;
                while (power !== maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position === 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index);
                    data.index += 1;
                  }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize] = f(bits);
                dictSize += 1;
                c = dictSize - 1;
                enlargeIn -= 1;
                break;
              }
              case 1: {
                maxpower = 65536;
                power = 1;
                bits = 0;
                while (power !== maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position === 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index);
                    data.index += 1;
                  }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize] = f(bits);
                dictSize += 1;
                c = dictSize - 1;
                enlargeIn -= 1;
                break;
              }
              case 2:
                return result.join('');
              default:
                break;
            }
            if (enlargeIn === 0) {
              enlargeIn = 2 ** numBits;
              numBits += 1;
            }
            if (dictionary[c]) {
              entry = dictionary[c];
            } else if (c === dictSize) {
              entry = w + w.charAt(0);
            } else {
              return '';
            }
            result.push(entry);
            dictionary[dictSize] = w + entry.charAt(0);
            dictSize += 1;
            enlargeIn -= 1;
            w = entry;
            if (enlargeIn === 0) {
              enlargeIn = 2 ** numBits;
              numBits += 1;
            }
          }
        },
      };
      return LZ;
    }

    function normalizeColorValue(input) {
      const normalizeByte = (value, fallback) => {
        if (value === null || value === undefined || value === '') {
          return clamp(Math.round(fallback), 0, 255);
        }
        const parsed = Number(value);
        const safe = Number.isFinite(parsed) ? parsed : fallback;
        return clamp(Math.round(safe), 0, 255);
      };
      if (!input || typeof input !== 'object') {
        return { r: 0, g: 0, b: 0, a: 255 };
      }
      return {
        r: normalizeByte(input.r, 0),
        g: normalizeByte(input.g, 0),
        b: normalizeByte(input.b, 0),
        a: normalizeByte(input.a, 255),
      };
    }

    return {
      buildGifFromPixels,
      buildIndexedFramesForGif,
      ensureGifPalette,
      findNearestPaletteIndex,
      quantizeOpaqueColors,
      quantizeRgbaColors,
      normalizeRgbaQuantizeEntries,
      quantizeRgbaColorEntriesWithMapping,
      quantizeRgbaColorEntriesWithWeightedKMeans,
      getRgbaMergeDistance,
      mergeWeightedRgbaColors,
      reduceRgbaColorsByClosestPairs,
      reduceRgbaColorEntriesByClosestPairsWithMapping,
      createRgbaColorBox,
      splitRgbaColorBox,
      selectRgbaSplitChannel,
      averageRgbaColorFromBox,
      createColorBox,
      splitColorBox,
      selectSplitChannel,
      averageColorFromBox,
      encodeColorKey,
      decodeColorKey,
      GifWriter,
      GifWriterOutputLZWCodeStream,
      GifReader,
      GifReaderLZWOutputIndexStream,
      createTextCompression,
      createLzString,
      normalizeColorValue,
    };
  }

  root.colorCodecUtils = {
    createColorCodecUtils,
  };
})();
