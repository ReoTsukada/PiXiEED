import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adoptSocialHandoff, consumeSocialHandoff, creatorLinks, getSocialReturnUrl, navigateToSocialReturn,
  loadSocialOutput, socialOutputUrl
} from '../../js/social/tool-handoff.mjs';

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); },
    values
  };
}

function page(path, search = '') {
  const sessionStorage = storage();
  const localStorage = storage();
  const location = { href: 'https://pixieed.test' + path + search, pathname: path, search, origin: 'https://pixieed.test' };
  const windowRef = { location, sessionStorage, localStorage };
  windowRef.parent = windowRef;
  return { windowRef, location, sessionStorage, localStorage };
}

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const pngBase64 = Buffer.from(pngBytes).toString('base64');
const drawKey = 'PiXiEED:draw-handoff:v1';
const puzzleKey = 'PiXiEED:puzzle-handoff:v1';
const puzzleMetaKey = 'PiXiEED:puzzle-handoff-meta:v1';
const uuid = '11111111-1111-4111-8111-111111111111';

test('social return requires the explicit flag on a supported full-tool route', () => {
  assert.equal(getSocialReturnUrl({ pathname: '/draw/', search: '' }), null);
  assert.equal(getSocialReturnUrl({ pathname: '/draw/', search: '?social=0' }), null);
  assert.equal(getSocialReturnUrl({ pathname: '/other/', search: '?social=1' }), null);
  assert.equal(getSocialReturnUrl({ pathname: '/draw/', search: '?social=1&workspace=1' }), '/feed/?compose=draw');
  assert.equal(getSocialReturnUrl({ pathname: '/camera/', search: '?workspace=1&social=1' }), '/feed/?compose=pixel-camera');
  assert.equal(getSocialReturnUrl({ pathname: '/spot-difference/', search: '?social=1' }), '/feed/?compose=spot-difference');
  assert.equal(getSocialReturnUrl({ pathname: '/hidden-object/', search: '?social=1' }), '/feed/?compose=hidden-object');
  assert.equal(getSocialReturnUrl({ pathname: '/jigsaw/', search: '?social=1' }), '/feed/?compose=jigsaw');
  assert.equal(getSocialReturnUrl({ pathname: '/draw/', search: '?social=1&workspace=1&campaign=kept&mode=edit', hash: '#canvas' }), '/feed/?campaign=kept&compose=draw#canvas');
  assert.equal(getSocialReturnUrl({ pathname: '/draw/', search: '?social=1&mode=camera', kind: 'pixel-camera' }), '/feed/?compose=pixel-camera');
  assert.equal(getSocialReturnUrl({ pathname: '/audio/', search: '?social=1', kind: 'draw' }), '/feed/?compose=draw');
  assert.equal(getSocialReturnUrl({ pathname: '/other/', search: '?social=1', kind: 'draw' }), null);
  assert.deepEqual(creatorLinks.map((item) => item.kind), ['draw', 'pixel-camera', 'spot-difference', 'jigsaw', 'hidden-object']);
});

test('same-origin iframe redirects only with a validated tool host', () => {
  const childLocation = { href: 'https://pixieed.test/draw/?social=1', pathname: '/draw/', search: '?social=1', origin: 'https://pixieed.test' };
  const calls = [];
  const parent = { location: { origin: 'https://pixieed.test', assign: (url) => calls.push(url) } };
  const child = { location: childLocation, parent };
  assert.equal(navigateToSocialReturn({ windowRef: child, locationRef: childLocation }), false);
  child.__PIXIEED_TOOL_EMBED__ = { role: 'draw', channel: uuid };
  assert.equal(navigateToSocialReturn({ windowRef: child, locationRef: childLocation }), true);
  assert.deepEqual(calls, ['/feed/?compose=draw']);
  child.__PIXIEED_TOOL_EMBED__.channel = 'invalid';
  calls.length = 0;
  assert.equal(navigateToSocialReturn({ windowRef: child, locationRef: childLocation }), false);
  assert.deepEqual(calls, []);
});

