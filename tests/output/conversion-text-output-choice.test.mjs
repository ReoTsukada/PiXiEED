import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isTextRenderOutputFormat, textRenderOutputChoices, textRenderOutputSelector } from '../../js/creation/conversion-text-output-choice.mjs';

test('text render output choices are stable and map to existing native download links', () => {
  assert.deepEqual(textRenderOutputChoices(), [
    { value: 'png', label: 'PNG画像', selector: '[data-tx-download]' },
    { value: 'svg', label: 'SVG画像', selector: '[data-tx-svg]' },
    { value: 'pxtxt', label: '文章と設定', selector: '[data-tx-project]' },
  ]);
  assert.equal(textRenderOutputSelector('png'), '[data-tx-download]');
  assert.equal(textRenderOutputSelector('svg'), '[data-tx-svg]');
  assert.equal(textRenderOutputSelector('pxtxt'), '[data-tx-project]');
  assert.equal(textRenderOutputSelector('base64'), null);
});

test('only supported text render file preferences validate', () => {
  for (const value of ['png', 'svg', 'pxtxt']) assert.equal(isTextRenderOutputFormat(value), true);
  for (const value of ['text', 'restore', 'base64', '', null]) assert.equal(isTextRenderOutputFormat(value), false);
});

test('render preference notifications retain detail while ordinary notifications keep the same event', async () => {
  const source = await readFile(new URL('../../js/creation/text-tools.mjs', import.meta.url), 'utf8');
  assert.match(source, /function notifyTextSource\(detail = \{\}\).*CustomEvent\('pixieed:text-source'.*detail/s);
  assert.match(source, /notifyTextSource\(\{ kind: 'render-format' \}\)/);
});
