import { mountGameEditorSession } from './game-editor-session.mjs?rev=20261017-game-editor-1';
import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1';
import { listOwnVersions, mountPictureShelf, savePicture } from './picture-shelf.mjs?rev=20261002-hidden-maker-1';
import { snapToWholePixels } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { documentRgba } from './draw-core.mjs?rev=20261011-tool-size-1';
import { decodeDrawImageFile } from './draw-import.mjs?rev=20260928-pixel-roundtrip-1';
import { prepareSharedCanvasImage } from './shared-image.mjs?rev=20261016-color-capability-1';
import { imageToDrawDocument } from './pxd-project.mjs?rev=20261016-color-capability-1';
import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';
import { HIDDEN_OBJECT_MAX_MASK_PIXELS, confirmHiddenObjectTargets, createHiddenObjectDraft, mapClientPointToPixel, resolveLocalDrawRevision, validateHiddenObjectDraft } from './hidden-object-core.mjs?rev=20260930-shared-canvas-5';
import { openPuzzleHandoff } from './puzzle-handoff.mjs?rev=20261021-jigsaw-public-1';
import { mountPxdTools } from './pxd-ui.mjs?rev=20261018-direct-runtime-2';
import { requireSharedCanvasAccess } from './shared-canvas-access.mjs?rev=20261016-color-capability-1';
import { putPxdSharedImage } from './pxd-project.mjs?rev=20261016-color-capability-1';
import { createPxdPuzzleFromMain, hasPxdPuzzle, readPxdPuzzle, materializePxdPuzzle, writePxdPuzzle } from './pxd-puzzles.mjs?rev=20261016-color-capability-1';
import { wheelZoomFactor } from './viewport-wheel.mjs';
import { zoomCanvasViewportAt } from './canvas-viewport.mjs?rev=20260930-pinch-anchor-1';
import { applyDrawingToolIcons } from './drawing-tool-icons.mjs?rev=20261004-canvas-settings-1';
import { mountPuzzleImageSlot } from './puzzle-image-slot.mjs?rev=20261003-puzzle-import-1';
import { confirmPxdConversion } from './pxd-ui.mjs?rev=20261018-direct-runtime-2';

const LAST_KEY = 'pixieed:creation:hidden-object:last-draft:v1';
const $ = (selector) => document.querySelector(selector);
const status = $('#hidden-status'); const sourceSelect = $('#hidden-source'); const setup = $('#hidden-setup'); const editor = $('#hidden-editor');
const canvas = $('#hidden-canvas'); const context = canvas.getContext('2d', { alpha: true }); const targetList = $('#hidden-target-list');
const hitPreview = $('#hidden-hit-preview');
const saveButton = $('#hidden-save'); const playLocalButton = $('#hidden-play-local'); const resumeButton = $('#hidden-resume'); const maskSets = new Map(); const COLORS = [[231, 84, 69], [76, 130, 195], [109, 155, 104], [154, 107, 176], [242, 184, 75], [38, 50, 56]];
const publishButton = $('#hidden-publish');
const imageFileInput = $('#hidden-image-file');
const imageSlot = mountPuzzleImageSlot({ host: $('#hidden-image-slot'), input: imageFileInput, onFile: () => { updateStartButton(); }, onError: (error) => setStatus(`画像を選べませんでした：${error.message}`) });
const imageReplaceButton = $('#hidden-image-replace');
let adapter; let store; let sourceDraftId = null; let sourceRevision = null; let draft = null; let draftId = null; let savedConfirmedDraftId = null; let selectedTargetId = null; let editMode = 'paint'; let activePointer = null; let previousPoint = null; let cursorPixel = 0; let drawQueued = false; let totalMaskPixels = 0;
let importingImage = false;
let editorEpoch = 0; let handoffBusy = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let pxdOriginalRefs = null; let pxdPreservedPayload = null; let pxdBridge = null;
const touchPoints = new Map(); let touchStrokeSnapshot = null; let pinchStart = null; let viewScale = 1; let viewPanX = 0; let viewPanY = 0;
const undoStack = []; const redoStack = []; let historyApplying = false; let activeMaskSnapshot = null; let historyPixelCount = 0;

