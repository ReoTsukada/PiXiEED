import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { publicArtworkImage, parseHomeArtwork, loadHomeArtworks, chooseHomeArtworks, loadHomeArtworkImage } from '../../js/home-artworks.mjs';
const id='map:a0000000-0000-4000-8000-000000000001';
const row={id,title:'春の花',authorName:'テスト作者',imagePath:'posts/art.png',imageBytes:32000,imageSha256:'a'.repeat(64),publishedAt:'2026-11-10T12:00:00Z'};
const config={url:'https://public.example.test',publishableKey:'sb_publishable_test'};
const cfg={origin:config.url};
const response=artworks=>new Response(JSON.stringify({ok:true,artworks}),{headers:{'content-type':'application/json'}});
test('no consenting reviewed posts means no artwork and no static fallback',async()=>{
 let calls=0;assert.deepEqual(await loadHomeArtworks({config,fetchImpl:async()=>{calls++;return response([])}}),[]);assert.equal(calls,1);
 const source=readFileSync(new URL('../../js/home-artworks.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/HOME_ARTWORK_SELECTION|data\/home-artworks|\/rest\/v1\/|reviewedSelection/);
});
test('image paths cannot escape public storage or inject trackers',()=>{
 assert.equal(publicArtworkImage(cfg.origin,'post-public','posts/art.png'),'https://public.example.test/storage/v1/object/public/post-public/posts/art.png');
 for(const path of['https://evil.test/x.png','/x.png','../x.png','x/../x.png','x%2fy.png','x.png?q=1','x.png#hash','x\\y.png','x//y.png','x/./y.png','x\u0000.png']) assert.equal(publicArtworkImage(cfg.origin,'post-public',path),'',path);
});
test('public reader fields are strictly validated and detail links remain local',()=>{
 assert.equal(parseHomeArtwork(row,cfg).href,'/feed/?post=map%3Aa0000000-0000-4000-8000-000000000001');
 for(const change of[{id:'sns:other'},{publishedAt:null},{title:''},{title:'x'.repeat(61)},{authorName:''},{authorName:'x'.repeat(41)},{imagePath:'other.svg'},{imagePath:'../other.png'},{imageBytes:262145},{imageBytes:0},{imageSha256:'bad'}]) assert.equal(parseHomeArtwork({...row,...change},cfg),null,JSON.stringify(change));
});
test('anonymous consent-aware read is one bounded GET without owner data or account tokens',async()=>{
 const calls=[];const artworks=await loadHomeArtworks({config,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return response([row]);}});
 assert.equal(artworks.length,1);assert.equal(calls.length,1);
 const {url,options}=calls[0];assert.equal(url.pathname,'/functions/v1/home-artworks');assert.equal(url.search,'');
 assert.deepEqual(options.headers,{apikey:config.publishableKey,Accept:'application/json'});assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
});
test('duplicate IDs and identical images never occupy two slots',async()=>{
 const other={...row,id:'map:a0000000-0000-4000-8000-000000000002'};
 for(const rows of[[row,row],[row,other],[row,{...other,imageSha256:'b'.repeat(64)},row]]){
 const result=await loadHomeArtworks({config,fetchImpl:async()=>response(rows)});assert.equal(result.length,rows.length===3?2:1);
 }
});
test('private/withdrawn/deleted candidates are never resurrected from a previous response',async()=>{
 let calls=0;const fetchImpl=async()=>response(calls++===0?[row]:[]);
 assert.equal((await loadHomeArtworks({config,fetchImpl})).length,1);assert.deepEqual(await loadHomeArtworks({config,fetchImpl}),[]);
});
test('network, timeout and invalid payload fail closed',async()=>{
 for(const fetchImpl of[async()=>new Response('',{status:403}),async()=>new Response('not json'),async()=>new Response('x'.repeat(49153)),async()=>new Response(JSON.stringify({ok:false,artworks:[row]})),async()=>response(Array(25).fill(row)),async()=>{throw Error('offline');}]) await assert.rejects(()=>loadHomeArtworks({config,fetchImpl}));
 await assert.rejects(()=>loadHomeArtworks({config,timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))}));
 const controller=new AbortController();controller.abort();assert.deepEqual(await loadHomeArtworks({config,signal:controller.signal,fetchImpl:()=>{throw Error('must not fetch');}}),[]);
});
test('random choice covers all permutations without duplicates or mutating input',()=>{
 const input=['a','b','c'].map(id=>({id,src:id,imageSha256:id}));const permutations=new Set();
 for(const first of[0,.34,.67])for(const second of[0,.5]){let i=0;const values=[first,second];const result=chooseHomeArtworks(input,3,()=>values[i++]);permutations.add(result.map(x=>x.id).join(''));assert.equal(new Set(result.map(x=>x.id)).size,3);}
 assert.equal(permutations.size,6);assert.deepEqual(input.map(x=>x.id),['a','b','c']);
 assert.equal(chooseHomeArtworks([...input,input[0]],2,()=>0).length,2);assert.equal(chooseHomeArtworks(input,1,()=>.999).length,1);assert.deepEqual(chooseHomeArtworks([],3),[]);
});
test('random selection happens after field checks so bad choices cannot displace valid work',async()=>{
 const invalid={...row,id:'invalid'};const result=await loadHomeArtworks({config,limit:1,random:()=>0,fetchImpl:async()=>response([invalid,row])});assert.equal(result.length,1);assert.equal(result[0].id,id);
});
test('reviewed image bytes are fetched once anonymously and checked before display',async()=>{
 const bytes=new Uint8Array([1,2,3,4]);const artwork={src:'https://public.example.test/storage/v1/object/public/post-public/test.png',imageBytes:bytes.length,imageSha256:createHash('sha256').update(bytes).digest('hex')};let calls=0,blobs=0;
 const url=await loadHomeArtworkImage(artwork,{cryptoImpl:webcrypto,fetchImpl:async(_url,options)=>{calls++;assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.headers,undefined);return new Response(bytes);},URLImpl:{createObjectURL:blob=>{blobs++;assert.equal(blob.size,4);assert.equal(blob.type,'image/png');return'blob:verified';}}});
 assert.equal(url,'blob:verified');assert.equal(calls,1);assert.equal(blobs,1);
 for(const changed of[new Uint8Array([1,2,3,5]),new Uint8Array([1,2,3]),new Uint8Array([1,2,3,4,5])])await assert.rejects(()=>loadHomeArtworkImage(artwork,{cryptoImpl:webcrypto,fetchImpl:async()=>new Response(changed),URLImpl:{createObjectURL:()=>assert.fail('changed image must never decode')}}));
 await assert.rejects(()=>loadHomeArtworkImage(artwork,{cryptoImpl:webcrypto,fetchImpl:async()=>new Response(bytes,{headers:{'content-length':'5'}})}));
});
test('aborted, slow and unverified images never get object URLs',async()=>{
 const bytes=new Uint8Array([1]);const artwork={src:'https://public.example.test/test.png',imageBytes:1,imageSha256:createHash('sha256').update(bytes).digest('hex')};
 const controller=new AbortController();controller.abort();await assert.rejects(()=>loadHomeArtworkImage(artwork,{signal:controller.signal,fetchImpl:()=>assert.fail('must not fetch')}));
 await assert.rejects(()=>loadHomeArtworkImage(artwork,{cryptoImpl:webcrypto,timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))}));await assert.rejects(()=>loadHomeArtworkImage({...artwork,imageSha256:'invalid'}));
});
test('home provides accessible navigation without a social runtime or timer rotation',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');const source=readFileSync(new URL('../../js/home-artworks.mjs',import.meta.url),'utf8');assert.match(html,/id="portal-artwork-grid" hidden/);assert.match(html,/id="portal-artwork-status" role="status"/);assert.match(html,/だれかの好きが、ひらめきに。/);assert.match(html,/href="\/guide\/#publish-work"/);
 for(const marker of['visibilitychange','pagehide','event.persisted','saveData','textContent','revokeObjectURL'])assert.ok(source.includes(marker),marker);assert.doesNotMatch(source,/innerHTML|localStorage|indexedDB|createClient|Authorization|setInterval/);
});

test('the home and settings entry URLs carry their changed dependencies',()=>{
 const portal=readFileSync(new URL('../../js/home-portal.mjs',import.meta.url),'utf8');const profile=readFileSync(new URL('../../profile/index.html',import.meta.url),'utf8');const settings=readFileSync(new URL('../../js/creation/home-artwork-settings.mjs',import.meta.url),'utf8');
 assert.match(portal,/home-artworks\.mjs\?rev=20261112-posted-random-1/);assert.match(profile,/home-artwork-settings\.mjs\?rev=20261112-home-review-1/);assert.match(profile,/home-artwork-settings\.css\?rev=20261112-profile-workspace-1/);assert.match(settings,/my-posts\.mjs\?rev=20261112-home-consent-1/);
});
