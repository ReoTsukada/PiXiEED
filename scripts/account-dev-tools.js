(function () {
  'use strict';
  const ACCESS_CHANGE_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_DELETED', 'USER_UPDATED']);
  let refreshSequence = 0;

  function applyAccess(access) {
    document.querySelectorAll('[data-market-dev-only]').forEach((node) => {
      node.hidden = !access.allowed;
    });
    document.body.dataset.pixieedDevAccount = access.allowed ? 'true' : 'false';
  }

  function applyAdminAccess(allowed) {
    document.querySelectorAll('[data-market-admin-only]').forEach((node) => {
      node.hidden = !allowed;
    });
    document.body.dataset.pixieedMarketAdmin = allowed ? 'true' : 'false';
  }

  applyAccess({ allowed: false });
  applyAdminAccess(false);

  async function refresh(options = {}) {
    const sequence = ++refreshSequence;
    const access = await window.PiXiEEDDevAccess.check(options);
    if (sequence !== refreshSequence) return access;
    applyAccess(access);
    applyAdminAccess(false);
    if (!access.allowed || !access.client) return access;

    const { data: isAdmin, error } = await access.client.rpc('market_current_user_is_admin');
    if (sequence !== refreshSequence) return access;
    applyAdminAccess(!error && isAdmin === true);
    return access;
  }

  async function init() {
    if (!window.PiXiEEDDevAccess) return;
    const initial = await refresh();
    initial.client?.auth?.onAuthStateChange?.((event) => {
      if (!ACCESS_CHANGE_EVENTS.has(event)) return;
      window.setTimeout(() => refresh({ refresh: true }), 0);
    });
  }

  init();
})();
