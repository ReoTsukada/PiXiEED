/** Local-only timing compatibility QA. No camera/microphone grants or external requests. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
const out = process.env.PIXIEED_COMPRESSED_FRAMES_OUTPUT || '/tmp/pixieed-compressed-frames-browser';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true }), results = [];
const originalAudioPage = execFileSync('git', ['show','HEAD:js/creation/audio-page.mjs'], {encoding:'utf8'});
const originalAnimation = execFileSync('git', ['show','HEAD:js/creation/audio-animation.mjs'], {encoding:'utf8'});
try {
  for (const viewportWidth of [390, 1280]) for (const canvasWidth of [32, 16]) {
    const compressed = canvasWidth === 32, label = `${viewportWidth}-${compressed ? 'compressed' : 'standard'}`;
    const context = await browser.newContext({ viewport: { width: viewportWidth, height: 844 } });
    await context.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
    await context.route('**/audio-video.mjs*', async route => {
      const response = await route.fetch();
      let body = (await response.text()).replace('export async function renderAudioVideo(', 'async function actualRenderAudioVideo(');
      body = body.replace('if (frameIndex !== lastFrame) {', 'if (frameIndex !== lastFrame) { (window.__videoFrames ||= []).push(frameIndex);');
      body += '\nexport async function renderAudioVideo(song, image, options) { window.__videoArgs = { loopTicks:song.loopTicks, frameTicks:options.frameTicks, frames:options.frameImages.length }; const result = await actualRenderAudioVideo(song, image, options); window.__videoResult = { bytes:result.blob.size, seconds:result.seconds }; sessionStorage.setItem("compressedFrameVideoQA", JSON.stringify({args:window.__videoArgs,result:window.__videoResult,frames:window.__videoFrames})); return result; }';
      await route.fulfill({ response, body });
    });
    await context.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => { throw Error('Devices disabled in QA'); } }));
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
    const ready = mode => page.waitForFunction(mode => document.documentElement.dataset.creationModesReady === 'true' && document.body.dataset.creationMode === mode && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy'), mode);
    const mode = async name => { if (!await page.locator('#creation-mode-menu').evaluate(n => n.open)) await page.locator('#creation-mode-menu > summary').click(); await page.locator(`[data-creation-mode="${name}"]`).click(); await ready(name); };
    await page.goto(base + '/draw/'); await ready('draw');
    const fixture = await page.evaluate(async width => {
      const codec = await import('/js/creation/pxd-codec.mjs'), audio = await import('/js/creation/audio-core.mjs'), pxd = await import('/js/creation/pxd-draw-audio.mjs'), stores = await import('/js/creation/tool-project-store.mjs');
      const image = { width, height:16, rgba:new Uint8Array(width * 16 * 4) }; image.rgba.set([73,100,60,255], (5 * width + width - 8) * 4);
      const link = { rulesVersion:'shared-canvas-v1', imageRole:'audio', width, height:16, ticksPerCell:width === 32 ? 60 : 120, rowPitchMap:audio.createAudioRowPitchMap(16), colorToSlot:{'rgba-49643cff':'square'}, futureLink:{keep:1} };
      const plan = pxd.projectLegacySharedAudioImage(audio.createAudioSong({songId:'frame-qa',tempo:137}),image,link);
      const note = plan.song.tracks[0].clips[0].notes[0]; note.velocity = 47; note.futureNote = {keep:2};
      let project = codec.createPxdProject({manifest:{lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}}); project = await pxd.writePxdAudioState(project,plan.song,{image,link});
      const store = stores.createToolProjectStore('audio');
      const saved = await store.save(project,{expectedRevisionId:null});
      const original = await store.save(await pxd.writePxdAudioState(codec.createPxdProject({manifest:{lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}}),plan.song,{image,link}),{expectedRevisionId:null});
      return {id:saved.projectId,revision:saved.revisionId,note,originalId:original.projectId,originalRevision:original.revisionId};
    }, canvasWidth);
    const stored = (id = fixture.id) => page.evaluate(async id => {
      const stores = await import('/js/creation/tool-project-store.mjs'), pxd = await import('/js/creation/pxd-draw-audio.mjs'), anim = await import('/js/creation/pxd-animation.mjs');
      const project = await stores.createToolProjectStore('audio').load(id), animation = await anim.readPxdAnimation(project,'audio');
      return { revision:project.revisionId, song:pxd.readPxdAudioState(project), link:pxd.readPxdAudioLink(project), frames:animation?.frames.length };
    }, id);
    const open = async revision => { await page.goto(`${base}/audio/?pxd=${fixture.id}&pxdRevision=${revision}`); await ready('audio'); };
    const notes = value => value.song.tracks.flatMap(t => t.clips.flatMap(c => c.notes));
    await open(fixture.revision);
    await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
    await page.locator('.animation-controls__frame-add').click();
    await page.locator('#draw-undo').click(); await mode('draw');
    const undone = await stored(); assert.equal(undone.song.loopTicks,1920); assert.deepEqual(notes(undone).find(n => n.noteId === fixture.note.noteId),fixture.note);
    await mode('audio'); await page.locator('#draw-redo').click(); await mode('draw'); let saved = await stored();
    assert.equal(saved.frames,2); assert.equal(saved.song.loopTicks,3840);
    assert.equal(saved.link.timing?.ticksPerFrame,compressed ? 1920 : undefined);
    const kept = notes(saved).find(n => n.noteId === fixture.note.noteId); assert.equal(kept.startTick,fixture.note.startTick); assert.equal(kept.durationTicks,fixture.note.durationTicks); assert.equal(kept.velocity,47); assert.deepEqual(kept.futureNote,{keep:2});
    const copied = notes(saved).find(n => n.sourceCell?.frameIndex === 1); assert.equal(copied.startTick,1920 + fixture.note.startTick);
    await open(saved.revision);
    const box = await page.locator('#draw-canvas').boundingBox(); await page.mouse.click(box.x + box.width * 1.5 / canvasWidth,box.y + box.height * 5.5 / 16);
    await page.locator('#draw-music-settings summary').click(); await page.locator('#draw-music-instrument').selectOption('triangle'); await page.locator('#draw-undo').click(); assert.equal(await page.locator('#draw-music-instrument').inputValue(),'square'); await page.locator('#draw-redo').click(); assert.equal(await page.locator('#draw-music-instrument').inputValue(),'triangle');
    await page.locator('#draw-music-play').click(); await page.waitForFunction(() => document.querySelector('#draw-music-play').dataset.state === 'playing');
    await page.waitForFunction(() => document.querySelector('.draw-music-position').textContent.includes('コマ 2'),{},{timeout:10000}); await page.locator('#draw-music-play').click();
    await mode('draw'); saved = await stored(); assert.equal(saved.frames,2); assert.equal(saved.song.loopTicks,3840);
    assert.equal(notes(saved).find(n => n.sourceCell?.localX === 1).durationTicks,compressed ? 60 : 120);
    await open(saved.revision); await mode('draw'); assert.deepEqual((await stored()).song,saved.song);
    let video = 'PC only';
    if (viewportWidth === 1280) {
      await mode('audio'); await page.locator('#draw-music-settings summary').click(); await page.locator('#draw-music-video').click();
      await page.waitForURL(/\/output\/work\//,{timeout:30000}); await page.locator('#output-video').waitFor({state:'visible'});
      await page.goBack(); await ready('audio');
      // Result counters live on the document that rendered the video; persist through navigation.
      video = await page.evaluate(() => JSON.parse(sessionStorage.getItem('compressedFrameVideoQA')));
      assert.equal(video.args.frameTicks,1920); assert.equal(video.args.loopTicks,3840); assert.equal(video.args.frames,2); assert.ok(video.result.bytes > 0); assert.ok(video.frames.includes(0) && video.frames.includes(1));
      assert.ok(Math.abs(video.result.seconds - 3840 * 60 / 137 / 480) < 1e-6);
    }
    saved = await stored();
    await page.goto(`${base}/audio/?standalone=1&pxd=${fixture.id}&pxdRevision=${saved.revision}`); await page.waitForFunction(() => document.documentElement.dataset.audioReady === 'true' && !document.querySelector('#main').inert);
    await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').dataset.state === 'playing'); await page.locator('#audio-play-toggle').click();
    await page.locator('#project-open').click(); await page.locator('#project-tab-current').click(); await page.locator('#pxd-panel .project-more').evaluate(n => {n.open=true;}); await page.locator('#pxd-save').click(); await page.waitForFunction(() => document.querySelector('#pxd-file-status').textContent.includes('保存し直しました'));
    const standalone = await stored(); assert.deepEqual(standalone.song,saved.song); assert.equal(standalone.frames,2);
    await page.goto(`${base}/audio/?standalone=1&pxd=${fixture.originalId}&pxdRevision=${fixture.originalRevision}`); await page.waitForFunction(() => document.documentElement.dataset.audioReady === 'true' && !document.querySelector('#main').inert);
    await page.locator('#audio-animation-controls [data-action="toggle-frames"]').click(); await page.locator('[data-action="add-frame"]').click();
    await page.locator('#audio-undo').click(); await page.locator('#audio-redo').click();
    await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').dataset.state === 'playing'); await page.locator('#audio-play-toggle').click();
    await page.locator('#project-open').click(); await page.locator('#project-tab-current').click(); await page.locator('#pxd-panel .project-more').evaluate(n => {n.open=true;}); await page.locator('#pxd-save').click(); await page.waitForFunction(() => document.querySelector('#pxd-file-status').textContent.includes('保存し直しました'));
    const promoted = await stored(fixture.originalId); assert.equal(promoted.frames,2); assert.equal(promoted.song.loopTicks,3840); assert.equal(promoted.link.timing?.ticksPerFrame,compressed ? 1920 : undefined);
    const promotedNote = notes(promoted).find(n => n.noteId === fixture.note.noteId); assert.equal(promotedNote.velocity,47); assert.equal(promotedNote.startTick,fixture.note.startTick); assert.equal(promotedNote.durationTicks,fixture.note.durationTicks); assert.deepEqual(promotedNote.futureNote,{keep:2});
    await page.goto(`${base}/audio/?pxd=${fixture.originalId}&pxdRevision=${promoted.revision}`); await ready('audio'); await mode('draw');
    assert.deepEqual((await stored(fixture.originalId)).song,promoted.song);
    if (compressed) {
      await context.route('**/audio-page.mjs*', route => route.fulfill({body:originalAudioPage,contentType:'text/javascript'}));
      await context.route('**/audio-animation.mjs*', route => route.fulfill({body:originalAnimation,contentType:'text/javascript'}));
      await page.goto(`${base}/audio/?standalone=1&pxd=${fixture.originalId}&pxdRevision=${promoted.revision}`);
      await page.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('保存情報が一致しません'));
      assert.deepEqual((await stored(fixture.originalId)).song,promoted.song,'unupdated reader must reject rather than retime or save');
    }
    assert.deepEqual(errors,[]); results.push({label,passed:true,video,checks:['frame add Undo/Redo','original notes and timing retained','second-frame offset','draw/color edit Undo/Redo','playhead reaches second frame','PXD reopen exact','updated standalone play/save exact','original unmarked standalone frame add Undo/Redo without retiming','standalone-added frames reopen in full Draw',...(compressed ? ['unupdated reader rejects incompatible timing without writing'] : [])],errors});
    console.log('PASS',label); await context.close();
  }
} finally { await browser.close(); await writeFile(out+'/results.json',JSON.stringify({results,permissions:'never granted',realCamera:'UNTESTED'},null,2)); }
