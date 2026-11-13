import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');
test('shared editor state, history, and PXD use one session without independent bindings',()=>{
 assert.doesNotMatch(source,/retainedArtSession|independentMusicCallbacks|displayIndependentMusicDocument/);
 const getters=[...source.matchAll(/getEditorState: \(\) => ([^\n]+),/g)];assert.equal(getters.length,2);
 const current={selectedColor:0,layerId:'music',frameId:'frame'};
 for(const [,expression] of getters)assert.equal(new Function('getDrawEditorState',`return ${expression}`)(()=>current),current);
 const importAt=source.indexOf('const storedAnimation = await readPxdAnimation');const fallbackAt=source.indexOf('let nextDocument;',importAt);assert.ok(importAt>0&&fallbackAt>importAt);assert.doesNotMatch(source.slice(importAt,fallbackAt),/catch/);
});
test('frozen shared music rejects direct layer selection and edits; normal art remains editable',()=>{
 const body=source.match(/function handleAnimationAction\(action\) \{\s*(if \(musicReadOnlyReason[^\n]+)/)[1];
 const command=new Function('action','animationSession','musicReadOnlyReason','toast',`${body};return true;`);
 const session={animation:{layers:[{id:'music',role:'music'},{id:'art'}]}};
 for(const type of ['select-layer','delete-layer','visibility','layer-opacity']){
  assert.equal(command({type,layerId:'music'},session,'音楽は256px以下',()=>{}),false);
  assert.equal(command({type,layerId:'art'},session,'音楽は256px以下',()=>{}),true);
 }
 assert.equal(command({type:'select-layer',layerId:'music'},session,'',()=>{}),true);
 assert.match(source,/selectMusicLayer\(\) \{\s*if \(musicReadOnlyReason\) throw/);
 assert.match(source,/cameraPlacementTarget\(memoryExtras=\{\}\) \{\s*if \(musicReadOnlyReason/);
 assert.match(source,/if \(musicReadOnlyReason\) throw new Error\(musicReadOnlyReason\);/);
});
