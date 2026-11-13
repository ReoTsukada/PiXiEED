import { createLazyGalleryData } from './project-gallery-data.mjs?rev=20261109-lazy-gallery-1';
import { routeEditorFile } from './output-router.mjs?rev=20261111-output-offerwall-1';
import { getToolStartRoute, isFreshToolStartRequest } from '../tool-start-routes.mjs?rev=20261110-output-result-1';
import { createPxdProject, decodePxd, encodePxd } from './pxd-codec.mjs';
import { createToolProjectStore, cloneAsToolProject } from './tool-project-store.mjs?rev=20261113-canvas1028-1';
import { importToolProject } from './tool-project-import.mjs?rev=20261113-canvas1028-1';
import { createProjectSession } from './project-session.mjs?rev=20261113-canvas1028-1';
import { forkProject, sanitizeProjectTitle, summarizeProject } from './project-catalog.mjs?rev=20261113-canvas1028-1';
import { pxdToolUrl, readPxdImage } from './pxd-project.mjs?rev=20261113-canvas1028-1';
import { assertOwnPublicSources, getPxdPublicSources } from './work-save-policy.mjs?rev=20261113-canvas1028-1';
import { componentImageRole, freezeProjectComponents } from './project-components.mjs?rev=20261113-canvas1028-1';
import { mountProjectGallery, drawProjectThumbnail } from './project-gallery.mjs?rev=20261109-import-preview-gallery-1';
import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261111-output-offerwall-1&nav=20261016-tool-operations-1';
import { findPxdOriginalBackup } from './pxd-original-backup.mjs';
import { mountProjectGalleryAdSeries, hasManagerArtwork } from '../ads/project-manager-ad.mjs?rev=20261108-gallery-canvas-viewport-1';
import { projectManagerAdConfig } from '../../data/project-gallery-ad-config.mjs?rev=20261108-gallery-canvas-viewport-1';

const icons = {
  folder: '<path d="M3 7h7l2-3h9v16H3z"/>',
  draw: '<path d="m4 20 1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  audio: '<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  camera: '<path d="M3 7h5l2-3h4l2 3h5v14H3z"/><circle cx="12" cy="13" r="4"/>',
  jigsaw: '<path d="M4 4h6a3 3 0 1 0 4 0h6v6a3 3 0 1 1 0 4v6h-6a3 3 0 1 0-4 0H4v-6a3 3 0 1 1 0-4z"/>',
  spot_difference: '<path d="M3 4h7v16H3zM14 4h7v16h-7zM5 9h3M16 14h3"/>',
  hidden_object: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M8 10h4M10 8v4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; }
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
function button(label, id, action) { const el = node('button', '', label); el.type = 'button'; el.id = id; el.addEventListener('click', action); return el; }
async function sendPxdBackup(bytes, name) {
  // Stage the exact backup; PXD is never decoded by the image converter.
  await routeEditorFile(new Blob([bytes], { type: 'application/octet-stream' }), name);
  return true;
}

export function isInitialProjectEntryFresh({ initialProject = null, pointer = null, hasQuery = false, hash = '', restoreError = '', operationError = '', failed = false } = {}) {
  return !initialProject && !pointer && !hasQuery && !hash && !restoreError && !operationError && !failed;
}

