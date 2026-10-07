#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { splitMapAdmin1Asset, splitMapPrefectureAsset } from '../js/globe/map-asset-format.mjs';

const root = new URL('../', import.meta.url);
const admin1 = JSON.parse(readFileSync(new URL('assets/maps/map-admin1-v1.json', root), 'utf8'));
const prefectures = JSON.parse(readFileSync(new URL('assets/maps/map-prefectures-v1.json', root), 'utf8'));
const admin1Split = splitMapAdmin1Asset(admin1);
const prefectureSplit = splitMapPrefectureAsset(prefectures);
const outputs = [
  ['assets/maps/map-admin1-mask-v2.json', admin1Split.mask],
  ['assets/maps/map-admin1-geometry-v2.json', admin1Split.geometry],
  ['assets/maps/map-prefectures-mask-v2.json', prefectureSplit.mask],
  ['assets/maps/map-prefectures-geometry-v2.json', prefectureSplit.geometry],
];
for (const [path, value] of outputs) writeFileSync(new URL(path, root), `${JSON.stringify(value)}\n`);
console.log(JSON.stringify(outputs.map(([path, value]) => ({ path, bytes: Buffer.byteLength(JSON.stringify(value)), checksum: value.checksum })), null, 2));
