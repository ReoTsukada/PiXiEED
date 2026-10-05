#!/usr/bin/env node
// Local interaction and repeated zoom regression; all posts are synthetic.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [], measurements = [];
const image = { dataUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16"%3E%3Cpath fill="red" d="M0 0h16v16H0z"/%3E%3C/svg%3E', width: 16, height: 16 };
const storeModule = `let list=[];const listeners=new Set();globalThis.__replacePosts=next=>{list=next;for(const fn of listeners)fn();};
export function createSupabaseGlobeStore(){return {ready:Promise.resolve(),list:()=>list,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}};}
export function createSupabaseGlobeAuth(){return {getUser:()=>({id:'u',name:'Fixture'}),subscribe:()=>()=>{}};}`;
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/globe-prototype.css"></head><body style="margin:0"><main class="globe-stage" style="width:100vw;height:100vh;border:0"><canvas id="globeCanvas" tabindex="0"></canvas></main><script type="module">
import {createGlobeRenderer} from '/js/globe/renderer.mjs';import {initPostUi} from '/js/globe/post-ui.mjs';import * as geo from '/js/globe/geometry.mjs';
const source=await(await fetch('/assets/maps/globe-land-mask-v1.json')).json();document.querySelector('canvas').setPointerCapture=()=>{};let ui;window.__hoverEvents=[];window.__picks=[];window.__pinFrameTimes=[];window.__geo=geo;
window.r=createGlobeRenderer(document.querySelector('canvas'),{projection:'mercator',mapCellData:source,forceCanvas:location.search.includes('canvas'),onStateChange:()=>{if(ui){const t=performance.now();ui.refresh();__pinFrameTimes.push(performance.now()-t);}},onHover:s=>__hoverEvents.push(s?.displayCellId||null),onPick:s=>__picks.push(s?.cellId||null)});
const image=${JSON.stringify(image)};let list=Array.from({length:1000},(_,i)=>({id:'post-'+i,title:'Work '+i,pin:{latitude:-65+(i%25)*5.2,longitude:-175+Math.floor(i/25)*8.75},image,author:{id:'u',name:'Test'}}));
window.__storeListeners=[];ui=initPostUi({renderer:r,stage:document.querySelector('main'),store:{ready:Promise.resolve(),list:()=>list,subscribe:fn=>{__storeListeners.push(fn);return ()=>{};}},auth:{getUser:()=>null,subscribe:()=>()=>{}}});window.ui=ui;window.__ready=true;
</script></body></html>`;
async function setup(viewport, path = '/globe-prototype.html', options = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: viewport.width === 390 ? 2 : 1, ...options });
  const requests = [];
  context.on('request', r => { if (new URL(r.url()).origin === origin) requests.push(r.url()); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/interaction-fixture') return route.fulfill({ contentType: 'text/html', body: fixture });
    if (url.pathname === '/js/globe/post-supabase.mjs') return route.fulfill({ contentType: 'text/javascript', body: storeModule });
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__uploads = 0;
    const putImage = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (...args) { window.__uploads++; return putImage.apply(this, args); };
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) { window.__uploads++; return original.apply(this, args); };
    }
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  if (path === '/globe/') {
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.__PIXIEED_POSTS__);
  } else await page.waitForFunction(() => window.__ready || window.__PIXIEED_POSTS__);
  await page.waitForTimeout(250);
  return { context, page, requests };
}
async function frames(page) { await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))); }
async function cellPoint(page) {
  return page.evaluate(() => {
    const r = __PIXIEED_GLOBE__, c = r.getSnapshot().camera, rect = document.querySelector('#globeCanvas').getBoundingClientRect();
    for (let y = c.viewport.height * .25; y < c.viewport.height * .7; y += 7) for (let x = c.viewport.width * .25; x < c.viewport.width * .65; x += 7) {
      const selected = r.pickAt(x, y);
      if (!selected?.prefectureId) continue;
      const hit = document.elementFromPoint(rect.left + x, rect.top + y);
      if (hit?.id === 'globeCanvas') return { x: rect.left + x, y: rect.top + y, selected };
    }
    throw new Error('No unobstructed land cell found');
  });
}
function overlaps(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const { context, page, requests } = await setup(viewport);
    try {
      await page.evaluate(() => __PIXIEED_GLOBE__.setView({ centerLongitude: 139.6917, centerLatitude: 35.6895, zoom: 8 })); await frames(page);
      const point = await cellPoint(page);
      await page.mouse.move(point.x, point.y); await frames(page);
      assert.equal(await page.locator('#cellTooltip').isVisible(), true);
      assert.match(await page.locator('#cellTooltip [data-cell-posts]').textContent(), /県内の投稿 0件/);
      assert.equal(await page.locator('#cellTooltip [data-cell-name]').textContent(), point.selected.prefectureLabel);
      const initial = await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().view);
      if (viewport.width === 390) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y); await frames(page); await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().view), initial, 'single click fixes selection without automatic zoom');
      assert.equal(await page.locator('#selectionPanel').isVisible(), true);
      const selected = await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().selected);
      const post = { id: 'cell-post', title: 'Selected place', postKind: 'pixel_art', pin: { latitude: selected.center.latitude, longitude: selected.center.longitude }, image, author: { id: 'u', name: 'Fixture' } };
      await page.evaluate(post => __replacePosts([post, { ...post, id: 'elsewhere', pin: { latitude: 0, longitude: 0 } }]), post);
      assert.equal(await page.locator('#selectedPostCount').textContent(), '1');
      const layout = await page.evaluate(() => {
        const box = el => { if (!el) return {left:0,top:0,right:0,bottom:0,width:0,height:0}; const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
        const panel = document.querySelector('#selectionPanel');
        const controls = [...panel.querySelectorAll('button')].map(el => { const b = box(el), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { ...b, hit: el === hit || el.contains(hit) }; });
        return { panel: box(panel), nav: box(document.querySelector('.globe-app-tabs')), clock: box(document.querySelector('.time-capsule')), switch: box(document.querySelector('#mapLayerSwitch')), controls, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(layout.controls.every(c => c.hit && c.width >= 43.9 && c.height >= 43.9), JSON.stringify(layout));
      assert.equal(layout.overflow, false); assert.equal(overlaps(layout.panel, layout.nav), false); assert.equal(overlaps(layout.panel, layout.clock), false); assert.equal(overlaps(layout.panel, layout.switch), false);
      await page.locator('#viewCellPosts').click();
      await page.locator('.gallery:not([hidden])').waitFor();
      assert.equal(await page.locator('.gallery .tile').count(), 1);
      await page.locator('.gallery .tile').click();
      assert.equal(await page.locator('[data-v-title]').textContent(), post.title);
      await page.evaluate(post => {
        __replacePosts([{...post,title:'Updated place',image:{...post.image,dataUrl:post.image.dataUrl.replace('red','blue')}}, {...post,id:'elsewhere',pin:{latitude:0,longitude:0}}]);
      }, post);
      assert.equal(await page.locator('[data-v-title]').textContent(), 'Updated place');
      assert.equal(await page.locator('.pin').count(),0,'updated posts stay in colored cells without image marker overlays');
      await page.keyboard.press('Escape');
      await page.evaluate(post=>__replacePosts([{...post,postKind:'pixel_camera'}]),post);
      await page.locator('#viewCellPosts').click();
      assert.equal(await page.locator('.gallery [data-tab="camera"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('.gallery .tile').count(),1);
      await page.locator('[data-all-places]').click();
      assert.equal(await page.locator('[data-all-places]').isVisible(),false);
      await page.keyboard.press('Escape');
      await page.locator('#placeHere').click();
      await page.locator('.composer:not([hidden])').waitFor();
      assert.equal((await page.evaluate(() => __PIXIEED_POSTS__.getState())).pin.cellId, selected.cellId, 'composer retains canonical posting ID');
      assert.equal(await page.locator('.pin-draft').evaluate(e=>e.hidden),false,'composer enables its explicit draft location');
      assert.equal(await page.locator('.pin-draft__dot').isVisible(),true,'composer draft location dot is visible');
      assert.equal(await page.locator('.pin-draft').evaluate(e=>getComputedStyle(e).pointerEvents),'none','draft marker does not intercept map gestures');
      assert.equal(await page.locator('.pin').count(),0);
      await page.keyboard.press('Escape');
      await page.locator('#zoomToCell').click(); await page.waitForTimeout(450);
      assert.ok((await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().view.zoom)) > initial.zoom);
      assert.equal(await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().selected.displayCellId), selected.displayCellId);
      await page.locator('#clearCellSelection').click(); await frames(page);
      assert.equal(await page.locator('#selectionPanel').isVisible(), false);
      assert.equal(await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().selected), null);
      const beforeRequests = requests.length, beforeUploads = await page.evaluate(() => __uploads);
      await page.locator('#globeCanvas').dispatchEvent('wheel', { deltaY: -40, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
      await page.waitForTimeout(250);
      assert.equal(requests.length, beforeRequests, 'zoom has no network loads');
      assert.equal(await page.evaluate(() => __uploads), beforeUploads, 'zoom retains GPU texture');
      await page.screenshot({ path: `/private/tmp/pixieed-map-interaction-${viewport.width}.png` });
      checks.push(`${viewport.width}x${viewport.height}: hover, fixed selection, filtered gallery/viewer, canonical composer, explicit zoom, clear, responsive controls, no zoom loads`);
    } finally { await context.close(); }
  }
  for (const width of [390,1280]) {
    const {context,page}=await setup({width,height:width===390?844:800},'/globe/');
    try {
      const embedded=page.frames().find(f=>f.url().includes('globe-prototype.html'));
      await embedded.evaluate(()=>__PIXIEED_GLOBE__.setView({centerLongitude:139.6917,centerLatitude:35.6895,zoom:8}));await frames(embedded);
      const point=await cellPoint(embedded),offset=await page.locator('iframe').boundingBox();
      await page.mouse.click(point.x+offset.x,point.y+offset.y);await frames(embedded);
      assert.equal(await embedded.locator('#selectionPanel').isVisible(),true);
      const controls=await embedded.evaluate(()=>[...document.querySelectorAll('#selectionPanel button')].map(el=>{const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {width:b.width,height:b.height,hit:el===hit||el.contains(hit)};}));
      assert.ok(controls.every(c=>c.hit&&c.width>=43.9&&c.height>=43.9));
      await page.screenshot({path:`/private/tmp/pixieed-map-public-selection-${width}.png`});
      await embedded.locator('#clearCellSelection').click();await frames(embedded);
      assert.equal(await embedded.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().selected),null);
      checks.push(`${width}: public /globe/ embedded selection actions accessible`);
    }finally{await context.close();}
  }
  for (const backend of ['gpu', 'canvas']) {
    const { context, page, requests } = await setup({ width: 1280, height: 800 }, '/interaction-fixture?' + backend, {deviceScaleFactor:backend==='canvas'?2:1});
    try {
      await page.evaluate(() => { document.querySelector('.pin-layer').style.pointerEvents = 'none'; r.setView({ centerLongitude: 139.6917, centerLatitude: 35.6895, zoom: 12 }); }); await frames(page);
      const state = await page.evaluate(() => {
        const c = r.getSnapshot().camera; return { x: c.viewport.centerX, y: c.viewport.centerY, id: r.pickAt(c.viewport.centerX, c.viewport.centerY).displayCellId };
      });
      await page.mouse.move(state.x, state.y); await frames(page);
      const hoverCount = await page.evaluate(() => __hoverEvents.length);
      await page.evaluate(state => {
        const canvas = document.querySelector('canvas');
        for (let i = 0; i < 10; i++) canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 101, pointerType: 'mouse', clientX: state.x + .01 * i, clientY: state.y, bubbles: true }));
      }, state);
      await frames(page); assert.equal(await page.evaluate(() => __hoverEvents.length), hoverCount + 1, 'same-frame moves coalesce into one tooltip position update');
      assert.equal(await page.evaluate(() => __hoverEvents.at(-1)), state.id, 'tooltip remains on the same cell');
      const repaintsBeforeLeave=await page.evaluate(()=>r.getSnapshot().metrics.repaints);
      await page.locator('canvas').dispatchEvent('pointerleave', { pointerType: 'mouse' }); await frames(page);
      assert.ok((await page.evaluate(()=>r.getSnapshot().metrics.repaints))>repaintsBeforeLeave,'pointer leave repaints the cleared highlight');
      assert.equal(await page.evaluate(() => r.getSnapshot().hovered), null);
      const scalePick = await page.evaluate(state => {
        const c = document.querySelector('canvas'); c.style.transformOrigin = '0 0'; c.style.transform = 'scale(.75)';
        const b = c.getBoundingClientRect(), v = r.getSnapshot().camera.viewport, x = b.left + state.x * b.width / v.width, y = b.top + state.y * b.height / v.height;
        c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'mouse', clientX: x, clientY: y, bubbles: true, button: 0 }));
        c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, pointerType: 'mouse', clientX: x, clientY: y, bubbles: true, button: 0 }));
        c.style.transform = ''; return r.getSnapshot().selected?.displayCellId;
      }, state);
      // page.evaluate uses this payload rather than a closure across processes.
      assert.equal(scalePick, state.id);
      await page.locator('canvas').focus(); await page.keyboard.press('Escape'); await frames(page);
      assert.equal(await page.evaluate(() => r.getSnapshot().selected), null);
      for (const key of ['Enter','Space']) {
        await page.keyboard.press(key);await frames(page);
        assert.equal(await page.evaluate(()=>r.getSnapshot().selected.displayCellId),state.id,`${key} picks viewport center at both DPRs`);
      }
      await page.keyboard.press('Escape');await frames(page);
      const latest = await page.evaluate(() => {
        r.setView({zoom:4});r.draw();
        r.setView({centerLongitude:139.6917,centerLatitude:35.6895,zoom:12});
        const c=r.getSnapshot().camera,picked=r.pickAt(c.viewport.centerX,c.viewport.centerY);
        return {geo:picked.pickedGeo,level:picked.lodLevel};
      });
      assert.equal(latest.level,'cell','picking synchronizes the logical level before the scheduled draw');
      assert.ok(Math.abs(latest.geo.longitude-139.6917)<1e-6,'picking uses latest camera before scheduled draw');
      await frames(page);
      const picksBefore = await page.evaluate(()=>__picks.length);
      await page.locator('canvas').dispatchEvent('pointerdown',{pointerId:88,pointerType:'mouse',clientX:600,clientY:350,button:0,bubbles:true});
      await page.locator('canvas').dispatchEvent('pointermove',{pointerId:88,pointerType:'mouse',clientX:640,clientY:375,bubbles:true});
      await page.locator('canvas').dispatchEvent('pointercancel',{pointerId:88,pointerType:'mouse',clientX:640,clientY:375,bubbles:true});
      assert.equal(await page.evaluate(()=>__picks.length),picksBefore,'drag cannot select a cell');
      await page.evaluate(()=>{r.setView({centerLongitude:139.6917,centerLatitude:35.6895,zoom:8});r.draw();});
      const anchorBefore=await page.evaluate(()=>__geo.inverseScreenToGeo(300,220,r.getSnapshot().camera));
      await page.locator('canvas').dispatchEvent('dblclick',{clientX:300,clientY:220,button:0,bubbles:true,cancelable:true});await frames(page);
      const anchorAfter=await page.evaluate(()=>__geo.inverseScreenToGeo(300,220,r.getSnapshot().camera));
      assert.ok(Math.abs(anchorBefore.longitude-anchorAfter.longitude)<1e-6 && Math.abs(anchorBefore.latitude-anchorAfter.latitude)<1e-6,'double-click zoom keeps the pointer anchor');
      await page.evaluate(()=>{r.setView({centerLongitude:-140,centerLatitude:0,zoom:8});r.draw();});
      await page.locator('canvas').dispatchEvent('pointerdown',{pointerId:89,pointerType:'mouse',clientX:640,clientY:400,button:0,bubbles:true});
      await page.locator('canvas').dispatchEvent('pointerup',{pointerId:89,pointerType:'mouse',clientX:640,clientY:400,button:0,bubbles:true});await frames(page);
      assert.equal(await page.evaluate(()=>r.getSnapshot().selected),null,'sea clears selection');
      const beforeRequests = requests.length;
      const perf = await page.evaluate(async () => {
        let images = 0, mutations = 0; const durations = []; const create = document.createElement.bind(document);
        document.createElement = function (tag, ...rest) { if (tag === 'img') images++; return create(tag, ...rest); };
        const observer = new MutationObserver(list => { for (const m of list) mutations += m.addedNodes.length + m.removedNodes.length; }); observer.observe(document.querySelector('.pin-layer'), { childList: true });
        const uploads = __uploads, plans = r.getSnapshot().metrics.planBuilds;
        // Warm the finite periodic marker pool before measuring repeated zooms.
        for (let i = 0; i < 45; i++) { r.setView({ centerLongitude: i * 8 - 175, centerLatitude: 0, zoom: i % 2 ? 1.15 : 2 }); await new Promise(done => requestAnimationFrame(done)); }
        images = 0; mutations = 0; __pinFrameTimes=[];
        for (let i = 0; i < 90; i++) { r.setView({ centerLongitude: (i % 45) * 8 - 175, centerLatitude: 0, zoom: i % 2 ? 1.15 : 2 }); await new Promise(done => requestAnimationFrame(done)); const t = performance.now(); ui.refresh(); durations.push(performance.now() - t); }
        await Promise.resolve(); observer.disconnect(); durations.sort((a, b) => a - b); __pinFrameTimes.sort((a,b)=>a-b);
        return { posts: 1000, refreshMedianMs: __pinFrameTimes[Math.floor(__pinFrameTimes.length*.5)], refreshP95Ms: __pinFrameTimes[Math.floor(__pinFrameTimes.length*.95)], cachedRefreshMedianMs:durations[45], newImages: images, pinDomMutations: mutations, planBuildsDelta: r.getSnapshot().metrics.planBuilds - plans, textureUploads: __uploads - uploads, livePins: document.querySelectorAll('.pin').length };
      });
      assert.equal(requests.length, beforeRequests); assert.equal(perf.textureUploads, 0); assert.equal(perf.planBuildsDelta, 0); assert.equal(perf.newImages, 0); assert.equal(perf.pinDomMutations, 0);
      measurements.push({ backend, ...perf });
      checks.push(`${backend}: coalesced hover, pointer leave, transformed input, Escape, persistent images, zero zoom fetch/upload/rebuild`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', checks, measurements, limits: 'Local Chromium, synthetic posts only. Physical devices, Safari and production are untested.' }, null, 2));
} finally { await browser.close(); }
