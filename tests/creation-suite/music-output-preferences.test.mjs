import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { DEFAULT_MUSIC_OUTPUT_PREFERENCES, readMusicOutputPreferences,
  writeMusicOutputPreferences } from '../../js/creation/music-output-preferences.mjs';

test('music export preferences persist per project and preserve other manifest metadata', () => {
  const original = createPxdProject();
  const first = { ...original, manifest: { ...original.manifest,
    futureManifestField: { retained: true },
    creationProject: { schemaVersion: 1, imageRole: 'main', futureField: 'keep',
      musicOutput: { schemaVersion: 1, includeMusic: false, includeAudio: true, loops: 1, futureOption: 'keep' } } } };
  const second = createPxdProject();
  const saved = writeMusicOutputPreferences(first, { includeMusic: true, includeAudio: false, loops: 4 });
  assert.deepEqual(readMusicOutputPreferences(saved), { includeMusic: true, includeAudio: false, loops: 4 });
  assert.deepEqual(readMusicOutputPreferences(second), DEFAULT_MUSIC_OUTPUT_PREFERENCES,
    'a second PXD does not inherit the first project settings');
  assert.deepEqual(saved.manifest.futureManifestField, { retained: true });
  assert.deepEqual(saved.manifest.creationProject, {
    schemaVersion: 1, imageRole: 'main', futureField: 'keep',
    musicOutput: { schemaVersion: 1, includeMusic: true, includeAudio: false, loops: 4, futureOption: 'keep' }
  });
});

test('unknown versions and invalid preference values reset to safe defaults', () => {
  const project = { manifest: { creationProject: { musicOutput: { schemaVersion: 99,
    includeMusic: true, includeAudio: false, loops: 8 } } } };
  assert.deepEqual(readMusicOutputPreferences(project), DEFAULT_MUSIC_OUTPUT_PREFERENCES);
  assert.deepEqual(readMusicOutputPreferences({ manifest: { creationProject: {
    musicOutput: { schemaVersion: 1, includeMusic: true, includeAudio: false, loops: 3 }
  } } }), DEFAULT_MUSIC_OUTPUT_PREFERENCES);
});
