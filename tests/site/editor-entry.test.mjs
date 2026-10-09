import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { editorEntry } from '../../js/legacy-editor-entry.mjs';

test('only recognized editor roots and their case/slash/index variants get compatibility handling', () => {
  for (const path of ['/PiXiEEDraw', '/PiXiEEDraw/', '/pixieedraw/index.html', '/PIXIEEDRAW/']) {
    assert.deepEqual(editorEntry(path), { modern: true, path: '/draw/' });
  }
  for (const path of ['/pixiedraw/', '/pixiedraw2/', '/studio/']) assert.equal(editorEntry(path).modern, false);
  for (const path of ['/draw/', '/other/PiXiEEDraw/', '/pixiedraw/work', '//evil.test', '/PiXiEEDrawish/']) assert.equal(editorEntry(path), null);
});

test('home index alias retains attribution and fragment without redirecting the root into a loop', async () => {
  const source = await readFile(new URL('../../js/canonical-entry.js', import.meta.url), 'utf8');
  const calls = [];
  runInNewContext(source, { location: { pathname: '/index.html', search: '?utm_source=old', hash: '#tools', replace: url => calls.push(url) } });
  assert.deepEqual(calls, ['/?utm_source=old#tools']);
  runInNewContext(source, { location: { pathname: '/', search: '?utm_source=old', hash: '#tools', replace: url => calls.push(url) } });
  assert.equal(calls.length, 1);
});

test('compatibility HTML stays out of the index and discloses legacy data limits', async () => {
  for (const name of ['PiXiEEDraw', 'pixiedraw', 'pixiedraw2', 'studio']) {
    const html = await readFile(new URL(`../../${name}/index.html`, import.meta.url), 'utf8');
    assert.match(html, /content="noindex,follow"/);
    assert.match(html, /canonical" href="https:\/\/pixieed.jp\/draw\/"/);
    assert.match(html, /data-current-editor href="\/draw\/"/);
    if (name !== 'PiXiEEDraw') assert.match(html, /旧/);
  }
});
