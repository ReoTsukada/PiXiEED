import { testPostingConsent } from '../fixtures/posting-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSocialApi} from '../../js/social/api.mjs';
import {createFeedDraftStore} from '../../js/social/drafts.mjs';
import {localPuzzlePlayPath,publicPuzzlePlayPath,savePuzzleForSelf,hasUncertainPuzzlePublication} from '../../js/social/puzzle-audience.mjs';
const id='11111111-1111-4111-8111-111111111111', postId='22222222-2222-4222-8222-222222222222';
const source={mode:'spot_difference',draftId:id};
const image={dataUrl:'data:image/png;base64,AQID',mimeType:'image/png',width:16,height:16,size:3,colorCount:1};
const puzzle={mode:source.mode,definition:{schemaVersion:1,confirmed:true,width:16,height:16,candidates:[{id:'a',pixels:[0]}]},source:{schemaVersion:1}};
function memory(){const rows=new Map();return {rows,async get(k){return rows.get(k)??null;},async put(k,v){rows.set(k,structuredClone(v));},async delete(k){rows.delete(k);},async all(){return [...rows].map(([key,value])=>({key,value}));}};}
const draft={mode:'puzzle',title:'合成問題',caption:'',image,puzzle,localPuzzle:source};

test('self-play saves real local draft only; reload preserves source, payload, and private state',async()=>{
 const adapter=memory();const store=createFeedDraftStore({adapter,makeId:()=>id});
 const before=JSON.stringify(draft);
 const result=await savePuzzleForSelf({draft,source,save:value=>store.archive(value)});
 assert.equal(result.playHref,`/play/spot-difference/?localSpot=${id}`);
 const reloaded=(await createFeedDraftStore({adapter}).list())[0];
 assert.equal(reloaded.visibility,'private');assert.deepEqual(reloaded.localPuzzle,source);assert.deepEqual(reloaded.puzzle,puzzle);
 assert.equal(JSON.stringify(draft),before);
});
test('cancel before local write causes no save; cancel after commit never navigates or claims undo',async()=>{
 const controller=new AbortController();controller.abort();let writes=0;
 await assert.rejects(savePuzzleForSelf({draft,source,signal:controller.signal,save:async()=>{writes++;}}),/中止/);assert.equal(writes,0);
 const during=new AbortController();const result=await savePuzzleForSelf({draft,source,signal:during.signal,save:async()=>{writes++;during.abort();return{id:`draft:${id}`};}});
 assert.equal(result.status,'local');assert.equal(result.playHref,null);assert.equal(writes,1);
});
test('local quota failure never produces a play URL or a success result',async()=>{
 await assert.rejects(savePuzzleForSelf({draft,source,save:async()=>{throw new Error('QuotaExceededError');}}),/Quota/);
 assert.equal(localPuzzlePlayPath({...source,draftId:'//evil.test'}),null);
 assert.equal(localPuzzlePlayPath({mode:'unsupported',draftId:id}),null);
});
test('API rejects private, missing audience and unsupported puzzle before loading Auth/upload dependencies',async()=>{
 let loads=0,fetches=0;
 const api=createSocialApi({config:{url:'https://synthetic.example.test',publishableKey:'synthetic'},loadActions:async()=>{loads++;throw Error('unexpected');},fetchImpl:async()=>{fetches++;throw Error('unexpected');}});
 for(const extra of [{},{visibility:'private'},{visibility:'public',puzzle:{mode:'unsupported'}},{kind:'puzzle',visibility:'public',puzzle:null}])await assert.rejects(api.submit({image,pin:{cellId:'synthetic'},puzzle,...extra}),/端末内に保存/);
 assert.equal(loads,0);assert.equal(fetches,0);
});
test('public puzzle uses existing actions only after explicit public choice, with unchanged original bytes',async()=>{
 let sent;
 const api=createSocialApi({config:{url:'https://synthetic.example.test',publishableKey:'synthetic'},loadActions:async()=>({createSupabasePostActions:()=>({submit:async value=>{sent=value;return{id:postId,status:'published'};}})})});
 const post={image,puzzle,pin:{cellId:'synthetic'},visibility:'public'};
 assert.equal((await api.submit(post)).status,'published');assert.deepEqual(sent,post);
 assert.equal(publicPuzzlePlayPath({id:postId,status:'published'},puzzle.mode),`/play/spot-difference/?postPuzzle=${postId}`);
 for(const status of ['pending','failed',undefined])assert.equal(publicPuzzlePlayPath({id:postId,status},puzzle.mode),null);
 assert.equal(publicPuzzlePlayPath({id:'bad',status:'published'},puzzle.mode),null);
});

// Execute the actual submit handler in a small synthetic environment. Only the
// dynamic location-parser import is injected; no browser/network is launched.
const app=await readFile(new URL('../../js/social/app.mjs',import.meta.url),'utf8');
const saveHandler=app.slice(app.indexOf('  async function saveDraft()'),app.indexOf('  async function submitPost(event)'));
const handler=app.slice(app.indexOf('  async function submitPost(event)'),app.indexOf('  async function checkWavDuration'))
 .replace("await import('../creation/legacy-placement.mjs')",'legacyPlacementModule');
