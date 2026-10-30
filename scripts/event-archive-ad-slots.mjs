const PAGE_PATH = 'events/index.html';
const SECTION_ID = 'event-year-2026';
const DISPLAY_AD_STYLE = '<link rel="stylesheet" href="/css/display-ads.css?rev=20261030-event-inline-ads-1">';
const DISPLAY_AD_MODULE = '<script type="module" src="/js/display-ads.mjs?rev=20261030-event-inline-ads-1"></script>';
const placements = new Map([[24, 24], [48, 48]]);

function renderAdSlot(minimumVisibleEvents) {
  return `\n<li class="event-list-ad" role="presentation" data-event-ad-slot data-event-ad-min-visible="${minimumVisibleEvents}" hidden><aside class="px-display-ad" data-display-ad="info" data-ad-reserve aria-label="広告"><div class="px-display-ad__inner"><span class="px-display-ad__label">広告</span></div></aside></li>`;
}

function skip(html, skipped = true, slots = 0) {
  return { html, added: false, skipped, slots };
}

/** Add content-gated manual units to the long public archive only. */
export function addEventArchiveAdSlots(html, sourcePath = '') {
  if (typeof html !== 'string') throw new TypeError('Page HTML must be a string');
  if (sourcePath !== PAGE_PATH) return skip(html);
  const existingSlots = (html.match(/\bdata-event-ad-slot\b/g) || []).length;
  if (existingSlots) return skip(html, false, existingSlots);
  const pattern = new RegExp(`(<section\\b[^>]*\\bid=["']${SECTION_ID}["'][^>]*>)([\\s\\S]*?)(<\\/section\\s*>)`, 'i');
  const section = html.match(pattern);
  if (!section) return skip(html);

  let cardCount = 0;
  let slots = 0;
  const content = section[2].replace(/<li\b(?=[^>]*\bdata-event-card\b)[^>]*>[\s\S]*?<\/li>/gi, card => {
    cardCount += 1;
    const minimumVisibleEvents = placements.get(cardCount);
    if (!minimumVisibleEvents) return card;
    slots += 1;
    return `${card}${renderAdSlot(minimumVisibleEvents)}`;
  });
  if (!slots || !/<head\b[^>]*>[\s\S]*?<\/head\s*>/i.test(html)
      || !/<body\b[^>]*>[\s\S]*?<\/body\s*>/i.test(html)) return skip(html);

  let output = html.replace(pattern, `${section[1]}${content}${section[3]}`);
  if (!/\bhref=["']\/css\/display-ads\.css(?:\?[^"']*)?["']/i.test(output)) {
    output = output.replace(/<\/head\s*>/i, `${DISPLAY_AD_STYLE}\n</head>`);
  }
  if (!/\bsrc=["']\/js\/display-ads\.mjs(?:\?[^"']*)?["']/i.test(output)) {
    output = output.replace(/<\/body\s*>/i, `${DISPLAY_AD_MODULE}\n</body>`);
  }
  return { html: output, added: output !== html, skipped: false, slots };
}
