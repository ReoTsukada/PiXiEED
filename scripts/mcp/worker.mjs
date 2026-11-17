import { reserveDrawSession } from './draw-session-admission.mjs';
export { DrawAdmissionDO } from './draw-session-admission.mjs';
export { DrawSessionDO } from './draw-session-relay.mjs';
import { getToolCatalog } from '../../js/mcp/tool-catalog.mjs';
import { encodePixelArt, normalizePixelArt, PIXEL_ART_INPUT_SCHEMA } from '../../js/mcp/pixel-art-contract.mjs';

import { GUIDE_VERSION, PIXEL_ART_GUIDE_INPUT_SCHEMA, getPixelArtGuide } from '../../js/mcp/pixel-art-guide.mjs';
import { renderPixelArtPreviews } from '../../js/mcp/pixel-art-preview.mjs';
import { selectPixelArtTechniques } from '../../js/mcp/pixel-art-techniques.mjs';
import { reviewPixelArt, PIXEL_ART_REVIEW_INPUT_SCHEMA } from '../../js/mcp/pixel-art-review.mjs';
import { CASE_LIBRARY_VERSION, getVisiblePixelArtCases } from '../../js/mcp/pixel-art-cases.mjs';
import { PIXEL_ART_INTELLIGENCE } from '../../js/mcp/pixel-art-intelligence.mjs';
import {
  DRAW_AGENT_AUTH_SCHEMA, DRAW_CONNECTION_INPUT_SCHEMA, DRAW_OPERATION_SCHEMA,
  DRAW_PROJECT_BINDING_SCHEMA, DRAW_STATE_REQUEST_SCHEMA, DRAW_STATE_SCHEMA,
  DRAW_MAX_RESULT_BYTES, validProjectBinding, parseDrawPairingCode, relayFetch, relayJsonRequest
} from './draw-session-relay.mjs';

const DEFAULT_ORIGIN = 'https://pixieed.jp';
const DEFAULT_PROTOCOL = '2025-03-26';
const SUPPORTED_PROTOCOLS = new Set(['2025-03-26', '2025-06-18']);
const MAX_BODY_BYTES = 32 * 1024;
const SERVER_INSTRUCTIONS = PIXEL_ART_INTELLIGENCE;
const DRAW_OPERATION_WAIT_MS = 8_000;
const DRAW_OPERATION_POLL_MS = 500;

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

