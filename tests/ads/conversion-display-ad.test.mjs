import test from 'node:test';
import assert from 'node:assert/strict';
import {conversionAdEligible,conversionAdLayout} from '../../js/ads/conversion-display-ad.mjs';
const base={origin:'https://pixieed.jp',pathname:'/tools/start/convert/',topLevel:true};
test('public conversion routes and supported UI selections only',()=>{
 for(const search of ['', '?text=output','?text=input','?mode=convert','?mode=convert&text=output'])assert.equal(conversionAdEligible({...base,search}),true);
 assert.equal(conversionAdEligible({...base,pathname:'/output/work/'}),true);
});
test('private handoff, unknown query, duplicate and prototype keys fail closed',()=>{
 for(const search of ['?id=private','?file=private','?foo=secret','?text=input&text=output','?mode=draw','?__proto__=secret','?constructor=x','?text=secret'])assert.equal(conversionAdEligible({...base,search}),false);
});
test('no provider in local, frames, unknown paths or private hash',()=>{
 for(const extra of [{origin:'http://localhost'},{origin:'https://evil.example'},{topLevel:false},{pathname:'/draw/'},{hash:'#private-data'}])assert.equal(conversionAdEligible({...base,...extra}),false);
 assert.equal(conversionAdEligible({...base,hash:'#main'}),true);
});
test('small phones use fitting square; regular phones use rectangle',()=>{
 assert.deepEqual(conversionAdLayout({viewportWidth:320,viewportHeight:740,mainRight:320}),{width:250,height:250,rail:false,left:368});
 assert.equal(conversionAdLayout({viewportWidth:390,viewportHeight:844,mainRight:390}).width,300);
});
test('never narrow work area to force a laptop rail',()=>{
 for(const width of [768,1024,1280,1366,1440,1536])assert.equal(conversionAdLayout({viewportWidth:width,viewportHeight:900,mainRight:width<=1280?width:(width+1280)/2}).rail,false);
});
test('large desktops select a genuinely fitting vertical unit',()=>{
 assert.deepEqual(conversionAdLayout({viewportWidth:1920,viewportHeight:1080,mainRight:1600}),{width:160,height:600,rail:true,left:1648});
 assert.deepEqual(conversionAdLayout({viewportWidth:2560,viewportHeight:1440,mainRight:1920}),{width:300,height:600,rail:true,left:1968});
});
test('freeze served size across resize, no refresh',()=>{
 assert.deepEqual(conversionAdLayout({viewportWidth:390,viewportHeight:844,mainRight:390,frozenSize:{width:160,height:600}}),{width:160,height:600,rail:false,left:438});
});
test('invalid measurement does not mount a rail',()=>assert.equal(conversionAdLayout({viewportWidth:NaN,viewportHeight:900,mainRight:1280}),null));
test('rail requires room for the full labeled unit above the bottom dock',()=>{
 assert.equal(conversionAdLayout({viewportWidth:1920,viewportHeight:800,mainRight:1500}).rail,false);
 assert.equal(conversionAdLayout({viewportWidth:1920,viewportHeight:1000,mainRight:1500,railTop:300}).rail,false);
 assert.equal(conversionAdLayout({viewportWidth:1920,viewportHeight:1000,mainRight:1500}).rail,true);
});
test('rail top is measured in viewport coordinates',()=>{
 assert.equal(conversionAdLayout({viewportWidth:1920,viewportHeight:1080,mainRight:1500,railTop:400}).rail,false);
 assert.equal(conversionAdLayout({viewportWidth:1920,viewportHeight:1080,mainRight:1500,railTop:300}).rail,true);
});
