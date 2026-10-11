/** Local-only regression QA for importing legacy Audio PXD projects into Draw. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
const out = process.env.PIXIEED_SHARED_LEGACY_OUTPUT || '/tmp/pixieed-shared-project-legacy';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'This harness only accepts a localhost base URL.');
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewportWidth of [390, 1280]) for (const canvasWidth of [32, 16]) {
    if (process.env.PIXIEED_TEST_WIDTH && Number(process.env.PIXIEED_TEST_WIDTH) !== viewportWidth) continue;
    if (process.env.PIXIEED_TEST_CANVAS && Number(process.env.PIXIEED_TEST_CANVAS) !== canvasWidth) continue;
    const label = `${viewportWidth}-${canvasWidth === 32 ? 'compressed-32' : 'standard-16'}`;
    const context = await browser.newContext({ viewport: { width: viewportWidth, height: 844 }, acceptDownloads: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new Error('Media devices disabled by local QA.'); } }));
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = async mode => page.waitForFunction(mode => document.documentElement.dataset.creationModesReady === 'true'
      && document.body.dataset.creationMode === mode && !document.querySelector('#creation-mode-menu')?.hasAttribute('aria-busy'), mode);
    const switchMode = async mode => {
      if (!await page.locator('#creation-mode-menu').evaluate(node => node.open)) await page.locator('#creation-mode-menu > summary').click();
      await page.locator(`[data-creation-mode="${mode}"]`).click(); await ready(mode);
    };
    const currentDrawProject = () => page.evaluate(async () => {
      const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || 'null');
      if (!pointer?.projectId || !pointer?.revisionId) throw new Error('Draw copy pointer is missing.');
      const stores = await import('/js/creation/tool-project-store.mjs');
      const project = await stores.createToolProjectStore('draw').load(pointer.projectId, pointer.revisionId);
      return { pointer, owner:project.manifest.toolProject?.tool, schemaVersion:project.manifest.toolProject?.schemaVersion };
    });
    const inspectProject = (id, revision) => page.evaluate(async ({ id, revision }) => {
      const stores = await import('/js/creation/tool-project-store.mjs');
      const codec = await import('/js/creation/pxd-codec.mjs');
      const pxd = await import('/js/creation/pxd-draw-audio.mjs');
      const imageApi = await import('/js/creation/pxd-project.mjs');
      const animationApi = await import('/js/creation/pxd-animation.mjs');
      const project = await stores.createToolProjectStore('draw').load(id, revision);
      const image = await imageApi.readPxdImage(project, 'main');
      const oldAudioImage = await imageApi.readPxdImage(project, 'audio');
      const timeline = await animationApi.readPxdAnimation(project, 'main');
      const audioTimeline = await animationApi.readPxdAnimation(project, 'audio');
      const notes = pxd.readPxdAudioState(project)?.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)) || [];
      const sourceEntry = project.entries.find(entry => entry.path === 'legacy/import-source.pxd');
      const rawEntry = project.entries.find(entry => entry.path === 'legacy/creation-original.pxd');
      const importSource = sourceEntry ? await codec.decodePxd(sourceEntry.bytes) : null;
      const creationSource = rawEntry ? await codec.decodePxd(rawEntry.bytes) : null;
      return {
        projectId: project.projectId, revisionId: project.revisionId, owner: project.manifest.toolProject?.tool,
        image: image && { width:image.width, height:image.height, rgba:[...image.rgba] },
        oldAudioImage: oldAudioImage && { width:oldAudioImage.width, height:oldAudioImage.height, rgba:[...oldAudioImage.rgba] },
        timeline: timeline && { width:timeline.width, height:timeline.height, frameCount:timeline.frames.length },
        audioTimeline: audioTimeline && { width:audioTimeline.width, height:audioTimeline.height, frameCount:audioTimeline.frames.length },
        song: pxd.readPxdAudioState(project), link:pxd.readPxdAudioLink(project), notes,
        importSource: importSource && { projectId:importSource.projectId, revisionId:importSource.revisionId, hash:await codec.encodePxd(importSource).then(bytes => crypto.subtle.digest('SHA-256',bytes)).then(bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('')) },
        creationSource: creationSource && { projectId:creationSource.projectId, revisionId:creationSource.revisionId },
        sourceHash: sourceEntry ? await crypto.subtle.digest('SHA-256', sourceEntry.bytes).then(bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('')) : null
      };
    }, { id, revision });

    try {
      await page.goto(`${base}/draw/`);
      await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
      const fixture = await page.evaluate(async width => {
        const codec = await import('/js/creation/pxd-codec.mjs');
        const audio = await import('/js/creation/audio-core.mjs');
        const pxd = await import('/js/creation/pxd-draw-audio.mjs');
        const stores = await import('/js/creation/tool-project-store.mjs');
        const imageApi = await import('/js/creation/pxd-project.mjs');
        let song = audio.createAudioSong({ songId:`legacy-${width}`, tempo:137 });
        song.futureAudio = { preserved:'old source' };
        const image = { width, height:16, rgba:new Uint8Array(width * 16 * 4) };
        image.rgba.set([73,100,60,255], (5 * width + Math.floor(width / 2)) * 4);
        const link = { rulesVersion:'shared-canvas-v1', imageRole:'audio', width, height:16,
          ticksPerCell:width === 32 ? 60 : 120, rowPitchMap:audio.createAudioRowPitchMap(16),
          colorToSlot:{ 'rgba-49643cff':'square' }, originalHint:'legacy-audio-image' };
        const plan = pxd.projectLegacySharedAudioImage(song, image, link);
        const note = plan.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)).find(item => item.sourceCell);
        if (!note) throw new Error('Legacy fixture did not produce a linked note.');
        note.velocity = 47; note.futureNote = { preserved:'old note' };
        let project = codec.createPxdProject({ manifest:{ title:`Legacy ${width}`, lastMode:'audio', toolProject:{ schemaVersion:1, tool:'audio' } } });
        project = await pxd.writePxdAudioState(project, plan.song, { image:plan.image, link:plan.link });
        const store = stores.createToolProjectStore('audio');
        const saved = await store.save(project, { expectedRevisionId:null });
        const source = await store.load(saved.projectId, saved.revisionId);
        const sourceBytes = await codec.encodePxd(source);
        const sourceImage = await imageApi.readPxdImage(source, 'audio');
        return { id:saved.projectId, revision:saved.revisionId, sourceBytesHash:await crypto.subtle.digest('SHA-256',sourceBytes).then(bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('')),
          image:{ width:sourceImage.width, height:sourceImage.height, rgba:[...sourceImage.rgba] }, song:plan.song, note };
      }, canvasWidth);

      await page.goto(`${base}/audio/?pxd=${fixture.id}&pxdRevision=${fixture.revision}`);
      await ready('audio');
      await page.waitForFunction(() => Boolean(localStorage.getItem('pixieed:pxd:last:creation')));
      let current = await currentDrawProject();
      assert.notEqual(current.pointer.projectId, fixture.id, 'opening an Audio PXD in Draw creates an independent project copy');
      assert.equal(current.owner, 'draw');
      assert.equal(current.schemaVersion, 1);
      let copy = await inspectProject(current.pointer.projectId, current.pointer.revisionId);
      assert.equal(copy.owner, 'draw'); assert.equal(copy.image.width, canvasWidth); assert.equal(copy.image.height, 16);
      assert.deepEqual(copy.image.rgba, fixture.image.rgba, 'the selected legacy Audio pixels become the current Draw canvas');
      assert.equal(copy.importSource.projectId, fixture.id); assert.equal(copy.importSource.revisionId, fixture.revision);
      assert.equal(copy.importSource.hash, fixture.sourceBytesHash, 'nested source archive keeps the source project and bytes');
      assert.deepEqual(copy.oldAudioImage, fixture.image, 'the former audio-role image remains in the copied archive');
      const canvas = await page.locator('#draw-canvas').evaluate(node => ({ width:node.width, height:node.height }));
      assert.deepEqual(canvas, { width:canvasWidth, height:16 });

      await switchMode('draw');
      assert.equal(await page.locator('#draw-tool-picker').count(), 1, 'regular Draw controls remain present in the shared shell');
      await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
      await page.locator('.animation-controls__frame-add').click();
      assert.equal(await page.locator('.animation-controls__frame').count(), 2);
      await switchMode('audio');
      current = await currentDrawProject(); copy = await inspectProject(current.pointer.projectId, current.pointer.revisionId);
      assert.equal(copy.timeline.frameCount, 2); assert.equal(copy.audioTimeline?.frameCount, 1, 'art frames do not duplicate music pages');
      assert.equal(copy.song.futureAudio.preserved, 'old source');
      assert.equal(copy.song.loopTicks, 1920, 'music duration stays independent of art frames');
      assert.equal(copy.link.timing?.rulesVersion, canvasWidth === 32 ? 'loop-ratio-v1' : undefined);
      if (canvasWidth === 32) assert.equal(copy.link.timing.ticksPerFrame, 1920, 'compressed 32-column timing is retained per frame');
      const kept = copy.notes.find(item => item.noteId === fixture.note.noteId);
      assert.ok(kept); assert.equal(kept.velocity, 47); assert.equal(kept.startTick, fixture.note.startTick);
      assert.equal(kept.durationTicks, fixture.note.durationTicks); assert.deepEqual(kept.futureNote, { preserved:'old note' });
      const second = copy.notes.find(item => item.sourceCell?.frameIndex === 1);
      assert.equal(second, undefined, 'adding an art frame does not create a second music page or note');
      assert.deepEqual(copy.oldAudioImage, fixture.image, 'music projection does not replace the prior independent audio image');

      await page.locator('#draw-undo').click();
      await switchMode('draw');
      assert.equal(await page.locator('.animation-controls__frame').count(), 1, 'one Draw undo removes the added frame');
      await switchMode('audio');
      current = await currentDrawProject(); let undone = await inspectProject(current.pointer.projectId, current.pointer.revisionId);
      assert.equal(undone.timeline.frameCount, 1); assert.equal(undone.song.loopTicks, 1920);
      await page.locator('#draw-redo').click();
      await switchMode('draw'); assert.equal(await page.locator('.animation-controls__frame').count(), 2);
      await switchMode('audio'); current = await currentDrawProject(); copy = await inspectProject(current.pointer.projectId, current.pointer.revisionId);
      assert.equal(copy.timeline.frameCount, 2); assert.equal(copy.song.loopTicks, 1920, 'music duration stays independent of art frames');

      const audioStoreCheck = await page.evaluate(async ({ id, revision }) => {
        const stores = await import('/js/creation/tool-project-store.mjs'); const codec = await import('/js/creation/pxd-codec.mjs');
        const store = stores.createToolProjectStore('audio'); const current = await store.load(id);
        const revisionProject = await store.load(id, revision);
        const bytes = await codec.encodePxd(revisionProject);
        return { currentRevision:current.revisionId, revision:revisionProject.revisionId,
          hash:await crypto.subtle.digest('SHA-256',bytes).then(value => [...new Uint8Array(value)].map(x => x.toString(16).padStart(2,'0')).join('')) };
      }, { id:fixture.id, revision:fixture.revision });
      assert.equal(audioStoreCheck.currentRevision, fixture.revision, 'the saved Audio source head is unchanged');
      assert.equal(audioStoreCheck.hash, fixture.sourceBytesHash, 'the source Audio revision bytes are unchanged');

      await page.goto(`${base}/audio/?pxd=${current.pointer.projectId}&pxdRevision=${current.pointer.revisionId}`);
      await ready('audio'); await switchMode('draw');
      const reopened = await currentDrawProject();
      assert.equal(reopened.pointer.projectId, current.pointer.projectId);
      copy = await inspectProject(reopened.pointer.projectId, reopened.pointer.revisionId);
      assert.equal(copy.timeline.frameCount, 2); assert.equal(copy.song.loopTicks, 1920, 'music duration stays independent of art frames');
      assert.equal(copy.link.timing?.ticksPerFrame, canvasWidth === 32 ? 1920 : undefined);

      await page.goto(`${base}/audio/?standalone=1&pxd=${copy.projectId}&pxdRevision=${copy.revisionId}`);
      await page.waitForFunction(() => document.documentElement.dataset.audioReady === 'true' && !document.querySelector('#main').inert);
      const standaloneCopy = await page.evaluate(async () => {
        const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:audio') || 'null');
        if (!pointer?.projectId || !pointer?.revisionId) return { error:'Standalone Audio copy pointer is missing.' };
        const stores = await import('/js/creation/tool-project-store.mjs'); const imageApi = await import('/js/creation/pxd-project.mjs');
        const pxd = await import('/js/creation/pxd-draw-audio.mjs'); const animationApi = await import('/js/creation/pxd-animation.mjs');
        const project = await stores.createToolProjectStore('audio').load(pointer.projectId, pointer.revisionId);
        const image = await imageApi.readPxdImage(project, 'audio');
        const animation = await animationApi.readPxdAnimation(project, 'audio');
        return { pointer, owner:project.manifest.toolProject?.tool, image:image && { width:image.width, height:image.height, rgba:[...image.rgba] },
          song:pxd.readPxdAudioState(project), frames:animation?.frames.length };
      });
      if (standaloneCopy.error) errors.push(standaloneCopy.error);
      else {
        assert.notEqual(standaloneCopy.pointer.projectId, copy.projectId, 'standalone Audio imports a Draw-owned project as a copy');
        assert.equal(standaloneCopy.owner, 'audio'); assert.deepEqual(standaloneCopy.image, { width:canvasWidth, height:16, rgba:copy.image.rgba });
        assert.ok(standaloneCopy.song); assert.ok(standaloneCopy.song.loopTicks >= canvasWidth * 60);
      }
      await page.goto(`${base}/audio/?standalone=1&pxd=${fixture.id}&pxdRevision=${fixture.revision}`);
      await page.waitForFunction(() => document.documentElement.dataset.audioReady === 'true' && !document.querySelector('#main').inert);
      await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').dataset.state === 'playing');
      await page.locator('#audio-play-toggle').click();
      results.push({ label, passed:errors.length === 0, sourceId:fixture.id, sourceRevision:fixture.revision, drawCopyId:copy.projectId,
        canvas:{ width:canvasWidth, height:16 }, checks:['legacy PXD redirected to Draw-owned copy','source ID/revision and encoded bytes unchanged','nested import-source archive exact','canonical Draw pixels and dimensions retained','art frame add/Undo/Redo keeps music pages and duration independent','music notes and timing survive save/reopen','prior audio image retained','standalone new-copy and original-source playback'], errors });
      console.log('PASS', label);
    } catch (error) {
      await page.screenshot({ path:`${out}/${label}-failure.png` }).catch(() => {});
      const debug = await page.evaluate(() => ({ url:location.href, mode:document.body.dataset.creationMode,
        audioReady:document.documentElement.dataset.audioReady, creationModesReady:document.documentElement.dataset.creationModesReady,
        audioPointer:localStorage.getItem('pixieed:pxd:last:audio'), creationPointer:localStorage.getItem('pixieed:pxd:last:creation'),
        status:[...document.querySelectorAll('[role="status"], .status, #audio-status, #pxd-file-status')].map(node=>node.textContent.trim()).filter(Boolean),
        body:document.body.innerText.slice(0,500) })).catch(() => null);
      results.push({ label, passed:false, error:error.stack, debug, errors });
      console.error('FAIL', label, error.message);
    } finally {
      await context.close();
      await writeFile(`${out}/results.json`, JSON.stringify({ results, externalRequests:'blocked', mediaPermissions:'never granted', realCamera:'UNTESTED' }, null, 2));
    }
  }
} finally { await browser.close(); }
assert.equal(results.length, 4);
assert.ok(results.every(result => result.passed), 'Every legacy shared-project case must pass.');
console.log('PASS', results.length, 'legacy shared-project cases');
