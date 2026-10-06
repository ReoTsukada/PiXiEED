import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMapCells, createMapCellIndex, lookupMapCell, createFineMapCellIndex, resolveMapLocation, FINE_MAP_RESOLUTION } from '../../js/globe/map-cells.mjs';
import { DEFAULT_GRID, lookupCell, inverseMercatorY } from '../../js/globe/geometry.mjs';
const source = JSON.parse(readFileSync(new URL('../../assets/maps/globe-land-mask-v1.json', import.meta.url), 'utf8'));
const data = JSON.parse(readFileSync(new URL('../../assets/maps/map-cells-v1.json', import.meta.url), 'utf8'));
const index = createMapCellIndex(data);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('uniform map substantially reduces cells and preserves all 47 prefectures and 177 countries', () => {
  assert.equal(data.resolution, 384); assert.equal(data.worldCellCount, 147456);
  assert.equal(data.sourceCellCount, 660768); assert.equal(data.cellCount, index.cells.length);
  assert.ok(data.cellCount < data.sourceLandCellCount * .25);
  assert.equal(new Set(index.cells.map(cell => cell.countryId)).size, 177);
  assert.equal(new Set(index.cells.map(cell => cell.prefectureId).filter(Boolean)).size, 47);
  assert.deepEqual([...new Set(index.cells.map(cell => cell.prefectureId).filter(Boolean))].sort(), source.prefectureIds.slice(1).sort());
});
test('every displayed tile has identical square dimensions and aligned rows in Mercator space', () => {
  const step = Math.PI * 2 / index.resolution;
  for (const cell of index.cells) {
    near((cell.bounds.east - cell.bounds.west) * Math.PI / 180, step);
    near(cell.northMercator - cell.southMercator, step);
    near((cell.bounds.west + 180) / 360 * index.resolution, cell.column);
    near((Math.PI - cell.northMercator) / (Math.PI * 2) * index.resolution, cell.row);
    assert.equal(lookupMapCell((cell.bounds.west + cell.bounds.east) / 2, inverseMercatorY((cell.northMercator + cell.southMercator) / 2), index), cell);
  }
});
test('representatives keep real canonical coordinates and the original country/prefecture ownership', () => {
  const countries = Buffer.from(source.countryIndices, 'base64'), prefectures = Buffer.from(source.prefectureIndices, 'base64');
  const offsets = []; let total = 0;
  for (const band of DEFAULT_GRID.bands) { offsets.push(total); total += band.longitudeCount; }
  for (const display of index.cells) {
    const cell = display.cell, offset = offsets[cell.band] + cell.column;
    assert.equal(countries.readUInt16LE(offset * 2), display.countryIndex);
    assert.equal(prefectures[offset], display.prefectureIndex);
    assert.equal(lookupCell(display.center.longitude, display.center.latitude).id, cell.id);
    assert.equal(lookupMapCell(display.center.longitude, display.center.latitude, index), display);
    assert.equal(lookupMapCell(display.center.longitude + 360, display.center.latitude, index), display);
    assert.equal(lookupMapCell(display.center.longitude - 360, display.center.latitude, index), display);
  }
});
test('sea tiles, invalid input and coordinates outside Mercator are not selectable', () => {
  let key = 0; while (index.byTile.has(key)) key++;
  const row = Math.floor(key / index.resolution), column = key % index.resolution;
  assert.equal(lookupMapCell(-180 + (column + .5) / index.resolution * 360, inverseMercatorY(Math.PI - (row + .5) / index.resolution * Math.PI * 2), index), null);
  assert.equal(lookupMapCell(0, 89, index), null); assert.equal(lookupMapCell(NaN, 0, index), null);
});
test('generation is deterministic and refuses resolutions that swallow a prefecture', () => {
  const rebuilt = buildMapCells(source);
  assert.equal(rebuilt.checksum, data.checksum); assert.deepEqual(rebuilt.cells, data.cells);
  assert.throws(() => buildMapCells(source, { resolutions: [320] }), /preserve every country and prefecture/);
});
test('invalid geometry, incomplete data and corrupt records fail closed', () => {
  assert.throws(() => createMapCellIndex({ ...data, geometryVersion: 'other' }), /geometry/);
  assert.throws(() => createMapCellIndex({ ...data, projection: 'orthographic' }), /geometry/);
  assert.throws(() => createMapCellIndex({ ...data, cellCount: data.cellCount - 1 }), /count/);
  const damaged = structuredClone(data); damaged.cells[0][1]++;
  assert.throws(() => createMapCellIndex(damaged), /checksum/);
  assert.throws(() => buildMapCells({ ...source, cellCount: source.cellCount - 1 }), /canonical/);
});

