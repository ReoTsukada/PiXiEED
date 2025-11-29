(function () {
  function init() {
    updateCopyrightYear();
    revealLastUpdated();
    setupContactOverlay();
    setupInstallGuides();
    setupProjectGate();
    setupHeroReel();
    setupShowcaseFilter();
    disableImageInteractions();
    injectFooterAd();
  }

  function updateCopyrightYear() {
    const yearElement = document.getElementById('year');
    if (yearElement) {
      yearElement.textContent = new Date().getFullYear().toString();
    }
  }

  function disableImageInteractions() {
    document.addEventListener('contextmenu', event => {
      if (event.target instanceof HTMLImageElement) {
        event.preventDefault();
      }
    });

    document.addEventListener('dragstart', event => {
      if (event.target instanceof HTMLImageElement) {
        event.preventDefault();
      }
    });
  }

  function revealLastUpdated() {
    const targets = Array.from(document.querySelectorAll('[data-last-updated]'));
    if (!targets.length) return;

    const lastModifiedDate = new Date(document.lastModified);
    const isValidDate = !Number.isNaN(lastModifiedDate.getTime());
    if (!isValidDate) {
      targets.forEach(target => target.setAttribute('hidden', ''));
      return;
    }

    let formatted = '';
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      formatted = new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(lastModifiedDate);
    } else {
      const y = lastModifiedDate.getFullYear();
      const m = String(lastModifiedDate.getMonth() + 1).padStart(2, '0');
      const d = String(lastModifiedDate.getDate()).padStart(2, '0');
      formatted = `${y}年${m}月${d}日`;
    }
    const isoDate = lastModifiedDate.toISOString().split('T')[0];

    targets.forEach(target => {
      const valueElement = target.querySelector('.project-update__value');
      if (valueElement instanceof HTMLElement) {
        valueElement.textContent = formatted;
        if (valueElement.tagName === 'TIME') {
          valueElement.setAttribute('datetime', isoDate);
        }
      } else {
        target.textContent = formatted;
      }
      target.removeAttribute('hidden');
    });
  }

  function setupContactOverlay() {
    const overlay = document.getElementById('contactOverlay');
    if (!overlay) return;

    const openers = Array.from(document.querySelectorAll('.js-contact-open'));
    const closeBtn = overlay.querySelector('.js-contact-close');
    let lastFocusedElement = null;

    function openOverlay() {
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.setProperty('overflow', 'hidden');
      if (closeBtn instanceof HTMLElement) {
        closeBtn.focus();
      }
    }

    function closeOverlay() {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.removeProperty('overflow');
      if (lastFocusedElement) {
        lastFocusedElement.focus();
      }
    }

    openers.forEach(btn => btn.addEventListener('click', openOverlay));
    if (closeBtn) {
      closeBtn.addEventListener('click', closeOverlay);
    }

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) {
        event.preventDefault();
        closeOverlay();
      }
    });
  }

  function setupInstallGuides() {
    const toggles = Array.from(document.querySelectorAll('.js-install-toggle'));
    if (!toggles.length) {
      return;
    }

    const SHOW_LABEL = '手順を表示';
    const HIDE_LABEL = '手順を閉じる';

    const setExpandedState = (toggle, content, expanded) => {
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.textContent = expanded ? HIDE_LABEL : SHOW_LABEL;
      content.hidden = !expanded;
    };

    toggles.forEach(toggle => {
      const controlsId = toggle.getAttribute('aria-controls');
      const content = controlsId ? document.getElementById(controlsId) : null;
      if (!(content instanceof HTMLElement)) {
        return;
      }

      const initialExpanded = toggle.getAttribute('aria-expanded') === 'true';
      setExpandedState(toggle, content, initialExpanded);

      toggle.addEventListener('click', () => {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        setExpandedState(toggle, content, !isExpanded);
      });
    });
  }

  function injectFooterAd() {
    const path = window.location.pathname || '';
    if (/\/(terms|privacy)\//.test(path)) return; // 利用規約/プライバシーは除外
    if (document.querySelector('.ad-footer')) return; // 既に配置済みなら何もしない

    const STYLE_ID = 'pixieed-ad-footer-style';
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .ad-footer{
          width:100%;
          max-width:640px;
          padding:8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
          box-sizing:border-box;
          display:flex;
          justify-content:center;
          background:#fff;
          border-top:1px solid rgba(0,0,0,0.08);
          margin:0 auto;
        }
        .ad-footer ins{
          display:block;
          width:320px;
          max-width:320px;
          height:50px;
          overflow:hidden;
        }
      `;
      document.head.appendChild(style);
    }

    const footer = document.createElement('div');
    footer.className = 'ad-footer';
    footer.innerHTML = `
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-9801602250480253"
           data-ad-slot="2141591954"></ins>
    `;
    document.body.appendChild(footer);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // ignore
    }
  }

  function setupProjectGate() {
    const overlay = document.getElementById('projectGateOverlay');
    const projectLinkSelector = 'a[data-project-gate="project"]';
    if (!overlay || !document.querySelector(projectLinkSelector)) {
      return;
    }

    const AUTH_KEY = 'pixieed:project-pass';
    const PASS_HASH = '8752f24ec0a8ac50ef732fbaa26f2df1cea32e477b8d4ad4160748155ed23054';
    const PASS_FALLBACK = '00169785';

    const form = overlay.querySelector('#projectGateForm');
    const input = overlay.querySelector('#projectGateInput');
    const errorLabel = overlay.querySelector('#projectGateError');
    const closeBtn = overlay.querySelector('.project-gate__close');
    const cancelBtn = overlay.querySelector('.project-gate__cancel');
    let pendingHref = null;
    let lastFocusedElement = null;

    const isAuthorized = () => sessionStorage.getItem(AUTH_KEY) === '1';

    function openOverlay(targetHref) {
      pendingHref = targetHref || null;
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.setProperty('overflow', 'hidden');
      if (errorLabel) {
        errorLabel.hidden = true;
      }
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 0);
      }
    }

    function closeOverlay() {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.removeProperty('overflow');
      if (lastFocusedElement) {
        lastFocusedElement.focus();
      }
      pendingHref = null;
    }

    function toHex(buffer) {
      return Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    function digest(code) {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        try {
          const encoder = new TextEncoder();
          return window.crypto.subtle.digest('SHA-256', encoder.encode(code))
            .then(toHex)
            .catch(() => null);
        } catch (error) {
          return Promise.resolve(null);
        }
      }
      return Promise.resolve(null);
    }

    function simpleHash(value) {
      let acc = 0;
      for (let i = 0; i < value.length; i += 1) {
        acc = ((acc * 31) + value.charCodeAt(i)) >>> 0;
      }
      return acc.toString(16).padStart(8, '0');
    }

    function verify(code) {
      if (!code) {
        return Promise.resolve(false);
      }
      return digest(code).then(hash => {
        if (hash === PASS_HASH) {
          return true;
        }
        return simpleHash(code) === PASS_FALLBACK;
      });
    }

    function showError(message) {
      if (errorLabel) {
        errorLabel.textContent = message;
        errorLabel.hidden = false;
      }
      if (input) {
        input.focus();
        input.select();
      }
    }

    function markAuthorized() {
      sessionStorage.setItem(AUTH_KEY, '1');
    }

    function handleSubmit() {
      if (!input) {
        return;
      }
      const code = input.value.trim();
      verify(code).then((ok) => {
        if (!ok) {
          showError('コードが一致しません。');
          return;
        }
        markAuthorized();
        closeOverlay();
        if (pendingHref) {
          window.location.href = pendingHref;
        }
      });
    }

    if (!isAuthorized()) {
      document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest(projectLinkSelector) : null;
        if (!target) {
          return;
        }
        if (isAuthorized()) {
          return;
        }
        const href = target instanceof HTMLAnchorElement ? target.href : target.getAttribute('href');
        event.preventDefault();
        openOverlay(href);
      }, true);
    }

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleSubmit();
      });
    }

    const dismissors = [closeBtn, cancelBtn];
    dismissors.forEach((btn) => {
      if (btn) {
        btn.addEventListener('click', () => {
          closeOverlay();
        });
      }
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (overlay.hidden) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay();
      } else if (event.key === 'Enter' && document.activeElement === input) {
        event.preventDefault();
        handleSubmit();
      }
    });
  }

  function setupHeroReel() {
    const heroReel = document.querySelector('.hero-reel');
    const heroTrack = heroReel ? heroReel.querySelector('.hero-reel__track') : null;
    if (!heroReel || !heroTrack) return;

    const items = Array.from(heroTrack.children);
    if (!items.length) return;

    items.forEach(item => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      heroTrack.appendChild(clone);
    });

    let loopWidth = heroTrack.scrollWidth / 2;
    let offset = 0;
    let isPaused = false;
    const speed = 0.4;
    let last = performance.now();

    const recalcLoop = () => {
      loopWidth = heroTrack.scrollWidth / 2;
    };

    window.addEventListener('resize', recalcLoop);
    heroReel.addEventListener('mouseenter', () => { isPaused = true; });
    heroReel.addEventListener('mouseleave', () => { isPaused = false; });
    heroReel.addEventListener('focusin', () => { isPaused = true; });
    heroReel.addEventListener('focusout', () => { isPaused = false; });

    function tick(now) {
      const delta = now - last;
      last = now;
      if (!isPaused) {
        offset += (delta * speed) / 16.67;
        if (offset >= loopWidth) {
          offset -= loopWidth;
        }
        heroTrack.style.transform = `translateX(${-offset}px)`;
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function setupShowcaseFilter() {
    const searchInput = document.getElementById('showcaseSearch');
    const categoryChips = Array.from(document.querySelectorAll('.showcase-chip'));
    const showcaseCards = Array.from(document.querySelectorAll('.display-wall .display'));
    if (!searchInput || !categoryChips.length || !showcaseCards.length) {
      return;
    }

    let activeCategory = 'all';
    let searchTerm = '';

    function matchesCategory(type) {
      if (activeCategory === 'all') return true;
      return type === activeCategory;
    }

    function matchesSearch(card) {
      if (!searchTerm) return true;
      const haystack = `${card.dataset.title || ''} ${card.dataset.description || ''}`.toLowerCase();
      return haystack.includes(searchTerm);
    }

    function updateDifficultyBadge(card) {
      const difficulty = Number(card.dataset.difficulty || '0');
      const scale = card.querySelectorAll('.display__difficulty-scale span');
      const value = card.querySelector('.display__difficulty-value');
      scale.forEach((dot, index) => {
        dot.classList.toggle('is-filled', index < difficulty);
      });
      if (value) {
        value.textContent = difficulty.toString();
      }
    }

    function applyFilter() {
      showcaseCards.forEach(card => {
        const type = card.dataset.type || 'other';
        const visible = matchesCategory(type) && matchesSearch(card);
        updateDifficultyBadge(card);
        card.style.display = visible ? '' : 'none';
      });
    }

    categoryChips.forEach(chip => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.category || 'all';
        categoryChips.forEach(btn => {
          const isActive = btn === chip;
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        applyFilter();
      });
    });

    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      applyFilter();
    });

    applyFilter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
