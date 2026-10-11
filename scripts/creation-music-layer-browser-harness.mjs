/** Local-only integration checks for the shared Draw/music project. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only localhost QA is allowed');
const out = process.env.PIXIEED_MUSIC_LAYER_OUTPUT || '/tmp/pixieed-music-layer-browser';
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const report = { base, checks: [], errors: [], externalRequests: 'blocked', realCamera: 'UNTESTED', permissions: 'never granted' };
const check = (name, details = {}) => report.checks.push({ name, ...details });
const hash = data => { let h = 2166136261; for (const n of data || []) h = Math.imul(h ^ n, 16777619) >>> 0; return h; };
const browser = await chromium.launch({ headless: true });

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== new URL(base).origin) return route.abort();
    if (requestUrl.pathname.endsWith('/js/creation/draw-page.mjs')) {
      const response = await route.fetch(); let source = await response.text();
      // Publish the mountDrawMode API object without modifying the repo source.
      const marker = 'return {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,';
      if (source.includes(marker)) source = source.replace(marker, 'window.__musicLayerQA ||= {};\nreturn window.__musicLayerQA.draw = {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,');
      return route.fulfill({ response, body: source });
    }
    if (requestUrl.pathname.endsWith('/js/creation/creation-modes.mjs')) {
      const response = await route.fetch(); let source = await response.text();
      const marker = 'let musicModel;';
      if (source.includes(marker)) source = source.replace(marker, `${marker}\nwindow.__musicLayerQA ||= {};`)
        .replace('try { musicModel = await mountDrawMusicModel({draw,scope}); }', 'try { musicModel = await mountDrawMusicModel({draw,scope}); window.__musicLayerQA.model = musicModel; window.__musicLayerQA.modes = { get mode(){return mode;}, switchMode }; }');
      return route.fulfill({ response, body: source });
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__musicLayerQA = { mediaRequests: 0 };
    try { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { window.__musicLayerQA.mediaRequests++; throw new Error('Local QA denies media access'); } }); } catch {}
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  return { context, page };
}

async function inspect(page) {
  return page.evaluate(() => {
    const draw = window.__musicLayerQA?.draw, model = window.__musicLayerQA?.model;
    if (!draw || !model) return { probeMissing: true, keys: Object.keys(window.__musicLayerQA || {}) };
    const timeline = draw.getTimeline(), music = model.getState();
    return {
      mode: document.body.dataset.creationMode,
      timeline: { width: timeline.width, height: timeline.height, frames: timeline.frames.map(frame => ({ id: frame.id, durationMs: frame.durationMs })),
        palette: [...timeline.palette], layers: timeline.layers.map(layer => ({ id: layer.id, role: layer.role, visible: layer.visible, name: layer.name })) },
      music: { pageId: music.musicPageId, pages: music.musicAnimation?.frames?.map(frame => frame.id) || [], song: music.song, readOnly: Boolean(window.__musicLayerQA.model.readOnly), error: window.__musicLayerQA.model.error || '' },
      preferences: draw.getOutputPreferences?.(), selectedLayerId: draw.getEditorState?.().layerId, selectedFrameId:draw.getEditorState?.().frameId, musicLayerId: timeline.layers.find(layer => layer.role === 'music')?.id,
      hasOutput: typeof draw.getOutputFrame === 'function', mediaRequests: window.__musicLayerQA.mediaRequests
    };
  });
}

async function mode(page, name) {
  const menu = page.locator('#creation-mode-menu');
  if (!await menu.evaluate(el => el.open)) await page.locator('#creation-mode-menu > summary').click();
  await page.locator(`[data-creation-mode="${name}"]`).click();
  await page.waitForFunction(name => document.body.dataset.creationMode === name && !document.querySelector('#creation-mode-menu')?.hasAttribute('aria-busy'), name);
}

async function screenshot(page, name) { await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); }

try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const { context, page } = await newPage(viewport);
    await page.goto(`${base}/draw/`);
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true', null, { timeout: 20000 });
    await page.waitForFunction(() => window.__musicLayerQA?.model?.getState?.(), null, { timeout: 15000 });
    const suffix = `${viewport.width}x${viewport.height}`;
    let state = await inspect(page);
    assert.equal(state.probeMissing, undefined, `instrumentation should expose Draw and music model: ${JSON.stringify(state)}`);
    assert.equal(state.preferences?.includeMusic, false, 'music output is opt-in by default');
    assert.ok(state.timeline.layers.some(layer => layer.role === 'music'), 'shared timeline has a music layer');
    check('shared-project-start', { viewport, state });
    await screenshot(page, `${suffix}-draw-start`);

    // Enter music mode and ensure the same page is active. Page edits use the real UI.
    await mode(page, 'audio');
    await page.waitForSelector('#draw-music-settings');
    const musicSettings = page.locator('#draw-music-settings');
    if (!await musicSettings.evaluate(el => el.open)) await page.locator('#draw-music-settings > summary').click();
    await musicSettings.evaluate(el => { el.open = true; });
    let audioState = await inspect(page);
    assert.equal(audioState.mode, 'audio');
    // A fresh shared Draw project must expose an editable blank music page.
    assert.equal(audioState.music.readOnly, false, `blank shared Draw projects should create an editable music page: ${audioState.music.error}`);
    assert.equal(audioState.music.pages.length, 1, 'a new Draw project starts with one blank music page');
    assert.equal(audioState.selectedLayerId, audioState.musicLayerId, 'entering audio selects the shared Music layer');
    const play = page.locator('#draw-music-play');
    assert.equal(await play.count(), 1, 'music transport exists in shared bottom navigation');
    const transport = await play.boundingBox(), nav = await page.locator('nav.app-tabs').boundingBox();
    assert.ok(transport && nav && transport.y >= nav.y - 2 && transport.y + transport.height <= nav.y + nav.height + 2, 'music transport is fixed inside bottom navigation');
    await screenshot(page, `${suffix}-audio-start`);

    // Paint one note on the actual shared Music layer, then bind the chosen
    // palette color to an instrument through the ordinary settings control.
    await musicSettings.evaluate(el => { el.open = false; });
    await page.evaluate(() => window.__musicLayerQA.draw.selectMusicLayer());
    const colorSwatch = page.locator('#draw-palette [data-color-index]').first();
    const usableSwatch = page.locator('#draw-palette [data-color-index]:not([data-color-index="-1"])').first();
    if (await usableSwatch.count()) await usableSwatch.click();
    const canvasBox = await page.locator('#draw-canvas').boundingBox();
    assert.ok(canvasBox, 'shared Draw canvas is present in audio mode');
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await musicSettings.evaluate(el => { el.open = true; });
    const instrument = page.locator('#draw-music-instrument');
    if (await instrument.isEnabled()) {
      const option = await instrument.locator('option[value="triangle"]').getAttribute('value');
      if (option) await instrument.selectOption(option);
    }
    const paintedOutput = await page.evaluate(() => {
      const d = window.__musicLayerQA.draw, t = d.getTimeline(), id = d.getEditorState().frameId;
      return { art: d.getOutputFrame(id, { includeMusic:false }).pixels, mixed: d.getOutputFrame(id, { includeMusic:true }).pixels };
    });
    assert.notEqual(hash(paintedOutput.art), hash(paintedOutput.mixed), 'drawing on Music creates music-only output pixels');
    const paintedState = await inspect(page);
    assert.equal(paintedState.timeline.layers.find(layer => layer.role === 'music').visible, false, 'music can render while its Draw layer remains hidden');
    check('music-note-and-instrument', { selectedColor: await page.evaluate(() => window.__musicLayerQA.draw.getEditorState().selectedColor), instrument: await instrument.inputValue(), hashes: { art:hash(paintedOutput.art), mixed:hash(paintedOutput.mixed) }, song:paintedState.music });

    const add = page.locator('#draw-music-page-add');
    await add.click(); await page.waitForTimeout(80);
    const added = await inspect(page); assert.equal(added.music.pages.length, paintedState.music.pages.length + 1, 'adding a music page updates shared timeline');
    await page.locator('#draw-music-page-copy').click(); await page.waitForTimeout(80);
    const copied = await inspect(page); assert.equal(copied.music.pages.length, added.music.pages.length + 1, 'copy adds one independent music page');
    await page.locator('#draw-music-page-before').click(); await page.waitForTimeout(80);
    const reordered=await inspect(page);
    assert.notDeepEqual(reordered.music.pages,copied.music.pages,'moving the selected page changes page order');
    await page.locator('#draw-music-page-delete').click(); await page.waitForTimeout(80);
    assert.equal((await inspect(page)).music.pages.length,reordered.music.pages.length-1,'delete removes the selected page');
    await page.evaluate(() => window.__musicLayerQA.draw.undo()); await page.waitForTimeout(80);
    assert.equal((await inspect(page)).music.pages.length,reordered.music.pages.length,'Undo restores the deleted music page');
    await page.evaluate(() => window.__musicLayerQA.draw.redo()); await page.waitForTimeout(80);
    assert.equal((await inspect(page)).music.pages.length,reordered.music.pages.length-1,'Redo reapplies the page deletion');
    check('music-page-controls', { before: paintedState.music, after: await inspect(page) });

    // Audio output preference must only change the music mix; art-only remains stable.
    await page.locator('#draw-music-page').selectOption(paintedState.music.pageId);
    const output = await page.evaluate(() => {
      const d = window.__musicLayerQA.draw, t = d.getTimeline(), id = d.getEditorState().frameId;
      const art = d.getOutputFrame(id, { includeMusic: false }), current = d.getOutputFrame(id, { includeMusic: true });
      return { art: { width: art.width, height: art.height, pixels: [...art.pixels] }, mixed: { width: current.width, height: current.height, pixels: [...current.pixels] } };
    });
    assert.deepEqual([output.art.width, output.art.height], [output.mixed.width, output.mixed.height]);
    assert.notEqual(hash(output.art.pixels), hash(output.mixed.pixels), 'music layer has distinct pixels for output composition');
    const musicOutputToggle = page.locator('#draw-music-output-layer');
    const wasEnabled = await musicOutputToggle.isChecked();
    if (!wasEnabled) await musicOutputToggle.click();
    await page.waitForTimeout(100);
    const uiClickWorked = await page.evaluate(() => window.__musicLayerQA.draw.getOutputPreferences().includeMusic === true);
    assert.equal(uiClickWorked, true, 'native output toggle click updates the shared output preference');
    await page.waitForFunction(() => window.__musicLayerQA.draw.getOutputPreferences().includeMusic === true);
    const enabled = await page.evaluate(() => window.__musicLayerQA.draw.getOutputPreferences());
    assert.equal(enabled.includeMusic, true);
    if (await musicOutputToggle.isChecked()) await musicOutputToggle.click();
    await page.waitForFunction(() => window.__musicLayerQA.draw.getOutputPreferences().includeMusic === false);
    check('independent-output-preference', { hashes: { art: hash(output.art.pixels), mixed: hash(output.mixed.pixels) }, enabled, uiClickWorked });

    // Draw animation operations should not mutate the song; selecting the music layer is a shared-layer change.
    const songBeforeFrames = JSON.stringify((await inspect(page)).music.song);
    await mode(page, 'draw');
    const framesToggle = page.locator('#draw-animation-controls [data-action="toggle-frames"]');
    if (await framesToggle.count()) await framesToggle.click();
    const frameAdd = page.locator('.animation-controls__frame-add');
    if (await frameAdd.count()) { await frameAdd.click(); await page.waitForTimeout(100); }
    const frameSelectors=page.locator('.animation-controls__frame[data-action="select-frame"]');
    assert.equal(await frameSelectors.count(),2,'art timeline contains the original and added frames');
    await frameSelectors.nth(0).click(); const selectedFirst=(await inspect(page)).selectedFrameId;
    await frameSelectors.nth(1).click(); const selectedSecond=(await inspect(page)).selectedFrameId;
    assert.notEqual(selectedFirst,selectedSecond,'art frame selection seeks the shared Draw timeline');
    const timelineAfterFrame = await inspect(page);
    assert.equal(JSON.stringify(timelineAfterFrame.music.song), songBeforeFrames, 'frame changes do not alter song state');
    const timingToggle = page.locator('[data-action="toggle-duration"]');
    if (await timingToggle.count()) {
      // Root UI shells may visually hide this legacy control when its settings panel is docked;
      // activate its own delegated control and change event while preserving the real app handler.
      await timingToggle.first().evaluate(button => button.click());
      const fps = page.locator('[data-fps-preset]').first();
      if (await fps.count()) await fps.evaluate(select => { select.value = '12.5'; select.dispatchEvent(new Event('change', { bubbles:true })); });
    }
    await page.waitForTimeout(80);
    const afterFps = await inspect(page);
    assert.equal(JSON.stringify(afterFps.music.song), songBeforeFrames, 'FPS changes leave song JSON untouched');
    assert.ok(afterFps.timeline.frames.some(frame => frame.durationMs === 80), '12.5 FPS updates the selected Draw frame duration');
    await mode(page, 'audio');
    assert.ok((await inspect(page)).music.pages.length >= 1, 'music pages survive mode round trip');
    await mode(page, 'camera');
    assert.equal(await page.evaluate(() => window.__musicLayerQA.mediaRequests), 0, 'camera mode did not request media automatically');
    await mode(page, 'draw');
    check('mode-and-frame-retention', { state: await inspect(page), songBeforeFrames });

    // Save the unified project, then reopen by its saved PXD pointer and compare art/song snapshots.
    const beforeSave = await inspect(page);
    const saved = await page.evaluate(async () => {
      const result = await window.__musicLayerQA.draw.workspace.save();
      return { projectId: result.projectId, revisionId: result.revisionId, title: result.manifest?.title };
    });
    const savedUrl = new URL(page.url()); savedUrl.searchParams.set('pxd', saved.projectId); savedUrl.searchParams.set('pxdRevision', saved.revisionId);
    await page.goto(savedUrl.href); await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true', null, { timeout: 20000 });
    await page.waitForFunction(() => window.__musicLayerQA?.model?.getState?.(), null, { timeout: 15000 });
    const reopened = await inspect(page);
    assert.deepEqual(reopened.timeline, beforeSave.timeline, 'saved PXD reopens with same art timeline');
    assert.deepEqual(reopened.music, beforeSave.music, 'saved PXD reopens with same song/pages');
    check('pxd-save-reopen', { saved, beforeSave, reopened });
    await screenshot(page, `${suffix}-reopened`);

    // Exercise transport and visual controls without touching external devices.
    await mode(page, 'audio');
    const settings = page.locator('#draw-music-settings');
    if (!await settings.evaluate(el=>el.open)) await page.locator('#draw-music-settings > summary').click();
    const audioOutputToggle=page.locator('#draw-music-output-audio');
    if (await audioOutputToggle.isChecked()) await audioOutputToggle.click();
    assert.equal(await audioOutputToggle.isChecked(),false,'no-audio video option is independent from Music-layer artwork output');
    const noAudioVideo=await page.evaluate(async()=>{
      const {renderAudioVideo}=await import('/js/creation/audio-video.mjs');
      const {documentRgba}=await import('/js/creation/draw-core.mjs');
      const d=window.__musicLayerQA.draw,t=d.getTimeline(),frames=t.frames.map(frame=>{
        const doc=d.getOutputFrame(frame.id);
        return{width:doc.width,height:doc.height,rgba:new Uint8ClampedArray(documentRgba({...doc,pixels:Array.from(doc.pixels)}))};
      });
      const original=window.AudioContext,AudioContextImpl=window.AudioContext||window.webkitAudioContext;
      window.__musicLayerQA.audioContextStarts=0;
      if(AudioContextImpl) window.AudioContext=new Proxy(AudioContextImpl,{construct(target,args){window.__musicLayerQA.audioContextStarts++;return Reflect.construct(target,args);}});
      try {
        const result=await renderAudioVideo(window.__musicLayerQA.model.getState().song,frames[0],{
          totalPlays:1,frameImages:frames,frameDurationsMs:t.frames.map(frame=>frame.durationMs),includeAudio:false
        });
        return{hasAudio:result.hasAudio,seconds:result.seconds,blobBytes:result.blob.size,contextStarts:window.__musicLayerQA.audioContextStarts,frameCount:frames.length};
      } finally { if(original) window.AudioContext=original; }
    });
    assert.equal(noAudioVideo.hasAudio,false); assert.ok(noAudioVideo.blobBytes>0,'no-audio export produces a video file');
    assert.equal(noAudioVideo.contextStarts,0,'no-audio export does not instantiate an AudioContext');
    check('no-audio-video-export',noAudioVideo);
    const musicPlay = page.locator('#draw-music-play');
    if (await musicPlay.count()) {
      await musicPlay.click(); await page.waitForFunction(() => document.querySelector('#draw-music-play')?.dataset.state === 'playing', null, { timeout:6000 });
      await musicPlay.click(); await page.waitForFunction(() => document.querySelector('#draw-music-play')?.dataset.state === 'idle', null, { timeout:6000 });
    }
    await mode(page, 'draw');
    const visualPlay = page.locator('#draw-animation-play');
    if (await visualPlay.count()) {
      await visualPlay.click(); await page.waitForFunction(() => document.querySelector('#draw-animation-play')?.getAttribute('aria-pressed') === 'true');
      await visualPlay.click(); await page.waitForFunction(() => document.querySelector('#draw-animation-play')?.getAttribute('aria-pressed') === 'false');
    }
    await mode(page, 'audio');
    const mediaRequests = await page.evaluate(() => window.__musicLayerQA.mediaRequests);
    assert.equal(mediaRequests, 0, 'no real media request occurred');
    check('playback-smoke', { musicTransport: await musicPlay.count(), visualTransport: await visualPlay.count(), mediaRequests });
    await screenshot(page, `${suffix}-audio-final`);
    await context.close();
  }

  // Legacy Audio-only PXD regression: import its pixels into canonical Draw
  // main, then verify audio pages and unknown song metadata stay independent.
  for (const viewport of [{ width:1280, height:800 }, { width:390, height:844 }]) {
    const { context, page } = await newPage(viewport);
    await page.goto(`${base}/draw/`);
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
    await page.waitForFunction(() => window.__musicLayerQA?.model?.getState?.());
    const fixture = await page.evaluate(async () => {
      const codec = await import('/js/creation/pxd-codec.mjs');
      const audio = await import('/js/creation/audio-core.mjs');
      const pxd = await import('/js/creation/pxd-draw-audio.mjs');
      const stores = await import('/js/creation/tool-project-store.mjs');
      const imageApi = await import('/js/creation/pxd-project.mjs');
      const width=32,height=1,rgba=new Uint8Array(width*height*4);
      rgba.set([73,201,60,255],5*4);
      const image={width,height,rgba};
      const song=audio.createAudioSong({songId:'music-layer-legacy-qa',tempo:137});
      song.futureAudio={preserved:'legacy fixture metadata'};
      const trackId=song.tracks[0].trackId;
      let noted=audio.setAudioPixel(song,{trackId,pitch:60,startTick:5*audio.AUDIO_PIXEL_TICKS,noteId:'legacy-note-keep',velocity:47});
      noted={...noted,tracks:noted.tracks.map(track=>({...track,clips:track.clips.map(clip=>({...clip,notes:clip.notes.map(note=>note.noteId==='legacy-note-keep'?{...note,sourceCell:{x:5,y:0},colorId:'rgba-49c93cff'}:note)}))}))};
      const link={rulesVersion:'shared-canvas-v1',imageRole:'audio',width,height,ticksPerCell:audio.AUDIO_PIXEL_TICKS,
        rowPitchMap:[60],colorToSlot:{'rgba-49c93cff':'square'},originalHint:'legacy-audio-only'};
      const legacy=pxd.projectLegacySharedAudioImage(noted,image,{...link,ticksPerCell:60});
      let project=codec.createPxdProject({manifest:{title:'Legacy music fixture',lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}});
      project=codec.setPxdJson(project,'legacy/unknown.json',{preserved:'unknown source entry'});
      project=await pxd.writePxdAudioState(project,legacy.song,{image,link:legacy.link});
      const store=stores.createToolProjectStore('audio'),saved=await store.save(project,{expectedRevisionId:null});
      const source=await store.load(saved.projectId,saved.revisionId),sourceImage=await imageApi.readPxdImage(source,'audio');
      await window.__musicLayerQA.draw.workspace.importProject(source);
      return {id:saved.projectId,revision:saved.revisionId,image:{width:sourceImage.width,height:sourceImage.height,rgba:[...sourceImage.rgba]},song:legacy.song};
    });
    await page.waitForFunction(() => window.__musicLayerQA?.model?.getState?.().musicAnimation?.frames?.length === 1);
    const migrated = await page.evaluate(async () => {
      const pointer=JSON.parse(localStorage.getItem('pixieed:pxd:last:creation')||'null');
      const stores=await import('/js/creation/tool-project-store.mjs'), images=await import('/js/creation/pxd-project.mjs'), animations=await import('/js/creation/pxd-animation.mjs'), pxd=await import('/js/creation/pxd-draw-audio.mjs');
      const project=await stores.createToolProjectStore('draw').load(pointer.projectId,pointer.revisionId);
      const main=await images.readPxdImage(project,'main'), art=await animations.readPxdAnimation(project,'main'), music=await animations.readPxdAnimation(project,'audio');
      return {pointer,owner:project.manifest.toolProject?.tool,main:main&&{width:main.width,height:main.height,rgba:[...main.rgba]},
        art:art&&{width:art.width,height:art.height,frames:art.frames.map(frame=>({id:frame.id,durationMs:frame.durationMs}))},
        music:music&&{width:music.width,height:music.height,frames:music.frames.map(frame=>({id:frame.id,durationMs:frame.durationMs}))},
        song:pxd.readPxdAudioState(project), entries:project.entries.map(entry=>entry.path)};
    });
    assert.notEqual(migrated.pointer.projectId,fixture.id,'legacy Audio PXD opens as an independent Draw-owned shared copy');
    assert.equal(migrated.owner,'draw'); assert.deepEqual(migrated.main,fixture.image,'legacy audio artwork becomes canonical main image');
    assert.ok(migrated.art?.frames.length,'canonical main art timeline is persisted');
    assert.ok(migrated.music?.frames.length,'music pages are persisted to their own audio animation role');
    assert.deepEqual(migrated.song,fixture.song,'legacy song fields, timing, note IDs and note attributes survive import');
    assert.equal(migrated.song.futureAudio.preserved,'legacy fixture metadata','unknown legacy song fields survive migration');
    assert.ok(migrated.entries.includes('legacy/unknown.json'),'unknown source PXD entry survives import');
    const migratedNotes=migrated.song.tracks.flatMap(track=>track.clips.flatMap(clip=>clip.notes));
    assert.ok(migratedNotes.some(note=>note.noteId==='legacy-note-keep'),'legacy note IDs survive the audio-to-Draw migration');
    const saved=await page.evaluate(async()=>{const p=await window.__musicLayerQA.draw.workspace.save();return{projectId:p.projectId,revisionId:p.revisionId};});
    const savedState=await page.evaluate(async ({projectId,revisionId})=>{
      const stores=await import('/js/creation/tool-project-store.mjs'),images=await import('/js/creation/pxd-project.mjs'),animations=await import('/js/creation/pxd-animation.mjs'),pxd=await import('/js/creation/pxd-draw-audio.mjs');
      const project=await stores.createToolProjectStore('draw').load(projectId,revisionId),main=await images.readPxdImage(project,'main'),art=await animations.readPxdAnimation(project,'main'),music=await animations.readPxdAnimation(project,'audio');
      return{main:{width:main.width,height:main.height,rgba:[...main.rgba]},art:{width:art.width,height:art.height,frames:art.frames.map(frame=>({id:frame.id,durationMs:frame.durationMs}))},
        music:{width:music.width,height:music.height,frames:music.frames.map(frame=>({id:frame.id,durationMs:frame.durationMs}))},song:pxd.readPxdAudioState(project)};
    },saved);
    assert.deepEqual(savedState.main,migrated.main); assert.deepEqual(savedState.art,migrated.art); assert.deepEqual(savedState.music,migrated.music); assert.deepEqual(savedState.song,migrated.song);
    await page.goto(`${base}/draw/?pxd=${saved.projectId}&pxdRevision=${saved.revisionId}`);
    await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
    await page.waitForFunction(() => window.__musicLayerQA?.model?.getState?.());
    assert.deepEqual(await page.evaluate(()=>window.__musicLayerQA.draw.getTimeline().frames.map(frame=>({id:frame.id,durationMs:frame.durationMs}))),savedState.art.frames);
    assert.deepEqual(await page.evaluate(()=>window.__musicLayerQA.model.getState().song),savedState.song);
    check('legacy-audio-pxd-main-music-reopen',{viewport,fixture:{id:fixture.id,revision:fixture.revision},migrated,saved,savedState,externalRequests:'blocked'});
    await screenshot(page,`${viewport.width}x${viewport.height}-legacy-audio-pxd-reopened`); await context.close();
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ output: `${out}/results.json`, status: report.status, checks: report.checks.map(({ name, viewport }) => ({ name, viewport })), errors: report.errors }, null, 2));
