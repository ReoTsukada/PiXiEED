import { createPxdProject, decodePxd, encodePxd } from './pxd-codec.mjs';
import { createPxdStore } from './pxd-store.mjs?rev=20261001-components-1';
import { createProjectSession } from './project-session.mjs?rev=20261001-components-1';
import { forkProject, sanitizeProjectTitle } from './project-catalog.mjs?rev=20260930-shared-canvas-5';
import { pxdToolUrl, pxdImageRoles, primaryPxdImageRole, readPxdImage, readPxdSharedImage, putPxdSharedImage } from './pxd-project.mjs?rev=20260930-shared-canvas-5';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20260930-shared-canvas-5';
import { prepareSharedCanvasImage } from './shared-image.mjs?rev=20260930-shared-canvas-5';
import { hasPass, requestPass, onPassChange } from '../pixieed-pass.mjs?v=20260930-rewarded-gpt-1';
import { assertOwnPublicSources, getPxdPublicSources } from './work-save-policy.mjs';
import { componentImageRole, freezeProjectComponents, replaceProjectComponentImage, putProjectComponentImage } from './project-components.mjs?rev=20261001-components-1';
import { createProjectComponentShelf } from './project-components-ui.mjs?rev=20261001-components-1';
import { bindContextAction } from '../site-interactions.mjs?rev=20261001-interactions-1';

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

