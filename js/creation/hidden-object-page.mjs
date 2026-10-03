import { listOwnVersions, mountPictureShelf, savePicture } from './picture-shelf.mjs?rev=20261002-hidden-maker-1';
import { snapToWholePixels } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { documentRgba } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { decodeDrawImageFile } from './draw-import.mjs?rev=20260928-pixel-roundtrip-1';
import { prepareSharedCanvasImage } from './shared-image.mjs?rev=20261001-free-tools-1';
import { imageToDrawDocument } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { supabaseConfig } from '../../data/site-config.js?rev=20261001-free-tools-1';
import { HIDDEN_OBJECT_MAX_MASK_PIXELS, confirmHiddenObjectTargets, createHiddenObjectDraft, mapClientPointToPixel, resolveLocalDrawRevision, validateHiddenObjectDraft } from './hidden-object-core.mjs?rev=20260930-shared-canvas-5';
import { openPuzzleHandoff } from './puzzle-handoff.mjs?rev=20260928-puzzle-handoff-1';
import { mountPxdTools } from './pxd-ui.mjs?rev=20261002-project-cards-1';
import { requireSharedCanvasAccess } from './shared-canvas-access.mjs?rev=20261001-free-tools-1';
import { putPxdSharedImage } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { createPxdPuzzleFromMain, hasPxdPuzzle, readPxdPuzzle, materializePxdPuzzle, writePxdPuzzle } from './pxd-puzzles.mjs?rev=20261001-free-tools-1';
import { wheelZoomFactor } from './viewport-wheel.mjs';
import { zoomCanvasViewportAt } from './canvas-viewport.mjs?rev=20260930-pinch-anchor-1';

const LAST_KEY = 'pixieed:creation:hidden-object:last-draft:v1';
const $ = (selector) => document.querySelector(selector);
const status = $('#hidden-status'); const sourceSelect = $('#hidden-source'); const setup = $('#hidden-setup'); const editor = $('#hidden-editor');
const canvas = $('#hidden-canvas'); const context = canvas.getContext('2d', { alpha: true }); const targetList = $('#hidden-target-list');
const hitPreview = $('#hidden-hit-preview');
const saveButton = $('#hidden-save'); const playLocalButton = $('#hidden-play-local'); const resumeButton = $('#hidden-resume'); const maskSets = new Map(); const COLORS = [[231, 84, 69], [76, 130, 195], [109, 155, 104], [154, 107, 176], [242, 184, 75], [38, 50, 56]];
const publishButton = $('#hidden-publish');
const imageFileInput = $('#hidden-image-file'); const imagePickButton = $('#hidden-image-pick');
const imageReplaceButton = $('#hidden-image-replace');
let adapter; let store; let sourceDraftId = null; let sourceRevision = null; let draft = null; let draftId = null; let savedConfirmedDraftId = null; let selectedTargetId = null; let editMode = 'paint'; let activePointer = null; let previousPoint = null; let cursorPixel = 0; let drawQueued = false; let totalMaskPixels = 0;
let importingImage = false;
let editorEpoch = 0;
let pxdOriginalRefs = null; let pxdPreservedPayload = null; let pxdBridge = null;
const touchPoints = new Map(); let touchStrokeSnapshot = null; let pinchStart = null; let viewScale = 1; let viewPanX = 0; let viewPanY = 0;

function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function setStatus(value) { status.textContent = value; if (!editor.hidden) $('#hidden-edit-hint').textContent = value; }
function sourceRef(draftIdValue, revision) { return { draftId: draftIdValue, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme }; }
async function verifyCurrentSource() {
  const current = draft; const epoch = editorEpoch;
  const fixed = await resolveLocalDrawRevision(adapter, current.source.draftId, current.source.revisionId);
  if (JSON.stringify(sourceRef(current.source.draftId, fixed)) !== JSON.stringify(current.source)) throw new Error('元画像の固定版または利用許可が一致しません');
  if (current === draft && epoch === editorEpoch) sourceRevision = fixed;
  return fixed;
}
function revisionText(revision, index) { return `保存版 ${index + 1}・${revision.document.width}×${revision.document.height}px`; }
function currentTarget() { return draft?.targets.find((target) => target.id === selectedTargetId) || null; }
function updateLocalPlayButton() {
  const ready = Boolean(draft?.confirmed && draftId && savedConfirmedDraftId === draftId);
  playLocalButton.hidden = !ready; playLocalButton.disabled = !ready;
  publishButton.hidden = !ready; publishButton.disabled = !ready || !store || !adapter || supabaseConfig.puzzlePublicationEnabled !== true;
  publishButton.textContent = supabaseConfig.puzzlePublicationEnabled === true ? '地球儀へ投稿' : '投稿は準備中';
}

