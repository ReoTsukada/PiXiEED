import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../css/draw-brush-settings.css', import.meta.url), 'utf8');
const luminance = hex => {
  const rgb = hex.match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('brush numeric input pairs dark surface and light text above the global important reset', () => {
  const rule = css.match(/body\[data-page="draw"\] \.draw-brush-settings__value input \{([^}]+)\}/)?.[1];
  assert.ok(rule, 'a scoped numeric-field override exists');
  assert.match(rule, /background:\s*#101820\s*!important/);
  assert.match(rule, /color:\s*#edf2f3/);
  assert.match(rule, /color-scheme:\s*dark/);
  assert.match(rule, /-webkit-text-fill-color:\s*currentColor/);
  assert.match(rule, /caret-color:\s*currentColor/);
  assert.ok(ratio('edf2f3', '101820') >= 7, 'normal text meets AAA contrast');
  assert.ok(ratio('b8c0c2', '101820') >= 7, 'disabled value remains readable');
  assert.ok(ratio('71808a', '101820') >= 3, 'input edge remains distinguishable');
});

test('brush focus and disabled state retain a visible boundary and readable value', () => {
  assert.match(css, /\.draw-brush-settings input:focus-visible\s*\{[^}]*outline:\s*3px solid #8ecdf0/);
  assert.match(css, /\.draw-brush-settings__value input:disabled\s*\{[^}]*color:\s*#b8c0c2;\s*opacity:\s*1/);
});
