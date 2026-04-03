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
  const OPTIONS = [
    {
      key: 'pixieed_support_monthly',
      title: 'PiXiEED継続サポート',
      price: '月額サポート',
      description: 'PiXiEED全体の開発と運営を継続的に支援します。',
      webUrl: PIXIEED_SUPPORT_URL,
      nativeProductId: 'pixieed_support_monthly',
      cta: '継続サポートを購入',
    },
    {
      key: 'pixiedraw_ad_free',
      title: 'PiXiEEDraw継続サポート',
      price: '月額サポート',
      description: 'PiXiEEDraw内の広告だけを非表示にする継続サポートです。',
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
      .support-checkout-option{
        border:1px solid rgba(255,255,255,0.1);
        border-radius:18px;
        background:rgba(255,255,255,0.04);
        padding:14px;
        display:grid;
        gap:10px;
      }
      .support-checkout-option.is-featured{
        border-color:rgba(251,191,36,0.42);
        background:linear-gradient(180deg, rgba(251,191,36,0.13), rgba(255,255,255,0.05));
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
            <p class="support-checkout-panel__lead">継続サポートまたは応援チップを選べます。PiXiEEDraw継続サポートのみ、PiXiEEDraw内広告の非表示に対応します。</p>
          </div>
          <button class="support-checkout-panel__close" type="button" aria-label="課金パネルを閉じる">×</button>
        </div>
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
    return panel;
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
      article.className = `support-checkout-option${option.key === preferredKey ? ' is-featured' : ''}`;
      article.dataset.supportOption = option.key;
      article.innerHTML = `
        <p class="support-checkout-option__eyebrow">${option.checkoutProductKey ? 'subscription' : 'support'}</p>
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
        window.location.href = checkoutUrl;
        return;
      }
      window.location.href = option.webUrl;
    } catch (error) {
      const fallbackUrl = option.webUrl;
      setStatus(String(error?.message || error || '購入ページを開けませんでした。'), true);
      if (fallbackUrl) {
        window.location.href = fallbackUrl;
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
