import test from 'node:test';
import assert from 'node:assert/strict';
import { textArtScale } from '../js/creation/text-art-viewer.mjs';
import { textPixelOrigin } from '../js/creation/text-pixel-origin.mjs';
import { resizeRgbaNearest } from '../js/creation/output-render.mjs';
const image = (w=32,h=24) => ({width:w,height:h,data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:((Math.floor(i/4)*17+i%4*31)%256))});
test('fit contains both dimensions and does not upscale small art',()=>{
 assert.equal(textArtScale('fit',1000,500,250,250),.25);
 assert.equal(textArtScale('fit',500,1000,250,250),.25);
 assert.equal(textArtScale('fit',20,20,250,250),1);
});
test('width fitting keeps full horizontal extent; tall text remains scrollable',()=>assert.equal(textArtScale('width',1000,5000,250,250),.25));
test('manual zoom remains independent from content size',()=>{
 assert.equal(textArtScale('manual',1000,500,250,250,1.25),1.25);
 assert.equal(textArtScale('manual',100,100,250,250,1.25),1.25);
});
test('defensive geometry and zoom limits',()=>{
 assert.equal(textArtScale('fit',0,20,250,250),1);
 assert.equal(textArtScale('manual',20,20,250,250,100),8);
 assert.equal(textArtScale('fit',1e6,1e6,100,100),.0001);
});
for (const scale of [2,3,5,10,16]) test(`exact ${scale}x pixels normalize reversibly without modifying source`,async()=>{
 const native=image(),large=resizeRgbaNearest(native,native.width*scale,native.height*scale),original=large.data.slice();
 const normalized=await textPixelOrigin(large);
 assert.equal(normalized.detection.scale,scale);assert.equal(normalized.frame.width,32);assert.equal(normalized.frame.height,24);
 assert.deepEqual(normalized.frame.data,native.data);assert.deepEqual(large.data,original);
 assert.deepEqual(resizeRgbaNearest(normalized.frame,large.width,large.height).data,large.data);
});
test('transparent channels and semitransparent pixels must all match',async()=>{
 const native=image(8,8);for(let i=0;i<native.data.length;i+=4)native.data[i+3]=(i*7)%256;
 const large=resizeRgbaNearest(native,80,80);const normalized=await textPixelOrigin(large);
 assert.deepEqual(normalized.frame.data,native.data);
 large.data[4+3]^=1;
 const mismatch=await textPixelOrigin(large);assert.equal(mismatch.frame,large);
});
test('ordinary 1x image and one-pixel noise stay untouched',async()=>{
 const base=image();assert.equal((await textPixelOrigin(base)).frame,base);
 const large=resizeRgbaNearest(base,320,240);large.data[4]^=1;assert.equal((await textPixelOrigin(large)).frame,large);
});
test('solid images and single-row origins are ambiguous, never auto-reduced',async()=>{
 const solid={width:100,height:100,data:new Uint8ClampedArray(40000).fill(255)};
 assert.equal((await textPixelOrigin(solid)).frame,solid);
 const stripe=resizeRgbaNearest(image(8,1),80,10);assert.equal((await textPixelOrigin(stripe)).frame,stripe);
});
test('pixel budget and cancellation do not alter input',async()=>{
 const frame=resizeRgbaNearest(image(),320,240);
 assert.equal((await textPixelOrigin(frame,{maxPixels:10})).frame,frame);
 const c=new AbortController();c.abort();await assert.rejects(textPixelOrigin(frame,{signal:c.signal}),{name:'AbortError'});
});
