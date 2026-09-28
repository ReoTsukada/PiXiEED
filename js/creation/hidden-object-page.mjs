import { listOwnVersions, mountPictureShelf } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { snapToWholePixels } from '../pixel-scale.mjs?v=20260928-pixel-scale-1';
import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { documentRgba } from './draw-core.mjs';
import { HIDDEN_OBJECT_MAX_MASK_PIXELS, confirmHiddenObjectTargets, createHiddenObjectDraft, mapClientPointToPixel, resolveLocalDrawRevision, validateHiddenObjectDraft } from './hidden-object-core.mjs?rev=20260928-short-hitboxes-1';
import { openPuzzleHandoff } from './puzzle-handoff.mjs?rev=20260928-puzzle-handoff-1';
import { mountPxdTools } from './pxd-ui.mjs?rev=20260928-own-work-1';
import { createPxdPuzzleFromMain, hasPxdPuzzle, readPxdPuzzle, materializePxdPuzzle, writePxdPuzzle } from './pxd-puzzles.mjs?rev=20260928-pxd-puzzles-1';

const LAST_KEY = 'pixieed:creation:hidden-object:last-draft:v1';
const $ = (selector) => document.querySelector(selector);
const status = $('#hidden-status'); const sourceSelect = $('#hidden-source'); const setup = $('#hidden-setup'); const editor = $('#hidden-editor');
const canvas = $('#hidden-canvas'); const context = canvas.getContext('2d', { alpha: true }); const targetList = $('#hidden-target-list');
const saveButton = $('#hidden-save'); const playLocalButton = $('#hidden-play-local'); const resumeButton = $('#hidden-resume'); const maskSets = new Map(); const COLORS = [[231, 84, 69], [76, 130, 195], [109, 155, 104], [154, 107, 176], [242, 184, 75], [38, 50, 56]];
const publishButton = $('#hidden-publish');
let adapter; let store; let sourceDraftId = null; let sourceRevision = null; let draft = null; let draftId = null; let savedConfirmedDraftId = null; let selectedTargetId = null; let editMode = 'paint'; let activePointer = null; let previousPoint = null; let cursorPixel = 0; let drawQueued = false; let totalMaskPixels = 0;
let pxdOriginalRefs = null; let pxdPreservedPayload = null; let pxdBridge = null;
const touchPoints = new Map(); let touchStrokeSnapshot = null; let pinchStart = null; let viewScale = 1; let viewPanX = 0; let viewPanY = 0;

function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function setStatus(value) { status.textContent = value; }
function sourceRef(draftIdValue, revision) { return { draftId: draftIdValue, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme }; }
async function verifyCurrentSource() {
  const fixed = await resolveLocalDrawRevision(adapter, draft.source.draftId, draft.source.revisionId);
  if (JSON.stringify(sourceRef(draft.source.draftId, fixed)) !== JSON.stringify(draft.source)) throw new Error('元画像の固定版または利用許可が一致しません');
  sourceRevision = fixed;
  return fixed;
}
function revisionText(revision, index) { return `保存版 ${index + 1}・${revision.document.width}×${revision.document.height}px`; }
function currentTarget() { return draft?.targets.find((target) => target.id === selectedTargetId) || null; }
function updateLocalPlayButton() {
  const ready = Boolean(draft?.confirmed && draftId && savedConfirmedDraftId === draftId);
  playLocalButton.hidden = !ready; playLocalButton.disabled = !ready;
  publishButton.hidden = !ready; publishButton.disabled = !ready || !store || !adapter;
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
}

function renderTargets() {
  targetList.replaceChildren();
  draft.targets.forEach((target, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.targetId = target.id; button.dataset.maskEmpty = String(!(maskSets.get(target.id)?.size)); button.setAttribute('aria-pressed', String(target.id === selectedTargetId)); button.disabled = draft.confirmed;
    button.textContent = `${target.name} · ${maskSets.get(target.id)?.size || 0}px`;
    button.setAttribute('aria-label', `対象 ${index + 1} ${target.name}、マスク ${maskSets.get(target.id)?.size || 0}画素${target.id === selectedTargetId ? '、選択中' : ''}`);
    button.addEventListener('click', () => { selectedTargetId = target.id; $('#hidden-remove').disabled = draft.confirmed; renderTargets(); requestDraw(); });
    targetList.append(button);
  });
  $('#hidden-remove').disabled = draft.confirmed || !currentTarget();
  $('#hidden-confirm').disabled = draft.confirmed || !draft.targets.length || draft.targets.some((target) => !(maskSets.get(target.id)?.size));
  $('#hidden-add').disabled = draft.confirmed; $('#hidden-name').disabled = draft.confirmed;
  saveButton.disabled = !draft;
  updateLocalPlayButton();
  updateSummary();
}

