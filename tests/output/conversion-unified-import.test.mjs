import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnifiedImportController } from '../../js/creation/conversion-unified-import.mjs';

const file = (name, type = '', size = 10) => ({ name, type, size });

function fixture(overrides = {}) {
  const state = { snapshot: { mode: 'output', text: 'draft', composing: false }, busy: false,
    calls: [], reports: [], invalidates: 0, settled: 0 };
  const controller = createUnifiedImportController({
    snapshot: () => ({ ...state.snapshot }), isBusy: () => state.busy,
    appendTextFiles: async files => { state.calls.push(['text', files]); return true; },
    importMedia: async files => { state.calls.push(['media', files]); return true; },
    selectFile: async item => { state.calls.push(['select', item]); return true; },
    activateMedia: async () => { state.calls.push(['activate-media']); },
    activateText: async () => { state.calls.push(['activate-text']); },
    activateCode: async item => { state.calls.push(['activate-code', item]); return true; },
    report: message => state.reports.push(message),
    onInvalidate: () => { state.invalidates++; }, onSettled: () => { state.settled++; },
    ...overrides,
  });
  return { state, controller };
}

test('media routing is independent of current input mode and preserves typed text', async () => {
  for (const mode of ['input', 'output']) {
    const { state, controller } = fixture();
    state.snapshot = { mode, text: 'draft in progress', composing: false };
    const image = file('art.png', 'image/png');
    assert.equal(await controller.request([image]), true);
    assert.deepEqual(state.calls.map(call => call[0]), ['media', 'select', 'activate-media']);
    assert.equal(state.snapshot.text, 'draft in progress');
  }
});

test('latest nonempty text entered during media import keeps text active', async () => {
  const { state, controller } = fixture({ importMedia: async files => {
    state.calls.push(['media', files]); state.snapshot.text = 'newer draft'; return true;
  } });
  assert.equal(await controller.request([file('art.png', 'image/png')]), true);
  assert.deepEqual(state.calls.map(call => call[0]), ['media', 'select', 'activate-text']);
});

test('a composing draft is not interrupted by media selection', async () => {
  const { state, controller } = fixture({ importMedia: async files => {
    state.calls.push(['media', files]); state.snapshot.composing = true; return true;
  } });
  assert.equal(await controller.request([file('art.png', 'image/png')]), true);
  assert.deepEqual(state.calls.map(call => call[0]), ['media', 'select']);
});

test('a request during an active composition is rejected before invalidation or native calls', async () => {
  const { state, controller } = fixture();
  state.snapshot.composing = true;
  assert.equal(await controller.request([file('art.png', 'image/png')]), false);
  assert.deepEqual(state.calls, []);
  assert.equal(state.invalidates, 0);
});

test('multiple media files are forwarded intact and in original order', async () => {
  const { state, controller } = fixture();
  const inputs = [file('one.png', 'image/png'), file('two.wav', 'audio/wav'), file('three.mp4', 'video/mp4')];
  assert.equal(await controller.request(inputs), true);
  assert.deepEqual(state.calls.map(call => call[0]), ['media', 'select', 'activate-media']);
  assert.deepEqual(state.calls[0][1], inputs);
  assert.deepEqual(state.calls[0][1].map((item, index) => item === inputs[index]), [true, true, true]);
  assert.equal(state.calls[1][1], null, 'multi-file import clears any stale single-file source');
});

test('mixed PNG/text/unknown/PNG batch processes sequentially and retains ordered original file references', async () => {
  const { state, controller } = fixture();
  const inputs = [file('one.png','image/png'),file('note.txt','text/plain'),file('restore.bin','application/octet-stream'),file('two.png','image/png')];
  assert.equal(await controller.request(inputs), true);
  assert.deepEqual(state.calls.map(call => call[0]), ['media','select','activate-media','text','select','activate-code','media','select','activate-media']);
  const entries = controller.snapshotEntries();
  assert.deepEqual(entries.map(entry => entry.kind), ['media','text','binary','media']);
  assert.deepEqual(entries.map(entry => entry.status), ['ready','ready','ready','ready']);
  assert.deepEqual(entries.map((entry,index) => entry.file === inputs[index]), [true,true,true,true]);
  assert.equal(Object.isFrozen(entries[0]), true);
});

