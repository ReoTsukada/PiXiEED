import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawTimelapse, selectDrawTimelapseFrames, DRAW_TIMELAPSE } from '../../js/creation/draw-timelapse.mjs';

function document(width = 4, height = 4) {
  return { width, height, pixels: Array(width * height).fill(-1), palette: ['#ff0000', '#0000ff'] };
}

test('free and detailed selections produce distinct bounded GIF timelines', () => {
  const recorder = createDrawTimelapse(); const doc = document(); recorder.reset(doc);
  for (let index = 0; index < 12; index += 1) {
    const pixel = index % doc.pixels.length; doc.pixels[pixel] = index % 2;
    recorder.record(doc, { indices: [pixel] });
  }
  const history = recorder.snapshot();
  const basic = selectDrawTimelapseFrames(history);
  const detailed = selectDrawTimelapseFrames(history, { detail: true });
  assert.equal(basic.length, DRAW_TIMELAPSE.shortSeconds * DRAW_TIMELAPSE.fps);
  assert.equal(detailed.length, DRAW_TIMELAPSE.detailSeconds * DRAW_TIMELAPSE.fps);
  assert.ok(detailed.length > basic.length);
  assert.equal(basic[0].width, doc.width);
  assert.equal(basic[0].height, doc.height);
  assert.ok(basic.every((frame) => frame.data.every((_, offset) => offset % 4 !== 3 || frame.data[offset] === 255)));
  assert.deepEqual(basic[0].data, detailed[0].data);
  assert.deepEqual(basic.at(-1).data, detailed.at(-1).data);
});

test('palette and dimension changes keep the replay decodable from keyframes', () => {
  const recorder = createDrawTimelapse({ keyframeInterval: 3 }); const doc = document(); recorder.reset(doc);
  doc.pixels[0] = 0; recorder.record(doc, { indices: [0] });
  doc.palette = ['#00ff00', '#0000ff']; recorder.record(doc, { paletteChanged: true });
  assert.equal(recorder.snapshot().at(-1).type, 'keyframe');
  assert.equal(selectDrawTimelapseFrames(recorder.snapshot(), { detail: true }).at(-1).data[1], 255);
  recorder.reset(document(2, 2));
  assert.equal(recorder.frameCount, 1);
  assert.equal(recorder.snapshot()[0].width, 2);
});

test('history stays within byte and event limits while edits continue', () => {
  const recorder = createDrawTimelapse({ maxBytes: 320, maxFrames: 8, keyframeInterval: 3 }); const doc = document(); recorder.reset(doc);
  for (let index = 0; index < 80; index += 1) {
    const pixel = index % doc.pixels.length; doc.pixels[pixel] = index % 2;
    recorder.record(doc, { indices: [pixel] });
    assert.ok(recorder.storedBytes <= 320);
    assert.ok(recorder.frameCount <= 8);
  }
  assert.ok(selectDrawTimelapseFrames(recorder.snapshot()).length > 0);
});


test('1028 recording pauses before allocation without blocking artwork reset or edits', () => {
 const recorder=createDrawTimelapse();const large=document(1028,1028);large.pixels[large.pixels.length-1]=1;
 assert.equal(recorder.reset(large),false);assert.equal(recorder.disabledReason,'canvas-memory-limit');
 for(let i=0;i<3;i++)recorder.record(large,{indices:[1027,1028*1028-1],paletteChanged:true});
 assert.equal(recorder.storedBytes,0);assert.deepEqual(recorder.snapshot(),[]);assert.equal(large.pixels.at(-1),1);
 recorder.restore([]);assert.deepEqual(selectDrawTimelapseFrames(recorder.snapshot()),[]);
 const small=document(256,256);assert.equal(recorder.reset(small),true);assert.equal(recorder.disabledReason,null);small.pixels[0]=0;recorder.record(small,{indices:[0]});assert.equal(recorder.frameCount,2);
});
test('recorder budget boundary is exact and existing 512 recording remains full resolution',()=>{
 const recorder=createDrawTimelapse();const medium=document(512,512);assert.equal(recorder.reset(medium),true);medium.pixels[1023]=0;recorder.record(medium,{indices:[1023]});assert.equal(recorder.snapshot()[0].width,512);assert.equal(recorder.snapshot()[1].indices[0],1023);
 const bounded=createDrawTimelapse({maxBytes:64});assert.equal(bounded.reset(document(4,4)),true);assert.equal(bounded.reset(document(5,4)),false);assert.equal(bounded.storedBytes,0);assert.equal(bounded.reset(document(4,4)),true);
});
