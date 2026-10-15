import { publicWorksOnly, hasExplicitMapPlacement } from './public-work-policy.mjs?rev=20260927-map-gallery-2';
import { stores as fallbackStores, works as fallbackWorks } from '../data/site-data.js?rev=20260924-no-samples-1';
import { mapConfig } from '../data/site-config.js?rev=20261001-free-tools-1';

const MAX_ITEMS = 6;

function isMapOnly(work) {
  return Boolean(work?.mapOnly || work?.userSubmitted || work?.ownerType === 'user' || work?.source === 'user' || work?.visibility === 'map-only');
}

function placedOfficialWorks(data) {
  if (!data || !Array.isArray(data.works) || !Array.isArray(data.stores)) return [];
  const stores = new Map(data.stores.map((store) => [store.id, store]));
  return publicWorksOnly(data.works).filter((work) => {
    if (isMapOnly(work)) return false;
    const linkedIds = [...(Array.isArray(work.stores) ? work.stores : []), work.storeId].filter(Boolean);
    const linkedStore = linkedIds.map((id) => stores.get(id)).find(Boolean);
    return hasExplicitMapPlacement(work) || hasExplicitMapPlacement(linkedStore);
  }).map((work) => {
    const image = [work.image, work.imageUrl, work.image_url, work.artworkUrl, work.artwork_url, work.thumbnail, work.src]
      .find((value) => typeof value === 'string' && value.trim());
    if (!image) return null;
    return { id: work.id, title: work.title || 'ドット絵', image, href: `/globe/?art=${encodeURIComponent(work.id)}`, kind: 'official' };
  }).filter(Boolean);
}

export { placedOfficialWorks };

async function loadOfficialWorks() {
  const endpoint = String(mapConfig.publicDataEndpoint || '').trim();
  if (!endpoint) return { loaded: false, items: placedOfficialWorks({ works: fallbackWorks, stores: fallbackStores }) };
  const url = new URL(endpoint, globalThis.location?.href || 'https://pixieed.jp/');
  url.searchParams.set('action', 'public-data');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { loaded: false, items: placedOfficialWorks({ works: fallbackWorks, stores: fallbackStores }) };
    const data = await response.json();
    return { loaded: true, items: placedOfficialWorks(data) };
  } catch { return { loaded: false, items: placedOfficialWorks({ works: fallbackWorks, stores: fallbackStores }) }; }
  finally { clearTimeout(timer); }
}

function card(item) {
  const link = document.createElement('a');
  link.className = 'home-work';
  link.href = item.href;
  link.setAttribute('aria-label', `世界地図で「${item.title}」を見る`);
  const imageBox = document.createElement('span');
  imageBox.className = 'home-work__image';
  const image = document.createElement('img');
  image.src = item.image;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  imageBox.append(image);
  const title = document.createElement('span');
  title.className = 'home-work__title';
  title.textContent = item.title;
  link.append(imageBox, title);
  return link;
}

function showEmpty(host, unavailable = false) {
  const message = document.createElement('p');
  message.className = 'home-gallery__status';
  message.append(document.createTextNode(unavailable
    ? '公開作品を読み込めませんでした。少し時間をおいて、もう一度お試しください。'
    : 'ホームで紹介できる公式作品はまだありません。公開された投稿は世界地図で見られます。'));
  if (!unavailable) {
    message.append(document.createTextNode(' '));
    const link = document.createElement('a');
    link.href = '/globe/';
    link.textContent = '世界地図を開く';
    message.append(link);
  }
  host.replaceChildren(message);
}

async function mount() {
  const host = document.querySelector('[data-home-gallery]');
  if (!host) return;
  const result = await loadOfficialWorks();
  const items = result.items.slice(0, MAX_ITEMS);
  host.setAttribute('aria-busy', 'false');
  if (!items.length) {
    showEmpty(host, !result.loaded);
    return;
  }
  host.replaceChildren(...items.map(card));
}

if (typeof document !== 'undefined') mount();