test('single text files append through the text owner without switching routes', async () => {
  const { state, controller } = fixture();
  const note = file('notes.txt', 'text/plain');
  assert.equal(await controller.request([note]), true);
  assert.equal(state.calls[0][0], 'text');
  assert.deepEqual(state.calls[0][1], [note]);
  assert.equal(state.calls.some(call => call[0].startsWith('activate')), false);
});

test('single binary files at the limit use explicit code activation; oversized files do not mutate', async () => {
  const { state, controller } = fixture();
  const atLimit = file('restore.bin', 'application/octet-stream', 16 * 1024 * 1024);
  assert.equal(await controller.request([atLimit]), true);
  assert.deepEqual(state.calls.map(call => call[0]), ['select', 'activate-code']);
  const before = state.calls.length;
  assert.equal(await controller.request([file('large.bin', 'application/octet-stream', 16 * 1024 * 1024 + 1)]), false);
  assert.equal(state.calls.length, before);
  assert.match(state.reports.at(-1), /16MB/);
});

test('failed code activation returns false without pretending the file was accepted', async () => {
  const { state, controller } = fixture({ activateCode: async item => { state.calls.push(['activate-code', item]); return false; } });
  assert.equal(await controller.request([file('restore.bin', 'application/octet-stream')]), false);
  assert.deepEqual(state.calls.map(call => call[0]), ['select', 'activate-code']);
});

test('uncertain media import result is reported without claiming rollback', async () => {
  const { state, controller } = fixture({ importMedia: async () => false });
  assert.equal(await controller.request([file('art.png', 'image/png')]), false);
  assert.match(state.reports[0], /追加結果を確認できませんでした/);
  assert.deepEqual(state.calls, []);
});

test('busy or composing requests are ignored and chooser cancellation is silent', async () => {
  const { state, controller } = fixture();
  assert.equal(await controller.request([]), false);
  state.busy = true;
  assert.equal(await controller.request([file('a.txt')]), false);
  state.busy = false; state.snapshot.composing = true;
  assert.equal(await controller.request([file('a.txt')]), false);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.reports, []);
});

test('cancel invalidates late activation but keeps pending until the native media job settles', async () => {
  let finishMedia;
  const { state, controller } = fixture({ importMedia: files => new Promise(resolve => { finishMedia = () => resolve(true); }) });
  const pending = controller.request([file('art.png', 'image/png')]);
  assert.equal(controller.pending, true);
  assert.equal(controller.cancel(), true);
  assert.equal(controller.pending, true);
  assert.equal(await controller.request([file('other.png', 'image/png')]), false);
  finishMedia();
  assert.equal(await pending, false);
  assert.equal(controller.pending, false);
  assert.deepEqual(state.calls.map(call => call[0]), []);
  assert.equal(state.settled, 1, 'settled callback releases pending UI even after cancellation');
});

test('errors report through the owner port and clear pending state', async () => {
  const { state, controller } = fixture({ appendTextFiles: async () => { throw new Error('native import failed'); } });
  assert.equal(await controller.request([file('notes.txt', 'text/plain')]), false);
  assert.deepEqual(state.reports, ['notes.txt: native import failed']);
  assert.equal(controller.pending, false);
  assert.equal(state.settled, 1);
});

test('disposal after an await suppresses stale activation and completion callbacks', async () => {
  let finishImport;
  let current = true;
  const { state, controller } = fixture({
    isCurrent: () => current,
    importMedia: files => new Promise(resolve => { finishImport = () => resolve(true); }),
  });
  const pending = controller.request([file('art.png', 'image/png')]);
  current = false; finishImport();
  assert.equal(await pending, false);
  assert.equal(state.calls.length, 0);
  assert.equal(state.settled, 0);
  assert.equal(controller.pending, false);
});

test('a middle failure is recorded, later files continue, and retry reuses the same entry', async () => {
  const broken = file('broken.txt','text/plain');
  let textAttempts = 0;
  const { state, controller } = fixture({ appendTextFiles: async files => {
    state.calls.push(['text',files]); textAttempts++; if(textAttempts===1) throw new Error('decode failed'); return true;
  } });
  const inputs = [file('first.png','image/png'),broken,file('last.png','image/png')];
  assert.equal(await controller.request(inputs), true);
  let entries = controller.snapshotEntries();
  assert.deepEqual(entries.map(entry=>entry.status),['ready','error','ready']);
  assert.equal(entries[1].error,'decode failed');
  const retryId = entries[1].id;
  assert.equal(await controller.retryEntry(retryId),true);
  entries=controller.snapshotEntries();
  assert.equal(entries.length,3);
  assert.equal(entries[1].id,retryId);
  assert.equal(entries[1].file,broken);
  assert.equal(entries[1].status,'ready');
});

