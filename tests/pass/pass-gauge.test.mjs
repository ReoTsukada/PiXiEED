import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePassGauge, renderPassGauge } from '../../js/pass-gauge.mjs';

const HOUR = 60 * 60 * 1000;

test('gauge labels and banks handle empty, one millisecond, and hour boundaries', () => {
  const empty = derivePassGauge(0);
  assert.equal(empty.label, '+1時間'); assert.equal(empty.bank, 0); assert.equal(empty.filledCount, 0);
  assert.deepEqual(empty.rows.map(({ hours }) => hours), [3, 2, 1]);
  assert.deepEqual(empty.rows.map(({ filled }) => filled), [false, false, false]);

  const oneMs = derivePassGauge(1);
  assert.equal(oneMs.label, '0:01'); assert.equal(oneMs.bank, 1);
  assert.deepEqual(oneMs.rows.map(({ cells }) => cells.filter(Boolean).length), [0, 0, 1]);
  assert.equal(oneMs.rows[2].cells[0], true);

  const oneHour = derivePassGauge(HOUR);
  assert.equal(oneHour.label, '1:00'); assert.equal(oneHour.bank, 1);
  assert.deepEqual(oneHour.rows.map(({ cells }) => cells.filter(Boolean).length), [0, 0, 12]);

  const plusOneMs = derivePassGauge(HOUR + 1);
  assert.equal(plusOneMs.label, '1:01'); assert.equal(plusOneMs.bank, 2);
  assert.deepEqual(plusOneMs.rows.map(({ cells }) => cells.filter(Boolean).length), [0, 1, 12]);

  const twoHours = derivePassGauge(HOUR * 2);
  assert.equal(twoHours.bank, 2);
  assert.deepEqual(twoHours.rows.map(({ cells }) => cells.filter(Boolean).length), [0, 12, 12]);

  const threeHours = derivePassGauge(HOUR * 3);
  assert.equal(threeHours.bank, 3); assert.equal(threeHours.filledCount, 36);
  assert.deepEqual(derivePassGauge(HOUR * 9).rows, threeHours.rows, 'the visible gauge caps at three rows while label/time remain real');
  assert.equal(derivePassGauge(HOUR * 9).label, '9:00');
  const long = derivePassGauge(HOUR * 999 + 1);
  assert.equal(long.label, '999h'); assert.equal(long.clock, '999:01'); assert.equal(long.long, true);
  const pro = derivePassGauge(Infinity);
  assert.equal(pro.label, 'Pro'); assert.equal(pro.bank, 3); assert.equal(pro.pro, true); assert.equal(pro.filledCount, 36);
});

function fakeCell() {
  const data = {}; let writes = 0;
  return { dataset: new Proxy(data, { set(target, key, value) { writes += 1; target[key] = value; return true; } }), get writes() { return writes; } };
}
function fakeButton() {
  const label = { textContent: '', writes: 0 };
  Object.defineProperty(label, 'textContent', { get() { return this.value || ''; }, set(value) { this.writes += 1; this.value = value; } });
  const add = { textContent: '', writes: 0 };
  Object.defineProperty(add, 'textContent', { get() { return this.value || ''; }, set(value) { this.writes += 1; this.value = value; } });
  const rows = Array.from({ length: 3 }, () => ({ ...fakeCell(), cells: Array.from({ length: 12 }, fakeCell), querySelectorAll() { return this.cells; } }));
  const datasetData = {}; let datasetWrites = 0;
  const button = { dataset: new Proxy(datasetData, { set(target, key, value) { datasetWrites += 1; target[key] = value; return true; }, deleteProperty(target, key) { datasetWrites += 1; return delete target[key]; } }), get datasetWrites() { return datasetWrites; }, rows, label, add, querySelector(selector) { return selector === '[data-header-pass-label]' ? label : selector === '.px-pass-add' ? add : null; }, querySelectorAll(selector) { return selector === '.px-pass-gauge-row' ? rows : []; } };
  return button;
}

test('renderer fills the fixed 3×12 DOM contract and skips unchanged writes', () => {
  const button = fakeButton(); const state = derivePassGauge(HOUR + 1);
  renderPassGauge(button, state);
  assert.equal(button.dataset.active, 'true'); assert.equal(button.dataset.bank, '2');
  assert.deepEqual(button.rows.map((row) => row.dataset.filled), ['false', 'true', 'true']);
  assert.deepEqual(button.rows.map((row) => row.cells.filter((cell) => cell.dataset.filled === 'true').length), [0, 1, 12]);
  assert.equal(button.label.textContent, '1:01'); assert.equal(button.add.textContent, '+');
  assert.deepEqual(state.rows.map(({ hours }) => hours), [3, 2, 1], 'each bar is labeled by its one-hour tier');
  const writes = button.rows.flatMap((row) => [row.writes, ...row.cells.map((cell) => cell.writes)]).reduce((sum, value) => sum + value, 0) + button.label.writes + button.add.writes;
  renderPassGauge(button, state);
  const writesAgain = button.rows.flatMap((row) => [row.writes, ...row.cells.map((cell) => cell.writes)]).reduce((sum, value) => sum + value, 0) + button.label.writes + button.add.writes;
  assert.equal(writesAgain, writes);
  renderPassGauge(button, derivePassGauge(Infinity));
  assert.equal(button.dataset.pro, 'true'); assert.equal(button.add.textContent, '∞'); assert.equal(button.label.textContent, 'Pro');
  const proWrites = button.datasetWrites;
  renderPassGauge(button, derivePassGauge(Infinity));
  assert.equal(button.datasetWrites, proWrites, 'Pro state does not rewrite stable data attributes');

  const longState = derivePassGauge(HOUR * 999 + 1);
  renderPassGauge(button, longState);
  const longWrites = button.datasetWrites;
  renderPassGauge(button, longState);
  assert.equal(button.datasetWrites, longWrites, 'long state does not rewrite stable data attributes');
});
