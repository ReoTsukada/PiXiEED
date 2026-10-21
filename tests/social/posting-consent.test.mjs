import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {postingPolicy, isPostingPolicyReady, requirePostingConsent} from '../../data/posting-policy.mjs';
import {createPostingConsentUi} from '../../js/posting-consent-ui.mjs';
import {createSocialServerActions} from '../../js/social/server-actions.mjs';
import {testPostingPolicy, testPostingConsent} from '../fixtures/posting-policy.mjs';

test('unissued documents, absent decision and old versions fail closed',()=>{
 assert.equal(isPostingPolicyReady(),false);
 for(const policy of [postingPolicy,{...testPostingPolicy,contactConfirmed:false},{...testPostingPolicy,terms:{...testPostingPolicy.terms,url:''}}])
  assert.throws(()=>requirePostingConsent(testPostingConsent,policy),e=>e.code==='posting_policy_unavailable');
 for(const accepted of [undefined,false,'true',1]) assert.throws(()=>requirePostingConsent({...testPostingConsent,accepted},testPostingPolicy),e=>e.code==='posting_consent_required');
 assert.throws(()=>requirePostingConsent({...testPostingConsent,termsVersion:'old'},testPostingPolicy),e=>e.code==='posting_consent_version_mismatch');
 assert.deepEqual(requirePostingConsent({...testPostingConsent,userId:'forged',acceptedAt:'forged',ip:'forged'},testPostingPolicy),testPostingConsent);
});

class Element {
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.listeners=new Map();this.classList={add(){}};this.hidden=false;}
 setAttribute(k,v){this.attrs[k]=v;} append(...items){this.children.push(...items);} closest(){return this.ownerDocument.form;}
 addEventListener(k,f){const fs=this.listeners.get(k)||[];fs.push(f);this.listeners.set(k,fs);}
 removeEventListener(k,f){this.listeners.set(k,(this.listeners.get(k)||[]).filter(x=>x!==f));}
 fire(k,event={}){for(const f of this.listeners.get(k)||[]) f(event);} focus(){this.ownerDocument.focus=this;}
}
function uiFixture(policy=postingPolicy){
 const values=new Map(); const doc={createElement(tag){return new Element(tag,this);},createTextNode(text){return {textContent:text};}};
 doc.form=new Element('form',doc);const win=new Element('window',doc);win.localStorage={getItem:k=>values.get(k)};doc.defaultView=win;
 const host=new Element('div',doc);host.hidden=true;const controller=createPostingConsentUi(host,{policy,documentRef:doc,windowRef:win});
 return {host,doc,win,values,controller};
}
function all(element){return [element,...(element.children||[]).flatMap(all)];}
test('pending UI has a focusable reason and never offers fake Terms or a usable checkbox',()=>{
 const {host,controller,doc}=uiFixture();controller.setPublic(true);
 assert.equal(controller.accepted,false);assert.equal(all(host).filter(e=>e.tag==='a'||e.tag==='input').length,0);
 controller.focus();assert.equal(doc.focus.attrs.role,'status');
 assert.throws(()=>controller.read(),e=>e.code==='posting_policy_unavailable');
});
test('issued synthetic UI starts unchecked, resets on self-save/reopen/session switch and keeps old displayed version',()=>{
 const policy=structuredClone(testPostingPolicy);const {host,controller,win,values}=uiFixture(policy);
 const input=all(host).find(e=>e.tag==='input'),links=all(host).filter(e=>e.tag==='a');
 assert.equal(input.type,'checkbox');assert.equal(input.checked,false);assert.equal(links.length,2);assert.ok(links.every(l=>l.rel==='noopener noreferrer'));
 controller.setPublic(true);input.checked=true;input.fire('change');assert.deepEqual(controller.read(),testPostingConsent);
 policy.terms.version='new-but-never-displayed';assert.equal(controller.read().termsVersion,testPostingConsent.termsVersion);
 controller.setPublic(false);assert.equal(host.hidden,true);assert.equal(input.checked,false);
 controller.setPublic(true);input.checked=true;input.fire('change');values.set('PiXiEED:supabase-session:v1','different synthetic account');
 assert.throws(()=>controller.read(),e=>e.code==='posting_consent_required');assert.equal(input.checked,false);
 input.checked=true;win.fire('storage',{key:'PiXiEED:supabase-session:v1'});assert.equal(input.checked,false);
 input.checked=true;input.fire('change');values.set('PiXiEED:legacy-owner-session:v1','another synthetic owner');assert.throws(()=>controller.read(),e=>e.code==='posting_consent_required');
 controller.destroy();assert.equal(win.listeners.get('storage').length,0);
});
test('public API stops before Auth, FormData/audio or network when policy/decision is absent',async()=>{
 let calls=0;const api=createSocialServerActions({config:{url:'https://project.example.test',publishableKey:'synthetic'},fetchImpl:()=>{calls++;throw Error('network forbidden');}});
 for(const kind of ['text','music']) await assert.rejects(api.submit({kind,visibility:'public'}),e=>e.code==='posting_policy_unavailable');
 assert.equal(calls,0);
 const configured=createSocialServerActions({postingPolicy:testPostingPolicy,config:{url:'https://project.example.test',publishableKey:'synthetic'},fetchImpl:()=>{calls++;throw Error('network forbidden');}});
 await assert.rejects(configured.submit({kind:'text',visibility:'public'}),e=>e.code==='posting_consent_required');assert.equal(calls,0);
});
test('privacy candidate identifies approved operator/contact and preserves existing analytics/ad wording byte for byte',async()=>{
 const {execFileSync}=await import('node:child_process');
 const current=await readFile(new URL('../../privacy/index.html',import.meta.url),'utf8');
 const baseline=execFileSync('git',['show','32382fcc:privacy/index.html'],{cwd:new URL('../..',import.meta.url),encoding:'utf8'});
 for(const title of ['取得する情報','Google広告と広告データ']){
  const block=s=>s.match(new RegExp('<details(?: open)?><summary>'+title+'<\\/summary>[\\s\\S]*?<\\/details>'))?.[0];assert.equal(block(current),block(baseline));
 }
 assert.match(current,/PiXiEED アルタ/);assert.match(current,/href="mailto:pixieed\.arta@gmail\.com">pixieed\.arta@gmail\.com<\/a>/);assert.equal((current.match(/mailto:/g)||[]).length,1);
});

