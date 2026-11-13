import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDrawSelection, createDrawSelectionClipboard, sampleDrawSelection, resizeDrawSelectionFromHandle } from '../../js/creation/draw-selection-operations.mjs';
import { resizeRotatedDrawSelection } from '../../js/creation/draw-selection-geometry.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { createAnimationFromDraw, writeAnimationCel, getAnimationCelDocument } from '../../js/creation/animation-core.mjs';
import { createDrawAnimationHistory } from '../../js/creation/draw-animation-history.mjs';
import { readFile } from 'node:fs/promises';
test('1028 full-canvas copy, flip and one-step Undo preserve exact document',()=>{
 const document={schemaVersion:1,width:1028,height:1028,palette:['#ff0000','#00ff00'],pixels:Array(1028*1028).fill(-1)};document.pixels[0]=0;document.pixels[1028*1028-1]=1;for(const n of [1023,1024,1027])document.pixels[n*1028+n]=1;
 const bounds={x:0,y:0,width:1028,height:1028},clip=captureDrawSelection(document,bounds),clipboard=createDrawSelectionClipboard();clipboard.set(clip);assert.equal(clipboard.read().width,1028);assert.equal(sampleDrawSelection(clip,{width:1028,height:1028}).length,1028*1028);
 const transform=createDrawSelectionTransform(document,bounds);transform.flip('x');const flipped=transform.project().document;assert.equal(flipped.pixels[1027],0);assert.equal(flipped.pixels[1027*1028],1);assert.equal(flipped.pixels[0],-1);for(const n of [1023,1024,1027])assert.equal(flipped.pixels[n*1028+1027-n],1);
 const original=createAnimationFromDraw(document),history=createDrawAnimationHistory(original),next=writeAnimationCel(original,original.frames[0].id,original.layers[0].id,{width:1028,height:1028,pixels:Uint8Array.from(flipped.pixels,v=>v+1)});history.commit(next);assert.ok(history.undo());assert.deepEqual(getAnimationCelDocument(history.current,original.frames[0].id,original.layers[0].id).pixels,document.pixels);
});
test('selection handles support 1028 and clamp at production maximum',()=>{
 const bounds={x:0,y:0,width:256,height:256,angle:0};assert.equal(resizeDrawSelectionFromHandle(bounds,'se',772,772).width,1028);assert.equal(resizeDrawSelectionFromHandle(bounds,'se',1024,1024).width,1028);assert.equal(resizeRotatedDrawSelection(bounds,'se',772,772).width,1028);assert.throws(()=>sampleDrawSelection(captureDrawSelection({schemaVersion:1,width:1,height:1,palette:['#ff0000'],pixels:[0]},{x:0,y:0,width:1,height:1}),{width:1029,height:1}));
});
test('selection panel numeric fields follow central dimension limit',async()=>{const source=await readFile(new URL('../../js/creation/draw-selection-panel.mjs',import.meta.url),'utf8');assert.match(source,/max="\$\{ANIMATION_MAX_DIMENSION\}"/);assert.doesNotMatch(source,/max="256"/);});