function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawCanvas(); });
}

function drawCanvas() {
  if (!draft || !sourceRevision) return;
  const pixels = new Uint8ClampedArray(documentRgba(sourceRevision.document));
  for (let targetIndex = 0; targetIndex < draft.targets.length; targetIndex += 1) {
    const target = draft.targets[targetIndex]; const color = COLORS[targetIndex % COLORS.length]; const set = maskSets.get(target.id) || new Set();
    for (const pixel of set) {
      const offset = pixel * 4;
      pixels[offset] = Math.round((pixels[offset] + color[0]) / 2); pixels[offset + 1] = Math.round((pixels[offset + 1] + color[1]) / 2); pixels[offset + 2] = Math.round((pixels[offset + 2] + color[2]) / 2); pixels[offset + 3] = Math.max(190, pixels[offset + 3]);
    }
  }
  if (canvas.width !== draft.width || canvas.height !== draft.height) { canvas.width = draft.width; canvas.height = draft.height; }
  context.putImageData(new ImageData(pixels, draft.width, draft.height), 0, 0);
  canvas.style.setProperty('--hidden-aspect', String(draft.width / draft.height));
  if (document.activeElement === canvas) {
    context.save(); context.strokeStyle = '#111'; context.lineWidth = Math.max(1, draft.width / 64); context.strokeRect(cursorPixel % draft.width, Math.floor(cursorPixel / draft.width), 1, 1); context.restore();
  }
  drawHitBoxPreview();
}

function drawHitBoxPreview() {
  hitPreview.replaceChildren();
  if (!draft?.confirmed || !Array.isArray(draft.hitBoxes) || !canvas.clientWidth || !canvas.clientHeight) { hitPreview.setAttribute('hidden', ''); return; }
  const width = canvas.clientWidth; const height = canvas.clientHeight; const scaleX = width / draft.width; const scaleY = height / draft.height;
  hitPreview.setAttribute('viewBox', `0 0 ${width} ${height}`); hitPreview.setAttribute('preserveAspectRatio', 'none');
  hitPreview.style.width = `${width}px`; hitPreview.style.height = `${height}px`; hitPreview.style.left = '50%'; hitPreview.style.top = '50%';
  hitPreview.style.marginLeft = `${-width / 2}px`; hitPreview.style.marginTop = `${-height / 2}px`;
  hitPreview.style.transform = getComputedStyle(canvas).transform; hitPreview.style.transformOrigin = 'center';
  for (const [index, box] of draft.hitBoxes.entries()) {
    const x = box.minX * scaleX; const y = box.minY * scaleY; const w = (box.maxX - box.minX + 1) * scaleX; const h = (box.maxY - box.minY + 1) * scaleY;
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outline.setAttribute('x', String(x + 1)); outline.setAttribute('y', String(y + 1)); outline.setAttribute('width', String(Math.max(0, w - 2))); outline.setAttribute('height', String(Math.max(0, h - 2)));
    outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', '#fff'); outline.setAttribute('stroke-width', '3'); outline.setAttribute('stroke-dasharray', '6 4'); outline.setAttribute('vector-effect', 'non-scaling-stroke');
    const edge = outline.cloneNode(); edge.setAttribute('stroke', '#17232d'); edge.setAttribute('stroke-width', '1.5');
    const labelX = Math.min(Math.max(0, x), Math.max(0, width - 20)); const labelY = Math.min(Math.max(0, y), Math.max(0, height - 17));
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); badge.setAttribute('x', String(labelX)); badge.setAttribute('y', String(labelY)); badge.setAttribute('width', '20'); badge.setAttribute('height', '17'); badge.setAttribute('rx', '4'); badge.setAttribute('fill', '#2458c0'); badge.setAttribute('stroke', '#fff'); badge.setAttribute('stroke-width', '1.5'); badge.setAttribute('vector-effect', 'non-scaling-stroke');
    const number = document.createElementNS('http://www.w3.org/2000/svg', 'text'); number.setAttribute('x', String(labelX + 10)); number.setAttribute('y', String(labelY + 12)); number.setAttribute('fill', '#fff'); number.setAttribute('font-size', '11'); number.setAttribute('font-weight', '700'); number.setAttribute('font-family', 'system-ui, sans-serif'); number.setAttribute('text-anchor', 'middle'); number.setAttribute('stroke', '#17232d'); number.setAttribute('stroke-width', '.6'); number.setAttribute('paint-order', 'stroke'); number.textContent = String(index + 1);
    hitPreview.append(outline, edge, badge, number);
  }
  hitPreview.removeAttribute('hidden');
}

