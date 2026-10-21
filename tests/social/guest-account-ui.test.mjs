import test from 'node:test';
import assert from 'node:assert/strict';
import {initGuestAccountUi} from '../../js/social/guest-account-ui.mjs';
const ownerId='22222222-2222-4222-8222-222222222222';
const guestId='11111111-1111-4111-8111-111111111111';
function fixture(controller, {noGuest=false, failLocal=false}={}) {
  const fields = {includeLegacy:{checked:false},email:{value:'a@example.test'},accountMode:{value:'new'},code:{value:'123456',focus(){this.focused=true;}}};
  const buttons = Array.from({length:3},()=>({disabled:true}));
  const listeners=new Map(),attrs=new Map();
  const form={elements:{namedItem:name=>fields[name]},querySelectorAll:()=>buttons,addEventListener:(type,fn)=>listeners.set(type,fn),setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  const status={textContent:''},dialog={querySelector:s=>s==='#guestAccountForm'?form:status};
  const events=[];const doc={querySelector:()=>dialog,dispatchEvent:e=>events.push(e.type)};
  let pending=null, localFailed=failLocal;
  const localCalls=[];
  const localTransfer={get pending(){return pending;},async prepareLocal(options){pending={requestNonce:'33333333-3333-4333-8333-333333333333',...options};localCalls.push(['prepare',options]);return pending;},markServerDispatch(){localCalls.push(['dispatch']);},async completeLocal(options){localCalls.push(['complete',options]);if(localFailed)throw Error('端末の関連付け未完了');pending={...pending,phase:'completed'};return{status:'bound',ownerId,count:2,legacyUnclaimedCount:1};},cancel(){localCalls.push(['cancel']);pending=null;}};
  controller.captureSource ||= async()=>({guestId,user:{is_anonymous:true}});
  const claim=controller.claimForCurrentAccount;
  if(claim)controller.claimForCurrentAccount=async options=>{options.beforeDispatch?.();const result=await claim(options);return{...result,userId:ownerId,guestId};};
  const auth={getSession:async()=>({user:{id:ownerId,is_anonymous:false,email_confirmed_at:'now'}})};
  const view=initGuestAccountUi({documentRef:doc,controller,auth,localTransfer,storage:{getItem:()=>noGuest?null:'synthetic'}});
  const submit=value=>listeners.get('submit')({preventDefault(){},submitter:{value}});
  const idle=async()=>{for(let i=0;i<100&&view.busy;i++)await new Promise(r=>setTimeout(r,1));assert.equal(view.busy,false);};
  return {fields,buttons,status,events,view,submit,idle,attrs,localCalls,setLocalFailure(value){localFailed=value;}};
}
test('account UI remains inert until explicit operation and handles email registration without deleting inputs',async()=>{
 const calls=[];const f=fixture({promoteCurrent:async v=>calls.push(v)});
 assert.deepEqual(calls,[]);assert.ok(f.buttons.every(b=>!b.disabled));
 f.submit('send');await f.idle();assert.deepEqual(calls,[{email:'a@example.test'}]);
 assert.equal(f.fields.code.focused,true);assert.equal(f.fields.email.value,'a@example.test');assert.match(f.status.textContent,/コードがない/);
});
test('existing login verifies before claim; failure keeps typed values and enables retry',async()=>{
 const calls=[];let fail=true;const f=fixture({verifyExistingLoginCode:async()=>calls.push('verify'),claimForCurrentAccount:async()=>{calls.push('claim');if(fail)throw Error('引き継ぎ未完了。元のデータを保持しています。');return{status:'claimed'};}});
 f.fields.accountMode.value='existing';f.submit('verify');await f.idle();
 assert.deepEqual(calls,['verify','claim']);assert.match(f.status.textContent,/未完了/);assert.equal(f.fields.code.value,'123456');assert.ok(f.buttons.every(b=>!b.disabled));
 fail=false;f.submit('claim');await f.idle();assert.deepEqual(calls,['verify','claim','claim']);assert.ok(f.events.includes('pixieed:guest-account-confirmed'));
});
test('repeated submit while account operation is loading does not duplicate request',async()=>{
 let resolve;let count=0;const pending=new Promise(r=>resolve=r);const f=fixture({promoteCurrent:async()=>{count++;await pending;}});
 f.submit('send');f.submit('send');assert.equal(f.view.busy,true);assert.equal(f.attrs.get('aria-busy'),'true');assert.ok(f.buttons.every(b=>b.disabled));
 resolve();await f.idle();assert.equal(count,1);assert.equal(f.attrs.has('aria-busy'),false);
});
test('new registration only declares confirmed account after verification resolves',async()=>{
 const f=fixture({verifyEmailRegistration:async()=>({status:'promoted'})});
 f.submit('verify');await f.idle();assert.match(f.status.textContent,/作品 2件/);assert.equal(f.fields.code.value,'');
});

test('local association failure retains code and never announces completion; retry pins same target',async()=>{
 const calls=[];const f=fixture({verifyExistingLoginCode:async()=>{},claimForCurrentAccount:async options=>{calls.push(options);return{status:'claimed'};}},{failLocal:true});
 f.fields.accountMode.value='existing';f.submit('verify');await f.idle();
 assert.match(f.status.textContent,/未完了/);assert.equal(f.fields.code.value,'123456');assert.equal(f.events.length,0);
 f.setLocalFailure(false);f.submit('claim');await f.idle();
 assert.equal(calls[0].expectedTargetId,ownerId);assert.equal(calls[0].expectedGuestId,guestId);assert.ok(f.events.includes('pixieed:guest-account-confirmed'));
});
test('local-only drawing login does not call claim RPC and legacy selection is explicit',async()=>{
 let claims=0;const f=fixture({claimForCurrentAccount:async()=>{claims++;}},{noGuest:true});
 f.submit('claim');await f.idle();assert.equal(claims,0);assert.equal(f.localCalls[0][1].includeLegacy,false);
 f.submit('cancel');await f.idle();assert.match(f.status.textContent,/取り消し/);
 f.fields.includeLegacy.checked=true;f.submit('claim');await f.idle();assert.equal(f.localCalls.findLast(x=>x[0]==='prepare')[1].includeLegacy,true);
});
