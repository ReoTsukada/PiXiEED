const DEG_TO_RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;

function mercatorY(latitude) {
  const clamped = Math.max(-85.0511287798066, Math.min(85.0511287798066, Number(latitude)));
  return Math.log(Math.tan(Math.PI / 4 + clamped * DEG_TO_RAD / 2));
}

function readCells(index) {
  if (!Array.isArray(index?.cells)) throw new TypeError('A map-cell index with a cells array is required.');
  const cells = new Array(index.cells.length);
  for (let offset = 0; offset < index.cells.length; offset += 1) {
    const cell = index.cells[offset];
    const bounds = cell?.bounds;
    const west = Number(bounds?.west) * DEG_TO_RAD;
    const eastDegrees = Number(bounds?.east);
    const east = (eastDegrees < Number(bounds?.west) ? eastDegrees + 360 : eastDegrees) * DEG_TO_RAD;
    const north = Number.isFinite(Number(cell?.northMercator)) ? Number(cell.northMercator) : mercatorY(bounds?.north);
    const south = Number.isFinite(Number(cell?.southMercator)) ? Number(cell.southMercator) : mercatorY(bounds?.south);
    const displayIndex = Number(cell?.index);
    if (![west, east, north, south, displayIndex].every(Number.isFinite) || east <= west || north < south || displayIndex <= 0) {
      throw new RangeError(`Invalid map cell at index ${offset}.`);
    }
    const land = cell.land !== undefined ? Boolean(cell.land)
      : cell.isLand !== undefined ? Boolean(cell.isLand)
        : cell.isWater !== undefined ? !cell.isWater
          : cell.water !== undefined ? !cell.water
            : true;
    cells[offset] = Object.freeze({ west, east, north, south, index: displayIndex, row: Number(cell.row), column: Number(cell.column), land, prefectureIndex: Number(cell.prefectureIndex) || 0, mapRegionIndex: Number(cell.mapRegionIndex ?? cell.prefectureIndex) || 0 });
  }
  return { cells: Object.freeze(cells), resolution: Number(index.resolution), byIndex: new Map(cells.map(cell => [cell.index, cell])) };
}

function selectedIndex(value) {
  const index = Number(value?.displayIndex ?? value?.displayCell?.index ?? 0);
  return Number.isFinite(index) && index > 0 ? index : 0;
}

function selectedRegionIndex(value) {
  const index = Number(value?.mapRegionIndex ?? value?.displayCell?.mapRegionIndex ?? value?.prefectureIndex ?? value?.displayCell?.prefectureIndex ?? 0);
  return Number.isInteger(index) && index > 0 && index <= 65535 ? index : 0;
}

function createMapRegionMask(index, cells, resolution) {
  const size = resolution * resolution;
  if (index.mapRegionMask instanceof Uint16Array && index.mapRegionMask.length === size) return index.mapRegionMask;
  const mask = new Uint16Array(size);
  if (index.prefectureMask instanceof Uint8Array && index.prefectureMask.length === size) {
    for (let key = 0; key < size; key += 1) mask[key] = index.prefectureMask[key];
    return mask;
  }
  for (const cell of cells) {
    const region = Number(cell.mapRegionIndex ?? cell.prefectureIndex) || 0;
    if (region > 0 && region <= 65535) mask[cell.row * resolution + cell.column] = region;
  }
  return mask;
}

