import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../scripts/mcp/worker.mjs';
import { GUIDE_VERSION } from '../../js/mcp/pixel-art-guide.mjs';
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

test('lists reference tools and scoped live Draw tools, then rejects unknown methods/tools', async () => {
  const response = await call(rpc('tools/list'));
  const tools = (await response.json()).result.tools;
  assert.deepEqual(tools.map((tool) => tool.name), ['list_pixieed_tools', 'get_pixel_art_guide', 'get_pixel_art_techniques', 'prepare_pixel_art', 'review_pixel_art', 'get_pixel_art_case', 'connect_draw', 'get_draw_state', 'edit_draw', 'save_draw', 'disconnect_draw']);
  assert.ok(tools.every((tool) => typeof tool.title === 'string' && tool.outputSchema));
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  assert.match(byName.get_pixel_art_guide.description, /任意/);
  assert.doesNotMatch(byName.get_pixel_art_guide.description, /前に呼びます|必須/);
  assert.match(byName.get_pixel_art_techniques.description, /任意/);
  assert.match(byName.get_pixel_art_case.description, /求めた場合/);
  assert.match(byName.prepare_pixel_art.description, /このツール自体はDrawのライブ画面を操作せず/);
  assert.doesNotMatch(byName.prepare_pixel_art.description, /制作ガイドに基づいて/);
  assert.match(byName.review_pixel_art.description, /任意/);
  assert.deepEqual(tools[0].outputSchema.required, ['tools']);
  assert.ok(tools.slice(0, 6).every((tool) => tool.annotations.readOnlyHint && tool.annotations.idempotentHint && tool.annotations.destructiveHint === false && tool.annotations.openWorldHint === false));
  assert.equal(byName.get_draw_state.annotations.readOnlyHint, true);
  assert.equal(byName.edit_draw.annotations.destructiveHint, true);
  assert.equal(byName.save_draw.annotations.destructiveHint, false);
  assert.equal(byName.disconnect_draw.annotations.readOnlyHint, false);
  assert.equal(byName.disconnect_draw.annotations.destructiveHint, true);
  assert.match(byName.disconnect_draw.description, /Invalidate the agent credential/);
  assert.match(byName.disconnect_draw.description, /An operation already in progress may have applied and is not rolled back/);
  assert.deepEqual(byName.edit_draw.inputSchema.properties.operation.oneOf.find(op => op.properties.type.const === 'pixels.set').properties.pixels.maxItems, 512);
  assert.equal(byName.get_draw_state.outputSchema.anyOf[0].properties.width.maximum, 1028);
  assert.equal(byName.get_draw_state.outputSchema.anyOf[0].properties.capabilities.properties.maxReadPixels.const, 65536);
  assert.equal(byName.get_draw_state.inputSchema.properties.includePixels.type, 'boolean');
  assert.ok(byName.get_draw_state.inputSchema.properties.region.properties.width);
  assert.equal(byName.edit_draw.inputSchema.properties.responseMode.enum[1], 'summary');
  assert.equal(byName.save_draw.inputSchema.properties.responseMode.enum[1], 'summary');
  const editTypes = byName.edit_draw.inputSchema.properties.operation.oneOf.map(operation => operation.properties.type.const);
  for (const type of ['stroke', 'shape', 'fill', 'spray', 'cel.clear', 'palette.replace', 'selection.transform', 'canvas.resize', 'canvas.scale', 'batch', 'normal.configure', 'normal.generate', 'text.draw', 'view.configure']) assert.ok(editTypes.includes(type), type);
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
  assert.match(result.content[0].text, /利用者の依頼に沿って次に行うことを判断/);
  assert.doesNotMatch(result.content[0].text, /制作ガイドに照らして|修正後に再度プレビュー/);
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

test('guide is routed by subject and size and its browser URL preserves public conditions', async () => {
  const input = { subject: 'food', width: 64, height: 48, materials: ['organic', 'glass'], animated: true, normalMap: true };
  const result = (await (await call(rpc('tools/call', { name: 'get_pixel_art_guide', arguments: input }))).json()).result;
  assert.equal(result.isError, undefined);
  const guide = result.structuredContent;
  assert.equal(guide.guideVersion, GUIDE_VERSION);
  assert.deepEqual(guide.request, { ...input, style: 'neutral' });
  assert.ok(guide.steps.some(step => step.id === 'food'));
  assert.ok(!guide.steps.some(step => step.id === 'character'));
  assert.match(guide.limitations.join(' '), /静止カラー画像/);
  const url = new URL(guide.guideUrl);
  assert.equal(url.pathname, '/ai/guide/');
  for (const key of ['subject', 'width', 'height', 'animated', 'normalMap']) assert.equal(url.searchParams.get(key), String(input[key]));
  assert.equal(url.searchParams.get('materials'), 'organic,glass');
  assert.match(result.content[0].text, /制作ガイド/);
  assert.doesNotMatch(JSON.stringify(guide), /\/Users\/|tsukadareine|\.codex/);
});

test('guide errors remain read-only tool errors, with no image or import link', async () => {
  for (const input of [{ subject: 'character', width: 65, height: 16 }, { subject: 'character', width: 16, height: 16, projectId: 'existing' }]) {
    const result = (await (await call(rpc('tools/call', { name: 'get_pixel_art_guide', arguments: input }))).json()).result;
    assert.equal(result.isError, true);
    assert.equal(result.content.some(item => item.type === 'image'), false);
    assert.equal(result.structuredContent, undefined);
  }
});

test('prepare returns real PNGs with exact dimensions and never certifies visual quality', async () => {
  const input = { width: 16, height: 16, palette: ['#AC3344', '#AC3344', '#123456'], rows: ['00' + '.'.repeat(14), ...Array(15).fill('.'.repeat(16))] };
  const result = (await (await call(rpc('tools/call', { name: 'prepare_pixel_art', arguments: input }))).json()).result;
  const data = result.structuredContent;
  const images = result.content.filter(item => item.type === 'image');
  assert.equal(images.length, 2);
  assert.equal(data.status, 'preview_only');
  assert.equal(data.inspection.technicalStatus, 'passed');
  assert.equal(data.inspection.visualStatus, 'not_assessed');
  assert.equal(data.inspection.metrics.usedColors, 1);
  assert.equal(data.inspection.metrics.paletteEntries, 3);
  assert.equal(data.inspection.metrics.transparentPixels, 254);
  assert.deepEqual(data.inspection.metrics.bounds, { x: 0, y: 0, width: 2, height: 1 });
  for (let i = 0; i < images.length; i += 1) {
    const png = Buffer.from(images[i].data, 'base64');
    assert.equal(images[i].mimeType, 'image/png');
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), data.inspection.previews[i].width);
    assert.equal(png.readUInt32BE(20), data.inspection.previews[i].height);
  }
  assert.deepEqual(data.inspection.previews[0], { kind: 'native', width: 16, height: 16 });
  assert.match(result.content[0].text, /見た目の完成度は未判定/);
  assert.deepEqual(decodePixelArt(new URL(data.previewUrl).hash.slice('#art='.length)), { ...input, title: 'AIで作ったドット絵' });
});