function guideUrlFor(request, env) {
  const url = new URL('/ai/guide/', siteOrigin(env));
  for (const key of ['subject', 'width', 'height', 'style']) url.searchParams.set(key, String(request[key]));
  if (request.materials.length) url.searchParams.set('materials', request.materials.join(','));
  for (const key of ['animated', 'normalMap']) if (request[key]) url.searchParams.set(key, 'true');
  if (request.expression) url.searchParams.set('expression', JSON.stringify(request.expression));
  return url.href;
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
              mcpSupport: { enum: ['pixel_art_preview', 'pixel_art_preview_and_live_draw', 'guide_only'] }
            }
          }
        }
      }
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };

  const guide = {
    title: '題材とサイズに合う制作ガイド',
    name: 'get_pixel_art_guide',
    description: '利用者が求めた場合や作業に役立つ場合に使える任意の参考ガイドです。題材・寸法・材質・画風などに応じた情報を返します。画像解析、Draw操作、保存は行いません。',
    inputSchema: PIXEL_ART_GUIDE_INPUT_SCHEMA,
    outputSchema: {
      type: 'object', additionalProperties: false,
      required: ['guideVersion', 'guideUrl', 'request', 'steps', 'reviewChecklist', 'limitations', 'sources'],
      properties: {
        guideVersion: { type: 'string' }, guideUrl: { type: 'string', format: 'uri' },
        request: { ...PIXEL_ART_GUIDE_INPUT_SCHEMA, required: ['subject', 'width', 'height', 'materials', 'animated', 'normalMap', 'style'] },
        steps: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['id', 'title', 'body'],
          properties: { id: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }
        } },
        reviewChecklist: { type: 'array', items: { type: 'string' } },
        limitations: { type: 'array', items: { type: 'string' } },
        sources: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['title', 'url'],
          properties: { title: { type: 'string' }, url: { type: 'string', format: 'uri' } }
        } }
      }
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };

  const prepare = {
    title: 'ドット絵プレビューを準備',
    name: 'prepare_pixel_art',
    description: 'このツールは渡された画素データを形式検査し、原寸PNG・比較画像・受取リンクを返します。このツール自体はDrawのライブ画面を操作せず、形式検査は美的評価ではありません。',
    inputSchema: PIXEL_ART_INPUT_SCHEMA,
    outputSchema: {
      type: 'object', additionalProperties: false,
      required: ['title', 'width', 'height', 'previewUrl', 'status'],
      properties: {
        inspection: {
          type: 'object', additionalProperties: false,
          required: ['technicalStatus', 'visualStatus', 'guideVersion', 'metrics', 'review', 'previews'],
          properties: {
            technicalStatus: { const: 'passed' }, visualStatus: { const: 'not_assessed' },
            guideVersion: { type: 'string' },
            metrics: { type: 'object', additionalProperties: false,
              required: ['width', 'height', 'paletteEntries', 'usedColors', 'opaquePixels', 'transparentPixels', 'bounds'],
              properties: {
                width: { type: 'integer' }, height: { type: 'integer' },
                paletteEntries: { type: 'integer' }, usedColors: { type: 'integer' },
                opaquePixels: { type: 'integer' }, transparentPixels: { type: 'integer' },
                bounds: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
                  required: ['x', 'y', 'width', 'height'], properties: {
                    x: { type: 'integer' }, y: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' }
                  }
                }] }
              }
            },
            review: { type: 'object', additionalProperties: false,
              required: ['scale', 'backgrounds', 'layout', 'grayscaleMethod'],
              properties: {
                scale: { type: 'integer' },
                backgrounds: { type: 'array', items: { type: 'string' } },
                layout: { type: 'string' }, grayscaleMethod: { type: 'string' }
              }
            },
            previews: { type: 'array', items: {
              type: 'object', additionalProperties: false, required: ['kind', 'width', 'height'],
              properties: { kind: { enum: ['native', 'review'] }, width: { type: 'integer' }, height: { type: 'integer' } }
            } }
          }
        },
        title: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' },
        previewUrl: { type: 'string', format: 'uri' }, status: { const: 'preview_only' }
      }
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };
  const textList = {type:'array',items:{type:'string'}};
  const caseSummary = {type:'object',additionalProperties:false,required:['id','title','width','height','decision','internalDecision','userAcceptance','url'],properties:{
    id:{type:'string'},title:{type:'string'},width:{type:'integer'},height:{type:'integer'},decision:{type:'string'},internalDecision:{type:'string'},userAcceptance:{enum:['accepted','pending','rejected']},url:{type:'string'}
  }};
  const techniques = {
    name:'get_pixel_art_techniques',title:'条件に合う技法と比較例',
    description:'利用者が求めた場合や作業上必要な場合に使える任意の参考資料です。条件に関連する技法と記録済み事例を返しますが、方法や順序を強制せず、内部比較を一般的な品質認定ともしません。',
    inputSchema:PIXEL_ART_GUIDE_INPUT_SCHEMA,
    outputSchema:{type:'object',additionalProperties:false,required:['guideVersion','request','techniques','cases'],properties:{
      guideVersion:{type:'string'},request:guide.outputSchema.properties.request,
      techniques:{type:'array',items:{type:'object',additionalProperties:false,required:['id','title','appliesWhen','avoidWhen','steps','checks','sourceUrls','caseIds','comparisonCaseIds'],properties:{
        id:{type:'string'},title:{type:'string'},appliesWhen:{type:'string'},avoidWhen:{type:'string'},steps:textList,checks:textList,sourceUrls:textList,caseIds:textList,comparisonCaseIds:textList
      }}},cases:{type:'array',items:caseSummary}
    }},annotations:list.annotations
  };
  const review = {
    name:'review_pixel_art',title:'制作後の確認と修正案',
    description:'利用者が見直しを求めた場合などに使える任意の確認資料です。画素のRGBA差分と、実際に申告された観察に沿う修正案を返します。MCP自体は画像を理解・採点・自動修正しません。',
    inputSchema:PIXEL_ART_REVIEW_INPUT_SCHEMA,
    outputSchema:{type:'object',additionalProperties:false,required:['reviewVersion','technical','visual','correctionPlan','nextActions','limitations'],properties:{
      reviewVersion:{type:'string'},technical:{type:'object',required:['status','width','height','usedColors','opaquePixels','comparison'],properties:{
        status:{const:'passed'},width:{type:'integer'},height:{type:'integer'},usedColors:{type:'integer'},opaquePixels:{type:'integer'},
        comparison:{anyOf:[{type:'null'},{type:'object',required:['sameDimensions','changedPixels','changedPercent'],properties:{sameDimensions:{type:'boolean'},changedPixels:{type:['integer','null']},changedPercent:{type:['number','null']}}}]}
      }},
      visual:{type:'object',required:['status','decision','observations'],properties:{status:{enum:['not_assessed','host_observed']},decision:PIXEL_ART_REVIEW_INPUT_SCHEMA.properties.decision,observations:PIXEL_ART_REVIEW_INPUT_SCHEMA.properties.observations}},
      correctionPlan:{type:'array',items:{type:'object',required:['category','location','problem','returnTo','action','check'],properties:Object.fromEntries(['category','location','problem','returnTo','action','check'].map(k=>[k,{type:'string'}]))}},
      nextActions:textList,limitations:textList
    }},annotations:list.annotations
  };
  const example = {
    name:'get_pixel_art_case',title:'実作の修正前後を確認',
    description:'利用者が求めた場合に参照できる記録済み比較資料です。初稿を意図的に劣化させた比較ではありません。',
    inputSchema:{type:'object',additionalProperties:false,required:['id'],properties:{id:{type:'string',minLength:1,maxLength:60}}},
    outputSchema:{type:'object',additionalProperties:false,required:['libraryVersion','case','limitations'],properties:{libraryVersion:{type:'string'},case:{type:'object',required:['id','title','width','height','decision','internalDecision','userAcceptance','url','intent','observations','changeSummary'],properties:{...caseSummary.properties,intent:{type:'string'},observations:textList,changeSummary:{type:'string'}}},limitations:textList}},
    annotations:list.annotations
  };
  const connection = {
    type: 'object', additionalProperties: false,
    required: ['connectionId', 'accessToken', 'projectBinding', 'expiresAt'],
    properties: {
      connectionId: { type: 'string', format: 'uuid' }, accessToken: { type: 'string', minLength: 43, maxLength: 43 },
      projectBinding: DRAW_PROJECT_BINDING_SCHEMA, expiresAt: { type: 'integer' }
    }
  };
  const drawResult = {
    type: 'object', additionalProperties: false,
    required: ['requestId', 'status', 'projectBinding', 'revision'],
    properties: {
      requestId: { type: 'string' }, status: { enum: ['applied', 'not_applied', 'unknown', 'pending'] },
      projectBinding: { anyOf: [DRAW_PROJECT_BINDING_SCHEMA, { type: 'null' }] },
      revision: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
      result: { type: 'object' }, error: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: { type: 'string' }, message: { type: 'string' } } }
    }
  };
  const connect = {
    name: 'connect_draw', title: 'Open a paired Draw session',
    description: 'Exchange the short-lived one-use pairing code shown in the active Draw session for a scoped agent connection. This does not open, create, or save a project by itself.',
    inputSchema: DRAW_CONNECTION_INPUT_SCHEMA, outputSchema: connection,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false }
  };
  const authProperties = { ...DRAW_AGENT_AUTH_SCHEMA.properties };
  const state = {
    name: 'get_draw_state', title: 'Read the active Draw state',
    description: 'Read the paired Draw project state, active frame/layer, palette, and selected cel pixels through the connected browser. This reads the live project and does not change or save it.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['connectionId', 'accessToken'], properties: { ...authProperties, ...DRAW_STATE_REQUEST_SCHEMA.properties } },
    outputSchema: { anyOf: [DRAW_STATE_SCHEMA, drawResult] },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };
  const edit = {
    name: 'edit_draw', title: 'Apply an operation in Draw',
    description: 'Apply one allowlisted pixel, palette, layer, frame, undo, or redo operation to the paired live project. Requires the current editor revision and a unique requestId. A pending or unknown result is not a rejection; read state before deciding whether to try another operation.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['connectionId', 'accessToken', 'expectedRevision', 'requestId', 'operation'], properties: {
      ...authProperties, expectedRevision: { type: 'integer', minimum: 0 }, requestId: { type: 'string', minLength: 8, maxLength: 100, pattern: '^[A-Za-z0-9_-]{8,100}$' }, operation: DRAW_OPERATION_SCHEMA
    } },
    outputSchema: drawResult,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true }
  };
  const save = {
    name: 'save_draw', title: 'Save the active Draw project',
    description: 'Save the paired project revision in browser-local Draw storage. Requires the current editor revision and unique requestId. Reports the saved project/revision and whether later edits remain dirty; it does not claim cloud sync or publication.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['connectionId', 'accessToken', 'expectedRevision', 'requestId'], properties: {
      ...authProperties, expectedRevision: { type: 'integer', minimum: 0 }, requestId: { type: 'string', minLength: 8, maxLength: 100, pattern: '^[A-Za-z0-9_-]{8,100}$' }
    } },
    outputSchema: drawResult,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };
  const disconnect = {
    name: 'disconnect_draw', title: 'Close the paired Draw connection',
    description: 'Invalidate the agent credential and prevent further commands for this Draw session. An operation already in progress may have applied and is not rolled back.',
    inputSchema: DRAW_AGENT_AUTH_SCHEMA,
    outputSchema: { type: 'object', additionalProperties: false, required: ['disconnected'], properties: { disconnected: { const: true } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  };
  return [list, guide, techniques, prepare, review, example, connect, state, edit, save, disconnect];
}

function mcpResult(value, text) {
  return { content: [{ type: 'text', text }], structuredContent: value };
}

async function handleCall(params, env) {
  if (!isRecord(params) || typeof params.name !== 'string' || (params.arguments !== undefined && !isRecord(params.arguments))) {
    return { isError: true, content: [{ type: 'text', text: 'ツール名または引数の形式を確認してください。' }] };
  }
  const args = params.arguments ?? {};
  if (params.name === 'connect_draw') {
    if (Object.keys(args).length !== 1 || typeof args.pairingCode !== 'string') return { isError: true, content: [{ type: 'text', text: 'Draw接続のpairingCodeを指定してください。' }] };
    const parsed = parseDrawPairingCode(args.pairingCode);
    if (!parsed) return { isError: true, content: [{ type: 'text', text: 'Draw接続のpairingCode形式を確認してください。' }] };
    try {
      const response = await relayFetch(env, parsed.sessionId, '/_relay/connect', relayJsonRequest('/_relay/connect', { secret: parsed.secret }));
      const value = await response.json();
      if (!response.ok) return { isError: true, content: [{ type: 'text', text: value.error || 'Drawへ接続できませんでした。コードが期限切れか使用済みです。' }] };
      return mcpResult(value, `Drawセッションへ接続しました。作品 ${value.projectBinding.projectId} を操作できます。資格情報はこの接続の操作にのみ使用してください。`);
    } catch { return { isError: true, content: [{ type: 'text', text: 'Draw接続サービスを利用できません。' }] }; }
  }
  if (['get_draw_state', 'edit_draw', 'save_draw', 'disconnect_draw'].includes(params.name)) {
    const authKeys = ['connectionId', 'accessToken'];
    if (authKeys.some(key => typeof args[key] !== 'string') || !/^[0-9a-f-]{36}$/i.test(args.connectionId) || !/^[A-Za-z0-9_-]{43}$/.test(args.accessToken)) return { isError: true, content: [{ type: 'text', text: 'Draw接続のIDまたは資格情報を確認してください。' }] };
    const path = params.name === 'disconnect_draw' ? '/_relay/disconnect' : null;
    if (path) {
      try {
        const response = await relayFetch(env, args.connectionId, path, relayJsonRequest(path, {}, args.accessToken));
        const value = await response.json();
        if (!response.ok) return { isError: true, content: [{ type: 'text', text: value.error || 'Draw接続を終了できませんでした。' }] };
        return mcpResult(value, 'Draw接続を終了しました。実行中だった操作が適用済みの場合、その変更は取り消されません。');
      } catch { return { isError: true, content: [{ type: 'text', text: 'Draw接続を終了できませんでした。' }] }; }
    }
    if (params.name === 'get_draw_state') {
      if (Object.keys(args).some(key => !['connectionId', 'accessToken', 'frameId', 'layerId'].includes(key)) || (args.frameId !== undefined && typeof args.frameId !== 'string') || (args.layerId !== undefined && typeof args.layerId !== 'string')) return { isError: true, content: [{ type: 'text', text: 'Draw状態の取得範囲を確認してください。' }] };
      const requestId = crypto.randomUUID().replaceAll('-', '_');
      const result = await runDrawCommand(env, args.connectionId, args.accessToken, requestId, { kind: 'state.get', stateRequest: { ...(args.frameId ? { frameId: args.frameId } : {}), ...(args.layerId ? { layerId: args.layerId } : {}) } });
      if (typeof result.error === 'string') return { isError: true, content: [{ type: 'text', text: result.error }] };
      if (result.status === 'applied') return mcpResult(result.result?.state ?? result.result, JSON.stringify(result.result?.state ?? result.result));
      return mcpResult(result, `Draw状態の取得は${result.status === 'pending' ? '処理中' : '結果不明'}です。現時点で未完了として扱い、必要なら改めて状態を読み取ってください。`);
    }
    const isEdit = params.name === 'edit_draw';
    const allowed = isEdit ? ['connectionId', 'accessToken', 'expectedRevision', 'requestId', 'operation'] : ['connectionId', 'accessToken', 'expectedRevision', 'requestId'];
    if (Object.keys(args).some(key => !allowed.includes(key)) || !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 || typeof args.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(args.requestId)) return { isError: true, content: [{ type: 'text', text: '現在の編集revisionと一意のrequestIdを指定してください。' }] };
    const operation = isEdit ? args.operation : { type: 'save' };
    const command = { kind: 'operation', expectedRevision: args.expectedRevision, operation };
    const result = await runDrawCommand(env, args.connectionId, args.accessToken, args.requestId, command);
    if (typeof result.error === 'string') return { isError: true, content: [{ type: 'text', text: result.error }] };
    const text = result.status === 'applied'
      ? (params.name === 'save_draw' ? 'Drawの保存結果です。保存先はブラウザー内ローカルストレージです。' : 'Draw操作が完了しました。')
      : result.status === 'pending' ? 'Draw操作は処理中です。操作を再送せず、同じrequestIdで状態を確認してください。'
        : 'Draw操作の結果が不確定です。失敗したとは限らないため、現在のDraw状態を確認してから次を決めてください。';
    return mcpResult(result, text);
  }
  if (params.name === 'list_pixieed_tools') {
    if (Object.keys(args).length) return { isError: true, content: [{ type: 'text', text: 'このツールに引数は指定できません。' }] };
    return mcpResult({ tools: getToolCatalog() }, JSON.stringify(getToolCatalog()));
  }

  if (params.name === 'get_pixel_art_guide') {
    try {
      const guide = getPixelArtGuide(args);
      const value = { ...guide, guideUrl: guideUrlFor(guide.request, env) };
      const summary = [
        `PiXiEED 制作ガイド ${value.guideVersion}（${value.request.width}×${value.request.height}px／${value.request.subject}）`,
        ...value.steps.map((step) => `${step.title}\n${step.body}`),
        '確認項目\n' + value.reviewChecklist.map((line) => '・' + line).join('\n'),
        '適用範囲\n' + value.limitations.map((line) => '・' + line).join('\n'),
        `[${value.request.referenceStyle ? '画風・サイズのガイドを開く（参考画像の分析文は含みません）' : '同じ制作ガイドを開く'}](${value.guideUrl})`,
        ...value.sources.map((source) => `[${source.title}](${source.url})`)
      ].join('\n\n');
      return mcpResult(value, summary);
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof TypeError ? error.message : '制作ガイドを取得できませんでした。' }] };
    }
  }

  if (params.name === 'get_pixel_art_techniques') {
    try {
      const request = getPixelArtGuide(args).request;
      const selected = selectPixelArtTechniques(request);
      const acceptedIds = new Set(selected.flatMap(t=>t.caseIds));
      const comparisonIds = new Set(selected.flatMap(t=>t.comparisonCaseIds));
      const cases = getVisiblePixelArtCases().filter(c=>acceptedIds.has(c.id)||comparisonIds.has(c.id)).sort((a,b)=>Math.abs(a.width-request.width)-Math.abs(b.width-request.width)).slice(0,6)
        .map(c=>({id:c.id,title:c.title,width:c.width,height:c.height,decision:c.internalDecision,internalDecision:c.internalDecision,userAcceptance:c.userAcceptance,url:new URL('/ai/examples/#'+c.id,siteOrigin(env)).href}));
      return mcpResult({guideVersion:GUIDE_VERSION,request,techniques:selected,cases},
        selected.map(t=>t.title+'\n使う場面: '+t.appliesWhen+'\n向かない条件: '+t.avoidWhen+'\n'+t.steps.join('\n')+'\n確認: '+t.checks.join(' / ')).join('\n\n')+'\n\n比較例（状態を確認し、条件に合うものだけ参照）: '+cases.map(c=>c.id+' ['+(c.userAcceptance==='accepted'?'ユーザー採用済み':'内部比較・ユーザー未採用')+'／'+c.title+']('+c.url+')').join(' / '));
    } catch(error) { return {isError:true,content:[{type:'text',text:error instanceof TypeError?error.message:'技法を取得できませんでした。'}]}; }
  }
  if (params.name === 'review_pixel_art') {
    try {
      const reviewed = reviewPixelArt(args);
      return mcpResult(reviewed,JSON.stringify(reviewed));
    } catch(error) { return {isError:true,content:[{type:'text',text:error instanceof TypeError?error.message:'見直し結果を取得できませんでした。'}]}; }
  }
  if (params.name === 'get_pixel_art_case') {
    if(Object.keys(args).some(k=>k!=='id')||typeof args.id!=='string'||args.id.length>60) return {isError:true,content:[{type:'text',text:'比較事例のIDを指定してください。'}]};
    const found=getVisiblePixelArtCases().find(c=>c.id===args.id);
    if(!found) return {isError:true,content:[{type:'text',text:'比較事例が見つかりません。技法一覧にあるIDを使用してください。'}]};
    const value={libraryVersion:CASE_LIBRARY_VERSION,case:{id:found.id,title:found.title,width:found.width,height:found.height,decision:found.internalDecision,internalDecision:found.internalDecision,userAcceptance:found.userAcceptance,url:new URL('/ai/examples/#'+found.id,siteOrigin(env)).href,intent:found.intent,observations:found.observations,changeSummary:found.changeSummary},
      limitations:['内部の比較記録とユーザー採用状態を別に示します。ユーザー採用例も未知の題材すべての品質保証ではありません。','固定背景・静止画での検証です。動作中や動的照明での品質は未確認です。']};
    const result=mcpResult(value,JSON.stringify(value));
    for(const [label,data] of [['初稿',found.beforePng],['修正版',found.afterPng],['同条件比較（左:初稿、右:修正版）',found.comparisonPng]]) {
      if(data){result.content.push({type:'text',text:label});result.content.push({type:'image',mimeType:'image/png',data});}
    }
    return result;
  }

  if (params.name === 'prepare_pixel_art') {
    try {
      const art = normalizePixelArt(args);
      const token = encodePixelArt(art);
      const { images, metrics, review } = await renderPixelArtPreviews(art);
      const result = {
        title: art.title, width: art.width, height: art.height,
        previewUrl: `${siteOrigin(env)}/ai/#art=${token}`, status: 'preview_only',
        inspection: {
          technicalStatus: 'passed', visualStatus: 'not_assessed', guideVersion: GUIDE_VERSION,
          metrics, review, previews: images.map(({ kind, width, height }) => ({ kind, width, height }))
        }
      };
      const response = mcpResult(result, `[Drawで確認する](${result.previewUrl})\n\n保存・投稿はまだ行われていません。利用者がリンクを開いて確定してください。\n形式検査は完了しました。見た目の完成度は未判定です。画像を確認し、利用者の依頼に沿って次に行うことを判断してください。画像を見られない場合は未確認と伝えてください。`);
      for (const item of images) {
        response.content.push({ type: 'text', text: item.kind === 'native'
          ? `原寸PNG：${art.width}×${art.height}px。透明部分を保持しています。`
          : `検品用の比較画像（完成画像ではありません）：${review.layout}。${review.scale}倍の最近傍拡大。${review.grayscaleMethod}。グレーや背景違いの画像は診断補助です。原寸カラーと実使用背景で判断してください。` });
        response.content.push({ type: 'image', mimeType: item.mimeType, data: item.data });
      }
      return response;
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof TypeError ? error.message : 'ドット絵を処理できませんでした。' }] };
    }
  }
  return null;
}

