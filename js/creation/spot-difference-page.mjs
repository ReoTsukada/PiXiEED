import { createIndexedDbDraftAdapter, createLocalDraftStore } from './local-drafts.mjs';
import { documentRgba } from './draw-core.mjs';
import { detectDifferenceCandidates, excludeDifferenceCandidate, mapClientPointToPixel, mergeDifferenceCandidates, resolveLocalDrawRevision, splitDifferenceCandidate, validateSpotDifferenceDraft, confirmDifferenceCandidates } from './spot-difference-core.mjs?rev=20260927-spot-difference-1';
import { openPuzzleHandoff } from './puzzle-handoff.mjs?rev=20260928-puzzle-handoff-1';
import { mountPxdTools } from './pxd-ui.mjs?rev=20260928-pxd-1';
import { createPxdPuzzleFromMain, hasPxdPuzzle, readPxdPuzzle, materializePxdPuzzle, writePxdPuzzle } from './pxd-puzzles.mjs?rev=20260928-pxd-puzzles-1';

const DRAW_LAST_KEY = 'pixieed.simple-draw.last-draft.v1';
const LAST_KEY = 'pixieed:creation:spot-difference:last-draft:v1';
const $ = (selector) => document.querySelector(selector);
const status = $('#spot-status'); const beforeSelect = $('#spot-before'); const afterSelect = $('#spot-after');
const setup = $('#spot-setup'); const editor = $('#spot-editor'); const canvas = $('#spot-canvas'); const context = canvas.getContext('2d', { alpha: true });
const list = $('#spot-candidates'); const saveButton = $('#spot-save'); const resumeButton = $('#spot-resume');
const playLocalButton = $('#spot-play-local');
const publishButton = $('#spot-publish');
const selectedIds = new Set(); const splitPixels = new Set();
const touchPoints = new Map(); let touchEditSnapshot = null;
let adapter; let store; let draftId = null; let draft = null; let beforeRevision = null; let afterRevision = null; let sourceDraftId = null; let afterDraftId = null; let savedConfirmedDraftId = null;
let pxdOriginalRefs = null; let pxdBridge = null;
let splitMode = false; let activePointer = null; let previousPixel = null; let pinchStart = null; let viewScale = 1; let viewPanX = 0; let viewPanY = 0; let cursorPixel = 0;

function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function message(text) { status.textContent = text; }
function revisionLabel(revision, index) { return `保存版 ${index + 1}・${revision.document.width}×${revision.document.height}px`; }
function reference(draftIdValue, revision) { return { draftId: draftIdValue, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme }; }

function drawPreview() {
  if (!draft || !afterRevision) return;
  const image = documentRgba(afterRevision.document); const pixels = new Uint8ClampedArray(image);
  for (let groupIndex = 0; groupIndex < draft.candidates.length; groupIndex += 1) {
    const color = selectedIds.has(draft.candidates[groupIndex].id) ? [242, 164, 51] : groupIndex % 4 === 0 ? [222, 68, 57] : groupIndex % 4 === 1 ? [35, 113, 180] : groupIndex % 4 === 2 ? [37, 139, 99] : [151, 92, 181];
    for (const pixel of draft.candidates[groupIndex].pixels) {
      const offset = pixel * 4;
      if (splitPixels.has(pixel)) { pixels[offset] = 255; pixels[offset + 1] = 183; pixels[offset + 2] = 0; pixels[offset + 3] = 255; }
      else { pixels[offset] = Math.round((pixels[offset] + color[0]) / 2); pixels[offset + 1] = Math.round((pixels[offset + 1] + color[1]) / 2); pixels[offset + 2] = Math.round((pixels[offset + 2] + color[2]) / 2); pixels[offset + 3] = Math.max(pixels[offset + 3], 190); }
    }
  }
  canvas.width = draft.width; canvas.height = draft.height;
  context.putImageData(new ImageData(pixels, draft.width, draft.height), 0, 0);
  canvas.style.setProperty('--spot-aspect', String(draft.width / draft.height));
  if (document.activeElement === canvas) {
    const x = cursorPixel % draft.width; const y = Math.floor(cursorPixel / draft.width);
    context.save(); context.strokeStyle = '#15251c'; context.lineWidth = Math.max(1, draft.width / 64); context.strokeRect(x, y, 1, 1); context.restore();
  }
}

