(function () {
  'use strict';

  const TAB_STORAGE_KEY = 'pixieed:account-active-tab:v1';
  const TAB_NAMES = new Set(['library', 'rewards', 'settings']);
  const chartCanvas = document.getElementById('accountRewardChart');
  const chartShell = document.getElementById('accountRewardChartShell');
  const chartEmpty = document.getElementById('accountRewardChartEmpty');
  const chartTooltip = document.getElementById('accountRewardChartTooltip');
  const chartTable = document.getElementById('accountRewardChartTable');
  const periodSelect = document.getElementById('accountRewardPeriod');
  const overviewStatus = document.getElementById('accountOverviewStatus');
  const dashboardStatus = document.getElementById('accountRewardDashboardStatus');
  const tabSections = Array.from(document.querySelectorAll('[data-account-tab]'));
  const tabButtons = Array.from(document.querySelectorAll('[data-account-tab-target]'));
  const commandButtons = Array.from(document.querySelectorAll('.account-command-bar [data-account-tab-target]'));
  const seriesButtons = Array.from(document.querySelectorAll('[data-account-chart-series]'));
  const activeSeries = new Set(['sales', 'lineage', 'pageview', 'views']);
  const responseCache = new Map();
  let chartRows = [];
  let hoveredIndex = -1;
  let drawFrame = 0;
  let client = null;
  let authListenerBound = false;

  const SERIES = Object.freeze({
    sales: { key: 'sales_microyen', label: '販売収益', color: '#60a5fa' },
    lineage: { key: 'lineage_microyen', label: '継承ロイヤリティー', color: '#a78bfa' },
    pageview: { key: 'pageview_microyen', label: '表示報酬', color: '#34d399' }
  });

  function safeNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function formatYen(microyen) {
    const yen = safeNumber(microyen) / 1000000;
    const fractionDigits = yen > 0 && yen < 1 ? 3 : yen % 1 ? 2 : 0;
    return `${yen.toLocaleString('ja-JP', { maximumFractionDigits: fractionDigits })}円`;
  }

  function formatAxisYen(microyen) {
    const yen = safeNumber(microyen) / 1000000;
    if (yen >= 10000) return `${(yen / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万`;
    return yen.toLocaleString('ja-JP', { maximumFractionDigits: yen < 10 ? 1 : 0 });
  }

  function formatMonth(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
    return match ? `${Number(match[1])}年${Number(match[2])}月` : String(value || '');
  }

  function normalizeRow(row) {
    return {
      month: String(row?.month || ''),
      sales_microyen: safeNumber(row?.sales_microyen),
      lineage_microyen: safeNumber(row?.lineage_microyen),
      pageview_microyen: safeNumber(row?.pageview_microyen),
      valid_view_count: safeNumber(row?.valid_view_count),
      provisional_valid_view_count: safeNumber(row?.provisional_valid_view_count),
      sale_count: safeNumber(row?.sale_count),
      lineage_sale_count: safeNumber(row?.lineage_sale_count)
    };
  }

  function setStatus(element, message, isError) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-error', Boolean(isError));
  }

  function tabFromHash() {
    const id = String(window.location.hash || '').slice(1);
    if (id === 'accountProjects' || id === 'accountPixfind' || id === 'accountPurchases' || id === 'accountListings') return 'library';
    if (id === 'accountPageviewRewards' || id === 'accountSeller' || id === 'accountRewardDashboard') return 'rewards';
    if (id === 'authPanel' || id === 'accountDevTools' || id === 'accountAdminTools') return 'settings';
    return '';
  }

  function savedTab() {
    const fromHash = tabFromHash();
    if (fromHash) return fromHash;
    // マイページを開いた直後は、ログインとアカウント設定がある設定タブを
    // 常に最初に表示する。ページ内の選択はその閲覧中だけ維持する。
    return 'settings';
  }

  function setActiveTab(nextTab, options) {
    const next = TAB_NAMES.has(nextTab) ? nextTab : 'library';
    tabSections.forEach((section) => section.classList.toggle('is-account-tab-active', section.dataset.accountTab === next));
    tabButtons.forEach((button) => {
      const selected = button.dataset.accountTabTarget === next;
      button.classList.toggle('is-active', selected);
      if (button.closest('.account-command-bar')) button.setAttribute('aria-pressed', String(selected));
    });
    if (options?.persist !== false) {
      try { localStorage.setItem(TAB_STORAGE_KEY, next); } catch (_error) {}
    }
    if (next === 'rewards') scheduleDraw();
  }

  function bindTabs() {
    tabButtons.forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.accountTabTarget)));
    commandButtons.forEach((button, index) => button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const target = commandButtons[(index + direction + commandButtons.length) % commandButtons.length];
      target?.focus();
      if (target) setActiveTab(target.dataset.accountTabTarget);
    }));
    window.addEventListener('hashchange', () => {
      const target = tabFromHash();
      if (target) setActiveTab(target);
    });
    setActiveTab(savedTab(), { persist: false });
  }

  function niceMaximum(value) {
    if (!(value > 0)) return 1000000;
    const power = 10 ** Math.floor(Math.log10(value));
    const normalized = value / power;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * power;
  }

  function canvasMetrics() {
    if (!chartCanvas || !chartShell) return null;
    const rect = chartShell.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return null;
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (chartCanvas.width !== pixelWidth || chartCanvas.height !== pixelHeight) {
      chartCanvas.width = pixelWidth;
      chartCanvas.height = pixelHeight;
    }
    const context = chartCanvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  function drawChart() {
    drawFrame = 0;
    const metrics = canvasMetrics();
    if (!metrics) return;
    const { context: ctx, width, height } = metrics;
    ctx.clearRect(0, 0, width, height);
    if (!chartRows.length) return;

    const padding = { top: 22, right: 48, bottom: 38, left: 58 };
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const plotHeight = Math.max(1, height - padding.top - padding.bottom);
    const moneyKeys = Object.keys(SERIES).filter((name) => activeSeries.has(name));
    const moneyMax = niceMaximum(Math.max(...chartRows.map((row) => moneyKeys.reduce((sum, name) => sum + row[SERIES[name].key], 0)), 0));
    const viewMax = niceMaximum(Math.max(...chartRows.map((row) => row.valid_view_count), 0));
    const groupWidth = plotWidth / chartRows.length;
    const barWidth = Math.max(3, Math.min(36, groupWidth * .58));

    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (let line = 0; line <= 4; line += 1) {
      const ratio = line / 4;
      const y = padding.top + plotHeight * ratio;
      ctx.strokeStyle = 'rgba(148,163,184,.13)';
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
      ctx.fillStyle = '#8090a8';
      ctx.textAlign = 'right';
      ctx.fillText(formatAxisYen(moneyMax * (1 - ratio)), padding.left - 8, y);
      if (activeSeries.has('views')) {
        ctx.textAlign = 'left';
        ctx.fillText(Math.round(viewMax * (1 - ratio)).toLocaleString('ja-JP'), width - padding.right + 8, y);
      }
    }

    chartRows.forEach((row, index) => {
      const centerX = padding.left + groupWidth * (index + .5);
      let bottom = padding.top + plotHeight;
      moneyKeys.forEach((name) => {
        const config = SERIES[name];
        const segmentHeight = moneyMax > 0 ? plotHeight * row[config.key] / moneyMax : 0;
        if (segmentHeight <= 0) return;
        ctx.fillStyle = config.color;
        ctx.globalAlpha = hoveredIndex >= 0 && hoveredIndex !== index ? .36 : .88;
        ctx.fillRect(centerX - barWidth / 2, bottom - segmentHeight, barWidth, segmentHeight);
        bottom -= segmentHeight;
      });
      ctx.globalAlpha = 1;
    });

    if (activeSeries.has('views')) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      chartRows.forEach((row, index) => {
        const x = padding.left + groupWidth * (index + .5);
        const y = padding.top + plotHeight - (viewMax > 0 ? plotHeight * row.valid_view_count / viewMax : 0);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      chartRows.forEach((row, index) => {
        if (chartRows.length > 12 && index !== hoveredIndex && index % 2) return;
        const x = padding.left + groupWidth * (index + .5);
        const y = padding.top + plotHeight - (viewMax > 0 ? plotHeight * row.valid_view_count / viewMax : 0);
        ctx.fillStyle = index === hoveredIndex ? '#fff7cc' : '#fbbf24';
        ctx.beginPath(); ctx.arc(x, y, index === hoveredIndex ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
      });
    }

    const labelEvery = Math.max(1, Math.ceil(chartRows.length / Math.max(4, Math.floor(plotWidth / 74))));
    ctx.fillStyle = '#8090a8';
    ctx.textAlign = 'center';
    chartRows.forEach((row, index) => {
      if (index % labelEvery && index !== chartRows.length - 1) return;
      const parts = row.month.split('-');
      const label = parts.length === 2 ? `${Number(parts[1])}月` : row.month;
      ctx.fillText(label, padding.left + groupWidth * (index + .5), height - 17);
    });

    if (hoveredIndex >= 0 && hoveredIndex < chartRows.length) {
      const x = padding.left + groupWidth * (hoveredIndex + .5);
      ctx.strokeStyle = 'rgba(255,255,255,.42)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, padding.top + plotHeight); ctx.stroke();
    }
  }

  function scheduleDraw() {
    if (drawFrame) return;
    drawFrame = window.requestAnimationFrame(drawChart);
  }

  function tooltipRows(row) {
    const fragment = document.createDocumentFragment();
    const title = document.createElement('strong');
    title.textContent = formatMonth(row.month);
    fragment.append(title);
    Object.entries(SERIES).forEach(([name, config]) => {
      if (!activeSeries.has(name)) return;
      const line = document.createElement('span');
      const label = document.createElement('em'); label.textContent = config.label; label.style.fontStyle = 'normal';
      const value = document.createElement('b'); value.textContent = formatYen(row[config.key]); value.style.color = config.color;
      line.append(label, value); fragment.append(line);
    });
    if (activeSeries.has('views')) {
      const line = document.createElement('span');
      const label = document.createElement('em'); label.textContent = '有効表示'; label.style.fontStyle = 'normal';
      const value = document.createElement('b'); value.textContent = `${row.valid_view_count.toLocaleString('ja-JP')}回`; value.style.color = '#fbbf24';
      line.append(label, value); fragment.append(line);
      if (row.provisional_valid_view_count) {
        const provisional = document.createElement('span');
        const provisionalLabel = document.createElement('em'); provisionalLabel.textContent = '暫定有効表示'; provisionalLabel.style.fontStyle = 'normal';
        const provisionalValue = document.createElement('b'); provisionalValue.textContent = `${row.provisional_valid_view_count.toLocaleString('ja-JP')}回`; provisionalValue.style.color = '#fde68a';
        provisional.append(provisionalLabel, provisionalValue); fragment.append(provisional);
      }
    }
    return fragment;
  }

  function updatePointer(clientX) {
    if (!chartShell || !chartRows.length) return;
    const rect = chartShell.getBoundingClientRect();
    const left = 58;
    const right = 48;
    const plotWidth = Math.max(1, rect.width - left - right);
    const localX = Math.min(plotWidth - .001, Math.max(0, clientX - rect.left - left));
    hoveredIndex = Math.min(chartRows.length - 1, Math.floor(localX / (plotWidth / chartRows.length)));
    const row = chartRows[hoveredIndex];
    chartTooltip.replaceChildren(tooltipRows(row));
    chartTooltip.hidden = false;
    const targetX = left + (plotWidth / chartRows.length) * (hoveredIndex + .5);
    const tooltipWidth = chartTooltip.offsetWidth || 170;
    chartTooltip.style.left = `${Math.min(rect.width - tooltipWidth - 8, Math.max(8, targetX + 10))}px`;
    chartTooltip.style.top = '10px';
    scheduleDraw();
  }

  function bindChartInteraction() {
    if (!chartShell) return;
    chartShell.addEventListener('pointermove', (event) => updatePointer(event.clientX));
    chartShell.addEventListener('pointerdown', (event) => updatePointer(event.clientX));
    chartShell.addEventListener('pointerleave', () => {
      hoveredIndex = -1;
      if (chartTooltip) chartTooltip.hidden = true;
      scheduleDraw();
    });
    seriesButtons.forEach((button) => button.addEventListener('click', () => {
      const name = button.dataset.accountChartSeries;
      if (!name) return;
      if (activeSeries.has(name)) activeSeries.delete(name); else activeSeries.add(name);
      button.classList.toggle('is-active', activeSeries.has(name));
      button.setAttribute('aria-pressed', String(activeSeries.has(name)));
      scheduleDraw();
    }));
    periodSelect?.addEventListener('change', () => loadDashboard(Number(periodSelect.value) || 12, true));
    if ('ResizeObserver' in window) new ResizeObserver(scheduleDraw).observe(chartShell);
    else window.addEventListener('resize', scheduleDraw, { passive: true });
  }

  function renderTable(rows) {
    if (!chartTable) return;
    chartTable.replaceChildren(...rows.slice().reverse().map((row) => {
      const tr = document.createElement('tr');
      const values = [formatMonth(row.month), formatYen(row.sales_microyen), formatYen(row.lineage_microyen), formatYen(row.pageview_microyen), `${row.valid_view_count.toLocaleString('ja-JP')}回`, `${row.provisional_valid_view_count.toLocaleString('ja-JP')}回`];
      values.forEach((value) => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
      return tr;
    }));
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function renderDashboard(payload) {
    const totals = payload?.totals || {};
    chartRows = Array.isArray(payload?.series) ? payload.series.map(normalizeRow) : [];
    const months = safeNumber(payload?.months) || chartRows.length || 12;
    setText('accountSummarySales', formatYen(totals.sales_microyen));
    setText('accountSummaryLineage', formatYen(totals.lineage_microyen));
    setText('accountSummaryPageview', formatYen(totals.pageview_microyen));
    setText('accountSummaryBalance', formatYen(totals.available_microyen));
    setText('accountSummarySalesMeta', `直近${months}か月・${safeNumber(totals.sale_count).toLocaleString('ja-JP')}件`);
    setText('accountSummaryLineageMeta', `直近${months}か月・${safeNumber(totals.lineage_sale_count).toLocaleString('ja-JP')}件`);
    setText('accountSummaryViews', `確定 ${safeNumber(totals.valid_view_count).toLocaleString('ja-JP')}回・暫定 ${safeNumber(totals.provisional_valid_view_count).toLocaleString('ja-JP')}回`);
    setText('accountSummaryPending', `保留中 ${formatYen(totals.pending_microyen)}`);
    renderTable(chartRows);
    const hasData = chartRows.some((row) => row.sales_microyen || row.lineage_microyen || row.pageview_microyen || row.valid_view_count || row.provisional_valid_view_count);
    if (chartEmpty) {
      chartEmpty.hidden = hasData;
      chartEmpty.textContent = hasData ? '' : 'この期間に確定した売上・報酬・有効表示はまだありません。';
    }
    setStatus(overviewStatus, hasData ? `直近${months}か月の確定データと暫定有効表示です。` : '確定した売上・報酬はまだありません。');
    setStatus(dashboardStatus, '暫定有効表示は5秒以上の記録済み閲覧です。月次確定後に確定値・表示報酬へ反映します。');
    hoveredIndex = -1;
    if (chartTooltip) chartTooltip.hidden = true;
    scheduleDraw();
  }

  async function waitForClient() {
    if (client) return client;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) return window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
      if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) return await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return null;
  }

  async function loadDashboard(months, force) {
    const range = [6, 12, 24].includes(months) ? months : 12;
    setStatus(overviewStatus, '報酬データを確認しています。');
    setStatus(dashboardStatus, 'グラフを更新しています。');
    try {
      client = await waitForClient();
      if (!client) throw new Error('client-unavailable');
      if (!authListenerBound) {
        authListenerBound = true;
        client.auth.onAuthStateChange(() => {
          responseCache.clear();
          window.setTimeout(() => loadDashboard(Number(periodSelect?.value) || 12, true), 0);
        });
      }
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData?.session?.user) {
        chartRows = [];
        if (chartEmpty) { chartEmpty.hidden = false; chartEmpty.textContent = 'ログインすると売上・報酬を確認できます。'; }
        setStatus(overviewStatus, 'ログインすると売上・報酬の概要を確認できます。');
        setStatus(dashboardStatus, '');
        scheduleDraw();
        return;
      }
      try {
        const { data: reconciled } = await client.functions.invoke('market-reconcile-my-sales', { body: {} });
        if (Number(reconciled?.reconciled || 0) > 0) responseCache.clear();
      } catch (_ignored) {
        // The dashboard itself remains usable if Stripe reconciliation is temporarily unavailable.
      }
      if (!force && responseCache.has(range)) {
        renderDashboard(responseCache.get(range));
        return;
      }
      const { data, error } = await client.rpc('market_my_reward_dashboard_v1', { input_months: range });
      if (error) throw error;
      responseCache.set(range, data || {});
      renderDashboard(data || {});
    } catch (error) {
      const missingFunction = String(error?.message || '').includes('market_my_reward_dashboard_v1');
      const message = missingFunction
        ? '報酬グラフ用の集計機能はデータベース反映後に利用できます。'
        : '売上・報酬データを読み込めませんでした。時間をおいて再試行してください。';
      if (chartEmpty) { chartEmpty.hidden = false; chartEmpty.textContent = message; }
      setStatus(overviewStatus, message, true);
      setStatus(dashboardStatus, message, true);
      scheduleDraw();
    }
  }

  function handleAuthPresentation() {
    if (document.body.dataset.pixieedAccountAuth === 'signed-out') return;
    setActiveTab(savedTab(), { persist: false });
  }

  bindTabs();
  bindChartInteraction();
  new MutationObserver(handleAuthPresentation).observe(document.body, { attributes: true, attributeFilter: ['data-pixieed-account-auth'] });
  window.setTimeout(() => loadDashboard(Number(periodSelect?.value) || 12, false), 0);
})();
