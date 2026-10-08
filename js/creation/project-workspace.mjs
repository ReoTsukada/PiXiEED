import { createPxdProject, decodePxd } from './pxd-codec.mjs';
import { createToolProjectStore, cloneAsToolProject } from './tool-project-store.mjs?rev=20261001-free-tools-1';
import { importToolProject } from './tool-project-import.mjs?rev=20261006-draw-startup-1';
import { createProjectSession } from './project-session.mjs?rev=20261001-free-tools-1';
import { forkProject, sanitizeProjectTitle } from './project-catalog.mjs?rev=20261001-free-tools-1';
import { pxdToolUrl, readPxdImage } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { assertOwnPublicSources, getPxdPublicSources } from './work-save-policy.mjs?rev=20261001-free-tools-1';
import { componentImageRole, freezeProjectComponents } from './project-components.mjs?rev=20261006-draw-startup-1';
import { bindContextAction } from '../site-interactions.mjs?rev=20261001-interactions-1';
import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261006-header-controls-1';
import { sendToolOutput } from './output-handoff.mjs?rev=20261008-output-4';

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
function download(bytes, name) { const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); const link = node('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function sendPxdBackup(bytes, name, source, returnUrl) {
  const result = await sendToolOutput({
    blob: new Blob([bytes], { type: 'application/octet-stream' }), filename: name, returnUrl,
    title: 'PXDバックアップを確認', source,
    metadata: { description: '読み込んだPXDバックアップを内容を変えず保存します。' }
  });
  if (result.ok) return true;
  await download(bytes, name);
  return false;
}

