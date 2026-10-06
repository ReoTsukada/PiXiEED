import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { supabaseConfig } from '../data/site-config.js';

const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(playwrightPath).href);
const engine = process.env.PIXIEED_UI_ENGINE || 'chromium';
const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('Only a local test server is allowed.');
const SIZES = [[320, 568], [390, 844], [844, 390], [1280, 800]];
const UUIDS = { 'spot-difference': '10000000-0000-4000-8000-000000000001', 'hidden-object': '10000000-0000-4000-8000-000000000002' };
const WIDTH = 16; const HEIGHT = 16;

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function makePng(mode, changed = false) {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
    const offset = i * 4; rgba[offset] = 245; rgba[offset + 1] = 245; rgba[offset + 2] = 239; rgba[offset + 3] = 255;
  }
  const marks = [5 * WIDTH + 5, 12 * WIDTH + 12];
  for (const pixel of marks) {
    const offset = pixel * 4;
    if (mode === 'spot-difference' && !changed) continue;
    if (mode === 'hidden-object') { rgba[offset] = 0; rgba[offset + 1] = 0; rgba[offset + 2] = 0; }
    else { rgba[offset] = 40; rgba[offset + 1] = 120; rgba[offset + 2] = 70; }
  }
  const scanlines = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) scanlines.set(rgba.subarray(y * WIDTH * 4, (y + 1) * WIDTH * 4), y * (WIDTH * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(WIDTH, 0); ihdr.writeUInt32BE(HEIGHT, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))]);
}

function publicPost(mode) {
  const postId = UUIDS[mode]; const root = `/storage/v1/object/public/post-public/puzzles/${postId}`;
  const targets = [
    { id: 'target-a', name: '星', pixels: [5 * WIDTH + 5] },
    { id: 'target-b', name: '月', pixels: [12 * WIDTH + 12] },
  ];
  const definition = mode === 'spot-difference'
    ? { schemaVersion: 1, confirmed: true, width: WIDTH, height: HEIGHT, candidates: targets.map((target) => ({ id: target.id, pixels: target.pixels })) }
    : { schemaVersion: 1, confirmed: true, width: WIDTH, height: HEIGHT, targets, hitBoxes: [] };
  if (mode === 'hidden-object') {
    // The server recomputes these 120 CSS px reference boxes from authored pixels.
    for (const target of targets) {
      const x = target.pixels[0] % WIDTH; const y = Math.floor(target.pixels[0] / WIDTH);
      const required = Math.ceil(24 / (120 / WIDTH)); const before = Math.floor((required - 1) / 2);
      definition.hitBoxes.push({ targetId: target.id, minX: Math.max(0, x - before), maxX: Math.min(WIDTH - 1, x - before + required - 1), minY: Math.max(0, y - before), maxY: Math.min(HEIGHT - 1, y - before + required - 1) });
    }
  }
  return { ok: true, postId, puzzle: { postId, title: `Fixture ${mode}`, author: 'Browser harness', mode: mode === 'spot-difference' ? 'spot_difference' : 'hidden_object', originalImage: { url: `https://kyyiuakrqomzlikfaire.supabase.co${root}/original.png`, width: WIDTH, height: HEIGHT }, ...(mode === 'spot-difference' ? { changedImage: { url: `https://kyyiuakrqomzlikfaire.supabase.co${root}/changed.png`, width: WIDTH, height: HEIGHT } } : {}), definition } };
}
const fixtures = Object.fromEntries(['spot-difference', 'hidden-object'].map((mode) => [mode, publicPost(mode)]));
const pngs = {
  'spot-original': makePng('spot-difference'), 'spot-changed': makePng('spot-difference', true),
  'hidden-original': makePng('hidden-object'),
};