function renderCandidates() {
  list.replaceChildren();
  draft.candidates.forEach((candidate, index) => {
    const item = document.createElement('li'); const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selectedIds.has(candidate.id); checkbox.value = candidate.id;
    checkbox.setAttribute('aria-label', `候補 ${index + 1} を選ぶ`);
    checkbox.addEventListener('change', () => { checkbox.checked ? selectedIds.add(candidate.id) : selectedIds.delete(candidate.id); splitPixels.clear(); updateActions(); drawPreview(); });
    label.append(checkbox, document.createTextNode(`候補 ${index + 1}・${candidate.pixels.length}画素`)); item.append(label); list.append(item);
  });
  updateActions(); drawPreview();
}
function updateActions() {
  const ids = [...selectedIds].filter((id) => draft?.candidates.some((candidate) => candidate.id === id));
  list.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => { checkbox.checked = selectedIds.has(checkbox.value); });
  if ((ids.length !== 1 || draft?.confirmed) && splitMode) { splitMode = false; $('#spot-split-mode').setAttribute('aria-pressed', 'false'); }
  $('#spot-split-mode').disabled = ids.length !== 1 || Boolean(draft?.confirmed);
  $('#spot-merge').disabled = ids.length < 2 || Boolean(draft?.confirmed);
  $('#spot-split').disabled = ids.length !== 1 || !splitPixels.size || Boolean(draft?.confirmed);
  $('#spot-exclude').disabled = ids.length !== 1 || Boolean(draft?.confirmed);
  $('#spot-confirm').disabled = !draft || !draft.candidates.length || Boolean(draft.confirmed);
  saveButton.disabled = !draft;
  const canPlayLocal = Boolean(draft?.confirmed && savedConfirmedDraftId === draft.gameId);
  playLocalButton.hidden = !canPlayLocal;
  playLocalButton.disabled = !canPlayLocal;
  playLocalButton.disabled = playLocalButton.hidden || !store || !adapter;
  publishButton.hidden = !canPlayLocal;
  publishButton.disabled = !canPlayLocal || !store || !adapter;
}
function showEditor() {
  setup.hidden = true; editor.hidden = false; document.body.classList.add('spot-editing');
  $('#spot-edit-hint').textContent = '色のついた場所をタップして選択 · ピンチで拡大';
  resetCanvasView(); renderCandidates();
}

function applyCanvasView() {
  const zoom = $('#spot-zoom');
  const maxX = Math.max(0, (canvas.clientWidth * viewScale - editor.clientWidth) / 2);
  const maxY = Math.max(0, (canvas.clientHeight * viewScale - editor.clientHeight) / 2);
  viewPanX = Math.min(maxX, Math.max(-maxX, viewPanX)); viewPanY = Math.min(maxY, Math.max(-maxY, viewPanY));
  canvas.style.setProperty('--spot-zoom', String(viewScale));
  canvas.style.setProperty('--spot-pan-x', `${viewPanX}px`);
  canvas.style.setProperty('--spot-pan-y', `${viewPanY}px`);
  zoom.value = `${Math.round(viewScale * 100)}%`; zoom.textContent = zoom.value;
  zoom.dataset.visible = String(viewScale > 1.02);
}

function resetCanvasView() { viewScale = 1; viewPanX = 0; viewPanY = 0; pinchStart = null; touchEditSnapshot = null; touchPoints.clear(); activePointer = null; previousPixel = null; applyCanvasView(); }
function pixelAtEvent(event) { return mapClientPointToPixel(event.clientX, event.clientY, canvas.getBoundingClientRect(), draft.width, draft.height); }
function linePixels(from, to, callback) {
  let x = from % draft.width; let y = Math.floor(from / draft.width); const x1 = to % draft.width; const y1 = Math.floor(to / draft.width);
  const dx = Math.abs(x1 - x); const sx = x < x1 ? 1 : -1; const dy = -Math.abs(y1 - y); const sy = y < y1 ? 1 : -1; let error = dx + dy;
  for (;;) { callback(y * draft.width + x); if (x === x1 && y === y1) break; const twice = 2 * error; if (twice >= dy) { error += dy; x += sx; } if (twice <= dx) { error += dx; y += sy; } }
}

