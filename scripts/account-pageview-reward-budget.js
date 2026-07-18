(function () {
  'use strict';

  const form = document.getElementById('pageviewRewardBudgetForm');
  const yearInput = document.getElementById('pageviewRewardYear');
  const monthsContainer = document.getElementById('pageviewRewardMonths');
  const annualTotal = document.getElementById('pageviewRewardAnnualTotal');
  const saveButton = document.getElementById('pageviewRewardSave');
  const status = document.getElementById('pageviewRewardStatus');
  if (!form || !yearInput || !monthsContainer || !annualTotal || !saveButton || !status) return;

  const monthInputs = new Map();
  let client = null;
  let loadedYear = null;
  let savedSignature = '';
  let requestSequence = 0;
  let authListenerBound = false;
  const ACCESS_CHANGE_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_DELETED', 'USER_UPDATED']);

  const yen = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;

  function setStatus(message, isError = false) {
    status.textContent = message || '';
    status.classList.toggle('is-error', isError);
  }

  function readableError(error) {
    const message = String(error?.message || '報酬原資を処理できませんでした。');
    if (/admin permission/i.test(message)) return 'この操作に必要な管理者権限がありません。';
    if (/between 2025 and 2100/i.test(message)) return '対象年は2025年〜2100年で指定してください。';
    if (/12 monthly reward amounts/i.test(message)) return '1月〜12月の金額をすべて入力してください。';
    if (/monthly reward amount/i.test(message)) return '月別原資は0円〜1,000,000,000円の整数で入力してください。';
    if (/function .* does not exist|schema cache/i.test(message)) return '報酬原資用のDB更新がまだ反映されていません。';
    return message;
  }

  function createMonthInputs() {
    const fragment = document.createDocumentFragment();
    for (let month = 1; month <= 12; month += 1) {
      const label = document.createElement('label');
      label.className = 'account-reward-budget__month';
      label.htmlFor = `pageviewRewardMonth${month}`;
      label.append(`${month}月`);
      const input = document.createElement('input');
      input.className = 'auth-input';
      input.id = `pageviewRewardMonth${month}`;
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = '0';
      input.max = '1000000000';
      input.step = '1';
      input.value = '0';
      input.required = true;
      input.addEventListener('input', updateAnnualTotal);
      label.appendChild(input);
      monthInputs.set(month, input);
      fragment.appendChild(label);
    }
    monthsContainer.replaceChildren(fragment);
  }

  function monthlyAmounts() {
    return Object.fromEntries(Array.from(monthInputs, ([month, input]) => [String(month), Number(input.value || 0)]));
  }

  function currentSignature() {
    return JSON.stringify(monthlyAmounts());
  }

  function hasUnsavedChanges() {
    return Boolean(savedSignature) && currentSignature() !== savedSignature;
  }

  function updateAnnualTotal() {
    const total = Array.from(monthInputs.values()).reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
    annualTotal.textContent = yen(total);
    saveButton.disabled = !client;
  }

  function renderYear(data) {
    const months = Array.isArray(data?.months) ? data.months : [];
    monthInputs.forEach((input, month) => {
      const value = months.find((entry) => Number(entry.month) === month)?.amount_yen;
      input.value = String(Math.max(0, Number(value) || 0));
    });
    loadedYear = Number(data?.year || yearInput.value);
    yearInput.value = String(loadedYear);
    updateAnnualTotal();
    savedSignature = currentSignature();
  }

  async function loadYear(year) {
    if (!client) return;
    const sequence = ++requestSequence;
    saveButton.disabled = true;
    setStatus(`${year}年の設定を読み込んでいます。`);
    const { data, error } = await client.rpc('market_admin_get_pageview_reward_year_v1', { input_year: year });
    if (sequence !== requestSequence) return;
    saveButton.disabled = false;
    if (error) {
      if (loadedYear !== null) yearInput.value = String(loadedYear);
      setStatus(readableError(error), true);
      return;
    }
    renderYear(data);
    setStatus(`${year}年の設定を読み込みました。`);
  }

  yearInput.addEventListener('change', async () => {
    const nextYear = Number(yearInput.value);
    if (!yearInput.reportValidity()) return;
    if (hasUnsavedChanges() && !window.confirm('保存していない月別原資を破棄して、別の年を開きますか？')) {
      yearInput.value = String(loadedYear);
      return;
    }
    await loadYear(nextYear);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || !form.reportValidity()) return;
    const year = Number(yearInput.value);
    const amounts = monthlyAmounts();
    const total = Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
    if (!window.confirm(`${year}年のページビュー報酬原資を年間合計${yen(total)}で保存しますか？\nこの操作だけでは分配・送金されません。`)) return;

    saveButton.disabled = true;
    setStatus(`${year}年の12か月分を保存しています。`);
    const { data, error } = await client.rpc('market_admin_set_pageview_reward_year_v1', {
      input_year: year,
      input_monthly_amounts: amounts
    });
    saveButton.disabled = false;
    if (error) {
      setStatus(readableError(error), true);
      return;
    }
    renderYear(data);
    setStatus(`${year}年の月別報酬原資を保存しました。年間合計は${yen(data?.annual_total_yen)}です。`);
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
    if (!monthInputs.size) {
      createMonthInputs();
      const currentYear = new Date().getFullYear();
      yearInput.value = String(Math.min(2100, Math.max(2025, currentYear)));
    }
    updateAnnualTotal();
    if (!window.PiXiEEDDevAccess) return;
    const access = await window.PiXiEEDDevAccess.check(options);
    const authClient = access.client || null;
    bindAuthListener(authClient);
    client = null;
    requestSequence += 1;
    if (!access.allowed || !authClient) return;
    const { data: isAdmin, error } = await authClient.rpc('market_current_user_is_admin');
    if (error || isAdmin !== true) return;
    client = authClient;
    await loadYear(Number(yearInput.value));
  }

  init();
})();
