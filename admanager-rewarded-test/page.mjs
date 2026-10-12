import { createRewardedController } from './controller.mjs';
import { createMockAdapter } from './mock-adapter.mjs';
import { createGptAdapter, LIVE_DELIVERY_ENABLED } from './gpt-adapter.mjs';
const el = id => document.getElementById(id);
const mode = el('delivery-mode'), scenario = el('mock-scenario'), optIn = el('opt-in'), dialog = el('mock-ad');
let adapter = null, controller;
const labels = { idle:'待機中', loading:'準備中', ready:'準備完了・視聴操作待ち', showing:'視聴中', granted:'報酬獲得イベント受領', closed:'閉じました', 'no-fill':'広告なし', unsupported:'この環境は非対応', error:'エラー', cancelled:'中止しました', disposed:'ページを離れました' };
function render(state) {
  const live = mode.value === 'live', active = ['loading','ready','showing','granted'].includes(state.phase);
  el('state').textContent = labels[state.phase] || state.phase; el('state').dataset.phase = state.phase;
  el('reward-total').textContent = String(state.totalRewards);
  el('receipt').textContent = state.rewarded ? 'この試行のgrantedを一度受領しました。テストカウントを1増やしました。' : 'この試行のgrantedは未受領です。';
  el('prepare').disabled = active || state.phase === 'disposed' || (live && (!LIVE_DELIVERY_ENABLED || !optIn.checked));
  el('watch').disabled = state.phase !== 'ready' || !optIn.checked;
  el('mock-late-grant').disabled = live || state.phase !== 'closed' || state.rewarded;
  el('mock-grant').disabled = state.rewarded;
  el('error').hidden = !state.error; el('error').textContent = state.error || '';
  el('event-log').replaceChildren(...state.log.slice().reverse().map(entry => {
    const row = document.createElement('li'); row.textContent = `#${entry.attempt} ${entry.event}${entry.message ? ' — '+entry.message : ''}`; return row;
  }));
}
controller = createRewardedController({ timeoutMs:LIVE_DELIVERY_ENABLED ? 15000 : 1200, displayTimeoutMs:0, onChange:render,
  createAdapter({ emit }) {
    if (mode.value === 'live') {
      adapter = createGptAdapter({ emit, enabled:LIVE_DELIVERY_ENABLED, optIn:optIn.checked });
    } else adapter = createMockAdapter({ emit, scenario:scenario.value });
    return adapter;
  }
});
function chooseMode() {
  controller.cancel(); optIn.checked = false;
  if (dialog.open) dialog.close();
  const live = mode.value === 'live';
  scenario.disabled = live;
  el('mode-notice').dataset.live = String(live);
  el('mode-notice').textContent = live
    ? 'GPT実配信アダプター：配信は未承認・無効です。SDKを読み込まず、実広告へ通信しません。'
    : 'モック：Googleの広告SDKを読み込まず、外部へ通信しません。';
  el('prepare').textContent = live ? '実広告の準備（現在無効）' : 'モックを準備';
  el('watch').textContent = live ? '広告を視聴' : 'モック広告を視聴';
  render(controller.state);
}
mode.addEventListener('change', chooseMode);
scenario.addEventListener('change', () => { controller.cancel(); if(dialog.open)dialog.close(); render(controller.state); });
optIn.addEventListener('change', () => render(controller.state));
el('prepare').addEventListener('click', () => {
  if (mode.value === 'live' && (!LIVE_DELIVERY_ENABLED || !optIn.checked)) return;
  void controller.prepare();
});
el('watch').addEventListener('click', () => {
  if (controller.show({ optIn:optIn.checked }) && mode.value === 'mock') dialog.showModal();
});
el('cancel').addEventListener('click', () => { controller.cancel(); if(dialog.open)dialog.close(); render(controller.state); });
el('mock-completed').addEventListener('click', () => adapter?.fire?.('videoCompleted'));
el('mock-grant').addEventListener('click', () => adapter?.fire?.('granted', { amount:1, type:'local-test-count' }));
const closeMock = () => { adapter?.fire?.('closed'); if(dialog.open)dialog.close(); el('prepare').focus({preventScroll:true}); };
el('mock-close').addEventListener('click', closeMock);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeMock(); });
dialog.addEventListener('close', () => {
  if (['showing','granted'].includes(controller.state.phase)) closeMock();
});
el('mock-late-grant').addEventListener('click', () => adapter?.fire?.('granted', { amount:1, type:'local-test-count' }));
window.addEventListener('pagehide', () => controller.dispose());
window.addEventListener('pageshow', event => { if(event.persisted)location.reload(); });
render(controller.state);