function renderTargets() {
  targetList.replaceChildren();
  draft.targets.forEach((target, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.targetId = target.id; button.dataset.maskEmpty = String(!(maskSets.get(target.id)?.size)); button.setAttribute('aria-pressed', String(target.id === selectedTargetId)); button.disabled = draft.confirmed;
    button.style.setProperty('--target-color', `rgb(${COLORS[index % COLORS.length].join(' ')})`);
    button.textContent = `${index + 1}. ${target.name} · ${maskSets.get(target.id)?.size || 0}px`;
    button.setAttribute('aria-label', `対象 ${index + 1} ${target.name}、マスク ${maskSets.get(target.id)?.size || 0}画素${target.id === selectedTargetId ? '、選択中' : ''}`);
    button.addEventListener('click', () => { selectedTargetId = target.id; $('#hidden-remove').disabled = draft.confirmed; renderTargets(); requestDraw(); });
    targetList.append(button);
  });
  $('#hidden-remove').disabled = draft.confirmed || !currentTarget();
  $('#hidden-confirm').disabled = draft.confirmed || !draft.targets.length || draft.targets.some((target) => !(maskSets.get(target.id)?.size));
  $('#hidden-add').disabled = draft.confirmed; $('#hidden-name').disabled = draft.confirmed;
  $('#hidden-new').hidden = !draft.confirmed;
  saveButton.disabled = !draft;
  updateLocalPlayButton();
  updateSummary();
}

function updateSummary() {
  $('#hidden-mask-summary').textContent = draft.confirmed
    ? `${draft.targets.length}個の正解範囲を番号付きで確認できます。`
    : `${draft.targets.length}個の対象 · マスク ${totalMaskPixels.toLocaleString('ja-JP')}画素`;
}

function applyCanvasView() {
  const zoom = $('#hidden-zoom');
  canvas.style.setProperty('--hidden-zoom', String(viewScale));
  canvas.style.setProperty('--hidden-pan-x', `${viewPanX}px`);
  canvas.style.setProperty('--hidden-pan-y', `${viewPanY}px`);
  if (draft?.confirmed && !hitPreview.hasAttribute('hidden')) hitPreview.style.transform = getComputedStyle(canvas).transform;
  zoom.value = `${Math.round(viewScale * 100)}%`;
  zoom.textContent = zoom.value;
  zoom.dataset.visible = String(viewScale > 1.02);
}

/** Show the art at a whole number of device pixels per dot, as large as the layout allows. */
function fitCanvas() {
  if (!draft || editor.hidden) return;
  if (canvas.width !== draft.width || canvas.height !== draft.height) { canvas.width = draft.width; canvas.height = draft.height; requestDraw(); }
  canvas.style.setProperty('--hidden-aspect', String(draft.width / draft.height));
  snapToWholePixels(canvas, draft.width);
  if (draft.confirmed) drawHitBoxPreview();
}
function resetCanvasView() { viewScale = 1; viewPanX = 0; viewPanY = 0; pinchStart = null; touchStrokeSnapshot = null; activePointer = null; previousPoint = null; touchPoints.clear(); applyCanvasView(); }
function displayEditor() {
  setup.hidden = true; editor.hidden = false; document.body.classList.add('hidden-object-editing');
  editor.dataset.confirmed = String(Boolean(draft?.confirmed));
  $('#hidden-edit-hint').textContent = '対象を追加 → 選択 → 絵の上をなぞる';
  resetCanvasView(); renderTargets(); requestDraw(); fitCanvas();
}
function installRevision(revision, fixedDraftId, targetModel = null) {
  sourceDraftId = fixedDraftId; sourceRevision = revision;
  savedConfirmedDraftId = null;
  cursorPixel = 0;
  if (targetModel) {
    draft = validateHiddenObjectDraft(targetModel); draftId = draft.gameId;
    const ids = new Set(draft.targets.map(({ id }) => id));
    for (const target of draft.targetNames || []) if (!ids.has(target.id) && typeof target.name === 'string' && target.name.trim()) { draft.targets.push({ id: target.id, name: target.name, pixels: [] }); ids.add(target.id); }
    delete draft.targetNames;
    maskSets.clear(); for (const target of draft.targets) maskSets.set(target.id, new Set(target.pixels));
    selectedTargetId = draft.targets[0]?.id || null;
  } else {
    draftId = null; selectedTargetId = null; maskSets.clear();
    draft = createHiddenObjectDraft({ gameId: crypto.randomUUID(), source: sourceRef(fixedDraftId, revision), width: revision.document.width, height: revision.document.height });
  }
  totalMaskPixels = [...maskSets.values()].reduce((sum, cells) => sum + cells.size, 0);
  $('#hidden-source-label').textContent = `元の絵の固定版 ${revision.revisionId.slice(0, 8)}・${draft.width}×${draft.height}px`;
  $('#hidden-confirmed').hidden = !draft.confirmed; displayEditor(); saveButton.disabled = false;
  $('#hidden-new').hidden = !draft.confirmed;
}

