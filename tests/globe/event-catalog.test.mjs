import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readEventCatalog, mergeEventCatalog } from '../../js/globe/event-catalog.mjs';
const event={id:'a',name:'Event',sourceUrl:'https://example.com/event',checkedAt:'2026-10-05T13:21:19+09:00',startDate:'2026-10-11',endDate:'2026-10-11',status:'upcoming'};
const catalog=events=>({version:1,updatedAt:event.checkedAt,events});
test('checked-in research has official sources and valid dates without invented online coordinates',async()=>{
  const payload=JSON.parse(await readFile(new URL('../../data/pixel-art-events.json',import.meta.url),'utf8'));
  const records=readEventCatalog(payload);assert.ok(records.length>=7);
  assert.ok(records.filter(e=>e.online).every(e=>!e.location&&!e.latitude&&!e.longitude&&!e.prefecture));
  assert.ok(records.filter(e=>e.status==='watch').every(e=>!e.startDate&&!e.endDate));
  assert.equal(new Set(records.map(e=>e.id)).size,records.length);
});
test('invalid researched data rejects the entire replacement so callers keep the last good data',()=>{
  for(const bad of [{...event,sourceUrl:'javascript:alert(1)'},{...event,checkedAt:''},{...event,startDate:'2026-02-30'},{...event,endDate:'2026-10-01'},{...event,status:'watch'},{...event,id:''},{...event,deadlineAt:'not-a-time'},{...event,deadlineAt:'2025-12-31T00:00:00Z'}]) assert.throws(()=>readEventCatalog(catalog([bad])));
  assert.throws(()=>readEventCatalog(catalog([event,event])));
  assert.deepEqual(readEventCatalog(catalog([])),[]);
});
test('verified overlay survives public updates; newer verified API data wins; editions stay separate',()=>{
  const stale={...event,name:'Stale',checkedAt:'2026-10-01T00:00:00Z',venue:'Venue'};
  const merged=mergeEventCatalog([stale],[event]);assert.equal(merged.length,1);assert.equal(merged[0].name,'Event');assert.equal(merged[0].venue,'Venue');
  assert.equal(mergeEventCatalog([{...event,checkedAt:'2026-10-06T00:00:00Z',status:'cancelled'}],[event])[0].status,'cancelled');
  assert.equal(mergeEventCatalog([{...event,id:'alias',checkedAt:undefined}],[event]).length,1);
  assert.equal(mergeEventCatalog([{...event,id:'next',startDate:'2027-10-11',endDate:'2027-10-11'}],[event]).length,2);
  assert.equal(mergeEventCatalog([null,{name:42}],[]).length,0);
});