function createMapRegionGeometry(mask, resolution, metadata = []) {
  if (Array.isArray(metadata) && metadata.length > 65536) throw new RangeError('Map region metadata exceeds Uint16 capacity.');
  let regionCount = Math.max(48, Array.isArray(metadata) ? metadata.length : 0);
  for (const value of mask) if (value + 1 > regionCount) regionCount = value + 1;
  const runs = Array.from({ length: regionCount }, () => []);
  const edges = Array.from({ length: regionCount }, () => []);
  const paths = Array(regionCount).fill(null);
  for (let row = 0; row < resolution; row += 1) {
    let column = 0;
    while (column < resolution) {
      const region = mask[row * resolution + column];
      if (!region) { column += 1; continue; }
      const start = column;
      while (column + 1 < resolution && mask[row * resolution + column + 1] === region) column += 1;
      runs[region].push([row, start, column + 1]);
      column += 1;
    }
  }
  for (let row = 0; row < resolution; row += 1) for (let column = 0; column < resolution; column += 1) {
    const region = mask[row * resolution + column];
    if (!region) continue;
    const base = edges[region];
    const left = mask[row * resolution + (column ? column - 1 : resolution - 1)];
    const right = mask[row * resolution + (column + 1 < resolution ? column + 1 : 0)];
    const above = row ? mask[(row - 1) * resolution + column] : 0;
    const below = row + 1 < resolution ? mask[(row + 1) * resolution + column] : 0;
    if (left !== region) base.push(column, row, column, row + 1);
    if (right !== region) base.push(column + 1, row, column + 1, row + 1);
    if (above !== region) base.push(column, row, column + 1, row);
    if (below !== region) base.push(column, row + 1, column + 1, row + 1);
  }
  if (typeof Path2D === 'function') for (let region = 1; region < regionCount; region += 1) {
    const segments = edges[region];
    if (!segments.length) continue;
    const path = new Path2D();
    for (let offset = 0; offset < segments.length; offset += 4) { path.moveTo(segments[offset], segments[offset + 1]); path.lineTo(segments[offset + 2], segments[offset + 3]); }
    paths[region] = path;
  }
  return { runs, edges, paths };
}

function visibleCopies(camera) {
  const worldSize = Number(camera.worldSize);
  const scale = Number(camera.scale);
  const width = Number(camera.viewport.width);
  const centerX = Number(camera.viewport.centerX ?? camera.viewport.width / 2);
  const centerLongitude = Number(camera.centerLongitude) * DEG_TO_RAD;
  if (!(worldSize > 0 && scale > 0 && width > 0)) return [];
  const worldLeft = centerX + (-Math.PI - centerLongitude) * scale;
  const first = Math.floor(-worldLeft / worldSize);
  const last = Math.ceil((width - worldLeft) / worldSize) - 1;
  const copies = [];
  for (let copy = first; copy <= last; copy += 1) copies.push(copy);
  return copies;
}

function context2d(canvas) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable for the map-cell fallback.');
  return context;
}

