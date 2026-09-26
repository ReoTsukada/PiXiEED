import { initAstroUi } from './astro-ui.mjs?v=20260926-hud-v1';
import { initPostUi } from './post-ui.mjs?v=20260921-tool-shell-v1';
import { createSupabaseGlobeAuth, createSupabaseGlobeStore } from './post-supabase.mjs?v=20260921-globe-post-v1';
import { createGlobeRenderer, decodeRasterData, getSelectionStageLabel, prepareGeoJsonFeatures } from './renderer.mjs?v=20260926-hud-v1';

const embedMode = new URLSearchParams(location.search).get('embed') === '1';

const canvas = document.querySelector('#globeCanvas');
const globeStage = document.querySelector('#globeStage');
const loadStatus = document.querySelector('#loadStatus');
const selectionPanel = document.querySelector('#selectionPanel');
const selectedOwner = document.querySelector('#selectedOwner');
const selectedStage = document.querySelector('#selectedStage');
const placeHere = document.querySelector('#placeHere');
const accountSlot = document.querySelector('#accountSlot');
let postUi = null;
let currentSelection = null;

const RASTER_URL = 'assets/maps/globe-land-mask-v1.json?v=20260921-grid11-1';

function readJson(path) {
  return fetch(path, { cache: 'force-cache' }).then((response) => {
    if (!response.ok) throw new Error(`${path} (${response.status})`);
    return response.json();
  });
}

function showSelection(selection) {
  currentSelection = selection;
  selectionPanel.hidden = !selection;
  if (!selection) return;
  selectedStage.textContent = getSelectionStageLabel(selection.lodLevel);
  selectedOwner.textContent = selection.ownerLabel || selection.countryId || '土地セル';
}

let renderer;
function createPrototypeRenderer(options = {}) {
  renderer = createGlobeRenderer(canvas, {
    backgroundElement: globeStage,
    spaceTexture: globeStage?.dataset.spaceTexture || '',
    ...options,
    onPick(selection) {
      // While the composer is open a tap moves the draft pin instead of drilling down.
      if (postUi?.handlePick(selection)) { showSelection(null); return; }
      showSelection(selection);
      if (selection) renderer.focusSelection(selection);
    },
    onLongPress(spot) {
      // Holding a spot on the globe looks at the sky from there.
      if (postUi?.getState?.().sheet === 'composer') return;
      navigator.vibrate?.(8);
      globalThis.__PIXIEED_ASTRO__?.openScope({ latitude: spot.latitude, longitude: spot.longitude });
    },
    onStateChange({ view }) {
      globalThis.__PIXIEED_ASTRO__?.refreshView?.();
      postUi?.refresh();
      if (globeStage) globeStage.style.setProperty('--space-offset', `${50 + (view.centerLongitude / 360) * 8}% 50%`);
    }
  });
  globalThis.__PIXIEED_GLOBE__ = renderer;
  if (!globalThis.__PIXIEED_ASTRO__) {
    try { initAstroUi({ renderer, stage: globeStage, initiallyCollapsed: true }); } catch (error) { console.warn('Astronomy panel unavailable', error); }
  }
  try {
    postUi = initPostUi({ renderer, stage: globeStage, accountSlot: embedMode ? null : accountSlot, store: createSupabaseGlobeStore(), auth: createSupabaseGlobeAuth() });
    globalThis.__PIXIEED_POSTS__ = postUi;
    adoptCameraHandoff();
  } catch (error) { console.warn('Posting UI unavailable', error); }
  return renderer;
}

// A picture sent over from the pixel camera opens the composer with the image already in place.
function adoptCameraHandoff() {
  const key = 'PiXiEED:camera-handoff:v1';
  try {
    const raw = localStorage.getItem(key); if (!raw) return;
    localStorage.removeItem(key);
    const { dataUrl } = JSON.parse(raw);
    fetch(dataUrl).then((response) => response.blob()).then((blob) => {
      postUi.openComposer({ file: new File([blob], 'pixel-camera.png', { type: 'image/png' }) });
      history.replaceState(null, '', location.pathname);
    });
  } catch (error) { console.warn('Camera handoff failed', error); }
}

placeHere.addEventListener('click', () => {
  if (currentSelection && postUi) postUi.openComposer({ selection: currentSelection });
});

// The globe has no zoom/rotate buttons. A one-time hint names the gestures and
// leaves as soon as the globe is touched.
const GESTURE_HINT_KEY = 'PiXiEED:globe-gesture-hint:v1';
const gestureHint = document.querySelector('#gestureHint');
function dismissGestureHint() {
  if (!gestureHint || gestureHint.hidden) return;
  gestureHint.classList.add('is-leaving');
  setTimeout(() => { gestureHint.hidden = true; }, 260);
  try { localStorage.setItem(GESTURE_HINT_KEY, '1'); } catch { /* private mode */ }
}
// A mouse zooms with the wheel rather than a pinch.
if (gestureHint && globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches) gestureHint.children[1].textContent = 'ホイールで拡大・縮小';
try { if (gestureHint && !localStorage.getItem(GESTURE_HINT_KEY)) gestureHint.hidden = false; } catch { if (gestureHint) gestureHint.hidden = false; }
canvas.addEventListener('pointerdown', dismissGestureHint, { once: true });
canvas.addEventListener('wheel', dismissGestureHint, { once: true, passive: true });

try {
  // The HTML head starts this request in parallel with the module graph, so the
  // 660KB raster no longer waits behind four levels of module fetches.
  const preloaded = globalThis.__PIXIEED_GLOBE_RASTER__;
  const source = preloaded ? await preloaded.catch(() => readJson(RASTER_URL)) : await readJson(RASTER_URL);
  const raster = decodeRasterData(source);
  createPrototypeRenderer({ rasterData: raster });
  loadStatus.textContent = '';
  performance.mark?.('globe-ready');
  console.info(`[globe] ready in ${Math.round(performance.now())}ms (${preloaded ? 'preloaded' : 'late'} raster)`);
} catch (rasterError) {
  // A missing/invalid generated asset is an explicit Canvas fallback. The
  // GeoJSON path remains available for recovery and never affects WebGL startup.
  console.warn('Generated globe raster unavailable; using Canvas fallback.', rasterError);
  createPrototypeRenderer({ forceCanvas: true });
  try {
    const [world, prefectures] = await Promise.all([
      readJson('assets/maps/world-countries-110m.geojson'),
      readJson('assets/maps/japan-prefectures.geojson')
    ]);
    renderer.setData({
      worldFeatures: prepareGeoJsonFeatures(world, { idProperty: 'ADM0_A3' }),
      prefectureFeatures: prepareGeoJsonFeatures(prefectures, { idProperty: 'code' })
    });
    loadStatus.textContent = '';
  } catch (error) {
    loadStatus.textContent = '地図データを読み込めませんでした';
    console.error(error);
  }
}
