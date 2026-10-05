/** Local-only acceptance for Audio's shared color/sound editor and one-category instrument grid. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only a local test server is allowed');
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless:true });
const viewports = [{name:'320x568',width:320,height:568},{name:'390x844',width:390,height:844},{name:'844x390',width:844,height:390},{name:'1280x800',width:1280,height:800}];
const outDir = process.env.PIXIEEED_AUDIO_SWITCH_ARTIFACTS || '/tmp/pixieed-audio-icons-20261005';
const result = { base, viewports:[], audioCases:{}, drawCase:null, pageErrors:[], checks:0 };
let checks = 0;
function check(value, message) { checks += 1; assert.ok(value, message); }
function equal(actual, expected, message) { checks += 1; assert.deepEqual(actual, expected, message); }

async function openPage(viewport) {
  const context = await browser.newContext({ viewport:{width:viewport.width,height:viewport.height}, deviceScaleFactor:1, hasTouch:true, isMobile:viewport.width < 600 });
  const page = await context.newPage();
  page.on('pageerror', error => result.pageErrors.push({ viewport:viewport.name, message:error.message }));
  await page.route('**/*', route => {
    try { return new URL(route.request().url()).origin === origin ? route.continue() : route.abort(); }
    catch { return route.abort(); }
  });
  return {context,page};
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#main') && !document.querySelector('#main').inert, null, {timeout:15000});
  await page.waitForFunction(() => document.querySelector('#audio-pixel-canvas') || document.querySelector('#draw-canvas'), null, {timeout:10000});
}
async function seed(page, tool) {
  return page.evaluate(async toolName => {
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs');
    const { importToolProject } = await import('/js/creation/tool-project-import.mjs');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const colors = [[230,80,70],[250,220,90],[60,170,110],[80,150,210]];
    const rgba = new Uint8Array(16 * 16 * 4);
    for (let y=0; y<16; y++) for (let x=0; x<16; x++) rgba.set([...colors[Math.min(3,Math.floor(x/4))],255],(y*16+x)*4);
    const input = await putPxdSharedImage(createPxdProject({manifest:{title:'音色切替の検証'}}),{width:16,height:16,rgba});
    const project = await createToolProjectStore(toolName).save(await importToolProject(input,toolName),{expectedRevisionId:null});
    return {id:project.projectId,revision:project.revisionId};
  }, tool);
}
async function seedManualAudio(page) {
  return page.evaluate(async () => {
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { createAudioSong } = await import('/js/creation/audio-core.mjs?manual-palette-fixture=1');
    const { writePxdAudioState } = await import('/js/creation/pxd-draw-audio.mjs?manual-palette-fixture=1');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const base=createPxdProject({manifest:{title:'Standalone palette icon check',lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}});
    const project=await createToolProjectStore('audio').save(await writePxdAudioState(base,createAudioSong({songId:'manual-palette-icons'})),{expectedRevisionId:null});
    return {id:project.projectId,revision:project.revisionId};
  });
}
async function snapshot(page, id) {
  return page.evaluate(async projectId => {
    const project = await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(projectId);
    const { componentImageRole } = await import('/js/creation/project-components.mjs');
    const { readPxdImage } = await import('/js/creation/pxd-project.mjs');
    const { readPxdAudioState, readPxdAudioLink } = await import('/js/creation/pxd-draw-audio.mjs');
    const role = componentImageRole(project,project.manifest.toolProject.tool);
    const image = await readPxdImage(project,role);
    return {id:project.projectId,revision:project.revisionId,tool:project.manifest.toolProject.tool,
      rgba:Array.from(image.rgba),width:image.width,height:image.height,
      song:readPxdAudioState(project),link:readPxdAudioLink(project)};
  }, id);
}
async function saved(page) {
  await page.waitForFunction(() => document.querySelector('#project-open')?.dataset.state === 'saved',null,{timeout:15000});
}
function noteTiming(song) {
  return song.tracks.map(track => ({trackId:track.trackId,slot:track.instrument,clips:track.clips.map(clip => ({clipId:clip.clipId,startTick:clip.startTick,lengthTicks:clip.lengthTicks,
    notes:clip.notes.map(note => ({noteId:note.noteId,pitch:note.pitch,startTick:note.startTick,durationTicks:note.durationTicks,velocity:note.velocity}))}))}));
}
function selectedInstrumentForColor(song,slotId,colorId) { return song.colorInstruments?.[colorId] ?? song.pixelPalette.find(slot => slot.slotId === slotId)?.instrument ?? null; }
async function canvasPixels(page, selector) {
  return page.locator(selector).evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data));
}
async function armFirstVisibleProbe(page, selector) {
  await page.evaluate(panelSelector => {
    window.__audioFirstPanelVisible = null;
    const sample = () => {
      const panel = document.querySelector(panelSelector); if (!panel) return null;
      const isOpen = panelSelector === '.audio-palette-settings__body'
        ? Boolean(document.querySelector('#audio-palette-settings')?.open && !document.querySelector('#audio-sound-editor-panel')?.hidden)
        : !panel.hidden;
      if (!isOpen) return null;
      const style = getComputedStyle(panel), r = panel.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || !r.width || !r.height) return null;
      const box = node => { if (!node) return null; const b=node.getBoundingClientRect(); return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}; };
      return {opacity:Number(style.opacity),box:box(panel),header:box(document.querySelector('.site-header')),nav:box(document.querySelector('.app-tabs')),
        viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}};
    };
    const capture = () => { if (window.__audioFirstPanelVisible) return; const state=sample(); if (state) window.__audioFirstPanelVisible=state; };
    const observer = new MutationObserver(capture);
    observer.observe(document.body,{attributes:true,childList:true,subtree:true,attributeFilter:['open','hidden','aria-expanded','class','style']});
    window.__audioPanelProbeStop = () => observer.disconnect();
    capture();
  },selector);
}
async function firstVisibleProbe(page) {
  await page.waitForFunction(() => window.__audioFirstPanelVisible !== null,null,{timeout:5000});
  const probe = await page.evaluate(() => { window.__audioPanelProbeStop?.(); return window.__audioFirstPanelVisible; });
  check(probe.opacity === 1, `First visible ${probe ? 'panel' : 'popover'} must start at opacity 1: ${JSON.stringify(probe)}`);
  return probe;
}
async function panelFit(page,selector,label) {
  const fit = await page.locator(selector).evaluate(panel => {
    const r=panel.getBoundingClientRect(), h=document.querySelector('.site-header').getBoundingClientRect(), n=document.querySelector('.app-tabs').getBoundingClientRect();
    return {box:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},headerBottom:h.bottom,navTop:n.top,
      scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth};
  });
  check(fit.box.left >= -1 && fit.box.right <= fit.viewportWidth+1,`${label}: panel must fit horizontally: ${JSON.stringify(fit)}`);
  check(fit.box.top >= fit.headerBottom-1 && fit.box.bottom <= fit.navTop+1,`${label}: panel must fit between header and navigation: ${JSON.stringify(fit)}`);
  check(fit.scrollWidth <= fit.clientWidth+1 && fit.documentWidth <= fit.viewportWidth+1,`${label}: no horizontal overflow: ${JSON.stringify(fit)}`);
  return fit;
}
async function panelBox(page,selector,label) {
  const box=await page.locator(selector).evaluate(panel=>{
    const style=getComputedStyle(panel),r=panel.getBoundingClientRect();
    return {visible:style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0,left:r.left,top:r.top,width:r.width,height:r.height};
  });
  check(box.visible,`${label}: expected visible frame: ${JSON.stringify(box)}`);
  return box;
}
function checkSameFrame(expected,actual,label) {
  for(const key of ['left','top','width','height']) check(Math.abs(expected[key]-actual[key])<=1,`${label}: ${key} changed by more than 1px (${expected[key]} → ${actual[key]})`);
}
async function scrollContentToBottom(page,selector,label) {
  const before=await page.locator(selector).evaluate(node=>({scrollHeight:node.scrollHeight,clientHeight:node.clientHeight}));
  check(before.scrollHeight>before.clientHeight,`${label}: content should have an internal scroll range (${JSON.stringify(before)})`);
  await page.locator(selector).evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await page.waitForFunction(query=>{const node=document.querySelector(query);return node&&node.scrollTop>0&&node.scrollTop+node.clientHeight>=node.scrollHeight-1;},selector,{timeout:5000});
  return page.locator(selector).evaluate(node=>({scrollTop:node.scrollTop,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight}));
}
async function visiblePanels(page) {
  return page.evaluate(() => {
    const visible = selector => { const node=document.querySelector(selector); if(!node)return false; const s=getComputedStyle(node),r=node.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0; };
    return {color:visible('#audio-color-editor-panel'),sound:visible('#audio-sound-editor-panel')&&Boolean(document.querySelector('#audio-palette-settings')?.open)};
  });
}
async function assertOnlyView(page, expected, label) {
  const state=await visiblePanels(page);
  if(expected==='none') check(!state.color&&!state.sound,`${label}: no editor view should be visible: ${JSON.stringify(state)}`);
  else check(state[expected] && !state[expected==='color'?'sound':'color'],`${label}: expected only ${expected} panel visible, got ${JSON.stringify(state)}`);
}
async function openSoundPanel(page, {probe=false}={}) {
  if (probe) await armFirstVisibleProbe(page,'.audio-palette-settings__body');
  if (!(await page.locator('#audio-palette-settings').evaluate(node=>node.open))) {
    if (!(await page.locator('#audio-color-editor-panel').isVisible().catch(()=>false))) await page.locator('#audio-current').click();
    await page.locator('#audio-color-editor-panel [data-dce-view="sound"]').click();
  }
  await page.waitForFunction(() => document.querySelector('#audio-palette-settings')?.open && !document.querySelector('#audio-sound-editor-panel')?.hidden,null,{timeout:5000});
  if (probe) return firstVisibleProbe(page);
  return null;
}
async function openColorPanel(page,{probe=false}={}) {
  if (probe) await armFirstVisibleProbe(page,'#audio-color-editor-panel');
  if (!(await page.locator('#audio-color-editor-panel').isVisible().catch(()=>false))) await page.locator('#audio-current').click();
  await page.locator('#audio-color-editor-panel').waitFor({state:'visible',timeout:5000});
  if (probe) return firstVisibleProbe(page);
  return null;
}
async function switchToSoundFromColor(page) {
  const button=page.locator('.dce-view-tabs button[data-dce-view="sound"]');
  await button.waitFor({state:'visible',timeout:5000}); await button.click();
  await page.waitForFunction(() => document.querySelector('#audio-palette-settings')?.open && !document.querySelector('#audio-sound-editor-panel')?.hidden && document.querySelector('#audio-color-editor-panel')?.hidden,null,{timeout:5000});
  await assertOnlyView(page,'sound','color to sound switch');
}
async function switchToColorFromSound(page) {
  const button=page.locator('#audio-palette-settings .audio-palette-editor__tabs button[data-audio-editor-view="color"]');
  await button.waitFor({state:'visible',timeout:5000}); await button.click();
  await page.locator('#audio-color-editor-panel').waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(() => document.querySelector('#audio-palette-settings')?.open === false,null,{timeout:5000});
  await assertOnlyView(page,'color','sound to color switch');
}
async function switchToSoundFromSound(page) {
  const button=page.locator('#audio-palette-settings .audio-palette-editor__tabs button[data-audio-editor-view="sound"]');
  await button.waitFor({state:'visible',timeout:5000}); await button.click();
  await page.waitForFunction(() => document.querySelector('#audio-palette-settings')?.open && !document.querySelector('#audio-sound-editor-panel')?.hidden,null,{timeout:5000});
  await assertOnlyView(page,'sound','sound tab activation');
}
async function categoryMetrics(page,label) {
  const metrics=await page.evaluate(() => {
    const categories=[...document.querySelectorAll('.audio-instrument-group-tabs button[data-instrument-group]')];
    const grids=[...document.querySelectorAll('#audio-instrument-groups .audio-instrument-choices')];
    const instruments=[...document.querySelectorAll('#audio-instrument-groups .audio-instrument-choices button[data-instrument]')];
    const describe=node=>{const r=node.getBoundingClientRect();const span=node.querySelector('span');return {text:span?.textContent.trim()||node.getAttribute('aria-label')||node.textContent.trim(),group:node.dataset.instrumentGroup||null,instrument:node.dataset.instrument||null,
      width:r.width,height:r.height,pressed:node.getAttribute('aria-pressed'),scrollWidth:span?.scrollWidth??node.scrollWidth,clientWidth:span?.clientWidth??node.clientWidth,whiteSpace:span?getComputedStyle(span).whiteSpace:null,textOverflow:span?getComputedStyle(span).textOverflow:null};};
    return {categories:categories.map(describe),gridCount:grids.length,instruments:instruments.map(describe),accordionCount:document.querySelectorAll('#audio-instrument-groups details.audio-instrument-group').length,
      panel:{scrollWidth:document.querySelector('.audio-palette-settings__body')?.scrollWidth,clientWidth:document.querySelector('.audio-palette-settings__body')?.clientWidth}};
  });
  check(metrics.categories.length===10,`${label}: all instrument categories should be represented by category buttons: ${metrics.categories.length}`);
  check(metrics.gridCount===1,`${label}: there should be one instrument grid, got ${metrics.gridCount}`);
  check(metrics.accordionCount===0,`${label}: instrument categories should not be accordions, got ${metrics.accordionCount}`);
  check(metrics.instruments.length>0,`${label}: selected category should show instruments`);
  check(metrics.panel.scrollWidth<=metrics.panel.clientWidth+1,`${label}: sound panel has no horizontal overflow`);
  for(const item of [...metrics.categories,...metrics.instruments]) {
    check(item.width>=44&&item.height>=44,`${label}: ${item.group||item.instrument} target is below 44px: ${JSON.stringify(item)}`);
    check(item.text.length>0&&item.scrollWidth<=item.clientWidth+1,`${label}: label is clipped: ${JSON.stringify(item)}`);
  }
  return metrics;
}
async function selectCategory(page, group) {
  const button=page.locator(`.audio-instrument-group-tabs button[data-instrument-group="${group}"]`);
  await button.click();
  await page.waitForFunction(value=>document.querySelector(`.audio-instrument-group-tabs button[aria-pressed="true"]`)?.dataset.instrumentGroup===value,group);
}
async function closeOnEscape(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#audio-palette-settings')?.open
    && (document.querySelector('#audio-color-editor-panel')?.hidden ?? true),null,{timeout:5000});
  await assertOnlyView(page,'none','Escape close');
}
async function assertNoViews(page,label) {
  const views=await visiblePanels(page);
  check(!views.color&&!views.sound,`${label}: no color/sound editor should remain visible: ${JSON.stringify(views)}`);
}
async function paletteIconMetrics(page,selector) {
  await page.waitForFunction(query=>[...document.querySelectorAll(`${query} img.audio-instrument-icon`)].every(image=>image.complete&&image.naturalWidth>0),selector,{timeout:10000});
  return page.locator(selector).evaluateAll(buttons=>{
    const rgb=value=>{const m=value.match(/[\d.]+/g)||[];return m.length>=3?m.slice(0,3).map(Number):null;};
    const luminance=color=>color?.map((value,index)=>{const c=value/255;return (c<=.04045?c/12.92:((c+.055)/1.055)**2.4)*[.2126,.7152,.0722][index];}).reduce((sum,value)=>sum+value,0)??null;
    return buttons.map(button=>{
      const mark=button.querySelector('.audio-track-choice__mark'),icon=mark?.querySelector('.audio-instrument-icon');
      const b=button.getBoundingClientRect(),m=mark?.getBoundingClientRect(),i=icon?.getBoundingClientRect();
      const bs=getComputedStyle(button),ms=mark?getComputedStyle(mark):null,is=icon?getComputedStyle(icon):null;
      const bg=rgb(bs.backgroundColor),filter=is?.filter||'';
      const iconColor=/invert\(1\)/.test(filter)?[255,255,255]:/brightness\(0\)/.test(filter)?[0,0,0]:null;
      const l1=luminance(bg),l2=luminance(iconColor);
      return {instrument:button.dataset.trackId||null,colorId:button.dataset.colorId||null,pressed:button.getAttribute('aria-pressed'),button:{width:button.offsetWidth,height:button.offsetHeight,background:bs.backgroundColor,border:bs.border,boxShadow:bs.boxShadow},
        mark:mark?{tag:mark.tagName,children:mark.children.length,background:ms.backgroundColor,sourceBackground:mark.style.backgroundColor,border:ms.border,borderWidth:ms.borderWidth,boxShadow:ms.boxShadow,width:m.width,height:m.height}:null,
        icon:icon?{tag:icon.tagName,children:mark.children.length,width:i.width,height:i.height,cssWidth:is.width,cssHeight:is.height,offsetWidth:icon.offsetWidth,offsetHeight:icon.offsetHeight,filter,source:icon.getAttribute('src'),complete:icon.complete&&icon.naturalWidth>0,
          centerDeltaX:Math.abs((i.left+i.right-b.left-b.right)/2),centerDeltaY:Math.abs((i.top+i.bottom-b.top-b.bottom)/2),contrast:l1===null||l2===null?null:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)}:null,
        badge:Boolean(button.querySelector('.audio-track-choice__sound-badge')),visibleText:[...button.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim()).map(node=>node.textContent.trim()),
        label:(()=>{const node=button.querySelector('.audio-track-choice__label');if(!node)return null;const s=getComputedStyle(node);return {position:s.position,width:s.width,height:s.height,clipPath:s.clipPath,overflow:s.overflow};})()};
    });
  });
}
function assertIconOnly(metrics,label,{contrast=false}={}) {
  check(metrics.length===4,`${label}: expected four palette icons, got ${metrics.length}`);
  check(metrics.filter(item=>item.pressed==='true').length===1,`${label}: exactly one palette choice stays selected`);
  for(const item of metrics) {
    check(item.button.width===44&&item.button.height===44,`${label}: ${item.colorId||item.instrument} button stays 44x44: ${JSON.stringify(item)}`);
    check(item.mark?.children===1&&item.icon?.tag==='IMG'&&!item.badge&&item.visibleText.length===0&&(!item.label||(item.label.position==='absolute'&&item.label.clipPath==='inset(50%)'&&item.label.width==='1px'&&item.label.height==='1px')),`${label}: ${item.colorId||item.instrument} shows one icon without a badge or visible label: ${JSON.stringify(item)}`);
    check(item.icon?.cssWidth==='24px'&&item.icon?.cssHeight==='24px'&&item.icon.offsetWidth===24&&item.icon.offsetHeight===24,`${label}: icon CSS box is 24x24: ${JSON.stringify(item.icon)}`);
    check(item.icon?.complete&&item.icon.centerDeltaX<=1&&item.icon.centerDeltaY<=1,`${label}: icon is loaded and centered: ${JSON.stringify(item.icon)}`);
    check(item.mark.background==='rgba(0, 0, 0, 0)'&&item.mark.borderWidth==='0px'&&item.mark.boxShadow==='none',`${label}: icon area has no fill frame or shadow: ${JSON.stringify(item.mark)}`);
    if(contrast) check(item.icon.contrast>=4.5,`${label}: ${item.colorId} icon contrast is below 4.5: ${JSON.stringify(item.icon)}`);
  }
}
async function manualPaletteMetrics(page,label) {
  const metrics=await paletteIconMetrics(page,'#audio-tracks button[data-track-id]');
  assertIconOnly(metrics,label,{contrast:true});
  const expected=await page.locator('#audio-tracks button[data-track-id]').evaluateAll(buttons=>buttons.map(button=>{
    const hex=button.getAttribute('aria-label')?.match(/#[\da-f]{6}/i)?.[0];
    return {instrument:button.dataset.trackId,background:button.querySelector('.audio-track-choice__mark')?.style.backgroundColor||button.style.getPropertyValue('--audio-source-color')||'',expected:hex?`rgb(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)})`:null,buttonBackground:getComputedStyle(button).backgroundColor};
  }));
  for(const item of expected) check(item.buttonBackground===item.expected,`${label}: ${item.instrument} keeps its slot color whether selected or not: ${JSON.stringify(item)}`);
  return metrics;
}
async function sharedPaletteMetrics(page,label) {
  const metrics=await paletteIconMetrics(page,'#audio-tracks button.audio-track-choice--source[data-color-id]');
  assertIconOnly(metrics,label,{contrast:true});
  const originalColors=await page.evaluate(()=>[...document.querySelectorAll('#audio-tracks button.audio-track-choice--source[data-color-id]')].map(button=>{
    const match=button.dataset.colorId.match(/^rgba-([\da-f]{6})[\da-f]{2}$/i),hex=match?`#${match[1]}`:null;
    const expected=hex?`rgb(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)})`:null;
    return {colorId:button.dataset.colorId,background:getComputedStyle(button).backgroundColor,expected,pressed:button.getAttribute('aria-pressed')};
  }));
  for(const color of originalColors) check(color.expected===color.background,`${label}: ${color.colorId} keeps its original color fill and aria selection: ${JSON.stringify(color)}`);
  return {icons:metrics,originalColors};
}

try {
  for (const viewport of viewports) {
    const {context,page}=await openPage(viewport);
    try {
      await page.goto(`${base}/audio/`,{waitUntil:'domcontentloaded'}); await ready(page);
      const manualFixture=await seedManualAudio(page);
      await page.goto(`${base}/audio/?${new URLSearchParams({pxd:manualFixture.id,pxdRevision:manualFixture.revision})}`,{waitUntil:'domcontentloaded'}); await ready(page);
      await page.waitForSelector('#audio-tracks button[data-track-id]');
      const manualPalette=await manualPaletteMetrics(page,`${viewport.name} manual palette`);
      const fixture=await seed(page,'audio');
      await page.goto(`${base}/audio/?${new URLSearchParams({pxd:fixture.id,pxdRevision:fixture.revision})}`,{waitUntil:'domcontentloaded'}); await ready(page);
      await page.waitForSelector('#audio-tracks [data-color-id]');
      const baseline=await snapshot(page,fixture.id);
      check(baseline.song.tracks.length===4,`${viewport.name}: fixture has four lanes`);
      check(baseline.song.tracks.reduce((sum,track)=>sum+track.clips.reduce((n,clip)=>n+clip.notes.length,0),0)>0,`${viewport.name}: fixture includes notes`);
      const sharedPalette=await sharedPaletteMetrics(page,`${viewport.name} shared palette`);
      if(viewport.width===1280) {
        await mkdir(outDir,{recursive:true});
        await page.screenshot({path:`${outDir}/audio-palette-icons-1280x800-settings-closed.png`});
      }
      if(viewport.width===390) {
        await mkdir(outDir,{recursive:true});
        await page.locator('#audio-tracks').screenshot({path:`${outDir}/audio-palette-icons-390x844.png`});
      }
      const soundFirst=await openSoundPanel(page,{probe:true});
      await assertOnlyView(page,'sound',`${viewport.name} initial sound view`);
      const initialFit=await panelFit(page,'#audio-palette-settings .audio-palette-settings__body',`${viewport.name} initial sound view`);
      await selectCategory(page,'鍵盤');
      const keyboardMetrics=await categoryMetrics(page,viewport.name);
      const afterCategory=await snapshot(page,fixture.id);
      equal(afterCategory.revision,baseline.revision,`${viewport.name}: category selection must not create a PXD revision`);
      equal(afterCategory.rgba,baseline.rgba,`${viewport.name}: category selection must not alter RGBA`);
      equal(afterCategory.song,baseline.song,`${viewport.name}: category selection must not change song or instrument assignments`);
      equal(afterCategory.link,baseline.link,`${viewport.name}: category selection must not change the PXD link`);
      let frameBaseline=afterCategory;
      let deepScroll=null;
      if(viewport.width===844) {
        await selectCategory(page,'弦・打弦');
        const slotButton=page.locator('#audio-sound-slots button[aria-pressed="true"]');
        await slotButton.waitFor({state:'visible'});
        const slotId=await slotButton.getAttribute('data-sound-slot');
        const beforeBottom=await snapshot(page,fixture.id);
        const soundHeaderBefore=await panelBox(page,'#audio-palette-settings .audio-palette-editor__current','844x390 sound header before deep scroll');
        const soundColorTabBefore=await panelBox(page,'#audio-palette-settings .audio-palette-editor__tabs [data-audio-editor-view="color"]','844x390 sound color tab before deep scroll');
        const soundTabBefore=await panelBox(page,'#audio-palette-settings .audio-palette-editor__tabs [data-audio-editor-view="sound"]','844x390 sound tab before deep scroll');
        deepScroll=await scrollContentToBottom(page,'#audio-sound-editor-panel','844x390 instrument list');
        const soundHeaderAfter=await panelBox(page,'#audio-palette-settings .audio-palette-editor__current','844x390 sound header after deep scroll');
        const soundColorTabAfter=await panelBox(page,'#audio-palette-settings .audio-palette-editor__tabs [data-audio-editor-view="color"]','844x390 sound color tab after deep scroll');
        const soundTabAfter=await panelBox(page,'#audio-palette-settings .audio-palette-editor__tabs [data-audio-editor-view="sound"]','844x390 sound tab after deep scroll');
        checkSameFrame(soundHeaderBefore,soundHeaderAfter,'844x390 sound header stays fixed during instrument scroll');
        checkSameFrame(soundColorTabBefore,soundColorTabAfter,'844x390 sound color tab stays fixed during instrument scroll');
        checkSameFrame(soundTabBefore,soundTabAfter,'844x390 sound tab stays fixed during instrument scroll');
        const lastInstrument=page.locator('#audio-instrument-choices button[data-instrument]').last();
        const instrumentId=await lastInstrument.getAttribute('data-instrument');
        const bottomButton=await panelBox(page,'#audio-instrument-choices button[data-instrument]:last-child','844x390 bottom instrument');
        check(bottomButton.top>=soundHeaderAfter.top+soundHeaderAfter.height-1,`844x390: bottom instrument does not overlap the fixed header: ${JSON.stringify({bottomButton,soundHeaderAfter})}`);
        await mkdir(outDir,{recursive:true});
        await page.screenshot({path:`${outDir}/audio-sound-switch-bottom-instrument-844x390.png`});
        await lastInstrument.click(); await saved(page);
        await page.waitForFunction(({slot,instrument:id})=>document.querySelector(`#audio-sound-slots button[data-sound-slot="${slot}"]`)?.getAttribute('aria-pressed')==='true'
          && document.querySelector(`#audio-instrument-choices button[data-instrument="${id}"]`)?.getAttribute('aria-pressed')==='true',
        {slot:slotId,instrument:instrumentId},{timeout:10000});
        const afterBottom=await snapshot(page,fixture.id);
        assert.notEqual(afterBottom.revision,beforeBottom.revision,'844x390: selecting the bottom instrument persists the lane change');
        equal(afterBottom.rgba,beforeBottom.rgba,'844x390: bottom instrument selection preserves RGBA');
        equal(noteTiming(afterBottom.song),noteTiming(beforeBottom.song),'844x390: bottom instrument selection preserves note timing');
        assert.equal(selectedInstrumentForColor(afterBottom.song,slotId,await page.locator('#audio-tracks button[data-color-id][aria-pressed="true"]').getAttribute('data-color-id')),instrumentId,'844x390: bottom instrument updates the selected color');
        await selectCategory(page,'鍵盤');
        frameBaseline=await snapshot(page,fixture.id);
      }
      const soundFrame=await panelBox(page,'#audio-palette-settings .audio-palette-settings__body',`${viewport.name} sound panel frame`);
      const legacyColorTab=await panelBox(page,'#audio-palette-settings .audio-palette-editor__tabs [data-audio-editor-view="color"]',`${viewport.name} sound-view color tab`);
      await switchToColorFromSound(page);
      const colorFrame=await panelBox(page,'#audio-color-editor-panel',`${viewport.name} color panel frame`);
      checkSameFrame(soundFrame,colorFrame,`${viewport.name} sound→color panel frame`);
      const sharedColorTab=await panelBox(page,'.dce-view-tabs [data-dce-view="color"]',`${viewport.name} color-view color tab`);
      const sharedSoundTab=await panelBox(page,'.dce-view-tabs [data-dce-view="sound"]',`${viewport.name} color-view sound tab`);
      let colorDeepScroll=null;
      if(viewport.width===844) {
        const colorHeaderBefore=await panelBox(page,'#audio-color-editor-panel .dce-header','844x390 color header before deep scroll');
        const colorTabBefore=await panelBox(page,'.dce-view-tabs [data-dce-view="color"]','844x390 color tab before deep scroll');
        const colorSoundTabBefore=await panelBox(page,'.dce-view-tabs [data-dce-view="sound"]','844x390 sound tab before deep scroll');
        colorDeepScroll=await scrollContentToBottom(page,'#audio-color-editor-panel .dce-content','844x390 color editor content');
        const colorHeaderAfter=await panelBox(page,'#audio-color-editor-panel .dce-header','844x390 color header after deep scroll');
        const colorTabAfter=await panelBox(page,'.dce-view-tabs [data-dce-view="color"]','844x390 color tab after deep scroll');
        const colorSoundTabAfter=await panelBox(page,'.dce-view-tabs [data-dce-view="sound"]','844x390 sound tab after deep scroll');
        checkSameFrame(colorHeaderBefore,colorHeaderAfter,'844x390 color header stays fixed during content scroll');
        checkSameFrame(colorTabBefore,colorTabAfter,'844x390 color tab stays fixed during content scroll');
        checkSameFrame(colorSoundTabBefore,colorSoundTabAfter,'844x390 sound tab stays fixed during content scroll');
      }
      checkSameFrame(legacyColorTab,sharedColorTab,`${viewport.name} color-switch button frame`);
      if(viewport.width===390||viewport.width===844) {
        await mkdir(outDir,{recursive:true});
        await page.screenshot({path:`${outDir}/audio-sound-switch-color-${viewport.name}.png`});
      }
      await switchToSoundFromColor(page);
      const returnedSoundFrame=await panelBox(page,'#audio-palette-settings .audio-palette-settings__body',`${viewport.name} returned sound panel frame`);
      checkSameFrame(soundFrame,returnedSoundFrame,`${viewport.name} sound→color→sound panel frame`);
      const audioSoundTab=await panelBox(page,'#audio-palette-settings .audio-palette-editor__tabs [data-audio-editor-view="sound"]',`${viewport.name} sound-view sound tab`);
      checkSameFrame(sharedSoundTab,audioSoundTab,`${viewport.name} sound-switch button frame`);
      equal(await page.locator('.audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group'),'鍵盤',`${viewport.name}: selected category survives view-only frame switching`);
      const afterFrameSwitch=await snapshot(page,fixture.id);
      equal(afterFrameSwitch.revision,frameBaseline.revision,`${viewport.name}: panel frame switching does not create a revision`);
      equal(afterFrameSwitch.rgba,frameBaseline.rgba,`${viewport.name}: panel frame switching preserves RGBA`);
      equal(afterFrameSwitch.song,frameBaseline.song,`${viewport.name}: panel frame switching preserves the song`);
      if(viewport.width===390||viewport.width===844) {
        await mkdir(outDir,{recursive:true});
        await page.screenshot({path:`${outDir}/audio-sound-switch-${viewport.name}.png`});
      }
      result.viewports.push({name:viewport.name,manualPalette,sharedPalette,firstVisible:soundFirst,fit:initialFit,category:keyboardMetrics,deepScroll,colorDeepScroll,panelFrames:{sound:soundFrame,color:colorFrame,returnedSound:returnedSoundFrame,colorTab:legacyColorTab,sharedColorTab,soundTab:sharedSoundTab,audioSoundTab}});

      if(viewport.width===390) {
        // A real source-color change in the shared editor remains undoable in Draw, with no Audio tabs added there.
        await page.goto(`${base}/draw/`,{waitUntil:'domcontentloaded'}); await ready(page);
        const drawFixture=await seed(page,'draw');
        await page.goto(`${base}/draw/?${new URLSearchParams({pxd:drawFixture.id,pxdRevision:drawFixture.revision})}`,{waitUntil:'domcontentloaded'}); await ready(page);
        const drawBefore=await canvasPixels(page,'#draw-canvas');
        await page.locator('.draw-current').click(); await page.locator('#draw-color-editor').waitFor({state:'visible'});
        check(await page.locator('#draw-color-editor .dce-view-tabs').count()===0,'Draw color panel should not add Audio view tabs');
        check(await page.locator('#draw-color-editor .dce-quick button').count()>0,'Draw shared color panel retains quick colors');
        check(await page.locator('#draw-color-editor [data-dce-axis="h"]').count()===1,'Draw shared color panel retains HSL controls');
        await page.locator('#draw-color-editor .dce-quick button[aria-label="#ff4d4d"]').click(); await saved(page);
        const drawRecolored=await canvasPixels(page,'#draw-canvas');
        assert.notDeepEqual(drawRecolored,drawBefore,'Draw quick-color change should recolor the pixel image');
        await page.locator('#dce-done').click(); await page.locator('#draw-undo').click();
        equal(await canvasPixels(page,'#draw-canvas'),drawBefore,'Draw Undo restores the original RGBA after a quick-color edit');
        result.drawCase={viewTabs:0,quickColor:true,hsl:true,undoRestored:true};

        await page.goto(`${base}/audio/?${new URLSearchParams({pxd:fixture.id,pxdRevision:fixture.revision})}`,{waitUntil:'domcontentloaded'}); await ready(page);
        const colorFirst=await openColorPanel(page,{probe:true});
        check(colorFirst.opacity===1,`390x844: color panel first visible opacity must be 1: ${JSON.stringify(colorFirst)}`);
        await panelFit(page,'#audio-color-editor-panel','390x844 Audio color panel');
        await assertOnlyView(page,'color','Audio color editor open');
        const beforeHsl=await snapshot(page,fixture.id);
        await page.locator('#audio-hue').evaluate(el=>{el.value='190';el.dispatchEvent(new Event('input',{bubbles:true}));});
        await saved(page);
        const afterHsl=await snapshot(page,fixture.id);
        assert.notDeepEqual(afterHsl.rgba,beforeHsl.rgba,'Audio HSL edit should change the shared source RGBA');
        equal(noteTiming(afterHsl.song),noteTiming(beforeHsl.song),'Audio HSL edit leaves note timing and track lanes unchanged');
        const afterHslRevision=afterHsl.revision;
        if(viewport.width===390) await page.screenshot({path:`${outDir}/audio-color-switch-390x844.png`});

        await switchToSoundFromColor(page); await panelFit(page,'#audio-palette-settings .audio-palette-settings__body','Audio color→sound');
        let switched=await snapshot(page,fixture.id);
        equal(switched.revision,afterHslRevision,'Color→sound switch does not write a PXD revision');
        equal(switched.rgba,afterHsl.rgba,'Color→sound switch preserves RGBA');
        equal(switched.song,afterHsl.song,'Color→sound switch preserves song');
        equal(switched.link,afterHsl.link,'Color→sound switch preserves link');
        // Category choice is in-page UI state, not persisted across navigating away to Draw.
        // Re-establish the chosen category here, then verify the subsequent view round trip.
        await selectCategory(page,'鍵盤');

        const selectedSlotButton=page.locator('#audio-sound-slots button[aria-pressed="true"]');
        await selectedSlotButton.waitFor({state:'visible'});
        const slotId=await selectedSlotButton.getAttribute('data-sound-slot');
        assert.ok(slotId,'Sound panel should have a selected lane');
        const chosenColorId=await page.locator('#audio-tracks button[data-color-id][aria-pressed="true"]').getAttribute('data-color-id');
        const chosenGroup=await page.locator('.audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group');
        assert.equal(chosenGroup,'鍵盤','Selected category should persist through the switch');
        const instrument=page.locator('.audio-instrument-choices button[data-instrument]').first();
        const instrumentId=await instrument.getAttribute('data-instrument');
        assert.ok(instrumentId,'Selected category should expose an instrument');
        await instrument.click(); await saved(page);
        await page.waitForFunction(({slot,instrument:id})=>{
          const project=document.querySelector('#project-open');
          const button=document.querySelector(`#audio-sound-slots button[data-sound-slot="${slot}"]`);
          const selected=document.querySelector(`.audio-instrument-choices button[data-instrument="${id}"]`);
          return project?.dataset.state==='saved' && button?.getAttribute('aria-pressed')==='true' && selected?.getAttribute('aria-pressed')==='true';
        },{slot:slotId,instrument:instrumentId},{timeout:10000});
        const afterInstrument=await snapshot(page,fixture.id);
        assert.notEqual(afterInstrument.revision,afterHslRevision,'Choosing an instrument should persist a new PXD revision');
        equal(afterInstrument.rgba,afterHsl.rgba,'Instrument selection must not recolor source image');
        equal(noteTiming(afterInstrument.song),noteTiming(afterHsl.song),'Instrument selection must preserve note timing');
        assert.equal(selectedInstrumentForColor(afterInstrument.song,slotId,chosenColorId),instrumentId,'Chosen instrument should update only the selected color');
        assert.equal(await page.locator('.audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group'),chosenGroup,'Category remains selected after instrument selection');
        result.audioCases.instrument={slotId,instrumentId,revisionChanged:true,rgbaStable:true,noteTimingStable:true,categoryRetained:true};

        // Exercise the reverse switch in the sound panel, then return to sound without changing saved data.
        await switchToColorFromSound(page);
        const afterSoundToColor=await snapshot(page,fixture.id);
        equal(afterSoundToColor.revision,afterInstrument.revision,'Sound→color switch does not create a revision');
        equal(afterSoundToColor.rgba,afterInstrument.rgba,'Sound→color switch preserves RGBA');
        equal(afterSoundToColor.song,afterInstrument.song,'Sound→color switch preserves song');
        const groupAfterReturn=await page.locator('.audio-palette-settings__body').count();
        check(groupAfterReturn===1,'Sound editor remains available after returning from its view switch');
        await switchToSoundFromColor(page);
        assert.equal(await page.locator('.audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group'),chosenGroup,'Category selection is retained across sound→color→sound');
        await assertOnlyView(page,'sound','sound→color→sound return');
        const afterSoundRoundTrip=await snapshot(page,fixture.id);
        equal(afterSoundRoundTrip.revision,afterInstrument.revision,'Sound→color→sound view round trip does not change PXD revision');
        equal(afterSoundRoundTrip.rgba,afterInstrument.rgba,'Sound→color→sound view round trip preserves RGBA');
        equal(afterSoundRoundTrip.song,afterInstrument.song,'Sound→color→sound view round trip preserves the song');

        if(viewport.width===390) await page.screenshot({path:`${outDir}/audio-sound-switch-after-instrument-390x844.png`});
        const latest=await snapshot(page,fixture.id);
        await page.reload({waitUntil:'domcontentloaded'}); await ready(page);
        const restored=await snapshot(page,fixture.id);
        equal(restored.revision,latest.revision,'Reload restores the latest saved PXD revision');
        equal(restored.rgba,latest.rgba,'Reload restores source RGBA');
        equal(await canvasPixels(page,'#audio-pixel-canvas'),latest.rgba,'Reloaded Audio canvas displays the saved source RGBA');
        equal(noteTiming(restored.song),noteTiming(latest.song),'Reload restores note timing');
        assert.equal(selectedInstrumentForColor(restored.song,slotId,chosenColorId),instrumentId,'Reload restores the instrument assignment');
        const mappedColorId=chosenColorId;
        assert.ok(mappedColorId,`Reloaded PXD should retain a color mapped to ${slotId}`);
        const currentlySelectedColor=await page.locator('#audio-tracks button[data-color-id][aria-pressed="true"]').getAttribute('data-color-id').catch(()=>null);
        if(currentlySelectedColor===mappedColorId) {
          const anotherColor=page.locator(`#audio-tracks button[data-color-id]:not([data-color-id="${mappedColorId}"])`).first();
          check(await anotherColor.count()>0,'Fixture needs another source color to select the saved mapped color without opening its editor');
          await anotherColor.click();
        }
        await page.locator(`#audio-tracks button[data-color-id="${mappedColorId}"]`).click();
        await openSoundPanel(page);
        const restoredSlot=page.locator(`#audio-sound-slots button[data-sound-slot="${slotId}"]`);
        await restoredSlot.waitFor({state:'visible'});
        const restoredGroup=await page.locator('#audio-instrument-choices').getAttribute('data-group');
        assert.ok(restoredGroup,'Reloaded instrument group should be rendered');
        equal(await page.locator('.audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group'),restoredGroup,'Reloaded selected category matches the saved instrument');
        const restoredInstrument=page.locator(`#audio-instrument-choices button[data-instrument="${instrumentId}"]`);
        await restoredInstrument.waitFor({state:'visible'});
        equal(await restoredInstrument.getAttribute('aria-pressed'),'true','Reloaded instrument grid highlights the saved instrument');
        equal(await restoredSlot.getAttribute('aria-pressed'),'true','Reloaded sound slots select the slot mapped to the inspected color');
        result.audioCases.reload={revision:restored.revision,rgba:true,canvas:true,timing:true,instrument:true,category:true,slot:true};

        // Escape closes the active sound panel; an outside click closes the common color panel.
        await openSoundPanel(page); await closeOnEscape(page); await assertNoViews(page,'Escape close');
        await openColorPanel(page);
        const header=await page.locator('.site-header').boundingBox();
        check(header, 'Header is available as a safe outside-click target');
        await page.mouse.click(header.x+header.width-3,header.y+header.height/2);
        await assertNoViews(page,'outside click close');
        const closedSnapshot=await snapshot(page,fixture.id);
        equal(closedSnapshot.revision,restored.revision,'Closing either panel does not mutate PXD');
        result.audioCases.close={escape:true,outside:true};
      }
      check(result.pageErrors.filter(error=>error.viewport===viewport.name).length===0,`${viewport.name}: no uncaught page errors`);
      console.log(`PASS Audio sound switch ${viewport.name}`);
    } finally { await context.close(); }
  }
  result.checks=checks;
  await mkdir(outDir,{recursive:true}); await writeFile(`${outDir}/results.json`,JSON.stringify(result,null,2));
  console.log(`PASS audio sound-switch (${checks} checks, ${viewports.length} viewports)`);
} finally { await browser.close(); }
