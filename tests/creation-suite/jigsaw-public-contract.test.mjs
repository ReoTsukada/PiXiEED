import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDrawDocument,encodePng} from '../../js/creation/draw-core.mjs';
import {validateJigsawPuzzleDefinition} from '../../supabase/functions/_shared/puzzle-definition.mjs';
import {admitPuzzleUpload} from '../../supabase/functions/_shared/puzzle-admission.mjs';
import {inspectPixelPng} from '../../supabase/functions/_shared/pixel-png.mjs';
import {buildPublicPuzzleResponse} from '../../supabase/functions/_shared/public-puzzle.mjs';
import {localPuzzlePlayPath,publicPuzzlePlayPath,savePuzzleForSelf} from '../../js/social/puzzle-audience.mjs';
import {createFeedDraftStore} from '../../js/social/drafts.mjs';
import {createSocialApi} from '../../js/social/api.mjs';
import {createMemoryDraftAdapter,createLocalDraftStore} from '../../js/creation/local-drafts.mjs';
import {createJigsawLayout,createJigsawWorkspace,sliceJigsawPieces,reassembleJigsawPieces} from '../../js/creation/jigsaw-workspace.mjs';
import {documentRgba} from '../../js/creation/draw-core.mjs';
import {openPuzzleHandoff,PUZZLE_HANDOFF_KEY} from '../../js/creation/puzzle-handoff.mjs';
import {adoptSocialHandoff} from '../../js/social/tool-handoff.mjs';
import {preparePublicJigsaw} from '../../js/creation/jigsaw-publication.mjs';

const id='11111111-1111-4111-8111-111111111111',project='https://synthetic.example.test';
const definition={schemaVersion:1,width:16,height:16,confirmed:true,layoutVersion:1,pieceSize:6,seed:'public-seed'};
const source={schemaVersion:1,original:{draftId:'draw',assetId:'asset',revisionId:'rev',contentHash:'a'.repeat(64),hashScheme:'sha256-canonical-v1'}};
const recipe={mode:'jigsaw',source,definition};
async function fixture(){const doc=createDrawDocument(16);doc.pixels[3]=2;const bytes=encodePng(doc);return{bytes,claim:{mimeType:'image/png',size:bytes.length,...await inspectPixelPng(bytes)}};}

