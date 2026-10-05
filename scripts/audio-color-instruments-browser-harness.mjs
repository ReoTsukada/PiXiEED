/** Isolated browser acceptance for per-source-color instrument assignments. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only a local test server is allowed');
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const outDir = process.env.PIXIEEED_AUDIO_COLOR_INSTRUMENTS_ARTIFACTS || '/tmp/pixieed-audio-color-instruments-20261005';
const viewports = [{ width: 390, height: 844 }, { width: 844, height: 390 }];
const result = { base, cases: [], checks: 0, pageErrors: [], consoleErrors: [], subjectiveListening: 'not performed' };
const check = (value, message, evidence) => { result.checks += 1; assert.ok(value, message + (evidence === undefined ? '' : `: ${JSON.stringify(evidence)}`)); };
const equal = (actual, expected, message) => { result.checks += 1; assert.deepEqual(actual, expected, message); };

async function seedProject(page) {
  return page.evaluate(async () => {
    const pxd = await import('/js/creation/pxd-codec.mjs');
    const stores = await import('/js/creation/tool-project-store.mjs');
    const core = await import('/js/creation/audio-core.mjs');
    const binding = await import('/js/creation/pxd-draw-audio.mjs');
    const colors = [[230,80,70],[250,220,90],[60,170,110],[80,150,210],[210,90,180],[80,200,190],[190,150,70],[130,100,220]];
    const rgba = new Uint8Array(16 * 16 * 4);
    colors.forEach((color, index) => rgba.set([...color,255], (index * 2 + 1) * 4));
    // Two source colors share one time column at different pitches, exercising
    // simultaneous playback while remaining visually distinct in the source.
    rgba.set([...colors[0],255],(10)*4);
    rgba.set([...colors[1],255],(16+10)*4);
    const plan=binding.prepareSharedAudioImageImport(core.createAudioSong({songId:'audio-color-instrument-static-fixture'}),{width:16,height:16,rgba});
    let image=plan.image,song=plan.song,link=plan.link;
    const slots = ['square','square','triangle','sawtooth','noise','square','triangle',null];
    for (let index=0; index<colors.length; index++) {
      const id = `rgba-${colors[index].map(value=>value.toString(16).padStart(2,'0')).join('')}ff`;
      const assigned = binding.assignPxdAudioColor(song,image,link,id,slots[index]); song=assigned.song; link=assigned.link;
    }
    const ids = colors.map(color=>`rgba-${color.map(value=>value.toString(16).padStart(2,'0')).join('')}ff`);
    song = core.setAudioColorInstrument(song,{colorId:ids[0],instrument:'organ'});
    song = core.setAudioColorInstrument(song,{colorId:ids[1],instrument:'piano'});
    song = core.setAudioColorInstrument(song,{colorId:ids[4],instrument:'flute'});
    const project = await binding.writePxdAudioState(pxd.createPxdProject({manifest:{title:'isolated color instrument fixture',lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}}),song,{image,link});
    const saved = await stores.createToolProjectStore('audio').save(project,{expectedRevisionId:null});
    return {id:saved.projectId,revision:saved.revisionId,ids,slots,rgba:Array.from(image.rgba),colors};
  });
}

async function seedAnimationProject(page) {
  return page.evaluate(async () => {
    const animApi=await import('/js/creation/animation-core.mjs');
    const pxd=await import('/js/creation/pxd-codec.mjs');
    const pxdAnim=await import('/js/creation/pxd-animation.mjs');
    const stores=await import('/js/creation/tool-project-store.mjs');
    const audioPxd=await import('/js/creation/pxd-draw-audio.mjs');
    const audio=await import('/js/creation/audio-core.mjs');
    const sequence=await import('/js/creation/audio-animation.mjs');
    const palette=['#e65046','#fadc5a']; const ids=palette.map(color=>`rgba-${color.slice(1)}ff`);
    let animation=animApi.createAnimation({width:16,height:16,palette});
    const first=animation.frames[0].id;
    animation=animApi.addAnimationFrame(animation,{sourceFrameId:first,durationMs:160});
    const second=animation.frames[1].id; const layer=animation.layers[0].id;
    const makeCel=(index,x)=>{const pixels=Array(256).fill(0);pixels[3*16+x]=index+1;return {schemaVersion:1,width:16,height:16,palette,pixels};};
    animation=animApi.writeAnimationCel(animation,first,layer,makeCel(0,2));
    animation=animApi.writeAnimationCel(animation,second,layer,makeCel(1,4));
    let song=audio.createAudioSong({songId:'audio-color-instrument-animation-fixture'});
    const colorToSlot={[ids[0]]:'square',[ids[1]]:'square'};
    const projected=sequence.prepareAudioAnimationImport(song,animation,{colorToSlot});
    song=projected.song;
    const link=sequence.createAudioAnimationLink(song,animation,{colorToSlot,projectionReady:true});
    song=audio.setAudioColorInstrument(song,{colorId:ids[0],instrument:'organ'});
    song=audio.setAudioColorInstrument(song,{colorId:ids[1],instrument:'piano'});
    let project=await pxdAnim.writePxdAnimation(pxd.createPxdProject({manifest:{title:'isolated animated color instrument fixture',lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}}),animation,{role:'audio',posterFrameId:first});
    project=await audioPxd.writePxdAudioState(project,song,{link,animation});
    const saved=await stores.createToolProjectStore('audio').save(project,{expectedRevisionId:null});
    return {id:saved.projectId,revision:saved.revisionId,ids,frames:[first,second],pixels:animation.frames.map(frame=>Array.from(animApi.composeAnimationFrame(animation,frame.id).pixels))};
  });
}

async function snapshot(page, id) {
  return page.evaluate(async projectId => {
    const stores=await import('/js/creation/tool-project-store.mjs');
    const pxd=await import('/js/creation/pxd-store.mjs');
    const imageApi=await import('/js/creation/pxd-project.mjs');
    const audio=await import('/js/creation/pxd-draw-audio.mjs');
    const project=await pxd.createPxdStore().load(projectId);
    const image=await imageApi.readPxdImage(project,'audio');
    const song=audio.readPxdAudioState(project),link=audio.readPxdAudioLink(project);
    const core=await import('/js/creation/audio-core.mjs');
    return {revision:project.revisionId,rgba:Array.from(image.rgba),song,link,
      events:core.collectAudioEvents(song,{outlineRuns:true}).map(event=>({instrument:event.instrument,colorId:event.colorId||null,pitch:event.pitch,startTick:event.startTick,durationTicks:event.durationTicks,velocity:event.velocity,sourceCell:event.sourceCell||null}))};
  },id);
}

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#main') && !document.querySelector('#main').inert && document.querySelector('#audio-pixel-canvas'),null,{timeout:15000});
  await page.waitForSelector('#audio-tracks button[data-color-id]',{timeout:10000});
}
async function openSound(page, expectedInstrument) {
  if (!(await page.locator('#audio-palette-settings').evaluate(node=>node.open))) {
    if (!(await page.locator('#audio-color-editor-panel').isVisible().catch(()=>false))) await page.locator('#audio-current').click();
    await page.locator('#audio-color-editor-panel [data-dce-view="sound"]').click();
  }
  await page.waitForFunction(()=>document.querySelector('#audio-palette-settings')?.open&&!document.querySelector('#audio-sound-editor-panel')?.hidden,null,{timeout:5000});
  if(expectedInstrument) {
    try { await page.waitForFunction(id=>document.querySelector(`#audio-instrument-choices button[data-instrument="${id}"]`)?.getAttribute('aria-pressed')==='true',expectedInstrument,{timeout:5000}); }
    catch(error) {
      const diagnostic=await page.evaluate(()=>({selected:[...document.querySelectorAll('#audio-tracks button[data-color-id][aria-pressed="true"]')].map(button=>button.dataset.colorId),paletteLabel:document.querySelector('#audio-tracks button[data-color-id][aria-pressed="true"]')?.getAttribute('aria-label'),editorName:document.querySelector('#audio-edit-color-name')?.textContent,group:document.querySelector('#audio-instrument-group-tabs button[aria-pressed="true"]')?.dataset.instrumentGroup,pressed:[...document.querySelectorAll('#audio-instrument-choices button[aria-pressed="true"]')].map(button=>button.dataset.instrument),settingsOpen:document.querySelector('#audio-palette-settings')?.open,summaryExpanded:document.querySelector('#audio-palette-settings > summary')?.getAttribute('aria-expanded')}));
      throw new Error(`Expected picker instrument ${expectedInstrument}; DOM=${JSON.stringify(diagnostic)}; ${error.message}`);
    }
  }
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function selectColor(page,id) {
  const details=page.locator('#audio-palette-settings');
  if(await details.evaluate(node=>node.open)) {
    await page.locator('#audio-palette-close').click();
    await page.waitForFunction(()=>document.querySelector('#audio-palette-settings')?.open===false,null,{timeout:3000});
  }
  const button=page.locator(`#audio-tracks button[data-color-id="${id}"]`);
  await button.scrollIntoViewIfNeeded();
  try { await button.click({timeout:5000}); }
  catch(error) {
    const geometry=await page.evaluate(colorId=>{
      const button=document.querySelector(`#audio-tracks button[data-color-id="${colorId}"]`),tracks=document.querySelector('#audio-tracks'),toolbar=document.querySelector('.audio-toolbar');
      const box=node=>{const r=node?.getBoundingClientRect();return r&&{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      return {button:box(button),tracks:box(tracks),toolbar:box(toolbar),scroller:{scrollWidth:tracks?.scrollWidth,clientWidth:tracks?.clientWidth,scrollLeft:tracks?.scrollLeft},viewport:{width:innerWidth,height:innerHeight}};
    },id);
    throw new Error(`Could not physically click source color ${id}; geometry=${JSON.stringify(geometry)}; ${error.message}`);
  }
  await page.waitForFunction(color=>document.querySelector(`#audio-tracks button[data-color-id="${color}"]`)?.getAttribute('aria-pressed')==='true',id,{timeout:5000});
}
async function save(page) {
  const output=page.locator('#audio-output');
  if (!(await output.evaluate(node=>node.open))) await output.locator(':scope > summary').click();
  await page.locator('#audio-save').click();
  await page.waitForFunction(()=>document.querySelector('#audio-save')?.disabled===false&&document.querySelector('#project-open')?.dataset.state==='saved',null,{timeout:12000});
}
async function setInstrument(page,id) {
  const button=page.locator(`#audio-instrument-choices button[data-instrument="${id}"]`);
  await button.waitFor({state:'visible',timeout:6000}); await button.click(); await save(page);
}

try {
  await mkdir(outDir,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of viewports) {
      const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true,isMobile:viewport.width<600});
      const page=await context.newPage();
      page.on('pageerror',error=>result.pageErrors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
      page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('net::ERR_FAILED'))result.consoleErrors.push(`${viewport.width}x${viewport.height}: ${message.text()}`);});
      await page.route('**/*',route=>{try{return new URL(route.request().url()).origin===origin?route.continue():route.abort();}catch{return route.abort();}});
      await page.goto(base+'/audio/',{waitUntil:'domcontentloaded'}); await ready(page);
      const fixture=await seedProject(page);
      await page.goto(`${base}/audio/?${new URLSearchParams({pxd:fixture.id,pxdRevision:fixture.revision})}`,{waitUntil:'domcontentloaded'}); await ready(page);
      const before=await snapshot(page,fixture.id);
      check(Object.keys(before.link.colorToSlot).filter(id=>before.link.colorToSlot[id]).length===7,'Fixture maps seven source colors across four slots and includes one unassigned color');
      check(before.song.colorInstruments[fixture.ids[0]]==='organ'&&before.song.colorInstruments[fixture.ids[1]]==='piano','Fixture contains distinct overrides for two colors sharing the same slot');
      const originalEvents=before.events;

      // Change one same-slot color through the real picker. The other color's effective sound must stay put.
      await selectColor(page,fixture.ids[0]); await openSound(page,'organ');
      let effective=await snapshot(page,fixture.id);
      check(effective.song.colorInstruments[fixture.ids[1]]==='piano','Selecting another color does not mutate its same-slot peer');
      check(await page.locator('#audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group')==='鍵盤','Picker group follows the selected color effective instrument');
      await page.locator('#audio-instrument-group-tabs button[data-instrument-group="弦・打弦"]').click();
      await setInstrument(page,'violin');
      const afterOne=await snapshot(page,fixture.id);
      check(afterOne.song.colorInstruments[fixture.ids[0]]==='violin','Instrument choice updates selected source color');
      check(afterOne.song.colorInstruments[fixture.ids[1]]==='piano','Instrument choice leaves same-slot peer unchanged');
      check(afterOne.song.pixelPalette.find(slot=>slot.slotId==='square').instrument==='square','Per-color choice leaves shared slot default unchanged');
      equal(afterOne.rgba,before.rgba,'Instrument choice preserves original image bytes');
      equal(afterOne.events.map(e=>[e.pitch,e.startTick,e.durationTicks,e.velocity]),originalEvents.map(e=>[e.pitch,e.startTick,e.durationTicks,e.velocity]),'Instrument choice preserves projected note timing, pitch and velocity');
      check(afterOne.events.some(e=>e.colorId===fixture.ids[0]&&e.instrument==='violin')&&afterOne.events.some(e=>e.colorId===fixture.ids[1]&&e.instrument==='piano'),'Collected audio events resolve instrument by source color');
      check(afterOne.events.some(e=>e.startTick===1200&&e.colorId===fixture.ids[0]&&e.instrument==='violin')&&afterOne.events.some(e=>e.startTick===1200&&e.colorId===fixture.ids[1]&&e.instrument==='piano'),'Simultaneous same-column colors retain their independent instruments');

      // Same preset in distinct slots stays independent after changing one color.
      await selectColor(page,fixture.ids[2]); await openSound(page,'triangle');
      const beforeDistinct=await snapshot(page,fixture.id);
      check(beforeDistinct.song.pixelPalette.find(slot=>slot.slotId==='triangle').instrument==='triangle','Fixture has a distinct second mapped slot');
      await page.locator('#audio-instrument-group-tabs button[data-instrument-group="鍵盤"]').click(); await setInstrument(page,'piano');
      const afterDistinct=await snapshot(page,fixture.id);
      check(afterDistinct.song.colorInstruments[fixture.ids[2]]==='piano','Distinct-slot color receives its own override');
      check(afterDistinct.song.colorInstruments[fixture.ids[0]]==='violin','Changing a distinct-slot color leaves prior color override intact');
      check(afterDistinct.song.pixelPalette.find(slot=>slot.slotId==='triangle').instrument==='triangle','Distinct-slot override does not mutate slot default');

      // UI badge/icon label and active instrument selection should reflect the selected color override.
      await selectColor(page,fixture.ids[0]); await openSound(page,'violin');
      const activeGroupAfterReselect=await page.locator('#audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group');
      const pickerStateAfterReselect=await page.evaluate(colorId=>({selectedColor:[...document.querySelectorAll('#audio-tracks button[data-color-id]')].filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.colorId),paletteLabel:document.querySelector(`#audio-tracks button[data-color-id="${colorId}"]`)?.getAttribute('aria-label'),pressedInstruments:[...document.querySelectorAll('#audio-instrument-choices button[aria-pressed="true"]')].map(button=>button.dataset.instrument)}),fixture.ids[0]);
      check(activeGroupAfterReselect==='弦・打弦','Active category follows effective color instrument on reselect',{activeGroupAfterReselect,expectedInstrument:afterOne.song.colorInstruments[fixture.ids[0]],...pickerStateAfterReselect});
      check(await page.locator('#audio-instrument-choices button[data-instrument="violin"]').getAttribute('aria-pressed')==='true','Instrument picker marks effective color instrument');
      check((await page.locator(`#audio-tracks button[data-color-id="${fixture.ids[0]}"]`).getAttribute('aria-label')).includes('バイオリン'),'Palette icon accessible label follows effective color instrument');
      check((await page.locator(`#audio-tracks button[data-color-id="${fixture.ids[1]}"]`).getAttribute('aria-label')).includes('ピアノ'),'Same-slot palette peer keeps its own effective instrument label');

      const peersBeforeUnassigned=await snapshot(page,fixture.id);
      await selectColor(page,fixture.ids[7]); await openSound(page,'square');
      await page.locator('#audio-instrument-group-tabs button[data-instrument-group="鍵盤"]').click(); await setInstrument(page,'electric-piano');
      const afterUnassigned=await snapshot(page,fixture.id);
      check(afterUnassigned.link.colorToSlot[fixture.ids[7]]==='square'&&afterUnassigned.song.colorInstruments[fixture.ids[7]]==='electric-piano','Choosing an instrument for an unassigned color applies the choice to that color');
      equal(Object.fromEntries(fixture.ids.slice(0,7).map(id=>[id,afterUnassigned.song.colorInstruments?.[id]||null])),Object.fromEntries(fixture.ids.slice(0,7).map(id=>[id,peersBeforeUnassigned.song.colorInstruments?.[id]||null])),'Unassigned color choice leaves every other color sound unchanged');
      equal(afterUnassigned.events.filter(event=>event.colorId!==fixture.ids[7]).map(event=>[event.colorId,event.instrument,event.pitch,event.startTick,event.durationTicks,event.velocity]),peersBeforeUnassigned.events.filter(event=>event.colorId!==fixture.ids[7]).map(event=>[event.colorId,event.instrument,event.pitch,event.startTick,event.durationTicks,event.velocity]),'Unassigned color assignment leaves existing colors projected events unchanged');

      // Direct core color-edit API exercises HSL-style RGB renaming and conflicting-color rejection.
      const colorEdit=await page.evaluate(async ({id,oldId,targetId})=>{
        const store=await import('/js/creation/pxd-store.mjs'),images=await import('/js/creation/pxd-project.mjs');
        const audio=await import('/js/creation/pxd-draw-audio.mjs'),edit=await import('/js/creation/audio-color-edit.mjs');
        const project=await store.createPxdStore().load(id),image=await images.readPxdImage(project,'audio');
        const song=audio.readPxdAudioState(project),link=audio.readPxdAudioLink(project);
        const renamed=edit.replaceAudioSourceColor({image,link,song,colorId:oldId,hex:'#e75a4a'});
        let collisionRejected=false; try { edit.replaceAudioSourceColor({image,link,song,colorId:oldId,hex:`#${targetId.slice(5,11)}`}); } catch(error) { collisionRejected=/別の音に割り当て済み/.test(error.message); }
        return {oldOverride:song.colorInstruments[oldId],nextId:renamed.colorId,nextOverride:renamed.song.colorInstruments[renamed.colorId],oldStillExists:Object.hasOwn(renamed.link.colorToSlot,oldId),collisionRejected,rgbaChanged:renamed.image.rgba.some((value,index)=>value!==image.rgba[index])};
      },{id:fixture.id,oldId:fixture.ids[0],targetId:fixture.ids[1]});
      check(colorEdit.nextOverride==='violin'&&colorEdit.oldOverride==='violin','HSL rename transfers the selected color override');
      check(!colorEdit.oldStillExists&&colorEdit.rgbaChanged,'HSL rename updates the image color key and pixels');
      check(colorEdit.collisionRejected,'Renaming into a color with a different effective sound is rejected');

      // Persist and reload the final selected-color settings; notes and image remain stable.
      const preReload=await snapshot(page,fixture.id);
      await page.reload({waitUntil:'domcontentloaded'}); await ready(page);
      const afterReload=await snapshot(page,fixture.id);
      equal(afterReload.song.colorInstruments,preReload.song.colorInstruments,'Per-color overrides survive reload');
      equal(afterReload.rgba,preReload.rgba,'Reload preserves image RGBA');
      equal(afterReload.events.map(e=>[e.instrument,e.colorId,e.pitch,e.startTick,e.durationTicks,e.velocity]),preReload.events.map(e=>[e.instrument,e.colorId,e.pitch,e.startTick,e.durationTicks,e.velocity]),'Reload preserves effective event instruments and note data');
      const geometry=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,tracks:(()=>{const r=document.querySelector('#audio-tracks').getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};})()}));
      check(geometry.scrollWidth<=geometry.innerWidth+1&&geometry.tracks.x>=-1&&geometry.tracks.right<=geometry.innerWidth+1,'Palette remains within current viewport',geometry);
      if(viewport.width===390) await page.locator('#audio-tracks').screenshot({path:`${outDir}/audio-color-instruments-palette-390x844.png`});
      let animationCase=null;
      if(viewport.width===390) {
        const animationFixture=await seedAnimationProject(page);
        await page.goto(`${base}/audio/?${new URLSearchParams({pxd:animationFixture.id,pxdRevision:animationFixture.revision})}`,{waitUntil:'domcontentloaded'}); await ready(page);
        await selectColor(page,animationFixture.ids[1]); await openSound(page,'piano');
        check(await page.locator('#audio-instrument-group-tabs button[aria-pressed="true"]').getAttribute('data-instrument-group')==='鍵盤','Animation color selection opens its effective preset category');
        check(await page.locator('#audio-instrument-choices button[data-instrument="piano"]').getAttribute('aria-pressed')==='true','Animation picker marks selected color effective preset');
        await page.locator('#audio-instrument-group-tabs button[data-instrument-group="弦・打弦"]').click(); await setInstrument(page,'violin');
        const animationEvidence=await page.evaluate(async id=>{
          const stores=await import('/js/creation/tool-project-store.mjs'),pxd=await import('/js/creation/pxd-store.mjs');
          const pxdAnim=await import('/js/creation/pxd-animation.mjs'),audioPxd=await import('/js/creation/pxd-draw-audio.mjs');
          const animApi=await import('/js/creation/animation-core.mjs'),audio=await import('/js/creation/audio-core.mjs'),sequence=await import('/js/creation/audio-animation.mjs');
          let project=await pxd.createPxdStore().load(id),animation=await pxdAnim.readPxdAnimation(project,'audio');
          let song=audioPxd.readPxdAudioState(project),link=audioPxd.readPxdAudioLink(project);
          const pixelsBefore=animation.frames.map(frame=>Array.from(animApi.composeAnimationFrame(animation,frame.id).pixels));
          const rawNotes=song.tracks.flatMap(track=>track.clips.flatMap(clip=>clip.notes.filter(note=>note.sourceCell?.kind==='audio-animation').map(note=>({noteId:note.noteId,colorId:note.colorId,pitch:note.pitch,startTick:note.startTick,durationTicks:note.durationTicks,velocity:note.velocity,frameId:note.sourceCell.frameId,localX:note.sourceCell.localX,y:note.sourceCell.y}))));
          const eventsBefore=audio.collectAudioEvents(song,{joinAdjacent:true,outlineRuns:true}).filter(event=>event.sourceCell?.kind==='audio-animation').map(event=>({instrument:event.instrument,colorId:event.colorId,pitch:event.pitch,startTick:event.startTick,durationTicks:event.durationTicks,velocity:event.velocity,frameId:event.sourceCell.frameId}));
          const refreshed=sequence.prepareAudioAnimationImport(song,animation,{rowPitchMap:link.rowPitchMap,colorToSlot:link.colorToSlot});
          song=refreshed.song;
          const eventsRefreshed=audio.collectAudioEvents(song,{joinAdjacent:true,outlineRuns:true}).filter(event=>event.sourceCell?.kind==='audio-animation').map(event=>({instrument:event.instrument,colorId:event.colorId,pitch:event.pitch,startTick:event.startTick,durationTicks:event.durationTicks,velocity:event.velocity,frameId:event.sourceCell.frameId}));
          project=await audioPxd.writePxdAudioState(project,song,{link:{...link,projectionReady:true},animation});
          const saved=await stores.createToolProjectStore('audio').save(project,{expectedRevisionId:project.revisionId});
          const reloaded=await pxd.createPxdStore().load(id),reloadAnimation=await pxdAnim.readPxdAnimation(reloaded,'audio'),reloadSong=audioPxd.readPxdAudioState(reloaded);
          const pixelsAfter=reloadAnimation.frames.map(frame=>Array.from(animApi.composeAnimationFrame(reloadAnimation,frame.id).pixels));
          const eventsReloaded=audio.collectAudioEvents(reloadSong,{joinAdjacent:true,outlineRuns:true}).filter(event=>event.sourceCell?.kind==='audio-animation').map(event=>({instrument:event.instrument,colorId:event.colorId,pitch:event.pitch,startTick:event.startTick,durationTicks:event.durationTicks,velocity:event.velocity,frameId:event.sourceCell.frameId}));
          const reloadedRawNotes=reloadSong.tracks.flatMap(track=>track.clips.flatMap(clip=>clip.notes.filter(note=>note.sourceCell?.kind==='audio-animation').map(note=>({noteId:note.noteId,colorId:note.colorId,pitch:note.pitch,startTick:note.startTick,durationTicks:note.durationTicks,velocity:note.velocity,frameId:note.sourceCell.frameId,localX:note.sourceCell.localX,y:note.sourceCell.y}))));
          return {revision:saved.revisionId,pixelsBefore,pixelsAfter,rawNotes,reloadedRawNotes,eventsBefore,eventsRefreshed,eventsReloaded,overrides:reloadSong.colorInstruments};
        },animationFixture.id);
        check(animationEvidence.pixelsBefore.length===2&&JSON.stringify(animationEvidence.pixelsBefore)===JSON.stringify(animationEvidence.pixelsAfter),'Animation save/reload preserves both frame pixel maps');
        check(animationEvidence.eventsBefore.length===2&&animationEvidence.eventsBefore[0].colorId!==animationEvidence.eventsBefore[1].colorId,'Animation projects two distinct colors mapped to one slot');
        check(animationEvidence.eventsRefreshed.some(event=>event.colorId===animationFixture.ids[0]&&event.instrument==='organ')&&animationEvidence.eventsRefreshed.some(event=>event.colorId===animationFixture.ids[1]&&event.instrument==='violin'),'Animation reprojection refresh retains independent effective instruments after UI edit');
        equal(animationEvidence.eventsRefreshed.map(event=>[event.colorId,event.pitch,event.startTick,event.durationTicks,event.velocity,event.frameId]),animationEvidence.eventsBefore.map(event=>[event.colorId,event.pitch,event.startTick,event.durationTicks,event.velocity,event.frameId]),'Animation projection refresh preserves color/frame timing and velocity');
        equal(animationEvidence.eventsReloaded.map(event=>[event.instrument,event.colorId,event.pitch,event.startTick,event.durationTicks,event.velocity,event.frameId]),animationEvidence.eventsRefreshed.map(event=>[event.instrument,event.colorId,event.pitch,event.startTick,event.durationTicks,event.velocity,event.frameId]),'Animation voice assignments and event data survive save/reload');
        equal(animationEvidence.reloadedRawNotes.map(note=>[note.noteId,note.colorId,note.pitch,note.startTick,note.durationTicks,note.velocity,note.frameId,note.localX,note.y]),animationEvidence.rawNotes.map(note=>[note.noteId,note.colorId,note.pitch,note.startTick,note.durationTicks,note.velocity,note.frameId,note.localX,note.y]),'Animation projection refresh and reload preserve raw note geometry/timing');
        animationCase={id:animationFixture.id,frames:animationFixture.frames,events:animationEvidence.eventsReloaded,pixelsStable:true};
      }
      result.cases.push({viewport,fixture:{id:fixture.id,sourceColors:fixture.ids.length,mappedColors:7},sameSlot:{selected:fixture.ids[0],peer:fixture.ids[1],selectedAfter:afterOne.song.colorInstruments[fixture.ids[0]],peerAfter:afterOne.song.colorInstruments[fixture.ids[1]]},distinctSlot:{color:fixture.ids[2],instrument:afterDistinct.song.colorInstruments[fixture.ids[2]]},unassigned:{color:fixture.ids[7],slot:afterUnassigned.link.colorToSlot[fixture.ids[7]],instrument:afterUnassigned.song.colorInstruments[fixture.ids[7]]},colorEdit,animationCase,geometry});
      await context.close();
    }
  } finally { await browser.close(); }
  check(result.pageErrors.length===0,'No page errors',result.pageErrors);
  check(result.consoleErrors.length===0,'No browser console errors',result.consoleErrors);
  result.checks=result.checks;
  await writeFile(`${outDir}/audio-color-instruments-report.json`,JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
} catch(error) {
  result.failure=error.stack||String(error); result.checks=result.checks;
  await writeFile(`${outDir}/audio-color-instruments-report.json`,JSON.stringify(result,null,2)+'\n').catch(()=>{});
  process.stderr.write(`${JSON.stringify(result,null,2)}\n`); throw error;
}
