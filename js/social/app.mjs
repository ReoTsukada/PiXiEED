import { createPostingConsentUi } from '../posting-consent-ui.mjs?rev=20261024-posting-policy-1';
import { localPuzzlePlayPath, publicPuzzlePlayPath, savePuzzleForSelf, hasUncertainPuzzlePublication } from './puzzle-audience.mjs?rev=20261021-jigsaw-public-1';
import { createSocialApi } from './api.mjs?rev=20261024-posting-policy-1';
import { createFeedDraftStore } from './drafts.mjs?rev=20261021-jigsaw-public-1';
import { activateOrdinaryDisplayAd, createOrdinaryDisplayAdCard, createOrdinaryAdPageGate, ordinaryAdEligibility } from '../ads/ordinary-ad-placement.mjs?rev=20261024-ordinary-ad-1';
import { ordinaryAdConfig } from '../../data/ordinary-ad-config.mjs?rev=20261024-ordinary-ad-config-1';
import { connectOptionalFeedAds, createFeedAdRuntime, createPublicFeedGutterGate, isPublicFeedGutterEligible } from '../ads/ordinary-ad-entry.mjs?rev=20261024-side-ad-layout-1';
import { toolStartHref } from '../tool-start-routes.mjs?rev=20261024-common-tool-start-1';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const LABELS = { art: 'ドット絵', photo: '写真加工', puzzle: 'パズル', text: 'ことば', music: '音楽' };
const MODES = new Set(Object.keys(LABELS));
const FEED_VIEWS = Object.freeze({
  feed: ['みんなの作品', '公開された作品を見つけるフィードです。'],
  saved: ['保存した作品', 'このブラウザーで保存した公開作品です。'],
  local: ['下書き', 'この端末内の下書きです。公開されていません。'],
  mine: ['自分の投稿', 'サーバーで確認できた本人の投稿を表示します。']
});

export function readFeedView(href) {
  const value = new URL(href, 'https://pixieed.invalid').searchParams.get('view');
  return value === 'drafts' ? 'local' : Object.hasOwn(FEED_VIEWS, value) ? value : 'feed';
}
export function feedViewUrl(href, view) {
  const url = new URL(href, 'https://pixieed.invalid');
  if (view === 'feed' || !Object.hasOwn(FEED_VIEWS, view)) url.searchParams.delete('view');
  else url.searchParams.set('view', view === 'local' ? 'drafts' : view);
  return `${url.pathname}${url.search}${url.hash}`;
}
const uuid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
  const random = Math.random() * 16 | 0; return (char === 'x' ? random : random & 3 | 8).toString(16);
});
const text = (value, max) => String(value || '').normalize('NFC').trim().slice(0, max);

function node(tag, attrs = {}, content = '') {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key.startsWith('data-')) element.setAttribute(key, value);
    else if (key in element && !key.startsWith('aria-')) element[key] = value;
    else element.setAttribute(key, value);
  }
  if (content) element.textContent = content;
  return element;
}