function updateSummary() {
  $('#hidden-mask-summary').textContent = `${draft.targets.length}個の対象・マスク合計 ${totalMaskPixels.toLocaleString('ja-JP')}画素（保存上限 ${HIDDEN_OBJECT_MAX_MASK_PIXELS.toLocaleString('ja-JP')}画素）`;
}

function applyCanvasView() {
  const zoom = $('#hidden-zoom');
  canvas.style.setProperty('--hidden-zoom', String(viewScale));
  canvas.style.setProperty('--hidden-pan-x', `${viewPanX}px`);
  canvas.style.setProperty('--hidden-pan-y', `${viewPanY}px`);
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
}
function resetCanvasView() { viewScale = 1; viewPanX = 0; viewPanY = 0; pinchStart = null; touchStrokeSnapshot = null; activePointer = null; previousPoint = null; touchPoints.clear(); applyCanvasView(); }
function displayEditor() {
  setup.hidden = true; editor.hidden = false; document.body.classList.add('hidden-object-editing');
  $('#hidden-edit-hint').textContent = 'なぞって指定 · ピンチで拡大';
  resetCanvasView(); renderTargets(); requestDraw(); fitCanvas();
}
function installRevision(revision, fixedDraftId, targetModel = null) {
  sourceDraftId = fixedDraftId; sourceRevision = revision;
  savedConfirmedDraftId = null;
  cursorPixel = 0;
  if (targetModel) {
    draft = validateHiddenObjectDraft(targetModel); draftId = draft.gameId;
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
    if (!revisions.length) { sourceSelect.add(new Option('まだ絵がありません', '')); $('#hidden-start').disabled = true; setStatus('上の「持ってくる」から絵を選んでください。'); return; }
    revisions.forEach((revision, index) => sourceSelect.add(new Option(revisionText(revision, index), revision.revisionId)));
    sourceSelect.value = revisions.at(-1).revisionId;
    $('#hidden-start').disabled = false;
    setStatus('絵を選んで、見つけてほしいものを指定してください。');
  } catch (error) { $('#hidden-start').disabled = true; setStatus(error.message); }
}

async function start() {
  try {
    $('#hidden-start').disabled = true; setStatus('元画像の固定版を確認しています…');
    const revision = await resolveLocalDrawRevision(adapter, sourceDraftId, sourceSelect.value);
    pxdBridge?.reset();
    installRevision(revision, sourceDraftId); setStatus('見つけてほしいものの名前を追加し、絵の上をなぞってください。');
  } catch (error) { setStatus(`開始できませんでした：${error.message}`); }
  finally { $('#hidden-start').disabled = false; }
}

function modelWithMasks() {
  return { ...draft, targets: draft.targets.map((target) => ({ ...target, pixels: [...(maskSets.get(target.id) || [])].sort((a, b) => a - b) })) };
}

async function save() {
  if (!store || !draft) return;
  savedConfirmedDraftId = null; updateLocalPlayButton();
  saveButton.disabled = true; setStatus('端末に保存しています…');
  try {
    await verifyCurrentSource();
    const document = validateHiddenObjectDraft(modelWithMasks());
    const result = await store.save({ draftId: document.gameId, kind: 'hidden_object', ownerId: 'local-owner', document, source: { type: 'local_draft_copy', assetId: document.source.assetId, revisionId: document.source.revisionId } });
    draft = result.document; draftId = document.gameId;
    if (!writeStorage(LAST_KEY, draftId)) throw new Error('再開用の目印を端末に保存できませんでした');
    if (draft.confirmed) savedConfirmedDraftId = draftId;
    setStatus(draft.confirmed ? '作者指定の正解マスクを端末内の下書きに保存しました。公開はされません。' : 'マスクを端末内の下書きに保存しました。公開はされません。');
  } catch (error) { setStatus(`保存できませんでした：${error.message}`); }
  finally { saveButton.disabled = !draft; updateLocalPlayButton(); }
}

async function resume() {
  const id = readStorage(LAST_KEY); if (!id || !store || !adapter) return;
  resumeButton.disabled = true; setStatus('前回の下書きと固定版を確認しています…');
  try {
    const revision = await store.load(id);
    if (!revision || revision.asset.kind !== 'hidden_object' || revision.asset.visibility !== 'draft' || revision.asset.owner.type !== 'local' || revision.asset.owner.id !== 'local-owner') throw new Error('もの探しの下書きが見つかりません');
    const saved = validateHiddenObjectDraft(revision.document);
    const fixed = await resolveLocalDrawRevision(adapter, saved.source.draftId, saved.source.revisionId);
    if (JSON.stringify(sourceRef(saved.source.draftId, fixed)) !== JSON.stringify(saved.source) || fixed.document.width !== saved.width || fixed.document.height !== saved.height) throw new Error('元画像の固定版が一致しません');
    pxdBridge?.reset();
    installRevision(fixed, saved.source.draftId, saved); editor.scrollIntoView({ block: 'start' }); setStatus('前回のマスクを、同じ元画像の固定版で再開しました。');
    if (saved.confirmed) { savedConfirmedDraftId = id; updateLocalPlayButton(); }
  } catch (error) { setStatus(`再開できませんでした：${error.message}`); }
  finally { resumeButton.disabled = false; }
}

