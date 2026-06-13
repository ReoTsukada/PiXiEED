(function () {
  if (window.pixieedSupportCheckout) {
    return;
  }

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const CHECKOUT_ENDPOINT = `${SUPABASE_URL}/functions/v1/stripe-browser-adfree-checkout`;
  const PANEL_ID = 'pixieedSupportCheckoutPanel';
  const STYLE_ID = 'pixieed-support-checkout-style';
  const PIXIEED_SUPPORT_URL = 'https://buy.stripe.com/28E3cw5RC4JVehAenm2VG00';
  const PIXIEDRAW_SUPPORT_URL = 'https://buy.stripe.com/aFadRaeo8ekv5L44MM2VG01';
  const PIXIEED_TIP_500_URL = 'https://buy.stripe.com/cNi28s93OgsDc9sdji2VG02';
  const PIXIEED_TIP_1000_URL = 'https://buy.stripe.com/5kQcN6eo87W78Xg7YY2VG03';
  const MONTHLY_SUPPORT_GOAL_YEN = 5000;
  const OPTIONS = [
    {
      key: 'pixieed_support_monthly',
      title: 'PiXiEED継続サポート',
      price: '月額サポート',
      description: 'PiXiEED全体を支援し、広告非表示とPiXiEEDrawの共有プロジェクト枠を自動適用します。',
      webUrl: PIXIEED_SUPPORT_URL,
      nativeProductId: 'pixieed_support_monthly',
      checkoutProductKey: 'pixieed_support_monthly',
      cta: '継続サポートを購入',
    },
    {
      key: 'pixiedraw_ad_free',
      title: 'PiXiEEDraw継続サポート',
      price: '月額サポート',
      description: 'PiXiEEDrawの広告非表示に加え、共有プロジェクトを最大4件・最大4人まで使える継続サポートです。',
      webUrl: PIXIEDRAW_SUPPORT_URL,
      nativeProductId: 'pixiedraw_ad_free',
      checkoutProductKey: 'pixiedraw_ad_free',
      cta: 'PiXiEEDraw継続サポートを購入',
    },
    {
      key: 'pixieed_tip_500',
      title: 'PiXiEED応援チップ500円',
      price: '500円',
      description: '気軽にPiXiEEDを応援したい時向けのワンタイム支援です。',
      webUrl: PIXIEED_TIP_500_URL,
      nativeProductId: 'pixieed_tip_500',
      cta: '500円で応援する',
    },
    {
      key: 'pixieed_tip_1000',
      title: 'PiXiEED応援チップ1000円',
      price: '1000円',
      description: 'より大きくPiXiEEDを応援したい時向けのワンタイム支援です。',
      webUrl: PIXIEED_TIP_1000_URL,
      nativeProductId: 'pixieed_tip_1000',
      cta: '1000円で応援する',
    },
  ];

  let panel = null;
  let list = null;
  let status = null;
  let title = null;
  let activeTrigger = null;

  function isPixieedrawPage() {
    try {
      const pathname = String(window.location.pathname || '').toLowerCase();
      return /(?:^|\/)pixiedraw(?:\/|\/index\.html)?$/.test(pathname);
    } catch (_error) {
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .support-checkout-panel{
        border:0;
        padding:0;
        width:min(680px, calc(100vw - 24px));
        background:transparent;
      }
      .support-checkout-panel::backdrop{
        background:rgba(3, 8, 20, 0.7);
        backdrop-filter:blur(4px);
      }
      .support-checkout-panel__card{
        border:1px solid rgba(255,255,255,0.1);
        border-radius:24px;
        background:linear-gradient(180deg, rgba(31,41,76,0.96), rgba(14,19,39,0.98));
        box-shadow:0 24px 60px rgba(0,0,0,0.45);
        color:#eef2ff;
        padding:18px;
        display:grid;
        gap:16px;
      }
      .support-checkout-panel__header{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
      }
      .support-checkout-panel__title{
        margin:0;
        font-size:20px;
        line-height:1.3;
      }
      .support-checkout-panel__lead{
        margin:6px 0 0;
        color:#cbd5f5;
        font-size:13px;
        line-height:1.6;
      }
      .support-checkout-panel__close{
        border:1px solid rgba(255,255,255,0.14);
        border-radius:999px;
        background:rgba(255,255,255,0.06);
        color:#eef2ff;
        min-width:40px;
        height:40px;
        cursor:pointer;
      }
      .support-checkout-panel__list{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:12px;
      }
      .support-checkout-progress{
        border:1px solid rgba(255,255,255,0.1);
        border-radius:18px;
        background:rgba(255,255,255,0.045);
        padding:14px;
        display:grid;
        gap:10px;
      }
      .support-checkout-progress__header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
      }
      .support-checkout-progress__title{
        margin:0;
        font-size:13px;
        font-weight:800;
        color:#eef2ff;
      }
      .support-checkout-progress__amount{
        margin:0;
        color:#fcd34d;
        font-size:18px;
        font-weight:900;
        white-space:nowrap;
      }
      .support-checkout-progress__bar{
        overflow:hidden;
        height:10px;
        border-radius:999px;
        background:rgba(15,23,42,0.72);
      }
      .support-checkout-progress__fill{
        display:block;
        width:0%;
        height:100%;
        border-radius:inherit;
        background:linear-gradient(90deg, #facc15, #fb923c);
      }
      .support-checkout-progress__note{
        margin:0;
        color:#cbd5f5;
        font-size:13px;
        line-height:1.65;
      }
      .support-checkout-option{
        border:1px solid rgba(255,255,255,0.1);
        border-radius:18px;
        background:rgba(255,255,255,0.04);
        padding:14px;
        display:grid;
        gap:10px;
        position:relative;
        overflow:hidden;
      }
      .support-checkout-option.is-featured{
        border-color:rgba(251,191,36,0.42);
        background:linear-gradient(180deg, rgba(251,191,36,0.13), rgba(255,255,255,0.05));
      }
      .support-checkout-option.is-global-support{
        border-color:rgba(250,204,21,0.52);
        background:
          radial-gradient(110% 70% at 0% 0%, rgba(250,204,21,0.22), transparent 60%),
          linear-gradient(180deg, rgba(15,23,42,0.7), rgba(30,41,59,0.72));
        box-shadow:0 12px 32px rgba(250,204,21,0.2);
      }
      .support-checkout-option.is-global-support::after{
        content:'PREMIUM';
        position:absolute;
        top:10px;
        right:10px;
        font-size:10px;
        font-weight:900;
        letter-spacing:0.08em;
        color:#0f172a;
        background:#facc15;
        border-radius:999px;
        padding:3px 8px;
      }
      .support-checkout-option__eyebrow{
        margin:0;
        font-size:11px;
        letter-spacing:0.08em;
        text-transform:uppercase;
        color:#fcd34d;
      }
      .support-checkout-option__title{
        margin:0;
        font-size:17px;
        line-height:1.4;
      }
      .support-checkout-option__price{
        margin:0;
        font-size:13px;
        color:#dbeafe;
        font-weight:700;
      }
      .support-checkout-option__description{
        margin:0;
        font-size:13px;
        line-height:1.65;
        color:#cbd5f5;
      }
      .support-checkout-option__button{
        border:0;
        border-radius:14px;
        background:#f8fafc;
        color:#0f172a;
        font-weight:800;
        font-size:13px;
        padding:12px 14px;
        cursor:pointer;
      }
      .support-checkout-option.is-global-support .support-checkout-option__title{
        color:#fef08a;
      }
      .support-checkout-option.is-global-support .support-checkout-option__price{
        color:#fde68a;
        font-size:14px;
      }
      .support-checkout-option.is-global-support .support-checkout-option__button{
        background:linear-gradient(135deg, #facc15, #fb923c);
        color:#111827;
        box-shadow:0 8px 18px rgba(251,146,60,0.35);
      }
      .support-checkout-option__button[aria-busy="true"]{
        opacity:0.72;
        pointer-events:none;
      }
      .support-checkout-panel__status{
        min-height:20px;
        margin:0;
        color:#bfdbfe;
        font-size:12px;
      }
      .support-checkout-panel__status.is-error{
        color:#fecaca;
      }
      @media (max-width: 640px){
        .support-checkout-panel__list{
          grid-template-columns:1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (panel) {
      return panel;
    }
    injectStyles();
    panel = document.createElement('dialog');
    panel.id = PANEL_ID;
    panel.className = 'support-checkout-panel';
    panel.innerHTML = `
      <form class="support-checkout-panel__card" method="dialog">
        <div class="support-checkout-panel__header">
          <div>
            <h2 class="support-checkout-panel__title" id="supportCheckoutTitle">PiXiEEDの支援メニュー</h2>
            <p class="support-checkout-panel__lead">継続サポートは支払い状況に合わせてサポーター特典を自動更新します。応援チップはワンタイム支援です。</p>
          </div>
          <button class="support-checkout-panel__close" type="button" aria-label="課金パネルを閉じる">×</button>
        </div>
        <section class="support-checkout-progress" aria-label="今月のサポート">
          <div class="support-checkout-progress__header">
            <p class="support-checkout-progress__title">今月のサポート</p>
            <p class="support-checkout-progress__amount" id="supportCheckoutMonthlyAmount">0円 / 5,000円</p>
          </div>
          <div class="support-checkout-progress__bar" aria-hidden="true">
            <span class="support-checkout-progress__fill" id="supportCheckoutMonthlyFill"></span>
          </div>
          <p class="support-checkout-progress__note">サポートはPiXiEEDの運営強化に使われます。目標を達成すると、広告削減や共有プロジェクト機能をより安定して提供できます。</p>
        </section>
        <div class="support-checkout-panel__list" id="supportCheckoutList"></div>
        <p class="support-checkout-panel__status" id="supportCheckoutStatus" aria-live="polite"></p>
      </form>
    `;
    document.body.appendChild(panel);
    list = panel.querySelector('#supportCheckoutList');
    status = panel.querySelector('#supportCheckoutStatus');
    title = panel.querySelector('#supportCheckoutTitle');
    const closeButton = panel.querySelector('.support-checkout-panel__close');
    if (closeButton) {
      closeButton.addEventListener('click', () => panel.close());
    }
    panel.addEventListener('click', (event) => {
      if (event.target === panel) {
        panel.close();
      }
    });
    renderOptions();
    renderMonthlySupportProgress();
    return panel;
  }

  function formatYen(value) {
    const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return `${amount.toLocaleString('ja-JP')}円`;
  }

  function readMonthlySupportAmount() {
    const value = Number(window.pixieedMonthlySupportAmountYen);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  function renderMonthlySupportProgress() {
    if (!panel) {
      return;
    }
    const amount = readMonthlySupportAmount();
    const amountNode = panel.querySelector('#supportCheckoutMonthlyAmount');
    const fill = panel.querySelector('#supportCheckoutMonthlyFill');
    if (amountNode) {
      amountNode.textContent = `${formatYen(amount)} / ${formatYen(MONTHLY_SUPPORT_GOAL_YEN)}`;
    }
    if (fill instanceof HTMLElement) {
      const progress = MONTHLY_SUPPORT_GOAL_YEN > 0
        ? Math.min(100, Math.round((amount / MONTHLY_SUPPORT_GOAL_YEN) * 100))
        : 0;
      fill.style.width = `${progress}%`;
    }
  }

  function getOption(optionKey) {
    return OPTIONS.find((entry) => entry.key === optionKey) || OPTIONS[0];
  }

  function setStatus(message, isError = false) {
    if (!status) {
      return;
    }
    status.textContent = message || '';
    status.classList.toggle('is-error', Boolean(isError));
  }

  function renderOptions(preferredKey = '') {
    if (!list) {
      return;
    }
    list.innerHTML = '';
    OPTIONS.forEach((option) => {
      const article = document.createElement('article');
      const classNames = ['support-checkout-option'];
      if (option.key === preferredKey) {
        classNames.push('is-featured');
      }
      if (option.key === 'pixieed_support_monthly') {
        classNames.push('is-global-support');
      }
      article.className = classNames.join(' ');
      article.dataset.supportOption = option.key;
      const eyebrowText = option.key === 'pixieed_support_monthly'
        ? 'subscription · all PiXiEED'
        : (option.checkoutProductKey ? 'subscription' : 'support');
      article.innerHTML = `
        <p class="support-checkout-option__eyebrow">${eyebrowText}</p>
        <h3 class="support-checkout-option__title">${option.title}</h3>
        <p class="support-checkout-option__price">${option.price}</p>
        <p class="support-checkout-option__description">${option.description}</p>
        <button class="support-checkout-option__button" type="button">${option.cta}</button>
      `;
      const button = article.querySelector('button');
      if (button) {
        button.addEventListener('click', () => {
          handlePurchase(option, button);
        });
      }
      list.appendChild(article);
    });
  }

  async function createScopedCheckout(option) {
    const payload = {
      productKey: option.checkoutProductKey,
      returnUrl: window.location.href,
      cancelUrl: window.location.href,
    };
    const email = window.pixieedAdFree?.state?.userEmail;
    if (email) {
      payload.email = email;
    }
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.url) {
      throw new Error(data?.error || `checkout request failed (${response.status})`);
    }
    return data.url;
  }

  function getNativeBillingBridge() {
    const bridge = window.__PIXIEED_NATIVE_BILLING__;
    if (!bridge || typeof bridge.purchase !== 'function') {
      return null;
    }
    return bridge;
  }

  function navigateToPurchaseUrl(url) {
    if (!url) {
      return;
    }
    window.location.href = url;
  }

  async function handlePurchase(option, button) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const nativeBilling = getNativeBillingBridge();
    button.setAttribute('aria-busy', 'true');
    setStatus('購入ページを準備しています...');
    try {
      if (nativeBilling) {
        await nativeBilling.purchase({
          productId: option.nativeProductId || option.key,
          title: option.title,
          webUrl: option.webUrl,
          checkoutProductKey: option.checkoutProductKey || '',
        });
        setStatus('購入処理を開始しました。');
        return;
      }
      if (option.checkoutProductKey) {
        const checkoutUrl = await createScopedCheckout(option);
        navigateToPurchaseUrl(checkoutUrl);
        return;
      }
      navigateToPurchaseUrl(option.webUrl);
    } catch (error) {
      const fallbackUrl = option.webUrl;
      const message = String(error?.message || error || '購入ページを開けませんでした。');
      if (option.checkoutProductKey) {
        setStatus(`${message} 時間をおいてもう一度お試しください。`, true);
        if (fallbackUrl) {
          navigateToPurchaseUrl(fallbackUrl);
        }
        return;
      }
      if (fallbackUrl) {
        setStatus(`${message} 既存のStripe購入ページを開きます。`, true);
        navigateToPurchaseUrl(fallbackUrl);
      } else {
        setStatus(message, true);
      }
    } finally {
      button.removeAttribute('aria-busy');
    }
  }

  function resolvePreferredOption(trigger) {
    const explicit = trigger?.dataset?.supportPreferredProduct || '';
    if (explicit) {
      return explicit;
    }
    const id = trigger?.id || '';
    if (id === 'pixieedAdFreePurchase' || id === 'toolSpotlightSupportTip') {
      return 'pixiedraw_ad_free';
    }
    if (isPixieedrawPage()) {
      return 'pixiedraw_ad_free';
    }
    return 'pixieed_support_monthly';
  }

  function open(options = {}) {
    const modal = ensurePanel();
    const preferredKey = typeof options.preferredProduct === 'string'
      ? options.preferredProduct
      : resolvePreferredOption(activeTrigger);
    renderOptions(preferredKey);
    renderMonthlySupportProgress();
    setStatus('');
    if (title) {
      const option = getOption(preferredKey);
      title.textContent = option?.title ? `${option.title} を選べます` : 'PiXiEEDの支援メニュー';
    }
    if (typeof modal.showModal === 'function') {
      if (modal.open) {
        modal.close();
      }
      modal.showModal();
    } else {
      modal.setAttribute('open', 'true');
    }
  }

  function close() {
    if (panel && typeof panel.close === 'function') {
      panel.close();
    }
  }

  function shouldHandleTrigger(element) {
    return Boolean(element?.matches?.('.support-tip-link, #supportTipLink, #pixieedAdFreePurchase, #toolSpotlightSupportTip, [data-support-panel-trigger="true"]'));
  }

  function bindTriggers() {
    document.addEventListener('click', (event) => {
      const trigger = event.target instanceof Element
        ? event.target.closest('.support-tip-link, #supportTipLink, #pixieedAdFreePurchase, #toolSpotlightSupportTip, [data-support-panel-trigger="true"]')
        : null;
      if (!shouldHandleTrigger(trigger)) {
        return;
      }
      event.preventDefault();
      activeTrigger = trigger;
      open({ preferredProduct: resolvePreferredOption(trigger) });
    });
  }

  window.pixieedSupportCheckout = {
    open,
    close,
    bindTriggers,
    setMonthlySupportAmount(amountYen) {
      const amount = Number(amountYen);
      window.pixieedMonthlySupportAmountYen = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
      renderMonthlySupportProgress();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensurePanel();
      bindTriggers();
    }, { once: true });
  } else {
    ensurePanel();
    bindTriggers();
  }
})();
