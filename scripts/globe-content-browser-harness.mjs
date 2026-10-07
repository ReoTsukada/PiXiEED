#!/usr/bin/env node
// Actual map page with isolated public data; no external writes or publication.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createMapCellIndex } from '../js/globe/map-cells.mjs';
import { mergeEventCatalog } from '../js/globe/event-catalog.mjs';
import { uniqueEventEditions } from '../js/globe/event-density.mjs';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const checks = [], errors = [];
const storeModule = `let posts=[];const listeners=new Set();globalThis.__replacePosts=list=>{posts=list;for(const fn of listeners)fn();};export function createSupabaseGlobeStore(){return {ready:Promise.resolve(),list:()=>posts,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}};}export function createSupabaseGlobeAuth(){return {getUser:()=>null,subscribe:()=>()=>{}};}`;
const events = [
  ...Array.from({length:2},(_,i)=>({id:`event-tokyo-${i}`,name:`Fixture Tokyo event${i===0?'':` ${i+1}`}`,prefecture:'東京都',area:'東京',venue:'Fixture venue',startDate:'2099-01-01',endDate:'2099-01-01',dateLabel:'2099年1月1日',status:'upcoming',sourceUrl:'https://example.com/event'})),
  ...Array.from({length:3},(_,i)=>({id:`event-tokyo-past-${i}`,name:`Fixture Tokyo past event ${i+1}`,prefecture:'東京都',startDate:`2020-01-0${i+1}`,endDate:`2020-01-0${i+1}`,dateLabel:`2020年1月${i+1}日`,status:'ended',sourceUrl:'https://example.com/past'})),
  { id: 'event-watch', name: 'Next date pending', prefecture: '東京都', status: 'watch', dateLabel: '次回開催情報待ち', sourceUrl: 'javascript:alert(1)' }
];
const researchedCatalog = JSON.parse(await readFile(new URL('../data/pixel-art-events.json', import.meta.url), 'utf8'));
const researchedEditions = uniqueEventEditions(mergeEventCatalog([], researchedCatalog.events));
const source = JSON.parse(await readFile(new URL('../assets/maps/globe-land-mask-v1.json', import.meta.url), 'utf8'));
const exactPoint = createMapCellIndex(source).cells.find(cell=>cell.prefectureId==='13').center;
events.push({id:'event-precise',name:'Exact coordinates without county',location:{lat:exactPoint.latitude,lng:exactPoint.longitude},dateLabel:'開催日調整中'});
async function frames(page) { await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))); }
function overlap(a,b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
try {
  for (const [backend, viewport] of [['gpu',{width:320,height:568}],['gpu',{width:390,height:844}],['gpu',{width:844,height:390}],['gpu',{width:1280,height:800}],['canvas',{width:390,height:844}]]) {
    const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: viewport.width === 390 ? 2 : 1 });
    let catalogPayload = {version:1,updatedAt:'2026-10-05T00:00:00+09:00',events:[]};
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/data/pixel-art-events.json') return route.fulfill({contentType:'application/json',body:JSON.stringify(catalogPayload)});
      if (url.hostname === 'script.google.com') return route.fulfill({contentType:'application/json',body:JSON.stringify({events,works:[],stores:[]})});
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === '/js/globe/post-supabase.mjs') return route.fulfill({contentType:'text/javascript',body:storeModule});
      return route.continue();
    });
    await context.addInitScript(forceCanvas => {
      window.__textureUploads=0;
      for (const name of ['texImage2D','texSubImage2D']) { const fn=WebGL2RenderingContext.prototype[name]; WebGL2RenderingContext.prototype[name]=function(...args){__textureUploads++;return fn.apply(this,args);}; }
      if (forceCanvas) {const fn=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(name,...args){return name==='webgl2'?null:fn.call(this,name,...args);};}
    }, backend === 'canvas');
    const requests=[];context.on('request',r=>requests.push(r.url()));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    try {
      await page.goto(base+'/globe-prototype.html?embed=1',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__PIXIEED_MAP_EVENTS__ && window.__PIXIEED_POSTS__);
      await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.ready);await frames(page);
      assert.equal(await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.getEvents().length),events.length);
      const record=await page.evaluate(()=>__PIXIEED_GLOBE__.getMapCellRepresentatives().find(c=>c.prefectureId==='13'));
      assert.ok(record);
      await page.evaluate(center=>{__PIXIEED_GLOBE__.setView({centerLongitude:center.longitude,centerLatitude:center.latitude,zoom:24});__replacePosts([{id:'post',title:'Fixture post',pin:center,image:{dataUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16"%3E%3Cpath fill="red" d="M0 0h16v16H0z"/%3E%3C/svg%3E',width:16,height:16},author:{id:'fixture',name:'Fixture'}}]);},record.center);
      await frames(page);
      const readColor=()=>page.evaluate(()=>{const r=__PIXIEED_GLOBE__;r.clearSelection();r.draw();const c=document.querySelector('#globeCanvas'),s=r.getSnapshot().camera,d=s.viewport.dpr,x=Math.floor(s.viewport.centerX*d),y=Math.floor(s.viewport.centerY*d),gl=c.getContext('webgl2');if(gl){const p=new Uint8Array(4);gl.readPixels(x,c.height-y-1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p].slice(0,3);}return [...c.getContext('2d').getImageData(x,y,1,1).data].slice(0,3);});
      const postColor=await readColor();assert.deepEqual(postColor,[119,170,255],'occupied post cell is blue');
      const before=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view);
      await page.locator('[data-map-content="events"]').click();await frames(page);
      assert.deepEqual(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view),before);
      assert.equal(await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.getPeriodFilter()),'future','event layer starts with future selected');
      assert.equal(await page.locator('.map-events-dock__filters [data-event-period]').first().getAttribute('data-event-period'),'future','future filter is the first period control');
      assert.equal(await page.locator('.map-events-dock__filters [data-event-period="future"]').getAttribute('aria-pressed'),'true');
      assert.deepEqual(await readColor(),[234,122,66],'default future filter colors the two upcoming events');
      await page.locator('.map-events-dock__filters [data-event-period="all"]').click();await frames(page);
      assert.equal(await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.getPeriodFilter()),'all','all period remains an explicit selection');
      assert.deepEqual(await readColor(),[199,70,61],'combined two future and three past events produce the strongest warm density color');
      assert.equal(await page.locator('.pin-layer').isVisible(),false);
      assert.equal(await page.locator('.map-event-pin,.map-event-layer,.pin').count(),0,'normal map has no event/post marker overlays');
      const dockLayout=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};const dock=document.querySelector('.map-events-dock'),layers=document.querySelector('#mapLayerSwitch'),d=rect(dock),l=rect(layers);return {dock:d,layers:l,overlap:d.left<l.right&&d.right>l.left&&d.top<l.bottom&&d.bottom>l.top,overflow:d.left<0||d.right>innerWidth,buttons:[...dock.querySelectorAll('button')].map(e=>{const b=rect(e),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {label:e.textContent,width:b.width,height:b.height,hit:e===hit||e.contains(hit)};})};});
      assert.equal(dockLayout.overflow,false,JSON.stringify({backend,viewport,dockLayout}));
      assert.equal(dockLayout.overlap,false,'event dock does not cover map-layer switch: '+JSON.stringify({backend,viewport,dockLayout}));
      assert.ok(dockLayout.buttons.every(button=>button.width>=44&&button.height>=44&&button.hit),'event dock controls remain reachable 44px targets: '+JSON.stringify({backend,viewport,dockLayout}));
      const interaction=await page.evaluate(center=>{const renderer=__PIXIEED_GLOBE__,canvas=document.querySelector('#globeCanvas'),snapshot=renderer.getSnapshot(),camera=snapshot.camera,bounds=canvas.getBoundingClientRect();const point={x:bounds.left+camera.viewport.centerX+((center.longitude-camera.centerLongitude+540)%360-180)*Math.PI/180*camera.scale,y:bounds.top+camera.viewport.centerY-(Math.log(Math.tan(Math.PI/4+center.latitude*Math.PI/360))-camera.centerMercatorY)*camera.scale};return {point,view:snapshot.view,hit:document.elementFromPoint(point.x,point.y)?.id};},record.center);
      const point=interaction.point;
      assert.equal(interaction.hit,'globeCanvas','colored cell is directly touchable outside dock controls');
      await page.mouse.move(point.x,point.y);await frames(page);
      assert.equal(await page.locator('#cellTooltip').isVisible(),true);
      assert.match(await page.locator('#cellTooltip').textContent(),/イベント 5件（今後・開催中 2／過去 3）/);
      assert.equal(await page.locator('#cellTooltip').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
      await page.screenshot({path:`/tmp/pixieed-map-event-hover-${backend}-${viewport.width}.png`});
      await page.locator('[data-event-period="future"]').first().click();await frames(page);
      assert.deepEqual(await readColor(),[234,122,66],'future filter uses only its two events for density');
      await page.mouse.move(point.x,point.y);await frames(page);
      assert.match(await page.locator('#cellTooltip').textContent(),/イベント 2件（今後・開催中 2／過去 3）/);
      await page.locator('[data-event-period="past"]').first().click();await frames(page);
      assert.deepEqual(await readColor(),[116,130,140],'past filter uses only its three events for grey density');
      await page.mouse.move(point.x,point.y);await frames(page);
      assert.match(await page.locator('#cellTooltip').textContent(),/イベント 3件（今後・開催中 2／過去 3）/);
      await page.locator('[data-event-period="all"]').first().click();await frames(page);
      assert.deepEqual(await readColor(),[199,70,61],'mixed cell favors future color in all-period view');
      await page.mouse.move(point.x,point.y);await frames(page);
      const beforeWheel=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom);
      await page.mouse.wheel(0,100);await page.waitForTimeout(250);
      assert.ok(await page.evaluate(z=>__PIXIEED_GLOBE__.getSnapshot().view.zoom<z,beforeWheel),'wheel on colored event cell zooms');
      if(viewport.width===390) {
        const zoom=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom);
        const touch=await context.newCDPSession(page);
        const points=distance=>[{id:1,x:point.x-distance,y:point.y,radiusX:1,radiusY:1,force:1},{id:2,x:point.x+distance,y:point.y,radiusX:1,radiusY:1,force:1}];
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(16)});
        await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(32)});
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frames(page);
        assert.ok(await page.evaluate(z=>__PIXIEED_GLOBE__.getSnapshot().view.zoom>z,zoom),'pinch over colored event cell zooms');
        assert.equal(await page.locator('#selectionPanel').isVisible(),false,'pinch does not select');
        await touch.detach();
      }
      const beforeDrag=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLongitude);
      await page.mouse.down();await page.mouse.move(point.x+40,point.y,{steps:4});await page.waitForTimeout(110);await page.mouse.up();await frames(page);
      assert.notEqual(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLongitude),beforeDrag,'drag beginning on occupied cell pans the map');
      assert.equal(await page.locator('#selectionPanel').isVisible(),false,'drag does not open a cell or event sheet');
      await page.evaluate(view=>__PIXIEED_GLOBE__.setView(view),interaction.view);await frames(page);
      await page.locator('.map-events-dock__filters [data-event-period="future"]').click();await frames(page);
      if(viewport.width===390) await page.touchscreen.tap(point.x,point.y); else await page.mouse.click(point.x,point.y);
      await frames(page);
      assert.equal(await page.locator('#selectionPanel').isVisible(),true);
      assert.equal(await page.locator('#cellTooltip').isVisible(),false,'touch/click clears hover');
      assert.equal(await page.locator('#selectedPostCount').textContent(),'2','future selection count includes only upcoming events');
      await page.locator('#viewCellPosts').click();
      assert.equal(await page.locator('.map-events-panel').isVisible(),true);
      assert.equal(await page.locator('.map-events-panel__filters [data-event-period="future"]').getAttribute('aria-pressed'),'true','opening the panel preserves future as the selected filter');
      assert.equal(await page.locator('.map-event-card').count(),2,'future is the initial event list filter');
      assert.match(await page.locator('.map-events-panel').textContent(),/Fixture Tokyo event/);
      assert.doesNotMatch(await page.locator('.map-events-panel').textContent(),/Exact coordinates without county|Next date pending/,'future filter omits undated and watch records');
      assert.match(await page.locator('.map-events-panel').textContent(),/県単位|都道府県/);
      await page.locator('.map-events-panel__filters [data-event-period="all"]').click();await frames(page);
      assert.match(await page.locator('.map-events-panel').textContent(),/Exact coordinates without county/);
      assert.match(await page.locator('.map-events-panel').textContent(),/次回開催情報待ち/);
      assert.equal(await page.locator('.map-events-panel a[href^="javascript:"]').count(),0);
      const sortedNames=await page.locator('.map-event-card h3').allTextContents();
      assert.ok(sortedNames.indexOf('Fixture Tokyo event')<sortedNames.indexOf('Next date pending'),'upcoming precedes watch/unknown in all-events list');
      assert.ok(sortedNames.indexOf('Next date pending')<sortedNames.indexOf('Fixture Tokyo past event 3'),'watch/unknown precede past records');
      assert.deepEqual(sortedNames.slice(-3),['Fixture Tokyo past event 3','Fixture Tokyo past event 2','Fixture Tokyo past event 1'],'past records are listed newest first');
      const layout=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};return {panel:box(document.querySelector('.map-events-panel')),overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('.map-events-panel__close,.map-events-panel__filters button')].map(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {width:b.width,height:b.height,hit:e===hit||e.contains(hit)};})};});
      assert.equal(layout.overflow,false);assert.ok(layout.panel.bottom<=viewport.height-70);assert.ok(layout.controls.every(b=>b.width>=44&&b.height>=44&&b.hit),JSON.stringify({backend,viewport,layout}));
      await page.locator('.map-events-panel__all').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.map-events-panel__all').evaluate(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.width>=44&&b.height>=44&&(e===hit||e.contains(hit));}),true,'scrollable all-events action remains reachable');
      await page.screenshot({path:`/tmp/pixieed-map-event-list-${backend}-${viewport.width}.png`});
      await page.locator('.map-events-panel__all').click();
      await page.keyboard.press('Escape');assert.equal(await page.locator('.map-events-panel').isVisible(),false);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'viewCellPosts','county → all → close restores original selection action focus');
      // Click a different Tokyo cell: the county event list is available without a venue-coordinate claim.
      await page.evaluate(()=>{const r=__PIXIEED_GLOBE__,c=r.getSnapshot().camera;document.querySelector('canvas#globeCanvas').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});await frames(page);
      assert.equal(await page.locator('#selectedPostCount').textContent(),'5','selected event count excludes watch and undated records');
      await page.locator('#viewCellPosts').click();assert.equal(await page.locator('.map-events-panel').isVisible(),true);await page.keyboard.press('Escape');
      await page.locator('#clearCellSelection').click();
      const starts={requests:requests.length,uploads:await page.evaluate(()=>__textureUploads)};
      for(let i=0;i<4;i++){await page.locator('[data-map-content="posts"]').click();await page.locator('[data-map-content="events"]').click();}
      await page.evaluate(()=>{window.__overlayMutations=0;window.__overlayObserver=new MutationObserver(items=>{__overlayMutations+=items.length;});for(const node of document.querySelectorAll('.pin-layer,.map-events-dock'))__overlayObserver.observe(node,{attributes:true,childList:true,subtree:true,attributeFilter:['hidden','style']});});
      await page.evaluate(async()=>{for(let i=0;i<24;i++){const r=__PIXIEED_GLOBE__;r.setView({zoom:i%2?16:24});await new Promise(requestAnimationFrame);}});await frames(page);
      assert.equal(await page.evaluate(()=>__overlayMutations),0,'event zoom writes no overlay DOM');
      await page.evaluate(()=>__overlayObserver.disconnect());
      await page.locator('[data-map-content="posts"]').click();await frames(page);
      await page.evaluate(()=>{window.__overlayMutations=0;for(const node of document.querySelectorAll('.pin-layer,.map-events-dock'))__overlayObserver.observe(node,{attributes:true,childList:true,subtree:true,attributeFilter:['hidden','style']});});
      await page.evaluate(async()=>{for(let i=0;i<6;i++){__PIXIEED_GLOBE__.setView({zoom:i%2?16:24});await new Promise(requestAnimationFrame);}});await frames(page);
      assert.equal(await page.evaluate(()=>__overlayMutations),0,'post zoom writes no overlay DOM');
      assert.equal(await page.evaluate(()=>__PIXIEED_POSTS__.getState().pinMetrics.created),0,'normal map never creates post image markers');
      await page.evaluate(()=>__overlayObserver.disconnect());
      await page.locator('[data-map-content="events"]').click();await frames(page);
      assert.equal(requests.length,starts.requests,'switch and zoom issue no fetches');assert.equal(await page.evaluate(()=>__textureUploads),starts.uploads,'switch and zoom upload no textures');
      assert.equal(await page.locator('.time-capsule,[data-astro-view],.orrery-canvas,.scope-hud').count(),0);assert.equal(await page.evaluate(()=>Boolean(globalThis.__PIXIEED_ASTRO__)),false);
      await page.evaluate(()=>__PIXIEED_GLOBE__.setView({zoom:.01}));await page.mouse.move(viewport.width*.6,viewport.height*.4);await page.mouse.wheel(0,5000);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().camera.projection),'mercator');
      await page.screenshot({path:`/tmp/pixieed-map-events-${backend}-${viewport.width}.png`});
      catalogPayload = structuredClone(researchedCatalog);
      await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.refreshData());await frames(page);
      assert.equal(await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.getEvents().length),events.length+researchedEditions.length);
      await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.openAll());
      assert.equal(await page.locator('.map-event-card').count(),events.length+researchedEditions.length);
      assert.equal(await page.locator('.map-event-card__placement').filter({hasText:'オンライン開催'}).count(),researchedEditions.filter(e=>e.online).length);
      assert.equal(await page.locator('.map-event-card__placement').filter({hasText:'情報確認日：'}).count(),researchedEditions.length);
      assert.equal(await page.locator('.map-event-card a').filter({hasText:'主催者SNS'}).count(),researchedEditions.reduce((sum,e)=>sum+(e.socialUrls?.length||0),0));
      assert.ok(await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.getEvents().filter(e=>e.online).every(e=>e.position===null)));
      await page.screenshot({path:`/tmp/pixieed-map-researched-events-${backend}-${viewport.width}.png`});
      catalogPayload.events[0].status='cancelled';
      await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.refreshData());
      assert.equal(await page.locator('.map-event-card__status').filter({hasText:/^中止$/}).count(),1);
      // Bad replacement is rejected as a whole, including a request that succeeds with invalid JSON shape.
      catalogPayload={version:1,updatedAt:'invalid',events:[]};
      await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.refreshData());
      assert.equal(await page.locator('.map-event-card').count(),events.length+researchedEditions.length);
      assert.equal(await page.locator('.map-event-card__status').filter({hasText:/^中止$/}).count(),1);
      await page.keyboard.press('Escape');
      checks.push(`${backend} ${viewport.width}x${viewport.height}: no marker overlays, blue/orange cells, hover counts, actual touch selection/pinch, wheel/drag on occupied cell, county list, watch/safe link, layout, camera stable, zero fetch/upload/overlay DOM on zoom, no astronomy; researched catalog refresh, online/no location, verified dates/SNS, cancellation, bad-data retention`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks},null,2));
} finally {await browser.close();}