function handleCanvasPixel(pixel) {
  if (pixel === null || !draft || draft.confirmed) return;
  if (splitMode) {
    const id = [...selectedIds][0]; const group = draft.candidates.find((candidate) => candidate.id === id);
    if (selectedIds.size !== 1 || !group?.pixels.includes(pixel)) {
      const nextCandidate = draft.candidates.find((candidate) => candidate.pixels.includes(pixel));
      if (nextCandidate) { selectedIds.clear(); selectedIds.add(nextCandidate.id); splitPixels.clear(); updateActions(); drawPreview(); }
      return;
    }
    splitPixels.has(pixel) ? splitPixels.delete(pixel) : splitPixels.add(pixel);
    updateActions(); drawPreview(); return;
  }
  const candidate = draft.candidates.find((group) => group.pixels.includes(pixel));
  if (!candidate) return;
  selectedIds.clear(); selectedIds.add(candidate.id); splitPixels.clear(); updateActions(); drawPreview();
}

function paintSplitLine(from, to) {
  const id = [...selectedIds][0]; const group = draft.candidates.find((candidate) => candidate.id === id);
  if (selectedIds.size !== 1 || !group) return;
  let changed = false;
  linePixels(from, to, (pixel) => {
    if (!group.pixels.includes(pixel)) return;
    if (!splitPixels.has(pixel)) { splitPixels.add(pixel); changed = true; }
  });
  if (changed) { updateActions(); drawPreview(); }
}

async function loadSourceOptions() {
  beforeSelect.replaceChildren(); afterSelect.replaceChildren();
  const id = readStorage(DRAW_LAST_KEY);
  if (!adapter || !id) { beforeSelect.add(new Option('保存した絵がありません', '')); afterSelect.add(new Option('保存した絵がありません', '')); $('#spot-start').disabled = true; message('先にDrawで絵を端末へ保存してください。'); return; }
  try {
    const record = await adapter.get(id);
    if (!record || record.schemaVersion !== 1 || record.draftId !== id || !Array.isArray(record.revisions)) throw new Error('保存した絵を読み込めません');
    const revisions = record.revisions.filter((revision) => revision?.asset?.kind === 'pixel_art' && revision.asset.owner?.type === 'local' && revision.asset.owner.id === 'local-owner' && revision.asset.visibility === 'draft');
    sourceDraftId = id;
    revisions.forEach((revision, index) => { beforeSelect.add(new Option(revisionLabel(revision, index), revision.revisionId)); afterSelect.add(new Option(revisionLabel(revision, index), revision.revisionId)); });
    if (revisions.length > 1) {
      beforeSelect.value = revisions.at(-2).revisionId;
      afterSelect.value = [...revisions].reverse().find((revision) => revision.revisionId !== beforeSelect.value)?.revisionId || '';
    }
    else afterSelect.selectedIndex = -1;
    $('#spot-start').disabled = revisions.length < 2;
    message(revisions.length < 2 ? '比較するため、Drawで変更後の絵も別の保存版として作ってください。' : '同じ絵の2つの保存版を選んでください。');
  } catch (error) { $('#spot-start').disabled = true; message(error.message); }
}

async function start() {
  try {
    $('#spot-start').disabled = true; message('画像の固定版を確認しています…');
    beforeRevision = await resolveLocalDrawRevision(adapter, sourceDraftId, beforeSelect.value);
    afterRevision = await resolveLocalDrawRevision(adapter, sourceDraftId, afterSelect.value);
    if (beforeRevision.revisionId === afterRevision.revisionId) throw new Error('別々の保存版を選んでください');
    const result = detectDifferenceCandidates(beforeRevision.document, afterRevision.document);
    pxdBridge?.reset();
    draftId = null; savedConfirmedDraftId = null; selectedIds.clear(); splitPixels.clear();
    draft = { schemaVersion: 1, gameId: crypto.randomUUID(), width: result.width, height: result.height, before: reference(sourceDraftId, beforeRevision), after: reference(sourceDraftId, afterRevision), candidates: result.candidates, confirmed: false, publication: 'draft', published: false };
    validateSpotDifferenceDraft(draft);
    $('#spot-source-label').textContent = `元 ${beforeRevision.revisionId.slice(0, 8)} → 変更後 ${afterRevision.revisionId.slice(0, 8)}・固定版`;
    $('#spot-confirmed').hidden = true; saveButton.disabled = false; updateActions(); showEditor();
    message(`${result.candidates.length}個の差分候補を作りました。すべての変更画素を候補に含めています。`);
  } catch (error) { message(`候補を作れませんでした：${error.message}`); }
  finally { $('#spot-start').disabled = false; }
}

