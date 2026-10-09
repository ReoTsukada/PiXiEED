const DATE_PATTERN = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g;
const TERMINAL_STATUSES = new Set(['watch', 'cancelled', 'canceled', 'postponed']);
export const DEFAULT_EVENT_PERIOD_FILTER = 'future';
export const EVENT_PERIOD_OPTIONS = Object.freeze([
  Object.freeze(['future', '今後・開催中']),
  Object.freeze(['all', 'すべて']),
  Object.freeze(['past', '過去'])
]);

function validDateParts(year, month, day) {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function datesIn(value) {
  if (Array.isArray(value)) return value.flatMap(datesIn);
  if (typeof value !== 'string') return [];
  const matches = [];
  DATE_PATTERN.lastIndex = 0;
  let match;
  while ((match = DATE_PATTERN.exec(value))) {
    const date = validDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) matches.push(date);
  }
  return matches;
}

export function tokyoDate(now = Date.now()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function nextTokyoMidnightDelay(now = Date.now()) {
  const today = tokyoDate(now);
  const next = new Date(`${today}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000;
  return Math.max(1, next - Number(now));
}

export function eventDates(event = {}) {
  const directStart = datesIn(event.startDate)[0] || datesIn(event.date)[0];
  const directEnd = datesIn(event.endDate).at(-1);
  const generic = datesIn(event.dates);
  const status = String(event.status || '').trim().toLowerCase();
  const label = event.watch || TERMINAL_STATUSES.has(status) ? [] : datesIn(event.dateLabel);
  const start = directStart || generic[0] || label[0] || null;
  const end = directEnd || generic.at(-1) || label.at(-1) || start;
  if (!start || !end || end < start) return null;
  return Object.freeze({ start, end });
}

export function classifyEvent(event, today = tokyoDate(), now = Date.now()) {
  const status = String(event?.status || '').trim().toLowerCase();
  if (event?.watch || TERMINAL_STATUSES.has(status)) return status === 'postponed' ? 'postponed' : status === 'cancelled' || status === 'canceled' ? 'cancelled' : 'watch';
  const interval = eventDates(event);
  if (!interval) return 'unknown';
  const deadline = Date.parse(event?.deadlineAt || '');
  if (Number.isFinite(deadline) && Number.isFinite(Number(now)) && Number(now) >= deadline) return 'past';
  if (today < interval.start) return 'upcoming';
  if (today > interval.end) return 'past';
  return 'active';
}

function normalizedEditionName(event) {
  return String(event?.seriesName || event?.shortName || event?.name || event?.title || '')
    .normalize('NFKC').trim().toLocaleLowerCase()
    .replace(/(?:\s*(?:#|no\.?\s*)\s*\d+|第\s*\d+\s*回?)$/i, '')
    .replace(/第\s*\d+\s*回?$/, '')
    .replace(/[\s・:：—–-]+$/g, '').trim();
}

/** Remove duplicate records for the same named date range while preserving separate editions. */
export function uniqueEventEditions(events = []) {
  const unique = new Map();
  const identities = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    const interval = eventDates(event);
    const id = String(event.id || event.eventId || '').trim();
    const name = normalizedEditionName(event);
    const edition = interval ? `${interval.start}:${interval.end}` : '';
    const keys = [id && `id:${id}:${edition}`, interval && name && `${name}:${edition}`].filter(Boolean);
    if (!keys.length) continue;
    if (keys.some(key => identities.has(key))) continue;
    for (const key of keys) identities.add(key);
    unique.set(keys[0], event);
  }
  return [...unique.values()];
}

export function eventPeriodCounts(events = [], today = tokyoDate()) {
  const counts = { upcoming: 0, active: 0, past: 0 };
  for (const event of uniqueEventEditions(events)) {
    const period = classifyEvent(event, today);
    if (period in counts) counts[period] += 1;
  }
  return Object.freeze({ ...counts, future: counts.upcoming + counts.active, total: counts.upcoming + counts.active + counts.past });
}

export function matchesEventPeriod(event, filter = 'all', today = tokyoDate()) {
  if (filter === 'all') return true;
  const period = classifyEvent(event, today);
  if (filter === 'future') return period === 'upcoming' || period === 'active';
  if (filter === 'past') return period === 'past';
  return false;
}

/** Stable display order: active, nearest upcoming, unconfirmed/undated, then most recent past. */
export function compareEventsByDisplayPriority(a, b, today = tokyoDate()) {
  const periodA = classifyEvent(a, today), periodB = classifyEvent(b, today);
  const bucket = period => period === 'active' ? 0 : period === 'upcoming' ? 1 : period === 'past' ? 3 : 2;
  const priority = bucket(periodA) - bucket(periodB);
  if (priority) return priority;
  const datesA = eventDates(a), datesB = eventDates(b);
  if (periodA === 'upcoming' && datesA && datesB) return datesA.start.localeCompare(datesB.start);
  if (periodA === 'active' && datesA && datesB) return datesA.end.localeCompare(datesB.end);
  if (periodA === 'past' && datesA && datesB) return datesB.end.localeCompare(datesA.end);
  return 0;
}

export function sortEventsByDisplayPriority(events = [], today = tokyoDate()) {
  return (Array.isArray(events) ? events : []).map((event, index) => ({ event, index }))
    .sort((a, b) => compareEventsByDisplayPriority(a.event, b.event, today) || a.index - b.index)
    .map(({ event }) => event);
}

export function eventDensityBin(count) {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  return value === 0 ? 0 : value === 1 ? 1 : value <= 4 ? 2 : 3;
}
