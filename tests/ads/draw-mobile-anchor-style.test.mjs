import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = (await readFile(new URL('../../css/draw-mobile-anchor.css', import.meta.url), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, declarations]) => ({ selector: selector.trim(), declarations }));

// Guard the scope; actual no-shift behavior still requires a browser check.
test('mobile anchor CSS styles only the local preview fixture', () => {
  assert.ok(rules.length > 0);
  for (const { selector } of rules) {
    for (const branch of selector.split(',')) {
      assert.match(branch.trim(), /^\.draw-mobile-ad-preview(?:__(?:label|close))?(?:\[hidden\]|:focus-visible)?$/);
    }
  }
});

test('preview CSS cannot reserve editor space or alter provider-owned ads', () => {
  assert.doesNotMatch(css, /adsbygoogle|data-anchor-status|iframe|google_ads/);
  assert.doesNotMatch(css, /--(?:draw-mobile|creation-editor|tool-direct)-/);
  for (const { declarations } of rules) {
    assert.doesNotMatch(declarations, /(?:^|;)\s*(?:animation|transition)(?:-[\w-]+)?\s*:/);
  }
});