/** Each tool owns its projects. Imports are independent copies, never linked editors. */
export function mountProjectWorkspace({ tool, getProject, openProject, setStatus = () => {}, getPublicSources = () => [], getEditorState = () => ({}), restoreEditorState = () => {}, onNavigate = null, hasContent = () => true, initialProject = null }) {
  const store = createToolProjectStore(tool); let main = document.querySelector('#main') || document.querySelector('main');
  main.inert = true; main.setAttribute('aria-busy', 'true');
  let locked = true; let initialized = false; let timer; let failed = false; let operationError = ''; let editedSinceOpen = false; let initialSelectionPending = false;
  let listEpoch = 0; let cardContextCleanups = []; let modeSwitching = false; let ready;
  let activeCanvas = null;
  let transientNavigation = false;
  const css = node('link'); css.rel = 'stylesheet'; css.href = '/css/project-workspace.css?rev=20261006-header-controls-1'; document.head.append(css);
  document.body.classList.add('project-workspace-ready');
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
  const actions = node('div', 'project-sheet__actions');
  const newButton = button('＋ 新規', 'project-new', () => void transact(async () => {
    if (session.persisted || editedSinceOpen) await save();
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
  const saveButton = button('保存し直す', 'pxd-save', () => void transact(async () => { await save(); say('この作品を保存し直しました。'); await refreshList(); }, { close: false }));
  const original = button('読み込んだファイルを保存', 'pxd-export-original', () => void transact(async () => {
    const project = await save(); const entry = project.entries.find(({ path }) => path === 'legacy/original.pxd');
    if (!entry) throw new Error('読み込んだファイルが見つかりません。');
    const sourceName = ({ draw: 'ドット絵', audio: 'ドットで音楽', camera: 'カメラ', jigsaw: 'ジグソー', spot_difference: '間違い探し', hidden_object: 'もの探し' })[tool] || 'プロジェクト';
    await sendPxdBackup(entry.bytes, 'pixieed-original.pxd', sourceName, `${location.pathname}${location.search}${location.hash}`);
  }, { close: false }));
  actions.append(duplicate, saveButton, original);
  const moreActions = node('details', 'project-files project-more');
  moreActions.append(node('summary', '', 'その他')); moreActions.append(actions);
  const transferSection = node('section', 'project-transfer');
  transferSection.setAttribute('aria-labelledby', 'project-transfer-title');
  const transferTitle = node('h3', '', '他のツールへ送る'); transferTitle.id = 'project-transfer-title';
  const transferNote = node('p', 'project-sheet__note', '内容をコピーして、新しい作品として開きます。元の作品はそのまま残ります。');
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
      el.innerHTML = `${icon(target)}<span>${label}</span>`;
      transferActions.append(el);
      return { target, el };
    });
  transferSection.append(transferTitle, transferNote, transferActions);
  const message = node('p', 'project-sheet__status'); message.id = 'pxd-file-status'; message.setAttribute('role', 'status');
  const list = node('div', 'project-list'); list.setAttribute('aria-label', '保存した作品');
  const trash = node('details', 'project-files project-trash'); const trashSummary = node('summary', '', '削除した作品');
  const trashList = node('div', 'project-trash__list'); trash.append(trashSummary, trashList);
  const importSection = node('details', 'project-files project-imports');
  importSection.append(node('summary', '', '取り込む'));
  const importNote = node('p', 'project-sheet__note project-files__note', '別の作品のコピーやPXDファイルを取り込みます。');
  const input = node('input'); input.type = 'file'; input.accept = '.pxd,application/octet-stream'; input.id = 'pxd-file-input'; input.hidden = true;
  const fileActions = node('div', 'project-sheet__actions');
  fileActions.append(button('PXDファイルを選ぶ', 'pxd-open', () => input.click()));
  const importList = node('div', 'project-list'); importList.id = 'project-import-list';
  importSection.append(importNote, fileActions, input, importList);
  const tabs = node('div', 'project-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '作品の操作');
  const currentPane = node('section', 'project-pane'); currentPane.id = 'project-current-pane';
  const libraryPane = node('section', 'project-pane'); libraryPane.id = 'project-library-pane';
  const currentTab = button('今の作品', 'project-tab-current', () => selectPane('current'));
  const libraryTab = button('保存した作品', 'project-tab-library', () => selectPane('library'));
  for (const [tab, pane] of [[libraryTab, libraryPane], [currentTab, currentPane]]) {
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', pane.id);
    pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const other = tab === currentTab ? libraryTab : currentTab;
      selectPane(event.key === 'Home' ? 'library' : event.key === 'End' ? 'current' : other === currentTab ? 'current' : 'library');
      (currentPane.hidden ? libraryTab : currentTab).focus();
    });
  }
  tabs.append(libraryTab, currentTab);
  const identity = node('div', 'project-sheet__identity');
  identity.innerHTML = `${icon(tool)}<span><strong></strong><small></small></span>`;
  const identityName = identity.querySelector('strong'); const identityMeta = identity.querySelector('small');
  const toolbar = node('div', 'project-sheet__toolbar'); newButton.textContent = '＋ 新規'; toolbar.append(tabs, newButton);
  const search = node('input', 'project-search'); search.type = 'search'; search.id = 'project-search'; search.placeholder = '作品名で探す'; search.setAttribute('aria-label', '保存した作品を作品名で探す');
  const count = node('p', 'project-library-count'); count.setAttribute('role', 'status');
  const noMatches = node('p', 'project-list__empty', 'この名前の作品は見つかりません。'); noMatches.hidden = true;
  function filterList() {
    const query = search.value.trim().normalize('NFKC').toLocaleLowerCase('ja-JP'); let visible = 0;
    const rows = [...list.querySelectorAll('.project-list__row')];
    for (const row of rows) { row.hidden = Boolean(query && !row.dataset.name.includes(query)); if (!row.hidden) visible++; }
    noMatches.hidden = !rows.length || visible > 0;
    count.textContent = rows.length ? `${query ? `${visible} / ${rows.length}` : rows.length}作品 · 最近保存した順` : '';
    libraryPane.dataset.empty = String(rows.length === 0);
    search.hidden = rows.length === 0; count.hidden = rows.length === 0;
  }
  search.addEventListener('input', filterList);
  function selectPane(name) {
    const current = name === 'current'; currentPane.hidden = !current; libraryPane.hidden = current;
    currentTab.setAttribute('aria-selected', String(current)); libraryTab.setAttribute('aria-selected', String(!current));
    currentTab.tabIndex = current ? 0 : -1; libraryTab.tabIndex = current ? -1 : 0;
    dialog.scrollTop = 0;
  }
  const header = node('div', 'project-sheet__header'); header.append(heading, toolbar);
  currentPane.append(identity, currentRow, moreActions, transferSection);
  libraryPane.append(search, count, list, noMatches, trash, importSection);
  dialog.append(header, message, currentPane, libraryPane); selectPane('library'); document.body.append(dialog);
  dialog.addEventListener('close', () => { if (initialSelectionPending && !locked) { initialSelectionPending = false; update(); } });
  dialog.addEventListener('click', (event) => { if (event.target === dialog && !locked) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  const session = createProjectSession({ store,
    async capture(base) {
      const state = structuredClone(getEditorState()); const safe = await freezeProjectComponents(base); const captured = getProject(safe);
      return Promise.resolve(captured).then((candidate) => {
        candidate.manifest = { ...candidate.manifest, toolProject: { schemaVersion: 1, tool }, lastMode: tool, editorState: { [tool]: state } }; return candidate;
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
  function update() {
    const project = session?.currentProject;
    dialog.dataset.startup = String(initialSelectionPending);
    title.textContent = initialSelectionPending ? '作品を選ぶ' : '作品を管理';

    bar.hidden = main.hidden || main.getAttribute('aria-hidden') === 'true' || getPublicSources().length > 0;
    const name = initialized ? sanitizeProjectTitle(project?.manifest.title) : '開いています…';
    launcher.disabled = locked;
    launcher.querySelector('.project-bar__name').textContent = name;
    const state = failed ? '保存失敗' : session.busy ? '保存中' : session.dirty || !session.persisted ? '編集中' : '保存済み';
    launcher.dataset.state = failed ? 'error' : session.busy ? 'saving' : session.dirty || !session.persisted ? 'editing' : 'saved';
    launcher.setAttribute('aria-label', `${name}・${state}。作品を開く`); launcher.title = `${name} · ${state}`;
    document.body.dataset.toolTransferReady = String(getPublicSources().length === 0 && hasContent());
    identity.querySelector('svg').innerHTML = icons[tool] || icons.folder;
    identityName.textContent = name;
    const dimensions = activeCanvas?.width && activeCanvas?.height ? `${activeCanvas.width} × ${activeCanvas.height}px` : '';
    identityMeta.textContent = [state, dimensions].filter(Boolean).join(' · ');
    identity.dataset.state = failed ? 'error' : session.busy ? 'saving' : session.dirty || !session.persisted ? 'editing' : 'saved';
    for (const el of dialog.querySelectorAll('button')) el.disabled = locked;
    original.hidden = !project?.entries.some(({ path }) => path === 'legacy/original.pxd');
    if (!titleInput.matches(':focus')) titleInput.value = name;
    const canTransfer = Boolean(!getPublicSources().length && hasContent());
    transferSection.hidden = !canTransfer;
    for (const { el } of transferTargets) el.disabled = locked || !canTransfer;
  }
  async function save() {
    clearTimeout(timer);
    try {
      const project = await session.save();
      if (project.projectId !== session.currentProject?.projectId) throw new Error('保存中に作品が切り替わりました。今の作品の保存先は変更していません。');
      failed = false; remember(project); update(); return project;
    }
    catch (error) { failed = true; operationError = error.message || '保存できませんでした。編集内容は残っています。'; say(operationError); update(); throw error; }
  }
  function remember(project) {
    failed = false;
    try { localStorage.setItem(`pixieed:pxd:last:${tool}`, JSON.stringify({ projectId: project.projectId, revisionId: project.revisionId })); } catch {}
    const params = new URLSearchParams(location.search); params.set('pxd', project.projectId); params.set('pxdRevision', project.revisionId);
    history.replaceState({ ...history.state, projectWorkspaceSelection: true }, '', `${location.pathname}?${params}`);
  }
  function resetPointer() { const params = new URLSearchParams(location.search); for (const key of ['pxd', 'pxdRevision', 'pxdImage']) params.delete(key); const state = { ...history.state }; delete state.projectWorkspaceSelection; history.replaceState(state, '', `${location.pathname}${params.size ? `?${params}` : ''}`); }
  async function transact(work, { close: closeSheet = true } = {}) {
    if (locked) return;
    locked = true; clearTimeout(timer); main.inert = true; main.setAttribute('aria-busy', 'true'); update();
    if (closeSheet) dialog.close();
    try { await work(); operationError = ''; }
    catch (error) { if (session.dirty && session.currentProject?.entries.length) editedSinceOpen = true; operationError = error.message || '作品を開けませんでした。今の作品は保持しています。'; say(operationError); }
    finally { locked = false; main.inert = false; main.setAttribute('aria-busy', 'false'); update(); scheduleAutoSave(); }
  }
  async function refreshList() {
    const version = ++listEpoch;
    for (const cleanup of cardContextCleanups) cleanup(); cardContextCleanups = [];
    list.replaceChildren(node('p', '', '作品を読み込んでいます…'));
    try {
      const { projects, errors } = await store.listProjects(); if (version !== listEpoch) return; list.replaceChildren();
      if (!projects.length) list.append(node('p', 'project-list__empty', '最初の作品を描いてみましょう。'));
      for (const item of projects) {
        const openCard = () => void transact(async () => {
          let keptCopy = false;
          if (session.persisted || editedSinceOpen) {
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
        const card = button('', `project-${item.projectId}`, openCard);
        card.className = 'project-card'; card.dataset.projectId = item.projectId; card.setAttribute('aria-current', String(item.projectId === session.currentProject?.projectId));
        const sample = item.summary.thumbnail; const canvas = node('canvas'); canvas.width = sample?.width || 28; canvas.height = sample?.height || 28; canvas.setAttribute('aria-hidden', 'true');
        if (sample) { const pixels = new Uint8ClampedArray(sample.width * sample.height * 4); for (let i = 0; i < sample.width * sample.height; i++) { pixels.set(sample.rgb.slice(i * 3, i * 3 + 3), i * 4); pixels[i * 4 + 3] = 255; } canvas.getContext('2d').putImageData(new ImageData(pixels, sample.width, sample.height), 0, 0); }
        const info = node('span', 'project-card__info'); info.append(node('strong', '', item.summary.name || '無題の作品'));
        if (item.summary.width && item.summary.height) info.append(node('span', '', `${item.summary.width} × ${item.summary.height}px`));
        const date = item.updatedAt ? new Date(item.updatedAt) : null; info.append(node('time', '', date && Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '保存した作品'));
        const row = node('div', 'project-list__row'); row.dataset.name = (item.summary.name || '無題の作品').normalize('NFKC').toLocaleLowerCase('ja-JP');
        const remove = button('', `project-delete-${item.projectId}`, () => void deleteProject(item, card));
        remove.className = 'project-card__delete'; remove.setAttribute('aria-label', `${item.summary.name || '無題の作品'}を削除`);
        remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
        card.append(canvas, info); row.append(card, remove); list.append(row);
        cardContextCleanups.push(bindContextAction(card, ({ source }) => {
          if (source === 'hold') { void deleteProject(item, card, { fromHold: true }); return; }
          return showCardActions(item, card, openCard);
        }));
        card.addEventListener('keydown', (event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault(); showCardActions(item, card, openCard);
        });
      }
      filterList();
      if (errors.length) say(`${errors.length}件の保存内容を確認できませんでした。ほかの作品は開けます。`);
    } catch (error) { if (version !== listEpoch) return; list.replaceChildren(node('p', '', '作品一覧を読み出せませんでした。保存内容は変更していません。')); say(error.message); }
  }
  async function importCopy(source) {
    if (session.persisted || editedSinceOpen) await save();
    const project = await importToolProject(source, tool);
    await session.adopt(project, { persisted: false, apply: true });
    resetPointer(); await save(); initialSelectionPending = false; dialog.close();
    say('新しい作品として取り込みました。元の作品は変わりません。');
  }
  async function refreshImports() {
    importList.replaceChildren(node('p', '', '作品を読み込んでいます…'));
    try {
      const { projects } = await store.listImportSources(); importList.replaceChildren();
      if (!projects.length) importList.append(node('p', 'project-list__empty', '取り込める作品はまだありません。'));
      for (const item of projects) {
        const label = modes.find(([target]) => target === item.summary.lastMode)?.[1] || '以前の作品';
        const card = button('', `project-import-${item.projectId}`, () => void transact(async () => {
          const source = await store.loadImportSource(item.projectId);
          if (!source) throw new Error('取り込む作品が見つかりません。');
          await importCopy(source);
        }));
        card.className = 'project-card';
        const info = node('span', 'project-card__info');
        info.append(node('strong', '', item.summary.name || '無題の作品'), node('span', '', `${label} · コピーを取り込む`));
        card.append(info); importList.append(card);
      }
    } catch (error) { importList.replaceChildren(node('p', '', '取り込み用の作品を読み出せませんでした。')); say(error.message); }
  }
  async function confirmDelete(item, card = null, { fromHold = false } = {}) {
    const confirmation = node('dialog', 'project-delete-dialog'); confirmation.setAttribute('aria-labelledby', 'project-delete-title');
    const heading = node('h2', '', '作品を削除しますか？'); heading.id = 'project-delete-title';
    const name = item.summary.name || '無題の作品';
    const preview = node('div', 'project-delete-dialog__preview'); preview.setAttribute('aria-hidden', 'true');
    const source = card?.querySelector('canvas');
    if (source) {
      const canvas = node('canvas'); canvas.width = source.width; canvas.height = source.height;
      canvas.getContext('2d').drawImage(source, 0, 0); preview.append(canvas);
    } else if (item.summary.thumbnail) {
      const sample = item.summary.thumbnail; const canvas = node('canvas'); canvas.width = sample.width; canvas.height = sample.height;
      const pixels = new Uint8ClampedArray(sample.width * sample.height * 4);
      for (let i = 0; i < sample.width * sample.height; i++) { pixels.set(sample.rgb.slice(i * 3, i * 3 + 3), i * 4); pixels[i * 4 + 3] = 255; }
      canvas.getContext('2d').putImageData(new ImageData(pixels, sample.width, sample.height), 0, 0); preview.append(canvas);
    }
    const projectName = node('p', 'project-delete-dialog__name', name);
    const text = node('p', '', '削除した作品から戻せます。他の作品や公開済みの投稿は残ります。'); text.id = 'project-delete-description';
    confirmation.setAttribute('aria-describedby', text.id);
    const controls = node('div', 'project-sheet__actions');
    let cancel;
    return new Promise((resolve) => {
      let finished = false;
      // The initiating finger may release over a newly displayed button. Only
      // a fresh press (or keyboard activation) may act on the confirmation.
      let openingTouch = fromHold;
      confirmation.addEventListener('pointerdown', () => { openingTouch = false; }, { capture: true });
      confirmation.addEventListener('click', (event) => {
        if (!openingTouch || event.detail === 0) return;
        openingTouch = false; event.preventDefault(); event.stopImmediatePropagation();
      }, { capture: true });
      const finish = (value) => { if (finished) return; finished = true; confirmation.close(); confirmation.remove(); resolve(value); };
      const header = node('div', 'project-delete-dialog__header');
      const dismiss = button('×', 'project-delete-dismiss', () => finish(false));
      dismiss.setAttribute('aria-label', '削除をキャンセルして閉じる');
      header.append(heading, dismiss);
      cancel = button('キャンセル', 'project-delete-cancel', () => finish(false));
      // Releasing the held touch can focus the dialog itself; keep dismissal safe.
      confirmation.addEventListener('focus', () => cancel.focus({ preventScroll: true }));
      controls.append(cancel, button('削除する', 'project-delete-confirm', () => finish(true)));
      confirmation.append(header, preview, projectName, text, controls); document.body.append(confirmation);
      confirmation.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); }); confirmation.showModal(); cancel.focus();
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
        if (session.persisted || editedSinceOpen) await save();
        const original = await store.load(item.projectId); if (!original) throw new Error('この作品は削除されたか、保存先に見つかりません。');
        const project = forkProject(original, { title: `${original.manifest.title || '作品'} のコピー` });
        await session.adopt(project, { persisted: false, apply: true }); resetPointer(); await save(); say('別の作品として複製しました。');
      });
    });
    const remove = button('削除', 'project-card-actions-delete', () => { close(); void deleteProject(item); });
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg><span>作品を削除</span>';
    controls.append(open, copy, remove, button('閉じる', 'project-card-actions-close', close));
    const header = node('div', 'project-delete-dialog__header');
    const dismiss = button('×', 'project-card-actions-dismiss', close);
    dismiss.setAttribute('aria-label', '作品の操作を閉じる');
    header.append(title, dismiss);
    sheet.append(header, preview, controls); document.body.append(sheet);
    sheet.addEventListener('cancel', (event) => { event.preventDefault(); close(); }); sheet.showModal();
  }
  async function deleteProject(item, card = null, options = {}) {
    await transact(async () => {
      if (!await confirmDelete(item, card, options)) return;
      const current = item.projectId === session.currentProject?.projectId;
      const selected = current ? await save() : item;
      await store.deleteProject(item.projectId, { expectedRevisionId: selected.revisionId });
      if (current) {
        await session.adopt(blankProject(), { persisted: false, apply: true }); resetPointer(); initialSelectionPending = false;
      }
      await Promise.all([refreshList(), refreshTrash()]); say('作品を削除しました。削除した作品から戻せます。');
    }, { close: false });
  }
  async function refreshTrash() {
    const { projects } = await store.listProjects({ includeDeleted: true });
    const deleted = projects.filter((item) => item.deletedAt); trash.hidden = !deleted.length; trashList.replaceChildren();
    for (const item of deleted) {
      const row = node('div', 'project-trash__row'); const label = node('span', '', item.summary.name || '無題の作品');
      row.append(label, button('戻す', `project-restore-${item.projectId}`, () => void transact(async () => {
        await store.restoreProject(item.projectId, { expectedRevisionId: item.revisionId });
        await Promise.all([refreshList(), refreshTrash()]); say('作品を戻しました。カードから続きを開けます。');
      }, { close: false }))); trashList.append(row);
    }
  }
  async function showProjects({ pane, focusTransfer = false } = {}) {
    if (locked) return; for (const el of main.querySelectorAll('details[open]')) el.open = false;
    if (!dialog.open) { selectPane(pane || 'library'); dialog.showModal(); }
    else if (pane) selectPane(pane);
    update();
    message.textContent = operationError || ''; await Promise.all([refreshList(), refreshImports(), refreshTrash()]);
    if (focusTransfer) transferTargets.find(({ el }) => !el.hidden && !el.disabled)?.el.focus();
  }
  document.addEventListener('pixieed:open-tool-transfer', () => {
    if (bar.hidden || locked) return;
    void showProjects({ pane: 'current', focusTransfer: true });
  });
  input.addEventListener('change', () => { const file = input.files?.[0]; input.value = ''; if (!file) return; void transact(async () => {
    if (file.size > 64 * 1024 * 1024) throw new Error('PXDは64MBまで読み込めます。');
    const original = await decodePxd(new Uint8Array(await file.arrayBuffer())); if (session.persisted || editedSinceOpen) await save();
    await importCopy(original);
  }, { close: false }); });
  ready = (async () => {
    if (initialProject) {
      try {
        await session.initialize(initialProject.savedProject || initialProject.project, { persisted: initialProject.persisted === true, apply: false });
        if (initialProject.savedProject) await session.replace(initialProject.project, { apply: false });
        editedSinceOpen = initialProject.edited === true;
        if (editedSinceOpen) session.markDirty();
        await assertOwnPublicSources(getPxdPublicSources(initialProject.project));
      } catch (error) { operationError = error.message; say(operationError); failed = true; }
      finally { locked = false; initialized = true; main.inert = false; main.setAttribute('aria-busy', 'false'); update(); }
      return session.persisted;
    }
    await session.initialize(blankProject(), { persisted: false, apply: tool !== 'camera' }); main.inert = true;
    try {
      const params = new URLSearchParams(location.search); let pointer;
      // An explicit revision remains authoritative when the current tab reloads.
      if (params.has('pxd')) {
        if (params.getAll('pxd').length !== 1 || params.getAll('pxdRevision').length !== 1 || !params.get('pxdRevision')) throw new Error('作品の保存版を特定できません。作品一覧から開いてください。');
        pointer = { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
      }
      if (pointer) {
        let project;
        try { project = await store.load(pointer.projectId, pointer.revisionId); }
        catch (error) { if (!['PXD_TOOL_PROJECT_FOREIGN', 'PXD_TOOL_PROJECT_UNTAGGED'].includes(error?.code)) throw error; }
        if (project) { await session.adopt(project, { persisted: true, apply: true }); remember(project); say('作品を開きました。'); }
        else {
          const source = await store.loadImportSource(pointer.projectId, pointer.revisionId);
          if (!source) throw new Error('指定した作品をこの端末で見つけられません。作品一覧から開いてください。');
          await importCopy(source);
        }
      }
    } catch (error) { operationError = error.message; say(operationError); }
    finally {
      initialSelectionPending = false;
      locked = false; initialized = true; main.inert = false; main.setAttribute('aria-busy', 'false'); update();
    }
    return session.persisted;
  })();
  function scheduleAutoSave() {
    clearTimeout(timer); timer = 0;
    if (transientNavigation || !initialized || locked || initialSelectionPending || !session.dirty || !editedSinceOpen || failed || getPublicSources().length) return;
    timer = setTimeout(() => {
      timer = 0;
      void save().then(() => { if (dialog.open) return refreshList(); })
        .catch((error) => say(`自動保存できませんでした：${error.message}。作品を切り替える前に保存してください。`));
    }, 1000);
  }
  function markDirty() {
    if (!initialized || locked || initialSelectionPending) return;
    if (getPublicSources().length) { update(); return; }
    editedSinceOpen = true;
    session.markDirty(); failed = false; update(); scheduleAutoSave();
  }
  const observer = new MutationObserver(() => { bar.hidden = main.hidden || main.getAttribute('aria-hidden') === 'true'; }); observer.observe(main, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  window.addEventListener('beforeunload', (event) => { if (!transientNavigation && (session.dirty && editedSinceOpen || session.busy)) { event.preventDefault(); event.returnValue = ''; } });
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
      restoreEditorState = typeof options.restoreEditorState === 'function' ? options.restoreEditorState : () => {};
      if (Object.hasOwn(options, 'onNavigate')) onNavigate = options.onNavigate;
      main = nextMain;
      observer.disconnect(); observer.observe(main, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });

      const ownsLock = !locked;
      if (ownsLock) locked = true;
      main.inert = true; main.setAttribute('aria-busy', 'true'); update();
      modeSwitching = true;
      try {
        const nextProject = project ?? session.currentProject;
        await session.adopt(nextProject, { persisted: project ? true : session.persisted, apply: true });
        failed = false; operationError = '';
      } finally {
        modeSwitching = false;
        if (ownsLock) { locked = false; main.inert = false; main.setAttribute('aria-busy', 'false'); }
        update();
      }
    })();
    ready = switching;
    return switching;
  }
  return Object.freeze({ get ready() { return ready; }, save, markDirty, showProjects, setModeAdapter, async beforeReplace(work) { await ready; await transact(async () => { await save(); await work(); }); markDirty(); }, reset() { clearTimeout(timer); session.reset(); resetPointer(); update(); },
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
      locked = true; main.inert = true; main.setAttribute('aria-busy', 'true'); update();
      try {
        clearTimeout(timer);
        await session.wait();
        if (session.dirty && session.currentProject?.entries.length) await save();
        await session.adopt(blankProject(), { persisted: false, apply: false });
        resetPointer();
        return session.currentProject;
      } finally {
        locked = false; main.inert = false; main.setAttribute('aria-busy', 'false'); update();
      }
    },
    async assertCanSave() { await assertOwnPublicSources([...getPxdPublicSources(session.currentProject), ...getPublicSources()]); return true; },
    get currentProject() { return session.currentProject; }, get heldProject() { return null; }, get busy() { return locked; },
    get persistedProject() { return session.persistedProject; },
    get persisted() { return session.persisted; }, get dirty() { return session.dirty && editedSinceOpen; }
  });
}
