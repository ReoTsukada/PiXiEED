#!/usr/bin/env node
/** Isolated browser acceptance for Audio's actual File > video export path. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only an isolated localhost server is allowed');
const phase = process.env.AUDIO_VIDEO_PHASE || 'final';
assert.ok(['before', 'final'].includes(phase));
const profile = process.env.AUDIO_VIDEO_PROFILE || 'android';
assert.ok(['android', 'desktop'].includes(profile));
const outDir = `/tmp/pixieed-audio-video-20261004/${phase}/${profile}`;
const baselineOverride = process.env.AUDIO_VIDEO_BASELINE_SOURCE ? await readFile(process.env.AUDIO_VIDEO_BASELINE_SOURCE, 'utf8') : null;
const runtime = '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const result = { phase, profile, base, checks: [], errors: [], blockedRequests: [], sourceHashes: {}, fixture: null, recording: null };
const pass = (name, evidence = {}) => result.checks.push({ name, pass: true, ...evidence });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rgbaAt = (image, cell) => Array.from(image.rgba.slice((cell.y * image.width + cell.x) * 4, (cell.y * image.width + cell.x) * 4 + 4));

try {
  await mkdir(outDir, { recursive: true });
  const mobile = profile === 'android';
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: mobile ? 2.75 : 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: true,
    ...(mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' } : {}) });
  await context.route('**/*', route => {
    const request = route.request();
    if (baselineOverride && new URL(request.url()).pathname === '/js/creation/audio-video.mjs') return route.fulfill({ status: 200, contentType: 'text/javascript', body: baselineOverride });
    if (new URL(request.url()).origin === origin || ['blob:', 'data:'].includes(new URL(request.url()).protocol)) return route.continue();
    result.blockedRequests.push(`${request.method()} ${request.url()}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location()?.url || '';
    if (message.text().includes('Failed to load resource: net::ERR_FAILED') && result.blockedRequests.some(url => url.startsWith('GET https://'))) result.blockedRequests.push(`browser console: ${message.text()} (${location || 'blocked external resource'})`);
    else result.errors.push(`console: ${message.text()} ${location}`);
  });
  await page.addInitScript(() => {
    const Native = globalThis.MediaRecorder;
    globalThis.__recordings = [];
    if (!Native) return;
    class ObservedRecorder extends Native {
      constructor(stream, options) {
        super(stream, options);
        const snapshot = { mimeType: options?.mimeType || '', tracks: stream.getTracks().map(t => ({ kind: t.kind, track: t })), chunks: [], events: [] };
        globalThis.__recordings.push(snapshot);
        this.addEventListener('dataavailable', event => { if (event.data?.size) snapshot.chunks.push(event.data); snapshot.events.push({ type: 'dataavailable', size: event.data?.size || 0 }); });
        this.addEventListener('error', event => snapshot.events.push({ type: 'error', message: event.error?.message || '' }));
        this.addEventListener('stop', () => snapshot.events.push({ type: 'stop' }));
      }
      static isTypeSupported(type) { return Native.isTypeSupported(type); }
    }
    globalThis.MediaRecorder = ObservedRecorder;
  });

  await page.goto(`${base}/audio/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#audio-pixel-canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.querySelector('#audio-pixel-canvas')?.width >= 16);
  const fixture = await page.evaluate(async () => {
    const core = await import('/js/creation/audio-core.mjs');
    const timbres = await import('/js/creation/audio-timbres.mjs');
    const pxd = await import('/js/creation/pxd-codec.mjs');
    const audioPxd = await import('/js/creation/pxd-draw-audio.mjs');
    const stores = await import('/js/creation/tool-project-store.mjs');
    const width = 16, height = 16, rgba = new Uint8Array(width * height * 4);
    rgba.set([73,100,60,255], (2 * width + 1) * 4); // early visual/audio marker
    rgba.set([76,130,195,255], (12 * width + 15) * 4); // far-right late note
    const song = core.createAudioSong({ songId: 'audio-video-lookahead-repro', tempo: 120, loopTicks: core.AUDIO_BAR_TICKS });
    const plan = audioPxd.prepareSharedAudioImageImport(song, { width, height, rgba });
    const project = await audioPxd.writePxdAudioState(pxd.createPxdProject({ manifest: { title: 'Video late-note isolated QA', lastMode: 'audio', toolProject: { schemaVersion: 1, tool: 'audio' } } }), plan.song, { image: plan.image, link: plan.link });
    const stored = await stores.createToolProjectStore('audio').save(project, { expectedRevisionId: null });
    const events = core.collectAudioEvents(plan.song).map(({ startTick, durationTicks, pitch, instrument, velocity }) => ({ startTick, durationTicks, pitch, instrument, velocity }));
    const releaseSeconds = Math.max(0, ...events.map(event => timbres.getAudioInstrument(event.instrument)?.release || 0)) + .08;
    return { projectId: stored.projectId, revisionId: stored.revisionId, width, height, early: { x: 1, y: 2 }, late: { x: 15, y: 12, rgba: [76,130,195,255] }, editCell: { x: 8, y: 8 }, loopTicks: plan.song.loopTicks, tempo: plan.song.tempo, events, expectedSeconds: plan.song.loopTicks * 60 / plan.song.tempo / core.AUDIO_PPQ, releaseSeconds };
  });
  result.fixture = fixture;
  assert.ok(fixture.events.some(event => event.startTick <= 120) && fixture.events.some(event => event.startTick >= 15 * 120), 'fixture contains early and far-right late notes');
  pass('isolated 1-frame fixture has early and final-column notes', { eventCount: fixture.events.length, events: fixture.events, expectedSeconds: fixture.expectedSeconds });

  await page.goto(`${base}/audio/?pxd=${encodeURIComponent(fixture.projectId)}&pxdRevision=${encodeURIComponent(fixture.revisionId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.querySelector('#audio-pixel-canvas')?.width === 16);
  await page.waitForFunction(id => location.search.includes(encodeURIComponent(id)) && document.querySelector('#audio-status'), fixture.projectId);
  const storedBeforeEdit = await page.evaluate(async id => {
    const storeApi = await import('/js/creation/tool-project-store.mjs');
    const pxdAudio = await import('/js/creation/pxd-draw-audio.mjs');
    const pxdProject = await import('/js/creation/pxd-project.mjs');
    const store = storeApi.createToolProjectStore('audio'); const project = await store.load(id);
    const image = await pxdProject.readPxdImage(project, 'audio');
    return { revisionId: project.revisionId, notes: pxdAudio.readPxdAudioState(project).tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)).length,
      image: { width: image.width, height: image.height, rgba: Array.from(image.rgba) } };
  }, fixture.projectId);
  const before = await page.evaluate(() => {
    const c = document.querySelector('#audio-pixel-canvas');
    return { rgba: Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data), width: c.width, height: c.height, url: location.href };
  });
  await page.screenshot({ path: `${outDir}/source-before.png` });
  const canvasBox = await page.locator('#audio-pixel-canvas').boundingBox();
  assert.ok(canvasBox && canvasBox.width > 16 && canvasBox.height > 16, 'test canvas is visible');
  const editCell = fixture.editCell;
  const editOffset = (editCell.y * 16 + editCell.x) * 4;
  const cellBefore = before.rgba.slice(editOffset, editOffset + 4);
  const editAt = Date.now();
  await page.mouse.click(canvasBox.x + canvasBox.width * (editCell.x + .5) / 16, canvasBox.y + canvasBox.height * (editCell.y + .5) / 16);
  await page.waitForFunction(({ offset, old }) => {
    const c = document.querySelector('#audio-pixel-canvas'); const p = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    return p[offset] !== old[0] || p[offset+1] !== old[1] || p[offset+2] !== old[2] || p[offset+3] !== old[3];
  }, { offset: editOffset, old: cellBefore }, { timeout: 3000 });
  const editedCanvas = await page.locator('#audio-pixel-canvas').evaluate(c => ({ rgba: Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data), width: c.width, height: c.height }));
  const editedCellRgba = editedCanvas.rgba.slice(editOffset, editOffset + 4);
  assert.notDeepEqual(editedCellRgba, cellBefore, 'real canvas interaction changes the fixture before video export');
  const filePanel = page.locator('#audio-output');
  if (!(await filePanel.evaluate(el => el.open))) await filePanel.locator(':scope > summary').click();
  await page.locator('#audio-export-video').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outDir}/file-panel-open.png` });
  const downloadWait = page.waitForEvent('download', { timeout: 30000 });
  const revisionAtExport = await page.evaluate(async id => {
    const api = await import('/js/creation/tool-project-store.mjs');
    return (await api.createToolProjectStore('audio').load(id))?.revisionId || null;
  }, fixture.projectId);
  const exportStartedAt = Date.now();
  const revisionChangedWait = phase === 'final' ? page.waitForFunction(async ({ id, revision }) => {
    const api = await import('/js/creation/tool-project-store.mjs');
    const project = await api.createToolProjectStore('audio').load(id);
    return project && project.revisionId !== revision;
  }, { id: fixture.projectId, revision: revisionAtExport }, { timeout: 10000 }).then(() => true, () => false) : Promise.resolve(false);
  await page.locator('#audio-export-video').click();
  const download = await downloadWait;
  const revisionAdvancedDuringRecording = await revisionChangedWait;
  const tempPath = await download.path();
  const bytes = await readFile(tempPath);
  const filename = download.suggestedFilename();
  const savePath = `${outDir}/actual-${filename}`;
  await writeFile(savePath, bytes);
  const media = await page.evaluate(async ({ expectedCell }) => {
    const snapshot = globalThis.__recordings.at(-1);
    if (!snapshot) return { error: 'MediaRecorder observer has no recording' };
    const blob = new Blob(snapshot.chunks, { type: snapshot.mimeType });
    const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(blob);
    const metadata = await Promise.race([
      new Promise(resolve => video.addEventListener('loadedmetadata', () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration }), { once: true })),
      new Promise(resolve => video.addEventListener('error', () => resolve({ error: video.error?.message || 'decode error' }), { once: true })),
      new Promise(resolve => setTimeout(() => resolve({ error: 'video decode timeout' }), 8000))
    ]);
    const visualSamples = [];
    if (Number.isFinite(metadata.duration) && metadata.duration > .1) {
      const frame = document.createElement('canvas'); frame.width = video.videoWidth; frame.height = video.videoHeight;
      const frameContext = frame.getContext('2d', { willReadFrequently: true });
      for (const time of [.2, Math.min(1.0, metadata.duration * .5), Math.min(1.75, metadata.duration - .04)]) {
        try {
          video.currentTime = Math.min(time, metadata.duration - .01);
          await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
          frameContext.drawImage(video, 0, 0, frame.width, frame.height);
          const x = Math.floor(frame.width * (expectedCell.x + .5) / 16), y = Math.floor(frame.height * (expectedCell.y + .5) / 16);
          visualSamples.push({ time: video.currentTime, rgba: Array.from(frameContext.getImageData(x,y,1,1).data) });
        } catch (error) { visualSamples.push({ time, error: error?.message || String(error) }); }
      }
    }
    let waveform = null, audioDecodeError = null;
    try {
      const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      const audio = new AudioCtor();
      const buffer = await audio.decodeAudioData(await blob.arrayBuffer());
      const samples = buffer.getChannelData(0);
      const rmsWindow = (start, end) => {
        const lo = Math.max(0, Math.floor(start * buffer.sampleRate)), hi = Math.min(samples.length, Math.floor(end * buffer.sampleRate));
        let sum = 0; for (let i=lo; i<hi; i++) sum += samples[i]*samples[i];
        return { start: lo / buffer.sampleRate, end: hi / buffer.sampleRate, rms: hi > lo ? Math.sqrt(sum/(hi-lo)) : 0, samples: Math.max(0,hi-lo) };
      };
      waveform = { duration: buffer.duration, sampleRate: buffer.sampleRate,
        early: rmsWindow(.14,.36), late: rmsWindow(1.93,2.16), finalTail: rmsWindow(2.2,2.4) };
      await audio.close();
    } catch (error) { audioDecodeError = error?.message || String(error); }
    return { mimeType: snapshot.mimeType, bytes: blob.size, tracks: snapshot.tracks.map(({kind,track})=>({kind,readyState:track.readyState})), events: snapshot.events, metadata, visualSamples, waveform, audioDecodeError };
  }, { expectedCell: fixture.late });
  result.recording = { file: savePath, filename, bytes: bytes.length, sha256: sha(bytes), media };
  assert.ok(bytes.length > 0, 'actual browser download is nonempty');
  assert.ok(media.metadata.width > 0 && media.metadata.height > 0 && Number.isFinite(media.metadata.duration), `actual downloaded media decodes: ${JSON.stringify(media.metadata)}`);
  assert.deepEqual(media.tracks.map(track => track.kind).sort(), ['audio','video'], 'actual MediaRecorder stream contains audio and video tracks');
  assert.ok(filename.endsWith(media.mimeType.includes('mp4') ? '.mp4' : '.webm'), `download extension matches ${media.mimeType}`);
  assert.ok(media.mimeType.includes('mp4') ? String.fromCharCode(...bytes.slice(4,8)) === 'ftyp' : bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3, 'download bytes match the actual video container');
  const expectedDurationFloor = fixture.expectedSeconds + fixture.releaseSeconds - .25;
  if (phase === 'final') {
    assert.ok(media.metadata.duration >= expectedDurationFloor, `recording lasts through the full loop and release (${media.metadata.duration}s >= ${expectedDurationFloor}s)`);
    assert.ok(media.waveform?.early?.rms > .0001 && media.waveform?.late?.rms > .0001, `encoded audio contains early and final-column notes: ${JSON.stringify(media.waveform)}`);
    assert.ok(media.visualSamples.length >= 3 && media.visualSamples.every(sample => !sample.error && sample.rgba?.slice(0,3).every((v,i) => Math.abs(v - fixture.late.rgba[i]) <= 6)), `single-frame artwork holds through the loop at the late-note marker (allowing codec error): ${JSON.stringify(media.visualSamples)}`);
    assert.ok(media.tracks.every(track => track.readyState === 'ended'), 'video/audio capture tracks are stopped after export');
  }
  pass('actual UI download is a decodable audiovisual file', { file: savePath, bytes: bytes.length, sha256: sha(bytes), mimeType: media.mimeType, metadata: media.metadata, tracks: media.tracks });
  const sourceAfter = await page.locator('#audio-pixel-canvas').evaluate(c => Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
  assert.deepEqual(sourceAfter, editedCanvas.rgba, 'source drawing remains unchanged after export');
  pass('export leaves edited source canvas image unchanged');
  const storedAfter = await page.evaluate(async id => {
    const storeApi = await import('/js/creation/tool-project-store.mjs');
    const pxdAudio = await import('/js/creation/pxd-draw-audio.mjs');
    const pxdProject = await import('/js/creation/pxd-project.mjs');
    const store = storeApi.createToolProjectStore('audio'); const project = await store.load(id);
    const song = pxdAudio.readPxdAudioState(project); const image = await pxdProject.readPxdImage(project, 'audio');
    const notes = song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes));
    return { revisionId: project.revisionId, image: { width: image.width, height: image.height, rgba: Array.from(image.rgba) }, noteCount: notes.length,
      editNotes: notes.filter(note => note.sourceCell?.x === 8 && note.sourceCell?.y === 8).map(note => ({ startTick: note.startTick, pitch: note.pitch, colorId: note.colorId })) };
  }, fixture.projectId);
  result.projectPersistence = { before: { revisionId: storedBeforeEdit.revisionId, notes: storedBeforeEdit.notes,
      earlyPixel: rgbaAt(storedBeforeEdit.image, fixture.early), latePixel: rgbaAt(storedBeforeEdit.image, fixture.late) }, revisionAtExport,
    after: { revisionId: storedAfter.revisionId, noteCount: storedAfter.noteCount, editNotes: storedAfter.editNotes,
      earlyPixel: rgbaAt(storedAfter.image, fixture.early), latePixel: rgbaAt(storedAfter.image, fixture.late), editPixel: rgbaAt(storedAfter.image, fixture.editCell) }, revisionAdvancedDuringRecording,
    exportElapsedMs: Date.now() - exportStartedAt, editToExportMs: exportStartedAt - editAt };
  if (phase === 'final') {
    assert.ok(result.projectPersistence.editToExportMs < 1000, `video starts within one second of the edit (${result.projectPersistence.editToExportMs}ms)`);
    assert.notEqual(storedAfter.revisionId, revisionAtExport, 'autosave revision advances during the long recording');
    assert.ok(revisionAdvancedDuringRecording, 'autosave becomes visible while recording is still running');
    assert.deepEqual(storedAfter.image.width, fixture.width, 'autosaved PXD image width remains intact');
    assert.deepEqual(storedAfter.image.height, fixture.height, 'autosaved PXD image height remains intact');
    assert.deepEqual(rgbaAt(storedAfter.image, fixture.early), [73,100,60,255], 'autosave preserves the early source marker pixel');
    assert.deepEqual(rgbaAt(storedAfter.image, fixture.late), fixture.late.rgba, 'autosave preserves the late source marker pixel');
    assert.deepEqual(rgbaAt(storedAfter.image, fixture.editCell), editedCellRgba, 'autosaved PXD pixel at the edited cell matches the live canvas');
    assert.equal(storedAfter.editNotes.length, 1, 'autosave preserves the new edited image cell as one note');
    assert.ok(result.projectPersistence.exportElapsedMs > 1000, 'recording remains active long enough for autosave to run');
    pass('autosave during video keeps the active project and preserves the edited pixel/note', result.projectPersistence);
  }
  result.checks.push({ name: 'actual encoded audio includes early and late note energy', pass: Boolean(media.waveform?.early?.rms > 0.0001 && media.waveform?.late?.rms > 0.0001), waveform: media.waveform, audioDecodeError: media.audioDecodeError, expectedLateAtSeconds: 1.875 });

  result.sourceHashes = { baselineOverride: baselineOverride ? sha(baselineOverride) : null };
  for (const path of ['audio/index.html','js/creation/audio-page.mjs','js/creation/audio-video.mjs','js/creation/audio-core.mjs','js/creation/pxd-draw-audio.mjs']) result.sourceHashes[path] = sha(await readFile(new URL(`../${path}`, import.meta.url)));
  result.pageErrors = [...result.errors];
  await writeFile(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  await context.close();
  console.log(JSON.stringify({ phase, checks: result.checks, recording: result.recording, sourceHashes: result.sourceHashes, errors: result.errors }, null, 2));
} catch (error) {
  result.error = error.stack || String(error);
  await writeFile(`${outDir}/failure.json`, JSON.stringify(result, null, 2)).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
