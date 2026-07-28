import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'pixfind/app.js'), 'utf8');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = app.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === '{') depth += 1;
    if (app[index] === '}') depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`${name} body was not closed`);
}

const normalizeRegions = new Function('clamp', `${extractFunction('normalizePuzzleDifferenceRegions')}; return normalizePuzzleDifferenceRegions;`)(clamp);

const sixPublishedRegions = Array.from({ length: 6 }, (_, index) => ({
  minX: index * 10,
  maxX: index * 10 + 2,
  minY: 5,
  maxY: 7,
  count: 9,
}));
assert.equal(normalizeRegions(sixPublishedRegions, 64, 64).length, 6, 'all six creator-approved difference regions must survive loading');

assert.match(app, /payload\.regions = publishTask\.regions/);
assert.match(app, /payload\.regions = regions/);
assert.match(app, /const usesPublishedSpotDifferenceGrid = mode === GAME_MODE_SPOT_DIFFERENCE/);
assert.match(app, /if \(usesPublishedSpotDifferenceGrid\) \{[\s\S]*normalizedOriginal = \{ image: rawOriginal \}/);
assert.match(app, /publishedRegions\.length[\s\S]*\? \{ regions: publishedRegions/);
assert.match(app, /function createShareUrl\(puzzle\) \{/);
assert.match(app, /return getPixfindShareHtmlUrl\(puzzle\.id\);/);
assert.match(app, /function waitForPixfindOgpPage\(pageUrl, timeoutMs = 120000\)/);
assert.match(app, /computeDifferenceRegions\(originalImage, challengeImage, \{[\s\S]*mergeDistance: resolveMergeDistanceForSize\(CREATOR_MERGE_DISTANCE/);

console.log('PiXFiND published-region contract checks passed.');
