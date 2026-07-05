(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createVoxelGlbUtils(rawScope = {}) {
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
  function buildVoxelExportVolume(frontCanvas, backCanvas, leftCanvas, rightCanvas, topCanvas, bottomCanvas) {
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
    const frontPixels = getProjectCanvasCompositePixelsForVoxel(frontCanvas);
    const backPixels = getProjectCanvasCompositePixelsForVoxel(backCanvas);
    const leftPixels = getProjectCanvasCompositePixelsForVoxel(leftCanvas);
    const rightPixels = getProjectCanvasCompositePixelsForVoxel(rightCanvas);
    const topPixels = getProjectCanvasCompositePixelsForVoxel(topCanvas);
    const bottomPixels = getProjectCanvasCompositePixelsForVoxel(bottomCanvas);
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
    if (!frontAvailable && !backAvailable && !leftAvailable && !rightAvailable && !topAvailable && !bottomAvailable) {
      return {
        empty: true,
        sizeX: 1,
        sizeY: 1,
        sizeZ: 1,
        clamped: false,
        occupancy: new Uint8Array(1),
        voxelIndex: () => 0,
        isOccupied: () => false,
        getVoxelColorForRole: () => ({ r: 0, g: 0, b: 0, a: 0 }),
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
    const sourceSizeX = sourceSizeXCandidates.length ? Math.max(1, Math.min(...sourceSizeXCandidates)) : 1;
    const sourceSizeY = sourceSizeYCandidates.length ? Math.max(1, Math.min(...sourceSizeYCandidates)) : 1;
    const sourceSizeZ = sourceSizeZCandidates.length ? Math.max(1, Math.min(...sourceSizeZCandidates)) : 1;
    const sizeX = Math.max(1, Math.min(sourceSizeX, VOXEL_EXTENSION_MAX_SOURCE_EDGE));
    const sizeY = Math.max(1, Math.min(sourceSizeY, VOXEL_EXTENSION_MAX_SOURCE_EDGE));
    const sizeZ = Math.max(1, Math.min(sourceSizeZ, VOXEL_EXTENSION_MAX_SOURCE_EDGE));
    const clamped = sizeX !== sourceSizeX || sizeY !== sourceSizeY || sizeZ !== sourceSizeZ;
    const occupancy = new Uint8Array(sizeX * sizeY * sizeZ);
    const voxelIndex = (x, y, z) => ((y * sizeZ) + z) * sizeX + x;
    const hasFrontAlpha = (x, y) => (
      frontAvailable
        ? hasVoxelBoundedAlpha(frontPixels, frontWidth, frontBounds, x, y)
        : true
    );
    const hasBackAlpha = (x, y) => (
      backAvailable
        ? hasVoxelBoundedAlpha(backPixels, backWidth, backBounds, (sizeX - 1) - x, y)
        : true
    );
    const hasRightAlpha = (z, y) => (
      rightAvailable
        ? hasVoxelBoundedAlpha(rightPixels, rightWidth, rightBounds, z, y)
        : true
    );
    const hasLeftAlpha = (z, y) => (
      leftAvailable
        ? hasVoxelBoundedAlpha(leftPixels, leftWidth, leftBounds, (sizeZ - 1) - z, y)
        : true
    );
    const hasTopAlpha = (x, z) => (
      topAvailable
        ? hasVoxelBoundedAlpha(topPixels, topWidth, topBounds, x, z)
        : true
    );
    const hasBottomAlpha = (x, z) => (
      bottomAvailable
        ? hasVoxelBoundedAlpha(bottomPixels, bottomWidth, bottomBounds, x, (sizeZ - 1) - z)
        : true
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
        if (!hasFrontAlpha(x, y) || !hasBackAlpha(x, y)) {
          continue;
        }
        for (let z = 0; z < sizeZ; z += 1) {
          if (!hasTopAlpha(x, z) || !hasBottomAlpha(x, z)) {
            continue;
          }
          if (!hasRightAlpha(z, y) || !hasLeftAlpha(z, y)) {
            continue;
          }
          occupancy[voxelIndex(x, y, z)] = 1;
        }
      }
    }
    const isOccupied = (x, y, z) => occupancy[voxelIndex(x, y, z)] === 1;
    return {
      empty: false,
      sizeX,
      sizeY,
      sizeZ,
      clamped,
      occupancy,
      voxelIndex,
      isOccupied,
      getVoxelColorForRole,
    };
  }

  function buildVoxelGlbMeshData(volume) {
    if (!volume || volume.empty) {
      throw new Error('No voxel volume data available for GLB export');
    }
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    let hasTransparency = false;
    const halfX = volume.sizeX / 2;
    const halfZ = volume.sizeZ / 2;
    const pushQuad = (points, normal, color) => {
      if (!Array.isArray(points) || points.length !== 4 || !Array.isArray(normal) || normal.length !== 3 || !color) {
        return;
      }
      const alpha = clamp(Math.round(Number(color.a) || 0), 0, 255);
      if (alpha <= 0) {
        return;
      }
      if (alpha < 255) {
        hasTransparency = true;
      }
      const baseIndex = positions.length / 3;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        positions.push(point[0], point[1], point[2]);
        normals.push(normal[0], normal[1], normal[2]);
        colors.push(
          clamp(Math.round(Number(color.r) || 0), 0, 255),
          clamp(Math.round(Number(color.g) || 0), 0, 255),
          clamp(Math.round(Number(color.b) || 0), 0, 255),
          alpha
        );
      }
      indices.push(
        baseIndex,
        baseIndex + 1,
        baseIndex + 2,
        baseIndex,
        baseIndex + 2,
        baseIndex + 3
      );
    };
    for (let y = 0; y < volume.sizeY; y += 1) {
      const voxelBottom = volume.sizeY - (y + 1);
      const voxelTop = voxelBottom + 1;
      for (let z = 0; z < volume.sizeZ; z += 1) {
        const minZ = halfZ - (z + 1);
        const maxZ = halfZ - z;
        for (let x = 0; x < volume.sizeX; x += 1) {
          if (!volume.isOccupied(x, y, z)) {
            continue;
          }
          const minX = x - halfX;
          const maxX = (x + 1) - halfX;
          const minY = voxelBottom;
          const maxY = voxelTop;
          if (z === 0 || !volume.isOccupied(x, y, z - 1)) {
            pushQuad(
              [
                [minX, minY, maxZ],
                [maxX, minY, maxZ],
                [maxX, maxY, maxZ],
                [minX, maxY, maxZ],
              ],
              [0, 0, 1],
              volume.getVoxelColorForRole('front', x, y, z)
            );
          }
          if (z === volume.sizeZ - 1 || !volume.isOccupied(x, y, z + 1)) {
            pushQuad(
              [
                [maxX, minY, minZ],
                [minX, minY, minZ],
                [minX, maxY, minZ],
                [maxX, maxY, minZ],
              ],
              [0, 0, -1],
              volume.getVoxelColorForRole('back', x, y, z)
            );
          }
          if (x === 0 || !volume.isOccupied(x - 1, y, z)) {
            pushQuad(
              [
                [minX, minY, minZ],
                [minX, minY, maxZ],
                [minX, maxY, maxZ],
                [minX, maxY, minZ],
              ],
              [-1, 0, 0],
              volume.getVoxelColorForRole('left', x, y, z)
            );
          }
          if (x === volume.sizeX - 1 || !volume.isOccupied(x + 1, y, z)) {
            pushQuad(
              [
                [maxX, minY, maxZ],
                [maxX, minY, minZ],
                [maxX, maxY, minZ],
                [maxX, maxY, maxZ],
              ],
              [1, 0, 0],
              volume.getVoxelColorForRole('right', x, y, z)
            );
          }
          if (y === 0 || !volume.isOccupied(x, y - 1, z)) {
            pushQuad(
              [
                [minX, maxY, maxZ],
                [maxX, maxY, maxZ],
                [maxX, maxY, minZ],
                [minX, maxY, minZ],
              ],
              [0, 1, 0],
              volume.getVoxelColorForRole('top', x, y, z)
            );
          }
          if (y === volume.sizeY - 1 || !volume.isOccupied(x, y + 1, z)) {
            pushQuad(
              [
                [minX, minY, maxZ],
                [minX, minY, minZ],
                [maxX, minY, minZ],
                [maxX, minY, maxZ],
              ],
              [0, -1, 0],
              volume.getVoxelColorForRole('bottom', x, y, z)
            );
          }
        }
      }
    }
    if (!indices.length) {
      throw new Error('No visible voxel faces available for GLB export');
    }
    return {
      positionArray: new Float32Array(positions),
      normalArray: new Float32Array(normals),
      colorArray: new Uint8Array(colors),
      indexArray: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
      hasTransparency,
    };
  }

  function encodeUtf8Bytes(value = '') {
    const text = String(value || '');
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(text);
    }
    const encoded = unescape(encodeURIComponent(text));
    const bytes = new Uint8Array(encoded.length);
    for (let index = 0; index < encoded.length; index += 1) {
      bytes[index] = encoded.charCodeAt(index);
    }
    return bytes;
  }

  function padUint8ArrayTo4(bytes, padByte = 0) {
    const source = bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes?.buffer || bytes || new ArrayBuffer(0), bytes?.byteOffset || 0, bytes?.byteLength || 0);
    const paddedLength = Math.ceil(source.byteLength / 4) * 4;
    if (paddedLength === source.byteLength) {
      return source;
    }
    const padded = new Uint8Array(paddedLength);
    padded.fill(padByte);
    padded.set(source);
    return padded;
  }

  function appendAlignedBinarySegment(segments, currentLength, bytes) {
    const source = bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const paddingLength = (4 - (currentLength % 4)) % 4;
    let nextLength = currentLength;
    if (paddingLength > 0) {
      segments.push(new Uint8Array(paddingLength));
      nextLength += paddingLength;
    }
    const byteOffset = nextLength;
    segments.push(source);
    nextLength += source.byteLength;
    return {
      byteOffset,
      byteLength: source.byteLength,
      nextLength,
    };
  }

  function concatUint8Arrays(parts, totalLength) {
    const output = new Uint8Array(totalLength);
    let cursor = 0;
    parts.forEach(part => {
      if (!(part instanceof Uint8Array) || !part.byteLength) {
        return;
      }
      output.set(part, cursor);
      cursor += part.byteLength;
    });
    return output;
  }

  function computeFloat32AccessorMinMax(values, componentCount) {
    const min = new Array(componentCount).fill(Number.POSITIVE_INFINITY);
    const max = new Array(componentCount).fill(Number.NEGATIVE_INFINITY);
    for (let index = 0; index < values.length; index += componentCount) {
      for (let component = 0; component < componentCount; component += 1) {
        const value = values[index + component];
        min[component] = Math.min(min[component], value);
        max[component] = Math.max(max[component], value);
      }
    }
    return {
      min: min.map(value => Number.isFinite(value) ? value : 0),
      max: max.map(value => Number.isFinite(value) ? value : 0),
    };
  }

  // Export as textureless unlit quads with duplicated per-face vertices and COLOR_0 RGBA so
  // Blender and Unity/glTFast keep crisp voxel edges without atlas bleeding or smooth-normal artifacts.
  function buildVoxelGlbBinaryFromCanvases(frontCanvas, backCanvas, leftCanvas, rightCanvas, topCanvas, bottomCanvas, {
    modelName = 'PiXiEEDrawVoxel',
  } = {}) {
    const volume = buildVoxelExportVolume(frontCanvas, backCanvas, leftCanvas, rightCanvas, topCanvas, bottomCanvas);
    const mesh = buildVoxelGlbMeshData(volume);
    const positionRange = computeFloat32AccessorMinMax(mesh.positionArray, 3);
    const vertexCount = mesh.positionArray.length / 3;
    const indexCount = mesh.indexArray.length;
    const indexComponentType = mesh.indexArray instanceof Uint32Array ? 5125 : 5123;
    const binarySegments = [];
    let binaryLength = 0;
    const positionBytes = new Uint8Array(mesh.positionArray.buffer);
    const normalBytes = new Uint8Array(mesh.normalArray.buffer);
    const colorBytes = mesh.colorArray;
    const indexBytes = new Uint8Array(mesh.indexArray.buffer);
    const positionView = appendAlignedBinarySegment(binarySegments, binaryLength, positionBytes);
    binaryLength = positionView.nextLength;
    const normalView = appendAlignedBinarySegment(binarySegments, binaryLength, normalBytes);
    binaryLength = normalView.nextLength;
    const colorView = appendAlignedBinarySegment(binarySegments, binaryLength, colorBytes);
    binaryLength = colorView.nextLength;
    const indexView = appendAlignedBinarySegment(binarySegments, binaryLength, indexBytes);
    binaryLength = indexView.nextLength;
    const binaryBuffer = concatUint8Arrays(binarySegments, binaryLength);
    const safeModelName = String(modelName || 'PiXiEEDrawVoxel');
    const gltf = {
      asset: {
        version: '2.0',
        generator: 'PiXiEEDraw GLB Export',
        extras: {
          exportNotes: {
            rendering: 'No texture atlas. COLOR_0 RGBA + KHR_materials_unlit + per-face normals + duplicated face vertices',
            unity: 'Use glTFast import. Keep mesh normals as imported for crisp voxel faces.',
            blender: 'Import via glTF 2.0. The material is unlit; avoid smooth shading if you convert materials manually.',
          },
        },
      },
      extensionsUsed: ['KHR_materials_unlit'],
      extensionsRequired: ['KHR_materials_unlit'],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: safeModelName }],
      meshes: [{
        name: safeModelName,
        primitives: [{
          attributes: {
            POSITION: 0,
            NORMAL: 1,
            COLOR_0: 2,
          },
          indices: 3,
          material: 0,
          mode: 4,
        }],
      }],
      materials: [{
        name: 'PiXiEEDrawVoxel',
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        alphaMode: mesh.hasTransparency ? 'BLEND' : 'OPAQUE',
        doubleSided: true,
        extensions: {
          KHR_materials_unlit: {},
        },
      }],
      buffers: [{ byteLength: binaryBuffer.byteLength }],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: positionView.byteOffset,
          byteLength: positionView.byteLength,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: normalView.byteOffset,
          byteLength: normalView.byteLength,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: colorView.byteOffset,
          byteLength: colorView.byteLength,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: indexView.byteOffset,
          byteLength: indexView.byteLength,
          target: 34963,
        },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: vertexCount,
          type: 'VEC3',
          min: positionRange.min,
          max: positionRange.max,
        },
        {
          bufferView: 1,
          componentType: 5126,
          count: vertexCount,
          type: 'VEC3',
        },
        {
          bufferView: 2,
          componentType: 5121,
          normalized: true,
          count: vertexCount,
          type: 'VEC4',
        },
        {
          bufferView: 3,
          componentType: indexComponentType,
          count: indexCount,
          type: 'SCALAR',
          min: [0],
          max: [Math.max(0, vertexCount - 1)],
        },
      ],
    };
    const jsonBytes = padUint8ArrayTo4(encodeUtf8Bytes(JSON.stringify(gltf)), 0x20);
    const binBytes = padUint8ArrayTo4(binaryBuffer, 0x00);
    const headerLength = 12;
    const chunkHeaderLength = 8;
    const totalLength = headerLength + chunkHeaderLength + jsonBytes.byteLength + chunkHeaderLength + binBytes.byteLength;
    const glb = new ArrayBuffer(totalLength);
    const dataView = new DataView(glb);
    const output = new Uint8Array(glb);
    dataView.setUint32(0, 0x46546C67, true);
    dataView.setUint32(4, 2, true);
    dataView.setUint32(8, totalLength, true);
    let offset = 12;
    dataView.setUint32(offset, jsonBytes.byteLength, true);
    dataView.setUint32(offset + 4, 0x4E4F534A, true);
    offset += 8;
    output.set(jsonBytes, offset);
    offset += jsonBytes.byteLength;
    dataView.setUint32(offset, binBytes.byteLength, true);
    dataView.setUint32(offset + 4, 0x004E4942, true);
    offset += 8;
    output.set(binBytes, offset);
    return output;
  }

  return Object.freeze({
    buildVoxelGlbBinaryFromCanvases,
  });
      }
    })(scope);
  }

  root.voxelGlbUtils = Object.freeze({
    createVoxelGlbUtils,
  });
})();
