import { createDrawLiveSession } from './draw-live-session.mjs?rev=20261117-fast-store-draw-1';
import { STORE_MCP_ENDPOINT, verifiedPublicPluginUrl } from '../mcp/connection-config.mjs?rev=20261117-store-onboarding-1';

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
  stylesheet.href = '/css/draw-live-session.css?rev=20261117-store-onboarding-1'; document.head.append(stylesheet);
  const button = document.createElement('button'); button.type = 'button'; button.id = 'draw-gpt-connect';
  button.className = 'draw-gpt-connect'; button.textContent = 'ChatGPTとつなぐ';
  button.setAttribute('aria-haspopup', 'dialog');
  const slot = document.createElement('div'); slot.className = 'px-tool-header-slot draw-gpt-slot'; slot.append(button);
  document.querySelector('.px-tool-header-controls')?.append(slot);
  if (!slot.isConnected) document.querySelector('.tool-direct__bar')?.append(slot);
  const dialog = document.createElement('dialog'); dialog.className = 'draw-live-dialog'; dialog.setAttribute('aria-labelledby', 'draw-live-title');
  const publicPluginUrl = verifiedPublicPluginUrl();
  dialog.innerHTML = `<h2 id="draw-live-title">ChatGPTにこの作品の編集を頼む</h2>
    <p class="draw-live-install-state"><span data-live-publication>ChatGPT向けストア公開準備中です。以前の手動接続は下の詳細から利用できます。</span><a data-live-store-link hidden target="_blank" rel="noopener noreferrer">ChatGPTにPiXiEEDを追加</a> <a href="/ai/">接続ガイド</a></p>
    <details class="draw-live-install-help"><summary>以前の手動接続を使う方</summary><p>以前にカスタムMCPとしてPiXiEEDを追加し、手動接続を設定済みの方は、互換用の接続方法を引き続き利用できます。</p><button type="button" data-live-start-legacy>手動接続を開始</button></details>
    <p>接続すると、この作品の内容をChatGPTが確認し、描画・色補正・レイヤー・コマの編集・端末への保存を操作できます。Drawは接続中も開いたままにしてください。</p>
    <p>作品データと操作結果はCloudflareの中継サーバーで一時処理・保存されます。接続は最長15分で終了し、期限切れ後のサーバー側の削除処理で消去されます。削除は期限到達と同時とは限りません。ChatGPT側の会話履歴は同サービスの設定に従います。</p>
    <p class="draw-live-status" role="status"></p>
    <div class="draw-live-pair" hidden><label for="draw-live-code">接続コード</label><textarea id="draw-live-code" readonly rows="3" spellcheck="false"></textarea>
    <p data-live-code-instructions>ChatGPTが開く接続許可画面にコードを入力してください。チャット本文には貼らないでください。コードは一度だけ使えます。</p><button type="button" data-live-copy-code>コードをコピー</button>
    <div data-live-legacy-prompt hidden><label for="draw-live-prompt">ChatGPTへの依頼文</label><textarea id="draw-live-prompt" readonly rows="3" spellcheck="false"></textarea><button type="button" data-live-copy-prompt>依頼文をコピー</button></div></div>
    <p class="draw-live-scope">このタブの作品だけが対象です。接続は最長15分です。ライブ接続の上限はPiXiEEDサービス全体で1日20回です。作品の切り替え・タブを閉じると接続は終了します。作品の保存先はこの端末です。</p>
    <div class="draw-live-actions"><button type="button" data-live-start>この作品を接続</button><button type="button" data-live-stop hidden>接続を終了</button><button type="button" data-live-close>閉じる</button></div>`;
  document.body.append(dialog);
  if (publicPluginUrl) {
    const storeLink = dialog.querySelector('[data-live-store-link]');
    storeLink.href = publicPluginUrl; storeLink.hidden = false;
    dialog.querySelector('[data-live-publication]').textContent = 'ChatGPTにPiXiEEDを追加してから、接続を始めてください。';
  }
  const status = dialog.querySelector('.draw-live-status'), pair = dialog.querySelector('.draw-live-pair'), code = dialog.querySelector('#draw-live-code');
  const prompt = dialog.querySelector('#draw-live-prompt');
  const codeInstructions = dialog.querySelector('[data-live-code-instructions]');
  const legacyPrompt = dialog.querySelector('[data-live-legacy-prompt]');
  const start = dialog.querySelector('[data-live-start]'), legacyStart = dialog.querySelector('[data-live-start-legacy]'), stop = dialog.querySelector('[data-live-stop]');
  const client = createDrawLiveSession({ draw, endpoint, isActive, onChange(state) {
    status.textContent = state.message; code.value = state.pairingCode;
    prompt.value = state.pairingCode && state.mode === 'legacy' ? `PiXiEEDで接続コード ${state.pairingCode} を使い、このDraw作品を編集してください。Drawは開いたままにします。` : '';
    codeInstructions.textContent = state.mode === 'oauth'
      ? 'ChatGPTが開く接続許可画面にコードを入力してください。チャット本文には貼らないでください。コードは一度だけ使えます。'
      : 'PiXiEEDを選んだChatGPTに接続コードを入力して接続します。コードは一度だけ使えます。';
    legacyPrompt.hidden = state.mode !== 'legacy';
    pair.hidden = !state.pairingCode; start.hidden = ['waiting', 'connected'].includes(state.phase);
    legacyStart.disabled = state.phase === 'starting'; legacyStart.hidden = ['waiting', 'connected'].includes(state.phase);
    start.disabled = state.phase === 'starting'; stop.hidden = !['starting', 'waiting', 'connected'].includes(state.phase);
    button.textContent = state.phase === 'connected' ? 'ChatGPT接続中' : 'ChatGPTとつなぐ';
    button.dataset.connected = String(state.phase === 'connected');
  }});
  scope.listen(button, 'click', () => dialog.showModal());
  scope.listen(start, 'click', () => { void client.start({ mode: 'oauth' }).catch(() => {}); });
  scope.listen(legacyStart, 'click', () => { void client.start({ mode: 'legacy' }).catch(() => {}); });
  scope.listen(stop, 'click', () => { void client.stop(); });
  scope.listen(dialog.querySelector('[data-live-close]'), 'click', () => dialog.close());
  scope.listen(dialog.querySelector('[data-live-copy-code]'), 'click', async () => {
    try { await navigator.clipboard.writeText(code.value); status.textContent = '接続コードをコピーしました。'; }
    catch { code.select(); status.textContent = '接続コードを選択しました。コピーしてお使いください。'; }
  });
  scope.listen(dialog.querySelector('[data-live-copy-prompt]'), 'click', async () => {
    try { await navigator.clipboard.writeText(prompt.value); status.textContent = '依頼文をコピーしました。'; }
    catch { prompt.select(); status.textContent = '依頼文を選択しました。コピーしてお使いください。'; }
  });
  scope.listen(window, 'pagehide', () => { void client.stop(); });
  let detach = null, removed = false;
  const attached = draw.attachProjectHooks?.({ onOpen() { if (['waiting', 'connected', 'starting'].includes(client.getState().phase)) void client.stop('作品を開いたため接続を終了しました。'); } });
  Promise.resolve(attached).then(cleanup => { if (removed) cleanup?.(); else detach = cleanup; }).catch(() => {});
  scope.add(() => { removed = true; void client.stop(); if (typeof detach === 'function') detach(); dialog.remove(); slot.remove(); stylesheet.remove(); });
  return client;
}