async function save() {
  if (!store || !draft) return;
  savedConfirmedDraftId = null; updateActions();
  saveButton.disabled = true; message('端末に保存しています…');
  try {
    const fixedBefore = await resolveLocalDrawRevision(adapter, draft.before.draftId, draft.before.revisionId);
    const fixedAfter = await resolveLocalDrawRevision(adapter, draft.after.draftId, draft.after.revisionId);
    if (JSON.stringify(reference(draft.before.draftId, fixedBefore)) !== JSON.stringify(draft.before) || JSON.stringify(reference(draft.after.draftId, fixedAfter)) !== JSON.stringify(draft.after)) throw new Error('元画像の固定版が一致しません。差分を作り直してください');
    const result = await store.save({ draftId: draft.gameId, kind: 'spot_difference', ownerId: 'local-owner', document: draft, source: { type: 'local_draft_copy', assetId: draft.before.assetId, revisionId: draft.before.revisionId } });
    if (!writeStorage(LAST_KEY, result.document.gameId)) throw new Error('端末の再開用目印を保存できませんでした');
    draftId = result.document.gameId;
    savedConfirmedDraftId = draft.confirmed ? draft.gameId : null;
    message(draft.confirmed ? '作者が正解を確定し、端末内の下書きに保存しました。公開はまだ行われません。' : '未確定の候補を端末に保存しました。公開はされません。');
  } catch (error) { message(`保存できませんでした：${error.message}`); }
  finally { saveButton.disabled = !draft; updateActions(); }
}

async function resume() {
  const id = readStorage(LAST_KEY); if (!id || !store || !adapter) return;
  resumeButton.disabled = true; message('前回の下書きと画像版を確認しています…');
  try {
    const revision = await store.load(id);
    if (!revision || revision.asset.kind !== 'spot_difference' || revision.asset.visibility !== 'draft' || revision.asset.owner.type !== 'local' || revision.asset.owner.id !== 'local-owner') throw new Error('間違い探しの下書きが見つかりません');
    const restored = validateSpotDifferenceDraft(revision.document);
    beforeRevision = await resolveLocalDrawRevision(adapter, restored.before.draftId, restored.before.revisionId);
    afterRevision = await resolveLocalDrawRevision(adapter, restored.after.draftId, restored.after.revisionId);
    if (JSON.stringify(reference(restored.before.draftId, beforeRevision)) !== JSON.stringify(restored.before) || JSON.stringify(reference(restored.after.draftId, afterRevision)) !== JSON.stringify(restored.after)) throw new Error('元画像の固定版が一致しません');
    if (beforeRevision.document.width !== restored.width || beforeRevision.document.height !== restored.height || afterRevision.document.width !== restored.width || afterRevision.document.height !== restored.height) throw new Error('比較画像の寸法が保存した候補と一致しません');
    pxdBridge?.reset();
    draft = restored; draftId = id; sourceDraftId = restored.before.draftId; savedConfirmedDraftId = restored.confirmed ? id : null; selectedIds.clear(); splitPixels.clear();
    $('#spot-source-label').textContent = `元 ${beforeRevision.revisionId.slice(0, 8)} → 変更後 ${afterRevision.revisionId.slice(0, 8)}・固定版`;
    $('#spot-confirmed').hidden = !draft.confirmed; showEditor(); editor.scrollIntoView({ block: 'start' }); message('同じ画像の固定版で前回の作成を再開しました。');
  } catch (error) { message(`再開できませんでした：${error.message}`); }
  finally { resumeButton.disabled = false; }
}