test('jigsaw admission accepts only a deterministic public recipe and preserves original PNG bytes',async()=>{
 const {bytes,claim}=await fixture(),before=new Uint8Array(bytes),payload=structuredClone(recipe);
 const admitted=await admitPuzzleUpload(payload,bytes,claim);
 assert.equal(admitted.mode,'jigsaw');assert.deepEqual(admitted.definition,definition);
 assert.equal(Object.hasOwn(admitted,'changed'),false);assert.deepEqual(bytes,before);assert.deepEqual(payload,recipe);
 for(const change of [{seed:'https://secret.test/key'},{seed:''},{layoutVersion:2},{pieceSize:0},{pieceSize:3.2},{groups:[]},{source:{dataUrl:'private'}},{width:15},{confirmed:false}]){
  await assert.rejects(admitPuzzleUpload({...recipe,definition:{...definition,...change}},bytes,claim));
 }
 await assert.rejects(admitPuzzleUpload({...recipe,changedImage:{}},bytes,claim),{code:'puzzle_changed_image_unexpected'});
});
test('jigsaw recipe rejects excessive work and player progress before public serialization',()=>{
 const image={width:512,height:512,rgba:new Uint8Array(512*512*4)};
 assert.throws(()=>validateJigsawPuzzleDefinition({...definition,width:512,height:512,pieceSize:3},image),/上限/);
 for(const value of [{...definition,pieceOrder:[]},{...definition,viewport:{}},{...definition,seed:'x'.repeat(129)}])assert.throws(()=>validateJigsawPuzzleDefinition(value,{width:16,height:16,rgba:new Uint8Array(1024)}));
});
test('jigsaw public builder refuses pending/hidden parent, unapproved recipe and unrelated media',async()=>{
 const {bytes,claim}=await fixture();
 const input={requestedPostId:id,parent:{id,status:'published',publishedAt:'2026-10-21T12:00:00Z',title:'合成問題',authorLabel:'合成作者',imageClaim:claim},point:{postId:id,publishedAt:'2026-10-21T12:00:00Z',imagePath:`${id}/source.png`},puzzle:{postId:id,reviewState:'approved',mode:'jigsaw',schemaVersion:1,definition,privateNote:'private'},originalBytes:bytes};
 const response=await buildPublicPuzzleResponse(input,project);
 assert.equal(response.puzzle.mode,'jigsaw');assert.deepEqual(response.puzzle.definition,definition);
 assert.equal(JSON.stringify(response).includes('private'),false);assert.equal(JSON.stringify(response).includes('draftId'),false);
 for(const status of ['pending','hidden','rejected'])await assert.rejects(buildPublicPuzzleResponse({...input,parent:{...input.parent,status}},project));
 await assert.rejects(buildPublicPuzzleResponse({...input,puzzle:{...input.puzzle,reviewState:'pending'}},project));
 await assert.rejects(buildPublicPuzzleResponse({...input,point:{...input.point,imagePath:'other/source.png'}},project));
});
test('jigsaw local archive/reload stays private without API load, only published acknowledgement creates opaque public link',async()=>{
 const rows=new Map(),adapter={async get(k){return rows.get(k)||null;},async put(k,v){rows.set(k,structuredClone(v));},async delete(k){rows.delete(k);},async all(){return [...rows].map(([key,value])=>({key,value}));}};
 const store=createFeedDraftStore({adapter,makeId:()=>id});
 const draft={mode:'puzzle',title:'合成ジグソー',puzzle:recipe,localPuzzle:{mode:'jigsaw',draftId:id}};
 const saved=await savePuzzleForSelf({draft,source:draft.localPuzzle,save:v=>store.archive(v)});
 assert.equal(saved.playHref,`/jigsaw/?localJigsaw=${id}`);assert.equal((await store.get(saved.record.id)).visibility,'private');
 assert.equal(localPuzzlePlayPath(draft.localPuzzle),saved.playHref);
 for(const status of ['pending','hidden',undefined])assert.equal(publicPuzzlePlayPath({id,status},'jigsaw'),null);
 assert.equal(publicPuzzlePlayPath({id,status:'published'},'jigsaw'),`/jigsaw/?postPuzzle=${id}`);
 let loaded=0;const api=createSocialApi({config:{url:project,publishableKey:'synthetic'},loadActions:async()=>{loaded++;throw Error('unexpected');}});
 await assert.rejects(api.submit({kind:'puzzle',puzzle:recipe,visibility:'private'}));assert.equal(loaded,0);
});
test('jigsaw DB proposal is transactional, service-only, guarded and does not add policies, buckets or legacy writes',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/20261021121542_jigsaw_publication.sql',import.meta.url),'utf8');
 assert.match(sql,/UNAPPLIED LOCAL PROPOSAL/);assert.match(sql,/begin;/);assert.match(sql,/commit;/);
 assert.match(sql,/jigsaw_function_definition_changed/);assert.match(sql,/jigsaw_function_signature_changed/);
 assert.match(sql,/approved_constraints constant jsonb := '\{\}'::jsonb/);assert.match(sql,/jigsaw_constraint_review_required/);assert.match(sql,/jigsaw_constraint_definition_changed/);
 assert.match(sql,/revoke all on function.*from public,anon,authenticated/);
 assert.doesNotMatch(sql,/create\s+(?:policy|table)|insert\s+into\s+(?:storage\.|public\.pixfind|auth\.)|grant[^;]+to\s+(?:anon|authenticated)/i);
});
test('fixed local drawing → explicit feed handoff → admitted public recipe → other-player pieces retains all RGBA bytes',async()=>{
 const adapter=createMemoryDraftAdapter(),store=createLocalDraftStore(adapter);
 const doc=createDrawDocument(16);doc.pixels[4]=2;doc.pixels[19]=3;
 const fixed=await store.save({draftId:'synthetic-draw',kind:'pixel_art',document:doc});
 const drawRef={draftId:'synthetic-draw',assetId:fixed.asset.assetId,revisionId:fixed.revisionId,contentHash:fixed.documentHash,hashScheme:fixed.hashScheme};
 const layout=createJigsawLayout({...definition});
 const game=createJigsawWorkspace({gameId:id,source:drawRef,layout});
 await store.save({draftId:id,kind:'jigsaw',document:game});
 const before=await adapter.get(id),mediaBefore=await adapter.get('synthetic-draw');
 const rows=new Map(),navigation=[];
 const windowRef={location:{href:'https://pixieed.test/jigsaw/'},sessionStorage:{getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)}};
 windowRef.parent=windowRef;windowRef.location.assign=href=>navigation.push(href);
 const adapters={encodeImage:async value=>new Blob([encodePng(value)],{type:'image/png'}),inspectImage:async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());return{dataUrl:'data:image/png;base64,'+Buffer.from(bytes).toString('base64'),mimeType:'image/png',size:bytes.length,...await inspectPixelPng(bytes)};}};
 await openPuzzleHandoff({mode:'jigsaw',destination:'feed',draftId:id,localDraftId:id,store,adapter,windowRef,now:100,...adapters});
 assert.deepEqual(navigation,['/feed/?compose=jigsaw']);assert.ok(rows.has(PUZZLE_HANDOFF_KEY));
 windowRef.location={href:'https://pixieed.test/feed/?compose=jigsaw',pathname:'/feed/',origin:'https://pixieed.test'};
 const handoff=await adoptSocialHandoff('jigsaw',{windowRef,now:101});
 assert.equal(handoff.publicationIntent,'public');assert.deepEqual(handoff.localPuzzle,{mode:'jigsaw',draftId:id});
 const bytes=Uint8Array.from(atob(handoff.payload.image.base64),c=>c.charCodeAt(0));
 const admitted=await admitPuzzleUpload(handoff.payload.puzzle,bytes,handoff.payload.image);
 const response=await buildPublicPuzzleResponse({requestedPostId:id,parent:{id,status:'published',publishedAt:'2026-10-21T12:00:00Z',title:'合成問題',imageClaim:handoff.payload.image},point:{postId:id,publishedAt:'2026-10-21T12:00:00Z',imagePath:`${id}/22222222-2222-4222-8222-222222222222.png`},puzzle:{postId:id,reviewState:'approved',mode:'jigsaw',schemaVersion:1,definition:admitted.definition},originalBytes:bytes},project);
 const other=preparePublicJigsaw(response,id,project),otherLayout=createJigsawLayout(other.definition);
 const image={width:16,height:16,rgba:documentRgba(doc)};
 assert.deepEqual([...reassembleJigsawPieces(image,otherLayout,sliceJigsawPieces(image,otherLayout))],[...image.rgba]);
 assert.equal(otherLayout.pieceSize,layout.pieceSize);assert.equal(otherLayout.seed,layout.seed);
 assert.equal(JSON.stringify(response).includes('draftId'),false);assert.equal(JSON.stringify(response).includes('groups'),false);
 assert.deepEqual(await adapter.get(id),before);assert.deepEqual(await adapter.get('synthetic-draw'),mediaBefore);
});
