import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');
test('all camera entry points reject independent Music before reading targets or mutating',async()=>{
 for(const name of ['cameraTarget','cameraPlacementTarget','applyCamera','applyCameraRgba','previewCamera']){
  const pattern=new RegExp(`(?:async )?${name}\\([^\\n]*?\\) \\{\\s*(if \\(independentMusicActive\\(\\)\\) throw new Error\\('[^']+'\\);)`);
  const match=source.match(pattern);assert.ok(match,`${name} must guard at entry`);
  const invoke=new Function('independentMusicActive',`${match[1]} throw new Error('unexpected target access');`);
  assert.throws(()=>invoke(()=>true),/音楽グリッド/);
 }
});

test('Music resize rejects stale preview before independent callback, and sprite scale is blocked',()=>{
 const start=source.indexOf('  setProjectSettings(settings, { expectedOwner = null } = {}) {');
 const end=source.indexOf('    if (independentMusicActive())',start);
 const prefix=source.slice(source.indexOf('\n',start)+1,end);
 let invoked=false;const apply=new Function('expectedOwner','animationSession','run',`${prefix} return run();`);
 assert.throws(()=>apply({}, {animation:{}},()=>{invoked=true}),/プレビュー後/);assert.equal(invoked,false);
 const guard=source.match(/function spriteScaleBlockedReason\(\) \{\s*(if \(independentMusicActive\(\)\) return '[^']+';)/);
 assert.ok(guard);assert.match(new Function('independentMusicActive',guard[1])(()=>true),/表示範囲だけ/);
});
test('legacy Music reference guards reject selection/edit but preserve independent Music and legacy fallback',()=>{
 const helper=source.slice(source.indexOf('function legacyMusicReference('),source.indexOf('const animationRenderCache'));
 const session={layerId:'music',frameId:'frame',animation:{layers:[{id:'music',role:'music'},{id:'art'}]},select(frame,id){this.layerId=id;return {layer:id};}};
 let notices=0;
 const build=new Function('animationSession','independentMusicCallbacks','independentMusicActive','toast',`let documentData;const LEGACY_MUSIC_REFERENCE_NOTICE='参照専用';${helper};return {legacyMusicReference,assertEditableMusicReference,restoreArtSelectionFromMusicReference};`);
 const guard=build(session,{},()=>false,()=>notices++);
 assert.equal(guard.legacyMusicReference(),true);assert.throws(()=>guard.assertEditableMusicReference(),/参照専用/);
 const actionGuard=source.match(/function handleAnimationAction\(action\) \{\s*(if \(action.layerId && legacyMusicReference\(action.layerId\)\) \{[^\n]+\})/)[1];
 const action=new Function('action','legacyMusicReference','toast','LEGACY_MUSIC_REFERENCE_NOTICE',`${actionGuard};return true;`);
 for(const type of ['select-layer','delete-layer','visibility','lock','move-layer','layer-opacity'])assert.equal(action({type,layerId:'music'},guard.legacyMusicReference,()=>{},'参照専用'),false);
 const editGuard=source.match(/if \(legacyMusicReference\(\)\) \{ toast\(LEGACY_MUSIC_REFERENCE_NOTICE\);return false; \}/)[0];
 assert.equal(new Function('legacyMusicReference','toast','LEGACY_MUSIC_REFERENCE_NOTICE',`${editGuard};return true;`)(guard.legacyMusicReference,()=>{},'参照専用'),false);
 assert.equal(guard.restoreArtSelectionFromMusicReference(),true);assert.equal(session.layerId,'art');assert.equal(notices,1);assert.equal(session.animation.layers.length,2);
 session.layerId='music';assert.equal(build(session,{},()=>true,()=>{}).legacyMusicReference(),false);assert.equal(build(session,null,()=>false,()=>{}).legacyMusicReference(),false);
 for(const name of ['cameraTarget','cameraPlacementTarget','applyCamera','applyCameraRgba','previewCamera']){const begin=source.indexOf(`${name}(`);assert.match(source.slice(begin,begin+500),/assertEditableMusicReference\(\)/);}
});
