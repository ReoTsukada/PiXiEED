import { createDrawLiveSession } from './draw-live-session.mjs?rev=20261117-chat-connect-1';
import { CHATGPT_CONNECT_PROMPT, STORE_MCP_ENDPOINT, isPluginReviewEstimateCurrent, verifiedPublicPluginUrl } from '../mcp/connection-config.mjs?rev=20261117-chat-connect-1';

/** Small opt-in connection control; artistic instructions stay in the user's chat. */
export function mountDrawLiveSessionPanel({ draw, scope, isActive }) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const supplied = local && new URLSearchParams(location.search).get('mcpEndpoint');
  let endpoint = STORE_MCP_ENDPOINT;
  if (supplied) {
    try {
      const candidate = new URL(supplied);
      if (candidate.hostname === location.hostname && ['http:', 'https:'].includes(candidate.protocol) && !candidate.username && !candidate.password) endpoint = candidate.href;
    } catch { /* Ignore malformed local development overrides. */ }
  }
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet';
  stylesheet.href = '/css/draw-live-session.css?rev=20261118-draw-button-label-1'; document.head.append(stylesheet);
  const button = document.createElement('button'); button.type = 'button'; button.id = 'draw-gpt-connect';
  button.className = 'draw-gpt-connect';
  button.innerHTML = '<span class="draw-gpt-icon" aria-hidden="true"></span><span class="draw-button-label" aria-hidden="true">GPT</span>';
  button.setAttribute('aria-label', 'ChatGPTとつなぐ'); button.title = 'ChatGPTとつなぐ';
  button.setAttribute('aria-haspopup', 'dialog');
  const slot = document.createElement('div'); slot.className = 'px-tool-header-slot draw-gpt-slot'; slot.append(button);
  document.querySelector('.px-tool-header-controls')?.append(slot);
  if (!slot.isConnected) document.querySelector('.tool-direct__bar')?.append(slot);
  const dialog = document.createElement('dialog'); dialog.className = 'draw-live-dialog'; dialog.setAttribute('aria-labelledby', 'draw-live-title');
  const publicPluginUrl = verifiedPublicPluginUrl();
  const estimateHtml = isPluginReviewEstimateCurrent() ? '審査完了の目安：<time datetime="2026-12-01">2026年12月1日</time>。審査状況により前後します。' : '審査が続いています。一般公開日は未定です。';
  dialog.innerHTML = `<h2 id="draw-live-title">ChatGPTにこの作品の編集を頼む</h2>
    <p class="draw-live-install-state"><span data-live-publication>ChatGPT連携は現在審査中です。一般公開：審査承認後。${estimateHtml} 以前の手動接続は下の詳細から利用できます。</span><a data-live-store-link hidden target="_blank" rel="noopener noreferrer">ChatGPTにPiXiEEDを追加</a> <a href="/ai/#features">できることを見る</a></p>
    <details class="draw-live-connect-guide" data-live-connect-guide open>
      <summary id="draw-live-connect-title">ChatGPTに送る接続依頼文</summary>
      <p>接続許可画面を使うPiXiEEDを設定済みの方・一般公開後の手順です。</p>
      <label for="draw-live-connect-prompt">接続依頼文（コードは含まれません）</label>
      <textarea id="draw-live-connect-prompt" data-live-connect-prompt readonly rows="5" spellcheck="false"></textarea>
      <div class="draw-live-prompt-actions"><button type="button" data-live-copy-connect-prompt>依頼文をコピー</button><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPTを開く</a></div>
      <p class="draw-live-prompt-feedback" data-live-prompt-feedback role="status" aria-live="polite"></p>
      <ol><li>ChatGPTでPiXiEEDを選び、依頼文を送ります。</li><li>許可画面が開いたら、下の「接続コードを発行」。コードはその許可画面だけに入力します。</li><li>ChatGPTに戻り、描きたい内容を伝えます。</li></ol>
      <p>期限切れ後は新しいコードで再度許可します。</p>
    </details>
    <p class="draw-live-quick-note">Drawは接続中も開いたままにしてください。接続コードは許可画面だけに入力し、チャットには貼りません。無料接続は最長5分、サービス全体の上限は1日40回です。</p>
    <section class="draw-live-usage" aria-label="接続枠と残り時間">
      <div class="draw-live-gauge" data-daily-gauge>
        <div class="draw-live-gauge-heading"><strong>今日の接続枠（全員共通）</strong><span data-daily-value>利用状況は不明です</span></div>
        <progress data-daily-meter max="40" value="0" aria-label="今日の残り接続枠" hidden></progress>
        <div class="draw-live-gauge-foot"><span data-daily-status>利用状況をまだ取得していません。</span><span data-daily-reset></span></div>
      </div>
      <div class="draw-live-gauge" data-session-gauge>
        <div class="draw-live-gauge-heading"><strong>この接続の残り時間</strong><span data-session-value>未接続</span></div>
        <progress data-session-meter max="300000" value="0" aria-label="この接続の残り時間" hidden></progress>
        <div class="draw-live-gauge-foot"><span data-session-note>未接続・1回最長5分</span></div>
      </div>
    </section>
    <details class="draw-live-install-help"><summary>以前の手動接続を使う方</summary><p>以前にカスタムMCPとしてPiXiEEDを追加し、手動接続を設定済みの方は、互換用の接続方法を引き続き利用できます。</p><button type="button" data-live-start-legacy>手動接続を開始</button></details>
    <details class="draw-live-data-help"><summary>接続で許可すること・データの扱い</summary><p>接続すると、この作品の内容をChatGPTが確認し、描画・色補正・レイヤー・コマの編集・端末への保存を操作できます。</p><p>作品データと操作結果はCloudflareの中継サーバーで一時処理・保存されます。期限切れ後のサーバー側の削除処理で消去されます。削除は期限到達と同時とは限りません。ChatGPT側の会話履歴は同サービスの設定に従います。</p></details>
    <p class="draw-live-status" role="status"></p>
    <div class="draw-live-pair" hidden><label for="draw-live-code" data-live-code-label>接続許可画面に入力するコード</label><textarea id="draw-live-code" readonly rows="3" spellcheck="false"></textarea>
    <p data-live-code-instructions>ChatGPTが開く接続許可画面にコードを入力してください。チャット本文には貼らないでください。コードは一度だけ使えます。</p><button type="button" data-live-copy-code>コードをコピー</button>
    <div data-live-legacy-prompt hidden><label for="draw-live-prompt">手動接続の依頼文（旧方式用・コードを含みます）</label><textarea id="draw-live-prompt" readonly rows="3" spellcheck="false"></textarea><button type="button" data-live-copy-prompt>旧方式の依頼文をコピー</button></div></div>
    <p class="draw-live-scope">このタブの作品だけを操作します。作品の切り替え・タブを閉じると接続は終了します。保存先はこの端末です。</p>
    <div class="draw-live-actions"><button type="button" data-live-start>接続コードを発行</button><button type="button" data-live-stop hidden>接続を終了</button><button type="button" data-live-close>閉じる</button></div>`;
  for (const [selector, icon] of [
    ['[data-live-copy-connect-prompt], [data-live-copy-code], [data-live-copy-prompt]', 'copy'],
    ['[data-live-start], [data-live-start-legacy]', 'chat-pixels'],
    ['[data-live-stop], [data-live-close]', 'close']
  ]) for (const action of dialog.querySelectorAll(selector)) {
    const image = document.createElement('img'); image.className = 'draw-inline-icon';
    image.src = `/assets/icons/pixieed/${icon}.svg`; image.alt = ''; action.prepend(image);
  }
  document.body.append(dialog);
  if (publicPluginUrl) {
    const storeLink = dialog.querySelector('[data-live-store-link]');
    storeLink.href = publicPluginUrl; storeLink.hidden = false;
    dialog.querySelector('[data-live-publication]').textContent = 'ChatGPTにPiXiEEDを追加してから、接続を始めてください。';
  }
  const status = dialog.querySelector('.draw-live-status'), pair = dialog.querySelector('.draw-live-pair'), code = dialog.querySelector('#draw-live-code');
  const connectPrompt = dialog.querySelector('[data-live-connect-prompt]');
  const promptFeedback = dialog.querySelector('[data-live-prompt-feedback]');
  connectPrompt.value = CHATGPT_CONNECT_PROMPT;
  const prompt = dialog.querySelector('#draw-live-prompt');
  const codeInstructions = dialog.querySelector('[data-live-code-instructions]');
  const codeLabel = dialog.querySelector('[data-live-code-label]');
  const quickNote = dialog.querySelector('.draw-live-quick-note');
  const legacyPrompt = dialog.querySelector('[data-live-legacy-prompt]');
  const start = dialog.querySelector('[data-live-start]'), legacyStart = dialog.querySelector('[data-live-start-legacy]'), stop = dialog.querySelector('[data-live-stop]');
  const dailyValue = dialog.querySelector('[data-daily-value]');
  const dailyMeter = dialog.querySelector('[data-daily-meter]');
  const dailyStatus = dialog.querySelector('[data-daily-status]');
  const dailyReset = dialog.querySelector('[data-daily-reset]');
  const dailyGauge = dialog.querySelector('[data-daily-gauge]');
  const sessionValue = dialog.querySelector('[data-session-value]');
  const sessionMeter = dialog.querySelector('[data-session-meter]');
  const sessionNote = dialog.querySelector('[data-session-note]');
  const sessionGauge = dialog.querySelector('[data-session-gauge]');
  const connectGuide = dialog.querySelector('[data-live-connect-guide]');
  const pad = value => String(value).padStart(2, '0');
  const formatDuration = milliseconds => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
  };
  const parseTimestamp = value => typeof value === 'number' ? value : Date.parse(value);
  const japanTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  const formatJapanTime = value => japanTimeFormatter.format(value);
  let latestState = { phase: 'idle', expiresAt: null, usage: null, usageStatus: 'idle', usageMessage: '' };
  let ticker = null;
  let requestedBoundaryRefreshAt = null;
  let client;
  function stopTicker() {
    if (ticker !== null) window.clearInterval(ticker);
    ticker = null;
  }
  function updateGauges(state = latestState) {
    latestState = state;
    const usage = state.usage;
    const resetAt = parseTimestamp(usage?.resetsAt);
    const clockOffset = Number.isFinite(usage?.clockOffsetMs) ? usage.clockOffsetMs : 0;
    const resetPassed = Number.isFinite(resetAt) && Date.now() + clockOffset >= resetAt;
    const usageReady = state.usageStatus === 'ready' && usage && Number.isFinite(usage.dailyLimit) && Number.isFinite(usage.dailyUsed) && Number.isFinite(usage.dailyRemaining);
    if (resetPassed) {
      dailyValue.textContent = '確認中';
      dailyMeter.hidden = true;
      dailyStatus.textContent = '日次枠が切り替わりました。利用状況を更新しています。';
      dailyReset.textContent = '';
      delete dailyGauge.dataset.low;
      if (requestedBoundaryRefreshAt !== resetAt) {
        requestedBoundaryRefreshAt = resetAt;
        void client?.refreshUsage({ force: true }).catch(() => {});
      }
    } else if (usageReady) {
      requestedBoundaryRefreshAt = null;
      const limit = Math.max(0, Math.floor(usage.dailyLimit));
      const remaining = Math.max(0, Math.min(limit, Math.floor(usage.dailyRemaining)));
      const lowQuota = remaining <= 3;
      dailyValue.textContent = `あと${remaining}/${limit}回`;
      dailyMeter.max = Math.max(1, limit);
      dailyMeter.value = remaining;
      dailyMeter.hidden = limit <= 0;
      dailyGauge.dataset.low = String(lowQuota);
      dailyStatus.textContent = `${usage.receivedAt ? `更新時点：${formatJapanTime(usage.receivedAt)}（日本時間）` : '取得した利用状況'}${remaining === 0 ? '・本日の接続枠を使い切りました。' : lowQuota ? '・残りわずかです。' : ''}`;
      dailyReset.textContent = Number.isFinite(resetAt) ? `次の回復：${formatJapanTime(resetAt)}（日本時間・UTC 0時）` : '';
    } else {
      dailyValue.textContent = state.usageStatus === 'loading' ? '確認中' : '利用状況は不明です';
      dailyMeter.hidden = true;
      dailyStatus.textContent = state.usageMessage || (state.usageStatus === 'error' ? '利用状況を取得できませんでした。' : '利用状況をまだ取得していません。');
      dailyReset.textContent = '';
      delete dailyGauge.dataset.low;
    }

    const active = ['starting', 'waiting', 'connected'].includes(state.phase);
    const expiresAt = parseTimestamp(state.expiresAt);
    const duration = Number(state.sessionDurationMs || usage?.sessionDurationMs);
    if (!active) {
      sessionValue.textContent = '未接続';
      sessionMeter.hidden = true;
      sessionNote.textContent = '未接続・1回最長5分';
      delete sessionGauge.dataset.low;
    } else if (!Number.isFinite(expiresAt)) {
      sessionValue.textContent = '残り時間を確認中';
      sessionMeter.hidden = true;
      sessionNote.textContent = '接続準備中・1回最長5分';
      delete sessionGauge.dataset.low;
    } else if (!Number.isFinite(duration) || duration <= 0) {
      sessionValue.textContent = '残り時間は不明です';
      sessionMeter.hidden = true;
      sessionNote.textContent = '接続時間の情報を取得できませんでした。';
      delete sessionGauge.dataset.low;
    } else {
      const clockOffset = Number.isFinite(usage?.clockOffsetMs) ? usage.clockOffsetMs : 0;
      const remaining = Math.max(0, Math.min(duration, expiresAt - (Date.now() + clockOffset)));
      sessionValue.textContent = `${formatDuration(remaining)} / ${formatDuration(duration)}`;
      sessionMeter.max = duration;
      sessionMeter.value = remaining;
      sessionMeter.hidden = false;
      sessionNote.textContent = remaining === 0 ? '接続期限が過ぎています。' : remaining <= 60_000 ? '残りわずかです。' : '接続中も時間は進みます。';
      sessionGauge.dataset.low = String(remaining > 0 && remaining <= 60_000);
    }
  }
  function startTicker() {
    if (!dialog.open || document.visibilityState === 'hidden' || ticker !== null) return;
    updateGauges(latestState);
    ticker = window.setInterval(() => updateGauges(latestState), 1000);
  }
  function refreshUsageIfStale() {
    const receivedAt = Number(latestState.usage?.receivedAt);
    if (!Number.isFinite(receivedAt) || Date.now() - receivedAt >= 30_000) {
      void client.refreshUsage().catch(() => {});
    }
  }
  const clientView = createDrawLiveSession({ draw, endpoint, isActive, onChange(state) {
    updateGauges(state);
    if (['waiting', 'connected'].includes(state.phase)) connectGuide.open = false;
    status.textContent = state.message; code.value = state.pairingCode;
    prompt.value = state.pairingCode && state.mode === 'legacy' ? `PiXiEEDで接続コード ${state.pairingCode} を使い、このDraw作品を編集してください。Drawは開いたままにします。` : '';
    codeInstructions.textContent = state.mode === 'oauth'
      ? 'ChatGPTが開く接続許可画面にコードを入力してください。チャット本文には貼らないでください。コードは一度だけ使えます。'
      : 'PiXiEEDを選んだChatGPTに接続コードを入力して接続します。コードは一度だけ使えます。';
    codeLabel.textContent = state.mode === 'legacy' ? '旧手動方式の一時接続コード' : '接続許可画面に入力するコード';
    quickNote.textContent = state.mode === 'legacy' && ['starting', 'waiting', 'connected'].includes(state.phase)
      ? '旧手動方式を利用中です。設定済みのPiXiEEDとの会話にだけ、下の旧方式用の依頼文を送ります。Drawは開いたままにしてください。無料接続は最長5分、全体1日40回です。'
      : 'Drawは接続中も開いたままにしてください。接続コードは許可画面だけに入力し、チャットには貼りません。無料接続は最長5分、サービス全体の上限は1日40回です。';
    legacyPrompt.hidden = state.mode !== 'legacy';
    pair.hidden = !state.pairingCode; start.hidden = ['waiting', 'connected'].includes(state.phase);
    legacyStart.disabled = state.phase === 'starting'; legacyStart.hidden = ['waiting', 'connected'].includes(state.phase);
    start.disabled = state.phase === 'starting'; stop.hidden = !['starting', 'waiting', 'connected'].includes(state.phase);
    const connectionLabel = state.phase === 'connected' ? 'ChatGPT接続中' : 'ChatGPTとつなぐ';
    button.setAttribute('aria-label', connectionLabel); button.title = connectionLabel;
    button.dataset.connected = String(state.phase === 'connected');
  }});
  client = clientView;
  scope.listen(button, 'click', () => { dialog.showModal(); refreshUsageIfStale(); startTicker(); });
  scope.listen(dialog, 'close', stopTicker);
  scope.listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopTicker();
    else if (dialog.open) { refreshUsageIfStale(); startTicker(); }
  });
  scope.listen(start, 'click', () => { void client.start({ mode: 'oauth' }).catch(() => {}); });
  scope.listen(legacyStart, 'click', () => { void client.start({ mode: 'legacy' }).catch(() => {}); });
  scope.listen(stop, 'click', () => { void client.stop(); });
  scope.listen(dialog.querySelector('[data-live-close]'), 'click', () => dialog.close());
  scope.listen(dialog.querySelector('[data-live-copy-code]'), 'click', async () => {
    try { await navigator.clipboard.writeText(code.value); status.textContent = '接続コードをコピーしました。'; }
    catch { code.select(); status.textContent = '接続コードを選択しました。コピーしてお使いください。'; }
  });
  scope.listen(dialog.querySelector('[data-live-copy-connect-prompt]'), 'click', async () => {
    try { await navigator.clipboard.writeText(connectPrompt.value); promptFeedback.textContent = '接続依頼文をコピーしました。'; }
    catch { connectPrompt.select(); promptFeedback.textContent = '接続依頼文を選択しました。コピーしてお使いください。'; }
  });
  scope.listen(dialog.querySelector('[data-live-copy-prompt]'), 'click', async () => {
    try { await navigator.clipboard.writeText(prompt.value); status.textContent = '依頼文をコピーしました。'; }
    catch { prompt.select(); status.textContent = '依頼文を選択しました。コピーしてお使いください。'; }
  });
  scope.listen(window, 'pagehide', () => { void client.stop(); });
  let detach = null, removed = false;
  const attached = draw.attachProjectHooks?.({ onOpen() { if (['waiting', 'connected', 'starting'].includes(client.getState().phase)) void client.stop('作品を開いたため接続を終了しました。'); } });
  Promise.resolve(attached).then(cleanup => { if (removed) cleanup?.(); else detach = cleanup; }).catch(() => {});
  scope.add(() => { removed = true; stopTicker(); void client.stop(); if (typeof detach === 'function') detach(); dialog.remove(); slot.remove(); stylesheet.remove(); });
  return client;
}
