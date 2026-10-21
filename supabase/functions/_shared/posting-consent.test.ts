import assert from 'node:assert/strict';
import {createPostHandler} from '../create-post/index.ts';
import {socialFeedHandler} from '../social-feed/index.ts';
import {persistPostingConsent, postingConsentRecord} from './posting-consent.ts';
import {testPostingPolicy, testPostingConsent} from '../../../tests/fixtures/posting-policy.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const key='22222222-2222-4222-8222-222222222222';
function request(payload: unknown){return new Request('https://synthetic.invalid/functions/v1/post',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic'},body:JSON.stringify(payload)});}
Deno.test('image and every puzzle reject absent/currently unissued/old consent before clients or media writes',async()=>{
 for(const puzzle of [undefined,{mode:'jigsaw'},{mode:'spot_difference'},{mode:'hidden_object'}]){
  let calls=0;const deps={projectUrl:'https://example.invalid',publishableKey:'synthetic',serviceKey:'synthetic',createClient:(()=>{calls++;throw Error('side effect forbidden');}) as never};
  let response=await createPostHandler(request({puzzle,postingConsent:testPostingConsent}),deps);
  assert.equal(response.status,503);assert.equal((await response.json()).error,'posting_policy_unavailable');
  for(const consent of [undefined,{...testPostingConsent,accepted:false},{...testPostingConsent,privacyVersion:'old'}]){
   response=await createPostHandler(request({puzzle,postingConsent:consent}),{...deps,postingPolicy:testPostingPolicy});
   assert.equal(response.status,428);
  }
  assert.equal(calls,0);
 }
});
Deno.test('public text, music and public edits share the pre-Auth/pre-reservation gate; private/read/delete remain separate',async()=>{
 let calls=0;const deps={projectUrl:'https://example.invalid',publishableKey:'synthetic',serviceKey:'synthetic',createClient:()=>{calls++;throw Error('side effect forbidden');}};
 for(const action of ['create','edit'])for(const kind of ['text','music']){
  let response=await socialFeedHandler(request({action,kind,visibility:'public',postingConsent:testPostingConsent}),deps);
  assert.equal(response.status,503);assert.equal((await response.json()).error,'posting_policy_unavailable');
  for(const consent of [undefined,{...testPostingConsent,accepted:false},{...testPostingConsent,termsVersion:'old'}]){
   response=await socialFeedHandler(request({action,kind,visibility:'public',postingConsent:consent}),{...deps,postingPolicy:testPostingPolicy});
   assert.equal(response.status,428);
  }
 }
 assert.equal(calls,0);
 for(const payload of [{action:'create',kind:'text',visibility:'private'},{action:'delete'},{action:'list'}]){
  const response=await socialFeedHandler(request(payload),deps);assert.notEqual((await response.json()).error,'posting_policy_unavailable');
 }
 assert.ok(calls>0);
});
Deno.test('server receipt binds verified identity, request digest and exact versions; retry retains original time; another owner is distinct',async()=>{
 const records=new Map<string,any>();
 const admin={from(name:string){assert.equal(name,'posting_consents');let filters:Record<string,unknown>={};return {
  async upsert(row:any,options:any){assert.equal(options.ignoreDuplicates,true);const k=[row.owner_id,row.purpose,row.request_key,row.terms_version,row.privacy_version].join(':');if(!records.has(k))records.set(k,{...row});return {error:null};},
  select(){return this;},eq(k:string,v:unknown){filters[k]=v;return this;},async maybeSingle(){return {data:[...records.values()].find(r=>Object.entries(filters).every(([k,v])=>r[k]===v)),error:null};}
 };}};
 const record=postingConsentRecord(owner,'image',key,'c'.repeat(64),testPostingPolicy);
 const saved=await persistPostingConsent(admin,record);
 const again=await persistPostingConsent(admin,{...record,accepted_at:'2099-01-01T00:00:00Z'});
 assert.equal(saved.accepted_at,again.accepted_at);assert.equal(records.size,1);
 await assert.rejects(persistPostingConsent(admin,{...record,request_digest:'d'.repeat(64)}),/posting_consent_request_conflict/);
 await persistPostingConsent(admin,{...record,owner_id:'33333333-3333-4333-8333-333333333333'});assert.equal(records.size,2);
 assert.deepEqual(Object.keys(record).sort(),['owner_id','purpose','request_key','request_digest','terms_version','privacy_version','terms_sha256','privacy_sha256','accepted_at'].sort());
});
Deno.test('receipt save failure cannot count as consent success',async()=>{
 const admin={from(){return {upsert:async()=>({error:{message:'synthetic capacity failure'}})};}};
 await assert.rejects(persistPostingConsent(admin,postingConsentRecord(owner,'image',key,'e'.repeat(64),testPostingPolicy)),/posting_consent_save_failed/);
});

Deno.test('a public SNS receipt uses verified getUser identity and a save failure stops before reservation/upload',async()=>{
 let calls=0,seen:any=null;const verified='44444444-4444-4444-8444-444444444444';
 const deps={projectUrl:'https://example.invalid',publishableKey:'public',serviceKey:'service',postingPolicy:testPostingPolicy,
 createClient:(_url:string,role:string)=>role==='public'?{auth:{getUser:async()=>({data:{user:{id:verified}},error:null})}}:{rpc(){calls++;throw Error('reservation forbidden');}},
 recordConsent:async(_admin:any,record:any)=>{seen=record;throw Error('synthetic storage failure');}};
 const response=await socialFeedHandler(request({action:'create',kind:'text',title:'synthetic',body:'synthetic',visibility:'public',requestKey:key,postingConsent:{...testPostingConsent,ownerId:owner,acceptedAt:'2099-01-01T00:00:00Z'}}),deps);
 assert.equal(response.status,503);assert.equal((await response.json()).error,'posting_consent_save_failed');
 assert.equal(calls,0);assert.equal(seen.owner_id,verified);assert.notEqual(seen.accepted_at,'2099-01-01T00:00:00Z');
});
