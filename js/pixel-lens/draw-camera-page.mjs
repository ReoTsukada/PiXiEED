import { readDrawCameraRequest, completeDrawCamera, drawCameraCancelUrl } from '../creation/draw-camera-handoff.mjs';
import { prepareCameraTarget, cameraPixels, replaceCameraPixels } from '../creation/draw-camera-core.mjs';
import { createDrawAnimationSession } from '../creation/draw-animation-session.mjs?rev=20261007-draw-handoff-1';
import { getAnimationCelDocument } from '../creation/animation-core.mjs';
import { documentRgba } from '../creation/draw-core.mjs';
import { centerCrop } from '../pixel-studio/framing.mjs';
import { cameraStartErrorMessage } from '../pixel-studio/camera-ui-state.mjs';

const $ = selector => document.querySelector(selector);
const root = $('#pixelStudio'), video = $('#video'), view = $('#view'), frame = $('#captureFrame'), stage = $('#stage');
const capture = $('#capture'), flip = $('#flipCamera'), back = $('.lc-back'), message = $('#stageMsg');
document.body.dataset.drawCamera = 'true'; root.dataset.drawCameraHandoff = 'true'; root.dataset.ready = 'true';
const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/draw-camera-page.css?rev=20261007-draw-handoff-1'; document.head.append(css);
for (const node of document.querySelectorAll('#cameraSettingsPanel, #cameraChooseImage, #cameraImageInput, #welcome, #resultControls, #regionMergePanel, #zoomHud, #gestureHint, #focusMarker, #gifRec')) {
  node.hidden = true; node.inert = true;
  for (const input of node.matches('button,input,select') ? [node] : node.querySelectorAll('button,input,select')) input.disabled = true;
}
// Navigation keeps its geometry, but a capture must return through this request.
for (const node of document.querySelectorAll('.app-tabs a')) { node.inert = true; node.setAttribute('aria-disabled', 'true'); node.tabIndex = -1; }
stage.setAttribute('aria-label', '簡単ドットの撮影プレビュー。撮影対象以外の絵は保持します。');
capture.setAttribute('aria-label', '撮影して簡単ドットへ戻る'); capture.title = '撮影して簡単ドットへ戻る';
capture.removeAttribute('aria-description'); capture.disabled = true;
try { back.href = drawCameraCancelUrl(location.search); } catch { back.href = '/draw/'; }
back.setAttribute('aria-label', '撮影を取消して簡単ドットへ戻る');
const request = readDrawCameraRequest({ search: location.search });
let closed = false, generation = 0, stream = null, raf = 0, facing = 'environment', latest = null, busy = false, lastSample = -Infinity, watchdog = 0;
const events = new AbortController(), trackEvents = new WeakMap();
const say = text => { message.textContent = text; message.hidden = !text; message.classList.remove('pc-sr-only'); $('#info').textContent = text; };
const setMode = mode => { root.dataset.mode = mode; stage.setAttribute('aria-busy', String(mode === 'loading')); $('#cameraStatus').textContent = mode === 'live' ? 'プレビュー' : mode === 'loading' ? '準備中' : '停止中'; };
function stopOne(owned) { if (!owned) return; trackEvents.get(owned)?.abort(); for (const track of owned.getTracks()) track.stop(); if (video.srcObject === owned) video.srcObject = null; if (stream === owned) stream = null; }
function stop() { generation++; clearTimeout(watchdog); watchdog = 0; if (raf) cancelAnimationFrame(raf); raf = 0; stopOne(stream); latest = null; capture.disabled = true; flip.disabled = true; }
function suspend(text = 'カメラを停止しました。中央のボタンで再開できます。') { if (closed) return; stop(); setMode('idle'); capture.disabled = false; capture.setAttribute('aria-label', 'カメラを再開'); capture.title = 'カメラを再開'; say(text); }
function leave(url) { if (closed) return; closed = true; stop(); events.abort(); location.replace(url); }
back.addEventListener('click', event => { event.preventDefault(); leave(back.href); }, { signal: events.signal });
window.addEventListener('pagehide', () => { closed = true; stop(); }, { signal: events.signal });
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend('カメラを一時停止しました。中央のボタンで再開できます。'); }, { signal: events.signal });
window.addEventListener('pageshow', event => { if (event.persisted && request) { closed = false; suspend(); } }, { signal: events.signal });
window.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); leave(back.href); } else if (event.code === 'Space' && !event.repeat && event.target === document.body) { event.preventDefault(); capture.click(); } }, { signal: events.signal });

