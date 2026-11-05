import test from 'node:test';
import assert from 'node:assert/strict';
import { resultSurfacePresentation, mountResultSurface, decodedPreviewLabel } from '../../js/creation/conversion-result-surface.mjs';

test('generated and readonly media are current only for ready current settings, never during work or comparison',()=>{
 assert.deepEqual(resultSurfacePresentation({mode:'media',loaded:true,ready:true}),{state:'ready',owner:'saved',current:true});
 const q={key:'new',state:'ready',resultKey:'old',result:{blob:{}}};
 assert.equal(resultSurfacePresentation({mode:'media',loaded:true,queue:q}).current,false);
 assert.equal(resultSurfacePresentation({mode:'media',loaded:true,queue:{...q,resultKey:'new'}}).current,true);
 assert.equal(resultSurfacePresentation({mode:'media',loaded:true,ready:true,working:true,queue:q}).current,false);
 assert.equal(resultSurfacePresentation({mode:'media',loaded:true,ready:true,compare:true}).owner,'source');
 assert.equal(resultSurfacePresentation({mode:'media',loaded:false,ready:true,queue:q}).state,'empty');
});
test('text modes occupy the same result owner but old text remains explicitly stale',()=>{
 for(const mode of ['input','output']){
  assert.equal(resultSurfacePresentation({mode,loaded:true,ready:false}).state,'stale');
  assert.equal(resultSurfacePresentation({mode,loaded:true,ready:true}).owner,'text');
  assert.equal(resultSurfacePresentation({mode,loaded:true,ready:true,working:true}).current,false);
 }
});

class Node {
 constructor(tag='div',name=''){this.tagName=tag.toUpperCase();this.name=name;this.children=[];this.parentNode=null;this.dataset={};this.attributes=new Map();this.hidden=false;this.disabled=false;this.textContent='';this.handlers={};this.src='';}
 get nextSibling(){const a=this.parentNode?.children||[];return a[a.indexOf(this)+1]||null;}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
 prepend(...nodes){for(const node of nodes.slice().reverse()){node.remove();node.parentNode=this;this.children.unshift(node);}}
 after(node){this.parentNode.insertBefore(node,this.nextSibling);}
 insertBefore(node,next){node.remove();const i=next?this.children.indexOf(next):this.children.length;assert.ok(i>=0);node.parentNode=this;this.children.splice(i,0,node);}
 remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.get(k)??null;}
 removeAttribute(k){this.attributes.delete(k);if(k==='src')this.src='';}
 addEventListener(k,fn){this.handlers[k]=fn;}click(){this.handlers.click?.({});}pause(){}
 closest(selector){for(let p=this;p;p=p.parentNode)if(selector==='[hidden]'&&p.hidden)return p;return null;}
 querySelector(selector){return this.all().find(node=>node.name===selector||node.tagName.toLowerCase()===selector)||null;}
 all(){return this.children.flatMap(node=>[node,...node.all()]);}
 set innerHTML(_text){
  const header=new Node('header'),strong=new Node('strong'),source=new Node('button','[data-result-source]');header.append(strong,source);
  const status=new Node('p','[data-result-state]'),ops=new Node('div'),refresh=new Node('button','[data-result-refresh]'),cancel=new Node('button','[data-result-cancel]');ops.append(refresh,cancel);
  const content=new Node('div','.sc-result-content'),fallback=new Node('p','[data-result-fallback]');content.append(new Node('img'),new Node('audio'),new Node('video'),fallback);this.append(header,status,ops,content);
 }
}
function fixture(){
 const main=new Node('main'),root=new Node('section','[data-text-tools]'),composer=new Node('section','.sc-unified-composer'),layout=new Node('div'),card=new Node('section','.tx-result-card'),link=new Node('a'),legacy=new Node('div','.text-legacy'),surface=new Node('section'),summary=new Node('div','.sc-preview-summary');
 layout.append(card);card.append(link);root.append(composer,layout);surface.append(summary);legacy.append(surface);main.append(root,legacy);
 let seq=0;const revoked=[],timers=new Map();const win={URL:{createObjectURL:()=>`blob:test-${++seq}`,revokeObjectURL:url=>revoked.push(url)},setTimeout:fn=>{const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 const api=mountResultSurface({main,doc:{createElement:tag=>new Node(tag)},win});
 return {main,root,layout,card,link,legacy,surface,summary,api,revoked,tick:async()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}await new Promise(resolve=>setImmediate(resolve));}};
}
test('actual mount shares one host, readonly preview has no download, and destroy restores original DOM order and URLs',async()=>{
 const f=fixture();const host=f.root.querySelector('section'); // Find the created host by its authored attribute.
 const actual=f.root.children.find(node=>node!==f.root.querySelector('.sc-unified-composer')&&node!==f.layout);
 assert.ok(actual);assert.equal(f.card.parentNode,actual);assert.equal(f.legacy.parentNode,actual);assert.equal(f.summary.parentNode,actual);
 let renders=0;const blob=new Blob(['png']);
 f.api.update({mode:'media',key:'a',loaded:true,ready:false,working:false,capability:{supported:true,automatic:true},api:{previewOutput:async()=>{renders++;return{blob,filename:'a.png'};}}});
 await f.tick();assert.equal(renders,1);assert.equal(actual.dataset.current,'true');assert.match(actual.querySelector('img').src,/^blob:/);
 assert.equal(actual.querySelector('[data-result-refresh]').hidden,true,'a current automatic preview needs no extra refresh action');
 f.api.invalidate();assert.equal(actual.dataset.current,'false');assert.match(actual.querySelector('[data-result-state]').textContent,/中止|前回/);
 f.api.destroy();assert.equal(f.card.parentNode,f.layout);assert.equal(f.legacy.parentNode,f.main);assert.equal(f.summary.parentNode,f.surface);assert.ok(f.revoked.length>0);assert.equal(f.main.dataset.unifiedResult,undefined);
});
test('source comparison never hides native text save links through the hidden attribute',()=>{
 const f=fixture(),originalFile=Object.assign(new Blob(['original']),{name:'source.png'});
 f.api.update({mode:'output',key:'text',loaded:true,ready:true,working:false,originalFile});
 const host=f.card.parentNode;host.querySelector('[data-result-source]').click();
 assert.equal(host.dataset.state,'source');assert.equal(f.card.hidden,false);assert.equal(f.link.closest('[hidden]'),null,'programmatic native save remains available during source comparison');
 host.querySelector('[data-result-source]').click();assert.equal(host.dataset.state,'ready');f.api.destroy();
});