function niceError(error, fallback) {
  return error?.message && typeof error.message === 'string' ? error.message : fallback;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256Blob(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function initSocialFeed({ api = createSocialApi(), drafts = createFeedDraftStore(), windowRef = window, documentRef = document, ordinaryAds = {} } = {}) {
  const explorePage = documentRef.body.dataset.socialPage === 'explore';
  const app = $('#socialApp', documentRef), feed = $('#feed', documentRef), status = $('#feedStatus', documentRef);
  const retry = $('#feedRetry', documentRef), composer = $('#composerDialog', documentRef), form = $('#composerForm', documentRef);
  const ordinaryGutterHost = $('#ordinaryFeedGutter', documentRef);
  const detail = $('#detailDialog', documentRef), detailBody = $('#detailBody', documentRef), tools = $('#toolsDialog', documentRef);
  if (!app || !feed || !composer || !form) return null;
  const titleInput = $('#composerTitleInput', form), captionInput = $('#composerText', form), locationInput = $('#composerLocation', form), visibilityInput = $('#composerVisibility', form);
  const audioFile = $('#composerAudioFile', form), audioDetachButton = $('[data-action="detach-audio"]', form);
  const audioList = $('#draftAudioList', documentRef);
  const preview = $('#composerPreview', form), composerStatus = $('#composerStatus', form), modeStatus = $('#composerModeStatus', form);
  const submitButton = $('#composerSubmit', form), draftButton = $('#composerDraftSave', form);
  const consentUi = createPostingConsentUi($('#composerPostingConsent', form), { documentRef, windowRef, onChange: () => { if (typeof state !== 'undefined') updateComposerSummary(); } });
  const editConsents = new WeakMap();
  let activeEditConsent = null;
  const live = $('#toast', documentRef), draftsHost = $('#localDrafts', documentRef);
  let releaseStartup;
  const startupReady = new Promise((resolve) => { releaseStartup = resolve; });
  const state = { posts: [], minePosts: null, mineMode: false, staged: [], readWarnings: [], mode: 'art', composerPane: 'content', attachment: null, localPuzzle:null, receipt: null, outputId: null, output: null, outputDetached: false, audioRecord: null, audioDetached: false, audioWarning: '', audioGeneration: 0, audioListLoaded: false, activeDraft: null, filter: 'all', query: '', bookmarks: new Set(), liked: new Map(), loading: false, feedFailed: false, busy: false, submitted: false, submissionCleared: false, draftReady: false, archiveSaved: false, pageHidden: false, fileGeneration: 0, detailId: null, lastDetailId: null, detailPane: 'work', detailPaneScroll: new Map(), unsentComments: new Map(), priorFocus: null, priorDraftId: null, composerUrl: null, detailHistory: false, audioUrl: null, detailAudioUrl: null, saveChain: Promise.resolve(), initialized: false, handoffToken: 0, composerGeneration: 0, detailGeneration: 0, pendingCleanup: new Set() };

  const boundSearchInputs = new WeakSet();
  function bindSearch(input) {
    if (!input) return;
    input.value = state.query;
    if (boundSearchInputs.has(input)) return;
    boundSearchInputs.add(input);
    input.addEventListener('input', () => {
      state.query = input.value.trim();
      const url = new URL(windowRef.location.href);
      if (state.query) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
      windowRef.history.replaceState(windowRef.history.state || {}, '', url);
      render();
    });
  }
  function ensureSearch() {
    let input = $('#socialSearch', documentRef);
    if (!input) {
      const label = node('label', { class: 'explore-search' }, '作品・作者を検索');
      input = node('input', { id: 'socialSearch', type: 'search', placeholder: 'タイトル・作者・ことば', 'aria-label': '読み込んだ公開作品を検索' });
      label.append(input);
      const note = node('p', { class: 'explore-search-note' }, '最新30件の公開作品が対象です。');
      const anchor = $('#feedViews', documentRef) || $('#feedFilterWrap', documentRef);
      if (anchor) { anchor.before(label, note); }
      else feed.before(label, note);
    }
    bindSearch(input);
    return input;
  }
  function announce(message) { if (live) { live.hidden = false; live.textContent = message; } }
  function tell(message) { if (composerStatus) composerStatus.textContent = message; }
  function statusText(message) { if (status) status.textContent = message; }
  function selectedDraft() {
    return { ...(state.activeDraft || {}), mode: state.mode, title: titleInput?.value || '', caption: captionInput?.value || '', location: locationInput?.value || '', image: state.attachment && !['text', 'music'].includes(state.mode) ? {
      dataUrl: state.attachment.dataUrl, mimeType: state.attachment.mimeType, size: state.attachment.size,
      width: state.attachment.width, height: state.attachment.height, colorCount: state.attachment.colorCount
    } : undefined, postKind: state.mode === 'photo' ? 'pixel_camera' : 'pixel_art', puzzle: state.mode !== 'text' && state.mode !== 'music' ? (state.attachment ? state.attachment.puzzle : state.activeDraft?.puzzle) : undefined,
    puzzlePublicationAttempt: state.mode === 'puzzle' ? state.activeDraft?.puzzlePublicationAttempt : undefined,
    localPuzzle: state.attachment?.puzzle ? state.localPuzzle || state.activeDraft?.localPuzzle : undefined,
    handoffReceipt: state.receipt || state.activeDraft?.handoffReceipt, outputId: state.outputDetached ? undefined : state.outputId || state.activeDraft?.outputId,
    audioId: state.audioRecord ? state.audioRecord.id || undefined : state.audioDetached ? undefined : state.activeDraft?.audioId,
    visibility: visibilityInput?.value || state.activeDraft?.visibility || 'private', version: state.activeDraft?.version,
    requestKey: state.activeDraft?.requestKey, requestDigest: state.activeDraft?.requestDigest };
  }
  function audioOption(record = state.audioRecord) {
    if (!record || (record.id && !record.needsPersist)) return undefined;
    return { blob: record.blob, filename: record.filename, mime: record.mime, sourceOutputId: record.sourceOutputId, returnUrl: record.returnUrl };
  }
  function saveActive() {
    if (!state.draftReady || !composer.open || state.submitted || state.archiveSaved) return state.saveChain;
    const snapshot = selectedDraft();
    const generation = state.audioGeneration;
    const record = state.audioRecord;
    state.saveChain = state.saveChain.catch(() => {}).then(async () => {
      if (generation !== state.audioGeneration) return;
      const committedId = record ? record.id : (!state.audioDetached ? state.activeDraft?.audioId : undefined);
      const queued = { ...snapshot, ...(committedId ? { audioId: committedId } : {}) };
      if (state.audioDetached) delete queued.audioId;
      const saved = await drafts.saveActive(queued, { audio: audioOption(record) });
      state.activeDraft = saved;
      if (record && generation === state.audioGeneration && saved.audioId) {
        state.audioRecord = { ...record, id: saved.audioId, needsPersist: false };
        if (record.sourceOutputId) cleanOutputReference(record.sourceOutputId); else cleanOutputReference();
      }
      if (!record && state.audioDetached && generation === state.audioGeneration) { state.audioDetached = false; cleanOutputReference(); }
      if (state.audioListLoaded) void refreshAudioList();
    });
    return state.saveChain;
  }
  function requestAutosave() {
    const generation = state.audioGeneration, unpersisted = !!state.audioRecord?.needsPersist;
    void saveActive().then(() => {
      if (unpersisted && generation === state.audioGeneration && state.audioRecord?.id) tell('元の音声をこの端末の下書き保存領域にコピーしました。ブラウザーのデータ消去や容量整理で失われる場合があるため、原本も保存してください。');
    }).catch((error) => tell(`下書きを自動保存できませんでした。入力と音声は画面に残っています。${niceError(error, '')}`));
  }
  function queueActiveSave(snapshot) {
    state.saveChain = state.saveChain.catch(() => {}).then(() => drafts.saveActive(snapshot)).then((saved) => { state.activeDraft = saved; return saved; });
    return state.saveChain;
  }
  function lockComposer(locked) {
    state.busy = locked;
    for (const element of $$('input, select, textarea, select, [data-action="composer-type"], [data-action="attach"], [data-action="attach-audio"], [data-action="detach-audio"], [data-action="draft-save"]', form)) element.disabled = locked;
    submitButton.disabled = locked || state.submitted || visibilityInput?.value === 'public' && !consentUi.accepted;
    if (locked) submitButton.setAttribute('aria-busy', 'true'); else submitButton.removeAttribute('aria-busy');
  }
  function freezeComposer() {
    for (const element of $$('input, select, textarea, select, [data-action="composer-type"], [data-action="attach"], [data-action="attach-audio"], [data-action="detach-audio"], [data-action="draft-save"]', form)) element.disabled = true;
    submitButton.disabled = true;
  }
  function cleanComposerQuery() {
    const url = new URL(windowRef.location.href);
    url.searchParams.delete('compose'); url.searchParams.delete('output');
    windowRef.history.replaceState(windowRef.history.state || {}, '', url);
  }
  function cleanOutputReference(outputId) {
    const url = new URL(windowRef.location.href);
    if (!url.searchParams.has('output') || outputId && url.searchParams.get('output') !== outputId) return;
    url.searchParams.delete('output');
    windowRef.history.replaceState(windowRef.history.state || {}, '', url);
  }
  async function savePreferences(patch) {
    try { await drafts.savePreferences(patch); }
    catch (error) { announce(`表示設定を保存できませんでした。${niceError(error, '')}`); }
  }
  function toast(message) { announce(message); }
  function formatDate(time) {
    try { return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time)); }
    catch { return '日時不明'; }
  }
  function filteredPosts() {
    const source = state.filter === 'local' ? [] : state.mineMode && state.minePosts ? state.minePosts : state.posts;
    const term = state.query.toLocaleLowerCase('ja');
    return source.filter((post) => (state.filter === 'all' || state.filter === 'saved' || post.kind === state.filter)
      && (state.filter !== 'saved' || state.bookmarks.has(post.id))
      && (!term || `${post.title} ${post.caption} ${post.author?.name || ''}`.toLocaleLowerCase('ja').includes(term)));
  }
  function renderPost(post) {
    const card = node('article', { class: 'post-card', 'data-post-id': post.id });
    const header = node('header', { class: 'post-header' });
    header.append(node('span', { class: 'post-avatar', 'aria-hidden': 'true' }, (post.author?.name || '作').slice(0, 1)));
    const byline = node('div', { class: 'post-author' });
    const profile = node('strong', {}, post.author?.name || '作者情報なし');
    byline.append(profile, node('small', {}, formatDate(post.createdAt)));
    header.append(byline);
    if (post.mapHref) header.append(node('a', { class: 'post-more', href: post.mapHref, 'aria-label': '地図で作品を見る' }, '↗'));
    card.append(header);
    const open = node('button', { class: `post-media post-media--${post.kind}`, type: 'button', 'data-action': 'detail', 'aria-label': `${post.title}の詳細を開く` });
    open.style.position = 'relative';
    if (post.image?.width && post.image?.height) open.style.aspectRatio = `${post.image.width} / ${post.image.height}`;
    else if (post.image?.src || post.kind === 'puzzle') open.style.aspectRatio = '4 / 3';
    else open.style.aspectRatio = 'auto';
    open.style.border = '0'; open.style.padding = '0'; open.style.background = '#e8ede8'; open.style.cursor = 'pointer';
    if (post.image?.src) {
      const image = node('img', { src: post.image.src, alt: post.title, loading: 'lazy', decoding: 'async' });
      image.style.width = '100%'; image.style.height = '100%'; image.style.objectFit = 'contain';
      if (Number.isInteger(post.image?.width) && post.image.width > 0) image.width = post.image.width;
      if (Number.isInteger(post.image?.height) && post.image.height > 0) image.height = post.image.height;
      open.append(image);
    } else if (post.kind === 'music') {
      const music = node('span', { class: 'post-music-preview' });
      music.append(node('span', { 'aria-hidden': 'true' }, '♫'), node('span', {}, post.audio?.duration ? `${Math.round(post.audio.duration)}秒の音楽` : '音楽をひらく'));
      open.append(music);
    } else if (post.kind === 'text') {
      const copy = node('span', { class: 'post-text-preview' });
      copy.append(node('strong', {}, post.title), ...(post.caption ? [node('span', {}, post.caption)] : [])); open.append(copy);
    } else if (post.kind === 'puzzle') open.append(node('span', { class: 'post-text-preview', 'aria-hidden': 'true' }, 'パズル'));
    const badge = node('span', { class: 'post-type-badge' }, LABELS[post.kind] || '作品'); open.append(badge);
    card.append(open);
    if (post.kind !== 'text') card.append(node('h2', { class: 'post-copy' }, post.title));
    if (post.caption && post.kind !== 'text') card.append(node('p', { class: 'post-copy' }, post.caption));
    const actions = node('div', { class: 'post-actions' });
    if (post.likeable) {
      const liked = state.liked.get(post.id);
      const like = node('button', { type: 'button', 'data-action': 'like', ...(typeof liked === 'boolean' ? { 'aria-pressed': String(liked) } : {}), 'aria-label': liked === true ? 'いいねを取り消す' : liked === false ? 'いいね' : 'いいね状態を確認して操作' });
      like.textContent = liked === true ? '♥ いいね済み' : liked === false ? '♡ いいね' : '♡ いいね状態を確認'; actions.append(like);
    }
    const saved = state.bookmarks.has(post.id);
    actions.append(node('button', { type: 'button', 'data-action': 'bookmark', 'aria-pressed': String(saved) }, saved ? '▣ 保存済み' : '▢ 保存'));
    if (post.kind === 'puzzle') actions.append(node('a', { class: 'post-action', href: post.href }, '▶ 遊ぶ'));
    if (post.mapHref) actions.append(node('a', { class: 'post-action', href: post.mapHref }, '地図を見る'));
    actions.append(node('button', { class: 'post-open', type: 'button', 'data-action': 'detail' }, '詳細'));
    card.append(actions);
    card.append(node('p', { class: 'post-caption' }, post.source === 'sns' ? `${post.visibility === 'private' ? '非公開' : 'サーバー公開'} · ${LABELS[post.kind]}` : post.source === 'showcase' ? '公開作品' : 'ドットマップの公開投稿'));
    return card;
  }
  let publicFlow = [];
  const renderedPostCards = new Map();
  const ordinaryAdCards = new Map();
  const renderedFeedInsertions = new Map();
  const retiredOrdinaryAds = new Set();
  const ordinaryAdActivations = new Map();
  const ordinaryAdPageGate = createOrdinaryAdPageGate();
  let ordinaryGutterActivation = null;
  const ordinaryGutterGate = createPublicFeedGutterGate();
  const priorScrollRestoration = windowRef.history.scrollRestoration;
  windowRef.history.scrollRestoration = 'manual';
  const viewPositions = new Map();
  let viewGeneration = 0;
  const currentView = () => state.mineMode ? 'mine' : state.filter === 'local' ? 'local' : state.filter === 'saved' ? 'saved' : 'feed';
  const previewAds = documentRef.querySelector('meta[name="pixieed-local-preview"]')?.content === '1'
    && ['127.0.0.1', 'localhost', '[::1]'].includes(windowRef.location.hostname)
    && new URL(windowRef.location.href).searchParams.get('layoutAds') === '1';

  function feedAdContext(posts, publicFeed) {
    let topLevel = false;
    try { topLevel = windowRef.top === windowRef.self; } catch { /* framed page */ }
    return {
      enabled: ordinaryAds.enabled === true,
      provider: ordinaryAds.provider,
      unit: ordinaryAds.unit,
      productionOrigin: ['https://pixieed.jp', 'https://www.pixieed.jp'].includes(windowRef.location?.origin),
      placement: 'inline',
      topLevel,
      viewportWidth: windowRef.visualViewport?.width || windowRef.innerWidth || 0,
      fullscreen: Boolean(documentRef.fullscreenElement),
      editor: documentRef.body?.classList?.contains('creation-editor') || false,
      publicFeed,
      feedReady: state.initialized && !state.feedFailed,
      partialWarning: state.readWarnings.length > 0,
      loading: state.loading,
      empty: posts.length === 0,
      privateView: state.mineMode || ['local', 'saved'].includes(state.filter),
      composerOpen: Boolean(composer.open),
      detailOpen: Boolean(detail.open || tools.open || documentRef.querySelector('#guestAccountDialog[open], [data-auth-dialog][open], .account-dialog[open]')),
      trustedContentEligible: ordinaryAds.trustedContentEligible === true,
      eligiblePostCount: posts.length,
    };
  }

  function feedGutterContext(posts, publicFeed) {
    const gutter = ordinaryAds.gutter || {};
    let topLevel = false;
    try { topLevel = windowRef.top === windowRef.self; } catch { /* framed page */ }
    return {
      enabled: gutter.enabled === true, provider: gutter.provider, unit: gutter.unit,
      pathname: windowRef.location?.pathname || '', origin: windowRef.location?.origin || '', topLevel,
      search: windowRef.location?.search || '', hash: windowRef.location?.hash || '', historyState: windowRef.history?.state || null,
      viewportWidth: windowRef.visualViewport?.width || windowRef.innerWidth || 0,
      viewportHeight: windowRef.visualViewport?.height || windowRef.innerHeight || 0,
      publicFeed, feedReady: state.initialized && !state.feedFailed,
      partialWarning: state.readWarnings.length > 0, loading: state.loading,
      empty: posts.length === 0, privateView: state.mineMode || state.filter !== 'all' || Boolean(state.query),
      composerOpen: Boolean(composer.open),
      detailOpen: Boolean(detail.open || tools.open || documentRef.querySelector('#guestAccountDialog[open], [data-auth-dialog][open], .account-dialog[open]')),
      fullscreen: Boolean(documentRef.fullscreenElement), editor: documentRef.body?.classList?.contains('creation-editor') || false,
      trustedContentEligible: gutter.trustedContentEligible === true, eligiblePostCount: posts.length,
      pageVisible: documentRef.visibilityState !== 'hidden',
    };
  }

  function retireFeedGutter() {
    if (!ordinaryGutterActivation && !ordinaryGutterGate.attempted) return;
    ordinaryGutterGate.retire();
    ordinaryGutterActivation?.cleanup?.();
    ordinaryGutterActivation = null;
    ordinaryGutterHost?.replaceChildren();
    if (ordinaryGutterHost) ordinaryGutterHost.hidden = true;
    app.classList.remove('has-ordinary-feed-gutter');
  }

  function updateFeedGutter(posts, publicFeed) {
    if (!ordinaryGutterHost) return;
    const context = feedGutterContext(posts, publicFeed);
    const eligible = context.pageVisible && isPublicFeedGutterEligible(context);
    if (!eligible) { if (ordinaryGutterActivation) retireFeedGutter(); return; }
    if (!ordinaryGutterGate.canAttempt()) return;
    const gutter = ordinaryAds.gutter || {};
    const shell = createOrdinaryDisplayAdCard(documentRef, gutter.unit, 'gutter');
    if (!shell) return;
    ordinaryGutterHost.replaceChildren(shell.card);
    ordinaryGutterHost.hidden = false;
    app.classList.add('has-ordinary-feed-gutter');
    const rightColumn = ordinaryGutterHost.closest('.right-column');
    const feedColumn = $('.feed-column', app);
    const hostRect = ordinaryGutterHost.getBoundingClientRect?.();
    const rightRect = rightColumn?.getBoundingClientRect?.();
    const feedRect = feedColumn?.getBoundingClientRect?.();
    const visible = Boolean(ordinaryGutterHost.getClientRects?.().length
      && documentRef.defaultView?.getComputedStyle?.(ordinaryGutterHost)?.display !== 'none'
      && documentRef.defaultView?.getComputedStyle?.(rightColumn)?.display !== 'none');
    const geometryFits = visible && hostRect && rightRect && feedRect
      && Math.abs(hostRect.width - 300) <= 2 && rightRect.width >= 300
      && hostRect.height >= 624
      && hostRect.left >= feedRect.right + 16 && hostRect.right <= rightRect.right + 1
      && hostRect.left >= 0 && hostRect.right <= context.viewportWidth;
    if (!geometryFits) {
      ordinaryGutterHost.replaceChildren(); ordinaryGutterHost.hidden = true;
      app.classList.remove('has-ordinary-feed-gutter');
      return;
    }
    if (!ordinaryGutterGate.markAttempt()) {
      ordinaryGutterHost.replaceChildren(); ordinaryGutterHost.hidden = true;
      app.classList.remove('has-ordinary-feed-gutter');
      return;
    }
    const activation = activateOrdinaryDisplayAd({
      ...shell, provider: gutter.provider, unit: gutter.unit, enabled: gutter.enabled === true,
      eligibility: { ...context, productionOrigin: true, desktop: context.viewportWidth > 1190 && context.viewportHeight >= 672,
        gutterFits: context.viewportWidth > 1190, contentReady: posts.length >= 24, empty: posts.length === 0 },
      kind: 'gutter',
      onOutcome(status) {
        if (['unfilled', 'blocked', 'failed', 'empty'].includes(status)) retireFeedGutter();
      },
    });
    ordinaryGutterActivation = activation;
    if (!activation.mounted) retireFeedGutter();
  }

  function reconcileFeed(nodes) {
    for (let index = 0; index < nodes.length; index += 1) {
      const current = feed.children[index] || null;
      if (current !== nodes[index]) feed.insertBefore(nodes[index], current);
    }
    while (feed.children.length > nodes.length) feed.lastElementChild.remove();
  }

  function deactivateFeedAds() {
    retireFeedGutter();
    for (const [anchorId, shell] of ordinaryAdCards) {
      ordinaryAdActivations.get(anchorId)?.cleanup?.();
      shell.card.remove();
      retiredOrdinaryAds.add(anchorId);
    }
  }

  function activateFeedAds(posts, publicFeed) {
    const context = feedAdContext(posts, publicFeed);
    if (!ordinaryAdEligibility(context)) { deactivateFeedAds(); return; }
    for (const [anchorId, shell] of ordinaryAdCards) {
      if (!shell.card.isConnected || ordinaryAdActivations.has(anchorId)) continue;
      if (!ordinaryAdPageGate.markAttempt(anchorId)) { shell.card.remove(); retiredOrdinaryAds.add(anchorId); continue; }
      const mounted = activateOrdinaryDisplayAd({
        ...shell,
        provider: ordinaryAds.provider,
        unit: ordinaryAds.unit,
        enabled: ordinaryAds.enabled === true,
        eligibility: context,
        kind: 'inline',
        onOutcome: (status) => { if (['unfilled', 'blocked', 'failed', 'empty'].includes(status)) retiredOrdinaryAds.add(anchorId); },
      });
      ordinaryAdActivations.set(anchorId, mounted);
      if (!mounted.mounted) { shell.card.remove(); retiredOrdinaryAds.add(anchorId); }
    }
  }

  function renderFlowEntry(entry) {
    if (entry.kind === 'post') {
      const id = String(entry.post?.id ?? '');
      const existing = renderedPostCards.get(id);
      if (!existing || !id) {
        const fresh = renderPost(entry.post);
        if (id) renderedPostCards.set(id, fresh);
        return fresh;
      }
      const fresh = renderPost(entry.post);
      for (const attribute of [...existing.attributes]) existing.removeAttribute(attribute.name);
      for (const attribute of [...fresh.attributes]) existing.setAttribute(attribute.name, attribute.value);
      existing.replaceChildren(...[...fresh.childNodes]);
      return existing;
    }
    if (entry.kind === 'ordinary-ad') {
      if (retiredOrdinaryAds.has(entry.anchorId)
          || !ordinaryAdPageGate.canAttempt(entry.anchorId)) return null;
      let shell = ordinaryAdCards.get(entry.anchorId);
      if (!shell) {
        shell = createOrdinaryDisplayAdCard(documentRef, ordinaryAds.unit, 'inline');
        if (!shell) { retiredOrdinaryAds.add(entry.anchorId); return null; }
        shell.card.dataset.adAnchorId = entry.anchorId;
        ordinaryAdCards.set(entry.anchorId, shell);
      }
      return shell.card;
    }
    const insertionKey = `${entry.kind}:${entry.anchorId}`;
    const existingInsertion = renderedFeedInsertions.get(insertionKey);
    if (existingInsertion) return existingInsertion;
    const card = node('aside', { class: `post-card feed-insert feed-insert--${entry.kind}`, 'data-feed-insert': entry.kind, 'data-anchor-id': entry.anchorId, 'aria-label': entry.kind === 'tool' ? 'PiXiEEDのツール紹介' : '広告枠のローカル確認' });
    if (entry.kind === 'tool') {
      card.append(node('p', { class: 'feed-insert-label' }, 'PiXiEEDのツール紹介'));
      const link = node('a', { href: entry.card.href, class: 'feed-tool-link', 'data-tool-card': entry.card.id });
      link.append(node('img', { src: entry.card.icon, alt: '', width: 32, height: 32, loading: 'lazy', decoding: 'async' }));
      const copy = node('span'); copy.append(node('strong', {}, entry.card.title), node('span', {}, entry.card.description));
      link.append(copy, node('span', { 'aria-hidden': 'true' }, '→')); card.append(link);
    } else {
      card.append(node('p', { class: 'feed-insert-label' }, '広告 · ローカル確認用'), node('p', {}, '広告が入る場合の表示位置です。現在は配信していません。'));
    }
    renderedFeedInsertions.set(insertionKey, card);
    return card;
  }

  async function navigateView(view, { push = true, restore = true, force = false } = {}) {
    if (!Object.hasOwn(FEED_VIEWS, view)) view = 'feed';
    const prior = currentView();
    if (prior !== view) viewPositions.set(prior, { scroll: windowRef.scrollY, filter: state.filter, query: state.query });
    const generation = ++viewGeneration;
    if (view === 'mine' && (!state.mineMode || force)) {
      $('#mineStatus', documentRef).textContent = '自分の投稿を読み込んでいます…';
      try {
        const result = await api.mine(); if (generation !== viewGeneration) return;
        state.minePosts = (Array.isArray(result) ? result : result?.posts || []).map(post => post.source === 'sns' ? { ...post, owned: post.owned === true } : post);
        $('#mineStatus', documentRef).textContent = `自分の投稿を${state.minePosts.length}件読み込みました。`;
      } catch (error) {
        if (generation !== viewGeneration) return;
        $('#mineStatus', documentRef).textContent = `自分の投稿を読み込めませんでした。${niceError(error, '')}`;
        if (!push) windowRef.history.replaceState(windowRef.history.state || {}, '', feedViewUrl(windowRef.location.href, prior));
        return;
      }
    }
    if (generation !== viewGeneration) return;
    const saved = viewPositions.get(view);
    state.mineMode = view === 'mine';
    state.filter = view === 'local' || view === 'saved' ? view : view === 'feed' ? saved?.filter && !['saved', 'local'].includes(saved.filter) ? saved.filter : 'all' : 'all';
    state.query = view === 'feed' ? saved?.query || '' : '';
    const search = $('#socialSearch', documentRef); if (search) search.value = state.query;
    if (push && prior !== view) windowRef.history.pushState({ ...(windowRef.history.state || {}), socialView: view }, '', feedViewUrl(windowRef.location.href, view));
    render(); void savePreferences({ filter: state.filter });
    if (restore && prior !== view) windowRef.scrollTo({ top: saved?.scroll || 0, behavior: 'instant' });
  }

  function render() {
    updateFilters();
    const focused = documentRef.activeElement?.closest?.('[data-post-id] [data-action]');
    const restore = focused ? { id: focused.closest('[data-post-id]')?.dataset.postId, action: focused.dataset.action } : null;
    const scrollY = windowRef.scrollY;
    const draftsPanel = $('#draftsPanel', documentRef); if (draftsPanel) draftsPanel.hidden = state.filter !== 'local';
    feed.hidden = state.filter === 'local';
    if (state.filter === 'local') {
      deactivateFeedAds(); renderDrafts(); feed.replaceChildren(); feed.setAttribute('aria-busy', 'false'); retry.hidden = true;
      updateReadWarningDetails(false); statusText('下書きはこの端末に保存されています。'); return;
    }
    const posts = filteredPosts();
    const showReadWarnings = state.filter !== 'saved';
    const eligible = !state.mineMode && state.filter === 'all' && !state.query;
    const feedAdEligible = ordinaryAdEligibility(feedAdContext(posts, eligible));
    const flow = planFeedFlow(posts, {
      enabled: eligible,
      previewAds,
      ordinaryAdEnabled: feedAdEligible,
      ordinaryAdAnchorId: ordinaryAdPageGate.attemptedAnchorId,
      previousPlan: publicFlow,
    });
    if (eligible) publicFlow = flow;
    reconcileFeed(flow.map(renderFlowEntry).filter(Boolean));
    activateFeedAds(posts, eligible);
    feed.setAttribute('aria-busy', 'false');
    if (!posts.length) feed.append(renderEmptyState());
    updateFeedGutter(posts, eligible);
    if (showReadWarnings && state.readWarnings.length) {
      const range = posts.length ? `${posts.length}件を表示中。` : '取得できた範囲: 0件。';
      statusText(`${range}公開元の一部は未取得です。再試行できます。`);
    } else statusText(posts.length
      ? `${posts.length}件を表示中${state.mineMode ? '（自分の投稿）' : '（最新30件まで）'}`
      : '表示件数: 0件。');
    updateReadWarningDetails(showReadWarnings);
    retry.hidden = !showReadWarnings || !state.readWarnings.length;
    updateFilters();
    if (restore) {
      const replacement = feed.querySelector(`[data-post-id="${CSS.escape(restore.id)}"] [data-action="${CSS.escape(restore.action)}"]`);
      replacement?.focus({ preventScroll: true });
      if (!replacement) $('#feedFilters [aria-pressed="true"]', app)?.focus({ preventScroll: true });
      windowRef.scrollTo({ top: scrollY, behavior: 'instant' });
    }
  }
  function renderEmptyState() {
    let heading, message, action, actionLabel;
    if (state.mineMode) {
      heading = state.readWarnings.length ? '自分の投稿を確認できません' : '自分の投稿はありません'; message = state.readWarnings.length ? '公開元の一部を読み込めていません。再試行できます。' : '作品やことばを投稿すると、ここで確認できます。'; action = { 'data-compose': '', 'data-type': 'art' }; actionLabel = '作品を投稿する';
    } else if (state.filter === 'saved') {
      heading = '保存した作品はありません'; message = 'みんなの作品を見て、気になる作品を保存できます。'; action = { 'data-action': 'view', 'data-view': 'feed' }; actionLabel = 'みんなの作品を見る';
    } else if (state.query) {
      heading = state.readWarnings.length ? '取得できた作品に一致するものはありません' : '一致する作品はありません'; message = '別の言葉で検索するか、検索を消してください。'; action = { 'data-action': 'clear-search' }; actionLabel = '検索をクリア';
    } else if (state.filter !== 'all') {
      heading = state.readWarnings.length ? `取得できた範囲に${LABELS[state.filter] || 'この種類'}の作品はありません` : `${LABELS[state.filter] || 'この種類'}の作品はありません`; message = '種類をすべてに戻して、ほかの作品も見られます。'; action = { 'data-action': 'filter', 'data-type': 'all' }; actionLabel = 'すべての種類を見る';
    } else {
      heading = state.readWarnings.length ? '公開作品を確認できません' : '公開作品がまだ見つかりません'; message = state.readWarnings.length ? '公開元の一部を読み込めていません。再試行するか、作品を作れます。' : '作品を作って、公開する設定で投稿できます。'; action = { 'data-compose': '', 'data-type': 'art' }; actionLabel = '作品を作る';
    }
    const card = node('section', { class: 'feed-empty-state', 'aria-labelledby': 'feedEmptyTitle' });
    card.append(node('span', { class: 'feed-empty-mark', 'aria-hidden': 'true' }, '＋'), node('h2', { id: 'feedEmptyTitle' }, heading), node('p', {}, message));
    const button = node('button', { type: 'button', class: 'feed-empty-action', ...action }, actionLabel);
    card.append(button);
    return card;
  }
  function updateReadWarningDetails(visible = true) {
    const details = $('#feedWarningDetails', documentRef), list = $('#feedWarningList', documentRef);
    if (!details || !list) return;
    details.hidden = !visible || !state.readWarnings.length;
    list.replaceChildren(...state.readWarnings.map((warning) => node('li', {}, warning)));
  }
  function updateFilters() {
    $$('#feedFilters [data-action="filter"]', app).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.type === state.filter && !state.mineMode)));
    const mine = $('#minePosts', documentRef); if (mine) mine.setAttribute('aria-pressed', String(state.mineMode));
    const view = state.mineMode ? 'mine' : state.filter === 'local' ? 'local' : state.filter === 'saved' ? 'saved' : 'feed';
    const [title, description] = FEED_VIEWS[view];
    $('#pageTitle', documentRef).textContent = explorePage && view === 'feed' ? '探す' : title;
    $('#viewDescription', documentRef).textContent = explorePage && view === 'feed' ? '読み込んだ公開作品を、作者・ことば・種類から探します。' : description;
    const searchLabel = $('#socialSearch', documentRef)?.closest('.explore-search');
    if (searchLabel) {
      searchLabel.hidden = view !== 'feed';
      const note = searchLabel.nextElementSibling;
      if (note?.classList.contains('explore-search-note')) note.hidden = view !== 'feed';
    }
    for (const button of $$('.rail-link[data-action="saved"]', app)) button.setAttribute('aria-pressed', String(view === 'saved'));
    // Page destinations stay selected independently of local saved/draft tabs.
    $$('#feedViews [data-action="view"]', app).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    const filters = $('#feedFilterWrap', documentRef); if (filters) filters.hidden = view !== 'feed';
    const filterSummary = filters?.querySelector('summary');
    if (filterSummary) filterSummary.textContent = `種類: ${LABELS[state.filter] || 'すべて'} ▾`;
  }
  function renderDrafts() {
    if (!draftsHost || $('#draftsPanel', documentRef)?.hidden) return;
    const focusedId = documentRef.activeElement?.closest?.('[data-draft-id]')?.dataset.draftId;
    drafts.list().then((items) => {
      if (!items.length) {
        const empty = node('div', { class: 'drafts-empty-state' });
        empty.append(node('p', {}, '下書きはこの端末に保存され、公開されません。'), node('button', { type: 'button', class: 'draft-empty-action', 'data-compose': '', 'data-type': 'art' }, '下書きを作る'));
        draftsHost.replaceChildren(empty); return;
      }
      const rows = items.map((draft) => {
        const row = node('article', { class: 'draft-row' });
        const open = node('button', { type: 'button', 'data-action': 'open-draft', 'data-draft-id': draft.id }, `${LABELS[draft.mode] || '下書き'} · ${draft.title || 'タイトル未設定'} · ${formatDate(draft.savedAt)}`);
        const remove = node('button', { type: 'button', 'data-action': 'remove-draft', 'data-draft-id': draft.id, 'aria-label': '下書きを削除' }, '削除');
        const menu = node('details', { class: 'draft-row-actions' }); menu.append(node('summary', { 'aria-label': `${draft.title || 'この下書き'}の操作` }, '操作'), remove);
        row.append(open, menu); return row;
      });
      draftsHost.replaceChildren(...rows);
      if (focusedId) (draftsHost.querySelector(`[data-draft-id="${CSS.escape(focusedId)}"]`) || draftsHost.querySelector('[data-action="open-draft"]'))?.focus({ preventScroll: true });
    }).catch((error) => draftsHost.replaceChildren(node('p', { class: 'drafts-empty' }, `下書きを読み込めませんでした。${niceError(error, '')}`)));
  }
  async function refresh({ initial = false } = {}) {
    if (state.loading) return;
    state.loading = true; state.feedFailed = false; retry.hidden = true; state.readWarnings = [];
    deactivateFeedAds();
    updateReadWarningDetails(state.filter !== 'saved' && state.filter !== 'local');
    if (initial) { feed.setAttribute('aria-busy', 'true'); statusText('公開作品を読み込んでいます…'); }
    try {
      const latest = await api.list({ limit: 30 });
      state.readWarnings = typeof api.getReadWarnings === 'function' ? api.getReadWarnings() : [];
      updateReadWarningDetails();
      // The successful response is ready before rendering. Otherwise the
      // initial feed permanently renders with ad eligibility still loading.
      state.loading = false;
      const oldIds = new Set(state.posts.map((post) => post.id));
      if (!state.initialized || initial) { state.posts = latest; state.initialized = true; render(); }
      else {
        state.staged = latest.filter((post) => !oldIds.has(post.id));
        if (state.staged.length) { $('#newPostsSlot', documentRef).hidden = false; $('#newPostsButton', documentRef).textContent = `↑ 新着 ${state.staged.length} 件を表示`; }
        else toast('新しい公開投稿はありません。');
        render();
      }
    } catch (error) {
      state.feedFailed = true;
      deactivateFeedAds();
      feed.setAttribute('aria-busy', 'false');
      if (state.filter === 'local') statusText('下書きはこの端末に保存されています。');
      else if (state.filter === 'saved') statusText('保存した作品はこの端末で管理されます。');
      else { statusText(`作品を読み込めませんでした。${niceError(error, '接続を確認して再試行してください。')}`); retry.hidden = false; }
      updateReadWarningDetails(state.filter !== 'saved' && state.filter !== 'local');
    } finally { state.loading = false; $('#refreshFeed', documentRef)?.removeAttribute('aria-busy'); }
  }
  function acceptNewPosts() {
    if (!state.staged.length) return;
    state.posts = [...state.staged, ...state.posts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30); state.staged = [];
    $('#newPostsSlot', documentRef).hidden = true; render();
    windowRef.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    const first = feed.querySelector('[data-post-id]'); if (first) { first.tabIndex = -1; first.focus({ preventScroll: true }); }
  }
  function makeDraftFromInputs() { return selectedDraft(); }
  function selectComposerPane(pane) {
    state.composerPane = pane;
    for (const element of form.querySelectorAll('[data-composer-pane]')) element.hidden = element.dataset.composerPane !== pane;
    for (const button of form.querySelectorAll('[data-action="composer-pane"]')) {
      const selected = button.dataset.pane === pane;
      button.setAttribute('aria-pressed', String(selected)); button.setAttribute('aria-expanded', String(selected));
    }
  }
  function setMode(mode) {
    consentUi.reset();
    if (!MODES.has(mode)) mode = 'art';
    if (mode === 'puzzle' && state.mode !== 'puzzle' && visibilityInput) visibilityInput.value = 'private';
    state.mode = mode;
    $$('.composer-types [data-action="composer-type"]', app).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.type === mode)));
    $('#composerTitle', composer).textContent = mode === 'text' || mode === 'music' ? `${LABELS[mode]}を投稿` : '作品を投稿';
    const isServerType = mode === 'text' || mode === 'music';
    $('#composerLocationFields', form).hidden = isServerType || mode === 'puzzle' && visibilityInput?.value !== 'public';
    $('#composerVisibilityFields', form).hidden = !(isServerType || mode === 'puzzle');
    for (const option of visibilityInput?.options || []) option.textContent = mode === 'puzzle' ? (option.value === 'public' ? '投稿する（みんなが遊べる）' : '自分だけで遊ぶ（端末内）') : (option.value === 'public' ? '公開（フィードに掲載）' : '自分用（この端末）');
    const help = $('#composerVisibilityHelp',form); if (help) help.textContent = mode === 'puzzle' ? '自分だけなら素材は送信しません。投稿する場合だけ公開送信し、公開確認後に遊ぶリンクを表示します。' : 'ゲストでも投稿できます。公開を選ぶとフィードに掲載されます。下書きはこの端末に保存されます。';
    $('#musicPublishHelp', form).hidden = mode !== 'music';
    updateComposerSummary();
    modeStatus.textContent = mode === 'text' || mode === 'music'
      ? `${LABELS[mode]}は公開を選んだときだけサーバーに送信します。初期設定は端末内の自分用保存です。元音源と下書きは保持します。${state.attachment ? ' 添付画像はこの投稿には含めません。' : ''}${state.audioRecord && mode !== 'music' ? ' 添付音声はモードを変えても下書きに保持します。' : ''}`
      : '作品画像と緯度・経度または地図URLを指定すると、既存の投稿方式で掲載できます。';
    if (mode === 'puzzle') modeStatus.textContent = '作成したパズルを端末内で遊ぶか、投稿してみんなに遊んでもらうか選べます。';
    submitButton.hidden = false;
    tell(mode === 'puzzle' ? (visibilityInput?.value === 'public' ? '投稿する設定です。内容を確認してから送信してください。' : '自分だけで遊ぶ設定です。素材を外へ送信しません。') : isServerType ? (visibilityInput?.value === 'public' ? '公開を選択しています。サーバーが受理した場合に公開状態を確認します。' : '自分用を選択しています。この端末に保存し、素材は送信しません。') : '投稿内容は既存の投稿方式で送信します。');
  }
  function updateComposerSummary() {
    const publicChoice = visibilityInput?.value === 'public';
    consentUi.setPublic(publicChoice);
    submitButton.disabled = state.busy || state.submitted || publicChoice && !consentUi.accepted;
    const scope = $('#composerVisibilitySummary', form); if (!scope) return;
    const serverType = state.mode === 'text' || state.mode === 'music';
    const puzzle = state.mode === 'puzzle', publicPuzzle = puzzle && visibilityInput?.value === 'public';
    $('#composerLocationFields',form).hidden = serverType || !publicChoice;
    submitButton.textContent = puzzle && !publicPuzzle ? (!hasUncertainPuzzlePublication(state.activeDraft) && localPuzzlePlayPath(state.localPuzzle) ? '自分だけで遊ぶ' : '自分用に保存') : visibilityInput?.value !== 'public' ? '自分用に保存' : '投稿する';
    scope.textContent = puzzle ? `パズル · ${publicPuzzle ? '投稿する（公開）' : '自分だけで遊ぶ（端末内）'}（タップして変更）` : serverType
      ? `${LABELS[state.mode]} · 公開範囲: ${visibilityInput?.value === 'public' ? '公開' : '自分用（この端末）'}（タップして設定）`
      : !publicChoice ? `${LABELS[state.mode]} · 自分用（この端末）` : `${LABELS[state.mode]} · 地図の掲載先: ${locationInput?.value.trim() ? '入力済み（タップして確認）' : '未設定（タップして入力）'}`;
  }
  function putAttachment(image, puzzle = null) {
    state.archiveSaved = false;
    state.attachment = { ...image, puzzle };
    if (!puzzle) state.localPuzzle = null;
    const img = node('img', { src: image.dataUrl, alt: '添付作品', loading: 'lazy' });
    if (image.width) img.width = image.width; if (image.height) img.height = image.height;
    preview.replaceChildren(img); requestAutosave();
  }
  function clearAudio() {
    const audio = $('#composerAudio', preview); if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl); state.audioUrl = null; state.output = null; state.audioRecord = null;
    if (audioDetachButton) audioDetachButton.hidden = true;
  }
  function renderAudioRecord(record) {
    if (record.needsPersist) state.archiveSaved = false;
    clearAudio(); state.archiveSaved = false; state.audioGeneration++; state.audioRecord = record; state.audioDetached = false;
    state.audioWarning = '';
    state.audioUrl = URL.createObjectURL(record.blob);
    const audio = node('audio', { id: 'composerAudio', controls: true, preload: 'none', src: state.audioUrl, 'aria-label': '添付した音声の再生' });
    const download = node('a', { href: state.audioUrl, download: record.filename || 'pixieed-audio', class: 'output-download' }, '元の音声ファイルを保存');
    const metadata = node('p', { class: 'composer-help' }, `${record.filename || '音声ファイル'} · ${(record.size || record.blob.size).toLocaleString()} bytes。端末のブラウザー保存領域に保管されますが、データ消去・容量整理で失われる場合があります。`);
    const nodes = [audio, download, metadata];
    try {
      const returnUrl = record.returnUrl && new URL(record.returnUrl, windowRef.location.origin);
      if (returnUrl?.origin === windowRef.location.origin) nodes.push(node('a', { href: returnUrl.href, class: 'output-return' }, '元の制作画面へ戻る'));
    } catch { /* Ignore invalid or external return routes. */ }
    preview.replaceChildren(...nodes);
    audioDetachButton.hidden = false;
  }
  async function loadStoredAudio(id, generation = state.composerGeneration) {
    try {
      const record = await drafts.readAudio(id);
      if (generation !== state.composerGeneration || state.pageHidden) return false;
      if (!record?.blob || !(record.mime || record.blob.type || '').startsWith('audio/')) throw new Error('保存音声の形式を確認できません。');
      renderAudioRecord({ ...record, needsPersist: false });
      return true;
    } catch (error) {
      if (generation === state.composerGeneration && !state.pageHidden) { state.audioWarning = `端末の保存音声を読み込めませんでした。下書き参照は保持しています。${niceError(error, '')}`; tell(state.audioWarning); }
      return false;
    }
  }
  async function attachStoredAudio(id) {
    if (state.busy || state.submitted) return;
    if (!composer.open) await openComposer('music');
    if (!composer.open || state.pageHidden) return;
    const generation = state.composerGeneration;
    try {
      const record = await drafts.readAudio(id);
      if (generation !== state.composerGeneration || state.pageHidden || !composer.open) return;
      if (!record?.blob || !(record.mime || record.blob.type || '').startsWith('audio/')) throw new Error('保存音声の形式を確認できません。');
      state.output = null; state.outputId = null; state.outputDetached = true;
      renderAudioRecord({ ...record, needsPersist: false }); setMode('music');
      try { await saveActive(); tell('保存した音源を音楽の下書きに添付しました。公開はされず、音源はこの端末のブラウザー保存領域に残ります。'); }
      catch (error) { tell(`音源を画面に読み込みましたが、下書き参照の保存に失敗しました。再試行できます。${niceError(error, '')}`); }
    } catch (error) { if (generation === state.composerGeneration) tell(`保存音源を添付できませんでした。${niceError(error, '')}`); }
  }
  async function refreshAudioList() {
    if (!audioList) return;
    audioList.replaceChildren(node('p', { class: 'drafts-empty' }, '音声ファイルを確認しています…'));
    try {
      const items = await drafts.listAudio();
      state.audioListLoaded = true;
      if (!items.length) { audioList.replaceChildren(node('p', { class: 'drafts-empty' }, '保存した音声ファイルはありません。')); return; }
      audioList.replaceChildren(...items.map((item) => {
        const row = node('div', { class: 'draft-audio-row' });
        const references = item.references ?? item.referenceCount ?? 0;
        const info = node('div'); info.append(node('strong', {}, item.filename || '音声ファイル'), node('small', {}, `${(item.size || 0).toLocaleString()} bytes · ${references}件の下書き参照`));
        const actions = node('div', { class: 'draft-audio-actions' });
        actions.append(node('button', { type: 'button', class: 'draft-audio-attach', 'data-action': 'use-audio', 'data-audio-id': item.id }, 'この音源を添付'));
        actions.append(node('button', { type: 'button', class: 'draft-audio-remove', 'data-action': 'remove-audio', 'data-audio-id': item.id, disabled: references > 0 }, references ? '使用中' : '削除'));
        row.append(info, actions); return row;
      }));
    } catch (error) { audioList.replaceChildren(node('p', { class: 'drafts-empty' }, `音声一覧を読み込めませんでした。${niceError(error, '')}`)); }
  }
  async function loadOutput(id) {
    const generation = state.composerGeneration;
    if (state.busy || state.submitted) return;
    try {
      const { loadSocialOutput } = await import('./tool-handoff.mjs?rev=20261021-jigsaw-public-1');
      const output = await loadSocialOutput(id);
      if (generation !== state.composerGeneration || state.pageHidden) return;
      if (!output || !output.mime.startsWith('audio/')) { tell('この音声出力を端末から読み込めません。元の制作ツールから開き直してください。'); return; }
      renderAudioRecord({ id: null, blob: output.blob, filename: output.filename, mime: output.mime, size: output.blob.size, sourceOutputId: id, returnUrl: output.returnUrl, needsPersist: true });
      state.output = output; state.outputId = null; state.outputDetached = true; state.mode = 'music';
      if (titleInput && !titleInput.value) titleInput.value = output.metadata?.title || output.filename || '音の作品';
      if (captionInput && !captionInput.value && typeof output.metadata?.caption === 'string') captionInput.value = text(output.metadata.caption, 180);
      setMode('music'); tell('元の制作出力を開きました。端末内の下書き保存時に元の音声を保管します。フィードには公開できません。');
      if (state.draftReady && composer.open) requestAutosave();
    } catch (error) {
      if (generation === state.composerGeneration && !state.pageHidden) { state.audioWarning = `音声出力を読み込めませんでした。元の下書き参照は保持しています。${niceError(error, '')}`; tell(state.audioWarning); }
    }
  }
  async function adopt(kind) {
    const token = ++state.handoffToken;
    const generation = state.composerGeneration;
    try {
      const { adoptSocialHandoff } = await import('./tool-handoff.mjs?rev=20261021-jigsaw-public-1');
      const handoff = await adoptSocialHandoff(kind);
      if (token !== state.handoffToken || generation !== state.composerGeneration || state.pageHidden || !composer.open || !handoff) { if (token === state.handoffToken && composer.open) tell('ツールの引き継ぎデータが見つかりません。元のツールからもう一度戻ってください。'); return; }
      const { inspectPixelImage } = await import('../globe/post-image.mjs');
      const image = await inspectPixelImage(handoff.image.file, { keepScale: true });
      if (handoff.payload?.image && (image.width !== handoff.payload.image.width || image.height !== handoff.payload.image.height || image.colorCount !== handoff.payload.image.colorCount)) {
        throw new Error('パズル画像の情報と引き継いだデータが一致しません。元のツールから再度戻ってください。');
      }
      if (token !== state.handoffToken || generation !== state.composerGeneration || state.pageHidden || !composer.open) return;
      state.receipt = handoff.receipt;
      const mode = handoff.kind === 'pixel-camera' ? 'photo' : ['spot-difference', 'hidden-object', 'jigsaw'].includes(handoff.kind) ? 'puzzle' : 'art';
      const metadata = handoff.metadata || {};
      if (metadata.title && titleInput && !titleInput.value) titleInput.value = text(metadata.title, 60);
      if (metadata.caption && captionInput && !captionInput.value) captionInput.value = text(metadata.caption, 180);
      if (metadata.pin && Number.isFinite(metadata.pin.latitude) && Number.isFinite(metadata.pin.longitude) && !locationInput.value) locationInput.value = `${metadata.pin.latitude}, ${metadata.pin.longitude}`;
      const handedRequestKey = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(metadata.requestKey || '')) ? metadata.requestKey : null;
      state.localPuzzle = handoff.localPuzzle || null;
      setMode(mode); if (mode === 'puzzle' && visibilityInput) visibilityInput.value = handoff.publicationIntent === 'public' ? 'public' : 'private';
      updateComposerSummary(); state.activeDraft = { ...(state.activeDraft || {}), mode, puzzle: handoff.payload?.puzzle || undefined, handoffReceipt: handoff.receipt, ...(handedRequestKey ? { requestKey: handedRequestKey, requestDigest: undefined } : {}) };
      putAttachment(image, handoff.payload?.puzzle || null);
      tell(mode === 'puzzle' ? 'パズルを引き継ぎました。自分だけで遊ぶか、投稿するかを確認してください。まだ素材を送信していません。' : '制作ツールの作品を引き継ぎました。掲載先を入力して投稿するか、下書きとして保存できます。');
      selectComposerPane('content'); deactivateFeedAds(); if (!composer.open) composer.showModal(); titleInput?.focus({ preventScroll: true });
    } catch (error) { if (token === state.handoffToken) tell(`作品の引き継ぎを確認できませんでした。${niceError(error, '')}`); }
  }
  async function openComposer(mode = 'art', { historyPush = true, draft = null } = {}) {
    consentUi.reset();
    const generation = ++state.composerGeneration;
    state.audioWarning = '';
    state.fileGeneration++;
    await startupReady;
    if (generation !== state.composerGeneration || state.pageHidden) return;
    state.handoffToken++;
    state.draftReady = false;
    state.submitted = false; state.submissionCleared = false; state.archiveSaved = false;
    lockComposer(false);
    state.priorFocus = documentRef.activeElement;
    if (draft) {
      clearAudio(); preview.replaceChildren(); state.attachment = null;
      state.localPuzzle = draft.localPuzzle || null; state.activeDraft = draft; state.attachment = draft.image ? { ...draft.image, file: null, puzzle: draft.puzzle } : null;
      state.receipt = draft.handoffReceipt || null; state.outputId = draft.outputId || null; state.outputDetached = false; state.audioDetached = false;
      mode = draft.mode; titleInput.value = draft.title || ''; captionInput.value = draft.caption || ''; locationInput.value = draft.location || ''; if (visibilityInput) visibilityInput.value = draft.visibility || 'private';
      if (state.attachment) putAttachment(state.attachment, draft.puzzle || null);
      if (draft.audioId) await loadStoredAudio(draft.audioId, generation);
      else if (state.outputId) await loadOutput(state.outputId);
    } else if (state.activeDraft) {
      state.localPuzzle = state.activeDraft.localPuzzle || null;
      titleInput.value = state.activeDraft.title || ''; captionInput.value = state.activeDraft.caption || ''; locationInput.value = state.activeDraft.location || ''; if (visibilityInput) visibilityInput.value = state.activeDraft.visibility || 'private';
      state.audioDetached = false; state.outputDetached = false; state.outputId = state.activeDraft.outputId || null;
      if (state.activeDraft.image) {
        state.attachment = { ...state.activeDraft.image, file: null, puzzle: state.activeDraft.puzzle };
        const img = node('img', { src: state.attachment.dataUrl, alt: '添付作品', loading: 'lazy' });
        if (state.attachment.width) img.width = state.attachment.width; if (state.attachment.height) img.height = state.attachment.height;
        preview.replaceChildren(img);
      }
      if (state.activeDraft.audioId) await loadStoredAudio(state.activeDraft.audioId, generation);
      else if (state.outputId) await loadOutput(state.outputId);
      else clearAudio();
    } else { state.localPuzzle = null; clearAudio(); state.outputId = null; state.audioDetached = false; state.outputDetached = false; if (visibilityInput) visibilityInput.value = 'private'; }
    if (mode === 'puzzle' && visibilityInput) visibilityInput.value = 'private';
    setMode(mode); selectComposerPane('content');
    if (generation !== state.composerGeneration || state.pageHidden) return;
    state.draftReady = true;
    deactivateFeedAds(); if (!composer.open) composer.showModal();
    state.composerUrl = new URL(windowRef.location.href);
    if (historyPush) { windowRef.history.pushState({ ...(windowRef.history.state || {}), socialComposer: true, composerType: mode }, '', `${windowRef.location.pathname}${windowRef.location.search}${windowRef.location.hash}`); }
    (titleInput || composer).focus({ preventScroll: true });
    if (state.audioWarning) tell(state.audioWarning);
    if (mode === 'puzzle' && hasUncertainPuzzlePublication(state.activeDraft)) tell('前の投稿の送信結果は未確認です。自分用保存に変えても、前の公開を取り消すことにはなりません。');
    if (state.audioRecord?.needsPersist) requestAutosave();
  }
  async function saveDraft() {
    if (state.busy || state.submitted || state.archiveSaved) return;
    lockComposer(true);
    try {
      await state.saveChain.catch(() => {});
      const audioGeneration = state.audioGeneration;
      const audio = audioOption();
      const record = await drafts.archive(makeDraftFromInputs(), { audio });
      if (audio && audioGeneration === state.audioGeneration && record.audioId) state.audioRecord = { ...state.audioRecord, id: record.audioId, needsPersist: false };
      state.archiveSaved = true;
      try {
        state.saveChain = state.saveChain.catch(() => {}).then(() => drafts.clearActive());
        await state.saveChain; state.activeDraft = hasUncertainPuzzlePublication(record) ? record : null;
        tell(hasUncertainPuzzlePublication(record) ? `端末内に保存しました（${record.id}）。前の投稿の送信結果は未確認です。公開取消を意味しません。` : `この端末に下書きを保存しました（${record.id}）。この保存では公開送信していません。`); toast('下書きをこの端末に保存しました。');
      } catch (error) { tell(`下書きは保存しました（${record.id}）。作業中の下書き整理には失敗しました。${niceError(error, '')}`); }
      renderDrafts(); if (state.audioListLoaded) void refreshAudioList();
      return record;
    } catch (error) { tell(`下書きを保存できませんでした。入力内容は残っています。${niceError(error, '')}`); }
    finally { lockComposer(false); }
  }
  async function submitPost(event) {
    event.preventDefault(); if (state.busy || state.submitted) return;
    const mode = state.mode;
    if (['art','photo'].includes(mode) && state.attachment?.puzzle) { tell('パズルの公開設定を確認してください。パズルを選ぶと、自分だけで遊ぶか投稿するかを決められます。'); return; }
    if (mode === 'puzzle' && visibilityInput?.value !== 'public') {
      if (state.archiveSaved) { tell('この端末に保存済みです。前に公開送信したことがある場合、その送信結果は別に確認してください。'); return; }
      try {
        const local = await savePuzzleForSelf({draft:makeDraftFromInputs(),source:state.localPuzzle,save:()=>saveDraft()});
        if (local.publicationUncertain) tell('この保存では素材を送信していません。前の投稿の送信結果は未確認です。公開を取り消した状態ではありません。同じ投稿内容・送信番号で再試行して確認してください。');
        else if (local.playHref && !state.pageHidden && composer.open) windowRef.location.assign(local.playHref);
        else tell('パズルを自分用にこの端末へ保存しました。公開していません。作成元のツールで試しプレイできます。');
      } catch (error) { tell(niceError(error,'この端末への保存を確認できませんでした。この保存では公開送信していません。以前の投稿結果は別に確認してください。')); }
      return;
    }
    if (visibilityInput?.value !== 'public') { await saveDraft(); return; }
    let postingConsent;
    try { postingConsent = consentUi.read(); } catch (error) { tell(error.message); consentUi.focus(); return; }
    if (mode === 'puzzle' && !state.attachment?.puzzle) { tell('パズル作成ツールで作った問題を選んでください。画像だけではパズルとして投稿できません。'); return; }
    if (mode === 'text' || mode === 'music') { await submitServerPost(mode); return; }
    if (state.audioRecord || (!state.audioDetached && state.activeDraft?.audioId)) { tell('この投稿方式では音声を公開できません。音声を外すか、音楽のローカル下書きとして保存してください。'); return; }
    if (!state.attachment) { tell('PNG / WebP のドット絵を添付してください。'); selectComposerPane('attachment'); $('#composerAttachment', form)?.focus({ preventScroll: true }); return; }
    if (!text(titleInput.value, 60)) { tell('作品タイトルを入力してください。'); selectComposerPane('content'); titleInput.focus({ preventScroll: true }); return; }
    lockComposer(true);
    let cell;
    try { const { cellFromPlaceInput } = await import('../creation/legacy-placement.mjs'); cell = cellFromPlaceInput(locationInput.value); }
    catch (error) { tell(`掲載先を確認してください。${niceError(error, '緯度・経度または地図URLを入力してください。')}`); lockComposer(false); selectComposerPane('settings'); locationInput.focus({ preventScroll: true }); return; }
    tell('既存の投稿方式に送信しています。結果が分からない場合は同じ下書きから再試行できます。');
    try {
      await state.saveChain;
      const title = text(titleInput.value, 60), caption = text(captionInput.value, 180);
      if (!title) throw new Error('作品タイトルを入力してください。');
      const puzzlePayload = mode === 'puzzle' ? state.attachment.puzzle || null : null;
      const sourceDigest = await sha256(JSON.stringify({ title, caption, location: cell.id, mode, image: state.attachment.dataUrl, puzzle: puzzlePayload }));
      let requestKey = state.activeDraft?.requestKey;
      if (requestKey && state.activeDraft?.requestDigest && state.activeDraft.requestDigest !== sourceDigest) requestKey = null;
      requestKey ||= uuid();
      const post = { title, caption, postingConsent, image: state.attachment, pin: { cellId: cell.id, latitude: cell.center.latitude, longitude: cell.center.longitude, source: 'cell' }, postKind: mode === 'photo' ? 'pixel_camera' : 'pixel_art', requestKey, ...(puzzlePayload ? { puzzle: puzzlePayload, visibility:'public' } : {}) };
      const sendingDraft = { ...makeDraftFromInputs(), requestKey, requestDigest: sourceDigest, ...(puzzlePayload ? {puzzlePublicationAttempt:{requestKey,status:'uncertain'}} : {}) };
      await queueActiveSave(sendingDraft); // Persist idempotency identity before any network write.
      const result = await api.submit(post);
      if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(result?.id || '')) || !['published', 'pending'].includes(result?.status)) {
        throw new Error('送信結果を確認できませんでした。下書きと送信番号を保持しています。');
      }
      if (state.receipt) {
        try { const { consumeSocialHandoff } = await import('./tool-handoff.mjs?rev=20261021-jigsaw-public-1'); state.receiptConsumed = consumeSocialHandoff(state.receipt); }
        catch { /* Receipt remains recoverable if the handoff store cannot be read. */ }
      }
      state.submitted = true; lockComposer(false); freezeComposer();
      let cleared = false;
      try { state.saveChain = state.saveChain.catch(() => {}).then(() => drafts.clearActive()); await state.saveChain; cleared = true; }
      catch { /* The server already accepted it. Keep the stable request identity for recovery. */ }
      state.submissionCleared = cleared;
      if (cleared) { state.activeDraft = null; state.attachment = null; state.receipt = null; state.outputId = null; clearAudio(); }
      cleanComposerQuery();
      tell(result.status === 'published' ? '投稿が公開されました。フィードを更新しました。閉じるボタンで戻れます。' : '投稿を受け付けました。公開審査中です。閉じるボタンで戻れます。');
      if (!cleared) tell(`${composerStatus.textContent} 端末の下書き整理ができなかったため、送信番号を残しています。`);
      if (state.receipt && state.receiptConsumed === false) tell(`${composerStatus.textContent} 引き継ぎ元が更新されていたため、元データを保持しました。`);
      const playHref = puzzlePayload ? publicPuzzlePlayPath(result,puzzlePayload.mode) : null;
      if (playHref) composerStatus.append(documentRef.createTextNode(' '),node('a',{href:playHref},'公開したパズルで遊ぶ'));
      await refresh({ initial: true }); renderDrafts();
    } catch (error) { lockComposer(false); tell(`投稿を確認できませんでした。下書きと送信番号を保持しています。同じ内容なら同じ番号で再試行できます。${niceError(error, '')}`); }
    finally { if (!state.submitted) lockComposer(false); }
  }
  async function checkWavDuration(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const audio = node('audio', { preload: 'metadata' });
      return await new Promise((resolve, reject) => {
        const timer = windowRef.setTimeout(() => finish(new Error('音源の再生時間を確認できません。WAVファイルを確認してください。')), 8000);
        const finish = (error, duration) => { windowRef.clearTimeout(timer); audio.removeAttribute('src'); audio.load(); error ? reject(error) : resolve(duration); };
        audio.onloadedmetadata = () => Number.isFinite(audio.duration) && audio.duration > 0 ? finish(null, audio.duration) : finish(new Error('音源の再生時間を確認できません。'));
        audio.onerror = () => finish(new Error('音源をWAVとして読み取れません。元の音声は端末に残っています。'));
        audio.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  async function submitServerPost(mode) {
    if (state.busy || state.submitted) return;
    // A private choice is an on-device save, never an implicit server upload.
    if (visibilityInput?.value !== 'public') { await saveDraft(); return; }
    let postingConsent;
    try { postingConsent = consentUi.read(); } catch (error) { tell(error.message); consentUi.focus(); return; }
    lockComposer(true);
    const invalid = (message, focus) => { tell(message); lockComposer(false); if (focus) { selectComposerPane(focus === locationInput ? 'settings' : 'content'); focus.focus({ preventScroll: true }); } };
    const title = text(titleInput.value, 60), caption = text(captionInput.value, 180);
    const visibility = ['public', 'private'].includes(visibilityInput?.value) ? visibilityInput.value : 'private';
    if (!title) { invalid('作品タイトルを入力してください。', titleInput); return; }
    if (mode === 'text' && !caption) { invalid('ことばの投稿本文を入力してください。', captionInput); return; }
    let audio;
    if (mode === 'music') {
      let record;
      try { record = state.audioRecord || (state.activeDraft?.audioId ? await drafts.readAudio(state.activeDraft.audioId) : null); }
      catch (error) { invalid(`端末の音源を読み込めませんでした。元音源と下書きの参照は保持しています。${niceError(error, '')}`); return; }
      if (!record?.blob) { invalid('音楽を送信するには元の音声ファイルを添付してください。音源は端末の下書きに保存できます。'); return; }
      const filename = record.filename || 'audio.wav';
      if (!/\.wav$/i.test(filename) && !['audio/wav', 'audio/x-wav', 'audio/wave'].includes(String(record.mime || record.blob.type).toLowerCase())) {
        invalid('サーバー投稿に使えるのはWAV音源です。この音源は端末の下書きにそのまま残ります。'); return;
      }
      if (record.blob.size > 16 * 1024 * 1024) { invalid('サーバー投稿用WAVは16 MiB以下です。64 MiBまでの元音源は端末の下書きに残せます。'); return; }
      try {
        const duration = await checkWavDuration(record.blob);
        if (duration > 600) { invalid('サーバー投稿用WAVは再生時間600秒以下です。元音源は端末の下書きに残せます。'); return; }
      } catch (error) { invalid(niceError(error, 'WAV音源の再生時間を確認できません。元音源は端末の下書きに残せます。')); return; }
      audio = { blob: record.blob, filename };
    }
    tell(visibility === 'private' ? '非公開の投稿をサーバーに送信しています。結果が不明な場合は同じ下書きから再試行できます。' : '公開投稿をサーバーに送信しています。サーバーの応答で公開状態を確認します。');
    try {
      await state.saveChain;
      const audioDigest = audio ? await sha256Blob(audio.blob) : '';
      const requestDigest = await sha256(JSON.stringify({ kind: mode, title, caption, visibility, audioDigest }));
      let requestKey = state.activeDraft?.requestKey;
      if (requestKey && state.activeDraft?.requestDigest && state.activeDraft.requestDigest !== requestDigest) requestKey = null;
      requestKey ||= uuid();
      await queueActiveSave({ ...selectedDraft(), visibility, requestKey, requestDigest });
      const post = await api.submit({ kind: mode, title, caption, visibility, requestKey, postingConsent, ...(audio ? { audio } : {}) });
      if (!post || post.source !== 'sns' || !/^sns:[a-f\d-]{36}$/i.test(String(post.id || '')) || post.visibility !== visibility) {
        throw new Error('サーバー応答で投稿の公開状態を確認できません。下書きと送信番号を保持しています。');
      }
      state.submitted = true; state.submissionCleared = false; state.busy = false; freezeComposer();
      if (post.owned) state.minePosts = [post, ...(state.minePosts || []).filter((item) => item.id !== post.id)];
      tell(post.visibility === 'public' ? 'サーバーから公開を確認しました。フィードを更新しました。端末の下書きと元音源は残しています。' : 'サーバーから非公開保存を確認しました。自分の投稿から確認できます。端末の下書きと元音源は残しています。');
      toast(post.visibility === 'public' ? '投稿がサーバーで公開されました。' : '投稿を非公開で保存しました。');
      await refresh({ initial: true });
      if (state.minePosts) render();
    } catch (error) {
      lockComposer(false);
      tell(`サーバー送信を確認できませんでした。入力、元音源、送信番号を保持しています。同じ内容なら同じ番号で再試行できます。${niceError(error, '接続を確認してください。')}`);
    } finally { if (!state.submitted) lockComposer(false); }
  }
  function detailContent(post) {
    activeEditConsent?.destroy(); activeEditConsent = null;
    const work = [], info = [];
    const title = node('h3', {}, post.title);
    const visibility = post.source === 'sns' ? ` · ${post.visibility === 'private' ? '非公開' : 'サーバー公開'}` : '';
    const author = node('p', {}, `${post.author?.name || '作者情報なし'} · ${formatDate(post.createdAt)}${visibility}`);
    work.push(title); info.push(author);
    if (post.image?.src) {
      const image = node('img', { src: post.image.src, alt: post.title, loading: 'lazy' });
      if (post.image.width) image.width = post.image.width; if (post.image.height) image.height = post.image.height;
      image.className = 'detail-media'; work.push(image);
    }
    if (post.kind === 'music') {
      const privateOwned = post.visibility === 'private' && post.owned === true;
      const player = node('audio', { controls: true, preload: 'none', ...(!privateOwned && post.audio?.src ? { src: post.audio.src } : {}), ...(privateOwned ? { 'data-private-audio': post.postId } : {}), 'aria-label': `${post.title}を再生` });
      player.className = 'detail-audio'; work.push(player);
      if (privateOwned) work.push(node('p', { class: 'detail-status', 'data-private-audio-status': 'true', role: 'status', 'aria-live': 'polite' }, '非公開音源を読み込んでいます…'));
    }
    if (post.caption) work.push(node('p', { class: 'detail-caption' }, post.caption));
    const actions = node('p', {});
    if (post.mapHref) actions.append(node('a', { href: post.mapHref }, '地図で作品を見る'));
    if (post.kind === 'puzzle') actions.append(documentRef.createTextNode(' · '), node('a', { href: post.href }, 'パズルで遊ぶ'));
    if (post.source === 'sns' && post.owned === true) actions.append(node('span', { class: 'owner-label' }, '自分の投稿'));
    work.push(actions);
    if (post.source === 'sns' && post.owned === true) {
      const edit = node('form', { class: 'owner-edit-form', 'data-action': 'edit-post', 'data-post-id': post.postId, 'data-version': String(post.version) });
      edit.append(node('label', { class: 'composer-label' }, 'タイトル'), node('input', { type: 'text', maxlength: '60', name: 'title', 'aria-label': 'タイトル', value: post.title, required: true }));
      edit.append(node('label', { class: 'composer-label' }, '文章'), node('textarea', { name: 'body', 'aria-label': '投稿本文', maxlength: '180', rows: '3' }, post.caption));
      const select = node('select', { name: 'visibility', 'aria-label': '公開範囲' });
      for (const [value, label] of [['private', '非公開'], ['public', '公開']]) { const option = node('option', { value }, label); option.selected = post.visibility === value; select.append(option); }
      edit.append(node('label', { class: 'composer-label' }, '公開範囲'), select, node('button', { type: 'submit', class: 'detail-action', 'data-action': 'edit-post', 'data-post-id': post.postId, 'data-version': String(post.version) }, '変更を保存'), node('button', { type: 'button', class: 'detail-action detail-danger', 'data-action': 'delete-post', 'data-post-id': post.postId }, '自分の投稿を削除'));
      const consentHost = node('div'); edit.append(consentHost);
      const editConsent = createPostingConsentUi(consentHost, { documentRef, windowRef });
      editConsent.setPublic(select.value === 'public'); select.addEventListener('change', () => editConsent.setPublic(select.value === 'public')); editConsents.set(edit, editConsent); activeEditConsent = editConsent;
      info.push(node('span', { class: 'owner-label' }, '自分の投稿を管理'));
      info.push(edit);
    }
    const workPane = node('section', { class: 'detail-pane', 'data-detail-pane': 'work', 'aria-label': '作品' }); workPane.append(...work);
    const infoPane = node('section', { class: 'detail-pane', 'data-detail-pane': 'info', 'aria-label': '情報と管理' }); infoPane.append(...info);
    const report = node('form', { class: 'report-form', 'data-action': 'report' });
    const reason = node('select', { name: 'reason', 'aria-label': '通報理由' });
    for (const [value, label] of [['spam', 'スパム'], ['copyright', '著作権'], ['harmful', '有害な内容'], ['other', 'その他']]) reason.append(node('option', { value }, label));
    const disclosure = node('details'); disclosure.append(node('summary', {}, 'この投稿を通報'), node('label', { class: 'composer-label' }, '理由'), reason, node('label', { class: 'composer-label' }, '補足'), node('textarea', { name: 'details', 'aria-label': '通報の補足', maxlength: '500', rows: '2', placeholder: '任意・500文字まで' }), node('button', { type: 'submit', class: 'detail-action' }, '通報を送信'), node('p', { class: 'report-status', 'data-report-status': 'true', role: 'status', 'aria-live': 'polite' }));
    report.append(disclosure); report.dataset.reportTarget = post.id; info.push(report);
    detailBody.replaceChildren(workPane, infoPane); applyDetailPane();
  }
  function applyDetailPane() {
    const wide = windowRef.matchMedia?.('(min-width: 761px)').matches || false;
    for (const pane of detailBody.querySelectorAll('[data-detail-pane]')) {
      pane.hidden = pane.dataset.detailPane === 'work' ? (!wide && state.detailPane !== 'work') : pane.dataset.detailPane !== state.detailPane;
    }
    for (const button of detail?.querySelectorAll('[data-action="detail-pane"]') || []) {
      const selected = button.dataset.pane === state.detailPane;
      button.setAttribute('aria-pressed', String(selected)); button.setAttribute('aria-expanded', String(selected));
      button.setAttribute('aria-controls', `detail-${button.dataset.pane}`);
    }
    const work = detailBody.querySelector('[data-detail-pane="work"]'); if (work) work.id = 'detail-work';
    const info = detailBody.querySelector('[data-detail-pane="info"]'); if (info) info.id = 'detail-info';
    if (!wide) {
      const scrollTop = state.detailPaneScroll.get(state.detailPane) || 0;
      windowRef.requestAnimationFrame(() => { if (detail.open && !wide) detailBody.scrollTop = scrollTop; });
    }
  }
  async function openDetail(id, { push = true, fromHistory = false } = {}) {
    const generation = ++state.detailGeneration;
    let post = (state.minePosts || []).find((item) => item.id === id) || state.posts.find((item) => item.id === id);
    if (!post || post.source === 'sns' && post.owned !== true) {
      try { const serverPost = await api.get(id, { authenticated: true }); if (serverPost) post = serverPost; }
      catch (error) { if (!post) { if (generation === state.detailGeneration) toast(`作品を読み込めませんでした。${niceError(error, '')}`); return; } }
    }
    if (generation !== state.detailGeneration || state.pageHidden) return;
    if (!post) { toast('公開作品が見つかりません。'); return; }
    if (post.source === 'sns' && post.owned === true) state.minePosts = [post, ...(state.minePosts || []).filter((item) => item.postId !== post.postId)];
    if (state.lastDetailId !== id) state.detailPaneScroll.clear();
    state.lastDetailId = id; state.detailId = id; state.detailPane = 'work'; state.priorFocus = documentRef.activeElement; detailContent(post); deactivateFeedAds(); if (!detail.open) detail.showModal();
    if (state.detailAudioUrl) { URL.revokeObjectURL(state.detailAudioUrl); state.detailAudioUrl = null; }
    if (post.source === 'sns' && post.kind === 'music' && post.visibility === 'private' && post.owned === true && typeof api.getAudio === 'function') {
      const player = $('[data-private-audio]', detailBody), audioStatus = $('[data-private-audio-status]', detailBody);
      void api.getAudio(post.postId).then((blob) => {
        if (generation !== state.detailGeneration || state.detailId !== id || !detail.open) return;
        state.detailAudioUrl = URL.createObjectURL(blob); player.src = state.detailAudioUrl;
        if (audioStatus) audioStatus.textContent = '非公開音源を読み込みました。再生ボタンで再生できます。';
      }).catch((error) => { if (generation === state.detailGeneration && audioStatus) audioStatus.textContent = `非公開音源を読み込めませんでした。${niceError(error, '')}`; });
    }
    if (push) { const url = new URL(windowRef.location.href); url.searchParams.set('post', id); windowRef.history.pushState({ ...(windowRef.history.state || {}), socialDetail: id }, '', url); }
    state.detailHistory = push || fromHistory;
    $('#detailClose', detail)?.focus({ preventScroll: true });
  }
  function closeDetail({ fromPop = false } = {}) {
    state.detailGeneration++;
    if (state.detailAudioUrl) { URL.revokeObjectURL(state.detailAudioUrl); state.detailAudioUrl = null; }
    if (detail.open) detail.close();
    if (!fromPop && state.detailHistory && windowRef.history.state?.socialDetail) windowRef.history.back();
    else if (!fromPop) { const url = new URL(windowRef.location.href); url.searchParams.delete('post'); windowRef.history.replaceState(windowRef.history.state || {}, '', url); }
    state.detailHistory = false; state.priorFocus?.focus?.({ preventScroll: true });
  }
  async function submitDetailForm(event) {
    const form = event.target.closest?.('form[data-action]'), action = form?.dataset.action;
    if (!['edit-post', 'report'].includes(action)) return;
    event.preventDefault();
    if (form.dataset.saving === 'true') return;
    const data = new FormData(form); form.dataset.saving = 'true';
    const controls = [...form.querySelectorAll('input, select, textarea, button')].map(control => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    const status = $('[data-report-status]', form);
    const setStatus = (message) => { if (status) status.textContent = message; else toast(message); };
    try {
      if (action === 'edit-post') {
        const postId = form.dataset.postId;
        const current = (state.minePosts || []).concat(state.posts).find((post) => post.postId === postId && post.source === 'sns');
        if (!current?.owned) { setStatus('自分の投稿として確認できないため編集できません。'); return; }
        const result = await api.edit({ postId, title: text(data.get('title'), 60), caption: text(data.get('body'), 180), visibility: data.get('visibility'), ...(data.get('visibility') === 'public' ? {postingConsent: editConsents.get(form).read()} : {}), version: Number(form.dataset.version) });
        state.minePosts = [result, ...(state.minePosts || []).filter((post) => post.postId !== postId)];
        state.posts = state.posts.map((post) => post.postId === postId ? result : post);
        state.detailPane = 'work'; detailContent(result); applyDetailPane(); render(); toast('自分の投稿を更新しました。'); return;
      }
      await api.report({ target: form.dataset.reportTarget, reason: data.get('reason'), details: text(data.get('details'), 500) });
      setStatus('通報を受け付けました。対象の表示状態は変わりません。');
    } catch (error) { setStatus(`保存を確認できませんでした。${niceError(error, '')}`); }
    finally { delete form.dataset.saving; controls.forEach(([control, disabled]) => { control.disabled = disabled; }); }
  }
  async function closeComposer({ fromPop = false } = {}) {
    if (state.busy) { tell('処理中です。結果を確認してから閉じられます。元の下書きは保持しています。'); return; }
    state.composerGeneration++; state.handoffToken++; state.fileGeneration++;
    if (!state.submitted && !state.archiveSaved) {
      try { await saveActive(); }
      catch (error) {
        tell(`下書きを端末に保存できなかったため、この画面を開いたままにしています。${niceError(error, '')}`);
        if (fromPop) windowRef.history.pushState({ ...(windowRef.history.state || {}), socialComposer: true, composerType: state.mode }, '', state.composerUrl || windowRef.location.href);
        return;
      }
    }
    const hadAudioPreview = !!state.audioRecord || !!$('#composerAudio', preview);
    $('#composerAudio', preview)?.pause(); clearAudio();
    if (hadAudioPreview) preview.replaceChildren();
    if (composer.open) composer.close();
    if (!fromPop && windowRef.history.state?.socialComposer) windowRef.history.back();
    else if (fromPop) cleanComposerQuery();
    if (state.submitted && state.submissionCleared) {
      titleInput.value = ''; captionInput.value = ''; locationInput.value = ''; preview.replaceChildren();
      state.attachment = null; state.receipt = null; state.outputId = null; state.activeDraft = null; state.submitted = false; state.submissionCleared = false;
    }
    if (state.priorFocus?.isConnected) state.priorFocus.focus({ preventScroll: true });
    else if (state.priorDraftId) (draftsHost?.querySelector(`[data-draft-id="${CSS.escape(state.priorDraftId)}"]`) || $('#draftsTitle', documentRef))?.focus({ preventScroll: true });
    state.draftReady = false;
  }
  async function onClick(event) {
    const action = event.target.closest('[data-action], [data-compose]'); if (!action || action.tagName === 'FORM') return;
    if (action.tagName === 'A') {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault();
    }
    if (action.matches('[data-compose]')) { event.preventDefault(); void openComposer(action.dataset.type || 'art'); return; }
    const name = action.dataset.action;
    if (name === 'guest-account') {
      deactivateFeedAds();
      documentRef.dispatchEvent(new windowRef.CustomEvent('pixieed:guest-account-open', { detail: { source: 'feed' } }));
      $('#guestAccountDialog', documentRef)?.showModal();
      try {
        const { initGuestAccountUi } = await import('./guest-account-ui.mjs');
        initGuestAccountUi({documentRef});
      } catch {
        const message = $('#guestAccountStatus', documentRef);
        if (message) message.textContent = 'アカウント操作を読み込めませんでした。下書きを保持しています。ページを再読み込みして再試行してください。';
      }
      return;
    }
    if (name === 'guest-account-close') { $('#guestAccountDialog', documentRef)?.close(); $('#guestAccountOpen', documentRef)?.focus({ preventScroll: true }); return; }
    if (name === 'guest-account-transfer') { return; }
    if (name === 'composer-pane') {
      selectComposerPane(action.dataset.pane);
      return;
    }
    if (name === 'detail-pane') {
      const wide = windowRef.matchMedia?.('(min-width: 761px)').matches || false;
      if (!wide) state.detailPaneScroll.set(state.detailPane, detailBody.scrollTop);
      state.detailPane = action.dataset.pane; applyDetailPane();
      return;
    }
    if (name === 'view') {
      void navigateView(action.dataset.view); return;
    }
    if (name === 'clear-search') {
      const search = ensureSearch(); search.value = ''; state.query = '';
      const url = new URL(windowRef.location.href); url.searchParams.delete('q');
      windowRef.history.replaceState(windowRef.history.state || {}, '', url);
      render(); search.focus({ preventScroll: true }); return;
    }
    if (name === 'filter') { state.mineMode = false; state.filter = action.dataset.type || 'all'; render(); void savePreferences({ filter: state.filter }); return; }
    if (name === 'mine') {
      action.disabled = true;
      try { await navigateView('mine'); } finally { action.disabled = false; } return;
    }
    if (name === 'refresh' || name === 'retry') { void refresh({ initial: state.posts.length === 0 }); return; }
    if (name === 'show-new-posts') { acceptNewPosts(); return; }
    if (name === 'search') { if (currentView() !== 'feed') await navigateView('feed'); $('#feedFilterWrap details', documentRef)?.setAttribute('open', ''); ensureSearch().focus(); return; }
    if (name === 'saved') { void navigateView('saved'); return; }
    if (name === 'open-draft') { state.priorDraftId = action.dataset.draftId; const draft = await drafts.get(action.dataset.draftId); if (draft) void openComposer(draft.mode, { draft }); return; }
    if (name === 'remove-draft') { if (!windowRef.confirm('この端末の下書きを削除しますか？\nキャンセルすると内容を残します。')) return; try { await drafts.remove(action.dataset.draftId); renderDrafts(); if (state.audioListLoaded) void refreshAudioList(); toast('下書きを削除しました。'); } catch (error) { toast(`下書きを削除できませんでした。${niceError(error, '')}`); } return; }
    if (name === 'draft-save') { await saveDraft(); return; }
    if (name === 'composer-type') { state.archiveSaved = false; setMode(action.dataset.type); requestAutosave(); return; }
    if (name === 'attach') { $('#composerFile', form)?.click(); return; }
    if (name === 'attach-audio') { audioFile?.click(); return; }
    if (name === 'detach-audio') {
      if (state.busy || state.submitted || !state.audioRecord && !state.activeDraft?.audioId && !state.activeDraft?.outputId) return;
      state.archiveSaved = false; state.audioGeneration++; clearAudio(); state.audioDetached = true; state.outputId = null; state.outputDetached = true;
      preview.replaceChildren(); tell('音声をこの下書きから外しました。保存後も、他の下書きが参照する音声や元の制作出力は残ります。'); requestAutosave();
      if (state.audioListLoaded) void refreshAudioList(); return;
    }
    if (name === 'refresh-audio') { state.audioListLoaded = true; void refreshAudioList(); return; }
    if (name === 'use-audio') { void attachStoredAudio(action.dataset.audioId); return; }
    if (name === 'remove-audio') {
      if (state.busy) return;
      if (!windowRef.confirm('この端末の未使用音声を削除しますか？\n使用中の音声は削除されません。キャンセルすると音声を残します。')) return;
      try { await drafts.removeAudio(action.dataset.audioId); toast('未使用の音声ファイルを削除しました。'); await refreshAudioList(); }
      catch (error) { toast(`音声を削除できませんでした。使用中の音声は残しています。${niceError(error, '')}`); await refreshAudioList(); }
      $('#draftAudioRefresh', documentRef)?.focus({ preventScroll: true });
      return;
    }
    if (name === 'tools') { deactivateFeedAds(); tools?.showModal(); return; }
    if (name === 'like') {
      const id = action.closest('[data-post-id]')?.dataset.postId;
      action.disabled = true;
      try {
        let liked = state.liked.get(id);
        if (typeof liked !== 'boolean') { toast('現在のいいね状態を確認しています。'); liked = await api.hasLiked(id); if (typeof liked !== 'boolean') throw new Error('いいね状態を確認できません。'); state.liked.set(id, liked); }
        await api.setLike(id, !liked); state.liked.set(id, !liked); render(); toast(!liked ? 'いいねを保存しました。' : 'いいねを取り消しました。');
      } catch (error) { toast(`いいね状態または保存を確認できませんでした。${niceError(error, '再試行してください。')}`); action.disabled = false; }
      return;
    }
    if (name === 'bookmark') {
      const id = action.closest('[data-post-id]')?.dataset.postId;
      const wasSaved = state.bookmarks.has(id);
      if (wasSaved) state.bookmarks.delete(id); else state.bookmarks.add(id);
      try { await drafts.savePreferences({ bookmarks: [...state.bookmarks] }); render(); }
      catch (error) { if (wasSaved) state.bookmarks.add(id); else state.bookmarks.delete(id); toast(`保存作品を更新できませんでした。${niceError(error, '')}`); render(); }
      return;
    }
    if (name === 'detail') { void openDetail(action.closest('[data-post-id]')?.dataset.postId); return; }


    if (name === 'delete-post') {
      const id = action.dataset.postId;
      const owned = (state.minePosts || []).concat(state.posts).some((post) => post.postId === id && post.source === 'sns' && post.owned === true);
      if (!owned) return;
      const current = (state.minePosts || []).concat(state.posts).find((post) => post.postId === id && post.source === 'sns' && post.owned === true);
      if (!windowRef.confirm(`「${text(current?.title, 48)}」を削除しますか？\n削除後は投稿を表示できなくなります。キャンセルすると削除しません。`)) return;
      try {
        const result = await api.remove(id); state.posts = state.posts.filter((post) => post.postId !== id); state.minePosts = (state.minePosts || []).filter((post) => post.postId !== id);
        closeDetail(); render();
        if (result?.cleanupPending) { state.pendingCleanup.add(id); $('#mineStatus', documentRef).textContent = '投稿は非表示になりましたが、音源の整理は保留中です。'; const retry = node('button', { type: 'button', class: 'detail-action', 'data-action': 'retry-cleanup', 'data-post-id': id }, '音源整理を再試行'); $('#mineStatus', documentRef)?.append(retry); }
        else toast('自分の投稿をサーバーから削除しました。');
      } catch (error) { toast(`投稿を削除できませんでした。${niceError(error, '')}`); }
      return;
    }
    if (name === 'retry-cleanup') {
      const id = action.dataset.postId; action.disabled = true;
      try { const result = await api.remove(id); if (!result?.cleanupPending) { state.pendingCleanup.delete(id); action.remove(); $('#mineStatus', documentRef).textContent = '音源の整理が完了しました。'; } else { action.disabled = false; $('#mineStatus', documentRef).firstChild.textContent = '投稿は非表示です。音源の整理が保留中です。 '; } }
      catch (error) { action.disabled = false; $('#mineStatus', documentRef).firstChild.textContent = `音源の整理を再試行できませんでした。${niceError(error, '')} `; }
      return;
    }

  }
  app.addEventListener('click', onClick);
  documentRef.addEventListener('pixieed:guest-account-confirmed', () => {
    state.minePosts = null;
    if (state.mineMode) void navigateView('mine', {push:false, restore:false, force:true});
  });
  app.addEventListener('submit', submitDetailForm);
  form.addEventListener('submit', submitPost);
  $('#composerClose', documentRef)?.addEventListener('click', () => closeComposer());
  $('#detailClose', documentRef)?.addEventListener('click', () => closeDetail());
  $('#toolsClose', documentRef)?.addEventListener('click', () => tools?.close());
  composer.addEventListener('cancel', (event) => { event.preventDefault(); closeComposer(); });
  detail?.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (state.detailPane !== 'work') {
      state.detailPane = 'work'; applyDetailPane();
      detail.querySelector('[data-action="detail-pane"][data-pane="work"]')?.focus({ preventScroll: true });
      return;
    }
    closeDetail();
  });
  composer.addEventListener('close', () => { $('#composerAudio', preview)?.pause(); });
  detail?.addEventListener('close', () => { state.detailId = null; });
  for (const input of [titleInput, captionInput, locationInput]) input?.addEventListener('input', () => { if (captionInput === input) $('#characterCount', documentRef).textContent = `${captionInput.value.length} / 180`; if (locationInput === input) updateComposerSummary(); state.archiveSaved = false; requestAutosave(); });
  visibilityInput?.addEventListener('change', () => { consentUi.reset(); state.archiveSaved = false; updateComposerSummary(); requestAutosave(); tell(state.mode === 'puzzle' && visibilityInput.value !== 'public' ? '自分だけで遊ぶ設定です。素材の送信や公開投稿はしません。' : visibilityInput.value === 'public' ? '公開を選択しています。サーバーが受理した場合に公開状態を確認します。' : '自分用を選択しています。この端末に保存し、素材は送信しません。'); });
  $$('.composer-types [data-action="composer-type"]', app).forEach((button) => button.addEventListener('click', () => setMode(button.dataset.type)));
  $('#newPostsButton', documentRef)?.addEventListener('click', acceptNewPosts);
  $('#composerFile', form)?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file || state.busy || state.submitted || !composer.open) return;
    const fileGeneration = ++state.fileGeneration;
    const composerGeneration = state.composerGeneration;
    tell('画像を検査しています…');
    try {
      const { inspectPixelImage } = await import('../globe/post-image.mjs');
      const image = await inspectPixelImage(file, { keepScale: true });
      if (fileGeneration !== state.fileGeneration || composerGeneration !== state.composerGeneration || state.pageHidden || !composer.open || state.busy || state.submitted) return;
      putAttachment(image); tell('画像を検査して添付しました。地図の掲載先を入力すると既存の投稿方式で送信できます。');
    }
    catch (error) {
      if (fileGeneration === state.fileGeneration && composerGeneration === state.composerGeneration && !state.pageHidden && composer.open) tell(`画像を添付できませんでした。${niceError(error, '')}`);
    }
    finally { if (fileGeneration === state.fileGeneration) event.target.value = ''; }
  });
  audioFile?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file || state.busy || state.submitted || !composer.open) return;
    try {
      if (!file.type.startsWith('audio/')) throw new Error('音声形式のファイルを選択してください。');
      if (file.size < 1) throw new Error('空の音声ファイルは添付できません。');
      if (file.size > 64 * 1024 * 1024) throw new Error('音声は1ファイル64 MiB以下にしてください。');
      state.output = null; state.outputId = null; state.outputDetached = true;
      renderAudioRecord({ id: null, blob: file, filename: file.name || 'audio-file', mime: file.type, size: file.size, needsPersist: true });
      setMode('music'); tell('元の音声ファイルを添付しました。下書き保存が完了するまでこの画面に保管されています。'); requestAutosave();
    } catch (error) { tell(`音声を添付できませんでした。${niceError(error, '')}`); }
    finally { event.target.value = ''; }
  });
  let viewportFrame = 0;
  const visualViewport = windowRef.visualViewport;
  const desktopQuery = windowRef.matchMedia?.('(min-width: 761px)');
  const updateDetailLayout = () => { if (detail?.open) applyDetailPane(); };
  const syncViewportHeight = () => {
    if (viewportFrame) return;
    viewportFrame = windowRef.requestAnimationFrame(() => {
      viewportFrame = 0;
      const height = visualViewport?.height || windowRef.innerHeight;
      documentRef.documentElement.style.setProperty('--social-viewport-height', `${Math.max(240, Math.round(height))}px`);
      const header = $('.mobile-header', documentRef);
      const headerHeight = header?.getBoundingClientRect().height || 0;
      documentRef.documentElement.style.setProperty('--social-view-top', `${Math.round(headerHeight)}px`);
      documentRef.documentElement.style.setProperty('--social-view-height', `${Math.round($('#feedViews', documentRef)?.getBoundingClientRect().height || 0)}px`);
    });
  };
  const layoutObserver = windowRef.ResizeObserver ? new windowRef.ResizeObserver(syncViewportHeight) : null;
  const removeViewportListeners = () => {
    windowRef.removeEventListener('resize', syncViewportHeight);
    visualViewport?.removeEventListener('resize', syncViewportHeight);
    visualViewport?.removeEventListener('scroll', syncViewportHeight);
    desktopQuery?.removeEventListener?.('change', updateDetailLayout);
    layoutObserver?.disconnect();
    if (viewportFrame) windowRef.cancelAnimationFrame(viewportFrame);
    viewportFrame = 0;
  };
  const addViewportListeners = () => {
    windowRef.addEventListener('resize', syncViewportHeight, { passive: true });
    visualViewport?.addEventListener('resize', syncViewportHeight, { passive: true });
    visualViewport?.addEventListener('scroll', syncViewportHeight, { passive: true });
    desktopQuery?.addEventListener?.('change', updateDetailLayout);
    for (const element of [$('.mobile-header', documentRef), $('#feedViews', documentRef)]) if (element) layoutObserver?.observe(element);
    syncViewportHeight();
  };
  addViewportListeners();
  const reconcileGutterViewport = () => updateFeedGutter(filteredPosts(), !state.mineMode && state.filter === 'all' && !state.query);
  windowRef.addEventListener('resize', reconcileGutterViewport, { passive: true });
  windowRef.addEventListener('popstate', reconcileGutterViewport);
  documentRef.addEventListener('fullscreenchange', reconcileGutterViewport);
  windowRef.addEventListener('popstate', (event) => {
    if (composer.open && !event.state?.socialComposer) closeComposer({ fromPop: true });
    else if (!composer.open && event.state?.socialComposer) void openComposer(event.state.composerType || 'art', { historyPush: false });
    if (detail?.open && !event.state?.socialDetail) closeDetail({ fromPop: true });
    else if (event.state?.socialDetail) void openDetail(event.state.socialDetail, { push: false, fromHistory: true });
    else if (!composer.open && !detail?.open && !event.state?.socialComposer && !event.state?.socialDetail) {
      state.composerGeneration++; state.handoffToken++; state.detailGeneration++;
      const url = new URL(windowRef.location.href);
      if (url.searchParams.has('compose') || url.searchParams.has('output')) {
        url.searchParams.delete('compose'); url.searchParams.delete('output'); windowRef.history.replaceState(event.state || {}, '', url);
      }
    }
    if (!event.state?.socialComposer && !event.state?.socialDetail) {
      const view = readFeedView(windowRef.location.href);
      if (view !== currentView()) void navigateView(view, { push: false });
    }
  });
  windowRef.addEventListener('pagehide', () => {
    removeViewportListeners();
    retireFeedGutter();
    windowRef.history.scrollRestoration = priorScrollRestoration;
    state.pageHidden = true; state.composerGeneration++; state.detailGeneration++; state.handoffToken++;
    if (composer.open && state.draftReady && !state.submitted && !state.archiveSaved) requestAutosave();
    void savePreferences({ filter: state.filter, bookmarks: [...state.bookmarks], scroll: windowRef.scrollY });
    const audio = $('#composerAudio', preview); audio?.pause(); if (state.audioUrl) URL.revokeObjectURL(state.audioUrl); state.audioUrl = null;
  });
  windowRef.addEventListener('pageshow', (event) => {
    windowRef.history.scrollRestoration = 'manual';
    addViewportListeners();
    if (!event.persisted) return;
    state.pageHidden = false;
    state.fileGeneration++; state.composerGeneration++; state.handoffToken++; state.detailGeneration++;
    if (composer.open && state.audioRecord?.blob) { const record = state.audioRecord; renderAudioRecord(record); if (record.needsPersist) requestAutosave(); }
    else if (composer.open && state.activeDraft?.audioId) void loadStoredAudio(state.activeDraft.audioId);
    else if (composer.open && state.outputId) void loadOutput(state.outputId);
  });
  documentRef.addEventListener('visibilitychange', () => { if (documentRef.hidden) $('#composerAudio', preview)?.pause(); });

  async function start() {
    const previewMarker = documentRef.querySelector('meta[name="pixieed-local-preview"]')?.content;
    if (previewMarker === '1') $('#localPreviewNotice', documentRef).hidden = false;
    let active = null;
    try {
      const [prefs, loadedActive] = await Promise.all([drafts.loadPreferences(), drafts.loadActive()]);
      active = loadedActive;
      state.filter = prefs.filter; state.bookmarks = new Set(prefs.bookmarks); state.activeDraft = active;
      windowRef.scrollTo({ top: prefs.scroll || 0, behavior: 'instant' });
    } catch (error) { statusText(`端末の表示設定を読み込めませんでした。${niceError(error, '')}`); }
    state.draftReady = true; releaseStartup();
    if (state.pageHidden) return;
    $$('[data-boot-disabled]', app).forEach((button) => { button.disabled = false; button.removeAttribute('data-boot-disabled'); });
    $('#bootStatus', documentRef)?.setAttribute('hidden', '');
    app.dataset.ready = 'true';
    updateFilters(); renderDrafts();
    const params = new URLSearchParams(windowRef.location.search);
    const initialView = params.has('view') ? readFeedView(windowRef.location.href) : 'feed';
    if (initialView !== currentView()) await navigateView(initialView, { push: false, restore: false });
    windowRef.history.replaceState(windowRef.history.state || {}, '', feedViewUrl(windowRef.location.href, currentView()));
    state.query = params.get('q')?.trim() || '';
    const search = ensureSearch();
    if (state.query) search.focus({ preventScroll: true });
    const postRef = params.get('post'), outputRef = params.get('output'), compose = params.get('compose');
    if (outputRef) {
      await openComposer('music');
      if (state.audioRecord?.sourceOutputId === outputRef && !state.audioRecord.needsPersist) cleanOutputReference(outputRef);
      else await loadOutput(outputRef);
    }
    else if (compose && ['draw', 'pixel-camera', 'spot-difference', 'hidden-object', 'jigsaw'].includes(compose)) { await openComposer(compose === 'draw' ? 'art' : compose === 'pixel-camera' ? 'photo' : 'puzzle'); void adopt(compose); }
    else if (active && compose === 'resume') await openComposer(active.mode, { draft: active });
    void refresh({ initial: true });
    if (postRef) void openDetail(postRef, { push: false });
  }
  void start();
  return { refresh, render, openComposer, openDetail, state };
}

