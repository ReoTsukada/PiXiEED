import { createPxdProject, decodePxd, encodePxd } from './pxd-codec.mjs';
import { createPxdStore } from './pxd-store.mjs?rev=20261001-free-tools-1';
import { pxdImageRoles, pxdToolUrl, primaryPxdImageRole } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { documentRgba } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { assertOwnPublicSources, getPxdPublicSources } from './work-save-policy.mjs?rev=20261001-free-tools-1';
import { mountProjectWorkspace } from './project-workspace.mjs?rev=20261006-panel-close-1';

const labels = { draw: 'ドット絵', audio: 'ドットで音楽', jigsaw: 'ジグソー', spot_difference: '間違い探し', hidden_object: 'もの探し' };
function errorMessage(error) {
  if (error?.code === 'PXD_STORE_CONFLICT') return error.message;
  if (/^PXD_(HASH|TRUNCATED|ENTRY|PATH|JSON|MANIFEST|MAGIC|ZIP|LEGACY)/.test(error?.code || '')) return 'PXDの内容を検証できませんでした。ファイルと編集中の作品は変更していません。';
  if (error?.code === 'PXD_VERSION_UNSUPPORTED') return 'この版のPXDにはまだ対応していません。元ファイルは変更していません。';
  if (/^PXD_(SIZE|BYTES|ENTRY_LIMIT)/.test(error?.code || '')) return 'PXDの保存上限を超えています。元ファイルと前の保存版は保持しています。';
  if (/^PXD_(IDB|STORE)/.test(error?.code || '')) return 'この端末に保存できませんでした。空き容量とブラウザーの保存設定を確認してください。';
  return error?.message || '作品を保存できませんでした。元の内容は保持しています。';
}
function style() {
  if (document.querySelector('[data-pxd-css]')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/css/pxd-tools.css?rev=20261006-panel-close-1'; link.dataset.pxdCss = ''; document.head.append(link);
}
function button(text, id, run) { const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.id = id; node.addEventListener('click', run); return node; }
function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function preview(image) {
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0); return canvas;
}
/** The original remains in the PXD; this asks only to create an editing copy. */
export function confirmPxdConversion({ image, document: working, message = '原本はそのまま残し、音楽用のコピーを作ります。', title: titleText = '音楽用の絵を確認', applyLabel = 'このコピーで作曲' }) {
  style();
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog'); dialog.className = 'pxd-conversion'; dialog.setAttribute('aria-labelledby', 'pxd-conversion-title');
    const title = document.createElement('h2'); title.id = 'pxd-conversion-title'; title.textContent = titleText;
    const note = document.createElement('p'); note.textContent = message;
    const figures = document.createElement('div'); figures.className = 'pxd-comparison';
    for (const [label, sample] of [['原本', image], ['作業用', { width: working.width, height: working.height, rgba: documentRgbaLoose(working) }]]) {
      const figure = document.createElement('figure'); const caption = document.createElement('figcaption'); caption.textContent = `${label} · ${sample.width} × ${sample.height}`; figure.append(preview(sample), caption); figures.append(figure);
    }
    const actions = document.createElement('div'); actions.className = 'pxd-actions';
    let settled = false;
    function finish(value) { if (settled) return; settled = true; dialog.close(); dialog.remove(); resolve(value); }
    actions.append(button('やめる', 'pxd-conversion-cancel', () => finish(false)), button(applyLabel, 'pxd-conversion-apply', () => finish(true)));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
    dialog.append(title, note, figures, actions); document.body.append(dialog); dialog.showModal();
  });
}
function documentRgbaLoose(value) {
  if (value?.rgba instanceof Uint8Array && value.rgba.length === value.width * value.height * 4) return value.rgba;
  try { return documentRgba(value); } catch {
    if (!Array.isArray(value?.palette) || !Array.isArray(value?.pixels) || value.pixels.length !== value.width * value.height) throw new TypeError('コピーの画像を確認できません。');
    const rgba = new Uint8Array(value.pixels.length * 4);
    value.pixels.forEach((index, pixel) => { if (index < 0) return; const color = value.palette[index]; if (!/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color)) throw new TypeError('コピーの色を確認できません。'); rgba.set([1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16)).concat(color.length === 9 ? parseInt(color.slice(7, 9), 16) : 255), pixel * 4); });
    return rgba;
  }
}
export function mountPxdTools(options) {
  if (options.projectWorkspace) return mountProjectWorkspace(options);
  const { tool, getProject, openProject, setStatus = () => {}, hasContent = () => true, getPublicSources = () => [], mount } = options;
  style(); const store = createPxdStore(); const uncommitted = new Set(); let current = null; let held = null; let opening = null; let queue = Promise.resolve(); let busy = false;
  let savePermission = true; let permissionEpoch = 0;
  const details = document.createElement('details'); details.className = 'pxd-tools'; details.id = 'pxd-tools';
  const summary = document.createElement('summary'); summary.setAttribute('aria-label', 'プロジェクトとバックアップ'); summary.setAttribute('aria-controls', 'pxd-panel'); summary.setAttribute('aria-expanded', 'false'); summary.title = 'プロジェクトとバックアップ';
  summary.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/></svg><span>作品</span>';
  const panel = document.createElement('div'); panel.className = 'pxd-panel'; panel.id = 'pxd-panel'; panel.hidden = true; panel.setAttribute('aria-label', '作品ファイル');
  const title = document.createElement('strong'); title.textContent = '作品をつなぐ';
  const message = document.createElement('p'); message.className = 'pxd-note'; message.id = 'pxd-file-status'; message.setAttribute('role', 'status'); message.textContent = '絵・音楽・パズルを、ひとつの作品に。';
  const filesNote = document.createElement('p'); filesNote.className = 'pxd-note pxd-files-note'; filesNote.textContent = '絵・音楽・パズルをまとめた編集用ファイル。別の端末への移動やバックアップに。';
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.pxd,application/octet-stream'; input.id = 'pxd-file-input'; input.hidden = true;
  const actions = document.createElement('div'); actions.className = 'pxd-actions';
  const openButton = button('バックアップを開く（PXD）', 'pxd-open', () => input.click());
  const saveButton = button('プロジェクトを保存', 'pxd-save', () => run(async () => { say('作品を保存しています…'); await save(); say('作品をこの端末に保存しました。'); }));
  const exportButton = button('バックアップを保存（PXD）', 'pxd-export', () => run(async () => { const project = await save(); download(await encodePxd(project), `pixieed-${project.projectId.slice(0, 8)}.pxd`); say('PXDを書き出しました。ほかの端末でも開けます。'); }));
  actions.append(openButton, saveButton, exportButton);
  const linksHeading = document.createElement('h3'); linksHeading.className = 'pxd-links-heading'; linksHeading.textContent = '同じ作品をほかのツールで使う';
  const links = document.createElement('div'); links.className = 'pxd-links'; links.setAttribute('aria-label', '同じ作品をほかのツールで使う');
  for (const [target, label] of Object.entries(labels)) {
    if (target === tool) continue;
    links.append(button(label, `pxd-to-${target}`, () => run(async () => {
      const project = await save();
      const role = target === 'draw' && pxdImageRoles(project).includes('draw') ? 'draw' : ['draw', 'audio'].includes(target) ? primaryPxdImageRole(project) : undefined;
      location.assign(pxdToolUrl(target, project, role));
    })));
  }
  const workingButton = button('音楽の絵を描く', 'pxd-to-audio-image', () => run(async () => { const project = await save(); location.assign(pxdToolUrl('draw', project, 'audio')); }));
  const afterButton = button('変更後の絵を描く', 'pxd-to-spot-after', () => run(async () => { const project = await save(); location.assign(pxdToolUrl('draw', project, 'spot-after')); }));
  const hiddenImageButton = button('もの探しの絵を描く', 'pxd-to-hidden-image', () => run(async () => { const project = await save(); location.assign(pxdToolUrl('draw', project, 'hidden')); }));
  const drawingImageButton = button('描画用の絵を開く', 'pxd-to-draw-image', () => run(async () => { const project = await save(); location.assign(pxdToolUrl('draw', project, 'draw')); }));
  const originalButton = button('読み込んだ旧PXDを保存', 'pxd-export-original', () => run(async () => {
    await assertCanSave();
    const original = (held || current)?.entries.find((entry) => entry.path === 'legacy/original.pxd');
    if (!original) throw new Error('旧PXDの原本が見つかりません。');
    download(original.bytes, 'pixieed-original.pxd'); say('旧PXDの原本を変更せず書き出しました。');
  }));
  workingButton.hidden = afterButton.hidden = hiddenImageButton.hidden = drawingImageButton.hidden = originalButton.hidden = true; links.append(workingButton, afterButton, hiddenImageButton, drawingImageButton, originalButton);
  panel.append(title, message, filesNote, input, actions, linksHeading, links); details.append(summary);
  const host = mount || document.querySelector(tool === 'audio' ? '.audio-more__actions' : tool === 'draw' ? '.draw-import__options' : tool === 'camera' ? '#resultControls' : '.header-inner') || document.querySelector('main');
  host?.append(details);
  // Keep the sheet outside filtered/scrolling workspaces, which create a different
  // containing block for fixed descendants in Safari and can hide the actions.
  document.body.append(panel); document.body.classList.add('pxd-ready');
  function say(value) { message.textContent = value; setStatus(value); }
  function refresh() {
    const project = held || current; const roles = project ? pxdImageRoles(project) : [];
    workingButton.hidden = !roles.includes('audio') && !(tool === 'audio' && hasContent()); afterButton.hidden = !roles.includes('spot-after') && !(tool === 'spot_difference' && hasContent());
    hiddenImageButton.hidden = !roles.includes('hidden') && !(tool === 'hidden_object' && hasContent()); originalButton.hidden = !project?.entries.some((entry) => entry.path === 'legacy/original.pxd');
    drawingImageButton.hidden = !roles.includes('draw');
    [...panel.querySelectorAll('button')].forEach((node) => { node.disabled = busy || node !== openButton && savePermission !== true; });
  }
  function publicSources(project = opening || held || current) { return [...getPxdPublicSources(project), ...getPublicSources()]; }
  async function assertCanSave(project = opening || held || current) { await assertOwnPublicSources(publicSources(project)); return true; }
  async function checkPermission() {
    const epoch = ++permissionEpoch;
    try {
      const sources = publicSources();
      savePermission = sources.length ? null : true; refresh();
      await assertOwnPublicSources(sources);
      if (epoch !== permissionEpoch) return false;
      savePermission = true; return true;
    } catch (error) {
      if (epoch !== permissionEpoch) return false;
      savePermission = false; say(errorMessage(error)); return false;
    } finally { if (epoch === permissionEpoch) refresh(); }
  }
  async function run(work) { if (busy) return; busy = true; refresh(); try { await work(); } catch (error) { if (error?.code === 'WORK_SAVE_FORBIDDEN') savePermission = false; say(errorMessage(error)); } finally { busy = false; refresh(); } }
  function save() {
    const operation = queue.catch(() => {}).then(async () => {
      const base = held || current;
      if (!held && !hasContent()) throw new Error('作品を用意してから保存してください。');
      const candidate = held || await getProject(base ? structuredClone(base) : null) || createPxdProject();
      await assertCanSave(candidate);
      const saved = await store.save(candidate, { expectedRevisionId: base && !uncommitted.has(base.projectId) ? base.revisionId : null });
      uncommitted.delete(saved.projectId);
      if (held) held = saved; else current = saved;
      try { localStorage.setItem(`pixieed:pxd:last:${tool}`, JSON.stringify({ projectId: saved.projectId, revisionId: saved.revisionId })); } catch {}
      refresh(); return saved;
    });
    queue = operation; return operation;
  }
  async function apply(project) {
    opening = project;
    try {
      // A public puzzle may be played, but never becomes a drawing or music import
      // merely because its file also carries an embedded image.
      if (tool !== 'jigsaw') await assertOwnPublicSources(getPxdPublicSources(project));
      await openProject(structuredClone(project)); current = project; held = null;
      const allowed = await checkPermission();
      if (allowed) say('PXDの作品を開きました。ほかの部品も保持しています。');
      return true;
    }
    catch (error) {
      held = project;
      const allowed = await checkPermission();
      say(`${errorMessage(error)}${allowed ? ' PXDの原本は書き出せます。' : ''}`);
      return false;
    }
    finally { if (opening === project) opening = null; }
  }
  input.addEventListener('change', () => run(async () => {
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    if (file.size > 64 * 1024 * 1024) throw new Error('PXDは64MBまで読み込めます。');
    const project = await decodePxd(new Uint8Array(await file.arrayBuffer()));
    // File imports become a new local copy, never an overwrite of an existing tab.
    const originalProjectId = project.projectId; project.projectId = crypto.randomUUID(); project.revisionId = crypto.randomUUID(); uncommitted.add(project.projectId);
    project.manifest = { ...project.manifest, importedFrom: { projectId: originalProjectId } };
    await apply(project);
  }));
  details.addEventListener('toggle', () => { panel.hidden = !details.open; summary.setAttribute('aria-expanded', String(details.open)); if (details.open) void checkPermission(); });
  document.addEventListener('pointerdown', (event) => { if (details.open && !details.contains(event.target) && !panel.contains(event.target)) details.open = false; });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && details.open) { details.open = false; summary.focus(); } });
  const ready = (async () => {
    const params = new URLSearchParams(location.search); const projectId = params.get('pxd'); const revisionId = params.get('pxdRevision');
    if (!projectId) return false;
    if (params.getAll('pxd').length !== 1 || params.getAll('pxdRevision').length !== 1 || !revisionId) { say('作品の保存版を特定できません。'); return false; }
    try { const project = await store.load(projectId, revisionId); if (!project) throw new Error('この端末に指定したPXDの保存版がありません。PXDファイルから開いてください。'); return await apply(project); }
    catch (error) { say(errorMessage(error)); return false; }
  })();
  window.addEventListener('storage', () => { void checkPermission(); });
  return Object.freeze({ ready, save, assertCanSave, reset() { current = held = null; void checkPermission(); }, get currentProject() { return current; }, get heldProject() { return held; } });
}
