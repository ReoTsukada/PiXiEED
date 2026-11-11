import test from 'node:test';
import assert from 'node:assert/strict';
import { resultSurfacePresentation, mountResultSurface, decodedPreviewLabel } from '../../js/creation/conversion-result-surface.mjs';
import { selectGeneratedTextOutputPreview } from '../../js/creation/text-tools.mjs';
import { mountConversionSourceInspector } from '../../js/creation/conversion-source-inspector.mjs?rev=20261110-output-result-1';

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
 constructor(tag='div',name='',ownerDocument=null){this.tagName=tag.toUpperCase();this.name=name;this.children=[];this.parentNode=null;this.dataset={};this.attributes=new Map();this.hidden=false;this.disabled=false;this.open=false;this.scrollTop=0;this.textContent='';this.handlers={};this.src='';this.value='';this.ownerDocument=ownerDocument;this.pauseCount=0;this.style={};}
 get nextSibling(){const a=this.parentNode?.children||[];return a[a.indexOf(this)+1]||null;}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;if(!node.ownerDocument)node.ownerDocument=this.ownerDocument;this.children.push(node);}}
 prepend(...nodes){for(const node of nodes.slice().reverse()){node.remove();node.parentNode=this;if(!node.ownerDocument)node.ownerDocument=this.ownerDocument;this.children.unshift(node);}}
 replaceChildren(...nodes){for(const child of this.children.slice())child.remove();this.append(...nodes);}
 after(node){this.parentNode.insertBefore(node,this.nextSibling);}
 insertBefore(node,next){node.remove();const i=next?this.children.indexOf(next):this.children.length;assert.ok(i>=0);node.parentNode=this;if(!node.ownerDocument)node.ownerDocument=this.ownerDocument;this.children.splice(i,0,node);}
 remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.get(k)??null;}
 removeAttribute(k){this.attributes.delete(k);if(k==='src')this.src='';}
 addEventListener(k,fn){(this.handlers[k] ||= []).push(fn);}removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(x=>x!==fn);}
 dispatch(type,event={}){event.type=type;event.target ||= this;for(let node=this;node;node=node.parentNode)for(const fn of node.handlers[type]||[])fn(event);}
 click(){this.dispatch('click',{});}focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;this.dispatch('focusin',{});}pause(){this.pauseCount++;}
 contains(node){for(let p=node;p;p=p.parentNode)if(p===this)return true;return false;}
 closest(selector){for(let p=this;p;p=p.parentNode)if(selector==='[hidden]'&&p.hidden)return p;return null;}
 matches(selector){if(this.name===selector||this.tagName.toLowerCase()===selector)return true;if(selector==='[hidden]')return this.hidden;if(selector.includes(','))return selector.split(',').some(s=>this.matches(s.trim()));if(selector.startsWith('.'))return String(this.className||'').split(/\s+/).includes(selector.slice(1));if(selector.startsWith('[data-')){const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return Object.hasOwn(this.dataset,key);}if(selector.startsWith('link['))return this.tagName==='LINK'&&this.matches(selector.slice(5));return false;}
 querySelectorAll(selector){return this.all().filter(node=>node.matches(selector));}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 all(){return this.children.flatMap(node=>[node,...node.all()]);}
 getContext(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};}
 set innerHTML(_text){
  const toolbar=new Node('div','[data-sc-preview-toolbar]'),toolbarHeader=new Node('header'),strong=new Node('strong'),actions=new Node('div','.sc-preview-header-actions');toolbar.className='sc-preview-toolbar';
  const refresh=new Node('button','[data-result-refresh]'),cancel=new Node('button','[data-result-cancel]');actions.append(refresh,cancel);toolbarHeader.append(strong,actions);toolbar.append(toolbarHeader);
  const status=new Node('p','[data-result-state]'),body=new Node('div','[data-sc-result-body]');body.className='sc-result-body';
  const content=new Node('div','.sc-result-content'),fallback=new Node('p','[data-result-fallback]'),label=new Node('label','[data-result-text-label]'),text=new Node('textarea','[data-result-text]'),note=new Node('p','[data-result-text-note]');content.append(new Node('img'),new Node('audio'),new Node('video'),fallback,label,text,note);body.append(content,status);
  const auxiliary=new Node('details','.sc-result-aux'),summary=new Node('summary'),auxiliaryContent=new Node('div','.sc-result-aux-content');auxiliary.append(summary,auxiliaryContent);this.append(toolbar,body,auxiliary);
 }
}
function fixture(){
 const main=new Node('main'),root=new Node('section','[data-text-tools]'),composer=new Node('section','.sc-unified-composer'),controls=new Node('div','.sc-unified-controls'),head=new Node('div','.sc-unified-head'),layout=new Node('div'),card=new Node('section','.tx-result-card'),link=new Node('a'),legacy=new Node('div','.text-legacy'),surface=new Node('section'),summary=new Node('div','.sc-preview-summary'),settingsHome=new Node('div','.sc-input-actions'),settingsButton=new Node('button','[data-sc-settings-open]');
 composer.append(controls,head);layout.append(card);card.append(link);root.append(composer,layout);surface.append(summary);legacy.append(surface);settingsHome.append(settingsButton);main.append(root,legacy,settingsHome);
 let seq=0;const revoked=[],created=new Map(),timers=new Map();const doc={activeElement:null,handlers:{},createElement:tag=>new Node(tag,'',doc),createElementNS:(_ns,tag)=>new Node(tag,'',doc),addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);},removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(x=>x!==fn);},dispatch(type,event={}){for(const fn of this.handlers[type]||[])fn(event);},querySelector:()=>null};doc.head=new Node('head','',doc);
 const win={URL:{createObjectURL:blob=>{const url=`blob:test-${++seq}`;created.set(url,blob);return url;},revokeObjectURL:url=>revoked.push(url)},setTimeout:fn=>{const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 const api=mountResultSurface({main,doc,win});
 const host=root.children.find(node=>node!==composer&&node!==layout);
 return {main,root,composer,controls,head,settingsHome,settingsButton,layout,card,link,legacy,surface,summary,host,api,doc,win,revoked,created,tick:async()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}await new Promise(resolve=>setImmediate(resolve));}};
}
test('actual mount shares one host, readonly preview has no download, and destroy restores original DOM order and URLs',async()=>{
 const f=fixture();const actual=f.host;
 assert.ok(actual);assert.equal(f.card.parentNode,f.composer.querySelector('.sc-result-aux-content'));assert.equal(f.legacy.parentNode,f.composer.querySelector('.sc-result-aux-content'));assert.equal(f.summary.parentNode,f.composer.querySelector('.sc-result-aux-content'));
 assert.equal(f.controls.parentNode,f.composer,'unified output controls stay in the settings pane');assert.equal(f.settingsButton.parentNode,f.head,'native settings entry stays on the settings side');
 let renders=0;const blob=new Blob(['png']);
 f.api.update({mode:'media',key:'a',loaded:true,ready:false,working:false,capability:{supported:true,automatic:true},api:{previewOutput:async()=>{renders++;return{blob,filename:'a.png'};}}});
 await f.tick();assert.equal(renders,1);assert.equal(actual.dataset.current,'true');assert.match(actual.querySelector('img').src,/^blob:/);
 assert.equal(actual.querySelector('[data-result-refresh]').hidden,true,'a current automatic preview needs no extra refresh action');
 f.api.invalidate();assert.equal(actual.dataset.current,'false');assert.match(actual.querySelector('[data-result-state]').textContent,/中止|前回/);
 f.api.destroy();assert.equal(f.card.parentNode,f.layout);assert.equal(f.legacy.parentNode,f.main);assert.equal(f.summary.parentNode,f.surface);assert.equal(f.settingsButton.parentNode,f.settingsHome);assert.equal(f.composer.querySelector('.sc-result-aux'),null,'result teardown removes its owned settings disclosure');assert.ok(f.revoked.length>0);assert.equal(f.main.dataset.unifiedResult,undefined);
});
test('result body keeps toolbar static, resets only on mode/source identity, and preserves native controls in disclosure',()=>{
 const f=fixture(),host=f.host,body=host.querySelector('[data-sc-result-body]'),aux=f.composer.querySelector('.sc-result-aux');
 f.api.update({mode:'media',key:'empty',loaded:false,ready:false,working:false});assert.equal(aux.open,true,'empty media keeps its native add/progress controls reachable');
 const link={href:'blob:current',download:'source.png',type:'image/png'};
 f.api.update({mode:'media',key:'loaded',loaded:true,ready:true,working:false,link});assert.equal(aux.open,false,'loading a source collapses the redundant native viewer once');
 body.scrollTop=27;f.api.update({mode:'media',key:'same',loaded:true,ready:true,working:false,link});assert.equal(body.scrollTop,27,'ordinary redraw does not steal the user scroll position');
 aux.open=true;body.scrollTop=48;f.api.update({mode:'media',key:'source-change',loaded:true,ready:true,working:false,link,activeSourceId:'source-b'});assert.equal(body.scrollTop,0,'a changed source returns the result body to its top');assert.equal(aux.open,true,'source updates do not repeatedly close a user-opened disclosure');
 const nativePreview=new Node('canvas','[data-tx-preview]');nativePreview.hidden=false;f.root.append(nativePreview);
 f.api.update({mode:'input',key:'text-mode',loaded:true,ready:true,working:false});assert.equal(nativePreview.hidden,false,'native copy/zoom preview state remains owned by text-tools inside the disclosure');assert.equal(body.scrollTop,0,'mode changes reveal the generated result from the top');
 f.api.destroy();
});
test('source inspection is read-only and leaves the generated output and native save links visible',()=>{
 const f=fixture(),originalFile=Object.assign(new Blob(['original']),{name:'source.png'});
 f.api.update({mode:'output',key:'text',loaded:true,ready:true,working:false,originalFile});
 const host=f.host;
 const inspector=host.querySelector('.sc-source-inspector'),trigger=inspector.querySelector('[data-source-inspect-button]');
 assert.ok(trigger);trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(host.dataset.state,'stale');
 assert.equal(f.main.dataset.resultSource,'false','the old large source comparison surface stays hidden behind the compact inspector');
 assert.equal(f.card.hidden,false);assert.equal(f.link.closest('[hidden]'),null,'source inspection cannot hide or replace native save links');
 assert.equal(f.main.dataset.resultMode,'output','source inspection does not change the active output');
 trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'false');f.api.destroy();
});

