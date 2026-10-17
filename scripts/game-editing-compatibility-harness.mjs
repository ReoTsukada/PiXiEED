/** Synthetic legacy puzzle round-trips; no real profiles, accounts or works. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { documentRgba, validateDrawDocument } from '../js/creation/draw-core.mjs';
import { createMemoryDraftAdapter, createLocalDraftStore } from '../js/creation/local-drafts.mjs';
import { createPxdProject, encodePxd, decodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdPuzzle, readPxdPuzzle, materializePxdPuzzle } from '../js/creation/pxd-puzzles.mjs';
import { detectDifferenceCandidates, confirmDifferenceCandidates } from '../js/creation/spot-difference-core.mjs';
import { createHiddenObjectDraft, confirmHiddenObjectTargets } from '../js/creation/hidden-object-core.mjs';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(`Usage: node scripts/game-editing-compatibility-harness.mjs [--help]\nGenerates synthetic PXD round-trip fixtures and results.\nOutput: PIXIEED_GAME_COMPAT_OUTPUT (default ${join(tmpdir(), 'pixieed-game-editor-evidence', 'followup')}). No browser or external data is used.`); process.exit(0); }
const out=process.env.PIXIEED_GAME_COMPAT_OUTPUT||join(tmpdir(),'pixieed-game-editor-evidence','followup');await mkdir(out,{recursive:true});
const rows=[];
for(const [size,colors] of [[256,64],[512,64],[256,128]]){
 const palette=Array.from({length:colors},(_,i)=>`#${i.toString(16).padStart(2,'0')}6a80`);
 const before=validateDrawDocument({schemaVersion:1,width:size,height:size,palette,pixels:Array.from({length:size*size},(_,i)=>i%colors)});
 const after=structuredClone(before);const first=3*size+3,last=(size-4)*size+size-4;after.pixels[first]=(after.pixels[first]+1)%colors;after.pixels[last]=(after.pixels[last]+1)%colors;
 const refs=(n)=>({draftId:'synthetic-source',assetId:'synthetic-asset',revisionId:`revision-${n}`,contentHash:(n==='before'?'a':'b').repeat(64),hashScheme:'sha256-canonical-v1'});
 const spot=confirmDifferenceCandidates({schemaVersion:1,gameId:crypto.randomUUID(),width:size,height:size,before:refs('before'),after:refs('after'),candidates:detectDifferenceCandidates(before,after).candidates,confirmed:false,publication:'draft',published:false});
 const hidden=confirmHiddenObjectTargets(createHiddenObjectDraft({gameId:crypto.randomUUID(),source:refs('before'),width:size,height:size,targets:[{id:'synthetic-target',name:`合成${colors}色`,pixels:[first,first+1,first+size,last]}]}));
 for(const [tool,document,sourceDrawDocuments]of [['spot_difference',spot,{'spot-before':before,'spot-after':after}],['hidden_object',hidden,{hidden:before}]]){
  const project=await writePxdPuzzle(createPxdProject(),{tool,document,sourceDrawDocuments});const bytes=await encodePxd(project);const decoded=await decodePxd(bytes);const read=await readPxdPuzzle(decoded,tool);const adapter=createMemoryDraftAdapter(),store=createLocalDraftStore(adapter);const restored=await materializePxdPuzzle(read,{tool,store});
  assert.equal(restored.document.width,size);assert.equal(restored.document.height,size);assert.equal(restored.document.confirmed,true);
  const bindings=tool==='spot_difference'?[['before',before],['after',after]]:[['source',before]];
  for(const [role,expected]of bindings)assert.deepEqual(documentRgba(restored.bindings[role].revision.document),documentRgba(expected));
  if(tool==='spot_difference')assert.deepEqual(restored.document.candidates,spot.candidates);else{assert.deepEqual(restored.document.targets,hidden.targets);assert.deepEqual(restored.document.hitBoxes,hidden.hitBoxes)}
  const filename=`synthetic-${tool}-${size}-${colors}.pxd`;await writeFile(`${out}/${filename}`,bytes);rows.push({tool,size,colors,filename,bytes:bytes.length,rgbaExact:true,answersExact:true,confirmationRetained:true});
 }
}
await writeFile(`${out}/compatibility-node-results.json`,JSON.stringify({syntheticOnly:true,cases:rows},null,2));console.log(JSON.stringify({passed:rows.length,cases:rows}));
