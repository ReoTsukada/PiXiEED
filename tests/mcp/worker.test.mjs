import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../scripts/mcp/worker.mjs';
import { decodePixelArt } from '../../js/mcp/pixel-art-contract.mjs';

const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const call = (body, extra = {}, env = {}) => worker.fetch(new Request('https://worker.test/mcp', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) }), env);
const rpc = (method, params = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });

test('health is fixed JSON and responses are non-cacheable', async () => {
  const response = await worker.fetch(new Request('https://worker.test/health'));
  assert.deepEqual(await response.json(), { ok: true, service: 'pixieed-mcp' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('initializes supported protocol and negotiates unknown version', async () => {
  for (const [requested, expected] of [['2025-03-26', '2025-03-26'], ['2025-06-18', '2025-06-18'], ['2030-01-01', '2025-06-18']]) {
    const response = await call(rpc('initialize', { protocolVersion: requested, capabilities: {}, clientInfo: { name: 'test', version: '1' } }, 'i'));
    const data = await response.json();
    assert.equal(data.result.protocolVersion, expected);
    assert.equal(response.headers.get('mcp-protocol-version'), expected);
    assert.deepEqual(data.result.capabilities, { tools: {} });
    assert.equal(data.result.serverInfo.name, 'PiXiEED');
  }
});

test('lists only two guarded tools and rejects unknown methods/tools', async () => {
  const response = await call(rpc('tools/list'));
  const tools = (await response.json()).result.tools;
  assert.deepEqual(tools.map((tool) => tool.name), ['list_pixieed_tools', 'prepare_pixel_art']);
  assert.ok(tools.every((tool) => typeof tool.title === 'string' && tool.outputSchema));
  assert.deepEqual(tools[0].outputSchema.required, ['tools']);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint && tool.annotations.idempotentHint && tool.annotations.destructiveHint === false && tool.annotations.openWorldHint === false));
  assert.equal((await (await call(rpc('unknown'))).json()).error.code, -32601);
  const missing = await call(rpc('tools/call', { name: 'unknown_tool', arguments: {} }));
  assert.equal((await missing.json()).error.code, -32602);
});

test('prepare produces a Draw preview link whose token restores exact art', async () => {
  const input = { title: '春', width: 3, height: 2, palette: ['#123456', '#abcdef'], rows: ['0.1', '110'] };
  const response = await call(rpc('tools/call', { name: 'prepare_pixel_art', arguments: input }));
  const result = (await response.json()).result;
  const data = result.structuredContent;
  assert.equal(data.status, 'preview_only');
  const token = new URL(data.previewUrl).hash.slice('#art='.length);
  assert.deepEqual(decodePixelArt(token), { ...input, palette: ['#123456', '#ABCDEF'] });
  assert.match(result.content[0].text, /保存・投稿はまだ行われていません/);
});

test('rejects extra and out-of-range art fields as tool errors', async () => {
  for (const argumentsValue of [
    { width: 1, height: 1, palette: ['#000000'], rows: ['0'], extra: true },
    { width: 1, height: 1, palette: ['#000000'], rows: ['1'] }
  ]) {
    const response = await call(rpc('tools/call', { name: 'prepare_pixel_art', arguments: argumentsValue }));
    assert.equal((await response.json()).result.isError, true);
  }
});

test('roundtrips a full 64 by 64 art payload through the prepared link', async () => {
  const input = { width: 64, height: 64, palette: ['#123456'], rows: ['0'.repeat(64), ...Array(63).fill('.'.repeat(64))] };
  const response = await call(rpc('tools/call', { name: 'prepare_pixel_art', arguments: input }));
  const { previewUrl } = (await response.json()).result.structuredContent;
  assert.deepEqual(decodePixelArt(new URL(previewUrl).hash.slice('#art='.length)), { ...input, title: 'AIで作ったドット絵', palette: ['#123456'] });
});

test('notifications, ping, method, and input errors follow JSON-RPC behavior', async () => {
  const notification = await call({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '');
  assert.deepEqual((await (await call(rpc('ping'))).json()).result, {});
  assert.equal((await (await call({ jsonrpc: '1.0', method: 'ping', id: 1 })).json()).error.code, -32600);
  for (const id of [null, []]) {
    const invalidId = await call({ jsonrpc: '2.0', method: 'ping', id });
    const invalidResult = await invalidId.json();
    assert.equal(invalidResult.error.code, -32600);
    assert.equal(invalidResult.id, null);
  }
  const malformed = await worker.fetch(new Request('https://worker.test/mcp', { method: 'POST', headers, body: '{' }));
  assert.equal((await malformed.json()).error.code, -32700);
});

test('validates content, accept, protocol, origin and exact response headers', async () => {
  assert.equal((await call(rpc('ping'), { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call(rpc('ping'), { accept: 'application/json' })).status, 406);
  assert.equal((await call(rpc('ping'), { 'mcp-protocol-version': '2030-01-01' })).status, 400);
  assert.equal((await call(rpc('ping'), { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(rpc('ping'), { origin: 'https://chatgpt.com' })).status, 200);
  const method = await worker.fetch(new Request('https://worker.test/mcp', { method: 'GET' }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');
});

test('rejects oversize bodies and JSON-RPC batches', async () => {
  const big = ' '.repeat(32 * 1024 + 1);
  assert.equal((await call(rpc('ping', { padding: big }))).status, 413);
  const falseLength = await worker.fetch(new Request('https://worker.test/mcp', {
    method: 'POST', headers: { ...headers, 'content-length': String(32 * 1024 + 1) }, body: JSON.stringify(rpc('ping'))
  }));
  assert.equal(falseLength.status, 413);
  const underreportedLength = await worker.fetch(new Request('https://worker.test/mcp', {
    method: 'POST', headers: { ...headers, 'content-length': '2' }, body: JSON.stringify(rpc('ping', { padding: big }))
  }));
  assert.equal(underreportedLength.status, 413);
  const batch = await call([rpc('ping', {}, 1), rpc('ping', {}, 2)]);
  assert.equal((await batch.json()).error.code, -32600);
});

test('rejects local origins containing paths or credentials', async () => {
  assert.equal((await call(rpc('ping'), { origin: 'http://localhost:4199/path' }, { ALLOW_LOCAL_ORIGIN: '1' })).status, 403);
  assert.equal((await call(rpc('ping'), { origin: 'http://user@localhost:4199' }, { ALLOW_LOCAL_ORIGIN: '1' })).status, 403);
});