async function openPxdSpot(project) {
  if (!store || !adapter) throw new Error('端末内保存を利用できません。');
  const imported = hasPxdPuzzle(project, 'spot_difference')
    ? await materializePxdPuzzle(await readPxdPuzzle(project, 'spot_difference'), { tool: 'spot_difference', store })
    : await createPxdPuzzleFromMain(project, { tool: 'spot_difference', store });
  const nextBefore = imported.bindings.before.revision; const nextAfter = imported.bindings.after.revision;
  if (nextBefore.document.width !== nextAfter.document.width || nextBefore.document.height !== nextAfter.document.height) throw new Error('PXDの比較画像サイズが一致しません。');
  beforeRevision = nextBefore; afterRevision = nextAfter; sourceDraftId = imported.bindings.before.draftId; afterDraftId = imported.bindings.after.draftId;
  draft = imported.document; draftId = null; savedConfirmedDraftId = null; pxdOriginalRefs = imported.portableOriginalRefs;
  selectedIds.clear(); splitPixels.clear();
  $('#spot-source-label').textContent = `PXD固定画像 · ${draft.width}×${draft.height}px`;
  $('#spot-confirmed').hidden = !draft.confirmed;
  showEditor(); saveButton.disabled = false;
  message(imported.sourceChanged ? 'PXD内の画像が編集されていたため、差分を作り直しました。正解は未確定です。' : imported.document.candidates.length ? 'PXDの間違い探しを端末内の新しい下書きとして開きました。保存後に試遊できます。' : '元画像から空の間違い探しを作りました。PXDメニューの「変更後の絵を描く」で画像を編集してください。');
}

function mountPxdSpot() {
  if (!store) return null;
  return mountPxdTools({
    tool: 'spot_difference', hasContent: () => Boolean(draft), openProject: openPxdSpot,
    getProject: async (project) => draft ? writePxdPuzzle(project, {
      tool: 'spot_difference', document: draft,
      sourceDrawDocuments: { 'spot-before': beforeRevision?.document, 'spot-after': afterRevision?.document },
      portableOriginalRefs: pxdOriginalRefs, sourceChanged: false
    }) : project
  });
}

