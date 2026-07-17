(function () {
  'use strict';
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
    initial.client?.auth?.onAuthStateChange?.(() => {
      window.setTimeout(() => refresh({ refresh: true }), 0);
    });
  }

  init();
})();
