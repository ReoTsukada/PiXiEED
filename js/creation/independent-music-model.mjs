import { createIndependentMusicSession, loadIndependentMusicState, independentMusicViewport, resizeIndependentMusicView, writeIndependentMusicProject } from './independent-music-session.mjs?rev=20261113-canvas1028-1';
import { createDrawMusicState, projectDrawMusic, changeDrawMusicTempo, selectDrawMusicPage, addDrawMusicPage, moveDrawMusicPage, removeDrawMusicPage } from './draw-music-core.mjs?rev=20261113-canvas1028-1';
import { getAnimationCelDocument, resizeAnimation, setAnimationPalette, writeAnimationCel } from './animation-core.mjs?rev=20261113-canvas1028-1';
import { documentRgba } from './draw-core.mjs?rev=20261113-canvas1028-1';

/** UI adapter: one shell/input engine, independent Music state and Undo. */
export async function mountIndependentMusicModel({draw,scope,musicMemoryBudget=16*1024*1024}={}) {
 let session=null,publicState=null,lastDisplay=null,displaying=false,disposed=false,openVersion=0,lastError='';
 const listeners=new Set();
 const mode=()=>draw.independentMusicActive?'audio':'draw';
 const viewport=state=>{const doc=independentMusicViewport(state);return {...doc,schemaVersion:1,pixels:Array.from(doc.pixels)};};
 function expose(){
  if(!session)return null;const current=session.current;
  if(publicState?._canonical===current)return publicState;
  const base=createDrawMusicState(null,current.musicAnimation);
  publicState={...base,independentMusic:true,_canonical:current,animation:current.musicAnimation,musicAnimation:current.musicAnimation,song:current.song,link:current.link||base.link,musicPageId:current.pageId,musicLayerId:'independent-music',musicTrackMode:true};
  return publicState;
 }
 function emit(audioChanged=false){expose();for(const listener of listeners)listener({state:publicState,audioChanged,readOnly:false,error:lastError});}
 function display({activate=false}={}){
  if(!session)return;displaying=true;
  try{lastDisplay=draw.displayIndependentMusicDocument(viewport(session.current),callbacks,{activate});}finally{displaying=false;}
 }
 function commit(next,{audioChanged=true,refresh=true,onCommitted=null}={}){
  session.commit(next,{mode:'audio'});lastError='';onCommitted?.();publicState=null;if(refresh)display();emit(audioChanged);draw.markIndependentMusicDirty?.();return expose();
 }
 function flush(){
  if(disposed||displaying||!session||!draw.independentMusicActive)return;
  const active=draw.getTimeline();if(active===lastDisplay)return;
  try {
  const doc=draw.getDocument(),old=session.current;
  if(doc.width>256||doc.height>256)throw new RangeError('音楽グリッドは256px以下です。');
  let music=old.musicAnimation;
  if(doc.width>music.width||doc.height>music.height)music=resizeAnimation(music,Math.max(doc.width,music.width),Math.max(doc.height,music.height),{anchor:'top-left'});
  if(JSON.stringify(doc.palette)!==JSON.stringify(music.palette))music=setAnimationPalette(music,doc.palette);
  const cel=getAnimationCelDocument(music,old.pageId,music.layers[0].id),pixels=Uint8Array.from(cel.pixels,n=>n+1);
  for(let y=0;y<doc.height;y++)for(let x=0;x<doc.width;x++)pixels[y*music.width+x]=doc.pixels[y*doc.width+x]+1;
  music=writeAnimationCel(music,old.pageId,music.layers[0].id,{width:music.width,height:music.height,pixels});
  // Projection is caused only by a Music edit. Draw/Camera never enter this path.
  const changed = new Set();
  for(let y=0;y<doc.height;y++)for(let x=0;x<doc.width;x++) {
    const prior = x<cel.width && y<cel.height ? cel.pixels[y*cel.width+x] : -1;
    if(prior!==doc.pixels[y*doc.width+x])changed.add(`${x}:${y}`);
  }
  const projected=projectDrawMusic({...expose(),musicTrackMode:false,animation:old.musicAnimation,
    link:{...(old.link||expose().link),rowPitchMap:old.view.rowPitchMap.slice(0,music.height)}},music);
  // Only notes sourced from changed cells may be replaced. Keep the exact
  // pitch/time/metadata of all other notes, including cells outside the view.
  const edited = note => {const c=note.sourceCell;return c && (!c.frameId || c.frameId===old.pageId) && changed.has(`${c.localX??c.x}:${c.y}`);};
  projected.song={...projected.song,tracks:projected.song.tracks.map(track=>({...track,clips:track.clips.map(clip=>{
    const prior=old.song.tracks.find(t=>t.trackId===track.trackId)?.clips.find(c=>c.clipId===clip.clipId);
    return {...clip,notes:[...(prior?.notes||[]).filter(note=>!edited(note)),...clip.notes.filter(edited)]};
  })}))};
  commit({...old,musicAnimation:music,song:projected.song,link:projected.link},{refresh:false,onCommitted:()=>{lastDisplay=active;}});
  } catch(error) {
    lastError=error?.message || String(error);
    // The input session may already contain the rejected pixels. Restore the
    // canonical viewport before notifying subscribers or allowing a later save.
    publicState=null;display();emit(false);throw error;
  }
 }
 function assertViewSettings(settings) {
  if (settings.sourcePalette || settings.palette && JSON.stringify(settings.palette)!==JSON.stringify(session.current.musicAnimation.palette)) throw new Error('音楽グリッド設定ではパレットを変更できません。色パネルで音色を設定してください。');
 }
 const callbacks={
  retainedBytes:()=>session?.retainedBytes || 0,
  canUndo:()=>Boolean(session?.canUndo),canRedo:()=>Boolean(session?.canRedo),
  undo(){if(mode()!=='audio'||!session?.undo({mode:'audio'}))return false;publicState=null;display();emit(true);draw.markIndependentMusicDirty?.();return true;},
  redo(){if(mode()!=='audio'||!session?.redo({mode:'audio'}))return false;publicState=null;display();emit(true);draw.markIndependentMusicDirty?.();return true;},
  resizeView(settings){flush();assertViewSettings(settings);const next=resizeIndependentMusicView(session.current,settings);commit(next,{audioChanged:false});return true;},
  previewView(settings){flush();assertViewSettings(settings);const next=resizeIndependentMusicView(session.current,settings),doc=viewport(next);return {owner:draw.getTimeline(),animation:next.musicAnimation,changed:next.view.width!==session.current.view.width||next.view.height!==session.current.view.height,image:{width:doc.width,height:doc.height,rgba:documentRgba(doc)},summary:{croppedPixels:0,remappedColors:0,musicImpact:'音楽の表示範囲だけ変更します。範囲外の音符・画素は保持し、曲の音程と開始時刻は変えません。'}};}
 };
 const unsubscribe=draw.subscribe(()=>{if(!displaying)flush();});scope.add(unsubscribe);
 const hook={
  async onOpen(project){const version=++openVersion;const state=await loadIndependentMusicState(project);if(disposed||version!==openVersion)return;session=createIndependentMusicSession(state,{maxBytes:Math.min(musicMemoryBudget,16*1024*1024)});lastError='';publicState=null;draw.setMusicReadOnly?.('');display({activate:globalThis.document?.body?.dataset?.creationMode==='audio'});emit(false);},
  async onSave(project){flush();if(!session)return project;return writeIndependentMusicProject(project,session.current);}
 };
 try{const remove=await draw.attachProjectHooks(hook);scope.add(remove);}catch(error){unsubscribe();throw error;}
 function change(transform){if(mode()!=='audio')throw new Error('音楽モードで設定してください。');flush();const transformed=transform(expose());return commit({...session.current,musicAnimation:transformed.musicAnimation||session.current.musicAnimation,song:transformed.song,link:transformed.link,pageId:transformed.musicPageId||session.current.pageId});}
 const page=async(transform)=>change(transform);
 scope.add(()=>{disposed=true;listeners.clear();});
 return {getState(){flush();return expose();},get readOnly(){return false},get error(){return lastError},independent:true,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)},change,changeTempo:tempo=>change(state=>changeDrawMusicTempo(state,tempo)),
  selectMusicLayer(){display({activate:true});return true;},
  selectPage:id=>page(state=>selectDrawMusicPage(state,id)),addPage:options=>page(state=>addDrawMusicPage(state,options)),movePage:(id,index)=>page(state=>moveDrawMusicPage(state,id,index)),removePage:id=>page(state=>removeDrawMusicPage(state,id)),
  refresh(){flush();return expose();},dispose(){disposed=true;unsubscribe();listeners.clear();}
 };
}
