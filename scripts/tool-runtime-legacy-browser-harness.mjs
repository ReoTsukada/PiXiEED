/** Synthetic legacy PXD compatibility checks for direct and retained-iframe runtimes. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only a localhost test server is allowed.');
const out = process.env.PIXIEED_LEGACY_OUTPUT || '/tmp/pixieed-stage3/legacy';
const selectedCases=new Set((process.env.PIXIEED_LEGACY_CASES||'').split(',').map(value=>value.trim()).filter(Boolean));
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE
  || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ headless: true });
const report = { engine:browser.version(), base, networkWrites:0, externalRequests:0, blocked:[], cases:[], failures:[], formats:{
  tested:['PXD archive v3 created by current codec with legacy schema-1 independent image roles, old shared-canvas-v1 audio link/state, unmarked role metadata, unknown manifest fields and opaque/future entries','Synthetic old Draw2 container v1/v2 using the repo decoder layout (PXD magic, version byte, big-endian manifest length, v1 assets/v2 entries) with exact original, described payload, and unreferenced-gap preservation','old modePxd/modePxdRevision/modePxdImage/modeProjectTool route namespace','legacy last:draw and last:creation localStorage pointers','PXD original/import-source archive backups'],
  excluded:['Real historical user PXD v1/v2 files: there are no archived sample bytes in the repository; synthetic containers follow the checked-in codec fixture format. Their raw raster payload is not a recognized editable image schema.','Real user PXD files beyond synthetic fixtures and external storage.']
},limitations:['Chromium synthetic fixtures only; Safari, physical devices, and hardware camera are not tested.','Fresh isolated browser storage per case; only same-origin GET/HEAD requests are permitted.'] };

async function newContext(name) {
  const row={ name, checks:[], errors:[], blocked:[] }; report.cases.push(row);
  const ctx=await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block', acceptDownloads:true });
  await ctx.route('**/*', async route=>{
    const request=route.request(), url=new URL(request.url());
    if(url.origin!==base){ const item={kind:'external',method:request.method(),url:request.url()}; row.blocked.push(item); report.blocked.push(item); report.externalRequests++; return route.abort(); }
    if(!['GET','HEAD'].includes(request.method())){ const item={kind:'write',method:request.method(),url:request.url()}; row.blocked.push(item); report.blocked.push(item); report.networkWrites++; return route.abort(); }
    return route.continue();
  });
  const page=await ctx.newPage(); page.setDefaultTimeout(20000); page.on('pageerror',e=>row.errors.push(e.message));
  return {ctx,page,row};
}
async function blank(page, search='runtime=direct') { await page.goto(`${base}/draw/?${search}`); await page.locator('[data-embed-start]').waitFor({state:'visible'}); }
async function direct(page, route, mode='draw') {
  await page.goto(`${base}${route}`);
  await page.waitForFunction(expected=>document.documentElement.dataset.toolDirect==='work' && window.__PIXIEED_CREATION_HOST__?.active
    && window.__PIXIEED_CREATION_HOST__.runtime?.state?.ready && window.__PIXIEED_CREATION_HOST__.runtime.state.mode===expected
    && document.querySelector('[data-embed-start]')?.getAttribute('aria-busy')==='false',mode);
  assert.equal(await page.locator('iframe').count(),0);
  return page.evaluateHandle(()=>window.__PIXIEED_CREATION_HOST__.runtime);
}
async function paint(page,x,y){const c=page.locator('#draw-canvas'),b=await c.boundingBox(),s=await c.evaluate(n=>({w:n.width,h:n.height}));await page.mouse.click(b.x+(x+.5)*b.width/s.w,b.y+(y+.5)*b.height/s.h);}
const check=(row,text)=>row.checks.push(text);

