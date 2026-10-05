import { initPostUi } from './post-ui.mjs?v=20261005-admin-boundary-1';
import { initMapEvents } from './map-events.mjs?v=20261005-admin-boundary-1';
import { createSupabaseGlobeAuth, createSupabaseGlobeStore } from './post-supabase.mjs?rev=20261004-puzzle-share-1';
import { createGlobeRenderer, decodeRasterData, getSelectionStageLabel, prepareGeoJsonFeatures } from './renderer.mjs?v=20261005-admin-boundary-1';
import { openHandoffComposer, pendingHandoff } from './post-handoff.mjs?v=20261004-camera-location-1';

const telescopeTool = new URLSearchParams(location.search).get('tool') === 'telescope';
// Astronomy belongs to the stand-alone telescope; a map never starts its timers or catalogue.
const astronomy = telescopeTool ? await Promise.all([import('./astro-ui.mjs?v=20261005-admin-boundary-1'), import('./real-sky.mjs?v=20260927-sky-events-v1')]) : null;
const embedMode = new URLSearchParams(location.search).get('embed') === '1';

const canvas = document.querySelector('#globeCanvas');
const globeStage = document.querySelector('#globeStage');
const loadStatus = document.querySelector('#loadStatus');
const selectionPanel = document.querySelector('#selectionPanel');
const selectedOwner = document.querySelector('#selectedOwner');
const selectedStage = document.querySelector('#selectedStage');
const placeHere = document.querySelector('#placeHere');
const viewCellPosts = document.querySelector('#viewCellPosts');
const zoomToCell = document.querySelector('#zoomToCell');
const clearCellSelection = document.querySelector('#clearCellSelection');
const selectedPostCount = document.querySelector('#selectedPostCount');
const cellTooltip = document.querySelector('#cellTooltip');
let currentHover = null;
const accountSlot = document.querySelector('#accountSlot');
const primaryAction = document.querySelector('#globePrimaryAction');
const viewSwitch = document.querySelector('#mapLayerSwitch');
let eventUi = null;
let mapContentLayer = 'posts';
let postUi = null;
let currentSelection = null;

const MAP_CELLS_URL = 'assets/maps/globe-land-mask-v1.json?v=20260921-grid11-1';
const MAP_ADMIN1_URL = 'assets/maps/map-admin1-v1.json?v=20261005-admin-boundary-1';
const MAP_PREFECTURES_URL = 'assets/maps/map-prefectures-v1.json?v=20261005-admin-boundary-1';
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
  const isMap = renderer?.getSnapshot()?.camera?.projection === 'mercator';
  selectedStage.textContent = isMap ? (selection.mapRegionKind === 'admin1' ? '選択中の州・地域' : selection.prefectureId ? '選択中の都道府県' : selection.mapRegionId ? '選択中の国' : '選択中のセル') : getSelectionStageLabel(selection.lodLevel);
  selectedOwner.textContent = cellLocationLabel(selection);
  const events = mapContentLayer === 'events';
  const summary = contentSummary(selection);
  selectedPostCount.textContent = String(events ? summary.count : summary);
  document.querySelector('#selectedContentKind').textContent = events ? 'イベント ' : '投稿 ';
  viewCellPosts.setAttribute('aria-label', `${selectedOwner.textContent}${events ? 'のイベント' : selection.mapRegionId || selection.prefectureId ? 'の投稿' : '付近の投稿'}を見る`);
  placeHere.setAttribute('aria-label', `${selectedOwner.textContent}に作品を置く`);
}