const fine = createFineMapCellIndex(source);
test('fine dot canvas keeps the configured square pixels per world axis without per-cell objects', () => {
  assert.equal(fine.resolution, FINE_MAP_RESOLUTION); assert.equal(fine.worldCellCount, FINE_MAP_RESOLUTION ** 2);
  assert.equal(fine.landMask.byteLength, FINE_MAP_RESOLUTION ** 2);
  assert.ok(fine.cellCount > 1_000_000 && fine.cellCount < fine.worldCellCount);
  assert.ok(fine.cells.length < 300); assert.ok(fine.recordCache.size <= 1024);
  assert.equal(new Set(fine.cells.map(cell => cell.countryId)).size, 177);
  assert.equal(new Set(fine.cells.map(cell => cell.prefectureId).filter(Boolean)).size, 47);
});
test('fine tile picking agrees with canonical ownership, uniform pixel bounds and world wrapping', () => {
  const step = Math.PI * 2 / fine.resolution;
  for (const display of fine.cells) {
    near((display.bounds.east - display.bounds.west) * Math.PI / 180, step);
    near(display.northMercator - display.southMercator, step);
    const picked = lookupMapCell(display.center.longitude, display.center.latitude, fine);
    assert.equal(picked.displayCellId, display.displayCellId);
    assert.equal(lookupMapCell(display.center.longitude + 360, display.center.latitude, fine).displayCellId, display.displayCellId);
    assert.equal(picked.cell.id, lookupCell(picked.center.longitude, picked.center.latitude).id);
    assert.ok(picked.center.longitude > picked.bounds.west && picked.center.longitude < picked.bounds.east);
    assert.ok(picked.center.latitude > picked.bounds.south && picked.center.latitude < picked.bounds.north);
    const sourceOffset = fine.bandOffsets[picked.cell.band] + picked.cell.column;
    assert.equal(fine.countryIndices[sourceOffset], picked.countryIndex);
    assert.equal(fine.prefectureIndices[sourceOffset], picked.prefectureIndex);
    assert.equal(fine.landMask[picked.index - 1], 1);
  }
});
test('fine map lazy record cache stays bounded and sea is not selectable', () => {
  let seen = 0;
  for (let key = 0; key < fine.landMask.length && seen < 1500; key++) if (fine.landMask[key]) {
    const row = Math.floor(key / fine.resolution), column = key % fine.resolution;
    lookupMapCell(-180 + (column + .5) / fine.resolution * 360, inverseMercatorY(Math.PI - (row + .5) / fine.resolution * Math.PI * 2), fine); seen++;
  }
  assert.ok(fine.recordCache.size <= 1024);
  const key = fine.landMask.findIndex(value => value === 0), row = Math.floor(key / fine.resolution), column = key % fine.resolution;
  assert.equal(lookupMapCell(-180 + (column + .5) / fine.resolution * 360, inverseMercatorY(Math.PI - (row + .5) / fine.resolution * Math.PI * 2), fine), null);
  assert.equal(lookupMapCell(0, 89, fine), null);
});


test('land without a prefecture never uses the water placeholder as a place name', () => {
  assert.equal(source.prefectureLabels[0], '海');
  for (const map of [index, fine]) for (const record of map.cells) {
    assert.equal(record.countryLabel, source.countryLabels[record.countryIndex]);
    if (!record.prefectureId) assert.equal(record.prefectureLabel, null);
    else assert.equal(record.prefectureLabel, source.prefectureLabels[record.prefectureIndex]);
  }
});

