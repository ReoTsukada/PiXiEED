import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapRegionContent } from '../../js/globe/map-region-content.mjs';
const index = { resolution: 4, prefectureIds: ['__none__', '01', '13', '14'], prefectureTiles: new Map([['01', Uint32Array.from([1, 2, 5])], ['13', Uint32Array.from([6, 7])], ['14', Uint32Array.from([10])]]) };
const locate = longitude => longitude < 0 ? null : longitude < 2 ? { countryId: 'JPN', prefectureId: '01', row: 0, column: longitude + 1 } : { countryId: 'USA', row: 3, column: 1 };
test('detailed Hokkaido locations share one prefecture density, including all its pixels', () => {
  const { mask, stats } = buildMapRegionContent(index, { posts: [{longitude: 0, latitude: 43}, {longitude: 1, latitude: 42}], events: [{position: {longitude: 0, latitude: 43}, mapPeriod: 'upcoming'}, {position: {longitude: 1, latitude: 42}, mapPeriod: 'active'}] }, locate);
  for (const key of [1, 2, 5]) assert.equal(mask[key], 1 | (2 << 1) | (2 << 6));
  assert.equal(stats.occupiedCells, 3); assert.equal(mask[6], 0); assert.equal(mask[10], 0);
});
test('known prefectures override display-point placement and separate future, past and pending', () => {
  const { mask, stats } = buildMapRegionContent(index, {events: [{prefectureId: '13', mapPeriod: 'upcoming', position: {longitude: 0, latitude: 43}}, {prefectureId: '13', mapPeriod: 'past'}, {prefectureId: '14', mapPeriod: 'watch'}]}, locate);
  for (const key of [6, 7]) assert.equal(mask[key], (1 << 1) | (1 << 4) | (2 << 6));
  assert.equal(mask[1], 0); assert.equal(mask[10], 0); assert.equal(stats.droppedEventPoints, 1);
});
test('foreign pixels remain separate and sea or invalid points cannot paint a prefecture', () => {
  const { mask, stats } = buildMapRegionContent(index, {posts: [{longitude: 5, latitude: 0}, {longitude: -1, latitude: 0}, {longitude: NaN, latitude: 0}], events: [{countryId: 'USA', prefectureId: '13', position: {longitude: 5, latitude: 0}, mapPeriod: 'past'}]}, locate);
  assert.equal(mask[13], 1 | (1 << 4) | (1 << 6)); assert.equal(mask[6], 0); assert.equal(mask[7], 0); assert.equal(stats.droppedPostPoints, 2);
});

test('overseas state content shares all of its pixels and remains separate from its neighboring state', () => {
  const regions = {resolution:4,mapRegionTiles:new Map([['admin1:USA:US-CA',Uint32Array.from([1,2,3])],['admin1:USA:US-NV',Uint32Array.from([5,6])],['country:ISL',Uint32Array.from([9,10])]])};
  const resolve = longitude => longitude < 0 ? null : {mapRegionId: longitude < 2 ? 'admin1:USA:US-CA' : longitude < 3 ? 'admin1:USA:US-NV' : 'country:ISL'};
  const {mask,stats}=buildMapRegionContent(regions,{posts:[{longitude:0,latitude:35},{longitude:1,latitude:38}],events:[{mapRegionId:'admin1:USA:US-CA',mapPeriod:'upcoming'},{mapRegionId:'admin1:USA:US-NV',mapPeriod:'past'},{position:{longitude:4,latitude:65},mapPeriod:'active'}]},resolve);
  for (const key of [1,2,3]) assert.equal(mask[key],1 | (1 << 1) | (1 << 6));
  for (const key of [5,6]) assert.equal(mask[key],(1 << 4) | (1 << 6));
  for (const key of [9,10]) assert.equal(mask[key],(1 << 1) | (1 << 6));
  assert.equal(stats.occupiedCells,7);
});

test('a known administrative region without display pixels never paints its neighboring tile', () => {
  const regions = {resolution:4,mapRegionTiles:new Map([['admin1:FRA:FR-75',new Uint32Array()],['admin1:FRA:FR-93',Uint32Array.from([5])]])};
  const resolve=()=>({mapRegionId:'admin1:FRA:FR-75',row:1,column:1});
  const {mask,stats}=buildMapRegionContent(regions,{posts:[{longitude:2.35,latitude:48.85}],events:[{mapRegionId:'admin1:FRA:FR-75',mapPeriod:'upcoming',position:{longitude:2.35,latitude:48.85}}]},resolve);
  assert.equal(mask[5],0);assert.equal(stats.occupiedCells,0);assert.equal(stats.droppedPostPoints,1);assert.equal(stats.droppedEventPoints,1);
});


test('empty startup data does not resolve locations or mark occupied pixels', () => {
  const { mask, stats } = buildMapRegionContent(index, {}, () => { throw new Error('Unexpected location lookup'); });
  assert.equal(stats.occupiedCells, 0);
  assert.equal(mask.some(Boolean), false);
});
test('a point overlapped by a region is counted once and retains region precedence', () => {
  const regions = { resolution: 4, mapRegionTiles: new Map([['country:ISL', Uint32Array.from([1, 2])]]) };
  const { mask, stats } = buildMapRegionContent(regions, {
    posts: [{ longitude: 0, latitude: 0 }],
    events: [{ mapRegionId: 'country:ISL', mapPeriod: 'past' }]
  }, () => ({ row: 0, column: 1 }));
  assert.equal(stats.occupiedCells, 2);
  assert.equal(mask[1], (1 << 4) | (1 << 6));
  assert.equal(mask[2], mask[1]);
});

test('country-only events fill every tile in their country including Japan', () => {
  const countries = { resolution: 4, countryTiles: new Map([['JPN', Uint32Array.from([1, 2, 5])], ['TWN', Uint32Array.from([7, 8])]]) };
  const { mask, stats } = buildMapRegionContent(countries, { events: [{ countryId: 'JPN', countryLevel: true, mapPeriod: 'upcoming' }, { countryId: 'TWN', countryLevel: true, mapPeriod: 'past' }] });
  for (const key of [1, 2, 5]) assert.equal(mask[key], (1 << 1) | (1 << 6));
  for (const key of [7, 8]) assert.equal(mask[key], (1 << 4) | (1 << 6));
  assert.equal(stats.occupiedCells, 5);
  assert.equal(stats.droppedEventPoints, 0);
});
