/** Local-only failure and delayed initialization QA; no device permissions. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = process.env.PIXIEED_LIFECYCLE_OUTPUT || '/tmp/pixieed-creation-lifecycle'; await mkdir(out, { recursive:true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless:true }); const results = [];
try {
  for (const scenario of ['late-audio', 'failed-audio', 'late-camera', 'late-preview', 'late-wav', 'outputs', 'mode-pointer']) {
    const context = await browser.newContext({ viewport: { width:390, height:844 } });
    await context.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
    let release, entered, once = false;
    const gate = new Promise(resolve => { release = resolve; }); const waiting = new Promise(resolve => { entered = resolve; });
    if (!['late-preview', 'outputs', 'mode-pointer'].includes(scenario)) await context.route(scenario === 'late-camera' ? '**/css/pixel-lens-camera.css*' : scenario === 'late-wav' ? '**/audio-export.mjs*' : '**/draw-music.mjs*', async route => {
      if (once) return route.continue(); once = true; entered();
      if (scenario === 'failed-audio') return route.abort();
      await gate; await route.continue();
    });
    await context.addInitScript(() => {
      window.__media = { requests:0, contexts:0, closed:0 };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => { window.__media.requests++; throw new Error('Real devices are disabled in QA'); } });
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(...args) { super(...args); window.__media.contexts++; }
        close() { window.__media.closed++; return super.close(); }
        resume() { if (!window.__delayResume) return super.resume(); return new Promise(resolve => { window.__releaseResume = () => resolve(); }); }
      };
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    const request = async mode => {
      if (!await page.locator('#creation-mode-menu').evaluate(n => n.open)) await page.locator('#creation-mode-menu > summary').click();
      await page.locator(`button[data-creation-mode="${mode}"]`).click();
    };
    const ready = mode => page.waitForFunction(mode => document.documentElement.dataset.creationModesReady === 'true' && document.body.dataset.creationMode === mode && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy'), mode);
    try {
      await page.goto(base + '/draw/'); await ready('draw');
      const canvas = page.locator('#draw-canvas'); const r = await canvas.boundingBox(); await page.mouse.click(r.x + r.width * .2, r.y + r.height * .2);
      const pixels = () => canvas.evaluate(c => [...c.getContext('2d').getImageData(0,0,c.width,c.height).data]); let expectedArtwork = await pixels();
      if (scenario === 'mode-pointer') {
        // A legacy song-only PXD selected explicitly must win over the remembered Audio project.
        await page.locator('#draw-output summary').click(); await page.locator('#draw-save').click();
        await page.waitForFunction(() => new URLSearchParams(location.search).has('pxdRevision'));
        const fixture = await page.evaluate(async () => {
          const core = await import('/js/creation/audio-core.mjs'), codec = await import('/js/creation/pxd-codec.mjs'), stores = await import('/js/creation/tool-project-store.mjs');
          const store = stores.createToolProjectStore('audio');
          const song = core.setAudioPixel(core.createAudioSong({songId:'legacy-mode-pointer',tempo:143}), {trackId:'track-square',pitch:60,startTick:360,noteId:'manual-preserved'});
          let project = codec.createPxdProject({manifest:{lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'},editorState:{audio:{futureSetting:42}}}});
          project = codec.setPxdJson(project,'audio/state.json',song); project = codec.setPxdJson(project,'future/state.json',{keep:true});
          const saved = await store.save(project,{expectedRevisionId:null});
          const decoy = await store.save(codec.setPxdJson(codec.createPxdProject({manifest:{lastMode:'audio',toolProject:{schemaVersion:1,tool:'audio'}}}),'audio/state.json',core.createAudioSong({tempo:90})),{expectedRevisionId:null});
          localStorage.setItem('pixieed:pxd:last:audio',JSON.stringify({projectId:decoy.projectId,revisionId:decoy.revisionId}));
          return {projectId:saved.projectId,revisionId:saved.revisionId,song};
        });
        await page.goto(`${base}/audio/?pxd=${encodeURIComponent(fixture.projectId)}&pxdRevision=${encodeURIComponent(fixture.revisionId)}`); await ready('audio');
        assert.equal(new URL(page.url()).pathname,'/draw/'); assert.equal(await page.locator('#draw-music-tempo').inputValue(),'143');
        expectedArtwork = await pixels();
        await request('draw'); await ready('draw');
        const retained = await page.evaluate(async id => {
          const stores = await import('/js/creation/tool-project-store.mjs'), codec = await import('/js/creation/pxd-codec.mjs'), images = await import('/js/creation/pxd-project.mjs');
          const project = await stores.createToolProjectStore('audio').load(id);
          return {song:codec.getPxdJson(project,'audio/state.json'),future:codec.getPxdJson(project,'future/state.json'),roles:images.pxdImageRoles(project),editor:project.manifest.editorState.audio};
        }, fixture.projectId);
        assert.deepEqual(retained.song,fixture.song); assert.deepEqual(retained.future,{keep:true}); assert.deepEqual(retained.roles,[]); assert.equal(retained.editor.futureSetting,42);
      } else if (['late-preview', 'late-wav', 'outputs'].includes(scenario)) {
        await request('audio'); await ready('audio');
        const r = await canvas.boundingBox(); await page.mouse.click(r.x + r.width * .25, r.y + r.height * .25);
        // This branch intentionally edits the shared image again. Retention is
        // measured against that edit, rather than the earlier seed image.
        expectedArtwork = await pixels();
        await page.locator('#draw-music-settings summary').click(); await page.locator('#draw-music-instrument').selectOption('triangle');
        if (scenario === 'outputs') {
          await page.locator('#draw-music-loops').selectOption('2'); await page.locator('#draw-music-wav').click();
          await page.waitForURL(/\/output\/work\//); await page.locator('#output-audio').waitFor({state:'visible'});
          const audio = await page.locator('#output-audio').evaluate(n => ({url:n.currentSrc || n.src})); assert.ok(audio.url.startsWith('blob:'));
          await page.goBack(); await ready('audio'); await page.locator('#draw-music-settings summary').click();
          await page.locator('#draw-music-loops').selectOption('1'); await page.locator('#draw-music-video').click();
          await page.waitForURL(/\/output\/work\//, {timeout:30000}); await page.locator('#output-video').waitFor({state:'visible'});
          const video = await page.locator('#output-video').evaluate(n => ({url:n.currentSrc || n.src})); assert.ok(video.url.startsWith('blob:'));
          await page.goBack(); await ready('audio'); await request('draw'); await ready('draw');
        } else if (scenario === 'late-wav') {
          await page.locator('#draw-music-wav').click(); await waiting;
          await request('draw'); await ready('draw'); release(); await page.waitForTimeout(200);
          assert.equal(new URL(page.url()).pathname, '/draw/');
        } else {
        await page.evaluate(() => { window.__delayResume = true; }); await page.locator('#draw-music-preview').click();
        await page.waitForFunction(() => typeof window.__releaseResume === 'function');
        await request('draw'); await ready('draw'); await page.evaluate(() => window.__releaseResume());
        await page.waitForFunction(() => window.__media.closed === window.__media.contexts);
        assert.equal(await page.locator('#draw-music-play').getAttribute('data-state'), 'idle');
        }
      } else {
        await request(scenario === 'late-camera' ? 'camera' : 'audio'); await waiting;
        if (scenario !== 'failed-audio') {
          if (scenario === 'late-audio') await request('camera');
          await request('draw'); release();
        }
        await ready('draw');
        if (scenario !== 'late-audio') assert.equal(await page.locator('#pixelStudio').count(), 0);
        if (scenario === 'failed-audio') assert.equal(await page.locator('#draw-music-settings').count(), 0);
        // A canceled or failed load remains retryable and cannot request a camera.
        await request(scenario === 'late-camera' ? 'camera' : 'audio'); await ready(scenario === 'late-camera' ? 'camera' : 'audio');
        await request('draw'); await ready('draw');
      }
      assert.deepEqual(await pixels(), expectedArtwork); assert.equal(await page.locator('#draw-canvas').count(), 1);
      assert.deepEqual(errors, []); const media = await page.evaluate(() => window.__media); assert.equal(media.requests, 0); assert.equal(media.contexts, media.closed);
      results.push({ scenario, passed:true, media, errors }); console.log('PASS', scenario);
    } catch (error) { await page.screenshot({path:`${out}/${scenario}-failure.png`}); throw error; }
    finally { release(); await context.close(); }
  }
} finally { await browser.close(); await writeFile(`${out}/results.json`, JSON.stringify({results, permissions:'never granted', realCamera:'UNTESTED'},null,2)); }
