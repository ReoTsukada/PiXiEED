import {
  clearStagedDrawImport, createDrawImportController, decodeDrawImportToken,
  parseDrawImportJson, readStagedDrawImport, saveDrawImportAsNewProject,
  stageDrawImportToken
} from './draw-import.mjs?rev=20261116-normal-release-2';
import { CHATGPT_CONNECT_PROMPT, PLUGIN_PUBLICATION, isPluginReviewEstimateCurrent, verifiedMcpEndpoint, verifiedPublicPluginUrl } from './connection-config.mjs?rev=20261117-chat-connect-1';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#art-preview');
const card = $('#preview-card');
const connectionIntro = $('#connection-intro');
const status = $('#receive-status');
const applyButton = $('#open-draw');
const downloadButton = $('#download-png');
const jsonInput = $('#art-json');
const fileInput = $('#art-file');
const loadButton = $('#load-json');
const fallback = $('#manual-import');
const connectionFeedback = $('#connection-feedback');
const promptFeedback = $('#prompt-feedback');
const drawConnectPrompt = $('#draw-connect-prompt');
const drawConnectPromptFeedback = $('#draw-connect-prompt-feedback');
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
  connectionIntro.hidden = false;
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
  connectionIntro.hidden = true;
  fallback.hidden = Boolean(current);
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
const storeUrl = verifiedPublicPluginUrl(PLUGIN_PUBLICATION);
$('.ai-receive__release').hidden = Boolean(storeUrl);
const reviewEstimate = $('#review-estimate');
if (!isPluginReviewEstimateCurrent()) {
  reviewEstimate.textContent = '審査が続いています。一般公開日は未定です。';
}
const storeStatus = $('#plugin-publication-status');
const storeLink = $('#plugin-store-link');
const connectPromptAvailability = $('#draw-connect-prompt-availability');
drawConnectPrompt.value = CHATGPT_CONNECT_PROMPT;
$('#copy-draw-connect-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(CHATGPT_CONNECT_PROMPT);
    drawConnectPromptFeedback.textContent = '接続開始用の依頼文をコピーしました。ChatGPTでPiXiEEDを選んで送信してください。';
    drawConnectPromptFeedback.dataset.state = 'success';
  } catch {
    drawConnectPrompt.select();
    drawConnectPromptFeedback.textContent = 'コピーできませんでした。依頼文を選択してコピーしてください。';
    drawConnectPromptFeedback.dataset.state = 'error';
  }
});
if (storeUrl) {
  storeStatus.textContent = 'ストアで公開されています。';
  storeLink.href = storeUrl;
  storeLink.hidden = false;
  connectPromptAvailability.textContent = '初回はChatGPTにPiXiEEDを追加し、表示される確認と接続許可を完了してください。';
} else {
  storeStatus.textContent = 'ChatGPT連携は現在審査中です。一般公開：審査承認後。';
  storeLink.hidden = true;
  connectPromptAvailability.textContent = 'ストア版は現在審査中です。この依頼文は接続許可画面を使うPiXiEEDを設定済みの方、または一般公開後に利用できます。';
}
const setupSteps = $('.ai-receive__setup-steps');
const connectedUseDetails = $('#connected-use-details');
if (endpoint) {
  $('#mcp-connection-status').textContent = '初回のみ、ChatGPTの設定でPiXiEEDを追加します。';
  $('#mcp-endpoint').value = endpoint;
  setupSteps.hidden = false;
  connectedUseDetails.hidden = false;
  $('#copy-mcp-endpoint').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      connectionFeedback.textContent = '接続先をコピーしました。';
      connectionFeedback.dataset.state = 'success';
    } catch {
      connectionFeedback.textContent = 'コピーできませんでした。上のURL欄を選択してコピーしてください。';
      connectionFeedback.dataset.state = 'error';
    }
  });
  $('#copy-prompt').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#sample-prompt').value);
      promptFeedback.textContent = '依頼文をコピーしました。新しいチャットで貼り付けてください。';
      promptFeedback.dataset.state = 'success';
    } catch {
      promptFeedback.textContent = 'コピーできませんでした。依頼文を選択してコピーしてください。';
      promptFeedback.dataset.state = 'error';
    }
  });
} else {
  $('#mcp-connection-status').textContent = 'PiXiEEDの接続先を表示できません。接続が使えない場合は、下のJSONから読み込めます。';
  setupSteps.hidden = true;
  connectedUseDetails.hidden = true;
}

let fragment = location.hash;
let anchorId = '';
if (fragment.startsWith('#') && fragment.length > 1) {
  try { anchorId = decodeURIComponent(fragment.slice(1)); } catch {}
}
const isPageAnchor = Boolean(anchorId && document.getElementById(anchorId));
const isArtLink = fragment.startsWith('#art=');
if (isArtLink) history.replaceState(null, '', `${location.pathname}${location.search}`);
if (isArtLink) {
  fallback.hidden = false;
  const match = fragment.match(/^#art=([A-Za-z0-9_-]+)$/);
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
} else if (isPageAnchor || !fragment) {
  const staged = isPageAnchor ? null : readStagedDrawImport(sessionStorageRef());
  if (staged) render(staged, { token: staged.token });
  else if (!isPageAnchor) {
    clearStagedDrawImport(sessionStorageRef());
    status.textContent = '受取リンクを開くか、ChatGPTでPiXiEEDを接続して依頼してください。';
    status.dataset.state = 'ready';
    card.hidden = true;
    connectionIntro.hidden = false;
    fallback.hidden = false;
    syncDisabled();
  }
} else {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  clearStagedDrawImport(sessionStorageRef());
  showError(new Error('受取リンクの形式を確認できません。JSONを読み込むか、リンクを作り直してください。'));
}