function cellLocationLabel(selection) {
  const record = selection?.displayCell || selection;
  const country = record?.countryLabel || selection?.countryLabel || selection?.countryId;
  const prefecture = record?.prefectureLabel || selection?.prefectureLabel;
  if (prefecture) return prefecture;
  const region = record?.mapRegionLabel || selection?.mapRegionLabel;
  const kind = record?.mapRegionKind || selection?.mapRegionKind;
  return [country === 'Japan' || country === 'JPN' ? '日本' : country, kind === 'country' ? null : region].filter(Boolean).join(' · ') || selection?.ownerLabel || '土地セル';
}
function showCellHover(selection) {
  currentHover = selection;
  cellTooltip.hidden = !selection;
  if (!selection) { canvas.removeAttribute('aria-describedby'); return; }
  canvas.setAttribute('aria-describedby', 'cellTooltip');
  cellTooltip.querySelector('[data-cell-name]').textContent = cellLocationLabel(selection);
  const summary = contentSummary(selection);
  const record = selection.displayCell || selection;
  const scopeLabel = record.prefectureId || selection.prefectureId ? '県内' : record.mapRegionId || selection.mapRegionId ? '地域内' : '付近';
  const eventLabel = `${scopeLabel}のイベント`;
  const countText = mapContentLayer === 'events'
    ? `${eventLabel} ${summary.count}件（今後・開催中 ${summary.future}／過去 ${summary.past}）`
    : `${scopeLabel}の投稿 ${summary}件`;
  cellTooltip.querySelector('[data-cell-posts]').textContent = `${countText} · クリックで選択`;
  const viewport = renderer.getSnapshot().camera.viewport;
  const tooltipWidth = cellTooltip.offsetWidth || 220;
  const tooltipHeight = cellTooltip.offsetHeight || 64;
  const x = Math.max(8, Math.min(viewport.width - tooltipWidth - 8, selection.x + 18));
  const y = Math.max(8, Math.min(viewport.height - tooltipHeight - 8, selection.y + 18));
  cellTooltip.style.transform = `translate(${x}px, ${y}px)`;
}

let renderer;
let previousViewKey = '';
let skyStarted = false;
let paintRealSky = () => {};
function createPrototypeRenderer(options = {}) {
  renderer = createGlobeRenderer(canvas, {
    projection: new URLSearchParams(location.search).get('tool') === 'telescope' ? 'orthographic' : 'mercator',
    backgroundElement: globeStage,
    skyCanvas: document.querySelector('#skyCanvas'),
    spaceTexture: globeStage?.dataset.spaceTexture || '',
    ...options,
    onPick(selection) {
      // While the composer is open a tap moves the draft pin instead of drilling down.
      if (postUi?.handlePick(selection)) { showSelection(null); return; }
      showCellHover(null);
      showSelection(selection);
      if (selection && renderer.getSnapshot().camera.projection !== 'mercator') renderer.focusSelection(selection);
    },
    onHover: showCellHover,
    onLongPress: telescopeTool ? function (spot) {
      // Holding a spot on the globe looks at the sky from there.
      if (postUi?.getState?.().sheet === 'composer') return;
      navigator.vibrate?.(8);
      globalThis.__PIXIEED_ASTRO__?.openScope({ latitude: spot.latitude, longitude: spot.longitude });
    } : undefined,
    onZoomLimit: telescopeTool ? info => globalThis.__PIXIEED_ASTRO__?.zoomLimit?.(info) : undefined,
    onStateChange({ view, camera }) {
      const key = [camera.projection, camera.viewport.width, camera.viewport.height, view.centerLongitude, view.centerLatitude, view.zoom].join(':');
      if (key === previousViewKey) return;
      previousViewKey = key;
      globalThis.__PIXIEED_ASTRO__?.rememberGlobeView?.(view);
      if (camera.projection !== 'mercator') globalThis.__PIXIEED_ASTRO__?.refreshView?.();
      postUi?.refresh();
      eventUi?.refresh();
      if (camera.projection !== 'mercator' && globeStage) globeStage.style.setProperty('--space-offset', `${50 + (view.centerLongitude / 360) * 8}% 50%`);
    }
  });
  globalThis.__PIXIEED_GLOBE__ = renderer;
  // Load the catalogue only when an observation view first opens.
  paintRealSky = () => {
    if (skyStarted) return;
    skyStarted = true;
    if (!astronomy) return;
    const { sharedSky, sharedFaintSky, SPRITE_MAGNITUDE } = astronomy[1];
    sharedSky().then(async ({ sky, canvas }) => {
      const sprites = renderer.setStars?.(sky, { maxMagnitude: SPRITE_MAGNITUDE }) || 0;
      renderer.setSkyImage?.(sprites ? (await sharedFaintSky()).canvas : canvas);
    }).catch((error) => { skyStarted = false; console.warn('Real sky unavailable', error); });
  };
  if (new URLSearchParams(location.search).get('tool') === 'telescope') paintRealSky();
  if (astronomy && !globalThis.__PIXIEED_ASTRO__) {
    try { astronomy[0].initAstroUi({ renderer, stage: globeStage, initiallyCollapsed: true }); } catch (error) { console.warn('Astronomy panel unavailable', error); }
  }
  try {
    postUi = initPostUi({ renderer, stage: globeStage, accountSlot: embedMode ? null : accountSlot, store: createSupabaseGlobeStore(), auth: createSupabaseGlobeAuth(), showMapPins: telescopeTool });
    globalThis.__PIXIEED_POSTS__ = postUi;
    adoptPostHandoff();
  } catch (error) { console.warn('Posting UI unavailable', error); }
  if (!telescopeTool) {
    eventUi = initMapEvents({ renderer, stage: globeStage, onChange: updateMapContent, onOpen: () => { postUi?.close(); showCellHover(null); } });
    globalThis.__PIXIEED_MAP_EVENTS__ = eventUi;
    updateMapContent();
    setMapContentLayer('posts');
  }
  syncObservationViews();
  return renderer;
}

