(() => {
  let fullscreenIntent = false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1' || params.get('embed') === 'true') return;
    fullscreenIntent = params.get('fullscreen') === '1';
  } catch (_error) {}

  const useCommonTabAction = document.body?.dataset.pixieedFullscreenAction === 'tabbar';
  const existingCommonAction = document.getElementById('fullscreenButton');
  if (document.getElementById('pixieedToolFullscreen') || (useCommonTabAction && !(existingCommonAction instanceof HTMLButtonElement))) return;

  const style = document.createElement('style');
  style.id = 'pixieed-tool-fullscreen-style';
  style.textContent = `
    #pixieedToolFullscreen{
      position:fixed; z-index:100000; right:calc(12px + env(safe-area-inset-right, 0px));
      bottom:calc(80px + env(safe-area-inset-bottom, 0px)); min-height:38px; padding:8px 11px;
      border:1px solid rgba(255,255,255,.28); border-radius:999px; background:rgba(8,15,30,.82);
      color:#f8fafc; font:800 12px/1 'Fredoka','DotGothic16',system-ui,sans-serif;
      box-shadow:0 8px 22px rgba(0,0,0,.28); backdrop-filter:blur(10px); cursor:pointer;
    }
    #pixieedToolFullscreen:hover,#pixieedToolFullscreen:focus-visible{background:rgba(37,135,229,.94);border-color:#8acbff;outline:none}
    #pixieedToolFullscreen.is-requested{animation:pixieedFullscreenPulse 1.1s ease-in-out infinite}
    @keyframes pixieedFullscreenPulse{50%{transform:scale(1.05);background:rgba(37,135,229,.94)}}
    html:fullscreen #pixieedToolFullscreen{bottom:calc(12px + env(safe-area-inset-bottom, 0px))}
    html:fullscreen .bottom-nav,html:fullscreen .pixieed-shared-footer,
    html:fullscreen .ad-footer,html:fullscreen .ad-banner,html:fullscreen .panel-ad,html:fullscreen .panel-ad-mount,
    html:fullscreen #mobileBottomAd,html:fullscreen .lens-ad-banner,html:fullscreen .capture-preview__ad{display:none!important}
    @media (orientation:landscape){#pixieedToolFullscreen{bottom:calc(12px + env(safe-area-inset-bottom, 0px))}}
  `;
  document.head.appendChild(style);

  const button = useCommonTabAction ? existingCommonAction : document.createElement('button');
  if (!useCommonTabAction) {
    button.id = 'pixieedToolFullscreen';
    button.type = 'button';
    document.body.appendChild(button);
  }
  button.hidden = useCommonTabAction;
  button.textContent = useCommonTabAction ? '拡大' : 'フルスクリーン';
  button.setAttribute('aria-label', useCommonTabAction ? '拡大' : 'フルスクリーンで使う');
  if (fullscreenIntent) {
    button.classList.add('is-requested');
    button.textContent = 'タップして全画面';
  }

  const sync = () => {
    const active = document.fullscreenElement === document.documentElement;
    document.body.classList.toggle('pixieed-tool-is-fullscreen', active);
    button.textContent = useCommonTabAction
      ? (active ? '縮小' : '拡大')
      : (active ? 'フルスクリーンを終了' : (fullscreenIntent ? 'タップしてフルスクリーン' : 'フルスクリーン'));
    button.classList.toggle('is-requested', !active && fullscreenIntent);
    button.setAttribute('aria-label', useCommonTabAction
      ? (active ? '縮小' : '拡大')
      : (active ? 'フルスクリーンを終了' : 'フルスクリーンで使う'));
    button.setAttribute('aria-pressed', String(active));
  };

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_error) {
      button.textContent = '全画面にできません';
      window.setTimeout(sync, 1800);
    }
  }

  window.PiXiEEDToolFullscreen = Object.freeze({ toggle: toggleFullscreen });
  button.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', sync);
  sync();
})();
