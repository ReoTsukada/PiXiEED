import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const market = read('market/market.js');
const pixfind = read('pixfind/app.js');
const drawRecent = read('pixiedraw/assets/js/modules/recent-project-workflow-utils.js');
const drawStartup = read('pixiedraw/assets/js/modules/startup-workflow-utils.js');

assert.match(market, /\(index \+ 1\) % 8 !== 0/);
assert.doesNotMatch(market, /children\.splice\(8/);
assert.match(pixfind, /\(idx \+ 1\) % 4 === 0/);
assert.doesNotMatch(pixfind, /idx === 7/);
// PiXiEEDraw now renders project cards only in the startup workspace. The
// retired duplicate recent-project renderer intentionally has no ad cadence.
assert.doesNotMatch(drawRecent, /\(index \+ 1\) % 8 === 0/);
assert.doesNotMatch(drawRecent, /index === 3/);
assert.match(drawStartup, /\(visibleIndex \+ 1\) % 8 === 0/);
assert.doesNotMatch(drawStartup, /visibleIndex === 3/);
assert.doesNotMatch(drawStartup, /!startupWorkspaceSearchQuery && \(visibleIndex \+ 1\) % 8/);

console.log('Card feed ad interval guards passed.');
