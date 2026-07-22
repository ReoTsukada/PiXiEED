(function () {
  if (window.pixieedSharedAuthPanel) {
    return;
  }

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
  const SUPABASE_AUTH_HEALTH_URL = `${SUPABASE_URL}/auth/v1/health`;
  const currentScript = document.currentScript;
  const PANEL_SELECTOR = '#authPanel';
  const AUTH_BLOCK_ID = 'sharedAuthBlock';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  const AUTH_SESSION_CACHE_KEY = 'pixieed:auth-session-cache:v1';
  const MAOITU_NAME_STORAGE_KEY = 'maoitu_rank_name';
  const AUTH_URL_PARAM_KEYS = [
    'code',
    'error',
    'error_code',
    'error_description',
    'access_token',
    'refresh_token',
    'expires_at',
    'expires_in',
    'provider_refresh_token',
    'provider_token',
    'token_type',
    'type',
  ];

  let supabaseClient = null;
  let supabaseUser = null;
  let initPromise = null;
  let supportsProfileXUrl = true;
  let authListenerBound = false;
  let authHealthCheckPromise = null;
  let authMode = 'login';
  let magicLinkCooldownUntil = 0;
  let magicLinkTimerId = 0;
  const AVATARS = [
    { id: 'mao', src: '../character-dots/maousama.png' },
    { id: 'jerin1', src: '../character-dots/Jerin1.png' },
    { id: 'jerin2', src: '../character-dots/Jerin2.png' },
    { id: 'jerin3', src: '../character-dots/Jerin3.png' },
    { id: 'jerin4', src: '../character-dots/Jerin4.png' },
    { id: 'jerin5', src: '../character-dots/Jerin5.png' },
    { id: 'jerin6', src: '../character-dots/Jerin6.png' },
    { id: 'jerin7', src: '../character-dots/Jerin7.png' },
    { id: 'jerin8', src: '../character-dots/Jerin8.png' },
    { id: 'jellnall1', src: '../character-dots/JELLNALL1.png' },
    { id: 'jellnall2', src: '../character-dots/JELLNALL2.png' },
    { id: 'jellnall3', src: '../character-dots/JELLNALL3.png' },
    { id: 'jellnall4', src: '../character-dots/JELLNALL4.png' },
    { id: 'jellnall5', src: '../character-dots/JELLNALL5.png' },
    { id: 'jellnall6', src: '../character-dots/JELLNALL6.png' },
    { id: 'jellnall7', src: '../character-dots/JELLNALL7.png' },
    { id: 'jellnall8', src: '../character-dots/JELLNALL8.png' },
    { id: 'jellnall9', src: '../character-dots/JELLNALL9.png' },
    { id: 'jellnall10', src: '../character-dots/JELLNALL10.png' },
    { id: 'jellnall11', src: '../character-dots/JELLNALL11.png' },
    { id: 'jellnall12', src: '../character-dots/JELLNALL12.png' },
    { id: 'jellnall13', src: '../character-dots/JELLNALL13.png' },
    { id: 'jellnall14', src: '../character-dots/JELLNALL14.png' },
    { id: 'jellnall15', src: '../character-dots/JELLNALL15.png' },
    { id: 'jellnall16', src: '../character-dots/JELLNALL16.png' },
    { id: 'jellnall17', src: '../character-dots/JELLNALL17.png' },
    { id: 'jellnall18', src: '../character-dots/JELLNALL18.png' },
    { id: 'jellnall19', src: '../character-dots/JELLNALL19.png' },
    { id: 'baburin', src: '../character-dots/baburinpng.png' },
  ];

  function asset(relativePath) {
    try {
      return new URL(relativePath, currentScript?.src || window.location.href).href;
    } catch (_error) {
      return relativePath;
    }
  }

  function loadNickname() {
    try {
      return localStorage.getItem('pixieed_nickname') || '';
    } catch (_error) {
      return '';
    }
  }

  function saveNickname(value) {
    try {
      const normalized = String(value || '').trim();
      localStorage.setItem('pixieed_nickname', normalized);
      localStorage.setItem(MAOITU_NAME_STORAGE_KEY, normalized || '名無し');
    } catch (_error) {}
  }

  function loadAvatar() {
    try {
      const avatar = localStorage.getItem('pixieed_avatar') || 'mao';
      return avatar === 'pixiedraw' ? 'mao' : avatar;
    } catch (_error) {
      return 'mao';
    }
  }

  function saveAvatar(value) {
    try {
      localStorage.setItem('pixieed_avatar', value === 'pixiedraw' ? 'mao' : value || 'mao');
    } catch (_error) {}
  }

  function getAvatarSrc() {
    const current = loadAvatar();
    const avatar = AVATARS.find((entry) => entry.id === current) || AVATARS[0];
    return asset(avatar.src);
  }

  function normalizeXUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
      try {
        return new URL(raw).toString();
      } catch (_error) {
        return '';
      }
    }
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch (_error) {
        return '';
      }
    }
    const handle = raw.replace(/^@+/, '').trim();
    if (!handle) return '';
    const candidate = /^(x\.com|twitter\.com)\//i.test(handle)
      ? `https://${handle}`
      : `https://x.com/${handle}`;
    try {
      return new URL(candidate).toString();
    } catch (_error) {
      return '';
    }
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
      const normalized = normalizeXUrl(value);
      if (normalized) {
        localStorage.setItem('pixieed_x_url', normalized);
      } else {
        localStorage.removeItem('pixieed_x_url');
      }
    } catch (_error) {}
  }

  function getClientId() {
    try {
      let clientId = localStorage.getItem('pixieed_client_id') || window.PIXIEED_CLIENT_ID || '';
      if (!clientId) {
        clientId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem('pixieed_client_id', clientId);
      }
      window.PIXIEED_CLIENT_ID = clientId;
      return clientId;
    } catch (_error) {
      return window.PIXIEED_CLIENT_ID || '';
    }
  }

  function getMaoituProfilePayload() {
    const name = loadNickname().trim().slice(0, 24) || '名無し';
    const avatar = loadAvatar() || 'mao';
    try {
      localStorage.setItem(MAOITU_NAME_STORAGE_KEY, name);
    } catch (_error) {}
    return { name, avatar };
  }

  function setStatus(message) {
    const status = document.body?.dataset.pixieedAccountAuth === 'signed-in'
      ? document.querySelector('.account-page #authStatus') || document.getElementById('authAccountStatus')
      : document.getElementById('authAccountStatus');
    if (status) {
      status.textContent = message || '';
    }
  }

  function getPanel() {
    return document.querySelector(PANEL_SELECTOR);
  }

  function getAuthBlock() {
    return document.getElementById(AUTH_BLOCK_ID);
  }

  function isConfirmError(error) {
    return String(error?.message || '').toLowerCase().includes('confirm');
  }

  function isAlreadyRegisteredError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('already') || message.includes('registered') || message.includes('exists');
  }

  function isMissingColumn(error, columnName) {
    return String(error?.message || '').toLowerCase().includes(String(columnName || '').toLowerCase());
  }

  function getOAuthRedirectUrl() {
    try {
      const url = new URL(window.location.href);
      url.hash = '';
      return url.toString();
    } catch (_error) {
      return window.location.href;
    }
  }

  function getPasswordRecoveryRedirectUrl() {
    try {
      const url = new URL(window.location.href);
      url.pathname = '/account/';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch (_error) {
      return 'https://pixieed.jp/account/';
    }
  }

  function updateHeaderLabel() {
    const brandUser = document.getElementById('brandUser');
    if (!brandUser) return;
    if (supabaseUser?.email) {
      brandUser.textContent = loadNickname() || supabaseUser.email;
      return;
    }
    brandUser.textContent = 'マイページ';
  }

  function renderAvatarChoices() {
    const grid = document.getElementById('avatarGrid');
    if (!grid) {
      return;
    }
    const current = loadAvatar();
    grid.textContent = '';
    AVATARS.forEach((avatar) => {
      const button = document.createElement('button');
      button.className = `avatar-option${avatar.id === current ? ' is-active' : ''}`;
      button.type = 'button';
      button.setAttribute('aria-label', avatar.id);

      const image = document.createElement('img');
      image.src = asset(avatar.src);
      image.alt = '';
      image.loading = 'lazy';
      button.appendChild(image);

      button.addEventListener('click', () => {
        saveAvatar(avatar.id);
        updateProfileUi();
        const panel = document.getElementById('avatarPanel');
        const toggle = document.getElementById('avatarToggle');
        if (panel) panel.hidden = true;
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        window.dispatchEvent(new CustomEvent('pixieed:profile-updated'));
        syncMaoituRankingProfile().catch(() => {});
      });
      grid.appendChild(button);
    });
  }

  function updateProfileUi() {
    const nickname = loadNickname();
    const xUrl = loadXUrl();
    const avatarSrc = getAvatarSrc();

    const brandAvatar = document.querySelector('#brandAvatar img');
    if (brandAvatar) {
      brandAvatar.src = avatarSrc;
    }

    const avatarPreview = document.getElementById('avatarPreview');
    if (avatarPreview) {
      avatarPreview.textContent = '';
      const image = document.createElement('img');
      image.src = avatarSrc;
      image.alt = '';
      avatarPreview.appendChild(image);
    }

    const nicknameInput = document.getElementById('profileNickname');
    if (nicknameInput && document.activeElement !== nicknameInput) {
      nicknameInput.value = nickname;
    }

    const xInput = document.getElementById('profileX');
    if (xInput && document.activeElement !== xInput) {
      xInput.value = xUrl;
    }

    const xPreview = document.getElementById('profileXPreview');
    if (xPreview) {
      xPreview.hidden = !xUrl;
      xPreview.href = xUrl || '#';
    }

    const profileEmail = document.getElementById('profileEmail');
    if (profileEmail) {
      profileEmail.value = supabaseUser?.email || '';
    }

    renderAvatarChoices();
    updateHeaderLabel();
  }

  function readCachedAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      const accessToken = typeof parsed?.access_token === 'string' ? parsed.access_token.trim() : '';
      const refreshToken = typeof parsed?.refresh_token === 'string' ? parsed.refresh_token.trim() : '';
      if (!accessToken || !refreshToken) {
        return null;
      }
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
      };
    } catch (_error) {
      return null;
    }
  }

  function writeCachedAuthSession(session) {
    try {
      if (!session?.access_token || !session?.refresh_token) {
        localStorage.removeItem(AUTH_SESSION_CACHE_KEY);
        return;
      }
      localStorage.setItem(AUTH_SESSION_CACHE_KEY, JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        savedAt: Date.now(),
      }));
    } catch (_error) {}
  }

  async function restoreAuthSessionFromCache(supabase) {
    if (!supabase?.auth) {
      return null;
    }
    const cachedSession = readCachedAuthSession();
    if (!cachedSession) {
      return null;
    }
    try {
      const { data, error } = await supabase.auth.setSession(cachedSession);
      if (error) {
        writeCachedAuthSession(null);
        return null;
      }
      return data?.session || null;
    } catch (_error) {
      writeCachedAuthSession(null);
      return null;
    }
  }

  function hasOAuthParamsInUrl() {
    try {
      const url = new URL(window.location.href);
      if (AUTH_URL_PARAM_KEYS.some((key) => url.searchParams.has(key))) {
        return true;
      }
      const hash = String(url.hash || '').replace(/^#/, '');
      if (!hash) {
        return false;
      }
      const hashParams = new URLSearchParams(hash);
      return AUTH_URL_PARAM_KEYS.some((key) => hashParams.has(key));
    } catch (_error) {
      return false;
    }
  }

  function getOAuthErrorMessage() {
    try {
      const url = new URL(window.location.href);
      const queryError = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (queryError) return queryError;
      const hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
      return hash.get('error_description') || hash.get('error') || '';
    } catch (_error) {
      return '';
    }
  }

  function maybeClearOAuthParamsFromUrl() {
    try {
      if (!window.history?.replaceState) {
        return;
      }
      const url = new URL(window.location.href);
      let changed = false;
      AUTH_URL_PARAM_KEYS.forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
      const hash = String(url.hash || '').replace(/^#/, '');
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const hasAuthHash = AUTH_URL_PARAM_KEYS.some((key) => hashParams.has(key));
        if (hasAuthHash) {
          AUTH_URL_PARAM_KEYS.forEach((key) => hashParams.delete(key));
          const nextHash = hashParams.toString();
          url.hash = nextHash ? `#${nextHash}` : '';
          changed = true;
        }
      }
      if (changed) {
        window.history.replaceState(window.history.state, document.title, url.toString());
      }
    } catch (_error) {}
  }

  async function ensureSupabase() {
    if (supabaseClient) {
      return supabaseClient;
    }
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
      supabaseClient = window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
      return supabaseClient;
    }
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) {
      supabaseClient = await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
      return supabaseClient;
    }
    const clientPromise = (async () => {
      const module = await import(SUPABASE_MODULE_URL);
      return module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: AUTH_STORAGE_KEY,
        },
        global: {
          headers: { 'x-client-id': getClientId() },
        },
      });
    })();
    window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = clientPromise;
    supabaseClient = await clientPromise;
    window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = supabaseClient;
    return supabaseClient;
  }

  function getReturnToUrl() {
    try {
      const current = new URL(window.location.href);
      const returnTo = current.searchParams.get('returnTo') || '';
      if (!returnTo) {
        return '';
      }
      const parsed = new URL(returnTo, window.location.href);
      if (parsed.origin !== window.location.origin) {
        return '';
      }
      return parsed.toString();
    } catch (_error) {
      return '';
    }
  }

  function maybeReturnToCaller() {
    const returnTo = getReturnToUrl();
    if (!returnTo || !supabaseUser) {
      return;
    }
    if (window.location.href === returnTo) {
      return;
    }
    window.location.replace(returnTo);
  }

  async function syncProfileFromServer() {
    if (!supabaseClient || !supabaseUser?.id) {
      updateHeaderLabel();
      return;
    }
    try {
      let query = supabaseClient
        .from('user_profiles')
        .select('nickname, avatar, x_url')
        .eq('id', supabaseUser.id)
        .maybeSingle();
      let result = await query;
      if (result.error && supportsProfileXUrl && isMissingColumn(result.error, 'x_url')) {
        supportsProfileXUrl = false;
        result = await supabaseClient
          .from('user_profiles')
          .select('nickname, avatar')
          .eq('id', supabaseUser.id)
          .maybeSingle();
      }
      if (result.error) {
        throw result.error;
      }
      const profile = result.data || {};
      if (typeof profile.nickname === 'string' && profile.nickname.trim()) {
        saveNickname(profile.nickname.trim());
      }
      if (typeof profile.avatar === 'string' && profile.avatar.trim()) {
        saveAvatar(profile.avatar.trim());
      }
      if (supportsProfileXUrl && typeof profile.x_url === 'string') {
        saveXUrl(profile.x_url);
      }
    } catch (_error) {
      // keep local profile when online sync fails
    }
    updateProfileUi();
  }

  function updateAuthUi() {
    const loginBtn = document.getElementById('authLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const authInputs = document.getElementById('authInputs');
    const emailToggle = document.getElementById('authEmailToggle');
    const socialButtons = document.getElementById('authSocialButtons');
    const emailInput = document.getElementById('authEmail');
    const passInput = document.getElementById('authPasscode');
    const linkedEmail = document.getElementById('linkedEmail');
    const magicLinkBtn = document.getElementById('authMagicLinkBtn');
    const resetBtn = document.getElementById('authResetBtn');
    const nickname = loadNickname();

    if (supabaseUser && authMode !== 'update-password') {
      if (loginBtn) loginBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'block';
      if (authInputs) authInputs.style.display = 'none';
      if (emailToggle) emailToggle.style.display = 'none';
      if (socialButtons) socialButtons.style.display = 'none';
      if (magicLinkBtn) magicLinkBtn.style.display = 'none';
      if (resetBtn) resetBtn.style.display = 'none';
      if (emailInput) {
        emailInput.value = supabaseUser.email || emailInput.value;
        emailInput.disabled = true;
      }
      if (passInput) {
        passInput.value = '';
        passInput.disabled = true;
      }
      if (linkedEmail) {
        linkedEmail.style.display = 'inline-flex';
        linkedEmail.textContent = supabaseUser.email ? `紐付け済み: ${supabaseUser.email}` : '紐付け済み';
      }
      setStatus(`ログイン中${supabaseUser.email ? `: ${supabaseUser.email}` : ''}${nickname ? ` / ${nickname}` : ''}。この端末では次回もログイン状態を保持します。`);
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (authInputs) authInputs.style.display = 'grid';
      if (emailToggle) emailToggle.style.display = 'none';
      if (socialButtons) socialButtons.style.display = 'grid';
      if (magicLinkBtn) magicLinkBtn.style.display = authMode === 'login' ? '' : 'none';
      if (resetBtn) resetBtn.style.display = authMode === 'login' ? '' : 'none';
      if (emailInput) emailInput.disabled = false;
      if (passInput) passInput.disabled = false;
      if (linkedEmail) {
        linkedEmail.style.display = 'none';
        linkedEmail.textContent = '';
      }
      setStatus('');
      setAuthMode(authMode);
    }
    updateHeaderLabel();
    updateAccountPageAuthState();
  }

  function showSignedInAccount(session) {
    if (!session?.user) return false;
    // メールログインの成功レスポンスには session が含まれる。認証イベントや
    // プロフィール同期を待たずにマイページへ切り替え、待機したままにしない。
    writeCachedAuthSession(session);
    supabaseUser = session.user;
    window.PiXiEEDAdAccountControl?.refresh?.();
    updateAuthUi();
    maybeReturnToCaller();
    window.setTimeout(() => {
      void syncProfileFromServer().finally(() => updateAuthUi());
    }, 0);
    return true;
  }

  function setAuthMode(nextMode) {
    authMode = ['login', 'signup', 'reset', 'update-password'].includes(nextMode) ? nextMode : 'login';
    const isSignup = authMode === 'signup';
    const isReset = authMode === 'reset';
    const isUpdatePassword = authMode === 'update-password';
    const titles = {
      login: ['ログイン', 'すでにアカウントをお持ちの方', 'メールアドレスとパスワード、またはメールに届くリンクでログインできます。'],
      signup: ['新規作成', '初めてPiXiEEDを使う方', 'Googleまたはメールアドレスで、無料のPiXiEED IDを作成できます。'],
      reset: ['パスワードを再設定', 'メールで本人確認', '登録済みのメールアドレスに、再設定用のリンクを送信します。'],
      'update-password': ['新しいパスワードを設定', '本人確認済み', '新しいパスワードを入力して、アカウントの安全を保ってください。'],
    };
    const [title, description, copy] = titles[authMode];
    const titleNode = document.getElementById('authModeTitle');
    const descriptionNode = document.getElementById('authModeDescription');
    const copyNode = document.getElementById('authModeCopy');
    if (titleNode) titleNode.textContent = title;
    if (descriptionNode) descriptionNode.textContent = description;
    if (copyNode) copyNode.textContent = copy;
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      const active = button.dataset.authMode === authMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const passcodeField = document.getElementById('authPasscodeField');
    const passcodeConfirmField = document.getElementById('authPasscodeConfirmField');
    const passcodeLabel = document.getElementById('authPasscodeLabel');
    const emailInput = document.getElementById('authEmail');
    const passcodeInput = document.getElementById('authPasscode');
    const passcodeConfirmInput = document.getElementById('authPasscodeConfirm');
    const socialButtons = document.getElementById('authSocialButtons');
    const providerNote = document.getElementById('authProviderNote');
    const securityNote = document.getElementById('authSecurityNote');
    const googleButtonLabel = document.getElementById('authGoogleButtonLabel');
    const loginBtn = document.getElementById('authLoginBtn');
    const magicLinkBtn = document.getElementById('authMagicLinkBtn');
    const resetBtn = document.getElementById('authResetBtn');
    const magicLinkGuide = document.getElementById('authMagicLinkGuide');
    if (passcodeField) passcodeField.hidden = isReset;
    if (passcodeConfirmField) passcodeConfirmField.hidden = !(isSignup || isUpdatePassword);
    if (emailInput) emailInput.closest('.auth-field')?.toggleAttribute('hidden', isUpdatePassword);
    if (passcodeLabel) passcodeLabel.textContent = isUpdatePassword ? '新しいパスワード' : 'パスワード';
    if (passcodeInput) passcodeInput.autocomplete = isSignup || isUpdatePassword ? 'new-password' : 'current-password';
    if (passcodeConfirmInput) passcodeConfirmInput.autocomplete = isSignup || isUpdatePassword ? 'new-password' : 'off';
    if (socialButtons) socialButtons.style.display = isReset || isUpdatePassword ? 'none' : 'grid';
    if (providerNote) {
      providerNote.hidden = isReset || isUpdatePassword;
      providerNote.textContent = isSignup
        ? 'Googleを初めて使う場合も、PiXiEED IDが自動で作成されます。'
        : 'Googleアカウントをお持ちなら、パスワードを入力せずログインできます。';
    }
    if (securityNote) {
      securityNote.textContent = isSignup
        ? '作成後は、この端末で次回もログイン状態を保持します。確認メールが届く場合は、メール内の案内を完了してください。'
        : isReset
          ? 'アカウントが存在する場合のみ、再設定用リンクがメールで届きます。'
          : isUpdatePassword
            ? '更新後は、新しいパスワードでログインしてください。'
            : 'ログイン後は、この端末で次回もログイン状態を保持します。共有端末では必ずログアウトしてください。';
    }
    if (googleButtonLabel) googleButtonLabel.textContent = isSignup ? 'Googleで新規作成' : 'Googleでログイン';
    if (loginBtn) loginBtn.textContent = isSignup ? 'メールアドレスで新規作成' : isReset ? '再設定メールを送信' : isUpdatePassword ? 'パスワードを更新' : 'メールアドレスとパスワードでログイン';
    if (magicLinkBtn) magicLinkBtn.style.display = authMode === 'login' ? '' : 'none';
    if (resetBtn) resetBtn.style.display = authMode === 'login' ? '' : 'none';
    if (magicLinkGuide) magicLinkGuide.hidden = authMode !== 'login';
    updateMagicLinkAction();
  }

  function updateAccountPageAuthState() {
    const accountPage = document.querySelector('.account-page');
    if (!accountPage) return;
    const signedIn = Boolean(supabaseUser) && authMode !== 'update-password';
    document.body.dataset.pixieedAccountAuth = signedIn ? 'signed-in' : 'signed-out';
    const title = document.getElementById('accountTitle');
    if (title) title.textContent = signedIn ? 'マイページ' : 'ログイン';
  }

  async function signInWithProvider(provider, label) {
    if (!supabaseClient) {
      setStatus('オンラインでログインしてください');
      return;
    }
    if (window.location.protocol === 'file:') {
      setStatus('Googleログインは公開URLまたはローカルサーバーで利用してください');
      return;
    }
    setStatus(`${label}へ移動しています...`);
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthRedirectUrl(),
        },
      });
      if (error) throw error;
    } catch (_error) {
      setStatus(`${label}ログインを開始できませんでした。Supabase側のプロバイダ設定を確認してください`);
    }
  }

  async function sendLoginLink(email) {
    if (!supabaseClient) {
      setStatus('オンラインでログインしてください');
      return false;
    }
    if (!(await ensureAuthServiceReachable())) {
      setStatus('現在ログインサーバーに接続できません。時間をおいて再試行してください');
      return false;
    }
    setStatus('ログインリンクを送信しています...');
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href, shouldCreateUser: false },
      });
      if (error) throw error;
      magicLinkCooldownUntil = Date.now() + 60_000;
      updateMagicLinkAction(email);
      setStatus(`${email} にログインリンクを送信しました。メール内のリンクを開いてください。`);
      return true;
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('rate') || message.includes('too many') || message.includes('429')) {
        magicLinkCooldownUntil = Date.now() + 60_000;
        updateMagicLinkAction(email);
        setStatus('送信直後は再送できません。60秒ほど待ってから、もう一度お試しください。');
        return false;
      }
      setStatus('ログインリンクを送信できませんでした。メールアドレスと通信状態を確認してください。');
      return false;
    }
  }

  function updateMagicLinkAction(sentEmail = '') {
    const button = document.getElementById('authMagicLinkBtn');
    const guide = document.getElementById('authMagicLinkGuide');
    if (!button) return;
    if (magicLinkTimerId) {
      window.clearTimeout(magicLinkTimerId);
      magicLinkTimerId = 0;
    }
    const remainingSeconds = Math.ceil((magicLinkCooldownUntil - Date.now()) / 1000);
    if (remainingSeconds > 0) {
      button.disabled = true;
      button.textContent = `再送まで ${remainingSeconds}秒`;
      if (guide) guide.textContent = `${sentEmail ? `${sentEmail} に送信済みです。` : ''}メール内のログインリンクを開いてください。`;
      magicLinkTimerId = window.setTimeout(() => updateMagicLinkAction(sentEmail), 1000);
      return;
    }
    button.disabled = false;
    button.textContent = magicLinkCooldownUntil ? 'ログインリンクを再送する' : 'メールにログインリンクを送る（パスワード不要）';
    if (guide) guide.textContent = magicLinkCooldownUntil
      ? 'メールが見当たらない場合は、迷惑メール・プロモーションタブも確認してから再送してください。'
      : 'メールアドレスを入力して送信後、届いたメールのリンクを開くだけでログインできます。';
  }

  function readAuthInputs() {
    const emailInput = document.getElementById('authEmail');
    const passInput = document.getElementById('authPasscode');
    const passConfirmInput = document.getElementById('authPasscodeConfirm');
    return {
      email: String(emailInput?.value || '').trim(),
      passcode: String(passInput?.value || '').trim(),
      passcodeConfirmation: String(passConfirmInput?.value || '').trim(),
    };
  }

  async function validateAuthInputs() {
    const { email, passcode, passcodeConfirmation } = readAuthInputs();
    if (authMode !== 'update-password' && !email) {
      setStatus('メールアドレスを入力してください');
      return null;
    }
    if (authMode === 'reset') {
      return { email, passcode: '', passcodeConfirmation: '' };
    }
    if (!passcode) {
      setStatus('パスワードを入力してください');
      return null;
    }
    const minimumLength = authMode === 'login' ? 6 : 8;
    if (passcode.length < minimumLength) {
      setStatus(`パスワードは${minimumLength}文字以上で入力してください`);
      return null;
    }
    if ((authMode === 'signup' || authMode === 'update-password') && passcode !== passcodeConfirmation) {
      setStatus('確認用パスワードが一致しません');
      return null;
    }
    return { email, passcode, passcodeConfirmation };
  }

  async function ensureAuthServiceReachable() {
    if (authHealthCheckPromise) {
      return authHealthCheckPromise;
    }
    authHealthCheckPromise = fetch(SUPABASE_AUTH_HEALTH_URL, {
      method: 'GET',
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: 'no-store',
    })
      .then(response => response.ok)
      .catch(() => false)
      .finally(() => {
        authHealthCheckPromise = null;
      });
    return authHealthCheckPromise;
  }

  async function sendPasswordResetEmail(email) {
    if (!supabaseClient) {
      setStatus('オンラインでログインしてください');
      return false;
    }
    if (!(await ensureAuthServiceReachable())) {
      setStatus('現在ログインサーバーに接続できません。時間をおいて再試行してください');
      return false;
    }
    setStatus('再設定メールを送信しています...');
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordRecoveryRedirectUrl(),
      });
      if (error) throw error;
      setStatus('アカウントが存在する場合、再設定用リンクを送信しました。メールを確認してください');
      return true;
    } catch (_error) {
      setStatus('再設定メールを送信できませんでした。時間をおいて再試行してください');
      return false;
    }
  }

  async function saveProfileToServer() {
    if (!supabaseClient || !supabaseUser?.id) {
      return;
    }
    const nicknameInput = document.getElementById('profileNickname');
    const xInput = document.getElementById('profileX');
    const payload = {
      id: supabaseUser.id,
      nickname: String(nicknameInput?.value || '').trim() || null,
      avatar: loadAvatar() || null,
      x_url: normalizeXUrl(xInput?.value || '') || null,
    };
    let result = await supabaseClient.from('user_profiles').upsert(payload);
    if (result.error && supportsProfileXUrl && isMissingColumn(result.error, 'x_url')) {
      supportsProfileXUrl = false;
      delete payload.x_url;
      result = await supabaseClient.from('user_profiles').upsert(payload);
    }
    if (result.error) {
      throw result.error;
    }
  }

  async function syncMaoituRankingProfile() {
    const clientId = getClientId();
    if (!clientId) {
      return false;
    }
    let client = supabaseClient;
    if (!client) {
      try {
        client = await ensureSupabaseClient();
      } catch (_error) {
        return false;
      }
    }
    if (!client) {
      return false;
    }
    const payload = getMaoituProfilePayload();
    let result = await client
      .from('scores')
      .update(payload)
      .eq('client_id', clientId);
    if (result.error && isMissingColumn(result.error, 'avatar')) {
      result = await client
        .from('scores')
        .update({ name: payload.name })
        .eq('client_id', clientId);
    }
    if (result.error) {
      return false;
    }
    return true;
  }

  function bindControls() {
    const authForm = document.getElementById('authForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const emailToggle = document.getElementById('authEmailToggle');
    const saveBtn = document.getElementById('saveProfile');
    document.querySelectorAll('[data-auth-provider]').forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.bound === 'true') {
        return;
      }
      button.dataset.bound = 'true';
      button.addEventListener('click', async () => {
        const provider = button.dataset.authProvider || '';
        const label = button.dataset.authLabel || button.textContent || '外部アカウント';
        if (provider !== 'google') {
          setStatus('未対応のログイン方法です');
          return;
        }
        await signInWithProvider(provider, label);
      });
    });

    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        setAuthMode(button.dataset.authMode || 'login');
        document.getElementById('authEmail')?.focus();
      });
    });

    if (emailToggle && emailToggle.dataset.bound !== 'true') {
      emailToggle.dataset.bound = 'true';
      emailToggle.addEventListener('click', () => setAuthMode('login'));
    }

    const magicLinkBtn = document.getElementById('authMagicLinkBtn');
    if (magicLinkBtn && magicLinkBtn.dataset.bound !== 'true') {
      magicLinkBtn.dataset.bound = 'true';
      magicLinkBtn.addEventListener('click', async () => {
        const { email } = readAuthInputs();
        if (!email) {
          setStatus('メールアドレスを入力してください');
          document.getElementById('authEmail')?.focus();
          return;
        }
        await sendLoginLink(email);
      });
    }

    const resetBtn = document.getElementById('authResetBtn');
    if (resetBtn && resetBtn.dataset.bound !== 'true') {
      resetBtn.dataset.bound = 'true';
      resetBtn.addEventListener('click', () => {
        setAuthMode('reset');
        document.getElementById('authEmail')?.focus();
      });
    }

    const avatarToggle = document.getElementById('avatarToggle');
    const avatarPanel = document.getElementById('avatarPanel');
    if (avatarToggle && avatarPanel && avatarToggle.dataset.bound !== 'true') {
      avatarToggle.dataset.bound = 'true';
      avatarToggle.addEventListener('click', () => {
        const expanded = avatarPanel.hidden !== false;
        avatarPanel.hidden = !expanded;
        avatarToggle.setAttribute('aria-expanded', String(expanded));
      });
    }

    if (authForm && authForm.dataset.bound !== 'true') {
      authForm.dataset.bound = 'true';
      authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!supabaseClient) {
          setStatus('オンラインでログインしてください');
          return;
        }
        const input = await validateAuthInputs();
        if (!input) return;
        const { email, passcode } = input;
        if (!(await ensureAuthServiceReachable())) {
          setStatus('現在ログインサーバーに接続できません。時間をおいて再試行してください');
          return;
        }
        setStatus(authMode === 'signup' ? 'アカウントを作成しています...' : 'サインインしています...');
        try {
          if (authMode === 'reset') {
            await sendPasswordResetEmail(email);
            return;
          }
          if (authMode === 'update-password') {
            const { error } = await supabaseClient.auth.updateUser({ password: passcode });
            if (error) throw error;
            const { data: userData } = await supabaseClient.auth.getUser();
            supabaseUser = userData?.user || supabaseUser;
            setAuthMode('login');
            await syncProfileFromServer();
            updateAuthUi();
            setStatus('パスワードを更新しました。このままログインを続けられます');
            return;
          }
          if (authMode === 'signup') {
            const { data, error } = await supabaseClient.auth.signUp({ email, password: passcode, options: { emailRedirectTo: getOAuthRedirectUrl() } });
            if (error) throw error;
            if (data?.session) {
              showSignedInAccount(data.session);
            } else {
              setStatus('確認メールを送信しました。メールを確認してください');
            }
            return;
          }
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: passcode });
          if (error) {
            if (isConfirmError(error)) {
              await supabaseClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: getOAuthRedirectUrl() } });
              setStatus('確認メールを再送しました。メールを確認してください');
              return;
            }
            setStatus('メールアドレスまたはパスワードを確認してください');
            return;
          }
          if (!showSignedInAccount(data?.session)) {
            setStatus('サインインは完了しました。マイページを更新しています...');
          }
        } catch (error) {
          if (authMode === 'signup' && isAlreadyRegisteredError(error)) {
            setStatus('このメールアドレスは登録済みです。「ログイン」を選ぶか、パスワードを再設定してください');
            return;
          }
          setStatus(authMode === 'signup' ? 'アカウントを作成できませんでした' : 'ログインに失敗しました');
        }
      });
    }

    if (logoutBtn && logoutBtn.dataset.bound !== 'true') {
      logoutBtn.dataset.bound = 'true';
      logoutBtn.addEventListener('click', async () => {
        if (!supabaseClient) return;
        try {
          await supabaseClient.auth.signOut();
        } catch (_error) {}
        writeCachedAuthSession(null);
        supabaseUser = null;
        updateAuthUi();
      });
    }

    if (saveBtn && saveBtn.dataset.authSyncBound !== 'true') {
      saveBtn.dataset.authSyncBound = 'true';
      saveBtn.addEventListener('click', async () => {
        const nicknameInput = document.getElementById('profileNickname');
        const xInput = document.getElementById('profileX');
        saveNickname(nicknameInput?.value || '');
        saveXUrl(xInput?.value || '');
        updateProfileUi();
        window.dispatchEvent(new CustomEvent('pixieed:profile-updated'));
        await syncMaoituRankingProfile().catch(() => false);
        if (!supabaseUser) {
          setStatus('プロフィールを保存しました');
          return;
        }
        try {
          await saveProfileToServer();
          setStatus('プロフィールを保存しました');
        } catch (_error) {
          setStatus('ローカルに保存しました');
        }
      });
    }
  }

  function ensureAuthBlock() {
    const panel = getPanel();
    if (!panel || getAuthBlock() || document.getElementById('authLoginBtn')) {
      return;
    }
    const card = panel.querySelector('.auth-card');
    const statusNode = card?.querySelector('#authStatus');
    const block = document.createElement('div');
    block.className = 'profile-block profile-block--login';
    block.id = AUTH_BLOCK_ID;
    block.innerHTML = `
      <div class="auth-section-head">
        <strong>ログイン</strong>
        <span>Googleアカウントで同期</span>
      </div>
      <p class="auth-login-copy">Googleのアカウント選択画面へ移動します。ログインすると別端末でも同じプロフィールを使えます。</p>
      <div class="auth-social-grid" id="authSocialButtons">
        <button class="auth-btn auth-btn--google" data-auth-provider="google" data-auth-label="Google" type="button">
          <span class="auth-google-icon" aria-hidden="true">
            <svg viewBox="0 0 18 18" focusable="false">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.94v2.34A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.94H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.06l3.02-2.34z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .94 4.94l3.02 2.34C4.67 5.16 6.66 3.58 9 3.58z"/>
            </svg>
          </span>
          <span>Googleでログイン</span>
        </button>
      </div>
      <form class="auth-form" id="authForm" novalidate>
        <button class="auth-btn auth-btn--email" id="authEmailToggle" type="button">メールログインを開く</button>
        <div id="authInputs" style="display:none; gap:8px;" data-expanded="false">
          <input class="auth-input" id="authEmail" type="email" placeholder="メールアドレス" autocomplete="email">
          <input class="auth-input" id="authPasscode" type="password" placeholder="パスコード（6〜20文字）" autocomplete="current-password">
        </div>
        <div class="auth-actions" style="display:grid; gap:8px;">
          <button class="auth-btn" id="authLoginBtn" type="submit">ログイン</button>
        </div>
        <button class="auth-btn logout" id="logoutBtn" type="button" style="display:none;">ログアウト</button>
        <span class="helper" id="linkedEmail" style="display:none;"></span>
        <p class="helper" id="authAccountStatus" style="margin:0;"></p>
      </form>
    `;
    const profileBlock = statusNode?.closest('.profile-block') || panel.querySelector('.profile-block--profile');
    if (card && profileBlock && profileBlock.parentElement === card) {
      profileBlock.insertAdjacentElement('afterend', block);
    } else if (statusNode) {
      statusNode.insertAdjacentElement('beforebegin', block);
    } else if (profileBlock) {
      profileBlock.insertAdjacentElement('afterend', block);
    } else if (card) {
      card.appendChild(block);
    } else {
      panel.appendChild(block);
    }
  }

  async function init() {
    ensureAuthBlock();
    const block = getAuthBlock();
    if (!block && !document.getElementById('authLoginBtn')) {
      return;
    }
    bindControls();
    updateProfileUi();
    try {
      const supabase = await ensureSupabase();
      const oauthErrorMessage = getOAuthErrorMessage();
      const { data } = await supabase.auth.getSession();
      let session = data?.session || null;
      if (!session && !hasOAuthParamsInUrl()) {
        session = await restoreAuthSessionFromCache(supabase);
      }
      supabaseUser = session?.user || null;
      if (session) {
        writeCachedAuthSession(session);
        maybeClearOAuthParamsFromUrl();
      }
      if (!authListenerBound) {
        authListenerBound = true;
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (session) {
            writeCachedAuthSession(session);
            maybeClearOAuthParamsFromUrl();
          } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
            writeCachedAuthSession(null);
          }
          supabaseUser = session?.user || null;
          window.PiXiEEDAdAccountControl?.refresh?.();
          if (event === 'PASSWORD_RECOVERY') {
            setAuthMode('update-password');
          }
          // プロフィール同期は通信待ちになることがあるため、ログイン済み表示を
          // 先に反映する。同期完了後に表示内容だけを更新する。
          updateAuthUi();
          maybeReturnToCaller();
          await syncProfileFromServer();
          updateAuthUi();
          maybeReturnToCaller();
        });
      }
      await syncProfileFromServer();
      window.PiXiEEDAdAccountControl?.refresh?.();
      maybeReturnToCaller();
      if (!supabaseUser && oauthErrorMessage) {
        maybeClearOAuthParamsFromUrl();
        window.setTimeout(() => setStatus('ログインを完了できませんでした。もう一度お試しください'), 0);
      }
    } catch (_error) {
      supabaseClient = null;
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = null;
    }
    setAuthMode(authMode);
    updateAuthUi();
  }

  window.pixieedSharedAuthPanel = {
    init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!initPromise) initPromise = init();
    }, { once: true });
  } else {
    initPromise = init();
  }
})();
