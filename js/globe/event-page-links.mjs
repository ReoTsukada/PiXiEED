let catalogPromise;

/** Link only to pages in the generated public directory, not feed-only IDs. */
export async function appendEventPageLink(root, id, doc = root?.ownerDocument) {
  if (!root || !doc || !/^[a-z0-9][a-z0-9-]{0,179}$/.test(String(id || ''))) return;
  catalogPromise ||= fetch('/events/catalog.json').then(response => {
    if (!response.ok) throw new Error('Event directory unavailable');
    return response.json();
  }).then(data => new Set(data.version === 1 && Array.isArray(data.ids) ? data.ids : [])).catch(() => new Set());
  const ids = await catalogPromise;
  if (!ids.has(id) || (root.dataset.eventPageId || root.dataset.eventId) !== id || root.querySelector('[data-event-page-link]')) return;
  const link = doc.createElement('a');
  link.href = `/events/${id}/`;
  link.dataset.eventPageLink = '';
  link.textContent = '日程・会場・公式情報の紹介ページ';
  const section = doc.createElement('p');
  section.className = 'map-event-detail__links';
  section.append(link);
  root.append(section);
}
