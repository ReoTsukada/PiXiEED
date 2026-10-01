import test from 'node:test';
import assert from 'node:assert/strict';
import { passButtonMarkup, passButtonView, renderPassButton } from '../../js/pass-button.mjs';

const MIN = 60 * 1000;

test('the header button maps two hours to twelve ten-minute pixels and formats up to 120 minutes', () => {
  assert.deepEqual(passButtonView({ remainingMs: 0 }), { state: 'ad', main: '1時間', sub: '特典の案内', lit: 0, low: false, fraction: 0 });
  assert.equal(passButtonView({ remainingMs: 0, freeReady: true }).state, 'free');
  const fullHour = passButtonView({ remainingMs: 60 * MIN, freeReady: true });
  assert.deepEqual([fullHour.state, fullHour.main, fullHour.lit, fullHour.low], ['active', '1:00', 6, false]);
  const full = passButtonView({ remainingMs: 120 * MIN });
  assert.deepEqual([full.main, full.lit, full.fraction], ['2:00', 12, 1]);
  const extended = passButtonView({ remainingMs: 110 * MIN });
  assert.deepEqual([extended.main, extended.lit], ['1:50', 11]);
  const half = passButtonView({ remainingMs: 30 * MIN });
  assert.deepEqual([half.main, half.lit], ['0:30', 3]);
  const low = passButtonView({ remainingMs: 4 * MIN });
  assert.deepEqual([low.main, low.lit, low.low], ['0:04', 1, true]);
  assert.equal(passButtonView({ remainingMs: 10 * MIN }).lit, 1);
  assert.equal(passButtonView({ remainingMs: 1 }).lit, 1, 'the last pixel stays lit until the hour is over');
  assert.equal(passButtonView({ remainingMs: Infinity, pro: true }).state, 'pro');
});

test('an active-to-active reward pulses only when remaining time increases', () => {
  const oldDocument = globalThis.document; const oldWindow = globalThis.window;
  globalThis.document = { visibilityState: 'visible', documentElement: { dataset: {} } };
  globalThis.window = { matchMedia: () => ({ matches: false }), clearTimeout() {}, setTimeout() { return 1; } };
  const makeButton = () => {
    const nodes = {
      '.pxb-main': { textContent: '' }, '.pxb-sub': { textContent: '' },
      '.pxb-sand-top': { setAttribute() {} }, '.pxb-sand-bottom': { setAttribute() {} }
    };
    const cells = Array.from({ length: 12 }, () => ({ dataset: {} }));
    return { dataset: {}, offsetWidth: 0, querySelector: (selector) => nodes[selector] || null,
      querySelectorAll: (selector) => selector === '.pxb-bar i' ? cells : [], cells };
  };
  try {
    const button = makeButton();
    renderPassButton(button, { remainingMs: 49 * MIN });
    renderPassButton(button, { remainingMs: 49 * MIN });
    assert.equal(button.dataset.fx, undefined, 'natural countdown does not celebrate');
    renderPassButton(button, { remainingMs: 49 * MIN });
    assert.equal(button.dataset.fx, undefined, 'a same-expiry refresh does not celebrate');
    renderPassButton(button, { remainingMs: 110 * MIN });
    assert.equal(button.dataset.fx, 'grant', 'a real active-pass extension gets a small pulse');
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('the markup has twelve bar pixels and all three icons', () => {
  assert.equal((passButtonMarkup.match(/<i style="--i:/g) || []).length, 12);
  for (const icon of ['pxb-coin', 'pxb-gift', 'pxb-glass']) assert.match(passButtonMarkup, new RegExp(`class="${icon}"`));
  assert.match(passButtonMarkup, /data-header-pass-label/);
});
