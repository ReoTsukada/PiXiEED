import { reserveDrawSession } from './draw-session-admission.mjs';
import { validProjectBinding, parseDrawPairingCode, relayFetch, relayJsonRequest } from './draw-session-relay.mjs';
import { readJson, siteOrigin, withCorsHeaders, httpError, drawCorsHeaders } from './worker.mjs';

export const STORE_ISSUER = 'https://pixieed-mcp.rgaydm03.workers.dev';
export const STORE_RESOURCE = `${STORE_ISSUER}/mcp/store`;
export const STORE_SCOPES = ['draw:read', 'draw:write'];
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const TEN_MINUTES = 600;
const bytes = new TextEncoder();
const escape = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const nonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(value))), v => v.toString(16).padStart(2,'0')).join('');
const cookieName = id => `__Host-draw-consent-${id}`;
const cookieHeader = (id, value, maxAge = TEN_MINUTES) => `${cookieName(id)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const cookieValue = (request, name) => {
  const matches = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
};
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const safetyHeaders = () => new Headers({
  'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'same-origin',
  'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://chatgpt.com/connector_platform_oauth_redirect; base-uri 'none'; frame-ancestors 'none'"
});
// For POST form navigations, Referrer-Policy: no-referrer makes browsers serialize Origin as "null".
// same-origin keeps the exact Origin check usable without weakening the authorization guard.
function page(title, content, headers = safetyHeaders()) {
  for (const [key,value] of safetyHeaders()) headers.set(key,value);
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | PiXiEED</title><style>html{font-family:system-ui,sans-serif;background:#f4f3ef;color:#202522}body{max-width:520px;margin:0 auto;padding:32px 20px;line-height:1.65;overflow-wrap:anywhere}main{background:white;border:1px solid #dddcd5;border-radius:20px;padding:24px}h1{font-size:24px;line-height:1.4;margin-top:0}label{display:block;font-weight:600}input{box-sizing:border-box;width:100%;min-height:48px;padding:12px;margin:8px 0 16px;font:inherit;border:1px solid #727870;border-radius:10px}button{font:inherit;min-height:48px;border:0;border-radius:12px;padding:12px 18px;cursor:pointer;background:#234b3a;color:white;margin:8px 8px 0 0}.secondary{background:#eceee9;color:#26312b}small{color:#59645c}dt{font-weight:650}dd{margin:0 0 12px}a{color:#265843}ul{padding-left:22px}@media(max-width:390px){main{padding:18px}body{padding:20px 12px}h1{font-size:22px}}</style><main><p>PiXiEED Draw</p><h1>${escape(title)}</h1>${content}</main><p><a href="https://pixieed.jp/ai/privacy/" target="_blank" rel="noopener">プライバシー</a> · <a href="https://pixieed.jp/ai/support/" target="_blank" rel="noopener">サポート</a></p></html>`, { headers });
}
export function validStoreClient(value) {
  return typeof value === 'string' && /^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]+\/)?client\.json$/.test(value);
}
export async function readStrictForm(request, maxBytes = 16 * 1024) {
  if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') throw failure('フォームの形式を確認してください。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw failure('フォームがありません。');
  let total = 0, chunks = [];
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw failure('入力が長すぎます。',413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk,offset); offset += chunk.length; }
  const form = new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(joined));
  const seen = new Set();
  for (const key of form.keys()) { if (seen.has(key)) throw failure('重複した入力を拒否しました。'); seen.add(key); }
  return form;
}
function hidden(id, csrf) { return `<input type="hidden" name="id" value="${escape(id)}"><input type="hidden" name="csrf" value="${escape(csrf)}">`; }
function clientDetails(details) {
  return `<p><strong>${escape(details.clientName)}</strong>（${escape(details.clientDomain || '未確認')}）が接続を求めています。</p><p><small>接続先：${escape(details.redirectHost)}</small></p>`;
}
const scopesCopy = scopes => scopes.map(s => s === 'draw:read' ? '作品のピクセル・配色・レイヤー・コマを読み取る' : '作品を編集し、この端末に保存する').map(v=>`<li>${v}</li>`).join('');
export async function storeSessionCreation(request, env) {
  const expected = siteOrigin(env);
  if (request.headers.get('origin') !== expected) return httpError('Origin not allowed.',403);
  if (request.method === 'OPTIONS') {
    if (request.headers.get('access-control-request-method') !== 'POST' || (request.headers.get('access-control-request-headers') || '').split(',').some(v => v.trim().toLowerCase() !== 'content-type')) return httpError('Preflight not allowed.',403);
    return new Response(null,{status:204,headers:drawCorsHeaders(expected)});
  }
  if (request.method !== 'POST') return withCorsHeaders(httpError('Method not allowed.',405,{Allow:'POST'}),expected);
  try {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure('Content-Type must be application/json.',415);
    const body = await readJson(request,1024);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!['projectBinding','projectName'].includes(k)) || !validProjectBinding(body.projectBinding) || (body.projectName !== undefined && (typeof body.projectName !== 'string' || body.projectName.length < 1 || body.projectName.length > 120))) throw failure('Invalid project binding.');
    const admitted = await reserveDrawSession(request,env);
    if (!admitted.ok) return withCorsHeaders(admitted,expected);
    const {sessionId} = await admitted.json();
    const result = await relayFetch(env,sessionId,'/_relay/create',relayJsonRequest('/_relay/create',{sessionId,mode:'oauth',...body}));
    return withCorsHeaders(result,expected);
  } catch(e) { return withCorsHeaders(httpError(e.status ? e.message : 'Could not create connection.',e.status || 503),expected); }
}
async function getContext(request, form, env) {
  if (request.headers.get('origin') !== STORE_ISSUER || !['same-origin','none',null].includes(request.headers.get('sec-fetch-site'))) throw failure('この画面から操作をやり直してください。',403);
  const id = form.get('id'), csrf = form.get('csrf');
  if (!SECRET.test(id || '') || !SECRET.test(csrf || '')) throw failure('接続画面を開き直してください。',403);
  const context = await env.OAUTH_KV.get(`draw-consent:${id}`,{type:'json'});
  if (!context || context.expiresAt <= Date.now() || cookieValue(request,cookieName(context.cookieId)) !== csrf || await hash(csrf) !== context.csrfHash) throw failure('許可画面が期限切れか、別のブラウザーで開かれています。',403);
  return {id,csrf,context};
}
export async function authorizeDraw(request, env, oauth) {
  let activated;
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1) throw failure('重複した認可パラメータを拒否しました。');
      if (!validStoreClient(url.searchParams.get('client_id'))) throw failure('この接続先には対応していません。');
      const auth = await oauth.parseAuthRequest(request);
      if (auth.resource !== STORE_RESOURCE || auth.scope.some(s=>!STORE_SCOPES.includes(s)) || !auth.scope.length) throw failure('作品の読み取り・編集権限を指定してください。');
      const details = await oauth.describeConsent(auth);
      if (details.clientDomain !== 'chatgpt.com' || details.redirectHost !== 'chatgpt.com') throw failure('接続先を確認できません。');
      const consent = await oauth.beginConsent(auth);
      const id = nonce(), csrf = nonce();
      await env.OAUTH_KV.put(`draw-consent:${id}`,JSON.stringify({cookieId:id,csrfHash:await hash(csrf),handle:consent.handle,details,authFingerprint:await hash(JSON.stringify(auth)),expiresAt:Date.now()+TEN_MINUTES*1000}),{expirationTtl:TEN_MINUTES});
      consent.headers.append('Set-Cookie',cookieHeader(id,csrf));
      return page('開いている作品につなぐ',`${clientDetails(details)}<p>Drawの「GPT連携」で表示した接続コードを入力します。コードを持つ人がその作品への接続を許可できます。<strong>チャット本文には貼らないでください。</strong></p><form method="post" action="/authorize">${hidden(id,csrf)}<label for="draw-code">Drawの接続コード</label><input id="draw-code" name="code" required autocomplete="off" spellcheck="false" maxlength="80"><button name="decision" value="claim">作品を確認する</button><button class="secondary" name="decision" value="deny" formnovalidate>キャンセル</button></form><p><small>コードは2分・1回限り。接続は作成から最大15分です。Drawを開いたままにしてください。</small></p>`,consent.headers);
    }
    const form = await readStrictForm(request);
    if ([...form.keys()].some(k=>!['id','csrf','decision','code'].includes(k))) throw failure('認可フォームを確認してください。');
    const {id,csrf,context} = await getContext(request,form,env);
    if (form.get('decision') === 'deny') {
      const denied = await oauth.denyConsent(request,context.handle);
      denied.headers.append('Set-Cookie',cookieHeader(context.cookieId,'',0));
      await env.OAUTH_KV.delete(`draw-consent:${id}`);
      return new Response(null,{status:302,headers:denied.headers});
    }
    if (form.get('decision') === 'claim') {
      if (context.claim) throw failure('作品はすでに確認済みです。');
      const parsed = parseDrawPairingCode(form.get('code'));
      if (!parsed) throw failure('Drawの接続コードを確認してください。');
      const claimBinding = nonce();
      const claimed = await relayFetch(env,parsed.sessionId,'/_relay/store-claim',relayJsonRequest('/_relay/store-claim',{secret:parsed.secret,claimBinding,authFingerprint:context.authFingerprint}));
      if (!claimed.ok) throw failure('コードが期限切れか使用済みです。Drawで新しい接続を開始してください。');
      const claim = await claimed.json(), nextId = nonce();
      if (claim.expiresAt - Date.now() < 60_000) throw failure('作品の接続期限が近いため、Drawで接続を開始し直してください。');
      const next = {...context,claim:{...claim,sessionId:parsed.sessionId,claimBinding},expiresAt:Math.min(context.expiresAt,claim.claimExpiresAt)};
      await env.OAUTH_KV.put(`draw-consent:${nextId}`,JSON.stringify(next),{expirationTtl:Math.max(60,Math.ceil((next.expiresAt-Date.now())/1000))});
      await env.OAUTH_KV.delete(`draw-consent:${id}`);
      return page('この作品への接続を許可',`${clientDetails(context.details)}<dl><dt>対象の作品</dt><dd>${escape(claim.projectName || '名称未設定の作品')}<br><small>作品ID：${escape(claim.projectBinding.projectId)}</small></dd><dt>接続の終了</dt><dd>${escape(new Date(claim.expiresAt).toISOString().replace('T',' ').replace('.000Z',' UTC'))}（最長15分）</dd></dl><ul>${scopesCopy(context.details.scope)}</ul><p>作品を切り替えるか、Drawで接続を終了すると操作できなくなります。世界地図やSNSへの投稿は許可に含まれません。</p><form method="post" action="/authorize">${hidden(nextId,csrf)}<button name="decision" value="approve">この作品への接続を許可</button><button class="secondary" name="decision" value="deny">キャンセル</button></form>`);
    }
    if (form.get('decision') !== 'approve' || !context.claim || form.has('code')) throw failure('先に対象作品を確認してください。');
    const approved = await oauth.approveConsent(request,context.handle);
    if (await hash(JSON.stringify(approved.request)) !== context.authFingerprint || approved.request.resource !== STORE_RESOURCE || approved.request.scope.some(s=>!STORE_SCOPES.includes(s))) throw failure('認可要求が変わったため拒否しました。',403);
    const result = await relayFetch(env,context.claim.sessionId,'/_relay/store-activate',relayJsonRequest('/_relay/store-activate',{claimBinding:context.claim.claimBinding,authFingerprint:context.authFingerprint}));
    if (!result.ok) throw failure('作品の接続が期限切れか、すでに使われています。');
    activated = await result.json();
    if (activated.expiresAt - Date.now() < 60_000) throw failure('Drawで接続を開始し直してください。');
    const userId = crypto.randomUUID();
    const completed = await oauth.completeAuthorization({request:approved.request,userId,metadata:{label:'Temporary Draw delegation'},scope:approved.request.scope,props:{...activated,userId},revokeExistingGrants:false});
    approved.headers.set('Location',completed.redirectTo);
    approved.headers.append('Set-Cookie',cookieHeader(context.cookieId,'',0));
    await env.OAUTH_KV.delete(`draw-consent:${id}`);
    return new Response(null,{status:302,headers:approved.headers});
  } catch(error) {
    if (activated) await revokeDrawDelegate(env,activated).catch(()=>{});
    // Never include a pasted code, server credential, or reflected OAuth request in errors.
    const status = Number.isInteger(error.status) ? error.status : 400;
    const response = page('接続を完了できませんでした',`<p>${escape(error.status ? error.message : '接続画面が期限切れか、確認処理に失敗しました。ChatGPTから接続を開き直してください。')}</p><p>作品はDrawに残っています。</p>`);
    return new Response(response.body,{status,headers:response.headers});
  }
}
export async function activeDrawDelegate(env, props) {
  if (!props || !SECRET.test(props.accessToken || '') || !validProjectBinding(props.projectBinding) || typeof props.connectionId !== 'string' || !Number.isFinite(props.expiresAt) || props.expiresAt <= Date.now()) return false;
  const status = await relayFetch(env,props.connectionId,'/_relay/status',{method:'GET',headers:{Authorization:`Bearer ${props.accessToken}`}});
  if ([401,404,410].includes(status.status)) return false;
  if (!status.ok) throw new Error('Draw connection verification unavailable.');
  const value = await status.json();
  return value.active === true && value.projectBinding?.projectId === props.projectBinding.projectId && value.projectBinding?.openEpoch === props.projectBinding.openEpoch && value.expiresAt === props.expiresAt;
}
export async function revokeDrawDelegate(env, props) {
  const revoked = await relayFetch(env,props.connectionId,'/_relay/revoke',relayJsonRequest('/_relay/revoke',{},props.accessToken));
  if (revoked.ok) return;
  if ([401,404,410].includes(revoked.status) && !await activeDrawDelegate(env,props)) return;
  throw new Error('Draw connection could not be revoked.');
}
// Per-request adapter: the OAuth library authenticates the client and verifies token ownership
// before its delete reaches this gate. Durable Object revocation must precede eventual KV deletion.
export function revocationEnvironment(env, tokenContext) {
  if (!tokenContext?.props?.grantId || !tokenContext.userId) return env;
  const target = `token:${tokenContext.userId}:${tokenContext.props.grantId}:`;
  let stopped = false;
  const store = env.OAUTH_KV;
  const kv = new Proxy(store,{get(targetStore,key) {
    if (key === 'delete') return async storageKey => {
      if (storageKey.startsWith(target) && !stopped) { await revokeDrawDelegate(env,tokenContext.props); stopped = true; }
      return targetStore.delete(storageKey);
    };
    const value = Reflect.get(targetStore,key,targetStore); return typeof value === 'function' ? value.bind(targetStore) : value;
  }});
  return {...env,OAUTH_KV:kv};
}
