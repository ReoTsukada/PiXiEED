import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = new URL('../PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js', import.meta.url);
const source = fs.readFileSync(path, 'utf8');

assert.match(
  source,
  /Number\(options\?\.trustedAutosaveSchemaVersion\) === 2\s*&& parsedDocument\?\.storageAdapterId === 'pixieedraw-v1-json'/,
  'trusted IndexedDB V2 payloads must discard the false V1 JSON adapter label'
);
assert.match(
  source,
  /parsedDocument\.storageAdapterId = '';\s*}\s*if \(!await confirmLegacyV2MigrationIfNeeded/,
  'legacy structure checks must still run after correcting the adapter label'
);

console.log('PiXiEEDraw DEV trusted V2 classification regression checks passed.');
