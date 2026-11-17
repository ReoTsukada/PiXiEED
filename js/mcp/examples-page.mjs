import { CASE_LIBRARY_STATUS, getVisiblePixelArtCases } from './pixel-art-cases.mjs?v=20261117-case-library-24';
import { encodePixelArt } from './pixel-art-contract.mjs';
import { TECHNIQUES } from './pixel-art-techniques.mjs';
const techniqueTitles=Object.fromEntries(TECHNIQUES.map(t=>[t.id,t.title]));
const families={character:'人物',animal:'動物',food:'食物',object:'道具',machine:'機械',scene:'風景',transparent:'透明物',effect:'エフェクト'};
const decisions={improved:'内部比較で改善を確認',unchanged:'差を判別できず保留',mixed:'改善点と残る課題あり',keep_before:'初稿を維持'};
const grid=document.querySelector('#case-grid'), family=document.querySelector('#case-family'), size=document.querySelector('#case-size');
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function render(){
 const selected=getVisiblePixelArtCases().filter(c=>(!family.value||c.family===family.value)&&(!size.value||c.width===Number(size.value)));
 const fragment=document.createDocumentFragment();
 for(const item of selected){
  const card=el('article',undefined,'case');card.id=item.id;
  card.append(el('h2',item.title),el('p',families[item.family]+' · '+item.width+'×'+item.height+'px · '+(item.split==='development'?'設計検討用':'別題材への適用確認'),'meta'),el('p',item.intent));
  const pair=el('div',undefined,'images');
  for(const [label,key] of [['初稿','before'],['修正版','after']]){
   const fig=el('figure'),frame=el('div',undefined,'art-frame'),native=el('img'),zoom=el('img');
   native.src='data:image/png;base64,'+item[key+'Png'];native.width=item.width;native.height=item.height;native.alt=label+'の原寸';
   zoom.src=native.src;zoom.alt=label+'の整数拡大';zoom.dataset.pixelWidth=String(item.width);zoom.dataset.pixelHeight=String(item.height);
   frame.append(native,zoom);fig.append(el('figcaption',label),frame);pair.append(fig);
  }
  const userStatus=item.userAcceptance==='accepted'?'ユーザー採用済み':'ユーザー未採用・比較教材';
  card.append(pair,el('p','内部判断: '+(decisions[item.internalDecision]||'評価を確認中'),'decision'),el('p','ユーザー採用: '+userStatus,'user-acceptance'),el('p',item.changeSummary));
  const details=el('details');details.append(el('summary','観察した点と技法'));
  const list=el('ul');for(const note of item.observations)list.append(el('li',note));
  details.append(list,el('p','試した技法: '+item.techniqueIds.map(id=>techniqueTitles[id]??id).join(' / ')));
  card.append(details);
  const links=el('div',undefined,'links');
  for(const [label,key] of [['初稿をDrawで開く','before'],['修正版をDrawで開く','after']]){
   if(item[key]){
    const a=el('a',label);a.href='/ai/#art='+encodePixelArt(item[key]);links.append(a);
   }
  }
  if(item.pxdAvailable)for(const [label,suffix] of [['初稿PXD','before'],['修正版PXD','after']]){
   const a=el('a',label);a.href='/assets/ai-expression-cases/'+item.id+'-'+suffix+'.pxd';a.download=item.id+'-'+suffix+'.pxd';links.append(a);
  }
  card.append(links);fragment.append(card);
 }
 grid.replaceChildren(fragment);document.querySelector('#case-status').textContent=selected.length ? selected.length+'件を表示しています。' : CASE_LIBRARY_STATUS.note;
 scaleImages();
}
function scaleImages(){
 for(const img of grid.querySelectorAll('img[data-pixel-width]')){
  const w=Number(img.dataset.pixelWidth),h=Number(img.dataset.pixelHeight),frame=img.parentElement;
  const padding=parseFloat(getComputedStyle(frame).paddingLeft)+parseFloat(getComputedStyle(frame).paddingRight);
  const scale=Math.max(1,Math.min(8,Math.floor((frame.clientWidth-padding-2)/w),Math.floor(192/h)));
  img.style.width=(w*scale)+'px';img.style.height=(h*scale)+'px';
 }
}
family.addEventListener('change',render);size.addEventListener('change',render);window.addEventListener('resize',scaleImages);
render();
function revealHash(){let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const item=document.getElementById(id);if(item)item.scrollIntoView();}
window.addEventListener('hashchange',revealHash);revealHash();
