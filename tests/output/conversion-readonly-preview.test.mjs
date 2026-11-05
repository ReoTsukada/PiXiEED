import test from 'node:test';
import assert from 'node:assert/strict';
import { runReadonlyPreview, runReadonlyRasterPreview } from '../../js/creation/conversion-readonly-preview.mjs';

test('readonly preview encodes the captured format and options and returns only preview metadata', async () => {
  const blob = new Blob(['encoded']);
  const options = Object.freeze({ width: 320, height: 240, quality: 0.82, background: '#ffffff' });
  const snapshot = Object.freeze({ source: { id: 'source-1' }, options, format: 'webp', filename: 'capture.webp' });
  const observed = [];
  const result = await runReadonlyPreview(snapshot, async captured => {
    observed.push([captured.source.id, captured.format, captured.options]);
    return { blob, ignoredMetadata: { durationSeconds: 5 } };
  });

  assert.deepEqual(observed, [['source-1', 'webp', options]]);
  assert.deepEqual(result, { blob, filename: 'capture.webp', format: 'webp' });
});

test('readonly preview rejects before encoding when cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  let encoded = false;

  await assert.rejects(runReadonlyPreview({ format: 'png', filename: 'image.png' }, async () => {
    encoded = true;
    return new Blob(['encoded']);
  }, controller.signal), { name: 'AbortError' });
  assert.equal(encoded, false);
});

test('readonly preview discards a completed result if cancellation arrives during encoding', async () => {
  const controller = new AbortController();
  let encoderCalls = 0;
  await assert.rejects(runReadonlyPreview({ format: 'png', filename: 'image.png' }, async () => {
    encoderCalls += 1;
    controller.abort();
    return new Blob(['encoded']);
  }, controller.signal), { name: 'AbortError' });
  assert.equal(encoderCalls, 1);
});

test('detailed raster preview forwards the captured frame and exact encoder options', async () => {
  const blob = new Blob(['png']);
  const frame = { width: 3, height: 2, data: new Uint8Array(24) };
  const snapshot = Object.freeze({ format: 'jpeg', filename: 'still.jpeg', frame, width: 6, height: 4,
    quality: 0.73, background: '#8c2f47', pngBackground: 'transparent' });
  const raster = () => {};
  let encoded;
  const result = await runReadonlyRasterPreview(snapshot, async (options, dependencies) => {
    encoded = { options, dependencies };
    return blob;
  }, raster);

  assert.deepEqual(encoded.options, { format: 'jpeg', frames: [frame], width: 6, height: 4,
    background: '#8c2f47', pngBackground: 'transparent', quality: 0.73, totalPlays: 1 });
  assert.equal(encoded.dependencies.encodeRaster, raster);
  assert.equal(result.blob, blob);
  assert.equal(result.filename, 'still.jpeg');
  assert.equal(result.format, 'jpeg');
});

test('preview budget supports manual 2048px images without raising automatic, export or recovery limits',async()=>{
 const {readonlyPreviewBounds}=await import('../../js/creation/conversion-readonly-preview.mjs');
 assert.deepEqual(readonlyPreviewBounds({width:32,height:32},320,320),{supported:true,automatic:true});
 assert.deepEqual(readonlyPreviewBounds({width:2048,height:2048},2048,2048),{supported:true,automatic:false});
 assert.deepEqual(readonlyPreviewBounds({width:32,height:32},320,320,2),{supported:true,automatic:false});
 assert.deepEqual(readonlyPreviewBounds({width:4096,height:4096},4096,4096),{supported:false,automatic:false});
 assert.equal(readonlyPreviewBounds({width:32,height:32},NaN,20).supported,false);
});

test('actual detailed capability preserves native preview-only, source-context and format restrictions',async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');const {readonlyPreviewBounds}=await import('../../js/creation/conversion-readonly-preview.mjs');
 const source=readFileSync(new URL('../../js/creation/output-page.mjs',import.meta.url),'utf8'),a=source.indexOf('  previewCapability: () => {'),b=source.indexOf('  async previewOutput',a);assert.ok(a>=0&&b>a);
 const frame={width:32,height:32},context={record:{metadata:{}},activeItem:{sourceId:'a',metadata:{}},activeSource:{id:'a',kind:'rgba-frames'},sourceSelect:{value:'a'},formatSelect:{value:'png'},stillFrameSelect:{value:'0'},widthInput:{value:'320'},heightInput:{value:'320'},rasterProfile:null,sourceFrames:()=>[frame],sourceFormats:()=>[['png']],validateOutputDimensions:()=>{},outputSourceOriginalSize:()=>({width:32,height:32}),isStaticOutputFormat:()=>true,isIntegerStaticImageEnlargement:()=>true,MAX_IMAGE_EDGE:8192,MAX_IMAGE_PIXELS:67_108_864,readonlyPreviewBounds};
 vm.createContext(context);vm.runInContext('globalThis.capability=({'+source.slice(a,b)+'}).previewCapability;',context);
 assert.equal(context.capability().automatic,true);
 context.record.metadata.previewOnly=true;assert.equal(context.capability().supported,false);delete context.record.metadata.previewOnly;
 context.activeItem.metadata.previewOnly=true;assert.equal(context.capability().supported,false);delete context.activeItem.metadata.previewOnly;
 context.activeItem.sourceId='other';assert.equal(context.capability().supported,false);context.rasterProfile={sourceId:'a'};assert.equal(context.capability().supported,true);
 context.formatSelect.value='jpeg';assert.equal(context.capability().supported,false);context.formatSelect.value='png';
 context.validateOutputDimensions=()=>{throw Error('native size validation');};assert.equal(context.capability().supported,false);
});

test('actual simple capability limits automatic output and offers native animation manually',async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');const {readonlyPreviewBounds}=await import('../../js/creation/conversion-readonly-preview.mjs');
 const source=readFileSync(new URL('../../js/creation/conversion-page.mjs',import.meta.url),'utf8'),a=source.indexOf('    previewCapability() {'),b=source.indexOf('    async previewOutput',a);assert.ok(a>=0&&b>a);
 const frame={width:32,height:32},fields={'[data-width]':{value:'320'},'[data-height]':{value:'320'},'[data-frame]':{value:'1'},'[data-loop]':{value:'0'}};
 const context={format:{value:'png'},source:{kind:'image',frames:[frame]},shown:0,rate:1,webp:true,animated:()=>false,animationPlan:()=>({}),conversionChoices:source=>(source.kind==='audio'?['wav','aiff','au']:['png','gif']).map(value=>({value})),$:key=>fields[key],readonlyPreviewBounds};
 vm.createContext(context);vm.runInContext('globalThis.capability=({'+source.slice(a,b)+'}).previewCapability;',context);
 assert.equal(context.capability().automatic,true);context.source.frames.push(frame);assert.equal(context.capability().supported,true);assert.equal(context.capability().automatic,false);
 context.format.value='gif';assert.equal(context.capability().supported,true);assert.equal(context.capability().automatic,false);context.format.value='png';
 fields['[data-width]'].value='2048';fields['[data-height]'].value='2048';assert.equal(context.capability().supported,true);assert.equal(context.capability().automatic,false);
 context.source.kind='audio';assert.equal(context.capability().supported,false);
});
