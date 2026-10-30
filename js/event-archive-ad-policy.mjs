const eligibleStatuses = new Set(['near', 'all']);

/** Show archive ads only while a broad, sufficiently populated event list is visible. */
export function shouldShowEventArchiveAd({
  status = '', query = '', format = 'all', region = 'all',
  visibleEventCount = 0, minimumVisibleEvents = 0,
} = {}) {
  const visible = Number(visibleEventCount);
  const minimum = Number(minimumVisibleEvents);
  return eligibleStatuses.has(status)
    && String(query).trim() === ''
    && format === 'all'
    && region === 'all'
    && Number.isInteger(visible)
    && Number.isInteger(minimum)
    && minimum > 0
    && visible >= minimum;
}
