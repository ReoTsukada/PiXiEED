import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(relative, 'utf8');
const extract = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Could not extract ${start}`);
  return source.slice(startIndex, endIndex);
};

const productionApp = read('pixiedraw/assets/js/app.js');
const developmentApp = read('PiXiEEDrawDEV/assets/js/app.js');
assert.equal(
  extract(productionApp, '  async function writeAutosaveV2Primary(', '  const preUpdateCheckpointUtilsModule'),
  extract(developmentApp, '  async function writeAutosaveV2Primary(', '  const preUpdateCheckpointUtilsModule'),
  'DEV V2 primary save must stay identical to production.'
);
assert.equal(
  extract(productionApp, '  async function init()', '  // File commands depend on persistence and input helpers declared above.'),
  extract(developmentApp, '  async function init()', '  // File commands depend on persistence and input helpers declared above.')
    .replaceAll('[pixiedraw-dev:', '[pixiedraw:'),
  'DEV startup must stay identical to production outside the separately managed shared/tab work.'
);

const productionIndexedDb = read('pixiedraw/assets/js/modules/autosave-schema-v2-indexeddb-utils.js');
const developmentIndexedDb = read('PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-indexeddb-utils.js')
  .replace('[pixiedraw-dev:v2-read]', '[pixiedraw:v2-read]');
assert.equal(
  productionIndexedDb,
  developmentIndexedDb,
  'DEV V2 IndexedDB restore must stay identical to production except its log namespace.'
);

console.log('PiXiEEDrawDEV V2 production-parity checks passed.');
