import { createEventDateReminder, createEventIcs, createGoogleCalendarUrl, eventCalendarAvailability } from './event-calendar.mjs';

function hasStructuredDates(event) {
  const start = event?.startDate || event?.date;
  const end = event?.endDate || start;
  return typeof start === 'string' && Boolean(start) && typeof end === 'string' && Boolean(end);
}
function fileName(event) {
  const slug = String(event?.name || event?.title || 'event').normalize('NFKD').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'event';
  return `${slug}.ics`;
}
function localizedReason(reason = '') {
  if (/explicit event name/i.test(reason)) return 'イベント名が確認できません。';
  if (/explicit venue/i.test(reason)) return '会場が確認できません。';
  if (/sourceUrl|source URL|HTTP or HTTPS/i.test(reason)) return '公式情報のURLが確認できません。';
  if (/valid YYYY-MM-DD|startDate|endDate|date/i.test(reason)) return '開催日の記録を確認できません。';
  if (/explicit IANA timeZone|IANA timeZone/i.test(reason)) return 'タイムゾーンが確認できません。';
  if (/ambiguous|nonexistent|does not match/i.test(reason)) return '日時とタイムゾーンの組み合わせを確認できません。';
  if (/explicit end/i.test(reason)) return '終了時刻が確認できないため、時刻を指定する予定は作成できません。';
  if (/no confirmed active occurrence/i.test(reason)) return '現在の開催予定が確認できません。';
  return '開催情報が不足しているため、カレンダー項目を作成できません。';
}
function downloadIcs(doc, event, { BlobImpl, URLImpl }) {
  const blob = new BlobImpl([createEventIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URLImpl.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName(event);
  anchor.hidden = true;
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URLImpl.revokeObjectURL(url), 0);
}

/** Build opt-in calendar actions. No file or calendar action runs until its control is clicked. */
export function createEventCalendarSection({ event, doc = globalThis.document, BlobImpl = globalThis.Blob, URLImpl = globalThis.URL } = {}) {
  if (!doc?.createElement) throw new TypeError('A document is required to create the calendar section.');
  const section = doc.createElement('section');
  section.className = 'event-calendar';
  section.setAttribute('aria-label', 'カレンダーに追加');
  const heading = doc.createElement('h3'); heading.textContent = 'カレンダーに追加'; section.append(heading);
  const note = doc.createElement('p');
  note.className = 'event-calendar__note';
  note.textContent = 'カレンダーに保存する一回分のコピーです。掲載内容の更新・中止は自動反映されず、参加登録も行いません。';
  section.append(note);

  const status = eventCalendarAvailability(event);
  const actions = doc.createElement('div');
  actions.className = 'event-calendar__actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', 'イベント全体の予定');
  if (status.googleAvailable) {
    const google = doc.createElement('a'); google.className = 'event-calendar__action event-calendar__action--primary';
    google.href = createGoogleCalendarUrl(event); google.target = '_blank'; google.rel = 'noopener noreferrer'; google.textContent = 'Googleカレンダーに追加'; actions.append(google);
  } else {
    const unavailable = doc.createElement('p'); unavailable.className = 'event-calendar__unavailable'; unavailable.textContent = `Googleカレンダー：${localizedReason(status.reason)}`; section.append(unavailable);
  }
  if (status.icsAvailable) {
    const ics = doc.createElement('button'); ics.type = 'button'; ics.className = 'event-calendar__action event-calendar__action--secondary'; ics.textContent = '他のカレンダー用 .ics をダウンロード';
    ics.addEventListener('click', () => downloadIcs(doc, event, { BlobImpl, URLImpl })); actions.append(ics);
  } else {
    const unavailable = doc.createElement('p'); unavailable.className = 'event-calendar__unavailable'; unavailable.textContent = `カレンダーファイル：${localizedReason(status.reason)}`; section.append(unavailable);
  }
  if (actions.children.length) section.append(actions);
  if (hasStructuredDates(event) && !status.googleAvailable && !event?.allDay && !['watch', 'cancelled', 'canceled', 'postponed', 'ended', 'completed', 'past'].includes(String(event?.status || '').toLowerCase())) {
    try {
      const reminder = createEventDateReminder(event);
      const reminderStatus = eventCalendarAvailability(reminder);
      if (!reminderStatus.googleAvailable || !reminderStatus.icsAvailable) throw new TypeError(reminderStatus.reason);
      const reminderGroup = doc.createElement('div'); reminderGroup.className = 'event-calendar__reminder';
      const reminderTitle = doc.createElement('h4'); reminderTitle.textContent = '日付だけの控え'; reminderGroup.append(reminderTitle);
      const reminderNote = doc.createElement('p'); reminderNote.className = 'event-calendar__note';
      reminderNote.textContent = '時刻は設定しません。終日開催を示すものではないため、開催時間は公式情報で確認してください。'; reminderGroup.append(reminderNote);
      const reminderActions = doc.createElement('div'); reminderActions.className = 'event-calendar__actions';
      reminderActions.setAttribute('role', 'group');
      reminderActions.setAttribute('aria-label', '日付だけの予定');
      const googleReminder = doc.createElement('a'); googleReminder.className = 'event-calendar__action event-calendar__action--primary';
      googleReminder.href = createGoogleCalendarUrl(reminder); googleReminder.target = '_blank'; googleReminder.rel = 'noopener noreferrer'; googleReminder.textContent = '日付だけを Google カレンダーに追加'; reminderActions.append(googleReminder);
      const icsReminder = doc.createElement('button'); icsReminder.type = 'button'; icsReminder.className = 'event-calendar__action event-calendar__action--secondary'; icsReminder.textContent = '日付だけの .ics をダウンロード';
      icsReminder.addEventListener('click', () => downloadIcs(doc, reminder, { BlobImpl, URLImpl })); reminderActions.append(icsReminder);
      reminderGroup.append(reminderActions); section.append(reminderGroup);
    } catch (error) {
      const unavailable = doc.createElement('p'); unavailable.className = 'event-calendar__unavailable'; unavailable.textContent = `日付だけの予定：${localizedReason(error.message)}`; section.append(unavailable);
    }
  }
  return section;
}
