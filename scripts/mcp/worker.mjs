import { getToolCatalog } from '../../js/mcp/tool-catalog.mjs';
import { encodePixelArt, normalizePixelArt, PIXEL_ART_INPUT_SCHEMA } from '../../js/mcp/pixel-art-contract.mjs';

const DEFAULT_ORIGIN = 'https://pixieed.jp';
const DEFAULT_PROTOCOL = '2025-03-26';
const SUPPORTED_PROTOCOLS = new Set(['2025-03-26', '2025-06-18']);
const MAX_BODY_BYTES = 32 * 1024;
const SERVER_INSTRUCTIONS = 'ユーザーのAIが絵を設計し、当ツールは検査してDrawリンクを生成するだけです。サイトツールの案内はできますが、既存作品の読取・公開投稿・撮影操作はできません。';

function jsonResponse(value, status = 200, extra = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  });
  return new Response(value === null ? null : JSON.stringify(value), { status, headers });
}

function httpError(message, status, headers = {}) {
  return jsonResponse({ error: message }, status, headers);
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validId(id) {
  return typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
}

function localOrigin(origin) {
  try {
    const url = new URL(origin);
    return origin === url.origin && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

function allowedOrigin(origin, env) {
  return origin === 'https://pixieed.jp' || origin === 'https://chatgpt.com' ||
    (env?.ALLOW_LOCAL_ORIGIN === '1' && localOrigin(origin));
}

function siteOrigin(env) {
  const candidate = env?.SITE_ORIGIN;
  if (!candidate) return DEFAULT_ORIGIN;
  let url;
  try { url = new URL(candidate); } catch { throw new TypeError('SITE_ORIGIN must be an origin URL.'); }
  if (url.origin !== candidate.replace(/\/$/, '') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('SITE_ORIGIN must contain only an origin.');
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(env?.ALLOW_LOCAL_ORIGIN === '1' && isLocal && url.protocol === 'http:')) {
    throw new TypeError('SITE_ORIGIN must use HTTPS.');
  }
  return url.origin;
}

function toolDefinitions() {
  const catalog = getToolCatalog();
  if (!Array.isArray(catalog)) throw new TypeError('Tool catalog must be an array.');
  const list = {
    title: 'PiXiEEDツール一覧',
    name: 'list_pixieed_tools',
    description: 'PiXiEEDの利用可能なサイトツールを一覧します。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: {
      type: 'object', additionalProperties: false, required: ['tools'],
      properties: {
        tools: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'name', 'url', 'description', 'relatedTools', 'mcpSupport'],
            properties: {
              id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string', format: 'uri' },
              description: { type: 'string' }, relatedTools: { type: 'array', items: { type: 'string' } },
              mcpSupport: { enum: ['pixel_art_preview', 'guide_only'] }
            }
          }
        }
      }
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };
  const prepare = {
    title: 'ドット絵プレビューを準備',
    name: 'prepare_pixel_art',
    description: 'ドット絵データを検査し、PiXiEED Drawで確認するプレビューリンクを作ります。保存や投稿はしません。',
    inputSchema: PIXEL_ART_INPUT_SCHEMA,
    outputSchema: {
      type: 'object', additionalProperties: false,
      required: ['title', 'width', 'height', 'previewUrl', 'status'],
      properties: {
        title: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' },
        previewUrl: { type: 'string', format: 'uri' }, status: { const: 'preview_only' }
      }
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };
  return [list, prepare];
}

function mcpResult(value, text) {
  return { content: [{ type: 'text', text }], structuredContent: value };
}

async function handleCall(params, env) {
  if (!isRecord(params) || typeof params.name !== 'string' || (params.arguments !== undefined && !isRecord(params.arguments))) {
    return { isError: true, content: [{ type: 'text', text: 'ツール名または引数の形式を確認してください。' }] };
  }
  const args = params.arguments ?? {};
  if (params.name === 'list_pixieed_tools') {
    if (Object.keys(args).length) return { isError: true, content: [{ type: 'text', text: 'このツールに引数は指定できません。' }] };
    return mcpResult({ tools: getToolCatalog() }, JSON.stringify(getToolCatalog()));
  }
  if (params.name === 'prepare_pixel_art') {
    try {
      const art = normalizePixelArt(args);
      const token = encodePixelArt(art);
      const result = { title: art.title, width: art.width, height: art.height, previewUrl: `${siteOrigin(env)}/ai/#art=${token}`, status: 'preview_only' };
      return mcpResult(result, `[Drawで確認する](${result.previewUrl})\n\n保存・投稿はまだ行われていません。利用者がリンクを開いて確定してください。`);
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof TypeError ? error.message : 'ドット絵を処理できませんでした。' }] };
    }
  }
  return null;
}

