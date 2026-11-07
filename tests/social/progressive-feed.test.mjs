import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialApi } from '../../js/social/api.mjs';
const config = { url: 'https://fixture.supabase.co', publishableKey: 'public-fixture', publicMapTable: 'post_map_points', publicStorageBucket: 'post-public' };
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const mapRow = n => ({ post_id:id(n), title:`Map ${n}`, caption:'', published_at:'2026-11-01T00:00:00Z', map_space:'globe', globe_cell_id:'globe:v11-meridian-parallel-quarter-degree:1:1', public_image_path:'fixture/art.png', post_kind:'pixel_art' });
const showcaseRow = n => ({ id:id(n), title:`Showcase ${n}`, caption:'', published_at:'2026-11-02T00:00:00Z', status:'published', post_kind:'image', distribution_mode:'showcase', media_object_path:'fixture/art.png' });
const snsRow = n => ({ id:id(n), title:`Text ${n}`, body:'', createdAt:'2026-11-03T00:00:00Z', kind:'text', visibility:'public' });
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ timeoutMs = 1000 } = {}) {
  const pending = new Map(); const requests = [];
  const fetchImpl = (value, init) => {
    const url = new URL(value); requests.push({ url, init });
    return new Promise((resolve, reject) => {
      pending.set(url.pathname, { resolve, reject });
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once:true });
    });
  };
  const answer = (path, body, status=200) => { assert.ok(pending.has(path), `request started: ${path}`); pending.get(path).resolve(new Response(JSON.stringify(body), {status})); };
  return { api:createSocialApi({config, fetchImpl, storage:null, timeoutMs}), pending, requests, answer };
}
test('starts all public sources together and publishes artwork before placement/text reads finish', async () => {
  const h=harness(), updates=[]; let complete=false;
  const result=h.api.list({onUpdate:posts=>updates.push(posts)}).then(posts=>{complete=true; return posts;});
  assert.deepEqual([...h.pending.keys()].sort(), ['/functions/v1/social-feed','/rest/v1/post_map_points','/rest/v1/social_posts']);
  h.answer('/rest/v1/social_posts',[showcaseRow(2)]); await tick();
  assert.equal(complete,false); assert.equal(updates[0][0].id,`showcase:${id(2)}`); assert.equal(updates[0][0].mapHref,null);
  h.answer('/rest/v1/post_map_points',[mapRow(1),mapRow(1),{...mapRow(9),public_image_path:'../private.png'}]); await tick();
  assert.equal(updates.at(-1).length,2); assert.equal(complete,false);
  h.answer('/functions/v1/social-feed',{ok:true,posts:[snsRow(3)]}); await tick();
  assert.equal(updates.at(-1).length,3); assert.equal(complete,false);
  h.answer('/rest/v1/social_post_map_points',[],404);
  const posts=await result;
  assert.deepEqual(posts.map(p=>p.source),['sns','showcase','map']);
  assert.equal(h.api.getReadWarnings().length,1);
  assert.ok(h.requests.every(({init})=>!init.headers.Authorization));
  assert.equal(JSON.parse(h.requests.find(x=>x.url.pathname.includes('/functions/')).init.body).action,'list');
});
test('enriches placement links without replacing unrelated post objects', async () => {
  const h=harness(), updates=[]; const result=h.api.list({onUpdate:posts=>updates.push(posts)});
  h.answer('/rest/v1/post_map_points',[mapRow(1)]); await tick(); const firstMap=updates[0][0];
  h.answer('/rest/v1/social_posts',[showcaseRow(2)]); await tick();
  h.answer('/functions/v1/social-feed',{ok:true,posts:[]});
  h.answer('/rest/v1/social_post_map_points',[{social_post_id:id(2),globe_cell_id:'globe:v11-meridian-parallel-quarter-degree:1:1'}]);
  const posts=await result;
  assert.match(posts[0].mapHref,/showcase/); assert.equal(posts[1],firstMap);
});
test('partial and final lists preserve limit, ordering and published-only showcase validation', async () => {
  const h=harness(), updates=[];const result=h.api.list({limit:1,onUpdate:p=>updates.push(p)});
  h.answer('/rest/v1/post_map_points',[mapRow(1)]);
  h.answer('/rest/v1/social_posts',[{...showcaseRow(2),status:'pending'}]);
  h.answer('/functions/v1/social-feed',{ok:true,posts:[snsRow(3)]});
  const posts=await result; assert.equal(posts.length,1);assert.equal(posts[0].source,'sns');
  assert.ok(updates.every(p=>p.length<=1));assert.ok(updates.every(p=>p.every(post=>post.source!=='showcase')));
});
test('failed sources remain warnings while successful posts stay available', async () => {
  const h=harness();const result=h.api.list();
  h.answer('/rest/v1/post_map_points',[mapRow(1)]);h.answer('/rest/v1/social_posts',[],503);h.answer('/functions/v1/social-feed',{ok:false,error:'unavailable'},503);
  assert.equal((await result).length,1);assert.equal(h.api.getReadWarnings().length,2);
});
test('all failed sources reject rather than masquerading as an empty feed', async () => {
  const h=harness();const result=h.api.list();
  h.answer('/rest/v1/post_map_points',[],503);h.answer('/rest/v1/social_posts',[],503);h.answer('/functions/v1/social-feed',{ok:false},503);
  await assert.rejects(result,{code:'feed_unavailable'});
});
test('aborting stops partial callbacks and rejects as aborted', async () => {
  const h=harness(), controller=new AbortController(), updates=[];const result=h.api.list({signal:controller.signal,onUpdate:p=>updates.push(p)});
  controller.abort();await assert.rejects(result,{code:'aborted'});assert.equal(updates.length,0);
});
test('callback errors cannot erase successfully fetched posts', async () => {
  const h=harness();const result=h.api.list({onUpdate(){throw new Error('render failed');}});
  h.answer('/rest/v1/post_map_points',[mapRow(1)]);h.answer('/rest/v1/social_posts',[]);h.answer('/functions/v1/social-feed',{ok:true,posts:[]});
  assert.equal((await result).length,1);assert.deepEqual(h.api.getReadWarnings(),[]);
});
test('slow source times out but does not withhold a fast source or discard its posts', async () => {
  const h=harness({timeoutMs:50}), updates=[];const result=h.api.list({onUpdate:p=>updates.push(p)});
  h.answer('/rest/v1/post_map_points',[mapRow(1)]);h.answer('/rest/v1/social_posts',[]);await tick();
  assert.equal(updates[0][0].source,'map'); assert.equal((await result).length,1);assert.equal(h.api.getReadWarnings().length,1);
});

test('missing optional placements retain the already displayed showcase object', async () => {
  const h=harness(), updates=[];const result=h.api.list({onUpdate:p=>updates.push(p)});
  h.answer('/rest/v1/social_posts',[showcaseRow(2)]); await tick(); const first=updates[0][0];
  h.answer('/rest/v1/post_map_points',[]);h.answer('/functions/v1/social-feed',{ok:true,posts:[]});
  h.answer('/rest/v1/social_post_map_points',[],404);
  assert.equal((await result)[0],first);
});