if (!request) {
  setMode('idle'); say('受け渡しを確認できません。簡単ドットへ戻ってカメラを開き直してください。');
} else {
  const original = getAnimationCelDocument(request.animation, request.frameId, request.layerId);
  const target = prepareCameraTarget(original, request.mask, request.allowedIndices);
  const session = createDrawAnimationSession(original); session.load(request.animation, { frameId: request.frameId, layerId: request.layerId });
  const sample = document.createElement('canvas'); sample.width = target.bounds.width; sample.height = target.bounds.height;
  root.dataset.sampleWidth = String(sample.width); root.dataset.sampleHeight = String(sample.height);
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true }), ctx = view.getContext('2d');
  view.width = original.width; view.height = original.height;
  function paint(doc) { ctx.putImageData(new ImageData(new Uint8ClampedArray(documentRgba({ ...doc, pixels: Array.from(doc.pixels) })), doc.width, doc.height), 0, 0); }
  function fit() {
    const top = $('.lc-top').getBoundingClientRect(), nav = $('.app-tabs').getBoundingClientRect();
    stage.style.paddingTop = `${Math.max(72, top.bottom + 12)}px`;
    stage.style.paddingBottom = `${Math.max(0, innerHeight - nav.top) + 20}px`;
    const r = stage.getBoundingClientRect(), style = getComputedStyle(stage);
    const w = Math.max(1, r.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const h = Math.max(1, r.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    const scale = Math.min(w / original.width, h / original.height);
    frame.style.width = `${original.width * scale}px`; frame.style.height = `${original.height * scale}px`;
  }
  let fitFrame = 0;
  const queueFit = () => { if (!fitFrame) fitFrame = requestAnimationFrame(() => { fitFrame = 0; if (!closed) fit(); }); };
  paint(session.composite(original)); fit(); window.addEventListener('resize', queueFit, { signal: events.signal });
  // Measure chrome on the next frame; modifying a stage observed by this callback
  // would make WebKit deliver a ResizeObserver loop error.
  const resize = new ResizeObserver(queueFit); for (const node of [$('.lc-top'), $('.app-tabs')]) resize.observe(node);
  window.addEventListener('pagehide', () => { resize.disconnect(); if (fitFrame) cancelAnimationFrame(fitFrame); fitFrame = 0; }, { once: true });
  function render(time) {
    if (closed || !stream) return;
    if (video.readyState >= 2 && time - lastSample >= 1000 / 12) {
      lastSample = time;
      try {
        const crop = centerCrop(video.videoWidth, video.videoHeight, sample.width / sample.height);
        sampleCtx.save();
        if (facing === 'user') { sampleCtx.translate(sample.width, 0); sampleCtx.scale(-1, 1); }
        sampleCtx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, sample.width, sample.height); sampleCtx.restore();
        const local = cameraPixels(sampleCtx.getImageData(0, 0, sample.width, sample.height).data, target.palette, target.allowedIndices);
        const indices = Int16Array.from(target.cells, cell => local[(Math.floor(cell / target.width) - target.bounds.y) * sample.width + cell % target.width - target.bounds.x]);
        paint(session.composite(replaceCameraPixels(original, target, indices)));
        latest = indices; clearTimeout(watchdog); watchdog = 0;
        setMode('live'); capture.disabled = false; flip.disabled = false;
        capture.setAttribute('aria-label', '撮影して簡単ドットへ戻る'); capture.title = '撮影して簡単ドットへ戻る'; say('');
      } catch { suspend('映像を表示できませんでした。中央のボタンで再試行できます。'); return; }
    }
    raf = requestAnimationFrame(render);
  }
  async function start(nextFacing = facing) {
    if (closed || busy) return;
    stop(); const token = generation; setMode('loading'); say('カメラを準備しています…');
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) { suspend('この端末はカメラに対応していません。簡単ドットへ戻ると元の絵を続けられます。'); return; }
    // Bound readiness even when a device never resolves or never supplies a frame.
    watchdog = setTimeout(() => { if (!closed && token === generation) suspend('カメラの映像を取得できませんでした。中央のボタンで再試行できます。'); }, 15000);
    try {
      const next = await media.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing } } });
      if (closed || token !== generation) { stopOne(next); return; }
      stream = next; video.srcObject = next; facing = next.getVideoTracks()[0]?.getSettings?.().facingMode || nextFacing;
      root.dataset.facing = facing;
      const ownerEvents = new AbortController(); trackEvents.set(next, ownerEvents);
      for (const track of next.getTracks()) track.addEventListener('ended', () => suspend(), { once: true, signal: ownerEvents.signal });
      await video.play();
      if (closed || token !== generation) { stopOne(next); return; }
      lastSample = -Infinity; raf = requestAnimationFrame(render);
    } catch (error) { if (!closed && token === generation) suspend(cameraStartErrorMessage(error, { secureContext: window.isSecureContext !== false })); }
  }
  capture.addEventListener('click', () => {
    if (closed || busy || capture.disabled) return;
    if (root.dataset.mode === 'idle') { void start(); return; }
    if (!latest) return;
    busy = true; capture.disabled = true;
    try { const url = completeDrawCamera(request, new Int16Array(latest)); leave(url); }
    catch (error) { busy = false; suspend(error.message || '撮影を戻せませんでした。元の絵は保持しています。'); }
  }, { signal: events.signal });
  flip.addEventListener('click', () => { if (!flip.disabled) void start(facing === 'user' ? 'environment' : 'user'); }, { signal: events.signal });
  if (!document.hidden) void start(); else suspend();
}
