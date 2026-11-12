import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyPostsApi } from '../../js/globe/my-posts.mjs';
const account='11111111-1111-4111-8111-111111111111', guest='22222222-2222-4222-8222-222222222222';
const config={url:'https://test.supabase.co',publishableKey:'public'};
function setup() {
 const saved = new Map([['PiXiEED:legacy-owner-session:v1',JSON.stringify({access_token:'account',user_id:account})],['PiXiEED:supabase-session:v1',JSON.stringify({access_token:'guest',user_id:guest})]]);
 const calls=[];
 const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
 const api=createMyPostsApi({config,storage,fetchImpl:async(url,init)=>{ calls.push({url,init}); const token=init.headers.Authorization; return {ok:true,json:async()=>url.endsWith('/auth/v1/user') ? {id:token==='Bearer account'?account:guest,is_anonymous:token==='Bearer guest'} : {ok:true,preference:{enabled:false,revision:0,consentVersion:'home-artwork-v1'}}}; }});
 return {api,calls,saved};
}
test('separate account and device settings use each owner token',async()=>{const {api,calls}=setup(); const preferences=await api.listHomeArtworkPreferences(); assert.deepEqual(preferences.map(p=>p.sessionScope),['account','device']); await api.saveHomeArtworkPreference('device',true,0); const request=calls.at(-1); assert.equal(request.init.headers.Authorization,'Bearer guest'); assert.deepEqual(JSON.parse(request.init.body),{enabled:true,revision:0,consentVersion:'home-artwork-v1'}); });
test('session change does not save a previous owner setting',async()=>{const {api,calls,saved}=setup(); await api.listHomeArtworkPreferences(); saved.delete('PiXiEED:supabase-session:v1'); await assert.rejects(api.saveHomeArtworkPreference('device',true,0)); assert.equal(calls.filter(c=>c.init.method==='POST').length,0);});
