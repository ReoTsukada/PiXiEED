/** One in-flow Display unit after the public puzzle lobby's content. */
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261118-draw-display-ad-1';
import { ordinaryAdConfig } from '../../data/ordinary-ad-config.mjs?rev=20261024-ordinary-ad-config-1';
import { ordinaryAdUnitIsConfigured } from './ordinary-ad-placement.mjs?rev=20261024-ordinary-ad-1';

const routes = new Set(['/play/spot-difference/', '/play/hidden-object/', '/jigsaw/']);

export function mountPuzzleLobbyAd(doc = document, win = window, load = getAdsenseLoader) {
  const host = doc.querySelector('[data-puzzle-lobby-ad]');
  const slot = host?.querySelector('.px-display-ad__inner');
  const play = doc.querySelector('#pixfind-game, #jigsaw-play');
  const list = doc.querySelector('#pixfind-list');
  const setup = doc.querySelector('#jigsaw-setup');
  const unit = ordinaryAdConfig.feed.unit;
  const publicRoute = () => ['https://pixieed.jp', 'https://www.pixieed.jp'].includes(win.location.origin)
    && routes.has(win.location.pathname.replace(/\/index\.html$/, '/')) && !win.location.search && !win.location.hash
    && win.top === win.self;
  if (!host || !slot || !play || !publicRoute() || !win.IntersectionObserver
    || !win.MutationObserver || !ordinaryAdConfig.feed.enabled || !ordinaryAdUnitIsConfigured(unit)) return;

  const eligible = () => publicRoute() && play.hidden && !doc.fullscreenElement
    && !doc.body.dataset.toolResultOpen && !doc.querySelector('dialog[open]')
    && !doc.querySelector('#jigsaw-file')?.files?.length
    && (list ? !list.hidden && list.children.length > 0
      : setup && !setup.hidden && doc.querySelector('#jigsaw-source-kind')?.value === 'public');

  let requested = false;
  let retired = false;
  let near = false;
  let ins;
  let timeout;
  let loader;
  const fail = () => {
    if (retired || ['filled', 'unfill-optimized'].includes(ins?.dataset.adStatus)) return;
    retire();
  };
  const statusObserver = new win.MutationObserver(() => {
    if (ins?.dataset.adStatus === 'unfilled') fail();
    else if (['filled', 'unfill-optimized'].includes(ins?.dataset.adStatus)) {
      clearTimeout(timeout);
      loader?.errors.delete(fail);
      host.dataset.adState = 'filled';
    }
  });
  function retire() {
    retired = true;
    clearTimeout(timeout);
    loader?.errors.delete(fail);
    statusObserver.disconnect();
    intersection.disconnect();
    changes.disconnect();
    doc.removeEventListener('visibilitychange', sync);
    doc.removeEventListener('fullscreenchange', sync);
    doc.removeEventListener('change', sync);
    win.removeEventListener('pagehide', retire);
    win.removeEventListener('resize', sync);
    win.removeEventListener('popstate', sync);
    win.removeEventListener('hashchange', sync);
    host.hidden = true;
    ins?.remove();
  }
  function sync() {
    if (retired) return;
    if (!eligible()) {
      if (requested) retire();
      else host.hidden = true;
      return;
    }
    host.hidden = false;
    if (requested || !near || doc.visibilityState === 'hidden' || slot.getBoundingClientRect().width < 280) return;
    requested = true;
    host.dataset.adState = 'requested';
    ins = doc.createElement('ins');
    ins.className = 'adsbygoogle px-display-ad__unit';
    ins.style.display = 'block';
    Object.assign(ins.dataset, { adClient: unit.client, adSlot: unit.slot, adFormat: 'auto', fullWidthResponsive: 'false' });
    slot.append(ins);
    statusObserver.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    try {
      loader = load(doc, win, unit.client);
      if (!loader || loader.failed) { fail(); return; }
      loader.errors.add(fail);
      timeout = setTimeout(fail, 15000);
      (win.adsbygoogle ||= []).push({});
    } catch { fail(); }
  }
  const intersection = new win.IntersectionObserver(([entry]) => {
    near = entry.isIntersecting;
    sync();
  }, { root: setup || null, rootMargin: '100px 0px' });
  const changes = new win.MutationObserver(sync);
  changes.observe(play, { attributes: true, attributeFilter: ['hidden'] });
  if (list) changes.observe(list, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  changes.observe(doc.body, { attributes: true, attributeFilter: ['data-tool-result-open'] });
  doc.addEventListener('visibilitychange', sync);
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('change', sync);
  win.addEventListener('resize', sync, { passive: true });
  win.addEventListener('popstate', sync);
  win.addEventListener('hashchange', sync);
  win.addEventListener('pagehide', retire, { once: true });
  intersection.observe(host);
  sync();
}

if (typeof document !== 'undefined') mountPuzzleLobbyAd();
