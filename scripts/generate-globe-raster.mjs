#!/usr/bin/env node

/**
 * Deterministically rasterize GeoJSON membership at the authoritative globe
 * cell centers. This is an offline build step; the browser never runs the
 * expensive point-in-polygon pass during startup.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GRID, getCell } from '../js/globe/geometry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORLD_PATH = resolve(ROOT, 'assets/maps/world-countries-110m.geojson');
const PREFECTURE_PATH = resolve(ROOT, 'assets/maps/japan-prefectures.geojson');
const OUTPUT_PATH = resolve(ROOT, 'assets/maps/globe-land-mask-v1.json');
const TEXTURE_WIDTH = 1440;
const TEXTURE_HEIGHT = 720;

function normalizeLongitude(value) {
  const wrapped = ((Number(value) + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function unwrapRing(ring) {
  const result = [];
  let previous = Number(ring[0][0]);
  result.push([previous, Number(ring[0][1])]);
  for (let index = 1; index < ring.length; index += 1) {
    let longitude = Number(ring[index][0]);
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    result.push([longitude, Number(ring[index][1])]);
    previous = longitude;
  }
  return result;
}

function alignLongitude(longitude, reference) {
  let aligned = normalizeLongitude(longitude);
  while (aligned - reference > 180) aligned -= 360;
  while (aligned - reference < -180) aligned += 360;
  return aligned;
}

function classifyRing(longitude, latitude, ring) {
  const coordinates = unwrapRing(ring);
  const pointX = alignLongitude(longitude, coordinates[0][0]);
  let inside = false;
  for (let index = 0, previousIndex = coordinates.length - 1; index < coordinates.length; previousIndex = index, index += 1) {
    const [currentX, currentY] = coordinates[index];
    const [previousX, previousY] = coordinates[previousIndex];
    const crosses = (currentY > latitude) !== (previousY > latitude);
    if (crosses) {
      const intersectionX = previousX + ((latitude - previousY) * (currentX - previousX)) / (currentY - previousY);
      if (intersectionX > pointX) inside = !inside;
    }
  }
  return inside;
}

function geometryParts(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function boundsForGeometry(geometry) {
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  for (const polygon of geometryParts(geometry)) for (const ring of polygon) for (const coordinate of ring) {
    west = Math.min(west, Number(coordinate[0]));
    east = Math.max(east, Number(coordinate[0]));
    south = Math.min(south, Number(coordinate[1]));
    north = Math.max(north, Number(coordinate[1]));
  }
  return { west, east, south, north };
}

function ringContains(ring, x, y) {
  // Planar ray casting in longitude/latitude. Natural Earth and the prefecture
  // data are already split at the antimeridian, so no unwrapping is needed.
  // (Unwrapping broke rings that wind around a pole, i.e. Antarctica.)
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const currentX = ring[index][0];
    const currentY = ring[index][1];
    const previousX = ring[previousIndex][0];
    const previousY = ring[previousIndex][1];
    if ((currentY > y) !== (previousY > y) && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) inside = !inside;
  }
  return inside;
}

function containsGeometry(feature, longitude, latitude) {
  const { bounds } = feature;
  if (latitude < bounds.south || latitude > bounds.north || longitude < bounds.west || longitude > bounds.east) return false;
  for (const polygon of feature.polygons) {
    if (!ringContains(polygon[0], longitude, latitude)) continue;
    let inHole = false;
    for (let index = 1; index < polygon.length; index += 1) if (ringContains(polygon[index], longitude, latitude)) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

function normalizeFeatures(source, property) {
  return source.features.map((feature, sourceIndex) => ({
    id: String(feature.properties?.[property] ?? '').trim(),
    label: String(feature.properties?.['name:ja'] || feature.properties?.NAME || feature.properties?.name || feature.properties?.name_en || feature.properties?.[property] || '').trim(),
    geometry: feature.geometry,
    polygons: geometryParts(feature.geometry),
    sourceIndex,
    bounds: boundsForGeometry(feature.geometry)
  })).filter((feature) => feature.id).sort((a, b) => a.id.localeCompare(b.id) || a.sourceIndex - b.sourceIndex);
}

function binIndex(value, size, max) {
  return Math.max(0, Math.min(max - 1, Math.floor((value + 180) / size)));
}

function buildIndex(features) {
  const bins = new Map();
  for (const [index, feature] of features.entries()) {
    const west = binIndex(feature.bounds.west, 20, 18);
    const east = binIndex(feature.bounds.east, 20, 18);
    const south = Math.max(0, Math.min(8, Math.floor((feature.bounds.south + 90) / 20)));
    const north = Math.max(0, Math.min(8, Math.floor((feature.bounds.north + 90) / 20)));
    const longitudes = feature.bounds.east - feature.bounds.west >= 180
      ? Array.from({ length: 18 }, (_, item) => item)
      : west <= east
        ? Array.from({ length: east - west + 1 }, (_, item) => west + item)
        : [...Array.from({ length: 18 - west }, (_, item) => west + item), ...Array.from({ length: east + 1 }, (_, item) => item)];
    for (const longitude of longitudes) for (let latitude = south; latitude <= north; latitude += 1) {
      const key = `${longitude}:${latitude}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(index);
    }
  }
  return bins;
}

function findFeature(features, bins, longitude, latitude) {
  const candidates = bins.get(`${binIndex(longitude, 20, 18)}:${Math.max(0, Math.min(8, Math.floor((latitude + 90) / 20)))}`) || [];
  for (const index of candidates) {
    const feature = features[index];
    if (latitude < feature.bounds.south || latitude > feature.bounds.north) continue;
    if (containsGeometry(feature, longitude, latitude)) return feature;
  }
  return null;
}

function toBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

function checksum(parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(Buffer.from(part.buffer, part.byteOffset, part.byteLength));
  return `sha256:${hash.digest('hex')}`;
}

const [worldSource, prefectureSource] = await Promise.all([
  readFile(WORLD_PATH, 'utf8').then(JSON.parse),
  readFile(PREFECTURE_PATH, 'utf8').then(JSON.parse)
]);
const world = normalizeFeatures(worldSource, 'ADM0_A3');
const prefectures = normalizeFeatures(prefectureSource, 'code');
const worldBins = buildIndex(world);
const prefectureBins = buildIndex(prefectures);
const countryIds = ['__water__', ...world.map((feature) => feature.id)];
const countryLabels = ['海', ...world.map((feature) => feature.label)];
const prefectureIds = ['__none__', ...prefectures.map((feature) => feature.id)];
const prefectureLabels = ['海', ...prefectures.map((feature) => feature.label)];
const countryIndexById = new Map(countryIds.map((id, index) => [id, index]));
const prefectureIndexById = new Map(prefectureIds.map((id, index) => [id, index]));
const cellCount = DEFAULT_GRID.bands.reduce((sum, band) => sum + band.longitudeCount, 0);
const countryIndices = new Uint16Array(cellCount);
const prefectureIndices = new Uint8Array(cellCount);
// Each cell is sampled on a SUBxSUB grid. The owner is the plurality feature,
// and a cell is land when at least half of its samples are land. This keeps the
// cell layout unchanged but preserves area far better than a single centre test.
const SUB = 4;
const LAND_THRESHOLD = 0.4;
const cellIndexOffsets = [];
{
  let running = 0;
  for (const band of DEFAULT_GRID.bands) { cellIndexOffsets.push(running); running += band.longitudeCount; }
}
function cellSamples(band, column) {
  const cell = getCell(band, column, DEFAULT_GRID);
  const { west, east, north, south } = cell.bounds;
  const points = [];
  for (let row = 0; row < SUB; row += 1) for (let col = 0; col < SUB; col += 1) {
    points.push([west + ((col + 0.5) / SUB) * (east - west), north - ((row + 0.5) / SUB) * (north - south)]);
  }
  return points;
}
function classifyPoint(longitude, latitude) {
  const prefecture = findFeature(prefectures, prefectureBins, longitude, latitude);
  if (prefecture) return { country: 'JPN', prefecture: prefecture.id };
  const country = findFeature(world, worldBins, longitude, latitude);
  return { country: country ? country.id : null, prefecture: null };
}
function plurality(counts) {
  let best = null;
  let bestCount = 0;
  for (const [key, count] of counts) if (count > bestCount || (count === bestCount && key < best)) { best = key; bestCount = count; }
  return best;
}
const bestCountryCell = new Map();
const bestPrefectureCell = new Map();
function noteBest(map, id, count, index) {
  if (!map.has(id)) map.set(id, []);
  map.get(id).push({ count, index });
}
function rankedCandidates(map, id) {
  return (map.get(id) || []).slice().sort((a, b) => b.count - a.count || a.index - b.index);
}
const cellCountryCounts = new Uint16Array(countryIds.length);
const cellPrefectureCounts = new Uint16Array(prefectureIds.length);
for (let band = 0; band < DEFAULT_GRID.bandCount; band += 1) {
  const info = DEFAULT_GRID.bands[band];
  for (let column = 0; column < info.longitudeCount; column += 1) {
    const cellIndex = cellIndexOffsets[band] + column;
    const countryCounts = new Map();
    const prefectureCounts = new Map();
    let land = 0;
    for (const [longitude, latitude] of cellSamples(band, column)) {
      const sample = classifyPoint(longitude, latitude);
      if (!sample.country) continue;
      land += 1;
      countryCounts.set(sample.country, (countryCounts.get(sample.country) || 0) + 1);
      if (sample.prefecture) prefectureCounts.set(sample.prefecture, (prefectureCounts.get(sample.prefecture) || 0) + 1);
    }
    for (const [id, count] of countryCounts) noteBest(bestCountryCell, id, count, cellIndex);
    for (const [id, count] of prefectureCounts) noteBest(bestPrefectureCell, id, count, cellIndex);
    if (land / (SUB * SUB) < LAND_THRESHOLD) continue;
    const country = plurality(countryCounts);
    countryIndices[cellIndex] = countryIndexById.get(country) || 0;
    if (country === 'JPN') {
      const prefecture = plurality(prefectureCounts);
      prefectureIndices[cellIndex] = prefecture ? prefectureIndexById.get(prefecture) || 0 : 0;
    }
  }
}

// Guarantee every country and prefecture owns at least one cell, so small units
// stay selectable: give each empty unit the cell where most of it lies.
function occupancy() {
  const countries = new Uint32Array(countryIds.length);
  const prefectureCounts = new Uint32Array(prefectureIds.length);
  for (let index = 0; index < cellCount; index += 1) { countries[countryIndices[index]] += 1; prefectureCounts[prefectureIndices[index]] += 1; }
  return { countries, prefectureCounts };
}
const promoted = [];
for (let pass = 0; pass < 6; pass += 1) {
  const { countries, prefectureCounts } = occupancy();
  let changed = false;
  for (let index = 1; index < countryIds.length; index += 1) {
    if (countries[index] !== 0) continue;
    const candidates = rankedCandidates(bestCountryCell, countryIds[index]);
    // Prefer a cell whose current owner keeps at least one other cell.
    const best = candidates.find((candidate) => { const owner = countryIndices[candidate.index]; return owner === 0 || countries[owner] > 1; }) || candidates[0];
    if (best) { countryIndices[best.index] = index; prefectureIndices[best.index] = 0; countries[index] += 1; promoted.push(countryIds[index]); changed = true; }
  }
  for (let index = 1; index < prefectureIds.length; index += 1) {
    if (prefectureCounts[index] !== 0) continue;
    const candidates = rankedCandidates(bestPrefectureCell, prefectureIds[index]);
    const best = candidates.find((candidate) => { const owner = prefectureIndices[candidate.index]; return owner === 0 || prefectureCounts[owner] > 1; }) || candidates[0];
    if (best) {
      const previous = prefectureIndices[best.index];
      if (previous) prefectureCounts[previous] -= 1;
      countryIndices[best.index] = countryIndexById.get('JPN');
      prefectureIndices[best.index] = index;
      prefectureCounts[index] += 1;
      promoted.push(`pref:${prefectureIds[index]}`);
      changed = true;
    }
  }
  if (!changed) break;
}
{
  const { countries, prefectureCounts } = occupancy();
  const emptyCountries = countryIds.filter((id, index) => index && countries[index] === 0);
  const emptyPrefectures = prefectureIds.filter((id, index) => index && prefectureCounts[index] === 0);
  console.log(JSON.stringify({ promotedToOwnCell: promoted.length, emptyCountries, emptyPrefectures }));
}

const result = {
  version: 'globe-land-mask-v1',
  geometryVersion: DEFAULT_GRID.version,
  latitudeStepDegrees: DEFAULT_GRID.latitudeStepDegrees,
  textureWidth: TEXTURE_WIDTH,
  textureHeight: TEXTURE_HEIGHT,
  cellCount,
  countryIds,
  countryLabels,
  prefectureIds,
  prefectureLabels,
  countryIndicesEncoding: 'base64-u16-le',
  prefectureIndicesEncoding: 'base64-u8',
  countryIndices: toBase64(countryIndices),
  prefectureIndices: toBase64(prefectureIndices),
  checksum: checksum([countryIndices, prefectureIndices])
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(result)}\n`);
console.log(JSON.stringify({ output: OUTPUT_PATH, version: result.version, cellCount, checksum: result.checksum, countryCount: countryIds.length - 1, prefectureCount: prefectureIds.length - 1 }));