test('text failure defers later text, while retry appends both text files in original order around media', async () => {
  const textOrder=[]; let attempts=0;
  const { state, controller } = fixture({ appendTextFiles: async files => {
    textOrder.push(files[0].name); attempts++; if(attempts===1) throw new Error('first text failed'); return true;
  } });
  const first=file('A.txt','text/plain'), image=file('image.png','image/png'), second=file('B.txt','text/plain');
  assert.equal(await controller.request([first,image,second]),true);
  let rows=controller.snapshotEntries();
  assert.deepEqual(rows.map(row=>row.status),['error','ready','queued']);
  assert.deepEqual(textOrder,['A.txt']);
  assert.equal(rows[2].error.includes('前の文字ファイル'),true);
  assert.equal(await controller.retryEntry(rows[0].id),true);
  assert.deepEqual(textOrder,['A.txt','A.txt','B.txt']);
  rows=controller.snapshotEntries();
  assert.deepEqual(rows.map(row=>row.status),['ready','ready','ready']);
});

test('unresolved earlier text across requests gates later text until the earlier retry succeeds', async () => {
  let calls=0; const textOrder=[];
  const { state, controller }=fixture({ appendTextFiles:async files=>{textOrder.push(files[0].name);calls++;if(calls===1)throw Error('A unavailable');return true;} });
  const first=file('A.txt','text/plain'), later=file('B.txt','text/plain');
  assert.equal(await controller.request([first]),false);
  assert.equal(await controller.request([later]),false);
  assert.deepEqual(textOrder,['A.txt']);
  const rows=controller.snapshotEntries();
  assert.equal(await controller.retryEntry(rows[0].id),true);
  assert.deepEqual(textOrder,['A.txt','A.txt','B.txt']);
  assert.deepEqual(controller.snapshotEntries().map(row=>row.status),['ready','ready']);
});

test('a confirmed media write cancelled before selection retries activation without duplicate import', async () => {
  let finish; const { state, controller }=fixture({ importMedia:files=>new Promise(resolve=>{state.calls.push(['media',files]);finish=()=>resolve(true);}) });
  const pending=controller.request([file('saved.png','image/png')]);
  controller.cancel(); finish(); assert.equal(await pending,false);
  const row=controller.snapshotEntries()[0]; assert.equal(row.applied,true); assert.equal(row.status,'cancelled');
  assert.equal(await controller.retryEntry(row.id),true);
  assert.equal(state.calls.filter(call=>call[0]==='media').length,1);
  assert.deepEqual(state.calls.map(call=>call[0]),['media','select','activate-media']);
});

test('uncertain media outcomes require manual group review and cannot be blindly retried', async () => {
  const { state, controller }=fixture({ importMedia:async()=>{throw Error('uncertain write');} });
  assert.equal(await controller.request([file('maybe.png','image/png')]),false);
  const row=controller.snapshotEntries()[0];
  assert.equal(row.needsReview,true); assert.equal(row.retryable,false);
  assert.equal(await controller.retryEntry(row.id),false);
});

test('media order blocks later media after failure and explicit hold resumes without reimporting the held file', async () => {
  const first=file('A.png','image/png'), note=file('between.txt','text/plain'), second=file('B.png','image/png');
  let firstAttempts=0;
  const {state,controller}=fixture({importMedia:async files=>{state.calls.push(['media',files]);if(files[0]===first&&firstAttempts++===0)throw Error('uncertain');return true;}});
  assert.equal(await controller.request([first,note,second]),true);
  let rows=controller.snapshotEntries();
  assert.deepEqual(rows.map(row=>row.status),['error','ready','queued']);
  assert.equal(rows[0].needsReview,true);assert.equal(rows[2].error.includes('前の素材'),true);
  assert.equal(await controller.retryEntry(rows[0].id),false);
  assert.equal(await controller.holdEntry(rows[0].id),true);
  rows=controller.snapshotEntries();
  assert.deepEqual(rows.map(row=>row.status),['held','ready','ready']);
  assert.deepEqual(state.calls.filter(call=>call[0]==='media').map(call=>call[1][0].name),['A.png','B.png']);
  assert.equal(rows[0].file,first,'held original remains available for review/download');
});