/** Draw and Music share a project identity, never a global receiving draft. */
export function mountProjectWorkspace({ tool, getProject, openProject, setStatus = () => {}, getPublicSources = () => [], getEditorState = () => ({}), restoreEditorState = () => {} }) {
  const store = createPxdStore(); const main = document.querySelector('#main') || document.querySelector('main');
  main.inert = true; main.setAttribute('aria-busy', 'true');
  let locked = true; let initialized = false; let timer; let failed = false; let operationError = ''; let editedSinceOpen = false; let initialSelectionPending = false;
  let listEpoch = 0; let cardContextCleanups = [];
  let activeCanvas = null;
  const css = node('link'); css.rel = 'stylesheet'; css.href = '/css/project-workspace.css?rev=20261001-components-1'; document.head.append(css);
  document.body.classList.add('project-workspace-ready');
  const bar = node('div', 'project-bar'); bar.setAttribute('aria-label', 'プロジェクトと制作モード');
  const launcher = button('', 'project-open', () => void showProjects()); launcher.className = 'project-bar__open'; launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.innerHTML = `${icon('folder')}<span class="project-bar__name"></span><span class="project-bar__state" aria-hidden="true"></span>`;
  const modes = [['draw', '描く'], ['audio', '音楽'], ['camera', '撮る'], ['jigsaw', 'ジグソー'], ['spot_difference', '間違い探し'], ['hidden_object', 'もの探し']];
  const modePicker = node('details', 'project-mode-picker');
  const modeSummary = node('summary'); modeSummary.innerHTML = `${icon(tool)}<span>${modes.find(([target]) => target === tool)?.[1] || '制作'}</span><span aria-hidden="true">⌄</span>`; modeSummary.setAttribute('aria-label', '同じ作品のツールを切り替える');
  const modeGroup = node('div', 'project-modes'); modeGroup.setAttribute('role', 'group'); modeGroup.setAttribute('aria-label', '同じ作品の制作モード');
  for (const [target, label] of modes) {
    const el = button('', `project-mode-${target}`, () => void transact(async () => {
      const project = await save();
      location.assign(pxdToolUrl(target, project, componentImageRole(project, target)));
    }));
    el.innerHTML = `${icon(target)}<span>${label}</span>`; el.setAttribute('aria-pressed', String(target === tool)); modeGroup.append(el);
  }
  modePicker.append(modeSummary, modeGroup); bar.append(launcher, modePicker); document.body.append(bar);
  document.addEventListener('pointerdown', (event) => { if (!modePicker.contains(event.target)) modePicker.open = false; });
  const dialog = node('dialog', 'project-sheet'); dialog.id = 'pxd-panel'; dialog.setAttribute('aria-labelledby', 'project-sheet-title');
  const heading = node('div', 'project-sheet__heading'); const title = node('h2', '', 'プロジェクト'); title.id = 'project-sheet-title';
  const close = button('', 'project-close', () => dialog.close()); close.innerHTML = icon('close'); close.setAttribute('aria-label', 'プロジェクト一覧を閉じる'); heading.append(title, close);
  const note = node('p', 'project-sheet__note', 'このブラウザーに保存します。続きはプロジェクト一覧から開けます。');
  const currentRow = node('div', 'project-sheet__current'); const titleLabel = node('label', '', '作品名'); titleLabel.htmlFor = 'project-title';
  const titleInput = node('input'); titleInput.id = 'project-title'; titleInput.maxLength = 60; titleInput.autocomplete = 'off';
  const rename = button('名前を保存', 'project-rename', () => { const name = titleInput.value; void transact(async () => { session.rename(name); await save(); await refreshList(); }, { close: false }); });
  currentRow.append(titleLabel, titleInput, rename);
  const actions = node('div', 'project-sheet__actions');
  const newButton = button('＋ 新規', 'project-new', () => void transact(async () => {
    if (session.persisted || editedSinceOpen) await save();
    await session.adopt(blankProject(), { persisted: false, apply: true }); resetPointer(); initialSelectionPending = false;
    dialog.close(); say('新しいプロジェクトを作りました。');
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
    await session.adopt(project, { persisted: false, apply: true }); resetPointer(); await save(); say('別のプロジェクトとして複製しました。');
  }));
  const saveButton = button('プロジェクトを保存', 'pxd-save', () => void transact(async () => { await save(); say('この端末に保存しました。'); await refreshList(); }, { close: false }));
  actions.append(duplicate, saveButton);
  const message = node('p', 'project-sheet__status'); message.id = 'pxd-file-status'; message.setAttribute('role', 'status');
  const list = node('div', 'project-list'); list.setAttribute('aria-label', '保存したプロジェクト');
  const trash = node('details', 'project-files project-trash'); const trashSummary = node('summary', '', '削除したプロジェクト');
  const trashList = node('div', 'project-trash__list'); trash.append(trashSummary, trashList);
  const files = node('details', 'project-files'); const filesSummary = node('summary', '', 'バックアップ・読み込み'); const fileActions = node('div', 'project-sheet__actions');
  const filesNote = node('p', 'project-sheet__note project-files__note', '絵・音楽・パズルをまとめた編集用ファイル。別の端末への移動やバックアップに。');
  const input = node('input'); input.type = 'file'; input.accept = '.pxd,application/octet-stream'; input.id = 'pxd-file-input'; input.hidden = true;
  fileActions.append(button('バックアップを開く（PXD）', 'pxd-open', () => input.click()), button('バックアップを保存（PXD）', 'pxd-export', () => void transact(async () => {
    const project = await save(); download(await encodePxd(project), `${sanitizeProjectTitle(project.manifest.title) || 'pixieed'}.pxd`); say('PXDを書き出しました。');
  })));
  const linksHeading = node('h3', 'project-sheet__links-heading', 'このプロジェクト');
  const links = node('div', 'project-sheet__actions project-sheet__links');
  links.hidden = true;
  const working = button('音楽の絵を描く', 'pxd-to-audio-image', () => void transact(async () => { location.assign(pxdToolUrl('draw', await save(), 'audio')); })); links.append(working);
  const roleLinks = [['spot-after', 'pxd-to-spot-after', '変更後の絵を描く'], ['hidden', 'pxd-to-hidden-image', 'もの探しの絵を描く'], ['draw', 'pxd-to-draw-image', '描画用の絵を開く']].map(([role, id, label]) => {
    const el = button(label, id, () => void transact(async () => { location.assign(pxdToolUrl('draw', await save(), role)); })); links.append(el); return { role, el };
  });
  const original = button('読み込んだ旧PXDを保存', 'pxd-export-original', () => void transact(async () => {
    const project = await save(); const entry = project.entries.find(({ path }) => path === 'legacy/original.pxd');
    if (!entry) throw new Error('旧PXDの原本が見つかりません。'); download(entry.bytes, 'pixieed-original.pxd');
  })); fileActions.append(original);
  const canvasSettings = node('details', 'project-files project-canvas-settings'); const canvasSummary = node('summary', '', 'キャンバス・色数');
  const canvasDescription = node('p', 'project-sheet__note', '開いている絵だけを変更します。通常128px・16色、特典で256px・32色。');
  const canvasFields = node('div', 'project-canvas-fields');
  const widthInput = node('input'); const heightInput = node('input');
  for (const [label, field, id] of [['幅', widthInput, 'project-canvas-width'], ['高さ', heightInput, 'project-canvas-height']]) {
    const wrapper = node('label', '', label); field.type = 'number'; field.min = '1'; field.max = '256'; field.id = id; field.inputMode = 'numeric'; wrapper.append(field); canvasFields.append(wrapper);
  }
  const colorsSelect = node('select'); colorsSelect.id = 'project-canvas-colors';
  for (const count of [16, 32]) { const option = node('option', '', `${count}色まで`); option.value = String(count); colorsSelect.append(option); }
  const colorsLabel = node('label', '', '色数'); colorsLabel.append(colorsSelect); canvasFields.append(colorsLabel);
  const applyCanvas = button('変更を確認', 'project-canvas-apply', () => void transact(async () => {
    const width = Number(widthInput.value); const height = Number(heightInput.value); const maxColors = Number(colorsSelect.value);
    if (![width, height].every((side) => Number.isInteger(side) && side >= 1 && side <= 256)) throw new Error('幅と高さは1〜256pxで指定してください。');
    if ((Math.max(width, height) > 128 || maxColors > 16) && !await requestPass({ perk: 'project.canvas-expanded' })) return;
    const project = await freezeProjectComponents(await save());
    const role = tool === 'draw' ? getEditorState().imageRole || componentImageRole(project, tool) : componentImageRole(project, tool);
    const image = await readPxdImage(project, role);
    if (!image) throw new Error('先に絵を描くか、画像を読み込んでください。');
    const prepared = prepareSharedCanvasImage(image, { passActive: hasPass(), width, height, maxColors, fit: 'contain' });
    if (prepared.changed) {
      const { confirmPxdConversion } = await import('./pxd-ui.mjs?rev=20260930-ux-fix-1');
      if (!await confirmPxdConversion({ image, document: prepared.image, title: 'キャンバスを確認', applyLabel: 'このサイズ・色を使う', message: `${width}×${height}px・${prepared.colorCount}色に変更します。ほかの絵・曲・パズルは変わりません。パズルの絵を変更する場合は正解を再確認してください。` })) return;
    }
    const { synchronizeLinkedAudioImage } = await import('./pxd-draw-audio.mjs?rev=20261001-components-1');
    const synced = await synchronizeLinkedAudioImage(project, prepared.image, role);
    const candidate = await putProjectComponentImage(synced, tool, prepared.image, role);
    await session.replace(candidate, { apply: true }); await save(); say('開いている絵のキャンバスを変更しました。'); await refreshComponents();
  }, { close: false }));
  canvasSettings.append(canvasSummary, canvasDescription, canvasFields, applyCanvas);
  const componentNote = node('p', 'project-components-note', '編集するものを選ぶ。ほかの絵や曲はそのまま。');
  const shelf = createProjectComponentShelf({ tool,
    onOpen: (target) => void transact(async () => { const project = await save(); location.assign(pxdToolUrl(target, project, componentImageRole(project, target))); }),
    onEditImage: (target) => void transact(async () => { const project = await save(); location.assign(pxdToolUrl('draw', project, componentImageRole(project, target))); }),
    onReplace: (target) => void replaceComponent(target)
  });
  const tabs = node('div', 'project-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'プロジェクトの操作');
  const currentPane = node('section', 'project-pane'); currentPane.id = 'project-current-pane';
  const libraryPane = node('section', 'project-pane'); libraryPane.id = 'project-library-pane';
  const currentTab = button('この作品', 'project-tab-current', () => selectPane('current'));
  const libraryTab = button('作品を開く', 'project-tab-library', () => selectPane('library'));
  for (const [tab, pane] of [[currentTab, currentPane], [libraryTab, libraryPane]]) {
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', pane.id);
    pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const other = tab === currentTab ? libraryTab : currentTab;
      selectPane(event.key === 'Home' ? 'current' : event.key === 'End' ? 'library' : other === currentTab ? 'current' : 'library');
      (currentPane.hidden ? libraryTab : currentTab).focus();
    });
  }
  tabs.append(currentTab, libraryTab);
  const toolbar = node('div', 'project-sheet__toolbar'); toolbar.append(tabs, newButton);
  const search = node('input', 'project-search'); search.type = 'search'; search.id = 'project-search'; search.placeholder = '作品名で探す'; search.setAttribute('aria-label', '保存したプロジェクトを作品名で探す');
  const count = node('p', 'project-library-count'); count.setAttribute('role', 'status');
  const noMatches = node('p', 'project-list__empty', 'この名前の作品は見つかりません。'); noMatches.hidden = true;
  function filterList() {
    const query = search.value.trim().normalize('NFKC').toLocaleLowerCase('ja-JP'); let visible = 0;
    const rows = [...list.querySelectorAll('.project-list__row')];
    for (const row of rows) { row.hidden = Boolean(query && !row.dataset.name.includes(query)); if (!row.hidden) visible++; }
    noMatches.hidden = !rows.length || visible > 0;
    count.textContent = rows.length ? `${query ? `${visible} / ${rows.length}` : rows.length}作品 · 最近保存した順` : '';
    libraryTab.textContent = rows.length ? `作品を開く · ${rows.length}` : '作品を開く';
  }
  search.addEventListener('input', filterList);
  function selectPane(name) {
    const current = name === 'current'; currentPane.hidden = !current; libraryPane.hidden = current;
    currentTab.setAttribute('aria-selected', String(current)); libraryTab.setAttribute('aria-selected', String(!current));
    currentTab.tabIndex = current ? 0 : -1; libraryTab.tabIndex = current ? -1 : 0;
    dialog.scrollTop = 0;
  }
  const header = node('div', 'project-sheet__header'); header.append(heading, toolbar);
  currentPane.append(currentRow, actions, linksHeading, componentNote, shelf.element, links, canvasSettings);
  libraryPane.append(search, count, list, noMatches, trash);
  files.append(filesSummary, filesNote, fileActions, input);
  dialog.append(header, message, currentPane, libraryPane, files, note); selectPane('library'); document.body.append(dialog);
  dialog.addEventListener('close', () => { canvasSettings.open = false; if (initialSelectionPending && !locked) { initialSelectionPending = false; update(); } });
  onPassChange(() => update());
  dialog.addEventListener('click', (event) => { if (event.target === dialog && !locked) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  const session = createProjectSession({ store,
    async capture(base) {
      const state = structuredClone(getEditorState()); const safe = await freezeProjectComponents(base); const captured = getProject(safe);
      return Promise.resolve(captured).then((candidate) => {
        candidate.manifest = { ...candidate.manifest, lastMode: tool, editorState: { ...candidate.manifest.editorState, [tool]: state } }; return candidate;
      });
    },
    async apply(project) {
      await assertOwnPublicSources(getPxdPublicSources(project));
      const previousState = structuredClone(getEditorState());
      const previous = session.currentProject ? await getProject(structuredClone(session.currentProject)) : null;
      try {
        await openProject(await freezeProjectComponents(project)); restoreEditorState(project.manifest.editorState?.[tool]);
        const role = tool === 'draw' ? getEditorState().imageRole || componentImageRole(project, tool) : componentImageRole(project, tool);
        activeCanvas = await readPxdImage(project, role);
      }
      catch (error) {
        // A renderer failure after assignment must restore the old content too,
        // not only the coordinator's project ID.
        if (previous) { await openProject(previous); restoreEditorState(previousState); }
        throw error;
      }
      editedSinceOpen = false;
    },
    authorize: (project) => assertOwnPublicSources([...getPxdPublicSources(project), ...getPublicSources()]),
    onChange() { update(); }
  });
  function blankProject() { return createPxdProject({ manifest: { title: '無題の作品', createdAt: Date.now(), lastMode: tool } }); }
  function say(text) { message.textContent = text; setStatus(text); }
  function update() {
    const project = session?.currentProject;
    dialog.dataset.startup = String(initialSelectionPending);
    title.textContent = initialSelectionPending ? 'プロジェクトを選ぶ' : 'プロジェクト';
    note.textContent = initialSelectionPending ? '保存した作品を開くか、新しい作品を始めてください。' : 'このブラウザーに保存します。続きはプロジェクト一覧から開けます。';
    newButton.textContent = initialSelectionPending ? '＋ 新しい作品' : '＋ 新規';
    bar.hidden = main.hidden || main.getAttribute('aria-hidden') === 'true' || getPublicSources().length > 0;
    const name = initialized ? sanitizeProjectTitle(project?.manifest.title) : '開いています…';
    launcher.querySelector('.project-bar__name').textContent = name;
    const state = failed ? '保存できませんでした' : session.busy ? '保存中' : session.dirty || !session.persisted ? '編集中' : '保存済み';
    launcher.dataset.state = failed ? 'error' : session.busy ? 'saving' : session.dirty || !session.persisted ? 'editing' : 'saved';
    launcher.setAttribute('aria-label', `${name}・${state}。プロジェクトを開く`); launcher.title = `${name} · ${state}`;
    for (const el of bar.querySelectorAll('button')) el.disabled = locked || el.getAttribute('aria-pressed') === 'true';
    for (const el of dialog.querySelectorAll('button')) el.disabled = locked;
    shelf.setBusy(locked);
    if (!titleInput.matches(':focus')) titleInput.value = name;
    working.hidden = !project || Boolean(project.manifest.sharedCanvas) || !pxdImageRoles(project).includes('audio');
    for (const { role, el } of roleLinks) el.hidden = !project || Boolean(project.manifest.sharedCanvas) || !pxdImageRoles(project).includes(role);
    original.hidden = !project?.entries.some(({ path }) => path === 'legacy/original.pxd');
    const shared = activeCanvas || project?.manifest.sharedCanvas;
    if (!canvasSettings.open) { widthInput.value = String(shared?.width || 16); heightInput.value = String(shared?.height || 16); colorsSelect.value = String((shared?.colorCount ?? shared?.colors?.length ?? 0) > 16 ? 32 : 16); }
    if (shared) {
      const policy = evaluateSharedCanvasPolicy(shared, { passActive: hasPass() });
      canvasDescription.textContent = '開いている絵だけを変更します。通常128px・16色、特典で256px・32色。';
    }
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
    catch (error) { if (session.dirty && session.currentProject?.entries.length) editedSinceOpen = true; operationError = error.message || 'プロジェクトを開けませんでした。今の作品は保持しています。'; say(operationError); }
    finally { locked = false; main.inert = false; main.setAttribute('aria-busy', 'false'); update(); }
  }
  async function refreshList() {
    const version = ++listEpoch;
    for (const cleanup of cardContextCleanups) cleanup(); cardContextCleanups = [];
    list.replaceChildren(node('p', '', '作品を読み込んでいます…'));
    try {
      const { projects, errors } = await store.listProjects(); if (version !== listEpoch) return; list.replaceChildren();
      if (!projects.length) list.append(node('p', 'project-list__empty', 'まだ保存した作品はありません。描き始めると自動で保存されます。'));
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
          const project = await store.load(item.projectId); if (!project) throw new Error('このプロジェクトが見つかりません。');
          await session.adopt(project, { persisted: true, apply: true }); resetPointer(); remember(session.currentProject);
          initialSelectionPending = false; dialog.close();
          say(keptCopy ? 'このタブの編集は別のプロジェクトに保存し、選んだ作品を開きました。' : 'プロジェクトを開きました。');
        }, { close: false });
        const card = button('', `project-${item.projectId}`, openCard);
        card.className = 'project-card'; card.dataset.projectId = item.projectId; card.setAttribute('aria-current', String(item.projectId === session.currentProject?.projectId));
        const sample = item.summary.thumbnail; const canvas = node('canvas'); canvas.width = sample?.width || 28; canvas.height = sample?.height || 28; canvas.setAttribute('aria-hidden', 'true');
        if (sample) { const pixels = new Uint8ClampedArray(sample.width * sample.height * 4); for (let i = 0; i < sample.width * sample.height; i++) { pixels.set(sample.rgb.slice(i * 3, i * 3 + 3), i * 4); pixels[i * 4 + 3] = 255; } canvas.getContext('2d').putImageData(new ImageData(pixels, sample.width, sample.height), 0, 0); }
        const info = node('span', 'project-card__info'); info.append(node('strong', '', item.summary.name || '無題の作品'));
        const lastMode = modes.find(([mode]) => mode === item.summary.lastMode)?.[1];
        info.append(node('span', '', [item.summary.width && `${item.summary.width} × ${item.summary.height}`, lastMode && `前回: ${lastMode}`, item.summary.hasAudio ? '音楽あり' : 'ドット絵'].filter(Boolean).join(' · ')));
        const date = item.updatedAt ? new Date(item.updatedAt) : null; info.append(node('time', '', date && Number.isFinite(date.getTime()) ? date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '保存した作品'));
        const row = node('div', 'project-list__row'); row.dataset.name = (item.summary.name || '無題の作品').normalize('NFKC').toLocaleLowerCase('ja-JP');
        const remove = button('', `project-delete-${item.projectId}`, () => void deleteProject(item));
        remove.className = 'project-card__delete'; remove.setAttribute('aria-label', `${item.summary.name || '無題の作品'}をプロジェクトごと削除`);
        remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
        card.append(canvas, info); row.append(card, remove); list.append(row);
        cardContextCleanups.push(bindContextAction(card, () => showCardActions(item, card, openCard)));
        card.addEventListener('keydown', (event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault(); showCardActions(item, card, openCard);
        });
      }
      filterList();
      if (errors.length) say(`${errors.length}件の保存内容を確認できませんでした。ほかの作品は開けます。`);
    } catch (error) { if (version !== listEpoch) return; list.replaceChildren(node('p', '', '作品一覧を読み出せませんでした。保存内容は変更していません。')); say(error.message); }
  }
  async function confirmDelete(name) {
    const confirmation = node('dialog', 'project-delete-dialog'); confirmation.setAttribute('aria-labelledby', 'project-delete-title');
    const heading = node('h2', '', 'プロジェクトを削除しますか？'); heading.id = 'project-delete-title';
    const text = node('p', '', `「${name}」の絵・曲・パズルをまとめて削除します。削除したプロジェクトから戻せます。公開済みの投稿は残ります。`);
    const controls = node('div', 'project-sheet__actions');
    return new Promise((resolve) => {
      let finished = false;
      const finish = (value) => { if (finished) return; finished = true; confirmation.close(); confirmation.remove(); resolve(value); };
      controls.append(button('やめる', 'project-delete-cancel', () => finish(false)), button('削除する', 'project-delete-confirm', () => finish(true)));
      confirmation.append(heading, text, controls); document.body.append(confirmation);
      confirmation.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); }); confirmation.showModal();
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
        const original = await store.load(item.projectId); if (!original) throw new Error('このプロジェクトは削除されたか、保存先に見つかりません。');
        const project = forkProject(original, { title: `${original.manifest.title || '作品'} のコピー` });
        await session.adopt(project, { persisted: false, apply: true }); resetPointer(); await save(); say('別のプロジェクトとして複製しました。');
      });
    });
    const remove = button('削除', 'project-card-actions-delete', () => { close(); void deleteProject(item); });
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg><span>プロジェクトを削除</span>';
    controls.append(open, copy, remove, button('閉じる', 'project-card-actions-close', close));
    sheet.append(preview, title, controls); document.body.append(sheet);
    sheet.addEventListener('cancel', (event) => { event.preventDefault(); close(); }); sheet.showModal();
  }
  async function deleteProject(item) {
    await transact(async () => {
      if (!await confirmDelete(item.summary.name || '無題の作品')) return;
      const current = item.projectId === session.currentProject?.projectId;
      const selected = current ? await save() : item;
      await store.deleteProject(item.projectId, { expectedRevisionId: selected.revisionId });
      if (current) {
        await session.adopt(blankProject(), { persisted: false, apply: true }); resetPointer(); initialSelectionPending = false;
      }
      await Promise.all([refreshList(), refreshTrash(), refreshComponents()]); say('プロジェクトを削除しました。削除したプロジェクトから戻せます。');
    }, { close: false });
  }
  async function refreshTrash() {
    const { projects } = await store.listProjects({ includeDeleted: true });
    const deleted = projects.filter((item) => item.deletedAt); trash.hidden = !deleted.length; trashList.replaceChildren();
    for (const item of deleted) {
      const row = node('div', 'project-trash__row'); const label = node('span', '', item.summary.name || '無題の作品');
      row.append(label, button('戻す', `project-restore-${item.projectId}`, () => void transact(async () => {
        await store.restoreProject(item.projectId, { expectedRevisionId: item.revisionId });
        await Promise.all([refreshList(), refreshTrash()]); say('プロジェクトを戻しました。カードから続きを開けます。');
      }, { close: false }))); trashList.append(row);
    }
  }
  async function showProjects() {
    if (locked) return; modePicker.open = false; for (const el of main.querySelectorAll('details[open]')) el.open = false;
    if (!dialog.open) { selectPane(session.persisted || editedSinceOpen ? 'current' : 'library'); dialog.showModal(); } update();
    if (!session.currentProject?.manifest.sharedCanvas) {
      const image = await readPxdSharedImage(session.currentProject);
      if (image) { widthInput.value = String(Math.min(256, image.width)); heightInput.value = String(Math.min(256, image.height)); }
    }
    message.textContent = operationError || ''; await Promise.all([refreshList(), refreshComponents(), refreshTrash()]);
  }
  async function refreshComponents() {
    shelf.element.hidden = componentNote.hidden = initialSelectionPending;
    if (!initialSelectionPending) {
      try {
        const project = await freezeProjectComponents(await getProject(await freezeProjectComponents(structuredClone(session.currentProject))));
        await shelf.refresh(project);
        if (!canvasSettings.open) {
          const role = tool === 'draw' ? getEditorState().imageRole || componentImageRole(project, tool) : componentImageRole(project, tool);
          const image = await readPxdImage(project, role);
          activeCanvas = image;
          if (image) { widthInput.value = String(image.width); heightInput.value = String(image.height); colorsSelect.value = String((image.colorCount ?? image.colors?.length ?? 0) > 16 ? 32 : 16); }
        }
      } catch (error) { say(error.message); }
    }
  }
  async function replaceComponent(target) {
    await transact(async () => {
      const project = await save(); const source = await readPxdImage(project, componentImageRole(project, 'draw'));
      const before = await readPxdImage(project, componentImageRole(project, target));
      if (!source || !before) throw new Error('使う絵を確認できません。');
      const { confirmPxdConversion } = await import('./pxd-ui.mjs?rev=20261001-components-1');
      const message = target === 'audio' ? 'プロジェクトの絵で音符を作り直します。テンポと楽器の設定は残します。ほかの作品と公開済みの作品は変わりません。' : 'プロジェクトの絵で作り直します。正解やピースの配置はリセットされます。公開済みの作品は変わりません。';
      if (!await confirmPxdConversion({ image: before, document: source, title: 'この絵を使いますか？', applyLabel: '絵を差し替える', message })) return;
      const candidate = await replaceProjectComponentImage(project, target, source);
      await session.replace(candidate, { apply: true }); await save(); await refreshComponents(); say('選んだ作品の絵を差し替えました。');
    }, { close: false });
  }
  input.addEventListener('change', () => { const file = input.files?.[0]; input.value = ''; if (!file) return; void transact(async () => {
    if (file.size > 64 * 1024 * 1024) throw new Error('PXDは64MBまで読み込めます。');
    const original = await decodePxd(new Uint8Array(await file.arrayBuffer())); if (session.persisted || editedSinceOpen) await save();
    const project = forkProject(original); project.manifest.importedFrom = { projectId: original.projectId };
    await session.adopt(project, { persisted: false, apply: true }); resetPointer(); await save(); initialSelectionPending = false; dialog.close(); say('PXDを別のプロジェクトとして開きました。');
  }, { close: false }); });
  const ready = (async () => {
    await session.initialize(blankProject(), { persisted: false, apply: tool !== 'camera' }); main.inert = true;
    try {
      const params = new URLSearchParams(location.search); let pointer;
      if (tool !== 'camera' && history.state?.projectWorkspaceSelection && params.has('pxd')) resetPointer();
      else if (params.has('pxd')) {
        if (params.getAll('pxd').length !== 1 || params.getAll('pxdRevision').length !== 1 || !params.get('pxdRevision')) throw new Error('作品の保存版を特定できません。プロジェクト一覧から開いてください。');
        pointer = { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
      }
      if (pointer) { const project = await store.load(pointer.projectId, pointer.revisionId); if (!project) throw new Error('指定した作品をこの端末で見つけられません。プロジェクト一覧またはPXDから開いてください。'); await session.adopt(project, { persisted: true, apply: true }); remember(project); say('プロジェクトを開きました。'); }
    } catch (error) { operationError = error.message; say(operationError); }
    finally {
      initialSelectionPending = false;
      locked = false; initialized = true; main.inert = false; main.setAttribute('aria-busy', 'false'); update();
    }
    return session.persisted;
  })();
  function markDirty() {
    if (!initialized || locked || initialSelectionPending) return;
    if (getPublicSources().length) { update(); return; }
    editedSinceOpen = true;
    session.markDirty(); failed = false; update(); clearTimeout(timer);
    timer = setTimeout(() => { void save().catch((error) => say(`自動保存できませんでした：${error.message}。作品を切り替える前に保存してください。`)); }, 1000);
  }
  const observer = new MutationObserver(() => { bar.hidden = main.hidden || main.getAttribute('aria-hidden') === 'true'; }); observer.observe(main, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  window.addEventListener('beforeunload', (event) => { if (session.dirty && editedSinceOpen || session.busy) { event.preventDefault(); event.returnValue = ''; } });
  return Object.freeze({ ready, save, markDirty, showProjects, async beforeReplace(work) { await ready; await transact(async () => { await save(); await work(); }); markDirty(); }, reset() { clearTimeout(timer); session.reset(); resetPointer(); update(); },
    async startNewCaptureProject() {
      if (tool !== 'camera') throw new TypeError('撮影用の新規プロジェクトはカメラから作成してください。');
      await ready;
      if (locked) throw new Error('プロジェクトの処理中です。少し待ってから撮影してください。');
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
    get currentProject() { return session.currentProject; }, get heldProject() { return null; }, get busy() { return locked; }
  });
}
