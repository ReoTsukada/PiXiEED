import { initMapEvents } from './map-events.mjs?v=20261008-event-filter-1';
import { createEventCalendarSection } from './event-calendar-ui.mjs?rev=20261008-calendar-direct-2';

// Public event fields only: artwork, accounts and project state never cross this bridge.
const publicFields = ['id', 'name', 'title', 'startDate', 'endDate', 'startAt', 'endAt',
  'startDateTime', 'endDateTime', 'timeZone', 'timezone', 'allDay', 'dateLabel', 'status', 'sourceUrl', 'url', 'website', 'detailUrl',
  'description', 'venue', 'area', 'prefecture', 'country', 'sourceLabel', 'checkedAt',
  'ticketUrls', 'additionalUrls', 'socialUrls', 'organizer', 'organizers', 'tags',
  'time', 'timeLabel', 'fee', 'conditions', 'entryInfo', 'location', 'detail', 'date', 'start', 'end', 'tz', 'watch'];

function publicEvent(record) {
  const event = {};
  for (const key of publicFields) {
    const value = record?.[key];
    if (typeof value === 'string' || typeof value === 'boolean') event[key] = value;
    else if (Array.isArray(value)) event[key] = value.filter(item => typeof item === 'string').slice(0, 30);
  }
  return event;
}

/** Extend the existing event UI without changing its catalog or analytics handlers. */
export function initEnhancedMapEvents(options) {
  const ui = initMapEvents(options);
  const stage = options.stage, doc = stage.ownerDocument, win = doc.defaultView;
  const panel = stage.querySelector('.map-events-panel');
  const detail = panel.querySelector('.map-events-panel__detail');
  const embedded = win.parent !== win && new URLSearchParams(win.location.search).get('embed') === '1';
  let selectedId = null, hostReady = false, sentSignature = null, calendar = null, calendarSignature = null;
  let queued = false, destroyed = false;

  function send(event) {
    if (!hostReady) return;
    const signature = JSON.stringify(event);
    if (signature === sentSignature) return;
    sentSignature = signature;
    win.parent.postMessage({ type: 'pixieed:map-event-detail', event }, win.location.origin);
  }
  function sync() {
    if (destroyed) return;
    const showing = !panel.hidden && panel.dataset.view === 'detail' && !detail.hidden;
    const record = showing ? ui.getEvents().find(event => String(event.id) === selectedId) : null;
    if (!record) {
      stage.classList.remove('has-external-event-detail');
      send(null);
      return;
    }
    const event = publicEvent(record);
    if (hostReady) {
      stage.classList.add('has-external-event-detail');
      calendar?.remove();
      send(event);
    } else {
      const signature = JSON.stringify(event);
      if (calendar?.parentNode === detail && calendarSignature === signature) return;
      calendar?.remove();
      try { calendar = createEventCalendarSection({ event, doc }); }
      catch { calendar = null; return; }
      calendarSignature = signature;
      detail.append(calendar);
    }
  }
  function schedule() {
    if (queued || destroyed) return;
    queued = true;
    win.queueMicrotask(() => { queued = false; sync(); });
  }
  function onDetailClick(activation) {
    if (activation.defaultPrevented) return;
    const button = activation.target?.closest?.('.map-event-card__detail');
    const card = button?.closest('[data-event-id]');
    if (!card || !stage.contains(card)) return;
    selectedId = card.dataset.eventId;
    schedule();
  }
  function onMessage(message) {
    if (!embedded || message.origin !== win.location.origin || message.source !== win.parent) return;
    const data = message.data;
    if (data?.type === 'pixieed:map-event-detail-host-ready') {
      stage.dataset.detailLayout = data.layout === 'wide' ? 'wide' : 'compact';
      if (!hostReady) sentSignature = null;
      hostReady = true; schedule();
    } else if (hostReady && data?.type === 'pixieed:map-event-detail-command') {
      if (data.command === 'back' && panel.dataset.view === 'detail') {
        stage.classList.remove('has-external-event-detail');
        panel.querySelector('.map-events-panel__back')?.click();
        win.requestAnimationFrame(() => {
          const card = [...panel.querySelectorAll('[data-event-id]')].find(node => node.dataset.eventId === selectedId);
          card?.querySelector('button')?.focus({ preventScroll: true });
        });
      }
      else if (data.command === 'close') panel.querySelector('.map-events-panel__close')?.click();
    }
  }
  const observer = new win.MutationObserver(schedule);
  observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-view'] });
  stage.addEventListener('click', onDetailClick, true);
  win.addEventListener('message', onMessage);
  if (embedded) win.parent.postMessage({ type: 'pixieed:map-event-detail-ready' }, win.location.origin);
  return {
    ...ui,
    destroy() {
      send(null); destroyed = true; observer.disconnect();
      stage.removeEventListener('click', onDetailClick, true);
      win.removeEventListener('message', onMessage);
      stage.classList.remove('has-external-event-detail'); calendar?.remove();
      ui.destroy();
    }
  };
}