test('overseas cities and wrapped coastal land retain explicit country names', () => {
  for (const [id, longitude, latitude] of [
    ['FRA', 2.3522, 48.8566], ['GBR', -.1276, 51.5074], ['USA', -74.006, 40.7128],
    ['KEN', 36.8219, -1.2921], ['BRA', -46.6333, -23.5505],
    ['KOR', 126.978, 37.5665]
  ]) {
    const record = lookupMapCell(longitude, latitude, fine);
    assert.equal(record?.countryId, id);
    assert.equal(record.countryLabel, source.countryLabels[source.countryIds.indexOf(id)]);
    assert.equal(record.prefectureId, null); assert.equal(record.prefectureLabel, null);
    assert.equal(record.mapRegionId, `country:${id}`);
    assert.equal(record.mapRegionKind, 'country');
    assert.equal(lookupMapCell(longitude + 360, latitude, fine).displayCellId, record.displayCellId);
  }
  let coastal = 0;
  for (let key=0; key<fine.landMask.length && coastal<64; key++) {
    if (!fine.landMask[key]) continue;
    const row=Math.floor(key/fine.resolution), column=key%fine.resolution;
    if (column===0 || column===fine.resolution-1 || fine.landMask[key-1] || fine.landMask[key+1]) continue;
    const latitude=inverseMercatorY(Math.PI-(row+.5)/fine.resolution*Math.PI*2);
    const land=lookupMapCell(-180+(column+.5)/fine.resolution*360,latitude,fine);
    if (land.countryId==='JPN') continue;
    assert.notEqual(land.countryId,'__water__'); assert.equal(land.prefectureLabel,null);
    assert.equal(lookupMapCell(-180+(column-.5)/fine.resolution*360,latitude,fine),null);
    assert.equal(lookupMapCell(-180+(column+1.5)/fine.resolution*360,latitude,fine),null);
    coastal++;
  }
  assert.ok(coastal>0,'check isolated foreign coastal pixels against sea on both sides');
  assert.equal(lookupMapCell(-150,0,fine),null,'central Pacific remains sea');
});

