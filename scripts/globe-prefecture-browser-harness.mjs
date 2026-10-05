#!/usr/bin/env node
// Regression coverage on the real local map with isolated public records; no external writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createMapCellIndex, lookupMapCell } from '../js/globe/map-cells.mjs';
import { lookupCell, inverseMercatorY } from '../js/globe/geometry.mjs';
import { classifyEvent, tokyoDate } from '../js/globe/event-density.mjs';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const source = JSON.parse(await readFile(new URL('../assets/maps/globe-land-mask-v1.json', import.meta.url)));
const prefectureData = JSON.parse(await readFile(new URL('../assets/maps/map-prefectures-v1.json', import.meta.url)));
const admin1Data = JSON.parse(await readFile(new URL('../assets/maps/map-admin1-v1.json', import.meta.url)));
const index = createMapCellIndex(source, { prefectureData, admin1Data });
assert.equal(index.admin1Data.landAuthority, 'admin1-geometries', 'display land and admin ownership use the same boundary source');
const foreignCoasts = [[151.2093,-33.8688,'AUS','admin1:AUS:NE-AUS-2654'],[-122.3321,47.6062,'USA','admin1:USA:US-WA']];
const removedCoast={longitude:-73.916015625,latitude:40.51379915504414};
function displayPoint(code, longitude, latitude, region = false) {
  let best, distance = Infinity;
  for (const key of (region ? index.mapRegionTiles : index.prefectureTiles).get(code)) {
    const row = Math.floor(key / index.resolution), column = key % index.resolution;
    const center = { longitude: -180 + (column + .5) / index.resolution * 360, latitude: inverseMercatorY(Math.PI - (row + .5) / index.resolution * Math.PI * 2) };
    const score = (longitude - center.longitude) ** 2 + (latitude - center.latitude) ** 2;
    if (score < distance) { best = center; distance = score; }
  }
  return best;
}
const sapporo = {longitude:141.3545,latitude:43.0618}, hakodate = {longitude:140.7288,latitude:41.7687};
const tokyo = {longitude:139.6917,latitude:35.6895}, kawasaki = {longitude:139.702,latitude:35.5308};
const a = displayPoint('01',142,43.2), b = displayPoint('01',143.5,43.8), kanagawa = displayPoint('14',139.45,35.38), tokyoCell = displayPoint('13',139.55,35.67);
assert.notEqual(lookupMapCell(a.longitude,a.latitude,index).displayCellId,lookupMapCell(b.longitude,b.latitude,index).displayCellId);
const sf = {longitude:-122.4194,latitude:37.7749}, la = {longitude:-118.2437,latitude:34.0522}, vegas = {longitude:-115.1398,latitude:36.1699};
const caA = displayPoint('admin1:USA:US-CA',-120.5,37,true), caB = displayPoint('admin1:USA:US-CA',-119,36.4,true), nv = displayPoint('admin1:USA:US-NV',-117,38.4,true);
const future = {startDate:'2099-01-01',endDate:'2099-01-01',sourceUrl:'https://example.com/event'};
const events = [
 {id:'hokkaido-sapporo',name:'北海道イベント札幌',prefecture:'北海道',location:sapporo,...future},
 {id:'hokkaido-hakodate',name:'北海道イベント函館',location:hakodate,...future},
 {id:'hokkaido-past',name:'北海道開催履歴',prefecture:'北海道',startDate:'2020-01-01',endDate:'2020-01-01',sourceUrl:'https://example.com/past'},
 {id:'kanagawa',name:'川崎の座標イベント',location:kawasaki,...future},
 {id:'tokyo',name:'東京の座標イベント',location:tokyo,...future},
 {id:'sf',name:'カリフォルニアのイベント北',location:sf,...future},
 {id:'la',name:'カリフォルニアのイベント南',location:la,...future},
 {id:'vegas',name:'ネバダのイベント',location:vegas,...future},
 {id:'paris',name:'海外イベント',location:{longitude:2.3522,latitude:48.8566},...future}
];
const image = {dataUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16"%3E%3Cpath fill="red" d="M0 0h16v16H0z"/%3E%3C/svg%3E',width:16,height:16};
const posts = [['sapporo','札幌の作品',sapporo],['hakodate','函館の作品',hakodate],['tokyo','東京の作品',tokyo],['kawasaki','川崎の作品',kawasaki],['sf','カリフォルニア北',sf],['la','カリフォルニア南',la],['vegas','ネバダの作品',vegas]].map(([id,title,pin])=>({id,title,pin:{...pin,cellId:lookupCell(pin.longitude,pin.latitude).id},image,author:{id:'fixture',name:'Fixture'},createdAt:1700000000000}));
const storeModule = `const posts=${JSON.stringify(posts)};export function createSupabaseGlobeStore(){return {ready:Promise.resolve(),list:()=>posts,subscribe:()=>()=>{}};}export function createSupabaseGlobeAuth(){return {getUser:()=>({id:'fixture',name:'Fixture'}),subscribe:()=>()=>{}};}`;
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true}), checks = [];
try {
 for (const [backend,viewport] of [['gpu',{width:1280,height:800}],['gpu',{width:390,height:844}],['canvas',{width:390,height:844}]]) {
  const context = await browser.newContext({viewport,hasTouch:true});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='script.google.com')return r.fulfill({contentType:'application/json',body:JSON.stringify({events,works:[],stores:[]})});if(u.pathname==='/data/pixel-art-events.json')return r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,updatedAt:'2026-10-05T00:00:00Z',events:[]})});if(u.pathname==='/js/globe/post-supabase.mjs')return r.fulfill({contentType:'text/javascript',body:storeModule});return u.origin===new URL(base).origin?r.continue():r.abort();});
  await context.addInitScript(force=>{window.__textureUploads=0;for(const name of ['texImage2D','texSubImage2D']){const fn=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){__textureUploads++;return fn.apply(this,args);};}if(force){const fn=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(name,...args){return name==='webgl2'?null:fn.call(this,name,...args);};}},backend==='canvas');
  const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>requests.push(r.url()));
  await page.goto(base+'/globe-prototype.html?embed=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__PIXIEED_MAP_EVENTS__&&window.__PIXIEED_POSTS__);await page.evaluate(()=>__PIXIEED_MAP_EVENTS__.ready);
  assert.equal(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().metrics.backend),backend==='gpu'?'webgl2':'canvas2d');
  assert.equal(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLatitude),35.6895,'initial Japan view does not drift toward the ocean');
  const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const setView=async(center,zoom=18)=>{await page.evaluate(({center,zoom})=>__PIXIEED_GLOBE__.setView({centerLongitude:center.longitude,centerLatitude:center.latitude,zoom}),{center,zoom});await frames();};
  const at=point=>page.evaluate(point=>{const c=__PIXIEED_GLOBE__.getSnapshot().camera,r=document.querySelector('#globeCanvas').getBoundingClientRect();return {x:r.left+c.viewport.centerX+((point.longitude-c.centerLongitude+540)%360-180)*Math.PI/180*c.scale,y:r.top+c.viewport.centerY-(Math.log(Math.tan(Math.PI/4+point.latitude*Math.PI/360))-c.centerMercatorY)*c.scale};},point);
  const selection=point=>page.evaluate(point=>{const r=__PIXIEED_GLOBE__,c=r.getSnapshot().camera;return r.pickAt(c.viewport.centerX+((point.longitude-c.centerLongitude+540)%360-180)*Math.PI/180*c.scale,c.viewport.centerY-(Math.log(Math.tan(Math.PI/4+point.latitude*Math.PI/360))-c.centerMercatorY)*c.scale);},point);
  const readColor=point=>page.evaluate(point=>{const r=__PIXIEED_GLOBE__;r.resize();r.draw();const c=r.getSnapshot().camera,canvas=document.querySelector('#globeCanvas'),d=c.viewport.dpr;const x=Math.floor((c.viewport.centerX+((point.longitude-c.centerLongitude+540)%360-180)*Math.PI/180*c.scale)*d),y=Math.floor((c.viewport.centerY-(Math.log(Math.tan(Math.PI/4+point.latitude*Math.PI/360))-c.centerMercatorY)*c.scale)*d);const gl=canvas.getContext('webgl2');if(gl){const out=new Uint8Array(4);gl.readPixels(x,canvas.height-y-1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);return [...out].slice(0,3);}return [...canvas.getContext('2d').getImageData(x,y,1,1).data].slice(0,3);},point);
  for(const [point,code] of [[sapporo,'01'],[hakodate,'01'],[tokyo,'13'],[kawasaki,'14']])assert.equal(await page.evaluate(point=>__PIXIEED_GLOBE__.getMapLocation(point.longitude,point.latitude)?.prefectureId,point),code);
  await setView({longitude:142.7,latitude:43.5});
  const sa=await selection(a),sb=await selection(b);assert.equal(sa.mapRegionId,'prefecture:01');assert.equal(sb.mapRegionId,sa.mapRegionId);assert.equal(await page.evaluate(s=>__PIXIEED_POSTS__.getCellSummary(s).count,sa),2);assert.equal(await page.evaluate(s=>__PIXIEED_POSTS__.getCellSummary(s).count,sb),2);
  assert.deepEqual(await readColor(a),[119,170,255]);assert.deepEqual(await readColor(b),[119,170,255]);
  await page.locator('[data-map-content="events"]').click();await frames();assert.deepEqual(await readColor(a),[234,122,66]);assert.deepEqual(await readColor(b),[234,122,66]);
  const pa=await at(a);await page.mouse.move(pa.x,pa.y);await frames();assert.match(await page.locator('#cellTooltip').textContent(),/北海道/);assert.match(await page.locator('#cellTooltip').textContent(),/イベント 2件/);
  const hoverB=await readColor(b);assert.notDeepEqual(hoverB,[234,122,66],'hover highlights another pixel of the same prefecture');
  const pb=await at(b);await page.mouse.move(pb.x,pb.y);await frames();assert.equal(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().hovered.mapRegionId),'prefecture:01');
  await page.mouse.click(pb.x,pb.y);await frames();assert.equal(await page.locator('#selectedOwner').textContent(),'北海道');assert.equal(await page.locator('#selectedPostCount').textContent(),'2');await page.locator('#viewCellPosts').click();assert.match(await page.locator('.map-events-panel h2').textContent(),/北海道.*2件/);assert.equal(await page.locator('.map-event-card').count(),2);assert.ok((await page.locator('.map-event-card h3').allTextContents()).includes('北海道イベント函館'));
  await page.keyboard.press('Escape');await page.locator('[data-map-content="posts"]').click();await page.locator('#viewCellPosts').click();assert.equal(await page.locator('.gallery h2').textContent(),'北海道の投稿');assert.equal(await page.locator('.gallery .tile').count(),2);await page.locator('.gallery .tile').first().click();assert.equal(await page.locator('[data-v-coords]').textContent(),'北海道');assert.equal(new URL(await page.locator('[data-v-map]').getAttribute('href')).searchParams.get('query'),'北海道');assert.ok((await page.evaluate(expected=>__PIXIEED_POSTS__.getPosts().every((p,i)=>p.pin.latitude===expected[i].pin.latitude&&p.pin.longitude===expected[i].pin.longitude&&p.pin.cellId===expected[i].pin.cellId),posts)));
  await page.keyboard.press('Escape');await page.evaluate(()=>__PIXIEED_GLOBE__.clearSelection());await setView(kanagawa,36);const sk=await selection(kanagawa),st=await selection(tokyoCell);assert.equal(sk.prefectureId,'14');assert.equal(st.prefectureId,'13');assert.equal(await page.evaluate(s=>__PIXIEED_POSTS__.getCellSummary(s).count,sk),1);assert.equal(await page.evaluate(s=>__PIXIEED_MAP_EVENTS__.getCellSummary(s).count,sk),1);
  await setView({longitude:-150,latitude:0},128);assert.equal(await page.evaluate(()=>{const r=__PIXIEED_GLOBE__,c=r.getSnapshot().camera;return r.pickAt(c.viewport.centerX,c.viewport.centerY);}),null);
  await setView({longitude:2.3522,latitude:48.8566},24);assert.equal(await page.evaluate(()=>{const r=__PIXIEED_GLOBE__,c=r.getSnapshot().camera;return r.pickAt(c.viewport.centerX,c.viewport.centerY)?.countryId;}),'FRA');
  for (const [longitude,latitude,countryId] of [[-122.4194,37.7749,'USA'],[-74.006,40.7128,'USA'],[-79.3832,43.6532,'CAN'],[151.2093,-33.8688,'AUS'],[116.4074,39.9042,'CHN'],[2.3522,48.8566,'FRA'],[11.582,48.1351,'DEU'],[-46.6333,-23.5505,'BRA'],[77.209,28.6139,'IND'],[126.978,37.5665,'KOR']]) {
    const region = await page.evaluate(point=>__PIXIEED_GLOBE__.getMapLocation(point.longitude,point.latitude),{longitude,latitude});
    assert.equal(region?.countryId,countryId);assert.equal(region?.mapRegionKind,'admin1');assert.ok(region.mapRegionLabel && region.mapRegionLabel!=='海');
  }
  // These coast pixels were clipped by the old country mask, or lost their state.
  await page.evaluate(()=>__PIXIEED_GLOBE__.clearSelection());await page.mouse.move(0,0);
  for (const [longitude,latitude,countryId,mapRegionId] of foreignCoasts) {
    const point={longitude,latitude};await setView(point,48);
    const displayed=await selection(point);
    assert.equal(displayed?.countryId,countryId,'coastal display pixel is land in the correct country');
    assert.equal(displayed?.mapRegionId,mapRegionId,'coastal display pixel uses the detailed admin boundary');
    const located=await page.evaluate(p=>__PIXIEED_GLOBE__.getMapLocation(p.longitude,p.latitude),point);
    assert.equal(located?.mapRegionId,mapRegionId,'display and coordinate ownership agree at the coastal probe');
    assert.deepEqual(await readColor(displayed.center),[97,192,170],'GPU and Canvas actually paint the restored coastal land');
  }
  await setView(removedCoast,48);
  assert.equal(await selection(removedCoast),null,'old country fallback cannot invent New York land outside admin geometry');
  assert.equal(await page.evaluate(p=>__PIXIEED_GLOBE__.getMapLocation(p.longitude,p.latitude),removedCoast),null);
  assert.deepEqual(await readColor(removedCoast),[10,27,38],'removed coastal land is actually painted as sea');
  await page.evaluate(()=>__PIXIEED_GLOBE__.clearSelection());await setView({longitude:-119.6,latitude:37.5},24);
  const sca=await selection(caA),scb=await selection(caB),snv=await selection(nv);
  assert.equal(sca.mapRegionId,'admin1:USA:US-CA');assert.equal(scb.mapRegionId,sca.mapRegionId);assert.equal(snv.mapRegionId,'admin1:USA:US-NV');assert.ok(sca.mapRegionIndex>255,'world region IDs need sixteen bits');
  assert.equal(await page.evaluate(s=>__PIXIEED_MAP_EVENTS__.getCellSummary(s).count,sca),2);assert.equal(await page.evaluate(s=>__PIXIEED_MAP_EVENTS__.getCellSummary(s).count,snv),1);
  await page.locator('[data-map-content="posts"]').click();await frames();assert.equal(await page.evaluate(s=>__PIXIEED_POSTS__.getCellSummary(s).count,sca),2);assert.equal(await page.evaluate(s=>__PIXIEED_POSTS__.getCellSummary(s).count,snv),1);
  assert.deepEqual(await readColor(caA),[119,170,255]);assert.deepEqual(await readColor(caB),[119,170,255]);
  await page.locator('[data-map-content="events"]').click();await frames();assert.deepEqual(await readColor(caA),[234,122,66]);assert.deepEqual(await readColor(caB),[234,122,66]);
  const pca=await at(caA);await page.mouse.move(pca.x,pca.y);await frames();assert.match(await page.locator('#cellTooltip').textContent(),/カリフォルニア|California/);const tipBounds=await page.locator('#cellTooltip').boundingBox();assert.ok(tipBounds.x>=0&&tipBounds.y>=0&&tipBounds.x+tipBounds.width<=viewport.width&&tipBounds.y+tipBounds.height<=viewport.height,'foreign hover text fits viewport');assert.notDeepEqual(await readColor(caB),[234,122,66],'hover highlights whole foreign state');
  await page.mouse.click(pca.x,pca.y);await frames();const caLabel=await page.locator('#selectedOwner').textContent();assert.match(caLabel,/United States|アメリカ|米国/);assert.match(caLabel,/カリフォルニア|California/);await page.locator('#viewCellPosts').click();assert.equal(await page.locator('.map-event-card').count(),2);assert.ok(!(await page.locator('.map-event-card h3').allTextContents()).includes('ネバダのイベント'));
  await page.keyboard.press('Escape');await page.locator('[data-map-content="posts"]').click();await page.locator('#viewCellPosts').click();assert.equal(await page.locator('.gallery .tile').count(),2);assert.match(await page.locator('.gallery h2').textContent(),/カリフォルニア|California/);await page.locator('.gallery .tile').first().click();assert.equal(await page.locator('[data-v-coords]').textContent(),caLabel);assert.equal(new URL(await page.locator('[data-v-map]').getAttribute('href')).searchParams.get('query'),caLabel);await page.keyboard.press('Escape');await page.evaluate(()=>__PIXIEED_GLOBE__.clearSelection());
  const starts={requests:requests.length,uploads:await page.evaluate(()=>__textureUploads)};await page.evaluate(async()=>{for(let i=0;i<12;i++){__PIXIEED_GLOBE__.setView({zoom:i%2?18:36});await new Promise(requestAnimationFrame);}});await frames();assert.equal(requests.length,starts.requests);assert.equal(await page.evaluate(()=>__textureUploads),starts.uploads);
  await page.locator('#globeCanvas').press('0');await page.waitForFunction(()=>Math.abs(__PIXIEED_GLOBE__.getSnapshot().view.zoom-8)<1e-8);assert.equal(await page.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLatitude),35.6895);
  await setView({longitude:142.7,latitude:43.5});await page.locator('[data-map-content="events"]').click();const p=await at(a);if(viewport.width===390)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await frames();assert.equal(await page.locator('#selectedOwner').textContent(),'北海道');
  await page.mouse.move(0,0);await page.screenshot({path:'/tmp/pixieed-prefecture-'+backend+'-'+viewport.width+'.png'});
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,rect:document.querySelector('#selectionPanel').getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight}));assert.equal(layout.overflow,false);assert.ok(layout.rect.right<=layout.width&&layout.rect.bottom<=layout.height);
  assert.deepEqual(errors,[]);checks.push(`${backend} ${viewport.width}: correct detailed Tokyo/Kanagawa ownership, all Hokkaido cells share hover/selection/event/post scope, original pins preserved, nine foreign countries' admin1 resolved, Sydney/Seattle coast paint and ownership agree, false New York coast land removed, California shared state hover/events/posts/viewer, neighboring Nevada separated, sea retained, zoom fetch/upload zero, responsive tap`);await context.close();
 }
 // The deliverable screenshot uses the actual research catalog, separately from fixtures.
 const actualContext = await browser.newContext({viewport:{width:1280,height:800}});
 await actualContext.route('**/*', r => {
  const u = new URL(r.request().url());
  if (u.hostname === 'script.google.com') return r.fulfill({contentType:'application/json',body:JSON.stringify({events:[],works:[],stores:[]})});
  if (u.pathname === '/js/globe/post-supabase.mjs') return r.fulfill({contentType:'text/javascript',body:'export function createSupabaseGlobeStore(){return {ready:Promise.resolve(),list:()=>[],subscribe:()=>()=>{}};}export function createSupabaseGlobeAuth(){return {getUser:()=>null,subscribe:()=>()=>{}};}'});
  return u.origin === new URL(base).origin ? r.continue() : r.abort();
 });
 const actualPage = await actualContext.newPage();
 await actualPage.goto(base+'/globe/', {waitUntil:'domcontentloaded'});
 const actualFrame = actualPage.frames().find(f => f.url().includes('globe-prototype'));
 await actualFrame.waitForFunction(() => window.__PIXIEED_MAP_EVENTS__);
 await actualFrame.evaluate(() => __PIXIEED_MAP_EVENTS__.ready);
 const catalog = JSON.parse(await readFile(new URL('../data/pixel-art-events.json',import.meta.url)));
 const realCount = catalog.events.filter(e => e.prefecture === '北海道' && ['upcoming','active'].includes(classifyEvent(e,tokyoDate()))).length;
 assert.equal(await actualFrame.evaluate(() => __PIXIEED_MAP_EVENTS__.getEvents().length),catalog.events.length);
 await actualFrame.evaluate(() => __PIXIEED_GLOBE__.setView({centerLongitude:136,centerLatitude:36,zoom:8}));
 await actualFrame.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
 await actualPage.screenshot({path:"/tmp/pixieed-map-regions-japan-actual.png"});
 await actualFrame.locator('[data-map-content="events"]').click();
 await actualFrame.evaluate(() => __PIXIEED_GLOBE__.setView({centerLongitude:142.7,centerLatitude:43.5,zoom:18}));
 await actualFrame.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
 const canvasBox = await actualFrame.locator('#globeCanvas').boundingBox();
 await actualPage.mouse.click(canvasBox.x+canvasBox.width/2,canvasBox.y+canvasBox.height/2);
 assert.equal(await actualFrame.locator('#selectedOwner').textContent(),'北海道');
 assert.equal(await actualFrame.locator('#selectedPostCount').textContent(),String(realCount));
 await actualPage.mouse.move(0,0);
 await actualPage.screenshot({path:'/tmp/pixieed-prefecture-hokkaido-actual.png'});
 await actualFrame.locator('#viewCellPosts').click();
 assert.equal(await actualFrame.locator('.map-events-panel h2').textContent(),`北海道のイベント · ${realCount}件`);
 assert.equal(await actualFrame.locator('.map-event-card').count(),realCount);
 await actualPage.screenshot({path:'/tmp/pixieed-prefecture-hokkaido-events-actual.png'});
 await actualPage.keyboard.press('Escape');
 await actualFrame.evaluate(()=>__PIXIEED_GLOBE__.clearSelection());
 await actualFrame.evaluate(()=>__PIXIEED_GLOBE__.setView({centerLongitude:2.3522,centerLatitude:48.8566,zoom:26}));
 await actualFrame.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 await actualPage.mouse.click(canvasBox.x+canvasBox.width/2,canvasBox.y+canvasBox.height/2);
 assert.match(await actualFrame.locator('#selectedOwner').textContent(),/France|フランス/);
 const actualRegion=await actualFrame.evaluate(()=>{const r=__PIXIEED_GLOBE__,c=r.getSnapshot().camera;return r.pickAt(c.viewport.centerX,c.viewport.centerY);});
 assert.equal(actualRegion.mapRegionKind,'admin1');
 assert.equal(await actualFrame.locator('#selectedOwner').textContent(),`${actualRegion.countryLabel} · ${actualRegion.mapRegionLabel}`);
 await actualPage.mouse.move(0,0);
 await actualPage.screenshot({path:'/tmp/pixieed-map-regions-paris-actual.png'});
 await actualFrame.evaluate(()=>__PIXIEED_GLOBE__.clearSelection());
 await actualFrame.evaluate(()=>__PIXIEED_GLOBE__.setView({centerLongitude:151.2093,centerLatitude:-33.8688,zoom:48}));
 await actualFrame.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 await actualPage.mouse.click(canvasBox.x+canvasBox.width/2,canvasBox.y+canvasBox.height/2);
 assert.match(await actualFrame.locator('#selectedOwner').textContent(),/New South Wales|ニューサウスウェールズ/);
 await actualPage.mouse.move(0,0);
 await actualPage.screenshot({path:'/tmp/pixieed-map-boundaries-sydney-actual.png'});
 await actualContext.close();
 checks.push(`actual research catalog: Hokkaido entire area highlighted, its ${realCount} upcoming events listed`);
 console.log(JSON.stringify({result:'PASS',checks},null,2));
}finally{await browser.close();}
