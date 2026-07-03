(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const STORAGE_KEY_ENABLED = 'pixieedraw:local-extension:enabled';
  const STORAGE_KEY_CODE = 'pixieedraw:local-extension:code';
  const STORAGE_KEY_EXTENSIONS = 'pixieedraw:local-extension:extensions';
  const STORAGE_KEY_PLUGIN_DATA = 'pixieedraw:local-extension:data';
  const TEMPLATE_SCRIPT_FILENAME = 'pixieedraw-host-api-starter-template.js';
  const SCRIPT_WATCH_INTERVAL_MS = 1800;
  const LOCAL_TOOL_MAX_COUNT = 24;
  const LOCAL_PAINT_BATCH_MAX = 32768;
  const SANDBOX_FRAME_MIN_HEIGHT = 180;
  const SANDBOX_FRAME_MAX_HEIGHT = 560;
  const RETIRED_AI_STORAGE_KEYS = Object.freeze([
    'pixieedraw:local-extension:ai-enabled',
    'pixieedraw:local-extension:ai-endpoint',
    'pixieedraw:local-extension:ai-api-format',
    'pixieedraw:local-extension:ai-api-key',
    'pixieedraw:local-extension:ai-model',
    'pixieedraw:local-extension:ai-system-prompt',
    'pixieedraw:local-extension:ai-last-prompt',
    'pixieedraw:local-extension:ai-code-preset',
  ]);

  const runtimeState = {
    extensions: [],
    selectedExtensionId: '',
    runtimes: new Map(),
    ui: null,
    localTools: new Map(),
    localToolOrder: [],
    activeLocalToolId: '',
    trackedPointerId: null,
    localOverlayCanvas: null,
    localOverlayCtx: null,
    localInputLayer: null,
    localOverlayObserver: null,
    localPaintMap: new Map(),
    builtInToolObserver: null,
    scriptFileHandle: null,
    scriptFileBindingExtensionId: '',
    scriptFileName: '',
    scriptFileLastModified: 0,
    scriptFileWatchTimer: null,
    scriptFileReadInFlight: false,
    defaultFrameHeight: 240,
  };

  function isEnglishUi() {
    const lang = String(document?.documentElement?.lang || 'ja').toLowerCase();
    return lang.startsWith('en');
  }

  function localizeText(jaText, enText) {
    return isEnglishUi() ? enText : jaText;
  }

  function buildTemplateCode() {
    return String.raw`/*
 * PiXiEEDraw Extension Template
 * Host API Starter
 * Name: Host API Starter
 * Version: 0.1.0
 * Author: Your name
 * Description: 既存ツール欄追加・入力取得・オーバーレイ描画・ローカル保存の最小テンプレ
 *
 * このファイルを GPT に渡す時は、このコメントを残してください。
 * GPT が PiXiEEDraw の内部構造を知らなくても編集できるように、
 * 「どこまで安全に触れてよいか」をここにまとめています。
 *
 * 実行環境:
 * - この拡張は PiXiEEDraw の拡張機能です
 * - 実行場所は sandbox iframe の中だけです
 * - このファイル内の document / window は iframe 自身のものです
 * - 親ページ DOM や他ユーザーの画面には触れません
 * - 拡張はこの端末だけで動き、共有同期されません
 *
 * 安全に追加しやすいもの:
 * - 独自UI
 * - 独自canvas
 * - ローカル保存付きの設定
 * - 既存ツール欄へ追加する拡張ツール
 * - 既存キャンバス上での入力取得とオーバーレイ表示
 *
 * できないこと:
 * - 外部通信
 * - Supabase や課金系 API へのアクセス
 * - 親ページ DOM の直接編集
 * - 共有データの直接変更
 * - 他人の端末への反映
 *
 * 使える API:
 * - api.on(name, handler)
 * - api.toast(message, level)
 * - api.ui.getRoot()
 * - api.ui.clear()
 * - api.ui.mount(node)
 * - api.ui.append(node)
 * - api.ui.setTitle(text)
 * - api.ui.setSubtitle(text)
 * - api.ui.setStatus(text, kind)
 * - api.ui.addStyles(css)
 * - api.ui.el(tag, props, children)
 * - api.getContext()
 * - api.registerTool(tool)
 * - api.unregisterTool(id)
 * - api.clearTools()
 * - api.activateTool(id)
 * - api.capturePointer(enabled)
 * - api.drawPixels(pixels, color)
 * - api.clearPixels()
 * - api.storage.get(key, fallback)
 * - api.storage.set(key, value)
 * - api.storage.remove(key)
 *
 * よく使う event:
 * - init
 * - context
 * - interval
 * - tool:pointerdown
 * - tool:pointermove
 * - tool:pointerup
 * - tool:pointercancel
 *
 * GPT に守らせる条件:
 * - 単一の .js ファイルのまま編集する
 * - 外部ライブラリを使わない
 * - 外部通信しない
 * - fetch / XHR / WebSocket / Supabase など外部接続は使わない
 * - 親ページ DOM は触らない
 * - 本体への影響は公開 API 経由だけで行う
 * - 既存の拡張パネル shell は api.ui から使う
 * - 既存のコード構造とコメントをできるだけ保つ
 * - 完成コードだけを返す
 */

(() => {
  'use strict';

  const TOOL_ID = 'host-starter';
  const STORAGE_KEY = 'host-starter-color-v1';
  const state = {
    drawing: false,
    color: { r: 124, g: 227, b: 255, a: 255 },
  };

  function clampChannel(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return fallback;
    }
    return Math.max(0, Math.min(255, Math.round(num)));
  }

  function colorToHex(color) {
    const safe = color && typeof color === 'object' ? color : state.color;
    return '#' + [safe.r, safe.g, safe.b].map(function(channel) {
      return clampChannel(channel, 0).toString(16).padStart(2, '0');
    }).join('');
  }

  function hexToColor(hex) {
    const text = String(hex || '').trim();
    const safe = /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#7ce3ff';
    return {
      r: parseInt(safe.slice(1, 3), 16),
      g: parseInt(safe.slice(3, 5), 16),
      b: parseInt(safe.slice(5, 7), 16),
      a: 255,
    };
  }

  function makeCrossPixels(x, y) {
    return [
      { x: x, y: y },
      { x: x - 1, y: y },
      { x: x + 1, y: y },
      { x: x, y: y - 1 },
      { x: x, y: y + 1 },
    ];
  }

  function paintAt(cell) {
    if (!cell || !cell.inside) {
      return;
    }
    const pixels = makeCrossPixels(cell.clampedX, cell.clampedY).filter(function(pixel) {
      return pixel.x >= 0 && pixel.y >= 0 && pixel.x < cell.width && pixel.y < cell.height;
    });
    api.drawPixels(pixels, state.color);
  }

  function renderInfo(target) {
    if (!target) {
      return;
    }
    const ctx = api.getContext() || {};
    target.textContent = [
      'activeTool=' + (ctx.activeTool || 'none'),
      'extensionTool=' + (ctx.activeLocalToolId || 'none'),
      'overlay=' + String(ctx.localPaintPixelCount || 0),
    ].join(' / ');
  }

  async function init() {
    const saved = await api.storage.get(STORAGE_KEY, null);
    if (saved && typeof saved === 'object') {
      state.color = {
        r: clampChannel(saved.r, state.color.r),
        g: clampChannel(saved.g, state.color.g),
        b: clampChannel(saved.b, state.color.b),
        a: 255,
      };
    }

    api.ui.setTitle('Host API Starter');
    api.ui.setSubtitle('既存ツール欄・入力取得・オーバーレイ描画の出発点');
    api.ui.addStyles([
      '.host-starter { display: grid; gap: 8px; }',
      '.host-starter__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.host-starter__meta { color: rgba(234, 248, 255, 0.72); }',
      '.host-starter__color { width: 44px; height: 32px; padding: 0; border: none; background: transparent; }'
    ].join('\n'));

    const root = api.ui.el('div', { className: 'host-starter' });
    const intro = api.ui.el('p', {
      className: 'host-starter__meta',
      text: 'このテンプレは host API の最小構成です。拡張ツールを有効にすると、キャンバス上に十字オーバーレイを描けます。'
    });
    const row = api.ui.el('div', { className: 'host-starter__row' });
    const colorInput = api.ui.el('input', {
      className: 'host-starter__color',
      type: 'color',
      value: colorToHex(state.color),
    });
    const activateButton = api.ui.el('button', {
      type: 'button',
      text: '拡張ツールを有効化',
    });
    const clearButton = api.ui.el('button', {
      type: 'button',
      text: 'オーバーレイを消去',
    });
    const info = api.ui.el('div', {
      className: 'host-starter__meta',
      text: '',
    });

    row.append(colorInput, activateButton, clearButton);
    root.append(intro, row, info);
    api.ui.mount(root);
    renderInfo(info);

    colorInput.addEventListener('input', async function(event) {
      state.color = hexToColor(event.target && event.target.value);
      await api.storage.set(STORAGE_KEY, state.color);
      api.ui.setStatus('color=' + colorToHex(state.color), 'info');
      renderInfo(info);
    });

    activateButton.addEventListener('click', function() {
      api.activateTool(TOOL_ID);
      api.capturePointer(true);
      api.ui.setStatus('拡張ツールを有効化しました', 'success');
      renderInfo(info);
    });

    clearButton.addEventListener('click', function() {
      api.clearPixels();
      api.ui.setStatus('オーバーレイを消去しました', 'info');
      renderInfo(info);
    });

    api.registerTool({
      id: TOOL_ID,
      label: 'HS',
      hint: 'Host API starter tool',
    });
    api.capturePointer(true);
    api.activateTool(TOOL_ID);
    api.toast('Host API Starter loaded', 'success');
  }

  api.on('init', init);
  api.on('context', function() {
    const root = api.ui.getRoot();
    const info = root ? root.querySelector('.host-starter__meta:last-child') : null;
    renderInfo(info);
  });
  api.on('tool:pointerdown', function(payload) {
    state.drawing = true;
    paintAt(payload && payload.cell);
  });
  api.on('tool:pointermove', function(payload) {
    if (!state.drawing) {
      return;
    }
    paintAt(payload && payload.cell);
  });
  api.on('tool:pointerup', function() {
    state.drawing = false;
  });
  api.on('tool:pointercancel', function() {
    state.drawing = false;
  });
})();
`;
  }

  function canUseScriptFileSystem() {
    return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
  }

  function parseExtensionMetadata(code, fileName = '') {
    const text = String(code || '');
    const fileLabel = sanitizeText(fileName, 180).trim();
    const fallbackName = fileLabel
      ? fileLabel.replace(/\.[^.]+$/u, '').trim()
      : localizeText('未命名の拡張機能', 'Untitled Extension');
    const metadata = {
      name: fallbackName,
      version: '',
      author: '',
      description: '',
      fileName: fileLabel,
    };
    const commentMatch = text.match(/\/\*([\s\S]*?)\*\//u);
    const block = commentMatch ? commentMatch[1] : '';
    const fieldMap = {
      name: /(?:^|\n)\s*\*?\s*Name\s*:\s*(.+)/iu,
      version: /(?:^|\n)\s*\*?\s*Version\s*:\s*(.+)/iu,
      author: /(?:^|\n)\s*\*?\s*Author\s*:\s*(.+)/iu,
      description: /(?:^|\n)\s*\*?\s*Description\s*:\s*(.+)/iu,
    };
    Object.keys(fieldMap).forEach(key => {
      const match = block.match(fieldMap[key]);
      if (match && match[1]) {
        metadata[key] = sanitizeText(match[1], key === 'description' ? 240 : 120).trim();
      }
    });
    if (!metadata.name) {
      metadata.name = fallbackName;
    }
    return metadata;
  }

  function createExtensionId() {
    return `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeExtensionRecord(record) {
    const source = record && typeof record === 'object' ? record : {};
    const code = String(source.code || '');
    const fileName = sanitizeText(source.fileName, 180).trim();
    const metadata = parseExtensionMetadata(code, fileName);
    return {
      id: sanitizeText(source.id, 64).trim() || createExtensionId(),
      code,
      fileName,
      enabled: Boolean(source.enabled),
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
      metadata,
    };
  }

  function sortExtensions(list) {
    return list.slice().sort((a, b) => {
      const orderDiff = (Number(a.order) || 0) - (Number(b.order) || 0);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return String(a.metadata?.name || '').localeCompare(String(b.metadata?.name || ''));
    });
  }

  function persistExtensions() {
    try {
      window.localStorage.setItem(STORAGE_KEY_EXTENSIONS, JSON.stringify(runtimeState.extensions));
    } catch (_) {
      // ignore
    }
  }

  function getExtensionById(extensionId) {
    return runtimeState.extensions.find(extension => extension.id === extensionId) || null;
  }

  function getSelectedExtension() {
    return getExtensionById(runtimeState.selectedExtensionId);
  }

  function refreshSelectedExtensionUi() {
    const ui = runtimeState.ui;
    const selected = getSelectedExtension();
    if (!ui) {
      return;
    }
    if (ui.enabled instanceof HTMLInputElement) {
      ui.enabled.checked = Boolean(selected?.enabled);
      ui.enabled.disabled = !selected;
    }
    if (ui.code instanceof HTMLTextAreaElement) {
      ui.code.value = selected?.code || '';
    }
    if (ui.workspaceTitle instanceof HTMLElement) {
      const baseLabel = localizeText('拡張UI', 'Extension UI');
      const name = sanitizeText(selected?.metadata?.name || '', 120).trim();
      ui.workspaceTitle.textContent = name ? `${baseLabel}: ${name}` : baseLabel;
    }
  }

  function setSelectedExtensionId(extensionId) {
    const next = getExtensionById(extensionId)
      ? extensionId
      : (runtimeState.extensions[0]?.id || '');
    runtimeState.selectedExtensionId = next;
    refreshSelectedExtensionUi();
    refreshScriptBindingUi();
    renderExtensionCatalogUi();
    syncRuntimeWorkspaceMount();
    updatePanelVisibility();
  }

  function upsertExtensionRecord(record, { select = true, persist = true } = {}) {
    const normalized = normalizeExtensionRecord(record);
    const existingIndex = runtimeState.extensions.findIndex(extension => extension.id === normalized.id);
    if (existingIndex >= 0) {
      runtimeState.extensions.splice(existingIndex, 1, normalized);
    } else {
      normalized.order = runtimeState.extensions.length;
      runtimeState.extensions.push(normalized);
    }
    runtimeState.extensions = sortExtensions(runtimeState.extensions).map((extension, index) => ({
      ...extension,
      order: index,
    }));
    if (persist) {
      persistExtensions();
    }
    if (select) {
      setSelectedExtensionId(normalized.id);
    } else {
      renderExtensionCatalogUi();
      updatePanelVisibility();
    }
    return normalized;
  }

  function removeExtensionRecord(extensionId) {
    const index = runtimeState.extensions.findIndex(extension => extension.id === extensionId);
    if (index < 0) {
      return false;
    }
    runtimeState.extensions.splice(index, 1);
    runtimeState.extensions = runtimeState.extensions.map((extension, order) => ({ ...extension, order }));
    stopExtensionRuntime(extensionId);
    if (runtimeState.scriptFileBindingExtensionId === extensionId) {
      runtimeState.scriptFileBindingExtensionId = '';
      runtimeState.scriptFileHandle = null;
      runtimeState.scriptFileName = '';
      runtimeState.scriptFileLastModified = 0;
      clearScriptWatchTimer();
    }
    persistExtensions();
    setSelectedExtensionId(runtimeState.selectedExtensionId);
    return true;
  }

  function toggleExtensionEnabled(extensionId, enabled) {
    const extension = getExtensionById(extensionId);
    if (!extension) {
      return false;
    }
    extension.enabled = Boolean(enabled);
    persistExtensions();
    syncAllExtensionRuntimes();
    renderExtensionCatalogUi();
    updatePanelVisibility();
    return true;
  }

  function buildInitialExtensionsState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_EXTENSIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return sortExtensions(parsed.map(normalizeExtensionRecord)).map((extension, index) => ({
            ...extension,
            order: index,
          }));
        }
      }
    } catch (_) {
      // ignore
    }
    const legacyCode = readStorage(STORAGE_KEY_CODE, '');
    const legacyEnabled = readStorage(STORAGE_KEY_ENABLED, '0') === '1';
    if (String(legacyCode || '').trim()) {
      return [normalizeExtensionRecord({
        id: createExtensionId(),
        code: legacyCode,
        fileName: '',
        enabled: legacyEnabled,
        order: 0,
      })];
    }
    return [];
  }

  function createRuntimeRecord(extensionId) {
    return {
      extensionId,
      frame: null,
      frameReady: false,
      messageQueue: [],
      intervalTimer: null,
      frameHeight: runtimeState.defaultFrameHeight,
      captureCanvasPointer: false,
    };
  }

  function getRuntimeRecord(extensionId) {
    if (!runtimeState.runtimes.has(extensionId)) {
      runtimeState.runtimes.set(extensionId, createRuntimeRecord(extensionId));
    }
    return runtimeState.runtimes.get(extensionId);
  }

  function getRuntimeBySourceWindow(sourceWindow) {
    for (const runtime of runtimeState.runtimes.values()) {
      if (runtime.frame instanceof HTMLIFrameElement && runtime.frame.contentWindow === sourceWindow) {
        return runtime;
      }
    }
    return null;
  }

  function renderExtensionCatalogUi() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.extensionList instanceof HTMLElement)) {
      return;
    }
    ui.extensionList.replaceChildren();
    if (!runtimeState.extensions.length) {
      const empty = document.createElement('p');
      empty.className = 'help-text local-ext-panel__extension-empty';
      empty.textContent = localizeText(
        'まだ拡張ファイルは読み込まれていません。',
        'No extension file is loaded yet.'
      );
      ui.extensionList.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    runtimeState.extensions.forEach(extension => {
      const card = document.createElement('div');
      card.className = 'local-ext-panel__extension-card';
      card.dataset.extensionId = extension.id;
      card.classList.toggle('is-selected', extension.id === runtimeState.selectedExtensionId);
      card.tabIndex = 0;

      const head = document.createElement('div');
      head.className = 'local-ext-panel__extension-head';
      const title = document.createElement('div');
      title.className = 'local-ext-panel__extension-name';
      title.textContent = extension.metadata.name || localizeText('未命名の拡張機能', 'Untitled Extension');
      const version = document.createElement('div');
      version.className = 'local-ext-panel__extension-version';
      version.textContent = extension.metadata.version
        ? `v${extension.metadata.version}`
        : localizeText('version 未設定', 'version not set');
      head.append(title, version);
      card.appendChild(head);

      if (extension.metadata.description) {
        const description = document.createElement('p');
        description.className = 'help-text local-ext-panel__extension-description';
        description.textContent = extension.metadata.description;
        card.appendChild(description);
      }

      const meta = document.createElement('div');
      meta.className = 'local-ext-panel__extension-meta';
      [
        [localizeText('作者', 'Author'), extension.metadata.author || localizeText('未設定', 'Not set')],
        [localizeText('ファイル', 'File'), extension.fileName || localizeText('未選択', 'Not selected')],
        [localizeText('状態', 'Status'), extension.enabled ? localizeText('ON', 'ON') : localizeText('OFF', 'OFF')],
      ].forEach(([labelText, valueText]) => {
        const row = document.createElement('div');
        row.className = 'local-ext-panel__extension-meta-row';
        const label = document.createElement('span');
        label.className = 'local-ext-panel__extension-meta-label';
        label.textContent = labelText;
        const value = document.createElement('span');
        value.className = 'local-ext-panel__extension-meta-value';
        value.textContent = valueText;
        row.append(label, value);
        meta.appendChild(row);
      });
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'local-ext-panel__extension-actions';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'chip local-ext-panel__extension-toggle';
      toggle.textContent = extension.enabled ? localizeText('ON', 'ON') : localizeText('OFF', 'OFF');
      toggle.addEventListener('click', event => {
        event.stopPropagation();
        toggleExtensionEnabled(extension.id, !extension.enabled);
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip';
      remove.textContent = localizeText('削除', 'Remove');
      remove.addEventListener('click', event => {
        event.stopPropagation();
        removeExtensionRecord(extension.id);
      });

      actions.append(toggle, remove);
      card.appendChild(actions);
      card.addEventListener('click', () => {
        setSelectedExtensionId(extension.id);
      });
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setSelectedExtensionId(extension.id);
        }
      });
      fragment.appendChild(card);
    });
    ui.extensionList.appendChild(fragment);
  }

  function applyImportedCode(nextCode, { autoEnable = true, extensionId = '' } = {}) {
    const ui = runtimeState.ui;
    const code = String(nextCode || '');
    const targetExtension = extensionId ? getExtensionById(extensionId) : null;
    const nextRecord = upsertExtensionRecord({
      id: targetExtension?.id || extensionId || createExtensionId(),
      code,
      fileName: runtimeState.scriptFileName,
      enabled: autoEnable || Boolean(targetExtension?.enabled),
      order: targetExtension?.order || runtimeState.extensions.length,
    }, { select: true, persist: true });
    if (ui?.code instanceof HTMLTextAreaElement) {
      ui.code.value = nextRecord.code;
    }
    renderExtensionCatalogUi();
    if (autoEnable) {
      toggleExtensionEnabled(nextRecord.id, true);
    }
    return nextRecord;
  }

  function clearScriptWatchTimer() {
    if (runtimeState.scriptFileWatchTimer !== null) {
      window.clearInterval(runtimeState.scriptFileWatchTimer);
      runtimeState.scriptFileWatchTimer = null;
    }
  }

  function getBoundScriptLabel() {
    const selected = getSelectedExtension();
    const name = sanitizeText(selected?.fileName || '', 180);
    return name || localizeText('未選択', 'Not selected');
  }

  function refreshScriptBindingUi() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.scriptValue instanceof HTMLElement)) {
      return;
    }
    const selected = getSelectedExtension();
    const hasBinding = Boolean(String(selected?.fileName || '').trim());
    ui.scriptValue.textContent = getBoundScriptLabel();
    ui.scriptValue.dataset.empty = hasBinding ? 'false' : 'true';
    if (ui.code instanceof HTMLTextAreaElement) {
      ui.code.value = selected?.code || '';
    }
  }

  async function readBoundScriptFile({ apply = true, silent = false, ignoreTimestamp = false, autoEnable = true, targetExtensionId = '' } = {}) {
    const handle = runtimeState.scriptFileHandle;
    if (!handle || typeof handle.getFile !== 'function' || runtimeState.scriptFileReadInFlight) {
      return false;
    }
    runtimeState.scriptFileReadInFlight = true;
    try {
      const file = await handle.getFile();
      if (!(file instanceof File)) {
        if (!silent) {
          setStatus(localizeText('スクリプトファイルを読めませんでした', 'Could not read the script file'), 'error');
        }
        return false;
      }
      runtimeState.scriptFileName = file.name || runtimeState.scriptFileName || '';
      if (!ignoreTimestamp && runtimeState.scriptFileLastModified && file.lastModified === runtimeState.scriptFileLastModified) {
        return false;
      }
      const text = await file.text();
      if (!String(text || '').trim()) {
        if (!silent) {
          setStatus(localizeText('スクリプトファイルが空です', 'The script file is empty'), 'warn');
        }
        return false;
      }
      runtimeState.scriptFileLastModified = Number(file.lastModified) || Date.now();
      if (apply) {
        const nextRecord = applyImportedCode(text, {
          autoEnable,
          extensionId: runtimeState.scriptFileBindingExtensionId || targetExtensionId,
        });
        runtimeState.scriptFileBindingExtensionId = nextRecord?.id || runtimeState.scriptFileBindingExtensionId;
      }
      if (!silent) {
        setStatus(
          localizeText(
            `スクリプトを再読込して反映しました: ${getBoundScriptLabel()}`,
            `Reloaded and applied the script: ${getBoundScriptLabel()}`
          ),
          'success'
        );
      }
      return true;
    } catch (error) {
      if (!silent) {
        setStatus(localizeText('スクリプトファイルの再読込に失敗しました', 'Failed to reload the script file'), 'error');
      }
      return false;
    } finally {
      runtimeState.scriptFileReadInFlight = false;
    }
  }

  function startWatchingBoundScriptFile() {
    clearScriptWatchTimer();
    if (!runtimeState.scriptFileHandle || typeof runtimeState.scriptFileHandle.getFile !== 'function') {
      return;
    }
    runtimeState.scriptFileWatchTimer = window.setInterval(() => {
      readBoundScriptFile({ apply: true, silent: true, ignoreTimestamp: false, autoEnable: true }).catch(() => {});
    }, SCRIPT_WATCH_INTERVAL_MS);
  }

  async function bindScriptFileHandle(handle, { readNow = true, autoEnableOnRead = true, targetExtensionId = '' } = {}) {
    if (!handle || typeof handle.getFile !== 'function') {
      return false;
    }
    runtimeState.scriptFileHandle = handle;
    runtimeState.scriptFileBindingExtensionId = sanitizeText(targetExtensionId, 64).trim();
    runtimeState.scriptFileName = handle.name || '';
    runtimeState.scriptFileLastModified = 0;
    refreshScriptBindingUi();
    startWatchingBoundScriptFile();
    if (readNow) {
      return await readBoundScriptFile({
        apply: true,
        silent: false,
        ignoreTimestamp: true,
        autoEnable: autoEnableOnRead,
        targetExtensionId: runtimeState.scriptFileBindingExtensionId,
      });
    }
    return true;
  }

  async function createTemplateScriptFile() {
    if (!canUseScriptFileSystem()) {
      setStatus(localizeText('このブラウザではスクリプトファイル作成に対応していません', 'This browser does not support script file creation'), 'warn');
      return false;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: TEMPLATE_SCRIPT_FILENAME,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'PiXiEEDraw Script',
            accept: {
              'text/javascript': ['.js'],
              'text/plain': ['.txt'],
            },
          },
        ],
      });
      if (!handle || typeof handle.createWritable !== 'function') {
        return false;
      }
      const writable = await handle.createWritable();
      await writable.write(buildTemplateCode());
      await writable.close();
      await bindScriptFileHandle(handle, { readNow: true, autoEnableOnRead: true, targetExtensionId: '' });
      setStatus(
        localizeText(
          `雛形スクリプトを作成しました: ${getBoundScriptLabel()}`,
          `Created the template script: ${getBoundScriptLabel()}`
        ),
        'success'
      );
      return true;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return false;
      }
      setStatus(localizeText('雛形スクリプトの作成に失敗しました', 'Failed to create the template script'), 'error');
      return false;
    }
  }

  async function pickScriptFileHandle() {
    if (!canUseScriptFileSystem()) {
      return false;
    }
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'PiXiEEDraw Script',
            accept: {
              'text/javascript': ['.js'],
              'text/plain': ['.txt'],
            },
          },
        ],
      });
      const handle = Array.isArray(handles) ? handles[0] : null;
      if (!handle) {
        return false;
      }
      return await bindScriptFileHandle(handle, { readNow: true, autoEnableOnRead: true, targetExtensionId: '' });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return false;
      }
      setStatus(localizeText('スクリプトファイルを開けませんでした', 'Could not open the script file'), 'error');
      return false;
    }
  }

  async function importScriptFile(file) {
    if (!(file instanceof File)) {
      return false;
    }
    const name = String(file.name || '').toLowerCase();
    if (name && !name.endsWith('.js') && !name.endsWith('.txt')) {
      setStatus(localizeText('`.js` または `.txt` のスクリプトを読み込んでください', 'Load a `.js` or `.txt` script file'), 'warn');
      return false;
    }
    let text = '';
    try {
      text = await file.text();
    } catch (error) {
      setStatus(localizeText('スクリプトの読込に失敗しました', 'Failed to read the script file'), 'error');
      return false;
    }
    if (!String(text || '').trim()) {
      setStatus(localizeText('スクリプトが空です', 'The script file is empty'), 'warn');
      return false;
    }
    runtimeState.scriptFileName = file.name || '';
    const nextRecord = applyImportedCode(text, { autoEnable: true });
    runtimeState.scriptFileHandle = null;
    runtimeState.scriptFileBindingExtensionId = nextRecord?.id || '';
    runtimeState.scriptFileLastModified = Number(file.lastModified) || Date.now();
    refreshScriptBindingUi();
    clearScriptWatchTimer();
    setStatus(localizeText('スクリプトを読み込み、自動で反映しました', 'Loaded the script and applied it automatically'), 'success');
    return true;
  }

  const SANDBOX_SRC = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; object-src 'none'; media-src data: blob:; font-src data:; frame-src 'none'; child-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;padding:0;background:transparent;color:#eaf8ff;font:12px/1.5 ui-sans-serif,system-ui,sans-serif}body{overflow:auto;padding:8px;box-sizing:border-box}*,*::before,*::after{box-sizing:border-box}button,input,textarea,select{font:inherit}canvas{image-rendering:pixelated;display:block;max-width:100%}</style></head><body>
<script>
(() => {
  const HOST_MARK = '__pixieLocalHost';
  const EXT_MARK = '__pixieLocalExt';
  const handlers = new Map();
  const pendingRequests = new Map();
  let requestSeq = 0;
  let latestContext = Object.freeze({});
  let layoutFrame = 0;
  let lastReportedWidth = 0;
  let lastReportedHeight = 0;

  function makeEl(tag, props, children) {
    const el = document.createElement(tag);
    if (props && typeof props === 'object') {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (key === 'className') {
          el.className = String(value || '');
        } else if (key === 'text') {
          el.textContent = String(value == null ? '' : value);
        } else if (key === 'hidden') {
          el.hidden = Boolean(value);
        } else {
          el[key] = value;
        }
      });
    }
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (child instanceof Node) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  const shell = (() => {
    const style = document.createElement('style');
    style.textContent = [
      ':root { color-scheme: dark; }',
      'body { overflow: auto; padding: 8px; box-sizing: border-box; }',
      '.pixie-ext-shell {',
      '  display: grid;',
      '  gap: 8px;',
      '  border: 1px solid rgba(166, 234, 255, 0.24);',
      '  background: rgba(7, 14, 20, 0.92);',
      '  padding: 10px;',
      '}',
      '.pixie-ext-shell__header {',
      '  display: grid;',
      '  gap: 4px;',
      '}',
      '.pixie-ext-shell__title {',
      '  font-weight: 800;',
      '  letter-spacing: 0.03em;',
      '}',
      '.pixie-ext-shell__subtitle {',
      '  color: rgba(234, 248, 255, 0.72);',
      '}',
      '.pixie-ext-shell__status {',
      '  min-height: 1.2em;',
      '}',
      '.pixie-ext-shell__status[data-kind="success"] { color: #84f3ad; }',
      '.pixie-ext-shell__status[data-kind="warn"] { color: #ffd27a; }',
      '.pixie-ext-shell__status[data-kind="error"] { color: #ff9c9c; }',
      '.pixie-ext-shell__body {',
      '  display: grid;',
      '  gap: 10px;',
      '  align-content: start;',
      '}',
    ].join('\n');
    document.head.appendChild(style);

    const shellEl = makeEl('div', { className: 'pixie-ext-shell' });
    const header = makeEl('div', { className: 'pixie-ext-shell__header' });
    const title = makeEl('div', { className: 'pixie-ext-shell__title', text: 'Extension' });
    const subtitle = makeEl('div', {
      className: 'pixie-ext-shell__subtitle',
      text: 'Build custom UI inside this dedicated panel only.',
    });
    const status = makeEl('div', {
      className: 'pixie-ext-shell__status',
      hidden: true,
    });
    const body = makeEl('div', { className: 'pixie-ext-shell__body' });
    header.append(title, subtitle);
    shellEl.append(header, status, body);
    document.body.appendChild(shellEl);
    return { shellEl, title, subtitle, status, body };
  })();

  function clearOwnedStyles() {
    Array.from(document.querySelectorAll('style[data-pixie-ext-owned="1"]')).forEach((node) => {
      node.remove();
    });
  }

  function setShellTitle(text) {
    const next = String(text || '').trim();
    shell.title.textContent = next || 'Extension';
    reportLayout();
    return shell.title.textContent;
  }

  function setShellSubtitle(text) {
    const next = String(text || '').trim();
    shell.subtitle.textContent = next;
    shell.subtitle.hidden = !next;
    reportLayout();
    return shell.subtitle.textContent;
  }

  function setShellStatus(text, kind = 'info') {
    const next = String(text || '').trim();
    shell.status.textContent = next;
    shell.status.hidden = !next;
    shell.status.dataset.kind = String(kind || 'info');
    reportLayout();
    return shell.status.textContent;
  }

  function resetShell() {
    clearOwnedStyles();
    setShellTitle('Extension');
    setShellSubtitle('Build custom UI inside this dedicated panel only.');
    setShellStatus('', 'info');
    shell.body.replaceChildren();
    reportLayout();
  }

  function blockedCapability(name) {
    return () => {
      throw new Error(name + ' is disabled in PiXiEEDraw extensions');
    };
  }

  const blockedAsyncCapability = (name) => () => Promise.reject(new Error(name + ' is disabled in PiXiEEDraw extensions'));
  try { window.fetch = blockedAsyncCapability('fetch'); } catch (_) {}
  try {
    window.XMLHttpRequest = class BlockedXMLHttpRequest {
      constructor() {
        throw new Error('XMLHttpRequest is disabled in PiXiEEDraw extensions');
      }
    };
  } catch (_) {}
  try {
    window.WebSocket = class BlockedWebSocket {
      constructor() {
        throw new Error('WebSocket is disabled in PiXiEEDraw extensions');
      }
    };
  } catch (_) {}
  try {
    window.EventSource = class BlockedEventSource {
      constructor() {
        throw new Error('EventSource is disabled in PiXiEEDraw extensions');
      }
    };
  } catch (_) {}
  try {
    window.Worker = class BlockedWorker {
      constructor() {
        throw new Error('Worker is disabled in PiXiEEDraw extensions');
      }
    };
  } catch (_) {}
  try {
    window.SharedWorker = class BlockedSharedWorker {
      constructor() {
        throw new Error('SharedWorker is disabled in PiXiEEDraw extensions');
      }
    };
  } catch (_) {}
  try { window.open = blockedCapability('window.open'); } catch (_) {}
  try {
    if (navigator && typeof navigator === 'object') {
      navigator.sendBeacon = blockedCapability('navigator.sendBeacon');
    }
  } catch (_) {}

  function post(type, payload) {
    parent.postMessage({ [EXT_MARK]: 1, type, payload }, '*');
  }

  function flushLayout() {
    layoutFrame = 0;
    try {
      const width = Math.ceil(Math.max(
        shell.shellEl ? shell.shellEl.scrollWidth : 0,
        shell.shellEl ? shell.shellEl.getBoundingClientRect().width : 0,
        document.body ? document.body.getBoundingClientRect().width : 0
      ));
      const height = Math.ceil(Math.max(
        shell.shellEl ? shell.shellEl.scrollHeight : 0,
        shell.shellEl ? shell.shellEl.getBoundingClientRect().height : 0
      ));
      if (width === lastReportedWidth && height === lastReportedHeight) {
        return;
      }
      lastReportedWidth = width;
      lastReportedHeight = height;
      post('layout', { width, height });
    } catch (_) {
      // ignore
    }
  }

  function reportLayout() {
    if (layoutFrame) {
      return;
    }
    layoutFrame = requestAnimationFrame(flushLayout);
  }

  function on(eventName, handler) {
    if (typeof eventName !== 'string' || typeof handler !== 'function') {
      return;
    }
    const list = handlers.get(eventName) || [];
    list.push(handler);
    handlers.set(eventName, list);
  }

  function emit(eventName, payload) {
    const list = handlers.get(eventName) || [];
    for (const handler of list) {
      try {
        const result = handler(payload);
        if (result && typeof result.then === 'function') {
          result.catch((error) => {
            post('status', {
              ok: false,
              message: '[handler:' + eventName + '] ' + (error && error.message ? error.message : String(error)),
            });
          });
        }
      } catch (error) {
        post('status', {
          ok: false,
          message: '[handler:' + eventName + '] ' + (error && error.message ? error.message : String(error)),
        });
      }
    }
  }

  function clearHandlers() {
    handlers.clear();
  }

  function rejectPendingRequests(reason) {
    for (const pending of pendingRequests.values()) {
      try {
        pending.reject(new Error(reason || 'Request cancelled'));
      } catch (_) {
        // ignore
      }
    }
    pendingRequests.clear();
  }

  function request(type, payload) {
    return new Promise((resolve, reject) => {
      const id = 'req_' + Date.now() + '_' + (requestSeq += 1);
      pendingRequests.set(id, { resolve, reject });
      post(type, {
        id,
        ...(payload && typeof payload === 'object' ? payload : {}),
      });
    });
  }

  function settleRequest(payload) {
    const id = payload && payload.id ? String(payload.id) : '';
    if (!id || !pendingRequests.has(id)) {
      return;
    }
    const pending = pendingRequests.get(id);
    pendingRequests.delete(id);
    if (!pending) {
      return;
    }
    if (payload && payload.ok) {
      pending.resolve(payload);
      return;
    }
    const message = payload && payload.message ? String(payload.message) : 'Request failed';
    pending.reject(new Error(message));
  }

  function disabledBridge(name) {
    post('disabled-capability', { name: String(name || 'API') });
    return false;
  }

  const api = Object.freeze({
    on,
    toast(message, level = 'info') {
      post('toast', { message: String(message || ''), level: String(level || 'info') });
    },
    badge(text = '') {
      post('badge', { text: String(text || '') });
    },
    panel(title = '', body = '') {
      post('panel', { title: String(title || ''), body: String(body || '') });
    },
    registerTool(tool) {
      post('tool-register', { tool });
      return true;
    },
    unregisterTool(id) {
      post('tool-unregister', { id: String(id || '') });
      return true;
    },
    clearTools() {
      post('tools-clear', {});
      return true;
    },
    activateTool(id) {
      post('tool-activate', { id: String(id || '') });
      return true;
    },
    capturePointer(enabled = true) {
      post('pointer-capture', { enabled: Boolean(enabled) });
      return true;
    },
    drawPixels(pixels, color) {
      post('local-paint', { pixels: Array.isArray(pixels) ? pixels : [], color: color && typeof color === 'object' ? color : {} });
      return true;
    },
    clearPixels() {
      post('local-paint-clear', {});
      return true;
    },
    getContext() {
      return latestContext;
    },
    ui: Object.freeze({
      getRoot() {
        return shell.body;
      },
      clear() {
        shell.body.replaceChildren();
        reportLayout();
        return shell.body;
      },
      mount(node) {
        shell.body.replaceChildren();
        if (node instanceof Node) {
          shell.body.appendChild(node);
        }
        reportLayout();
        return shell.body;
      },
      append(node) {
        if (node instanceof Node) {
          shell.body.appendChild(node);
          reportLayout();
        }
        return shell.body;
      },
      setTitle(text = '') {
        return setShellTitle(text);
      },
      setSubtitle(text = '') {
        return setShellSubtitle(text);
      },
      setStatus(text = '', kind = 'info') {
        return setShellStatus(text, kind);
      },
      addStyles(css = '') {
        const style = document.createElement('style');
        style.dataset.pixieExtOwned = '1';
        style.textContent = String(css || '');
        document.head.appendChild(style);
        reportLayout();
        return style;
      },
      el(tag, props, children) {
        return makeEl(tag, props, children);
      },
    }),
    storage: Object.freeze({
      async get(key, fallback = null) {
        const result = await request('storage-get', { key: String(key || ''), fallback });
        return result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : fallback;
      },
      async set(key, value) {
        await request('storage-set', { key: String(key || ''), value });
        return true;
      },
      async remove(key) {
        await request('storage-remove', { key: String(key || '') });
        return true;
      },
    }),
    ai: Object.freeze({
      request() {
        return Promise.reject(new Error('PiXiEEDraw local AI integration has been retired'));
      },
    }),
    log(...values) {
      post('log', { values: values.map(value => {
        try {
          if (typeof value === 'string') return value;
          return JSON.stringify(value);
        } catch (_) {
          return String(value);
        }
      }) });
    },
  });

  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || data[HOST_MARK] !== 1) {
      return;
    }
    if (data.type === 'load') {
      clearHandlers();
      rejectPendingRequests('Extension reloaded');
      latestContext = Object.freeze(data.context && typeof data.context === 'object' ? data.context : {});
      resetShell();
      try {
        const fn = new Function('api', '"use strict";\n' + String(data.code || '') + '\n//# sourceURL=pixieed-local-extension.js');
        fn(api);
        emit('init', latestContext);
        post('status', { ok: true, message: 'Extension loaded' });
      } catch (error) {
        setShellStatus(error && error.message ? error.message : String(error), 'error');
        shell.body.replaceChildren();
        post('status', {
          ok: false,
          message: error && error.message ? error.message : String(error),
        });
      }
      return;
    }
    if (data.type === 'unload') {
      clearHandlers();
      rejectPendingRequests('Extension stopped');
      resetShell();
      post('status', { ok: true, message: 'Extension stopped' });
      return;
    }
    if (data.type === 'request-result') {
      settleRequest(data.payload && typeof data.payload === 'object' ? data.payload : {});
      return;
    }
    if (data.type === 'ai-result') {
      settleRequest(data.payload && typeof data.payload === 'object' ? data.payload : {});
      return;
    }
    if (data.type === 'event') {
      if (data.name === 'context') {
        latestContext = Object.freeze(data.payload && typeof data.payload === 'object' ? data.payload : {});
      }
      emit(String(data.name || 'event'), data.payload);
    }
  });

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => {
      reportLayout();
    });
    observer.observe(shell.shellEl);
  }
  resetShell();
  window.addEventListener('load', reportLayout, { once: true });
  window.addEventListener('resize', reportLayout, { passive: true });
  post('ready', {});
})();
</script>
</body></html>`;

  function readStorage(key, fallback = '') {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // ignore
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // ignore
    }
  }

  function sanitizeText(value, limit = 1200) {
    return String(value || '').replace(/\s+$/g, '').slice(0, limit);
  }

  function sanitizeMultilineText(value, limit = 4000) {
    return String(value || '').replace(/\r\n?/g, '\n').replace(/\s+$/g, '').slice(0, limit);
  }

  function notifyPanelOnlyCapability(name) {
    const label = sanitizeText(name, 80) || 'API';
    setStatus(
      localizeText(
        `${label} は無効です。拡張は専用パネル内だけで動作します。`,
        `${label} is disabled. Extensions run only inside the dedicated panel.`
      ),
      'warn'
    );
  }

  function getPluginStorageNamespace(extensionId = '') {
    const extension = getExtensionById(extensionId);
    const source = sanitizeText(extension?.id || extensionId || '', 180).trim().toLowerCase();
    return source || 'default';
  }

  function readPluginStorageRoot() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_PLUGIN_DATA);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writePluginStorageRoot(root) {
    try {
      window.localStorage.setItem(STORAGE_KEY_PLUGIN_DATA, JSON.stringify(root || {}));
      return true;
    } catch (error) {
      return false;
    }
  }

  function readPluginStorageValue(extensionId, key, fallback = null) {
    const storageKey = sanitizeText(key, 120).trim();
    if (!storageKey) {
      return fallback;
    }
    const root = readPluginStorageRoot();
    const namespace = getPluginStorageNamespace(extensionId);
    const bucket = root[namespace];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket) || !(storageKey in bucket)) {
      return fallback;
    }
    return bucket[storageKey];
  }

  function writePluginStorageValue(extensionId, key, value) {
    const storageKey = sanitizeText(key, 120).trim();
    if (!storageKey) {
      return false;
    }
    const root = readPluginStorageRoot();
    const namespace = getPluginStorageNamespace(extensionId);
    const bucket = root[namespace] && typeof root[namespace] === 'object' && !Array.isArray(root[namespace])
      ? root[namespace]
      : {};
    bucket[storageKey] = value;
    root[namespace] = bucket;
    return writePluginStorageRoot(root);
  }

  function removePluginStorageValue(extensionId, key) {
    const storageKey = sanitizeText(key, 120).trim();
    if (!storageKey) {
      return false;
    }
    const root = readPluginStorageRoot();
    const namespace = getPluginStorageNamespace(extensionId);
    const bucket = root[namespace];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket) || !(storageKey in bucket)) {
      return true;
    }
    delete bucket[storageKey];
    root[namespace] = bucket;
    return writePluginStorageRoot(root);
  }

  function clearRetiredAiStorage() {
    RETIRED_AI_STORAGE_KEYS.forEach(key => {
      removeStorage(key);
    });
  }

  function normalizeToolId(value) {
    const base = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32);
    return base || '';
  }

  function normalizeToolDefinition(tool, ownerId = '') {
    if (!tool || typeof tool !== 'object') {
      return null;
    }
    const localId = normalizeToolId(tool.id);
    const normalizedOwnerId = sanitizeText(ownerId, 64).trim();
    if (!localId || !normalizedOwnerId) {
      return null;
    }
    const id = `${normalizedOwnerId}::${localId}`;
    const label = sanitizeText(tool.label || localId, 36) || localId;
    const hint = sanitizeText(tool.hint || '', 120);
    return { id, localId, ownerId: normalizedOwnerId, label, hint };
  }

  function clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return min;
    }
    return Math.min(max, Math.max(min, num));
  }

  function normalizePaintColor(color) {
    const source = color && typeof color === 'object' ? color : {};
    const r = Math.round(clampNumber(source.r, 0, 255));
    const g = Math.round(clampNumber(source.g, 0, 255));
    const b = Math.round(clampNumber(source.b, 0, 255));
    let alpha = Number(source.a);
    if (!Number.isFinite(alpha)) {
      alpha = 255;
    }
    if (alpha >= 0 && alpha <= 1) {
      alpha *= 255;
    }
    const a = Math.round(clampNumber(alpha, 0, 255));
    return {
      key: `${r},${g},${b},${a}`,
      css: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
      a,
    };
  }

  function parsePixelCoordinate(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    return Math.trunc(num);
  }

  function getCanvasDomRefs() {
    const viewport = document.getElementById('canvasViewport');
    if (!(viewport instanceof HTMLElement)) {
      return null;
    }
    const activeLocalSurface = document.querySelector('.local-canvas-surface.is-active');
    if (activeLocalSurface instanceof HTMLElement) {
      const stack = activeLocalSurface.querySelector('.local-canvas-stack');
      const drawing = activeLocalSurface.querySelector('.local-canvas-surface__canvas');
      const selection = activeLocalSurface.querySelector('.local-canvas-surface__selection');
      if (stack instanceof HTMLElement && drawing instanceof HTMLCanvasElement) {
        return {
          viewport,
          stack,
          drawing,
          selection: selection instanceof HTMLCanvasElement ? selection : null,
        };
      }
    }
    const stack = document.getElementById('canvasStack');
    const drawing = document.getElementById('drawingCanvas');
    const selection = document.getElementById('selectionCanvas');
    if (!(stack instanceof HTMLElement) || !(drawing instanceof HTMLCanvasElement)) {
      return null;
    }
    return {
      viewport,
      stack,
      drawing,
      selection: selection instanceof HTMLCanvasElement ? selection : null,
    };
  }

  function clearLocalPaintOverlaySurface() {
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function repaintLocalPaintOverlay() {
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return;
    }
    clearLocalPaintOverlaySurface();
    if (!runtimeState.localPaintMap.size) {
      return;
    }
    let lastColor = '';
    for (const [key, paint] of runtimeState.localPaintMap.entries()) {
      if (!paint || typeof paint.css !== 'string') {
        continue;
      }
      const ownerSplit = key.indexOf(':');
      const coords = ownerSplit >= 0 ? key.slice(ownerSplit + 1) : key;
      const comma = coords.indexOf(',');
      if (comma <= 0) {
        continue;
      }
      const x = Number(coords.slice(0, comma));
      const y = Number(coords.slice(comma + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        continue;
      }
      if (paint.css !== lastColor) {
        ctx.fillStyle = paint.css;
        lastColor = paint.css;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function pruneLocalPaintOutsideBounds(width, height) {
    if (!runtimeState.localPaintMap.size) {
      return false;
    }
    let changed = false;
    const maxX = Math.max(0, Number(width) - 1);
    const maxY = Math.max(0, Number(height) - 1);
    for (const key of Array.from(runtimeState.localPaintMap.keys())) {
      const ownerSplit = key.indexOf(':');
      const coords = ownerSplit >= 0 ? key.slice(ownerSplit + 1) : key;
      const comma = coords.indexOf(',');
      if (comma <= 0) {
        runtimeState.localPaintMap.delete(key);
        changed = true;
        continue;
      }
      const x = Number(coords.slice(0, comma));
      const y = Number(coords.slice(comma + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > maxX || y > maxY) {
        runtimeState.localPaintMap.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  function syncLocalCanvasGeometry({ forceRepaint = false } = {}) {
    const refs = getCanvasDomRefs();
    const overlay = runtimeState.localOverlayCanvas;
    if (!refs || !(overlay instanceof HTMLCanvasElement)) {
      return;
    }
    const width = Math.max(1, Math.trunc(Number(refs.drawing.width) || 1));
    const height = Math.max(1, Math.trunc(Number(refs.drawing.height) || 1));
    const sizeChanged = overlay.width !== width || overlay.height !== height;
    if (sizeChanged) {
      overlay.width = width;
      overlay.height = height;
    }
    const styleWidth = refs.drawing.style.width || `${Math.max(1, refs.drawing.clientWidth || width)}px`;
    const styleHeight = refs.drawing.style.height || `${Math.max(1, refs.drawing.clientHeight || height)}px`;
    overlay.style.width = styleWidth;
    overlay.style.height = styleHeight;
    const inputLayer = runtimeState.localInputLayer;
    if (inputLayer instanceof HTMLElement) {
      inputLayer.style.width = styleWidth;
      inputLayer.style.height = styleHeight;
    }
    const pruned = pruneLocalPaintOutsideBounds(width, height);
    if (sizeChanged || pruned || forceRepaint) {
      repaintLocalPaintOverlay();
    }
  }

  function ensureLocalOverlayCanvas() {
    const refs = getCanvasDomRefs();
    if (!refs) {
      return null;
    }
    let canvas = runtimeState.localOverlayCanvas;
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) {
      canvas = document.createElement('canvas');
      canvas.id = 'localExtensionOverlayCanvas';
      canvas.className = 'local-ext-overlay-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const insertionPoint = refs.selection && refs.selection.parentElement === refs.stack ? refs.selection : null;
      refs.stack.insertBefore(canvas, insertionPoint);
      runtimeState.localOverlayCanvas = canvas;
      runtimeState.localOverlayCtx = canvas.getContext('2d');
    } else if (canvas.parentElement !== refs.stack) {
      const insertionPoint = refs.selection && refs.selection.parentElement === refs.stack ? refs.selection : null;
      refs.stack.insertBefore(canvas, insertionPoint);
    }
    syncLocalCanvasGeometry({ forceRepaint: true });
    return canvas;
  }

  function ensureLocalInputLayer() {
    const refs = getCanvasDomRefs();
    if (!refs) {
      return null;
    }
    let layer = runtimeState.localInputLayer;
    if (!(layer instanceof HTMLDivElement) || !layer.isConnected) {
      layer = document.createElement('div');
      layer.id = 'localExtensionInputLayer';
      layer.className = 'local-ext-input-layer';
      layer.setAttribute('aria-hidden', 'true');
      refs.stack.appendChild(layer);
      runtimeState.localInputLayer = layer;
    } else if (layer.parentElement !== refs.stack) {
      refs.stack.appendChild(layer);
    }
    syncLocalCanvasGeometry();
    return layer;
  }

  function getActiveLocalToolRecord() {
    return runtimeState.activeLocalToolId
      ? (runtimeState.localTools.get(runtimeState.activeLocalToolId) || null)
      : null;
  }

  function shouldCaptureCanvasPointer() {
    const activeTool = getActiveLocalToolRecord();
    if (!activeTool) {
      return false;
    }
    const runtime = getRuntimeRecord(activeTool.ownerId);
    return Boolean(runtime && runtime.frame && runtime.captureCanvasPointer);
  }

  function updateLocalInputLayerState() {
    const layer = ensureLocalInputLayer();
    if (!(layer instanceof HTMLDivElement)) {
      return;
    }
    const active = shouldCaptureCanvasPointer();
    layer.classList.toggle('is-active', active);
    layer.hidden = !active;
    layer.style.pointerEvents = active ? 'auto' : 'none';
  }

  function clearLocalPaintPixels(ownerId = '') {
    if (!ownerId) {
      runtimeState.localPaintMap.clear();
      clearLocalPaintOverlaySurface();
      return;
    }
    Array.from(runtimeState.localPaintMap.keys()).forEach(key => {
      if (key.startsWith(`${ownerId}:`)) {
        runtimeState.localPaintMap.delete(key);
      }
    });
    repaintLocalPaintOverlay();
  }

  function paintLocalPixels(ownerId, pixels, color) {
    ensureLocalOverlayCanvas();
    syncLocalCanvasGeometry();
    const canvas = runtimeState.localOverlayCanvas;
    const ctx = runtimeState.localOverlayCtx;
    if (!(canvas instanceof HTMLCanvasElement) || !ctx) {
      return 0;
    }
    if (!Array.isArray(pixels) || !pixels.length) {
      return 0;
    }
    const normalizedColor = normalizePaintColor(color);
    let painted = 0;
    const limit = Math.min(LOCAL_PAINT_BATCH_MAX, pixels.length);
    for (let i = 0; i < limit; i += 1) {
      const pixel = pixels[i];
      if (!pixel || typeof pixel !== 'object') {
        continue;
      }
      const x = parsePixelCoordinate(pixel.x);
      const y = parsePixelCoordinate(pixel.y);
      if (x === null || y === null) {
        continue;
      }
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        continue;
      }
      const key = `${ownerId}:${x},${y}`;
      if (normalizedColor.a <= 0) {
        if (runtimeState.localPaintMap.delete(key)) {
          painted += 1;
        }
        continue;
      }
      runtimeState.localPaintMap.set(key, {
        key: normalizedColor.key,
        css: normalizedColor.css,
      });
      painted += 1;
    }
    repaintLocalPaintOverlay();
    return painted;
  }

  function getToolPointerPayload(event, refs, trackedByPointer) {
    if (!refs) {
      return null;
    }
    const rect = refs.drawing.getBoundingClientRect();
    const width = Math.max(1, Math.trunc(Number(refs.drawing.width) || 1));
    const height = Math.max(1, Math.trunc(Number(refs.drawing.height) || 1));
    const safeRectWidth = rect.width > 0 ? rect.width : width;
    const safeRectHeight = rect.height > 0 ? rect.height : height;
    const rawX = ((event.clientX - rect.left) / safeRectWidth) * width;
    const rawY = ((event.clientY - rect.top) / safeRectHeight) * height;
    const x = Math.floor(rawX);
    const y = Math.floor(rawY);
    const clampedX = Math.min(width - 1, Math.max(0, x));
    const clampedY = Math.min(height - 1, Math.max(0, y));
    const inside = rawX >= 0 && rawY >= 0 && rawX < width && rawY < height;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const activeTool = getActiveLocalToolRecord();
    return {
      toolId: activeTool?.localId || '',
      pointerId: event.pointerId,
      pointerType: String(event.pointerType || ''),
      button: event.button,
      buttons: event.buttons,
      pressure: Number.isFinite(event.pressure) ? event.pressure : 0,
      isPrimary: Boolean(event.isPrimary),
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      trackedByPointer: Boolean(trackedByPointer),
      now: Date.now(),
      targetId: target ? target.id || '' : '',
      targetClass: target ? sanitizeText(target.className || '', 160) : '',
      client: { x: Math.round(event.clientX), y: Math.round(event.clientY) },
      cell: {
        x,
        y,
        clampedX,
        clampedY,
        inside,
        width,
        height,
      },
    };
  }

  function buildLocalToolSummary() {
    return runtimeState.localToolOrder
      .map(id => runtimeState.localTools.get(id))
      .filter(Boolean)
      .map(tool => ({ id: tool.id, label: tool.label, hint: tool.hint, ownerId: tool.ownerId }));
  }

  function getLocalToolToolbarGlyph(label) {
    const text = sanitizeText(label, 40).trim();
    if (!text) {
      return 'LX';
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return text.replace(/\s+/g, '').slice(0, 2).toUpperCase();
  }

  function renderLocalToolButtons() {
    const ui = runtimeState.ui;
    const toolList = ui?.toolList instanceof HTMLElement ? ui.toolList : null;
    const toolGrid = document.getElementById('toolGrid');
    if (toolList) {
      toolList.innerHTML = '';
    }
    if (toolGrid instanceof HTMLElement) {
      Array.from(toolGrid.querySelectorAll('.local-ext-toolbar-button')).forEach(button => button.remove());
    }
    const tools = runtimeState.localToolOrder
      .map(id => runtimeState.localTools.get(id))
      .filter(Boolean);
    if (!tools.length) {
      if (toolList) {
        const empty = document.createElement('p');
        empty.className = 'help-text local-ext-panel__tool-empty';
        empty.textContent = localizeText(
          '専用パネル内で使う拡張UIを表示できます。',
          'Show extension UI inside the dedicated panel.'
        );
        toolList.appendChild(empty);
      }
      updatePanelVisibility();
      return;
    }
    const fragment = document.createDocumentFragment();
    tools.forEach(tool => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip local-ext-tool-button';
      button.dataset.toolId = tool.id;
      button.textContent = tool.label;
      if (tool.hint) {
        button.title = tool.hint;
      }
      const isActive = runtimeState.activeLocalToolId === tool.id;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.setAttribute(
        'aria-label',
        tool.hint
          ? `${tool.label}: ${tool.hint}`
          : `${tool.label}: ${localizeText('拡張ツール', 'Extension tool')}`
      );
      button.addEventListener('click', () => {
        const currentlyActive = runtimeState.activeLocalToolId === tool.id;
        setActiveLocalToolId(currentlyActive ? '' : tool.id, { notifyRuntime: true });
      });
      fragment.appendChild(button);
    });
    if (toolList) {
      toolList.appendChild(fragment);
    }
    if (toolGrid instanceof HTMLElement) {
      const toolbarFragment = document.createDocumentFragment();
      tools.forEach(tool => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-button local-ext-toolbar-button';
        button.dataset.localExtToolId = tool.id;
        const isActive = runtimeState.activeLocalToolId === tool.id;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
        button.title = tool.hint
          ? `${tool.label} / ${tool.hint}`
          : `${tool.label} / ${localizeText('拡張ツール', 'Extension tool')}`;
        button.setAttribute(
          'aria-label',
          tool.hint
            ? `${tool.label}: ${tool.hint}`
            : `${tool.label}: ${localizeText('拡張ツール', 'Extension tool')}`
        );

        const icon = document.createElement('div');
        icon.className = 'tool-icon local-ext-toolbar-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = getLocalToolToolbarGlyph(tool.label);

        const label = document.createElement('span');
        label.textContent = tool.label;

        button.append(icon, label);
        button.addEventListener('click', () => {
          const currentlyActive = runtimeState.activeLocalToolId === tool.id;
          setActiveLocalToolId(currentlyActive ? '' : tool.id, { notifyRuntime: true });
        });
        toolbarFragment.appendChild(button);
      });
      toolGrid.appendChild(toolbarFragment);
    }
    updatePanelVisibility();
  }

  function renderLocalToolMeta() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.toolMeta instanceof HTMLElement)) {
      return;
    }
    const active = runtimeState.activeLocalToolId
      ? runtimeState.localTools.get(runtimeState.activeLocalToolId)
      : null;
    const activeLabel = active ? active.label : localizeText('なし', 'None');
    const runtime = active ? getRuntimeRecord(active.ownerId) : null;
    const captureLabel = runtime?.captureCanvasPointer ? 'ON' : 'OFF';
    ui.toolMeta.textContent = localizeText(
      `選択中: ${activeLabel} / キャンバス入力取得: ${captureLabel}`,
      `Selected: ${activeLabel} / Canvas Capture: ${captureLabel}`
    );
    updatePanelVisibility();
  }

  function updatePanelVisibility() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    const selected = getSelectedExtension();
    const hasWorkspace = Boolean(selected && selected.enabled);
    const hasTools = runtimeState.localToolOrder.length > 0;
    const hasActiveTool = Boolean(runtimeState.activeLocalToolId);
    if (ui.workspace instanceof HTMLElement) {
      ui.workspace.hidden = !hasWorkspace;
    }
    if (ui.toolBox instanceof HTMLElement) {
      ui.toolBox.hidden = !hasTools;
    }
    if (ui.clearToolButton instanceof HTMLButtonElement) {
      ui.clearToolButton.hidden = !hasActiveTool;
    }
    const hasOutput = Boolean(
      (ui.outputTitle instanceof HTMLElement && ui.outputTitle.dataset.customized)
      || (ui.outputBody instanceof HTMLElement && ui.outputBody.dataset.customized)
    );
    if (ui.output instanceof HTMLElement) {
      ui.output.hidden = !hasOutput;
    }
    if (ui.scriptValue instanceof HTMLElement) {
      ui.scriptValue.hidden = !selected;
    }
  }

  function setActiveLocalToolId(toolId, { notifyRuntime = false } = {}) {
    const next = sanitizeText(toolId, 72).trim();
    const resolved = next && runtimeState.localTools.has(next) ? next : '';
    if (runtimeState.activeLocalToolId === resolved) {
      renderLocalToolButtons();
      renderLocalToolMeta();
      updateLocalInputLayerState();
      return;
    }
    runtimeState.activeLocalToolId = resolved;
    runtimeState.trackedPointerId = null;
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
  }

  function bindBuiltInToolOverride() {
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target ? target.closest('.tool-button') : null;
      if (!(button instanceof HTMLElement) || button.classList.contains('local-ext-toolbar-button')) {
        return;
      }
      if (runtimeState.activeLocalToolId) {
        setActiveLocalToolId('', { notifyRuntime: true });
      }
    }, true);

    const toolGrid = document.getElementById('toolGrid');
    if (!(toolGrid instanceof HTMLElement) || typeof MutationObserver !== 'function') {
      return;
    }
    if (runtimeState.builtInToolObserver instanceof MutationObserver) {
      runtimeState.builtInToolObserver.disconnect();
    }
    runtimeState.builtInToolObserver = new MutationObserver(mutations => {
      if (!runtimeState.activeLocalToolId) {
        return;
      }
      const builtInToolActivated = mutations.some(mutation => {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') {
          return false;
        }
        const target = mutation.target;
        return target instanceof HTMLElement
          && target.matches('.tool-button[data-tool]:not(.local-ext-toolbar-button)')
          && target.classList.contains('is-active');
      });
      if (builtInToolActivated) {
        setActiveLocalToolId('', { notifyRuntime: true });
      }
    });
    runtimeState.builtInToolObserver.observe(toolGrid, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function clearLocalTools({ ownerId = '', notifyRuntime = true } = {}) {
    if (!ownerId) {
      runtimeState.localTools.clear();
      runtimeState.localToolOrder = [];
      runtimeState.activeLocalToolId = '';
      runtimeState.trackedPointerId = null;
    } else {
      runtimeState.localToolOrder = runtimeState.localToolOrder.filter(id => {
        const tool = runtimeState.localTools.get(id);
        if (tool?.ownerId === ownerId) {
          runtimeState.localTools.delete(id);
          return false;
        }
        return true;
      });
      const activeTool = getActiveLocalToolRecord();
      if (activeTool?.ownerId === ownerId) {
        runtimeState.activeLocalToolId = '';
        runtimeState.trackedPointerId = null;
      }
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
  }

  function registerLocalTool(tool, { ownerId = '', notifyRuntime = true } = {}) {
    const normalized = normalizeToolDefinition(tool, ownerId);
    if (!normalized) {
      return false;
    }
    if (!runtimeState.localTools.has(normalized.id)) {
      if (runtimeState.localToolOrder.length >= LOCAL_TOOL_MAX_COUNT) {
        setStatus(
          localizeText(
            `拡張ツールは最大 ${LOCAL_TOOL_MAX_COUNT} 件までです`,
            `Extension tools are limited to ${LOCAL_TOOL_MAX_COUNT}.`
          ),
          'warn'
        );
        return false;
      }
      runtimeState.localToolOrder.push(normalized.id);
    }
    runtimeState.localTools.set(normalized.id, normalized);
    if (!runtimeState.activeLocalToolId) {
      runtimeState.activeLocalToolId = normalized.id;
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    return true;
  }

  function unregisterLocalTool(toolId, { ownerId = '', notifyRuntime = true } = {}) {
    const localId = normalizeToolId(toolId);
    const normalizedId = localId && ownerId ? `${ownerId}::${localId}` : '';
    if (!normalizedId || !runtimeState.localTools.has(normalizedId)) {
      return false;
    }
    runtimeState.localTools.delete(normalizedId);
    runtimeState.localToolOrder = runtimeState.localToolOrder.filter(id => id !== normalizedId);
    if (runtimeState.activeLocalToolId === normalizedId) {
      runtimeState.activeLocalToolId = runtimeState.localToolOrder[0] || '';
      runtimeState.trackedPointerId = null;
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    return true;
  }

  function makeContextSnapshot() {
    const activeToolId = document.querySelector('.tool-button.is-active')?.getAttribute('data-tool') || '';
    const activeLeft = document.querySelector('.rail-tab[data-left-tab][aria-selected="true"]')?.getAttribute('data-left-tab') || '';
    const activeRight = document.querySelector('.rail-tab[data-right-tab][aria-selected="true"]')?.getAttribute('data-right-tab') || '';
    const multiStatusText = (document.getElementById('multiStatus')?.textContent || '').trim();
    const activeLocalTool = getActiveLocalToolRecord();
    const activeRuntime = activeLocalTool ? getRuntimeRecord(activeLocalTool.ownerId) : null;
    return {
      href: window.location.href,
      language: (document.documentElement.lang || 'ja').toLowerCase(),
      now: Date.now(),
      isMobileLayout: document.body.classList.contains('is-mobile-layout'),
      activeTool: activeToolId,
      activeLeftTab: activeLeft,
      activeRightTab: activeRight,
      multiStatus: multiStatusText,
      isMultiActive: !/off|OFF|オフ/.test(multiStatusText),
      localToolCount: runtimeState.localToolOrder.length,
      activeLocalToolId: runtimeState.activeLocalToolId || '',
      localToolCapture: Boolean(activeRuntime?.captureCanvasPointer),
      localPaintPixelCount: runtimeState.localPaintMap.size,
    };
  }

  function setStatus(message, kind = 'info') {
    const ui = runtimeState.ui;
    if (!ui || !(ui.status instanceof HTMLElement)) {
      return;
    }
    ui.status.textContent = sanitizeText(message, 300);
    ui.status.dataset.kind = kind;
  }

  function setOutput(title = '', body = '') {
    const ui = runtimeState.ui;
    if (!ui || !(ui.outputTitle instanceof HTMLElement) || !(ui.outputBody instanceof HTMLElement)) {
      return;
    }
    const nextTitle = sanitizeText(title, 80);
    const nextBody = sanitizeText(body, 1800);
    if (nextTitle) {
      ui.outputTitle.textContent = nextTitle;
      ui.outputTitle.dataset.customized = 'true';
    } else {
      ui.outputTitle.textContent = localizeText('拡張出力', 'Extension Output');
      delete ui.outputTitle.dataset.customized;
    }
    if (nextBody) {
      ui.outputBody.textContent = nextBody;
      ui.outputBody.dataset.customized = 'true';
    } else {
      ui.outputBody.textContent = localizeText(
        '拡張コードから api.panel(title, body) で表示できます。',
        'Display text here from extension code with api.panel(title, body).'
      );
      delete ui.outputBody.dataset.customized;
    }
    updatePanelVisibility();
  }

  function setBadge(text) {
    const ui = runtimeState.ui;
    if (!ui || !(ui.badge instanceof HTMLElement)) {
      return;
    }
    const label = sanitizeText(text, 160);
    ui.badge.textContent = label;
    ui.badge.classList.toggle('is-visible', Boolean(label));
  }

  function syncRuntimeFrameMount(runtime) {
    if (!runtime) {
      return;
    }
    const selected = getSelectedExtension();
    const visibleHost = runtimeState.ui?.workspaceBody instanceof HTMLElement ? runtimeState.ui.workspaceBody : null;
    const hiddenHost = runtimeState.ui?.runtimePool instanceof HTMLElement ? runtimeState.ui.runtimePool : null;
    if (!(runtime.frame instanceof HTMLIFrameElement)) {
      return;
    }
    const host = selected && selected.id === runtime.extensionId && visibleHost
      ? visibleHost
      : hiddenHost;
    if (!(host instanceof HTMLElement)) {
      return;
    }
    if (runtime.frame.parentElement !== host) {
      host.appendChild(runtime.frame);
    }
  }

  function syncRuntimeWorkspaceMount() {
    runtimeState.runtimes.forEach(runtime => {
      syncRuntimeFrameMount(runtime);
    });
  }

  function setRuntimeFrameHeight(runtime, height) {
    if (!(runtime?.frame instanceof HTMLIFrameElement)) {
      return;
    }
    const nextHeight = Math.round(clampNumber(height, SANDBOX_FRAME_MIN_HEIGHT, SANDBOX_FRAME_MAX_HEIGHT));
    if (runtime.frameHeight === nextHeight && runtime.frame.style.height === `${nextHeight}px`) {
      return;
    }
    runtime.frameHeight = nextHeight;
    runtime.frame.style.height = `${nextHeight}px`;
  }

  function postSandboxRequestResult(runtime, requestId, ok, payload = {}) {
    const id = sanitizeText(requestId, 120).trim();
    if (!id) {
      return;
    }
    postToRuntime(runtime, 'request-result', {
      payload: {
        id,
        ok: Boolean(ok),
        ...(payload && typeof payload === 'object' ? payload : {}),
      },
    });
  }

  function destroySandboxFrame(runtime) {
    if (runtime?.frame instanceof HTMLIFrameElement) {
      runtime.frame.remove();
    }
    if (runtime) {
      runtime.frame = null;
      runtime.frameReady = false;
      runtime.messageQueue = [];
    }
  }

  function ensureSandboxFrame(runtime) {
    if (!runtime) {
      return null;
    }
    if (runtime.frame instanceof HTMLIFrameElement) {
      syncRuntimeFrameMount(runtime);
      setRuntimeFrameHeight(runtime, runtime.frameHeight);
      return runtime.frame;
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'local-ext-runtime-frame';
    iframe.setAttribute('title', 'Extension sandbox');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.srcdoc = SANDBOX_SRC;
    iframe.addEventListener('load', () => {
      runtime.frameReady = true;
      setRuntimeFrameHeight(runtime, runtime.frameHeight);
      flushQueuedMessages(runtime);
    });
    runtime.frame = iframe;
    runtime.frameReady = false;
    runtime.messageQueue = [];
    syncRuntimeFrameMount(runtime);
    setRuntimeFrameHeight(runtime, runtime.frameHeight);
    return iframe;
  }

  function postToRuntime(runtime, type, payload = {}) {
    const frame = ensureSandboxFrame(runtime);
    const targetWindow = frame.contentWindow;
    const packet = {
      __pixieLocalHost: 1,
      type,
      ...payload,
    };
    if (!runtime?.frameReady || !targetWindow) {
      runtime.messageQueue.push(packet);
      return;
    }
    targetWindow.postMessage(packet, '*');
  }

  function flushQueuedMessages(runtime) {
    const frame = runtime?.frame;
    const targetWindow = frame instanceof HTMLIFrameElement ? frame.contentWindow : null;
    if (!(frame instanceof HTMLIFrameElement) || !targetWindow || !runtime?.frameReady) {
      return;
    }
    const queued = runtime.messageQueue.slice();
    runtime.messageQueue = [];
    queued.forEach(packet => {
      targetWindow.postMessage(packet, '*');
    });
  }

  function stopExtensionRuntime(extensionId) {
    const runtime = runtimeState.runtimes.get(extensionId);
    if (!runtime) {
      return;
    }
    if (runtime.frame instanceof HTMLIFrameElement && runtime.frameReady) {
      postToRuntime(runtime, 'unload');
    }
    destroySandboxFrame(runtime);
    if (runtime.intervalTimer !== null) {
      window.clearInterval(runtime.intervalTimer);
      runtime.intervalTimer = null;
    }
    runtime.captureCanvasPointer = false;
    clearLocalTools({ ownerId: extensionId, notifyRuntime: false });
    clearLocalPaintPixels(extensionId);
    updateLocalInputLayerState();
    setBadge('');
    setOutput('', '');
    runtimeState.runtimes.delete(extensionId);
    updatePanelVisibility();
  }

  function dispatchEventToRuntime(extensionId, name, payload) {
    const extension = getExtensionById(extensionId);
    const runtime = runtimeState.runtimes.get(extensionId);
    if (!extension?.enabled || !runtime) {
      return;
    }
    postToRuntime(runtime, 'event', {
      name,
      payload,
    });
  }

  function startExtensionRuntime(extensionId) {
    const extension = getExtensionById(extensionId);
    if (!extension?.enabled) {
      return;
    }
    const runtime = getRuntimeRecord(extensionId);
    const code = String(extension.code || '').trim();
    if (!code) {
      setStatus(localizeText('拡張コードが空です', 'Extension code is empty'), 'warn');
      setBadge('');
      return;
    }
    stopExtensionRuntime(extensionId);
    const freshRuntime = getRuntimeRecord(extensionId);
    syncLocalCanvasGeometry();
    ensureSandboxFrame(freshRuntime);
    postToRuntime(freshRuntime, 'load', {
      code,
      context: makeContextSnapshot(),
    });
    dispatchEventToRuntime(extensionId, 'context', makeContextSnapshot());
    if (freshRuntime.intervalTimer !== null) {
      window.clearInterval(freshRuntime.intervalTimer);
    }
    freshRuntime.intervalTimer = window.setInterval(() => {
      syncLocalCanvasGeometry();
      const snapshot = makeContextSnapshot();
      dispatchEventToRuntime(extensionId, 'context', snapshot);
      dispatchEventToRuntime(extensionId, 'interval', {
        now: Date.now(),
        context: snapshot,
      });
    }, 1500);
    syncRuntimeWorkspaceMount();
  }

  function syncAllExtensionRuntimes() {
    runtimeState.extensions.forEach(extension => {
      if (extension.enabled) {
        startExtensionRuntime(extension.id);
      } else {
        stopExtensionRuntime(extension.id);
      }
    });
    Array.from(runtimeState.runtimes.keys()).forEach(extensionId => {
      if (!getExtensionById(extensionId)?.enabled) {
        stopExtensionRuntime(extensionId);
      }
    });
    renderExtensionCatalogUi();
    syncRuntimeWorkspaceMount();
  }

  function setSelectedExtensionEnabled(enabled) {
    const selected = getSelectedExtension();
    if (!selected) {
      return;
    }
    toggleExtensionEnabled(selected.id, enabled);
  }

  function maybeDispatchToolPointerEvent(event, phase) {
    const activeTool = getActiveLocalToolRecord();
    if (!activeTool) {
      return false;
    }
    const refs = getCanvasDomRefs();
    if (!refs) {
      return false;
    }
    const targetNode = event.target instanceof Node ? event.target : null;
    const isInViewport = targetNode ? refs.viewport.contains(targetNode) : false;
    const isTracked = runtimeState.trackedPointerId !== null && event.pointerId === runtimeState.trackedPointerId;
    if (phase === 'pointerdown' && !isInViewport) {
      return false;
    }
    if (phase !== 'pointerdown' && !isInViewport && !isTracked) {
      return false;
    }
    ensureLocalOverlayCanvas();
    syncLocalCanvasGeometry();
    const payload = getToolPointerPayload(event, refs, isTracked);
    if (!payload) {
      return false;
    }
    dispatchEventToRuntime(activeTool.ownerId, `tool:${phase}`, payload);
    if (phase === 'pointerdown' && (isInViewport || payload.cell.inside)) {
      runtimeState.trackedPointerId = event.pointerId;
      const layer = runtimeState.localInputLayer;
      if (shouldCaptureCanvasPointer() && layer instanceof HTMLDivElement && event.target === layer && typeof layer.setPointerCapture === 'function') {
        try {
          layer.setPointerCapture(event.pointerId);
        } catch (error) {
          // ignore
        }
      }
    }
    if (phase === 'pointerup' || phase === 'pointercancel') {
      const layer = runtimeState.localInputLayer;
      if (isTracked && layer instanceof HTMLDivElement && typeof layer.releasePointerCapture === 'function') {
        try {
          if (typeof layer.hasPointerCapture === 'function' && layer.hasPointerCapture(event.pointerId)) {
            layer.releasePointerCapture(event.pointerId);
          }
        } catch (error) {
          // ignore
        }
      }
      if (runtimeState.trackedPointerId === event.pointerId) {
        runtimeState.trackedPointerId = null;
      }
    }
    const captured = shouldCaptureCanvasPointer() && (isInViewport || isTracked);
    if (captured) {
      event.preventDefault();
      event.stopPropagation();
    }
    return captured;
  }

  function replyRetiredAiRequest(payload, sourceWindow) {
    const requestId = sanitizeText(payload?.id || '', 120);
    const runtime = getRuntimeBySourceWindow(sourceWindow);
    const frame = runtime?.frame;
    if (!requestId || !(frame instanceof HTMLIFrameElement)) {
      return;
    }
    postToRuntime(runtime, 'ai-result', {
      payload: {
        id: requestId,
        ok: false,
        message: localizeText(
          'PiXiEEDraw の GPT連携は廃止されました',
          'PiXiEEDraw local AI integration has been retired'
        ),
      },
    });
  }

  function bindGlobalEvents() {
    window.addEventListener('message', event => {
      const runtime = getRuntimeBySourceWindow(event.source);
      if (!runtime) {
        return;
      }
      const data = event.data;
      if (!data || data.__pixieLocalExt !== 1) {
        return;
      }
      if (data.type === 'ready') {
        flushQueuedMessages(runtime);
        return;
      }
      if (data.type === 'ai-request') {
        replyRetiredAiRequest(data.payload && typeof data.payload === 'object' ? data.payload : {}, event.source);
        return;
      }
      if (data.type === 'disabled-capability') {
        notifyPanelOnlyCapability(data.payload && data.payload.name ? data.payload.name : 'API');
        return;
      }
      if (data.type === 'layout') {
        const height = Number(data.payload && data.payload.height);
        if (Number.isFinite(height)) {
          setRuntimeFrameHeight(runtime, height + 2);
        }
        return;
      }
      if (data.type === 'storage-get') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const fallback = Object.prototype.hasOwnProperty.call(payload, 'fallback') ? payload.fallback : null;
        const value = readPluginStorageValue(runtime.extensionId, payload.key, fallback);
        postSandboxRequestResult(runtime, payload.id, true, { value });
        return;
      }
      if (data.type === 'storage-set') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const ok = writePluginStorageValue(runtime.extensionId, payload.key, payload.value);
        postSandboxRequestResult(
          runtime,
          payload.id,
          ok,
          ok ? {} : {
            message: localizeText('ローカル保存に失敗しました', 'Failed to save extension data'),
          }
        );
        return;
      }
      if (data.type === 'storage-remove') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        const ok = removePluginStorageValue(runtime.extensionId, payload.key);
        postSandboxRequestResult(
          runtime,
          payload.id,
          ok,
          ok ? {} : {
            message: localizeText('ローカル保存の削除に失敗しました', 'Failed to remove extension data'),
          }
        );
        return;
      }
      if (data.type === 'tool-register') {
        const tool = data.payload && typeof data.payload === 'object' ? data.payload.tool : null;
        registerLocalTool(tool, { ownerId: runtime.extensionId, notifyRuntime: false });
        return;
      }
      if (data.type === 'tool-unregister') {
        unregisterLocalTool(data.payload && data.payload.id ? data.payload.id : '', { ownerId: runtime.extensionId, notifyRuntime: false });
        return;
      }
      if (data.type === 'tools-clear') {
        clearLocalTools({ ownerId: runtime.extensionId, notifyRuntime: false });
        return;
      }
      if (data.type === 'tool-activate') {
        const localId = normalizeToolId(data.payload && data.payload.id ? data.payload.id : '');
        setActiveLocalToolId(localId ? `${runtime.extensionId}::${localId}` : '', { notifyRuntime: false });
        return;
      }
      if (data.type === 'pointer-capture') {
        runtime.captureCanvasPointer = Boolean(data.payload && data.payload.enabled);
        runtimeState.trackedPointerId = null;
        renderLocalToolMeta();
        updateLocalInputLayerState();
        return;
      }
      if (data.type === 'local-paint') {
        const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        paintLocalPixels(runtime.extensionId, payload.pixels, payload.color);
        return;
      }
      if (data.type === 'local-paint-clear') {
        clearLocalPaintPixels(runtime.extensionId);
        return;
      }
      if (data.type === 'status') {
        const ok = Boolean(data.payload && data.payload.ok);
        const message = sanitizeText(data.payload && data.payload.message ? data.payload.message : '', 320);
        setStatus(
          message || localizeText(ok ? '読み込み完了' : 'エラー', ok ? 'Loaded' : 'Error'),
          ok ? 'success' : 'error'
        );
        return;
      }
      if (data.type === 'toast') {
        const message = sanitizeText(data.payload && data.payload.message ? data.payload.message : '', 300);
        const level = sanitizeText(data.payload && data.payload.level ? data.payload.level : 'info', 16);
        setStatus(message, level === 'success' ? 'success' : (level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info')));
        return;
      }
      if (data.type === 'badge') {
        setBadge(data.payload && data.payload.text ? data.payload.text : '');
        return;
      }
      if (data.type === 'panel') {
        const title = data.payload && data.payload.title ? data.payload.title : '';
        const body = data.payload && data.payload.body ? data.payload.body : '';
        setOutput(title, body);
        return;
      }
      if (data.type === 'log') {
        const values = Array.isArray(data.payload && data.payload.values) ? data.payload.values : [];
        if (values.length) {
          setStatus(values.join(' | '), 'info');
        }
      }
    });
  }

  function buildUi() {
    const extensionsBody = document.querySelector('#panelExtensions .panel-section__body');
    if (!(extensionsBody instanceof HTMLElement)) {
      return null;
    }

    const panel = document.createElement('div');
    panel.className = 'field field--list local-ext-panel';
    panel.id = 'localExtensionPanel';

    const title = document.createElement('div');
    title.className = 'local-ext-panel__title';
    title.textContent = localizeText('拡張機能', 'Extension');
    panel.appendChild(title);

    const body = document.createElement('div');
    body.className = 'local-ext-panel__body';

    const description = document.createElement('p');
    description.className = 'help-text ui-guide-text';
    description.textContent = localizeText(
      'sandbox 内で拡張ファイルを実行します。同じ `.js` を共有すれば他の人も同じ機能を再現できます。拡張は独自UIに加えて、公開API経由で既存ツール欄やキャンバス入力にも参加できます。ただし共有状態の直接変更や外部サイト・Supabase への接続はできません。',
      'Extension files run inside a sandbox. Share the same `.js` file and others can reproduce the same feature set. Extensions can build custom UI and, through the public host API, join the existing toolbar and canvas input flow. Direct shared-state mutation and external or Supabase access stay blocked.'
    );
    body.appendChild(description);

    const row = document.createElement('div');
    row.className = 'local-ext-panel__row';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-option';
    toggleLabel.setAttribute('for', 'localExtensionEnabled');
    const enabled = document.createElement('input');
    enabled.id = 'localExtensionEnabled';
    enabled.type = 'checkbox';
    const toggleText = document.createElement('span');
    toggleText.textContent = localizeText('有効化', 'Enable');
    toggleLabel.append(enabled, toggleText);
    row.appendChild(toggleLabel);
    body.appendChild(row);

    const scriptField = document.createElement('div');
    scriptField.className = 'local-ext-panel__field';

    const scriptLabel = document.createElement('span');
    scriptLabel.className = 'local-ext-panel__script-label';
    scriptLabel.textContent = localizeText('拡張ファイル', 'Extension File');

    const scriptValue = document.createElement('div');
    scriptValue.className = 'local-ext-panel__script-value';
    scriptValue.textContent = getBoundScriptLabel();
    scriptValue.dataset.empty = 'true';

    const scriptHint = document.createElement('p');
    scriptHint.className = 'help-text local-ext-panel__script-hint';
    scriptHint.textContent = canUseScriptFileSystem()
      ? localizeText(
        '作成または選択した `.js` を外部エディタで保存すると自動反映します。共有時はこのファイルをそのまま渡せます。',
        'Save the created or selected `.js` in an external editor to auto-apply changes. Share this file as-is to reuse the same feature.'
      )
      : localizeText(
        '既存の `.js` を選んで使えます。更新後はもう一度選び直してください。共有時も同じ `.js` を配れば使えます。',
        'You can use an existing `.js` file here. Re-select it after editing to update it. Distribute the same `.js` file to share the feature.'
      );

    scriptField.append(scriptLabel, scriptValue, scriptHint);
    body.appendChild(scriptField);

    const code = document.createElement('textarea');
    code.id = 'localExtensionCode';
    code.className = 'local-ext-panel__code';
    code.spellcheck = false;
    code.readOnly = true;
    code.placeholder = localizeText('ここに現在のスクリプトが表示されます', 'The current script is shown here');
    code.hidden = true;
    body.appendChild(code);

    const scriptFileInput = document.createElement('input');
    scriptFileInput.type = 'file';
    scriptFileInput.accept = '.js,.txt,text/javascript,text/plain';
    scriptFileInput.hidden = true;
    scriptFileInput.id = 'localExtensionScriptFile';
    body.appendChild(scriptFileInput);

    const actions = document.createElement('div');
    actions.className = 'local-ext-panel__actions';

    const createScriptButton = document.createElement('button');
    createScriptButton.type = 'button';
    createScriptButton.className = 'button button--primary';
    createScriptButton.textContent = localizeText('拡張ファイルを作る', 'Create Extension File');

    const chooseScriptButton = document.createElement('button');
    chooseScriptButton.type = 'button';
    chooseScriptButton.className = 'button';
    chooseScriptButton.textContent = localizeText('既存ファイルを選ぶ', 'Choose Existing File');

    actions.append(createScriptButton, chooseScriptButton);
    body.appendChild(actions);

    const extensionSection = document.createElement('div');
    extensionSection.className = 'local-ext-panel__subsection';

    const extensionSectionTitle = document.createElement('div');
    extensionSectionTitle.className = 'local-ext-panel__section-title';
    extensionSectionTitle.textContent = localizeText('保存済み拡張機能', 'Installed Extensions');

    const extensionList = document.createElement('div');
    extensionList.className = 'local-ext-panel__extension-list';

    extensionSection.append(extensionSectionTitle, extensionList);
    body.appendChild(extensionSection);

    const runtimePool = document.createElement('div');
    runtimePool.className = 'local-ext-panel__runtime-pool';
    runtimePool.hidden = true;
    body.appendChild(runtimePool);

    const workspace = document.createElement('div');
    workspace.className = 'local-ext-panel__workspace';
    workspace.hidden = true;

    const workspaceTitle = document.createElement('div');
    workspaceTitle.className = 'local-ext-panel__workspace-title';
    workspaceTitle.textContent = localizeText('拡張UI', 'Extension UI');

    const workspaceBody = document.createElement('div');
    workspaceBody.className = 'local-ext-panel__workspace-body';

    workspace.append(workspaceTitle, workspaceBody);
    body.appendChild(workspace);

    const toolBox = document.createElement('div');
    toolBox.className = 'local-ext-panel__tools';
    toolBox.hidden = true;

    const toolHeading = document.createElement('div');
    toolHeading.className = 'local-ext-panel__tools-heading';
    toolHeading.textContent = localizeText('拡張ツール', 'Extension Tools');

    const clearToolButton = document.createElement('button');
    clearToolButton.type = 'button';
    clearToolButton.className = 'chip';
    clearToolButton.textContent = localizeText('選択解除', 'Clear Selection');

    const toolHeadingActions = document.createElement('div');
    toolHeadingActions.className = 'local-ext-panel__tools-actions';
    toolHeadingActions.appendChild(clearToolButton);

    const toolHeadingRow = document.createElement('div');
    toolHeadingRow.className = 'local-ext-panel__tools-row';
    toolHeadingRow.append(toolHeading, toolHeadingActions);

    const toolList = document.createElement('div');
    toolList.className = 'local-ext-panel__tool-list';

    const toolMeta = document.createElement('p');
    toolMeta.className = 'help-text local-ext-panel__tool-meta';

    toolBox.append(toolHeadingRow, toolList, toolMeta);
    body.appendChild(toolBox);

    const status = document.createElement('p');
    status.className = 'help-text local-ext-panel__status';
    status.id = 'localExtensionStatus';
    status.setAttribute('aria-live', 'polite');
    body.appendChild(status);

    const output = document.createElement('div');
    output.className = 'local-ext-panel__output';
    output.hidden = true;
    const outputTitle = document.createElement('div');
    outputTitle.className = 'local-ext-panel__output-title';
    outputTitle.textContent = localizeText('拡張出力', 'Extension Output');
    const outputBody = document.createElement('div');
    outputBody.className = 'local-ext-panel__output-body';
    outputBody.textContent = localizeText(
      '拡張コードから api.panel(title, body) で表示できます。',
      'Display text here from extension code with api.panel(title, body).'
    );
    output.append(outputTitle, outputBody);
    body.appendChild(output);

    panel.appendChild(body);
    extensionsBody.prepend(panel);

    return {
      panel,
      title,
      description,
      enabled,
      toggleText,
      scriptLabel,
      scriptValue,
      scriptHint,
      code,
      scriptFileInput,
      createScriptButton,
      chooseScriptButton,
      extensionSectionTitle,
      extensionList,
      runtimePool,
      workspace,
      workspaceTitle,
      workspaceBody,
      toolBox,
      toolHeading,
      clearToolButton,
      toolList,
      toolMeta,
      status,
      output,
      outputTitle,
      outputBody,
      badge: null,
    };
  }

  function applyUiLocalization() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    if (ui.title instanceof HTMLElement) {
      ui.title.textContent = localizeText('拡張機能', 'Extension');
    }
    if (ui.description instanceof HTMLElement) {
      ui.description.textContent = localizeText(
        'sandbox 内で拡張ファイルを実行します。同じ `.js` を共有すれば他の人も同じ機能を再現できます。拡張は独自UIに加えて、公開API経由で既存ツール欄やキャンバス入力にも参加できます。ただし共有状態の直接変更や外部サイト・Supabase への接続はできません。',
        'Extension files run inside a sandbox. Share the same `.js` file and others can reproduce the same feature set. Extensions can build custom UI and, through the public host API, join the existing toolbar and canvas input flow. Direct shared-state mutation and external or Supabase access stay blocked.'
      );
    }
    if (ui.toggleText instanceof HTMLElement) {
      ui.toggleText.textContent = localizeText('有効化', 'Enable');
    }
    if (ui.code instanceof HTMLTextAreaElement) {
      ui.code.placeholder = localizeText('ここに現在のスクリプトが表示されます', 'The current script is shown here');
    }
    if (ui.scriptLabel instanceof HTMLElement) {
      ui.scriptLabel.textContent = localizeText('拡張ファイル', 'Extension File');
    }
    refreshScriptBindingUi();
    if (ui.scriptHint instanceof HTMLElement) {
      ui.scriptHint.textContent = canUseScriptFileSystem()
        ? localizeText(
          '作成または選択した `.js` を外部エディタで保存すると自動反映します。共有時はこのファイルをそのまま渡せます。',
          'Save the created or selected `.js` in an external editor to auto-apply changes. Share this file as-is to reuse the same feature.'
        )
        : localizeText(
          '既存の `.js` を選んで使えます。更新後はもう一度選び直してください。共有時も同じ `.js` を配れば使えます。',
          'You can use an existing `.js` file here. Re-select it after editing to update it. Distribute the same `.js` file to share the feature.'
        );
    }
    if (ui.createScriptButton instanceof HTMLButtonElement) {
      ui.createScriptButton.textContent = localizeText('拡張ファイルを作る', 'Create Extension File');
      ui.createScriptButton.hidden = !canUseScriptFileSystem();
    }
    if (ui.chooseScriptButton instanceof HTMLButtonElement) {
      ui.chooseScriptButton.textContent = localizeText('既存ファイルを選ぶ', 'Choose Existing File');
    }
    if (ui.extensionSectionTitle instanceof HTMLElement) {
      ui.extensionSectionTitle.textContent = localizeText('保存済み拡張機能', 'Installed Extensions');
    }
    refreshSelectedExtensionUi();
    if (ui.toolHeading instanceof HTMLElement) {
      ui.toolHeading.textContent = localizeText('拡張ツール', 'Extension Tools');
    }
    if (ui.clearToolButton instanceof HTMLButtonElement) {
      ui.clearToolButton.textContent = localizeText('選択解除', 'Clear Selection');
    }
    if (ui.outputTitle instanceof HTMLElement && !ui.outputTitle.dataset.customized) {
      ui.outputTitle.textContent = localizeText('拡張出力', 'Extension Output');
    }
    if (ui.outputBody instanceof HTMLElement && !ui.outputBody.dataset.customized) {
      ui.outputBody.textContent = localizeText(
        '拡張コードから api.panel(title, body) で表示できます。',
        'Display text here from extension code with api.panel(title, body).'
      );
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    renderExtensionCatalogUi();
    updatePanelVisibility();
  }

  function hydrateUi() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    clearRetiredAiStorage();
    runtimeState.extensions = buildInitialExtensionsState();
    runtimeState.selectedExtensionId = runtimeState.extensions[0]?.id || '';
    refreshSelectedExtensionUi();
    applyUiLocalization();
    refreshScriptBindingUi();

    ui.enabled.addEventListener('change', () => {
      setSelectedExtensionEnabled(ui.enabled.checked);
    });

    ui.createScriptButton.addEventListener('click', async () => {
      await createTemplateScriptFile();
    });

    ui.chooseScriptButton.addEventListener('click', async () => {
      if (canUseScriptFileSystem()) {
        const picked = await pickScriptFileHandle();
        if (picked) {
          return;
        }
      }
      if (ui.scriptFileInput instanceof HTMLInputElement) {
        ui.scriptFileInput.click();
      }
    });

    ui.scriptFileInput.addEventListener('change', async () => {
      const file = ui.scriptFileInput.files && ui.scriptFileInput.files[0] ? ui.scriptFileInput.files[0] : null;
      if (file) {
        await importScriptFile(file);
      }
      ui.scriptFileInput.value = '';
    });

    ui.clearToolButton.addEventListener('click', () => {
      setActiveLocalToolId('', { notifyRuntime: true });
      setStatus(localizeText('拡張ツールの選択を解除しました', 'Cleared extension tool selection'), 'info');
    });

    renderLocalToolButtons();
    renderLocalToolMeta();
    renderExtensionCatalogUi();
    updateLocalInputLayerState();
    updatePanelVisibility();
  }

  function init() {
    clearRetiredAiStorage();
    const ui = buildUi();
    if (!ui) {
      return;
    }
    runtimeState.ui = ui;
    hydrateUi();
    window.addEventListener('pixieedraw:uilanguagechange', () => {
      applyUiLocalization();
    });
    bindGlobalEvents();
    bindBuiltInToolOverride();
    syncAllExtensionRuntimes();
    if (!runtimeState.extensions.length) {
      setStatus(localizeText('拡張機能はまだありません', 'No extensions installed yet'), 'info');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
