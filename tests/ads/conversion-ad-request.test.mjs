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

test('the actual workspace uses one optional ad outside the active work area',async()=>{
 const read=path=>readFile(new URL(path,import.meta.url),'utf8');
 const [page,entry,ad,css,config]=await Promise.all([
  read('../../output/work/index.html'),
  read('../../js/creation/conversion-entry.mjs'),
  read('../../js/ads/conversion-display-ad.mjs'),
  read('../../css/conversion-display-ad.css'),
  read('../../data/site-config.js')
 ]);
 assert.match(page,/\/js\/creation\/conversion-entry\.mjs/);
 assert.doesNotMatch(page,/data-display-ad=|<ins\b[^>]*adsbygoogle/);
 assert.match(entry,/void import\('\.\.\/ads\/conversion-display-ad\.mjs/);
 assert.doesNotMatch(entry,/await import\('\.\.\/ads\/conversion-display-ad\.mjs/);
 assert.match(ad,/paths = new Set\(\['\/tools\/start\/convert\/', '\/output\/work\/'\]\)/);
 assert.match(ad,/main\.before\(wrapper\); wrapper\.append\(main\);/);
 assert.match(ad,/wrapper\.append\(host\);/);
 assert.equal((ad.match(/doc\.createElement\('ins'\)/g)||[]).length,1);
 assert.match(ad,/config\?\.slots\?\.tools/);
 assert.match(config,/tools:\s*'8825932060'/);
 assert.match(ad,/doc\.fullscreenElement \|\| doc\.querySelector\('dialog:modal/);
 assert.match(css,/data-ad-layout="rail"\]\s*\.conversion-display-ad\s*\{\s*position:absolute/);
 assert.doesNotMatch(css,/position:\s*(?:fixed|sticky)/);
});
test('work screen has no companion guide and requests only with a safe rail',async()=>{
 const code=await readFile(new URL('../../js/ads/conversion-display-ad.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/conversion-companion|guideMarkup/);
 assert.match(code,/if \(!layout\?\.rail\) return 'no-safe-rail'/);
 assert.match(code,/if \(!layout\.rail\) host\.hidden = true/);
 assert.match(code,/dialog:modal/);
 assert.doesNotMatch(code,/dialog\[open\]/);

});
