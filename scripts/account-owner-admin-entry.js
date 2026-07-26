(function () {
  'use strict';
  const target = document.querySelector('[data-account-tab-target="settings"]');
  const REQUIRED_TAPS = 10;
  const TAP_WINDOW_MS = 6000;
  const UNLOCK_KEY = 'pixieed:owner-admin-unlock-until:v1';
  let taps = 0;
  let timer = 0;

  function reset() { taps = 0; window.clearTimeout(timer); }
  function unlock() { sessionStorage.setItem(UNLOCK_KEY, String(Date.now() + 5 * 60 * 1000)); location.href = 'admin.html'; }

  async function openOwnerConsole() {
    const access = await window.PiXiEEDMarketAccess?.check?.({ refresh: true });
    if (!access?.allowed || !access.client) return window.alert('運営管理へ入るには、所有者アカウントでログインしてください。');
    const { data: isOwner, error: ownerError } = await access.client.rpc('site_current_user_is_owner_admin');
    if (ownerError) return window.alert('運営管理のDB権限がまだ反映されていません。管理用のDB移行を適用してください。');
    if (isOwner !== true) return;
    const { data: configured, error } = await access.client.rpc('site_owner_admin_passcode_configured');
    if (error) return window.alert('運営管理のパスコード設定を確認できません。管理用のDB移行を適用してください。');
    if (!configured) {
      const first = window.prompt('運営管理用の初回パスコードを設定してください（6〜64文字）。');
      if (first === null) return;
      const confirmation = window.prompt('確認のため、同じパスコードをもう一度入力してください。');
      if (first !== confirmation) return window.alert('パスコードが一致しません。');
      const { error: setError } = await access.client.rpc('site_owner_admin_set_passcode', { input_passcode: first });
      if (setError) return window.alert(`パスコードを設定できませんでした: ${setError.message || '通信を確認してください。'}`);
      return unlock();
    }
    const passcode = window.prompt('運営管理用パスコードを入力してください。');
    if (passcode === null) return;
    const { data: verified, error: verifyError } = await access.client.rpc('site_owner_admin_verify_passcode', { input_passcode: passcode });
    if (verifyError) return window.alert('パスコードを確認できませんでした。管理用のDB移行を適用してください。');
    if (verified === true) unlock();
    else window.alert('パスコードが正しくありません。');
  }

  target?.addEventListener('click', () => {
    taps += 1;
    window.clearTimeout(timer);
    timer = window.setTimeout(reset, TAP_WINDOW_MS);
    if (taps === REQUIRED_TAPS) { reset(); openOwnerConsole().catch(() => window.alert('運営管理を確認できませんでした。')); }
  });
})();
