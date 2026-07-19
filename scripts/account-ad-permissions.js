(function () {
  'use strict';

  const form = document.getElementById('adFreeGrantForm');
  const emailInput = document.getElementById('adFreeGrantEmail');
  const submitButton = document.getElementById('adFreeGrantButton');
  const status = document.getElementById('adFreeGrantStatus');
  const list = document.getElementById('adFreeGrantList');
  if (!form || !emailInput || !submitButton || !status || !list) return;

  let client = null;
  let requestSequence = 0;
  let authListenerBound = false;
  const ACCESS_CHANGE_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_DELETED', 'USER_UPDATED']);

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function readableError(error) {
    const message = String(error?.message || '操作を完了できませんでした。');
    if (/confirmed account not found/i.test(message)) return '確認済みのPiXiEEDアカウントが見つかりません。';
    if (/admin self grant/i.test(message)) return '確認用の管理者アカウント自身には広告OFFを付与できません。';
    if (/valid email/i.test(message)) return '正しいメールアドレスを入力してください。';
    if (/admin permission/i.test(message)) return 'この操作に必要な管理者権限がありません。';
    return message;
  }

  function formatDate(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function renderGrants(grants) {
    list.replaceChildren();
    if (!grants.length) {
      const empty = document.createElement('p');
      empty.className = 'helper';
      empty.textContent = '広告OFF権限を付与したユーザーはいません。';
      list.appendChild(empty);
      return;
    }

    grants.forEach((grant) => {
      const item = document.createElement('div');
      item.className = 'account-admin-permission__item';

      const identity = document.createElement('div');
      identity.className = 'account-admin-permission__identity';
      const email = document.createElement('strong');
      email.textContent = grant.email || 'メールアドレス不明';
      const grantedAt = document.createElement('span');
      grantedAt.textContent = `付与日時: ${formatDate(grant.granted_at) || '不明'}`;
      identity.append(email, grantedAt);

      const revoke = document.createElement('button');
      revoke.className = 'account-admin-permission__revoke';
      revoke.type = 'button';
      revoke.textContent = '解除';
      revoke.addEventListener('click', () => updateGrant(grant.email, false));
      item.append(identity, revoke);
      list.appendChild(item);
    });
  }

  async function loadGrants() {
    if (!client) return;
    const sequence = ++requestSequence;
    const { data, error } = await client.rpc('site_admin_list_ad_free_grants');
    if (sequence !== requestSequence) return;
    if (error) {
      list.replaceChildren();
      setStatus(readableError(error), true);
      return;
    }
    renderGrants(Array.isArray(data) ? data : []);
  }

  async function updateGrant(email, enabled) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !client) return;
    const action = enabled ? '広告OFF権限を付与' : '広告OFF権限を解除';
    if (!window.confirm(`${normalizedEmail} の${action}しますか？`)) return;

    submitButton.disabled = true;
    setStatus(`${action}しています。`);
    const { error } = await client.rpc('site_admin_set_ad_free_by_email', {
      input_email: normalizedEmail,
      input_enabled: enabled
    });
    submitButton.disabled = false;
    if (error) {
      setStatus(readableError(error), true);
      return;
    }
    if (enabled) emailInput.value = '';
    setStatus(`${normalizedEmail} の${action}しました。反映には対象ユーザーの再読み込みが必要な場合があります。`);
    await loadGrants();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    updateGrant(emailInput.value, true);
  });

  function bindAuthListener(authClient) {
    if (!authClient || authListenerBound) return;
    authListenerBound = true;
    authClient.auth.onAuthStateChange((event) => {
      if (!ACCESS_CHANGE_EVENTS.has(event)) return;
      window.setTimeout(() => init({ refresh: true }), 0);
    });
  }

  async function init(options = {}) {
    if (!window.PiXiEEDMarketAccess) return;
    const access = await window.PiXiEEDMarketAccess.check(options);
    const authClient = access.client || null;
    bindAuthListener(authClient);
    client = null;
    requestSequence += 1;
    if (!access.allowed || !authClient) return;
    const { data: isAdmin, error } = await authClient.rpc('market_current_user_is_admin');
    if (error || isAdmin !== true) return;
    client = authClient;
    await loadGrants();
  }

  init();
})();
