import test from 'node:test';
import assert from 'node:assert/strict';
import { eventStatusText, presentMapEvent, safePresentationUrl } from '../../js/globe/map-event-presentation.mjs';

test('presentation uses explicit event facts and formats a compact dated card', () => {
  const view = presentMapEvent({
    name: 'Pixel gathering', startDate: '2026-06-13', endDate: '2026-06-13',
    dateLabel: '2026年6月13日（土）11:00–17:00（Asia/Tokyo）、開催済み。',
    venue: 'Space Seven', area: '中区', prefecture: '愛知県', fee: '500円',
    conditions: '中学生以下無料', organizer: '名ぴく', tags: ['展示', '販売'],
    sourceUrl: 'https://example.org/event', sourceLabel: '主催者の公式案内', checkedAt: '2026-10-07T06:32:21+00:00',
    ticketUrl: 'https://tickets.example.org/event', socialUrls: ['https://x.com/example_artist']
  }, '2026-10-07');
  assert.equal(view.title, 'Pixel gathering');
  assert.equal(view.date, '2026年6月13日 11:00–17:00');
  assert.equal(view.status, '終了');
  assert.equal(view.venue, 'Space Seven');
  assert.equal(view.area, '中区 · 愛知県');
  assert.equal(view.fee, '500円');
  assert.equal(view.conditions, '中学生以下無料');
  assert.deepEqual(view.organizer, ['名ぴく']);
  assert.deepEqual(view.tags, ['展示', '販売']);
  assert.equal(view.checkedAt, '2026年10月7日');
  assert.deepEqual(view.links, [
    { href: 'https://example.org/event', label: '主催者の公式案内（example.org）' },
    { href: 'https://tickets.example.org/event', label: 'チケット（tickets.example.org）' },
    { href: 'https://x.com/example_artist', label: 'SNS（@example_artist）' }
  ]);
});

test('untrusted URLs and unsupported values are omitted without invented details', () => {
  assert.equal(safePresentationUrl('javascript:alert(1)'), '');
  assert.equal(safePresentationUrl('data:text/html,hi'), '');
  assert.equal(safePresentationUrl('https://example.org/a'), 'https://example.org/a');
  const view = presentMapEvent({
    name: 'Undated', status: 'watch', dateLabel: '次回開催情報待ち',
    sourceUrl: 'javascript:alert(1)', additionalUrls: ['file:///secret', 'https://example.org/info'],
    socialUrls: ['https://example.org/info', 'not a URL'], fee: null, organizer: '', tags: []
  }, '2026-10-07');
  assert.equal(view.date, '次回開催情報待ち');
  assert.equal(eventStatusText({ watch: true }, '2026-10-07'), '次回開催情報待ち');
  assert.equal(view.fee, '');
  assert.deepEqual(view.organizer, []);
  assert.deepEqual(view.tags, []);
  assert.deepEqual(view.links, [{ href: 'https://example.org/info', label: '関連情報（example.org）' }]);
  assert.equal(view.checkedAt, '');
});