test('native text busy state excludes media controls now housed in the common region',async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
 const source=readFileSync(new URL('../../js/creation/text-tools.mjs',import.meta.url),'utf8');
 const a=source.indexOf('  function setBusy(value) {'),b=source.indexOf('  function worker(',a);assert.ok(a>=0&&b>a);
 const native={disabled:true,closest:()=>({}),matches:()=>false},text={disabled:false,closest:()=>null,matches:()=>false};
 const context={busy:false,root:{setAttribute:()=>{},querySelectorAll:()=>[native,text]},nav:{querySelectorAll:()=>[]},$:()=>({hidden:false})};
 vm.createContext(context);vm.runInContext(source.slice(a,b),context);context.setBusy(true);assert.equal(text.disabled,true);context.setBusy(false);assert.equal(text.disabled,false);assert.equal(native.disabled,true,'native media eligibility must not be enabled by text generation');
});


test('unsupported format changes label retained raster bytes as previous output, never as the new format',async()=>{
 const f=fixture(),blob=new Blob(['jpeg']);
 f.api.update({mode:'media',key:'jpeg',loaded:true,ready:false,working:false,capability:{supported:true,automatic:true},api:{previewOutput:async()=>({blob,filename:'old.jpeg'})}});await f.tick();
 f.api.update({mode:'media',key:'gif',loaded:true,ready:false,working:false,capability:{supported:false,automatic:false,reason:'GIFは保存時に生成します。'}});
 const host=f.card.parentNode;assert.equal(host.dataset.current,'false');assert.match(host.querySelector('[data-result-state]').textContent,/前回のold\.jpeg/);assert.match(host.querySelector('[data-result-state]').textContent,/未反映/);assert.equal(host.querySelector('[data-result-refresh]').hidden,true,'unsupported readonly path has no fake refresh action');f.api.destroy();
});

