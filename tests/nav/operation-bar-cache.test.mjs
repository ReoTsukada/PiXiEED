import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { posix } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const operationBarRevision = '20261012-operation-bar-1';
const cameraPlacementRevision = '20261013-camera-placement-1';
const cameraPlacementTargets = new Set([
 'css/creation-modes.css','js/creation/camera-placement-preview.mjs',
 'js/creation/creation-camera.mjs','js/creation/creation-modes.mjs',
 'js/creation/draw-entry.mjs','js/creation/draw-page.mjs',
 'js/pixel-lens/app.mjs','js/pixel-lens/entry.mjs'
]);
const expectedRevision = target => cameraPlacementTargets.has(target) ? cameraPlacementRevision : operationBarRevision;
const leaves = [
 'js/creation/creation-modes.mjs','css/creation-modes.css','js/tool-result-view.mjs',
 'js/creation/draw-selection-panel.mjs','css/draw-selection-features.css','css/draw-compact-controls.css',
 'js/creation/camera-placement-preview.mjs'
];
const references = source => [...source.matchAll(/["'`]([^"'`\s]+\.(?:mjs|js|css)(?:\?[^"'`\s]*)?)["'`]/g)].map(match=>match[1]);
const targetFor = (owner, value) => {
 const path=value.split('?')[0];
 if(path.startsWith('/'))return path.slice(1);
 if(path.startsWith('.'))return posix.normalize(posix.join(posix.dirname(owner),path));
 return null;
};
async function files(dir, accept) {
 const result=[];
 for(const entry of await readdir(new URL(dir?dir+'/':'./',root),{withFileTypes:true})) {
  const path=dir?dir+'/'+entry.name:entry.name;
  if(entry.name.startsWith('.')||['node_modules','vendor','tests','docs'].includes(entry.name))continue;
  if(entry.isDirectory())result.push(...await files(path,accept));
  else if(accept(path))result.push(path);
 }
 return result;
}

test('operation bar revisions propagate through runtime parents and every public entry',async()=>{
 const runtime=await files('js',path=>/\.m?js$/.test(path));
 const edges=new Map();
 for(const path of runtime)edges.set(path,references(await readFile(new URL(path,root),'utf8')).map(value=>({value,target:targetFor(path,value)})));
 const affected=new Set(leaves);
 let growing=true;
 while(growing) {growing=false;for(const [path,refs] of edges)if(!affected.has(path)&&refs.some(ref=>affected.has(ref.target))){affected.add(path);growing=true;}}
 assert.equal(affected.size,16,'bounded runtime cache graph including camera-placement preview');
 const entries=await files('',path=>path.endsWith('.html')||/^scripts\/generate-.*\.mjs$/.test(path));
 let matchedEntries=0;
 for(const path of [...runtime,...entries])for(const value of references(await readFile(new URL(path,root),'utf8'))) {
  const target=targetFor(path,value);if(!affected.has(target))continue;
  assert.equal(new URL(value,'https://local.invalid/'+path).searchParams.get('rev'),expectedRevision(target),`${path} must fetch current ${target}`);
  if(path.endsWith('.html'))matchedEntries++;
 }
 assert.ok(matchedEntries>=6,'public preload/entry references are present');
});

test('operation bar release preserves the canonical animation implementation',async()=>{
 const facade=await readFile(new URL('js/creation/animation-core.mjs',root),'utf8');
 assert.equal(facade.trim(),"export * from './animation-core-v20261012.mjs';");
 const bytes=await readFile(new URL('js/creation/animation-core-v20261012.mjs',root));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'2a1e6158233a0ab2539dc8de132d5112e179e84aba4fc18eb21a8bf6484d14d3');
});
