(function () {
  'use strict';
  const ACCESS_CHANGE_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_DELETED', 'USER_UPDATED']);
  let refreshSequence = 0;

  function applyAdminAccess(allowed) {
    document.querySelectorAll('[data-market-admin-only]').forEach((node) => {
      node.hidden = !allowed;
    });
    document.body.dataset.pixieedMarketAdmin = allowed ? 'true' : 'false';
  }

  applyAdminAccess(false);

  async function refresh(options = {}) {
    const sequence = ++refreshSequence;
    const access = await window.PiXiEEDMarketAccess.check(options);
    if (sequence !== refreshSequence) return access;
    applyAdminAccess(false);
    if (!access.client || !access.allowed) return access;
    const { data: isAdmin, error } = await access.client.rpc('market_current_user_is_admin');
    if (sequence !== refreshSequence) return access;
    applyAdminAccess(!error && isAdmin === true);
    return access;
  }

  async function init() {
    if (!window.PiXiEEDMarketAccess) return;
    const initial = await refresh();
    initial.client?.auth?.onAuthStateChange?.((event) => {
      if (!ACCESS_CHANGE_EVENTS.has(event)) return;
      window.setTimeout(() => refresh({ refresh: true }), 0);
    });
  }

  init();
})();