test('media selection retry resumes an applied record without duplicating native import', async () => {
  let selections=0; const {state,controller}=fixture({selectFile:async item=>{state.calls.push(['select',item]);return ++selections>1;}});
  assert.equal(await controller.request([file('A.png','image/png')]),false);
  const row=controller.snapshotEntries()[0];assert.equal(row.applied,true);assert.equal(row.status,'error');
  assert.equal(await controller.retryEntry(row.id),true);
  assert.equal(state.calls.filter(call=>call[0]==='media').length,1);
  assert.deepEqual(state.calls.map(call=>call[0]),['media','select','select','activate-media']);
});

test('two oversized binary records remain ordered around valid text and both retain errors', async () => {
  const { state, controller }=fixture();
  const hugeA=file('huge-a.bin','application/octet-stream',16*1024*1024+1), note=file('kept.txt','text/plain'), hugeB=file('huge-b.bin','application/octet-stream',16*1024*1024+2);
  assert.equal(await controller.request([hugeA,note,hugeB]),true);
  const rows=controller.snapshotEntries();
  assert.deepEqual(rows.map(row=>row.status),['error','ready','error']);
  assert.deepEqual(rows.map(row=>row.file),[hugeA,note,hugeB]);
  assert.equal(state.calls.filter(call=>call[0]==='text').length,1);
  assert.equal(rows[0].retryable,false); assert.equal(rows[2].retryable,false);
});

test('text edited during an earlier media step remains active for later media entries', async () => {
  const { state, controller }=fixture({ importMedia:async files=>{state.calls.push(['media',files]);if(files[0].name==='first.png')state.snapshot.text='latest user edit';return true;} });
  await controller.request([file('first.png','image/png'),file('between.txt','text/plain'),file('second.png','image/png')]);
  assert.equal(state.calls.filter(call=>call[0]==='activate-media').length,0);
  assert.equal(state.calls.filter(call=>call[0]==='activate-text').length,2);
});

test('cancel marks active and queued records, suppresses follow-up calls, then settles pending', async () => {
  let finishFirst;
  const { state, controller } = fixture({ importMedia: files => new Promise(resolve=>{state.calls.push(['media',files]);finishFirst=()=>resolve(true);}) });
  const pending=controller.request([file('first.png','image/png'),file('later.txt','text/plain')]);
  assert.equal(controller.cancel(),true);
  const cancelled=controller.snapshotEntries();
  assert.deepEqual(cancelled.map(entry=>entry.status),['cancelled','cancelled']);
  finishFirst();
  assert.equal(await pending,false);
  assert.deepEqual(state.calls.map(call=>call[0]),['media']);
  assert.equal(controller.pending,false);
});

test('concurrent requests are rejected while a native batch is pending', async () => {
  let finish;
  const { state, controller } = fixture({ appendTextFiles: files => new Promise(resolve=>{state.calls.push(['text',files]);finish=()=>resolve(true);}) });
  const first=controller.request([file('one.txt','text/plain')]);
  assert.equal(await controller.request([file('two.txt','text/plain')]),false);
  assert.equal(controller.snapshotEntries().length,1);
  finish(); await first;
  assert.deepEqual(state.calls.map(call=>call[1][0].name),['one.txt']);
});

test('unknown binary entries are marked as restore-code material and never treated as media', async () => {
  const { state, controller } = fixture();
  const item=file('unknown.bin','application/octet-stream');
  await controller.request([item]);
  assert.equal(controller.snapshotEntries()[0].kind,'binary');
  assert.deepEqual(state.calls.map(call=>call[0]),['select','activate-code']);
});


test('resuming a confirmed text append opens the text view without appending bytes again', async () => {
  let finish;const h=fixture({appendTextFiles:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=h.controller.request([file('memo.txt','text/plain')]);h.controller.cancel();finish(true);await pending;
  const entry=h.controller.snapshotEntries()[0];assert.equal(entry.applied,true);
  h.state.calls.length=0;assert.equal(await h.controller.retryEntry(entry.id),true);
  assert.deepEqual(h.state.calls.map(call=>call[0]),['activate-text']);assert.equal(h.controller.snapshotEntries()[0].status,'ready');
});
