import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { conversionAdEligible, conversionAdLayout, conversionAdDeliveryState } from '../../js/ads/conversion-display-ad.mjs';
const base={origin:'https://pixieed.jp',pathname:'/tools/start/convert/',topLevel:true};

test('known public modes remain eligible',()=>{
 for(const search of ['', '?text=output','?text=input','?mode=convert','?mode=convert&text=output']) assert.equal(conversionAdEligible({...base,search}),true);
 assert.equal(conversionAdEligible({...base,pathname:'/output/work/'}),true);
});
test('private and arbitrary input is not exposed to advertising',()=>{
 for(const search of ['?id=private','?file=private','?foo=secret','?text=input&text=output','?mode=draw','?__proto__=secret']) assert.equal(conversionAdEligible({...base,search}),false);
});
test('local files, frames, unrelated paths and private hashes stay excluded',()=>{
 for(const extra of [{origin:'http://localhost'},{origin:'https://example.com'},{topLevel:false},{pathname:'/draw/'},{hash:'#private'}]) assert.equal(conversionAdEligible({...base,...extra}),false);
});
test('320px phone gets 250x250; regular phone gets 300x250',()=>{
 const a=conversionAdLayout({viewportWidth:320,viewportHeight:740,mainRight:320});
 const b=conversionAdLayout({viewportWidth:390,viewportHeight:844,mainRight:390});
 assert.deepEqual([a.width,a.height,a.rail],[250,250,false]);
 assert.deepEqual([b.width,b.height,b.rail],[300,250,false]);
});
test('normal laptops do not lose workspace width to a rail',()=>{
 for(const width of [768,1024,1280,1366,1440,1536]) assert.equal(conversionAdLayout({viewportWidth:width,viewportHeight:900,mainRight:width<=1280?width:(width+1280)/2}).rail,false);
});
test('wide desktops use only real spare space',()=>{
 const a=conversionAdLayout({viewportWidth:1920,viewportHeight:1080,mainRight:1600});
 const b=conversionAdLayout({viewportWidth:2560,viewportHeight:1440,mainRight:1920});
 assert.deepEqual([a.width,a.height,a.rail],[160,600,true]);
 assert.deepEqual([b.width,b.height,b.rail],[300,600,true]);
});
test('a served slot keeps its size after rotation, without refresh',()=>{
 assert.deepEqual(conversionAdLayout({viewportWidth:390,viewportHeight:844,mainRight:390,frozenSize:{width:160,height:600}}),{width:160,height:600,rail:false,left:438});
});
test('invalid geometry returns no layout',()=>assert.equal(conversionAdLayout({viewportWidth:NaN,viewportHeight:900,mainRight:1280}),null));
test('only filled confirms a delivered creative',()=>{
 assert.equal(conversionAdDeliveryState('filled'),'filled');
 for(const state of ['unfilled','unfill-optimized','done','ready','requested','',null,undefined]) assert.notEqual(conversionAdDeliveryState(state),'filled');
});
test('request no longer waits for focus, preview or the near-viewport check',async()=>{
 const code=await readFile(new URL('../../js/ads/conversion-display-ad.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/input:focus|\[aria-busy="true"\]|const near\s*=/);
 assert.doesNotMatch(code,/!styled/);
 assert.match(code,/mounted\.set\(doc, result\); schedule\(\);/);
 assert.match(code,/requested = true; frozenSize/);
});