test('initial instructions distinguish browser Draw operations from remote MCP and keep references optional', async () => {
  const result = (await (await call(rpc('initialize', { protocolVersion: '2025-06-18' }))).json()).result;
  assert.equal(result.serverInfo.version, '0.6.0');
  for (const term of ['get_pixel_art_guide', 'prepare_pixel_art', 'connect_draw', 'edit_draw', 'Draw画面で利用者が一時接続', '任意の参考情報', 'preview_only']) {
    assert.ok(result.instructions.includes(term), term);
  }
  assert.match(result.instructions, /batch/);
  assert.match(result.instructions, /capabilities\.fastEdits/);
  assert.match(result.instructions, /同じrequestId/);
});

test('style and reference observations reach the guide but private descriptions stay out of URLs', async () => {
  const referenceStyle = {
    status: 'observed', summary: '参考画像だけの固有な説明',
    palette: ['#ab2255', '#223366'], lighting: '暖色の光、青紫の影',
    detail: '小さな模様を面へ統合'
  };
  for (const style of ['neutral', 'modern', 'haikara', 'nostalgic_rpg']) {
    const result = (await (await call(rpc('tools/call', { name: 'get_pixel_art_guide', arguments: {
      subject: 'character', width: 16, height: 16, style, referenceStyle
    } }))).json()).result;
    assert.equal(result.isError, undefined);
    const guide = result.structuredContent;
    assert.equal(guide.request.style, style);
    assert.deepEqual(guide.request.referenceStyle.palette, ['#AB2255', '#223366']);
    assert.equal(guide.request.referenceStyle.summary, referenceStyle.summary);
    assert.ok(guide.steps.some(step => step.id === 'reference-style' && step.body.includes(referenceStyle.summary)));
    assert.match(guide.limitations.join(' '), /ホストAI/);
    const url = new URL(guide.guideUrl);
    assert.equal(url.searchParams.get('style'), style);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['height', 'style', 'subject', 'width']);
    assert.equal(decodeURIComponent(guide.guideUrl).includes(referenceStyle.summary), false);
    assert.match(result.content[0].text, /参考画像の分析文は含みません/);
  }
  const described = (await (await call(rpc('tools/call', { name: 'get_pixel_art_guide', arguments: {
    subject: 'food', width: 32, height: 32, referenceStyle: { status: 'described_only', summary: '青い影を希望' }
  } }))).json()).result.structuredContent;
  assert.match(described.limitations.join(' '), /実見を確認していません/);
  assert.equal(described.steps.at(-1).id, 'review');
});

