import { publicWorksOnly, hasExplicitMapPlacement } from './public-work-policy.mjs?rev=20260927-map-gallery-2';
import { stores as fallbackStores, works as fallbackWorks } from '../data/site-data.js?rev=20260924-no-samples-1';
import { mapConfig } from '../data/site-config.js?rev=20261001-free-tools-1';

const MAX_ITEMS = 6;
const REQUEST_TIMEOUT_MS = 24_000;

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

function makeAbortError() {
  return new DOMException('The operation was aborted', 'AbortError');
}

export async function requestOfficialWorks({
  endpoint = mapConfig.publicDataEndpoint,
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = REQUEST_TIMEOUT_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  const endpointValue = String(endpoint || '').trim();
  if (!endpointValue) {
    return { status: 'success', items: placedOfficialWorks({ works: fallbackWorks, stores: fallbackStores }) };
  }
  if (signal?.aborted) return { status: 'cancelled', items: [] };

  let url;
  try {
    url = new URL(endpointValue, globalThis.location?.href || 'https://pixieed.jp/');
    url.searchParams.set('action', 'public-data');
  } catch {
    return { status: 'error', items: [], reason: 'request' };
  }
  const controller = new AbortController();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const abortFromCaller = () => {
    controller.abort();
    rejectAbort(makeAbortError());
  };
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (signal?.aborted) abortFromCaller();
  let timeoutId;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimer(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('Home gallery request timed out'));
    }, timeoutMs);
  });
  const request = (async () => {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    if (!response?.ok) throw new Error('Home gallery request failed');
    const data = await response.json();
    if (!Array.isArray(data?.works) || !Array.isArray(data?.stores)) throw new Error('Invalid public-data response');
    return placedOfficialWorks(data);
  })();

  try {
    const items = await Promise.race([request, timeout, aborted]);
    return { status: 'success', items };
  } catch (error) {
    if (signal?.aborted && !timedOut) return { status: 'cancelled', items: [] };
    return { status: 'error', items: [], reason: timedOut ? 'timeout' : 'request' };
  } finally {
    clearTimer(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
    controller.abort();
  }
}

function createCard(item, documentRef) {
  const link = documentRef.createElement('a');
  link.className = 'home-work';
  link.href = item.href;
  link.setAttribute('aria-label', `世界地図で「${item.title}」を見る`);
  const imageBox = documentRef.createElement('span');
  imageBox.className = 'home-work__image';
  const image = documentRef.createElement('img');
  image.src = item.image;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  imageBox.append(image);
  const title = documentRef.createElement('span');
  title.className = 'home-work__title';
  title.textContent = item.title;
  link.append(imageBox, title);
  return link;
}

function stateMessage(documentRef, text) {
  const message = documentRef.createElement('p');
  message.className = 'home-gallery__status';
  message.textContent = text;
  return message;
}

export function createHomeGalleryController({
  host,
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch,
  endpoint = mapConfig.publicDataEndpoint,
  timeoutMs = REQUEST_TIMEOUT_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let generation = 0;
  let activeController = null;
  let disposed = false;

  function setState(state, busy = false) {
    host.dataset.state = state;
    host.setAttribute('aria-busy', String(busy));
  }

  function renderLoading() {
    setState('loading', true);
    host.replaceChildren(stateMessage(documentRef, '公開作品を確認しています…'));
  }

  function renderResult(result, requestGeneration, focusOnRetry) {
    if (disposed || generation !== requestGeneration || result.status === 'cancelled') return;
    setState(result.status === 'success' ? (result.items.length ? 'ready' : 'empty') : 'error');
    if (result.status === 'error') {
      const wrapper = documentRef.createElement('div');
      wrapper.className = 'home-gallery__result';
      wrapper.append(stateMessage(documentRef, '公開作品を読み込めませんでした。時間をおいて再度お試しください。'));
      const retry = documentRef.createElement('button');
      retry.type = 'button';
      retry.className = 'home-gallery__retry';
      retry.dataset.homeGalleryRetry = '';
      retry.setAttribute('data-home-gallery-retry', '');
      retry.textContent = '再読み込み';
      retry.addEventListener('click', () => { void load({ focusOnRetry: true }); });
      wrapper.append(retry);
      host.replaceChildren(wrapper);
      if (focusOnRetry) retry.focus({ preventScroll: true });
      return;
    }
    if (!result.items.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'home-gallery__result';
      empty.append(stateMessage(documentRef, 'ホームで紹介できる公式作品はまだありません。公開投稿は世界地図で見られます。'));
      const link = documentRef.createElement('a');
      link.href = '/globe/';
      link.textContent = '世界地図を開く';
      link.className = 'home-gallery__map-link';
      empty.append(link);
      host.replaceChildren(empty);
      return;
    }
    host.replaceChildren(...result.items.slice(0, MAX_ITEMS).map((item) => createCard(item, documentRef)));
  }

  async function load({ focusOnRetry = false } = {}) {
    if (disposed) return;
    const requestGeneration = ++generation;
    activeController?.abort();
    activeController = new AbortController();
    renderLoading();
    if (focusOnRetry) host.focus({ preventScroll: true });
    const result = await requestOfficialWorks({ endpoint, fetchImpl, signal: activeController.signal, timeoutMs, setTimer, clearTimer });
    renderResult(result, requestGeneration, focusOnRetry);
  }

  function cancel() {
    generation += 1;
    activeController?.abort();
    activeController = null;
  }

  function dispose() {
    cancel();
    disposed = true;
  }

  return { load, cancel, dispose };
}

export function bindHomeGalleryLifecycle(gallery, host, eventTarget = globalThis) {
  const onPageHide = () => gallery.cancel();
  const onPageShow = (event) => {
    if (event.persisted && host.dataset.state === 'loading') void gallery.load();
  };
  eventTarget.addEventListener?.('pagehide', onPageHide);
  eventTarget.addEventListener?.('pageshow', onPageShow);
  return () => {
    eventTarget.removeEventListener?.('pagehide', onPageHide);
    eventTarget.removeEventListener?.('pageshow', onPageShow);
  };
}

if (typeof document !== 'undefined') {
  const host = document.querySelector('[data-home-gallery]');
  if (host) {
    const gallery = createHomeGalleryController({ host });
    void gallery.load();
    bindHomeGalleryLifecycle(gallery, host);
  }
}
