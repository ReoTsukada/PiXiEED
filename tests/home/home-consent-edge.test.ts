import { homeArtworkPreferenceHandler } from '../../supabase/functions/home-artwork-preference/index.ts';
import { homeArtworksHandler } from '../../supabase/functions/home-artworks/index.ts';
const assert = (value: unknown) => { if (!value) throw new Error('assertion failed'); };
const owner = '11111111-1111-4111-8111-111111111111';
const calls: unknown[] = [];
const deps = { projectUrl: 'https://test.supabase.co', publishableKey: 'pub', serviceKey: 'secret', createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, rpc: async (name: string, args: unknown) => { calls.push({name,args}); return { data: name === 'pixieed_home_artworks' ? [] : { enabled: false, revision: 0, consentVersion: 'home-artwork-v1' } }; } }) };
Deno.test('authenticated GET defaults OFF and passes only verified identity', async () => {
  calls.length = 0;
  const r = await homeArtworkPreferenceHandler(new Request('https://test/p', {headers:{authorization:'Bearer token'}}), deps);
  assert(r.status===200); assert(r.headers.get('cache-control')==='no-store');
  assert(JSON.stringify(calls).includes(owner)); assert((await r.json()).preference.enabled === false);
});
Deno.test('untrusted ownerId and missing identity cannot mutate', async () => {
  calls.length = 0;
  for (const body of [{enabled:true,revision:0,consentVersion:'home-artwork-v1',ownerId:owner}, {enabled:true,revision:0,consentVersion:'old'}]) {
    const r = await homeArtworkPreferenceHandler(new Request('https://test/p', {method:'POST',headers:{authorization:'Bearer token'},body:JSON.stringify(body)}),deps); assert(r.status===400);
  }
  const r = await homeArtworkPreferenceHandler(new Request('https://test/p'), deps); assert(r.status===401); assert(calls.length===0);
});
Deno.test('valid writes pass revision and enabled but never browser identity', async () => {
  calls.length = 0;
  const r = await homeArtworkPreferenceHandler(new Request('https://test/p',{method:'POST',headers:{authorization:'Bearer token'},body:JSON.stringify({enabled:false,revision:2,consentVersion:'home-artwork-v1'})}),deps);
  assert(r.status===200); assert(JSON.stringify(calls[0])===JSON.stringify({name:'pixieed_home_artwork_preference',args:{p_owner_id:owner,p_enabled:false,p_revision:2}}));
});
Deno.test('public reader is anonymous no-store and failures return no candidates', async () => {
  const r=await homeArtworksHandler(new Request('https://test/p'),deps); assert(r.status===200); assert(r.headers.get('cache-control')==='no-store'); assert((await r.json()).artworks.length===0);
  const failed=await homeArtworksHandler(new Request('https://test/p'),{...deps,createClient:()=>({rpc:async()=>({error:{message:'private'}})})}); assert(failed.status===503); const body=await failed.text(); assert(!body.includes('private')); assert(JSON.parse(body).artworks.length===0);
});
