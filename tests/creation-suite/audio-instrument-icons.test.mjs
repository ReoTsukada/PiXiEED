import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUDIO_INSTRUMENTS } from '../../js/creation/audio-timbres.mjs';
import { AUDIO_INSTRUMENT_ICON_FAMILIES, getAudioInstrumentIcon, audioInstrumentIconFilter } from '../../js/creation/audio-instrument-icons.mjs';

test('every selectable sound has an exported Figma icon and keeps its existing name', () => {
  const ids = AUDIO_INSTRUMENTS.map(({ id }) => id).sort();
  assert.deepEqual(Object.keys(AUDIO_INSTRUMENT_ICON_FAMILIES).sort(), ids);
  for (const sound of AUDIO_INSTRUMENTS) {
    const icon = getAudioInstrumentIcon(sound.id);
    assert.equal(icon.name, sound.name);
    assert.equal(icon.url, `/assets/icons/instruments/${AUDIO_INSTRUMENT_ICON_FAMILIES[sound.id]}.svg`);
  }
});

test('every production icon traces to Figma and has consistent, self-contained SVG geometry', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../assets/icons/instruments/manifest.json', import.meta.url), 'utf8'));
  const families = new Set(Object.values(AUDIO_INSTRUMENT_ICON_FAMILIES));
  assert.equal(manifest.icons.length, 26);
  for (const { name, componentId, file } of manifest.icons) {
    assert.match(componentId, /^4:\d+$/);
    assert.equal(file, `${name}.svg`);
    const svg = readFileSync(new URL(`../../assets/icons/instruments/${file}`, import.meta.url), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.ok([...svg.matchAll(/stroke-width="([^"]+)"/g)].every(([, width]) => Number(width) === 1.8));
    assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|(?:href|onload)=/i);
    families.delete(name);
  }
  assert.equal(families.size, 0, 'every assigned family is actually exported');
});

test('untrusted or unknown sound IDs cannot become an asset path', () => {
  for (const id of ['constructor', '__proto__', '../../secret', '', undefined]) {
    assert.deepEqual(getAudioInstrumentIcon(id), { name: '音色', url: '/assets/icons/instruments/synth.svg' });
  }
});

test('icon contrast stays at least 4.5 to 1 across bright, dark and colorful chips', () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const color = '#' + [r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('');
    const linear = [r, g, b].map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const l = linear.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const white = audioInstrumentIconFilter(color).includes('invert(1)');
    const contrast = white ? 1.05 / (l + 0.05) : (l + 0.05) / 0.05;
    assert.ok(contrast >= 4.5, color);
  }
  assert.equal(audioInstrumentIconFilter(null), 'brightness(0) invert(1)');
});
