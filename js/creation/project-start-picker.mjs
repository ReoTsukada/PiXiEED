import { createToolProjectStore } from './tool-project-store.mjs?rev=20261107-gallery-1';
import { mountProjectGallery } from './project-gallery.mjs?rev=20261108-gallery-first-1';
import { mountProjectGalleryAd } from '../ads/project-gallery-ad.mjs?rev=20261108-gallery-first-ad-1';
import { projectGalleryAdConfig } from '../../data/project-gallery-ad-config.mjs?rev=20261108-gallery-first-ad-1';

/** Require real display-ready RGB previews so blank placeholder canvases do not count as publisher content. */
export function hasCompleteProjectArtwork(projects) {
  if (!Array.isArray(projects) || projects.length === 0) return false;
  return projects.every(project => {
    const sample = project?.summary?.thumbnail;
    const width = sample?.width, height = sample?.height, rgb = sample?.rgb;
    return Number.isFinite(width) && Number.isInteger(width) && width > 0
      && Number.isFinite(height) && Number.isInteger(height) && height > 0
      && ArrayBuffer.isView(rgb) && !(rgb instanceof DataView)
      && Number.isFinite(rgb.length) && rgb.length >= width * height * 3;
  });
}

export function mountProjectStartPicker({ onChoose = () => {}, onCancel = () => {}, signal } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'project-start-picker';
  dialog.className = 'project-start-picker project-sheet';
  dialog.setAttribute('aria-labelledby', 'project-start-title');

  const header = document.createElement('header');
  header.className = 'project-sheet__heading';
  const title = document.createElement('h2');
  title.id = 'project-start-title';
  title.textContent = '作品を選ぶ';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '説明へ戻る';
  header.append(title, cancel);

  const intro = document.createElement('p');
  intro.textContent = '保存済みの作品から選ぶか、新しい作品を始められます。';
  const search = document.createElement('input');
  search.id = 'project-start-search';
  search.type = 'search';
  search.placeholder = '作品を検索';
  search.setAttribute('aria-label', '作品を検索');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const count = document.createElement('p');
  count.className = 'project-start-picker__count';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.id = 'project-start-retry';
  retry.textContent = '再読み込み';
  retry.hidden = true;
  const scroller = document.createElement('div');
  scroller.className = 'project-start-picker__scroller';
  const list = document.createElement('div');
  list.className = 'project-start-picker__list project-list';
  scroller.append(list);
  const actions = document.createElement('div');
  actions.className = 'project-sheet__actions';
  const fresh = document.createElement('button');
  fresh.type = 'button';
  fresh.id = 'project-start-new';
  fresh.textContent = '＋ 新規';
  actions.append(fresh);
  const adRegion = document.createElement('section');
  adRegion.className = 'project-start-picker__ad';
  adRegion.setAttribute('aria-label', '広告');
  adRegion.dataset.projectGalleryAd = 'chooser-v1';
  adRegion.hidden = true;
  const adLabel = document.createElement('p');
  adLabel.className = 'project-start-picker__ad-label';
  adLabel.textContent = '広告';
  const adSlot = document.createElement('div');
  adSlot.className = 'project-start-picker__ad-slot';
  adSlot.dataset.projectGalleryAdSlot = '';
  adRegion.append(adLabel, adSlot);
  dialog.append(header, intro, search, status, count, retry, scroller, actions, adRegion);
  document.body.append(dialog);

  let disposed = false, busy = false, epoch = 0, gallery;
  let galleryAdStarted = false, galleryAdRetired = false, galleryAd;
  function retireGalleryAd(reason = 'hide') {
    galleryAdRetired = true;
    galleryAd?.retire?.(reason);
    if (!dialog.open) adRegion.hidden = true;
  }
  const cssHref = '/css/project-workspace.css?rev=20261108-gallery-first-ad-1';
  let css = [...document.querySelectorAll('link[rel="stylesheet"]')].find(link => link.getAttribute('href') === cssHref);
  const ownsCss = !css;
  let cssPromise = null, cssFailed = false, cancelCss = null;
  const active = () => !disposed && !signal?.aborted;
  function hide() { retireGalleryAd('hide'); epoch++; if (dialog.open) dialog.close(); }
  function setBusy(value) { busy = value; fresh.disabled = search.disabled = value; gallery.refresh(); }
  async function choose(value) {
    if (!active() || !dialog.open || busy) return;
    retireGalleryAd('selection'); // Retire before history changes, project loading, or a fresh start.
    setBusy(true);
    status.textContent = '作品を準備しています…';
    try { await onChoose(value); if (active()) hide(); }
    catch (error) { if (active()) status.textContent = error?.message || '作品を開けませんでした。もう一度お試しください。'; }
    finally { if (active()) setBusy(false); }
  }
  gallery = mountProjectGallery({ list, scroller, readOnly: true,
    onOpen: item => void choose({ projectId: item.projectId, revisionId: item.revisionId }),
    isLocked: () => busy,
    onSelection: ({ total, visible }) => { count.textContent = search.value ? `${visible} / ${total}作品` : `${total}作品`; }
  });
  search.addEventListener('focus', () => retireGalleryAd('search'), { once: true });
  search.addEventListener('input', () => { retireGalleryAd('search'); gallery.filter(search.value); scroller.scrollTop = 0; });
  fresh.addEventListener('click', () => void choose(null));
  function cancelPicker() { if (!active()) return; retireGalleryAd('cancel'); hide(); onCancel(); }
  dialog.addEventListener('close', () => { retireGalleryAd('hide'); adRegion.hidden = true; });
  const retireOnControlStart = event => {
    const control = event.target?.closest?.('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
    if (control && dialog.contains(control) && !adRegion.contains(control)) retireGalleryAd('interaction');
  };
  dialog.addEventListener('pointerdown', retireOnControlStart, true);
  dialog.addEventListener('keydown', retireOnControlStart, true);
  cancel.addEventListener('click', cancelPicker);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancelPicker(); });

  function loadCss() {
    if (!active()) return Promise.reject(new DOMException('作品一覧を閉じました。', 'AbortError'));
    if (css?.sheet) return Promise.resolve();
    if (cssPromise) return cssPromise;
    if (!css || cssFailed && ownsCss) {
      css?.remove();
      css = document.createElement('link'); css.rel = 'stylesheet'; css.href = cssHref;
      cssFailed = false;
    }
    cssPromise = new Promise((resolve, reject) => {
      const finish = error => {
        css.removeEventListener('load', onLoad); css.removeEventListener('error', onError);
        cancelCss = null; cssFailed = Boolean(error); error ? reject(error) : resolve();
      };
      const onLoad = () => finish();
      const onError = () => finish(new Error('作品一覧の表示を読み込めませんでした。再試行してください。'));
      cancelCss = () => finish(new DOMException('作品一覧を閉じました。', 'AbortError'));
      css.addEventListener('load', onLoad, { once: true }); css.addEventListener('error', onError, { once: true });
      if (!css.isConnected) document.head.append(css);
      if (css.sheet) finish();
      else if (cssFailed) onError();
    }).finally(() => { cssPromise = null; });
    return cssPromise;
  }
  async function refresh() {
    if (!active() || !dialog.open) return;
    const version = ++epoch;
    retry.hidden = true;
    list.setAttribute('aria-busy', 'true');
    status.textContent = '保存済みの作品を読み込んでいます…';
    try {
      const { projects, errors } = await createToolProjectStore('draw').listProjects();
      if (!active() || !dialog.open || version !== epoch) return;
      gallery.setItems(projects);
      status.textContent = errors?.length ? '一部の作品を確認できませんでした。ほかの作品は開けます。' : projects.length ? '続ける作品を選んでください。' : '保存済みの作品はまだありません。「＋ 新規」から始めてください。';
      retry.hidden = !errors?.length;
      const hasValidArtwork = hasCompleteProjectArtwork(projects);
      if (!errors?.length && projects.length > 0 && hasValidArtwork) prepareGalleryAd();
    } catch (error) {
      if (!active() || !dialog.open || version !== epoch) return;
      status.textContent = '作品一覧を読み込めませんでした。保存内容は変更していません。もう一度お試しください。';
      retry.hidden = false;
    } finally { if (active() && version === epoch) list.setAttribute('aria-busy', 'false'); }
  }
  retry.addEventListener('click', () => void refresh());
  function prepareGalleryAd() {
    if (galleryAdStarted || galleryAdRetired || !active() || !dialog.open) return;
    galleryAdStarted = true;
    // Let the gallery's already-scheduled frame add a tile before measuring.
    requestAnimationFrame(() => {
      if (galleryAdRetired || !active() || !dialog.open) return;
      try {
        galleryAd = mountProjectGalleryAd({
          doc: document, win: window, dialog, scroller, list, primaryAction: fresh,
          host: adRegion, slot: adSlot, config: projectGalleryAdConfig,
          // Only booleans cross the placement boundary. Project records stay in the chooser.
          galleryState: { settled: true, hasVisibleItems: true, hasValidArtwork: true, searching: false, hasErrors: false, busy: false },
        });
        if (!galleryAd?.mounted) adRegion.hidden = true;
      } catch { adRegion.hidden = true; }
    });
  }
  async function show() {
    if (!active()) return;
    const version = ++epoch;
    await loadCss();
    if (!active() || version !== epoch) return;
    search.value = ''; gallery.filter('');
    if (!dialog.open) dialog.showModal();
    // Do not open the phone keyboard before the user chooses to search.
    fresh.focus({ preventScroll: true });
    void refresh();
  }
  function dispose() {
    if (disposed) return;
    retireGalleryAd('dispose');
    disposed = true; epoch++;
    signal?.removeEventListener('abort', dispose);
    cancelCss?.();
    gallery.dispose();
    dialog.removeEventListener('pointerdown', retireOnControlStart, true);
    dialog.removeEventListener('keydown', retireOnControlStart, true);
    dialog.close(); dialog.remove();
    if (ownsCss) css?.remove();
  }
  signal?.addEventListener('abort', dispose, { once: true });
  return { show, hide, dispose };
}
