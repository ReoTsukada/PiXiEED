import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createMembershipIndex,
  createSharedBoundaryTopology,
  findExplicitMembership,
  normalizeMembershipFeatures,
  pointInGeometry
} from '../../js/globe/topology.mjs';

const fixturePath = fileURLToPath(new URL('./fixtures/membership.geojson', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const membership = createMembershipIndex(fixture, { idProperty: 'regionId' });

test('membership uses explicit feature properties and never nearest inference', () => {
  assert.deepEqual(membership.features.map((feature) => feature.id), [
    'dateline-zone',
    'hole-zone',
    'island-chain',
    'japan',
    'neighbor-east'
  ]);
  assert.equal(findExplicitMembership(membership, 135, 35).id, 'japan');
  assert.equal(findExplicitMembership(membership, 125, 35), null);
  assert.throws(
    () => createMembershipIndex({ type: 'Feature', id: 'not-a-property', properties: {}, geometry: fixture.features[0].geometry }),
    /idProperty/
  );
});

test('shared feature boundary has a deterministic inclusive winner', () => {
  const result = findExplicitMembership(membership, 140, 35);
  assert.deepEqual(result, {
    id: 'japan',
    boundary: true,
    sourceIndex: 0,
    properties: { regionId: 'japan' }
  });
  assert.equal(findExplicitMembership(membership, 140 + 1e-7, 35).id, 'neighbor-east');
});

test('polygon holes exclude their interior and hole boundary deterministically', () => {
  const hole = membership.features.find((feature) => feature.id === 'hole-zone');
  assert.equal(pointInGeometry(hole.geometry, -5, 0), true);
  assert.equal(pointInGeometry(hole.geometry, 0, 0), false);
  assert.equal(pointInGeometry(hole.geometry, 2, 0), false);
  assert.equal(findExplicitMembership(membership, 0, 0), null);
});

test('MultiPolygon membership matches either explicit polygon component', () => {
  assert.equal(findExplicitMembership(membership, 32, 2).id, 'island-chain');
  assert.equal(findExplicitMembership(membership, 42, 12).id, 'island-chain');
  assert.equal(findExplicitMembership(membership, 37, 7), null);
});

test('dateline-crossing polygon uses the short seam-aware longitude interval', () => {
  assert.equal(findExplicitMembership(membership, 179, 0).id, 'dateline-zone');
  assert.equal(findExplicitMembership(membership, -179, 0).id, 'dateline-zone');
  assert.equal(findExplicitMembership(membership, 180, 0).id, 'dateline-zone');
  assert.equal(findExplicitMembership(membership, 0, 0), null);
});

test('normalization accepts Polygon and MultiPolygon while preserving explicit properties', () => {
  const records = normalizeMembershipFeatures(fixture.features.slice(0, 2), { idProperty: 'regionId' });
  assert.equal(records.length, 2);
  assert.equal(records[0].geometry.type, 'Polygon');
  assert.equal(records[1].properties.regionId, 'neighbor-east');
  assert.ok(Object.isFrozen(records));
});

test('shared breakpoints are one stable union and both sides reference the same points', () => {
  const topology = createSharedBoundaryTopology({
    boundaryId: 'band-10-11',
    latitude: 35,
    northBand: { band: 10, longitudeCount: 3 },
    southBand: { band: 11, longitudeCount: 4 }
  });
  assert.deepEqual(topology.breakpoints.map((point) => point.longitude), [-180, -90, -60, 0, 60, 90, 180]);
  assert.equal(topology.north.columns[0].breakpoints[1], topology.breakpoints[1]);
  assert.equal(topology.south.columns[0].breakpoints[1], topology.breakpoints[1]);
  assert.equal(topology.north.columns[0].breakpoints.at(-1), topology.breakpoints[2]);
  assert.equal(topology.south.columns[1].breakpoints[0], topology.breakpoints[1]);
  assert.equal(topology.breakpoints[0].longitude, -180);
  assert.equal(topology.breakpoints.at(-1).longitude, 180);
  assert.deepEqual(
    topology.breakpoints.map((point) => point.id),
    createSharedBoundaryTopology({
      boundaryId: 'band-10-11',
      latitude: 35,
      northBand: { band: 10, longitudeCount: 3 },
      southBand: { band: 11, longitudeCount: 4 }
    }).breakpoints.map((point) => point.id)
  );
});

test('T-junction side segments cover the same union samples without duplicate floats', () => {
  const topology = createSharedBoundaryTopology({
    boundaryId: 't-junction',
    latitude: 0,
    northBand: 12,
    northLongitudeCount: 2,
    southBand: 13,
    southLongitudeCount: 3
  });
  assert.deepEqual(topology.breakpoints.map((point) => point.longitude), [-180, -60, 0, 60, 180]);
  assert.deepEqual(topology.north.columns.map((column) => column.breakpoints.map((point) => point.longitude)), [
    [-180, -60, 0],
    [0, 60, 180]
  ]);
  assert.deepEqual(topology.south.columns.map((column) => column.breakpoints.map((point) => point.longitude)), [
    [-180, -60],
    [-60, 0, 60],
    [60, 180]
  ]);
  assert.equal(new Set(topology.breakpoints.map((point) => point.longitude)).size, topology.breakpoints.length);
});

test('shared topology remains finite and symmetric for polar one-column bands', () => {
  const topology = createSharedBoundaryTopology({
    boundaryId: 'north-pole-cap',
    latitude: 90,
    northBand: { band: 0, longitudeCount: 1 },
    southBand: { band: 1, longitudeCount: 3 }
  });
  assert.deepEqual(topology.breakpoints.map((point) => point.longitude), [-180, -60, 60, 180]);
  assert.equal(topology.north.columns.length, 1);
  assert.deepEqual(topology.north.columns[0].breakpoints.map((point) => point.longitude), [-180, -60, 60, 180]);
  assert.equal(topology.south.columns[0].breakpoints[1], topology.breakpoints[1]);
  assert.ok(topology.breakpoints.every((point) => Number.isFinite(point.longitude) && Number.isFinite(point.latitude)));
});