test('style schema and runtime reject unsupported or malformed settings', async () => {
  const listed = (await (await call(rpc('tools/list'))).json()).result.tools;
  const guide = listed.find(tool => tool.name === 'get_pixel_art_guide');
  assert.deepEqual(guide.inputSchema.properties.style.enum, ['neutral', 'modern', 'haikara', 'nostalgic_rpg']);
  assert.ok(guide.outputSchema.properties.request.properties.referenceStyle);
  assert.equal(guide.inputSchema.properties.referenceStyle.additionalProperties, false);
  for (const extra of [
    { style: 'unknown' },
    { referenceStyle: { status: 'analyzed_by_server', summary: 'test' } },
    { referenceStyle: { status: 'observed', summary: 'test', imageUrl: 'https://example.com/private.png' } },
    { referenceStyle: { status: 'observed', summary: 'x'.repeat(401) } }
  ]) {
    const result = (await (await call(rpc('tools/call', { name: 'get_pixel_art_guide', arguments: { subject: 'character', width: 16, height: 16, ...extra } }))).json()).result;
    assert.equal(result.isError, true);
  }
});

test('MCP conditional techniques and review preserve explicit dimensions and observation boundaries',async()=>{
 const args={subject:'object',width:32,height:32,materials:['glass'],expression:{lighting:'directional',occupancy:{width:12,height:12}}};
 const result=(await(await call(rpc('tools/call',{name:'get_pixel_art_techniques',arguments:args}))).json()).result;
 assert.ok(result.structuredContent.techniques.some(t=>t.id==='transparency-edges'));
 assert.equal(result.structuredContent.request.expression.occupancy.width,12);
 const art={width:1,height:1,palette:['#123456'],rows:['0']};
 const review=(await(await call(rpc('tools/call',{name:'review_pixel_art',arguments:{art,before:art}}))).json()).result;
 assert.equal(review.structuredContent.visual.status,'not_assessed');
 assert.equal(review.structuredContent.technical.comparison.changedPixels,0);
 const missing=(await(await call(rpc('tools/call',{name:'get_pixel_art_case',arguments:{id:'missing'}}))).json()).result;
 assert.equal(missing.isError,true);
});

test('MCP example outputs label user acceptance separately and expose the accepted deer evidence',async()=>{
 const result=(await(await call(rpc('tools/call',{name:'get_pixel_art_techniques',arguments:{subject:'other',width:64,height:64,materials:['organic']}}))).json()).result;
 const example=result.structuredContent.cases.find(item=>item.id==='animal-64');
 assert.equal(example.userAcceptance,'accepted');
 assert.equal(example.internalDecision,'improved');
 assert.match(result.content[0].text,/ユーザー採用済み/);
 const caseResult=(await(await call(rpc('tools/call',{name:'get_pixel_art_case',arguments:{id:'animal-64'}}))).json()).result;
 assert.equal(caseResult.structuredContent.case.userAcceptance,'accepted');
 assert.equal(caseResult.structuredContent.case.internalDecision,'improved');
 assert.equal(caseResult.content.filter(item=>item.type==='image').length,2);
});

test('unconfigured or unavailable live admission fails closed while stateless previews continue', async () => {
  let sessions = 0;
  const env = { DRAW_SESSIONS: { idFromName() { sessions++; throw Error('must not create'); } } };
  const create = await worker.fetch(new Request('https://worker.test/draw-sessions', {
    method: 'POST', headers: { origin: 'https://pixieed.jp', 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.17' },
    body: JSON.stringify({ projectBinding: { projectId: 'project-1', openEpoch: 'open-1' } })
  }), env);
  assert.equal(create.status, 503); assert.equal(sessions, 0);
  const preview = await call(rpc('tools/call', { name: 'prepare_pixel_art', arguments: { width: 1, height: 1, palette: ['#000000'], rows: ['0'] } }), {}, env);
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).result.structuredContent.status, 'preview_only');
});