function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function setStatus(value) { status.textContent = value; if (!editor.hidden) $('#hidden-edit-hint').textContent = value; }
function updateStartButton() {
  const loading = imageSlot?.isLoading() === true;
  const hasFile = Boolean(imageSlot?.getFile());
  const hasSource = Boolean(sourceSelect.value);
  const button = $('#hidden-start');
  button.disabled = importingImage || loading || (!hasFile && !hasSource);
  button.textContent = hasFile ? 'この画像で対象を指定' : hasSource ? '保存版で対象を指定' : '対象を指定';
}
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
function updateHistoryControls() {
  const undo = $('#hidden-undo'); const redo = $('#hidden-redo');
  if (!undo || !redo) return;
  undo.disabled = draft?.confirmed || !undoStack.length;
  redo.disabled = draft?.confirmed || !redoStack.length;
  undo.hidden = !draft || draft.confirmed;
  redo.hidden = !draft || draft.confirmed;
}
function recordHistory(entry) {
  if (historyApplying) return;
  while (redoStack.length) { const discarded = redoStack.pop(); historyPixelCount -= historyEntryPixels(discarded); }
  if (entry.kind === 'mask') entry.changes = Uint32Array.from(entry.changes, ({ pixel, before }) => pixel * 2 + Number(before));
  if (entry.kind === 'target') { entry.target = { ...entry.target, pixels: [] }; if (entry.action === 'remove') entry.pixels = Uint32Array.from(entry.pixels); }
  historyPixelCount += historyEntryPixels(entry);
  undoStack.push(entry);
  while (undoStack.length > 100 || historyPixelCount > 262144) historyPixelCount -= historyEntryPixels(undoStack.shift());
  updateHistoryControls();
}
function historyEntryPixels(entry) { return entry.kind === 'mask' ? entry.changes.length : entry.kind === 'target' && entry.action === 'remove' ? entry.pixels.length : 0; }
function applyHistoryEntry(entry, direction) {
  historyApplying = true;
  try {
    if (entry.kind === 'mask') {
      const set = maskSets.get(entry.targetId);
      if (set) for (const encoded of entry.changes) {
        const pixel = encoded >>> 1; const before = Boolean(encoded & 1);
        const present = direction === 'undo' ? before : !before;
        const had = set.has(pixel);
        if (present && !had) { set.add(pixel); totalMaskPixels += 1; }
        else if (!present && had) { set.delete(pixel); totalMaskPixels -= 1; }
      }
    } else if (entry.kind === 'target') {
      const shouldExist = (entry.action === 'add') === (direction === 'redo');
      const index = draft.targets.findIndex((target) => target.id === entry.target.id);
      if (shouldExist && index < 0) {
        draft.targets.splice(Math.min(entry.index, draft.targets.length), 0, { ...entry.target, pixels: [] });
        maskSets.set(entry.target.id, new Set(entry.pixels));
        totalMaskPixels += entry.pixels.length;
      } else if (!shouldExist && index >= 0) {
        totalMaskPixels -= maskSets.get(entry.target.id)?.size || 0;
        draft.targets.splice(index, 1); maskSets.delete(entry.target.id);
      }
      if (entry.action === 'add') selectedTargetId = direction === 'undo' ? entry.selectedBefore : entry.target.id;
      else selectedTargetId = direction === 'undo' ? entry.target.id : (draft.targets[0]?.id || null);
    } else if (entry.kind === 'rename') {
      const target = draft.targets.find(({ id }) => id === entry.targetId);
      if (target) target.name = direction === 'undo' ? entry.before : entry.after;
    }
  } finally { historyApplying = false; }
  renderTargets(); requestDraw(); pxdBridge?.markDirty();
  setStatus(direction === 'undo' ? '直前の編集を元に戻しました。' : '編集をやり直しました。');
}
function undo() { if (draft?.confirmed || !undoStack.length) return; const entry = undoStack.pop(); applyHistoryEntry(entry, 'undo'); redoStack.push(entry); updateHistoryControls(); }
function redo() { if (draft?.confirmed || !redoStack.length) return; const entry = redoStack.pop(); applyHistoryEntry(entry, 'redo'); undoStack.push(entry); updateHistoryControls(); }
function updateLocalPlayButton() {
  const ready = Boolean(draft?.confirmed && draftId && savedConfirmedDraftId === draftId);
  playLocalButton.hidden = !ready; playLocalButton.disabled = !ready;
  publishButton.hidden = !ready; publishButton.disabled = handoffBusy || !ready || !store || !adapter || supabaseConfig.puzzlePublicationEnabled !== true;
  const publishLabel = supabaseConfig.puzzlePublicationEnabled === true ? '投稿する' : '投稿する（準備中）';
  publishButton.querySelector('span').textContent = publishLabel;
  publishButton.setAttribute('aria-label', publishLabel); publishButton.title = supabaseConfig.puzzlePublicationEnabled === true ? 'フィードで内容を確認してから投稿できます' : '投稿は準備中です';
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
  const rename = $('#hidden-rename'); const renameApply = $('#hidden-rename-apply');
  if (rename && document.activeElement !== rename) rename.value = currentTarget()?.name || '';
  if (rename) rename.disabled = draft.confirmed || !currentTarget();
  if (renameApply) renameApply.disabled = draft.confirmed || !currentTarget();
  $('#hidden-new').hidden = !draft.confirmed;
  $('#hidden-edit-targets').hidden = !draft.confirmed;
  $('#hidden-target-settings').hidden = false;
  for (const id of ['hidden-remove', 'hidden-confirm', 'hidden-image-replace']) document.getElementById(id).hidden = draft.confirmed;
  document.querySelectorAll('[data-hidden-mode]').forEach(button => { button.disabled = draft.confirmed || !currentTarget(); });
  saveButton.disabled = !draft;
  updateLocalPlayButton();
  updateHistoryControls();
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
  $('#hidden-share-prompt-text').value = typeof draft?.prompt === 'string' ? draft.prompt : '';
  setup.hidden = true; editor.hidden = false; document.body.classList.add('hidden-object-editing');
  editor.dataset.confirmed = String(Boolean(draft?.confirmed));
  $('#hidden-edit-hint').textContent = '対象を追加 → 選択 → 絵の上をなぞる';
  resetCanvasView(); renderTargets(); requestDraw(); fitCanvas();
}
function installRevision(revision, fixedDraftId, targetModel = null) {
  undoStack.length = 0; redoStack.length = 0; historyPixelCount = 0; activeMaskSnapshot = null;
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
  updateHistoryControls();
}

