/** Browser acceptance for the fixed-pitch, retriggering iAUDIO drum voices. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only a local test server is allowed');
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const outDir = '/tmp/pixieed-audio-drums-20261005';
const viewports = [{name:'320x568',width:320,height:568},{name:'390x844',width:390,height:844},{name:'844x390',width:844,height:390},{name:'1280x800',width:1280,height:800}];
const drumIds = ['drum-kick','drum-snare','drum-hat-closed','drum-hat-open','drum-tom-low','drum-tom-high','drum-clap','drum-crash'];
const result = { base, viewports:[], signal:null, png:null, subjectiveListening:'UNTESTED', pageErrors:[], checks:0 };
let checks = 0;
function check(value, message) { checks += 1; assert.ok(value, message); }
function equal(actual, expected, message) { checks += 1; assert.deepEqual(actual, expected, message); }

async function seed(page) {
  return page.evaluate(async () => {
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs');
    const { importToolProject } = await import('/js/creation/tool-project-import.mjs');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const rgba = new Uint8Array(16 * 16 * 4);
    for (let y=0; y<16; y++) for (let x=0; x<16; x++) rgba.set([x<8?230:70,y<8?80:170,90,255],(y*16+x)*4);
    const input = await putPxdSharedImage(createPxdProject({manifest:{title:'drum browser verification'}}),{width:16,height:16,rgba});
    const project = await createToolProjectStore('audio').save(await importToolProject(input,'audio'),{expectedRevisionId:null});
    return {id:project.projectId,revision:project.revisionId,rgba:Array.from(rgba)};
  });
}
async function snapshot(page, id) {
  return page.evaluate(async projectId => {
    const project = await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(projectId);
    const { componentImageRole } = await import('/js/creation/project-components.mjs');
    const { readPxdImage } = await import('/js/creation/pxd-project.mjs');
    const { readPxdAudioState, readPxdAudioLink } = await import('/js/creation/pxd-draw-audio.mjs');
    const image = await readPxdImage(project,componentImageRole(project,project.manifest.toolProject.tool));
    return {revision:project.revisionId,rgba:Array.from(image.rgba),width:image.width,height:image.height,song:readPxdAudioState(project),link:readPxdAudioLink(project)};
  },id);
}
async function pageFor(viewport) {
  const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,hasTouch:true,isMobile:viewport.width<600});
  const page = await context.newPage();
  page.on('pageerror',error=>result.pageErrors.push({viewport:viewport.name,message:error.message}));
  await page.route('**/*',route=>{try{return new URL(route.request().url()).origin===origin?route.continue():route.abort();}catch{return route.abort();}});
  return {context,page};
}
async function openAudio(page, fixture) {
  await page.goto(`${base}/audio/?${new URLSearchParams({pxd:fixture.id,pxdRevision:fixture.revision})}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#main')&&!document.querySelector('#main').inert,null,{timeout:15000});
  await page.waitForSelector('#audio-pixel-canvas');
  await page.locator('#audio-current').click();
  await page.locator('#audio-color-editor-panel [data-dce-view="sound"]').click();
  await page.waitForFunction(()=>document.querySelector('#audio-palette-settings')?.open&&!document.querySelector('#audio-sound-editor-panel')?.hidden);
  await page.waitForSelector('#audio-instrument-group-tabs button[data-instrument-group]');
}

try {
  await mkdir(outDir,{recursive:true});
  const fixturePage = await pageFor(viewports[3]);
  try {
    await fixturePage.page.goto(`${base}/audio/`,{waitUntil:'domcontentloaded'});
    await fixturePage.page.waitForFunction(()=>document.querySelector('#main')&&!document.querySelector('#main').inert,null,{timeout:15000});
    const fixture = await seed(fixturePage.page);
    await openAudio(fixturePage.page,fixture);
    const baseline = await snapshot(fixturePage.page,fixture.id);
    const imagePng = await fixturePage.page.evaluate(async () => {
      const { exportAudioImage } = await import('/js/creation/audio-export.mjs?drum-harness=1');
      const project = await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(new URLSearchParams(location.search).get('pxd'));
      const { readPxdImage } = await import('/js/creation/pxd-project.mjs');
      const { readPxdAudioState } = await import('/js/creation/pxd-draw-audio.mjs');
      const { componentImageRole } = await import('/js/creation/project-components.mjs');
      const image=await readPxdImage(project,componentImageRole(project,project.manifest.toolProject.tool));
      const out=await exportAudioImage(readPxdAudioState(project),{image});
      const bitmap=await createImageBitmap(out.blob);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const samples=[0,Math.floor(bitmap.width/2),bitmap.width-1].map(x=>Array.from(pixels.subarray((Math.floor(bitmap.height/2)*bitmap.width+x)*4,(Math.floor(bitmap.height/2)*bitmap.width+x)*4+4)));
      bitmap.close();return {type:out.blob.type,size:out.blob.size,width:out.width,height:out.height,samples};
    });
    check(imagePng.type==='image/png'&&imagePng.size>100,'PNG export produces a non-empty PNG');
    result.png={mime:imagePng.type,bytes:imagePng.size,width:imagePng.width,height:imagePng.height,samples:imagePng.samples};
    equal(imagePng.samples,[[230,170,90,255],[70,170,90,255],[70,170,90,255]],'PNG export preserves sampled source-image colors exactly');
    for (const viewport of viewports) {
      const {context,page}=await pageFor(viewport);
      try {
        await page.goto(`${base}/audio/`,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('#main')&&!document.querySelector('#main').inert,null,{timeout:15000});
        const viewportFixture=await seed(page);
        await openAudio(page,viewportFixture);
        const viewportBaseline=await snapshot(page,viewportFixture.id);
        await page.locator('#audio-instrument-group-tabs button[data-instrument-group="ドラム"]').click();
        await page.waitForFunction(()=>document.querySelector('#audio-instrument-choices')?.dataset.group==='ドラム');
        const inventory=await page.evaluate(() => ({
          noteHidden:document.querySelector('#audio-drum-note')?.hidden,
          choices:[...document.querySelectorAll('#audio-instrument-choices button[data-instrument]')].map(b=>b.dataset.instrument),
          viewport:{width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth},
          panel:(()=>{const n=document.querySelector('.audio-palette-settings__body'),r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,top:r.top,bottom:r.bottom}})()
        }));
        equal(inventory.choices,drumIds,`${viewport.name}: all eight drum presets are selectable`);
        check(inventory.noteHidden===false,`${viewport.name}: drum behavior note appears for drum category`);
        check(inventory.panel.left>=-1&&inventory.panel.right<=viewport.width+1&&inventory.panel.scrollWidth<=inventory.panel.clientWidth+1&&inventory.viewport.docWidth<=viewport.width+1,`${viewport.name}: sound panel and document fit viewport: ${JSON.stringify(inventory)}`);
        for(const id of drumIds) {
          const button=page.locator(`#audio-instrument-choices button[data-instrument="${id}"]`);
          await button.click();
          check(await button.getAttribute('aria-pressed')==='true',`${viewport.name}: ${id} becomes selected and previewed`);
        }
        await page.waitForFunction(()=>document.querySelector('#project-open')?.dataset.state==='saved',null,{timeout:15000});
        const after=await snapshot(page,viewportFixture.id);
        equal(after.rgba,viewportBaseline.rgba,`${viewport.name}: changing instruments leaves source image pixels intact`);
        check(after.width===viewportBaseline.width&&after.height===viewportBaseline.height,`${viewport.name}: source image dimensions remain intact`);
        result.viewports.push({name:viewport.name,drumChoices:inventory.choices.length,noteVisible:!inventory.noteHidden,panel:inventory.panel,documentWidth:inventory.viewport.docWidth,selectedAll:true,pixelsPreserved:after.rgba.every((v,i)=>v===viewportBaseline.rgba[i])});
      } finally { await context.close(); }
    }

    const signals = await fixturePage.page.evaluate(async ids => {
      const core=await import('/js/creation/audio-core.mjs?drum-harness=signal');
      const { renderAudioWav }=await import('/js/creation/audio-export.mjs?drum-harness=signal');
      const { createAudioSong,setAudioPixelPalette,setAudioPixel,collectAudioEvents,validateAudioSong }=core;
      const mk=(instrument='drum-kick')=>{
        let song=createAudioSong({songId:`drum-${instrument}`,tempo:120});
        song=setAudioPixelPalette(song,{slotId:'square',instrument});
        song=setAudioPixelPalette(song,{slotId:'sawtooth',instrument});
        song=setAudioPixelPalette(song,{slotId:'triangle',instrument:'triangle'});
        return song;
      };
      const note=(song,trackId,pitch,tick,noteId,durationTicks=120)=>{
        song=setAudioPixel(song,{trackId,pitch,startTick:tick,noteId,active:true,velocity:100});
        const track=song.tracks.find(t=>t.trackId===trackId),clip=track.clips.find(c=>c.notes.some(n=>n.noteId===noteId));
        clip.notes=clip.notes.map(n=>n.noteId===noteId?{...n,durationTicks}:n);
        return validateAudioSong(song);
      };
      let song=mk();
      // Same-color vertical chord collapses to one one-shot; each later column is a fresh event.
      song=note(song,'track-square',84,0,'kick-a'); song=note(song,'track-square',48,0,'kick-b'); song=note(song,'track-square',72,120,'kick-next');
      // A different color at the same instant and a pitched melody remain independently playable.
      song=note(song,'track-sawtooth',79,0,'kick-other-color'); song=note(song,'track-triangle',67,0,'melody');
      const all=collectAudioEvents(song); const joined=collectAudioEvents(song,{joinAdjacent:true,outlineRuns:true});
      const drum=joined.filter(e=>e.instrument==='drum-kick');
      const sameTick=drum.filter(e=>e.startTick===0);
      const sameColorRaw=song.tracks.find(t=>t.trackId==='track-square').clips.flatMap(c=>c.notes).filter(n=>n.startTick===0).length;
      const sameColorJoined=sameTick.filter(e=>e.colorId==='slot-square').length;
      const otherColorJoined=sameTick.filter(e=>e.colorId==='slot-sawtooth').length;
      const repeated=drum.filter(e=>e.startTick===120);
      if(sameColorRaw!==2||sameColorJoined!==1||otherColorJoined!==1||repeated.length!==1||joined.filter(e=>e.instrument==='triangle'&&e.pitch===67).length!==1) throw new Error(`event projection mismatch: ${JSON.stringify(joined)}`);
      const baseSong=mk(); let a=note(baseSong,'track-square',84,0,'fixed-a',30);
      let b=note(mk(),'track-square',48,0,'fixed-b',180);
      const [wa,wb]=await Promise.all([renderAudioWav(a,{loops:1,sampleRate:8000}),renderAudioWav(b,{loops:1,sampleRate:8000})]);
      const toSamples=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer);const channels=v.getUint16(22,true),bits=v.getUint16(34,true),rate=v.getUint32(24,true),frames=v.getUint32(40,true)/(channels*bits/8);const pcm=new Int16Array(frames);for(let i=0;i<frames;i++)pcm[i]=v.getInt16(44+i*channels*bits/8,true);return {pcm,sampleRate:rate,channels,bits,duration:frames/rate,bytes:bytes.length};};
      const sa=await toSamples(wa.blob),sb=await toSamples(wb.blob);
      if(sa.pcm.length!==sb.pcm.length) throw new Error('fixed pitch/gate test WAV lengths differ');
      let identical=true,peak=0,nonzero=0; for(let i=0;i<sa.pcm.length;i++){if(sa.pcm[i]!==sb.pcm[i])identical=false;peak=Math.max(peak,Math.abs(sa.pcm[i]));if(sa.pcm[i])nonzero++;}
      const profile=core.AUDIO_INSTRUMENTS.filter(i=>ids.includes(i.id)).map(({id,drum})=>({id,frequency:drum?.frequency,duration:drum?.duration,chokeGroup:drum?.chokeGroup||null}));
      const metrics={eventCounts:{raw:all.length,projected:joined.length,sameColorSameColumnRaw:sameColorRaw,sameColorSameColumnDedup:sameColorJoined,differentColorSameColumn:otherColorJoined,adjacentRetrigger:repeated.length,melodyRetained:joined.some(e=>e.instrument==='triangle'&&e.pitch===67)},fixedPitchGateIndependent:identical,finite:true,peakPcm:peak,peakNormalized:peak/32768,nonzeroPcmSamples:nonzero,wav:{sampleRate:sa.sampleRate,channels:sa.channels,bits:sa.bits,durationSeconds:sa.duration,bytes:sa.bytes},presets:profile};
      const previewSegments=[];const previewRate=22050;
      for(const id of ids){let one=mk(id);one=note(one,'track-square',84,0,`${id}-one`,30);let two=mk(id);two=note(two,'track-square',48,0,`${id}-two`,180);const [renderedA,renderedB]=await Promise.all([renderAudioWav(one,{loops:1,sampleRate:previewRate}),renderAudioWav(two,{loops:1,sampleRate:previewRate})]);const [sample,variant]=await Promise.all([toSamples(renderedA.blob),toSamples(renderedB.blob)]);if(sample.pcm.every(v=>v===0))throw new Error(`${id}: silent WAV`);if(sample.pcm.some(v=>!Number.isFinite(v)))throw new Error(`${id}: non-finite PCM`);if(sample.pcm.some(v=>Math.abs(v)>=32767))throw new Error(`${id}: clipped PCM`);const profile=metrics.presets.find(p=>p.id===id);const pitchDuration=profile.duration+.035;if(sample.duration<2+profile.duration-0.025)throw new Error(`${id}: exported tail is shorter than preset duration (${sample.duration}s vs ${profile.duration}s)`);let maxAbsPcmDifference=0;const activeFrames=Math.min(Math.ceil(pitchDuration*previewRate),sample.pcm.length);let energyA=0,energyB=0;for(let i=0;i<sample.pcm.length;i++){maxAbsPcmDifference=Math.max(maxAbsPcmDifference,Math.abs(sample.pcm[i]-variant.pcm[i]));if(i<activeFrames){energyA+=sample.pcm[i]**2;energyB+=variant.pcm[i]**2;}}const rmsA=Math.sqrt(energyA/activeFrames),rmsB=Math.sqrt(energyB/activeFrames),relativeRmsDifference=Math.abs(rmsA-rmsB)/Math.max(1,rmsA);const presetInvariant=maxAbsPcmDifference<=2&&relativeRmsDifference<1e-4;profile.render={durationSeconds:sample.duration,peak:Math.max(...sample.pcm.slice(0,Math.min(3000,sample.pcm.length)).map(Math.abs))/32768,nonzeroSamples:sample.pcm.reduce((n,v)=>n+(v!==0),0),pitchGateInvariant:presetInvariant,maxAbsPcmDifference,relativeRmsDifference,rmsA,rmsB};previewSegments.push({id,pcm:sample.pcm.slice(0,Math.ceil(pitchDuration*previewRate)),channels:sample.channels});}
      let late=mk('drum-crash');late=note(late,'track-square',84,1800,'late-crash');const lateRender=await renderAudioWav(late,{loops:1,sampleRate:8000});const lateSamples=await toSamples(lateRender.blob);const lateOnset=.035+1800*60/120/480;const windowRms=(from,to)=>{const part=lateSamples.pcm.slice(Math.floor(from*8000),Math.floor(to*8000));return Math.sqrt(part.reduce((sum,x)=>sum+x*x,0)/Math.max(1,part.length))/32768;};const crashDuration=metrics.presets.find(p=>p.id==='drum-crash').duration;metrics.crashTail={onsetSeconds:lateOnset,durationSeconds:crashDuration,activeWindowSeconds:[2.15,2.35],activeWindowRms:windowRms(2.15,2.35),postEndWindowSeconds:[lateOnset+crashDuration+.03,lateSamples.duration-.01],postEndRms:windowRms(lateOnset+crashDuration+.03,lateSamples.duration-.01)};if(metrics.crashTail.activeWindowRms<1e-6||metrics.crashTail.postEndRms>1e-6)throw new Error(`late crash tail window does not match expected emitted tail: ${JSON.stringify(metrics.crashTail)}`);
      const silence=Math.ceil(.35*previewRate),frames=previewSegments.reduce((sum,s)=>sum+s.pcm.length,0)+silence*(previewSegments.length-1),left=new Float32Array(frames),right=new Float32Array(frames);let cursor=0;for(const segment of previewSegments){for(let i=0;i<segment.pcm.length;i++){const sample=segment.pcm[i]/32768;left[cursor+i]=sample;right[cursor+i]=sample;}cursor+=segment.pcm.length+silence;}
      const wavBytes=(await import('/js/creation/audio-export.mjs?drum-preview-encode=1')).encodeWav({numberOfChannels:2,sampleRate:previewRate,length:frames,getChannelData(channel){return channel===0?left:right;}});metrics.previewWav={bytes:wavBytes.length,sampleRate:previewRate,durationSeconds:frames/previewRate};metrics.previewWavBytes=Array.from(wavBytes);
      // Inspect decoded offline rendering for a long open hat interrupted by a closed hat.
      let open=mk('drum-hat-open');open=note(open,'track-square',84,0,'open-long');
      let choked=open;
      choked=setAudioPixelPalette(choked,{slotId:'sawtooth',instrument:'drum-hat-closed'});
      choked=note(choked,'track-sawtooth',79,120,'closed-hat');
      const solo=await renderAudioWav(open,{loops:1,sampleRate:8000});const together=await renderAudioWav(choked,{loops:1,sampleRate:8000});
      const os=await toSamples(solo.blob),cs=await toSamples(together.blob);const start=Math.floor(.42*8000),end=Math.floor(.50*8000);
      const rms=(arr)=>Math.sqrt(arr.slice(start,end).reduce((sum,x)=>sum+x*x,0)/Math.max(1,end-start))/32768;
      metrics.hatChoke={openSoloTailRms:rms(os.pcm),openPlusClosedTailRms:rms(cs.pcm),windowSeconds:[start/8000,end/8000]};
      return metrics;
    },drumIds);
    const previewWavBytes=Uint8Array.from(signals.previewWavBytes);delete signals.previewWavBytes;
    await writeFile(`${outDir}/audio-drums-8-voice-preview.wav`,previewWavBytes);
    result.signal=signals;
    check(signals.eventCounts.sameColorSameColumnRaw===2&&signals.eventCounts.sameColorSameColumnDedup===1&&signals.eventCounts.differentColorSameColumn===1&&signals.eventCounts.adjacentRetrigger===1,'vertical dedup preserves same-tick colors and next-column retrigger');
    check(signals.eventCounts.melodyRetained,'drum rendering preserves a simultaneous pitched melody');
    check(signals.fixedPitchGateIndependent,'same drum WAV is identical across pitch and gate variants');
    check(signals.peakNormalized<=1&&signals.nonzeroPcmSamples>0,'drum WAV is nonzero and not clipped');
    check(signals.presets.every(p=>p.render.pitchGateInvariant),`all eight presets remain pitch/gate invariant within quantization tolerance: ${JSON.stringify(signals.presets.map(p=>({id:p.id,maxAbsPcmDifference:p.render.maxAbsPcmDifference,relativeRmsDifference:p.render.relativeRmsDifference})))}`);
    check(signals.hatChoke.openPlusClosedTailRms<signals.hatChoke.openSoloTailRms*.95,'closed hat chokes open-hat tail');
    check(signals.crashTail.activeWindowRms>1e-6&&signals.crashTail.postEndRms<=1e-6,'late crash onset is audible in rendered tail and becomes silent after its duration');
    result.checks=checks;
    await writeFile(`${outDir}/audio-drums-browser-results.json`,JSON.stringify(result,null,2));
    await fixturePage.page.screenshot({path:`${outDir}/audio-drums-1280x800.png`});
    console.log(JSON.stringify(result,null,2));
  } finally { await fixturePage.context.close(); }
} catch (error) {
  result.checks=checks;result.failure={name:error.name,message:error.message,stack:error.stack};
  await mkdir(outDir,{recursive:true});await writeFile(`${outDir}/audio-drums-browser-results.json`,JSON.stringify(result,null,2));
  console.error(JSON.stringify(result,null,2));process.exitCode=1;
} finally { await browser.close(); }
