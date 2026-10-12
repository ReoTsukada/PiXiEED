import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../../js/creation/startup-mode.js',import.meta.url),'utf8');
const mark=search=>{const root={dataset:{}};runInNewContext(source,{URLSearchParams,window:{location:{search}},document:{documentElement:root}});return root.dataset;};
test('explicit camera entry marks its loading surface synchronously',()=>{
  assert.deepEqual({...mark('?mode=camera&pxd=existing&pxdRevision=retained')},{creationEntryMode:'camera',creationStartup:'camera'});
  assert.deepEqual({...mark('?mode=%63amera')},{creationEntryMode:'camera',creationStartup:'camera'});
});
test('drawing, audio and ordinary entry do not acquire the camera loading gate',()=>{
  for(const search of ['', '?mode=draw','?mode=audio','?mode=unknown','?mode=Camera'])assert.deepEqual({...mark(search)},{});
});
