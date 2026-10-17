import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_NAVIGATION_KEY, readMapNavigationState, writeMapNavigationState, sanitizeMapNavigationState } from '../../js/globe/map-navigation-state.mjs';

test('tab discovery state retains only camera, filter, regional scope and list position', () => {
  let raw;
  const storage = { setItem(key, value) { assert.equal(key, MAP_NAVIGATION_KEY); raw = value; }, getItem() { return raw; } };
  writeMapNavigationState(storage, { layer: 'events', view: { centerLongitude: 139.7, centerLatitude: 35, zoom: 2, private: 'discard' }, events: { period: 'past', open: true, limit: 40, scroll: 1832, scope: { displayCell: { prefectureId: '13', mapRegionId: 'prefecture:13', mapRegionLabel: '東京都', authorId: 'discard', artwork: 'discard' } } }, project: 'discard' });
  assert.deepEqual(readMapNavigationState(storage), { layer: 'events', view: { centerLongitude: 139.7, centerLatitude: 35, zoom: 2 }, events: { period: 'past', open: true, limit: 40, scroll: 1832, scope: { prefectureId: '13', mapRegionId: 'prefecture:13', mapRegionLabel: '東京都' } } });
  assert.doesNotMatch(raw, /discard|author|artwork|private|project/);
});

test('corrupt, missing, denied storage and invalid numbers leave discovery usable', () => {
  for (const raw of ['{', 'null', '[]', 'false']) assert.equal(readMapNavigationState({getItem: () => raw}), null);
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(readMapNavigationState(denied), null);
  assert.doesNotThrow(() => writeMapNavigationState(denied, {layer: 'events'}));
  assert.deepEqual(sanitizeMapNavigationState({layer: 'bad', view: {centerLongitude: Infinity, centerLatitude: 35, zoom: 1}, events: {period: 'bad', scroll: -1, limit: 1e9, open: 'true', scope: {private: 'discard'}}}), {layer:'posts', events:{period:'future',open:false,limit:20,scroll:0,scope:null}});
});
