import { adminConfig } from '../data/admin-config.js';

const root = document.querySelector('[data-admin-root]');
const state = { accessToken: '', user: null, sheets: new Map(), analytics: [] };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
}

function isConfigured() {
  return Boolean(adminConfig.googleOAuthClientId && adminConfig.spreadsheetId && adminConfig.adminEmail);
}

function setStatus(message, type = '') {
  const status = root?.querySelector('[data-admin-status]');
  if (!status) return;
  status.textContent = message;
  status.className = `admin-status ${type ? `admin-status--${type}` : ''}`;
}

function renderSetup() {
  root.innerHTML = `
    <section class="admin-card admin-card--hero">
      <span class="eyebrow">PiXiEED private workspace</span>
      <h1>PiXiEED管理室</h1>
      <p class="lead">公開サイトの作品・店舗・地図・アクセス情報を、ここから管理します。</p>
      <div class="admin-notice"><strong>接続設定が必要です。</strong><span>Google OAuthクライアントID、GoogleスプレッドシートID、管理者メールアドレスを設定するとログインできます。</span></div>
      <ol class="admin-steps"><li>Googleスプレッドシートを作成</li><li>Google CloudでOAuthクライアントを作成</li><li><code>data/admin-config.js</code>を設定</li><li>Googleアカウントでログイン</li></ol>
    </section>`;
}

function renderLogin() {
  root.innerHTML = `
    <section class="admin-card admin-card--hero admin-card--login">
      <span class="eyebrow">private access</span>
      <h1>PiXiEED管理室</h1>
      <p>管理者アカウントでログインしてください。公開サイトの訪問者には、この画面への導線を表示しません。</p>
      <button class="button button--primary" type="button" data-admin-login>Googleアカウントでログイン</button>
      <p class="admin-status" data-admin-status role="status"></p>
    </section>`;
  root.querySelector('[data-admin-login]').addEventListener('click', requestAccessToken);
}

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
}

async function requestAccessToken() {
  setStatus('Googleログインを準備しています。');
  try {
    await loadGoogleIdentity();
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: adminConfig.googleOAuthClientId,
      scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets',
      callback: async (response) => {
        if (response.error) {
          setStatus('ログインを完了できませんでした。', 'error');
          return;
        }
        state.accessToken = response.access_token;
        await verifyAdmin();
      }
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } catch {
    setStatus('Googleログインの読み込みに失敗しました。', 'error');
  }
}

async function verifyAdmin() {
  try {
    const response = await apiFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const user = await response.json();
    if (user.email?.toLowerCase() !== adminConfig.adminEmail.toLowerCase()) {
      state.accessToken = '';
      setStatus('このGoogleアカウントには管理権限がありません。', 'error');
      return;
    }
    state.user = user;
    await renderDashboard();
  } catch {
    setStatus('アカウント情報を確認できませんでした。', 'error');
  }
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${state.accessToken}`);
  headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response;
}

function sheetsUrl(path) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(adminConfig.spreadsheetId)}${path}`;
}

async function readSheet(sheetName) {
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  const response = await apiFetch(sheetsUrl(`/values/${range}?majorDimension=ROWS`));
  const data = await response.json();
  const values = data.values || [];
  return { sheetName, values };
}

function columnName(number) {
  let value = number;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result || 'A';
}

function getRows(values) {
  const headers = values[0] || [];
  return { headers, rows: values.slice(1).map((row) => headers.map((_, index) => row[index] || '')) };
}

