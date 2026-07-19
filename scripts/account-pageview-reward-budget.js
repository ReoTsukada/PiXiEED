(function () {
  'use strict';

  const form = document.getElementById('pageviewRewardBudgetForm');
  const yearInput = document.getElementById('pageviewRewardYear');
  const monthsContainer = document.getElementById('pageviewRewardMonths');
  const annualTotal = document.getElementById('pageviewRewardAnnualTotal');
  const saveButton = document.getElementById('pageviewRewardSave');
  const status = document.getElementById('pageviewRewardStatus');
  const settlementMonth = document.getElementById('pageviewRewardSettlementMonth');
  const calculateButton = document.getElementById('pageviewRewardCalculate');
  const finalizeButton = document.getElementById('pageviewRewardFinalize');
  const settlementStatus = document.getElementById('pageviewRewardSettlementStatus');
  if (!form || !yearInput || !monthsContainer || !annualTotal || !saveButton || !status
      || !settlementMonth || !calculateButton || !finalizeButton || !settlementStatus) return;

  const monthInputs = new Map();
  let client = null;
  let loadedYear = null;
  let savedSignature = '';
  let requestSequence = 0;
  let authListenerBound = false;
  const ACCESS_CHANGE_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_DELETED', 'USER_UPDATED']);

  const yen = (value) => `${Number(value || 0).toLocaleString('ja-JP')}円`;
  const microyenAsYen = (value) => `${(Number(value || 0) / 1000000).toLocaleString('ja-JP', { maximumFractionDigits: 6 })}円`;

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
    if (/monthly reward budget is not configured/i.test(message)) return '対象月の報酬原資を先に保存してください。';
    if (/only after it ends/i.test(message)) return '月次確定は対象月が終了してから実行できます。';
    if (/already finalized/i.test(message)) return 'この月の表示報酬は確定済みです。';
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

  function settlementParts() {
    const match = String(settlementMonth?.value || '').match(/^(\d{4})-(\d{2})$/);
    return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
  }

  async function calculateSettlement(finalize) {
    if (!client || !settlementMonth?.reportValidity()) return;
    const parts = settlementParts();
    if (!parts) return;
    if (finalize && !window.confirm(`${parts.year}年${parts.month}月の表示報酬を確定しますか？\n確定後は再計算できません。`)) return;
    calculateButton.disabled = true; finalizeButton.disabled = true;
    settlementStatus.textContent = finalize ? '表示報酬を確定しています。' : '表示報酬を試算しています。';
    const { data, error } = await client.rpc('market_admin_calculate_pageview_rewards_v1', {
      input_year: parts.year,
      input_month: parts.month,
      input_finalize: finalize
    });
    calculateButton.disabled = false; finalizeButton.disabled = false;
    if (error) {
      settlementStatus.textContent = readableError(error);
      settlementStatus.classList.add('is-error');
      return;
    }
    settlementStatus.classList.remove('is-error');
    settlementStatus.textContent = `${data.status === 'finalized' ? '確定' : '試算'}：有効表示${Number(data.valid_view_count || 0).toLocaleString('ja-JP')}件、配分${microyenAsYen(data.allocated_microyen)}、端数${microyenAsYen(data.remainder_microyen)}`;
  }

  calculateButton?.addEventListener('click', () => calculateSettlement(false));
  finalizeButton?.addEventListener('click', () => calculateSettlement(true));

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
      if (settlementMonth) {
        const previousMonth = new Date(); previousMonth.setDate(1); previousMonth.setMonth(previousMonth.getMonth() - 1);
        settlementMonth.value = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
      }
    }
    updateAnnualTotal();
    if (!window.PiXiEEDMarketAccess) return;
    const access = await window.PiXiEEDMarketAccess.check(options);
    const authClient = access.client || null;
    bindAuthListener(authClient);
    client = null;
    calculateButton.disabled = true; finalizeButton.disabled = true;
    requestSequence += 1;
    if (!authClient) return;
    const { data: isAdmin, error } = await authClient.rpc('market_current_user_is_admin');
    if (error || isAdmin !== true) return;
    client = authClient;
    calculateButton.disabled = false; finalizeButton.disabled = false;
    await loadYear(Number(yearInput.value));
  }

  init();
})();