async function runDrawCommand(env, connectionId, accessToken, requestId, command) {
  try {
    const authorization = `Bearer ${accessToken}`;
    const enqueue = await relayFetch(env, connectionId, '/_relay/command', relayJsonRequest('/_relay/command', { requestId, command }, accessToken));
    const queued = await enqueue.json();
    if (!enqueue.ok && enqueue.status !== 202) return { error: queued.error || 'Draw操作を登録できませんでした。' };
    const deadline = Date.now() + DRAW_OPERATION_WAIT_MS;
    while (Date.now() < deadline) {
      const status = await relayFetch(env, connectionId, `/_relay/command/${encodeURIComponent(requestId)}`, {
        method: 'GET', headers: { Authorization: authorization }
      });
      const value = await status.json();
      if (!status.ok) return { error: value.error || 'Draw操作の状態を取得できませんでした。' };
      if (['applied', 'not_applied', 'unknown'].includes(value.status)) return value.result || { requestId, status: value.status, projectBinding: null, revision: null };
      await new Promise(resolve => setTimeout(resolve, DRAW_OPERATION_POLL_MS));
    }
    return { requestId, status: 'pending', projectBinding: null, revision: null, error: { code: 'response_pending', message: 'Command is still pending. Reuse the same requestId to query it; do not create a new request.' } };
  } catch { return { error: 'Draw relay is unavailable. Check Draw state before trying another mutation.' }; }
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  if (!request.body) throw Object.assign(new Error('Request body required.'), { status: 400, rpcCode: -32600 });
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
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
    return { jsonrpc: '2.0', id, result: { protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: 'PiXiEED', version: '0.4.0' }, instructions: SERVER_INSTRUCTIONS } };
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

function drawCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '300',
    'Vary': 'Origin'
  };
}

function drawBrowserOriginAllowed(request, env, allowSameOriginWithoutHeader = false) {
  const expected = siteOrigin(env);
  const origin = request.headers.get('origin');
  if (origin) return origin === expected;
  return allowSameOriginWithoutHeader && new URL(request.url).origin === expected;
}

function withCorsHeaders(result, origin) {
  const headers = new Headers(result.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '300');
  headers.set('Vary', 'Origin');
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}

async function handleDrawSessionRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const expected = siteOrigin(env);
  if (request.method === 'OPTIONS') {
    if (!origin || origin !== expected) return httpError('Origin not allowed.', 403);
    const requestedMethod = request.headers.get('access-control-request-method');
    const requestedHeaders = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
    if (!['GET', 'POST', 'DELETE'].includes(requestedMethod) || requestedHeaders.some(value => !['authorization', 'content-type'].includes(value))) return httpError('Preflight request not allowed.', 403);
    return new Response(null, { status: 204, headers: drawCorsHeaders(origin) });
  }
  if (!drawBrowserOriginAllowed(request, env, request.method === 'GET')) return httpError('Origin not allowed.', 403);
  const corsOrigin = origin || expected;
  let result;
  if (url.pathname === '/draw-sessions' && request.method === 'POST') {
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return withCorsHeaders(httpError('Content-Type must be application/json.', 415), corsOrigin);
    try {
      const body = await readJson(request);
      if (!isRecord(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'projectBinding') || !validProjectBinding(body.projectBinding)) return withCorsHeaders(httpError('Invalid project binding.', 400), corsOrigin);
      const admission = await reserveDrawSession(request, env);
      if (!admission.ok) return withCorsHeaders(admission, corsOrigin);
      const { sessionId } = await admission.json();
      result = await relayFetch(env, sessionId, '/_relay/create', relayJsonRequest('/_relay/create', { sessionId, projectBinding: body.projectBinding }));
    } catch (error) {
      result = httpError(error?.message || 'Draw session could not be created.', error?.status || 400);
    }
    return withCorsHeaders(result, corsOrigin);
  }
  const match = url.pathname.match(/^\/draw-sessions\/([0-9a-f-]{36})(?:\/(commands(?:\/([0-9a-f-]{36})\/result)?))?$/i);
  if (!match) return withCorsHeaders(httpError('Not found.', 404), corsOrigin);
  const sessionId = match[1];
  const commandPath = match[2];
  const commandId = match[3];
  const token = request.headers.get('authorization');
  if (!token || !/^Bearer [A-Za-z0-9_-]{43}$/.test(token)) return withCorsHeaders(httpError('Browser credential required.', 401), corsOrigin);
  if (!commandPath && request.method === 'DELETE') {
      result = await relayFetch(env, sessionId, '/revoke', new Request('https://draw-relay.internal/revoke', { method: 'DELETE', headers: { Authorization: token } }));
  } else if (commandPath === 'commands' && request.method === 'GET') {
    result = await relayFetch(env, sessionId, '/commands', { method: 'GET', headers: { Authorization: token } });
  } else if (commandId && request.method === 'POST') {
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return withCorsHeaders(httpError('Content-Type must be application/json.', 415), corsOrigin);
    try {
      const body = await readJson(request, DRAW_MAX_RESULT_BYTES);
      result = await relayFetch(env, sessionId, `/commands/${commandId}/result`, relayJsonRequest(`/commands/${commandId}/result`, body, token.slice('Bearer '.length)));
    } catch (error) { result = httpError(error?.message || 'Invalid command result.', error?.status || 400); }
  } else {
    result = httpError('Method not allowed.', 405, { Allow: !commandPath ? 'DELETE' : commandPath === 'commands' ? 'GET' : 'POST' });
  }
  return withCorsHeaders(result, corsOrigin);
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return jsonResponse({ ok: true, service: 'pixieed-mcp' });
    if (url.pathname === '/draw-sessions' || url.pathname.startsWith('/draw-sessions/')) return handleDrawSessionRequest(request, env);
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
