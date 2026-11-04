import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeOutputMetadata } from '../../js/creation/output-record-metadata.mjs';
test('record validation retains bounded original/custom choices and rejects unrelated private fields',()=>{
 for(const choice of ['original','custom']) assert.deepEqual(sanitizeOutputMetadata({pixelOriginChoice:choice,width:128,outputWidth:4096,privateFilename:'secret',token:'secret'}),{width:128,outputWidth:4096,pixelOriginChoice:choice});
 for(const pixelOriginChoice of ['pixel',1,null])assert.equal(sanitizeOutputMetadata({pixelOriginChoice}).pixelOriginChoice,undefined);
});
test('validation copies bounded arrays/nested values and does not mutate the input record',()=>{
 const value={visualFrameDurationsMs:[20,40],cameraTone:{contrast:18,brightness:-5,unknown:99},description:'x'.repeat(190),durationSeconds:1.234};const copy=structuredClone(value),result=sanitizeOutputMetadata(value);
 assert.deepEqual(value,copy);assert.notEqual(result.visualFrameDurationsMs,value.visualFrameDurationsMs);assert.notEqual(result.cameraTone,value.cameraTone);assert.equal(result.description.length,180);assert.equal(result.durationSeconds,1.2);assert.deepEqual(result.cameraTone,{brightness:-5,contrast:18});
});
test('invalid metadata and out-of-contract timing remain excluded',()=>{
 assert.deepEqual(sanitizeOutputMetadata(null),{});assert.deepEqual(sanitizeOutputMetadata({visualFrameDurationsMs:[0],staticFrameIndex:600,sourceSeconds:Infinity,paddingSeconds:-1}),{});
});
