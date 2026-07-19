(function () {
  'use strict';
  if (window.PiXiEEDMarketPageAccess) return;

  function accountUrl() {
    const account = new URL('../account/index.html', window.location.href);
    account.searchParams.set('returnTo', window.location.href);
    return account.href;
  }

  function mountDenied(authenticated) {
    let gate = document.getElementById('marketAccessGate');
    if (gate) return;
    gate = document.createElement('main');
    gate.id = 'marketAccessGate';
    gate.className = 'market-access-gate';
    const icon = new Image(); icon.src = new URL('../assets/icons/Market.png', window.location.href).href; icon.alt = '';
    const label = document.createElement('span'); label.className = 'market-access-gate__label'; label.textContent = 'MARKET ACCOUNT';
    const title = document.createElement('h1'); title.textContent = authenticated ? 'メール確認が必要です' : 'ログインして利用してください';
    const copy = document.createElement('p');
    copy.textContent = authenticated
      ? '出品・購入にはメール確認済みのアカウントが必要です。'
      : 'マーケットの出品・購入・販売者設定は、ログインすると利用できます。';
    const actions = document.createElement('div'); actions.className = 'market-access-gate__actions';
    const primary = document.createElement('a'); primary.href = accountUrl(); primary.textContent = authenticated ? '確認・アカウント設定へ' : 'ログインする';
    const secondary = document.createElement('a'); secondary.href = new URL('./index.html', window.location.href).href; secondary.textContent = 'マーケットを見る'; secondary.className = 'is-subtle';
    actions.append(primary, secondary); gate.append(icon, label, title, copy, actions); document.body.appendChild(gate);
    document.documentElement.dataset.pixieedMarketAccess = 'denied';
  }

  const ready = (async () => {
    const access = window.PiXiEEDMarketAccess
      ? await window.PiXiEEDMarketAccess.check()
      : { allowed: false, authenticated: false, user: null, client: null };
    if (access.allowed) {
      document.documentElement.dataset.pixieedMarketAccess = 'allowed';
      return access;
    }
    if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    mountDenied(access.authenticated);
    return access;
  })();

  window.PiXiEEDMarketPageAccess = Object.freeze({ ready });
})();
