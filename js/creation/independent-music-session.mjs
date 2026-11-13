/** Independent Music domain. Not yet connected to the editor shell.
 * Draw/camera dimensions and palettes are deliberately absent from this API.
 */
import { createAnimation, validateAnimation, estimateRetainedAnimationBytes, getAnimationCelDocument } from './animation-core.mjs?rev=20261113-canvas1028-1';
import { createAudioSong, validateAudioSong, AUDIO_PIXEL_TICKS, createAudioRowPitchMap } from './audio-core.mjs';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs?rev=20261113-canvas1028-1';
import { getPxdJson, setPxdJson } from './pxd-codec.mjs';

export const INDEPENDENT_MUSIC_SCHEMA = 1;
export const MUSIC_GRID_MAX_DIMENSION = 256;
export const MUSIC_DOMAIN_MEMORY_BUDGET = 16 * 1024 * 1024;
const PATH = 'audio/independent-grid.json';
const optionalJson = (project,path) => project?.entries?.some(entry=>entry.path===path) ? getPxdJson(project,path) : null;
const freeze = value => { if(value && typeof value === 'object' && !Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value; };
const cloneFrozen = value => freeze(structuredClone(value));
const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function dimension(value){if(!Number.isInteger(value)||value<1||value>MUSIC_GRID_MAX_DIMENSION)throw new RangeError('音楽グリッドは1〜256です。');return value;}
function validateMusicAnimation(value){validateAnimation(value);dimension(value.width);dimension(value.height);if(value.layers.length!==1)throw new TypeError('音楽は独立した1レイヤーのページとして保持します。');return value;}
function validateView(view, animation){
 const width=dimension(view?.width??animation.width),height=dimension(view?.height??animation.height);
 const ticksPerCell=view?.ticksPerCell??AUDIO_PIXEL_TICKS;
 if(!Number.isInteger(ticksPerCell)||ticksPerCell<1)throw new TypeError('1列のtick数が不正です。');
 const rowPitchMap=view?.rowPitchMap??createAudioRowPitchMap(animation.height);
 if(!Array.isArray(rowPitchMap)||rowPitchMap.length<height||rowPitchMap.length>256||rowPitchMap.some(p=>!Number.isInteger(p)||p<0||p>127))throw new TypeError('音程対応を保持できません。');
 return cloneFrozen({width,height,ticksPerCell,rowPitchMap:[...rowPitchMap]});
}
export function createIndependentMusicState({musicAnimation,song,link=null,pageId,view}={}){
 validateMusicAnimation(musicAnimation);validateAudioSong(song);
 pageId??=musicAnimation.frames[0].id;if(!musicAnimation.frames.some(f=>f.id===pageId))throw new TypeError('音楽ページがありません。');
 return Object.freeze({schemaVersion:INDEPENDENT_MUSIC_SCHEMA,musicAnimation,song:cloneFrozen(song),link:cloneFrozen(link),pageId,view:validateView(view || {rowPitchMap:link?.rowPitchMap},musicAnimation)});
}
export function estimateMusicDomainBytes(states){
 const unique=[...new Set(states)],objects=new Set();let json=0;
 for(const state of unique)for(const value of [state.song,state.link,state.view])if(value&&!objects.has(value)){objects.add(value);json+=jsonBytes(value)*3;}
 return estimateRetainedAnimationBytes(unique.map(s=>s.musicAnimation))+json+unique.length*512;
}
/** View-only PX change: no pitch rescaling, time stretching, pixel cropping or note deletion. */
export function resizeIndependentMusicView(state,{width=state.view.width,height=state.view.height}={}){
 dimension(width);dimension(height);
 const map=[...state.view.rowPitchMap];
 // New rows require an explicit pitch map: guessing a new scale would change the tune.
 if(height>map.length)throw new RangeError('追加する行の音程を先に設定してください。既存の音程は変更していません。');
 return Object.freeze({...state,view:validateView({...state.view,width,height},state.musicAnimation)});
}
/** Changing the mapping is an explicit Music-only edit, never a Draw resize side effect. */
export function setIndependentMusicView(state,view){return Object.freeze({...state,view:validateView({...state.view,...view},state.musicAnimation)});}
export function createIndependentMusicSession(initial,{maxBytes=MUSIC_DOMAIN_MEMORY_BUDGET,maxEntries=100}={}){
 if(!Number.isInteger(maxBytes)||maxBytes<1||!Number.isInteger(maxEntries)||maxEntries<1)throw new RangeError('音楽履歴予算が不正です。');
 let current=createIndependentMusicState(initial);const past=[],future=[];
 const check=items=>{if(estimateMusicDomainBytes(items)>maxBytes)throw new RangeError('音楽と履歴のメモリ予算を超えています。元データを保持しました。');};check([current]);
 const requireMusic=mode=>{if(mode!=='audio')throw new Error('音楽レイヤーは音楽モードでのみ編集できます。');};
 return {get retainedBytes(){return estimateMusicDomainBytes([...past,current,...future])},get current(){return current},get canUndo(){return past.length>0},get canRedo(){return future.length>0},
  commit(next,{mode}={}){requireMusic(mode);if(next===current)return false;const validated=createIndependentMusicState(next);check([...past,current,validated]);past.push(current);if(past.length>maxEntries)past.shift();current=validated;future.length=0;return true;},
  resizeView(size,{mode}={}){requireMusic(mode);return this.commit(resizeIndependentMusicView(current,size),{mode});},
  undo({mode}={}){requireMusic(mode);if(!past.length)return false;future.push(current);current=past.pop();return true;},
  redo({mode}={}){requireMusic(mode);if(!future.length)return false;past.push(current);current=future.pop();return true;}
 };
}
/** A viewport is derived; canonical page pixels outside it are retained. */
export function independentMusicViewport(state){
 const source=getAnimationCelDocument(state.musicAnimation,state.pageId,state.musicAnimation.layers[0].id),{width,height}=state.view,pixels=new Int16Array(width*height).fill(-1);
 for(let y=0;y<Math.min(height,source.height);y++)for(let x=0;x<Math.min(width,source.width);x++)pixels[y*width+x]=source.pixels[y*source.width+x];
 return {width,height,palette:[...state.musicAnimation.palette],pixels};
}
/** Refuse persistence until the project has a main-animation schema old readers reject. */
export async function writeIndependentMusicProject(project,state){
 const main=optionalJson(project,'animations/main/state.json');
 if(!main||main.schemaVersion<4)throw new Error('独立音楽は旧版からの編集保護が未設定のため保存できません。原本は変更していません。');
 const checked=createIndependentMusicState(state);if(estimateMusicDomainBytes([checked])>MUSIC_DOMAIN_MEMORY_BUDGET)throw new RangeError('音楽保存予算を超えています。');
 let next=await writePxdAnimation(project,checked.musicAnimation,{role:'audio',posterFrameId:checked.pageId});
 next=setPxdJson(next,'audio/state.json',checked.song);
 next=setPxdJson(next,'audio/link.json',{...(checked.link||{}),musicTrack:{schemaVersion:2,pageId:checked.pageId,independent:true}});
 return setPxdJson(next,PATH,{schemaVersion:INDEPENDENT_MUSIC_SCHEMA,pageId:checked.pageId,view:checked.view});
}
export async function readIndependentMusicProject(project){
 const descriptor=optionalJson(project,PATH);if(!descriptor)return null;
 if(descriptor.schemaVersion!==INDEPENDENT_MUSIC_SCHEMA)throw new TypeError('未対応の独立音楽形式です。原本は変更していません。');
 const musicAnimation=await readPxdAnimation(project,'audio');
 return createIndependentMusicState({musicAnimation,song:optionalJson(project,'audio/state.json'),link:optionalJson(project,'audio/link.json'),pageId:descriptor.pageId,view:descriptor.view});
}

/** Lossless migration only. Old forms without an exact music page use the old read-only fallback. */
export async function loadIndependentMusicState(project,{legacyState=null,defaultPalette=['#000000']}={}){
 const descriptor=project&&optionalJson(project,PATH);
 if(descriptor)return readIndependentMusicProject(project);
 if(legacyState?.musicAnimation&&legacyState.song)return createIndependentMusicState({musicAnimation:legacyState.musicAnimation,song:legacyState.song,link:legacyState.link,pageId:legacyState.musicPageId});
 const song=project&&optionalJson(project,'audio/state.json');
 const musicAnimation=project&&await readPxdAnimation(project,'audio');
 if(song&&musicAnimation)return createIndependentMusicState({musicAnimation,song,link:optionalJson(project,'audio/link.json')});
 if(song||musicAnimation)throw new Error('旧音楽の正確なページと曲が揃っていないため、自動移行せず原本を保持します。');
 return createIndependentMusicState({musicAnimation:createAnimation({width:16,height:16,palette:[...defaultPalette]}),song:createAudioSong()});
}
