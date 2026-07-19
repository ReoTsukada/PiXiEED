(function () {
  'use strict';
  if (window.PiXiEEDMarketDevAccess) return;

  function accountUrl() {
    const account = new URL('../account/index.html', window.location.href);
    account.searchParams.set('returnTo', window.location.href);
    return account.href;
  }

  function mountDenied(authenticated, writeLocked = false) {
    let gate = document.getElementById('marketDevGate');
    if (!gate) {
      gate = document.createElement('main');
      gate.id = 'marketDevGate';
      gate.className = 'market-dev-gate';
      const icon = new Image(); icon.src = new URL('../Market.png', window.location.href).href; icon.alt = '';
      const label = document.createElement('span'); label.className = 'market-dev-gate__label'; label.textContent = writeLocked ? 'COMING SOON' : 'DEVELOPMENT ACCESS';
      const title = document.createElement('h1'); title.textContent = writeLocked ? '出品機能は準備中です' : 'この機能はDEV限定公開中です';
      const copy = document.createElement('p');
      copy.textContent = writeLocked
        ? 'マーケットの閲覧は利用できますが、出品・販売者設定・審査はまだ利用できません。'
        : (authenticated
          ? 'このアカウントにはDEV権限がありません。'
          : 'DEVアカウントでログインすると開発中の機能を確認できます。');
      const actions = document.createElement('div'); actions.className = 'market-dev-gate__actions';
      const primary = document.createElement('a');
      primary.href = writeLocked ? new URL('./index.html', window.location.href).href : accountUrl();
      primary.textContent = writeLocked ? 'マーケットへ戻る' : (authenticated ? 'マイページへ戻る' : 'ログインする');
      const secondary = document.createElement('a');
      secondary.href = writeLocked ? accountUrl() : new URL('../index.html', window.location.href).href;
      secondary.textContent = writeLocked ? 'マイページへ' : 'ホームへ';
      secondary.className = 'is-subtle';
      actions.append(primary, secondary); gate.append(icon, label, title, copy, actions); document.body.appendChild(gate);
    }
    document.documentElement.dataset.pixieedMarketAccess = 'denied';
  }

  const ready = (async () => {
    const baseAccess = window.PiXiEEDDevAccess
      ? await window.PiXiEEDDevAccess.check()
      : { authenticated: false, user: null, client: null };
    const access = {
      ...baseAccess,
      allowed: baseAccess.allowed === true,
      authenticated: Boolean(baseAccess.user)
    };
    const writeLocked = document.documentElement.dataset.pixieedMarketWrite === 'locked';
    if (writeLocked) {
      if (document.readyState === 'loading') {
        await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
      }
      mountDenied(access.authenticated, true);
      return { ...access, allowed: false, writeLocked: true };
    }
    if (access.allowed) {
      document.documentElement.dataset.pixieedMarketAccess = 'allowed';
    } else if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
      mountDenied(access.authenticated);
    } else {
      mountDenied(access.authenticated);
    }
    return access;
  })();

  window.PiXiEEDMarketDevAccess = Object.freeze({ ready });
})();