const OUT=process.env.PIXIEED_FRESH_PLAY_OUT || '/tmp/pixieed-game-fresh-play-20261006';await mkdir(OUT,{recursive:true});
const browser=await playwright[engine].launch({headless:true,...(engine==='webkit'?{executablePath:'/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'}:{})});const results=[];
try {
for(const [width,height] of SIZES) for(const mode of ['spot-difference','hidden-object']) {
 const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const otherId=UUIDS[mode].replace(/.$/,'9');const otherFixture=JSON.parse(JSON.stringify(fixtures[mode]).replaceAll(UUIDS[mode],otherId));
 const legacyIds=[`pixfind-${mode==='hidden-object'?'ho-':'sd-'}${UUIDS[mode]}`,`pixfind-${mode==='hidden-object'?'ho-':'sd-'}${otherId}`];
 const rows=legacyIds.map((id,i)=>({id,slug:'fixture-'+i,label:'Legacy '+i,author_name:'fixture',mode,original_url:`${supabaseConfig.url}/storage/v1/object/public/pixfind-puzzles/puzzles/${id}/original.png`,diff_url:`${supabaseConfig.url}/storage/v1/object/public/pixfind-puzzles/puzzles/${id}/changed.png`,targets:['星','月']}));
 await context.addInitScript(()=>{window.fixturePageshow=[];addEventListener('pageshow',event=>window.fixturePageshow.push(event.persisted));});
 await context.route('**/*',async route=>{
 const url=new URL(route.request().url());if(url.origin===new URL(BASE).origin)return route.continue();
 if(url.origin===supabaseConfig.url){
 if(url.pathname.endsWith('/public-post-puzzle'))return route.fulfill({json:url.searchParams.get('postId')===otherId?otherFixture:fixtures[mode],headers:{'access-control-allow-origin':'*'}});
 if(url.pathname.endsWith('/social_posts'))return route.fulfill({json:legacyIds.map(id=>({id:id+'post',status:'published',post_kind:'pixfind',distribution_mode:'pixfind',pixfind_puzzle_id:id}))});
 if(url.pathname.endsWith('/pixfind_puzzles'))return route.fulfill({json:rows});
 if(url.pathname.includes('/storage/'))return route.fulfill({contentType:'image/png',body:mode==='hidden-object'?pngs['hidden-original']:url.pathname.endsWith('changed.png')?pngs['spot-changed']:pngs['spot-original'],headers:{'access-control-allow-origin':'*'}});
 }return route.fulfill({status:200,body:''});});
 const path='/play/'+mode+'/';const initialUrl=BASE+path+'?postPuzzle='+UUIDS[mode];
 const ready=async()=>page.waitForFunction(()=>document.querySelector('#pixfind-progress')?.textContent.includes('0 / 2') && document.querySelector('#pixfind-hint')?.dataset.used==='false');
 const tap=async(x=5.5,y=5.5)=>{const r=await page.locator('#pixfind-original').boundingBox();await page.mouse.click(r.x+x*r.width/16,r.y+y*r.height/16);};
 const mark=async()=>{await tap();await page.waitForFunction(()=>document.querySelector('#pixfind-progress').textContent.includes('1 / 2'));await page.locator('#pixfind-hint').click();await page.waitForFunction(()=>document.querySelector('#pixfind-hint').dataset.used==='true');};
 const clean=async(label)=>{await ready();assert.equal(await page.locator('.pixfind-target--found').count(),0,label);assert.equal(await page.evaluate(()=>!!document.body.dataset.toolResultOpen),false,label);assert.equal(await page.locator('#pixfind-game .arc-win:not([hidden])').count(),0,label);assert.equal(await page.locator('#pixfind-game .arc-timer').textContent(),'00:00',label);};
 await page.goto(initialUrl);await clean('initial');await mark();
 const priorRun=await page.locator('#pixfind-game').getAttribute('data-puzzle-run');
 await page.locator('#pixfind-primary').click();await clean('same puzzle restarted');assert.notEqual(await page.locator('#pixfind-game').getAttribute('data-puzzle-run'),priorRun);
 await mark();await page.reload();await clean('reload');
 await mark();await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await clean('synthetic BFCache restore');
 await tap();await tap(12.5,12.5);await page.locator('.px-tool-result').waitFor({state:'visible'});
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await clean('synthetic completed restore');
 await mark();await page.goto(BASE+path+'?postPuzzle='+otherId);await clean('different puzzle');
 await mark();await page.goto(BASE+path);await page.locator('#pixfind-list .pixfind-card button').nth(0).click();await clean('list opening');
 await mark();await page.locator('#pixfind-back').click();await page.locator('#pixfind-list .pixfind-card button').nth(1).click();await clean('different list puzzle');
 await mark();await page.goto(BASE+path);await page.goBack();await ready();await clean('native back');
 const backPersisted=await page.evaluate(()=>window.fixturePageshow.at(-1));
 await page.goForward();await page.goBack();await clean('native forward/back');
 await page.screenshot({path:`${OUT}/${mode}-${width}-fresh.png`});assert.deepEqual(errors,[]);
 results.push({mode,width,height,checks:'initial/same/reload/different/list/synthetic persisted/native back-forward reset PASS',nativeBackPersisted:backPersisted});console.log(JSON.stringify(results.at(-1)));await context.close();
}
}finally{await writeFile(OUT+'/results.json',JSON.stringify(results,null,2));await browser.close();}