/** Each tool owns its projects. Imports are independent copies, never linked editors. */
export function mountProjectWorkspace({ tool, getProject, openProject, setStatus = () => {}, getPublicSources = () => [], getEditorState = () => ({}), getPreviewImage = () => null, restoreEditorState = () => {}, onNavigate = null, hasContent = () => true, initialProject = null, initialPointer = null, initialRestoreError = '', root = null, idPrefix = '', routePointer = true, isActive = () => true, rememberKey = null, rememberShared = true, allowImplicitImport = true, initialEntryRequestFresh = null }) {
  const store = createToolProjectStore(tool); let main = root || document.querySelector('#main') || document.querySelector('main');
  const lifecycle = new AbortController();
  main.inert = true; main.setAttribute('aria-busy', 'true');
  let locked = true; let initialized = false; let timer; let failed = false; let operationError = ''; let editedSinceOpen = false; let initialSelectionPending = false;
  let initialEntryFresh = false;
  let listError = '';
  let modeTransitionActive = false;
  // The workspace and mode loader own independent locks. Recompute instead of
  // restoring a stale inert snapshot when asynchronous work finishes.
  function syncInputLock() {
    const blocked = locked || Boolean(initialRestoreError) || modeTransitionActive;
    main.inert = blocked; main.setAttribute('aria-busy', String(locked || modeTransitionActive));
  }
  function setModeTransitionActive(value) { modeTransitionActive = Boolean(value); syncInputLock(); }
  let importFileEpoch = 0; let importReading = false; let importSources = []; let stagedImport = null; let selectedImport = null;
  let listLoaded = false; let modeSwitching = false; let ready;
  let activeCanvas = null;
  let managerAd = null, managerAdPrepared = false, managerAdFrame = 0, managerArtworkCount = 0;
  const managerAdState = { settled: false, enoughArtwork: false, libraryVisible: false, searching: false, selecting: false,
    importing: false, hasErrors: false, busy: true, restoring: false, dirty: false };
  function retireManagerAd(reason) { managerAdPrepared = true; cancelAnimationFrame(managerAdFrame); managerAdFrame = 0; managerAd?.retire(reason); }
  function closeManagerAd() { managerAd?.dispose(); managerAd = null; cancelAnimationFrame(managerAdFrame); managerAdFrame = 0; managerAdPrepared = false; }

  let transientNavigation = false;
  const projectWorkspaceCssHref = '/css/project-workspace.css?rev=20261112-creation-guidance-1';
  let css = [...document.querySelectorAll('link[rel="stylesheet"]')].find(link => link.getAttribute('href') === projectWorkspaceCssHref);
  const ownsCss = !css;
  if (ownsCss) { css = node('link'); css.rel = 'stylesheet'; css.href = projectWorkspaceCssHref; document.head.append(css); }
  document.body.classList.add('project-workspace-ready');
  const newStartRoute = getToolStartRoute(location.pathname);
  const entryRequestClean = initialEntryRequestFresh ?? isFreshToolStartRequest(location.href, history.state);
  const bar = node('div', 'project-bar'); bar.setAttribute('aria-label', 'このツールの作品');
  const launcher = button('', 'project-open', () => void showProjects()); launcher.className = 'project-bar__open'; launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.innerHTML = `${icon('folder')}<span class="project-bar__name" aria-hidden="true"></span><span class="project-bar__state" aria-hidden="true"></span>`;
  const modes = [['draw', '描く'], ['audio', '音楽'], ['camera', '撮る'], ['jigsaw', 'ジグソー'], ['spot_difference', '間違い探し'], ['hidden_object', 'もの探し']];
  async function navigate(target, project, role) {
    const url = pxdToolUrl(target, project, role);
    if (typeof onNavigate === 'function') await onNavigate({ tool: target, project, role, url });
    else location.assign(url);
  }
  bar.append(launcher); document.body.append(bar);
  mountToolHeaderControls(document, { projectBar: bar });
  const dialog = node('dialog', 'project-sheet'); dialog.id = 'pxd-panel'; dialog.setAttribute('aria-labelledby', 'project-sheet-title');
  const heading = node('div', 'project-sheet__heading'); const title = node('h2', '', '作品を管理'); title.id = 'project-sheet-title';
  const close = button('', 'project-close', () => dialog.close()); close.innerHTML = icon('close'); close.setAttribute('aria-label', '作品一覧を閉じる'); heading.append(title, close);
  const currentRow = node('div', 'project-sheet__current'); const titleLabel = node('label', '', '作品名'); titleLabel.htmlFor = 'project-title';
  const titleInput = node('input'); titleInput.id = 'project-title'; titleInput.maxLength = 60; titleInput.autocomplete = 'off';
  const rename = button('名前を保存', 'project-rename', () => { const name = titleInput.value; void transact(async () => { session.rename(name); await save(); await refreshList(); }, { close: false }); });
  currentRow.append(titleLabel, titleInput, rename);
  const renameDetails = node('details', 'project-rename-details');
  renameDetails.append(node('summary', '', '名前を変更'), currentRow);
  const resumeButton = button('編集を続ける', 'project-continue', () => dialog.close());
  resumeButton.className = 'project-continue';
  const currentCard = node('section', 'project-current-card');
  currentCard.setAttribute('aria-label', '今の作品');
  const actions = node('div', 'project-sheet__actions');
  const newButton = button('＋ 新規', 'project-new', () => void transact(async () => {
    if (!initialRestoreError && (session.persisted || editedSinceOpen)) await save();
    await session.adopt(blankProject(), { persisted: false, apply: true }); resetPointer(); initialSelectionPending = false;
    dialog.close(); say('新しい作品を作りました。');
  }, { close: false }));
  const duplicate = button('複製', 'project-duplicate', () => void transact(async () => {
    let source;
    try { source = await save(); }
    catch (error) {
      if (error?.code !== 'PXD_STORE_CONFLICT') throw error;
      // Keep this tab's edits as a new project instead of overwriting the other tab.
      source = await getProject(await freezeProjectComponents(structuredClone(session.currentProject)));
      await assertOwnPublicSources([...getPxdPublicSources(source), ...getPublicSources()]);
      source.manifest.editorState = { ...source.manifest.editorState, [tool]: structuredClone(getEditorState()) };
    }
    const project = forkProject(source, { title: `${session.currentProject.manifest.title || '作品'} のコピー` });
    // Apply validates the editable components before this copy becomes active.
    await session.adopt(project, { persisted: false, apply: true }); resetPointer(); await save(); say('別の作品として複製しました。');
  }));
  const saveButton = button('保存し直す', 'pxd-save', () => void transact(async () => {
    await save();
    say(session.dirty
      ? '保存した版をこのブラウザーに保存しました。保存中に加えた編集はまだ保存されていません。'
      : 'この作品をこのブラウザーに保存しました。');
    await refreshList();
  }, { close: false }));
  const exportButton = button('編集データをバックアップ（PXD）', 'pxd-export', () => void transact(async () => {
    const project = await save();
    const staged = await sendPxdBackup(await encodePxd(project), `pixieed-${project.projectId.slice(0, 8)}.pxd`);
    if (!staged) say('保存した作品全体のPXDバックアップのダウンロードを開始しました。');
  }, { close: false }));
  const original = button('読み込んだファイルを保存', 'pxd-export-original', () => void transact(async () => {
    const backup = findPxdOriginalBackup(session.currentProject, { copyBytes: true });
    if (!backup) throw new Error('保存できるPXD原本が見つかりません。現在の作品は保持しています。');
    // Download the archived bytes directly, even when editing/saving is unavailable.
    const staged = await sendPxdBackup(backup.bytes, backup.filename);
    if (!staged) say(`${backup.label}：ダウンロードを開始しました。現在の作品は変更していません。`);
  }, { close: false }));
  const backupSection = node('section', 'project-backup');
  backupSection.setAttribute('aria-labelledby', 'project-backup-title');
  const backupTitle = node('h3', '', '編集データを手元に残す'); backupTitle.id = 'project-backup-title';
  const backupNote = node('p', 'project-sheet__note', 'ブラウザーのデータ削除や端末変更に備え、PXDを保存してください。出力画面でダウンロードできます。');
  backupNote.id = 'project-backup-note'; exportButton.setAttribute('aria-describedby', backupNote.id);
  const restoreNote = node('p', 'project-sheet__note', 'PXDは続きを編集するためのファイルです。戻すときは［取り込む］から選びます。画像・音声の書き出しや公開投稿とは別です。');
  backupSection.append(backupTitle, backupNote, exportButton, restoreNote);
  actions.append(duplicate, saveButton, original);
  const moreActions = node('details', 'project-files project-more');
  moreActions.append(node('summary', '', 'その他')); moreActions.append(actions);
  const transferSection = node('section', 'project-transfer');
  transferSection.setAttribute('aria-labelledby', 'project-transfer-title');
  const transferTitle = node('h3', '', 'この作品を別のツールで開く'); transferTitle.id = 'project-transfer-title';
  const transferNote = node('p', 'project-sheet__note', 'コピーを作って開きます。今の作品は残ります。');
  const transferActions = node('div', 'project-transfer__actions');
  const transferTargets = [['draw', '描く'], ['audio', '音楽'], ['jigsaw', 'ジグソー'], ['spot_difference', '間違い探し'], ['hidden_object', 'もの探し']]
    .filter(([target]) => target !== tool)
    .map(([target, label]) => {
      const el = button('', `project-send-${target}`, () => void transact(async () => {
        const project = await save();
        await navigate(target, project, componentImageRole(project, tool));
      }));
      el.className = 'project-transfer__button';
      el.dataset.projectTransfer = target;
      el.innerHTML = `${icon(target)}<span><strong>${label}</strong><small>コピーして開く</small></span>`;
      transferActions.append(el);
      return { target, el };
    });
  transferSection.append(transferTitle, transferNote, transferActions);
  const message = node('p', 'project-sheet__status'); message.id = 'pxd-file-status'; message.setAttribute('role', 'status');
  const recoveryDescription = node('p', 'project-sheet__status', '保存済みの作品は変更していません。続ける作品を一覧から選んでください。「＋ 新規」から新しく描くこともできます。');
  recoveryDescription.id = 'project-recovery-description'; recoveryDescription.hidden = true;
  const storageNote = node('p', 'project-storage-note', '保存先：この端末のこのブラウザー。ここに保存しただけでは公開されません。');
  const list = node('div', 'project-list'); list.setAttribute('aria-label', '保存した作品');
  const importSection = node('section', 'project-pane project-import-pane'); importSection.id = 'project-import-pane';
  const importNote = node('p', 'project-sheet__note', '以前の作品やPXDバックアップを、元のデータを残したコピーとして取り込みます。');
  const input = node('input'); input.type = 'file'; input.accept = '.pxd,application/octet-stream'; input.id = 'pxd-file-input'; input.hidden = true;
  const fileActions = node('div', 'project-sheet__actions');
  fileActions.append(button('PXDファイルを選ぶ', 'pxd-open', () => input.click()));
  const fileNote = node('p', 'project-sheet__note', '端末のPXDは選択後にプレビューできます。選ぶだけでは作品は増えません。');
  const importStatus = node('p', 'project-sheet__status'); importStatus.id = 'project-import-status'; importStatus.setAttribute('role', 'status');
  const importSearch = node('input', 'project-search'); importSearch.type = 'search'; importSearch.id = 'project-import-search'; importSearch.placeholder = '作品名で探す'; importSearch.setAttribute('aria-label', '取り込む作品を作品名で探す');
  const importCount = node('p', 'project-library-count'); importCount.setAttribute('role', 'status');
  const importListStatus = node('p', 'project-sheet__status'); importListStatus.setAttribute('role', 'status');
  const importEmpty = node('p', 'project-list__empty');
  const importRetry = button('もう一度読み込む', 'project-import-retry', () => void refreshImports({ force: true })); importRetry.hidden = true;
  const importList = node('div', 'project-list'); importList.id = 'project-import-list'; importList.setAttribute('aria-label', '取り込める作品');
  const importPreview = node('section', 'project-import-preview'); importPreview.hidden = true; importPreview.setAttribute('aria-labelledby', 'project-import-preview-title');
  const importPreviewCanvas = node('canvas'); importPreviewCanvas.setAttribute('aria-hidden', 'true');
  const importPreviewFallback = node('span', 'project-import-preview__fallback'); importPreviewFallback.setAttribute('aria-hidden', 'true');
  const importPreviewInfo = node('div', 'project-import-preview__info');
  const importPreviewTitle = node('h3'); importPreviewTitle.id = 'project-import-preview-title';
  const importPreviewMeta = node('p', 'project-sheet__note');
  const importCopyButton = button('コピーして開く', 'project-import-copy', () => {
    const item = selectedImport; if (!item || importReading) return;
    void transact(async () => {
      const source = item === stagedImport ? item.project : await store.loadImportSource(item.projectId, item.revisionId);
      if (!source) throw new Error('取り込む作品が見つかりません。元の作品は変更していません。');
      await importCopy(source);
    }, { close: false });
  });
  const clearImportButton = button('選択を解除', 'project-import-clear', () => {
    if (selectedImport === stagedImport) stagedImport = null;
    selectImport(null); renderImportItems(); importStatus.textContent = '';
  });
  const importPreviewActions = node('div', 'project-sheet__actions'); importPreviewActions.append(importCopyButton, clearImportButton);
  importPreviewInfo.append(importPreviewTitle, importPreviewMeta, importPreviewActions);
  importPreview.append(importPreviewCanvas, importPreviewFallback, importPreviewInfo);
  importSection.append(importNote, fileActions, fileNote, input, importStatus, importSearch, importCount, importPreview, importListStatus, importList, importEmpty, importRetry);
  const tabs = node('div', 'project-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '作品の操作');
  const currentPane = node('section', 'project-pane'); currentPane.id = 'project-current-pane';
  const libraryPane = node('section', 'project-pane'); libraryPane.id = 'project-library-pane';
  const currentTab = button('今の作品', 'project-tab-current', () => selectPane('current'));
  const libraryTab = button('保存した作品', 'project-tab-library', () => { selectPane('library'); void refreshList(); });
  const importTab = button('取り込む', 'project-tab-import', () => { selectPane('import'); void refreshImports(); });
  const panes = [['library', libraryTab, libraryPane], ['import', importTab, importSection], ['current', currentTab, currentPane]];
  for (const [name, tab, pane] of panes) {
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', pane.id);
    pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const index = panes.findIndex(([key]) => key === name);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? panes.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + panes.length) % panes.length;
      const [target, targetTab] = panes[next]; selectPane(target); targetTab.focus();
      if (target === 'library') void refreshList();
      if (target === 'import') void refreshImports();
    });
  }
  tabs.append(libraryTab, importTab, currentTab);
  const identity = node('div', 'project-sheet__identity');
  identity.innerHTML = `<span class="project-sheet__preview">${icon(tool)}<canvas hidden aria-label="今の作品のプレビュー" role="img"></canvas></span><span><span class="project-sheet__eyebrow">今の作品</span><strong></strong><small></small></span>`;
  const previewCanvas = identity.querySelector('canvas');
  const previewFallback = identity.querySelector('svg');
  function refreshCurrentPreview() {
    // Read only the current pixels. Opening the manager must never save, fork,
    // or replace the session merely to render a thumbnail.
    const image = getPreviewImage() || activeCanvas;
    let source = null;
    if (image?.rgba) {
      source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
      source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
    }
    previewCanvas.hidden = !source; previewFallback.toggleAttribute('hidden', Boolean(source));
    if (!source) return;
    const scale = Math.min(1, 160 / Math.max(source.width, source.height));
    previewCanvas.width = Math.max(1, Math.round(source.width * scale)); previewCanvas.height = Math.max(1, Math.round(source.height * scale));
    const context = previewCanvas.getContext('2d'); context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, previewCanvas.width, previewCanvas.height);
    previewCanvas.setAttribute('aria-label', `今の作品のプレビュー、${source.width} × ${source.height}px`);
    return { width: source.width, height: source.height };
  }
  const identityName = identity.querySelector('strong'); const identityMeta = identity.querySelector('small');
  const toolbar = node('div', 'project-sheet__toolbar'); newButton.textContent = '＋ 新規作成'; toolbar.append(tabs, newButton);
  const search = node('input', 'project-search'); search.type = 'search'; search.id = 'project-search'; search.placeholder = '作品名で探す'; search.setAttribute('aria-label', '保存した作品を作品名で探す');
  const count = node('p', 'project-library-count'); count.setAttribute('role', 'status');
  const noMatches = node('p', 'project-list__empty', 'この名前の作品は見つかりません。'); noMatches.hidden = true;
  const selectionToolbar = node('div', 'project-gallery-toolbar'); selectionToolbar.hidden = true;
  const selectionCount = node('span', 'project-gallery-toolbar__count'); selectionCount.setAttribute('role', 'status');
  const selectButton = button('選択', 'project-select', () => gallery.setSelection(true));
  const selectAll = button('すべて選択', 'project-select-all', () => gallery.selectAll());
  const cancelSelection = button('キャンセル', 'project-select-cancel', () => gallery.setSelection(false));
  selectAll.hidden = cancelSelection.hidden = true; selectionToolbar.append(selectionCount, selectButton, selectAll, cancelSelection);
  const selectionActions = node('div', 'project-gallery-actions'); selectionActions.hidden = true;
  const deleteSelected = button('削除', 'project-delete-selected', () => void deleteProjects(gallery.selection));
  selectionActions.append(deleteSelected);
  const help = node('p', 'project-gallery-help', 'タップで開く · 長押しで複数選択');
  const retryList = button('もう一度読み込む', 'project-list-retry', () => void refreshList({ force: true })); retryList.hidden = true;
  const gallery = mountProjectGallery({ list, scroller: dialog, onOpen: openSavedProject,
    onContext: (item, card) => { retireManagerAd('context-menu'); showCardActions(item, card, () => openSavedProject(item)); },
    isLocked: () => locked, currentId: () => session.currentProject?.projectId,
    onSelection({ selecting, selected, total, visible, all }) {
      managerAdState.selecting = selecting; managerAdState.searching = Boolean(search.value);
      if (selecting || search.value) retireManagerAd('selection-or-search');
      selectionToolbar.hidden = total === 0; selectionActions.hidden = !selecting;
      selectButton.hidden = selecting; selectAll.hidden = cancelSelection.hidden = !selecting;
      selectAll.textContent = all ? 'すべて解除' : search.value ? '検索結果を選択' : 'すべて選択';
      selectionCount.textContent = selecting ? `${selected}件選択` : `${total}作品`;
      deleteSelected.textContent = selected ? `${selected}件を削除` : '削除する作品を選択'; deleteSelected.disabled = !selected || locked;
      noMatches.hidden = total === 0 || visible > 0;
      count.textContent = total ? `${search.value ? `${visible} / ${total}作品 · ` : ''}最近保存した順` : '';
      libraryPane.dataset.empty = String(total === 0); search.hidden = count.hidden = help.hidden = total === 0;
    }
  });
  const importGallery = mountProjectGallery({ list: importList, scroller: dialog, readOnly: true,
    onOpen: item => { selectImport(item); importPreview.scrollIntoView({ block: 'nearest' }); importCopyButton.focus({ preventScroll: true }); }, isLocked: () => locked || importReading, currentId: () => selectedImport?.projectId,
    actionLabel: '取り込みプレビューを表示', getBadge: importLabel,
    onSelection({ total, visible }) {
      importCount.textContent = total ? `${importSearch.value ? `${visible} / ` : ''}${total}作品 · 選んでプレビュー` : '';
      importSearch.hidden = importCount.hidden = total === 0;
      importEmpty.hidden = visible > 0;
      importEmpty.textContent = total ? 'この名前の作品は見つかりません。' : '以前の作品はまだありません。PXDバックアップは上のボタンから選べます。';
    }
  });
  const libraryData = createLazyGalleryData({
    load: () => store.listProjects(), isVisible: () => dialog.open && !libraryPane.hidden,
    onBusy(value) {
      managerAdState.settled = !value; list.setAttribute('aria-busy', String(value));
      if (value) { retryList.hidden = true; if (!listLoaded) { count.hidden = false; count.textContent = '作品を読み込んでいます…'; } }
      managerAd?.update();
      if (!value && !managerAdState.hasErrors && managerAdState.enoughArtwork) prepareManagerAd();
    },
    onData({ projects, errors }) {
      if (listError && message.textContent === listError) say(operationError || '');
      listError = '';
      managerArtworkCount = projects.length; managerAdState.enoughArtwork = hasManagerArtwork(projects, projectManagerAdConfig.minimumArtwork);
      managerAdState.hasErrors = errors.length > 0 || failed || Boolean(operationError) || Boolean(initialRestoreError);
      listLoaded = true; list.querySelector('.project-list__empty')?.remove(); gallery.setItems(projects);
      if (!projects.length && errors.length === 0) {
        const empty = node('div', 'project-list__empty project-empty-state');
        const emptyNew = button('＋ 最初の作品を作る', 'project-empty-new', () => newButton.click());
        empty.append(node('p', '', '保存した作品はまだありません。'), emptyNew);
        list.append(empty);
      }
      retryList.hidden = errors.length === 0;
      if (errors.length) say(`${errors.length}件の保存内容を確認できませんでした。ほかの作品は開けます。`);
    },
    onError(error) {
      managerAdState.hasErrors = true; managerAdState.enoughArtwork = false;
      listError = `作品一覧を読み出せませんでした。保存内容は変更していません。${error.message || ''}`;
      retryList.hidden = false; say(listError);
    }
  });
  const importData = createLazyGalleryData({
    load: () => store.listImportSources(), isVisible: () => dialog.open && !importSection.hidden,
    onBusy(value) { importList.setAttribute('aria-busy', String(value)); if (value) importRetry.hidden = true; },
    onData({ projects, errors }) {
      importSources = projects; renderImportItems(); importListStatus.textContent = ''; importRetry.hidden = errors.length === 0;
      if (selectedImport && selectedImport !== stagedImport && !projects.some(item => item.projectId === selectedImport.projectId && item.revisionId === selectedImport.revisionId)) selectImport(null);
      if (errors.length) importListStatus.textContent = `${errors.length}件を読み出せませんでした。ほかの作品は取り込めます。`;
    },
    onError() { importListStatus.textContent = '取り込み用の作品を読み出せませんでした。元の作品は変更していません。'; importRetry.hidden = false; }
  });
  search.addEventListener('input', () => { gallery.filter(search.value); dialog.scrollTop = 0; });
  importSearch.addEventListener('input', () => { importGallery.filter(importSearch.value); dialog.scrollTop = 0; });
  function selectPane(name) {
    if (dialog.open) retireManagerAd('pane-change');
    for (const [key, tab, pane] of panes) {
      const active = key === name; pane.hidden = !active; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    }
    if (name !== 'import' && importReading) { ++importFileEpoch; importReading = false; importStatus.textContent = ''; }
    managerAdState.libraryVisible = name === 'library'; managerAdState.importing = name === 'import';
    message.textContent = operationError || ''; // Do not carry old success messages into another pane.
    dialog.scrollTop = 0; gallery.refresh(); importGallery.refresh();
    if (initialized) update();
  }
  const header = node('div', 'project-sheet__header'); header.append(heading, toolbar);
  currentCard.append(identity, resumeButton, renameDetails);
  currentPane.append(currentCard, backupSection, transferSection, moreActions);
  libraryPane.append(storageNote, search, selectionToolbar, count, help, list, noMatches, retryList, selectionActions);
  dialog.append(header, recoveryDescription, message, currentPane, libraryPane, importSection); selectPane('library'); document.body.append(dialog);
  // Retained editors share the shell, but each owns its project controls and route pointer.
  if (idPrefix) for (const container of [bar, dialog]) {
    for (const el of [container, ...container.querySelectorAll('[id]')]) if (el.id) el.id = idPrefix + el.id;
    for (const el of container.querySelectorAll('[for], [aria-controls], [aria-labelledby], [aria-describedby]')) {
      for (const attr of ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) if (el.hasAttribute(attr)) el.setAttribute(attr, el.getAttribute(attr).split(' ').map(id => idPrefix + id).join(' '));
    }
  }
  const retireBeforeManagerControl = event => {
    const control = event.target?.closest?.('button, input, select, textarea, summary, a[href], [tabindex]:not([tabindex="-1"])');
    if (control?.classList.contains('project-gallery__tile') && (event.type === 'pointerdown' || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(event.key))) return;
    if (control && dialog.contains(control) && !control.closest('.project-manager-ad')) retireManagerAd('interaction');
  };
  dialog.addEventListener('pointerdown', retireBeforeManagerControl, { capture: true, signal: lifecycle.signal });
  dialog.addEventListener('keydown', retireBeforeManagerControl, { capture: true, signal: lifecycle.signal });
  search.addEventListener('focus', () => retireManagerAd('search'), { signal: lifecycle.signal });
  function prepareManagerAd() {
    if (managerAdPrepared || !dialog.open || libraryPane.hidden) return;
    managerAdPrepared = true;
    managerAdFrame = requestAnimationFrame(() => {
      managerAdFrame = 0;
      if (!dialog.open || libraryPane.hidden) return;
      try { managerAd = mountProjectGalleryAdSeries({ doc: document, win: window, dialog, pane: libraryPane, list, gallery,
        artworkCount: managerArtworkCount, galleryState: managerAdState, config: projectManagerAdConfig }); }
      catch { managerAd?.dispose(); gallery.clearBreaks(); }
    });
  }
  dialog.addEventListener('cancel', (event) => { if (locked || gallery.selecting) { event.preventDefault(); if (!locked) gallery.setSelection(false); } });
  dialog.addEventListener('close', () => { closeManagerAd(); gallery.setSelection(false); libraryData.invalidate(); importData.invalidate(); ++importFileEpoch; importReading = false; stagedImport = null; selectImport(null); renderImportItems(); importStatus.textContent = ''; if (initialSelectionPending && !locked) { initialSelectionPending = false; update(); } });
  dialog.addEventListener('click', (event) => { if (event.target === dialog && !locked) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  const session = createProjectSession({ store,
    async capture(base) {
      const state = structuredClone(getEditorState()); const safe = await freezeProjectComponents(base); const captured = getProject(safe);
      return Promise.resolve(captured).then((candidate) => {
        candidate.manifest = { ...candidate.manifest, toolProject: { schemaVersion: 1, tool }, lastMode: tool, editorState: { ...candidate.manifest.editorState, [tool]: state } }; return candidate;
      });
    },
    async apply(project) {
      await assertOwnPublicSources(getPxdPublicSources(project));
      const previousState = structuredClone(getEditorState());
      const previous = !modeSwitching && session.currentProject ? await getProject(structuredClone(session.currentProject)) : null;
      try {
        await openProject(await freezeProjectComponents(project)); restoreEditorState(project.manifest.editorState?.[tool]);
        const role = tool === 'draw' ? getEditorState().imageRole || componentImageRole(project, tool) : componentImageRole(project, tool);
        activeCanvas = await readPxdImage(project, role);
      }
      catch (error) {
        // A renderer failure after assignment must restore the old content too,
        // not only the coordinator's project ID.
        if (!modeSwitching && previous) { await openProject(previous); restoreEditorState(previousState); }
        throw error;
      }
      editedSinceOpen = false;
    },
    authorize: (project) => assertOwnPublicSources([...getPxdPublicSources(project), ...getPublicSources()]),
    onChange() { update(); }
  });
  function blankProject() { return createPxdProject({ manifest: { title: '無題の作品', createdAt: Date.now(), lastMode: tool, toolProject: { schemaVersion: 1, tool } } }); }
  function say(text) { message.textContent = text; setStatus(text); }
  function restoreError(text) {
    initialRestoreError = text;
    document.dispatchEvent(new CustomEvent('pixieed:project-restore-state'));
  }
  function update() {
    const project = session?.currentProject;
    managerAdState.busy = locked || session.busy; managerAdState.restoring = Boolean(initialRestoreError);
    managerAdState.dirty = session.dirty && editedSinceOpen; managerAdState.hasErrors ||= failed || Boolean(operationError);
    managerAdState.libraryVisible = !libraryPane.hidden; managerAdState.importing = !importSection.hidden;
    managerAd?.update();
    dialog.dataset.startup = String(initialSelectionPending);
    title.textContent = initialRestoreError ? '前回の作品を開けませんでした' : initialSelectionPending ? '作品を選ぶ' : '作品を管理';
    recoveryDescription.hidden = !initialRestoreError;
    if (initialRestoreError) dialog.setAttribute('aria-describedby', recoveryDescription.id); else dialog.removeAttribute('aria-describedby');

    bar.hidden = main.hidden || main.getAttribute('aria-hidden') === 'true' || getPublicSources().length > 0;
    const name = initialRestoreError ? '前回の作品を確認できません' : initialized ? sanitizeProjectTitle(project?.manifest.title) : '開いています…';
    launcher.disabled = locked;
    launcher.querySelector('.project-bar__name').textContent = name;
    const state = initialRestoreError ? '復元待ち' : failed ? '保存失敗' : session.busy ? 'ブラウザーに保存中' : session.dirty || !session.persisted ? '編集中' : 'このブラウザーに保存済み';
    launcher.dataset.state = initialRestoreError || failed ? 'error' : session.busy ? 'saving' : session.dirty || !session.persisted ? 'editing' : 'saved';
    launcher.setAttribute('aria-label', `${name}・${state}。作品を開く`); launcher.title = `${name} · ${state}`;
    if (isActive()) document.body.dataset.toolTransferReady = String(getPublicSources().length === 0 && hasContent());
    identity.querySelector('svg').innerHTML = icons[tool] || icons.folder;
    identityName.textContent = name;
    let previewSize = activeCanvas;
    // Preview failure must not interrupt a save, restore, or input unlock.
    if (dialog.open && !currentPane.hidden) try { previewSize = refreshCurrentPreview() || activeCanvas; }
    catch { previewCanvas.hidden = true; previewFallback.removeAttribute('hidden'); }
    const dimensions = previewSize?.width && previewSize?.height ? `${previewSize.width} × ${previewSize.height}px` : '';
    identityMeta.textContent = [state, dimensions].filter(Boolean).join(' · ');
    identity.dataset.state = initialRestoreError || failed ? 'error' : session.busy ? 'saving' : session.dirty || !session.persisted ? 'editing' : 'saved';
    for (const el of dialog.querySelectorAll('button')) el.disabled = locked;
    for (const el of [resumeButton, rename, duplicate, saveButton, exportButton]) el.disabled = locked || Boolean(initialRestoreError);
    const backup = findPxdOriginalBackup(project);
    original.hidden = !backup; if (backup) original.textContent = backup.label;
    if (!titleInput.matches(':focus')) titleInput.value = name;
    const canTransfer = Boolean(!getPublicSources().length && hasContent());
    transferSection.hidden = !canTransfer;
    const sharedModes = document.body.classList.contains('creation-suite');
    transferNote.textContent = sharedModes ? '音楽は同じ作品で編集。ゲームはコピーを作って開きます。' : 'コピーを作って開きます。今の作品は残ります。';
    for (const { target, el } of transferTargets) {
      el.disabled = locked || !canTransfer;
      el.querySelector('small').textContent = sharedModes && ['draw', 'audio'].includes(target) ? '同じ作品で編集' : 'コピーして開く';
    }
    for (const el of [selectButton, selectAll, cancelSelection, retryList]) el.disabled = locked;
    deleteSelected.disabled = locked || !gallery.selection.length; importCopyButton.disabled = locked || importReading || !selectedImport; gallery.refresh(); importGallery.refresh();
  }
  async function save() {
    clearTimeout(timer);
    try {
      if (initialRestoreError) throw new Error(initialRestoreError);
      const project = await session.save();
      if (project.projectId !== session.currentProject?.projectId) throw new Error('保存中に作品が切り替わりました。今の作品の保存先は変更していません。');
      libraryData.invalidate(); failed = false; remember(project); update(); return project;
    }
    catch (error) { failed = true; operationError = error.message || '保存できませんでした。編集内容は残っています。'; say(operationError); update(); throw error; }
  }
  function remember(project) {
    if (initialRestoreError) restoreError('');
    failed = false;
    try { localStorage.setItem(rememberKey || `pixieed:pxd:last:${tool}`, JSON.stringify({ projectId: project.projectId, revisionId: project.revisionId })); } catch {}
    if (rememberShared && tool === 'draw' && document.body.classList.contains('creation-suite')) try { localStorage.setItem('pixieed:pxd:last:creation', JSON.stringify({ projectId: project.projectId, revisionId: project.revisionId })); } catch {}
    if (!routePointer) {
      if (initialPointer) {
        const params = new URLSearchParams(location.search);
        params.set('modeProjectTool', tool); params.set('modePxd', project.projectId); params.set('modePxdRevision', project.revisionId);
        history.replaceState(history.state, '', `${location.pathname}?${params}${location.hash}`);
      }
      return;
    }
    const params = new URLSearchParams(location.search); params.set('pxd', project.projectId); params.set('pxdRevision', project.revisionId);
    history.replaceState({ ...history.state, projectWorkspaceSelection: true }, '', `${location.pathname}?${params}${location.hash}`);
  }
  function resetPointer() { if (initialRestoreError) restoreError(''); if (!routePointer) return; const params = new URLSearchParams(location.search); for (const key of ['pxd', 'pxdRevision', 'pxdImage']) params.delete(key); const state = { ...history.state }; delete state.projectWorkspaceSelection; history.replaceState(state, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`); }
  async function transact(work, { close: closeSheet = true } = {}) {
    if (locked) return;
    retireManagerAd('operation');
    locked = true; clearTimeout(timer); syncInputLock(); update();
    if (closeSheet) dialog.close();
    try { await work(); operationError = ''; }
    catch (error) { if (session.dirty && session.currentProject?.entries.length) editedSinceOpen = true; operationError = error.message || '作品を開けませんでした。今の作品は保持しています。'; say(operationError); }
    finally { locked = false; syncInputLock(); update(); scheduleAutoSave(); }
  }
  function openSavedProject(item) {
    return transact(async () => {
          let keptCopy = false;
          if (!initialRestoreError && (session.persisted || editedSinceOpen)) {
            try { await save(); }
            catch (error) {
              if (error?.code !== 'PXD_STORE_CONFLICT') throw error;
              const source = await getProject(await freezeProjectComponents(structuredClone(session.currentProject)));
              await assertOwnPublicSources([...getPxdPublicSources(source), ...getPublicSources()]);
              source.manifest.editorState = { ...source.manifest.editorState, [tool]: structuredClone(getEditorState()) };
              const copy = forkProject(source, { title: `${source.manifest.title || '作品'}・別タブの編集` });
              await store.save(copy, { expectedRevisionId: null }); keptCopy = true;
            }
          }
          const project = await store.load(item.projectId); if (!project) throw new Error('この作品が見つかりません。');
          await session.adopt(project, { persisted: true, apply: true }); resetPointer(); remember(session.currentProject);
          initialSelectionPending = false; dialog.close();
          say(keptCopy ? 'このタブの編集は別の作品に保存し、選んだ作品を開きました。' : '作品を開きました。');
    }, { close: false });
  }
  function refreshList(options) { return libraryData.ensure(options); }
  async function importCopy(source) {
    if (!initialRestoreError && (session.persisted || editedSinceOpen)) await save();
    const project = await importToolProject(source, tool);
    await session.adopt(project, { persisted: false, apply: true });
    resetPointer(); await save(); initialSelectionPending = false; dialog.close();
    say('新しい作品として取り込みました。元の作品は変わりません。');
  }
  function importLabel(item) {
    return item === stagedImport ? 'PXDバックアップ' : modes.find(([target]) => target === item.summary.lastMode)?.[1] || '以前の作品';
  }
  function selectImport(item) {
    selectedImport = item; importPreview.hidden = !item;
    importCopyButton.disabled = locked || importReading || !item;
    if (item) {
      drawProjectThumbnail(importPreviewCanvas, item.summary.thumbnail);
      importPreviewCanvas.hidden = !item.summary.thumbnail; importPreviewFallback.hidden = Boolean(item.summary.thumbnail);
      importPreviewFallback.textContent = item.summary.hasAudio ? '♪' : '作品';
      importPreviewTitle.textContent = item.summary.name || '無題の作品';
      const size = item.summary.width ? `${item.summary.width} × ${item.summary.height}px` : '画像のプレビューはありません';
      importPreviewMeta.textContent = `${importLabel(item)} · ${size}${item.filename ? ` · ${item.filename}` : ''}。元の作品は残ります。`;
      clearImportButton.textContent = item === stagedImport ? '候補から外す' : '選択を解除';
    }
    importGallery.refresh();
  }
  function renderImportItems() { importGallery.setItems(stagedImport ? [stagedImport, ...importSources] : importSources); }
  function refreshImports(options) { return importData.ensure(options); }
  async function confirmDelete(items) {
    const confirmation = node('dialog', 'project-delete-dialog'); confirmation.setAttribute('aria-labelledby', 'project-delete-title');
    const heading = node('h2', '', `${items.length}件の作品を完全に削除しますか？`); heading.id = 'project-delete-title';
    const preview = node('div', 'project-delete-dialog__preview'); preview.setAttribute('aria-hidden', 'true');
    if (items.length === 1) { const canvas = node('canvas'); drawProjectThumbnail(canvas, items[0].summary.thumbnail); preview.append(canvas); }
    const names = items.slice(0, 3).map(item => item.summary.name || '無題の作品').join('、');
    const projectName = node('p', 'project-delete-dialog__name', names + (items.length > 3 ? ` ほか${items.length - 3}件` : ''));
    const text = node('p', '', 'この端末の作品と保存履歴を削除します。削除後は元に戻せません。他の作品・書き出したファイル・公開済みの投稿は残ります。'); text.id = 'project-delete-description';
    confirmation.setAttribute('aria-describedby', text.id);
    const controls = node('div', 'project-sheet__actions');
    return new Promise(resolve => {
      let finished = false;
      const finish = value => { if (finished) return; finished = true; confirmation.close(); confirmation.remove(); resolve(value); };
      const header = node('div', 'project-delete-dialog__header');
      const dismiss = button('×', 'project-delete-dismiss', () => finish(false)); dismiss.setAttribute('aria-label', '削除をキャンセルして閉じる'); header.append(heading, dismiss);
      const cancel = button('キャンセル', 'project-delete-cancel', () => finish(false));
      controls.append(cancel, button(`${items.length}件を完全に削除`, 'project-delete-confirm', () => finish(true)));
      confirmation.append(header, ...(items.length === 1 ? [preview] : []), projectName, text, controls); document.body.append(confirmation);
      confirmation.addEventListener('cancel', event => { event.preventDefault(); finish(false); }); confirmation.showModal(); cancel.focus();
    });
  }
  function showCardActions(item, card, openCard) {
    if (locked || document.querySelector('.project-card-actions')) return false;
    const sheet = node('dialog', 'project-delete-dialog project-card-actions');
    sheet.setAttribute('aria-labelledby', 'project-card-actions-title');
    const title = node('h2', '', item.summary.name || '無題の作品'); title.id = 'project-card-actions-title';
    const preview = node('div', 'project-card-actions__preview');
    const source = card.querySelector('canvas');
    if (source) { const canvas = node('canvas'); canvas.width = source.width; canvas.height = source.height; canvas.getContext('2d').drawImage(source, 0, 0); preview.append(canvas); }
    const controls = node('div', 'project-card-actions__controls');
    const close = () => { sheet.close(); sheet.remove(); card.focus(); };
    const open = button('開く', 'project-card-actions-open', () => { close(); openCard(); });
    open.innerHTML = `${icon('folder')}<span>続きを開く</span>`;
    const copy = button('複製', 'project-card-actions-copy', () => {
      close(); void transact(async () => {
        if (!initialRestoreError && (session.persisted || editedSinceOpen)) await save();
        const original = await store.load(item.projectId); if (!original) throw new Error('この作品は削除されたか、保存先に見つかりません。');
        const project = forkProject(original, { title: `${original.manifest.title || '作品'} のコピー` });
        await session.adopt(project, { persisted: false, apply: true }); resetPointer(); await save(); say('別の作品として複製しました。');
      });
    });
    const remove = button('削除', 'project-card-actions-delete', () => { close(); void deleteProjects([item]); });
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg><span>作品を削除</span>';
    controls.append(open, copy, remove, button('閉じる', 'project-card-actions-close', close));
    const header = node('div', 'project-delete-dialog__header');
    const dismiss = button('×', 'project-card-actions-dismiss', close);
    dismiss.setAttribute('aria-label', '作品の操作を閉じる');
    header.append(title, dismiss);
    sheet.append(header, preview, controls); document.body.append(sheet);
    sheet.addEventListener('cancel', (event) => { event.preventDefault(); close(); }); sheet.showModal();
  }
  async function deleteProjects(items) {
    if (!items.length) return;
    await transact(async () => {
      if (!await confirmDelete(items)) return;
      const removesCurrent = items.some(item => item.projectId === session.currentProject?.projectId);
      const targets = items.map(item => ({ projectId: item.projectId, expectedRevisionId: item.revisionId }));
      let previous = null;
      if (removesCurrent) {
        previous = await save();
        targets.find(item => item.projectId === previous.projectId).expectedRevisionId = previous.revisionId;
        // Validate and apply a new canvas before destroying the saved one. A
        // failed deletion restores the saved editor and its compare-and-swap head.
        await session.adopt(blankProject(), { persisted: false, apply: true });
      }
      try { await store.purgeProjects(targets); }
      catch (error) {
        if (previous) await session.adopt(previous, { persisted: true, apply: true });
        throw error;
      }
      if (removesCurrent) { resetPointer(); initialSelectionPending = false; }
      const deletedIds = new Set(targets.map(item => item.projectId));
      for (const key of [rememberKey || `pixieed:pxd:last:${tool}`, ...(rememberShared ? ['pixieed:pxd:last:creation'] : [])]) {
        try { if (deletedIds.has(JSON.parse(localStorage.getItem(key) || 'null')?.projectId)) localStorage.removeItem(key); } catch {}
      }
      gallery.setSelection(false); libraryData.invalidate(); await refreshList(); say(`${items.length}件の作品を完全に削除しました。`);
    }, { close: false });
  }
  async function showProjects({ pane, focusTransfer = false } = {}) {
    if (locked) return; for (const el of main.querySelectorAll('details[open]')) el.open = false;
    if (!dialog.open) { selectPane(pane || 'library'); dialog.showModal(); }
    else if (pane) selectPane(pane);
    update();
    message.textContent = operationError || '';
    if (!currentPane.hidden) gallery.refresh();
    else if (!libraryPane.hidden) await refreshList();
    if (!importSection.hidden) await refreshImports();
    if (focusTransfer) transferTargets.find(({ el }) => !el.hidden && !el.disabled)?.el.focus();
  }
  async function openRecovery() {
    await showProjects({ pane: 'current' });
    if (!dialog.open) return;
    moreActions.open = true;
    say('原本や統合前のPXDを保存できます。複製は別作品として保持しますが、音楽の編集制限は引き継ぎます。');
    const action = original.hidden ? duplicate : original;
    action.focus({ preventScroll: true }); action.scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('pixieed:open-tool-transfer', () => {
    if (!isActive()) return;
    if (bar.hidden || locked) return;
    void showProjects({ pane: 'current', focusTransfer: true });
  }, { signal: lifecycle.signal });
  input.addEventListener('change', () => {
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    const version = ++importFileEpoch; importReading = true; stagedImport = null; selectImport(null); renderImportItems();
    importStatus.textContent = 'PXDのプレビューを読み込んでいます…';
    const active = () => version === importFileEpoch && dialog.open && !importSection.hidden;
    void (async () => {
      try {
        if (file.size > 64 * 1024 * 1024) throw new Error('PXDは64MBまで読み込めます。');
        const project = await decodePxd(new Uint8Array(await file.arrayBuffer())); if (!active()) return;
        const summary = await summarizeProject(project); if (!active()) return;
        // Staging is read-only. Save/fork only after the explicit copy action.
        stagedImport = { projectId: `pxd-preview-${crypto.randomUUID()}`, revisionId: project.revisionId, summary, project, filename: file.name };
        importReading = false; importSearch.value = ''; importGallery.filter(''); renderImportItems(); selectImport(stagedImport);
        importStatus.textContent = 'プレビューを確認して「コピーして開く」を選んでください。端末のPXDファイルは変更しません。';
        importCopyButton.focus({ preventScroll: true });
      } catch (error) {
        if (active()) importStatus.textContent = `PXDを読み込めませんでした：${error.message || 'ファイルを確認してください。'} 今の作品は変更していません。`;
      } finally { if (version === importFileEpoch) { importReading = false; importCopyButton.disabled = locked || !selectedImport; importGallery.refresh(); } }
    })();
  });
  ready = (async () => {
    if (initialProject) {
      try {
        await session.initialize(initialProject.savedProject || initialProject.project, { persisted: initialProject.persisted === true, apply: false });
        if (initialProject.savedProject) await session.replace(initialProject.project, { apply: false });
        editedSinceOpen = initialProject.edited === true;
        if (editedSinceOpen) session.markDirty();
        await assertOwnPublicSources(getPxdPublicSources(initialProject.project));
      } catch (error) { operationError = error.message; say(operationError); failed = true; }
      finally { locked = false; initialized = true; syncInputLock(); update(); }
      return session.persisted;
    }
    await session.initialize(blankProject(), { persisted: false, apply: tool !== 'camera' }); syncInputLock();
    const params = new URLSearchParams(location.search); let pointer = null;
    try {
      if (initialRestoreError) throw new Error(initialRestoreError);
      // An explicit revision remains authoritative when the current tab reloads.
      if (!routePointer) {
        if (initialPointer) pointer = initialPointer;
        else try { pointer = JSON.parse(localStorage.getItem(rememberKey || `pixieed:pxd:last:${tool}`) || 'null'); } catch { /* No remembered selection. */ }
      }
      if (routePointer && !params.has('pxd') && initialPointer) pointer = initialPointer;
      if (routePointer && params.has('pxd')) {
        if (params.getAll('pxd').length !== 1 || params.getAll('pxdRevision').length !== 1 || !params.get('pxdRevision')) throw new Error('作品の保存版を特定できません。作品一覧から開いてください。');
        pointer = { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
      }
      if (pointer) {
        let project;
        try { project = await store.load(pointer.projectId, pointer.revisionId); }
        catch (error) { if (!['PXD_TOOL_PROJECT_FOREIGN', 'PXD_TOOL_PROJECT_UNTAGGED'].includes(error?.code)) throw error; }
        if (project && initialPointer?.fork === true && !params.has('pxd')) {
          await session.adopt(forkProject(project, { title: `${project.manifest.title || '作品'} の続き` }), { persisted: false, apply: true });
          say('前回の作品をコピーして再開しました。元の保存内容は保持しています。');
        }
        else if (project) { await session.adopt(project, { persisted: true, apply: true }); remember(project); say('作品を開きました。'); }
        else {
          if (!allowImplicitImport && !params.has('pxd') && !params.has('modePxd')) {
            throw new Error('前回の作品は形式の確認が必要です。作品一覧からコピーして開いてください。元の保存内容は保持しています。');
          }
          const source = await store.loadImportSource(pointer.projectId, pointer.revisionId);
          if (!source) throw new Error('指定した作品をこの端末で見つけられません。作品一覧から開いてください。');
          await importCopy(source);
        }
      }
    } catch (error) { operationError = error.message; restoreError(operationError); say(operationError); }
    finally {
      initialSelectionPending = false;
      locked = false; initialized = true; syncInputLock(); update();
    }
    initialEntryFresh = isInitialProjectEntryFresh({ initialProject, pointer, hasQuery: !entryRequestClean && (params.size > 0 || Boolean(newStartRoute)), hash: location.hash, restoreError: initialRestoreError, operationError, failed });
    return session.persisted;
  })();
  function scheduleAutoSave() {
    clearTimeout(timer); timer = 0;
    if (initialRestoreError || transientNavigation || !initialized || locked || initialSelectionPending || !session.dirty || !editedSinceOpen || failed || getPublicSources().length) return;
    timer = setTimeout(() => {
      timer = 0;
      void save().then(() => { if (dialog.open) return refreshList(); })
        .catch((error) => say(`自動保存できませんでした：${error.message}。作品を切り替える前に保存してください。`));
    }, 1000);
  }
  function markDirty() {
    if (initialRestoreError || !initialized || locked || initialSelectionPending) return;
    if (getPublicSources().length) { update(); return; }
    editedSinceOpen = true;
    session.markDirty(); failed = false; update(); scheduleAutoSave();
  }
  const observer = new MutationObserver(() => { bar.hidden = main.hidden || main.getAttribute('aria-hidden') === 'true'; }); observer.observe(main, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  window.addEventListener('beforeunload', (event) => { if (!transientNavigation && (session.dirty && editedSinceOpen || session.busy)) { event.preventDefault(); event.returnValue = ''; } }, { signal: lifecycle.signal });
  function setModeAdapter(options, { project } = {}) {
    const previousReady = ready;
    const switching = (async () => {
      await previousReady.catch(() => {});
      await session.wait();
      if (!options || typeof options.tool !== 'string' || typeof options.getProject !== 'function' || typeof options.openProject !== 'function') throw new TypeError('PROJECT_WORKSPACE_MODE_INVALID');
      const nextMain = document.querySelector('#main') || document.querySelector('main');
      if (!nextMain) throw new Error('制作画面が見つかりません。');

      tool = options.tool;
      getProject = options.getProject;
      openProject = options.openProject;
      setStatus = typeof options.setStatus === 'function' ? options.setStatus : () => {};
      getPublicSources = typeof options.getPublicSources === 'function' ? options.getPublicSources : () => [];
      getEditorState = typeof options.getEditorState === 'function' ? options.getEditorState : () => ({});
      getPreviewImage = typeof options.getPreviewImage === 'function' ? options.getPreviewImage : () => null;
      restoreEditorState = typeof options.restoreEditorState === 'function' ? options.restoreEditorState : () => {};
      if (Object.hasOwn(options, 'onNavigate')) onNavigate = options.onNavigate;
      main = nextMain;
      observer.disconnect(); observer.observe(main, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });

      const ownsLock = !locked;
      if (ownsLock) locked = true;
      syncInputLock(); update();
      modeSwitching = true;
      try {
        const nextProject = project ?? session.currentProject;
        await session.adopt(nextProject, { persisted: project ? true : session.persisted, apply: true });
        failed = false; operationError = '';
      } finally {
        modeSwitching = false;
        if (ownsLock) { locked = false; syncInputLock(); }
        update();
      }
    })();
    ready = switching;
    return switching;
  }
  return Object.freeze({ get ready() { return ready; }, save, markDirty, showProjects, openRecovery, setModeAdapter, setModeTransitionActive, syncInputLock, activate: update,
    dispose() { closeManagerAd(); transientNavigation = true; clearTimeout(timer); timer = 0; lifecycle.abort(); observer.disconnect(); gallery.dispose(); importGallery.dispose(); libraryData.dispose(); importData.dispose(); ++importFileEpoch; stagedImport = selectedImport = null; importSources = []; dialog.close(); dialog.remove(); (bar.closest('.px-tool-header-slot') || bar).remove(); if (ownsCss) css?.remove(); },
    async importProject(project) { await ready; await transact(() => importCopy(project)); },
    async beforeReplace(work) { await ready; await transact(async () => { await save(); await work(); }); markDirty(); }, reset() { clearTimeout(timer); session.reset(); resetPointer(); update(); },
    async pauseForNavigation() {
      await ready;
      transientNavigation = true; clearTimeout(timer); timer = 0;
      await session.wait();
      return () => { transientNavigation = false; scheduleAutoSave(); };
    },
    async startNewCaptureProject() {
      if (tool !== 'camera') throw new TypeError('撮影用の新しい作品はカメラから作成してください。');
      await ready;
      if (locked) throw new Error('作品の処理中です。少し待ってから撮影してください。');
      locked = true; syncInputLock(); update();
      try {
        clearTimeout(timer);
        await session.wait();
        if (session.dirty && session.currentProject?.entries.length) await save();
        await session.adopt(blankProject(), { persisted: false, apply: false });
        resetPointer();
        return session.currentProject;
      } finally {
        locked = false; syncInputLock(); update();
      }
    },
    async assertCanSave() { await assertOwnPublicSources([...getPxdPublicSources(session.currentProject), ...getPublicSources()]); return true; },
    get currentProject() { return session.currentProject; }, get heldProject() { return null; }, get busy() { return locked; },
    get persistedProject() { return session.persistedProject; },
    get persisted() { return session.persisted; }, get dirty() { return session.dirty && editedSinceOpen; },
    get restoreError() { return initialRestoreError; }, get initialEntryFresh() { return initialEntryFresh; }
  });
}
