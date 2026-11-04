import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onionLayoutFixture} from './fixtures/draw-onion-layout-fixture.mjs';
const source=readFileSync(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');
const clean=value=>JSON.parse(JSON.stringify(value));
test('onion pixel updates retain exact guides without relaying out grid or selection',()=>{
 const f=onionLayoutFixture(source,{selected:false});f.paint();const positions=clean(f.positions());f.resetCounts();
 for(let i=0;i<50;i++){const index=i%f.display.pixels.length;f.display.pixels[index]=i%2?0:-1;f.paint([index]);}
 assert.equal(f.count.rectReads,0);assert.equal(f.count.styleWrites,0);assert.equal(f.count.selectionRender,0);assert.equal(f.count.viewportRender,0);assert.equal(f.count.put,50);assert.deepEqual(clean(f.positions()),positions);
 const partial=f.stored.at(-1).data;f.paint();assert.deepEqual(f.stored.at(-1).data,partial,'incremental and full onion pixels agree');
});
test('onion reappearance, dimensions, zoom, pan, board resize, DPR and explicit selection changes still place controls',()=>{
 const f=onionLayoutFixture(source);f.paint();f.resetCounts();
 f.call('zoomAt(2,70,85)');assert.equal(f.grid.style.width,'160px');assert.equal(f.onionCanvas.style.left,f.grid.style.left);assert.equal(f.count.selectionRender,1);
 f.call('panX=12;panY=8;updateCanvasView()');assert.equal(f.grid.style.left,'-10px');assert.equal(f.grid.style.top,'-10px');assert.equal(f.onionCanvas.style.width,'160px');
 const selectionLeft=f.ctx.selectionControls.element.style.left;f.ctx.selection={...f.frame,x:4,pivot:{x:6.5,y:4}};f.call('placeSelection()');assert.notEqual(f.ctx.selectionControls.element.style.left,selectionLeft);
 f.setBase({width:100,height:60,left:40,top:50});f.board.clientWidth=220;f.board.clientHeight=190;f.call('placeOverlays()');assert.equal(f.grid.style.width,'200px');assert.equal(f.onionCanvas.style.width,'200px');assert.equal(f.grid.style.height,'120px');
 f.ctx.window.devicePixelRatio=3;f.callbacks[0]();assert.equal(f.nodes.find(n=>n.className==='draw-pixel-background').width,660);
 f.ctx.onion=false;f.paint();assert.equal(f.onionCanvas.hidden,true);f.resetCounts();f.ctx.onion=true;f.paint();assert.equal(f.count.selectionRender,1,'toggle-on positions the canvas synchronously');
 f.display.width=f.display.height=8;f.display.pixels=new Int16Array(64).fill(-1);f.ctx.documentData={width:8,height:8};f.ctx.animationSession.animation={frames:[{id:'f1'},{id:'f2'}]};f.ctx.composeAnimationFrameRgba=()=>({width:8,height:8,rgba:new Uint8ClampedArray(256)});f.resetCounts();f.paint();assert.equal(f.onionCanvas.width,8);assert.equal(f.onionCanvas.height,8);assert.equal(f.count.selectionRender,1,'resized onion repositions');
});
test('existing resize observer and view paths keep their overlay invalidations',()=>{
 assert.match(source,/function updateCanvasView\([\s\S]*?placeOverlays\(\)/);
 assert.match(source,/const overlayObserver = new ResizeObserver\([\s\S]*?requestAnimationFrame\([\s\S]*?placeOverlays\(\)/);
 assert.match(source,/requestAnimationFrame\(\(\) => \{ placeOverlays\(\); syncSizeButtons/);
 assert.match(source,/scope\.listen\(window, 'resize', placeOverlays\)/);
});

test('pixel-dependent selection visibility still updates while unchanged grid placement is skipped',()=>{
 const f=onionLayoutFixture(source);f.paint();f.resetCounts();f.ctx.selection={...f.frame,mask:new Uint8Array(256).fill(1)};f.ctx.selectionHasPixels=()=>false;f.paint([0]);
 assert.equal(f.ctx.selectionControls.element.hidden,true);assert.equal(f.count.selectionRender,1);assert.equal(f.count.viewportRender,0);
 f.ctx.selectionHasPixels=()=>true;f.paint([0]);assert.equal(f.ctx.selectionControls.element.hidden,false);
});