async function loadSources() {
  sourceSelect.replaceChildren();
  try {
    // もの探し keeps its own picture; versions come from its own draft only.
    const { draftId: ownId, versions: revisions } = await listOwnVersions('hidden-object', { adapter });
    sourceDraftId = ownId;
    if (!revisions.length) { sourceSelect.add(new Option('まだ絵がありません', '')); $('#hidden-start').disabled = true; setStatus('画像ファイルを読み込むか、ほかのツールで作った自分の絵を持ってこられます。'); return; }
    revisions.forEach((revision, index) => sourceSelect.add(new Option(revisionText(revision, index), revision.revisionId)));
    sourceSelect.value = revisions.at(-1).revisionId;
    $('#hidden-start').disabled = false;
    setStatus('絵を選んで、見つけてほしいものを指定してください。');
  } catch (error) { $('#hidden-start').disabled = true; setStatus(error.message); }
}

async function start() {
  if (importingImage) return;
  const epoch = ++editorEpoch; const sourceId = sourceDraftId;
  try {
    $('#hidden-start').disabled = true; setStatus('元画像の固定版を確認しています…');
    const revision = await resolveLocalDrawRevision(adapter, sourceId, sourceSelect.value);
    if (epoch !== editorEpoch) return;
    pxdBridge?.reset();
    installRevision(revision, sourceId); setStatus('見つけてほしいものの名前を追加し、絵の上をなぞってください。');
  } catch (error) { if (epoch === editorEpoch) setStatus(`開始できませんでした：${error.message}`); }
  finally { $('#hidden-start').disabled = false; }
}

async function importImageFile(file) {
  if (!file || importingImage) return;
  if (!adapter || !store) { setStatus('このブラウザーでは端末内保存を利用できません。'); return; }
  const epoch = ++editorEpoch;
  importingImage = true; editor.setAttribute('aria-busy', 'true'); imagePickButton.disabled = true; saveButton.disabled = true;
  imageReplaceButton.disabled = true; $('#hidden-start').disabled = true; resumeButton.disabled = true;
  setStatus('画像を読み込み、もの探し専用の固定版を作っています…');
  try {
    const decoded = await decodeDrawImageFile(file);
    if (epoch !== editorEpoch) return;
    const prepared = prepareSharedCanvasImage({ width: decoded.width, height: decoded.height, rgba: decoded.data }, { passActive: false });
    if (!prepared.image.rgba.some((value, index) => index % 4 === 3 && value > 0)) throw new RangeError('透明以外の画素がある画像を選んでください。');
    const document = imageToDrawDocument(prepared.image);
    const own = await savePicture('hidden-object', document, {
      adapter,
      source: { type: 'image_import', assetId: null, revisionId: null }
    });
    if (epoch !== editorEpoch) return;
    // Switch only after decode, normalization, and immutable source save all succeeded.
    pxdBridge?.reset(); pxdOriginalRefs = null; pxdPreservedPayload = null;
    sourceDraftId = own.draftId; installRevision(own.revision, own.draftId);
    const adjusted = prepared.changed || decoded.sourceWidth !== document.width || decoded.sourceHeight !== document.height;
    setStatus(adjusted ? '画像を読み込みました。大きさや色を整えています。名前をつけて対象を追加してください。' : '画像を読み込みました。名前をつけて対象を追加してください。');
  } catch (error) {
    if (epoch === editorEpoch) setStatus(`画像を読み込めませんでした：${error.message}`);
  } finally {
    importingImage = false; editor.removeAttribute('aria-busy'); imagePickButton.disabled = false; imageReplaceButton.disabled = Boolean(draft?.confirmed); saveButton.disabled = !draft; resumeButton.disabled = false; $('#hidden-start').disabled = !sourceSelect.value; imageFileInput.value = '';
  }
}