async function readJson(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  if (!request.body) throw Object.assign(new Error('Request body required.'), { status: 400, rpcCode: -32600 });
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error('Request body too large.'), { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400, rpcCode: -32700 }); }
}

function protocolFor(request) {
  const version = request.headers.get('mcp-protocol-version');
  if (version && !SUPPORTED_PROTOCOLS.has(version)) return { error: true };
  return { version: version || DEFAULT_PROTOCOL };
}

async function dispatch(message, request, env, protocol) {
  if (Array.isArray(message)) return rpcError(null, -32600, 'Invalid Request');
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(null, -32600, 'Invalid Request');
  const notification = !Object.hasOwn(message, 'id');
  if (!notification && !validId(message.id)) return rpcError(null, -32600, 'Invalid Request');
  const id = notification ? null : message.id;
  const params = message.params;
  if (message.method.startsWith('notifications/')) {
    return ['notifications/initialized', 'notifications/cancelled'].includes(message.method) && notification ? null : (notification ? null : rpcError(id, -32600, 'Invalid Request'));
  }
  if (notification) return null;
  if (message.method === 'initialize') {
    if (!isRecord(params) || typeof params.protocolVersion !== 'string') return rpcError(id, -32602, 'Invalid params');
    const requested = params.protocolVersion;
    const version = SUPPORTED_PROTOCOLS.has(requested) ? requested : '2025-06-18';
    return { jsonrpc: '2.0', id, result: { protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: 'PiXiEED', version: '0.1.0' }, instructions: SERVER_INSTRUCTIONS } };
  }
  if (message.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (message.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: toolDefinitions() } };
  if (message.method === 'tools/call') {
    const result = await handleCall(params, env);
    if (result === null) return rpcError(id, -32602, 'Unknown tool');
    return { jsonrpc: '2.0', id, result };
  }
  return rpcError(id, -32601, 'Method not found');
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return jsonResponse({ ok: true, service: 'pixieed-mcp' });
    if (url.pathname !== '/mcp') return httpError('Not found.', 404);
    if (!['POST'].includes(request.method)) return httpError('Method not allowed.', 405, { Allow: 'POST' });

    const origin = request.headers.get('origin');
    if (origin && !allowedOrigin(origin, env)) return httpError('Origin not allowed.', 403);
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return httpError('Content-Type must be application/json.', 415);
    const accepts = (request.headers.get('accept') || '').split(',').map((part) => part.trim().split(';')[0].toLowerCase());
    if (!accepts.includes('application/json') || !accepts.includes('text/event-stream')) return httpError('Accept must include application/json and text/event-stream.', 406);
    const protocol = protocolFor(request);
    if (protocol.error) return httpError('Unsupported MCP-Protocol-Version.', 400);
    let body;
    try { body = await readJson(request); }
    catch (error) {
      if (error.rpcCode) return jsonResponse(rpcError(null, error.rpcCode, error.message), error.status || 400);
      return httpError(error.message, error.status || 400);
    }
    try {
      const response = await dispatch(body, request, env, protocol.version);
      if (response === null) return jsonResponse(null, 202, { 'MCP-Protocol-Version': protocol.version });
      const responseProtocol = isRecord(body) && body.method === 'initialize' && response.result?.protocolVersion
        ? response.result.protocolVersion
        : protocol.version;
      return jsonResponse(response, 200, { 'MCP-Protocol-Version': responseProtocol });
    } catch {
      return jsonResponse(rpcError(isRecord(body) && validId(body.id) ? body.id : null, -32603, 'Internal error'), 200, { 'MCP-Protocol-Version': protocol.version });
    }
  }
};
