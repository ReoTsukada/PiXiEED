(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const STORAGE_KEY_ENABLED = 'pixieedraw:local-extension:enabled';
  const STORAGE_KEY_CODE = 'pixieedraw:local-extension:code';
  const STORAGE_KEY_OPEN = 'pixieedraw:local-extension:open';
  const STORAGE_KEY_AI_ENABLED = 'pixieedraw:local-extension:ai-enabled';
  const STORAGE_KEY_AI_ENDPOINT = 'pixieedraw:local-extension:ai-endpoint';
  const STORAGE_KEY_AI_API_FORMAT = 'pixieedraw:local-extension:ai-api-format';
  const STORAGE_KEY_AI_API_KEY = 'pixieedraw:local-extension:ai-api-key';
  const STORAGE_KEY_AI_MODEL = 'pixieedraw:local-extension:ai-model';
  const STORAGE_KEY_AI_SYSTEM_PROMPT = 'pixieedraw:local-extension:ai-system-prompt';
  const STORAGE_KEY_AI_LAST_PROMPT = 'pixieedraw:local-extension:ai-last-prompt';
  const STORAGE_KEY_AI_CODE_PRESET = 'pixieedraw:local-extension:ai-code-preset';
  const AI_API_FORMAT_RESPONSES = 'responses';
  const AI_API_FORMAT_CHAT_COMPLETIONS = 'chat-completions';
  const AI_CODE_PRESET_EXTENSION_BUILDER = 'pixieedraw-extension-builder';
  const AI_DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';
  const AI_DEFAULT_MODEL = 'gpt-5';
  const AI_DEFAULT_CODE_PRESET = AI_CODE_PRESET_EXTENSION_BUILDER;
  const AI_REQUEST_TIMEOUT_MS = 45000;
  const AI_MAX_INPUT_LENGTH = 16000;
  const AI_MAX_INSTRUCTIONS_LENGTH = 8000;
  const LOCAL_TOOL_MAX_COUNT = 24;
  const LOCAL_PAINT_BATCH_MAX = 32768;

  const runtimeState = {
    enabled: false,
    code: '',
    aiConfig: {
      enabled: false,
      endpoint: AI_DEFAULT_ENDPOINT,
      apiFormat: AI_API_FORMAT_RESPONSES,
      apiKey: '',
      model: AI_DEFAULT_MODEL,
      systemPrompt: '',
      lastPrompt: '',
      codePreset: AI_DEFAULT_CODE_PRESET,
    },
    aiBusyCount: 0,
    frame: null,
    frameReady: false,
    messageQueue: [],
    intervalTimer: null,
    ui: null,
    localTools: new Map(),
    localToolOrder: [],
    activeLocalToolId: '',
    captureCanvasPointer: false,
    trackedPointerId: null,
    localOverlayCanvas: null,
    localOverlayCtx: null,
    localInputLayer: null,
    localOverlayObserver: null,
    localPaintMap: new Map(),
  };

  function isEnglishUi() {
    const lang = String(document?.documentElement?.lang || 'ja').toLowerCase();
    return lang.startsWith('en');
  }

  function localizeText(jaText, enText) {
    return isEnglishUi() ? enText : jaText;
  }

  function buildTemplateCode() {
    return [
      "api.on('init', (ctx) => {",
      `  api.toast(${JSON.stringify(localizeText('ローカル拡張を起動しました', 'Local extension started'))}, 'success');`,
      "  api.badge('Local Ext ON');",
      `  api.panel(${JSON.stringify(localizeText('ローカル拡張', 'Local Extension'))}, ${JSON.stringify(localizeText('この表示はあなたの端末だけです。', 'This panel is visible only on your device.'))});`,
      `  api.registerTool({ id: 'stamp8', label: '8x8 Stamp', hint: ${JSON.stringify(localizeText('ローカル描画だけ実行', 'Runs local-only painting'))} });`,
      "  api.activateTool('stamp8');",
      "  api.capturePointer(true);",
      '});',
      '',
      "api.on('tool:pointerdown', (event) => {",
      "  if (event.toolId !== 'stamp8' || !event.cell || !event.cell.inside) return;",
      "  const { x, y } = event.cell;",
      "  const pixels = [];",
      "  for (let py = 0; py < 8; py += 1) {",
      "    for (let px = 0; px < 8; px += 1) {",
      "      pixels.push({ x: x + px, y: y + py });",
      '    }',
      '  }',
      "  api.drawPixels(pixels, { r: 88, g: 196, b: 255, a: 180 });",
      `  api.toast(${JSON.stringify(localizeText('8x8 ローカル描画', '8x8 local paint'))}, 'info');`,
      '});',
      '',
      "api.on('keydown', (event) => {",
      "  if (event.key === 'F8') {",
      `    api.toast(${JSON.stringify(localizeText('F8 が押されました', 'F8 pressed'))}, 'info');`,
      "    api.clearPixels();",
      '  }',
      '});',
    ].join('\n');
  }

  const SANDBOX_SRC = String.raw`<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script>
(() => {
  const HOST_MARK = '__pixieLocalHost';
  const EXT_MARK = '__pixieLocalExt';
  const handlers = new Map();
  const pendingRequests = new Map();
  let requestSeq = 0;
  let latestContext = Object.freeze({});

  function post(type, payload) {
    parent.postMessage({ [EXT_MARK]: 1, type, payload }, '*');
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
    },
    unregisterTool(id) {
      post('tool-unregister', { id: String(id || '') });
    },
    clearTools() {
      post('tools-clear', {});
    },
    activateTool(id) {
      post('tool-activate', { id: String(id || '') });
    },
    capturePointer(enabled = true) {
      post('pointer-capture', { enabled: Boolean(enabled) });
    },
    drawPixels(pixels, color) {
      post('local-paint', { pixels, color });
    },
    clearPixels() {
      post('local-paint-clear', {});
    },
    getContext() {
      return latestContext;
    },
    ai: Object.freeze({
      request(options = {}) {
        return request('ai-request', { request: options });
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
      try {
        const fn = new Function('api', '"use strict";\n' + String(data.code || '') + '\n//# sourceURL=pixieed-local-extension.js');
        fn(api);
        emit('init', latestContext);
        post('status', { ok: true, message: 'Local extension loaded' });
      } catch (error) {
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
      post('status', { ok: true, message: 'Local extension stopped' });
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

  function sanitizeUrl(value, limit = 600) {
    return String(value || '').trim().slice(0, limit);
  }

  function normalizeAiApiFormat(value) {
    return value === AI_API_FORMAT_CHAT_COMPLETIONS
      ? AI_API_FORMAT_CHAT_COMPLETIONS
      : AI_API_FORMAT_RESPONSES;
  }

  function normalizeAiCodePreset(value) {
    return value === AI_CODE_PRESET_EXTENSION_BUILDER ? AI_CODE_PRESET_EXTENSION_BUILDER : '';
  }

  function normalizeAiConfig(source) {
    const config = source && typeof source === 'object' ? source : {};
    return {
      enabled: Boolean(config.enabled),
      endpoint: sanitizeUrl(config.endpoint || AI_DEFAULT_ENDPOINT, 600) || AI_DEFAULT_ENDPOINT,
      apiFormat: normalizeAiApiFormat(config.apiFormat),
      apiKey: sanitizeText(config.apiKey || '', 600),
      model: sanitizeText(config.model || AI_DEFAULT_MODEL, 120) || AI_DEFAULT_MODEL,
      systemPrompt: sanitizeMultilineText(config.systemPrompt || '', AI_MAX_INSTRUCTIONS_LENGTH),
      lastPrompt: sanitizeMultilineText(config.lastPrompt || '', 4000),
      codePreset: normalizeAiCodePreset(config.codePreset || AI_DEFAULT_CODE_PRESET),
    };
  }

  function loadAiConfigFromStorage() {
    return normalizeAiConfig({
      enabled: readStorage(STORAGE_KEY_AI_ENABLED, '0') === '1',
      endpoint: readStorage(STORAGE_KEY_AI_ENDPOINT, AI_DEFAULT_ENDPOINT),
      apiFormat: readStorage(STORAGE_KEY_AI_API_FORMAT, AI_API_FORMAT_RESPONSES),
      apiKey: readStorage(STORAGE_KEY_AI_API_KEY, ''),
      model: readStorage(STORAGE_KEY_AI_MODEL, AI_DEFAULT_MODEL),
      systemPrompt: readStorage(STORAGE_KEY_AI_SYSTEM_PROMPT, ''),
      lastPrompt: readStorage(STORAGE_KEY_AI_LAST_PROMPT, ''),
      codePreset: readStorage(STORAGE_KEY_AI_CODE_PRESET, AI_DEFAULT_CODE_PRESET),
    });
  }

  function persistAiConfig(config) {
    const normalized = normalizeAiConfig(config);
    runtimeState.aiConfig = normalized;
    writeStorage(STORAGE_KEY_AI_ENABLED, normalized.enabled ? '1' : '0');
    writeStorage(STORAGE_KEY_AI_ENDPOINT, normalized.endpoint);
    writeStorage(STORAGE_KEY_AI_API_FORMAT, normalized.apiFormat);
    if (normalized.apiKey) {
      writeStorage(STORAGE_KEY_AI_API_KEY, normalized.apiKey);
    } else {
      removeStorage(STORAGE_KEY_AI_API_KEY);
    }
    writeStorage(STORAGE_KEY_AI_MODEL, normalized.model);
    if (normalized.systemPrompt) {
      writeStorage(STORAGE_KEY_AI_SYSTEM_PROMPT, normalized.systemPrompt);
    } else {
      removeStorage(STORAGE_KEY_AI_SYSTEM_PROMPT);
    }
    if (normalized.lastPrompt) {
      writeStorage(STORAGE_KEY_AI_LAST_PROMPT, normalized.lastPrompt);
    } else {
      removeStorage(STORAGE_KEY_AI_LAST_PROMPT);
    }
    if (normalized.codePreset) {
      writeStorage(STORAGE_KEY_AI_CODE_PRESET, normalized.codePreset);
    } else {
      removeStorage(STORAGE_KEY_AI_CODE_PRESET);
    }
    return normalized;
  }

  function parseHostLabel(value) {
    try {
      return new URL(String(value || '')).host || '';
    } catch (error) {
      return '';
    }
  }

  function buildAiContextSnapshot() {
    const config = normalizeAiConfig(runtimeState.aiConfig);
    return {
      enabled: config.enabled,
      apiFormat: config.apiFormat,
      model: config.model,
      endpointHost: parseHostLabel(config.endpoint),
      hasApiKey: Boolean(config.apiKey),
    };
  }

  function buildAiCodeWriterSystemPrompt() {
    return localizeText(
      [
        'あなたは PiXiEEDraw のローカル拡張を書く JavaScript エンジニアです。',
        '返答は JavaScript コードのみで、Markdown の ``` は使わないでください。',
        'import / export は使わず、グローバルの api オブジェクトだけを使ってください。',
        '共有プロジェクト状態を書き換える API はない前提で、ローカル拡張として完結させてください。',
      ].join('\n'),
      [
        'You are a JavaScript engineer writing PiXiEEDraw local extensions.',
        'Return JavaScript code only. Do not wrap the answer in Markdown fences.',
        'Do not use import or export. Use only the global api object.',
        'Assume there is no API for mutating shared project state. Keep the extension local-only.',
      ].join('\n')
    );
  }

  function getAiCodePresetDefinition(presetId) {
    if (normalizeAiCodePreset(presetId) !== AI_CODE_PRESET_EXTENSION_BUILDER) {
      return null;
    }
    return {
      id: AI_CODE_PRESET_EXTENSION_BUILDER,
      label: localizeText('PiXiEEDraw拡張作成', 'PiXiEEDraw Extension Builder'),
      promptTemplate: localizeText(
        [
          'やりたいこと:',
          '- ローカル拡張ツールを1つ追加したい',
          '- ツール名: Glow Stamp',
          '- 動作: クリック位置を中心に 12x12 の発光風スタンプを置く',
          '- 補足: init でツール登録し、選択後すぐ使えるようにする',
          '- 表示: api.toast と api.panel で使い方を軽く出す',
          '',
          '条件:',
          '- そのまま貼って動く完全な JavaScript を返す',
          '- import / export は使わない',
          '- 既存コードがあれば壊さずに活かす',
        ].join('\n'),
        [
          'Goal:',
          '- Add one local extension tool',
          '- Tool name: Glow Stamp',
          '- Behavior: place a 12x12 glowing stamp centered on the clicked cell',
          '- Setup: register the tool on init and make it ready to use',
          '- UI: show brief usage with api.toast and api.panel',
          '',
          'Constraints:',
          '- Return complete JavaScript that can run as-is',
          '- Do not use import or export',
          '- Preserve existing code when possible',
        ].join('\n')
      ),
      codeInstructions: localizeText(
        [
          '依頼を満たす最小の構成で、貼り付け後すぐ動く完成コードを返してください。',
          '必要なときだけ api.capturePointer(true) を使い、不要なら使わないでください。',
          'ツール追加では api.registerTool / api.activateTool / api.drawPixels を優先して使ってください。',
          '使い方が分かるように init 時に短い案内を出してください。',
        ].join('\n'),
        [
          'Return complete code that can run immediately after pasting.',
          'Use api.capturePointer(true) only when needed.',
          'For tool creation, prefer api.registerTool, api.activateTool, and api.drawPixels when appropriate.',
          'Show a short usage hint during init.',
        ].join('\n')
      ),
    };
  }

  function getAiCodePresetLabel(presetId) {
    const preset = getAiCodePresetDefinition(presetId);
    return preset ? preset.label : localizeText('なし', 'None');
  }

  function buildAiApiReference() {
    return [
      'Available PiXiEEDraw local extension API:',
      "- api.on(eventName, handler) for 'init', 'interval', 'keydown', 'pointerdown', 'toolchange', 'tool:activate', 'tool:pointerdown', 'tool:pointermove', 'tool:pointerup', 'tool:pointercancel'",
      '- api.toast(message, level)',
      '- api.badge(text)',
      '- api.panel(title, body)',
      '- api.registerTool({ id, label, hint })',
      '- api.unregisterTool(id)',
      '- api.clearTools()',
      '- api.activateTool(id)',
      '- api.capturePointer(enabled)',
      '- api.drawPixels([{ x, y }], { r, g, b, a })',
      '- api.clearPixels()',
      '- api.getContext()',
      "- api.ai.request({ instructions, input }) returns a Promise that resolves to { text, model, apiFormat, endpointHost } when BYOGPT is enabled in the host UI",
    ].join('\n');
  }

  function stripMarkdownCodeFence(text) {
    const trimmed = sanitizeMultilineText(text, AI_MAX_INPUT_LENGTH).trim();
    const fenced = trimmed.match(/^```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  function insertGeneratedCode(textarea, nextCode) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return false;
    }
    const text = sanitizeMultilineText(nextCode, AI_MAX_INPUT_LENGTH * 2).trim();
    if (!text) {
      return false;
    }
    const hasSelection = Number.isFinite(textarea.selectionStart)
      && Number.isFinite(textarea.selectionEnd)
      && textarea.selectionStart !== textarea.selectionEnd;
    const useSelection = hasSelection || document.activeElement === textarea;
    let nextValue = '';
    if (useSelection) {
      const start = Math.max(0, Number(textarea.selectionStart) || 0);
      const end = Math.max(start, Number(textarea.selectionEnd) || start);
      nextValue = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
      textarea.value = nextValue;
      textarea.selectionStart = start;
      textarea.selectionEnd = start + text.length;
    } else if ((textarea.value || '').trim()) {
      nextValue = `${textarea.value.replace(/\s+$/g, '')}\n\n${text}`;
      textarea.value = nextValue;
      textarea.selectionStart = nextValue.length - text.length;
      textarea.selectionEnd = nextValue.length;
    } else {
      textarea.value = text;
      textarea.selectionStart = 0;
      textarea.selectionEnd = text.length;
    }
    textarea.focus();
    return true;
  }

  function extractAiErrorMessage(payload, fallback = '') {
    const source = payload && typeof payload === 'object' ? payload : {};
    if (source.error && typeof source.error === 'object' && source.error.message) {
      return sanitizeText(source.error.message, 320);
    }
    if (typeof source.message === 'string' && source.message.trim()) {
      return sanitizeText(source.message, 320);
    }
    if (typeof fallback === 'string' && fallback.trim()) {
      return sanitizeText(fallback, 320);
    }
    return localizeText('AI リクエストに失敗しました', 'AI request failed');
  }

  function extractAiResponseText(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    if (typeof source.output_text === 'string' && source.output_text.trim()) {
      return source.output_text.trim();
    }
    if (Array.isArray(source.output)) {
      const chunks = [];
      source.output.forEach(item => {
        if (!item || typeof item !== 'object') {
          return;
        }
        const content = Array.isArray(item.content) ? item.content : [];
        content.forEach(part => {
          if (!part || typeof part !== 'object') {
            return;
          }
          if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string' && part.text.trim()) {
            chunks.push(part.text.trim());
          }
        });
      });
      if (chunks.length) {
        return chunks.join('\n\n');
      }
    }
    if (Array.isArray(source.choices)) {
      const chunks = [];
      source.choices.forEach(choice => {
        const message = choice && typeof choice === 'object' ? choice.message : null;
        if (!message) {
          return;
        }
        if (typeof message.content === 'string' && message.content.trim()) {
          chunks.push(message.content.trim());
          return;
        }
        if (Array.isArray(message.content)) {
          message.content.forEach(part => {
            if (!part || typeof part !== 'object') {
              return;
            }
            if (typeof part.text === 'string' && part.text.trim()) {
              chunks.push(part.text.trim());
            }
          });
        }
      });
      if (chunks.length) {
        return chunks.join('\n\n');
      }
    }
    if (Array.isArray(source.candidates)) {
      const chunks = [];
      source.candidates.forEach(candidate => {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        parts.forEach(part => {
          if (typeof part?.text === 'string' && part.text.trim()) {
            chunks.push(part.text.trim());
          }
        });
      });
      if (chunks.length) {
        return chunks.join('\n\n');
      }
    }
    if (typeof source.text === 'string' && source.text.trim()) {
      return source.text.trim();
    }
    return '';
  }

  function buildAiRequestBody(config, request) {
    const instructions = sanitizeMultilineText(request.instructions || '', AI_MAX_INSTRUCTIONS_LENGTH);
    const input = sanitizeMultilineText(request.input || '', AI_MAX_INPUT_LENGTH);
    if (config.apiFormat === AI_API_FORMAT_CHAT_COMPLETIONS) {
      const messages = [];
      if (instructions) {
        messages.push({ role: 'system', content: instructions });
      }
      messages.push({ role: 'user', content: input });
      return {
        model: config.model,
        messages,
      };
    }
    return {
      model: config.model,
      instructions,
      input,
    };
  }

  async function performAiRequest(request, { source = 'panel' } = {}) {
    const config = normalizeAiConfig(runtimeState.aiConfig);
    runtimeState.aiConfig = config;
    if (!config.enabled) {
      throw new Error(localizeText('BYOGPT がOFFです', 'BYOGPT is OFF'));
    }
    if (!config.endpoint || !/^https?:\/\//i.test(config.endpoint)) {
      throw new Error(localizeText('AI エンドポイントURLを設定してください', 'Set a valid AI endpoint URL'));
    }
    if (!config.model) {
      throw new Error(localizeText('AI モデル名を設定してください', 'Set an AI model name'));
    }
    const userInput = sanitizeMultilineText(request?.input || '', AI_MAX_INPUT_LENGTH);
    if (!userInput) {
      throw new Error(localizeText('AI へ送る内容が空です', 'AI input is empty'));
    }
    const configPrompt = sanitizeMultilineText(config.systemPrompt || '', AI_MAX_INSTRUCTIONS_LENGTH);
    const requestInstructions = sanitizeMultilineText(request?.instructions || '', AI_MAX_INSTRUCTIONS_LENGTH);
    const body = buildAiRequestBody(config, {
      instructions: [configPrompt, requestInstructions].filter(Boolean).join('\n\n'),
      input: userInput,
    });
    const headers = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    let response;
    let rawText = '';
    try {
      response = await window.fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      rawText = await response.text();
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(localizeText('AI リクエストがタイムアウトしました', 'AI request timed out'));
      }
      throw new Error(extractAiErrorMessage({}, error?.message || String(error || '')));
    } finally {
      window.clearTimeout(timeoutId);
    }
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(extractAiErrorMessage(payload, rawText || `HTTP ${response.status}`));
    }
    const text = extractAiResponseText(payload);
    if (!text) {
      throw new Error(localizeText('AI の返答から本文を取得できませんでした', 'Could not extract text from the AI response'));
    }
    return {
      ok: true,
      text: sanitizeMultilineText(text, AI_MAX_INPUT_LENGTH * 2),
      model: config.model,
      apiFormat: config.apiFormat,
      endpointHost: parseHostLabel(config.endpoint),
      source,
    };
  }

  function buildAiTestInput() {
    return localizeText(
      'PiXiEEDraw の BYOGPT 接続テストです。1行で接続OKと返してください。',
      'This is a PiXiEEDraw BYOGPT connection test. Reply with one short line saying the connection works.'
    );
  }

  function buildAiCodeWriterRequest(userPrompt, currentCode, presetId = '') {
    const prompt = sanitizeMultilineText(userPrompt, 4000);
    const current = sanitizeMultilineText(currentCode, 8000);
    const preset = getAiCodePresetDefinition(presetId);
    return {
      instructions: [
        buildAiCodeWriterSystemPrompt(),
        preset?.codeInstructions || '',
        localizeText(
          '既存コードがあれば意図を保って変更し、不要な機能は削除しないでください。',
          'If current code exists, preserve its intent and avoid removing unrelated behavior.'
        ),
      ].join('\n\n'),
      input: [
        `${localizeText('依頼', 'Request')}:\n${prompt}`,
        `${localizeText('現在のコード', 'Current Code')}:\n${current || '(none)'}`,
        `${localizeText('拡張API', 'Extension API')}:\n${buildAiApiReference()}`,
      ].join('\n\n'),
    };
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

  function normalizeToolDefinition(tool) {
    if (!tool || typeof tool !== 'object') {
      return null;
    }
    const id = normalizeToolId(tool.id);
    if (!id) {
      return null;
    }
    const label = sanitizeText(tool.label || id, 36) || id;
    const hint = sanitizeText(tool.hint || '', 120);
    return { id, label, hint };
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
    const stack = document.getElementById('canvasStack');
    const drawing = document.getElementById('drawingCanvas');
    const selection = document.getElementById('selectionCanvas');
    if (!(viewport instanceof HTMLElement) || !(stack instanceof HTMLElement) || !(drawing instanceof HTMLCanvasElement)) {
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
      const comma = key.indexOf(',');
      if (comma <= 0) {
        continue;
      }
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
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
      const comma = key.indexOf(',');
      if (comma <= 0) {
        runtimeState.localPaintMap.delete(key);
        changed = true;
        continue;
      }
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
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

  function shouldCaptureCanvasPointer() {
    return runtimeState.enabled && runtimeState.captureCanvasPointer && Boolean(runtimeState.activeLocalToolId);
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

  function clearLocalPaintPixels() {
    runtimeState.localPaintMap.clear();
    clearLocalPaintOverlaySurface();
  }

  function paintLocalPixels(pixels, color) {
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
      const key = `${x},${y}`;
      if (normalizedColor.a <= 0) {
        if (runtimeState.localPaintMap.delete(key)) {
          ctx.clearRect(x, y, 1, 1);
          painted += 1;
        }
        continue;
      }
      runtimeState.localPaintMap.set(key, {
        key: normalizedColor.key,
        css: normalizedColor.css,
      });
      ctx.fillStyle = normalizedColor.css;
      ctx.fillRect(x, y, 1, 1);
      painted += 1;
    }
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
    return {
      toolId: runtimeState.activeLocalToolId,
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
      .map(tool => ({ id: tool.id, label: tool.label, hint: tool.hint }));
  }

  function dispatchLocalToolChangeEvent() {
    dispatchEventToRuntime('toolchange', {
      activeToolId: runtimeState.activeLocalToolId || '',
      capturePointer: Boolean(runtimeState.captureCanvasPointer),
      tools: buildLocalToolSummary(),
    });
  }

  function renderLocalToolButtons() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.toolList instanceof HTMLElement)) {
      return;
    }
    ui.toolList.innerHTML = '';
    const tools = runtimeState.localToolOrder
      .map(id => runtimeState.localTools.get(id))
      .filter(Boolean);
    if (!tools.length) {
      const empty = document.createElement('p');
      empty.className = 'help-text local-ext-panel__tool-empty';
      empty.textContent = localizeText(
        '拡張コードから api.registerTool(...) で追加できます。',
        'Add tools from extension code with api.registerTool(...).'
      );
      ui.toolList.appendChild(empty);
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
      button.addEventListener('click', () => {
        setActiveLocalToolId(tool.id, { notifyRuntime: true });
      });
      fragment.appendChild(button);
    });
    ui.toolList.appendChild(fragment);
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
    const captureLabel = runtimeState.captureCanvasPointer ? 'ON' : 'OFF';
    ui.toolMeta.textContent = localizeText(
      `選択中: ${activeLabel} / キャンバス入力取得: ${captureLabel}`,
      `Selected: ${activeLabel} / Canvas Capture: ${captureLabel}`
    );
  }

  function setActiveLocalToolId(toolId, { notifyRuntime = false } = {}) {
    const next = normalizeToolId(toolId);
    const hasNext = next && runtimeState.localTools.has(next);
    const resolved = hasNext ? next : '';
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
    if (notifyRuntime) {
      dispatchEventToRuntime('tool:activate', {
        id: runtimeState.activeLocalToolId || '',
      });
      dispatchLocalToolChangeEvent();
    }
  }

  function clearLocalTools({ notifyRuntime = true } = {}) {
    runtimeState.localTools.clear();
    runtimeState.localToolOrder = [];
    runtimeState.activeLocalToolId = '';
    runtimeState.captureCanvasPointer = false;
    runtimeState.trackedPointerId = null;
    renderLocalToolButtons();
    renderLocalToolMeta();
    updateLocalInputLayerState();
    if (notifyRuntime) {
      dispatchLocalToolChangeEvent();
    }
  }

  function registerLocalTool(tool, { notifyRuntime = true } = {}) {
    const normalized = normalizeToolDefinition(tool);
    if (!normalized) {
      return false;
    }
    if (!runtimeState.localTools.has(normalized.id)) {
      if (runtimeState.localToolOrder.length >= LOCAL_TOOL_MAX_COUNT) {
        setStatus(
          localizeText(
            `ローカルツールは最大 ${LOCAL_TOOL_MAX_COUNT} 件までです`,
            `Local tools are limited to ${LOCAL_TOOL_MAX_COUNT}.`
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
    if (notifyRuntime) {
      dispatchLocalToolChangeEvent();
    }
    return true;
  }

  function unregisterLocalTool(toolId, { notifyRuntime = true } = {}) {
    const normalizedId = normalizeToolId(toolId);
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
    if (notifyRuntime) {
      dispatchLocalToolChangeEvent();
    }
    return true;
  }

  function makeContextSnapshot() {
    const activeTool = document.querySelector('.tool-button.is-active')?.getAttribute('data-tool') || '';
    const activeLeft = document.querySelector('.rail-tab[data-left-tab][aria-selected="true"]')?.getAttribute('data-left-tab') || '';
    const activeRight = document.querySelector('.rail-tab[data-right-tab][aria-selected="true"]')?.getAttribute('data-right-tab') || '';
    const multiStatusText = (document.getElementById('multiStatus')?.textContent || '').trim();
    return {
      href: window.location.href,
      language: (document.documentElement.lang || 'ja').toLowerCase(),
      now: Date.now(),
      isMobileLayout: document.body.classList.contains('is-mobile-layout'),
      activeTool,
      activeLeftTab: activeLeft,
      activeRightTab: activeRight,
      multiStatus: multiStatusText,
      isMultiActive: !/off|OFF|オフ/.test(multiStatusText),
      localToolCount: runtimeState.localToolOrder.length,
      activeLocalToolId: runtimeState.activeLocalToolId || '',
      localToolCapture: Boolean(runtimeState.captureCanvasPointer),
      localPaintPixelCount: runtimeState.localPaintMap.size,
      ai: buildAiContextSnapshot(),
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

  function setAiStatus(message, kind = 'info') {
    const ui = runtimeState.ui;
    if (!ui || !(ui.aiStatus instanceof HTMLElement)) {
      return;
    }
    ui.aiStatus.textContent = sanitizeText(message, 320);
    ui.aiStatus.dataset.kind = kind;
  }

  function updateAiVisibility() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.aiContent instanceof HTMLElement) || !(ui.aiEnabled instanceof HTMLInputElement)) {
      return;
    }
    const visible = ui.aiEnabled.checked;
    ui.aiContent.hidden = !visible;
  }

  function setAiBusy(isBusy) {
    const ui = runtimeState.ui;
    runtimeState.aiBusyCount = Math.max(0, runtimeState.aiBusyCount + (isBusy ? 1 : -1));
    const busy = runtimeState.aiBusyCount > 0;
    if (!ui) {
      return;
    }
    if (ui.aiTestButton instanceof HTMLButtonElement) {
      ui.aiTestButton.disabled = busy;
    }
    if (ui.aiGenerateButton instanceof HTMLButtonElement) {
      ui.aiGenerateButton.disabled = busy;
    }
    if (ui.aiSaveButton instanceof HTMLButtonElement) {
      ui.aiSaveButton.disabled = busy;
    }
  }

  function renderAiSummary() {
    const ui = runtimeState.ui;
    if (!ui || !(ui.aiSummary instanceof HTMLElement)) {
      return;
    }
    const config = normalizeAiConfig(runtimeState.aiConfig);
    runtimeState.aiConfig = config;
    const host = parseHostLabel(config.endpoint) || config.endpoint || localizeText('未設定', 'Not set');
    ui.aiSummary.textContent = localizeText(
      `状態: ${config.enabled ? 'ON' : 'OFF'} / ${config.apiFormat} / ${config.model} / ${host}`,
      `Status: ${config.enabled ? 'ON' : 'OFF'} / ${config.apiFormat} / ${config.model} / ${host}`
    );
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
      ui.outputTitle.textContent = localizeText('ローカル出力', 'Local Output');
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

  function destroySandboxFrame() {
    if (runtimeState.frame instanceof HTMLIFrameElement) {
      runtimeState.frame.remove();
    }
    runtimeState.frame = null;
    runtimeState.frameReady = false;
    runtimeState.messageQueue = [];
  }

  function ensureSandboxFrame() {
    if (runtimeState.frame instanceof HTMLIFrameElement) {
      return runtimeState.frame;
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'local-ext-runtime-frame';
    iframe.setAttribute('title', 'Local extension sandbox');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.srcdoc = SANDBOX_SRC;
    iframe.hidden = true;
    iframe.addEventListener('load', () => {
      runtimeState.frameReady = true;
      flushQueuedMessages();
    });
    document.body.appendChild(iframe);
    runtimeState.frame = iframe;
    runtimeState.frameReady = false;
    runtimeState.messageQueue = [];
    return iframe;
  }

  function postToSandbox(type, payload = {}) {
    const frame = ensureSandboxFrame();
    const packet = {
      __pixieLocalHost: 1,
      type,
      ...payload,
    };
    if (!runtimeState.frameReady || !(frame.contentWindow instanceof Window)) {
      runtimeState.messageQueue.push(packet);
      return;
    }
    frame.contentWindow.postMessage(packet, '*');
  }

  function flushQueuedMessages() {
    const frame = runtimeState.frame;
    if (!(frame instanceof HTMLIFrameElement) || !(frame.contentWindow instanceof Window) || !runtimeState.frameReady) {
      return;
    }
    const queued = runtimeState.messageQueue.slice();
    runtimeState.messageQueue = [];
    queued.forEach(packet => {
      frame.contentWindow.postMessage(packet, '*');
    });
  }

  function unloadRuntime() {
    if (runtimeState.frame instanceof HTMLIFrameElement && runtimeState.frameReady) {
      postToSandbox('unload');
    }
    destroySandboxFrame();
    if (runtimeState.intervalTimer !== null) {
      window.clearInterval(runtimeState.intervalTimer);
      runtimeState.intervalTimer = null;
    }
    clearLocalTools({ notifyRuntime: false });
    clearLocalPaintPixels();
    updateLocalInputLayerState();
    setBadge('');
  }

  function dispatchEventToRuntime(name, payload) {
    if (!runtimeState.enabled) {
      return;
    }
    postToSandbox('event', {
      name,
      payload,
    });
  }

  function startRuntime() {
    if (!runtimeState.enabled) {
      return;
    }
    const code = String(runtimeState.code || '').trim();
    if (!code) {
      setStatus(localizeText('拡張コードが空です', 'Extension code is empty'), 'warn');
      setBadge('');
      return;
    }
    unloadRuntime();
    syncLocalCanvasGeometry();
    ensureSandboxFrame();
    postToSandbox('load', {
      code,
      context: makeContextSnapshot(),
    });
    dispatchEventToRuntime('context', makeContextSnapshot());
    if (runtimeState.intervalTimer !== null) {
      window.clearInterval(runtimeState.intervalTimer);
    }
    runtimeState.intervalTimer = window.setInterval(() => {
      syncLocalCanvasGeometry();
      const snapshot = makeContextSnapshot();
      dispatchEventToRuntime('context', snapshot);
      dispatchEventToRuntime('interval', {
        now: Date.now(),
        context: snapshot,
      });
    }, 1500);
  }

  function reloadRuntime() {
    if (!runtimeState.enabled) {
      unloadRuntime();
      setStatus(localizeText('ローカル拡張はOFFです', 'Local extension is OFF'), 'info');
      return;
    }
    startRuntime();
  }

  function setEnabled(enabled, { persist = true, restart = true } = {}) {
    runtimeState.enabled = Boolean(enabled);
    if (runtimeState.ui?.enabled instanceof HTMLInputElement) {
      runtimeState.ui.enabled.checked = runtimeState.enabled;
    }
    if (persist) {
      writeStorage(STORAGE_KEY_ENABLED, runtimeState.enabled ? '1' : '0');
    }
    if (restart) {
      reloadRuntime();
    } else {
      updateLocalInputLayerState();
    }
  }

  function maybeDispatchToolPointerEvent(event, phase) {
    if (!runtimeState.enabled || !runtimeState.activeLocalToolId) {
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
    dispatchEventToRuntime(`tool:${phase}`, payload);
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

  async function handleAiRequestFromRuntime(payload, sourceWindow) {
    const requestId = sanitizeText(payload?.id || '', 120);
    if (!requestId) {
      return;
    }
    try {
      const result = await performAiRequest(payload?.request || {}, { source: 'runtime' });
      const frame = runtimeState.frame;
      if (!(frame instanceof HTMLIFrameElement) || frame.contentWindow !== sourceWindow) {
        return;
      }
      postToSandbox('ai-result', {
        payload: {
          id: requestId,
          ok: true,
          text: result.text,
          model: result.model,
          apiFormat: result.apiFormat,
          endpointHost: result.endpointHost,
        },
      });
    } catch (error) {
      const frame = runtimeState.frame;
      if (!(frame instanceof HTMLIFrameElement) || frame.contentWindow !== sourceWindow) {
        return;
      }
      postToSandbox('ai-result', {
        payload: {
          id: requestId,
          ok: false,
          message: extractAiErrorMessage({}, error?.message || String(error || '')),
        },
      });
    }
  }

  function bindGlobalEvents() {
    window.addEventListener('message', event => {
      const frame = runtimeState.frame;
      if (!(frame instanceof HTMLIFrameElement) || event.source !== frame.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || data.__pixieLocalExt !== 1) {
        return;
      }
      if (data.type === 'ready') {
        flushQueuedMessages();
        return;
      }
      if (data.type === 'ai-request') {
        void handleAiRequestFromRuntime(data.payload && typeof data.payload === 'object' ? data.payload : {}, event.source);
        return;
      }
      if (data.type === 'tool-register') {
        const registered = registerLocalTool(data.payload && data.payload.tool, { notifyRuntime: false });
        if (!registered) {
          setStatus(localizeText('ローカルツール登録に失敗しました', 'Failed to register local tool'), 'warn');
        }
        return;
      }
      if (data.type === 'tool-unregister') {
        unregisterLocalTool(data.payload && data.payload.id, { notifyRuntime: false });
        return;
      }
      if (data.type === 'tools-clear') {
        clearLocalTools({ notifyRuntime: false });
        return;
      }
      if (data.type === 'tool-activate') {
        setActiveLocalToolId(data.payload && data.payload.id, { notifyRuntime: false });
        return;
      }
      if (data.type === 'pointer-capture') {
        runtimeState.captureCanvasPointer = Boolean(data.payload && data.payload.enabled);
        runtimeState.trackedPointerId = null;
        renderLocalToolMeta();
        updateLocalInputLayerState();
        return;
      }
      if (data.type === 'local-paint') {
        paintLocalPixels(data.payload && data.payload.pixels, data.payload && data.payload.color);
        return;
      }
      if (data.type === 'local-paint-clear') {
        clearLocalPaintPixels();
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

    document.addEventListener('keydown', event => {
      if (!runtimeState.enabled) {
        return;
      }
      dispatchEventToRuntime('keydown', {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
        now: Date.now(),
      });
    }, true);

    document.addEventListener('pointerdown', event => {
      if (!runtimeState.enabled) {
        return;
      }
      syncLocalCanvasGeometry();
      const target = event.target instanceof HTMLElement ? event.target : null;
      dispatchEventToRuntime('pointerdown', {
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        targetId: target ? target.id || '' : '',
        targetClass: target ? sanitizeText(target.className || '', 80) : '',
        button: event.button,
        now: Date.now(),
      });
      maybeDispatchToolPointerEvent(event, 'pointerdown');
    }, { passive: false, capture: true });

    document.addEventListener('pointermove', event => {
      if (!runtimeState.enabled) {
        return;
      }
      maybeDispatchToolPointerEvent(event, 'pointermove');
    }, { passive: false, capture: true });

    document.addEventListener('pointerup', event => {
      if (!runtimeState.enabled) {
        return;
      }
      maybeDispatchToolPointerEvent(event, 'pointerup');
    }, { passive: false, capture: true });

    document.addEventListener('pointercancel', event => {
      if (!runtimeState.enabled) {
        return;
      }
      maybeDispatchToolPointerEvent(event, 'pointercancel');
    }, { passive: false, capture: true });

    window.addEventListener('resize', () => {
      syncLocalCanvasGeometry();
    }, { passive: true });
  }

  function buildUi() {
    const settingsBody = document.querySelector('#panelSettings .panel-section__body');
    if (!(settingsBody instanceof HTMLElement)) {
      return null;
    }

    const panel = document.createElement('details');
    panel.className = 'field field--list local-ext-panel';
    panel.id = 'localExtensionPanel';

    const summary = document.createElement('summary');
    summary.textContent = localizeText('ローカル拡張（外付け）', 'Local Extension (External)');
    panel.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'local-ext-panel__body';

    const description = document.createElement('p');
    description.className = 'help-text ui-guide-text';
    description.textContent = localizeText(
      'この端末だけで動作します。共有状態へ書き込むAPIは公開しません。',
      'Runs only on this device. No API is exposed for writing into shared state.'
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

    const aiSection = document.createElement('div');
    aiSection.className = 'local-ext-panel__subsection';

    const aiHeading = document.createElement('div');
    aiHeading.className = 'local-ext-panel__section-title';
    aiHeading.textContent = localizeText('BYOGPT 接続', 'BYOGPT Connection');
    aiSection.appendChild(aiHeading);

    const aiContent = document.createElement('div');
    aiContent.className = 'local-ext-panel__content';

    const aiNotice = document.createElement('p');
    aiNotice.className = 'help-text ui-guide-text local-ext-panel__warning';
    aiNotice.textContent = localizeText(
      'APIキーはこのブラウザにだけ保存されます。実運用はユーザー側プロキシ経由を推奨します。',
      'API keys stay only in this browser. For production use, prefer a user-owned proxy.'
    );
    const aiEnabledRow = document.createElement('div');
    aiEnabledRow.className = 'local-ext-panel__row';
    const aiEnabledLabel = document.createElement('label');
    aiEnabledLabel.className = 'toggle-option';
    aiEnabledLabel.setAttribute('for', 'localExtensionAiEnabled');
    const aiEnabled = document.createElement('input');
    aiEnabled.id = 'localExtensionAiEnabled';
    aiEnabled.type = 'checkbox';
    const aiEnabledText = document.createElement('span');
    aiEnabledText.textContent = localizeText('BYOGPT を有効化', 'Enable BYOGPT');
    aiEnabledLabel.append(aiEnabled, aiEnabledText);
    aiEnabledRow.appendChild(aiEnabledLabel);
    aiSection.appendChild(aiEnabledRow);
    aiContent.appendChild(aiNotice);

    const aiApiKeyField = document.createElement('label');
    aiApiKeyField.className = 'local-ext-panel__field';
    const aiApiKeyLabel = document.createElement('span');
    aiApiKeyLabel.textContent = localizeText('APIキー', 'API Key');
    const aiApiKey = document.createElement('input');
    aiApiKey.id = 'localExtensionAiApiKey';
    aiApiKey.type = 'password';
    aiApiKey.className = 'local-ext-panel__input';
    aiApiKey.placeholder = localizeText('OpenAIなら sk-... を貼り付け', 'Paste your key here, for example sk-...');
    aiApiKey.autocomplete = 'off';
    aiApiKeyField.append(aiApiKeyLabel, aiApiKey);
    aiContent.appendChild(aiApiKeyField);

    const aiApiKeyActions = document.createElement('div');
    aiApiKeyActions.className = 'local-ext-panel__actions';
    const aiApiKeyLink = document.createElement('a');
    aiApiKeyLink.className = 'chip';
    aiApiKeyLink.href = 'https://platform.openai.com/api-keys';
    aiApiKeyLink.target = '_blank';
    aiApiKeyLink.rel = 'noopener noreferrer';
    aiApiKeyLink.textContent = localizeText('OpenAI APIキー取得', 'Get OpenAI API Key');
    aiApiKeyActions.appendChild(aiApiKeyLink);
    aiContent.appendChild(aiApiKeyActions);

    const aiAdvancedDetails = document.createElement('details');
    aiAdvancedDetails.className = 'local-ext-panel__advanced';

    const aiAdvancedSummary = document.createElement('summary');
    aiAdvancedSummary.className = 'local-ext-panel__advanced-summary';
    aiAdvancedSummary.textContent = localizeText('詳細設定を開く', 'Show Advanced Settings');
    aiAdvancedDetails.appendChild(aiAdvancedSummary);

    const aiAdvancedBody = document.createElement('div');
    aiAdvancedBody.className = 'local-ext-panel__advanced-body';

    const aiGrid = document.createElement('div');
    aiGrid.className = 'local-ext-panel__grid';

    const aiEndpointField = document.createElement('label');
    aiEndpointField.className = 'local-ext-panel__field';
    const aiEndpointLabel = document.createElement('span');
    aiEndpointLabel.textContent = localizeText('エンドポイント', 'Endpoint');
    const aiEndpoint = document.createElement('input');
    aiEndpoint.id = 'localExtensionAiEndpoint';
    aiEndpoint.type = 'url';
    aiEndpoint.className = 'local-ext-panel__input';
    aiEndpoint.placeholder = AI_DEFAULT_ENDPOINT;
    aiEndpoint.autocomplete = 'off';
    aiEndpointField.append(aiEndpointLabel, aiEndpoint);

    const aiApiFormatField = document.createElement('label');
    aiApiFormatField.className = 'local-ext-panel__field';
    const aiApiFormatLabel = document.createElement('span');
    aiApiFormatLabel.textContent = localizeText('API形式', 'API Format');
    const aiApiFormat = document.createElement('select');
    aiApiFormat.id = 'localExtensionAiApiFormat';
    aiApiFormat.className = 'local-ext-panel__select';
    const aiResponseOption = document.createElement('option');
    aiResponseOption.value = AI_API_FORMAT_RESPONSES;
    aiResponseOption.textContent = 'OpenAI Responses';
    const aiChatOption = document.createElement('option');
    aiChatOption.value = AI_API_FORMAT_CHAT_COMPLETIONS;
    aiChatOption.textContent = 'Chat Completions';
    aiApiFormat.append(aiResponseOption, aiChatOption);
    aiApiFormatField.append(aiApiFormatLabel, aiApiFormat);

    const aiModelField = document.createElement('label');
    aiModelField.className = 'local-ext-panel__field';
    const aiModelLabel = document.createElement('span');
    aiModelLabel.textContent = localizeText('モデル', 'Model');
    const aiModel = document.createElement('input');
    aiModel.id = 'localExtensionAiModel';
    aiModel.type = 'text';
    aiModel.className = 'local-ext-panel__input';
    aiModel.placeholder = AI_DEFAULT_MODEL;
    aiModel.autocomplete = 'off';
    aiModelField.append(aiModelLabel, aiModel);
    aiGrid.append(aiEndpointField, aiApiFormatField, aiModelField);
    aiAdvancedBody.appendChild(aiGrid);

    const aiSystemPromptField = document.createElement('label');
    aiSystemPromptField.className = 'local-ext-panel__field';
    const aiSystemPromptLabel = document.createElement('span');
    aiSystemPromptLabel.textContent = localizeText('共通システムプロンプト', 'Shared System Prompt');
    const aiSystemPrompt = document.createElement('textarea');
    aiSystemPrompt.id = 'localExtensionAiSystemPrompt';
    aiSystemPrompt.className = 'local-ext-panel__code local-ext-panel__code--compact';
    aiSystemPrompt.spellcheck = false;
    aiSystemPrompt.placeholder = localizeText('必要な場合だけ追記してください', 'Add only if you need extra global instructions');
    aiSystemPromptField.append(aiSystemPromptLabel, aiSystemPrompt);
    aiAdvancedBody.appendChild(aiSystemPromptField);
    aiAdvancedDetails.appendChild(aiAdvancedBody);
    aiContent.appendChild(aiAdvancedDetails);

    const aiPromptField = document.createElement('label');
    aiPromptField.className = 'local-ext-panel__field';
    const aiPromptLabel = document.createElement('span');
    aiPromptLabel.textContent = localizeText('やりたいこと', 'What You Want');

    const aiPrompt = document.createElement('textarea');
    aiPrompt.id = 'localExtensionAiPrompt';
    aiPrompt.className = 'local-ext-panel__code local-ext-panel__code--compact';
    aiPrompt.spellcheck = false;
    aiPrompt.placeholder = localizeText('例: 32x32 のチェッカースタンプを追加して', 'Example: Add a 32x32 checker stamp tool');
    aiPromptField.append(aiPromptLabel, aiPrompt);
    aiContent.appendChild(aiPromptField);

    const aiActions = document.createElement('div');
    aiActions.className = 'local-ext-panel__actions local-ext-panel__actions--ai';

    const aiSaveButton = document.createElement('button');
    aiSaveButton.type = 'button';
    aiSaveButton.className = 'chip';
    aiSaveButton.textContent = localizeText('AI設定を保存', 'Save AI Settings');

    const aiTestButton = document.createElement('button');
    aiTestButton.type = 'button';
    aiTestButton.className = 'chip';
    aiTestButton.textContent = localizeText('接続テスト', 'Test Connection');

    const aiGenerateButton = document.createElement('button');
    aiGenerateButton.type = 'button';
    aiGenerateButton.className = 'chip';
    aiGenerateButton.textContent = localizeText('コード生成', 'Generate Code');

    aiActions.append(aiSaveButton, aiTestButton, aiGenerateButton);
    aiContent.appendChild(aiActions);

    const aiSummary = document.createElement('p');
    aiSummary.className = 'help-text local-ext-panel__tool-meta';
    aiContent.appendChild(aiSummary);

    const aiStatus = document.createElement('p');
    aiStatus.className = 'help-text local-ext-panel__status';
    aiStatus.id = 'localExtensionAiStatus';
    aiStatus.setAttribute('aria-live', 'polite');
    aiContent.appendChild(aiStatus);
    aiSection.appendChild(aiContent);

    body.appendChild(aiSection);

    const code = document.createElement('textarea');
    code.id = 'localExtensionCode';
    code.className = 'local-ext-panel__code';
    code.spellcheck = false;
    code.placeholder = localizeText('ここにローカル拡張コードを入力', 'Enter local extension code here');
    body.appendChild(code);

    const actions = document.createElement('div');
    actions.className = 'local-ext-panel__actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'chip';
    saveButton.textContent = localizeText('保存', 'Save');

    const reloadButton = document.createElement('button');
    reloadButton.type = 'button';
    reloadButton.className = 'chip';
    reloadButton.textContent = localizeText('反映', 'Apply');

    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'chip';
    stopButton.textContent = localizeText('停止', 'Stop');

    const templateButton = document.createElement('button');
    templateButton.type = 'button';
    templateButton.className = 'chip';
    templateButton.textContent = localizeText('テンプレ', 'Template');

    actions.append(saveButton, reloadButton, stopButton, templateButton);
    body.appendChild(actions);

    const toolBox = document.createElement('div');
    toolBox.className = 'local-ext-panel__tools';

    const toolHeading = document.createElement('div');
    toolHeading.className = 'local-ext-panel__tools-heading';
    toolHeading.textContent = localizeText('ローカルツール', 'Local Tools');

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
    const outputTitle = document.createElement('div');
    outputTitle.className = 'local-ext-panel__output-title';
    outputTitle.textContent = localizeText('ローカル出力', 'Local Output');
    const outputBody = document.createElement('div');
    outputBody.className = 'local-ext-panel__output-body';
    outputBody.textContent = localizeText(
      '拡張コードから api.panel(title, body) で表示できます。',
      'Display text here from extension code with api.panel(title, body).'
    );
    output.append(outputTitle, outputBody);
    body.appendChild(output);

    panel.appendChild(body);
    settingsBody.appendChild(panel);

    const badge = document.createElement('div');
    badge.className = 'local-ext-badge';
    badge.id = 'localExtensionBadge';
    document.body.appendChild(badge);

    return {
      panel,
      summary,
      description,
      enabled,
      toggleText,
      aiHeading,
      aiContent,
      aiNotice,
      aiEnabled,
      aiEnabledText,
      aiEndpointLabel,
      aiEndpoint,
      aiApiFormatLabel,
      aiApiFormat,
      aiModelLabel,
      aiModel,
      aiApiKeyLabel,
      aiApiKey,
      aiApiKeyLink,
      aiSystemPromptLabel,
      aiSystemPrompt,
      aiAdvancedSummary,
      aiPromptLabel,
      aiPrompt,
      aiSaveButton,
      aiTestButton,
      aiGenerateButton,
      aiSummary,
      aiStatus,
      code,
      saveButton,
      reloadButton,
      stopButton,
      templateButton,
      toolHeading,
      clearToolButton,
      toolList,
      toolMeta,
      status,
      outputTitle,
      outputBody,
      badge,
    };
  }

  function applyUiLocalization() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    if (ui.summary instanceof HTMLElement) {
      ui.summary.textContent = localizeText('ローカル拡張（外付け）', 'Local Extension (External)');
    }
    if (ui.description instanceof HTMLElement) {
      ui.description.textContent = localizeText(
        'この端末だけで動作します。共有状態へ書き込むAPIは公開しません。',
        'Runs only on this device. No API is exposed for writing into shared state.'
      );
    }
    if (ui.toggleText instanceof HTMLElement) {
      ui.toggleText.textContent = localizeText('有効化', 'Enable');
    }
    if (ui.aiHeading instanceof HTMLElement) {
      ui.aiHeading.textContent = localizeText('BYOGPT 接続', 'BYOGPT Connection');
    }
    if (ui.aiNotice instanceof HTMLElement) {
      ui.aiNotice.textContent = localizeText(
        'APIキーはこのブラウザにだけ保存されます。実運用はユーザー側プロキシ経由を推奨します。',
        'API keys stay only in this browser. For production use, prefer a user-owned proxy.'
      );
    }
    if (ui.aiEnabledText instanceof HTMLElement) {
      ui.aiEnabledText.textContent = localizeText('BYOGPT を使う', 'Use BYOGPT');
    }
    if (ui.aiEndpointLabel instanceof HTMLElement) {
      ui.aiEndpointLabel.textContent = localizeText('エンドポイント', 'Endpoint');
    }
    if (ui.aiApiFormatLabel instanceof HTMLElement) {
      ui.aiApiFormatLabel.textContent = localizeText('API形式', 'API Format');
    }
    if (ui.aiModelLabel instanceof HTMLElement) {
      ui.aiModelLabel.textContent = localizeText('モデル', 'Model');
    }
    if (ui.aiApiKeyLabel instanceof HTMLElement) {
      ui.aiApiKeyLabel.textContent = localizeText('APIキー', 'API Key');
    }
    if (ui.aiApiKeyLink instanceof HTMLAnchorElement) {
      ui.aiApiKeyLink.textContent = localizeText('OpenAI APIキー取得', 'Get OpenAI API Key');
    }
    if (ui.aiSystemPromptLabel instanceof HTMLElement) {
      ui.aiSystemPromptLabel.textContent = localizeText('AIへの追加指示', 'Extra AI Instructions');
    }
    if (ui.aiAdvancedSummary instanceof HTMLElement) {
      ui.aiAdvancedSummary.textContent = localizeText('詳細設定を開く', 'Show Advanced Settings');
    }
    if (ui.aiPromptLabel instanceof HTMLElement) {
      ui.aiPromptLabel.textContent = localizeText('やりたいこと', 'What You Want');
    }
    if (ui.aiSystemPrompt instanceof HTMLTextAreaElement) {
      ui.aiSystemPrompt.placeholder = localizeText(
        '必要な場合だけ追記してください',
        'Add only if you need extra global instructions'
      );
    }
    if (ui.aiPrompt instanceof HTMLTextAreaElement) {
      ui.aiPrompt.placeholder = localizeText(
        '例: クリック位置に 16x16 のハートスタンプを置くツールを追加して',
        'Example: Add a tool that places a 16x16 heart stamp on the clicked cell'
      );
    }
    if (ui.aiApiKey instanceof HTMLInputElement) {
      ui.aiApiKey.placeholder = localizeText(
        'OpenAIなら sk-... を貼り付け',
        'Paste your key here, for example sk-...'
      );
    }
    if (ui.aiSaveButton instanceof HTMLButtonElement) {
      ui.aiSaveButton.textContent = localizeText('設定保存', 'Save Settings');
    }
    if (ui.aiTestButton instanceof HTMLButtonElement) {
      ui.aiTestButton.textContent = localizeText('接続テスト', 'Test Connection');
    }
    if (ui.aiGenerateButton instanceof HTMLButtonElement) {
      ui.aiGenerateButton.textContent = localizeText('コード生成', 'Generate Code');
    }
    if (ui.code instanceof HTMLTextAreaElement) {
      ui.code.placeholder = localizeText('ここにローカル拡張コードを入力', 'Enter local extension code here');
    }
    if (ui.saveButton instanceof HTMLButtonElement) {
      ui.saveButton.textContent = localizeText('保存', 'Save');
    }
    if (ui.reloadButton instanceof HTMLButtonElement) {
      ui.reloadButton.textContent = localizeText('反映', 'Apply');
    }
    if (ui.stopButton instanceof HTMLButtonElement) {
      ui.stopButton.textContent = localizeText('停止', 'Stop');
    }
    if (ui.templateButton instanceof HTMLButtonElement) {
      ui.templateButton.textContent = localizeText('テンプレ', 'Template');
    }
    if (ui.toolHeading instanceof HTMLElement) {
      ui.toolHeading.textContent = localizeText('ローカルツール', 'Local Tools');
    }
    if (ui.clearToolButton instanceof HTMLButtonElement) {
      ui.clearToolButton.textContent = localizeText('選択解除', 'Clear Selection');
    }
    if (ui.outputTitle instanceof HTMLElement && !ui.outputTitle.dataset.customized) {
      ui.outputTitle.textContent = localizeText('ローカル出力', 'Local Output');
    }
    if (ui.outputBody instanceof HTMLElement && !ui.outputBody.dataset.customized) {
      ui.outputBody.textContent = localizeText(
        '拡張コードから api.panel(title, body) で表示できます。',
        'Display text here from extension code with api.panel(title, body).'
      );
    }
    renderLocalToolButtons();
    renderLocalToolMeta();
    renderAiSummary();
  }

  function hydrateUi() {
    const ui = runtimeState.ui;
    if (!ui) {
      return;
    }
    runtimeState.code = readStorage(STORAGE_KEY_CODE, '');
    runtimeState.enabled = readStorage(STORAGE_KEY_ENABLED, '0') === '1';
    runtimeState.aiConfig = loadAiConfigFromStorage();
    const isOpen = readStorage(STORAGE_KEY_OPEN, '0') === '1';
    ui.panel.open = isOpen;
    ui.enabled.checked = runtimeState.enabled;
    ui.code.value = runtimeState.code;
    ui.aiEnabled.checked = runtimeState.aiConfig.enabled;
    ui.aiEndpoint.value = runtimeState.aiConfig.endpoint;
    ui.aiApiFormat.value = runtimeState.aiConfig.apiFormat;
    ui.aiModel.value = runtimeState.aiConfig.model;
    ui.aiApiKey.value = runtimeState.aiConfig.apiKey;
    ui.aiSystemPrompt.value = runtimeState.aiConfig.systemPrompt;
    ui.aiPrompt.value = runtimeState.aiConfig.lastPrompt;
    if (!(ui.aiPrompt.value || '').trim()) {
      const preset = getAiCodePresetDefinition(runtimeState.aiConfig.codePreset);
      if (preset) {
        ui.aiPrompt.value = preset.promptTemplate;
      }
    }
    applyUiLocalization();
    updateAiVisibility();

    ui.panel.addEventListener('toggle', () => {
      writeStorage(STORAGE_KEY_OPEN, ui.panel.open ? '1' : '0');
    });

    ui.enabled.addEventListener('change', () => {
      setEnabled(ui.enabled.checked, { persist: true, restart: true });
    });

    ui.aiEnabled.addEventListener('change', () => {
      if (ui.aiEnabled.checked) {
        const accepted = window.confirm(
          localizeText(
            'BYOGPT はまだテスト段階です。利用は個人責任でお願いします。続けますか？',
            'BYOGPT is still experimental. Use it at your own risk. Continue?'
          )
        );
        if (!accepted) {
          ui.aiEnabled.checked = false;
        }
      }
      saveAiConfigFromUi();
      updateAiVisibility();
    });

    const readAiConfigFromUi = () => normalizeAiConfig({
      enabled: ui.aiEnabled.checked,
      endpoint: ui.aiEndpoint.value,
      apiFormat: ui.aiApiFormat.value,
      apiKey: ui.aiApiKey.value,
      model: ui.aiModel.value,
      systemPrompt: ui.aiSystemPrompt.value,
      codePreset: runtimeState.aiConfig.codePreset || AI_DEFAULT_CODE_PRESET,
      lastPrompt: ui.aiPrompt.value,
    });

    const saveAiConfigFromUi = () => {
      const config = persistAiConfig(readAiConfigFromUi());
      renderAiSummary();
      return config;
    };

    ui.saveButton.addEventListener('click', () => {
      runtimeState.code = ui.code.value || '';
      writeStorage(STORAGE_KEY_CODE, runtimeState.code);
      setStatus(localizeText('ローカル拡張コードを保存しました', 'Saved local extension code'), 'success');
    });

    ui.reloadButton.addEventListener('click', () => {
      runtimeState.code = ui.code.value || '';
      writeStorage(STORAGE_KEY_CODE, runtimeState.code);
      if (!runtimeState.enabled) {
        setEnabled(true, { persist: true, restart: true });
      } else {
        reloadRuntime();
      }
      setStatus(localizeText('ローカル拡張を反映しました', 'Applied local extension'), 'success');
    });

    ui.stopButton.addEventListener('click', () => {
      setEnabled(false, { persist: true, restart: true });
      setStatus(localizeText('ローカル拡張を停止しました', 'Stopped local extension'), 'info');
    });

    ui.templateButton.addEventListener('click', () => {
      if ((ui.code.value || '').trim()) {
        const accepted = window.confirm(
          localizeText(
            '現在のコードをテンプレートで上書きしますか？',
            'Replace the current code with the template?'
          )
        );
        if (!accepted) {
          return;
        }
      }
      ui.code.value = buildTemplateCode();
      runtimeState.code = ui.code.value;
      writeStorage(STORAGE_KEY_CODE, runtimeState.code);
      setStatus(localizeText('テンプレートを入力しました', 'Inserted template code'), 'info');
    });

    ui.clearToolButton.addEventListener('click', () => {
      setActiveLocalToolId('', { notifyRuntime: true });
      setStatus(localizeText('ローカルツールの選択を解除しました', 'Cleared local tool selection'), 'info');
    });

    ui.aiSaveButton.addEventListener('click', () => {
      saveAiConfigFromUi();
      setAiStatus(localizeText('BYOGPT 設定を保存しました', 'Saved BYOGPT settings'), 'success');
    });

    ui.aiTestButton.addEventListener('click', async () => {
      saveAiConfigFromUi();
      setAiBusy(true);
      setAiStatus(localizeText('接続テスト中...', 'Testing connection...'), 'info');
      try {
        const result = await performAiRequest({
          input: buildAiTestInput(),
        }, { source: 'panel-test' });
        setAiStatus(
          localizeText(
            `接続OK: ${result.model} @ ${result.endpointHost || 'endpoint'}`,
            `Connected: ${result.model} @ ${result.endpointHost || 'endpoint'}`
          ),
          'success'
        );
      } catch (error) {
        setAiStatus(extractAiErrorMessage({}, error?.message || String(error || '')), 'error');
      } finally {
        setAiBusy(false);
      }
    });

    ui.aiGenerateButton.addEventListener('click', async () => {
      const config = saveAiConfigFromUi();
      if (!sanitizeMultilineText(config.lastPrompt, 4000)) {
        setAiStatus(localizeText('コード生成の依頼を入力してください', 'Enter a prompt for code generation'), 'warn');
        return;
      }
      setAiBusy(true);
      setAiStatus(localizeText('コードを生成中...', 'Generating code...'), 'info');
      try {
        const result = await performAiRequest(
          buildAiCodeWriterRequest(config.lastPrompt, ui.code.value || '', config.codePreset),
          { source: 'panel-generate' }
        );
        const cleaned = stripMarkdownCodeFence(result.text);
        if (!cleaned) {
          throw new Error(localizeText('AI からコードを取得できませんでした', 'The AI did not return code'));
        }
        insertGeneratedCode(ui.code, cleaned);
        runtimeState.code = ui.code.value || '';
        writeStorage(STORAGE_KEY_CODE, runtimeState.code);
        setAiStatus(localizeText('コードを挿し込みました。必要なら「反映」で実行してください', 'Inserted code. Use Apply when you want to run it'), 'success');
        setStatus(localizeText('AIがローカル拡張コードを生成しました', 'AI generated local extension code'), 'success');
      } catch (error) {
        setAiStatus(extractAiErrorMessage({}, error?.message || String(error || '')), 'error');
      } finally {
        setAiBusy(false);
      }
    });

    renderLocalToolButtons();
    renderLocalToolMeta();
    renderAiSummary();
    updateLocalInputLayerState();
  }

  function init() {
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
    if (runtimeState.enabled) {
      startRuntime();
    } else {
      setStatus(localizeText('ローカル拡張はOFFです', 'Local extension is OFF'), 'info');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
