// Manual local acceptance client. It uses the real MCP HTTP API, not browser internals.
// Run only against the empty disposable Draw document opened for this test.
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
const endpoint = process.env.MCP_TEST_ENDPOINT || 'http://127.0.0.1:4290/mcp';
let auth, state, savedFingerprint, id = 0;
const evidence = [];
const report = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function call(name, args = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) });
  const message = await response.json();
  if (message.error) throw new Error(JSON.stringify(message.error));
  if (message.result?.isError) throw new Error(message.result.content.map(item => item.text).join('\n'));
  return message.result.structuredContent;
}
async function read(extra = {}) { state = await call('get_draw_state', { ...auth, ...extra }); assert.ok(Number.isInteger(state.revision), JSON.stringify(state)); return state; }
async function edit(operation, { expectedRevision = state.revision, requestId = randomUUID(), expectedStatus = 'applied' } = {}) {
  const args = { ...auth, expectedRevision, requestId, operation };
  let result = await call('edit_draw', args);
  for (let n = 0; result.status === 'pending' && n < 3; n++) result = await call('edit_draw', args);
  assert.equal(result.status, expectedStatus, JSON.stringify(result));
  if (result.result?.state) state = result.result.state;
  else if (expectedStatus === 'applied') await read();
  evidence.push({ operation: operation.type, status: result.status, revision: state.revision });
  return result;
}
function compact() { return { revision: state.revision, projectBinding: state.projectBinding, width: state.width, height: state.height, paletteCount: state.palette.length, layers: state.layers, frames: state.frames, active: state.active, coloredPixels: state.cel.pixels.filter(x => x >= 0).length, saved: state.saved, dirty: state.dirty }; }
async function allContent() {
  const head = await read(); const cells = [];
  for (const frame of head.frames) for (const layer of head.layers.filter(x => x.role !== 'music')) {
    const cell = await read({ frameId: frame.id, layerId: layer.id }); cells.push({ frameId: frame.id, layerId: layer.id, pixels: cell.cel.pixels });
  }
  return { projectId: head.projectBinding.projectId, width: head.width, height: head.height, palette: head.palette, frames: head.frames, layers: head.layers, cells };
}
async function workflow() {
  await read(); assert.equal(state.width, 16); assert.equal(state.height, 16);
  assert.equal(state.cel.pixels.every(x => x < 0), true, 'Use an empty disposable Draw project');
  const first = { ...state.active }, oldRevision = state.revision;
  let result = await edit({ type: 'palette.add', color: '#d94755' });
  const red = result.result.index;
  result = await edit({ type: 'palette.add', color: '#81d9ad' }); const mint = result.result.index;
  const pixels = [];
  for (let y = 4; y <= 12; y++) for (let x = 3; x <= 11; x++) if (Math.abs(x - 7) + Math.abs(y - 8) <= 5) pixels.push({ x, y, colorIndex: red });
  await edit({ type: 'pixels.set', ...first, pixels }); assert.equal(state.cel.pixels[8 * 16 + 7], red);
  const requestId = randomUUID(), expectedRevision = state.revision;
  const repeated = { type: 'pixel.set', ...first, x: 7, y: 3, colorIndex: mint };
  await edit(repeated, { requestId, expectedRevision }); const afterOnce = state.revision;
  await edit(repeated, { requestId, expectedRevision }); assert.equal(state.revision, afterOnce);
  await edit({ type: 'pixel.set', ...first, x: 0, y: 0, colorIndex: red }, { expectedRevision: oldRevision, expectedStatus: 'not_applied' });
  await read(); assert.equal(state.cel.pixels[0], -1);
  await edit({ type: 'undo' }); assert.equal(state.cel.pixels[3 * 16 + 7], -1);
  await edit({ type: 'redo' }); assert.equal(state.cel.pixels[3 * 16 + 7], mint);
  result = await edit({ type: 'layer.add', name: 'MCP検証・光' }); const layerId = result.result.layerId;
  await edit({ type: 'pixel.set', frameId: first.frameId, layerId, x: 5, y: 6, colorIndex: mint });
  await edit({ type: 'layer.rename', layerId, name: 'MCP検証・ハイライト' });
  await edit({ type: 'layer.opacity', layerId, opacity: 0.75 }); assert.equal(state.layers.find(x => x.id === layerId).opacity, 0.75);
  await edit({ type: 'layer.visibility', layerId, visible: false }); await edit({ type: 'layer.visibility', layerId, visible: true });
  await edit({ type: 'layer.lock', layerId, locked: true });
  await edit({ type: 'pixel.set', frameId: first.frameId, layerId, x: 0, y: 0, colorIndex: red }, { expectedStatus: 'not_applied' });
  await read(); assert.equal(state.cel.pixels[0], -1);
  await edit({ type: 'layer.lock', layerId, locked: false });
  result = await edit({ type: 'layer.add', name: 'MCP検証・削除用' }); const removedLayer = result.result.layerId;
  await edit({ type: 'layer.remove', layerId: removedLayer }); assert.ok(!state.layers.some(x => x.id === removedLayer));
  await edit({ type: 'layer.select', layerId: first.layerId });
  result = await edit({ type: 'frame.add', sourceFrameId: first.frameId, copy: true }); const second = result.result.frameId;
  await edit({ type: 'frame.duration', frameId: second, durationMs: 250 }); assert.equal(state.frames.find(x => x.id === second).durationMs, 250);
  result = await edit({ type: 'frame.add', sourceFrameId: second, copy: false }); const removedFrame = result.result.frameId;
  await edit({ type: 'frame.remove', frameId: removedFrame }); assert.ok(!state.frames.some(x => x.id === removedFrame));
  await edit({ type: 'frame.move', frameId: second, index: 0 }); await edit({ type: 'frame.move', frameId: second, index: 1 });
  await edit({ type: 'frame.select', frameId: second });
  const beforeColor = [...state.palette];
  await edit({ type: 'color.adjust', scope: 'cel', frameId: second, layerId: first.layerId, settings: { brightness: 8, saturation: 115 } });
  assert.notDeepEqual(state.palette, beforeColor);
  const colored = state.cel.pixels.filter(x => x >= 0).length; assert.ok(colored > 20);
  const saved = await call('save_draw', { ...auth, expectedRevision: state.revision, requestId: randomUUID() });
  assert.equal(saved.status, 'applied', JSON.stringify(saved)); assert.equal(saved.result.storage, 'browser_local'); assert.equal(saved.result.dirtyAfter, false);
  const content = await allContent(); savedFingerprint = fingerprint(content);
  evidence.push({ operation: 'save_draw', status: saved.status, result: { savedRevisionId: saved.result.savedRevisionId, dirtyAfter: saved.result.dirtyAfter, storage: saved.result.storage }, contentSha256: savedFingerprint });
  return { pass: true, evidence, snapshot: compact(), contentSha256: savedFingerprint };
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
report({ ready: true, endpoint });
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try {
    const input = JSON.parse(line);
    if (input.command === 'pair') { const session = await call('connect_draw', { pairingCode: input.code }); auth = { connectionId: session.connectionId, accessToken: session.accessToken }; await read(); report({ paired: true, snapshot: compact() }); }
    else if (input.command === 'state') { await read(); report(compact()); }
    else if (input.command === 'workflow') report(await workflow());
    else if (input.command === 'verify') { if(input.expected) savedFingerprint=input.expected; const content = await allContent(); assert.equal(fingerprint(content), savedFingerprint); report({ reloadPersisted: true, contentSha256: savedFingerprint, snapshot: compact() }); }
    else if (input.command === 'edit') { await read(); report(await edit(input.operation)); }
    else if (input.command === 'save') { await read(); const result=await call('save_draw',{...auth,expectedRevision:state.revision,requestId:randomUUID()}); assert.equal(result.status,'applied'); report({saved:true,result:result.result}); }
    else if (input.command === 'large') { await read(); assert.equal(state.width,256); assert.equal(state.height,256); await edit({type:'pixel.set',...state.active,x:255,y:255,colorIndex:0}); assert.equal(state.cel.pixels[65535],0); const result=await call('save_draw',{...auth,expectedRevision:state.revision,requestId:randomUUID()}); assert.equal(result.status,'applied'); assert.equal(result.result.dirtyAfter,false); report({largeCanvasPass:true,pixelCount:state.cel.pixels.length,bottomRight:state.cel.pixels[65535],savedRevisionId:result.result.savedRevisionId}); }
    else if (input.command === 'disconnect') { report(await call('disconnect_draw', auth)); try { await read(); throw new Error('Revoked credentials still accepted'); } catch (error) { assert.match(error.message, /Invalid|expired|credential|認証|接続/i); report({ revokedCredentialRejected: true }); } }
    else if (input.command === 'quit') process.exit(0);
    else throw new Error('Unknown command');
  } catch (error) { report({ error: error.message }); }
}