test('validated camera-studio iframe uses only the same-origin outer host route and query', () => {
  const childLocation = { href: 'https://pixieed.test/pixel-camera-studio.html', pathname: '/pixel-camera-studio.html', search: '', hash: '', origin: 'https://pixieed.test' };
  const calls = [];
  const parent = {
    location: {
      href: 'https://pixieed.test/camera/?workspace=1&social=1&campaign=host#capture',
      pathname: '/camera/', search: '?workspace=1&social=1&campaign=host', hash: '#capture', origin: 'https://pixieed.test',
      assign: (url) => calls.push(url)
    }
  };
  const child = { location: childLocation, parent, __PIXIEED_TOOL_EMBED__: { role: 'camera', channel: uuid } };
  assert.equal(navigateToSocialReturn({ windowRef: child, locationRef: childLocation }), true);
  assert.deepEqual(calls, ['/feed/?campaign=host&compose=pixel-camera#capture']);
  parent.location.origin = 'https://other.test';
  calls.length = 0;
  assert.equal(navigateToSocialReturn({ windowRef: child, locationRef: childLocation }), false);
  assert.deepEqual(calls, []);
});

test('draw handoff adoption keeps the validated PNG bytes and receipt without consuming it', async () => {
  const env = page('/feed/', '?compose=draw');
  const serialized = JSON.stringify({ source: 'draw', revisionId: 'revision-a', createdAt: 1000, dataUrl: 'data:image/png;base64,' + pngBase64 });
  env.sessionStorage.setItem(drawKey, serialized);
  const adopted = await adoptSocialHandoff('draw', { ...env, now: 1001 });
  assert.equal(adopted.kind, 'draw');
  assert.equal(adopted.source, 'draw');
  assert.equal(adopted.image.mimeType, 'image/png');
  assert.equal(adopted.image.revisionId, 'revision-a');
  assert.deepEqual(new Uint8Array(await adopted.image.file.arrayBuffer()), pngBytes);
  assert.equal(adopted.image.dataUrl, 'data:image/png;base64,' + pngBase64);
  assert.equal(env.sessionStorage.getItem(drawKey), serialized);
});

test('expired or route-mismatched source handoffs are not adopted', async () => {
  const env = page('/feed/', '?compose=draw');
  env.sessionStorage.setItem(drawKey, JSON.stringify({
    source: 'draw', revisionId: 'r', createdAt: 1, dataUrl: 'data:image/png;base64,' + pngBase64
  }));
  assert.equal(await adoptSocialHandoff('draw', { ...env, now: 600_002 }), null);
  env.location.href = 'https://pixieed.test/feed/?compose=pixel-camera';
  env.location.search = '?compose=pixel-camera';
  assert.equal(await adoptSocialHandoff('draw', { ...env, now: 2 }), null);
});

test('puzzle adoption preserves the canonical payload and metadata and consumes only the exact snapshot', async () => {
  const env = page('/feed/', '?compose=spot-difference');
  const serialized = JSON.stringify({
    version: 1, mode: 'spot_difference', createdAt: 100, expiresAt: 2000,
    payload: {
      image: { mimeType: 'image/png', size: pngBytes.length, width: 1, height: 1, colorCount: 1, base64: pngBase64 },
      puzzle: { mode: 'spot_difference', definition: { schemaVersion: 1 }, source: { schemaVersion: 1 } }
    }
  });
  const meta = JSON.stringify({ title: 'Test puzzle', caption: 'caption', pin: null });
  env.sessionStorage.setItem(puzzleKey, serialized);
  env.sessionStorage.setItem(puzzleMetaKey, meta);
  const adopted = await adoptSocialHandoff('spot-difference', { ...env, now: 101 });
  assert.equal(adopted.mode, 'spot_difference');
  assert.equal(adopted.payload.puzzle.mode, 'spot_difference');
  assert.equal(adopted.metadata.title, 'Test puzzle');
  assert.deepEqual(new Uint8Array(await adopted.image.file.arrayBuffer()), pngBytes);
  assert.equal(env.sessionStorage.has(puzzleKey), true);
  env.sessionStorage.setItem(puzzleKey, serialized + ' ');
  assert.equal(consumeSocialHandoff(adopted.receipt, env.windowRef), false);
  assert.equal(env.sessionStorage.has(puzzleKey), true);
  assert.equal(consumeSocialHandoff({ ...adopted.receipt, key: 'unrelated-key' }, env.windowRef), false);
  assert.equal(env.sessionStorage.has(puzzleKey), true);
  env.sessionStorage.setItem(puzzleKey, serialized);
  assert.equal(consumeSocialHandoff(adopted.receipt, env.windowRef), true);
  assert.equal(env.sessionStorage.has(puzzleKey), false);
  assert.equal(env.sessionStorage.has(puzzleMetaKey), false);
});

