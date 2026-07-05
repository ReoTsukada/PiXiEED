(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createVoxelPreviewUtils(rawScope = {}) {
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
  function scaleVoxelPreviewPixels(pixels, width, height, scale = 1) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    const safeScale = Math.max(1, Math.round(Number(scale) || 1));
    if (!(pixels instanceof Uint8ClampedArray) || safeScale <= 1) {
      return {
        pixels: pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(safeWidth * safeHeight * 4),
        width: safeWidth,
        height: safeHeight,
        scale: 1,
      };
    }
    const targetWidth = safeWidth * safeScale;
    const targetHeight = safeHeight * safeScale;
    const scaled = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let y = 0; y < safeHeight; y += 1) {
      for (let x = 0; x < safeWidth; x += 1) {
        const srcBase = ((y * safeWidth) + x) * 4;
        for (let sy = 0; sy < safeScale; sy += 1) {
          for (let sx = 0; sx < safeScale; sx += 1) {
            const dx = (x * safeScale) + sx;
            const dy = (y * safeScale) + sy;
            const destBase = ((dy * targetWidth) + dx) * 4;
            scaled[destBase] = pixels[srcBase];
            scaled[destBase + 1] = pixels[srcBase + 1];
            scaled[destBase + 2] = pixels[srcBase + 2];
            scaled[destBase + 3] = pixels[srcBase + 3];
          }
        }
      }
    }
    return {
      pixels: scaled,
      width: targetWidth,
      height: targetHeight,
      scale: safeScale,
    };
  }

  function shadeVoxelColor(color, amount = 0) {
    const safeAmount = clamp(Number(amount) || 0, -1, 1);
    const blend = value => {
      const current = clamp(Math.round(Number(value) || 0), 0, 255);
      if (safeAmount >= 0) {
        return Math.round(current + ((255 - current) * safeAmount));
      }
      return Math.round(current * (1 + safeAmount));
    };
    return {
      r: blend(color.r),
      g: blend(color.g),
      b: blend(color.b),
      a: clamp(Math.round(Number(color.a) || 255), 0, 255),
    };
  }

  function getVoxelPreviewProjectionScales(pitchRadians) {
    const effectivePitchRadians = Number.isFinite(pitchRadians)
      ? pitchRadians
      : ((normalizeVoxelPreviewPitchDegrees(voxelExtensionState.previewPitchDeg) * Math.PI) / 180);
    return {
      depthScale: Math.sin(effectivePitchRadians) * 1.9,
      heightScale: Math.max(1.2, Math.cos(effectivePitchRadians) * 2.35),
    };
  }

  function getVoxelPreviewProjectionBoundsMax(sizeX, sizeY, sizeZ) {
    const halfX = Math.max(0.5, Number(sizeX) / 2);
    const halfY = Math.max(0.5, Number(sizeY) / 2);
    const halfZ = Math.max(0.5, Number(sizeZ) / 2);
    const horizontalScale = 2;
    const horizontalRadius = Math.hypot(halfX, halfZ);
    const rawWidthMax = Math.max(1, horizontalRadius * horizontalScale * 2);
    let rawHeightMax = 1;
    for (let pitchDeg = VOXEL_EXTENSION_PREVIEW_PITCH_MIN_DEG; pitchDeg <= VOXEL_EXTENSION_PREVIEW_PITCH_MAX_DEG; pitchDeg += 1) {
      const { depthScale, heightScale } = getVoxelPreviewProjectionScales((pitchDeg * Math.PI) / 180);
      const nextHeight = ((halfY * heightScale) + (horizontalRadius * Math.abs(depthScale))) * 2;
      rawHeightMax = Math.max(rawHeightMax, nextHeight);
    }
    return {
      rawWidthMax,
      rawHeightMax,
    };
  }

  function getVoxelPreviewFixedProjectionScale(sizeX, sizeY, sizeZ, preferredDisplayPx = voxelExtensionState.displayPx) {
    const { rawWidthMax, rawHeightMax } = getVoxelPreviewProjectionBoundsMax(sizeX, sizeY, sizeZ);
    const fitScale = Math.max(1, Math.floor(Math.min(
      (VOXEL_EXTENSION_PREVIEW_MAX_EDGE - 16) / rawWidthMax,
      (VOXEL_EXTENSION_PREVIEW_MAX_EDGE - 16) / rawHeightMax
    )) || 1);
    const preferred = clamp(
      Math.round(Number(preferredDisplayPx) || 0),
      VOXEL_EXTENSION_DISPLAY_PIXEL_MIN,
      VOXEL_EXTENSION_DISPLAY_PIXEL_MAX
    );
    if (preferred > 0) {
      return Math.max(1, Math.min(preferred, fitScale));
    }
    return fitScale;
  }

  function projectVoxelPreviewPoint(x, y, z, sizeX, sizeY, sizeZ, yawRadians, pitchRadians) {
    const centeredX = x - (sizeX / 2);
    const centeredY = y - (sizeY / 2);
    const centeredZ = z - (sizeZ / 2);
    const cosYaw = Math.cos(yawRadians);
    const sinYaw = Math.sin(yawRadians);
    const rotatedX = (centeredX * cosYaw) - (centeredZ * sinYaw);
    const rotatedDepth = (centeredX * sinYaw) + (centeredZ * cosYaw);
    const effectivePitchRadians = Number.isFinite(pitchRadians)
      ? pitchRadians
      : ((normalizeVoxelPreviewPitchDegrees(voxelExtensionState.previewPitchDeg) * Math.PI) / 180);
    const { depthScale, heightScale } = getVoxelPreviewProjectionScales(effectivePitchRadians);
    const horizontalScale = 2;
    return {
      x: rotatedX * horizontalScale,
      y: (centeredY * heightScale) - (rotatedDepth * depthScale),
      depth: (rotatedDepth * Math.cos(effectivePitchRadians)) + (centeredY * Math.sin(effectivePitchRadians)),
    };
  }

  function fillVoxelPolygonRgba(buffer, width, height, points, color) {
    if (!(buffer instanceof Uint8ClampedArray) || !Array.isArray(points) || points.length < 3) {
      return;
    }
    let minY = Infinity;
    let maxY = -Infinity;
    points.forEach(point => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
      }
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return;
    }
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const startY = clamp(Math.floor(minY), 0, safeHeight - 1);
    const endY = clamp(Math.ceil(maxY) - 1, 0, safeHeight - 1);
    for (let y = startY; y <= endY; y += 1) {
      const scanY = y + 0.5;
      const intersections = [];
      for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        if (!current || !next) {
          continue;
        }
        if (!Number.isFinite(current.x) || !Number.isFinite(current.y) || !Number.isFinite(next.x) || !Number.isFinite(next.y)) {
          continue;
        }
        if (current.y === next.y) {
          continue;
        }
        const minEdgeY = Math.min(current.y, next.y);
        const maxEdgeY = Math.max(current.y, next.y);
        if (scanY < minEdgeY || scanY >= maxEdgeY) {
          continue;
        }
        const t = (scanY - current.y) / (next.y - current.y);
        intersections.push(current.x + ((next.x - current.x) * t));
      }
      if (intersections.length < 2) {
        continue;
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const startX = clamp(Math.ceil(intersections[i] - 0.5), 0, safeWidth - 1);
        const endX = clamp(Math.floor(intersections[i + 1] - 0.5), 0, safeWidth - 1);
        for (let x = startX; x <= endX; x += 1) {
          const base = ((y * safeWidth) + x) * 4;
          buffer[base] = color.r;
          buffer[base + 1] = color.g;
          buffer[base + 2] = color.b;
          buffer[base + 3] = color.a;
        }
      }
    }
  }

  function buildVoxelPreviewPixels(frontCanvas, backCanvas, leftCanvas, rightCanvas, topCanvas, bottomCanvas, options = {}) {
    const frontWidth = Math.max(1, Math.round(Number(frontCanvas?.width) || 1));
    const frontHeight = Math.max(1, Math.round(Number(frontCanvas?.height) || 1));
    const backWidth = Math.max(1, Math.round(Number(backCanvas?.width) || 1));
    const backHeight = Math.max(1, Math.round(Number(backCanvas?.height) || 1));
    const leftWidth = Math.max(1, Math.round(Number(leftCanvas?.width) || 1));
    const leftHeight = Math.max(1, Math.round(Number(leftCanvas?.height) || 1));
    const rightWidth = Math.max(1, Math.round(Number(rightCanvas?.width) || 1));
    const rightHeight = Math.max(1, Math.round(Number(rightCanvas?.height) || 1));
    const topWidth = Math.max(1, Math.round(Number(topCanvas?.width) || 1));
    const topHeight = Math.max(1, Math.round(Number(topCanvas?.height) || 1));
    const bottomWidth = Math.max(1, Math.round(Number(bottomCanvas?.width) || 1));
    const bottomHeight = Math.max(1, Math.round(Number(bottomCanvas?.height) || 1));
    const frameIndex = Number.isFinite(Number(options?.frameIndex))
      ? Math.max(0, Math.round(Number(options.frameIndex)))
      : null;
    const frontPixels = getProjectCanvasCompositePixelsForVoxel(frontCanvas, frameIndex);
    const backPixels = getProjectCanvasCompositePixelsForVoxel(backCanvas, frameIndex);
    const leftPixels = getProjectCanvasCompositePixelsForVoxel(leftCanvas, frameIndex);
    const rightPixels = getProjectCanvasCompositePixelsForVoxel(rightCanvas, frameIndex);
    const topPixels = getProjectCanvasCompositePixelsForVoxel(topCanvas, frameIndex);
    const bottomPixels = getProjectCanvasCompositePixelsForVoxel(bottomCanvas, frameIndex);
    const frontBounds = getVoxelOpaqueBounds(frontPixels, frontWidth, frontHeight);
    const backBounds = getVoxelOpaqueBounds(backPixels, backWidth, backHeight);
    const leftBounds = getVoxelOpaqueBounds(leftPixels, leftWidth, leftHeight);
    const rightBounds = getVoxelOpaqueBounds(rightPixels, rightWidth, rightHeight);
    const topBounds = getVoxelOpaqueBounds(topPixels, topWidth, topHeight);
    const bottomBounds = getVoxelOpaqueBounds(bottomPixels, bottomWidth, bottomHeight);
    const frontAvailable = !frontBounds.empty;
    const backAvailable = !backBounds.empty;
    const leftAvailable = !leftBounds.empty;
    const rightAvailable = !rightBounds.empty;
    const topAvailable = !topBounds.empty;
    const bottomAvailable = !bottomBounds.empty;
    const missingFaces = [];
    if (!frontAvailable) missingFaces.push('front');
    if (!backAvailable) missingFaces.push('back');
    if (!leftAvailable) missingFaces.push('left');
    if (!rightAvailable) missingFaces.push('right');
    if (!topAvailable) missingFaces.push('top');
    if (!bottomAvailable) missingFaces.push('bottom');
    if (!frontAvailable && !backAvailable && !leftAvailable && !rightAvailable && !topAvailable && !bottomAvailable) {
      return {
        width: 1,
        height: 1,
        pixels: new Uint8ClampedArray(4),
        volume: { width: 1, height: 1, depth: 1 },
        clamped: false,
        guides: null,
        missingFaces,
        mismatchAxes: ['x', 'y', 'z'],
      };
    }
    const sourceSizeXCandidates = [
      frontAvailable ? frontBounds.width : null,
      backAvailable ? backBounds.width : null,
      topAvailable ? topBounds.width : null,
      bottomAvailable ? bottomBounds.width : null,
    ].filter(Number.isFinite);
    const sourceSizeYCandidates = [
      frontAvailable ? frontBounds.height : null,
      backAvailable ? backBounds.height : null,
      rightAvailable ? rightBounds.height : null,
      leftAvailable ? leftBounds.height : null,
    ].filter(Number.isFinite);
    const sourceSizeZCandidates = [
      topAvailable ? topBounds.height : null,
      bottomAvailable ? bottomBounds.height : null,
      rightAvailable ? rightBounds.width : null,
      leftAvailable ? leftBounds.width : null,
    ].filter(Number.isFinite);
    const mismatchAxes = [];
    if (new Set(sourceSizeXCandidates).size > 1) mismatchAxes.push('x');
    if (new Set(sourceSizeYCandidates).size > 1) mismatchAxes.push('y');
    if (new Set(sourceSizeZCandidates).size > 1) mismatchAxes.push('z');
    const sourceSizeX = sourceSizeXCandidates.length ? Math.max(1, Math.max(...sourceSizeXCandidates)) : 1;
    const sourceSizeY = sourceSizeYCandidates.length ? Math.max(1, Math.max(...sourceSizeYCandidates)) : 1;
    const sourceSizeZ = sourceSizeZCandidates.length ? Math.max(1, Math.max(...sourceSizeZCandidates)) : 1;
    const sizeX = Math.max(1, Math.min(sourceSizeX, VOXEL_EXTENSION_MAX_SOURCE_EDGE));
    const sizeY = Math.max(1, Math.min(sourceSizeY, VOXEL_EXTENSION_MAX_SOURCE_EDGE));
    const sizeZ = Math.max(1, Math.min(sourceSizeZ, VOXEL_EXTENSION_MAX_SOURCE_EDGE));
    const clamped = sizeX !== sourceSizeX || sizeY !== sourceSizeY || sizeZ !== sourceSizeZ;
    const occupancy = new Uint8Array(sizeX * sizeY * sizeZ);
    const voxelIndex = (x, y, z) => ((y * sizeZ) + z) * sizeX + x;
    const hasFrontAlpha = (x, y) => (
      frontAvailable
        ? hasVoxelBoundedAlpha(frontPixels, frontWidth, frontBounds, x, y)
        : false
    );
    const hasBackAlpha = (x, y) => (
      backAvailable
        ? hasVoxelBoundedAlpha(backPixels, backWidth, backBounds, (sizeX - 1) - x, y)
        : false
    );
    const hasRightAlpha = (z, y) => (
      rightAvailable
        ? hasVoxelBoundedAlpha(rightPixels, rightWidth, rightBounds, z, y)
        : false
    );
    const hasLeftAlpha = (z, y) => (
      leftAvailable
        ? hasVoxelBoundedAlpha(leftPixels, leftWidth, leftBounds, (sizeZ - 1) - z, y)
        : false
    );
    const hasTopAlpha = (x, z) => (
      topAvailable
        ? hasVoxelBoundedAlpha(topPixels, topWidth, topBounds, x, z)
        : false
    );
    const hasBottomAlpha = (x, z) => (
      bottomAvailable
        ? hasVoxelBoundedAlpha(bottomPixels, bottomWidth, bottomBounds, x, (sizeZ - 1) - z)
        : false
    );
    const readFrontColor = (x, y) => (
      frontAvailable
        ? getVoxelBoundedPixel(frontPixels, frontWidth, frontBounds, x, y)
        : null
    );
    const readBackColor = (x, y) => (
      backAvailable
        ? getVoxelBoundedPixel(backPixels, backWidth, backBounds, (sizeX - 1) - x, y)
        : null
    );
    const readRightColor = (z, y) => (
      rightAvailable
        ? getVoxelBoundedPixel(rightPixels, rightWidth, rightBounds, z, y)
        : null
    );
    const readLeftColor = (z, y) => (
      leftAvailable
        ? getVoxelBoundedPixel(leftPixels, leftWidth, leftBounds, (sizeZ - 1) - z, y)
        : null
    );
    const readTopColor = (x, z) => (
      topAvailable
        ? getVoxelBoundedPixel(topPixels, topWidth, topBounds, x, z)
        : null
    );
    const readBottomColor = (x, z) => (
      bottomAvailable
        ? getVoxelBoundedPixel(bottomPixels, bottomWidth, bottomBounds, x, (sizeZ - 1) - z)
        : null
    );
    const getVoxelColorForRole = (role, x, y, z) => {
      switch (role) {
        case 'back':
          return pickVoxelColorChain(
            readBackColor(x, y),
            readTopColor(x, z),
            readLeftColor(z, y),
            readRightColor(z, y),
            readFrontColor(x, y),
            readBottomColor(x, z)
          );
        case 'left':
          return pickVoxelColorChain(
            readLeftColor(z, y),
            readFrontColor(x, y),
            readTopColor(x, z),
            readBackColor(x, y),
            readBottomColor(x, z),
            readRightColor(z, y)
          );
        case 'right':
          return pickVoxelColorChain(
            readRightColor(z, y),
            readFrontColor(x, y),
            readTopColor(x, z),
            readBackColor(x, y),
            readBottomColor(x, z),
            readLeftColor(z, y)
          );
        case 'top':
          return pickVoxelColorChain(
            readTopColor(x, z),
            readFrontColor(x, y),
            readRightColor(z, y),
            readLeftColor(z, y),
            readBackColor(x, y),
            readBottomColor(x, z)
          );
        case 'bottom':
          return pickVoxelColorChain(
            readBottomColor(x, z),
            readFrontColor(x, y),
            readRightColor(z, y),
            readLeftColor(z, y),
            readBackColor(x, y),
            readTopColor(x, z)
          );
        case 'front':
        default:
          return pickVoxelColorChain(
            readFrontColor(x, y),
            readTopColor(x, z),
            readRightColor(z, y),
            readLeftColor(z, y),
            readBackColor(x, y),
            readBottomColor(x, z)
          );
      }
    };
    for (let y = 0; y < sizeY; y += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        for (let z = 0; z < sizeZ; z += 1) {
          const xyKnown = frontAvailable || backAvailable;
          const yzKnown = leftAvailable || rightAvailable;
          const xzKnown = topAvailable || bottomAvailable;
          const xyPass = hasFrontAlpha(x, y) || hasBackAlpha(x, y);
          const yzPass = hasLeftAlpha(z, y) || hasRightAlpha(z, y);
          const xzPass = hasTopAlpha(x, z) || hasBottomAlpha(x, z);
          const knownAxes = (xyKnown ? 1 : 0) + (yzKnown ? 1 : 0) + (xzKnown ? 1 : 0);
          const passedAxes = (xyPass ? 1 : 0) + (yzPass ? 1 : 0) + (xzPass ? 1 : 0);
          const requiredPasses = knownAxes >= 3 ? 2 : knownAxes;
          if (!knownAxes || passedAxes < requiredPasses) {
            continue;
          }
          occupancy[voxelIndex(x, y, z)] = 1;
        }
      }
    }
    const isOccupied = (x, y, z) => occupancy[voxelIndex(x, y, z)] === 1;
    const xAxisCandidates = [
      frontAvailable ? frontBounds.x : null,
      backAvailable ? backBounds.x : null,
      topAvailable ? topBounds.x : null,
      bottomAvailable ? bottomBounds.x : null,
    ].filter(Number.isFinite);
    const yAxisCandidates = [
      frontAvailable ? frontBounds.y : null,
      backAvailable ? backBounds.y : null,
      rightAvailable ? rightBounds.y : null,
      leftAvailable ? leftBounds.y : null,
    ].filter(Number.isFinite);
    const zAxisCandidates = [
      rightAvailable ? rightBounds.x : null,
      leftAvailable ? leftBounds.x : null,
      topAvailable ? topBounds.y : null,
      bottomAvailable ? bottomBounds.y : null,
    ].filter(Number.isFinite);
    const fillProjectionBuffer = (buffer, bufferWidth, x, y, color, alphaScale = 1) => {
      if (!(buffer instanceof Uint8ClampedArray) || !color) {
        return;
      }
      const safeWidth = Math.max(1, Math.round(Number(bufferWidth) || 1));
      const base = ((y * safeWidth) + x) * 4;
      buffer[base] = clamp(Math.round(Number(color.r) || 0), 0, 255);
      buffer[base + 1] = clamp(Math.round(Number(color.g) || 0), 0, 255);
      buffer[base + 2] = clamp(Math.round(Number(color.b) || 0), 0, 255);
      buffer[base + 3] = clamp(Math.round((Number(color.a) || 0) * alphaScale), 0, 255);
    };
    const buildGuideProjection = ({
      role,
      targetWidth,
      targetHeight,
      localWidth,
      localHeight,
      offsetX,
      offsetY,
      resolveSample,
    }) => {
      const width = Math.max(1, Math.round(Number(targetWidth) || 1));
      const height = Math.max(1, Math.round(Number(targetHeight) || 1));
      const buffer = new Uint8ClampedArray(width * height * 4);
      for (let localY = 0; localY < localHeight; localY += 1) {
        for (let localX = 0; localX < localWidth; localX += 1) {
          const sample = resolveSample(localX, localY);
          if (!sample) {
            continue;
          }
          const color = getVoxelColorForRole(role, sample.x, sample.y, sample.z);
          const destX = offsetX + localX;
          const destY = offsetY + localY;
          if (destX < 0 || destY < 0 || destX >= width || destY >= height) {
            continue;
          }
          fillProjectionBuffer(buffer, width, destX, destY, color, 0.62);
        }
      }
      return { width, height, pixels: buffer };
    };
    const findFrontSample = (x, y) => {
      for (let z = 0; z < sizeZ; z += 1) {
        if (isOccupied(x, y, z)) {
          return { x, y, z };
        }
      }
      return null;
    };
    const findBackSample = (x, y) => {
      for (let z = sizeZ - 1; z >= 0; z -= 1) {
        if (isOccupied(x, y, z)) {
          return { x, y, z };
        }
      }
      return null;
    };
    const findLeftSample = (z, y) => {
      for (let x = 0; x < sizeX; x += 1) {
        if (isOccupied(x, y, z)) {
          return { x, y, z };
        }
      }
      return null;
    };
    const findRightSample = (z, y) => {
      for (let x = sizeX - 1; x >= 0; x -= 1) {
        if (isOccupied(x, y, z)) {
          return { x, y, z };
        }
      }
      return null;
    };
    const findTopSample = (x, z) => {
      for (let y = 0; y < sizeY; y += 1) {
        if (isOccupied(x, y, z)) {
          return { x, y, z };
        }
      }
      return null;
    };
    const findBottomSample = (x, z) => {
      for (let y = sizeY - 1; y >= 0; y -= 1) {
        if (isOccupied(x, y, z)) {
          return { x, y, z };
        }
      }
      return null;
    };
    const guides = {
      front: buildGuideProjection({
        role: 'front',
        targetWidth: frontWidth,
        targetHeight: frontHeight,
        localWidth: sizeX,
        localHeight: sizeY,
        offsetX: resolveVoxelProjectionAxisOrigin(frontWidth, sizeX, xAxisCandidates),
        offsetY: resolveVoxelProjectionAxisOrigin(frontHeight, sizeY, yAxisCandidates),
        resolveSample: findFrontSample,
      }),
      back: buildGuideProjection({
        role: 'back',
        targetWidth: backWidth,
        targetHeight: backHeight,
        localWidth: sizeX,
        localHeight: sizeY,
        offsetX: resolveVoxelProjectionAxisOrigin(backWidth, sizeX, xAxisCandidates),
        offsetY: resolveVoxelProjectionAxisOrigin(backHeight, sizeY, yAxisCandidates),
        resolveSample: findBackSample,
      }),
      left: buildGuideProjection({
        role: 'left',
        targetWidth: leftWidth,
        targetHeight: leftHeight,
        localWidth: sizeZ,
        localHeight: sizeY,
        offsetX: resolveVoxelProjectionAxisOrigin(leftWidth, sizeZ, zAxisCandidates),
        offsetY: resolveVoxelProjectionAxisOrigin(leftHeight, sizeY, yAxisCandidates),
        resolveSample: findLeftSample,
      }),
      right: buildGuideProjection({
        role: 'right',
        targetWidth: rightWidth,
        targetHeight: rightHeight,
        localWidth: sizeZ,
        localHeight: sizeY,
        offsetX: resolveVoxelProjectionAxisOrigin(rightWidth, sizeZ, zAxisCandidates),
        offsetY: resolveVoxelProjectionAxisOrigin(rightHeight, sizeY, yAxisCandidates),
        resolveSample: findRightSample,
      }),
      top: buildGuideProjection({
        role: 'top',
        targetWidth: topWidth,
        targetHeight: topHeight,
        localWidth: sizeX,
        localHeight: sizeZ,
        offsetX: resolveVoxelProjectionAxisOrigin(topWidth, sizeX, xAxisCandidates),
        offsetY: resolveVoxelProjectionAxisOrigin(topHeight, sizeZ, zAxisCandidates),
        resolveSample: findTopSample,
      }),
      bottom: buildGuideProjection({
        role: 'bottom',
        targetWidth: bottomWidth,
        targetHeight: bottomHeight,
        localWidth: sizeX,
        localHeight: sizeZ,
        offsetX: resolveVoxelProjectionAxisOrigin(bottomWidth, sizeX, xAxisCandidates),
        offsetY: resolveVoxelProjectionAxisOrigin(bottomHeight, sizeZ, zAxisCandidates),
        resolveSample: findBottomSample,
      }),
    };
    const yawDegrees = normalizeVoxelPreviewYawDegrees(options?.yawDeg ?? voxelExtensionState.previewYawDeg);
    const pitchDegrees = normalizeVoxelPreviewPitchDegrees(options?.pitchDeg ?? voxelExtensionState.previewPitchDeg);
    const wrappedYawDegrees = ((yawDegrees % 360) + 360) % 360;
    const yawRadians = (wrappedYawDegrees * Math.PI) / 180;
    const pitchRadians = (pitchDegrees * Math.PI) / 180;
    const margin = 8;
    let minProjectedX = Infinity;
    let maxProjectedX = -Infinity;
    let minProjectedY = Infinity;
    let maxProjectedY = -Infinity;
    [0, sizeX].forEach(projectX => {
      [0, sizeY].forEach(projectY => {
        [0, sizeZ].forEach(projectZ => {
          const projected = projectVoxelPreviewPoint(
            projectX,
            projectY,
            projectZ,
            sizeX,
            sizeY,
            sizeZ,
            yawRadians,
            pitchRadians
          );
          minProjectedX = Math.min(minProjectedX, projected.x);
          maxProjectedX = Math.max(maxProjectedX, projected.x);
          minProjectedY = Math.min(minProjectedY, projected.y);
          maxProjectedY = Math.max(maxProjectedY, projected.y);
        });
      });
    });
    const rawWidth = Math.max(1, maxProjectedX - minProjectedX);
    const rawHeight = Math.max(1, maxProjectedY - minProjectedY);
    const previewScale = getVoxelPreviewFixedProjectionScale(sizeX, sizeY, sizeZ, options?.displayPx ?? voxelExtensionState.displayPx);
    const { rawWidthMax, rawHeightMax } = getVoxelPreviewProjectionBoundsMax(sizeX, sizeY, sizeZ);
    const projectedWidth = Math.max(1, Math.ceil(rawWidth * previewScale));
    const projectedHeight = Math.max(1, Math.ceil(rawHeight * previewScale));
    const previewWidth = Math.max(16, Math.min(VOXEL_EXTENSION_PREVIEW_MAX_EDGE, Math.ceil(rawWidthMax * previewScale) + (margin * 2)));
    const previewHeight = Math.max(16, Math.min(VOXEL_EXTENSION_PREVIEW_MAX_EDGE, Math.ceil(rawHeightMax * previewScale) + (margin * 2)));
    const offsetX = Math.round((previewWidth - projectedWidth) / 2);
    const offsetY = Math.round((previewHeight - projectedHeight) / 2);
    const faces = [];
    const pushFace = (points, color, depth) => {
      if (!Array.isArray(points) || points.length < 3 || !color || Number(color.a) <= 0) {
        return;
      }
      faces.push({ points, color, depth });
    };
    for (let y = 0; y < sizeY; y += 1) {
      const voxelBottom = sizeY - (y + 1);
      const voxelTop = voxelBottom + 1;
      for (let z = 0; z < sizeZ; z += 1) {
        for (let x = 0; x < sizeX; x += 1) {
          if (occupancy[voxelIndex(x, y, z)] !== 1) {
            continue;
          }
          const frontColor = getVoxelColorForRole('front', x, y, z);
          const backColor = getVoxelColorForRole('back', x, y, z);
          const leftColor = getVoxelColorForRole('left', x, y, z);
          const rightColor = getVoxelColorForRole('right', x, y, z);
          const topFaceColor = getVoxelColorForRole('top', x, y, z);
          const bottomFaceColor = getVoxelColorForRole('bottom', x, y, z);
          const corners = {
            fbl: [x, voxelBottom, z],
            fbr: [x + 1, voxelBottom, z],
            ftl: [x, voxelTop, z],
            ftr: [x + 1, voxelTop, z],
            bbl: [x, voxelBottom, z + 1],
            bbr: [x + 1, voxelBottom, z + 1],
            btl: [x, voxelTop, z + 1],
            btr: [x + 1, voxelTop, z + 1],
          };
          const faceDefinitions = [
            {
              visible: z === 0 || occupancy[voxelIndex(x, y, z - 1)] !== 1,
              color: shadeVoxelColor(frontColor, getVoxelPreviewFaceShadeAmount('front')),
              points: [corners.fbl, corners.fbr, corners.ftr, corners.ftl],
            },
            {
              visible: z === sizeZ - 1 || occupancy[voxelIndex(x, y, z + 1)] !== 1,
              color: shadeVoxelColor(backColor, getVoxelPreviewFaceShadeAmount('back')),
              points: [corners.bbr, corners.bbl, corners.btl, corners.btr],
            },
            {
              visible: x === 0 || occupancy[voxelIndex(x - 1, y, z)] !== 1,
              color: shadeVoxelColor(leftColor, getVoxelPreviewFaceShadeAmount('left')),
              points: [corners.bbl, corners.fbl, corners.ftl, corners.btl],
            },
            {
              visible: x === sizeX - 1 || occupancy[voxelIndex(x + 1, y, z)] !== 1,
              color: shadeVoxelColor(rightColor, getVoxelPreviewFaceShadeAmount('right')),
              points: [corners.fbr, corners.bbr, corners.btr, corners.ftr],
            },
            {
              visible: y === 0 || occupancy[voxelIndex(x, y - 1, z)] !== 1,
              color: shadeVoxelColor(topFaceColor, getVoxelPreviewFaceShadeAmount('top')),
              points: [corners.ftl, corners.ftr, corners.btr, corners.btl],
            },
            {
              visible: y === sizeY - 1 || occupancy[voxelIndex(x, y + 1, z)] !== 1,
              color: shadeVoxelColor(bottomFaceColor, getVoxelPreviewFaceShadeAmount('bottom')),
              points: [corners.fbl, corners.bbl, corners.bbr, corners.fbr],
            },
          ];
          faceDefinitions.forEach(face => {
            if (!face.visible) {
              return;
            }
            const projectedPoints = face.points.map(point => {
              const projected = projectVoxelPreviewPoint(
                point[0],
                point[1],
                point[2],
                sizeX,
                sizeY,
                sizeZ,
                yawRadians,
                pitchRadians
              );
              return {
                x: offsetX + ((projected.x - minProjectedX) * previewScale),
                y: offsetY + ((maxProjectedY - projected.y) * previewScale),
                depth: projected.depth,
              };
            });
            const depth = projectedPoints.reduce((sum, point) => sum + point.depth, 0) / projectedPoints.length;
            pushFace(
              projectedPoints.map(point => ({ x: point.x, y: point.y })),
              face.color,
              depth
            );
          });
        }
      }
    }
    faces.sort((leftFace, rightFace) => rightFace.depth - leftFace.depth);
    const output = new Uint8ClampedArray(previewWidth * previewHeight * 4);
    faces.forEach(face => {
      fillVoxelPolygonRgba(output, previewWidth, previewHeight, face.points, face.color);
    });
    return {
      width: previewWidth,
      height: previewHeight,
      pixels: output,
      volume: { width: sizeX, height: sizeY, depth: sizeZ },
      clamped,
      guides,
      yawDeg: yawDegrees,
      pitchDeg: pitchDegrees,
      missingFaces,
      mismatchAxes,
    };
  }

  return Object.freeze({
    scaleVoxelPreviewPixels,
    shadeVoxelColor,
    getVoxelPreviewProjectionScales,
    getVoxelPreviewProjectionBoundsMax,
    getVoxelPreviewFixedProjectionScale,
    projectVoxelPreviewPoint,
    fillVoxelPolygonRgba,
    buildVoxelPreviewPixels,
  });
      }
    })(scope);
  }

  root.voxelPreviewUtils = Object.freeze({
    createVoxelPreviewUtils,
  });
})();
