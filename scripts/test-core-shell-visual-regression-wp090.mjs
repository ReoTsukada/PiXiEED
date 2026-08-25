import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseDir = path.join(root, 'docs/visual-regression/wp-090/core-shell');
const manifest = JSON.parse(await readFile(path.join(baseDir, 'manifest.json'), 'utf8'));
const hashes = {};
for (const viewport of manifest.viewports) {
  for (const theme of manifest.themes) {
    for (const state of manifest.states) {
      const relative = `docs/visual-regression/wp-090/core-shell/${viewport.id}/${theme}/${state}.png`;
      const bytes = await readFile(path.join(root, relative));
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative} PNG signature`);
      assert.ok(bytes.length > 1000, `${relative} must contain a non-empty baseline`);
      hashes[relative] = createHash('sha256').update(bytes).digest('hex');
    }
  }
}
assert.equal(Object.keys(hashes).length, 64);
assert.equal(manifest.deterministic.dynamicClock, false);
assert.equal(manifest.deterministic.randomIds, false);
assert.equal(manifest.semanticInteractionTestsRemainRequired, true);
assert.equal(manifest.reference.wp080InitialSourceBytes, 62052);
console.log(`WP-090 visual regression baseline passed: ${Object.keys(hashes).length} PNG baselines registered; manifest=${manifest.id}; hashes=${Object.keys(hashes).length}`);
