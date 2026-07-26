(function () {
  'use strict';

  const accessNotice = document.getElementById('adminAccess');
  const content = document.getElementById('adminContent');
  const ACCESS_CHANGE_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_DELETED', 'USER_UPDATED']);
  const UNLOCK_KEY = 'pixieed:owner-admin-unlock-until:v1';
  let refreshSequence = 0;
  let listenerBound = false;

  function deny(message) {
    if (content) content.hidden = true;
    if (accessNotice) accessNotice.replaceChildren(Object.assign(document.createElement('h1'), { textContent: 'アクセスできません' }), Object.assign(document.createElement('p'), { textContent: message }));
    document.body.dataset.pixieedMarketAdmin = 'false';
  }

  async function refresh(options = {}) {
    const sequence = ++refreshSequence;
    if (!window.PiXiEEDMarketAccess || !content) return deny('この画面を開く権限を確認できません。');
    const access = await window.PiXiEEDMarketAccess.check(options);
    if (sequence !== refreshSequence) return;
    const unlockUntil = Number(sessionStorage.getItem(UNLOCK_KEY) || 0);
    if (!(unlockUntil > Date.now())) return deny('マイページを10回タップし、運営管理用パスコードを入力してください。');
    if (!access.allowed || !access.client) return deny('この画面は運営管理者だけが利用できます。');
    const { data: isAdmin, error } = await access.client.rpc('site_current_user_is_owner_admin');
    if (sequence !== refreshSequence) return;
    if (error || isAdmin !== true) return deny('この画面は運営管理者だけが利用できます。');
    content.hidden = false;
    accessNotice?.remove();
    document.body.dataset.pixieedMarketAdmin = 'true';
  }

  async function init() {
    await refresh();
    const access = await window.PiXiEEDMarketAccess?.check?.();
    if (!listenerBound && access?.client?.auth?.onAuthStateChange) {
      listenerBound = true;
      access.client.auth.onAuthStateChange((event) => {
        if (ACCESS_CHANGE_EVENTS.has(event)) window.setTimeout(() => refresh({ refresh: true }), 0);
      });
    }
  }

  init();
})();