function modelWithMasks() {
  return { ...draft, targets: draft.targets.map((target) => ({ ...target, pixels: [...(maskSets.get(target.id) || [])].sort((a, b) => a - b) })) };
}
function portableMaskModel() {
  const model = modelWithMasks();
  const pending = model.targets.filter((target) => !target.pixels.length);
  model.targets = model.targets.filter((target) => target.pixels.length);
  model.targetNames = pending.map(({ id, name }) => ({ id, name }));
  return model;
}

async function save() {
  if (!store || !draft) return;
  const epoch = editorEpoch;
  savedConfirmedDraftId = null; updateLocalPlayButton();
  saveButton.disabled = true; setStatus('端末に保存しています…');
  try {
    await pxdBridge?.save();
    if (epoch !== editorEpoch) return;
    if (!draft.confirmed && draft.targets.some((target) => !maskSets.get(target.id)?.size)) { setStatus('対象名と絵をプロジェクトに保存しました。対象の場所をなぞると正解を確定できます。'); return; }
    await verifyCurrentSource();
    if (epoch !== editorEpoch) return;
    const document = validateHiddenObjectDraft(modelWithMasks());
    const result = await store.save({ draftId: document.gameId, kind: 'hidden_object', ownerId: 'local-owner', document, source: { type: 'local_draft_copy', assetId: document.source.assetId, revisionId: document.source.revisionId } });
    if (epoch !== editorEpoch) return;
    draft = result.document; draftId = document.gameId;
    if (!writeStorage(LAST_KEY, draftId)) throw new Error('再開用の目印を端末に保存できませんでした');
    if (draft.confirmed) savedConfirmedDraftId = draftId;
    setStatus(draft.confirmed ? '作者指定の正解マスクを端末内の下書きに保存しました。公開はされません。' : 'マスクを端末内の下書きに保存しました。公開はされません。');
  } catch (error) { if (epoch === editorEpoch) setStatus(`保存できませんでした：${error.message}`); }
  finally { saveButton.disabled = !draft; updateLocalPlayButton(); }
}

async function resume() {
  if (importingImage) return;
  const id = readStorage(LAST_KEY); if (!id || !store || !adapter) return;
  const epoch = ++editorEpoch;
  resumeButton.disabled = true; setStatus('前回の下書きと固定版を確認しています…');
  try {
    const revision = await store.load(id);
    if (epoch !== editorEpoch) return;
    if (!revision || revision.asset.kind !== 'hidden_object' || revision.asset.visibility !== 'draft' || revision.asset.owner.type !== 'local' || revision.asset.owner.id !== 'local-owner') throw new Error('もの探しの下書きが見つかりません');
    const saved = validateHiddenObjectDraft(revision.document);
    const fixed = await resolveLocalDrawRevision(adapter, saved.source.draftId, saved.source.revisionId);
    if (epoch !== editorEpoch) return;
    if (JSON.stringify(sourceRef(saved.source.draftId, fixed)) !== JSON.stringify(saved.source) || fixed.document.width !== saved.width || fixed.document.height !== saved.height) throw new Error('元画像の固定版が一致しません');
    pxdBridge?.reset();
    installRevision(fixed, saved.source.draftId, saved); editor.scrollIntoView({ block: 'start' }); setStatus('前回のマスクを、同じ元画像の固定版で再開しました。');
    if (saved.confirmed) { savedConfirmedDraftId = id; updateLocalPlayButton(); }
  } catch (error) { if (epoch === editorEpoch) setStatus(`再開できませんでした：${error.message}`); }
  finally { resumeButton.disabled = false; }
}

async function openPxdHidden(project) {
  const epoch = ++editorEpoch;
  if (!store || !adapter) throw new Error('端末内保存を利用できません。');
  if (!project.entries.length) { draft = null; sourceRevision = null; draftId = null; pxdOriginalRefs = pxdPreservedPayload = null; maskSets.clear(); editor.hidden = true; setup.hidden = false; document.body.classList.remove('hidden-object-editing'); return; }
  const params = new URLSearchParams(location.search);
  const preferredRole = params.get('pxd') === project.projectId && params.getAll('pxdImage').length === 1 ? params.get('pxdImage') : undefined;
  let imported;
  if (hasPxdPuzzle(project, 'hidden_object')) {
    const savedPuzzle = await readPxdPuzzle(project, 'hidden_object');
    if (epoch !== editorEpoch) return;
    imported = await materializePxdPuzzle(savedPuzzle, { tool: 'hidden_object', store });
  } else {
    imported = await createPxdPuzzleFromMain(project, { tool: 'hidden_object', store, preferredRole });
  }
  if (epoch !== editorEpoch) return;
  pxdOriginalRefs = imported.portableOriginalRefs; pxdPreservedPayload = imported.preservedPayload || null;
  installRevision(imported.bindings.source.revision, imported.bindings.source.draftId, imported.document);
  draftId = null; savedConfirmedDraftId = null;
  setStatus(imported.sourceChanged ? 'PXD内の元画像が変わったため、対象は残して正解を未確定にしました。' : imported.document.targets.length ? 'PXDのもの探しを端末内の新しい下書きとして開きました。保存後に試遊できます。' : 'PXDの元画像から空のもの探しを作りました。対象を追加し、マスクを指定してください。');
}

