import { classifyEvent, eventDates } from './event-density.mjs';

const STATUS_LABELS = Object.freeze({
  upcoming: '開催予定', active: '開催中', past: '終了', watch: '次回開催情報待ち',
  unknown: '日程未確認', cancelled: '中止', postponed: '延期・日程調整中'
});

function cleanText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function safePresentationUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function timeText(event) {
  let time = cleanText(event?.timeLabel || event?.time);
  if (!time) {
    const clock = value => typeof value === 'string' ? value.match(/T(\d{2}:\d{2})/)?.[1] || '' : '';
    const start = clock(event?.startAt), end = clock(event?.endAt);
    if (start && end) time = `${start}–${end}`;
    else if (start) time = start;
    if (time && cleanText(event?.timeZone || event?.timezone)) time += ` (${cleanText(event.timeZone || event.timezone)})`;
  }
  if (!time) {
    const label = cleanText(event?.dateLabel);
    const explicitTime = label.match(/\d{1,2}:\d{2}\s*[–〜〜-]\s*\d{1,2}:\d{2}/);
    if (explicitTime) time = explicitTime[0].trim();
  }
  return time;
}

function dateText(event) {
  const interval = eventDates(event);
  if (!interval) return cleanText(event?.dateLabel || event?.dates || event?.date);
  const format = value => {
    const [year, month, day] = value.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  };
  let result = interval.start === interval.end
    ? format(interval.start)
    : interval.start.slice(0, 4) === interval.end.slice(0, 4)
      ? `${format(interval.start)}〜${Number(interval.end.slice(5, 7))}月${Number(interval.end.slice(8, 10))}日`
      : `${format(interval.start)}〜${format(interval.end)}`;
  const time = timeText(event);
  if (time) result += ` ${time}`;
  return result;
}

function linkLabel(value, fallback) {
  try {
    const url = new URL(value);
    const name = url.hostname.replace(/^www\./, '');
    if (name === 'x.com' || name === 'twitter.com') {
      const handle = url.pathname.split('/').filter(Boolean)[0];
      return handle ? `SNS（@${handle}）` : '公式SNS';
    }
    return `${fallback}（${name}）`;
  } catch { return fallback; }
}

function pushLinks(output, seen, values, label) {
  for (const item of Array.isArray(values) ? values : [values]) {
    const raw = typeof item === 'string' ? item : item?.url;
    const href = safePresentationUrl(raw);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const suppliedName = typeof item === 'object' ? cleanText(item.label || item.name) : '';
    output.push(Object.freeze({ href, label: suppliedName || linkLabel(href, label) }));
  }
}

function listText(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  const text = cleanText(value);
  return text ? [text] : [];
}

/** Prepare only fields explicitly present in a catalog record for compact cards/details. */
export function presentMapEvent(event, today) {
  const period = ['ended', 'completed'].includes(String(event?.status || '').toLowerCase()) ? 'past' : classifyEvent(event, today);
  const urls = [], seen = new Set();
  pushLinks(urls, seen, event?.sourceUrl || event?.url || event?.website, cleanText(event?.sourceLabel) || '公式情報');
  pushLinks(urls, seen, event?.ticketUrls || event?.ticketUrl || event?.ticketPageUrl || event?.ticketPage, 'チケット');
  pushLinks(urls, seen, event?.additionalUrls, '関連情報');
  pushLinks(urls, seen, event?.socialUrls, '公式SNS');
  const checked = cleanText(event?.checkedAt);
  const checkedAt = Number.isFinite(Date.parse(checked))
    ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(checked))
    : '';
  return Object.freeze({
    title: cleanText(event?.name || event?.title),
    date: dateText(event),
    dateLabel: cleanText(event?.dateLabel || event?.dates || event?.date),
    time: timeText(event),
    status: STATUS_LABELS[period] || '日程未確認',
    period,
    venue: cleanText(event?.venue),
    area: [event?.area, event?.prefecture, event?.country].map(cleanText).filter(Boolean).filter((value, i, all) => all.indexOf(value) === i).join(' · '),
    fee: cleanText(event?.fee ?? event?.admissionFee ?? event?.admission ?? event?.price),
    conditions: cleanText(event?.conditions || event?.admissionConditions || event?.entryInfo),
    description: cleanText(event?.description),
    organizer: listText(event?.organizers || event?.organizer || event?.host),
    tags: listText(event?.tags),
    sourceLabel: cleanText(event?.sourceLabel),
    checkedAt,
    links: Object.freeze(urls)
  });
}

export function eventStatusText(event, today) {
  return presentMapEvent(event, today).status;
}
