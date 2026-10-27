import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDimensions, detectExtraFormat, decodeExtraImage, encodeExtraImage, encodeIco, decodeExtraAudio, encodeExtraAudio } from '../../js/creation/conversion-codecs.mjs';
import { outputName } from '../../js/creation/conversion-studio.mjs';
const frame = { width: 3, height: 2, data: Uint8ClampedArray.from([255,0,0,255, 0,255,0,128, 0,0,255,0, 12,34,56,255, 255,255,255,255, 0,0,0,255]) };
for (const format of ['bmp', 'tga', 'qoi', 'tiff', 'pbm', 'pgm', 'ppm']) {
  test(`${format}: signature, dimensions and channel semantics`, async () => {
    const blob = encodeExtraImage(frame, format), buffer = await blob.arrayBuffer(), detected = detectExtraFormat(buffer, `test.${format}`);
    assert.equal(detected, ['pbm', 'pgm', 'ppm'].includes(format) ? 'pnm' : format);
    const result = decodeExtraImage(buffer, detected); assert.equal(result.width, 3); assert.equal(result.height, 2);
    if (['tga', 'qoi', 'tiff'].includes(format)) assert.deepEqual(result.data, frame.data);
    else if (format === 'bmp' || format === 'ppm') assert.deepEqual([...result.data.slice(4,12)], [127,255,127,255,255,255,255,255]);
    else { for (let i=0;i<result.data.length;i+=4) { assert.equal(result.data[i], result.data[i+1]); assert.equal(result.data[i], result.data[i+2]); assert.equal(result.data[i+3],255); } }
  });
  test(`${format}: truncation is rejected`, async () => {
    const b = new Uint8Array(await encodeExtraImage(frame, format).arrayBuffer());
    const cut = format === 'tga' ? b.length - 28 : b.length - 2;
    assert.throws(() => decodeExtraImage(b.slice(0, cut), ['pbm','pgm','ppm'].includes(format) ? 'pnm' : format));
  });
}
for (const [width,height] of [[0,1],[1,0],[4097,1],[4096,4096],[Infinity,4],[3.5,2]]) test(`reject dimensions ${width}x${height}`,()=>assert.throws(()=>checkDimensions(width,height)));
test('PNM preserves binary values that look like whitespace or comments',()=>{
  const header=new TextEncoder().encode('P6\n# comment\n1 1\n255\n'), b=new Uint8Array(header.length+3); b.set(header);b.set([10,32,35],header.length);
  assert.deepEqual([...decodeExtraImage(b,'pnm').data],[10,32,35,255]);
});
test('PNM ASCII and 16bit are supported',()=>{
  assert.deepEqual([...decodeExtraImage(new TextEncoder().encode('P3\n1 1\n100\n100 50 0\n'),'pnm').data],[255,128,0,255]);
  const b=Uint8Array.from([...new TextEncoder().encode('P5\n1 1\n65535\n'),128,0]);assert.equal(decodeExtraImage(b,'pnm').data[0],128);
});
test('PBM black/white bit order and partial final byte',()=>{
  const b=Uint8Array.from([...new TextEncoder().encode('P4\n3 1\n'),0b10100000]);
  assert.deepEqual([...decodeExtraImage(b,'pnm').data],[0,0,0,255,255,255,255,255,0,0,0,255]);
});
test('PNM concatenated images rejected rather than silently losing pages',()=>assert.throws(()=>decodeExtraImage(new TextEncoder().encode('P1\n1 1\n0\nP1\n1 1\n1\n'),'pnm')));
test('TGA RLE packet overrun rejected',()=>{const b=new Uint8Array(22);b[2]=10;b[12]=1;b[14]=1;b[16]=24;b[18]=129;assert.throws(()=>decodeExtraImage(b,'tga'));});
test('QOI run length and marker rejected',()=>{const b=new Uint8Array(23);b.set([113,111,105,102,0,0,0,1,0,0,0,1,4,0,193]);b[22]=1;assert.throws(()=>decodeExtraImage(b,'qoi'));});
test('TIFF pages cannot be silently discarded',async()=>{const b=new Uint8Array(await encodeExtraImage(frame,'tiff').arrayBuffer());new DataView(b.buffer).setUint32(154,8,true);assert.throws(()=>decodeExtraImage(b,'tiff'),/複数ページ/);});
for(const format of ['aiff','au'])for(const rate of [8000,44100,48000])for(const count of [1,2])test(`${format} ${rate} ${count}ch PCM`,async()=>{
  const source={sampleRate:rate,channels:Array.from({length:count},()=>Float32Array.from([-1,-.5,0,.5,1]))};
  const b=await encodeExtraAudio(source,format).arrayBuffer();assert.equal(detectExtraFormat(b),format);const d=decodeExtraAudio(b,format);assert.equal(d.sampleRate,rate);assert.equal(d.channels.length,count);for(let i=0;i<5;i++)assert.ok(Math.abs(d.channels[0][i]-source.channels[0][i])<=1/32767);
});
test('PCM NaN and unsupported range rejected',()=>{assert.throws(()=>encodeExtraAudio({sampleRate:48000,channels:[Float32Array.of(NaN)]},'au'));assert.throws(()=>encodeExtraAudio({sampleRate:96000,channels:[Float32Array.of(0)]},'aiff'));});
test('AIFF compressed and truncated rejected',async()=>{const b=new Uint8Array(await encodeExtraAudio({sampleRate:8000,channels:[Float32Array.of(0)]},'aiff').arrayBuffer());b[11]=67;assert.throws(()=>decodeExtraAudio(b,'aiff'),/AIFC/);assert.throws(()=>decodeExtraAudio(b.slice(0,10),'aiff'));});
test('AU unexpected encoding rejected',async()=>{const b=new Uint8Array(await encodeExtraAudio({sampleRate:8000,channels:[Float32Array.of(0)]},'au').arrayBuffer());new DataView(b.buffer).setUint32(12,1);assert.throws(()=>decodeExtraAudio(b,'au'));});
test('ICO validates dimensions and actual PNG header',()=>assert.throws(()=>encodeIco(new Uint8Array([1,2,3]),256,256)));
test('safe output filename',()=>{assert.equal(outputName('../a:b.png','tiff'),'_a_b.tiff');assert.equal(outputName('猫の写真.PNG','qoi'),'猫の写真.qoi');});