async function loadSources() {
  sourceSelect.replaceChildren();
  try {
    // もの探し keeps its own picture; versions come from its own draft only.
    const { draftId: ownId, versions: revisions } = await listOwnVersions('hidden-object', { adapter });
    sourceDraftId = ownId;
    if (!revisions.length) { sourceSelect.add(new Option('まだ絵がありません', '')); updateStartButton(); setStatus('画像を選ぶか、ほかのツールで作った自分の絵を持ってこられます。'); return; }
    revisions.forEach((revision, index) => sourceSelect.add(new Option(revisionText(revision, index), revision.revisionId)));
    sourceSelect.value = revisions.at(-1).revisionId;
    updateStartButton();
    setStatus('画像を選んで確認するか、自分の保存版を選んでください。');
  } catch (error) { updateStartButton(); setStatus(error.message); }
}

async function start() {
  if (importingImage || imageSlot?.isLoading()) { updateStartButton(); return; }
  const selectedImage = imageSlot?.getFile();
  if (selectedImage) { await importImageFile(selectedImage); return; }
  const epoch = ++editorEpoch; const sourceId = sourceDraftId;
  try {
    $('#hidden-start').disabled = true; setStatus('元画像の固定版を確認しています…');
    const revision = await resolveLocalDrawRevision(adapter, sourceId, sourceSelect.value);
    if (epoch !== editorEpoch) return;
    pxdBridge?.reset();
    installRevision(revision, sourceId); setStatus('見つけてほしいものの名前を追加し、絵の上をなぞってください。');
  } catch (error) { if (epoch === editorEpoch) setStatus(`開始できませんでした：${error.message}`); }
  finally { updateStartButton(); }
}

