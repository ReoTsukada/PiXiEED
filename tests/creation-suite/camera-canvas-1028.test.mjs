import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ANIMATION_MAX_DIMENSION } from '../../js/creation/animation-core.mjs?rev=20261113-canvas1028-shared-2';

// Contract check for the camera UI's shared dimension limit. Behavioral UI
// coverage remains in camera-canvas-settings.test.mjs.
test('camera canvas UI follows the shared 1028px limit', async () => {
  const source = await readFile(new URL('../../js/creation/camera-canvas-settings.mjs', import.meta.url), 'utf8');
  assert.equal(ANIMATION_MAX_DIMENSION, 1028);
  assert.match(source, /value\s*<=\s*ANIMATION_MAX_DIMENSION/);
  assert.match(source, /String\(ANIMATION_MAX_DIMENSION\)/);
  assert.match(source, /valid\s*=\s*value\s*=>\s*Number\.isInteger\(value\).*value\s*<=\s*ANIMATION_MAX_DIMENSION/);
  assert.equal(Number.isInteger(1028) && 1028 >= 1 && 1028 <= ANIMATION_MAX_DIMENSION, true);
  assert.equal(Number.isInteger(1029) && 1029 >= 1 && 1029 <= ANIMATION_MAX_DIMENSION, false);
  assert.equal(Number.isInteger(16) && 16 >= 1 && 16 <= ANIMATION_MAX_DIMENSION, true);
  assert.equal(Number.isInteger(256) && 256 >= 1 && 256 <= ANIMATION_MAX_DIMENSION, true);
});
