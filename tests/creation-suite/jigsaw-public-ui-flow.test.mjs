import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {preparePublicJigsaw} from '../../js/creation/jigsaw-publication.mjs';
import {createJigsawLayout,createJigsawWorkspace,sliceJigsawPieces} from '../../js/creation/jigsaw-workspace.mjs';
import {supabaseConfig} from '../../data/site-config.js';
const source=await readFile(new URL('../../js/creation/jigsaw-page.mjs',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111',project=new URL(supabaseConfig.url).origin;
function bind(code,env){return new Function('env',`with(env){return (${code});}`)(env);}
const postCode=source.slice(source.indexOf('async function prepareJigsawPost()'),source.indexOf('async function encodePxdJigsawImage')).replace("await import('./puzzle-handoff.mjs?rev=20261021-jigsaw-public-1')",'handoffModule');
function postFixture(){
 const messages=[],calls=[];
 const env={publishBusy:false,game:{gameId:id,source:{draftId:'local-draw'},layout:{pieceSize:6},groups:[],pieceOrder:[]},gameDraftId:id,pxdOriginalRefs:null,pxdPreservedPayload:null,pendingPxdSource:null,draftStore:{},adapter:{},publishButton:{disabled:false},updateStatus:v=>messages.push(v),jigsawShareIdentity:v=>JSON.stringify(v),async saveGame(){return true;},handoffModule:{async openPuzzleHandoff(options){calls.push(options);assert.equal(options.isCurrent(),true);}}};
 return{env,messages,calls,run:bind(postCode,env)};
}
test('actual jigsaw preparation guards repeated clicks, saves locally, and releases UI after failure',async()=>{
 const f=postFixture();let release;const gate=new Promise(resolve=>release=resolve);f.env.saveGame=()=>gate;
 const first=f.run();await f.run();assert.equal(f.env.publishBusy,true);assert.equal(f.calls.length,0);release(true);await first;
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].mode,'jigsaw');assert.equal(f.calls[0].destination,'feed');assert.equal(f.env.publishBusy,false);
 f.env.handoffModule.openPuzzleHandoff=async()=>{throw Error('synthetic storage quota');};await f.run();
 assert.equal(f.env.publishBusy,false);assert.equal(f.env.publishButton.disabled,false);assert.match(f.messages.at(-1),/quota/);assert.equal(f.env.game.gameId,id);
});
test('actual preparation never sends unsupported sources, cancelled local saves or stale edited state',async()=>{
 for(const type of ['file','public']){const f=postFixture();let saves=0;f.env.game.source.type=type;f.env.saveGame=async()=>{saves++;return true;};await f.run();assert.equal(saves,0);assert.equal(f.calls.length,0);}
 const cancelled=postFixture();cancelled.env.saveGame=async()=>false;await cancelled.run();assert.equal(cancelled.calls.length,0);
 const edited=postFixture();edited.env.saveGame=async()=>{edited.env.game={...edited.env.game,groups:[{new:true}]};return true;};await edited.run();assert.equal(edited.calls.length,0);assert.match(edited.messages.at(-1),/配置が変わり/);
});
const readCode=source.slice(source.indexOf('async function readPublishedJigsaw('),source.indexOf('async function openPublishedJigsaw('));
const openCode=source.slice(source.indexOf('async function openPublishedJigsaw('),source.indexOf('function jigsawShareIdentity('));
function publicFixture(status=200){
 const payload={ok:true,puzzle:{postId:id,title:'合成問題',mode:'jigsaw',originalImage:{url:`${project}/storage/v1/object/public/post-public/${id}/22222222-2222-4222-8222-222222222222.png`,width:16,height:16},definition:{schemaVersion:1,width:16,height:16,confirmed:true,layoutVersion:1,pieceSize:6,seed:'recipe'}}};
 const messages=[],requests=[];const original={gameId:'old-private'};
 const env={supabaseConfig:{url:project,publishableKey:'synthetic'},fetch:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(payload),{status});},preparePublicJigsaw,updateStatus:v=>messages.push(v),fetchImageBytes:async()=>new Uint8Array([1]).buffer,fingerprintBytes:async()=> 'a'.repeat(64),decodeImage:async()=>({}),boundedRgba:()=>({width:16,height:16,rgba:new Uint8Array(1024)}),createJigsawLayout,createJigsawWorkspace,sliceJigsawPieces,
  game:original,gameDraftId:'old-private',sourceRevision:{},sourceDraftId:'old-draw',layoutData:null,pieces:[],selectedGroupId:null,trayPage:0,view:{},pxdOriginalRefs:{},pxdPreservedPayload:{},resultShownRun:0,
  cancelJigsawResult(){},clearSelectionCache(){},pxdBridge:{reset(){}},setSourcePreview(){},sourceLabel:{textContent:''},saveButton:{disabled:true},showGame(){}};
 env.readPublishedJigsaw=bind(readCode,env);
 return{env,messages,requests,original,payload,run:()=>bind(openCode,env)(id)};
}
test('actual public loader uses validated recipe and a fresh local save ID; failed read keeps private work',async()=>{
 const f=publicFixture();await f.run();assert.notEqual(f.env.game,f.original,f.messages.join(' / '));assert.equal(f.env.game.source.postId,`map:${id}`);assert.equal(f.env.game.source.puzzleMode,'jigsaw');assert.notEqual(f.env.gameDraftId,id);
 assert.equal(f.env.layoutData.seed,'recipe');assert.equal(f.requests[0].options.credentials,'omit');assert.equal(f.requests[0].options.method,'GET');
 for(const status of [404,503]){const failed=publicFixture(status);await failed.run();assert.equal(failed.env.game,failed.original);assert.equal(failed.env.gameDraftId,'old-private');assert.match(failed.messages.at(-1),/開けません/);}
 const invalid=publicFixture();invalid.payload.puzzle.originalImage.url='https://external.example.test/private.png';await invalid.run();assert.equal(invalid.env.game,invalid.original);
});