test('camera source remains local-storage backed and successful consumption is compare-and-delete', async () => {
  const env = page('/feed/', '?compose=pixel-camera');
  const serialized = JSON.stringify({ dataUrl: 'data:image/png;base64,' + pngBase64, createdAt: 200 });
  env.localStorage.setItem('PiXiEED:camera-handoff:v1', serialized);
  const adopted = await adoptSocialHandoff('pixel-camera', { ...env, now: 201 });
  assert.equal(adopted.kind, 'pixel-camera');
  assert.equal(adopted.source, 'pixel-camera');
  assert.deepEqual(new Uint8Array(await adopted.image.file.arrayBuffer()), pngBytes);
  assert.equal(consumeSocialHandoff(adopted.receipt, env.windowRef), true);
  assert.equal(env.localStorage.has('PiXiEED:camera-handoff:v1'), false);
});

test('social output reader returns the exact audio Blob and local vault metadata', async () => {
  const blob = new Blob(['synthetic converted m4a bytes'], { type: 'audio/mp4' });
  const sourceBlob = new Blob(['synthetic original wav bytes'], { type: 'audio/wav' });
  const record = {
    id: uuid, blob, sourceBlob, sourceFilename: 'original-song.wav', mime: 'audio/wav', filename: 'converted-song.m4a',
    metadata: { durationSeconds: 3 }, returnUrl: '/draw/?social=1&outputId=' + uuid, expiresAt: 999
  };
  const result = await loadSocialOutput(uuid, {
    now: () => 100,
    indexedDBRef: {},
    readToolOutput: async (id, options) => { assert.equal(id, uuid); assert.equal(options.now(), 100); return record; }
  });
  assert.equal(result.blob, sourceBlob);
  assert.equal(result.sourceBlob, sourceBlob);
  assert.equal(result.currentBlob, blob);
  assert.equal(result.mime, 'audio/wav');
  assert.equal(result.filename, 'original-song.wav');
  assert.equal(result.metadata.durationSeconds, 3);
  assert.equal(result.expiresAt, 999);
  assert.equal(result.returnUrl, record.returnUrl);
  assert.equal(socialOutputUrl(uuid), '/feed/?output=' + uuid);
  assert.equal(socialOutputUrl('not-an-id'), null);
  assert.equal(await loadSocialOutput(uuid, { readToolOutput: async () => ({ ...record, sourceBlob: new Blob(['image'], { type: 'image/png' }) }) }), null);
});
test('explicit new puzzle handoff retains local self-play source and public preparation intent without sending',async()=>{
 const env=page('/feed/','?compose=hidden-object');
 const id='11111111-1111-4111-8111-111111111111';
 const serialized=JSON.stringify({version:1,mode:'hidden_object',destination:'feed',localDraftId:id,publicationIntent:'public',createdAt:100,expiresAt:2000,payload:{image:{mimeType:'image/png',size:pngBytes.length,width:1,height:1,colorCount:1,base64:pngBase64},puzzle:{mode:'hidden_object',definition:{schemaVersion:1},source:{schemaVersion:1}}}});
 env.sessionStorage.setItem(puzzleKey,serialized);
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected external request');};
 try {
  const adopted=await adoptSocialHandoff('hidden-object',{...env,now:101});
  assert.deepEqual(adopted.localPuzzle,{mode:'hidden_object',draftId:id});assert.equal(adopted.publicationIntent,'public');
  assert.equal(calls,0);assert.equal(env.sessionStorage.has(puzzleKey),true);
 }finally{globalThis.fetch=original;}
});
