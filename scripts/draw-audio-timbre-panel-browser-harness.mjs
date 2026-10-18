/** Local-only acceptance for applied vs draft timbres in the real shared Draw editor. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only localhost QA is allowed');
const out = process.env.PIXIEED_MUSIC_LAYER_OUTPUT || '/tmp/pixieed-tool-shell-evidence/timbre';
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const report = { base, checks: [], errors: [], externalRequests: 'blocked', realCamera: 'UNTESTED', permissions: 'never granted' };
const check = (name, details = {}) => report.checks.push({ name, ...details });
const hash = data => { let h = 2166136261; for (const n of data || []) h = Math.imul(h ^ n, 16777619) >>> 0; return h; };
const browser = await chromium.launch({ headless: true });

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== new URL(base).origin) return route.abort();
    if (requestUrl.pathname.endsWith('/js/creation/draw-page.mjs?rev=20261018-direct-runtime-1')) {
      const response = await route.fetch(); let source = await response.text();
      // Publish the mountDrawMode API object without modifying the repo source.
      const marker = 'return {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,';
      if (source.includes(marker)) source = source.replace(marker, 'window.__musicLayerQA ||= {};\nreturn window.__musicLayerQA.draw = {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,');
      return route.fulfill({ response, body: source });
    }
    if (requestUrl.pathname.endsWith('/js/creation/creation-modes.mjs?rev=20261018-direct-runtime-1')) {
      const response = await route.fetch(); let source = await response.text();
      const marker = 'let musicModel;';
      if (source.includes(marker)) source = source.replace(marker, `${marker}\nwindow.__musicLayerQA ||= {};`)
        .replace('try { musicModel = await mountDrawMusicModel({draw,scope}); }', 'try { musicModel = await mountDrawMusicModel({draw,scope}); window.__musicLayerQA.model = musicModel; window.__musicLayerQA.modes = { get mode(){return mode;}, switchMode }; }');
      return route.fulfill({ response, body: source });
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__musicLayerQA = { mediaRequests: 0 };
    window.__voiceProbe = { starts:0, ended:0, active:0 };
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    for (const method of ['createOscillator','createBufferSource']) {
      const original = AudioContextType?.prototype[method];
      if (!original) continue;
      AudioContextType.prototype[method] = function(...args) {
        const node = original.apply(this,args), start = node.start.bind(node); let started=false;
        node.start = (...startArgs) => { if (!started) { started=true; window.__voiceProbe.starts++; window.__voiceProbe.active++; } return start(...startArgs); };
        node.addEventListener('ended', () => { if(started){ window.__voiceProbe.ended++; window.__voiceProbe.active--; } });
        return node;
      };
    }
    try { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { window.__musicLayerQA.mediaRequests++; throw new Error('Local QA denies media access'); } }); } catch {}
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  return { context, page };
}

async function inspect(page) {
  return page.evaluate(() => {
    const draw = window.__musicLayerQA?.draw, model = window.__musicLayerQA?.model;
    if (!draw || !model) return { probeMissing: true, keys: Object.keys(window.__musicLayerQA || {}) };
    const timeline = draw.getTimeline(), music = model.getState();
    return {
      mode: document.body.dataset.creationMode,
      timeline: { width: timeline.width, height: timeline.height, frames: timeline.frames.map(frame => ({ id: frame.id, durationMs: frame.durationMs })),
        palette: [...timeline.palette], layers: timeline.layers.map(layer => ({ id: layer.id, role: layer.role, visible: layer.visible, name: layer.name })) },
      music: { pageId: music.musicPageId, pages: music.musicAnimation?.frames?.map(frame => frame.id) || [], song: music.song, readOnly: Boolean(window.__musicLayerQA.model.readOnly), error: window.__musicLayerQA.model.error || '' },
      preferences: draw.getOutputPreferences?.(), selectedLayerId: draw.getEditorState?.().layerId, selectedFrameId:draw.getEditorState?.().frameId, musicLayerId: timeline.layers.find(layer => layer.role === 'music')?.id,
      hasOutput: typeof draw.getOutputFrame === 'function', mediaRequests: window.__musicLayerQA.mediaRequests
    };
  });
}

async function mode(page, name) {
  const menu = page.locator('#creation-mode-menu');
  if (!await menu.evaluate(el => el.open)) await page.locator('#creation-mode-menu > summary').click();
  await page.locator(`[data-creation-mode="${name}"]`).click();
  await page.waitForFunction(name => document.body.dataset.creationMode === name && !document.querySelector('#creation-mode-menu')?.hasAttribute('aria-busy'), name);
}

async function screenshot(page, name) { await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); }

const panel='#draw-color-editor';
const S={category:'#datp-category-open',back:'#datp-category-back',candidates:'#datp-candidate-list',categories:'#datp-category-list',audition:'#datp-audition',mute:'#datp-mute',apply:'#datp-apply',current:'#datp-current-instrument',close:'#dce-close',next:'#datp-next-color',previous:'#datp-previous-color'};
const expectedGroups=['基本4音色','鍵盤','弦・打弦','管・金管','シンセ','打楽器','Game Boy','Famicom','その他','ドラム'];
async function ready(page){await page.waitForFunction(()=>document.documentElement.dataset.creationModesReady==='true'&&window.__musicLayerQA?.model?.getState?.(),null,{timeout:25000});}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function current(page){return page.evaluate(()=>{const q=window.__musicLayerQA,d=q.draw,s=q.model.getState(),e=d.getEditorState(),color=d.getTimeline().palette[e.selectedColor],id=color?`rgba-${color.slice(1).toLowerCase().padEnd(8,'f')}`:null,slot=id?s.link?.colorToSlot?.[id]:null;return slot?s.song.colorInstruments?.[id]??s.song.pixelPalette.find(p=>p.slotId===slot)?.instrument:null;});}
async function snapshot(page){return page.evaluate(()=>{const q=window.__musicLayerQA,d=q.draw,s=q.model.getState(),history=d.snapshotTimeline().session.timeline;const t=d.getTimeline();return{song:s.song,link:s.link,palette:[...t.palette],steps:history.past.length,revision:d.workspace.currentProject?.revisionId??null,art:Array.from(d.getOutputFrame(d.getEditorState().frameId,{includeMusic:false}).rgba),musicPages:s.musicAnimation?.frames?.map(f=>({id:f.id,durationMs:f.durationMs})),selectedColor:d.getEditorState().selectedColor};});}
function content(s){const{steps,revision,selectedColor,...c}=s;return c;}
function notes(s){return s.song.tracks.map(t=>({id:t.trackId,clips:t.clips.map(c=>({id:c.clipId,start:c.startTick,length:c.lengthTicks,notes:c.notes.map(n=>({id:n.noteId,pitch:n.pitch,start:n.startTick,duration:n.durationTicks,velocity:n.velocity}))}))}));}
async function layout(page){return page.evaluate(()=>Object.fromEntries(['#draw-canvas','.draw-control-dock','.app-tabs','#draw-music-play'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{x:r.x,y:r.y,w:r.width,h:r.height}];})));}
async function openSound(page){
 if(await page.locator('#draw-music-feedback-dismiss').isVisible())await page.locator('#draw-music-feedback-dismiss').click();
 if(!await page.locator(panel).isVisible())await page.locator('#draw-palette [data-color-index][aria-pressed="true"]').click();
 await page.locator(panel).waitFor({state:'visible'});await page.locator(`${panel} [data-dce-view="sound"]`).click();await page.locator(S.apply).waitFor({state:'visible'});await settle(page);
}
async function choose(page,group,id){await page.locator(S.category).click();await page.locator(`[data-category="${group}"]`).click();await page.locator(`${S.candidates} [data-instrument="${id}"]`).click();await page.waitForFunction(()=>window.__voiceProbe.active===0,null,{timeout:6000});await settle(page);}
async function apply(page,id){await page.locator(S.apply).click();await page.waitForFunction(id=>{const q=window.__musicLayerQA,d=q.draw,s=q.model.getState(),hex=d.getTimeline().palette[d.getEditorState().selectedColor],key=`rgba-${hex.slice(1).toLowerCase().padEnd(8,'f')}`,slot=s.link?.colorToSlot?.[key];return(slot?s.song.colorInstruments?.[key]??s.song.pixelPalette.find(p=>p.slotId===slot)?.instrument:null)===id;},id);await settle(page);}
async function fit(page){
 const g=await page.locator(panel).evaluate(el=>{const r=el.getBoundingClientRect(),h=document.querySelector('.px-site-header,.site-header')?.getBoundingClientRect(),n=document.querySelector('.app-tabs')?.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,viewport:{w:innerWidth,h:innerHeight},top:h?.bottom??0,nav:n?.top??innerHeight,horizontal:el.scrollWidth>el.clientWidth+1};});
 assert.ok(g.x>=0&&g.y>=g.top-1&&g.right<=g.viewport.w+1&&g.bottom<=g.nav+1,JSON.stringify(g));assert.equal(g.horizontal,false);
 for(const selector of [S.apply,S.audition,S.mute,S.next,S.previous,S.category]){const box=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});assert.ok(box&&box.width>=43&&box.height>=43,selector+JSON.stringify(box));assert.ok(box.y>=g.y&&box.y+box.height<=g.bottom+1,'fixed control inside panel '+selector+JSON.stringify({box,panel:g}));}
 return g;
}
async function close(page){await page.locator(S.close).click();await page.locator(panel).waitFor({state:'hidden'});await page.waitForFunction(()=>window.__voiceProbe.active===0,null,{timeout:6000});}
async function seedAudio(page){
 await page.locator('#creation-settings-open').click();await page.locator('#creation-mode-settings-open').click();await page.locator('#draw-music-instrument').selectOption('piano');await page.keyboard.press('Escape');
 if(await page.locator('#draw-music-feedback-dismiss').isVisible())await page.locator('#draw-music-feedback-dismiss').click();
 const box=await page.locator('#draw-canvas').boundingBox();await page.mouse.click(box.x+box.width*.45,box.y+box.height*.45);await page.mouse.click(box.x+box.width*.6,box.y+box.height*.55);
 await page.evaluate(()=>window.__musicLayerQA.draw.workspace.save());await settle(page);
}
try{
 const viewports=[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}].filter(v=>!process.env.PIXIEED_TIMBRE_VIEWPORTS||process.env.PIXIEED_TIMBRE_VIEWPORTS.includes(`${v.width}x${v.height}`));
 for(const viewport of viewports){
  const{context,page}=await newPage(viewport),suffix=`${viewport.width}x${viewport.height}`;
  await page.goto(`${base}/draw/editor.html`);await ready(page);const artBox=await page.locator('#draw-canvas').boundingBox();await page.mouse.click(artBox.x+artBox.width*.2,artBox.y+artBox.height*.2);await mode(page,'audio');await seedAudio(page);
  const baseLayout=await layout(page),before=await snapshot(page);assert.equal(await current(page),'piano');assert.ok(before.art.some(value=>value!==0),'fixture includes independent artwork');assert.ok(before.song.tracks.some(track=>track.clips.some(clip=>clip.notes.length>0)),'fixture includes music notes');
  await openSound(page);const geometry=await fit(page);assert.deepEqual(await layout(page),baseLayout,'opening panel preserves editor/lanes/navigation geometry');assert.deepEqual(await snapshot(page),before,'opening is read-only');
  await page.locator(S.category).click();assert.deepEqual(await page.locator('[data-category]').evaluateAll(nodes=>nodes.map(n=>n.dataset.category)),expectedGroups);
  await screenshot(page,`${suffix}-categories`);await page.locator(S.back).click();assert.deepEqual(await snapshot(page),before,'category navigation is read-only');
  await page.locator(S.category).click();await page.keyboard.press('Escape');assert.equal(await page.locator(panel).isVisible(),true,'Escape returns within panel');assert.equal(await page.locator(S.candidates).isVisible(),true);
  const starts=await page.evaluate(()=>window.__voiceProbe.starts);await choose(page,'鍵盤','electric-piano');await page.waitForFunction(n=>window.__voiceProbe.starts>n,starts);await page.waitForFunction(()=>window.__voiceProbe.active===0,null,{timeout:6000});
  assert.deepEqual(await snapshot(page),before,'candidate audition does not change song/link/history/revision/art');assert.equal(await current(page),'piano');assert.equal(await page.locator(S.apply).isDisabled(),false);await screenshot(page,`${suffix}-candidate`);
  await apply(page,'electric-piano');const applied=await snapshot(page);assert.equal(applied.steps,before.steps+1,'Apply is exactly one undo step');assert.deepEqual(notes(applied),notes(before),'Apply preserves pitch/timing/IDs');assert.deepEqual(applied.art,before.art,'Apply preserves artwork');assert.equal(await page.locator(S.apply).isDisabled(),true);
  await screenshot(page,`${suffix}-applied`);const header=await page.locator(`${panel} .dce-header`).evaluate(el=>{const h=el.getBoundingClientRect();return[...el.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(b=>{const r=b.getBoundingClientRect();return{label:b.textContent,inside:r.top>=h.top&&r.bottom<=h.bottom+1};});});assert.equal(header.length,3,'one close and two tabs');assert.ok(header.every(b=>b.inside),'all header buttons fit one row');check('apply-one-history-step',{viewport,preservedNotes:true,preservedArtwork:true});
  await close(page);await page.locator('#draw-undo').click();assert.deepEqual(content(await snapshot(page)),content(before),'Undo restores pre-apply state');await page.locator('#draw-redo').click();assert.deepEqual(content(await snapshot(page)),content(applied),'Redo restores applied state');
  await page.evaluate(()=>window.__musicLayerQA.draw.workspace.save());await openSound(page);const beforeCancel=await snapshot(page);await choose(page,'鍵盤','celesta');await close(page);assert.deepEqual(await snapshot(page),beforeCancel,'closing discards draft without saving');await openSound(page);assert.equal(await page.locator(S.apply).isDisabled(),true);
  const beforeMute=await snapshot(page);await page.locator(S.mute).click();assert.deepEqual(await snapshot(page),beforeMute,'mute is a candidate until Apply');assert.equal(await page.locator(S.audition).isDisabled(),true);await apply(page,null);assert.equal((await snapshot(page)).steps,beforeMute.steps+1);
  await close(page);await page.locator('#draw-undo').click();assert.equal(await current(page),'electric-piano');await page.locator('#draw-redo').click();assert.equal(await current(page),null);await page.locator('#draw-undo').click();assert.equal(await current(page),'electric-piano');
  await openSound(page);const previousColor=(await snapshot(page)).selectedColor,immutable=content(await snapshot(page));await page.locator(S.next).click();assert.notEqual((await snapshot(page)).selectedColor,previousColor);await page.locator(S.previous).click();assert.equal((await snapshot(page)).selectedColor,previousColor);assert.equal(await current(page),'electric-piano');assert.deepEqual(content(await snapshot(page)),immutable,'moving between colors is read-only');assert.equal(await page.locator(panel).isVisible(),true);
  // The actual color sliders remain functional and commit before returning to sound.
  await page.locator(`${panel} [data-dce-view="color"]`).click();const light=page.locator(`${panel} [data-dce-axis="l"]`);await light.focus();await light.press('ArrowRight');await screenshot(page,`${suffix}-color`);await page.locator(`${panel} [data-dce-view="sound"]`).click();assert.equal(await current(page),'electric-piano','recolor retains assigned sound');assert.notDeepEqual((await snapshot(page)).palette,before.palette);
  await close(page);await page.locator('#draw-undo').click();assert.deepEqual((await snapshot(page)).palette,before.palette);await page.locator('#draw-redo').click();
  // Add a safe new palette color, make it unique, and assign the last modeled drum.
  await page.locator('#draw-palette button[aria-label="色を追加する"]').click();const newLight=page.locator(`${panel} [data-dce-axis="l"]`);await newLight.focus();await newLight.press('ArrowRight');await page.locator(`${panel} [data-dce-view="sound"]`).click();
  await page.evaluate(()=>window.__musicLayerQA.draw.workspace.save());const newBefore=await snapshot(page);await choose(page,'ドラム','drum-crash');assert.deepEqual(await snapshot(page),newBefore,'new-color audition is read-only');await apply(page,'drum-crash');await close(page);
  const final=await snapshot(page);const saved=await page.evaluate(async()=>{const p=await window.__musicLayerQA.draw.workspace.save();return{id:p.projectId,rev:p.revisionId};});
  await page.goto(`${base}/draw/editor.html?pxd=${saved.id}&pxdRevision=${saved.rev}`);await ready(page);await mode(page,'audio');assert.deepEqual(content(await snapshot(page)),content(final),'PXD save and reload retain applied sounds/colors/notes/art');await openSound(page);assert.equal(await current(page),'drum-crash');await fit(page);await screenshot(page,`${suffix}-reloaded`);await close(page);
  const retained=content(await snapshot(page));await mode(page,'draw');await page.locator('#draw-palette [data-color-index][aria-pressed="true"]').click();assert.equal(await page.locator(`${panel} [data-dce-view="sound"]`).isVisible(),false,'ordinary Draw does not expose audio tab');assert.equal(await page.locator(`${panel} [data-dce-axis="h"]`).isVisible(),true,'ordinary Draw retains visible HSL after audio mode');await page.keyboard.press('Escape');await mode(page,'audio');assert.deepEqual(content(await snapshot(page)),retained,'mode roundtrip retains applied music');
  await openSound(page);await page.locator('#draw-music-play').click();await page.waitForFunction(()=>document.querySelector('#draw-music-play').dataset.state==='playing');await openSound(page);await choose(page,'基本4音色','triangle');await page.waitForFunction(()=>document.querySelector('#draw-music-play').dataset.state==='idle'&&window.__voiceProbe.active===0,null,{timeout:6000});await close(page);assert.deepEqual(content(await snapshot(page)),retained,'audition stops transport without modifying music');
  await openSound(page);await page.locator(`${S.candidates} [data-instrument]`).first().click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.__voiceProbe.active===0,null,{timeout:6000});await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await openSound(page);assert.equal(await page.locator(S.apply).isVisible(),true,'sound tab returns after visibility restore');assert.equal(await page.locator('#draw-music-play').getAttribute('data-state'),'idle','visibility restore does not restart audio');await close(page);assert.deepEqual(content(await snapshot(page)),retained,'visibility lifecycle retains project');
  check('draft-apply-history-color-save-mode-transport',{viewport,geometry,saved,voices:await page.evaluate(()=>window.__voiceProbe)});await context.close();console.log(`PASS ${suffix}`);
 }
 if(!process.env.PIXIEED_TIMBRE_SKIP_IFRAME){
  const{context,page}=await newPage({width:1280,height:800});await page.goto(`${base}/draw/about/`);await page.locator('[data-embed-start]').first().click();await page.waitForSelector('iframe.tool-embed__frame');const frame=page.frames().find(f=>f.url().includes('embed=1'));assert.ok(frame);await ready(frame);await mode(frame,'audio');await openSound(frame);await choose(frame,'鍵盤','piano');await apply(frame,'piano');const stable=content(await snapshot(frame));await page.locator('[data-embed-expand]').click();await page.waitForSelector('.tool-embed--expanded');await settle(frame);await page.screenshot({path:`${out}/iframe-expanded-before-fit.png`});await fit(frame);assert.deepEqual(content(await snapshot(frame)),stable);await page.screenshot({path:`out/iframe.png`.replace('out',out)});await page.locator('[data-embed-expand]').click();assert.deepEqual(content(await snapshot(frame)),stable);await close(frame);check('embedded-expand-collapse',{musicRetained:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure={message:error.message,stack:error.stack};throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({status:report.status,checks:report.checks.length,errors:report.errors,out}));}
