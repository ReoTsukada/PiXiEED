import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AUDIO_INSTRUMENTS } from '../../js/creation/audio-timbres.mjs';
import { getAudioInstrumentIcon, audioInstrumentIconFilter } from '../../js/creation/audio-instrument-icons.mjs';

test('every supported instrument resolves to its installed decorative SVG', async () => {
  assert.equal(AUDIO_INSTRUMENTS.length, 56);
  for (const voice of AUDIO_INSTRUMENTS) {
    const icon = getAudioInstrumentIcon(voice.id);
    assert.equal(icon.name, voice.name);
    assert.match(icon.url, /^\/assets\/icons\/instruments\/[a-z-]+\.svg$/);
    await access(fileURLToPath(new URL(`../../assets/icons/instruments/${icon.url.split('/').at(-1)}`, import.meta.url)));
  }
});

test('opaque chip contrast selects black for light colors and white for dark colors', () => {
  assert.equal(audioInstrumentIconFilter('#ffffff'), 'brightness(0) saturate(100%)');
  assert.equal(audioInstrumentIconFilter('#777777'), 'brightness(0) saturate(100%)');
  assert.equal(audioInstrumentIconFilter('#000000'), 'brightness(0) invert(1)');
  assert.equal(audioInstrumentIconFilter('transparent'), 'brightness(0) invert(1)');
});
