import { trackSiteEvent } from './site-analytics.mjs';

// Reuse the existing consent boundary and event vocabulary. No event IDs,
// external URLs, new consent settings, or new key events are sent.
document.addEventListener('click', event => {
  if (!event.isTrusted || event.defaultPrevented || event.button !== 0) return;
  const link = event.target.closest?.('a');
  const kind = link?.dataset.eventInfoLink;
  if (['official', 'ticket', 'related', 'social'].includes(kind)) {
    trackSiteEvent('event_outbound', { link_kind: kind });
  } else if (link?.dataset.eventIntroduction !== undefined) {
    trackSiteEvent('select_content', { content_type: 'event' });
  }
});
