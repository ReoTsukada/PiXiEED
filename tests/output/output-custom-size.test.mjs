import { validateOutputDimensions } from '../../js/creation/output-input-constraints.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { shouldAutoSelectPixelOrigin } from '../../js/creation/output-render.mjs';

const source = readFileSync(new URL('../../js/creation/output-page.mjs', import.meta.url), 'utf8');
function extract(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing extraction start: ${start}`);
  assert.notEqual(to, -1, `missing extraction end: ${end}`);
  return source.slice(from, to);
}

test('manual size applies custom intent only after validating dimensions', async () => {
  const calls = [];
  const context = {
    AbortController, validateOutputDimensions, MAX_IMAGE_EDGE:4096, MAX_IMAGE_PIXELS:16777216,
    record: {}, applySettings: { disabled: false }, targetDimensions: () => ({ width: 4096, height: 2048 }),
    rewardedStaticSize: () => false, outputRewardEnabled: () => false, hasSiteReward: () => false,
    generateOutputItem: async options => { calls.push(options); return true; },
  };
  vm.createContext(context);
  vm.runInContext(extract('async function applySelectedSize()', '\nfunction displayFormat'), context);
  await vm.runInContext('applySelectedSize()', context);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { dimensions: { width: 4096, height: 2048 }, staticEntitledAtStart: false, pixelOriginChoice: 'custom' });
});

function generationContext({ failAt = 'persist' } = {}) {
  const previous = { id: 'existing', sourceId: 'source', extension: 'png', mime: 'image/png', filename: 'art.png', blob: 'original-blob', metadata: { outputWidth: 128, outputHeight: 128 } };
  const persisted = [];
  const context = {
    AbortController, validateOutputDimensions, MAX_IMAGE_EDGE:4096, MAX_IMAGE_PIXELS:16777216,
    record: { metadata: {}, source: 'art', currentMetadata: {} }, activeItem: previous, activeSource: { id: 'source', mediaSource: {} },
    mediaSources: [{ id: 'source', mediaSource: {} }], outputItems: [previous], sourceSelect: { value: 'source' }, formatSelect: { value: 'png' },
    generationController: null, mediaWritePending: false, itemWritePending: false, pageDisposed: false, generationEpoch: 0,
    widthInput: { value: '4096' }, heightInput: { value: '2048' }, filename: { value: 'art', setAttribute() {} }, status: { textContent: '' },
    isRewardedOutputFormat: () => false, sourceFormats: () => [['png', 'PNG'], ['jpeg', 'JPEG']], sourceFrames: () => [{ width: 128, height: 64 }],
    outputDimensionGuidance: () => null, outputSourceOriginalSize: () => ({ width: 128, height: 64 }), isStaticOutputFormat: () => false,
    isRewardedStaticImageSize: () => false, outputRewardEnabled: () => false, canUseOutputReward: () => true,
    isNativeAudioFormat: () => false, isVideoFormat: () => false, setBusy() {},
    addOutputItem: { disabled: false }, copyOutputItem: { disabled: false }, deleteOutputItem: { disabled: false },
    createOutputBlob: async () => { if (failAt === 'encode') throw new Error('fixture encoder failure'); return { blob: 'encoded-blob', metadata: { outputWidth: 4096, outputHeight: 2048 } }; },
    outputBaseName: () => 'art', isAutoDrawingFilename: () => false,
    resolveOutputFilename: ({ extension }) => `art.${extension}`, sanitizeOutputFilename: value => value, outputMime: format => `image/${format}`,
    stillFrameSelect: { value: '0' }, jpegQuality: { value: '90' }, getOutputTiming: () => ({ durationMs: 0 }),
    persistOutputItems: async items => { persisted.push(items); if (failAt === 'persist') throw new Error('fixture persistence failure'); return items; },
    fillSourceAndFormatControls() {}, renderOutputItems() {}, displayMetadata() {}, setCurrentBlob() {}, setMedia() {}, updateMusicPlayControl() {},
    displayFormat: entry => entry.extension.toUpperCase(), format: { textContent: '' }, extension: { textContent: '' },
    formatButton: { textContent: '', setAttribute() {} }, formatPicker: { hidden: true },
  };
  return { context, previous, persisted };
}

test('real generateOutputItem carries custom intent into persistence only after encoding succeeds', async () => {
  const { context, previous, persisted } = generationContext({ failAt: 'persist' });
  vm.createContext(context);
  vm.runInContext(extract('async function generateOutputItem(', '\nasync function prepareRasterSettings'), context);
  const completed = await vm.runInContext("generateOutputItem({dimensions:{width:4096,height:2048},pixelOriginChoice:'custom'})", context);
  assert.equal(completed, false, 'fixture persistence deliberately fails after capturing the candidate');
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0][0].metadata.pixelOriginChoice, 'custom');
  assert.equal(context.activeItem, previous); assert.equal(context.activeItem.blob, 'original-blob');
  assert.equal(context.activeItem.metadata.pixelOriginChoice, undefined);
  assert.equal(context.status.textContent, 'fixture persistence failure');
});

test('real generateOutputItem keeps the prior item and never persists intent when encoding fails', async () => {
  const { context, previous, persisted } = generationContext({ failAt: 'encode' });
  vm.createContext(context);
  vm.runInContext(extract('async function generateOutputItem(', '\nasync function prepareRasterSettings'), context);
  const completed = await vm.runInContext("generateOutputItem({dimensions:{width:4096,height:2048},pixelOriginChoice:'custom'})", context);
  assert.equal(completed, false);
  assert.equal(persisted.length, 0);
  assert.equal(context.activeItem, previous); assert.equal(context.activeItem.blob, 'original-blob');
  assert.equal(context.activeItem.metadata.pixelOriginChoice, undefined);
  assert.equal(context.status.textContent, 'fixture encoder failure');
  assert.equal(shouldAutoSelectPixelOrigin({ selection: undefined, needsAutoResize: true }), true);
  assert.equal(shouldAutoSelectPixelOrigin({ selection: 'custom', needsAutoResize: true }), false);
});


test('real generation completes explicit 32x output and keeps its choice on a later format conversion', async () => {
  const { context, previous, persisted } = generationContext({ failAt: null });
  vm.createContext(context);
  vm.runInContext(extract('async function generateOutputItem(', '\nasync function prepareRasterSettings'), context);
  assert.equal(await vm.runInContext("generateOutputItem({dimensions:{width:4096,height:2048},pixelOriginChoice:'custom'})", context), true);
  assert.equal(context.currentScale, 32);
  assert.equal(context.activeItem.metadata.pixelOriginChoice, 'custom');
  assert.equal(previous.metadata.pixelOriginChoice, undefined);
  assert.equal(await vm.runInContext("generateOutputItem({formatValue:'jpeg'})", context), true);
  assert.equal(persisted.length, 2);
  assert.equal(context.activeItem.extension, 'jpeg');
  assert.equal(context.activeItem.metadata.pixelOriginChoice, 'custom');
  assert.deepEqual([context.activeItem.metadata.outputWidth, context.activeItem.metadata.outputHeight], [4096,2048]);
});

test('the real raster preparation does not replace persisted custom 32x output with a matching original', async () => {
  const node = () => ({ dataset: {}, hidden: true, textContent: '' });
  let selected = null, generated = 0, size;
  const context = {
    AbortController, validateOutputDimensions, MAX_IMAGE_EDGE:4096, MAX_IMAGE_PIXELS:16777216, rasterSettingsController: null, rasterSettingsEpoch: 0,
    activeSource: { id: 'drawing' }, activeItem: { id: 'large', sourceId: 'drawing', extension: 'jpeg', mime: 'image/jpeg', metadata: { outputWidth:4096, outputHeight:2048, pixelOriginChoice:'custom' } },
    record: { currentMetadata: { outputWidth:4096, outputHeight:2048, pixelOriginChoice:'custom' } },
    rasterOutputDimensions: e => ({ width:e.currentMetadata?.outputWidth, height:e.currentMetadata?.outputHeight }),
    resolveRasterOrigin: async () => ({ status:'verified', width:128, height:64, preferredScale:32 }),
    status:node(), rasterProfile:null, pngBaseSize:null, isAnimatedOutputFormat:()=>false, formatSelect:{value:'jpeg'},
    setupScaleInput: value => { size=value; }, scaleNote:node(), updateScaleSummary(){}, image:node(), timelineCanvas:node(),
    prepareGifPoster(){}, showRasterPreview(){}, shouldAutoSelectPixelOrigin,
    outputItems:[{id:'original',sourceId:'drawing',extension:'jpeg',metadata:{outputWidth:128,outputHeight:64}}],
    originRestoreItemId:null,originResizeActiveItemId:null,updateOriginMessage(){},setActiveItem:item=>{selected=item.id;},
    fillSourceAndFormatControls(){},renderOutputItems(){},generateOutputItem:async()=>{generated++;},
  };
  vm.createContext(context);
  vm.runInContext(extract('async function prepareRasterSettings(', '\nfunction targetDimensions()'), context);
  await vm.runInContext('prepareRasterSettings(record,[{width:128,height:64}])', context);
  assert.equal(selected,null);assert.equal(generated,0);
  assert.equal(size.startWidth,4096);assert.equal(size.startHeight,2048);
});

test('the real generation entry rejects unsafe GIF geometry before invoking an encoder or persistence', async () => {
 const {context,persisted}=generationContext({failAt:null});let encodes=0;
 context.sourceFormats=()=>[['gif','GIF']];context.sourceFrames=()=>[{width:128,height:128}];
 context.createOutputBlob=async()=>{encodes++;throw Error('must not allocate');};
 vm.createContext(context);vm.runInContext(extract('async function generateOutputItem(', '\nasync function prepareRasterSettings'),context);context.updateDimensionNotice=()=>{};
 assert.equal(await vm.runInContext("generateOutputItem({formatValue:'gif',dimensions:{width:4096,height:4096}})",context),false);
 assert.equal(encodes,0);assert.equal(persisted.length,0);assert.match(context.status.textContent,/2828 × 2828/);
});