test('PNG and SVG output previews use the exact saved Blob; PXT shows the exact project text',async()=>{
 const f=fixture(),png=new Blob(['saved png bytes'],{type:'image/png'}),svgText='<svg xmlns="http://www.w3.org/2000/svg"><text>saved</text></svg>',svg=new Blob([svgText],{type:'image/svg+xml'}),projectText='{"schema":"pixieed.text","text":"same project"}',project=new Blob([projectText],{type:'text/plain;charset=utf-8'});
 const host=f.host;
 f.api.update({mode:'input',key:'png',loaded:true,ready:true,working:false,outputPreview:{kind:'image',format:'png',filename:'pixieed-text.png',mimeType:png.type,blob:png,text:'',generationMode:'input',matchesInput:true}});
 assert.equal(f.created.get(host.querySelector('img').src),png,'central PNG uses the saved PNG Blob');
 f.api.update({mode:'input',key:'svg',loaded:true,ready:true,working:false,outputPreview:{kind:'image',format:'svg',filename:'pixieed-text.svg',mimeType:svg.type,blob:svg,text:'',generationMode:'input',matchesInput:true}});
 assert.equal(f.created.get(host.querySelector('img').src),svg,'SVG is shown as an image from the saved SVG Blob');
 assert.equal(await f.created.get(host.querySelector('img').src).text(),svgText);
 const svgHref=host.querySelector('img').src;
 f.api.update({mode:'input',key:'project',loaded:true,ready:true,working:false,outputPreview:{kind:'text',format:'pxtxt',filename:'pixieed-text.pxtxt',mimeType:project.type,blob:project,text:projectText,generationMode:'input',matchesInput:true}});
 assert.ok(f.revoked.includes(svgHref),'format updates revoke the prior owned preview URL');
 assert.equal(host.querySelector('img').hidden,true);assert.equal(host.querySelector('[data-result-text]').value,projectText);
 assert.match(host.querySelector('[data-result-text-label]').textContent,/文章と設定データ（PXT）/);
 assert.match(host.querySelector('[data-result-text-note]').textContent,/画像ではなく/);
 assert.equal(await project.text(),host.querySelector('[data-result-text]').value);f.api.destroy();
});