const SEA_COLOR = '#0a1b26';
const LAND_COLOR = '#61c0aa';
const SELECTED_COLOR = '#ffda57';
const HOVER_COLOR = '#7cebe6';
const POSTS_COLOR = '#77aaff';
const EVENTS_COLOR = '#f2ad55';
const GRID_COLOR = 'rgba(123, 164, 178, 0.42)';
const FUTURE_EVENT_COLORS = [[0, 0, 0], [242, 173, 85], [234, 122, 66], [199, 70, 61]];
const PAST_EVENT_COLORS = [[0, 0, 0], [161, 173, 181], [116, 130, 140], [72, 86, 97]];
function eventColor(bin, past = false) { return (past ? PAST_EVENT_COLORS : FUTURE_EVENT_COLORS)[bin] || [0, 0, 0]; }
function createCanvasRenderer(canvas, cells, index, byIndex, dpr) {
  const context = context2d(canvas), resolution = index.resolution;
  const mapRegionMask = createMapRegionMask(index, cells, resolution);
  const mapRegionGeometry = createMapRegionGeometry(mapRegionMask, resolution, index.mapRegions);
  const texture = canvas.ownerDocument.createElement('canvas');
  texture.width = texture.height = resolution;
  const tileContext = texture.getContext('2d');
  if (!tileContext) throw new Error('Canvas 2D offscreen context is unavailable.');
  let contentMask = new Uint8Array(resolution * resolution);
  let contentLayer = null;
  let eventPeriod = 'all';
  let contentTexture = null;
  let contentContext = null;
  function rebuildContentTexture() {
    if (!contentLayer) { if (contentTexture) { contentTexture.width = 0; contentTexture.height = 0; contentTexture = null; contentContext = null; } return; }
    if (!contentTexture) { contentTexture = canvas.ownerDocument.createElement('canvas'); contentTexture.width = contentTexture.height = resolution; contentContext = contentTexture.getContext('2d'); }
    if (!contentContext) throw new Error('Canvas content overlay context is unavailable.');
    const image = contentContext.createImageData(resolution, resolution);
    for (let i = 0; i < contentMask.length; i += 1) {
      let color;
      if (contentLayer === 'posts') color = contentMask[i] & 1 ? [119, 170, 255] : null;
      else {
        const futureBin = (contentMask[i] >> 1) & 3, pastBin = (contentMask[i] >> 4) & 3;
        const usePast = eventPeriod === 'past' || (eventPeriod === 'all' && futureBin === 0 && pastBin > 0);
        const bin = eventPeriod === 'past' ? pastBin : eventPeriod === 'future' ? futureBin : (contentMask[i] >> 6) & 3;
        color = bin ? eventColor(bin, usePast) : null;
      }
      if (!color) continue;
      const offset = i * 4; image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = 255;
    }
    contentContext.putImageData(image, 0, 0);
  }
  if (index.landMask) {
    const image = tileContext.createImageData(resolution, resolution);
    for (let i = 0; i < index.landMask.length; i++) {
      const land = index.landMask[i] !== 0, offset = i * 4;
      image.data[offset] = land ? 97 : 10;
      image.data[offset + 1] = land ? 192 : 27;
      image.data[offset + 2] = land ? 170 : 38;
      image.data[offset + 3] = 255;
    }
    tileContext.putImageData(image, 0, 0);
  } else {
    tileContext.fillStyle = SEA_COLOR; tileContext.fillRect(0, 0, resolution, resolution);
    tileContext.fillStyle = LAND_COLOR;
    for (const cell of cells) tileContext.fillRect(cell.column, cell.row, 1, 1);
  }
  return {
    backend: 'canvas2d',
    draw({ camera, selected = null, hovered = null } = {}) {
      const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!camera?.viewport) return Object.freeze({ backend: 'canvas2d', drawCalls: 0, frameMs: 0, cellCount: index.cellCount || cells.length, instanceCount: 0 });
      const viewport = camera.viewport;
      const ratio = Number(viewport.dpr) || dpr || 1;
      const width = Number(viewport.width);
      const height = Number(viewport.height);
      const centerX = Number(viewport.centerX ?? width / 2);
      const centerY = Number(viewport.centerY ?? height / 2);
      const scale = Number(camera.scale);
      const centerLongitude = Number(camera.centerLongitude) * DEG_TO_RAD;
      const centerMercatorY = Number(camera.centerMercatorY);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = SEA_COLOR;
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = false;
      const worldSize = Number(camera.worldSize);
      const worldLeft = centerX + (-Math.PI - centerLongitude) * scale;
      const worldTop = centerY - (Math.PI - centerMercatorY) * scale;
      const firstCopy = Math.floor(-worldLeft / worldSize);
      const lastCopy = Math.ceil((width - worldLeft) / worldSize) - 1;
      for (let copy = firstCopy; copy <= lastCopy; copy += 1) {
        context.drawImage(texture, worldLeft + copy * worldSize, worldTop, worldSize, worldSize);
        if (contentTexture) context.drawImage(contentTexture, worldLeft + copy * worldSize, worldTop, worldSize, worldSize);
      }
      const cellPixels = worldSize / resolution;
      const regionHighlights = new Map();
      for (const [selection, color, strength] of [[hovered, HOVER_COLOR, .12], [selected, SELECTED_COLOR, .16]]) {
        const region = selectedRegionIndex(selection);
        if (region) regionHighlights.set(region, { color, strength });
      }
      for (const [region, highlight] of regionHighlights) {
        const runs = mapRegionGeometry.runs[region], edges = mapRegionGeometry.edges[region];
        if (!runs.length) continue;
        context.save();
        context.fillStyle = highlight.color;
        context.globalAlpha = highlight.strength;
        for (let copy = firstCopy; copy <= lastCopy; copy += 1) for (const [row, start, end] of runs) {
          const x = worldLeft + (copy * resolution + start) * cellPixels;
          const y = worldTop + row * cellPixels;
          context.fillRect(x, y, (end - start) * cellPixels, cellPixels);
        }
        context.globalAlpha = 1;
        context.strokeStyle = highlight.color;
        context.lineWidth = Math.min(2, Math.max(1, cellPixels * .16));
        if (mapRegionGeometry.paths[region]) {
          for (let copy = firstCopy; copy <= lastCopy; copy += 1) {
            context.save();
            context.translate(worldLeft + copy * worldSize, worldTop);
            context.scale(cellPixels, cellPixels);
            context.lineWidth = Math.min(2, Math.max(1, cellPixels * .16)) / cellPixels;
            context.stroke(mapRegionGeometry.paths[region]);
            context.restore();
          }
        } else {
          context.beginPath();
          for (let copy = firstCopy; copy <= lastCopy; copy += 1) {
            const x = worldLeft + copy * worldSize;
            for (let offset = 0; offset < edges.length; offset += 4) {
              context.moveTo(x + edges[offset] * cellPixels, worldTop + edges[offset + 1] * cellPixels);
              context.lineTo(x + edges[offset + 2] * cellPixels, worldTop + edges[offset + 3] * cellPixels);
            }
          }
          context.stroke();
        }
        context.restore();
      }
      const gridAlpha = Math.max(0, Math.min(1, (cellPixels - 8) / 8));
      if (gridAlpha > 0) {
        context.beginPath();
        const left = worldLeft + firstCopy * worldSize;
        const right = worldLeft + (lastCopy + 1) * worldSize;
        const firstColumn = Math.ceil(-left / cellPixels);
        const lastColumn = Math.floor((width - left) / cellPixels);
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const x = left + column * cellPixels;
          context.moveTo(x, 0); context.lineTo(x, height);
        }
        const firstRow = Math.max(0, Math.ceil(-worldTop / cellPixels));
        const lastRow = Math.min(resolution, Math.floor((height - worldTop) / cellPixels));
        for (let row = firstRow; row <= lastRow; row += 1) {
          const y = worldTop + row * cellPixels;
          context.moveTo(0, y); context.lineTo(width, y);
        }
        context.strokeStyle = GRID_COLOR;
        context.globalAlpha = gridAlpha;
        context.lineWidth = 1;
        context.stroke();
        context.globalAlpha = 1;
      }
      const selectedId = selectedIndex(selected);
      const hoveredId = selectedIndex(hovered);
      let instanceCount = 0;
      for (const [id, color, selection] of [[hoveredId, HOVER_COLOR, hovered], [selectedId, SELECTED_COLOR, selected]]) {
        if (!id || selectedRegionIndex(selection)) continue;
        const cell = selection?.displayCell || byIndex.get(id);
        if (!cell) continue;
        for (let copy = firstCopy; copy <= lastCopy; copy += 1) {
          const x = worldLeft + (copy * resolution + cell.column) * cellPixels;
          const y = worldTop + cell.row * cellPixels;
          if (x + cellPixels <= 0 || x >= width || y + cellPixels <= 0 || y >= height) continue;
          const content = contentMask[cell.row * resolution + cell.column];
          const futureBin = (content >> 1) & 3, pastBin = (content >> 4) & 3;
          const bin = eventPeriod === 'past' ? pastBin : eventPeriod === 'future' ? futureBin : (content >> 6) & 3;
          const hasColor = contentLayer === 'posts' ? Boolean(content & 1) : contentLayer === 'events' && bin > 0;
          if (hasColor) {
            const lineWidth = Math.min(2, cellPixels * .18);
            context.strokeStyle = color; context.lineWidth = lineWidth;
            context.strokeRect(x + lineWidth / 2, y + lineWidth / 2, cellPixels - lineWidth, cellPixels - lineWidth);
          } else {
            context.fillStyle = color; context.fillRect(x, y, cellPixels, cellPixels);
          }
          instanceCount += 1;
        }
      }
      const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return Object.freeze({ backend: 'canvas2d', drawCalls: 1, frameMs: ended - started, cellCount: index.cellCount || cells.length, instanceCount });
    },
    setContentMask(next) {
      if (!(next instanceof Uint8Array) || next.length !== resolution * resolution) throw new RangeError('Map content mask size is invalid.');
      for (let i = 0; i < next.length; i += 1) if (next[i] !== contentMask[i]) { contentMask = new Uint8Array(next); rebuildContentTexture(); return true; }
      return false;
    },
    setContentLayer(next) { if (next !== null && next !== 'posts' && next !== 'events') throw new RangeError('Unknown map content layer.'); if (contentLayer === next) return false; contentLayer = next; rebuildContentTexture(); return true; },
    setEventPeriod(next) { if (!['all', 'future', 'past'].includes(next)) throw new RangeError('Unknown event period.'); if (eventPeriod === next) return false; eventPeriod = next; rebuildContentTexture(); return true; },
    destroy() { texture.width = 0; texture.height = 0; if (contentTexture) { contentTexture.width = 0; contentTexture.height = 0; } }
  };
}

