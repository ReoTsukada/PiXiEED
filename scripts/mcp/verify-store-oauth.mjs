/** Runs the real OAuth package in workerd with isolated DO/KV storage and a fixed CIMD fixture.
 * Usage: node scripts/mcp/verify-store-oauth.mjs <bundle.mjs> <absolute miniflare module path>
 * Never prints pairing codes, cookies, authorization codes, or bearer tokens.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
const [bundle, runtimeModule] = process.argv.slice(2);
if (!bundle || !runtimeModule) throw new Error('Provide the built Worker and the installed Miniflare module.');
const {Miniflare,convertV4MiniflareOptions} = await import(pathToFileURL(runtimeModule).href);
const issuer='https://pixieed-mcp.rgaydm03.workers.dev', resource=`${issuer}/mcp/store`;
const client='https://chatgpt.com/oauth/client.json', redirect='https://chatgpt.com/connector_platform_oauth_redirect';
let n=0,passed=0;
const mfOptions=convertV4MiniflareOptions({
  name:'pixieed-store-test',modules:true,scriptPath:resolve(bundle),modulesRoot:dirname(resolve(bundle)),compatibilityDate:'2026-11-14',compatibilityFlags:['global_fetch_strictly_public'],
  kvNamespaces:['OAUTH_KV'],durableObjects:{DRAW_SESSIONS:{className:'DrawSessionDO',useSQLite:true},DRAW_ADMISSION:{className:'DrawAdmissionDO',useSQLite:true}},
  bindings:{DRAW_ADMISSION_SECRET:'isolated-runtime-test-secret-not-production'},
  ...(process.env.PIXIEED_TEST_REAL_CIMD === '1' ? {} : {outboundService:async req => {
    if (req.url === client) return new Response(JSON.stringify({client_id:client,client_name:'ChatGPT',client_uri:'https://chatgpt.com/',redirect_uris:[redirect],token_endpoint_auth_method:'private_key_jwt',token_endpoint_auth_methods_supported:['none','private_key_jwt'],grant_types:['authorization_code'],response_types:['code'],jwks_uri:'https://chatgpt.com/oauth/jwks.json'}),{headers:{'Content-Type':'application/json'}});
    if (req.url==='https://chatgpt.com/oauth/jwks.json') return new Response('{"keys":[]}',{headers:{'Content-Type':'application/json'}});
    return new Response('Not found',{status:404});
  }})
});
const workerConfig=mfOptions.workers?.[0]?.config;
assert.equal(workerConfig?.manifest?.mainModule,'store-worker.js','Bundle path must map to a stable module name for workerd.');
for (const className of ['DrawSessionDO','DrawAdmissionDO']) assert.equal(workerConfig?.exports?.[className]?.type,'durable-object',`Miniflare must register ${className} as a Durable Object export.`);
const mf=new Miniflare(mfOptions);
const fetch=(path,init={})=>mf.dispatchFetch(path.startsWith('https:')?path:`${issuer}${path}`,init);
const form=(fields,cookie)=>({method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',origin:issuer,...(cookie?{cookie}:{})},body:new URLSearchParams(fields).toString()});
const inputs=html=>Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m=>[m[1],m[2]]));
const cookies=response=>response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function session(mode='oauth') {
  const res=await fetch(mode==='oauth'?'/draw-store-sessions':'/draw-sessions',{method:'POST',headers:{origin:'https://pixieed.jp','content-type':'application/json','CF-Connecting-IP':`203.0.113.${++n}`},body:JSON.stringify({projectBinding:{projectId:`p-${n}`,openEpoch:`e-${n}`},...(mode==='oauth'?{projectName:'桜の試験作品'}:{})})});
  assert.equal(res.status,200,'Session creation'); return res.json();
}
async function startAuth(scope='draw:read draw:write',extra={}) {
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const query=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',code_challenge_method:'S256',code_challenge:challenge,resource,scope,state:'runtime-state',...extra});
  const response=await fetch(`/authorize?${query}`,{redirect:'manual'});
  const html=await response.text();
  return {response,html,cookie:cookies(response),fields:inputs(html),verifier};
}
async function grant(session,scope='draw:read draw:write') {
  const start=await startAuth(scope); assert.equal(start.response.status,200,'Authorization page');
  const claimed=await fetch('/authorize',form({...start.fields,code:session.pairingCode,decision:'claim'},start.cookie));
  assert.equal(claimed.status,200,'Claim'); const html=await claimed.text();
  assert.ok(html.includes('桜の試験作品')); assert.ok(!html.includes(session.pairingCode),'Code absent from final consent page');
  const fields=inputs(html);
  const consent=await fetch('/authorize',form({...fields,decision:'approve'},start.cookie));
  assert.equal(consent.status,302,'Consent approval');
  const location=new URL(consent.headers.get('location')); assert.equal(location.searchParams.get('iss'),issuer); assert.equal(location.searchParams.get('state'),'runtime-state');
  const exchanged=await fetch('/oauth/token',form({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,resource,code:location.searchParams.get('code'),code_verifier:start.verifier}));
  const token=await exchanged.json(); assert.equal(exchanged.status,200,`Code exchange error: ${token.error || 'none'}`);
  assert.equal(token.refresh_token,undefined);assert.ok(token.expires_in<=900 && token.expires_in>=60);
  return {token:token.access_token,start,fields,code:location.searchParams.get('code')};
}
const mcp=(name,args={},token)=>fetch('/mcp/store',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
const poll=s=>fetch(`/draw-sessions/${s.sessionId}/commands`,{headers:{origin:'https://pixieed.jp',authorization:`Bearer ${s.browserToken}`}});
async function check(name,work) { await work(); passed++; console.log(`PASS ${name}`); }
try {
  await check('discovery publishes PKCE and no refresh grant',async()=>{
    const r=await fetch('/.well-known/oauth-authorization-server'); const d=await r.json(); assert.equal(d.issuer,issuer); assert.ok(d.code_challenge_methods_supported.includes('S256')); assert.equal(d.revocation_endpoint,`${issuer}/oauth/token`);assert.ok(!d.grant_types_supported.includes('refresh_token'));
    const m=await fetch('/.well-known/oauth-protected-resource/mcp/store'); assert.equal((await m.json()).resource,resource);
  });
  await check('untrusted CIMD client and duplicate OAuth fields rejected',async()=>{
    assert.equal((await startAuth(undefined,{client_id:'https://attacker.invalid/client.json'})).response.status,400);
    assert.equal((await fetch('/authorize?client_id=a&client_id=b')).status,400);
  });
  await check('live tools challenge without credentials; stateless tools remain usable',async()=>{
    assert.equal((await mcp('get_draw_state')).status,401); assert.equal((await mcp('list_pixieed_tools')).status,200);
  });
  const s=await session();const auth=await startAuth();
  await check('code claim requires same browser and exact Origin',async()=>{
    assert.equal((await fetch('/authorize',form({...auth.fields,code:s.pairingCode,decision:'claim'}))).status,403);
    const bad=form({...auth.fields,code:s.pairingCode,decision:'claim'},auth.cookie);bad.headers.origin='https://attacker.invalid';assert.equal((await fetch('/authorize',bad)).status,403);
  });
  const claim=await fetch('/authorize',form({...auth.fields,code:s.pairingCode,decision:'claim'},auth.cookie));assert.equal(claim.status,200);const finalFields=inputs(await claim.text());
  await check('claim does not activate the project and cannot be reused',async()=>{
    const state=await (await poll(s)).json();assert.equal(state.connected,false);assert.equal(state.commands.length,0);
    assert.equal((await fetch('/authorize',form({...auth.fields,code:s.pairingCode,decision:'claim'},auth.cookie))).status>=400,true);
    assert.equal((await fetch('/authorize',form({...finalFields,decision:'approve'}))).status,403);
  });
  await check('denying confirmed project issues no grant',async()=>{
    const r=await fetch('/authorize',form({...finalFields,decision:'deny'},auth.cookie));assert.equal(r.status,302);assert.equal(new URL(r.headers.get('location')).searchParams.get('error'),'access_denied');assert.equal((await (await poll(s)).json()).connected,false);
  });
  const active=await session(), linked=await grant(active);
  await check('real OAuth library exchanges PKCE code once and enforces replay rejection',async()=>{
    const repeated=await fetch('/oauth/token',form({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,resource,code:linked.code,code_verifier:linked.start.verifier}));assert.notEqual(repeated.status,200);
    assert.notEqual((await fetch('/authorize',form({...linked.fields,decision:'approve'},linked.start.cookie))).status,302);
  });
  await check('unknown scope, foreign resource, and missing S256 rejected',async()=>{
    assert.notEqual((await startAuth('admin')).response.status,200);
    assert.notEqual((await startAuth(undefined,{resource:'https://attacker.invalid/mcp'})).response.status,200);
    assert.notEqual((await startAuth(undefined,{code_challenge_method:'plain'})).response.status,200);
  });
  const writable=await session(), writeGrant=await grant(writable);
  await check('authenticated pixel command reaches the correct browser and preserves receipt',async()=>{
    const pending=mcp('set_draw_pixel',{frameId:'f1',layerId:'l1',x:1,y:1,colorIndex:0,expectedRevision:0,requestId:'runtime_pixel_1'},writeGrant.token);
    let command; for(let i=0;i<30;i++){const value=await (await poll(writable)).json();if(value.commands.length){command=value.commands[0];break;}await new Promise(r=>setTimeout(r,20));}
    assert.ok(command);assert.deepEqual(command.projectBinding,writable.projectBinding);assert.equal(command.operation.type,'pixel.set');
    const ack=await fetch(`/draw-sessions/${writable.sessionId}/commands/${command.commandId}/result`,{method:'POST',headers:{origin:'https://pixieed.jp','content-type':'application/json',authorization:`Bearer ${writable.browserToken}`},body:JSON.stringify({commandId:command.commandId,requestId:command.requestId,status:'applied',projectBinding:writable.projectBinding,revision:1,result:{revision:1}})});assert.equal(ack.status,200);
    const result=await (await pending).json();assert.equal(result.result.structuredContent.status,'applied');
    const status=await (await mcp('get_draw_operation_status',{requestId:'runtime_pixel_1'},writeGrant.token)).json();assert.equal(status.result.structuredContent.status,'applied');
    assert.equal((await (await poll(writable)).json()).commands.length,0);
  });
  await check('invalid private_key_jwt revoke cannot stop the Draw session',async()=>{
    const r=await fetch('/oauth/token',form({client_id:client,token:writeGrant.token,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',client_assertion:'invalid.jwt.value'}));assert.notEqual(r.status,200);assert.equal((await (await poll(writable)).json()).connected,true);
  });
  await check('RFC7009 revocation closes DO before accepting further work',async()=>{
    const r=await fetch('/oauth/token',form({client_id:client,token:writeGrant.token}));assert.equal(r.status,200);assert.equal((await poll(writable)).status,401);assert.equal((await mcp('get_draw_state',{},writeGrant.token)).status,401);
  });
  const readSession=await session(), readGrant=await grant(readSession,'draw:read');
  await check('read-only grant refuses write, save, selection, undo, and redo',async()=>{
    for(const name of ['set_draw_pixel','save_draw','select_draw_layer','undo_draw_edit','redo_draw_edit'])assert.equal((await mcp(name,{},readGrant.token)).status,403);
    assert.equal((await (await poll(readSession)).json()).commands.length,0);
  });
  await check('disconnect withdraws only its own grant',async()=>{
    const result=await (await mcp('disconnect_draw',{},readGrant.token)).json();assert.equal(result.result.structuredContent.disconnected,true);assert.equal((await poll(readSession)).status,401);
  });
  await check('strict form rejects duplicate token fields',async()=>{
    const init=form({client_id:client,token:'one'});init.body+='&token=two';assert.equal((await fetch('/oauth/token',init)).status,400);
  });
  console.log(`Verified ${passed} isolated workerd OAuth scenarios. Browser drawing and real ChatGPT linking require separate acceptance.`);
} finally { await mf.dispose(); }
