import { initAstroUi } from './astro-ui.mjs?v=20260928-sky-labels-1';
import { initPostUi } from './post-ui.mjs?v=20260928-puzzle-handoff-1';
import { sharedSky, sharedFaintSky, SPRITE_MAGNITUDE } from './real-sky.mjs?v=20260927-sky-events-v1';
import { createSupabaseGlobeAuth, createSupabaseGlobeStore } from './post-supabase.mjs?v=20260928-puzzle-handoff-1';
import { createGlobeRenderer, decodeRasterData, getSelectionStageLabel, prepareGeoJsonFeatures } from './renderer.mjs?v=20260927-solar-tool-2';
import { openHandoffComposer, pendingHandoff } from './post-handoff.mjs?v=20260928-puzzle-handoff-1';

const embedMode = new URLSearchParams(location.search).get('embed') === '1';

const canvas = document.querySelector('#globeCanvas');
const globeStage = document.querySelector('#globeStage');
const loadStatus = document.querySelector('#loadStatus');
const selectionPanel = document.querySelector('#selectionPanel');
const selectedOwner = document.querySelector('#selectedOwner');
const selectedStage = document.querySelector('#selectedStage');
const placeHere = document.querySelector('#placeHere');
const accountSlot = document.querySelector('#accountSlot');
const primaryAction = document.querySelector('#globePrimaryAction');
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
  globeStage?.classList.toggle('has-selection', Boolean(selection));
  if (!selection) return;
  // Keyboard selection can happen while the time drawer is open. Keep its
  // overlay from hiding the newly available placement action.
  globalThis.__PIXIEED_ASTRO__?.setOpen(false);
  selectedStage.textContent = getSelectionStageLabel(selection.lodLevel);
  selectedOwner.textContent = selection.ownerLabel || selection.countryId || '土地セル';
  placeHere.setAttribute('aria-label', `${selectedOwner.textContent}のセルに作品を置く`);
}

let renderer;
function createPrototypeRenderer(options = {}) {
  renderer = createGlobeRenderer(canvas, {
    backgroundElement: globeStage,
    skyCanvas: document.querySelector('#skyCanvas'),
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
    onZoomLimit(info) { globalThis.__PIXIEED_ASTRO__?.zoomLimit?.(info); },
    onStateChange({ view }) {
      globalThis.__PIXIEED_ASTRO__?.refreshView?.();
      postUi?.refresh();
      if (globeStage) globeStage.style.setProperty('--space-offset', `${50 + (view.centerLongitude / 360) * 8}% 50%`);
    }
  });
  globalThis.__PIXIEED_GLOBE__ = renderer;
  // The real night sky replaces the procedural stars once it is painted (after the first frame).
  // Bright stars become sharp sprites on the sky layer; the painted sky then only carries the faint ones.
  const paintRealSky = () => sharedSky().then(async ({ sky, canvas }) => {
    const sprites = renderer.setStars?.(sky, { maxMagnitude: SPRITE_MAGNITUDE }) || 0;
    renderer.setSkyImage?.(sprites ? (await sharedFaintSky()).canvas : canvas);
  }).catch((error) => console.warn('Real sky unavailable', error));
  (typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 60))(paintRealSky);
  if (!globalThis.__PIXIEED_ASTRO__) {
    try { initAstroUi({ renderer, stage: globeStage, initiallyCollapsed: true }); } catch (error) { console.warn('Astronomy panel unavailable', error); }
  }
  try {
    postUi = initPostUi({ renderer, stage: globeStage, accountSlot: embedMode ? null : accountSlot, store: createSupabaseGlobeStore(), auth: createSupabaseGlobeAuth() });
    globalThis.__PIXIEED_POSTS__ = postUi;
    adoptPostHandoff();
  } catch (error) { console.warn('Posting UI unavailable', error); }
  return renderer;
}

// A valid, source-matched local handoff opens the composer without submitting it.
function adoptPostHandoff() {
  const handoff = pendingHandoff(); if (!handoff) return;
  try {
    openHandoffComposer(handoff, postUi);
  } catch (error) { console.warn('Image handoff failed', error); }
}

placeHere.addEventListener('click', () => {
  if (currentSelection && postUi) postUi.openComposer({ selection: currentSelection });
});

function syncPrimaryAction() {
  if (!primaryAction) return;
  const telescopeTool = document.documentElement.classList.contains('is-tool-telescope');
  const inSolarSystem = globeStage.classList.contains('is-orrery');
  const label = telescopeTool ? (inSolarSystem ? '望遠鏡に戻る' : '太陽系を見る') : '作品を投稿する';
  const icon = telescopeTool ? (inSolarSystem ? 'telescope' : 'solar-system') : 'add';
  primaryAction.setAttribute('aria-label', label);
  primaryAction.querySelector('img').src = `/assets/icons/pixieed/${icon}.svg`;
  document.querySelector('[data-globe-nav-map]')?.toggleAttribute('aria-current', !telescopeTool);
  document.querySelector('[data-globe-nav-tools]')?.toggleAttribute('aria-current', telescopeTool);
  if (!telescopeTool) document.querySelector('[data-globe-nav-map]')?.setAttribute('aria-current', 'page');
  else document.querySelector('[data-globe-nav-tools]')?.setAttribute('aria-current', 'page');
}
primaryAction?.addEventListener('click', () => {
  if (document.documentElement.classList.contains('is-tool-telescope')) globalThis.__PIXIEED_ASTRO__?.toggleTelescopeSolarSystem();
  else postUi?.openComposer();
});
globeStage?.addEventListener('pixieed:astro-viewchange', syncPrimaryAction);

// /telescope/ opens the shared sky simulation as a stand-alone tool.
function openToolFromUrl() {
  if (new URLSearchParams(location.search).get('tool') !== 'telescope') return;
  document.documentElement.classList.add('is-tool-telescope');
  document.title = '望遠鏡｜PiXiEED';
  syncPrimaryAction();
  const leave = () => { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) history.back(); else location.href = '/tools/'; };
  const open = () => globalThis.__PIXIEED_ASTRO__?.openTelescopeTool({ onClose: leave });
  if (globalThis.__PIXIEED_ASTRO__) open(); else requestAnimationFrame(open);
}

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
  openToolFromUrl();
  performance.mark?.('globe-ready');
  console.info(`[globe] ready in ${Math.round(performance.now())}ms (${preloaded ? 'preloaded' : 'late'} raster)`);
} catch (rasterError) {
  // A missing/invalid generated asset is an explicit Canvas fallback. The
  // GeoJSON path remains available for recovery and never affects WebGL startup.
  console.warn('Generated globe raster unavailable; using Canvas fallback.', rasterError);
  createPrototypeRenderer({ forceCanvas: true });
  openToolFromUrl();
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