async function openPxdHidden(project) {
  if (!store || !adapter) throw new Error('端末内保存を利用できません。');
  const imported = hasPxdPuzzle(project, 'hidden_object')
    ? await materializePxdPuzzle(await readPxdPuzzle(project, 'hidden_object'), { tool: 'hidden_object', store })
    : await createPxdPuzzleFromMain(project, { tool: 'hidden_object', store });
  pxdOriginalRefs = imported.portableOriginalRefs; pxdPreservedPayload = imported.preservedPayload || null;
  installRevision(imported.bindings.source.revision, imported.bindings.source.draftId, imported.document);
  draftId = null; savedConfirmedDraftId = null;
  setStatus(imported.sourceChanged ? 'PXD内の元画像が変わったため、対象は残して正解を未確定にしました。' : imported.document.targets.length ? 'PXDのもの探しを端末内の新しい下書きとして開きました。保存後に試遊できます。' : 'PXDの元画像から空のもの探しを作りました。対象を追加し、マスクを指定してください。');
}

function mountPxdHidden() {
  if (!store) return null;
  return mountPxdTools({
    tool: 'hidden_object', hasContent: () => Boolean(draft), openProject: openPxdHidden,
    getProject: async (project) => draft && sourceRevision ? writePxdPuzzle(project, {
      tool: 'hidden_object', document: modelWithMasks(), sourceDrawDocuments: { hidden: sourceRevision.document },
      portableOriginalRefs: pxdOriginalRefs, preservedPayload: pxdPreservedPayload, sourceChanged: false
    }) : project
  });
}

function addTarget() {
  if (!draft || draft.confirmed) return;
  const name = $('#hidden-name').value.trim();
  if (!name) { setStatus('見つけるものの名前を入力してください。'); $('#hidden-name').focus(); return; }
  if (draft.targets.some((target) => target.name.trim().toLocaleLowerCase('ja') === name.toLocaleLowerCase('ja'))) { setStatus('対象の名前は重複できません。'); return; }
  if (draft.targets.length >= 128) { setStatus('対象は128個までです。'); return; }
  let suffix = draft.targets.length + 1; let id = `target-${String(suffix).padStart(3, '0')}`; const ids = new Set(draft.targets.map((target) => target.id)); while (ids.has(id)) id = `target-${String(++suffix).padStart(3, '0')}`;
  draft.targets.push({ id, name, pixels: [] }); maskSets.set(id, new Set()); selectedTargetId = id; $('#hidden-name').value = ''; renderTargets(); requestDraw(); setStatus(`${name}を追加しました。絵の上をなぞってマスクを作ってください。`);
  document.querySelector('.hidden-settings').open = false;
}

