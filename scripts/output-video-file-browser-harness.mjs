#!/usr/bin/env node
// Synthetic frames/tone only. A fresh browser context decodes the generated files.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.PIXIEED_MEDIA_EVIDENCE || '/tmp/pixieed-output-video-files';
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/qa-player') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>Synthetic file playback</title><video controls></video>'); return; }
    const path = resolve(root, '.' + name);
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(path);
    res.setHeader('Content-Type', ['.mjs','.js'].includes(extname(path)) ? 'text/javascript' : 'application/octet-stream'); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
const result = { syntheticOnly: true, realAds: false, cameraMicrophoneCalls: 0, files: [], pageErrors: [], externalRequests: [] };
const { chromium } = await import(pathToFileURL('/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
let browser;
try {
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const setup = async () => {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base) return route.continue();
      result.externalRequests.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => { globalThis.__mediaCalls = (globalThis.__mediaCalls || 0) + 1; throw new Error('Hardware media forbidden in synthetic QA'); }; });
    const page = await context.newPage(); page.on('pageerror', e => result.pageErrors.push(e.message)); page.on('console', message => { if (message.type() === 'log') console.log(message.text()); });
    await page.goto(base + '/qa-player'); return { context, page };
  };
  const producer = await setup();
  const choices = await producer.page.evaluate(() => [
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' }
  ].filter(x => MediaRecorder.isTypeSupported(x.mimeType)));
  assert.ok(choices.length, 'at least one native recording container is supported');
  for (const mimeChoice of choices) for (const withAudio of [false, true]) {
    await producer.page.bringToFront();
    await producer.page.mouse.click(5, 5);
    console.log(`Generating ${mimeChoice.extension} audio=${withAudio}`);
    const generated = await producer.page.evaluate(async ({ mimeChoice, withAudio }) => {
      const { renderOutputVideo } = await import('/js/creation/output-video.mjs');
      const frames = [[220,30,50,255],[30,170,90,255]].map(color => ({ width: 16, height: 16, delayMs: 400, data: new Uint8ClampedArray(Array.from({length:256}, () => color).flat()) }));
      const audioSource = withAudio ? { sampleRate: 48000, channels: [Float32Array.from({ length: 38400 }, (_, i) => Math.sin(i * Math.PI * 2 * 440 / 48000) * 0.2)] } : null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let output;
        try { output = await renderOutputVideo(frames, { audioSource, mimeChoice, signal: controller.signal, onProgress: () => {} }); }
        finally { clearTimeout(timeout); }
        const bytes = new Uint8Array(await output.blob.arrayBuffer());
        return { bytes: Array.from(bytes), extension: output.extension, mimeType: output.mimeType, seconds: output.seconds, hasAudio: output.hasAudio };
      } catch (e) { return { error: e.message }; }
    }, { mimeChoice, withAudio });
    assert.ok(!generated.error, `${mimeChoice.extension} audio=${withAudio}: ${generated.error}`);
    const bytes = Buffer.from(generated.bytes);
    const file = `${out}/synthetic-${withAudio ? 'tone' : 'silent'}.${generated.extension}`;
    await writeFile(file, bytes);
    const player = await setup();
    const decoded = await player.page.evaluate(async ({ bytes, mime, withAudio }) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      const video = document.querySelector('video'); video.src = URL.createObjectURL(blob); video.muted = true;
      await new Promise((ok,no) => { video.onloadeddata=ok; video.onerror=() => no(new Error('Downloaded file cannot be decoded')); });
      await video.play();
      const captured = video.captureStream();
      const audioTracks = captured.getAudioTracks().length;
      video.pause();
      const samples = [];
      for (const seconds of [.15, .55]) {
        await new Promise(ok => { video.onseeked=ok; video.currentTime=seconds; });
        if (video.requestVideoFrameCallback) await new Promise(ok => { video.requestVideoFrameCallback(ok); setTimeout(ok, 500); });
        const canvas = document.createElement('canvas'); canvas.width=canvas.height=1;
        const ctx=canvas.getContext('2d'); ctx.drawImage(video,0,0,1,1); samples.push([...ctx.getImageData(0,0,1,1).data]);
      }
      let waveform = null;
      if (withAudio) {
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        const channel = buffer.getChannelData(0);
        waveform = { channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, seconds: buffer.duration, rms: Math.sqrt(channel.reduce((sum,v) => sum+v*v,0)/channel.length) };
        await ctx.close();
      }
      video.currentTime=0; await video.play();
      await new Promise((ok,no) => { video.onended=ok; video.onerror=() => no(new Error('Playback failed')); setTimeout(() => no(new Error('Playback did not finish')),5000); });
      captured.getTracks().forEach(t=>t.stop());
      return { width: video.videoWidth, height: video.videoHeight, audioTracks, samples, waveform, ended: video.ended, finalTime: video.currentTime, mediaCalls: globalThis.__mediaCalls || 0 };
    }, { bytes: generated.bytes, mime: generated.mimeType, withAudio });
    result.files.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mimeType: generated.mimeType, withAudio, decoded });
    assert.equal(decoded.audioTracks, withAudio ? 1 : 0);
    assert.ok(decoded.samples[0][0] > decoded.samples[0][1] + 80, 'first frame is red');
    assert.ok(decoded.samples[1][1] > decoded.samples[1][0] + 80, 'second frame is green');
    if (withAudio) assert.ok(decoded.waveform.rms > .05 && decoded.waveform.seconds >= .7, 'encoded tone has measurable energy and full duration');
    assert.equal(decoded.ended, true); assert.equal(decoded.mediaCalls, 0);
    await player.page.screenshot({ path: file + '.png' });
    await player.context.close();
  }
  result.cameraMicrophoneCalls = await producer.page.evaluate(() => globalThis.__mediaCalls || 0);
  assert.equal(result.cameraMicrophoneCalls,0); assert.deepEqual(result.pageErrors,[]); assert.deepEqual(result.externalRequests,[]);
  result.pass=true;
  console.log(JSON.stringify(result,null,2));
} catch (e) { result.pass=false; result.error=e.stack; throw e; }
finally { await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)); await browser?.close(); await new Promise(ok=>server.close(ok)); }
