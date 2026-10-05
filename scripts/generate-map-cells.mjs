#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { buildMapCells, createMapCellIndex } from '../js/globe/map-cells.mjs';
const source = JSON.parse(readFileSync(new URL('../assets/maps/globe-land-mask-v1.json', import.meta.url), 'utf8'));
const data = buildMapCells(source);
const index = createMapCellIndex(data);
writeFileSync(new URL('../assets/maps/map-cells-v1.json', import.meta.url), JSON.stringify(data) + '\n');
console.log(JSON.stringify({ resolution: data.resolution, worldCellCount: data.worldCellCount, cellCount: data.cellCount, sourceCellCount: data.sourceCellCount, sourceLandCellCount: data.sourceLandCellCount, countries: new Set(index.cells.map(cell => cell.countryId)).size, prefectures: new Set(index.cells.map(cell => cell.prefectureId).filter(Boolean)).size, bytes: Buffer.byteLength(JSON.stringify(data)), checksum: data.checksum }));