test('TXT preview includes appended restore text, makes 64K truncation clear, and keeps stale output labeled',()=>{
 const f=fixture(),text=`${'art\n'.repeat(16000)}\n\n# PIXIEED RESTORE ENVELOPE\nAAA`;const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),host=f.host;
 const outputPreview={kind:'text',format:'txt',filename:'image.txt',mimeType:blob.type,blob,text,generationMode:'output',matchesInput:true};
 f.api.update({mode:'output',key:'text-current',loaded:true,ready:true,working:false,outputPreview});
 assert.equal(host.querySelector('[data-result-text]').value,text.slice(0,64000));
 assert.match(host.querySelector('[data-result-text-note]').textContent,/先頭64,000文字/);
 assert.match(host.querySelector('[data-result-text-note]').textContent,/復元コードを含む/);
 assert.equal(f.created.size,0,'TXT is displayed as text without a media URL');
 f.api.update({mode:'output',key:'text-stale',loaded:true,ready:true,working:false,outputPreview:{...outputPreview,matchesInput:false}});
 assert.equal(host.dataset.current,'false');assert.equal(host.querySelector('[data-result-text]').value,text.slice(0,64000));
 assert.match(host.querySelector('[data-result-state]').textContent,/前回の image\.txt/);f.api.destroy();
});

