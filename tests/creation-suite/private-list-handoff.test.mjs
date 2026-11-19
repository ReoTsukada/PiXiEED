import test from 'node:test';
import assert from 'node:assert/strict';
import { openPrivateList } from '../../js/creation/private-list-handoff.mjs';

function fixture() {
  let stored, href;
  const win = { location: new URL('https://pixieed.jp/draw/?pxd=private-id&connectionId=private-connection'),
    async fetch(url, options) {
      assert.equal(url, 'https://draw.pixieed.jp/library/ready.txt');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response('pixieed-library-v1');
    },
    sessionStorage: { setItem(_, value) { stored = JSON.parse(value); } } };
  win.self = win.top = win;
  const doc = { cookie: '', createElement() { return { click() { href = this.href; assert.equal(this.referrerPolicy, 'no-referrer'); } }; } };
  return { win, doc, get stored() { return stored; }, get href() { return href; } };
}
const original = { projectId: 'private-id', revisionId: 'private-revision' };
const item = { ...original, summary: { name: '非公開作品', thumbnail: { width: 1, height: 1, rgb: new Uint8Array([34, 56, 78]) } } };
async function unseal(f) {
  const url = new URL(f.href);
  assert.equal(url.origin + url.pathname, 'https://draw.pixieed.jp/library-import/');
  assert.equal(url.search, '');
  const env = JSON.parse(Buffer.from(url.hash.slice(1), 'base64url'));
  assert.deepEqual(Object.keys(env).sort(), ['cipher', 'id', 'iv', 'v']);
  const secret = f.doc.cookie.split(';')[0].split('=')[1];
  const key = await crypto.subtle.importKey('raw', Buffer.from(secret, 'base64url'), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(env.iv, 'base64url') }, key, Buffer.from(env.cipher, 'base64url'))));
}
test('only selection tickets, display names and tiny previews cross the boundary in ciphertext', async () => {
  const f = fixture();
  assert.equal(await openPrivateList(original, [item], f.win, f.doc), true);
  const [row] = await unseal(f);
  assert.deepEqual(Object.keys(row).sort(), ['thumb', 'ticket', 'title']);
  assert.equal(row.title, item.summary.name);
  assert.equal(Buffer.from(row.thumb,'base64url').length, 768);
  assert.equal(f.stored.choices[row.ticket], f.stored.original);
  assert.ok(f.stored.original.includes('pxd=private-id'));
  assert.ok(!f.stored.original.includes('connection'));
  assert.doesNotMatch(f.href, /private-id|private-revision|private-connection/);
});
test('large lists keep every selectable item without previews, or stay local on overflow', async () => {
  const f = fixture();
  assert.equal(await openPrivateList(original, Array(110).fill(item), f.win, f.doc), true);
  const rows = await unseal(f);
  assert.equal(rows.length, 110);
  assert.ok(rows.every(row => row.thumb === null));
  const g = fixture();
  assert.equal(await openPrivateList(original, Array(1201).fill(item), g.win, g.doc), false);
  assert.equal(g.href, undefined);
});

test('unavailable, unexpected and failed hosts keep the local list without staging secrets', async () => {
  for (const probe of [async () => { throw Error('DNS'); }, async () => new Response('unexpected'),
    async () => new Response('pixieed-library-v1', { status: 503 })]) {
    const f = fixture();
    f.win.fetch = probe;
    assert.equal(await openPrivateList(original, [item], f.win, f.doc), false);
    assert.equal(f.doc.cookie, '');
    assert.equal(f.href, undefined);
    assert.equal(f.stored, undefined);
  }
});
