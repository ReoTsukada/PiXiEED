(function () {
  const PIXIEED_SUPPORT_URL = 'https://buy.stripe.com/28E3cw5RC4JVehAenm2VG00';
  const PIXIEDRAW_SUPPORT_URL = 'https://buy.stripe.com/aFadRaeo8ekv5L44MM2VG01';
  const currentScript = document.currentScript;
  const asset = (relativePath) => {
    try {
      return new URL(relativePath, currentScript?.src || window.location.href).href;
    } catch (_error) {
      return relativePath;
    }
  };

  function renderSharedHeader() {
    const header = document.querySelector('.site-header') || document.querySelector('header[aria-label="top-nav"]');
    if (!header || header.dataset.sharedHeaderReady === 'true') return;
    const hasAuthPanel = !!document.getElementById('authPanel');
    const brandTag = hasAuthPanel ? 'button' : 'a';
    const brandAttrs = hasAuthPanel
      ? 'id="openProfilePanel" type="button"'
      : `id="openProfilePanel" href="${asset('../index.html')}"`;
    header.dataset.sharedHeaderReady = 'true';
    header.setAttribute('aria-label', 'top-nav');
    header.innerHTML = `
      <div class="header-inner">
        <${brandTag} class="brand" ${brandAttrs}>
          <span class="brand-icon" id="brandAvatar">
            <img src="${asset('../character-dots/mao1.png')}" alt="logo">
          </span>
          <div class="brand-text">
            <p class="brand-title">PiXiEED</p>
            <p class="brand-sub" id="brandUser">ユーザー</p>
          </div>
        </${brandTag}>
        <div class="header-actions">
          <a class="support-tip-link" id="supportTipLink" href="#" target="_blank" rel="noopener noreferrer" aria-label="PiXiEEDの応援チップを購入">応援チップ</a>
        </div>
      </div>
    `;
  }

  function ensureSupportCheckoutPanelScript() {
    if (window.pixieedSupportCheckout || document.querySelector('script[data-pixieed-support-checkout="true"]')) {
      return;
    }
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.pixieedSupportCheckout = 'true';
    script.src = asset('./support-checkout-panel.js');
    document.head.appendChild(script);
  }

  function ensureSharedAuthPanelScript() {
    if (window.pixieedSharedAuthPanel || document.querySelector('script[data-pixieed-shared-auth="true"]')) {
      return;
    }
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.pixieedSharedAuth = 'true';
    script.src = asset('./shared-auth-panel.js');
    document.head.appendChild(script);
  }

  const AVATARS = [
    { id: 'mao', src: asset('../character-dots/mao1.png') },
    { id: 'jerin1', src: asset('../character-dots/Jerin1.png') },
    { id: 'jerin2', src: asset('../character-dots/Jerin2.png') },
    { id: 'jerin3', src: asset('../character-dots/Jerin3.png') },
    { id: 'jerin4', src: asset('../character-dots/Jerin4.png') },
    { id: 'jerin5', src: asset('../character-dots/Jerin5.png') },
    { id: 'jerin6', src: asset('../character-dots/Jerin6.png') },
    { id: 'jerin7', src: asset('../character-dots/Jerin7.png') },
    { id: 'jerin8', src: asset('../character-dots/Jerin8.png') },
    { id: 'jellnall1', src: asset('../character-dots/JELLNALL1.png') },
    { id: 'jellnall2', src: asset('../character-dots/JELLNALL2.png') },
    { id: 'jellnall3', src: asset('../character-dots/JELLNALL3.png') },
    { id: 'jellnall4', src: asset('../character-dots/JELLNALL4.png') },
    { id: 'jellnall5', src: asset('../character-dots/JELLNALL5.png') },
    { id: 'jellnall6', src: asset('../character-dots/JELLNALL6.png') },
    { id: 'jellnall7', src: asset('../character-dots/JELLNALL7.png') },
    { id: 'jellnall8', src: asset('../character-dots/JELLNALL8.png') },
    { id: 'jellnall9', src: asset('../character-dots/JELLNALL9.png') },
    { id: 'jellnall10', src: asset('../character-dots/JELLNALL10.png') },
    { id: 'jellnall11', src: asset('../character-dots/JELLNALL11.png') },
    { id: 'jellnall12', src: asset('../character-dots/JELLNALL12.png') },
    { id: 'jellnall13', src: asset('../character-dots/JELLNALL13.png') },
    { id: 'jellnall14', src: asset('../character-dots/JELLNALL14.png') },
    { id: 'jellnall15', src: asset('../character-dots/JELLNALL15.png') },
    { id: 'jellnall16', src: asset('../character-dots/JELLNALL16.png') },
    { id: 'jellnall17', src: asset('../character-dots/JELLNALL17.png') },
    { id: 'jellnall18', src: asset('../character-dots/JELLNALL18.png') },
    { id: 'jellnall19', src: asset('../character-dots/JELLNALL19.png') },
    { id: 'baburin', src: asset('../character-dots/baburinpng.png') },
  ];

  function loadNickname() {
    try {
      return localStorage.getItem('pixieed_nickname') || '';
    } catch (_error) {
      return '';
    }
  }

  function saveNickname(value) {
    try {
      localStorage.setItem('pixieed_nickname', String(value || '').trim());
    } catch (_error) {}
  }

  function loadAvatar() {
    try {
      return localStorage.getItem('pixieed_avatar') || 'mao';
    } catch (_error) {
      return 'mao';
    }
  }

  function saveAvatar(value) {
    try {
      localStorage.setItem('pixieed_avatar', value || 'mao');
    } catch (_error) {}
  }

  function loadXUrl() {
    try {
      return localStorage.getItem('pixieed_x_url') || '';
    } catch (_error) {
      return '';
    }
  }

  function saveXUrl(value) {
    try {
      const raw = String(value || '').trim();
      if (raw) {
        localStorage.setItem('pixieed_x_url', raw);
      } else {
        localStorage.removeItem('pixieed_x_url');
      }
    } catch (_error) {}
  }

  function getAvatarRecord() {
    const current = loadAvatar();
    return AVATARS.find((avatar) => avatar.id === current) || AVATARS[0];
  }

  function applyAvatarToBrand() {
    const brand = document.getElementById('brandAvatar');
    const brandUser = document.getElementById('brandUser');
    const preview = document.getElementById('avatarPreview');
    const current = getAvatarRecord();
    if (brand) {
      brand.innerHTML = `<img src="${current.src}" alt="avatar">`;
    }
    if (preview) {
      preview.innerHTML = `<img src="${current.src}" alt="avatar">`;
    }
    if (brandUser) {
      brandUser.textContent = loadNickname() || 'ユーザー';
    }
  }

  function renderAvatarChoices() {
    const grid = document.getElementById('avatarGrid');
    if (!grid) return;
    const current = loadAvatar();
    grid.innerHTML = '';
    AVATARS.forEach((avatar) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `avatar-option${current === avatar.id ? ' is-active' : ''}`;
      btn.innerHTML = `<img src="${avatar.src}" alt="${avatar.id}">`;
      btn.addEventListener('click', () => {
        saveAvatar(avatar.id);
        applyAvatarToBrand();
        renderAvatarChoices();
      });
      grid.appendChild(btn);
    });
  }

  function syncInputs() {
    const nicknameInput = document.getElementById('profileNickname');
    const xInput = document.getElementById('profileX');
    if (nicknameInput) nicknameInput.value = loadNickname();
    if (xInput) xInput.value = loadXUrl();
  }

  function setStatus(message) {
    const status = document.getElementById('authStatus');
    if (status) status.textContent = message || '';
  }

  function getSupportProductKey() {
    try {
      const pathname = String(window.location.pathname || '').toLowerCase();
      return /(?:^|\/)pixiedraw(?:\/|\/index\.html)?$/.test(pathname)
        ? 'pixiedraw_ad_free'
        : 'support_tip';
    } catch (_error) {
      return 'support_tip';
    }
  }

  function setupSupportTipLink() {
    const link = document.getElementById('supportTipLink');
    if (!link) return;
    const productKey = getSupportProductKey();
    link.href = productKey === 'pixiedraw_ad_free' ? PIXIEDRAW_SUPPORT_URL : PIXIEED_SUPPORT_URL;
    link.dataset.supportPanelTrigger = 'true';
    link.dataset.supportPreferredProduct = productKey === 'pixiedraw_ad_free'
      ? 'pixiedraw_ad_free'
      : 'pixieed_support_monthly';
  }

  function setupPanel() {
    const panel = document.getElementById('authPanel');
    const openBtn = document.getElementById('openProfilePanel');
    const closeBtn = document.getElementById('closeAuthPanel');
    const saveBtn = document.getElementById('saveProfile');
    const avatarToggle = document.getElementById('avatarToggle');
    const avatarPanel = document.getElementById('avatarPanel');
    if (!panel) return;

    const toggle = (open) => {
      panel.classList.toggle('is-open', open);
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      panel.toggleAttribute('hidden', !open);
      if (open) {
        syncInputs();
        renderAvatarChoices();
        applyAvatarToBrand();
      }
    };

    if (openBtn) openBtn.addEventListener('click', () => toggle(true));
    if (closeBtn) closeBtn.addEventListener('click', () => toggle(false));
      panel.addEventListener('click', (event) => {
      if (event.target === panel) toggle(false);
    });

    if (avatarToggle && avatarPanel) {
      avatarToggle.addEventListener('click', () => {
        const open = avatarPanel.hasAttribute('hidden');
        avatarPanel.toggleAttribute('hidden', !open);
        avatarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nicknameInput = document.getElementById('profileNickname');
        const xInput = document.getElementById('profileX');
        saveNickname(nicknameInput ? nicknameInput.value : '');
        saveXUrl(xInput ? xInput.value : '');
        applyAvatarToBrand();
        setStatus('プロフィールを保存しました');
      });
    }

    const openAuthFromHash = () => {
      if (window.location.hash === '#auth') {
        toggle(true);
      }
    };
    openAuthFromHash();
    window.addEventListener('hashchange', openAuthFromHash);
  }

  function init() {
    renderSharedHeader();
    ensureSupportCheckoutPanelScript();
    ensureSharedAuthPanelScript();
    setupSupportTipLink();
    applyAvatarToBrand();
    renderAvatarChoices();
    syncInputs();
    setupPanel();
    window.addEventListener('storage', (event) => {
      if (!event.key || !event.key.startsWith('pixieed_')) return;
      applyAvatarToBrand();
      renderAvatarChoices();
      syncInputs();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