function removeTarget() {
  if (!currentTarget() || draft.confirmed) return;
  const name = currentTarget().name; totalMaskPixels -= maskSets.get(selectedTargetId)?.size || 0; draft.targets = draft.targets.filter((target) => target.id !== selectedTargetId); maskSets.delete(selectedTargetId); selectedTargetId = draft.targets[0]?.id || null; renderTargets(); requestDraw(); setStatus(`${name}を削除しました。`);
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
  if (!draft || draft.confirmed) return;
  if (event.pointerType === 'touch') {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (touchPoints.size >= 2) {
      cancelTouchStroke();
      activePointer = null; previousPoint = null;
      const [first, second] = [...touchPoints.values()];
      pinchStart = { distance: Math.hypot(second.x - first.x, second.y - first.y) || 1, centerX: (first.x + second.x) / 2, centerY: (first.y + second.y) / 2, scale: viewScale, panX: viewPanX, panY: viewPanY };
      event.preventDefault(); return;
    }
  }
  if (!currentTarget()) { setStatus('先に名前を付けた対象を選んでください。'); return; }
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
      viewScale = Math.min(4, Math.max(1, pinchStart.scale * distance / pinchStart.distance));
      const maxX = Math.max(0, (canvas.clientWidth * viewScale - editor.clientWidth) / 2);
      const maxY = Math.max(0, (canvas.clientHeight * viewScale - editor.clientHeight) / 2);
      viewPanX = Math.min(maxX, Math.max(-maxX, pinchStart.panX + centerX - pinchStart.centerX));
      viewPanY = Math.min(maxY, Math.max(-maxY, pinchStart.panY + centerY - pinchStart.centerY));
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
function finishPointer(event) {
  const wasTouch = touchPoints.delete(event.pointerId);
  if (wasTouch && event.type === 'pointercancel') cancelTouchStroke();
  if (touchPoints.size < 2) pinchStart = null;
  if (activePointer === event.pointerId) { activePointer = null; previousPoint = null; renderTargets(); requestDraw(); }
  if (wasTouch && touchPoints.size === 0) { touchStrokeSnapshot = null; renderTargets(); requestDraw(); }
}
canvas.addEventListener('pointerup', finishPointer); canvas.addEventListener('pointercancel', finishPointer);
canvas.addEventListener('keydown', (event) => {
  if (!draft || draft.confirmed) return;
  const x = cursorPixel % draft.width; const y = Math.floor(cursorPixel / draft.width); let nextX = x; let nextY = y;
  if (event.key === 'ArrowLeft') nextX = Math.max(0, x - 1); else if (event.key === 'ArrowRight') nextX = Math.min(draft.width - 1, x + 1); else if (event.key === 'ArrowUp') nextY = Math.max(0, y - 1); else if (event.key === 'ArrowDown') nextY = Math.min(draft.height - 1, y + 1); else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setPixel(cursorPixel); return; } else return;
  event.preventDefault(); cursorPixel = nextY * draft.width + nextX; requestDraw();
});
canvas.addEventListener('focus', requestDraw); canvas.addEventListener('blur', requestDraw);

$('#hidden-start').addEventListener('click', start); saveButton.addEventListener('click', save); resumeButton.addEventListener('click', resume);
playLocalButton.addEventListener('click', () => { if (draft?.confirmed && draftId && savedConfirmedDraftId === draftId) window.location.assign(`/play/hidden-object/?localHidden=${encodeURIComponent(draftId)}`); });
publishButton.addEventListener('click', async () => {
  if (!draft?.confirmed || !draftId || savedConfirmedDraftId !== draftId || !store || !adapter) return;
  publishButton.disabled = true; setStatus('固定版と投稿用PNGを確認しています…');
  try { await openPuzzleHandoff({ mode: 'hidden_object', draftId, store, adapter }); }
  catch (error) { publishButton.disabled = false; setStatus(`投稿を準備できませんでした：${error.message}`); }
});
$('#hidden-add').addEventListener('click', addTarget); $('#hidden-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addTarget(); } }); $('#hidden-remove').addEventListener('click', removeTarget);
document.querySelectorAll('[data-hidden-mode]').forEach((button) => button.addEventListener('click', () => { editMode = button.dataset.hiddenMode; document.querySelectorAll('[data-hidden-mode]').forEach((option) => option.setAttribute('aria-pressed', String(option === button))); }));
$('#hidden-confirm').addEventListener('click', async () => {
  try { await verifyCurrentSource(); draft = confirmHiddenObjectTargets(modelWithMasks()); $('#hidden-confirmed').hidden = false; renderTargets(); setStatus(`作者指定の${draft.targets.length}対象を確定しました。短い画面でも押せる正解範囲を確保しました。`); await save(); }
  catch (error) { setStatus(`確定できませんでした：${error.message}`); }
});
$('#hidden-new').addEventListener('click', () => { pxdBridge?.reset(); draft = null; draftId = null; savedConfirmedDraftId = null; pxdOriginalRefs = null; pxdPreservedPayload = null; sourceRevision = null; selectedTargetId = null; maskSets.clear(); totalMaskPixels = 0; editor.hidden = true; setup.hidden = false; document.body.classList.remove('hidden-object-editing'); resetCanvasView(); saveButton.disabled = true; updateLocalPlayButton(); setStatus('新しいもの探しの元画像を選んでください。'); });

try { adapter = createIndexedDbDraftAdapter(); store = createLocalDraftStore(adapter); } catch { setStatus('このブラウザーでは端末内保存を利用できません。'); }
window.addEventListener('resize', fitCanvas);
resumeButton.hidden = !readStorage(LAST_KEY);
mountPictureShelf($('#hidden-shelf'), { tool: 'hidden-object', adapter, onBrought: async ({ from }) => { await loadSources(); setStatus(`${from.label}の絵を持ってきました。`); }, onError: (error) => setStatus(`持ってこられませんでした：${error.message}`) });
pxdBridge = mountPxdHidden();
const pxdImported = pxdBridge ? await pxdBridge.ready : false;
if (!pxdImported) await loadSources();
