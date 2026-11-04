import {validateOutputDimensions} from '../../js/creation/output-input-constraints.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {outputDimensionGuidance as guide} from '../../js/creation/output-dimension-guidance.mjs';
for (const format of ['gif','apng']) {
 test(`${format}: one-frame 4096 square is not offered as valid`,()=>{const request={format,width:4096,height:4096,frameCount:1};const copy={...request};const result=guide(request);assert.deepEqual(request,copy);assert.equal(result.suggestedWidth,2828);assert.equal(result.suggestedHeight,2828);assert.match(result.message,/自動変更していません/);assert.match(result.message,/全1コマ/);});
 test(`${format}: all frames count toward the suggested size`,()=>{for(const frameCount of [2,10,600]){const result=guide({format,width:4096,height:2048,frameCount});assert.ok(result.suggestedWidth*result.suggestedHeight*frameCount<=8e6);assert.ok(result.suggestedWidth<=4096);assert.ok(result.suggestedHeight<=4096);}});
 test(`${format}: exact budget and 32x rectangular image remain allowed`,()=>{assert.equal(guide({format,width:4000,height:2000}),null);assert.equal(guide({format,width:4096,height:1024}),null);assert.equal(guide({format,width:128,height:128,frameCount:400}),null);});
 test(`${format}: invalid geometry is left to normal dimension validation`,()=>{for(const width of [0,-1,1.5,NaN,Infinity])assert.equal(guide({format,width,height:128}),null);assert.equal(guide({format,width:128,height:128,frameCount:601}),null);});
}
test('still images and browser video/audio formats are not restricted by the GIF budget',()=>{for(const format of ['png','jpeg','webp','svg','bmp','tiff','tga','qoi','ico','ppm','pgm','pbm','pam','wav','aiff','au','m4a','ogg','mp4','webm'])assert.equal(guide({format,width:4096,height:4096}),null);});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../../js/creation/output-page.mjs',import.meta.url),'utf8');
const extract=(start,end)=>page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start)));
test('real refreshScaleLimits uses GIF budget for one frame and retains requested dimensions',()=>{
 let captured;const context={record:{},scaleSettings:{hidden:false},pngBaseSize:{width:128,height:128},sourceFrames:()=>[{}],widthInput:{value:'4096'},heightInput:{value:'4096'},formatSelect:{value:'gif'},isAnimatedOutputFormat:f=>['gif','apng'].includes(f),setupScaleInput:value=>{captured=value}};
 vm.createContext(context);vm.runInContext(extract('function refreshScaleLimits()', '\nfunction buildScalePresets')+';refreshScaleLimits()',context);
 assert.equal(captured.kind,'gif');assert.equal(captured.frameCount,1);assert.equal(captured.startWidth,4096);assert.equal(captured.startHeight,4096);assert.equal(context.widthInput.value,'4096');
});
test('real targetDimensions rejects single GIF limit with a suggested size, allows PNG unchanged',()=>{
 const context={validateOutputDimensions,Number,RangeError,widthInput:{value:'4096'},heightInput:{value:'4096'},MAX_IMAGE_EDGE:4096,MAX_IMAGE_PIXELS:16777216,outputDimensionGuidance:guide,sourceFrames:()=>[{}],formatSelect:{value:'gif'},isStaticOutputFormat:()=>false};
 vm.createContext(context);vm.runInContext(extract('function targetDimensions()', '\nasync function applySelectedSize'),context);
 assert.throws(()=>vm.runInContext('targetDimensions()',context),/2828 × 2828/);assert.equal(context.widthInput.value,'4096');context.formatSelect.value='png';assert.equal(vm.runInContext('targetDimensions().width',context),4096);
});
test('real preset builder excludes oversized single-frame GIF presets and keeps safe choices',()=>{
 const buttons=[];const element=()=>({dataset:{},setAttribute(){},append(){},addEventListener(){}});
 const context={presets:{replaceChildren(){buttons.length=0},append:b=>buttons.push(b)},currentScale:32,maxScale:32,document:{createElement:element},formatSelect:{value:'gif'},outputDimensionGuidance:guide,updatePresetSelection(){}};
 vm.createContext(context);vm.runInContext(extract('function buildScalePresets(', '\nfunction updatePresetSelection')+';buildScalePresets(128,128,"gif",1)',context);
 assert.deepEqual(buttons.map(b=>b.dataset.scale),['1','2','4']);context.maxScale=22;vm.runInContext('buildScalePresets(128,128,"gif",1)',context);assert.deepEqual(buttons.map(b=>b.dataset.scale),['1','2','4','22']);
});
