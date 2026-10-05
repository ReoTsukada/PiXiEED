// Small, verified research overlay. The published/manual catalogue remains the fallback.
export function safeEventSource(value) {
  try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
}
export function readEventCatalog(payload) {
  if (payload?.version !== 1 || !Array.isArray(payload.events) || !Number.isFinite(Date.parse(payload.updatedAt))) throw new TypeError('Invalid event catalog');
  const ids = new Set();
  for (const event of payload.events) {
    if (!event || typeof event.id !== 'string' || !event.id.trim() || ids.has(event.id) || typeof event.name !== 'string' || !event.name.trim() || !safeEventSource(event.sourceUrl) || !Number.isFinite(Date.parse(event.checkedAt))) throw new TypeError('Invalid verified event');
    ids.add(event.id);
    for (const field of ['startDate', 'endDate', 'lastHeldDate']) if (event[field] && !validDate(event[field])) throw new TypeError('Invalid event date');
    if (event.endDate && (!event.startDate || event.endDate < event.startDate)) throw new TypeError('Invalid event interval');
    if (event.status === 'watch' && (event.startDate || event.endDate)) throw new TypeError('Unannounced event has a scheduled date');
  }
  return payload.events;
}
export function mergeEventCatalog(base, researched) {
  const byId = new Map();
  for (const event of [...(Array.isArray(base) ? base : []), ...(Array.isArray(researched) ? researched : [])]) {
    if (!event || typeof event.name !== 'string' || !event.name.trim()) continue;
    const id = String(event.id || event.name);
    const previous = byId.get(id);
    if (previous?.checkedAt && event.checkedAt && Date.parse(previous.checkedAt) > Date.parse(event.checkedAt)) continue;
    byId.set(id, { ...previous, ...event });
  }
  const editions = new Map();
  for (const event of byId.values()) {
    const key = `${event.name.normalize('NFKC').trim().toLowerCase()}:${event.startDate || 'watch'}`;
    const previous = editions.get(key);
    if (!previous || (Date.parse(event.checkedAt) || 0) >= (Date.parse(previous.checkedAt) || 0)) editions.set(key, event);
  }
  return [...editions.values()];
}
