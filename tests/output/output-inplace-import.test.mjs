import { replaceOutputEntry } from '../../js/creation/output-entry-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../js/creation/output-page.mjs', import.meta.url), 'utf8');
function extract(name, next) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`\nasync function ${next}(`, start);
  assert.notEqual(start, -1, `${name} extraction marker exists`);
  assert.notEqual(end, -1, `${next} extraction marker exists`);
  return source.slice(start, end);
}
const stagedImportCode = `${extract('hydrateStagedOutputInPlace', 'completeStagedOutputImport')}\n${extract('completeStagedOutputImport', 'handleImport')}`;

function fixture({ read = async id => ({ id, title: 'Imported', mediaSources: [{ id: 'source-1' }] }), hydrate = async () => true } = {}) {
  const draft = { value: 'unsaved text draft' };
  const state = { assigned: [], replaced: [], events: [], hydrated: [], appended: [], text: '', aborted: false, disposed: false, controller: { signal: { get aborted() { return state.aborted; } } } };
  const targetStatus = {
    set textContent(value) { state.text = value; }, get textContent() { return state.text; },
    append(...nodes) { state.appended.push(...nodes); },
  };
  const context = {
    main: { dataset: { unifiedInput: 'true' }, dispatchEvent(event) { state.events.push(event); } },
    location: { origin: 'https://local.test', pathname: '/output/work/', href: 'https://local.test/output/work/?text=output', assign(url) { state.assigned.push(url); } },
    history: { state: { existing: true }, replaceState(next, _title, url) { state.replaced.push({ next, url }); } },
    pageDisposed: false, record: null, status: targetStatus,
    importController: null,
    readToolOutput: async id => { state.readId = id; return read(id); },
    hydrateOutputRecord: async (record, options) => { state.hydrated.push(record); state.isCurrent = options.isCurrent; return hydrate(record, options); },
    document: { createElement(tag) { return { tag, setAttribute() {} }; } },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    URL,
  };
  context.replaceOutputEntry = href => replaceOutputEntry(href, { location: context.location, history: context.history });
  vm.createContext(context);
  vm.runInContext(stagedImportCode, context);
  return { state, context, draft, targetStatus };
}

test('unified import hydrates staged record in place and keeps advanced pointer in history and cleans the URL', async () => {
  const { state, context, draft, targetStatus } = fixture();
  state.controller = { signal: { aborted: false } };
  context.importController = state.controller;
  const staged = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url: '/output/work/?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  const committed = await vm.runInContext('(staged, controller, targetStatus) => completeStagedOutputImport(staged, controller, targetStatus)', context)(staged, state.controller, targetStatus);
  assert.equal(committed, true);
  assert.equal(state.readId, staged.id);
  assert.equal(state.hydrated[0].id, staged.id);
  assert.equal(state.assigned.length, 0);
  assert.equal(state.replaced.length, 1);
  assert.equal(state.replaced[0].url, '/output/work/');
  assert.equal(state.replaced[0].next.pixieedOutputRequest.advanced, true);
  assert.equal(state.replaced[0].next.pixieedOutputRequest.id, staged.id);
  assert.equal(state.replaced[0].next.existing, true);
  assert.deepEqual(state.events.map(event => [event.type, event.detail.changed, event.detail.mutation]), [['pixieed:materials', true, 'import']]);
  assert.match(targetStatus.textContent, /追加しました/);
  assert.equal(draft.value, 'unsaved text draft');
});

test('non-unified imports retain the existing navigation behavior', async () => {
  const { state, context, targetStatus } = fixture();
  context.main.dataset.unifiedInput = 'false';
  const staged = { id: 'ordinary-id', url: '/output/work/?id=ordinary-id' };
  const committed = await vm.runInContext('(staged, controller, targetStatus) => completeStagedOutputImport(staged, controller, targetStatus)', context)(staged, state.controller, targetStatus);
  assert.equal(committed, false);
  assert.deepEqual(state.assigned, [staged.url]);
  assert.equal(state.readId, undefined);
});

