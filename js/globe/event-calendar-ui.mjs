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

function deviceKind(nav) {
  const ua = String(nav?.userAgent || '');
  const platform = String(nav?.userAgentData?.platform || nav?.platform || '');
  if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && nav?.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua + platform)) return 'android';
  if (/Mac/i.test(platform + ua)) return 'mac';
  if (/Win/i.test(platform + ua)) return 'windows';
  return 'other';
}
function androidAppLink(webUrl, nav, device) {
  const ua = String(nav?.userAgent || '');
  if (device !== 'android' || !/Chrome\//.test(ua) || /EdgA|OPR|SamsungBrowser|;\s*wv\b/.test(ua)) return '';
  // Chrome tries only a browser-safe activity. Preserve the full draft in the
  // web fallback; app installation and supported routes cannot be detected here.
  return `intent://${webUrl.slice('https://'.length)}#Intent;scheme=https;action=android.intent.action.VIEW;package=com.google.android.calendar;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
}

/** Build opt-in calendar actions. No file or calendar action runs until its control is clicked. */
export function createEventCalendarSection({ event, doc = globalThis.document, BlobImpl = globalThis.Blob, URLImpl = globalThis.URL, navigatorRef = doc?.defaultView?.navigator || globalThis.navigator, FileImpl = globalThis.File } = {}) {
  if (!doc?.createElement) throw new TypeError('A document is required to create the calendar section.');
  const section = doc.createElement('section');
  section.className = 'event-calendar';
  section.setAttribute('aria-label', 'カレンダーに追加');
  const heading = doc.createElement('h3'); heading.textContent = 'カレンダーに追加'; section.append(heading);
  let calendarEvent = event;
  let status = eventCalendarAvailability(event);
  let dateOnly = false;
  // Keep any confirmed start time in ICS; use date-only copies only when
  // neither provider can represent the original record.
  if (!status.googleAvailable && !status.icsAvailable && hasStructuredDates(event)) {
    try {
      const reminder = createEventDateReminder(event);
      const reminderStatus = eventCalendarAvailability(reminder);
      if (reminderStatus.googleAvailable && reminderStatus.icsAvailable) {
        calendarEvent = reminder;
        status = reminderStatus;
        dateOnly = true;
      }
    } catch { /* Invalid or inactive records retain their unavailable state. */ }
  }
  if (!status.googleAvailable && !status.icsAvailable) {
    const unavailable = doc.createElement('p');
    unavailable.className = 'event-calendar__unavailable';
    unavailable.textContent = localizedReason(status.reason);
    section.append(unavailable);
    return section;
  }

  const device = deviceKind(navigatorRef);
  const actions = doc.createElement('div');
  actions.className = 'event-calendar__actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', dateOnly ? '開催日をカレンダーに追加' : 'イベントをカレンダーに追加');
  const addLink = (href, text, primary = false, newTab = true) => {
    const link = doc.createElement('a');
    link.className = `event-calendar__action event-calendar__action--${primary ? 'primary' : 'secondary'}`;
    link.href = href; link.textContent = text;
    if (newTab) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    actions.append(link);
  };
  if (status.googleAvailable) {
    const webUrl = createGoogleCalendarUrl(calendarEvent);
    const appUrl = androidAppLink(webUrl, navigatorRef, device);
    if (appUrl) addLink(appUrl, 'Googleカレンダーアプリで開く', true, false);
    addLink(webUrl, appUrl ? 'GoogleカレンダーのWeb版で追加' : 'Googleカレンダーで予定を開く', !appUrl);
  }
  let shareFile = null;
  if (status.icsAvailable && typeof navigatorRef?.share === 'function' && typeof navigatorRef?.canShare === 'function' && typeof FileImpl === 'function') {
    try {
      const file = new FileImpl([createEventIcs(calendarEvent)], fileName(calendarEvent), { type: 'text/calendar' });
      if (navigatorRef.canShare({ files: [file] })) shareFile = file;
    } catch { /* Keep the file-save path when this type cannot be shared. */ }
  }
  const feedback = doc.createElement('p');
  feedback.className = 'event-calendar__feedback';
  feedback.setAttribute('role', 'status');
  feedback.hidden = true;
  const showFeedback = (message) => { feedback.textContent = message; feedback.hidden = false; };
  if (shareFile) {
    const share = doc.createElement('button');
    share.type = 'button'; share.className = 'event-calendar__action event-calendar__action--secondary';
    share.textContent = device === 'ios' ? 'iPhone・iPadの共有メニューを開く' : '予定ファイルをアプリに共有';
    share.addEventListener('click', async () => {
      if (share.disabled) return;
      share.disabled = true;
      try {
        // Call within the click gesture; preparation has already completed.
        await navigatorRef.share({ files: [shareFile] });
        showFeedback('予定ファイルを共有先に渡しました。追加操作は共有先で行ってください。');
      } catch (error) {
        showFeedback(error?.name === 'AbortError' ? '共有をキャンセルしました。' : '共有できませんでした。「予定を保存」のボタンをご利用ください。');
      } finally { share.disabled = false; }
    });
    actions.append(share);
  }
  if (status.icsAvailable) {
    const ics = doc.createElement('button');
    ics.type = 'button';
    ics.className = `event-calendar__action event-calendar__action--${status.googleAvailable || shareFile ? 'secondary' : 'primary'}`;
    ics.textContent = device === 'ios' ? 'iPhone・iPad用の予定を保存'
      : device === 'mac' ? 'Appleカレンダー用の予定を保存'
      : device === 'windows' ? 'Outlookなどで開く予定を保存' : '他のカレンダー用の予定を保存';
    ics.addEventListener('click', () => {
      try { downloadIcs(doc, calendarEvent, { BlobImpl, URLImpl }); }
      catch { showFeedback('予定ファイルを保存できませんでした。再度お試しください。'); }
    });
    actions.append(ics);
  }
  const note = doc.createElement('p');
  note.className = 'event-calendar__note';
  note.textContent = dateOnly ? '開催日だけを追加します。開催時間は公式情報で確認してください。'
    : status.googleAvailable ? '開いた予定の内容を確認して保存してください。'
    : '開始時刻を追加します。終了時刻は公式情報で確認してください。';
  section.append(note, actions);
  const help = doc.createElement('p');
  help.className = 'event-calendar__note';
  const appHelp = status.googleAvailable && androidAppLink('https://calendar.google.com/', navigatorRef, device)
    ? 'アプリが対応していない場合はWeb版を開きます。予定画面が出ない場合は「Web版で追加」を選んでください。' : '';
  const fileHelp = device === 'ios'
    ? `${shareFile ? '共有先に「メール」を選ぶか、' : ''}保存した予定ファイルをメールに添付し、自分宛てに送った添付を開くとAppleカレンダーに追加できます。`
    : device === 'mac' ? '保存した予定ファイルを開くとAppleカレンダーに追加できます。'
    : '保存した予定ファイルを、Outlookなどの対応カレンダーアプリで開いて追加してください。';
  help.textContent = [appHelp, status.icsAvailable ? fileHelp : ''].filter(Boolean).join(' ');
  if (help.textContent) section.append(help);
  section.append(feedback);
  const copyNote = doc.createElement('p');
  copyNote.className = 'event-calendar__note';
  copyNote.textContent = '変更・中止は自動反映されません。参加申込みは公式サイトへ。';
  section.append(copyNote);
  return section;
}
