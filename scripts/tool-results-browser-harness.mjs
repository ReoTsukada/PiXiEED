#!/usr/bin/env node
/** Local-only result UI and completion checks. All advertising is stubbed. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_UI_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
const config = await readFile(new URL('../data/site-config.js', import.meta.url), 'utf8');
const tools = [['camera','/pixel-camera.html','camera-result'], ['draw','/draw/','draw-result'], ['audio','/audio/','audio-result'], ['jigsaw','/jigsaw/','jigsaw-result'], ['spot','/play/spot-difference/','spot-result'], ['find','/play/hidden-object/','find-result']];
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const mock = `window.__resultAdRequests=0; const queue=window.adsbygoogle||[]; const push=()=>{ window.__resultAdRequests++; const unit=document.querySelector('ins.px-display-ad__unit'); if(!unit) throw Error('No unit'); unit.dataset.adStatus='filled'; const frame=document.createElement('iframe'); frame.title='広告配置テスト'; frame.style.cssText='display:block;width:100%;height:100%;border:0'; frame.srcdoc='<html lang="ja"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#e6eaed;color:#56616c;font:14px sans-serif">テスト表示・実広告ではありません</body></html>';unit.append(frame); }; window.adsbygoogle={push}; queue.forEach(push);`;
let checks = 0;
async function contextFor(viewport, configured = false) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.addInitScript((engine) => {
    // Avoid real permissions, microphones, cameras, accounts and ad traffic.
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
      if (engine === 'webkit') throw new DOMException('Test camera unavailable', 'NotAllowedError');
      if (!HTMLCanvasElement.prototype.captureStream) throw new DOMException('Test camera unavailable', 'NotAllowedError');
      const c = document.createElement('canvas'); c.width=320;c.height=240;
      const ctx=c.getContext('2d'); const draw=()=>{ctx.fillStyle='#79aec4';ctx.fillRect(0,0,320,240);ctx.fillStyle='#376768';ctx.fillRect(0,180,320,60);ctx.fillStyle='#ffe6a3';ctx.fillRect(200,40,40,40);ctx.fillStyle='#ed7356';ctx.fillRect(60,110,85,80);ctx.fillStyle='#34424c';ctx.fillRect(50,100,105,15);};draw();setInterval(draw,80);return c.captureStream(15);
    };
  }, engine);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType:'application/javascript',body:mock });
    if (url.origin !== origin) return route.abort();
    // WebKit cannot supply the canvas camera used by Chromium. Its camera
    // matrix covers the shared result layout only, without permission retries.
    // Real capture, GIF and audio handoff handlers are checked in Chromium.
    if (engine === 'webkit' && url.pathname === '/js/pixel-lens/app.mjs') return route.fulfill({ contentType:'application/javascript',body:`import {createToolResultView} from '/js/tool-result-view.mjs?rev=20260929-display-units-1';const main=document.querySelector('#pixelStudio');main.dataset.mode='idle';createToolResultView({key:'camera-result',main,returnLabel:'撮り直す'});` });
    if (url.pathname === '/data/site-config.js') return route.fulfill({ contentType:'application/javascript',body:config+`\nfor(const key of Object.keys(displayAdConfig.slots)) displayAdConfig.slots[key]=${configured ? '"1234567890"' : '""'};` });
    return route.continue();
  });
  return context;
}
async function syntheticResult(page, key) {
  if (key === 'camera-result') await page.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.mode !== 'loading');
  await page.evaluate(async (key) => {
    const {createToolResultView}=await import('/js/tool-result-view.mjs?rev=20260929-display-units-1');
    const main=document.querySelector('main');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=24;const c=canvas.getContext('2d');
    c.fillStyle='#91c6d6';c.fillRect(0,0,24,24);c.fillStyle='#ffde95';c.fillRect(17,3,4,4);c.fillStyle='#507968';c.fillRect(0,16,24,8);c.fillStyle='#374a58';c.fillRect(4,9,13,2);c.fillStyle='#df7053';c.fillRect(5,11,11,8);c.fillStyle='#ffe7b2';c.fillRect(7,12,3,3);c.fillStyle='#394651';c.fillRect(12,14,2,5);
    window.__sourceCanvas=canvas;window.__resultView=createToolResultView({key,main});
    window.__resultView.show({title:key.includes('camera')?'撮影できました':key.includes('draw')||key.includes('audio')?'PNGを保存しました':'完成しました',preview:canvas});
  }, key);
  await frames(page);
}
async function verifyResult(page, configured) {
  assert.equal(await page.locator('.px-tool-result').isVisible(), true);
  const picture = page.locator('.px-tool-result__preview:not([hidden])'); assert.equal(await picture.isVisible(),true);
  const source = await page.evaluate(()=>window.__sourceCanvas?.toDataURL());
  const before = await page.locator('.px-tool-result__preview').first().evaluate((c)=>c.toDataURL());
  if(source) { await page.evaluate(()=>window.__sourceCanvas.getContext('2d').clearRect(0,0,24,24));assert.equal(await page.locator('.px-tool-result__preview').first().evaluate((c)=>c.toDataURL()),before); }
  const ad=page.locator('[data-display-ad]');
  if(configured) {
    await ad.evaluate((el)=>el.scrollIntoView({block:'center',behavior:'instant'}));await frames(page);
    await page.waitForFunction(()=>document.querySelector('[data-display-ad]')?.dataset.adState==='filled');
    const layout=await ad.evaluate((el)=>{
      const a=el.getBoundingClientRect(),u=el.querySelector('ins').getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
      const overlaps=[...document.querySelectorAll('a,button,input,summary')].filter((n)=>!el.contains(n)).filter((n)=>{const r=n.getBoundingClientRect();return r.width&&r.height&&r.left<a.right&&r.right>a.left&&r.top<a.bottom&&r.bottom>a.top;}).map((n)=>({id:n.id,text:n.textContent,class:n.className,rect:n.getBoundingClientRect().toJSON()}));
      return {overlaps,overflow:document.documentElement.scrollWidth>innerWidth+1,center:Math.abs((a.left+a.right)/2-document.documentElement.clientWidth/2),match:Math.abs(a.left-p.left)+Math.abs(a.right-p.right),fits:u.left>=a.left-1&&u.right<=a.right+1,gap:parseFloat(getComputedStyle(el).marginTop)};
    });
    assert.deepEqual(layout.overlaps,[],page.url());assert.equal(layout.overflow,false);assert.ok(layout.center<=1&&layout.match<=2,JSON.stringify({url:page.url(),layout}));assert.equal(layout.fits,true);assert.ok(layout.gap>=150);
    assert.equal(await page.evaluate(()=>__resultAdRequests),1);
  } else {assert.equal(await ad.isVisible(),false);assert.equal(await page.locator('ins.px-display-ad__unit').count(),0);assert.equal(await page.evaluate(()=>__resultAdRequests),0);}
  checks++;
}
async function seedPuzzle(page, mode) {
  return page.evaluate(async(mode)=>{
    const id=crypto.randomUUID();
    const {createIndexedDbDraftAdapter,createLocalDraftStore}=await import('/js/creation/local-drafts.mjs');const {createDrawDocument}=await import('/js/creation/draw-core.mjs');
    const {confirmDifferenceCandidates}=await import('/js/creation/spot-difference-core.mjs');const {createHiddenObjectDraft,confirmHiddenObjectTargets}=await import('/js/creation/hidden-object-core.mjs');
    const store=createLocalDraftStore(createIndexedDbDraftAdapter());const original=createDrawDocument(16);original.pixels.fill(0);for(let y=5;y<10;y++)for(let x=5;x<10;x++)original.pixels[y*16+x]=1;
    const before=await store.save({draftId:'source-fixture',kind:'pixel_art',document:original});const changed=structuredClone(original);changed.pixels[7*16+7]=2;const after=await store.save({draftId:'source-fixture',kind:'pixel_art',document:changed});
    const ref=(r)=>({draftId:'source-fixture',assetId:r.asset.assetId,revisionId:r.revisionId,contentHash:r.documentHash,hashScheme:r.hashScheme});const pixels=Array.from({length:25},(_,i)=>(5+Math.floor(i/5))*16+5+i%5);
    const document=mode==='spot_difference'?confirmDifferenceCandidates({schemaVersion:1,gameId:id,width:16,height:16,before:ref(before),after:ref(after),candidates:[{id:'change',pixels:[7*16+7]}],confirmed:false,publication:'draft',published:false}):confirmHiddenObjectTargets(createHiddenObjectDraft({gameId:id,source:ref(before),width:16,height:16,targets:[{id:'star',name:'星',pixels}],confirmed:false}));
    await store.save({draftId:id,kind:mode,document,source:{type:'local_draft_copy',assetId:before.asset.assetId,revisionId:before.revisionId}});return id;
  },mode);
}
try {
  for(const viewport of (process.env.PIXIEED_RESULT_FLOWS_ONLY ? [] : [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}])) {
    for(const configured of [false,true]) {
      const context=await contextFor(viewport,configured);const page=await context.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
      for(const [name,path,key] of tools) {
        await page.goto(base+path,{waitUntil:'domcontentloaded'});await frames(page);
        await page.waitForFunction(()=>typeof __resultAdRequests==='number');
        assert.equal(await page.locator('[data-display-ad],ins.px-display-ad__unit').count(),0,'working screen has no manual slot');
        await syntheticResult(page,key);await verifyResult(page,configured);
        if(configured&&[390,1280].includes(viewport.width)) {
          await page.locator('[data-display-ad]').screenshot({path:`/tmp/pixieed-result-unit-${engine}-${viewport.width}-${name}.png`});await frames(page);
          await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await frames(page);
          await page.screenshot({path:`/tmp/pixieed-tool-result-${engine}-${viewport.width}-${name}.png`,fullPage:true});
        }
        await page.locator('.app-tabs button').click();assert.equal(await page.locator('.px-tool-result').isVisible(),false);
        assert.equal(await page.locator('[data-tool-result-suspended]').count(),0);assert.equal(await page.locator('[data-tool-result-return]').count(),0);
        await syntheticResult(page,key);await verifyResult(page,configured);await page.keyboard.press('Escape');assert.equal(await page.locator('.px-tool-result').isVisible(),false);checks++;
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log(`${engine}: result layouts ${viewport.width}px PASS`);
  }
  const context=await contextFor({width:390,height:844},true);const page=await context.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  // Real export handlers, not controller injection.
  await page.goto(base+'/draw/');await page.locator('#draw-canvas').click({position:{x:8,y:8}});await page.waitForFunction(()=>!document.querySelector('#draw-undo').disabled);
  const drawing=await page.locator('#draw-canvas').evaluate((c)=>c.toDataURL());
  await page.locator('.app-tabs button').click();await frames(page);assert.equal(await page.locator('[data-display-ad]').count(),0,'draft saving is not an ad trigger');checks++;
  let download=page.waitForEvent('download');await page.locator('#draw-export').click();await download;await page.waitForFunction(()=>Boolean(document.body.dataset.toolResultOpen));await verifyResult(page,true);
  await page.locator('.px-tool-result__return').click();assert.equal(await page.locator('#draw-canvas').evaluate((c)=>c.toDataURL()),drawing);checks++;
  // A cancelled phone share is not a successful export or a results trigger.
  await page.evaluate(()=>{
    const original=window.matchMedia.bind(window);window.matchMedia=(q)=>q==='(pointer: coarse)'?{matches:true}:original(q);
    navigator.canShare=()=>true;navigator.share=async()=>{window.__shareCancelled=true;throw new DOMException('Cancelled','AbortError');};
  });
  await page.locator('#draw-export').click();await page.waitForFunction(()=>window.__shareCancelled===true);await frames(page);assert.equal(await page.locator('.px-tool-result').isVisible(),false);checks++;
  await page.evaluate(()=>{delete navigator.canShare;delete navigator.share;});
  await page.goto(base+'/audio/');await page.waitForFunction(()=>document.querySelectorAll('#audio-tracks button').length===4);await page.locator('#audio-pixel-canvas').click({position:{x:50,y:50}});
  await page.locator('#audio-play-toggle').click();await page.waitForFunction(()=>document.querySelector('#audio-play-toggle').getAttribute('aria-pressed')==='true');
  download=page.waitForEvent('download');await page.locator('#audio-export-image').click();await download;await page.waitForFunction(()=>Boolean(document.body.dataset.toolResultOpen));await verifyResult(page,true);await page.keyboard.press('Escape');checks++;
  assert.equal(await page.locator('#audio-play-toggle').getAttribute('aria-pressed'),'false');checks++;
  // Completion from the existing confirmed local puzzle authority.
  for(const [mode,path,param,x,y] of [['spot_difference','spot-difference','localSpot',7.5,7.5],['hidden_object','hidden-object','localHidden',7.5,7.5]]) {
    for (const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]) {
    await page.setViewportSize(viewport);
    const id=await seedPuzzle(page,mode);await page.goto(`${base}/play/${path}/?${param}=${id}`);await page.waitForFunction(()=>document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1'));
    await frames(page);const box=await page.locator('#pixfind-original').boundingBox();
    if (!box.width || !box.height) console.log(await page.evaluate(()=>['main','#pixfind-game','.pixfind-images','.pixfind-image','#pixfind-play-area'].map((selector)=>{const n=document.querySelector(selector),s=getComputedStyle(n);return {selector,rect:n.getBoundingClientRect().toJSON(),height:s.height,rows:s.gridTemplateRows,align:s.alignItems,children:[...n.children].map((c)=>c.className)};})));
    assert.ok(box.width>=16&&box.height>=16,`visible artwork: ${mode} ${viewport.width}`);
    await page.mouse.click(box.x+x*box.width/16,box.y+y*box.height/16);
    await page.waitForFunction(()=>Boolean(document.body.dataset.toolResultOpen));await verifyResult(page,true);console.log(`${engine}: ${mode} completion PASS`);
    assert.equal(await page.locator('.px-tool-result [download],.px-tool-result a').count(),0,'public/play results provide no exports');await page.keyboard.press('Escape');await frames(page);assert.equal(await page.locator('.px-tool-result').isVisible(),false,'one completion view per run');checks++;
    }
  }
  await page.setViewportSize({width:390,height:844});
  // A real one-piece puzzle completes when the piece leaves the tray, not on start.
  await page.goto(base+'/jigsaw/');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d');x.fillStyle='#79aec4';x.fillRect(0,0,24,24);x.fillStyle='#ed7356';x.fillRect(5,8,12,12);return c.toDataURL().split(',')[1];});
  await page.locator('#jigsaw-source-kind').selectOption('file');await page.locator('#jigsaw-file').setInputFiles({name:'local-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('#jigsaw-grid-size').selectOption('24');
  // Hold the fixture at one piece after the arcade's automatic difficulty selection.
  await page.evaluate(()=>document.addEventListener('jigsaw:source-ready',()=>{document.querySelector('#jigsaw-grid-size').value='24';},{once:true}));
  await page.waitForFunction(()=>!document.querySelector('#jigsaw-start').disabled);await page.locator('#jigsaw-start').click();await page.locator('#jigsaw-play').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-display-ad]').count(),0);await page.locator('#jigsaw-tray button').first().press('Enter');await page.locator('#jigsaw-workspace').press('Enter');
  await page.waitForFunction(()=>document.body.dataset.toolResultOpen==='jigsaw-result');await verifyResult(page,true);await page.keyboard.press('Escape');await page.waitForTimeout(400);assert.equal(await page.locator('.px-tool-result').isVisible(),false);checks++;
  if(engine==='chromium') {
    await page.goto(base+'/pixel-camera.html');await page.waitForFunction(()=>document.querySelector('#capture')?.dataset.action==='capture'&&!document.querySelector('#capture').disabled);await page.locator('#capture').click();
    await page.waitForFunction(()=>document.body.dataset.toolResultOpen==='camera-result');await verifyResult(page,true);assert.equal(await page.locator('.px-tool-result #savePng').isVisible(),true);
    for(const width of [390,1280]) {await page.setViewportSize({width,height:width===390?844:800});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await frames(page);await page.screenshot({path:`/tmp/pixieed-tool-result-${engine}-${width}-camera.png`,fullPage:true});}await page.setViewportSize({width:390,height:844});
    await page.locator('.app-tabs button').click();await page.waitForFunction(()=>document.querySelector('#capture').dataset.action==='capture');assert.equal(await page.locator('.lc-bottom #resultControls').count(),1,'real camera controls restored');checks++;
    const box=await page.locator('#capture').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(900);await page.mouse.up();
    await page.waitForFunction(()=>document.body.dataset.toolResultOpen==='camera-result'&&document.querySelector('.px-tool-result img')?.getAttribute('src')?.startsWith('blob:'));await verifyResult(page,true);
    assert.equal(await page.locator('.px-tool-result #postCamera').isVisible(),false);await page.keyboard.press('Escape');checks++;
    await page.goto(base+'/audio/');await page.waitForFunction(()=>document.querySelectorAll('#audio-tracks button').length===4);await page.locator('#audio-take-photo').click();await page.waitForURL('**/pixel-camera.html?*');await page.waitForFunction(()=>document.querySelector('#capture')?.dataset.action==='capture'&&!document.querySelector('#capture').disabled);await page.locator('#capture').click();await page.waitForURL('**/audio/**');assert.equal(await page.locator('[data-display-ad]').count(),0);checks++;
  }
  assert.deepEqual(errors,[]);await context.close();
  console.log(`${engine}: ${checks}/${checks} PASS. Local fixtures/stub ads only; physical camera and real ad supply untested.`);
} catch(error) {
  for(const context of browser.contexts()) for(const page of context.pages()) {
    console.log(JSON.stringify({url:page.url(),state:await page.evaluate(()=>({result:document.body.dataset.toolResultOpen,status:document.querySelector('#pixfind-game-status')?.textContent,progress:document.querySelector('#pixfind-progress')?.textContent,jigsaw:document.querySelector('#jigsaw-status')?.textContent,source:document.querySelector('#pixfind-original')?.getBoundingClientRect().toJSON()}))}));
    await page.screenshot({path:`/tmp/pixieed-result-failure-${engine}.png`});
  }
  throw error;
} finally {await browser.close();}
