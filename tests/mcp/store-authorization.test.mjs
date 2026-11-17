import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeDraw, storeSessionCreation, readStrictForm, revocationEnvironment, STORE_ISSUER, STORE_RESOURCE } from '../../scripts/mcp/store-authorization.mjs';
import { LocalDrawSessionRelay, relayFetch, relayJsonRequest } from '../../scripts/mcp/draw-session-relay.mjs';
import { LocalDrawAdmission } from '../../scripts/mcp/draw-session-admission.mjs';
const bodyFields = text => Object.fromEntries([...text.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(m=>[m[1],m[2]]));
const post=(values,cookie,origin=STORE_ISSUER,fetchSite)=>new Request(`${STORE_ISSUER}/authorize`,{method:'POST',headers:{...(origin !== undefined ? {origin}:{}),'content-type':'application/x-www-form-urlencoded',...(cookie?{cookie}:{}),...(fetchSite !== undefined ? {'sec-fetch-site':fetchSite}:{})},body:new URLSearchParams(values)});
function setup() {
  const records=new Map(), calls=[];
  const env={OAUTH_KV:{async get(k){return structuredClone(records.get(k)||null)},async put(k,v){records.set(k,JSON.parse(v))},async delete(k){calls.push(['delete',k]);records.delete(k)}},LOCAL_DRAW_RELAY:new LocalDrawSessionRelay(),LOCAL_DRAW_ADMISSION:new LocalDrawAdmission(),LOCAL_DRAW_IP:'127.0.0.1',ALLOW_LOCAL_ORIGIN:'1',DRAW_ADMISSION_SECRET:'local-test-secret-long-enough-for-testing-only',SITE_ORIGIN:'https://pixieed.jp'};
  const auth={clientId:'https://chatgpt.com/oauth/client.json',redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',scope:['draw:read','draw:write'],resource:STORE_RESOURCE};
  const oauth={async parseAuthRequest(){return auth},async describeConsent(){return {clientName:'ChatGPT <script>',clientDomain:'chatgpt.com',redirectHost:'chatgpt.com',scope:auth.scope}},async beginConsent(){return {handle:'test-library-handle',headers:new Headers()}},async approveConsent(){calls.push(['approve']);return {request:auth,headers:new Headers()}},async completeAuthorization(value){calls.push(['complete',value]);return {redirectTo:'https://chatgpt.com/connector_platform_oauth_redirect?code=test'}},async denyConsent(){return {headers:new Headers({Location:'https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied'})}}};
  return {env,oauth,calls,records};
}
async function begin({env,oauth}) {
  const response=await authorizeDraw(new Request(`${STORE_ISSUER}/authorize?client_id=https%3A%2F%2Fchatgpt.com%2Foauth%2Fclient.json`),env,oauth);
  assert.equal(response.status,200);const html=await response.text();
  return {fields:bodyFields(html),html,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),referrerPolicy:response.headers.get('referrer-policy'),csp:response.headers.get('content-security-policy')};
}
async function create(env) {
  const r=await storeSessionCreation(new Request(`${STORE_ISSUER}/draw-store-sessions`,{method:'POST',headers:{origin:'https://pixieed.jp','content-type':'application/json'},body:JSON.stringify({projectBinding:{projectId:'p-test',openEpoch:'e-test'},projectName:'Test <apple>'})}),env);
  assert.equal(r.status,200);return r.json();
}
test('consent escapes metadata, blocks framing, and binds code claim to browser and origin',async()=>{
  const setupValue=setup(),start=await begin(setupValue),s=await create(setupValue.env);
  assert.equal(start.referrerPolicy,'same-origin');
  assert.match(start.csp,/form-action 'self' https:\/\/chatgpt\.com\/connector_platform_oauth_redirect/);
  assert.doesNotMatch(start.csp,/\*/);
  for(const directive of ["default-src 'none'","style-src 'unsafe-inline'","base-uri 'none'","frame-ancestors 'none'"])assert.ok(start.csp.includes(directive),`CSP retains ${directive}`);
  assert.ok(start.html.includes('ChatGPT &#60;script&#62;'));assert.ok(!start.html.includes('ChatGPT <script>'));
  for(const [cookie,origin] of [[undefined,STORE_ISSUER],[start.cookie,'https://attacker.test']])assert.equal((await authorizeDraw(post({...start.fields,code:s.pairingCode,decision:'claim'},cookie,origin),setupValue.env,setupValue.oauth)).status,403);
});
test('authorization POST still rejects null/foreign Origin and cross-site Fetch Metadata',async()=>{
  const fixture=setup(),start=await begin(fixture),s=await create(fixture.env),fields={...start.fields,code:s.pairingCode,decision:'claim'};
  for(const request of [
    post(fields,start.cookie,'null','same-origin'),
    post(fields,start.cookie,'https://attacker.test','same-origin'),
    post(fields,start.cookie,STORE_ISSUER,'cross-site')
  ]) assert.equal((await authorizeDraw(request,fixture.env,fixture.oauth)).status,403);
  assert.equal(fixture.calls.some(call=>call[0]==='approve'),false);
});
test('claim is inactive; final approval and server-only grant props activate exactly once',async()=>{
  const fixture=setup(),start=await begin(fixture),s=await create(fixture.env);
  const claim=await authorizeDraw(post({...start.fields,code:s.pairingCode,decision:'claim'},start.cookie),fixture.env,fixture.oauth);
  assert.equal(claim.status,200);const html=await claim.text();assert.ok(html.includes('Test &#60;apple&#62;'));assert.ok(!html.includes(s.pairingCode));
  const room=fixture.env.LOCAL_DRAW_RELAY.rooms.get(s.sessionId);assert.equal((await room.load()).agentTokenHash,null);
  const fields=bodyFields(html),approved=await authorizeDraw(post({...fields,decision:'approve'},start.cookie),fixture.env,fixture.oauth);assert.equal(approved.status,302);
  assert.ok((await room.load()).agentTokenHash);const complete=fixture.calls.find(v=>v[0]==='complete')[1];assert.equal(complete.props.connectionId,s.sessionId);assert.equal(complete.scope.join(' '),'draw:read draw:write');
  assert.equal((await authorizeDraw(post({...fields,decision:'approve'},start.cookie),fixture.env,fixture.oauth)).status,403);
});
test('grant creation failure revokes the activated relay rather than leaving a usable delegation',async()=>{
  const fixture=setup();fixture.oauth.completeAuthorization=async()=>{throw new Error('fake outage')};
  const start=await begin(fixture),s=await create(fixture.env);
  const claim=await authorizeDraw(post({...start.fields,code:s.pairingCode,decision:'claim'},start.cookie),fixture.env,fixture.oauth);
  const response=await authorizeDraw(post({...bodyFields(await claim.text()),decision:'approve'},start.cookie),fixture.env,fixture.oauth);
  assert.equal(response.status,400);const state=await fixture.env.LOCAL_DRAW_RELAY.rooms.get(s.sessionId).load();assert.equal(state.revoked,true);
});
test('legacy session cannot be claimed by the public consent flow',async()=>{
  const fixture=setup(),start=await begin(fixture),s=await create(fixture.env);
  const room=fixture.env.LOCAL_DRAW_RELAY.rooms.get(s.sessionId),state=await room.load();state.mode='legacy';await room.save(state);
  assert.equal((await authorizeDraw(post({...start.fields,code:s.pairingCode,decision:'claim'},start.cookie),fixture.env,fixture.oauth)).status,400);
  assert.equal((await room.load()).agentTokenHash,null);
});
test('strict forms reject duplicate parameters, JSON, and oversize streams',async()=>{
  await assert.rejects(()=>readStrictForm(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'token=a&token=b'})));
  await assert.rejects(()=>readStrictForm(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})));
  await assert.rejects(()=>readStrictForm(post({code:'x'.repeat(17000)},'')));
});
test('request-local revocation KV gate closes the DO before deleting the matching token',async()=>{
  const fixture=setup(),s=await create(fixture.env),secret=s.pairingCode.split('.')[1],claimBinding='A'.repeat(43),authFingerprint='a'.repeat(64);
  assert.equal((await relayFetch(fixture.env,s.sessionId,'/_relay/store-claim',relayJsonRequest('/_relay/store-claim',{secret,claimBinding,authFingerprint}))).status,200);
  const activated=await (await relayFetch(fixture.env,s.sessionId,'/_relay/store-activate',relayJsonRequest('/_relay/store-activate',{claimBinding,authFingerprint}))).json();
  const original=fixture.env.OAUTH_KV;original.delete=async key=>{assert.equal((await fixture.env.LOCAL_DRAW_RELAY.rooms.get(s.sessionId).load()).revoked,true);fixture.calls.push(['deleted',key])};
  const isolated=revocationEnvironment(fixture.env,{userId:'u1',props:{...activated,grantId:'g1'}});
  assert.notEqual(isolated.OAUTH_KV,original);assert.equal((await fixture.env.LOCAL_DRAW_RELAY.rooms.get(s.sessionId).load()).revoked,false);
  await isolated.OAUTH_KV.delete('token:u1:g1:hash');assert.equal(fixture.calls.at(-1)[0],'deleted');
});