async function makeLegacyFixture(page, owner='draw', title='Old multi-role PXD') {
  return page.evaluate(async ({owner,title})=>{
    const codec=await import('/js/creation/pxd-codec.mjs');
    const images=await import('/js/creation/pxd-project.mjs');
    const audio=await import('/js/creation/audio-core.mjs');
    const audioPxd=await import('/js/creation/pxd-draw-audio.mjs');
    const stores=await import('/js/creation/tool-project-store.mjs');
    const image=(rgba,x,y,color)=>{const data=new Uint8Array(16*16*4);data.set(color,(y*16+x)*4);return{width:16,height:16,rgba:data};};
    const main=image(null,1,1,[239,48,50,255]), draw=image(null,3,4,[48,90,236,255]), oldAudio=image(null,8,9,[73,100,60,255]);
    let project=codec.createPxdProject({manifest:{title,lastMode:owner,legacyUnknown:{edition:2,retain:'archive'},toolProject:{schemaVersion:1,tool:owner},editorState:{draw:{tool:'pen',selectedColor:2,zoom:1.5}}},opaquePayloads:[{bytes:new Uint8Array([80,88,68,0,3,2,1])}]});
    project=await images.putPxdImage(project,main,'main'); project=await images.putPxdImage(project,draw,'draw'); project=await images.putPxdImage(project,oldAudio,'audio');
    project=codec.setPxdBytes(project,'future/opaque.bin',new Uint8Array([0,255,19,0,122]),'application/octet-stream');
    project=codec.setPxdJson(project,'future/state.json',{futureSchema:9,keep:{nested:true}});
    const song=audio.createAudioSong({songId:`legacy-${crypto.randomUUID()}`,tempo:137}); song.legacyAudioField={preserve:'old-song'};
    const link={rulesVersion:'shared-canvas-v1',imageRole:'audio',width:16,height:16,ticksPerCell:120,rowPitchMap:audio.createAudioRowPitchMap(16),colorToSlot:{'rgba-49643cff':'square'},originalHint:'legacy-independent-audio-role'};
    const projected=audioPxd.projectLegacySharedAudioImage(song,oldAudio,link);
    project=await audioPxd.writePxdAudioState(project,projected.song,{image:projected.image,link:projected.link});
    const store=stores.createToolProjectStore(owner); const saved=await store.save(project,{expectedRevisionId:null});
    const original=await store.load(saved.projectId,saved.revisionId),bytes=await codec.encodePxd(original);
    const readRole=async role=>{const value=await images.readPxdImage(original,role);return{width:value.width,height:value.height,rgba:Array.from(value.rgba)};};
    return {id:saved.projectId,revision:saved.revisionId,owner,bytes:Array.from(bytes),hash:await crypto.subtle.digest('SHA-256',bytes).then(v=>[...new Uint8Array(v)].map(x=>x.toString(16).padStart(2,'0')).join('')),
      main:await readRole('main'),draw:await readRole('draw'),audio:await readRole('audio'),paths:original.entries.map(e=>e.path).sort()};
  },{owner,title});
}
async function makeLegacyDrawPointerFixture(page,title='Legacy Draw pointer') {
  return page.evaluate(async title=>{
    const codec=await import('/js/creation/pxd-codec.mjs'),images=await import('/js/creation/pxd-project.mjs'),stores=await import('/js/creation/tool-project-store.mjs');
    const rgba=new Uint8Array(16*16*4);rgba.set([41,87,233,255],(5*16+6)*4);
    let project=codec.createPxdProject({manifest:{title,toolProject:{schemaVersion:1,tool:'draw'},editorState:{draw:{tool:'pen',zoom:1}}}});
    project=await images.putPxdImage(project,{width:16,height:16,rgba},'main');
    const store=stores.createToolProjectStore('draw'),saved=await store.save(project,{expectedRevisionId:null}),original=await store.load(saved.projectId,saved.revisionId),bytes=await codec.encodePxd(original),image=await images.readPxdImage(original,'main');
    const hash=await crypto.subtle.digest('SHA-256',bytes).then(v=>[...new Uint8Array(v)].map(x=>x.toString(16).padStart(2,'0')).join(''));
    return{id:saved.projectId,revision:saved.revisionId,hash,main:{width:image.width,height:image.height,rgba:Array.from(image.rgba)}};
  },title);
}
async function makeOldDraw2Fixture(page, version) {
  return page.evaluate(async version=>{
    const encoder=new TextEncoder(),payload=new Uint8Array([12,0,255,127,99,98]);
    const digest=await crypto.subtle.digest('SHA-256',payload),sha256=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    const descriptor={path:'objects/raw.raster',offset:0,bytes:4,sha256:await crypto.subtle.digest('SHA-256',payload.subarray(0,4)).then(v=>[...new Uint8Array(v)].map(x=>x.toString(16).padStart(2,'0')).join('')),oldDescriptorField:'preserve'};
    const manifest=version===1?{format:'pxd',schemaVersion:1,projectId:`old-container-v${version}`,assets:[descriptor],unknownManifestField:{v:version,keep:true}}:{format:'pxd',schemaVersion:2,projectId:`old-container-v${version}`,entries:[descriptor],unknownManifestField:{v:version,keep:true}};
    const json=encoder.encode(JSON.stringify(manifest)),header=new Uint8Array(9);header.set(encoder.encode('PXD\0'));header[4]=version;new DataView(header.buffer).setUint32(5,json.length,false);
    const bytes=new Uint8Array(header.length+json.length+payload.length);bytes.set(header);bytes.set(json,header.length);bytes.set(payload,header.length+json.length);
    const codec=await import('/js/creation/pxd-codec.mjs'),decoded=await codec.decodePxd(bytes),original=decoded.entries.find(e=>e.path==='legacy/original.pxd'),entry=decoded.entries.find(e=>e.path==='legacy/draw2/objects/raw.raster'),gap=decoded.entries.find(e=>e.path.startsWith('legacy/draw2/unreferenced-'));
    const redecoded=await codec.decodePxd(await codec.encodePxd(decoded));
    return{version,bytes:Array.from(bytes),original:Array.from(original?.bytes||[]),entry:Array.from(entry?.bytes||[]),gap:Array.from(gap?.bytes||[]),identity:decoded.manifest.legacy?.identity,roundTripOriginal:Array.from(redecoded.entries.find(e=>e.path==='legacy/original.pxd')?.bytes||[]),roundTripEntry:Array.from(redecoded.entries.find(e=>e.path==='legacy/draw2/objects/raw.raster')?.bytes||[]),legacyManifest:decoded.manifest.legacy?.sourceManifest};
  },version);
}
async function inspectProject(page,id,rev,owner='draw'){
  return page.evaluate(async({id,rev,owner})=>{
    const stores=await import('/js/creation/tool-project-store.mjs'),codec=await import('/js/creation/pxd-codec.mjs'),images=await import('/js/creation/pxd-project.mjs'),audio=await import('/js/creation/pxd-draw-audio.mjs');
    const project=await stores.createToolProjectStore(owner).load(id,rev); if(!project)return null;
    const roles={};for(const role of images.pxdImageRoles(project)){const i=await images.readPxdImage(project,role);roles[role]={width:i.width,height:i.height,rgba:Array.from(i.rgba)};}
    const encode=async p=>[...new Uint8Array(await codec.encodePxd(p))];
    const entries=project.entries.map(e=>({path:e.path,bytes:Array.from(e.bytes)}));
    const hash=async b=>crypto.subtle.digest('SHA-256',new Uint8Array(b)).then(v=>[...new Uint8Array(v)].map(x=>x.toString(16).padStart(2,'0')).join(''));
    const backups={};for(const path of ['legacy/original.pxd','legacy/import-source.pxd','legacy/creation-original.pxd']){const e=project.entries.find(x=>x.path===path);if(e)backups[path]={hash:await hash(e.bytes),decoded:await codec.decodePxd(e.bytes).then(p=>({projectId:p.projectId,revisionId:p.revisionId}))};}
    return{projectId:project.projectId,revisionId:project.revisionId,manifest:project.manifest,roles,paths:entries.map(e=>e.path).sort(),entriesHash:await hash((await encode(project))),backups,song:audio.readPxdAudioState(project),link:audio.readPxdAudioLink(project),entries};
  },{id,rev,owner});
}
async function hashBytes(bytes){const {createHash}=await import('node:crypto');return createHash('sha256').update(bytes).digest('hex');}
async function run(name,body){if(selectedCases.size&&!selectedCases.has(name))return;const{ctx,page,row}=await newContext(name);try{await body({page,row});assert.deepEqual(row.errors,[]);assert.deepEqual(row.blocked,[]);console.log('PASS',name,row.checks.length);}catch(error){row.failure=error.stack||String(error);report.failures.push(name);row.diagnostics=await page.evaluate(()=>({url:location.href,mode:document.body.dataset.creationMode,direct:document.documentElement.dataset.toolDirect,status:[...document.querySelectorAll('[role=status]')].map(n=>n.textContent).filter(Boolean).slice(-8)})).catch(()=>null);await page.screenshot({path:`${out}/${name}-failure.png`,fullPage:true}).catch(()=>{});console.error('FAIL',name,error.message);}finally{await ctx.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}}

