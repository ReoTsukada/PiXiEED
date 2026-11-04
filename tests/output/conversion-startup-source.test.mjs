import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../../js/creation/conversion-page.mjs', import.meta.url), 'utf8');
const start = page.indexOf('function acceptSource(next,');
const end = page.indexOf('\n  async function load(files)', start);
assert.notEqual(start, -1, 'acceptSource extraction start must exist');
assert.notEqual(end, -1, 'acceptSource extraction end must exist');
const acceptSource = page.slice(start, end);

function fixture() {
  const fields = new Map();
  const field = (selector, value = '') => {
    const item = { value, hidden: false, checked: false, max: '', textContent: '', open: false, options: [],
      replaceChildren(...children) { this.options = children; }, };
    fields.set(selector, item); return item;
  };
  for (const [selector, value] of [
    ['[data-width]', ''], ['[data-height]', ''], ['[data-quality]', '90'], ['[data-background]', '#ffffff'],
    ['[data-threshold]', '128'], ['[data-frame]', '1'], ['[data-bits]', '16'], ['[data-ratio]', ''],
    ['[data-loop]', '1'], ['[data-rate-input]', '1'], ['[data-drop]', ''], ['[data-editor]', ''],
    ['[data-name]', ''], ['[data-meta]', ''], ['[data-source-note]', ''], ['[data-timing-details]', ''],
    ['[data-sequence]', ''],
  ]) field(selector, value);
  fields.get('[data-ratio]').checked = true;
  const originalHeadingLookups = [];
  const main = {
    classList: { add() {} },
    querySelector(selector) { originalHeadingLookups.push(selector); if (selector === 'h1') throw Error('authored shell heading is outside main'); return null; },
  };
  const format = { value: '', options: [], replaceChildren(...children) { this.options = children; } };
  const context = {
    main, format, fields, originalHeadingLookups,
    source: null, original: null, activeId: null, undoTicket: { stale: true }, rate: 1, assetSequence: 0,
    nextSource: null,
    snapshotConversionMaterialSource: value => ({ ...value, frames: value.frames.map(frame => ({ ...frame })), assets: value.assets.map(asset => ({ ...asset })) }),
    clearResult() {}, setLoop(value) { fields.get('[data-loop]').value = String(value); },
    conversionChoices: value => value.kind === 'audio' ? [{ value: 'wav', label: 'WAV' }] : value.frames.length > 1
      ? [{ value: 'gif', label: 'GIF' }, { value: 'apng', label: 'APNG' }]
      : [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }],
    webp: false, doc: { createElement: () => ({}) },
    renderFrames() {}, refresh() {}, text(value) { context.status = value; }, emitMaterials() { context.emitted = true; },
  };
  context.$ = selector => fields.get(selector);
  vm.createContext(context);
  vm.runInContext(acceptSource, context);
  return context;
}

test('simple conversion accepts still and multi-frame sources without querying a removed legacy heading', () => {
  for (const [label, frames, expectedFormat, expectedName] of [
    ['still', [{ width: 16, height: 8, data: new Uint8Array(16 * 8 * 4) }], 'png', 'still.png'],
    ['multi-frame', [{ width: 16, height: 8, data: new Uint8Array(16 * 8 * 4) }, { width: 16, height: 8, data: new Uint8Array(16 * 8 * 4) }], 'gif', '2コマの画像'],
  ]) {
    const context = fixture();
    const next = { kind: 'image', frames, totalPlays: 0, name: `${label}.png`, sequence: label === 'multi-frame', inputFormat: 'png', note: '' };
    context.acceptSource(next);
    assert.equal(context.originalHeadingLookups.includes('h1'), false, `${label} should not query a removed heading`);
    assert.equal(context.source.frames.length, frames.length);
    assert.equal(context.original.frames.length, frames.length);
    assert.equal(context.format.value, expectedFormat);
    assert.equal(context.fields.get('[data-width]').value, 16);
    assert.equal(context.fields.get('[data-height]').value, 8);
    assert.equal(context.fields.get('[data-editor]').hidden, false);
    assert.equal(context.fields.get('[data-drop]').hidden, true);
    assert.equal(context.fields.get('[data-name]').textContent, expectedName);
    assert.equal(context.emitted, true);
  }
});