test('source inspector opens on hover/focus and touch toggle, closes on Escape/outside, and only previews active pixels',()=>{
 let seq=0;const revoked=[],created=new Map(),doc={activeElement:null,handlers:{},createElement:tag=>new Node(tag,'',doc),createElementNS:(_ns,tag)=>new Node(tag,'',doc),addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);},removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(x=>x!==fn);},dispatch(type,event={}){for(const fn of this.handlers[type]||[])fn(event);}};
 const win={URL:{createObjectURL:blob=>{const url=`blob:source-${++seq}`;created.set(url,blob);return url;},revokeObjectURL:url=>revoked.push(url)}};
 const inspector=mountConversionSourceInspector({doc,win}),button=inspector.element.querySelector('[data-source-inspect-button]'),panel=inspector.element.querySelector('.sc-source-inspector__panel'),list=panel.querySelector('.sc-source-inspector__list');
 const pixels={width:2,height:1,data:new Uint8Array([255,0,0,255,0,255,0,255])};
 inspector.update([{id:'active',name:'active.png',kind:'image',firstFrame:pixels},{id:'other',name:'other.png',kind:'image',firstFrame:pixels}],'active');
 assert.equal(list.children.length,0,'source pixels are rendered lazily only after inspection opens');
 inspector.element.dispatch('pointerenter',{pointerType:'mouse'});assert.equal(panel.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
 const previewCards=list.children.filter(node=>node.className==='sc-source-inspector__asset');assert.equal(previewCards.length,1,'only the active source is previewed, not the whole batch');assert.equal(previewCards[0].querySelector('strong').textContent,'active.png');
 doc.dispatch('keydown',{key:'Escape',preventDefault(){}});assert.equal(panel.hidden,true);assert.equal(doc.activeElement,button,'Escape restores focus to the eye button');
 button.dispatch('pointerdown',{pointerType:'touch'});button.focus();assert.equal(panel.hidden,true,'touch focus alone does not open and immediately close the popover');button.click();assert.equal(panel.hidden,false);button.dispatch('pointerdown',{pointerType:'touch'});button.click();assert.equal(panel.hidden,true,'a second touch toggles the popover closed');
 button.dispatch('focusout',{relatedTarget:null});doc.dispatch('keydown',{key:'Tab'});button.focus();assert.equal(panel.hidden,false,'keyboard focus opens the source inspector');doc.dispatch('pointerdown',{target:new Node('button'),});assert.equal(panel.hidden,true,'outside pointer closes it');
 inspector.destroy();assert.equal(revoked.length,0);assert.equal(created.size,0);
});