async function importImageFile(file) {
  if (!file || importingImage) return;
  if (!adapter || !store) { setStatus('このブラウザーでは端末内保存を利用できません。'); return; }
  const epoch = ++editorEpoch;
  importingImage = true; editor.setAttribute('aria-busy', 'true'); imageSlot?.setBusy(true); saveButton.disabled = true;
  imageReplaceButton.disabled = true; $('#hidden-start').disabled = true; resumeButton.disabled = true;
  setStatus('画像を読み込み、もの探し専用の固定版を作っています…');
  try {
    const decoded = await decodeDrawImageFile(file);
    if (epoch !== editorEpoch) return;
    const originalImage = { width: decoded.width, height: decoded.height, rgba: decoded.data };
    let prepared;
    try {
      prepared = prepareSharedCanvasImage(originalImage, { passActive: false });
    } catch (error) {
      if (error?.code !== 'shared-image-conversion-required') throw error;
      // Build only an in-memory preview. The source file and current draft stay untouched
      // until the creator confirms the normalized working copy.
      prepared = prepareSharedCanvasImage(originalImage, { passActive: false, allowConversion: true });
      if (!prepared.image.rgba.some((value, index) => index % 4 === 3 && value > 0)) throw new RangeError('透明以外の画素がある画像を選んでください。');
      const previewDocument = imageToDrawDocument(prepared.image);
      const accepted = await confirmPxdConversion({
        image: originalImage,
        document: previewDocument,
        title: 'もの探し用の画像を確認',
        applyLabel: 'この作業用コピーを使う',
        message: `${decoded.width}×${decoded.height}pxの原本は変更しません。もの探し用コピーを${prepared.image.width}×${prepared.image.height}px・${prepared.colorCount}色に整えます。`
      });
      if (!accepted || epoch !== editorEpoch) return;
    }
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
    if (epoch === editorEpoch) {
      importingImage = false; editor.removeAttribute('aria-busy'); imageSlot?.setBusy(false); imageReplaceButton.disabled = Boolean(draft?.confirmed); saveButton.disabled = !draft; resumeButton.disabled = false; updateStartButton();
    }
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
  const id = new URLSearchParams(location.search).get('resumeLocal') || readStorage(LAST_KEY); if (!id || !store || !adapter) return;
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
  importingImage = false; imageSlot.clear(); imageSlot.setBusy(false); updateStartButton();
  if (!store || !adapter) throw new Error('端末内保存を利用できません。');
  if (!project.entries.length) { draft = null; $('#hidden-share-prompt-text').value = ''; sourceRevision = null; draftId = null; pxdOriginalRefs = pxdPreservedPayload = null; maskSets.clear(); editor.hidden = true; setup.hidden = false; document.body.classList.remove('hidden-object-editing'); return; }
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
  const selectedBefore = selectedTargetId; const index = draft.targets.length; const target = { id, name, pixels: [] };
  draft.targets.push(target); maskSets.set(id, new Set()); selectedTargetId = id; editMode = 'paint';
  recordHistory({ kind: 'target', action: 'add', target: { ...target }, pixels: [], index, selectedBefore });
  document.querySelectorAll('[data-hidden-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.hiddenMode === 'paint'))); $('#hidden-name').value = ''; renderTargets(); requestDraw(); $('#hidden-target-settings').open = false; canvas.focus({ preventScroll: true }); pxdBridge?.markDirty(); setStatus(`${name}を追加しました。絵の上をなぞってマスクを作ってください。`);
}

function removeTarget() {
  if (!requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  if (!currentTarget() || draft.confirmed) return;
  const target = currentTarget(); const index = draft.targets.indexOf(target); const pixels = [...(maskSets.get(target.id) || [])].sort((a, b) => a - b); const selectedBefore = selectedTargetId;
  totalMaskPixels -= pixels.length; draft.targets = draft.targets.filter((item) => item.id !== target.id); maskSets.delete(target.id); selectedTargetId = draft.targets[0]?.id || null;
  recordHistory({ kind: 'target', action: 'remove', target: { ...target }, pixels, index, selectedBefore });
  renderTargets(); requestDraw(); pxdBridge?.markDirty(); setStatus(`${target.name}を削除しました。`);
}

function setPixel(pixel, { refresh = true, record = true } = {}) {
  if (pixel === null || !currentTarget() || draft.confirmed) return;
  const set = maskSets.get(selectedTargetId); const mode = editMode;
  const wasPresent = set.has(pixel);
  if (mode === 'paint') {
    if (set.has(pixel)) return false;
    if ([...maskSets.entries()].some(([id, other]) => id !== selectedTargetId && other.has(pixel))) { setStatus('別の対象の色が付いた場所です。先にそちらを消してください。'); return false; }
    if (totalMaskPixels >= HIDDEN_OBJECT_MAX_MASK_PIXELS) { setStatus('マスクの保存上限です。余分な画素を消してください。'); return false; }
    set.add(pixel); totalMaskPixels += 1;
  } else { if (!set.delete(pixel)) return false; totalMaskPixels -= 1; }
  if (refresh) { renderTargets(); requestDraw(); }
  if (record) recordHistory({ kind: 'mask', targetId: selectedTargetId, changes: [{ pixel, before: wasPresent }] });
  return true;
}

function commitMaskStroke() {
  if (!activeMaskSnapshot) return;
  const { targetId, pixels: before } = activeMaskSnapshot; const after = maskSets.get(targetId) || new Set();
  const changed = new Set([...before].filter((pixel) => !after.has(pixel)));
  for (const pixel of after) if (!before.has(pixel)) changed.add(pixel);
  activeMaskSnapshot = null;
  if (changed.size) recordHistory({ kind: 'mask', targetId, changes: [...changed].map((pixel) => ({ pixel, before: before.has(pixel) })) });
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
  activeMaskSnapshot = null;
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
  event.preventDefault(); activePointer = event.pointerId; previousPoint = pixel; activeMaskSnapshot = { targetId: selectedTargetId, pixels: new Set(maskSets.get(selectedTargetId)) }; canvas.setPointerCapture(event.pointerId); setPixel(pixel, { record: false });
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
  if (previousPoint === null) changed = setPixel(pixel, { refresh: false, record: false });
  else if (pixel !== previousPoint) linePixels(previousPoint, pixel, (at) => { changed = setPixel(at, { refresh: false, record: false }) || changed; });
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
  if (event.type === 'pointercancel' && activePointer === event.pointerId) {
    if (activeMaskSnapshot) { maskSets.set(activeMaskSnapshot.targetId, activeMaskSnapshot.pixels); totalMaskPixels = [...maskSets.values()].reduce((sum, set) => sum + set.size, 0); activeMaskSnapshot = null; }
    if (touchStrokeSnapshot) cancelTouchStroke();
  }
  if (touchPoints.size < 2) pinchStart = null;
  if (activePointer === event.pointerId) { if (event.type !== 'pointercancel') commitMaskStroke(); activePointer = null; previousPoint = null; renderTargets(); requestDraw(); pxdBridge?.markDirty(); }
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
sourceSelect.addEventListener('change', () => { imageSlot?.clear(); updateStartButton(); });
imageReplaceButton.addEventListener('click', () => {
  if (importingImage) return;
  editorEpoch += 1; imageSlot?.clear(); editor.hidden = true; setup.hidden = false; document.body.classList.remove('hidden-object-editing'); updateStartButton(); imageFileInput.click();
});
imageFileInput.addEventListener('cancel', () => { if (draft && !draft.confirmed) { displayEditor(); setStatus('画像の選択を取り消しました。作成中の内容を続けられます。'); } });
playLocalButton.addEventListener('click', () => { if (draft?.confirmed && draftId && savedConfirmedDraftId === draftId) window.location.assign(`/play/hidden-object/?localHidden=${encodeURIComponent(draftId)}`); });
publishButton.addEventListener('click', async () => {
  if (handoffBusy || !draft?.confirmed || !draftId || savedConfirmedDraftId !== draftId || !store || !adapter || supabaseConfig.puzzlePublicationEnabled !== true) return;
  const id = draftId; const epoch = editorEpoch;
  const isCurrent = () => epoch === editorEpoch && draft?.gameId === id && draftId === id && draft.confirmed === true && savedConfirmedDraftId === id;
  handoffBusy = true; updateLocalPlayButton(); setStatus('フィードの投稿内容を準備しています…');
  try {
    await openPuzzleHandoff({ mode: 'hidden_object', draftId: id, localDraftId: UUID.test(id) ? id : undefined, destination: 'feed', isCurrent, store, adapter });
  } catch (error) {
    handoffBusy = false;
    updateLocalPlayButton();
    if (isCurrent()) { setStatus(`投稿を準備できませんでした：${error.message}`); }
  } finally {
    handoffBusy = false; updateLocalPlayButton();
  }
});
$('#hidden-share-prompt-text').addEventListener('input', (event) => {
  if (!draft || draft.confirmed) return;
  const value = event.currentTarget.value;
  if (value) draft.prompt = value; else delete draft.prompt;
  savedConfirmedDraftId = null;
  saveButton.disabled = false;
  pxdBridge?.markDirty();
  updateLocalPlayButton();
});
$('#hidden-add').addEventListener('click', addTarget); $('#hidden-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addTarget(); } }); $('#hidden-remove').addEventListener('click', removeTarget);
function renameTarget() {
  if (!draft || draft.confirmed || !currentTarget() || !requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  const target = currentTarget(); const before = target.name; const after = $('#hidden-rename').value.trim();
  if (!after) { setStatus('対象の名前を入力してください。'); $('#hidden-rename').focus(); return; }
  if (after === before) return;
  if (draft.targets.some((item) => item.id !== target.id && item.name.trim().toLocaleLowerCase('ja') === after.toLocaleLowerCase('ja'))) { setStatus('対象の名前は重複できません。'); return; }
  target.name = after; recordHistory({ kind: 'rename', targetId: target.id, before, after });
  renderTargets(); pxdBridge?.markDirty(); setStatus(`「${before}」を「${after}」に変更しました。`);
}
$('#hidden-rename-apply').addEventListener('click', renameTarget);
$('#hidden-rename').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); renameTarget(); } });
$('#hidden-undo').addEventListener('click', undo); $('#hidden-redo').addEventListener('click', redo);
applyDrawingToolIcons(document.querySelector('.hidden-tools'));
document.querySelectorAll('[data-hidden-mode]').forEach((button) => button.addEventListener('click', () => { editMode = button.dataset.hiddenMode; document.querySelectorAll('[data-hidden-mode]').forEach((option) => option.setAttribute('aria-pressed', String(option === button))); }));
$('#hidden-confirm').addEventListener('click', async () => {
  if (!requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  const epoch = editorEpoch;
  try { await verifyCurrentSource(); if (epoch !== editorEpoch) return; draft = confirmHiddenObjectTargets(modelWithMasks()); editor.dataset.confirmed = 'true'; $('#hidden-confirmed').hidden = false; renderTargets(); requestDraw(); setStatus(`番号付きの枠が、遊ぶ人に見つけてもらう範囲です。`); await save(); }
  catch (error) { if (epoch === editorEpoch) setStatus(`確定できませんでした：${error.message}`); }
});
$('#hidden-edit-targets').addEventListener('click', async () => {
  if (!draft?.confirmed || !requireSharedCanvasAccess(pxdBridge?.currentProject, setStatus, 'hidden_object')) return;
  draft = { ...draft, confirmed: false, hitBoxes: null, hitTestLayout: null };
  savedConfirmedDraftId = null; editor.dataset.confirmed = 'false'; $('#hidden-confirmed').hidden = true;
  $('#hidden-target-settings').open = false; renderTargets(); requestDraw(); pxdBridge?.markDirty();
  setStatus('正解の編集に戻りました。マスクや対象を変更したら、もう一度正解を確認してください。');
  await save();
});
$('#hidden-new').addEventListener('click', () => { editorEpoch += 1; importingImage = false; imageSlot.clear(); imageSlot.setBusy(false); updateStartButton(); pxdBridge?.reset(); $('#hidden-share-prompt-text').value = ''; draft = null; draftId = null; savedConfirmedDraftId = null; pxdOriginalRefs = null; pxdPreservedPayload = null; sourceRevision = null; selectedTargetId = null; maskSets.clear(); totalMaskPixels = 0; undoStack.length = 0; redoStack.length = 0; historyPixelCount = 0; activeMaskSnapshot = null; editor.hidden = true; setup.hidden = false; document.body.classList.remove('hidden-object-editing'); resetCanvasView(); saveButton.disabled = true; updateLocalPlayButton(); updateHistoryControls(); setStatus('新しいもの探しの元画像を選んでください。'); });

try { adapter = createIndexedDbDraftAdapter(); store = createLocalDraftStore(adapter); } catch { setStatus('このブラウザーでは端末内保存を利用できません。'); }
window.addEventListener('resize', fitCanvas);
resumeButton.hidden = !readStorage(LAST_KEY);
mountPictureShelf($('#hidden-shelf'), { tool: 'hidden-object', adapter, onBrought: async ({ from }) => { await loadSources(); setStatus(`${from.label}の絵を持ってきました。`); }, onError: (error) => setStatus(`持ってこられませんでした：${error.message}`) });
pxdBridge = mountPxdHidden();
const pxdImported = pxdBridge ? await pxdBridge.ready : false;
if (!pxdImported) await loadSources();

// Target controls stay in the dedicated settings sheet.
mountToolHeaderControls(document, { selectors: [] });

mountGameEditorSession({ kind: 'hidden-object', isActive: () => Boolean(draft), isDirty: () => Boolean(pxdBridge?.dirty), workspace: () => pxdBridge });
if (new URLSearchParams(location.search).has('resumeLocal')) await resume();