// A valid, source-matched local handoff opens the composer without submitting it.
function adoptPostHandoff() {
  const handoff = pendingHandoff(); if (!handoff) return;
  try {
    openHandoffComposer(handoff, postUi);
  } catch (error) { console.warn('Image handoff failed', error); }
}

clearCellSelection?.addEventListener('click', () => { renderer?.clearSelection?.(); canvas.focus({ preventScroll: true }); });
viewCellPosts?.addEventListener('click', () => { if (currentSelection) { if (mapContentLayer === 'events') eventUi?.openCellEvents(currentSelection); else postUi?.openCellGallery?.(currentSelection); } });
zoomToCell?.addEventListener('click', () => {
  if (!currentSelection) return;
  const view = renderer.getSnapshot().view;
  renderer.flyTo({ centerLongitude: currentSelection.center.longitude, centerLatitude: currentSelection.center.latitude, zoom: Math.min(view.zoomRange.max, Math.max(6, view.zoom * 2)) }, { duration: 240 });
});
globeStage?.addEventListener('pixieed:map-postsopen', () => {
  if (!telescopeTool && mapContentLayer !== 'posts') { eventUi?.close(); setMapContentLayer('posts'); }
});
globeStage?.addEventListener('pixieed:map-postschange', () => {
  updateMapContent();
});