test('manual GIF/APNG/audio/video previews generate actual Blob before any save action',async()=>{
 for(const [filename,type,tag]of [['animation.gif','image/gif','img'],['animation.apng','image/apng','img'],['sound.wav','audio/wav','audio'],['sound.webm','audio/webm','audio'],['clip.webm','video/webm','video'],['clip.mp4','video/mp4','video']]){
  const f=fixture();let encodes=0,saves=0;f.link.handlers.click=()=>saves++;
  f.api.update({mode:'media',key:filename,loaded:true,ready:false,working:false,capability:{supported:true,automatic:false,reason:'手動更新'},api:{previewOutput:async()=>{encodes++;return{blob:new Blob(['encoded actual output'],{type}),filename};}}});
  assert.equal(encodes,0,filename);const host=f.card.parentNode;assert.equal(host.querySelector('[data-result-refresh]').hidden,false);
  host.querySelector('[data-result-refresh]').click();await f.tick();
  assert.equal(encodes,1,filename);assert.equal(saves,0,filename);assert.equal(host.dataset.current,'true',filename);assert.equal(host.querySelector(tag).hidden,false,filename);assert.match(host.querySelector(tag).src,/^blob:/);assert.match(host.querySelector('[data-result-state]').textContent,new RegExp(filename.replace('.','\\.')));f.api.destroy();
 }
});

test('QOI/TIFF fallback draws decoded encoded-output pixels before Save and rejects stale decode completion',async()=>{
 const f=fixture();const makeNode=Node.prototype.getContext;const drawn=[];
 Node.prototype.getContext=function(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>drawn.push([...image.data])};};
 // Remount with the injected decoder; no filesystem, canvas codec, database or native import is used.
 f.api.destroy();let finish,urls=0;const captured=[];
 const view=mountResultSurface({main:f.main,doc:{createElement:tag=>new Node(tag)},win:{URL:{createObjectURL:()=> `blob:output-${++urls}`,revokeObjectURL:()=>{}},setTimeout:fn=>setTimeout(fn,0),clearTimeout},decodeOutput:({blob,signal})=>{captured.push({blob,signal});return new Promise(resolve=>{finish=resolve;});}});
 const blob=new Blob(['encoded QOI'],{type:'image/qoi'});view.update({mode:'media',key:'qoi',loaded:true,ready:false,capability:{supported:true,automatic:false},api:{previewOutput:async()=>({blob,filename:'result.qoi'})}});
 const host=f.card.parentNode;host.querySelector('[data-result-refresh]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(captured[0].blob,blob);
 finish({width:1,height:1,data:new Uint8ClampedArray([11,22,33,255]),frameCount:1,partial:false});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(drawn.at(-1),[11,22,33,255]);assert.equal(host.querySelector('canvas').hidden,false);assert.match(host.querySelector('canvas').getAttribute('aria-label'),/生成済み/);
 // A pending decode must not publish after changing to a different encoded format.
 view.update({mode:'media',key:'tiff',loaded:true,ready:false,capability:{supported:true,automatic:false},api:{previewOutput:async()=>({blob:new Blob(['TIFF']),filename:'result.tiff'})}});host.querySelector('[data-result-refresh]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(captured.length,2);const oldFinish=finish;
 view.update({mode:'media',key:'jpeg',loaded:true,ready:true,working:false,link:{href:'blob:new-jpeg',download:'current.jpeg'},capability:{supported:true,automatic:false}});
 assert.equal(captured[1].signal.aborted,true);oldFinish({width:1,height:1,data:new Uint8ClampedArray([99,99,99,255]),frameCount:1,partial:false});await new Promise(resolve=>setImmediate(resolve));
 assert.notDeepEqual(drawn.at(-1),[99,99,99,255]);assert.equal(host.querySelector('canvas').hidden,true);assert.equal(host.querySelector('img').src,'blob:new-jpeg');view.destroy();
 if(makeNode)Node.prototype.getContext=makeNode;else delete Node.prototype.getContext;
});

test('manual preview forwards pending FPS to the pure encoder path rather than applying persistent settings',async()=>{
 const f=fixture();let options;
 f.api.update({mode:'media',key:'fps-pending',loaded:true,ready:false,pendingFps:true,pendingSize:true,capability:{supported:true,automatic:false},api:{previewOutput:async captured=>{options=captured;return{blob:new Blob(['GIF89a']),filename:'timed.gif'};}}});
 f.card.parentNode.querySelector('[data-result-refresh]').click();await f.tick();assert.equal(options.pendingFps,true);assert.equal(options.pendingSize,true);assert.ok(options.signal instanceof AbortSignal);f.api.destroy();
});


test('TIFF first-page decoded view never presents the decoder frame count as the total page count',()=>{
 const text=decodedPreviewLabel('archive.tiff',{frameCount:1,partial:true,firstPageOnly:true});assert.match(text,/先頭ページのみ/);assert.match(text,/総ページ数.*確認できません/);assert.doesNotMatch(text,/1コマ|1ページ/);
 const full=decodedPreviewLabel('result.qoi',{frameCount:1,partial:false});assert.match(full,/生成済みresult.qoi/);assert.match(full,/元素材や近似画像ではありません/);
});