test('an abort after read prevents hydration, navigation, and URL mutation', async () => {
  let resolveRead;
  const { state, context, draft, targetStatus } = fixture({ read: () => new Promise(resolve => { resolveRead = resolve; }) });
  state.controller = { signal: { get aborted() { return state.aborted; } } };
  context.importController = state.controller;
  const staged = { id: 'late-id', url: '/output/work/?id=late-id' };
  const pending = vm.runInContext('(staged, controller, targetStatus) => completeStagedOutputImport(staged, controller, targetStatus)', context)(staged, state.controller, targetStatus);
  state.aborted = true;
  resolveRead({ id: staged.id });
  assert.equal(await pending, false);
  assert.equal(state.hydrated.length, 0);
  assert.equal(state.assigned.length, 0);
  assert.equal(state.replaced.length, 0);
  assert.equal(state.appended.length, 0);
  assert.equal(draft.value, 'unsaved text draft');
});

test('a disposed page ignores a late staged record', async () => {
  let resolveRead;
  const { state, context, targetStatus } = fixture({ read: () => new Promise(resolve => { resolveRead = resolve; }) });
  state.controller = { signal: { aborted: false } };
  context.importController = state.controller;
  const staged = { id: 'disposed-id', url: '/output/work/?id=disposed-id' };
  const pending = vm.runInContext('(staged, controller, targetStatus) => completeStagedOutputImport(staged, controller, targetStatus)', context)(staged, state.controller, targetStatus);
  context.pageDisposed = true;
  resolveRead({ id: staged.id });
  assert.equal(await pending, false);
  assert.equal(state.hydrated.length, 0);
  assert.equal(state.replaced.length, 0);
  assert.equal(state.events.length, 0);
  assert.equal(state.appended.length, 0);
});

test('read or hydration failure reports the locally saved record and offers explicit resume', async () => {
  for (const options of [{ read: async () => { throw new Error('read unavailable'); } }, { hydrate: async () => { throw new Error('hydrate failed'); } }]) {
    const { state, context, draft, targetStatus } = fixture(options);
    state.controller = { signal: { aborted: false } };
    context.importController = state.controller;
    const staged = { id: 'saved-record', url: '/output/work/?id=saved-record' };
    const committed = await vm.runInContext('(staged, controller, targetStatus) => completeStagedOutputImport(staged, controller, targetStatus)', context)(staged, state.controller, targetStatus);
    assert.equal(committed, false);
    assert.match(targetStatus.textContent, /保存されました/);
    assert.equal(state.appended[0], ' ');
    assert.equal(state.appended[1].href, 'https://local.test/output/work/?id=saved-record&view=advanced');
    assert.equal(state.appended[1].target, '_blank');
    assert.equal(state.assigned.length, 0);
    assert.equal(draft.value, 'unsaved text draft');
  }
});


test('a disposed page receives no recovery DOM when its staged read rejects late', async () => {
  let rejectRead;
  const read = new Promise((_resolve, reject) => { rejectRead = reject; });
  const { state, context, targetStatus } = fixture({ read: () => read });
  context.importController = state.controller;
  const operation = context.completeStagedOutputImport({ id:'late', url:'/output/work/?id=late' }, state.controller, targetStatus);
  context.pageDisposed = true; rejectRead(new Error('late failed read'));
  assert.equal(await operation, false); assert.equal(state.appended.length, 0); assert.equal(state.replaced.length, 0);
});

test('cancellation in the hydration await boundary suppresses history and material publication', async () => {
  const h = fixture({ hydrate: async () => { h.state.aborted = true; return true; } });
  h.context.importController = h.state.controller;
  assert.equal(await h.context.completeStagedOutputImport({ id:'late', url:'/output/work/?id=late' }, h.state.controller, h.targetStatus), false);
  assert.equal(h.state.replaced.length, 0); assert.equal(h.state.events.length, 0);
});


test('a post-adoption rendering error exposes recovery outside the now-hidden start area', async () => {
  const recovery = { hidden:true, textContent:'', children:[], append(...nodes){this.children.push(...nodes);} };
  const h = fixture({ hydrate: async () => { h.context.record={id:'saved'};h.targetStatus.hidden=true;throw new Error('URL creation/render failed'); } });
  h.context.main.querySelector = selector => selector==='[data-sc-unified-recovery]' ? recovery : null;
  h.context.importController=h.state.controller;
  assert.equal(await h.context.completeStagedOutputImport({id:'saved',url:'/output/work/?id=saved'},h.state.controller,h.targetStatus),false);
  assert.equal(recovery.hidden,false);assert.match(recovery.textContent,/端末内に保存/);assert.equal(recovery.children[1].href,'https://local.test/output/work/?id=saved&view=advanced');
  assert.equal(h.state.assigned.length,0);
});