await run('direct-explicit-legacy-multirole-normalization-backup',async({page,row})=>{
  await blank(page);const source=await makeLegacyFixture(page,'draw');
  const route=`/draw/?runtime=direct&workspace=1&pxd=${encodeURIComponent(source.id)}&pxdRevision=${encodeURIComponent(source.revision)}&pxdImage=draw&keep=old&keep=route#legacy-role`;
  const runtime=await direct(page,route,'draw');
  const opened=await runtime.evaluate(rt=>({role:rt.draw.getRestoreImageRole(),image:rt.draw.getImage()}));
  assert.equal(opened.role,'draw');assert.deepEqual(Array.from(opened.image.rgba),source.draw.rgba,'explicit legacy role loads its exact RGBA image');
  const sourceBefore=await inspectProject(page,source.id,source.revision);assert.equal(sourceBefore.revisionId,source.revision);
  assert.deepEqual(sourceBefore.roles.draw,source.draw);assert.deepEqual(sourceBefore.roles.audio,source.audio);assert.deepEqual(sourceBefore.roles.main,source.main);
  await paint(page,6,7);await runtime.evaluate(rt=>rt.draw.workspace.save());
  const pointer=await page.evaluate(()=>({id:new URL(location.href).searchParams.get('pxd'),rev:new URL(location.href).searchParams.get('pxdRevision')}));
  assert.equal(pointer.id,source.id);assert.notEqual(pointer.rev,source.revision);
  const edited=await runtime.evaluate(rt=>rt.draw.getImage());
  const saved=await inspectProject(page,pointer.id,pointer.rev);
  assert.deepEqual(saved.roles.main.rgba,Array.from(edited.rgba),'the normalized shared main canvas contains the edited selected role');
  assert.deepEqual(saved.roles.draw,source.draw,'the independent original Draw role remains intact');
  assert.deepEqual(saved.roles.audio,source.audio,'the unrelated independent legacy Audio role remains intact');
  assert.deepEqual(saved.manifest.legacyUnknown,{edition:2,retain:'archive'});
  assert.ok(saved.paths.includes('future/opaque.bin')&&saved.paths.includes('future/state.json'),'unknown future entries remain in current PXD');
  assert.deepEqual(saved.backups['legacy/creation-original.pxd']?.decoded,{projectId:source.id,revisionId:source.revision});
  assert.equal(saved.backups['legacy/creation-original.pxd']?.hash,source.hash,'nested pre-normalization PXD bytes are exact');
  const unchanged=await inspectProject(page,source.id,source.revision);assert.equal(unchanged.entriesHash,source.hash,'original archived revision remains unchanged');
  const url=await page.evaluate(()=>{const u=new URL(location.href);return{keep:u.searchParams.getAll('keep'),hash:u.hash,image:u.searchParams.get('pxdImage')}});
  assert.deepEqual(url,{keep:['old','route'],hash:'#legacy-role',image:'draw'});
  check(row,'explicit pxdImage role retains all independent schema-1 role images and unknown fields');
  check(row,'first save preserves exact original legacy archive as creation-original.pxd and leaves source revision byte-exact');
},{});

