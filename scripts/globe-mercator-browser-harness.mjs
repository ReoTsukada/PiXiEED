#!/usr/bin/env node
/** Local Mercator regression: actual GPU/Canvas maps, gestures and post copies. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const errors = []; const checks = []; const performanceResults = [];
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/globe-prototype.css"></head><body style="margin:0"><main id="globeStage" class="globe-stage" style="width:100vw;height:100vh;border:0"><canvas id="globeCanvas"></canvas></main><script type="module">
import { createGlobeRenderer } from '/js/globe/renderer.mjs?v=20261005-admin-boundary-1';
import * as geo from '/js/globe/geometry.mjs?v=20261005-admin-boundary-1';
import { initPostUi } from '/js/globe/post-ui.mjs?v=20261005-admin-boundary-1';
import {createMapCellIndex,lookupMapCell} from '/js/globe/map-cells.mjs?v=20261005-admin-boundary-1';
const [mapCellData,mapPrefectureData]=await Promise.all([
  fetch('/assets/maps/globe-land-mask-v1.json').then(response=>response.json()),
  fetch('/assets/maps/map-prefectures-v1.json').then(response=>response.json())
]);
const admin1Response=await fetch('/assets/maps/map-admin1-v1.json');
const mapAdmin1Data=admin1Response.ok?await admin1Response.json():null;
const mapIndexOptions={prefectureData:mapPrefectureData,...(mapAdmin1Data?{admin1Data:mapAdmin1Data}:{})};
window.__mapIndex=createMapCellIndex(mapCellData,mapIndexOptions);window.__expectedMapCellCount=window.__mapIndex.cellCount;window.__lookupMapCell=lookupMapCell;
window.__geo=geo; window.__picked=null; let ui;
// Synthetic pointer batches have no browser-owned pointer capture. Actual page
// input is checked separately with Playwright mouse and Chromium touch events.
document.querySelector('canvas').setPointerCapture=()=>{};
window.__renderer=createGlobeRenderer(document.querySelector('canvas'), { mapCellData, projection:'mercator', forceCanvas:location.search.includes('canvas'), mapPrefectureData, mapAdmin1Data, initialView:{centerLongitude:0,centerLatitude:0,zoom:8}, onPick:p=>{window.__picked=p;ui?.handlePick(p);}, onStateChange:()=>ui?.refresh() });
const post={id:'seam-post',title:'Tokyo',postKind:'pixel_art',pin:{latitude:35.6895,longitude:139.6917},image:{dataUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16"%3E%3Cpath fill="red" d="M0 0h16v16H0z"/%3E%3C/svg%3E',width:16,height:16},author:{id:'fixture-user',name:'Test'}};
const store={ready:Promise.resolve(),list:()=>[post],subscribe:()=>()=>{}};
const auth={getUser:()=>({id:'fixture-user',name:'Test'}),subscribe:()=>()=>{}};
ui=initPostUi({renderer:__renderer,stage:document.querySelector('main'),store,auth});window.__ui=ui;window.__ready=true;
</script></body></html>`;
async function setup(viewport, fixtureMode = null) {
  const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: viewport.width === 390 ? 2 : 1 });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort(); if (url.pathname === '/__mercator-fixture.html') return route.fulfill({ contentType: 'text/html', body: fixture }); return route.continue(); });
  await context.addInitScript(() => {
    window.__drawCounts = {};
    window.__textureUploads = 0;
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) { window.__textureUploads++; return original.apply(this, args); };
    }
    for (const name of ['drawArrays', 'drawArraysInstanced']) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const key = this.canvas.id + ':' + name;
        window.__drawCounts[key] = (window.__drawCounts[key] || 0) + 1;
        return original.apply(this, args);
      };
    }
  });
  const requests = []; context.on('request', request => requests.push(request.url()));
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}${fixtureMode === null ? '/globe-prototype.html' : '/__mercator-fixture.html?'+fixtureMode}`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__ready || window.__PIXIEED_GLOBE__?.getSnapshot()?.camera, null, { timeout:20000 });
  await page.waitForTimeout(600); return { context, page, requests };
}
const closeTo = (a,b,tolerance=.00001) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);
async function frame(page) { await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))); }
async function pointer(page,type,id,x,y) { await page.locator('#globeCanvas').dispatchEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,bubbles:true,cancelable:true}); }
async function verifySeaZoom(page, context, requests, rendererName) {
  const canvas = await page.locator('#globeCanvas').boundingBox();
  const point = { x: Math.round(canvas.x + canvas.width * .57), y: Math.round(canvas.y + canvas.height * .42) };
  const prepare = async zoom => page.evaluate(({ name, zoom, point, canvas }) => {
    const r = globalThis[name]; r.clearSelection();
    r.setView({ centerLongitude: -150, centerLatitude: 0, zoom }); r.draw();
    const c = r.getSnapshot().camera;
    return { max: r.getSnapshot().view.zoomRange.max, pick: r.pickAt(point.x-canvas.x, point.y-canvas.y),
      anchor: { longitude: c.centerLongitude + (point.x-canvas.x-c.viewport.centerX)/c.scale*180/Math.PI,
        latitude: (2*Math.atan(Math.exp(c.centerMercatorY+(c.viewport.centerY-(point.y-canvas.y))/c.scale))-Math.PI/2)*180/Math.PI } };
  }, { name: rendererName, zoom, point, canvas });
  const read = async () => page.evaluate(({ name, point, canvas }) => {
    const s = globalThis[name].getSnapshot(), c=s.camera;
    return { zoom:s.view.zoom, selected:s.selected, uploads:window.__textureUploads,
      anchor:{longitude:c.centerLongitude+(point.x-canvas.x-c.viewport.centerX)/c.scale*180/Math.PI,
        latitude:(2*Math.atan(Math.exp(c.centerMercatorY+(c.viewport.centerY-(point.y-canvas.y))/c.scale))-Math.PI/2)*180/Math.PI} };
  }, { name:rendererName, point, canvas });
  const first = await prepare(127); assert.equal(first.max,128); assert.equal(first.pick,null);
  const requestCount=requests.length, uploads=(await read()).uploads;
  await page.mouse.move(point.x,point.y); await page.mouse.wheel(0,-100); await page.waitForTimeout(350);
  let after=await read(); assert.equal(after.zoom,128,'wheel reaches maximum over ocean'); assert.equal(after.selected,null);
  closeTo(first.anchor.longitude,after.anchor.longitude); closeTo(first.anchor.latitude,after.anchor.latitude);
  const doubleAnchor=await prepare(64);
  await page.mouse.dblclick(point.x,point.y); await frame(page);
  after=await read(); assert.equal(after.zoom,128,'double click reaches maximum over ocean'); assert.equal(after.selected,null);
  closeTo(doubleAnchor.anchor.longitude,after.anchor.longitude); closeTo(doubleAnchor.anchor.latitude,after.anchor.latitude);
  const pinchAnchor=await prepare(96), cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x-20,y:point.y,id:1},{x:point.x+20,y:point.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-40,y:point.y,id:1},{x:point.x+40,y:point.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await frame(page); await cdp.detach();
  after=await read(); assert.equal(after.zoom,128,'touch pinch reaches maximum over ocean'); assert.equal(after.selected,null);
  closeTo(pinchAnchor.anchor.longitude,after.anchor.longitude); closeTo(pinchAnchor.anchor.latitude,after.anchor.latitude);
  assert.equal(requests.length,requestCount,'zoom adds no network requests'); assert.equal(after.uploads,uploads,'zoom adds no texture uploads');
}
try {
  for (const backend of ['gpu','canvas']) {
    const {context,page,requests}=await setup({width:1200,height:700},backend);
    try {
      const snapshot=await page.evaluate(()=>({projection:__renderer.getSnapshot().camera.projection,backend:__renderer.getSnapshot().metrics.backend}));
      assert.equal(snapshot.projection,'mercator');assert.equal(snapshot.backend,backend==='gpu'?'webgl2':'canvas2d');
      await verifySeaZoom(page,context,requests,'__renderer');
      const ranges=await page.evaluate(()=>{
        __renderer.setProjection('orthographic'); __renderer.draw(); const telescope=__renderer.getSnapshot().view.zoomRange.max;
        __renderer.setProjection('mercator'); __renderer.draw(); return {telescope,map:__renderer.getSnapshot().view.zoomRange.max};
      });
      assert.deepEqual(ranges,{telescope:24,map:128});
      checks.push(`${backend}: ocean wheel/double-click/native touch pinch reach 128, anchored, no loads/uploads; telescope max 24`);
      const exactSydney=await page.evaluate(()=>{const p=__renderer.getMapLocation(151.2093,-33.8688);return {country:p?.countryId,kind:p?.mapRegionKind,regionId:p?.mapRegionId,label:p?.mapRegionLabel};});
      assert.equal(exactSydney.country,'AUS');assert.equal(exactSydney.kind,'admin1');assert.ok(exactSydney.regionId?.startsWith('admin1:AUS:')&&exactSydney.label,'raw Sydney coordinates resolve to their exact Australian region independently of the display tile');
      const foreign=await page.evaluate(()=>[
        ['FRA',2.3522,48.8566],['GBR',-.1276,51.5074],['USA',-74.006,40.7128],['AUS',151.005,-33.815],
        ['KEN',36.8219,-1.2921],['BRA',-46.6333,-23.5505],['KOR',126.978,37.5665]
      ].map(([expected,longitude,latitude])=>{
        __renderer.setView({centerLongitude:longitude,centerLatitude:latitude,zoom:64}); __renderer.draw();
        const c=__renderer.getSnapshot().camera,p=__renderer.pickAt(c.viewport.centerX,c.viewport.centerY);
        return {expected,country:p?.countryId,label:p?.countryLabel,region:p?.mapRegionLabel,regionId:p?.mapRegionId,regionKind:p?.mapRegionKind,prefecture:p?.prefectureLabel};
      }));
      assert.ok(foreign.every(p=>p.country===p.expected && p.label && p.label!=='海' && p.prefecture===null && (p.regionKind==='admin1' ? p.region && p.regionId?.startsWith('admin1:') : p.regionKind==='country' ? p.regionId===`country:${p.expected}` : true)),JSON.stringify(foreign));
      checks.push(`${backend}: seven overseas countries have correct names and no water prefecture label`);
      const boundaryOwnership=await page.evaluate(()=>{
        const cases=[
          {name:'Maine/Quebec wrong-country pixel',longitude:-69.345703125,latitude:47.338822694822,expected:'admin1:USA:US-ME'},
          {name:'Minnesota/Manitoba wrong-country pixel',longitude:-95.009765625,latitude:49.32512199104002,expected:'admin1:USA:US-MN'},
          {name:'Nord/West-Flanders wrong-country pixel',longitude:2.548828125,latitude:51.01375465718819,expected:'admin1:FRA:FR-59'},
          {name:'Toronto control',longitude:-79.3832,latitude:43.6532,expected:'admin1:CAN:CA-ON'},
          {name:'Calais control',longitude:1.85,latitude:50.95,expected:'admin1:FRA:FR-62'}
        ];
        return cases.map(item=>{
          const renderer=__renderer;
          renderer.setView({centerLongitude:item.longitude,centerLatitude:item.latitude,zoom:64});renderer.draw();
          const camera=renderer.getSnapshot().camera,picked=renderer.pickAt(camera.viewport.centerX,camera.viewport.centerY);
          const center=picked?.displayCell?.center||picked?.center,bounds=picked?.displayCell?.bounds||picked?.bounds;
          const centerOwner=center?renderer.getMapLocation(center.longitude,center.latitude):null;
          const votes={};
          if(bounds){const north=__geo.mercatorY(bounds.north),south=__geo.mercatorY(bounds.south);for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
            const longitude=bounds.west+(sx+.5)/4*(bounds.east-bounds.west);
            const latitude=__geo.inverseMercatorY(north+(sy+.5)/4*(south-north));
            const owner=renderer.getMapLocation(longitude,latitude);
            if(owner?.mapRegionId)votes[owner.mapRegionId]=(votes[owner.mapRegionId]||0)+1;
          }}
          const majority=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]||[null,0];
          return {name:item.name,expected:item.expected,picked:picked?.mapRegionId||null,pickedCountry:picked?.countryId||null,centerOwner:centerOwner?.mapRegionId||null,majority:majority[0],majorityVotes:majority[1],votes};
        });
      });
      assert.ok(boundaryOwnership.every(item=>item.picked===item.expected&&item.majority===item.expected),JSON.stringify(boundaryOwnership));
      checks.push(`${backend}: GeoJSON 4x4 majority corrects old US/Canada and France/Belgium border pixels; Toronto/Calais controls remain stable`);
      const majorityControl=await page.evaluate(()=>{
        const longitude=-114.697265625,latitude=49.553725513475804,renderer=__renderer;
        renderer.setView({centerLongitude:longitude,centerLatitude:latitude,zoom:64});renderer.draw();
        const camera=renderer.getSnapshot().camera,picked=renderer.pickAt(camera.viewport.centerX,camera.viewport.centerY);
        const bounds=picked?.displayCell?.bounds||picked?.bounds,votes={};
        if(bounds){const north=__geo.mercatorY(bounds.north),south=__geo.mercatorY(bounds.south);for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
          const lon=bounds.west+(sx+.5)/4*(bounds.east-bounds.west),lat=__geo.inverseMercatorY(north+(sy+.5)/4*(south-north)),owner=renderer.getMapLocation(lon,lat);
          if(owner?.mapRegionId)votes[owner.mapRegionId]=(votes[owner.mapRegionId]||0)+1;
        }}
        const majority=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0]||[null,0];
        return {picked:picked?.mapRegionId||null,majority:majority[0],votes};
      });
      assert.equal(majorityControl.picked,'admin1:CAN:CA-BC');assert.equal(majorityControl.majority,'admin1:CAN:CA-BC',JSON.stringify(majorityControl));
      checks.push(`${backend}: Alberta/BC center-vs-majority control preserves the 11/16 BC majority`);
      const formerLandWater=await page.evaluate(()=>{
        const renderer=__renderer,longitude=-73.916015625,latitude=40.51379915504413;
        renderer.setView({centerLongitude:longitude,centerLatitude:latitude,zoom:64});renderer.draw();
        const camera=renderer.getSnapshot().camera;
        return {exact:renderer.getMapLocation(longitude,latitude),picked:renderer.pickAt(camera.viewport.centerX,camera.viewport.centerY)};
      });
      assert.equal(formerLandWater.exact,null,JSON.stringify(formerLandWater));assert.equal(formerLandWater.picked,null,'former country:USA raster tile at the NY coast is now sea');
      checks.push(`${backend}: former coarse-USA land at the NY coast resolves to sea`);
      const regionBoundary=await page.evaluate(()=>{
        const renderer=__renderer;renderer.clearSelection();renderer.setView({centerLongitude:-69.345703125,centerLatitude:47.338822694822,zoom:128});renderer.draw();
        const camera=renderer.getSnapshot().camera,canvas=document.querySelector('canvas'),d=camera.viewport.dpr;
        const neighbor=__lookupMapCell(-69.2,47.5,__mapIndex);
        const copies=neighbor?__geo.projectGeoCopiesToScreen(neighbor.center.longitude,neighbor.center.latitude,camera):[];
        const other=copies.sort((a,b)=>Math.hypot(a.x-camera.viewport.centerX,a.y-camera.viewport.centerY)-Math.hypot(b.x-camera.viewport.centerX,b.y-camera.viewport.centerY))[0];
        const read=(x,y)=>{if(renderer.getSnapshot().metrics.backend==='webgl2'){const gl=canvas.getContext('webgl2'),pixel=new Uint8Array(4);gl.readPixels(Math.floor(x*d),canvas.height-1-Math.floor(y*d),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];}return [...canvas.getContext('2d').getImageData(Math.floor(x*d),Math.floor(y*d),1,1).data];};
        const cx=camera.viewport.centerX,cy=camera.viewport.centerY;
        return {target:renderer.pickAt(cx,cy)?.mapRegionId||null,neighbor:other?renderer.pickAt(other.x,other.y)?.mapRegionId||null:null,point:other?{x:other.x,y:other.y}:null,beforeTarget:read(cx,cy),beforeNeighbor:other?read(other.x,other.y):null,center:{x:cx,y:cy},neighborId:neighbor?.mapRegionId||null};
      });
      assert.equal(regionBoundary.target,'admin1:USA:US-ME');assert.equal(regionBoundary.neighbor,'admin1:CAN:CA-QC');assert.notEqual(regionBoundary.target,regionBoundary.neighbor);
      const regionHighlight=await page.evaluate(({point,center})=>{
        const renderer=__renderer,canvas=document.querySelector('canvas');
        for(const [type,buttons] of [['pointerdown',1],['pointerup',0]]) canvas.dispatchEvent(new PointerEvent(type,{pointerId:73,pointerType:'mouse',isPrimary:true,button:0,buttons,clientX:center.x,clientY:center.y,bubbles:true,cancelable:true}));
        renderer.draw();
        const s=renderer.getSnapshot(),d=s.camera.viewport.dpr;
        const read=(x,y)=>{if(s.metrics.backend==='webgl2'){const gl=canvas.getContext('webgl2'),pixel=new Uint8Array(4);gl.readPixels(Math.floor(x*d),canvas.height-1-Math.floor(y*d),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];}return [...canvas.getContext('2d').getImageData(Math.floor(x*d),Math.floor(y*d),1,1).data];};
        return {selected:s.selected?.mapRegionId||null,target:read(center.x,center.y),neighbor:read(point.x,point.y)};
      },{point:regionBoundary.point,center:regionBoundary.center});
      assert.equal(regionHighlight.selected,'admin1:USA:US-ME');assert.notDeepEqual(regionHighlight.target,regionBoundary.beforeTarget,'selected Maine region receives the highlight');assert.deepEqual(regionHighlight.neighbor,regionBoundary.beforeNeighbor,JSON.stringify({backend,regionBoundary,regionHighlight}));
      checks.push(`${backend}: Maine selection highlight stays out of neighboring Quebec region`);
      await page.evaluate(()=>__renderer.clearSelection());
      const pixels=await page.evaluate(()=>{
        __renderer.setView({centerLongitude:0,centerLatitude:0,zoom:.68});__renderer.draw();
        const canvas=document.querySelector('canvas');const s=__renderer.getSnapshot();const size=Math.round(s.camera.worldSize);const samples=[];
        if(s.metrics.backend==='webgl2') { const gl=canvas.getContext('webgl2');const a=new Uint8Array(4);const b=new Uint8Array(4);for(let y=20;y<680;y+=40)for(let x=20;x<1200-size-20;x+=40){gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.readPixels(x+size,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);samples.push([...a,...b]);} }
        else {const ctx=canvas.getContext('2d');for(let y=20;y<680;y+=40)for(let x=20;x<1200-size-20;x+=40)samples.push([...ctx.getImageData(x,y,1,1).data,...ctx.getImageData(x+size,y,1,1).data]);}
        return samples;
      });
      assert.ok(pixels.length>100);assert.ok(pixels.some(p=>p[0]>40),'land pixels actually rendered');
      assert.ok(pixels.every(p=>p.slice(0,4).every((v,i)=>Math.abs(v-p[i+4])<=3)), JSON.stringify({backend, count:pixels.length, mismatches:pixels.filter(p=>p.slice(0,4).some((v,i)=>Math.abs(v-p[i+4])>3)).slice(0,20)}));
      const gridPixels=await page.evaluate(()=>{
        function read(x,y) {
          const c=document.querySelector('canvas'),s=__renderer.getSnapshot(),d=s.camera.viewport.dpr;
          if(s.metrics.backend==='webgl2'){const gl=c.getContext('webgl2'),a=new Uint8Array(4);gl.readPixels(Math.floor(x*d),c.height-1-Math.floor(y*d),1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);return [...a];}
          return [...c.getContext('2d').getImageData(Math.floor(x*d),Math.floor(y*d),1,1).data];
        }
        const results=[];
        for(const [lon,lat] of [[90,45],[-140,0]]) {
          const n=__mapIndex.resolution,col=Math.floor((lon+180)/360*n),row=Math.floor((Math.PI-__geo.mercatorY(lat))/(Math.PI*2)*n);
          const center={longitude:-180+(col+.5)/n*360,latitude:__geo.inverseMercatorY(Math.PI-(row+.5)/n*Math.PI*2)};
          __renderer.setView({centerLongitude:center.longitude,centerLatitude:center.latitude,zoom:24});__renderer.draw();
          const camera=__renderer.getSnapshot().camera,step=camera.worldSize/n;
          results.push({center:read(600,350),edge:read(600-step/2+.1,350),northEdge:read(600,350-step/2+.1),land:Boolean(__renderer.pickAt(600,350)),width:step});
        }
        __renderer.setView({centerLongitude:0,centerLatitude:0,zoom:.68});__renderer.draw();
        return results;
      });
      assert.equal(gridPixels[0].land,true);assert.equal(gridPixels[1].land,false);
      for(const sample of gridPixels) {assert.ok(sample.width>8);assert.notDeepEqual(sample.center.slice(0,3),sample.edge.slice(0,3),'vertical grid on land and sea');assert.notDeepEqual(sample.center.slice(0,3),sample.northEdge.slice(0,3),'horizontal grid on land and sea');}
      checks.push(`${backend}: continuous pixel fill and grid on land/sea without per-cell buttons`);
      const points=await page.evaluate(()=>__geo.projectGeoCopiesToScreen(139.6917,35.6895,__renderer.getSnapshot().camera));
      assert.equal(points.length,2);assert.equal(await page.locator('.pin[data-id="seam-post"]:visible').count(),2);
      const ids=await page.evaluate(points=>points.map(p=>__renderer.pickAt(p.x,p.y)?.cellId),points);
      const expected=await page.evaluate(()=>__lookupMapCell(139.6917,35.6895,__mapIndex)?.cell.id);assert.deepEqual(ids,[expected,expected]);
      await page.locator('.pin[data-id="seam-post"]:visible').first().click();assert.equal(await page.evaluate(()=>__ui.getState().sheet),'viewer');
      await page.evaluate(()=>{__ui.close();__ui.openComposer({selection:__renderer.pickAt(...Object.values(__geo.projectGeoCopiesToScreen(139.6917,35.6895,__renderer.getSnapshot().camera)[0]).slice(0,2))});__ui.setPin({latitude:35.6895,longitude:139.6917,source:'cell'});__ui.refresh();});
      assert.equal(await page.locator('.pin-draft:not([hidden]) .pin-draft__dot:visible').count(),2);await page.evaluate(()=>__ui.close());
      await page.evaluate(()=>__renderer.setView({centerLongitude:0,centerLatitude:0,zoom:4}));await frame(page);
      await page.locator('#globeCanvas').dispatchEvent('pointerdown',{pointerId:41,pointerType:'touch',clientX:500,clientY:250,button:0,bubbles:true});
      const vertical=await page.evaluate(()=>{const c=document.querySelector('canvas');const before=__renderer.getSnapshot();for(let i=1;i<=10;i++)c.dispatchEvent(new PointerEvent('pointermove',{pointerId:41,pointerType:'touch',clientX:500,clientY:250+i*4,bubbles:true}));return {beforeY:before.camera.centerMercatorY,afterY:__geo.mercatorY(__renderer.getSnapshot().view.centerLatitude),scale:before.camera.scale};});
      // The first 4px stays inside the 6px tap slop; the next nine moves accumulate.
      closeTo(vertical.afterY-vertical.beforeY,36/vertical.scale);
      await pointer(page,'pointercancel',41,500,290);await frame(page);
      const drag=await page.evaluate(()=>{const c=document.querySelector('canvas');const s=__renderer.getSnapshot();c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:42,pointerType:'touch',clientX:500,clientY:300,bubbles:true,button:0}));c.dispatchEvent(new PointerEvent('pointermove',{pointerId:42,pointerType:'touch',clientX:500+3*s.camera.worldSize,clientY:300,bubbles:true}));c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:42,pointerType:'touch',clientX:500+3*s.camera.worldSize,clientY:300,bubbles:true}));return {before:s.view.centerLongitude,after:__renderer.getSnapshot().view.centerLongitude};});closeTo(drag.before,drag.after);
      await page.evaluate(()=>__renderer.setView({centerLongitude:139.6917,centerLatitude:35.6895,zoom:4}));await frame(page);
      const anchor=await page.evaluate(()=>__geo.inverseScreenToGeo(450,280,__renderer.getSnapshot().camera));
      await pointer(page,'pointerdown',51,410,280);await pointer(page,'pointerdown',52,490,280);await pointer(page,'pointermove',51,370,280);await pointer(page,'pointermove',52,530,280);await pointer(page,'pointercancel',51,370,280);await pointer(page,'pointercancel',52,530,280);await frame(page);
      const zoomed=await page.evaluate(()=>({view:__renderer.getSnapshot().view,geo:__geo.inverseScreenToGeo(450,280,__renderer.getSnapshot().camera)}));assert.ok(zoomed.view.zoom>7.9);closeTo(anchor.longitude,zoomed.geo.longitude);closeTo(anchor.latitude,zoomed.geo.latitude);
      await page.locator('#globeCanvas').dispatchEvent('wheel',{clientX:450,clientY:280,deltaY:-100,deltaMode:0,bubbles:true,cancelable:true});await page.waitForTimeout(500);
      const wheel=await page.evaluate(()=>__geo.inverseScreenToGeo(450,280,__renderer.getSnapshot().camera));closeTo(anchor.longitude,wheel.longitude);closeTo(anchor.latitude,wheel.latitude);
      const horizontal=await page.evaluate(()=>({longitude:__renderer.getSnapshot().view.centerLongitude,scale:__renderer.getSnapshot().camera.scale}));
      await page.locator('#globeCanvas').dispatchEvent('wheel',{clientX:450,clientY:280,deltaX:60,deltaY:0,deltaMode:0,bubbles:true,cancelable:true});await frame(page);
      closeTo(await page.evaluate(()=>__renderer.getSnapshot().view.centerLongitude),horizontal.longitude+60/horizontal.scale*180/Math.PI);
      await page.locator('#globeCanvas').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('+');await frame(page);assert.equal(await page.evaluate(()=>__renderer.getSnapshot().camera.projection),'mercator');
      const prefectures = await page.evaluate(() => {
        const firstByPrefecture = new Map();
        for (const cell of __mapIndex.cells) if (cell.prefectureId && !firstByPrefecture.has(cell.prefectureId)) firstByPrefecture.set(cell.prefectureId, cell);
        return [...firstByPrefecture.values()].map(cell => {
          __renderer.setView({ centerLongitude:cell.center.longitude, centerLatitude:cell.center.latitude, zoom:8 }); __renderer.draw();
          const point = __geo.projectGeoToScreen(cell.center.longitude, cell.center.latitude, __renderer.getSnapshot().camera);
          const picked = __renderer.pickAt(point.x, point.y);
          return { expected:cell.prefectureId, actual:picked?.prefectureId, canonical:cell.cell.id, pickedId:picked?.cellId };
        });
      });
      assert.equal(prefectures.length,47);assert.ok(prefectures.every(p=>p.expected===p.actual&&p.canonical===p.pickedId));
      const uniform = await page.evaluate(() => {
        const cells=__mapIndex.cells;const size=__renderer.getSnapshot().camera.scale;
        const widths=cells.map(c=>(c.bounds.east-c.bounds.west)*Math.PI/180*size);
        const heights=cells.map(c=>(c.northMercator-c.southMercator)*size);
        return {widthMin:widths.reduce((a,b)=>Math.min(a,b),Infinity),widthMax:widths.reduce((a,b)=>Math.max(a,b),0),heightMin:heights.reduce((a,b)=>Math.min(a,b),Infinity),heightMax:heights.reduce((a,b)=>Math.max(a,b),0)};
      });
      closeTo(uniform.widthMin,uniform.widthMax);closeTo(uniform.heightMin,uniform.heightMax);closeTo(uniform.widthMin,uniform.heightMin);
      checks.push(`${backend}: uniform square cells, all 47 prefectures pick canonical IDs`);
      checks.push(`${backend}: periodic rendered pixels, repeated posts/drafts/picking, 3 world drags, accumulated vertical drag, anchored pinch/wheel, keyboard`);
      const customRange=await page.evaluate(()=>{
        __renderer.setView({zoomRange:{min:.68,max:96},zoom:200}); __renderer.draw();
        const before=__renderer.getSnapshot().view; let rejected=false;
        try { __renderer.setView({zoomRange:{min:96,max:.68},zoom:1}); } catch { rejected=true; }
        const retained=JSON.stringify(before)===JSON.stringify(__renderer.getSnapshot().view);
        __renderer.setProjection('orthographic'); __renderer.draw(); const telescope=__renderer.getSnapshot().view.zoomRange.max;
        __renderer.setProjection('mercator'); __renderer.resetView(); __renderer.draw();
        return {zoom:before.zoom,max:before.zoomRange.max,rejected,retained,telescope,resetMax:__renderer.getSnapshot().view.zoomRange.max};
      });
      assert.deepEqual(customRange,{zoom:96,max:96,rejected:true,retained:true,telescope:96,resetMax:96});
      checks.push(`${backend}: explicit runtime zoom range retained through projection/reset; invalid range preserves prior state`);

    } finally { await context.close(); }
  }
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]) {
    const {context,page,requests}=await setup(viewport);
    try {
      assert.ok(requests.some(url=>url.includes('globe-land-mask-v1.json')),'fine canvas reuses canonical geographic data');
      assert.ok(!requests.some(url=>url.includes('real-sky-v1.bin')),'flat map does not fetch the star catalogue');
      const skyDraws=await page.evaluate(()=>Object.entries(__drawCounts).filter(([key])=>key.startsWith('skyCanvas:')).reduce((sum,[,count])=>sum+count,0));
      assert.equal(skyDraws,0,'hidden sky does not draw in map mode');
      assert.equal(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().plan.featureMode),'mercator-uniform-cells');
      if (viewport.width === 1280) {
        const measurement = await page.evaluate(async () => {
          window.__drawCounts = {};
          const intervals = []; let previous = performance.now();
          for (let i=0; i<90; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const time = performance.now(); intervals.push(time-previous); previous=time;
            __PIXIEED_GLOBE__.setView({centerLongitude:139.69+i*.5,centerLatitude:35.6895,zoom:8});
          }
          intervals.sort((a,b)=>a-b);
          const snapshot=__PIXIEED_GLOBE__.getSnapshot();
          return {viewport:'1280x800',frames:90,frameMedianMs:intervals[45],frameP95Ms:intervals[85],drawCounts:__drawCounts,cellCount:snapshot.plan.mask.cellCount,sourceCellCount:snapshot.plan.mask.sourceCellCount};
        });
        assert.ok(Object.keys(measurement.drawCounts).every(key=>!key.startsWith('skyCanvas:')));
        performanceResults.push(measurement);
        const alignedGrid = await page.evaluate(() => {
          // Integer-sized tiles must show both axes even when grid boundaries
          // fall between framebuffer sample centers (the 1280 x 800 case).
          const n=__PIXIEED_GLOBE__.getSnapshot().plan.mask.width,col=Math.floor(40/360*n),row=Math.floor(n/2);
          __PIXIEED_GLOBE__.setView({centerLongitude:-180+(col+.5)/n*360,centerLatitude:(2*Math.atan(Math.exp(Math.PI-(row+.5)/n*Math.PI*2))-Math.PI/2)*180/Math.PI,zoom:24});
          __PIXIEED_GLOBE__.draw();
          const c=document.querySelector('#globeCanvas'),gl=c.getContext('webgl2'),s=__PIXIEED_GLOBE__.getSnapshot(),d=s.camera.viewport.dpr,step=s.camera.worldSize/n;
          const read=(x,y)=>{const a=new Uint8Array(4);gl.readPixels(Math.floor(x*d),c.height-1-Math.floor(y*d),1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);return [...a].slice(0,3);};
          const x=s.camera.viewport.centerX,y=s.camera.viewport.centerY;
          return {center:read(x,y),west:read(x-step/2+.1,y),north:read(x,y-step/2+.1),cellCount:s.metrics.cellCount,expectedCellCount:s.plan.mask.cellCount};
        });
        assert.deepEqual(alignedGrid.center,[10,27,38]);
        assert.notDeepEqual(alignedGrid.center,alignedGrid.west,'aligned vertical grid remains visible');
        assert.notDeepEqual(alignedGrid.center,alignedGrid.north,'aligned horizontal grid remains visible');
        assert.equal(alignedGrid.cellCount,alignedGrid.expectedCellCount,'rendered land-cell count matches the generated index after prefecture/admin1 patches');
        checks.push('1280x800: both grid axes visible at framebuffer-aligned tile boundaries');
        await page.evaluate(()=>__PIXIEED_GLOBE__.resetView());await frame(page);
      }
      const layout=await page.evaluate(()=>{const r=__PIXIEED_GLOBE__.getSnapshot();const controls=[...document.querySelectorAll('[data-map-content],.post-dock button,.globe-app-tabs a,.globe-app-tabs button')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {hit:e===hit||e.contains(hit),width:b.width,height:b.height};});const hint=document.querySelector('.gesture-hint').getBoundingClientRect(),dock=document.querySelector('.post-dock').getBoundingClientRect();return {projection:r.camera.projection,filled:r.camera.worldSize>=r.camera.viewport.height,overflow:document.documentElement.scrollWidth>innerWidth,controls,hintOverlap:hint.width>0&&hint.bottom>dock.top&&hint.top<dock.bottom,hintControlOverlap:[...document.querySelectorAll('[data-map-content]')].some(e=>{const b=e.getBoundingClientRect();return hint.width>0&&hint.left<b.right&&hint.right>b.left&&hint.top<b.bottom&&hint.bottom>b.top;})};});
      assert.equal(layout.projection,'mercator');assert.equal(layout.filled,true);assert.equal(layout.overflow,false);assert.equal(layout.hintOverlap,false);assert.equal(layout.hintControlOverlap,false);assert.ok(layout.controls.every(c=>c.hit&&c.width>=43.9&&c.height>=43.9));
      await page.screenshot({path:`/tmp/pixieed-mercator-${viewport.width}x${viewport.height}.png`});
      await verifySeaZoom(page,context,requests,'__PIXIEED_GLOBE__');
      await page.evaluate(()=>{__PIXIEED_GLOBE__.setView({centerLongitude:2.3522,centerLatitude:48.8566,zoom:64});__PIXIEED_GLOBE__.draw();});
      const expectedFrance = await page.evaluate(() => {
        const renderer = __PIXIEED_GLOBE__;
        const camera = renderer.getSnapshot().camera;
        const picked = renderer.pickAt(camera.viewport.centerX,camera.viewport.centerY);
        const record = picked?.displayCell || picked;
        const country = record?.countryLabel || picked?.countryLabel || picked?.countryId;
        const prefecture = record?.prefectureLabel || picked?.prefectureLabel;
        if (prefecture) return prefecture;
        const region = record?.mapRegionLabel || picked?.mapRegionLabel;
        const kind = record?.mapRegionKind || picked?.mapRegionKind;
        return [country === 'Japan' || country === 'JPN' ? '日本' : country, kind === 'country' ? null : region].filter(Boolean).join(' · ') || picked?.ownerLabel || '土地セル';
      });
      const foreignRect=await page.locator('#globeCanvas').boundingBox();
      const foreignPoint={x:foreignRect.x+foreignRect.width/2,y:foreignRect.y+foreignRect.height/2};
      await page.mouse.move(foreignPoint.x,foreignPoint.y);await frame(page);
      assert.equal(await page.locator('[data-cell-name]').innerText(),expectedFrance);
      await page.mouse.click(foreignPoint.x,foreignPoint.y);await frame(page);
      assert.equal(await page.locator('#selectedOwner').innerText(),expectedFrance);
      await page.screenshot({path:`/tmp/pixieed-map-foreign-${viewport.width}.png`});
      checks.push(`${viewport.width}x${viewport.height}: actual overseas hover/selection say France, sea gestures reach 128 without loads`);
      await page.evaluate(()=>__PIXIEED_GLOBE__.resetView());await frame(page);
      const rect=await page.locator('#globeCanvas').boundingBox();
      const before=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLongitude);
      await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await page.mouse.down();
      await page.mouse.move(rect.x+rect.width*.5+40,rect.y+rect.height*.5,{steps:5});await frame(page);
      const moved=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLongitude);
      assert.ok(Math.abs(moved-before)>1,'native mouse drag pans the actual map');await page.mouse.up();
      await page.evaluate(()=>__PIXIEED_GLOBE__.resetView());await frame(page);
      if(viewport.width===390) {
        const cdp=await context.newCDPSession(page);const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
        const startZoom=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-60,y,id:1},{x:x+60,y,id:2}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(page);
        assert.ok(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom)>startZoom*1.5,'native touch pinch zooms actual page');await cdp.detach();
      }
      const viewBeforeSwitch=await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view);
      await page.locator('[data-map-content="events"]').click();await frame(page);
      assert.equal(await page.locator('[data-map-content="events"]').getAttribute('aria-pressed'),'true');
      assert.deepEqual(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view),viewBeforeSwitch,'content switch preserves camera');
      assert.equal(await page.evaluate(()=>Boolean(globalThis.__PIXIEED_ASTRO__)),false);
      assert.equal(await page.locator('.time-capsule,[data-astro-view],.orrery-canvas,.scope-hud').count(),0);
      await page.locator('[data-map-content="posts"]').click();await frame(page);
      assert.equal(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().camera.projection),'mercator');
      assert.ok(!requests.some(url=>url.includes('/astro-ui.mjs')||url.includes('/real-sky.mjs')||url.includes('/orrery.mjs')),'map does not load astronomy modules');
      checks.push(`${viewport.width}x${viewport.height}: actual page layout, content switch keeps camera, no astronomy`);
    }finally{await context.close();}
  }
  for(const viewport of [{width:390,height:844},{width:1280,height:800}]) {
    const {context,page,requests}=await setup(viewport);
    try {
      await page.goto(`${base}/globe/`,{waitUntil:'domcontentloaded'});
      const iframe=page.frameLocator('.map-hero__globe-frame');
      await iframe.locator('#globeCanvas').waitFor();
      await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.__PIXIEED_GLOBE__?.getSnapshot()?.camera?.projection==='mercator');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      checks.push(`${viewport.width}x${viewport.height}: public /globe/ iframe uses Mercator without horizontal overflow`);
    }finally{await context.close();}
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',checks,performanceResults,errors,limits:'Local Chromium and synthetic posts only; devices, Safari, production and live posting untested.'},null,2));
}finally{await browser.close();}