function handlerFixture({visibility='private',submit=async()=>({id:postId,status:'published'})}={}){
 const adapter=memory();const store=createFeedDraftStore({adapter,makeId:()=>id});
 const calls=[],messages=[],links=[],navigation=[];
 const env={consentUi:{read:()=>({...testPostingConsent}),focus(){}},state:{mode:'puzzle',busy:false,submitted:false,archiveSaved:false,attachment:{...image,puzzle},localPuzzle:source,activeDraft:{...draft},saveChain:Promise.resolve(),pageHidden:false},
 visibilityInput:{value:visibility},composer:{open:true},makeDraftFromInputs:()=>({...draft,...env.state.activeDraft,puzzle:env.state.attachment?.puzzle,localPuzzle:env.state.localPuzzle}),savePuzzleForSelf,localPuzzlePlayPath,publicPuzzlePlayPath,hasUncertainPuzzlePublication,
 niceError:e=>e?.message||'',tell:m=>messages.push(m),windowRef:{location:{assign:href=>navigation.push(href)}},
 titleInput:{value:draft.title},captionInput:{value:''},locationInput:{value:'0,0'},form:{},selectComposerPane(){},
 lockComposer(value){env.state.busy=value;},freezeComposer(){},legacyPlacementModule:{cellFromPlaceInput:()=>({id:'synthetic-cell',center:{latitude:0,longitude:0}})},
 text:(v,n)=>String(v).slice(0,n),sha256:async v=>createHash('sha256').update(v).digest('hex'),uuid:()=>id,
 async queueActiveSave(value){env.state.activeDraft=await store.saveActive(value);},api:{async submit(post){calls.push(post);return submit(post);}},
 drafts:store,cleanComposerQuery(){},clearAudio(){},composerStatus:{textContent:'',append(...items){links.push(...items);}},documentRef:{createTextNode:t=>t},node:(tag,props,label)=>({tag,...props,label}),
 async refresh(){},renderDrafts(){},
 async saveDraft(){env.state.busy=true;try{const saved=await store.archive(draft);env.state.archiveSaved=true;return saved;}finally{env.state.busy=false;}}
 };
 env.audioOption=()=>undefined;env.toast=()=>{};env.refreshAudioList=()=>{};
 env.saveDraft=new Function('env',`with(env){return (${saveHandler});}`)(env);
 const run=new Function('env',`with(env){return (${handler});}`)(env);
 return{env,run:()=>run({preventDefault(){}}),calls,messages,links,navigation,adapter};
}
test('actual private handler performs no API call and navigates only to a confirmed local draft',async()=>{
 const f=handlerFixture();await f.run();assert.equal(f.calls.length,0);assert.deepEqual(f.navigation,[`/play/spot-difference/?localSpot=${id}`]);assert.equal(f.links.length,0);
});
test('actual public handler guards double submit and exposes play only after published acknowledgement',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=handlerFixture({visibility:'public',submit:async()=>{await gate;return{id:postId,status:'published'};}});
 const first=f.run();await f.run();for(let i=0;i<20&&!f.calls.length;i++)await new Promise(r=>setImmediate(r));
 assert.equal(f.calls.length,1);assert.equal(f.links.length,0);release();await first;
 assert.equal(f.calls[0].visibility,'public');assert.ok(f.links.some(x=>x.href===`/play/spot-difference/?postPuzzle=${postId}`));
});
test('actual failed submission retains request identity and retries without private data loss',async()=>{
 let fail=true;const f=handlerFixture({visibility:'public',submit:async()=>{if(fail)throw Error('synthetic offline');return{id:postId,status:'pending'};}});
 await f.run();assert.equal(f.env.state.submitted,false);assert.equal(f.links.length,0);const key=f.env.state.activeDraft.requestKey;
 assert.ok(key);assert.deepEqual(f.env.state.attachment.puzzle,puzzle);fail=false;await f.run();
 assert.deepEqual(f.calls.map(x=>x.requestKey),[key,key]);assert.equal(f.env.state.submitted,true);assert.equal(f.links.length,0,'pending is not playable-public');
});
test('reopening puzzle resets to local and account events do not bind submission handlers',()=>{
 const reopen=app.slice(app.indexOf('async function openComposer'),app.indexOf('async function saveDraft'));
 assert.match(reopen,/mode === 'puzzle' && visibilityInput\) visibilityInput.value = 'private'/);
 assert.match(app,/form.addEventListener\('submit', submitPost\)/);
 const globe=readFile(new URL('../../js/globe/post-ui.mjs',import.meta.url),'utf8');
 return globe.then(source=>assert.match(source,/needLogin\(state.puzzle \? \(\) => \{ syncComposer\(\); say\(/));
});
test('mismatched local play source and changing a puzzle to image mode never send its material',async()=>{
 await assert.rejects(savePuzzleForSelf({draft,source:{...source,mode:'hidden_object'},save:async()=>{throw Error('unexpected save');}}),/一致しません/);
 const f=handlerFixture({visibility:'public'});f.env.state.mode='art';await f.run();assert.equal(f.calls.length,0);assert.match(f.messages.at(-1),/パズルの公開設定/);
});
test('legacy puzzle login resume only asks for a new submission click',async()=>{
 const globe=await readFile(new URL('../../js/globe/post-ui.mjs',import.meta.url),'utf8');
 const expression=globe.match(/needLogin\((state\.puzzle \? \(\) => \{ syncComposer\(\); say\([^\n]+?\); \} : \(\) => c\.form\.requestSubmit\(\))\);/)?.[1];
 assert.ok(expression);let submits=0,syncs=0;
 const callback=new Function('state','syncComposer','say','c',`return ${expression};`)({puzzle},()=>syncs++,()=>{}, {form:{requestSubmit(){submits++;}}});
 callback();assert.equal(submits,0);assert.equal(syncs,1);
});

test('unacknowledged or older failed publication stays uncertain after a private local save and reload',async()=>{
 const adapter=memory(),store=createFeedDraftStore({adapter,makeId:()=>id});
 for(const attempt of [undefined,{requestKey:id,status:'uncertain'}]){
  const value={...draft,requestKey:id,requestDigest:'a'.repeat(64),...(attempt?{puzzlePublicationAttempt:attempt}:{})};
  const result=await savePuzzleForSelf({draft:value,source,save:v=>store.archive(v)});
  assert.equal(result.publicationUncertain,true);assert.equal(result.playHref,null);
  const record=await store.get(result.record.id);assert.equal(hasUncertainPuzzlePublication(record),true);assert.equal(record.visibility,'private');
 }
});
test('actual public handler persists uncertainty before dispatch; changing to self-play never promises rollback',async()=>{
 let fail=true;const f=handlerFixture({visibility:'public',submit:async()=>{assert.equal(f.env.state.activeDraft.puzzlePublicationAttempt.status,'uncertain');if(fail)throw Error('lost response');return{id:postId,status:'published'};}});
 await f.run();f.env.visibilityInput.value='private';await f.run();
 assert.equal(f.calls.length,1);assert.equal(f.navigation.length,0);assert.match(f.messages.at(-1),/未確認/);assert.match(f.messages.at(-1),/取り消した状態ではありません/);
 const key=f.calls[0].requestKey;f.env.visibilityInput.value='public';f.env.state.archiveSaved=false;fail=false;await f.run();assert.deepEqual(f.calls.map(x=>x.requestKey),[key,key]);
});
test('actual failed local archive after uncertain public dispatch never claims the earlier post is private',async()=>{
 const f=handlerFixture({visibility:'public',submit:async()=>{throw Error('lost response');}});
 await f.run();const key=f.env.state.activeDraft.requestKey;
 f.env.drafts.archive=async()=>{throw Error('QuotaExceededError');};
 f.env.visibilityInput.value='private';await f.run();
 assert.equal(f.calls.length,1);assert.equal(f.navigation.length,0);assert.equal(f.env.state.archiveSaved,false);
 assert.equal(f.env.state.activeDraft.requestKey,key);assert.deepEqual(f.env.state.attachment.puzzle,puzzle);
 assert.match(f.messages.at(-1),/保存を確認できません/);assert.match(f.messages.at(-1),/前の投稿結果は未確認/);
 assert.doesNotMatch(f.messages.at(-1),/公開していません/);
});
test('actual jigsaw handler keeps private work local, holds unknown publication and exposes only acknowledged public play',async()=>{
 let fail=true;const f=handlerFixture({visibility:'private',submit:async()=>{if(fail)throw Error('lost response');return{id:postId,status:'published'};}});
 const recipe={mode:'jigsaw',definition:{schemaVersion:1,width:16,height:16,confirmed:true,layoutVersion:1,pieceSize:6,seed:'public-seed'}};
 f.env.state.attachment.puzzle=recipe;f.env.state.localPuzzle={mode:'jigsaw',draftId:id};
 f.env.state.activeDraft={...draft,puzzle:recipe,localPuzzle:f.env.state.localPuzzle};
 await f.run();assert.deepEqual(f.navigation,[`/jigsaw/?localJigsaw=${id}`]);assert.equal(f.calls.length,0);
 f.env.state.archiveSaved=false;f.env.visibilityInput.value='public';await f.run();assert.equal(f.links.length,0);
 const key=f.calls[0].requestKey;assert.equal(f.calls[0].puzzle.mode,'jigsaw');
 f.env.visibilityInput.value='private';await f.run();assert.match(f.messages.at(-1),/未確認/);assert.equal(f.navigation.length,1);
 f.env.visibilityInput.value='public';f.env.state.archiveSaved=false;fail=false;await f.run();
 assert.deepEqual(f.calls.map(row=>row.requestKey),[key,key]);assert.ok(f.links.some(row=>row.href===`/jigsaw/?postPuzzle=${postId}`));
});
