(function () {
  'use strict';

  function applyAccess(access) {
    document.querySelectorAll('[data-market-dev-only]').forEach((node) => {
      node.hidden = !access.allowed;
    });
    document.body.dataset.pixieedDevAccount = access.allowed ? 'true' : 'false';
  }

  async function init() {
    if (!window.PiXiEEDDevAccess) return;
    const initial = await window.PiXiEEDDevAccess.check();
    applyAccess(initial);
    initial.client?.auth?.onAuthStateChange?.(() => {
      window.setTimeout(async () => applyAccess(await window.PiXiEEDDevAccess.check({ refresh: true })), 0);
    });
  }

  init();
})();