test('source inspector does not substitute another asset when an explicit active ID is missing',()=>{
 const doc={activeElement:null,handlers:{},createElement:tag=>new Node(tag,'',doc),createElementNS:(_ns,tag)=>new Node(tag,'',doc),addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);},removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(x=>x!==fn);}};
 const win={URL:{createObjectURL:()=>{throw Error('no Blob preview should be created');},revokeObjectURL(){}}};
 const inspector=mountConversionSourceInspector({doc,win}),button=inspector.element.querySelector('[data-source-inspect-button]'),list=inspector.element.querySelector('.sc-source-inspector__list');
 const pixels={width:1,height:1,data:new Uint8Array([1,2,3,255])};
 const sources=[{id:'first',name:'first.png',kind:'image',firstFrame:pixels},{id:'second',name:'second.png',kind:'image',firstFrame:pixels}];
 inspector.update(sources,'transient-missing');button.click();
 assert.equal(list.querySelector('canvas'),null);assert.equal(list.querySelector('img'),null);
 assert.equal(list.children.length,1);assert.match(list.children[0].textContent,/現在の素材を確認できません/);
 inspector.update(sources,'second');assert.equal(list.querySelector('canvas').getAttribute('aria-label'),'second.pngの縮小プレビュー');
 inspector.destroy();
});

test('source inspector supports local video without autoplay, reports load failures, pauses and revokes URLs',()=>{
 let seq=0;const revoked=[],created=new Map(),doc={activeElement:null,handlers:{},createElement:tag=>new Node(tag,'',doc),createElementNS:(_ns,tag)=>new Node(tag,'',doc),addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);},removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(x=>x!==fn);},dispatch(type,event={}){for(const fn of this.handlers[type]||[])fn(event);}};
 const win={URL:{createObjectURL:blob=>{const url=`blob:media-${++seq}`;created.set(url,blob);return url;},revokeObjectURL:url=>revoked.push(url)},fetch(){throw Error('source inspector must not fetch');}};
 const inspector=mountConversionSourceInspector({doc,win}),button=inspector.element.querySelector('[data-source-inspect-button]'),panel=inspector.element.querySelector('.sc-source-inspector__panel');
 const file=Object.assign(new Blob(['video bytes'],{type:'video/mp4'}),{name:'clip.mp4'});
 inspector.update([{id:'clip',name:'clip.mp4',kind:'video-source',file}],'clip');button.dispatch('pointerenter',{pointerType:'mouse'});
 const video=panel.querySelector('video');assert.ok(video);assert.equal(video.autoplay,undefined);assert.equal(video.controls,true);assert.equal(video.preload,'metadata');assert.equal(video.playsInline,true);
 video.onerror();assert.equal(video.hidden,true);assert.match(panel.querySelector('.sc-source-inspector__fallback').textContent,/読み込めませんでした/);
 const priorUrl=video.src, nextFile=Object.assign(new Blob(['replacement video'],{type:'video/mp4'}),{name:'replacement.mp4'});
 inspector.update([{id:'replacement',name:'replacement.mp4',kind:'video-source',file:nextFile}],'replacement');
 assert.ok(revoked.includes(priorUrl),'source object URL is revoked when the active source changes');assert.ok(video.pauseCount>0);
 panel.querySelector('.sc-source-inspector__close').click();inspector.destroy();assert.ok(revoked.length>1,'local object URLs are revoked on teardown too');
});

test('text-input mode inspects its text source instead of retained media sources',()=>{
 const f=fixture(),pixels={width:1,height:1,data:new Uint8Array([1,2,3,255])};
 f.api.update({mode:'input',key:'input-text',loaded:true,ready:false,working:false,sourceText:'current source text',sourceRevision:3,
  sources:[{id:'stale-media',name:'old.png',kind:'image',firstFrame:pixels}],activeSourceId:'stale-media'});
 const host=f.host,button=host.querySelector('[data-source-inspect-button]');button.click();
 const panel=host.querySelector('.sc-source-inspector__panel');assert.equal(panel.querySelector('canvas'),null);assert.equal(panel.querySelector('textarea').value,'current source text');
 assert.match(panel.querySelector('.sc-source-inspector__list').children[0].querySelector('strong').textContent,/入力した文章/);f.api.destroy();
});

test('restored text files show their actual metadata instead of prior art or PNG content',()=>{
 const f=fixture(),blob=new Blob(['restored text bytes'],{type:'text/plain'}),host=f.host;
 f.api.update({mode:'input',key:'restored-txt',loaded:true,ready:true,working:false,outputPreview:{kind:'file',format:'txt',filename:'restored.txt',mimeType:blob.type,blob,text:'',generationMode:'input',matchesInput:true}});
 assert.equal(host.querySelector('.sc-result-content').hidden,false);assert.equal(host.querySelector('[data-result-fallback]').hidden,false);
 assert.match(host.querySelector('[data-result-fallback]').textContent,/restored\.txt.*text\/plain/);
 assert.equal(host.querySelector('[data-result-text]').hidden,true);assert.equal(host.querySelector('img').hidden,true);f.api.destroy();
});

