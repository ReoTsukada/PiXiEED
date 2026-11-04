import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {updateOnionImageData} from '../../../js/creation/draw-render-optimization.mjs';
import * as geometry from '../../../js/creation/draw-selection-geometry.mjs';
const viewportSource=readFileSync(new URL('../../../js/creation/draw-viewport-overlays.mjs',import.meta.url),'utf8').replaceAll('export function','function');
const selectionSource=readFileSync(new URL('../../../js/creation/draw-selection-overlay.mjs',import.meta.url),'utf8').replace(/^import .*\n/,'').replaceAll('export function','function');
export function onionLayoutFixture(source,{size=16,selected=true,dpr=2,recordPixels=true}={}){
 const count={rectReads:0,styleWrites:0,selectionSync:0,selectionRender:0,viewportRender:0,virtualPlace:0,put:0};
 const stored=[],callbacks=[],nodes=[];
 const style=()=>new Proxy({setProperty(k,v){this[k]=v;}},{set(obj,k,v){count.styleWrites++;obj[k]=v;return true;}});
 const node=()=>{const context={fillStyle:'',fills:[],fillRect(...args){this.fills.push(args);},createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData(image,...args){count.put++;if(recordPixels)stored.push({data:[...image.data],args});}};const n={style:style(),dataset:{},className:'',hidden:false,width:size,height:size,children:[],setAttribute(){},remove(){},getContext:()=>context,classList:{toggle(){}},append(child){this.children.push(child);},context};nodes.push(n);return n;};
 const doc={createElement:node};const board={...node(),ownerDocument:doc,clientLeft:2,clientTop:3,clientWidth:200,clientHeight:180,getBoundingClientRect(){count.rectReads++;return {left:10,top:20,right:210,bottom:200,width:200,height:180};}};
 let base={left:30,top:45,width:80,height:80};const canvas=node();canvas.getBoundingClientRect=()=>{count.rectReads++;const [tx,ty,z]=(canvas.style.transform?.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)?.slice(1).map(Number))||[0,0,1];return {left:base.left-base.width*(z-1)/2+tx,top:base.top-base.height*(z-1)/2+ty,width:base.width*z,height:base.height*z};};
 const grid=node(),onionCanvas=node();onionCanvas.hidden=true;
 const animation={frames:[{id:'f1'},{id:'f2'}]};const guide={width:size,height:size,rgba:new Uint8ClampedArray(size*size*4)};for(let i=3;i<guide.rgba.length;i+=4)guide.rgba[i]=255;
 const display={width:size,height:size,pixels:new Int16Array(size*size).fill(-1)};
 const scope={disposed:false,add(){},listen(target,type,fn){if(type==='change')callbacks.push(fn);return ()=>{};}};
 const frame={x:2,y:2,width:5,height:4,angle:0,pivot:{x:4.5,y:4}};
 const ctx=vm.createContext({...geometry,Uint8Array,Uint8ClampedArray,document:doc,window:{devicePixelRatio:dpr,matchMedia(){return {};}},scope,board,canvas,onionCanvas,grid,documentData:{width:size,height:size},animationSession:{animation,frameId:'f1',locked:false},onion:true,playing:false,readOnlyImage:null,onionKey:'',onionGuide:null,onionImage:null,display,updateOnionImageData,composeAnimationFrameRgba:()=>guide,zoom:1,panX:0,panY:0,ZOOM_MAX:8,showGrid:true,mirrorOrigin:{x:.5,y:.5},virtualCursor:{place(){count.virtualPlace++;}},selection:selected?frame:null,selectionTransform:null,selectionDrag:null,selectionPanel:{sync(){count.selectionSync++;}},strokeBinding:null,inputSettings:{bindings:{left:{tool:'select'}}},lastInputSide:'left',tool:'select',selectionHasPixels:()=>true,$:s=>s==='.draw-board'?board:s==='.draw-grid'?grid:s==='#draw-zoom-label'?nodes[0]:null});
 vm.runInContext(viewportSource+'\n'+selectionSource,ctx);
 ctx.viewportOverlays=ctx.mountDrawViewportOverlays({board,canvas,scope});const render=ctx.viewportOverlays.render;ctx.viewportOverlays.render=(...args)=>{count.viewportRender++;return render(...args);};
 ctx.selectionControls=ctx.mountDrawSelectionOverlay({board,canvas,scope,getFrame:()=>ctx.selectionFrame()});const renderSelection=ctx.selectionControls.render;ctx.selectionControls.render=(...args)=>{count.selectionRender++;return renderSelection(...args);};
 const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error(start);return source.slice(a,b);};
 vm.runInContext(slice('function paintOnion(','function handleAnimationAction(')+slice('function layoutCenter()','function selectionMask()'),ctx);
 return {ctx,count,canvas,board,grid,onionCanvas,display,nodes,stored,frame,scope,callbacks,paint(changed=null){ctx.changed=changed;vm.runInContext('paintOnion(display, changed)',ctx);},call(code){vm.runInContext(code,ctx);},setBase(rect){base={...base,...rect};},resetCounts(){for(const k of Object.keys(count))count[k]=0;stored.length=0;},positions(){return {grid:{...grid.style},onion:{...onionCanvas.style},selection:{...ctx.selectionControls.element.style},marks:nodes.filter(n=>n.dataset.selectionControl).map(n=>({control:n.dataset.selectionControl,style:{...n.style},hidden:n.hidden})),mask:{...nodes.find(n=>n.className==='draw-selection-mask').style},background:[canvas.width,canvas.height]};}};
}
