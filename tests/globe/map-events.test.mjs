import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMapEvents } from '../../js/globe/map-events.mjs';
import { lookupCell } from '../../js/globe/geometry.mjs';
const center={latitude:35.6,longitude:139.7};
const representatives=[{prefectureId:'13',prefectureLabel:'東京都',center,cell:lookupCell(center.longitude,center.latitude)}];
test('legacy SVG percentages only become an explicitly approximate prefecture event',()=>{
  const [event]=normalizeMapEvents([{id:'a',name:'Event',prefecture:'東京都',mapPosition:{x:60,y:67}}],representatives);
  assert.equal(event.placement,'prefecture');assert.deepEqual(event.position,center);assert.equal(event.prefectureId,'13');
  const [unknown]=normalizeMapEvents([{name:'Unknown place',prefecture:'不明',mapPosition:{x:60,y:67}}],representatives);
  assert.equal(unknown.position,null);assert.equal(unknown.placement,null);
});
test('explicit numeric coordinates keep canonical identity; null and strings never become zero',()=>{
  const [event]=normalizeMapEvents([{name:'Exact',location:{lat:35.7,lng:139.8}}],representatives);
  assert.equal(event.placement,'coordinate');assert.deepEqual(event.position,{latitude:35.7,longitude:139.8});assert.equal(event.cellId,lookupCell(139.8,35.7).id);
  for(const value of [null,'',false,'35.7',NaN,Infinity,91]) {
    const [invalid]=normalizeMapEvents([{name:'No point',latitude:value,longitude:139.8}],representatives);
    assert.equal(invalid.position,null);
  }
});
test('area-level map anchors are used for placement and preserve their approximate precision',()=>{
  const anchor={latitude:39.4767,longitude:-0.3744,precision:'area',sourceUrl:'https://www.valencia.es/estadistica/Recull/Recull2021_Castellano.pdf'};
  const resolver=()=>({id:'valencia-cell',mapRegionId:'admin1:ESP:ES-VC',mapRegionIndex:3,mapRegionLabel:'Valencian Community',mapRegionKind:'admin1',countryId:'ESP',countryLabel:'Spain'});
  const [event]=normalizeMapEvents([{name:'Area-level event',locationPrecision:'area',mapAreaLocation:anchor}],[],resolver);
  assert.equal(event.placement,'region');
  assert.equal(event.locationPrecision,'area');
  assert.deepEqual(event.position,{latitude:anchor.latitude,longitude:anchor.longitude});
  assert.equal(event.mapRegionId,'admin1:ESP:ES-VC');
});
test('missing records remain empty; county aliases and zero coordinates are valid',()=>{
  assert.deepEqual(normalizeMapEvents(null,representatives),[]);
  assert.deepEqual(normalizeMapEvents([null,{},false],representatives),[]);
  assert.equal(normalizeMapEvents([{name:'Tokyo',prefecture:'東京'}],representatives)[0].prefectureId,'13');
  assert.deepEqual(normalizeMapEvents([{name:'Zero',latitude:0,longitude:0}],representatives)[0].position,{latitude:0,longitude:0});
  assert.equal(normalizeMapEvents([{name:'Top',latitude:35.7,longitude:139.8,location:{}}],representatives)[0].placement,'coordinate');
});
test('precise events resolve into prefecture scope while keeping exact coordinates and cell identity',()=>{
  const hokkaido={prefectureId:'01',prefectureLabel:'北海道',center:{latitude:43.06,longitude:141.35},cell:lookupCell(141.35,43.06)};
  const exactA={latitude:43.1,longitude:141.2};
  const exactB={latitude:41.8,longitude:140.7};
  const resolver=(longitude,latitude)=>({id:lookupCell(longitude,latitude).id,prefectureId:'01',prefectureLabel:'北海道',countryId:'JP'});
  const events=normalizeMapEvents([
    {name:'A',location:{lat:exactA.latitude,lng:exactA.longitude}},
    {name:'B',latitude:exactB.latitude,longitude:exactB.longitude}
  ],[hokkaido],resolver);
  assert.deepEqual(events.map(event=>event.prefectureId),['01','01']);
  assert.deepEqual(events.map(event=>event.placement),['prefecture','prefecture']);
  assert.deepEqual(events.map(event=>event.position),[null,null]);
  assert.deepEqual(events.map(event=>event.cellId),[null,null]);
  assert.equal(events[0].representativeCell,null);
});
test('overseas, sea, and unresolved coordinates do not inherit a Japanese prefecture',()=>{
  const records=[
    {name:'Overseas',latitude:48.8,longitude:2.3},
    {name:'Sea',latitude:40,longitude:150},
    {name:'Unresolved',latitude:35,longitude:135}
  ];
  const resolver=()=>null;
  const events=normalizeMapEvents(records,representatives,resolver);
  assert.deepEqual(events.map(event=>event.prefectureId),[null,null,null]);
  assert.deepEqual(events.map(event=>event.placement),['coordinate','coordinate','coordinate']);
});
test('overseas events normalize into admin1 regions with country and region labels',()=>{
  const resolver=(longitude)=>longitude < -100
    ? {id:`cell:${longitude}`,mapRegionId:'admin1:USA:US-CA',mapRegionIndex:6,mapRegionLabel:'California',mapRegionKind:'admin1',countryId:'USA',countryLabel:'United States'}
    : {id:`cell:${longitude}`,mapRegionId:'admin1:USA:US-NY',mapRegionIndex:33,mapRegionLabel:'New York',mapRegionKind:'admin1',countryId:'USA',countryLabel:'United States'};
  const records=[
    {name:'LA one',latitude:34,longitude:-118},
    {name:'LA two',latitude:37,longitude:-122},
    {name:'NY',latitude:41,longitude:-74}
  ];
  const events=normalizeMapEvents(records,[],resolver);
  assert.deepEqual(events.map(event=>event.mapRegionId),['admin1:USA:US-CA','admin1:USA:US-CA','admin1:USA:US-NY']);
  assert.deepEqual(events.map(event=>event.placement),['region','region','region']);
  assert.equal(events[0].countryLabel,'United States');
  assert.equal(events[0].mapRegionLabel,'California');
  assert.deepEqual(events[0].position,{latitude:34,longitude:-118});
  assert.equal(events[0].cellId,'cell:-118');
});
test('country-only coordinates fall back to country region; explicit Japan prefecture wins',()=>{
  const coords=[{latitude:49,longitude:-123},{latitude:43.1,longitude:141.2}];
  const resolver=(longitude)=>longitude < 0
    ? {id:'country-cell',mapRegionId:'country:CAN',mapRegionIndex:124,mapRegionLabel:'Canada',mapRegionKind:'country',countryId:'CAN',countryLabel:'Canada'}
    : {id:'hokkaido-cell',mapRegionId:'admin1:USA:US-AK',mapRegionIndex:3,mapRegionLabel:'Alaska',mapRegionKind:'admin1',countryId:'USA',countryLabel:'United States'};
  const events=normalizeMapEvents([
    {name:'Country only',latitude:coords[0].latitude,longitude:coords[0].longitude},
    {name:'Japan explicit',prefecture:'北海道',latitude:coords[1].latitude,longitude:coords[1].longitude}
  ],[],resolver);
  assert.equal(events[0].mapRegionId,'country:CAN');
  assert.equal(events[0].mapRegionKind,'country');
  assert.equal(events[0].placement,'region');
  assert.equal(events[1].prefectureId,'01');
  assert.equal(events[1].mapRegionId,'prefecture:01');
  assert.equal(events[1].mapRegionKind,'prefecture');
  assert.equal(events[1].mapRegionIndex,1);
  assert.equal(events[1].countryId,'JPN');
  assert.equal(events[1].prefectureLabel,'北海道');
});
test('a verified city name may use an explicitly supplied area point and resolve to its map region',()=>{
  const resolver=()=>({id:'takamatsu-cell',prefectureId:'37',prefectureLabel:'香川県',mapRegionId:'prefecture:37',mapRegionIndex:37,mapRegionLabel:'香川県',mapRegionKind:'prefecture',countryId:'JPN',countryLabel:'Japan'});
  const [event]=normalizeMapEvents([{name:'Takamatsu event',country:'日本',area:'高松市',locationPrecision:'area',mapAreaLocation:{latitude:34.3426,longitude:134.0465,precision:'area',sourceUrl:'https://mapcarta.com/Takamatsu'}}],[],resolver);
  assert.equal(event.mapRegionId,'prefecture:37');
  assert.equal(event.prefectureLabel,'香川県');
  assert.equal(event.locationPrecision,'area');
  assert.equal(event.position,null);
  assert.equal(event.placement,'prefecture');
});
test('a verified venue point maps to its prefecture without creating an exact point',()=>{
  const resolver=()=>({id:'takamatsu-tower-cell',prefectureId:'37',prefectureLabel:'香川県',mapRegionId:'prefecture:37',mapRegionIndex:37,mapRegionLabel:'香川県',mapRegionKind:'prefecture',countryId:'JPN',countryLabel:'日本'});
  const point={latitude:34.352301,longitude:134.047461,precision:'venue',sourceUrl:'https://www.navitime.co.jp/poi?spot=01315-00003650'};
  const [event]=normalizeMapEvents([{name:'e-とぴあ・かがわ',country:'日本',area:'高松市',locationPrecision:'venue',mapAreaLocation:point}],[],resolver);
  assert.equal(event.mapRegionId,'prefecture:37');
  assert.equal(event.locationPrecision,'venue');
  assert.equal(event.position,null);
  assert.equal(event.cellId,null);
});
test('verified venue coordinates for overseas records do not create a city level pin',()=>{
  const resolve=()=>({id:'bogota-cell',mapRegionId:'admin1:COL:CO-DC',mapRegionIndex:4,mapRegionLabel:'Bogotá D.C.',mapRegionKind:'admin1',countryId:'COL',countryLabel:'Colombia'});
  const [event]=normalizeMapEvents([{name:'SOFA pixel art talk',country:'コロンビア',area:'Bogotá',locationPrecision:'venue',mapAreaLocation:{latitude:4.629747,longitude:-74.090167}}],[],resolve,()=>null);
  assert.equal(event.mapRegionId,null);
  assert.equal(event.countryLevel,true);
  assert.equal(event.position,null);
  assert.equal(event.cellId,null);
});
test('known country names use country scope without a point, even when a city or building coordinate is known',()=>{
  const resolver=()=>null;
  const resolveCountry=id=>id==='TWN'?{mapRegionId:'country:TWN',mapRegionLabel:'Taiwan',mapRegionKind:'country',countryId:id,countryLabel:'Taiwan'}:null;
  const events=normalizeMapEvents([{name:'Kaohsiung',country:'台湾',area:'高雄市',locationPrecision:'venue',mapAreaLocation:{latitude:22.68901,longitude:120.31028}},{name:'Singapore',country:'シンガポール',area:'Orchard Road, Singapore',locationPrecision:'venue',mapAreaLocation:{latitude:1.30609,longitude:103.82871}}],[],resolver,resolveCountry);
  assert.equal(events[0].placement,'country');
  assert.equal(events[0].countryLevel,true);
  assert.equal(events[0].mapRegionId,null);
  assert.equal(events[0].position,null);
  assert.equal(events[0].cellId,null);
  assert.equal(events[1].placement,'country-unmapped');
  assert.equal(events[1].position,null);
  assert.equal(events[1].cellId,null);
  assert.equal(events[1].countryLabel,'シンガポール');
});
