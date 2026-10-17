// Only public discovery UI state, scoped to this browser tab. No artwork or account data.
export const MAP_NAVIGATION_KEY = 'PiXiEED:map-navigation:v1';
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = value => typeof value === 'string' ? value.slice(0, 180) : undefined;

export function sanitizeMapNavigationState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = { layer: value.layer === 'events' ? 'events' : 'posts' };
  const view = value.view;
  if (view && finite(view.centerLongitude, -1e8, 1e8) && finite(view.centerLatitude, -90, 90) && finite(view.zoom, .01, 1e6)) {
    state.view = { centerLongitude: view.centerLongitude, centerLatitude: view.centerLatitude, zoom: view.zoom };
  }
  const events = value.events;
  if (events && typeof events === 'object') {
    state.events = {
      period: ['future', 'past', 'all'].includes(events.period) ? events.period : 'future',
      open: events.open === true,
      limit: finite(events.limit, 20, 2000) ? Math.floor(events.limit) : 20,
      scroll: finite(events.scroll, 0, 1e7) ? events.scroll : 0,
      scope: null
    };
    const scope = events.scope?.displayCell || events.scope;
    if (scope && typeof scope === 'object') {
      const clean = {};
      for (const key of ['prefectureId', 'prefectureLabel', 'mapRegionId', 'mapRegionKind', 'mapRegionLabel', 'countryId', 'countryLabel', 'cellId', 'id']) {
        if (text(scope[key]) !== undefined) clean[key] = text(scope[key]);
      }
      if (clean.prefectureId || clean.mapRegionId || clean.cellId || clean.id) state.events.scope = clean;
    }
  }
  return state;
}

export function readMapNavigationState(storage) {
  try { return sanitizeMapNavigationState(JSON.parse(storage.getItem(MAP_NAVIGATION_KEY))); }
  catch { return null; }
}

export function writeMapNavigationState(storage, value) {
  try { const state = sanitizeMapNavigationState(value); if (state) storage.setItem(MAP_NAVIGATION_KEY, JSON.stringify(state)); }
  catch { /* Discovery remains usable when storage is unavailable. */ }
}