function renderDashboard() {
  root.innerHTML = `
    <div class="admin-welcome"><div><span class="eyebrow">private workspace</span><h1>管理室</h1><p>${escapeHtml(state.user.email)} でログイン中</p></div><button class="button button--quiet" type="button" data-admin-refresh>再読み込み</button></div>
    <p class="admin-status" data-admin-status role="status"></p>
    <section class="admin-metrics" data-admin-metrics><div class="admin-card admin-metric"><span>訪問者</span><strong>—</strong></div><div class="admin-card admin-metric"><span>ページ閲覧</span><strong>—</strong></div><div class="admin-card admin-metric"><span>QRスキャン</span><strong>—</strong></div><div class="admin-card admin-metric"><span>いいね</span><strong>—</strong></div></section>
    <section class="admin-card"><div class="admin-section-heading"><div><span class="eyebrow">insights</span><h2>役立つ情報</h2></div><p>日々の反応を、作品・店舗・QR単位で確認できます。</p></div><div class="admin-insights" data-admin-insights><p>読み込み中です。</p></div></section>
    <section class="admin-card"><div class="admin-section-heading"><div><span class="eyebrow">data editor</span><h2>データ編集</h2></div><a class="text-link" href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(adminConfig.spreadsheetId)}/edit" target="_blank" rel="noopener">スプレッドシートを開く ↗</a></div><div class="admin-editor-toolbar"><label>編集する表<select data-sheet-selector><option value="${adminConfig.sheets.works}">作品</option><option value="${adminConfig.sheets.stores}">店舗</option><option value="${adminConfig.sheets.storeWorks}">店舗と作品</option><option value="${adminConfig.sheets.events}">イベント</option><option value="${adminConfig.sheets.eventSources}">イベント自動更新元</option></select></label><button class="button button--quiet" type="button" data-sheet-load>読み込む</button><button class="button button--quiet" type="button" data-row-add>行を追加</button><button class="button button--primary" type="button" data-sheet-save>保存</button><button class="button button--light" type="button" data-publish>公開する</button></div><div class="admin-table-wrap" data-editor-table><p>表を読み込んでください。</p></div></section>`;
  root.querySelector('[data-admin-refresh]').addEventListener('click', renderDashboard);
  root.querySelector('[data-sheet-load]').addEventListener('click', () => loadEditorSheet());
  root.querySelector('[data-row-add]').addEventListener('click', addEditorRow);
  root.querySelector('[data-sheet-save]').addEventListener('click', saveEditorSheet);
  root.querySelector('[data-publish]').addEventListener('click', publishSheets);
  root.insertAdjacentHTML('beforeend', '<section class="admin-card admin-card--moderation" data-admin-moderation></section>');
  void import('./moderation.js?rev=20260918-post-v1').then(({ bindModerationPanel }) => {
    bindModerationPanel(root.querySelector('[data-admin-moderation]'));
  }).catch(() => {
    const moderation = root.querySelector('[data-admin-moderation]');
    if (moderation) moderation.innerHTML = '<p class="admin-status admin-status--error">投稿審査画面を読み込めませんでした。</p>';
  });
  void loadAnalytics();
  void loadEditorSheet();
}

async function loadAnalytics() {
  try {
    const { values } = await readSheet(adminConfig.sheets.analyticsDaily);
    state.analytics = values;
    const { headers, rows } = getRows(values);
    const index = Object.fromEntries(headers.map((header, position) => [header, position]));
    const total = (metric) => rows.filter((row) => row[index.metric] === metric).reduce((sum, row) => sum + Number(row[index.count] || 0), 0);
    const visitorTotal = rows.filter((row) => row[index.metric] === 'visitors').reduce((sum, row) => sum + Number(row[index.count] || 0), 0);
    const metrics = [visitorTotal, total('page_views'), total('qr_scans'), total('likes')];
    root.querySelectorAll('[data-admin-metrics] .admin-metric strong').forEach((element, position) => { element.textContent = metrics[position].toLocaleString('ja-JP'); });
    const workRows = rows.filter((row) => row[index.dimension_type] === 'work' && row[index.metric] === 'likes').sort((a, b) => Number(b[index.count] || 0) - Number(a[index.count] || 0)).slice(0, 5);
    const storeRows = rows.filter((row) => row[index.dimension_type] === 'store' && row[index.metric] === 'map_opens').sort((a, b) => Number(b[index.count] || 0) - Number(a[index.count] || 0)).slice(0, 5);
    root.querySelector('[data-admin-insights]').innerHTML = `<div class="admin-insight-grid"><div><h3>いいねが多い作品</h3>${workRows.length ? `<ol>${workRows.map((row) => `<li><span>${escapeHtml(row[index.dimension_id])}</span><strong>${Number(row[index.count] || 0).toLocaleString('ja-JP')}</strong></li>`).join('')}</ol>` : '<p>まだデータがありません。</p>'}</div><div><h3>地図が開かれた店舗</h3>${storeRows.length ? `<ol>${storeRows.map((row) => `<li><span>${escapeHtml(row[index.dimension_id])}</span><strong>${Number(row[index.count] || 0).toLocaleString('ja-JP')}</strong></li>`).join('')}</ol>` : '<p>まだデータがありません。</p>'}</div></div>`;
  } catch {
    setStatus('AnalyticsDailyを読み込めませんでした。スプレッドシートの初期設定を確認してください。', 'error');
  }
}