test('receipt table is service-only and is not reassigned by guest claim',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/20261021140044_posting_consent_receipts.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/i);assert.match(sql,/revoke all[^;]+PUBLIC, anon, authenticated/i);assert.match(sql,/grant select, insert[^;]+service_role/i);assert.doesNotMatch(sql,/grant[^;]+to (?:anon|authenticated)|security definer/i);
 const claim=await readFile(new URL('../../supabase/migrations/20261021092108_guest_claim.sql',import.meta.url),'utf8');assert.doesNotMatch(claim,/posting_consents/);
});

test('policy version change requires a new decision but does not alter the content retry identity',()=>{
 const newer={...testPostingPolicy,terms:{...testPostingPolicy.terms,version:'synthetic-terms-2'}};
 assert.throws(()=>requirePostingConsent(testPostingConsent,newer),e=>e.code==='posting_consent_version_mismatch');
 assert.equal(requirePostingConsent({...testPostingConsent,termsVersion:newer.terms.version},newer).termsVersion,newer.terms.version);
});
test('real globe write adapter rejects unissued policy and private intent without any network request',async()=>{
 const {createSupabasePostActions}=await import('../../js/globe/post-supabase.mjs');
 let calls=0;const prior=globalThis.fetch;globalThis.fetch=()=>{calls++;throw Error('network forbidden');};
 try{
  await assert.rejects(createSupabasePostActions().submit({visibility:'public'}),e=>e.code==='posting_policy_unavailable');
  await assert.rejects(createSupabasePostActions({postingPolicy:testPostingPolicy}).submit({visibility:'private',postingConsent:testPostingConsent}),/自分用/);
  assert.equal(calls,0);
 }finally{globalThis.fetch=prior;}
});