if (typeof document !== 'undefined') {
  const boot = async () => {
    try {
      const ordinaryAds = { enabled: false, trustedContentEligible: false, unit: null, provider: undefined };
      const feed = initSocialFeed({ ordinaryAds });
      connectOptionalFeedAds(feed, ordinaryAds, () => createFeedAdRuntime(ordinaryAdConfig.feed, {
        gutterConfig: ordinaryAdConfig.informationGutter,
        gutterContentEligible: ordinaryAdConfig.feed.trustedContentEligible === true,
      }));
    } catch (error) {
      const status = $('#feedStatus');
      if (status) status.textContent = `フィードを開始できませんでした。${niceError(error, '')}`;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}

export { initSocialFeed };


/**
 * Sparse, deterministic content flow for the public social feed.
 *
 * Keep the returned entries presentation-neutral so the caller can render them
 * with the same feed-column width as posts. `previousPlan` is the last plan
 * returned by this function; pass it back on refresh so existing post-ID
 * anchors survive newly prepended posts. Callers should set `enabled: false`
 * for saved, mine, search, and local-draft views. `previewAds` is an explicit
 * local-only placeholder; `ordinaryAdEnabled` is separately gated by a
 * verified operator unit/provider and eligible feed context.
 */

export const OFFICIAL_TOOL_CARDS = Object.freeze([
  Object.freeze({
    id: 'pixel-drawing',
    title: 'ドット絵を描いてみる',
    description: 'ピクセルスタジオで小さな作品をつくり、フィードに戻せます。',
    href: toolStartHref('/draw/?workspace=1&social=1'),
    icon: '/assets/icons/pixieed/artwork.svg'
  }),
  Object.freeze({
    id: 'pixel-camera',
    title: '写真をドット絵にする',
    description: 'ピクセルカメラで写真を変換し、作品としてフィードに戻せます。',
    href: toolStartHref('/camera/?workspace=1&social=1'),
    icon: '/assets/icons/pixieed/camera.svg'
  }),
  Object.freeze({
    id: 'pixel-audio',
    title: '絵から音楽をつくる',
    description: 'オーディオスタジオで色を置いて、短いループ曲をつくれます。',
    href: toolStartHref('/audio/?workspace=1&social=1'),
    icon: '/assets/icons/pixieed/music.svg'
  }),
  Object.freeze({
    id: 'spot-difference',
    title: '作品で間違い探しをつくる',
    description: '自分の絵を使って、見比べて遊べるパズルをつくれます。',
    href: toolStartHref('/spot-difference/?social=1'),
    icon: '/assets/icons/pixieed/spot-difference.svg'
  })
]);

const TOOL_INTERVAL = 8;
const TOOL_LIMIT = 2;
const AD_INTERVAL = 24;

function stableIndex(value, length) {
  // FNV-1a keeps the card choice reproducible without browser crypto or state.
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function postId(post) {
  return typeof post?.id === 'string' || typeof post?.id === 'number'
    ? String(post.id).trim()
    : '';
}

function priorInsertions(previousPlan, kind) {
  if (!Array.isArray(previousPlan)) return [];
  return previousPlan.filter((entry) => entry?.kind === kind && typeof entry.anchorId === 'string' && entry.anchorId);
}

/** Return posts and sparse, stable-ID anchored introductions in feed order. */
export function planFeedFlow(posts, { enabled = true, previewAds = false, ordinaryAdEnabled = false, ordinaryAdAnchorId = null, previousPlan = null } = {}) {
  if (!Array.isArray(posts) || !posts.length) return [];
  const plan = posts.map((post) => ({ kind: 'post', post }));
  if (!enabled) return plan;

  const positions = new Map();
  for (const [index, post] of posts.entries()) {
    const id = postId(post);
    if (id && !positions.has(id)) positions.set(id, index);
  }

  const toolInsertions = [];
  const seenToolAnchors = new Set();
  for (const entry of priorInsertions(previousPlan, 'tool')) {
    const index = positions.get(entry.anchorId);
    if (index == null || index < TOOL_INTERVAL - 1 || seenToolAnchors.has(entry.anchorId)) continue;
    const card = OFFICIAL_TOOL_CARDS.find((candidate) => candidate.id === entry.card?.id);
    if (!card || toolInsertions.length >= TOOL_LIMIT) continue;
    if (toolInsertions.some((item) => Math.abs(item.index - index) < 2)) continue;
    toolInsertions.push({ kind: 'tool', card, anchorId: entry.anchorId, index });
    seenToolAnchors.add(entry.anchorId);
  }

  // The eighth and sixteenth real posts are the only default introduction slots.
  for (const target of [TOOL_INTERVAL - 1, TOOL_INTERVAL * 2 - 1]) {
    if (toolInsertions.length >= TOOL_LIMIT || target >= posts.length) continue;
    const candidate = posts.slice(target).find((post, offset) => {
      const index = target + offset;
      const id = postId(post);
      return id && !seenToolAnchors.has(id) && !toolInsertions.some((item) => Math.abs(item.index - index) < 2);
    });
    if (!candidate) continue;
    const anchorId = postId(candidate);
    const index = positions.get(anchorId);
    const card = OFFICIAL_TOOL_CARDS[stableIndex(anchorId, OFFICIAL_TOOL_CARDS.length)];
    toolInsertions.push({ kind: 'tool', card, anchorId, index });
    seenToolAnchors.add(anchorId);
  }

  const adInsertions = [];
  if (previewAds && posts.length >= AD_INTERVAL) {
    const previousAd = priorInsertions(previousPlan, 'ad-preview').find((entry) => positions.has(entry.anchorId));
    const minIndex = AD_INTERVAL - 1;
    let index = previousAd ? positions.get(previousAd.anchorId) : minIndex;
    if (index < minIndex || !postId(posts[index]) || toolInsertions.some((item) => Math.abs(item.index - index) < 2)) {
      index = posts.findIndex((post, candidateIndex) => candidateIndex >= minIndex
        && !!postId(post)
        && !toolInsertions.some((item) => Math.abs(item.index - candidateIndex) < 2));
    }
    if (index >= minIndex && index < posts.length && postId(posts[index])) {
      adInsertions.push({ kind: 'ad-preview', anchorId: postId(posts[index]), index });
    }
  }

  const ordinaryAdInsertions = [];
  if (ordinaryAdEnabled && posts.length >= AD_INTERVAL) {
    const previous = priorInsertions(previousPlan, 'ordinary-ad').find((entry) => positions.has(entry.anchorId));
    const minIndex = AD_INTERVAL - 1;
    let index = ordinaryAdAnchorId && positions.has(ordinaryAdAnchorId)
      ? positions.get(ordinaryAdAnchorId)
      : ordinaryAdAnchorId ? -1 : previous ? positions.get(previous.anchorId) : minIndex;
    if (!ordinaryAdAnchorId && (index < minIndex || !postId(posts[index]) || toolInsertions.some((item) => Math.abs(item.index - index) < 2))) {
      index = posts.findIndex((post, candidateIndex) => candidateIndex >= minIndex && !!postId(post)
        && !toolInsertions.some((item) => Math.abs(item.index - candidateIndex) < 2));
    }
    if (index >= minIndex && index < posts.length && postId(posts[index])) {
      ordinaryAdInsertions.push({ kind: 'ordinary-ad', anchorId: postId(posts[index]), index });
    }
  }

  const insertions = [...toolInsertions, ...adInsertions, ...ordinaryAdInsertions];
  if (!insertions.length) return plan;
  const byIndex = new Map(insertions.map((entry) => [entry.index, entry]));
  const result = [];
  for (const [index, post] of posts.entries()) {
    result.push({ kind: 'post', post });
    const insertion = byIndex.get(index);
    if (insertion) {
      if (insertion.kind === 'tool') result.push({ kind: 'tool', card: insertion.card, anchorId: insertion.anchorId });
      else result.push({ kind: insertion.kind, anchorId: insertion.anchorId });
    }
  }
  return result;
}
