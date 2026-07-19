(function () {
  'use strict';

  const panel = document.getElementById('accountPageviewRewards');
  const link = document.getElementById('accountPageviewRewardsLink');
  const total = document.getElementById('accountPageviewRewardTotal');
  const months = document.getElementById('accountPageviewRewardMonths');
  if (!panel || !total || !months) return;

  const yenFromMicroyen = (value) => `${(Number(value || 0) / 1000000).toLocaleString('ja-JP', { maximumFractionDigits: 6 })}円`;
  let listenerBound = false;

  function render(data) {
    const rows = Array.isArray(data?.months) ? data.months : [];
    total.textContent = yenFromMicroyen(data?.total_microyen);
    months.replaceChildren(...(rows.length ? rows.map((entry) => {
      const row = document.createElement('div'); row.className = 'account-reward-history__row';
      const label = document.createElement('span'); label.textContent = `${entry.year}年${entry.month}月`;
      const amount = document.createElement('strong'); amount.textContent = yenFromMicroyen(entry.amount_microyen);
      row.append(label, amount); return row;
    }) : [Object.assign(document.createElement('p'), { className: 'helper', textContent: '確定した表示報酬はまだありません。' })]));
    panel.hidden = false;
    if (link) link.hidden = false;
  }

  async function init(refresh = false) {
    try {
      if (!window.PiXiEEDDevAccess) return;
      const access = await window.PiXiEEDDevAccess.check({ refresh });
      if (!listenerBound && access?.client) {
        listenerBound = true;
        access.client.auth.onAuthStateChange(() => window.setTimeout(() => init(true), 0));
      }
      if (!access?.authenticated || !access.client) {
        panel.hidden = true;
        if (link) link.hidden = true;
        return;
      }
      const { data, error } = await access.client.rpc('market_my_pageview_rewards_v1');
      if (error || !data) return;
      render(data);
    } catch (_error) {}
  }

  window.setTimeout(init, 0);
})();