async function loadEditorSheet() {
  const selector = root.querySelector('[data-sheet-selector]');
  if (!selector) return;
  try {
    const sheet = await readSheet(selector.value);
    state.sheets.set(selector.value, sheet.values);
    renderEditorTable(sheet.values);
    setStatus(`${selector.value}を読み込みました。`);
  } catch {
    setStatus(`${selector.value}を読み込めませんでした。`, 'error');
  }
}

function renderEditorTable(values) {
  const { headers, rows } = getRows(values);
  const table = root.querySelector('[data-editor-table]');
  if (!table || !headers.length) return;
  table.innerHTML = `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr>${headers.map((_, columnIndex) => `<td><input type="text" value="${escapeHtml(row[columnIndex])}" data-editor-row="${rowIndex}" data-editor-column="${columnIndex}"></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function addEditorRow() {
  const selector = root.querySelector('[data-sheet-selector]');
  const values = state.sheets.get(selector.value) || [];
  const headers = values[0] || [];
  if (!headers.length) return;
  values.push(headers.map(() => ''));
  state.sheets.set(selector.value, values);
  renderEditorTable(values);
}

function collectEditorValues() {
  const selector = root.querySelector('[data-sheet-selector]');
  const values = state.sheets.get(selector.value) || [];
  const headers = values[0] || [];
  const rows = [...root.querySelectorAll('[data-editor-row]')];
  const nextRows = Array.from({ length: values.length - 1 }, () => headers.map(() => ''));
  rows.forEach((input) => { nextRows[Number(input.dataset.editorRow)][Number(input.dataset.editorColumn)] = input.value; });
  return [headers, ...nextRows];
}

async function clearSheet(sheetName) {
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  await apiFetch(sheetsUrl(`/values/${range}:clear`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

async function writeSheet(sheetName, values) {
  if (!values.length || !values[0].length) return;
  const range = `${sheetName}!A1:${columnName(values[0].length)}${values.length}`;
  await apiFetch(sheetsUrl(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ range, majorDimension: 'ROWS', values }) });
}

async function saveEditorSheet() {
  const selector = root.querySelector('[data-sheet-selector]');
  const values = collectEditorValues();
  try {
    await clearSheet(selector.value);
    await writeSheet(selector.value, values);
    state.sheets.set(selector.value, values);
    setStatus(`${selector.value}を保存しました。`);
  } catch {
    setStatus(`${selector.value}の保存に失敗しました。`, 'error');
  }
}

function publishedValues(values) {
  const headers = values[0] || [];
  const position = headers.indexOf('published');
  if (position === -1) return values;
  return [headers, ...values.slice(1).filter((row) => ['true', '1', 'yes', '公開', 'published'].includes(String(row[position] || '').trim().toLowerCase()))];
}

async function publishSheets() {
  try {
    const mappings = [[adminConfig.sheets.works, 'PublishedWorks'], [adminConfig.sheets.stores, 'PublishedStores'], [adminConfig.sheets.storeWorks, 'PublishedStoreWorks'], [adminConfig.sheets.events, 'PublishedEvents']];
    for (const [source, target] of mappings) {
      const { values } = await readSheet(source);
      await clearSheet(target);
      await writeSheet(target, publishedValues(values));
    }
    setStatus('公開済みデータを更新しました。');
  } catch {
    setStatus('公開に失敗しました。PublishedWorks / PublishedStores / PublishedStoreWorksの準備を確認してください。', 'error');
  }
}

if (!isConfigured()) renderSetup();
else renderLogin();
