#!/usr/bin/env node
/** Real Web Audio signal checks; this is not a subjective listening test. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing installation');
const { chromium, webkit } = await import(pathToFileURL(modulePath).href);
import { writeFile, mkdir } from 'node:fs/promises';
const dir=process.env.PIXIEED_AUDIO_ARTIFACTS || '/tmp/pixieed-audio-quality';
const base=process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local test server required');
const mode='after'; const engineName=process.argv[2] || 'chromium';
if (!['chromium','webkit'].includes(engineName)) throw new Error('Choose chromium or webkit');
const browser=await ({chromium,webkit}[engineName]).launch({headless:true, ...(engineName === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? {executablePath:process.env.PIXIEED_WEBKIT_EXECUTABLE} : {})});
try {
const page=await browser.newPage();
await page.route('**/*',async route=>{
const url=new URL(route.request().url());
if(url.origin!==new URL(base).origin) return route.fulfill({status:200,body:''});
return route.continue();
});
await page.goto(base+'/audio/');
await page.waitForFunction(() => document.querySelectorAll('#audio-tracks .audio-track-choice--source').length === 4);
for (const viewport of [{width:320,height:568},{width:390,height:844},{width:568,height:320},{width:1280,height:800}]) {
  await page.setViewportSize(viewport);
  const layout = await page.evaluate(() => ({overflow:document.documentElement.scrollWidth>innerWidth, canvas:!!document.querySelector('#audio-pixel-canvas')?.getClientRects().length}));
  assert.equal(layout.overflow,false,JSON.stringify(viewport)); assert.equal(layout.canvas,true);
}

let renderTimeout;
const timeout = new Promise((_, reject) => { renderTimeout = setTimeout(() => reject(new Error('Audio signal verification exceeded 60 seconds')), 60_000); });
let result;
try { result = await Promise.race([page.evaluate(async ({mode})=>{
const {AUDIO_INSTRUMENTS,createAudioPlayer,createAudioSong,setAudioPixelPalette}=await import('/js/creation/audio-core.mjs');
const {encodeWav}=await import('/js/creation/audio-export.mjs');
const metrics=[], failures=[], rendered={};
async function render(id,pitch,seconds,rate=44100,count=1,preview=false){
const instrument=AUDIO_INSTRUMENTS.find(v=>v.id===id);
const context=new OfflineAudioContext(1,Math.ceil((Math.max(seconds+instrument.release,instrument.drum?.duration || 0)+.1)*rate),rate);
const proxy=new Proxy(context,{get(target,key){if(key==='resume')return async()=>{};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
const player=createAudioPlayer({audioContextFactory:()=>proxy,schedule:()=>1,cancel(){}});
if(preview) await player.preview({instrument:id,pitch,duration:seconds,velocity:96});
else {
let song=setAudioPixelPalette(createAudioSong(),{slotId:'square',instrument:id});
song.tracks[0].clips[0].notes=Array.from({length:count},(_,index)=>({noteId:'quality-'+index,pitch,startTick:0,durationTicks:Math.round(seconds*960),velocity:96}));
await player.play(song);
}
const buffer=await context.startRendering();player.stop();return buffer;
}
function stats(buffer){const data=buffer.getChannelData(0);let peak=0,sum=0,dc=0,late=0;for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('nonfinite sample');peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]**2;dc+=data[i];if(i>buffer.sampleRate*.5&&i<buffer.sampleRate*.7)late+=data[i]**2;}return {peak,rms:Math.sqrt(sum/data.length),dc:dc/data.length,lateRms:Math.sqrt(late/(buffer.sampleRate*.2))};}
for(const profile of AUDIO_INSTRUMENTS){
for(const pitch of [36,60,96])for(const rate of [8000,44100,48000])for(const seconds of [.012,.75]){
try{const buffer=await render(profile.id,pitch,seconds,rate);const row={id:profile.id,pitch,rate,seconds,...stats(buffer)};metrics.push(row);if(row.rms<1e-8)failures.push({...row,error:'silent'});if(row.peak>=1)failures.push({...row,error:'clipping'});if(pitch===60&&rate===44100&&seconds===.75){const wav=encodeWav(buffer);rendered[profile.id]=Array.from(wav);}}
catch(error){failures.push({id:profile.id,pitch,rate,seconds,error:error.message});}
}
}
const dense=[];for(const id of ['square','piano','brass'])for(const pitch of [36,60,96])for(const count of [16,128,256]){try{const row={id,pitch,count,...stats(await render(id,pitch,.75,44100,count))};dense.push(row);if(row.peak>=1)failures.push({...row,error:'dense clipping'});}catch(error){failures.push({id,count,error:error.message});}}
const parity=[];for(const id of ['square','piano','flute','gb-noise']){const played=await render(id,60,.125,44100);const preview=await render(id,60,.125,44100,1,true);const s=stats(played),p=stats(preview);parity.push({id,played:s,preview:p});}
return {mode,voices:AUDIO_INSTRUMENTS.length,metrics,failures,dense,parity,rendered};
},{mode}), timeout]); } finally { clearTimeout(renderTimeout); }
const {rendered,...report}=result;await mkdir(dir+'/'+mode+'-'+engineName,{recursive:true});
for(const [id,data] of Object.entries(rendered))await writeFile(dir+'/'+mode+'-'+engineName+'/'+id+'.wav',Buffer.from(data));
await writeFile(dir+'/'+mode+'-'+engineName+'.json',JSON.stringify(report,null,2));

assert.equal(report.failures.length,0,'all audible finite unclipped single and dense renders');
for (const row of report.metrics.filter(r=>['noise','gb-noise','nes-noise'].includes(r.id)&&r.rate===44100&&r.seconds===.75)) assert.ok(row.lateRms>1e-6,'noise holds beyond 300ms: '+row.id);
for (const row of report.parity) assert.ok(Math.abs(row.played.rms-row.preview.rms)/Math.max(row.played.rms,row.preview.rms)<.03,'preview/play envelope parity: '+row.id);
console.log(JSON.stringify({engine:engineName,voices:report.voices,renders:report.metrics.length,failures:report.failures,densePeak:Math.max(...report.dense.map(r=>r.peak)),responsive:'PASS',listening:'UNTESTED',device:'UNTESTED',production:'UNTESTED'},null,2));
} finally {await browser.close();}
