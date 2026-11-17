import { createDrawLiveSession } from './draw-live-session.mjs?rev=20261117-live-draw-2';
import { MCP_ENDPOINT } from '../mcp/connection-config.mjs';

/** Small opt-in connection control; artistic instructions stay in the user's chat. */
export function mountDrawLiveSessionPanel({ draw, scope, isActive }) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const supplied = local && new URLSearchParams(location.search).get('mcpEndpoint');
  let endpoint = MCP_ENDPOINT;
  if (supplied) {
    try {
      const candidate = new URL(supplied);
      if (candidate.hostname === location.hostname && ['http:', 'https:'].includes(candidate.protocol) && !candidate.username && !candidate.password) endpoint = candidate.href;
    } catch { /* Ignore malformed local development overrides. */ }
  }
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../../css/draw-live-session.css', import.meta.url).href; document.head.append(stylesheet);
  const button = document.createElement('button'); button.type = 'button'; button.id = 'draw-gpt-connect';
  button.className = 'draw-gpt-connect'; button.textContent = 'GPT連携';
  button.setAttribute('aria-haspopup', 'dialog');
  const slot = document.createElement('div'); slot.className = 'px-tool-header-slot draw-gpt-slot'; slot.append(button);
  document.querySelector('.px-tool-header-controls')?.append(slot);
  if (!slot.isConnected) document.querySelector('.tool-direct__bar')?.append(slot);
  const dialog = document.createElement('dialog'); dialog.className = 'draw-live-dialog'; dialog.setAttribute('aria-labelledby', 'draw-live-title');
  dialog.innerHTML = `<h2 id="draw-live-title">GPTとこの作品を編集</h2>
    <p>接続すると、この作品の内容をChatGPTが確認し、描画・色補正・レイヤー・コマの編集・端末への保存を操作できます。</p>
    <p>作品データと操作結果はCloudflareの中継サーバーに一時保存され、15分の接続期限後に削除されます。ChatGPT側の会話履歴は同サービスの設定に従います。</p>
    <p class="draw-live-status" role="status"></p>
    <div class="draw-live-pair" hidden><label for="draw-live-code">接続コード</label><textarea id="draw-live-code" readonly rows="3" spellcheck="false"></textarea>
    <p>PiXiEEDを選んだChatGPTに、このコードで接続するよう伝えてください。コードは一度だけ使えます。</p><button type="button" data-live-copy>コードをコピー</button></div>
    <p class="draw-live-scope">このタブの作品だけが対象です。作品の切り替え・タブを閉じる・期限切れで接続は終了します。公開やクラウド同期は行いません。</p>
    <div class="draw-live-actions"><button type="button" data-live-start>この作品を接続</button><button type="button" data-live-stop hidden>接続を終了</button><button type="button" data-live-close>閉じる</button></div>`;
  document.body.append(dialog);
  const status = dialog.querySelector('.draw-live-status'), pair = dialog.querySelector('.draw-live-pair'), code = dialog.querySelector('textarea');
  const start = dialog.querySelector('[data-live-start]'), stop = dialog.querySelector('[data-live-stop]');
  const client = createDrawLiveSession({ draw, endpoint, isActive, onChange(state) {
    status.textContent = state.message; code.value = state.pairingCode;
    pair.hidden = !state.pairingCode; start.hidden = ['waiting', 'connected'].includes(state.phase);
    start.disabled = state.phase === 'starting'; stop.hidden = !['starting', 'waiting', 'connected'].includes(state.phase);
    button.textContent = state.phase === 'connected' ? 'GPT接続中' : 'GPT連携';
    button.dataset.connected = String(state.phase === 'connected');
  }});
  scope.listen(button, 'click', () => dialog.showModal());
  scope.listen(start, 'click', () => { void client.start().catch(() => {}); });
  scope.listen(stop, 'click', () => { void client.stop(); });
  scope.listen(dialog.querySelector('[data-live-close]'), 'click', () => dialog.close());
  scope.listen(dialog.querySelector('[data-live-copy]'), 'click', async () => {
    try { await navigator.clipboard.writeText(code.value); status.textContent = '接続コードをコピーしました。'; }
    catch { code.select(); status.textContent = '接続コードを選択しました。コピーしてお使いください。'; }
  });
  scope.listen(window, 'pagehide', () => { void client.stop(); });
  let detach = null, removed = false;
  const attached = draw.attachProjectHooks?.({ onOpen() { if (['waiting', 'connected', 'starting'].includes(client.getState().phase)) void client.stop('作品を開いたため接続を終了しました。'); } });
  Promise.resolve(attached).then(cleanup => { if (removed) cleanup?.(); else detach = cleanup; }).catch(() => {});
  scope.add(() => { removed = true; void client.stop(); if (typeof detach === 'function') detach(); dialog.remove(); slot.remove(); stylesheet.remove(); });
  return client;
}