placeHere.addEventListener('click', () => {
  if (currentSelection && postUi) { setMapContentLayer('posts'); postUi.openComposer({ selection: currentSelection }); }
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
function contentSummary(selection) {
  if (mapContentLayer === 'events') return eventUi?.getCellSummary?.(selection) || { count: 0, future: 0, past: 0 };
  return postUi?.getCellSummary?.(selection)?.count || 0;
}
function updateMapContent() {
  if (!renderer || telescopeTool) return;
  renderer.setMapContent?.({ posts: (postUi?.getPosts?.() || []).map(post => post.pin), events: eventUi?.getDensityEvents?.() || [] });
  renderer.setMapEventPeriod?.(eventUi?.getPeriodFilter?.() || 'future');
  if (currentSelection) showSelection(currentSelection);
  if (currentHover) showCellHover(currentHover);
}
function setMapContentLayer(layer) {
  mapContentLayer = layer === 'events' ? 'events' : 'posts';
  renderer?.setMapContentLayer?.(mapContentLayer);
  globeStage.classList.toggle('is-events-layer', mapContentLayer === 'events');
  postUi?.setMapVisible?.(mapContentLayer === 'posts');
  eventUi?.setActive(mapContentLayer === 'events');
  for (const button of viewSwitch?.querySelectorAll('[data-map-content]') || []) button.setAttribute('aria-pressed', String(button.dataset.mapContent === mapContentLayer));
  if (currentSelection) showSelection(currentSelection);
  if (currentHover) showCellHover(currentHover);
}
function syncObservationViews() {
  if (viewSwitch) viewSwitch.hidden = telescopeTool;
  if (telescopeTool && (globeStage.classList.contains('is-orrery') || globeStage.classList.contains('is-scope'))) paintRealSky();
}
viewSwitch?.addEventListener('click', event => {
  const button = event.target.closest('[data-map-content]');
  if (!button || button.getAttribute('aria-pressed') === 'true') return;
  postUi?.close(); eventUi?.close();
  setMapContentLayer(button.dataset.mapContent);
});
primaryAction?.addEventListener('click', () => {
  if (document.documentElement.classList.contains('is-tool-telescope')) globalThis.__PIXIEED_ASTRO__?.toggleTelescopeSolarSystem();
  else {
    setMapContentLayer('posts');
    postUi?.openComposer({ selection: currentSelection });
  }
});
globeStage?.addEventListener('pixieed:astro-viewchange', syncPrimaryAction);
globeStage?.addEventListener('pixieed:astro-viewchange', syncObservationViews);

// /telescope/ opens the shared sky simulation as a stand-alone tool.
function openToolFromUrl() {
  if (new URLSearchParams(location.search).get('tool') !== 'telescope') return;
  document.documentElement.classList.add('is-tool-telescope');
  document.title = '望遠鏡｜PiXiEED';
  syncPrimaryAction();
  syncObservationViews();
  const leave = () => { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) history.back(); else location.href = '/tools/'; };
  const open = () => globalThis.__PIXIEED_ASTRO__?.openTelescopeTool({ onClose: leave });
  if (globalThis.__PIXIEED_ASTRO__) open(); else requestAnimationFrame(open);
}

// The globe has no zoom/rotate buttons. A one-time hint names the gestures and
// leaves as soon as the globe is touched.
const GESTURE_HINT_KEY = 'PiXiEED:map-gesture-hint:v2';
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
  // Fine map pixels stay in typed arrays; picking preserves canonical posting IDs.
  const telescope = new URLSearchParams(location.search).get('tool') === 'telescope';
  const preloaded = telescope ? globalThis.__PIXIEED_GLOBE_RASTER__ : globalThis.__PIXIEED_MAP_CELLS__;
  const url = telescope ? RASTER_URL : MAP_CELLS_URL;
  const [source, mapPrefectureData, mapAdmin1Data] = await Promise.all([
    preloaded ? preloaded.catch(() => readJson(url)) : readJson(url),
    telescope ? null : (globalThis.__PIXIEED_MAP_PREFECTURES__ || readJson(MAP_PREFECTURES_URL)),
    telescope ? null : (globalThis.__PIXIEED_MAP_ADMIN1__ || readJson(MAP_ADMIN1_URL)).catch(error => { console.warn('Administrative regions unavailable; using countries.', error); return null; })
  ]);
  createPrototypeRenderer(telescope ? { rasterData: decodeRasterData(source) } : { mapCellData: source, mapPrefectureData, mapAdmin1Data });
  loadStatus.textContent = '';
  openToolFromUrl();
  performance.mark?.('globe-ready');
  console.info(`[globe] ready in ${Math.round(performance.now())}ms (${preloaded ? 'preloaded' : 'late'} map)`);
} catch (rasterError) {
  // A missing/invalid generated asset is an explicit Canvas fallback. The
  // GeoJSON path remains available for recovery and never affects WebGL startup.
  console.warn('Generated map cells unavailable; using Canvas fallback.', rasterError);
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
