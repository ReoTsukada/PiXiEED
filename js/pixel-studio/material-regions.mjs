const MAX_CELLS = 512 * 512;
const NEIGHBOR_RADIUS = 3;
const FOUR_NEIGHBOR_OFFSETS = [-1, 1, 0, 0];

function validateInput(familyKeys, width, height, protectedCells) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_CELLS) {
    throw new RangeError(`width and height must contain between 1 and ${MAX_CELLS} cells`);
  }
  if (!familyKeys || familyKeys.length !== width * height) throw new TypeError('familyKeys must contain one key per cell');
  for (let i = 0; i < familyKeys.length; i++) {
    if (!Number.isSafeInteger(familyKeys[i]) || familyKeys[i] < 0) throw new TypeError(`family key at ${i} must be a non-negative safe integer`);
  }
  if (protectedCells !== null && protectedCells !== undefined) {
    if (!(protectedCells instanceof Uint8Array || protectedCells instanceof Uint8ClampedArray) || protectedCells.length !== width * height) {
      throw new TypeError('protectedCells must be a byte array matching width * height');
    }
    for (let i = 0; i < protectedCells.length; i++) {
      if (protectedCells[i] !== 0 && protectedCells[i] !== 1) throw new RangeError(`protectedCells value at ${i} must be 0 or 1`);
    }
  }
}

function extractComponents(familyKeys, width, height, protectedCells, edgeLight, edgeThreshold) {
  const cellCount = width * height;
  const componentOf = new Int32Array(cellCount);
  componentOf.fill(-1);
  const queue = new Int32Array(cellCount);
  const headCell = new Int32Array(cellCount);
  headCell.fill(-1);
  const nextCell = new Int32Array(cellCount);
  nextCell.fill(-1);
  const sizes = [];
  const protectedCounts = [];
  const families = [];
  let componentCount = 0;

  for (let start = 0; start < cellCount; start++) {
    if (componentOf[start] !== -1) continue;
    const component = componentCount++;
    const family = familyKeys[start];
    families.push(family);
    let read = 0, write = 0, tail = -1;
    queue[write++] = start;
    componentOf[start] = component;
    let protectedCount = 0;
    while (read < write) {
      const cell = queue[read++];
      if (protectedCells?.[cell]) protectedCount++;
      if (tail < 0) headCell[component] = cell;
      else nextCell[tail] = cell;
      tail = cell;

      const x = cell % width, y = Math.floor(cell / width);
      for (let direction = 0; direction < FOUR_NEIGHBOR_OFFSETS.length; direction++) {
        const offset = FOUR_NEIGHBOR_OFFSETS[direction];
        if ((direction === 0 && x === 0) || (direction === 1 && x + 1 === width) ||
            (direction === 2 && y === 0) || (direction === 3 && y + 1 === height)) continue;
        const neighbor = cell + (direction < 2 ? offset : (direction === 2 ? -width : width));
        if (neighbor < 0 || componentOf[neighbor] !== -1 || familyKeys[neighbor] !== family) continue;
        if (edgeLight && Math.abs(edgeLight[cell] - edgeLight[neighbor]) > edgeThreshold) continue;
        componentOf[neighbor] = component;
        queue[write++] = neighbor;
      }
    }
    sizes.push(write);
    protectedCounts.push(protectedCount);
  }
  return { componentOf, headCell, nextCell, sizes, protectedCounts, families, componentCount };
}

function mergeTinyComponents(components, width, height, cellCount, edgeLight, edgeThreshold) {
  const { componentOf, headCell, nextCell, sizes, protectedCounts, families, componentCount } = components;
  const minimumArea = Math.max(3, Math.floor(cellCount / 8192));
  const majorFamilies = new Set();
  for (let component = 0; component < componentCount; component++) {
    if (sizes[component] >= minimumArea) majorFamilies.add(families[component]);
  }

  const resolved = new Int32Array(componentCount);
  for (let component = 0; component < componentCount; component++) resolved[component] = component;
  let mergedCount = 0;
  for (let component = 0; component < componentCount; component++) {
    if (sizes[component] >= minimumArea || protectedCounts[component] > 0 || !majorFamilies.has(families[component])) continue;
    let best = -1, bestDistance = Infinity, bestSize = -1;
    for (let cell = headCell[component]; cell >= 0; cell = nextCell[cell]) {
      const x = cell % width, y = Math.floor(cell / width);
      for (let dy = -NEIGHBOR_RADIUS; dy <= NEIGHBOR_RADIUS; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -NEIGHBOR_RADIUS; dx <= NEIGHBOR_RADIUS; dx++) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance === 0 || distance > NEIGHBOR_RADIUS || distance > bestDistance) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const candidate = componentOf[ny * width + nx];
          if (candidate === component || sizes[candidate] < minimumArea || families[candidate] !== families[component]) continue;
          if (edgeLight && Math.abs(edgeLight[cell] - edgeLight[ny * width + nx]) > edgeThreshold) continue;
          if (distance < bestDistance || (distance === bestDistance && sizes[candidate] > bestSize) ||
              (distance === bestDistance && sizes[candidate] === bestSize && candidate < best)) {
            best = candidate;
            bestDistance = distance;
            bestSize = sizes[candidate];
          }
        }
      }
    }
    if (best >= 0) {
      resolved[component] = best;
      mergedCount++;
    }
  }
  return { resolved, mergedCount };
}