$('#spot-start').addEventListener('click', start); saveButton.addEventListener('click', save); resumeButton.addEventListener('click', resume);
playLocalButton.addEventListener('click', () => {
  if (!draft?.confirmed || savedConfirmedDraftId !== draft.gameId) return;
  window.location.assign(`/pixfind/?localSpot=${encodeURIComponent(draft.gameId)}`);
});
publishButton.addEventListener('click', async () => {
  if (!draft?.confirmed || savedConfirmedDraftId !== draft.gameId || !store || !adapter) return;
  publishButton.disabled = true; message('固定版と投稿用PNGを確認しています…');
  try { await openPuzzleHandoff({ mode: 'spot_difference', draftId: draft.gameId, store, adapter }); }
  catch (error) { publishButton.disabled = false; message(`投稿を準備できませんでした：${error.message}`); }
});
$('#spot-split-mode').addEventListener('click', (event) => {
  splitMode = !splitMode; event.currentTarget.setAttribute('aria-pressed', String(splitMode));
  $('#spot-edit-hint').textContent = splitMode ? '選んだ候補の中をなぞって分割範囲を指定' : '色のついた場所をタップして選択 · ピンチで拡大';
});
$('#spot-merge').addEventListener('click', () => { try { draft.candidates = mergeDifferenceCandidates(draft.candidates, [...selectedIds], draft.width, draft.height); selectedIds.clear(); splitPixels.clear(); renderCandidates(); message('選んだ候補をまとめました。'); } catch (error) { message(error.message); } });
$('#spot-split').addEventListener('click', () => { try { const id = [...selectedIds][0]; draft.candidates = splitDifferenceCandidate(draft.candidates, id, [...splitPixels], draft.width, draft.height); selectedIds.clear(); splitPixels.clear(); renderCandidates(); message('選んだ画素を別の候補に分けました。'); } catch (error) { message(error.message); } });
$('#spot-exclude').addEventListener('click', () => { try { const id = [...selectedIds][0]; draft.candidates = excludeDifferenceCandidate(draft.candidates, id, draft.width, draft.height); selectedIds.clear(); splitPixels.clear(); renderCandidates(); message('選んだ候補を正解候補から除外しました。'); } catch (error) { message(error.message); } });
$('#spot-confirm').addEventListener('click', async () => { try { draft = confirmDifferenceCandidates(draft); $('#spot-confirmed').hidden = false; updateActions(); await save(); } catch (error) { message(error.message); } });
function cancelTouchEdit() {
  if (!touchEditSnapshot) return;
  selectedIds.clear(); for (const id of touchEditSnapshot.selectedIds) selectedIds.add(id);
  splitPixels.clear(); for (const pixel of touchEditSnapshot.splitPixels) splitPixels.add(pixel);
  splitMode = touchEditSnapshot.splitMode; touchEditSnapshot = null;
  $('#spot-split-mode').setAttribute('aria-pressed', String(splitMode));
  $('#spot-edit-hint').textContent = splitMode ? '選んだ候補の中をなぞって分割範囲を指定' : '色のついた場所をタップして選択 · ピンチで拡大';
  updateActions(); drawPreview();
}
canvas.addEventListener('pointerdown', (event) => {
  if (!draft || draft.confirmed) return;
  if (event.pointerType === 'touch') {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.setPointerCapture(event.pointerId);
    if (touchPoints.size >= 2) {
      cancelTouchEdit();
      activePointer = null; previousPixel = null;
      const [first, second] = [...touchPoints.values()];
      pinchStart = { distance: Math.hypot(second.x - first.x, second.y - first.y) || 1, centerX: (first.x + second.x) / 2, centerY: (first.y + second.y) / 2, scale: viewScale, panX: viewPanX, panY: viewPanY };
      event.preventDefault(); return;
    }
  }
  const pixel = pixelAtEvent(event); if (pixel === null) return;
  if (event.pointerType === 'touch') touchEditSnapshot = { selectedIds: new Set(selectedIds), splitPixels: new Set(splitPixels), splitMode };
  event.preventDefault(); activePointer = event.pointerId; previousPixel = pixel;
  handleCanvasPixel(pixel);
  if (event.pointerType !== 'touch') canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (touchPoints.has(event.pointerId)) {
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size >= 2 && pinchStart) {
      const [first, second] = [...touchPoints.values()]; const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const centerX = (first.x + second.x) / 2; const centerY = (first.y + second.y) / 2;
      viewScale = Math.min(4, Math.max(1, pinchStart.scale * distance / pinchStart.distance));
      const maxX = Math.max(0, (canvas.clientWidth * viewScale - editor.clientWidth) / 2);
      const maxY = Math.max(0, (canvas.clientHeight * viewScale - editor.clientHeight) / 2);
      viewPanX = Math.min(maxX, Math.max(-maxX, pinchStart.panX + centerX - pinchStart.centerX));
      viewPanY = Math.min(maxY, Math.max(-maxY, pinchStart.panY + centerY - pinchStart.centerY));
      applyCanvasView(); event.preventDefault(); return;
    }
  }
  if (activePointer !== event.pointerId || !splitMode || !draft || draft.confirmed) return;
  const pixel = pixelAtEvent(event); if (pixel === null) { previousPixel = null; return; }
  if (previousPixel !== null && pixel !== previousPixel) paintSplitLine(previousPixel, pixel);
  previousPixel = pixel;
});
function finishPointer(event) {
  const wasTouch = touchPoints.delete(event.pointerId);
  if (wasTouch && event.type === 'pointercancel') cancelTouchEdit();
  if (touchPoints.size < 2) pinchStart = null;
  if (wasTouch && touchPoints.size === 0) touchEditSnapshot = null;
  if (activePointer === event.pointerId) { activePointer = null; previousPixel = null; }
}
canvas.addEventListener('pointerup', finishPointer); canvas.addEventListener('pointercancel', finishPointer); canvas.addEventListener('lostpointercapture', finishPointer);
canvas.addEventListener('keydown', (event) => {
  if (!draft || draft.confirmed) return;
  const x = cursorPixel % draft.width; const y = Math.floor(cursorPixel / draft.width); let nextX = x; let nextY = y;
  if (event.key === 'ArrowLeft') nextX = Math.max(0, x - 1); else if (event.key === 'ArrowRight') nextX = Math.min(draft.width - 1, x + 1);
  else if (event.key === 'ArrowUp') nextY = Math.max(0, y - 1); else if (event.key === 'ArrowDown') nextY = Math.min(draft.height - 1, y + 1);
  else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); handleCanvasPixel(cursorPixel); return; } else return;
  event.preventDefault(); cursorPixel = nextY * draft.width + nextX; drawPreview();
});
canvas.addEventListener('focus', drawPreview); canvas.addEventListener('blur', drawPreview);
window.addEventListener('resize', applyCanvasView);

try { adapter = createIndexedDbDraftAdapter(); store = createLocalDraftStore(adapter); } catch { message('このブラウザーでは端末内保存を利用できません。'); }
resumeButton.hidden = !readStorage(LAST_KEY);
pxdBridge = mountPxdSpot();
const pxdImported = pxdBridge ? await pxdBridge.ready : false;
if (!pxdImported) await loadSourceOptions();