function mountPxdHidden() {
  if (!store) return null;
  return mountPxdTools({
    tool: 'hidden_object', projectWorkspace: true, setStatus, hasContent: () => Boolean(draft), openProject: openPxdHidden,
    getProject: async (project) => draft && sourceRevision ? writePxdPuzzle(project.manifest.sharedCanvas ? project : await putPxdSharedImage(project, { width: sourceRevision.document.width, height: sourceRevision.document.height, rgba: documentRgba(sourceRevision.document) }), {
      tool: 'hidden_object', document: portableMaskModel(), sourceDrawDocuments: { hidden: sourceRevision.document },
      portableOriginalRefs: pxdOriginalRefs, preservedPayload: pxdPreservedPayload, sourceChanged: false
    }) : project
  });
}

function addTarget() {
  if (!requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  if (!draft || draft.confirmed) return;
  const name = $('#hidden-name').value.trim();
  if (!name) { setStatus('見つけるものの名前を入力してください。'); $('#hidden-name').focus(); return; }
  if (draft.targets.some((target) => target.name.trim().toLocaleLowerCase('ja') === name.toLocaleLowerCase('ja'))) { setStatus('対象の名前は重複できません。'); return; }
  if (draft.targets.length >= 128) { setStatus('対象は128個までです。'); return; }
  let suffix = draft.targets.length + 1; let id = `target-${String(suffix).padStart(3, '0')}`; const ids = new Set(draft.targets.map((target) => target.id)); while (ids.has(id)) id = `target-${String(++suffix).padStart(3, '0')}`;
  draft.targets.push({ id, name, pixels: [] }); maskSets.set(id, new Set()); selectedTargetId = id; editMode = 'paint'; document.querySelectorAll('[data-hidden-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.hiddenMode === 'paint'))); $('#hidden-name').value = ''; renderTargets(); requestDraw(); pxdBridge?.markDirty(); setStatus(`${name}を追加しました。絵の上をなぞってマスクを作ってください。`);
}

function removeTarget() {
  if (!requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  if (!currentTarget() || draft.confirmed) return;
  const name = currentTarget().name; totalMaskPixels -= maskSets.get(selectedTargetId)?.size || 0; draft.targets = draft.targets.filter((target) => target.id !== selectedTargetId); maskSets.delete(selectedTargetId); selectedTargetId = draft.targets[0]?.id || null; renderTargets(); requestDraw(); pxdBridge?.markDirty(); setStatus(`${name}を削除しました。`);
}

function setPixel(pixel, { refresh = true } = {}) {
  if (pixel === null || !currentTarget() || draft.confirmed) return;
  const set = maskSets.get(selectedTargetId); const mode = editMode;
  if (mode === 'paint') {
    if (set.has(pixel)) return false;
    if ([...maskSets.entries()].some(([id, other]) => id !== selectedTargetId && other.has(pixel))) { setStatus('別の対象の色が付いた場所です。先にそちらを消してください。'); return false; }
    if (totalMaskPixels >= HIDDEN_OBJECT_MAX_MASK_PIXELS) { setStatus('マスクの保存上限です。余分な画素を消してください。'); return false; }
    set.add(pixel); totalMaskPixels += 1;
  } else { if (!set.delete(pixel)) return false; totalMaskPixels -= 1; }
  if (refresh) { renderTargets(); requestDraw(); }
  return true;
}

function linePixels(from, to, callback) {
  let x = from % draft.width; let y = Math.floor(from / draft.width); const x1 = to % draft.width; const y1 = Math.floor(to / draft.width);
  const dx = Math.abs(x1 - x); const sx = x < x1 ? 1 : -1; const dy = -Math.abs(y1 - y); const sy = y < y1 ? 1 : -1; let error = dx + dy;
  for (;;) { callback(y * draft.width + x); if (x === x1 && y === y1) break; const twice = 2 * error; if (twice >= dy) { error += dy; x += sx; } if (twice <= dx) { error += dx; y += sy; } }
}

function canvasPoint(event) { return mapClientPointToPixel(event.clientX, event.clientY, canvas.getBoundingClientRect(), draft.width, draft.height); }
function cancelTouchStroke() {
  if (!touchStrokeSnapshot) return;
  maskSets.set(touchStrokeSnapshot.targetId, touchStrokeSnapshot.pixels);
  totalMaskPixels = touchStrokeSnapshot.totalMaskPixels;
  touchStrokeSnapshot = null;
  renderTargets(); requestDraw();
}
canvas.addEventListener('pointerdown', (event) => {
  if (importingImage || !draft || draft.confirmed) return;
  if (event.pointerType === 'touch') {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (touchPoints.size >= 2) {
      cancelTouchStroke();
      activePointer = null; previousPoint = null;
      const [first, second] = [...touchPoints.values()];
      const center = previewCenter();
      pinchStart = { distance: Math.hypot(second.x - first.x, second.y - first.y) || 1, centerX: (first.x + second.x) / 2, centerY: (first.y + second.y) / 2, viewportCenterX: center.x, viewportCenterY: center.y, scale: viewScale, panX: viewPanX, panY: viewPanY };
      event.preventDefault(); return;
    }
  }
  if (!currentTarget()) { setStatus('先に名前を付けた対象を選んでください。'); return; }
  if (!requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  if (event.pointerType === 'touch') touchStrokeSnapshot = { targetId: selectedTargetId, pixels: new Set(maskSets.get(selectedTargetId)), totalMaskPixels };
  const pixel = canvasPoint(event); if (pixel === null) return;
  event.preventDefault(); activePointer = event.pointerId; previousPoint = pixel; canvas.setPointerCapture(event.pointerId); setPixel(pixel);
});
canvas.addEventListener('pointermove', (event) => {
  if (touchPoints.has(event.pointerId)) {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size >= 2 && pinchStart) {
      const [first, second] = [...touchPoints.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const centerX = (first.x + second.x) / 2; const centerY = (first.y + second.y) / 2;
      const next = zoomCanvasViewportAt(pinchStart, distance / pinchStart.distance, pinchStart.centerX, pinchStart.centerY, centerX, centerY, pinchStart.viewportCenterX, pinchStart.viewportCenterY);
      viewScale = next.scale;
      const maxX = Math.max(0, (canvas.clientWidth * viewScale - editor.clientWidth) / 2);
      const maxY = Math.max(0, (canvas.clientHeight * viewScale - editor.clientHeight) / 2);
      viewPanX = Math.min(maxX, Math.max(-maxX, next.panX));
      viewPanY = Math.min(maxY, Math.max(-maxY, next.panY));
      applyCanvasView(); event.preventDefault(); return;
    }
  }
  if (activePointer !== event.pointerId || !draft || !currentTarget()) return;
  const pixel = canvasPoint(event);
  if (pixel === null) { previousPoint = null; return; }
  let changed = false;
  if (previousPoint === null) changed = setPixel(pixel, { refresh: false });
  else if (pixel !== previousPoint) linePixels(previousPoint, pixel, (at) => { changed = setPixel(at, { refresh: false }) || changed; });
  if (changed) { updateSummary(); requestDraw(); }
  previousPoint = pixel;
});
function previewCenter() {
  const rect = $('.hidden-preview').getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
canvas.addEventListener('wheel', (event) => {
  if (!draft || editor.hidden) return;
  event.preventDefault();
  const center = previewCenter(); const rect = $('.hidden-preview').getBoundingClientRect();
  const next = zoomCanvasViewportAt({ scale: viewScale, panX: viewPanX, panY: viewPanY }, wheelZoomFactor(event.deltaY, event.deltaMode, rect.height), event.clientX, event.clientY, event.clientX, event.clientY, center.x, center.y);
  viewScale = next.scale; viewPanX = next.panX; viewPanY = next.panY; applyCanvasView();
}, { passive: false });
function finishPointer(event) {
  const wasTouch = touchPoints.delete(event.pointerId);
  if (wasTouch && event.type === 'pointercancel') cancelTouchStroke();
  if (touchPoints.size < 2) pinchStart = null;
  if (activePointer === event.pointerId) { activePointer = null; previousPoint = null; renderTargets(); requestDraw(); pxdBridge?.markDirty(); }
  if (wasTouch && touchPoints.size === 0) { touchStrokeSnapshot = null; renderTargets(); requestDraw(); }
}
canvas.addEventListener('pointerup', finishPointer); canvas.addEventListener('pointercancel', finishPointer);
canvas.addEventListener('keydown', (event) => {
  if (importingImage || !draft || draft.confirmed) return;
  const x = cursorPixel % draft.width; const y = Math.floor(cursorPixel / draft.width); let nextX = x; let nextY = y;
  if (event.key === 'ArrowLeft') nextX = Math.max(0, x - 1); else if (event.key === 'ArrowRight') nextX = Math.min(draft.width - 1, x + 1); else if (event.key === 'ArrowUp') nextY = Math.max(0, y - 1); else if (event.key === 'ArrowDown') nextY = Math.min(draft.height - 1, y + 1); else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object') && setPixel(cursorPixel)) pxdBridge?.markDirty(); return; } else return;
  event.preventDefault(); cursorPixel = nextY * draft.width + nextX; requestDraw();
});
canvas.addEventListener('focus', requestDraw); canvas.addEventListener('blur', requestDraw);

$('#hidden-start').addEventListener('click', start); saveButton.addEventListener('click', save); resumeButton.addEventListener('click', resume);
imagePickButton.addEventListener('click', () => imageFileInput.click()); imageReplaceButton.addEventListener('click', () => imageFileInput.click());
imageFileInput.addEventListener('change', () => { void importImageFile(imageFileInput.files?.[0]); });
playLocalButton.addEventListener('click', () => { if (draft?.confirmed && draftId && savedConfirmedDraftId === draftId) window.location.assign(`/play/hidden-object/?localHidden=${encodeURIComponent(draftId)}`); });
publishButton.addEventListener('click', async () => {
  if (!draft?.confirmed || !draftId || savedConfirmedDraftId !== draftId || !store || !adapter || supabaseConfig.puzzlePublicationEnabled !== true) return;
  publishButton.disabled = true; setStatus('固定版と投稿用PNGを確認しています…');
  try { await openPuzzleHandoff({ mode: 'hidden_object', draftId, store, adapter }); }
  catch (error) { publishButton.disabled = false; setStatus(`投稿を準備できませんでした：${error.message}`); }
});
$('#hidden-add').addEventListener('click', addTarget); $('#hidden-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addTarget(); } }); $('#hidden-remove').addEventListener('click', removeTarget);
document.querySelectorAll('[data-hidden-mode]').forEach((button) => button.addEventListener('click', () => { editMode = button.dataset.hiddenMode; document.querySelectorAll('[data-hidden-mode]').forEach((option) => option.setAttribute('aria-pressed', String(option === button))); }));
$('#hidden-confirm').addEventListener('click', async () => {
  if (!requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  const epoch = editorEpoch;
  try { await verifyCurrentSource(); if (epoch !== editorEpoch) return; draft = confirmHiddenObjectTargets(modelWithMasks()); editor.dataset.confirmed = 'true'; $('#hidden-confirmed').hidden = false; renderTargets(); requestDraw(); setStatus(`番号付きの枠が、遊ぶ人に見つけてもらう範囲です。`); await save(); }
  catch (error) { if (epoch === editorEpoch) setStatus(`確定できませんでした：${error.message}`); }
});
$('#hidden-new').addEventListener('click', () => { editorEpoch += 1; pxdBridge?.reset(); draft = null; draftId = null; savedConfirmedDraftId = null; pxdOriginalRefs = null; pxdPreservedPayload = null; sourceRevision = null; selectedTargetId = null; maskSets.clear(); totalMaskPixels = 0; editor.hidden = true; setup.hidden = false; document.body.classList.remove('hidden-object-editing'); resetCanvasView(); saveButton.disabled = true; updateLocalPlayButton(); setStatus('新しいもの探しの元画像を選んでください。'); });

try { adapter = createIndexedDbDraftAdapter(); store = createLocalDraftStore(adapter); } catch { setStatus('このブラウザーでは端末内保存を利用できません。'); }
window.addEventListener('resize', fitCanvas);
resumeButton.hidden = !readStorage(LAST_KEY);
mountPictureShelf($('#hidden-shelf'), { tool: 'hidden-object', adapter, onBrought: async ({ from }) => { await loadSources(); setStatus(`${from.label}の絵を持ってきました。`); }, onError: (error) => setStatus(`持ってこられませんでした：${error.message}`) });
pxdBridge = mountPxdHidden();
const pxdImported = pxdBridge ? await pxdBridge.ready : false;
if (!pxdImported) await loadSources();