test('text output metadata selects exact PNG, SVG, PXT, and TXT artifacts and retains stale identity',async()=>{
 const png=new Blob(['png'],{type:'image/png'}),svgText='<svg>saved</svg>',svg=new Blob([svgText],{type:'image/svg+xml'}),projectText='saved project json',project=new Blob([projectText],{type:'text/plain;charset=utf-8'}),txtText='art\n\nRESTORE ENVELOPE',txt=new Blob([txtText],{type:'text/plain;charset=utf-8'});
 const artifacts=new Map([['[data-tx-download]',{blob:png,name:'pixieed-text.png'}],['[data-tx-svg]',{blob:svg,name:'pixieed-text.svg'}],['[data-tx-project]',{blob:project,name:'pixieed-text.pxtxt'}],['[data-tx-txt]',{blob:txt,name:'source.txt'}]]);
 for(const [format,expected,kind] of [['png',png,'image'],['svg',svg,'image'],['pxtxt',project,'text']]){
  const preview=selectGeneratedTextOutputPreview({mode:'input',generationMode:'input',generatedKind:'text-render',renderFormat:format,artifacts,projectText,signature:'same',currentSignature:'same'});
  assert.equal(preview.blob,expected);assert.equal(preview.kind,kind);assert.equal(preview.matchesInput,true);
  if(format==='pxtxt')assert.equal(preview.text,await expected.text());
 }
 const textPreview=selectGeneratedTextOutputPreview({mode:'output',generationMode:'output',generatedKind:'text',artifacts,outputText:txtText,signature:'old',currentSignature:'new'});
 assert.equal(textPreview.kind,'text');assert.equal(textPreview.format,'txt');assert.equal(textPreview.text,txtText);assert.equal(await textPreview.blob.text(),txtText);assert.equal(textPreview.matchesInput,false);
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
 const host=f.host;assert.equal(host.dataset.current,'false');assert.match(host.querySelector('[data-result-state]').textContent,/前回のold\.jpeg/);assert.match(host.querySelector('[data-result-state]').textContent,/未反映/);assert.equal(host.querySelector('[data-result-refresh]').hidden,true,'unsupported readonly path has no fake refresh action');f.api.destroy();
});

test('manual GIF/APNG/audio/video previews generate actual Blob before any save action',async()=>{
 for(const [filename,type,tag]of [['animation.gif','image/gif','img'],['animation.apng','image/apng','img'],['sound.wav','audio/wav','audio'],['sound.webm','audio/webm','audio'],['clip.webm','video/webm','video'],['clip.mp4','video/mp4','video']]){
  const f=fixture();let encodes=0,saves=0;f.link.handlers.click=()=>saves++;
  f.api.update({mode:'media',key:filename,loaded:true,ready:false,working:false,capability:{supported:true,automatic:false,reason:'手動更新'},api:{previewOutput:async()=>{encodes++;return{blob:new Blob(['encoded actual output'],{type}),filename};}}});
  assert.equal(encodes,0,filename);const host=f.host;assert.equal(host.querySelector('[data-result-refresh]').hidden,false);
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
 const host=f.root.querySelector('.sc-result-surface');host.querySelector('[data-result-refresh]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(captured[0].blob,blob);
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
 f.host.querySelector('[data-result-refresh]').click();await f.tick();assert.equal(options.pendingFps,true);assert.equal(options.pendingSize,true);assert.ok(options.signal instanceof AbortSignal);f.api.destroy();
});


test('TIFF first-page decoded view never presents the decoder frame count as the total page count',()=>{
 const text=decodedPreviewLabel('archive.tiff',{frameCount:1,partial:true,firstPageOnly:true});assert.match(text,/先頭ページのみ/);assert.match(text,/総ページ数.*確認できません/);assert.doesNotMatch(text,/1コマ|1ページ/);
 const full=decodedPreviewLabel('result.qoi',{frameCount:1,partial:false});assert.match(full,/生成済みresult.qoi/);assert.match(full,/元素材や近似画像ではありません/);
});
