import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversionTextDraftController, createTextDraftSwap } from '../../js/creation/conversion-text-draft.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(overrides = {}) {
  let text = 'draft';
  const writes = [];
  const controller = createConversionTextDraftController({
    readText: () => text,
    writeText: value => { text = value; writes.push(value); },
    readFile: file => file.content,
    decode: value => value,
    maxLength: 100,
    ...overrides,
  });
  return { controller, writes, get text() { return text; }, set text(value) { text = value; } };
}

test('asynchronous append commits after reading against the latest draft', async () => {
  const read = deferred(), f = fixture({ readFile: () => read.promise });
  const task = f.controller.append([{ name: 'note.txt' }]);
  assert.equal(f.controller.importing, true);
  f.text = 'draft edited while file is read';
  read.resolve('added words');
  assert.equal(await task, true);
  assert.equal(f.text, 'draft edited while file is read\nadded words');
  assert.equal(f.controller.importing, false);
});

test('append waits for compositionend before committing and then reads the final draft', async () => {
  let composing = true, finishComposition;
  const f = fixture({ isComposing: () => composing, waitComposition: () => new Promise(resolve => { finishComposition = resolve; }) });
  const task = f.controller.append([{ content: 'file text' }]);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.writes.length, 0);
  f.text = 'IME-final'; composing = false; finishComposition();
  assert.equal(await task, true);
  assert.equal(f.text, 'IME-final\nfile text');
});

test('overlapping imports are rejected while first import owns the lock', async () => {
  const read = deferred(), f = fixture({ readFile: () => read.promise });
  const first = f.controller.append([{ name: 'one' }]);
  assert.equal(await f.controller.append([{ name: 'two' }]), false);
  read.resolve('one');
  assert.equal(await first, true);
  assert.equal(f.text, 'draft\none');
});

test('read/decode errors and combined length refusal leave the draft unchanged', async () => {
  const f = fixture({ readFile: async file => { if (file.fail) throw Error('read failed'); return file.content; }, maxLength: 8 });
  await assert.rejects(f.controller.append([{ fail: true }]), /read failed/);
  assert.equal(f.text, 'draft'); assert.equal(f.writes.length, 0);
  assert.equal(await f.controller.append([{ content: 'too long' }]), false);
  assert.equal(f.text, 'draft'); assert.equal(f.writes.length, 0);
});

test('oversized file is rejected before reading its bytes', async () => {
  let reads = 0;
  const f = fixture({ maxLength: 3, readFile: async () => { reads++; return 'large'; } });
  await assert.rejects(f.controller.append([{ size: 4 }]), /24MB/);
  assert.equal(reads, 0);
  assert.equal(f.text, 'draft');
});

test('all files decode before one ordered commit and no restore code is auto-decoded', async () => {
  const decoded = [], f = fixture({ decode: value => { decoded.push(value); return value; } });
  const files = [{ content: '-----BEGIN PIXIEED RESTORE 1-----' }, { content: 'second' }];
  assert.equal(await f.controller.append(files), true);
  assert.deepEqual(decoded, files.map(item => item.content));
  assert.equal(f.text, `draft\n${files[0].content}\nsecond`);
  assert.equal(f.writes.length, 1);
});

test('dispose settles an IME-deferred append as canceled without changing the draft', async () => {
  let composing = true;
  const f = fixture({ isComposing: () => composing, waitComposition: () => new Promise(() => {}) });
  const task = f.controller.append([{ content: 'pending' }]);
  await Promise.resolve(); await Promise.resolve();
  f.controller.dispose();
  assert.equal(await task, false);
  assert.equal(f.text, 'draft');
  assert.equal(f.controller.importing, false);
});

test('stale/disposed imports cannot commit after asynchronous decoding', async () => {
  const read = deferred(), f = fixture({ readFile: () => read.promise, isCurrent: () => false });
  const task = f.controller.append([{ name: 'stale' }]);
  read.resolve('late');
  assert.equal(await task, false);
  assert.equal(f.text, 'draft');
});

test('a fresh controller accepts imports after BFCache-style disposal and restoration', async () => {
  let text = 'draft'; const ports = {
    readText: () => text, writeText: value => { text = value; },
    readFile: file => file.content, decode: value => value, maxLength: 100,
  };
  const beforeHide = createConversionTextDraftController(ports);
  beforeHide.dispose();
  assert.equal(await beforeHide.append([{ content: 'ignored' }]), false);
  const afterRestore = createConversionTextDraftController(ports);
  assert.equal(await afterRestore.append([{ content: 'restored' }]), true);
  assert.equal(text, 'draft\nrestored');
});

test('explicit replacement keeps one nonempty alternate and swap restores text, options and action', () => {
  let current = { text: 'first draft', options: { width: 800 }, action: 'text' };
  const swap = createTextDraftSwap({ read: () => current, write: value => { current = value; } });
  const replacement = { text: 'example', options: { width: 1000 }, action: 'text' };
  swap.replace(replacement);
  assert.equal(current.text, 'example');
  assert.equal(swap.available, true); assert.equal(swap.alternateLength, 'first draft'.length);
  current.options.width = 1200;
  assert.equal(swap.swap(), true);
  assert.deepEqual(current, { text: 'first draft', options: { width: 800 }, action: 'text' });
  assert.equal(swap.alternateLength, 'example'.length);
  assert.equal(swap.swap(), true);
  assert.deepEqual(current, { text: 'example', options: { width: 1200 }, action: 'text' });
});

test('normal edits between swaps are preserved as the new alternate', () => {
  let current = { text: 'before', options: { width: 320 }, action: 'text' };
  const swap = createTextDraftSwap({ read: () => current, write: value => { current = value; } });
  swap.replace({ text: 'sample', options: { width: 900 }, action: 'text' });
  current.text = 'edited sample'; current.options.width = 1100;
  assert.equal(swap.swap(), true);
  assert.deepEqual(current, { text: 'before', options: { width: 320 }, action: 'text' });
  assert.equal(swap.alternateLength, 'edited sample'.length);
  swap.swap();
  assert.deepEqual(current, { text: 'edited sample', options: { width: 1100 }, action: 'text' });
});

test('empty or identical current text does not replace the alternate; snapshots clone options', () => {
  let current = { text: '', options: { width: 320 }, action: 'auto' };
  const swap = createTextDraftSwap({ read: () => current, write: value => { current = value; } });
  swap.replace({ text: 'example', options: { width: 900 }, action: 'text' });
  assert.equal(swap.available, false);
  current = { text: 'draft', options: { width: 400 }, action: 'text' };
  swap.replace({ text: 'draft', options: { width: 700 }, action: 'text' });
  assert.equal(swap.available, false);
  current = { text: 'previous', options: { width: 500 }, action: 'text' };
  swap.replace({ text: 'sample', options: { width: 900 }, action: 'text' });
  current.options.width = 1200;
  swap.swap();
  assert.deepEqual(current, { text: 'previous', options: { width: 500 }, action: 'text' });
});