await run('direct-multirole-choice',async({page,row})=>{
  await blank(page);const choiceSource=await makeLegacyFixture(page,'draw','Choose image role');
  await page.goto(`${base}/draw/?runtime=direct&workspace=1&pxd=${choiceSource.id}&pxdRevision=${choiceSource.revision}`);
  await page.waitForFunction(()=>document.querySelector('#creation-project-role')?.open===true);
  const roleVisibility=await page.locator('#creation-project-role').evaluate(node=>{const b=node.querySelector('[data-image-role="audio"]'),r=b.getBoundingClientRect(),s=getComputedStyle(b);return{open:node.open,hidden:node.hidden,inert:node.inert,buttonHidden:b.hidden,display:s.display,visibility:s.visibility,opacity:s.opacity,rect:{x:r.x,y:r.y,width:r.width,height:r.height},toolDirect:document.documentElement.dataset.toolDirect,loading:document.querySelector('[data-embed-start]')?.getAttribute('aria-busy'),connected:b.isConnected};});
  row.roleVisibility=roleVisibility;assert.equal(await page.locator('#creation-project-role [data-image-role]').count(),3);
  assert.ok(roleVisibility.rect.width>0&&roleVisibility.rect.height>0&&roleVisibility.visibility==='visible'&&roleVisibility.display!=='none',`role selection must be visible to the user: ${JSON.stringify(roleVisibility)}`);
  await page.locator('#creation-project-role [data-image-role="audio"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.toolDirect==='work'&&window.__PIXIEED_CREATION_HOST__?.runtime?.state?.ready&&document.querySelector('#creation-project-role')===null);
  const selected=await page.evaluate(()=>({role:window.__PIXIEED_CREATION_HOST__.runtime.draw.getRestoreImageRole(),image:Array.from(window.__PIXIEED_CREATION_HOST__.runtime.draw.getImage().rgba)}));
  assert.equal(selected.role,'audio');assert.deepEqual(selected.image,choiceSource.audio.rgba);
  assert.equal((await inspectProject(page,choiceSource.id,choiceSource.revision)).entriesHash,choiceSource.hash,'role choice does not mutate source');
  check(row,'multi-role legacy project requires and honors explicit image selection without modifying its source');
},{});

await run('direct-multirole-cancel-and-dispose',async({page,row})=>{
  await blank(page);const source=await makeLegacyFixture(page,'draw','Cancel image role');
  const route=`/draw/?runtime=direct&workspace=1&pxd=${source.id}&pxdRevision=${source.revision}`;
  await page.goto(`${base}${route}`);await page.waitForFunction(()=>document.querySelector('#creation-project-role')?.open===true);
  const first=await page.locator('#creation-project-role').evaluate(node=>{const button=node.querySelector('[data-image-role="draw"]'),rect=button.getBoundingClientRect(),style=getComputedStyle(button);return{open:node.open,visible:rect.width>0&&rect.height>0&&style.visibility==='visible'&&style.display!=='none'};});
  row.cancelChoiceVisibility=first;assert.ok(first.visible,`role choice must be visible before cancel: ${JSON.stringify(first)}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('#creation-project-role')===null);
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(node=>node.textContent.includes('取り消しました')));
  assert.equal((await inspectProject(page,source.id,source.revision)).entriesHash,source.hash,'cancel retains original bytes');
  check(row,'native dialog Escape cancels role choice without changing the source PXD');

  await page.goto(`${base}${route}`);await page.waitForFunction(()=>document.querySelector('#creation-project-role')?.open===true);
  const disposeResult=await page.evaluate(async()=>{const host=window.__PIXIEED_CREATION_HOST__;await host.dispose();return{host:!!window.__PIXIEED_CREATION_HOST__,dialog:!!document.querySelector('#creation-project-role'),canvas:!!document.querySelector('#draw-canvas')};});
  assert.deepEqual(disposeResult,{host:false,dialog:false,canvas:false},'disposal during unresolved role choice removes transient editor UI');
  assert.equal((await inspectProject(page,source.id,source.revision)).entriesHash,source.hash,'dispose retains original bytes');
  check(row,'disposing a host while a multi-role chooser is pending settles the choice and releases editor DOM');
},{});

await run('direct-legacy-mode-pointer-namespace',async({page,row})=>{
  await blank(page);const modeSource=await makeLegacyFixture(page,'audio','Old mode namespace');
  await page.goto(`${base}/audio/?runtime=direct&workspace=1&mode=audio&modeProjectTool=audio&modePxd=${modeSource.id}&modePxdRevision=${modeSource.revision}&modePxdImage=audio&keep=m1&keep=m2#old-mode-pointer`);
  await page.waitForFunction(()=>document.documentElement.dataset.toolDirect==='work'&&window.__PIXIEED_CREATION_HOST__?.active&&window.__PIXIEED_CREATION_HOST__.runtime?.state?.ready&&window.__PIXIEED_CREATION_HOST__.runtime.state.mode==='audio'&&document.querySelector('[data-embed-start]')?.getAttribute('aria-busy')==='false');
  const canonical=await page.evaluate(()=>{const u=new URL(location.href);return{mode:u.searchParams.get('mode'),id:u.searchParams.get('pxd'),revision:u.searchParams.get('pxdRevision'),role:u.searchParams.get('pxdImage'),legacy:['modePxd','modePxdRevision','modePxdImage','modeProjectTool'].some(k=>u.searchParams.has(k)),keep:u.searchParams.getAll('keep'),hash:u.hash};});
  assert.equal(canonical.mode,'audio');assert.notEqual(canonical.id,modeSource.id,'foreign legacy Audio PXD is imported as a Draw-owned shared project');assert.ok(canonical.revision);assert.equal(canonical.role,null,'legacy image-role selector is consumed once it becomes the imported shared main image');assert.equal(canonical.legacy,false);assert.deepEqual(canonical.keep,['m1','m2']);assert.equal(canonical.hash,'#old-mode-pointer');
  const imported=await inspectProject(page,canonical.id,canonical.revision,'draw');
  assert.equal(imported.manifest.toolProject.tool,'draw');assert.deepEqual(imported.roles.main,modeSource.audio);
  assert.equal(imported.backups['legacy/import-source.pxd']?.hash,modeSource.hash,'mode pointer import keeps exact original PXD backup');
  assert.equal((await inspectProject(page,modeSource.id,modeSource.revision,'audio')).entriesHash,modeSource.hash,'legacy Audio pointer source revision remains unchanged');
  check(row,'legacy modePxd pointer imports into a Draw-owned shared project and keeps its exact source archive');
  check(row,'canonical mode route preserves duplicate opaque query values and hash while consuming legacy pointer keys');
},{});

await run('legacy-storage-draw-pointer-direct-resume-fork',async({page,row})=>{
  await blank(page);const legacy=await makeLegacyDrawPointerFixture(page,'Legacy remembered pointer');
  const sentinels={draw:{projectId:legacy.id,revisionId:legacy.revision},creation:{projectId:legacy.id,revisionId:legacy.revision},audio:{projectId:'legacy-audio-sentinel',revisionId:'legacy-audio-revision'}};
  await page.evaluate(values=>{localStorage.removeItem('pixieed:pxd:last:direct-workspace:v1');localStorage.setItem('pixieed:pxd:last:draw',JSON.stringify(values.draw));localStorage.setItem('pixieed:pxd:last:creation',JSON.stringify(values.creation));localStorage.setItem('pixieed:pxd:last:audio',JSON.stringify(values.audio));},sentinels);
  await page.goto(`${base}/draw/?runtime=direct&workspace=1`);
  await page.waitForFunction(()=>document.documentElement.dataset.toolDirect==='work'&&window.__PIXIEED_CREATION_HOST__?.active&&window.__PIXIEED_CREATION_HOST__.runtime?.state?.ready&&document.querySelector('[data-embed-start]')?.getAttribute('aria-busy')==='false');
  const runtime=await page.evaluateHandle(()=>window.__PIXIEED_CREATION_HOST__.runtime);
  const opened=await runtime.evaluate(rt=>({projectId:rt.draw.workspace.currentProject?.projectId,image:Array.from(rt.draw.getImage().rgba)}));
  assert.ok(opened.projectId&&opened.projectId!==legacy.id,'valid legacy Draw pointer resumes as an independent direct-owned fork');
  assert.deepEqual(opened.image,legacy.main.rgba,'legacy Draw pointer restores the saved artwork');
  const afterOpen=await page.evaluate(()=>Object.fromEntries(['draw','creation','audio'].map(k=>[k,localStorage.getItem(`pixieed:pxd:last:${k}`)])));
  assert.deepEqual(afterOpen,Object.fromEntries(Object.entries(sentinels).map(([k,v])=>[k,JSON.stringify(v)])));
  const forkBeforeSave=await runtime.evaluate(rt=>({projectId:rt.draw.workspace.currentProject.projectId,revisionId:rt.draw.workspace.currentProject.revisionId}));
  await paint(page,1,1);await runtime.evaluate(rt=>rt.draw.workspace.save());
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:pxd:last:direct-workspace:v1')||'null'));
  assert.equal(first?.projectId,forkBeforeSave.projectId,'first save is retained under the fork identity');assert.ok(first?.revisionId);
  const old=await inspectProject(page,legacy.id,legacy.revision);assert.equal(old.entriesHash,legacy.hash,'migration leaves original legacy revision byte-exact');
  const legacyAfter=await page.evaluate(()=>Object.fromEntries(['draw','creation','audio'].map(k=>[k,localStorage.getItem(`pixieed:pxd:last:${k}`)])));
  assert.deepEqual(legacyAfter,Object.fromEntries(Object.entries(sentinels).map(([k,v])=>[k,JSON.stringify(v)])),'direct operations do not rewrite legacy pointer slots');
  check(row,'valid legacy last:creation/last:draw pointer opens as a separate direct fork with the saved pixels');
  check(row,'saving the migrated copy preserves the original revision and all existing legacy pointer records');
},{});

await run('legacy-foreign-pointer-fails-closed-and-recovers',async({page,row})=>{
  await blank(page);const foreign=await makeLegacyFixture(page,'audio','Legacy foreign owner');
  const oldPointer={projectId:foreign.id,revisionId:foreign.revision};
  await page.evaluate(pointer=>{localStorage.removeItem('pixieed:pxd:last:direct-workspace:v1');localStorage.setItem('pixieed:pxd:last:creation',JSON.stringify(pointer));localStorage.removeItem('pixieed:pxd:last:draw');},oldPointer);
  await page.goto(`${base}/draw/?runtime=direct&workspace=1&keep=old&keep=route#foreign-legacy`);
  await page.waitForFunction(()=>document.documentElement.dataset.toolDirect==='work'&&window.__PIXIEED_CREATION_HOST__?.active&&window.__PIXIEED_CREATION_HOST__.runtime?.state?.ready&&document.querySelector('[data-embed-start]')?.getAttribute('aria-busy')==='false');
  const errorState=await page.evaluate(()=>({error:window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.restoreError,projectId:window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.currentProject?.projectId,image:Array.from(window.__PIXIEED_CREATION_HOST__.runtime.draw.getImage().rgba),main:document.querySelector('#main')?.inert,actions:['project-save','project-rename','project-duplicate','pxd-export'].map(id=>({id,disabled:document.getElementById(id)?.disabled}))}));
  assert.match(errorState.error,/形式の確認/);assert.notEqual(errorState.projectId,foreign.id);assert.ok(errorState.image.every(v=>v===0),'failed implicit restore leaves the editor blank');assert.equal(errorState.main,true);
  assert.ok(errorState.actions.every(item=>item.disabled!==false),`failed restore must disable unsafe actions: ${JSON.stringify(errorState.actions)}`);
  const originalRoute=await page.evaluate(()=>({search:location.search,hash:location.hash,creation:localStorage.getItem('pixieed:pxd:last:creation'),direct:localStorage.getItem('pixieed:pxd:last:direct-workspace:v1')}));
  assert.deepEqual(originalRoute,{search:'?runtime=direct&workspace=1&keep=old&keep=route',hash:'#foreign-legacy',creation:JSON.stringify(oldPointer),direct:null});
  await page.getByRole('button',{name:'作品を選ぶ'}).click();await page.locator('#pxd-panel').waitFor({state:'visible'});
  assert.equal(await page.locator('#main').evaluate(node=>node.inert),true,'opening recovery keeps the failed placeholder inert');
  await page.locator('#project-close').click();await page.waitForFunction(()=>!document.querySelector('#pxd-panel')?.open);
  assert.equal(await page.locator('#main').evaluate(node=>node.inert),true,'closing recovery does not unlock the failed placeholder');
  await page.getByRole('button',{name:'作品を選ぶ'}).click();await page.locator('#pxd-panel').waitFor({state:'visible'});await page.locator('#project-new').click();
  await page.waitForFunction(()=>window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.restoreError==='');
  const routeAfterNew=await page.evaluate(()=>({search:location.search,hash:location.hash}));
  assert.deepEqual(routeAfterNew,{search:'?runtime=direct&workspace=1&keep=old&keep=route&mode=draw',hash:'#foreign-legacy'});
  assert.equal(await page.locator('#main').evaluate(node=>node.inert),false);
  await paint(page,1,1);await page.evaluate(()=>window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.save());
  const recoveryPointer=await page.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:pxd:last:direct-workspace:v1')||'null'));
  assert.ok(recoveryPointer?.projectId&&recoveryPointer.projectId!==foreign.id,'explicit New selection creates a separate project');
  assert.equal((await inspectProject(page,foreign.id,foreign.revision,'audio')).entriesHash,foreign.hash,'recovery leaves the foreign source unchanged');
  check(row,'foreign implicit pointer shows a guarded recovery state while retaining URL, source, and old pointer');
  check(row,'explicit New clears the failed selection, preserves duplicate query/hash, and permits a new save');
},{});

await run('legacy-foreign-pointer-explicit-url-import',async({page,row})=>{
  await blank(page);const foreign=await makeLegacyFixture(page,'audio','Legacy explicit import');
  const route=`/draw/?runtime=direct&workspace=1&pxd=${encodeURIComponent(foreign.id)}&pxdRevision=${encodeURIComponent(foreign.revision)}#explicit-import`;
  const runtime=await direct(page,route,'draw');
  const image=await runtime.evaluate(rt=>Array.from(rt.draw.getImage().rgba));assert.deepEqual(image,foreign.audio.rgba,'explicit PXD URL permits an independent import');
  const pointer=await page.evaluate(()=>{const u=new URL(location.href);return{projectId:u.searchParams.get('pxd'),revisionId:u.searchParams.get('pxdRevision')}});
  assert.notEqual(pointer.projectId,foreign.id);const copy=await inspectProject(page,pointer.projectId,pointer.revisionId);
  assert.equal(copy.backups['legacy/import-source.pxd']?.hash,foreign.hash);assert.deepEqual(copy.roles.main.rgba,foreign.audio.rgba);
  assert.equal((await inspectProject(page,foreign.id,foreign.revision,'audio')).entriesHash,foreign.hash);
  check(row,'explicit foreign PXD URL import remains available with an exact source backup and unchanged source revision');
},{});

await run('legacy-draw2-v1-v2-raw-container-fails-closed',async({page,row})=>{
  await blank(page);const runtime=await direct(page,'/draw/?runtime=direct&workspace=1','draw');
  await paint(page,2,2);await runtime.evaluate(rt=>rt.draw.workspace.save());
  const before=await runtime.evaluate(rt=>({image:Array.from(rt.draw.getImage().rgba),projectId:rt.draw.workspace.currentProject.projectId,revisionId:rt.draw.workspace.currentProject.revisionId}));
  const pointerBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:pxd:last:direct-workspace:v1')||'null'));
  for(const version of [1,2]){
    const fixture=await makeOldDraw2Fixture(page,version),bytes=Buffer.from(fixture.bytes);
    assert.deepEqual(fixture.original,fixture.bytes,`v${version} decode retains exact original container bytes`);
    assert.deepEqual(fixture.entry,[12,0,255,127],`v${version} extracts the described legacy payload bytes`);
    assert.deepEqual(fixture.gap,[99,98],`v${version} preserves unreferenced container bytes`);
    assert.deepEqual(fixture.roundTripOriginal,fixture.bytes,`v${version} encode/decode keeps exact original container bytes`);
    assert.deepEqual(fixture.roundTripEntry,fixture.entry,`v${version} encode/decode keeps extracted payload`);
    await writeFile(`${out}/synthetic-draw2-v${version}.pxd`,bytes);
    await page.locator('#pxd-file-input').setInputFiles({name:`synthetic-draw2-v${version}.pxd`,mimeType:'application/octet-stream',buffer:bytes});
    await page.waitForFunction(()=>document.querySelector('#pxd-file-status')?.textContent.includes('このPXDには描画できる画像部品がありません。'));
    const after=await runtime.evaluate(rt=>({image:Array.from(rt.draw.getImage().rgba),projectId:rt.draw.workspace.currentProject.projectId,revisionId:rt.draw.workspace.currentProject.revisionId}));
    assert.deepEqual(after,before,`unsupported inner art v${version} fails closed without replacing the current work`);
    const pointerAfter=await page.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:pxd:last:direct-workspace:v1')||'null'));
    assert.equal(pointerAfter.projectId,pointerBefore.projectId,`unsupported inner art v${version} does not replace the current project`);
    const saved=await inspectProject(page,pointerAfter.projectId,pointerAfter.revisionId);
    assert.deepEqual(saved.roles.main.rgba,before.image,`unsupported inner art v${version} leaves the last saved artwork intact`);
    check(row,`Draw2 container v${version} exposes a clear unsupported-image error while preserving current editor pixels and save pointer`);
    check(row,`Draw2 container v${version} original and extracted payload bytes remain exact through codec round-trip`);
  }
},{ });

await run('retained-iframe-explicit-legacy-import-and-output',async({page,row})=>{
  await blank(page,'runtime=direct');const source=await makeLegacyFixture(page,'audio','Legacy audio import source');
  await page.goto(`${base}/draw/?runtime=iframe&workspace=1&pxd=${source.id}&pxdRevision=${source.revision}&keep=iframe&keep=retained#legacy-iframe`);
  await page.waitForFunction(()=>document.body.classList.contains('tool-shell--workspace-open')&&document.querySelector('.tool-embed__frame'));
  const frame=page.frames().find(f=>new URL(f.url()).pathname==='/draw/editor.html');assert.ok(frame,'retained iframe candidate uses the real editor document');
  await frame.waitForFunction(()=>document.documentElement.dataset.creationModesReady==='true'&&document.body.dataset.creationMode==='draw'&&!document.querySelector('#main')?.inert);
  await frame.locator('#draw-canvas').waitFor({state:'visible'});
  const iframeDebug=await frame.evaluate(()=>({url:location.href,role:window.__PIXIEED_TOOL_EMBED__?.role,ready:document.documentElement.dataset.creationModesReady,mode:document.body.dataset.creationMode,pointer:Object.fromEntries(['draw','audio','creation'].map(k=>[k,localStorage.getItem(`pixieed:pxd:last:${k}`)])),status:[...document.querySelectorAll('[role="status"]')].map(n=>n.textContent.trim()).filter(Boolean).slice(-8)}));
  row.iframeDebug=iframeDebug;
  const pointer=await frame.evaluate(()=>JSON.parse(localStorage.getItem('pixieed:pxd:last:creation')||localStorage.getItem('pixieed:pxd:last:draw')||'null'));
  assert.ok(pointer?.projectId&&pointer.projectId!==source.id,`foreign legacy Audio project should import to a distinct Draw copy: ${JSON.stringify(iframeDebug)}`);
  const copy=await inspectProject(page,pointer.projectId,pointer.revisionId);
  assert.equal(copy.manifest.toolProject.tool,'draw');
  assert.deepEqual(copy.backups['legacy/import-source.pxd']?.decoded,{projectId:source.id,revisionId:source.revision});
  assert.equal(copy.backups['legacy/import-source.pxd']?.hash,source.hash,'source archive bytes survive import exactly');
  assert.deepEqual(copy.roles.main,source.audio,'legacy audio image becomes selected shared canvas');
  assert.deepEqual(copy.roles.audio,source.audio,'old independent audio role remains in the imported archive');
  const before=await frame.evaluate(()=>window.__PIXIEED_TOOL_EMBED__?.role);assert.equal(before,'draw');
  await frame.locator('#draw-canvas').click({force:true,position:{x:60,y:72}});
  await frame.locator('#creation-file-open').click({force:true});
  await frame.locator('#project-tab-current').click({force:true});
  const more=page.frameLocator('.tool-embed__frame').locator('.project-more');
  if(!await more.evaluate(n=>n.open))await more.locator(':scope > summary').click({force:true});
  const pxdExport=page.waitForEvent('download');await frame.locator('#pxd-export').click({force:true});const file=await pxdExport;
  const savedPath=`${out}/legacy-compatible-full-backup.pxd`;await file.saveAs(savedPath);
  const backupBytes=await readFile(savedPath);const backupCheck=await frame.evaluate(async bytes=>{const codec=await import('/js/creation/pxd-codec.mjs');const project=await codec.decodePxd(new Uint8Array(bytes));return{format:project.format,hasAudio:project.entries.some(e=>e.path==='audio/state.json'),hasSource:project.entries.some(e=>e.path==='legacy/import-source.pxd'),rolePaths:project.entries.filter(e=>/^images\/.+\/meta\.json$/.test(e.path)).map(e=>e.path).sort()};},[...backupBytes]);
  assert.equal(backupCheck.format,'PXD');assert.equal(backupCheck.hasAudio,true);assert.equal(backupCheck.hasSource,true);assert.ok(backupCheck.rolePaths.includes('images/main/meta.json')&&backupCheck.rolePaths.includes('images/audio/meta.json'));
  const exportedOriginal=page.waitForEvent('download');await frame.locator('#pxd-export-original').click({force:true});const originalFile=await exportedOriginal;const originalPath=`${out}/legacy-compatible-source-backup.pxd`;await originalFile.saveAs(originalPath);
  assert.equal(await hashBytes(await readFile(originalPath)),source.hash,'original download is exact legacy source archive');
  assert.equal((await inspectProject(page,source.id,source.revision,'audio')).entriesHash,source.hash,'source Audio project revision is unchanged by iframe import and export');
  check(row,'retained iframe imports a legacy Audio PXD as a separate Draw project, keeping original archive bytes and independent audio image');
  check(row,'PXD output reopens with legacy audio and role data; original-backup output matches source bytes exactly');
},{});

try{await browser.close();}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify({cases:report.cases.length,failures:report.failures,blocked:report.blocked.length,out}));
if(report.failures.length||report.blocked.length)process.exitCode=1;
