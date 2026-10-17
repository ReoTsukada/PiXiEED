import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chooseAudioVideoMimeType as chooseFromRenderer } from '../../js/creation/audio-video.mjs';
import { chooseAudioVideoMimeType as chooseFromCapabilities } from '../../js/creation/audio-video-capabilities.mjs';

const outputPage = readFileSync(new URL('../../js/creation/output-page.mjs', import.meta.url), 'utf8');
const capabilities = readFileSync(new URL('../../js/creation/audio-video-capabilities.mjs', import.meta.url), 'utf8');

test('output generation keeps renderer modules behind the existing generate action', () => {
  for (const moduleName of ['audio-export', 'audio-video', 'output-video']) {
    assert.doesNotMatch(outputPage, new RegExp(`^\\s*import\\s+.*['\"]\\./${moduleName}\\.mjs`, 'm'));
    assert.match(outputPage, new RegExp(`import\\(['\"]\\./${moduleName}\\.mjs`));
  }
  assert.match(outputPage, /audio-video-capabilities\.mjs/);
  assert.doesNotMatch(capabilities, /^\s*import\s/m);
});

test('the light capability helper preserves the renderer public API behavior', () => {
  class Mp4Recorder { static isTypeSupported(type) { return type.startsWith('video/mp4'); } }
  class WebmRecorder { static isTypeSupported(type) { return type === 'video/webm;codecs=vp8,opus'; } }
  for (const Recorder of [undefined, Mp4Recorder, WebmRecorder]) {
    assert.deepEqual(chooseFromCapabilities(Recorder), chooseFromRenderer(Recorder));
  }
  assert.deepEqual(chooseFromCapabilities(WebmRecorder, { includeAudio: false }), chooseFromRenderer(WebmRecorder, { includeAudio: false }));
});
