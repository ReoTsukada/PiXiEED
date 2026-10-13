import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { posix } from 'node:path';
import * as bare from '../../js/creation/animation-core.mjs';
import * as versioned from '../../js/creation/animation-core.mjs?rev=20261012-animation-core-contract-1';
import * as secondFacade from '../../js/creation/animation-core.mjs?identity-test=another-facade';

const root = new URL('../../', import.meta.url);
const REV = '20261012-animation-core-contract-1';
const CORE = 'js/creation/animation-core.mjs';
// Cache-busted operation-bar/camera modules keep the canonical core dependency URL.
const operationBarTargets = new Set([
  'js/creation/audio-entry.mjs', 'js/creation/audio-page.mjs',
  'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs',
  'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs',
  'js/creation/jigsaw-page.mjs', 'js/creation/pixfind-play.mjs',
  'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs', 'js/tool-result-view.mjs'
]);
const cameraPlacementCoreTargets = new Set([
  'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs',
  'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs',
  'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs'
]);
const expectedRevision = target => cameraPlacementCoreTargets.has(target) ? '20261013-camera-placement-1'
  : operationBarTargets.has(target) ? '20261012-operation-bar-1' : REV;
const specifiers = source => [...source.matchAll(/['"]([^'"\s]+\.mjs(?:\?[^'"\s]*)?)['"]/g)].map(match => match[1]);
const targetFor = (owner, value) => {
  const path = value.split('?')[0];
  if (path.includes('://') || !path.startsWith('.') && !path.startsWith('/')) return null;
  return posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(owner), path));
};
async function runtimeFiles(dir = 'js') {
  const names = [];
  for (const entry of await readdir(new URL(dir+'/', root), { withFileTypes:true })) {
    const name = dir+'/'+entry.name;
    if (entry.isDirectory()) names.push(...await runtimeFiles(name));
    else if (/\.m?js$/.test(entry.name)) names.push(name);
  }
  return names;
}

test('bare and revisioned animation facades share functions and module-private cel storage', () => {
  assert.equal(bare.createAnimation, versioned.createAnimation);
  assert.equal(bare.createAnimation, secondFacade.createAnimation);
  assert.equal(bare.ensureAnimationMusicLayer, versioned.ensureAnimationMusicLayer);
  let animation = bare.createAnimation({ width:2, height:1, palette:['#112233'] });
  animation = versioned.writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, {width:2,height:1,pixels:[1,0]});
  // Cel indices are 1-based; Draw document indices are 0-based with -1 transparent.
  assert.deepEqual(secondFacade.getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[0].id).pixels,[0,-1]);
  const music = secondFacade.ensureAnimationMusicLayer(animation);
  assert.equal(bare.validateAnimation(music), music);
  assert.equal(music.schemaVersion, animation.schemaVersion);
});

test('every browser dependency leading to the animation contract uses its exact cache revision', async () => {
  const names = await runtimeFiles();
  const edges = new Map();
  for (const name of names) edges.set(name, specifiers(await readFile(new URL(name,root),'utf8')).map(value=>({value,target:targetFor(name,value)})));
  const affected = new Set([CORE]);
  let growing=true;
  while (growing) { growing=false; for (const [name,targets] of edges) if (!affected.has(name) && targets.some(({target})=>affected.has(target))) {affected.add(name);growing=true;} }
  assert.ok(affected.size>1, 'runtime consumers are present');
  for (const [name,targets] of edges) for (const {value,target} of targets) if (affected.has(target)) {
    assert.equal(new URL(value,'https://test.invalid/'+name).searchParams.get('rev'),expectedRevision(target),`${name} must fetch the cache-busted ${target}`);
  }
  for (const name of ['draw/index.html','audio/index.html','jigsaw/index.html','hidden-object/index.html','spot-difference/index.html','pixel-camera.html']) {
    for (const value of specifiers(await readFile(new URL(name,root),'utf8'))) if(affected.has(targetFor(name,value))) {
      assert.equal(new URL(value,'https://test.invalid/'+name).searchParams.get('rev'),expectedRevision(targetFor(name,value)),`${name} preload/entry must match its transitive contract`);
    }
  }
});