// A uniform Mercator grid needs one indexed texel per tile. One screen pass
// avoids sending thousands of offscreen instances through the vertex pipeline.
const VERTEX_SOURCE = `#version 300 es
precision highp float;
void main() {
  vec2 point = vec2((gl_VertexID == 1 || gl_VertexID == 3) ? 1.0 : -1.0, gl_VertexID >= 2 ? 1.0 : -1.0);
  gl_Position = vec4(point, 0.0, 1.0);
}`;
const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform usampler2D uTiles;
uniform usampler2D uContentTiles;
uniform usampler2D uRegions;
uniform bool uMaskTexture;
uniform float uDpr;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform vec2 uMapCenter;
uniform float uScale;
uniform float uResolution;
uniform float uCellPixels;
uniform float uGridAlpha;
uniform uint uSelected;
uniform uint uHovered;
uniform uint uSelectedRegion;
uniform uint uHoveredRegion;
uniform uint uContentLayer;
uniform uint uEventPeriod;
out vec4 outColor;
void main() {
  vec3 sea = vec3(0.039216, 0.105882, 0.149020);
  vec2 screen = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
  vec2 world = (screen - uCenter) / uScale * vec2(1.0, -1.0) + uMapCenter;
  vec2 tile = vec2(fract(world.x / 6.283185307179586 + 0.5), 0.5 - world.y / 6.283185307179586) * uResolution;
  if (tile.y < 0.0 || tile.y >= uResolution) { outColor = vec4(sea, 1.0); return; }
  uint sampled = texelFetch(uTiles, ivec2(floor(tile)), 0).r;
  uint index = sampled == 0u ? 0u : (uMaskTexture ? uint(floor(tile.y) * uResolution + floor(tile.x) + 1.0) : sampled);
  uint content = texelFetch(uContentTiles, ivec2(floor(tile)), 0).r;
  ivec2 tilePosition = ivec2(floor(tile));
  uint region = texelFetch(uRegions, tilePosition, 0).r;
  bool selectedRegion = region != 0u && region == uSelectedRegion;
  bool hoveredRegion = region != 0u && region == uHoveredRegion;
  bool highlightRegion = selectedRegion || hoveredRegion;
  vec3 color = sea;
  bool hasContentColor = false;
  if (index != 0u) {
    color = vec3(0.380392, 0.752941, 0.666667);
    if (uContentLayer == 1u && (content & 1u) != 0u) { color = vec3(0.466667, 0.666667, 1.0); hasContentColor = true; }
    if (uContentLayer == 2u) {
      uint futureBin = (content >> 1u) & 3u;
      uint pastBin = (content >> 4u) & 3u;
      bool usePast = uEventPeriod == 2u || (uEventPeriod == 0u && futureBin == 0u && pastBin > 0u);
      uint bin = uEventPeriod == 2u ? pastBin : uEventPeriod == 1u ? futureBin : (content >> 6u) & 3u;
      if (bin > 0u) {
        hasContentColor = true;
        if (usePast) color = bin == 1u ? vec3(0.631373, 0.678431, 0.709804) : bin == 2u ? vec3(0.454902, 0.509804, 0.549020) : vec3(0.282353, 0.337255, 0.380392);
        else color = bin == 1u ? vec3(0.949020, 0.678431, 0.333333) : bin == 2u ? vec3(0.917647, 0.478431, 0.258824) : vec3(0.780392, 0.274510, 0.239216);
      }
    }
    float contentEdgeDistance = min(min(fract(tile.x), 1.0 - fract(tile.x)), min(fract(tile.y), 1.0 - fract(tile.y))) * uCellPixels;
    bool highlightEdge = contentEdgeDistance < min(2.0 * uDpr, uCellPixels * 0.18);
    if (highlightRegion) {
      vec3 accent = selectedRegion ? vec3(1.0, 0.854902, 0.341176) : vec3(0.486275, 0.921569, 0.901961);
      color = mix(color, accent, hasContentColor ? 0.12 : 0.22);
    }
    if (!highlightRegion && index == uHovered && (!hasContentColor || highlightEdge)) color = vec3(0.486275, 0.921569, 0.901961);
    if (!highlightRegion && index == uSelected && (!hasContentColor || highlightEdge)) color = vec3(1.0, 0.854902, 0.341176);
  }
  bool regionBoundary = false;
  if (highlightRegion) {
    float edgeBand = min(2.0 * uDpr, uCellPixels * 0.22);
    vec2 local = fract(tile);
    ivec2 leftPosition = ivec2((tilePosition.x + int(uResolution) - 1) % int(uResolution), tilePosition.y);
    ivec2 rightPosition = ivec2((tilePosition.x + 1) % int(uResolution), tilePosition.y);
    uint leftRegion = texelFetch(uRegions, leftPosition, 0).r;
    uint rightRegion = texelFetch(uRegions, rightPosition, 0).r;
    uint topRegion = tilePosition.y > 0 ? texelFetch(uRegions, tilePosition + ivec2(0, -1), 0).r : 0u;
    uint bottomRegion = tilePosition.y + 1 < int(uResolution) ? texelFetch(uRegions, tilePosition + ivec2(0, 1), 0).r : 0u;
    regionBoundary = (local.x * uCellPixels < edgeBand && leftRegion != region)
      || ((1.0 - local.x) * uCellPixels < edgeBand && rightRegion != region)
      || (local.y * uCellPixels < edgeBand && topRegion != region)
      || ((1.0 - local.y) * uCellPixels < edgeBand && bottomRegion != region);
    if (uGridAlpha > 0.0 && !regionBoundary) {
      float edgeDistance = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y)) * uCellPixels;
      float line = 1.0 - smoothstep(0.0, uDpr, edgeDistance);
      color = mix(color, vec3(123.0, 164.0, 178.0) / 255.0, line * uGridAlpha);
    }
    if (regionBoundary) color = selectedRegion ? vec3(1.0, 0.854902, 0.341176) : vec3(0.486275, 0.921569, 0.901961);
  } else if (uGridAlpha > 0.0 && !(index != 0u && (index == uSelected || index == uHovered))) {
    float edgeDistance = min(min(fract(tile.x), 1.0 - fract(tile.x)), min(fract(tile.y), 1.0 - fract(tile.y))) * uCellPixels;
    float line = 1.0 - smoothstep(0.0, uDpr, edgeDistance);
    color = mix(color, vec3(123.0, 164.0, 178.0) / 255.0, line * uGridAlpha);
  }
  outColor = vec4(color, 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create map-cell shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(`Map-cell shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  let fragment;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    const program = gl.createProgram();
    if (!program) throw new Error('Unable to create map-cell program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'unknown link error';
      gl.deleteProgram(program);
      throw new Error(`Map-cell program link failed: ${message}`);
    }
    return program;
  } finally {
    gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function createGpuRenderer(canvas, gl, cells, index) {
  if (gl.isContextLost()) throw new Error('WebGL context is lost while creating the map-cell renderer.');
  const resolution = index.resolution;
  if (!Number.isInteger(resolution) || resolution < 2) throw new RangeError('A uniform map resolution is required.');
  const program = createProgram(gl), vao = gl.createVertexArray(), texture = gl.createTexture(), contentTexture = gl.createTexture(), regionTexture = gl.createTexture();
  if (!vao || !texture || !contentTexture || !regionTexture) throw new Error('Unable to allocate map-cell GPU resources.');
  try {
    const values = index.landMask || new Uint32Array(resolution * resolution);
    if (!index.landMask) for (const cell of index.cells) values[cell.row * resolution + cell.column] = cell.index;
    const regions = createMapRegionMask(index, cells, resolution);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, index.landMask ? gl.R8UI : gl.R32UI, resolution, resolution, 0, gl.RED_INTEGER, index.landMask ? gl.UNSIGNED_BYTE : gl.UNSIGNED_INT, values);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const emptyContent = new Uint8Array(resolution * resolution);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, resolution, resolution, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, emptyContent);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, regionTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, resolution, resolution, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, regions);
    const locations = Object.fromEntries(['uTiles', 'uContentTiles', 'uRegions', 'uMaskTexture', 'uDpr', 'uViewport', 'uCenter', 'uMapCenter', 'uScale', 'uResolution', 'uCellPixels', 'uGridAlpha', 'uSelected', 'uHovered', 'uSelectedRegion', 'uHoveredRegion', 'uContentLayer', 'uEventPeriod'].map(name => [name, gl.getUniformLocation(program, name)]));
    let contentLayer = null;
    let eventPeriod = 'all';
    let contentMask = emptyContent;
    function contentMaskEqual(next) { if (!contentMask) return false; for (let i = 0; i < next.length; i += 1) if (next[i] !== contentMask[i]) return false; return true; }
    return {
      backend: 'webgl2',
      draw({ camera, selected = null, hovered = null } = {}) {
        const started = performance.now();
        if (gl.isContextLost()) throw new Error('WebGL context was lost during map-cell rendering.');
        const viewport = camera.viewport, dpr = viewport.dpr || 1;
        const width = viewport.physicalWidth || viewport.width * dpr, height = viewport.physicalHeight || viewport.height * dpr;
        const cellPixels = camera.worldSize / resolution;
        const gridAlpha = Math.max(0, Math.min(1, (cellPixels - 8) / 8)) * 0.42;
        gl.viewport(0, 0, width, height);
        gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
        gl.colorMask(true, true, true, true); gl.useProgram(program); gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(locations.uTiles, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, contentTexture);
        gl.uniform1i(locations.uContentTiles, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, regionTexture);
        gl.uniform1i(locations.uRegions, 2);
        gl.uniform1ui(locations.uContentLayer, contentLayer === 'posts' ? 1 : contentLayer === 'events' ? 2 : 0);
        gl.uniform1ui(locations.uEventPeriod, eventPeriod === 'future' ? 1 : eventPeriod === 'past' ? 2 : 0);
        gl.uniform1i(locations.uMaskTexture, index.landMask ? 1 : 0); gl.uniform1f(locations.uDpr, dpr);
        gl.uniform2f(locations.uViewport, width, height);
        gl.uniform2f(locations.uCenter, viewport.centerX * dpr, viewport.centerY * dpr);
        gl.uniform2f(locations.uMapCenter, camera.centerLongitude * DEG_TO_RAD, camera.centerMercatorY);
        gl.uniform1f(locations.uScale, camera.scale * dpr); gl.uniform1f(locations.uResolution, resolution);
        gl.uniform1f(locations.uCellPixels, cellPixels * dpr); gl.uniform1f(locations.uGridAlpha, gridAlpha);
        gl.uniform1ui(locations.uSelected, selectedIndex(selected)); gl.uniform1ui(locations.uHovered, selectedIndex(hovered));
        gl.uniform1ui(locations.uSelectedRegion, selectedRegionIndex(selected)); gl.uniform1ui(locations.uHoveredRegion, selectedRegionIndex(hovered));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null); gl.useProgram(null);
        return Object.freeze({ backend: 'webgl2', drawCalls: 1, instanceCount: 1, cellCount: index.cellCount || cells.length, frameMs: performance.now() - started });
      },
      setContentMask(next) {
        if (!(next instanceof Uint8Array) || next.length !== resolution * resolution) throw new RangeError('Map content mask size is invalid.');
        if (contentMaskEqual(next)) return false;
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, contentTexture); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, resolution, resolution, gl.RED_INTEGER, gl.UNSIGNED_BYTE, next);
        contentMask = new Uint8Array(next); return true;
      },
      setContentLayer(next) { if (next !== null && next !== 'posts' && next !== 'events') throw new RangeError('Unknown map content layer.'); if (contentLayer === next) return false; contentLayer = next; return true; },
      setEventPeriod(next) { if (!['all', 'future', 'past'].includes(next)) throw new RangeError('Unknown event period.'); if (eventPeriod === next) return false; eventPeriod = next; return true; },
      destroy() { gl.deleteTexture(texture); gl.deleteTexture(contentTexture); gl.deleteTexture(regionTexture); gl.deleteVertexArray(vao); gl.deleteProgram(program); }
    };
  } catch (error) { gl.deleteTexture(texture); gl.deleteTexture(contentTexture); gl.deleteTexture(regionTexture); gl.deleteVertexArray(vao); gl.deleteProgram(program); throw error; }
}

/**
 * Draws indexed display cells in a periodic Mercator map. Cell IDs stay in the
 * display-cell domain; callers should keep canonical posting IDs on selections.
 */
export function createMapCellRenderer(canvas, { index, forceCanvas = false } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A Canvas element is required.');
  const { cells, byIndex } = index.landMask ? { cells: [], byIndex: new Map() } : readCells(index);
  const dpr = Number(canvas.ownerDocument?.defaultView?.devicePixelRatio) || 1;
  if (forceCanvas) return createCanvasRenderer(canvas, cells, index, byIndex, dpr);

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
  } catch {
    gl = null;
  }
  if (!gl) return createCanvasRenderer(canvas, cells, index, byIndex, dpr);
  return createGpuRenderer(canvas, gl, cells, index);
}