const prefectureData = JSON.parse(readFileSync(new URL('../../assets/maps/map-prefectures-v1.json', import.meta.url), 'utf8'));
const corrected = createFineMapCellIndex(source, { prefectureData });
const admin1Data = JSON.parse(readFileSync(new URL('../../assets/maps/map-admin1-v1.json', import.meta.url), 'utf8'));
function checksumAdmin1For(patch) {
  const rows = [patch.mapRegions, patch.rowRuns, patch.features, patch.countryCounts];
  if (patch.landAuthority !== undefined) rows.push(patch.landAuthority);
  const text = JSON.stringify([patch.resolution, rows]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
const worldwide = createFineMapCellIndex(source, { prefectureData, admin1Data });
test('GeoJSON fine mask preserves prefecture shapes and leaves disputed northern islands unassigned', () => {
  for (const [longitude, latitude, id] of [[139.6917,35.6895,'13'],[139.702,35.5308,'14'],[139.438,35.546,'13'],[141.3545,43.0618,'01'],[140.7288,41.7687,'01'],[139.4,34.75,'13'],[139.53,34.08,'13']]) {
    assert.equal(resolveMapLocation(longitude,latitude,corrected)?.prefectureId,id);
    assert.equal(resolveMapLocation(longitude+360,latitude,corrected)?.prefectureId,id);
  }
  for (const [longitude, latitude] of [[147.8775,44.9919],[146.753,43.796]]) {
    assert.equal(resolveMapLocation(longitude,latitude,corrected), null, 'disputed northern islands are not selected as Hokkaido');
    assert.equal(resolveMapLocation(longitude,latitude,worldwide), null, 'disputed northern islands are not assigned to either country');
    const display = lookupMapCell(longitude,latitude,worldwide);
    assert.ok(!display || display.unselectable, 'any displayed island pixels remain unassigned and cannot be selected');
    if (display) assert.equal(display.countryId, null, 'unassigned island pixels have no country label');
  }
  for (const [longitude, latitude, prefecture, label] of [
    [123.47,25.744,'47','Senkaku Islands'],
    [131.87,37.24,'32','Takeshima']
  ]) {
    assert.equal(resolveMapLocation(longitude, latitude, corrected), null, `${label} is outside selectable Japanese prefectures`);
    assert.equal(resolveMapLocation(longitude, latitude, worldwide), null, `${label} is not assigned to either country`);
    const display = lookupMapCell(longitude, latitude, worldwide);
    assert.ok(!display || display.unselectable, `${label} is removed or unselectable`);
    if (display) {
      assert.equal(display.countryId, null, `${label} has no country label`);
      assert.equal(display.prefectureId, null, `${label} has no prefecture label`);
      assert.ok(!worldwide.prefectureTiles.get(prefecture)?.includes(display.index - 1), `${label} is absent from its prefecture selection index`);
    }
  }
  assert.equal(resolveMapLocation(139.8,35.4,corrected), null);
  assert.equal(resolveMapLocation(-74.006,40.7128,corrected)?.countryId,'USA');
});
test('corrected fine grid carries a prefecture mask and per-prefecture tile index without changing posting cells', () => {
  assert.equal(corrected.prefectureMask.length, corrected.worldCellCount);
  assert.equal(corrected.prefectureTiles.get('13') instanceof Uint32Array,true);
  assert.equal(corrected.prefectureTiles.size,47);
  for (const [longitude,latitude] of [[139.6917,35.6895],[139.702,35.5308],[139.438,35.546],[141.3545,43.0618]]) { const got=resolveMapLocation(longitude,latitude,corrected); assert.equal(got.cell.id,lookupCell(longitude,latitude).id); }
});
test('prefecture patch decoder rejects unsupported metadata, corrupt checksums, and invalid runs', () => {
  const checksumFor = (patch) => {
    const rows = [patch.prefectureIds, patch.prefectureLabels, patch.rowRuns, patch.features, patch.bounds, patch.unselectableFeatures];
    const text = JSON.stringify([patch.resolution, rows]);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  };
  const withRun = (mutate) => {
    const candidate = structuredClone(prefectureData);
    mutate(candidate.rowRuns[0]);
    candidate.checksum = checksumFor(candidate);
    return candidate;
  };
  assert.throws(() => createFineMapCellIndex(source, { prefectureData: { ...prefectureData, version: 'other' } }), /Unsupported prefecture mask/);
  assert.throws(() => createFineMapCellIndex(source, { prefectureData: { ...prefectureData, checksum: 'invalid' } }), /checksum/);
  assert.throws(() => createFineMapCellIndex(source, { prefectureData: withRun((run) => { run[0] = prefectureData.resolution; }) }), /Invalid or overlapping prefecture mask run/);
  assert.throws(() => createFineMapCellIndex(source, { prefectureData: withRun((run) => { run[2] = 0; }) }), /Invalid or overlapping prefecture mask run/);
});
test('world admin1 resolver returns explicit regions while preserving Japan and canonical posting cells', () => {
  const places = [
    ['USA', -122.4194, 37.7749, 'admin1:USA:US-CA'],
    ['USA', -118.2437, 34.0522, 'admin1:USA:US-CA'],
    ['USA', -115.1398, 36.1699, 'admin1:USA:US-NV'],
    ['USA', -74.006, 40.7128, 'admin1:USA:US-NY'],
    ['CAN', -79.3832, 43.6532, 'admin1:CAN:CA-ON'],
    ['AUS', 151.2093, -33.8688, 'admin1:AUS:NE-AUS-2654'],
    ['CHN', 116.4074, 39.9042, 'admin1:CHN:CN-BJ'],
    ['FRA', 2.3522, 48.8566, 'admin1:FRA:FR-75'],
    ['DEU', 11.5761, 48.1372, 'admin1:DEU:DE-BY'],
    ['BRA', -46.6333, -23.5505, 'admin1:BRA:BR-SP'],
    ['IND', 77.209, 28.6139, 'admin1:IND:IN-DL'],
    ['KOR', 126.978, 37.5665, 'admin1:KOR:KR-11']
  ];
  for (const [countryId, longitude, latitude, regionId] of places) {
    const location = resolveMapLocation(longitude, latitude, worldwide);
    assert.equal(location?.countryId, countryId, `${countryId} country at ${longitude},${latitude}`);
    assert.equal(location?.mapRegionId, regionId, `${countryId} admin1 at ${longitude},${latitude}`);
    assert.equal(location?.mapRegionKind, 'admin1');
    assert.equal(location?.cell.id, lookupCell(longitude, latitude).id, `${countryId} canonical posting cell`);
    assert.equal(resolveMapLocation(longitude + 360, latitude, worldwide)?.mapRegionId, regionId);
  }
  for (const [longitude, latitude, prefectureId] of [[139.6917,35.6895,'13'],[139.702,35.5308,'14'],[141.3545,43.0618,'01']]) {
    const location = resolveMapLocation(longitude, latitude, worldwide);
    assert.equal(location?.mapRegionId, `prefecture:${prefectureId}`);
    assert.equal(location?.mapRegionKind, 'prefecture');
    assert.equal(location?.cell.id, lookupCell(longitude, latitude).id);
  }
  const noPaintedTiles = { ...worldwide, landMask: new Uint8Array(worldwide.worldCellCount), recordCache: new Map() };
  assert.equal(resolveMapLocation(139.702, 35.5308, noPaintedTiles)?.mapRegionId, 'prefecture:14', 'explicit Japan membership survives a missing display tile');
  assert.equal(resolveMapLocation(-122.4194, 37.7749, noPaintedTiles)?.mapRegionId, 'admin1:USA:US-CA', 'explicit foreign membership survives a missing display tile');
  assert.equal(resolveMapLocation(0, 0, noPaintedTiles), null, 'no geometry match does not invent an owner over sea');
  assert.ok(worldwide.mapRegionMask instanceof Uint16Array);
  assert.equal(worldwide.mapRegionMask.length, worldwide.worldCellCount);
  assert.ok(worldwide.mapRegions.length > 256);
  assert.ok([...worldwide.mapRegionTiles.values()].every((tiles) => tiles instanceof Uint32Array));
  assert.ok(worldwide.mapRegions.some((region) => region?.kind === 'country'), 'countries/coverage gaps have explicit country fallback regions');
  assert.equal(resolveMapLocation(0, 0, worldwide), null, 'open ocean receives no region');
});
test('admin1 patch decoder fails closed for bad version, checksum and duplicate region IDs', () => {
  assert.throws(() => createFineMapCellIndex(source, { prefectureData, admin1Data: { ...admin1Data, version: 'bad' } }), /Unsupported admin1 mask/);
  assert.throws(() => createFineMapCellIndex(source, { prefectureData, admin1Data: { ...admin1Data, checksum: 'bad' } }), /checksum/);
  const duplicate = structuredClone(admin1Data);
  duplicate.mapRegions[49].id = duplicate.mapRegions[48].id;
  duplicate.checksum = checksumAdmin1For(duplicate);
  assert.throws(() => createFineMapCellIndex(source, { prefectureData, admin1Data: duplicate }), /Duplicate admin1 region ID/);
});

test('admin1 land authority is checksum-protected and unknown authority fails closed', () => {
  assert.throws(() => createFineMapCellIndex(source, { prefectureData, admin1Data: { ...admin1Data, landAuthority: 'unknown' } }), /Unsupported admin1 land authority/);
  const missing = { ...admin1Data }; delete missing.landAuthority;
  assert.throws(() => createFineMapCellIndex(source, { prefectureData, admin1Data: missing }), /checksum/);
});

test('legacy admin1 data without land authority keeps the old source mask and country fallback', () => {
  const legacy = { ...admin1Data, landAuthority: undefined, mapRegions: admin1Data.mapRegions.slice(0,48), regionCount: 47, rowRuns: [], features: [], countryCounts: source.countryIds.slice(1).map(countryId => ({ countryId, admin1FeatureCount: 0, fallback: true, zeroTileAdmin1Count: 0 })) };
  legacy.checksum = checksumAdmin1For(legacy);
  const result = createFineMapCellIndex(source, { prefectureData, admin1Data: legacy });
  assert.equal(result.admin1Data.landAuthority, undefined);
  assert.deepEqual(result.landMask, corrected.landMask);
  assert.deepEqual(result.prefectureMask, corrected.prefectureMask);
  assert.deepEqual(result.countryIndices, corrected.countryIndices);
  assert.equal(lookupMapCell(-122.4194,37.7749,result).mapRegionId,'country:USA');
  assert.equal(lookupMapCell(151.2093,-33.8688,result),null,'legacy source coast remains compatible');
});

test('geometry-derived world mask preserves Japan and canonical IDs while correcting foreign country ownership', () => {
  assert.equal(worldwide.admin1Data.landAuthority,'admin1-geometries');
  assert.equal(worldwide.resolution,2048);
  assert.deepEqual(worldwide.countryIndices,corrected.countryIndices,'stored canonical country raster is unchanged');
  assert.deepEqual(worldwide.prefectureMask,corrected.prefectureMask,'every Japanese prefecture pixel is unchanged');
  assert.equal(new Set(worldwide.cells.map(cell => cell.countryId).filter(Boolean)).size,177);
  assert.equal([...worldwide.prefectureTiles.values()].reduce((sum,tiles)=>sum+tiles.length,0),1549, 'disputed northern islands are excluded from selectable prefecture tiles');
  for (const [longitude,latitude,id,country] of [
    [151.2093,-33.8688,'admin1:AUS:NE-AUS-2654','AUS'],
    [-122.3321,47.6062,'admin1:USA:US-WA','USA'],
    [-69.345703125,47.338822694822,'admin1:USA:US-ME','USA'],
    [-95.009765625,49.32512199104002,'admin1:USA:US-MN','USA'],
    [2.548828125,51.01375465718819,'admin1:FRA:FR-59','FRA']
  ]) {
    const displayed=lookupMapCell(longitude,latitude,worldwide), exact=resolveMapLocation(longitude,latitude,worldwide);
    assert.equal(displayed?.mapRegionId,id);
    assert.equal(displayed?.countryId,country);
    assert.equal(displayed.countryIndex,source.countryIds.indexOf(country));
    assert.equal(displayed.cell.id,lookupCell(displayed.center.longitude,displayed.center.latitude).id);
    assert.equal(exact?.mapRegionId,id);
    assert.equal(exact.cell.id,lookupCell(longitude,latitude).id);
    assert.equal(exact.prefectureId,null);assert.equal(exact.prefectureLabel,null);assert.equal(exact.prefectureIndex,0);
    assert.equal(lookupMapCell(longitude+360,latitude,worldwide)?.displayCellId,displayed.displayCellId);
  }
  const border=lookupMapCell(-69.345703125,47.338822694822,worldwide);
  const offset=worldwide.bandOffsets[border.cell.band]+border.cell.column;
  assert.equal(source.countryIds[worldwide.countryIndices[offset]],'CAN','old canonical country hint is retained for saved data');
  assert.equal(border.countryId,'USA','display country uses the detailed admin geometry');
  assert.equal(lookupMapCell(151.2093,-33.8688,corrected),null,'old coast raster missed Sydney');
  assert.equal(lookupMapCell(-122.3321,47.6062,corrected),null,'old coast raster missed Seattle');
});

test('geometry authority removes coarse coastal land while preserving exact membership of thin land', () => {
  const longitude=-73.916015625,latitude=40.51379915504414;
  assert.equal(lookupMapCell(longitude,latitude,corrected)?.countryId,'USA','legacy coarse raster marked this ocean pixel as land');
  assert.equal(lookupMapCell(longitude,latitude,worldwide),null);
  assert.equal(resolveMapLocation(longitude,latitude,worldwide),null);
  assert.equal(lookupMapCell(-73.85,40.58,worldwide),null,'majority-water pixel is not selectable');
  assert.equal(resolveMapLocation(-73.85,40.58,worldwide)?.mapRegionId,'admin1:USA:US-NY','a real thin coastal location keeps its precise administrative membership for content grouping');
});
