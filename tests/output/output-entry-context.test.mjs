import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUT_ENTRY_STATE, OUTPUT_PENDING_KEY, prepareOutputEntry, outputEntrySearch, replaceOutputEntry, navigateOutputEntry } from '../../js/creation/output-entry-context.mjs';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function context(path = '/draw/?pxd=private', data = new Map()) {
  const win = { location: new URL(path, 'https://pixieed.jp') };
  win.assigned = []; win.location.assign = href => win.assigned.push(href);
  win.sessionStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  win.history = { state: { preserved: 'state' }, replaceState(state, _, href) { this.state = state; win.location = new URL(href, win.location); } };
  win.links = []; win.document = { body: { append(link) { win.links.push(link); } }, createElement() { return { click() { this.clicked = true; }, remove() { this.removed = true; } }; } };
  return win;
}
test('new handoff URLs contain only a public entry marker and suppress the referrer', () => {
  for (const key of ['id', 'file']) for (const mode of ['draw', 'camera', 'audio']) {
    const win = context(`/${mode}/?pxd=private`);
    assert.equal(navigateOutputEntry(`/output/work/?${key}=${ID}`, win, win.location, () => 1000), true);
    assert.equal(win.links[0].href, '/output/work/?entry=1');
    assert.equal(win.links[0].rel, 'noreferrer'); assert.equal(win.links[0].referrerPolicy, 'no-referrer');
    assert.equal(win.links[0].clicked, true); assert.equal(win.links[0].removed, true);
    assert.equal(JSON.parse(win.sessionStorage.getItem(OUTPUT_PENDING_KEY)).id, ID);
    assert.equal(win.assigned.length, 0);
  }
});
test('handoff commits the pointer to history before consuming and survives reload/back', () => {
  const data = new Map(), from = context('/draw/', data);
  navigateOutputEntry(`/output/work/?id=${ID}&view=advanced`, from, from.location, () => 1000);
  const to = context('/output/work/?entry=1', data);
  assert.equal(prepareOutputEntry(to, () => 1100), true);
  assert.equal(to.location.search, ''); assert.equal(data.has(OUTPUT_PENDING_KEY), false);
  assert.equal(to.history.state.preserved, 'state');
  assert.equal(outputEntrySearch(to.location, to.history), `?id=${ID}&view=advanced`);
  assert.equal(prepareOutputEntry(to, () => 1200), false);
  const oldState = structuredClone(to.history.state);
  replaceOutputEntry(`/output/work/?file=${ID}`, to);
  assert.equal(outputEntrySearch(to.location, to.history), `?file=${ID}`);
  to.history.state = oldState;
  assert.equal(outputEntrySearch(to.location, to.history), `?id=${ID}&view=advanced`);
});
test('ordinary direct visits never consume pending handoffs; explicit legacy URL wins', () => {
  const win = context('/output/work/');
  win.sessionStorage.setItem(OUTPUT_PENDING_KEY, 'not json');
  assert.equal(prepareOutputEntry(win), false);
  assert.equal(outputEntrySearch(win.location, win.history), '');
  win.history.state[OUTPUT_ENTRY_STATE] = { version: 1, path: '/output/work/', key: 'id', id: ID, advanced: false };
  win.location = new URL('https://pixieed.jp/output/work/?file=legacy');
  assert.equal(outputEntrySearch(win.location, win.history), '?file=legacy');
});
test('missing, invalid, stale, future, or mismatched handoffs fail without erasing data', () => {
  for (const extra of [null, {}, { id: 'private' }, { createdAt: -7 * 86400000 }, { createdAt: 1001 }, { path: '/tools/start/convert/' }]) {
    const win = context('/output/work/?entry=1');
    const value = extra === null ? null : { version: 1, path: '/output/work/', key: 'id', id: ID, advanced: false, createdAt: 1000, ...extra };
    if (value) win.sessionStorage.setItem(OUTPUT_PENDING_KEY, JSON.stringify(value));
    if (extra && Object.keys(extra).length === 0) continue;
    const before = win.sessionStorage.getItem(OUTPUT_PENDING_KEY);
    assert.throws(() => prepareOutputEntry(win, () => 1000));
    assert.equal(win.sessionStorage.getItem(OUTPUT_PENDING_KEY), before);
    assert.equal(win.location.search, '?entry=1');
  }
});
test('history failure preserves the pending handoff; storage failure retains the legacy save path', () => {
  const win = context('/draw/');
  navigateOutputEntry(`/output/work/?id=${ID}`, win, win.location, () => 1000);
  win.location = new URL('https://pixieed.jp/output/work/?entry=1');
  win.history.replaceState = () => { throw new Error('history unavailable'); };
  assert.throws(() => prepareOutputEntry(win, () => 1001));
  assert.ok(win.sessionStorage.getItem(OUTPUT_PENDING_KEY));
  const blocked = context('/draw/'); blocked.sessionStorage.setItem = () => { throw new Error('blocked'); };
  assert.equal(navigateOutputEntry(`/output/work/?file=${ID}`, blocked), false);
  assert.deepEqual(blocked.assigned, [`https://pixieed.jp/output/work/?file=${ID}`]);
});
test('unknown or duplicate queries, external destinations and fragments cannot be wrapped', () => {
  for (const href of [`https://evil.test/output/work/?id=${ID}`, `/output/work/?id=${ID}&file=${ID}`, `/output/work/?id=${ID}&id=${ID}`, `/output/work/?id=${ID}#secret`, `/output/work/?id=${ID}&name=secret`]) {
    const win = context(); assert.throws(() => navigateOutputEntry(href, win)); assert.equal(win.links.length, 0); assert.equal(win.assigned.length, 0);
  }
});

test('a throwing sessionStorage getter falls back without blocking output', () => {
  const win = context('/draw/'); Object.defineProperty(win, 'sessionStorage', { get() { throw new Error('blocked'); } });
  assert.equal(navigateOutputEntry(`/output/work/?id=${ID}`, win), false);
  assert.equal(win.assigned.length, 1);
});

test('in-place staging retains the current converter entry path and its recovery identity', () => {
  const win = context('/tools/start/convert/?text=output'); win.history.state.pixieedConversionRecovery = 'kept';
  replaceOutputEntry(`/output/work/?id=${ID}&view=advanced`, win);
  assert.equal(win.location.pathname, '/tools/start/convert/'); assert.equal(win.location.search, '');
  assert.equal(win.history.state.pixieedConversionRecovery, 'kept');
  assert.equal(outputEntrySearch(win.location, win.history), `?id=${ID}&view=advanced`);
});

test('slow destination startup still receives the existing staged output', () => {
  const data = new Map(), from = context('/draw/', data);
  navigateOutputEntry(`/output/work/?id=${ID}`, from, from.location, () => 1000);
  const to = context('/output/work/?entry=1', data);
  assert.equal(prepareOutputEntry(to, () => 1000 + 2 * 3600000), true);
  assert.equal(outputEntrySearch(to.location, to.history), `?id=${ID}`);
});
