import {
  clearStagedDrawImport, createDrawImportController, decodeDrawImportToken,
  parseDrawImportJson, readStagedDrawImport, saveDrawImportAsNewProject,
  stageDrawImportToken
} from './draw-import.mjs?rev=20261114-mcp-1';
import { verifiedMcpEndpoint } from './connection-config.mjs?rev=20261114-mcp-1';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#art-preview');
const card = $('#preview-card');
const status = $('#receive-status');
const applyButton = $('#open-draw');
const downloadButton = $('#download-png');
const jsonInput = $('#art-json');
const fileInput = $('#art-file');
const loadButton = $('#load-json');
const fallback = $('#manual-import');
let current = null;
let controller = null;
let saving = false;
let readingFile = false;
let generation = 0;

function sessionStorageRef() { try { return globalThis.sessionStorage; } catch { return null; } }

function syncDisabled() {
  const busy = saving || readingFile;
  for (const control of [jsonInput, fileInput, loadButton]) control.disabled = busy;
  applyButton.disabled = busy || !controller;
  downloadButton.disabled = busy || !current;
}

function showError(error) {
  current = null;
  controller = null;
  status.textContent = error?.message || 'データを読み込めませんでした。';
  status.dataset.state = 'error';
  card.hidden = true;
  fallback.hidden = false;
  syncDisabled();
}

function render(decoded, { token = null, persistForRefresh = false } = {}) {
  const { art, rgba } = decoded;
  canvas.width = rgba.width; canvas.height = rgba.height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('プレビューを表示できません。');
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), rgba.width, rgba.height), 0, 0);
  $('#art-title').textContent = art.title;
  $('#art-dimensions').textContent = `${rgba.width} × ${rgba.height}px`;
  current = { art, rgba };
  controller = createDrawImportController({
    art,
    save: async (value) => {
      const result = await saveDrawImportAsNewProject(value);
      clearStagedDrawImport(sessionStorageRef());
      return result;
    }
  });
  card.hidden = false;
  fallback.hidden = Boolean(token);
  let stageWarning = false;
  if (persistForRefresh && token) {
    try { stageDrawImportToken(sessionStorageRef(), token); }
    catch { stageWarning = true; }
  } else if (!token) clearStagedDrawImport(sessionStorageRef());
  status.textContent = stageWarning
    ? 'プレビューは表示しています。端末の一時保存が使えないため、再読み込み後には復元されない場合があります。'
    : 'プレビューを確認してください。適用するまで作品は保存されません。';
  status.dataset.state = stageWarning ? 'warning' : 'ready';
  syncDisabled();
}

async function apply() {
  if (!controller || saving || readingFile) return;
  generation += 1;
  saving = true; syncDisabled();
  status.textContent = '新しい作品をこのブラウザーに保存しています。';
  status.dataset.state = 'saving';
  try {
    await controller.apply();
    status.textContent = '作品を保存しました。Drawを開いています。';
  } catch (error) {
    status.textContent = `保存できませんでした。データはこの画面に残っています。${error?.message ? ` ${error.message}` : ''}`;
    status.dataset.state = 'error';
  } finally { saving = false; syncDisabled(); }
}

function acceptJson(text) {
  generation += 1;
  clearStagedDrawImport(sessionStorageRef());
  try { render(parseDrawImportJson(text)); }
  catch (error) { showError(error); }
}

async function downloadPng() {
  if (!current || saving || readingFile) return;
  try {
    const output = document.createElement('canvas');
    output.width = current.rgba.width; output.height = current.rgba.height;
    const context = output.getContext('2d', { alpha: true });
    if (!context) throw new Error('PNGを書き出せませんでした。');
    context.putImageData(new ImageData(new Uint8ClampedArray(current.rgba.data), output.width, output.height), 0, 0);
    const blob = await new Promise((resolve, reject) => output.toBlob((value) => value ? resolve(value) : reject(new Error('PNGを書き出せませんでした。')), 'image/png'));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'pixieed-ai-pixel-art.png'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'PNGをダウンロードしました。'; status.dataset.state = 'ready';
  } catch (error) { status.textContent = error?.message || 'PNGを書き出せませんでした。'; status.dataset.state = 'error'; }
}

applyButton.addEventListener('click', apply);
downloadButton.addEventListener('click', downloadPng);
loadButton.addEventListener('click', () => acceptJson(jsonInput.value));
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  clearStagedDrawImport(sessionStorageRef());
  if (file.size > 64 * 1024) { showError(new Error('JSONファイルは64KB以内にしてください。')); return; }
  const ticket = ++generation;
  readingFile = true; syncDisabled();
  try {
    const text = await file.text();
    if (ticket === generation) {
      try { render(parseDrawImportJson(text)); }
      catch (error) { showError(error); }
    }
  } catch { if (ticket === generation) showError(new Error('JSONファイルを読み込めませんでした。')); }
  finally { readingFile = false; fileInput.value = ''; syncDisabled(); }
});
$('#cancel-import').addEventListener('click', (event) => {
  if (saving || readingFile) { event.preventDefault(); return; }
  generation += 1;
  clearStagedDrawImport(sessionStorageRef());
});

const endpoint = verifiedMcpEndpoint();
$('#mcp-connection').hidden = false;
if (endpoint) {
  $('#mcp-connection-status').textContent = 'ChatGPTのカスタムMCPに接続先URLを登録してください。';
  $('#mcp-endpoint').textContent = endpoint;
  $('#mcp-endpoint').hidden = false;
  const copyButton = $('#copy-mcp-endpoint');
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(endpoint); status.textContent = '接続先をコピーしました。'; }
    catch { status.textContent = 'コピーできませんでした。接続先を選択してコピーしてください。'; }
  });
} else {
  $('#mcp-connection-status').textContent = 'ChatGPTとの接続は準備中です。JSONからの受け取りは利用できます。';
}

let fragment = location.hash;
if (fragment) history.replaceState(null, '', `${location.pathname}${location.search}`);
if (fragment) {
  fallback.hidden = false;
  const match = fragment.match(/^#art=([A-Za-z0-9_-]+)$/);
  fragment = '';
  if (!match) {
    clearStagedDrawImport(sessionStorageRef());
    showError(new Error('受取リンクの形式を確認できません。JSONを読み込むか、リンクを作り直してください。'));
  }
  else {
    try {
      const decoded = decodeDrawImportToken(match[1]);
      render(decoded, { token: match[1], persistForRefresh: true });
    } catch (error) { clearStagedDrawImport(sessionStorageRef()); showError(error); }
  }
} else {
  const staged = readStagedDrawImport(sessionStorageRef());
  if (staged) render(staged, { token: staged.token });
  else {
    clearStagedDrawImport(sessionStorageRef());
    status.textContent = '受取リンクを開くか、ChatGPTでPiXiEEDを接続して依頼してください。';
    status.dataset.state = 'ready';
    card.hidden = true;
    fallback.hidden = false;
    syncDisabled();
  }
}
