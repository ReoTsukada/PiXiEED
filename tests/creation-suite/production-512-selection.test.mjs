import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDrawSelection, createDrawSelectionClipboard, sampleDrawSelection, resizeDrawSelectionFromHandle } from '../../js/creation/draw-selection-operations.mjs';
import { resizeRotatedDrawSelection } from '../../js/creation/draw-selection-geometry.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { createAnimationFromDraw, writeAnimationCel, getAnimationCelDocument } from '../../js/creation/animation-core.mjs';
import { createDrawAnimationHistory } from '../../js/creation/draw-animation-history.mjs';
import { readFile } from 'node:fs/promises';
test('512 full-canvas copy, flip and one-step Undo preserve exact document',()=>{
 const document={schemaVersion:1,width:512,height:512,palette:['#ff0000','#00ff00'],pixels:Array(512*512).fill(-1)};document.pixels[0]=0;document.pixels[512*512-1]=1;
 const bounds={x:0,y:0,width:512,height:512},clip=captureDrawSelection(document,bounds),clipboard=createDrawSelectionClipboard();clipboard.set(clip);assert.equal(clipboard.read().width,512);assert.equal(sampleDrawSelection(clip,{width:512,height:512}).length,512*512);
 const transform=createDrawSelectionTransform(document,bounds);transform.flip('x');const flipped=transform.project().document;assert.equal(flipped.pixels[511],0);assert.equal(flipped.pixels[511*512],1);assert.equal(flipped.pixels[0],-1);
 const original=createAnimationFromDraw(document),history=createDrawAnimationHistory(original),next=writeAnimationCel(original,original.frames[0].id,original.layers[0].id,{width:512,height:512,pixels:Uint8Array.from(flipped.pixels,v=>v+1)});history.commit(next);assert.ok(history.undo());assert.deepEqual(getAnimationCelDocument(history.current,original.frames[0].id,original.layers[0].id).pixels,document.pixels);
});
test('selection handles support 512 and clamp at production maximum',()=>{
 const bounds={x:0,y:0,width:256,height:256,angle:0};assert.equal(resizeDrawSelectionFromHandle(bounds,'se',256,256).width,512);assert.equal(resizeDrawSelectionFromHandle(bounds,'se',1024,1024).width,1028);assert.equal(resizeRotatedDrawSelection(bounds,'se',256,256).width,512);assert.throws(()=>sampleDrawSelection(captureDrawSelection({schemaVersion:1,width:1,height:1,palette:['#ff0000'],pixels:[0]},{x:0,y:0,width:1,height:1}),{width:1029,height:1}));
});
test('selection panel numeric fields follow central dimension limit',async()=>{const source=await readFile(new URL('../../js/creation/draw-selection-panel.mjs',import.meta.url),'utf8');assert.match(source,/max="\$\{ANIMATION_MAX_DIMENSION\}"/);assert.doesNotMatch(source,/max="256"/);});