/**
 * Groups cells by four-connected material family and conservatively retains
 * region IDs between nearby frames. This partitions color families only; it
 * does not infer semantic labels such as face, hair, or clothing.
 */
export function createMaterialRegionTracker() {
  let previous = null;
  let nextRegionId = 1;

  function reset() {
    previous = null;
    nextRegionId = 1;
  }

  function partition(familyKeys, width, height, { protectedCells = null, edgeLight = null, edgeThreshold = 32 } = {}) {
    validateInput(familyKeys, width, height, protectedCells);
    const cellCount = width * height;
    if (edgeLight && (edgeLight.length !== cellCount || !Number.isFinite(edgeThreshold) || edgeThreshold <= 0)) throw new RangeError('edge light must match the grid and use a positive threshold');
    if (edgeLight) for (const value of edgeLight) if (!Number.isFinite(value)) throw new TypeError('edge light must be finite');
    const components = extractComponents(familyKeys, width, height, protectedCells, edgeLight, edgeThreshold);
    const { resolved, mergedCount } = mergeTinyComponents(components, width, height, cellCount, edgeLight, edgeThreshold);
    const areas = new Map();
    for (let component = 0; component < components.componentCount; component++) {
      const root = resolved[component];
      const entry = areas.get(root) ?? { family: components.families[root], area: 0 };
      entry.area += components.sizes[component];
      areas.set(root, entry);
    }

    const currentLabels = new Uint32Array(cellCount);
    const overlaps = new Map();
    for (let cell = 0; cell < cellCount; cell++) {
      const current = resolved[components.componentOf[cell]];
      const oldId = previous && previous.width === width && previous.height === height ? previous.labels[cell] : 0;
      const prior = oldId ? previous.regions.get(oldId) : null;
      if (!prior || prior.family !== components.families[current]) continue;
      let byOld = overlaps.get(current);
      if (!byOld) { byOld = new Map(); overlaps.set(current, byOld); }
      byOld.set(oldId, (byOld.get(oldId) ?? 0) + 1);
    }

    const candidates = [];
    for (const [current, byOld] of overlaps) {
      const currentArea = areas.get(current).area;
      for (const [oldId, overlap] of byOld) {
        const oldArea = previous.regions.get(oldId).area;
        const required = 0.25 * Math.min(currentArea, oldArea);
        if (overlap >= required) candidates.push({ current, oldId, overlap, ratio: overlap / Math.min(currentArea, oldArea) });
      }
    }
    candidates.sort((a, b) => b.overlap - a.overlap || b.ratio - a.ratio || a.current - b.current || a.oldId - b.oldId);
    const matchedCurrent = new Set(), matchedOld = new Set(), assigned = new Map();
    for (const candidate of candidates) {
      if (matchedCurrent.has(candidate.current) || matchedOld.has(candidate.oldId)) continue;
      matchedCurrent.add(candidate.current);
      matchedOld.add(candidate.oldId);
      assigned.set(candidate.current, candidate.oldId);
    }

    const regionTable = new Map();
    for (const [component, area] of areas) {
      let id = assigned.get(component);
      if (id === undefined) {
        if (nextRegionId > 0xffffffff) throw new RangeError('material region ID capacity reached; reset tracker');
        id = nextRegionId++;
      }
      regionTable.set(id, { family: area.family, area: area.area });
      assigned.set(component, id);
    }
    for (let cell = 0; cell < cellCount; cell++) currentLabels[cell] = assigned.get(resolved[components.componentOf[cell]]);
    previous = { width, height, labels: currentLabels, regions: regionTable };
    return { labels: currentLabels, regionCount: regionTable.size, componentCount: components.componentCount, mergedCount };
  }

  return { partition, reset };
}
