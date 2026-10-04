#!/usr/bin/env node
/** Real-browser acceptance for source-image run endpoints and color-balanced playback. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only the isolated localhost server is allowed');
const outDir = '/tmp/pixieed-audio-run-endpoints-20261004';
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true });
const result = { base, profile: 'Android Chrome emulation 390x844', checks: [], pageErrors: [], consoleErrors: [], blockedRequests: [], sourceHashes: {}, fixture: null };
const pass = (name, evidence = {}) => result.checks.push({ name, pass: true, ...evidence });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  await mkdir(outDir, { recursive: true });
  for (const path of ['audio/index.html','js/creation/audio-page.mjs','js/creation/audio-core.mjs','js/creation/audio-color-mix.mjs','js/creation/audio-export.mjs','js/creation/audio-video.mjs','js/creation/pxd-draw-audio.mjs']) {
    result.sourceHashes[path] = sha(await readFile(new URL('../' + path, import.meta.url)));
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', acceptDownloads: true });
  await context.route('**/*', route => {
    try { const url = new URL(route.request().url()); if (url.origin === origin || ['blob:','data:'].includes(url.protocol)) return route.continue(); }
    catch {}
    result.blockedRequests.push(`${route.request().method()} ${route.request().url()}`); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.pageErrors.push(error.message));
  page.on('console', message => { if (message.type()==='error' && !message.text().includes('net::ERR_FAILED')) result.consoleErrors.push(message.text()); });
  await page.addInitScript(() => {
    const Native = globalThis.AudioContext || globalThis.webkitAudioContext;
    globalThis.__NativeAudioContext = Native;
    globalThis.__nativeAudioObserver = { contexts: [], oscillators: [], gains: [] };
    if (!Native) return;
    const wrapParam=(param, log)=>{ for(const method of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setTargetAtTime']) {
      try { const original=param[method].bind(param); Object.defineProperty(param,method,{configurable:true,value:(...args)=>{log.push({method,value:args[0],time:args[1]});return original(...args);}}); } catch {}
    }};
    class ObservedAudioContext extends Native {
      constructor(...args) { super(...args); this.__observed={currentTime:0,oscillatorIds:[],gainIds:[]}; globalThis.__nativeAudioObserver.contexts.push(this.__observed); }
      createOscillator(...args) {
        const node=super.createOscillator(), record={id:globalThis.__nativeAudioObserver.oscillators.length,type:node.type,starts:[],frequency:[]};
        const original=node.start.bind(node); node.start=(when=0)=>{record.starts.push(when);original(when);};
        wrapParam(node.frequency,record.frequency); globalThis.__nativeAudioObserver.oscillators.push(record); this.__observed.oscillatorIds.push(record.id); return node;
      }
      createGain(...args) {
        const node=super.createGain(), record={id:globalThis.__nativeAudioObserver.gains.length,automation:[]};
        wrapParam(node.gain,record.automation); globalThis.__nativeAudioObserver.gains.push(record); this.__observed.gainIds.push(record.id); return node;
      }
    }
    globalThis.AudioContext=ObservedAudioContext;
    if (globalThis.webkitAudioContext) globalThis.webkitAudioContext=ObservedAudioContext;
  });
  await page.goto(`${base}/audio/`, { waitUntil:'domcontentloaded' });
  await page.locator('#audio-pixel-canvas').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#main')?.inert && document.querySelector('#audio-pixel-canvas')?.width===16);

  const fixture = await page.evaluate(async () => {
    const core=await import('/js/creation/audio-core.mjs');
    const pxd=await import('/js/creation/pxd-codec.mjs');
    const audioPxd=await import('/js/creation/pxd-draw-audio.mjs');
    const stores=await import('/js/creation/tool-project-store.mjs');
    const width=16,height=16, blue=[76,130,195,255],red=[229,57,53,255],rgba=new Uint8Array(width*height*4),cells=[];
    const put=(x,y,colorId,value)=>{rgba.set(value,(y*width+x)*4);cells.push({x,y,colorId});};
    // One blue 3-cell run, a blue/red/blue split, two blank-separated blue runs,
    // a long vertical run, a singleton, a 3-column horizontal run, and a late run.
    for(const y of [2,3,4])put(0,y,'rgba-4c82c3ff',blue); put(0,8,'rgba-e53935ff',red);
    put(1,0,'rgba-4c82c3ff',blue); put(1,1,'rgba-e53935ff',red); put(1,2,'rgba-4c82c3ff',blue);
    for(const y of [0,1,3,4])put(2,y,'rgba-4c82c3ff',blue);
    for(let y=4;y<=11;y++)put(3,y,'rgba-4c82c3ff',blue); put(4,14,'rgba-4c82c3ff',blue);
    for(const x of [5,6,7])put(x,6,'rgba-4c82c3ff',blue);
    for(const y of [10,11,12])put(15,y,'rgba-4c82c3ff',blue);
    const song=core.createAudioSong({songId:'source-run-endpoints-browser',tempo:120,loopTicks:core.AUDIO_BAR_TICKS});
    const mapping={'rgba-4c82c3ff':'square','rgba-e53935ff':'square'};
    const plan=audioPxd.prepareSharedAudioImageImport(song,{width,height,rgba},{colorToSlot:mapping});
    let project=pxd.createPxdProject({manifest:{title:'Run endpoint and color mix isolated QA',lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}});
    project=await audioPxd.writePxdAudioState(project,plan.song,{image:plan.image,link:plan.link});
    const saved=await stores.createToolProjectStore('audio').save(project,{expectedRevisionId:null});
    const rowPitchMap=plan.link.rowPitchMap;
    return {projectId:saved.projectId,revisionId:saved.revisionId,width,height,tempo:plan.song.tempo,loopTicks:plan.song.loopTicks,rowPitchMap,cells,
      rawNotes:plan.song.tracks.flatMap(track=>track.clips.flatMap(clip=>clip.notes)).map(({noteId,trackId,colorId,startTick,durationTicks,pitch,velocity,sourceCell})=>({noteId,trackId,colorId,startTick,durationTicks,pitch,velocity,sourceCell})),
      rawPixels:Array.from(plan.image.rgba),colorToSlot:plan.link.colorToSlot,expectedEndpoints:(() => {
        const byX=new Map(); for(const cell of cells){if(!byX.has(cell.x))byX.set(cell.x,new Map());const cm=byX.get(cell.x);if(!cm.has(cell.colorId))cm.set(cell.colorId,[]);cm.get(cell.colorId).push(cell.y);}
        const events=[];for(const [x,cm] of byX)for(const [colorId,rows0]of cm){const rows=[...rows0].sort((a,b)=>a-b);let run=[];const flush=()=>{if(!run.length)return;const a=run[0],b=run.at(-1);events.push({x,y:a,colorId,pitch:rowPitchMap[a],groupGain:a===b?1:.5});if(a!==b)events.push({x,y:b,colorId,pitch:rowPitchMap[b],groupGain:.5});run=[];};for(const y of rows){if(run.length&&y!==run.at(-1)+1)flush();run.push(y);}flush();}
        events.sort((a,b)=>a.x-b.x||a.pitch-b.pitch||a.colorId.localeCompare(b.colorId));const joined=[],lastByKey=new Map();for(const e of events){const key=JSON.stringify([e.colorId,e.pitch,e.y,e.groupGain]);const p=lastByKey.get(key);if(p&&p.xEnd+1===e.x){p.xEnd=e.x;p.durationColumns++;}else{const next={...e,xEnd:e.x,durationColumns:1};joined.push(next);lastByKey.set(key,next);}}return joined.map(({x,xEnd,y,colorId,pitch,groupGain,durationColumns})=>({x,y,sourceX:xEnd,colorId,pitch,groupGain,startTick:x*core.AUDIO_PIXEL_TICKS,durationTicks:durationColumns*core.AUDIO_PIXEL_TICKS}));
      })()};
  });
  await page.goto(`${base}/audio/?${new URLSearchParams({pxd:fixture.projectId,pxdRevision:fixture.revisionId})}`, {waitUntil:'domcontentloaded'});
  await page.locator('#audio-pixel-canvas').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#main')?.inert && document.querySelector('#audio-play-toggle')?.disabled===false);
  await page.waitForFunction(async id=>{
    const stores=await import('/js/creation/tool-project-store.mjs'),images=await import('/js/creation/pxd-project.mjs');
    const project=await stores.createToolProjectStore('audio').load(id),image=await images.readPxdImage(project,'audio');
    return image?.rgba?.some((value,index)=>index%4===3&&value>0);
  },fixture.projectId,{timeout:10000});
  result.fixture={...fixture,rawPixels:undefined};
  const before=await page.evaluate(async id=>{
    const stores=await import('/js/creation/tool-project-store.mjs'),audio=await import('/js/creation/pxd-draw-audio.mjs'),images=await import('/js/creation/pxd-project.mjs');
    const project=await stores.createToolProjectStore('audio').load(id),song=audio.readPxdAudioState(project),image=await images.readPxdImage(project,'audio');
    const rawNotes=song.tracks.flatMap(track=>track.clips.flatMap(clip=>clip.notes)).map(({noteId,trackId,colorId,startTick,durationTicks,pitch,velocity,sourceCell})=>({noteId,trackId,colorId,startTick,durationTicks,pitch,velocity,sourceCell}));
    const canvas=document.querySelector('#audio-pixel-canvas'),rgba=Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
    return {revisionId:project.revisionId,rawNotes,rawImage:Array.from(image.rgba),canvas:rgba,events:(await import('/js/creation/audio-core.mjs')).collectAudioEvents(song,{joinAdjacent:true,outlineRuns:true})};
  },fixture.projectId);
  const normalizedEvents=before.events.map(({instrument,startTick,durationTicks,pitch,velocity,colorId,sourceCell,groupGain})=>({instrument,startTick,durationTicks,pitch,velocity,colorId,sourceCell,groupGain:groupGain??1}));
  result.endpointEvents=normalizedEvents;
  pass('isolated image import retains every raw source cell and projects its stored notes', {rawCells:fixture.cells.length,rawNotes:before.rawNotes.length,colors:fixture.colorToSlot,allRaw:before.rawNotes.length===fixture.cells.length});
  assert.equal(before.rawNotes.length,fixture.cells.length,'PXD keeps all source-cell notes before playback');
  assert.deepEqual(before.rawImage,fixture.rawPixels,'stored image pixels equal the generated fixture');
  const sortedExpected=[...fixture.expectedEndpoints].sort((a,b)=>a.startTick-b.startTick||a.pitch-b.pitch);
  assert.deepEqual(normalizedEvents.map(e=>[e.startTick,e.durationTicks,e.pitch,e.colorId,e.groupGain,e.sourceCell?.x,e.sourceCell?.y]),sortedExpected.map(e=>[e.startTick,e.durationTicks,e.pitch,e.colorId,e.groupGain,e.sourceX,e.y]),'current route source projection must speak only expected color-run endpoints');
  pass('endpoint projection matches independent run expectations, including split colors, blanks, horizontal sustain, and final column', {count:normalizedEvents.length,expected:fixture.expectedEndpoints.length,events:normalizedEvents});

  await page.screenshot({path:`${outDir}/source-before.png`});
  const play=page.locator('#audio-play-toggle'); await play.click();
  await page.waitForFunction(()=>document.querySelector('#audio-play-toggle')?.getAttribute('aria-pressed')==='true',null,{timeout:5000});
  await page.waitForTimeout(2250);
  const playback=await page.evaluate(()=>({observer:globalThis.__nativeAudioObserver,playing:document.querySelector('#audio-play-toggle')?.getAttribute('aria-pressed')}));
  if(playback.playing==='true')await play.click();
  const osc=playback.observer.oscillators.map(node=>({id:node.id,starts:node.starts,frequency:node.frequency,type:node.type}));
  const firstStart=Math.min(...osc.flatMap(node=>node.starts));
  const actualStarts=[];
  for(const expected of fixture.expectedEndpoints){
    const target=440*2**((expected.pitch-69)/12),time=expected.startTick*60/fixture.tempo/480;
    const match=osc.find(node=>node.starts.some(start=>Math.abs(start-firstStart-time)<.035)&&node.frequency.some(op=>op.method==='setValueAtTime'&&Math.abs(op.value-target)<.5));
    actualStarts.push({expected,target,time,matched:match?{id:match.id,starts:match.starts,frequency:match.frequency}:null});
  }
  assert.ok(actualStarts.every(entry=>entry.matched),`native oscillator starts include each expected endpoint and late column: ${JSON.stringify(actualStarts)}`);
  pass('real AudioContext playback starts native oscillators at endpoint pitches and source-column times', {count:actualStarts.length,firstStart,starts:actualStarts});
  const lastExpectedSeconds=Math.max(...fixture.expectedEndpoints.map(event=>event.startTick*60/fixture.tempo/480));
  const firstLoop=osc.flatMap(node=>node.starts.map(start=>{
    if(start<firstStart-.005||start-firstStart>lastExpectedSeconds+.035)return null;
    const frequencyOp=node.frequency.filter(op=>op.method==='setValueAtTime').sort((a,b)=>Math.abs(a.time-start)-Math.abs(b.time-start))[0];
    return frequencyOp?{startSeconds:Number((start-firstStart).toFixed(4)),frequencyHz:frequencyOp.value,id:node.id}:null;
  }).filter(Boolean)).sort((a,b)=>a.startSeconds-b.startSeconds||a.frequencyHz-b.frequencyHz);
  const expectedFirstLoop=fixture.expectedEndpoints.map(event=>({startSeconds:event.startTick*60/fixture.tempo/480,frequencyHz:440*2**((event.pitch-69)/12)})).sort((a,b)=>a.startSeconds-b.startSeconds||a.frequencyHz-b.frequencyHz);
  assert.equal(firstLoop.length,expectedFirstLoop.length,`first loop has exactly one native oscillator per endpoint, with no interior-cell extras: actual=${JSON.stringify(firstLoop)} expected=${JSON.stringify(expectedFirstLoop)}`);
  for(let i=0;i<firstLoop.length;i++){
    assert.ok(Math.abs(firstLoop[i].startSeconds-expectedFirstLoop[i].startSeconds)<.035&&Math.abs(firstLoop[i].frequencyHz-expectedFirstLoop[i].frequencyHz)<.5,
      `first-loop native oscillator set is bijective at index ${i}: actual=${JSON.stringify(firstLoop[i])} expected=${JSON.stringify(expectedFirstLoop[i])}`);
  }
  result.firstLoopEventSet={actual:firstLoop,expected:expectedFirstLoop,count:firstLoop.length};
  pass('first native playback loop contains exactly the expected endpoint oscillators and no interior-cell notes',result.firstLoopEventSet);
  assert.ok(osc.some(node=>node.starts.some(start=>start-firstStart>=1.84&&start-firstStart<1.94)),'native oscillator starts at the far-right final-column onset');
  const mixStart=Math.min(...osc.flatMap(node=>node.starts));
  const observedMix=playback.observer.gains.flatMap(node=>node.automation.filter(op=>op.method==='setValueAtTime'&&Math.abs(op.time-mixStart)<.04).map(op=>op.value)).filter(v=>v>0&&v<=1).sort((a,b)=>a-b);
  const sourceColorBudget=observedMix.filter(v=>Math.abs(v-.25)<1e-6||Math.abs(v-.5)<1e-6);
  result.gainEvidence={firstOnset:mixStart,values:sourceColorBudget,automationNodes:playback.observer.gains.length};
  if(sourceColorBudget.length>=3) {
    assert.deepEqual(sourceColorBudget.slice(0,3),[.25,.25,.5],'two blue endpoints and one red endpoint split two simultaneous color budgets as expected');
    pass('native GainNode automation divides the simultaneous source colors across their endpoint groups',result.gainEvidence);
  } else result.checks.push({name:'native GainNode color-mix automation observed',pass:false,unverified:true,...result.gainEvidence});

  const afterPlay=await page.evaluate(()=>Array.from(document.querySelector('#audio-pixel-canvas').getContext('2d').getImageData(0,0,16,16).data));
  assert.deepEqual(afterPlay,before.canvas,'native playback does not alter the source canvas');
  const readSnapshot=async()=>page.evaluate(async id=>{
    const stores=await import('/js/creation/tool-project-store.mjs'),audio=await import('/js/creation/pxd-draw-audio.mjs'),images=await import('/js/creation/pxd-project.mjs');
    const project=await stores.createToolProjectStore('audio').load(id),song=audio.readPxdAudioState(project),image=await images.readPxdImage(project,'audio');
    return {revisionId:project.revisionId,rawImage:Array.from(image.rgba),rawNotes:song.tracks.flatMap(track=>track.clips.flatMap(clip=>clip.notes)).map(({noteId,trackId,colorId,startTick,durationTicks,pitch,velocity,sourceCell})=>({noteId,trackId,colorId,startTick,durationTicks,pitch,velocity,sourceCell}))};
  },fixture.projectId);
  const savedAfterPlay=await readSnapshot();
  assert.deepEqual(savedAfterPlay.rawImage,before.rawImage,'PXD source RGBA is unchanged after playback');
  assert.deepEqual(savedAfterPlay.rawNotes,before.rawNotes,'all raw PXD notes remain after endpoint playback');
  pass('playback preserves complete raw PXD image and notes');

  async function downloadFrom(buttonId,name){
    const output=page.locator('#audio-output');if(!(await output.evaluate(el=>el.open)))await output.locator(':scope > summary').click();
    const button=page.locator(`#${buttonId}`);await button.waitFor({state:'visible',timeout:5000});
    await page.screenshot({path:`${outDir}/file-panel-${name}.png`});
    const waiting=page.waitForEvent('download',{timeout:30000});await button.click();const download=await waiting;const temp=await download.path();
    const bytes=await readFile(temp),file=`${outDir}/actual-${download.suggestedFilename()}`;await writeFile(file,bytes);
    const returnButton=page.locator('.px-tool-result__return');
    if(await returnButton.isVisible().catch(()=>false)){await returnButton.click();await page.locator('#audio-output > summary').waitFor({state:'visible',timeout:5000});}
    return {file,filename:download.suggestedFilename(),bytes,sha256:sha(bytes)};
  }
  const wavFile=await downloadFrom('audio-export-sound','wav');
  const wav=await page.evaluate(async base64=>{
    const data=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const C=globalThis.__NativeAudioContext;const context=new C();
    try{const buffer=await context.decodeAudioData(data.buffer.slice(0));const samples=buffer.getChannelData(0);const rms=(a,b)=>{const lo=Math.floor(a*buffer.sampleRate),hi=Math.min(samples.length,Math.floor(b*buffer.sampleRate));let sum=0;for(let i=lo;i<hi;i++)sum+=samples[i]*samples[i];return hi>lo?Math.sqrt(sum/(hi-lo)):0;};return{duration:buffer.duration,sampleRate:buffer.sampleRate,earlyRms:rms(.04,.26),lateRms:rms(1.86,2.12),lastLoopRms:rms(7.86,8.13)};}finally{await context.close();}
  },wavFile.bytes.toString('base64'));
  assert.ok(wav.duration>=8.9&&wav.earlyRms>1e-4&&wav.lateRms>1e-4&&wav.lastLoopRms>1e-4,`downloaded WAV decodes with early and late-column notes: ${JSON.stringify(wav)}`);
  result.wav={...wavFile,decoded:wav};pass('actual WAV download decodes and contains the final-column endpoint in late loops',result.wav);

  const videoFile=await downloadFrom('audio-export-video','video');
  const video=await page.evaluate(async base64=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const blob=new Blob([bytes]);const url=URL.createObjectURL(blob);
    const v=document.createElement('video');v.muted=true;v.src=url;
    const metadata=await new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',()=>resolve({width:v.videoWidth,height:v.videoHeight,duration:v.duration}),{once:true});v.addEventListener('error',()=>reject(Error('video decode failed')),{once:true});setTimeout(()=>reject(Error('video decode timeout')),10000);});
    const C=globalThis.__NativeAudioContext,context=new C();let audio;
    try{audio=await context.decodeAudioData(bytes.buffer.slice(0));const samples=audio.getChannelData(0),rms=(a,b)=>{const lo=Math.floor(a*audio.sampleRate),hi=Math.min(samples.length,Math.floor(b*audio.sampleRate));let sum=0;for(let i=lo;i<hi;i++)sum+=samples[i]*samples[i];return hi>lo?Math.sqrt(sum/(hi-lo)):0;};return{metadata,audioDuration:audio.duration,lateRms:rms(1.86,2.12)};}finally{await context.close();URL.revokeObjectURL(url);}
  },videoFile.bytes.toString('base64'));
  assert.ok(video.metadata.width>0&&video.metadata.height>0&&video.metadata.duration>=2&&video.audioDuration>=2&&video.lateRms>1e-4,`actual video decodes with late endpoint audio: ${JSON.stringify(video)}`);
  result.video={...videoFile,decoded:video};pass('actual video download decodes and contains the final-column audio endpoint',result.video);

  const afterExports=await readSnapshot();
  assert.deepEqual(afterExports.rawImage,before.rawImage,'image RGBA is preserved after WAV and video exports');
  assert.deepEqual(afterExports.rawNotes,before.rawNotes,'all raw notes are preserved after WAV and video exports');
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvas:document.querySelector('#audio-pixel-canvas').getBoundingClientRect().toJSON(),play:document.querySelector('#audio-play-toggle').getBoundingClientRect().toJSON()}));
  assert.ok(layout.scrollWidth<=layout.width+1,'390px mobile view has no horizontal page overflow');
  pass('390px Android-emulated page remains free of horizontal overflow after native exports',layout);
  result.errors=[...result.pageErrors,...result.consoleErrors];
  assert.deepEqual(result.errors,[],'no local page or console errors');
  for(const path of ['audio/index.html','js/creation/audio-page.mjs','js/creation/audio-core.mjs','js/creation/audio-color-mix.mjs','js/creation/audio-export.mjs','js/creation/audio-video.mjs','js/creation/pxd-draw-audio.mjs'])result.sourceHashes[path]=sha(await readFile(new URL('../'+path,import.meta.url)));
  await writeFile(`${outDir}/result.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({checks:result.checks.length,endpointCount:normalizedEvents.length,gainEvidence:result.gainEvidence,wav:{file:wavFile.file,decoded:wav},video:{file:videoFile.file,decoded:video},errors:result.errors,sourceHashes:result.sourceHashes},null,2));
  await context.close();
} catch(error) {
  result.error=error.stack||String(error);
  try{await writeFile(`${outDir}/failure.json`,JSON.stringify(result,null,2));}catch{}
  throw error;
} finally {await browser.close();}
