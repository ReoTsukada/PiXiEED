(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixieedAccountWorkflowUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  async function ensurePixieedAccountClient() {
    if (accountState.supabase) {
      return accountState.supabase;
    }
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
      accountState.supabase = window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
      if (window.__PIXIEED_ACCOUNT_AUTH_BOUND__) {
        accountAuthListenerBound = true;
      }
      if (window.__PIXIEED_ACCOUNT_AUTH_SUBSCRIPTION__) {
        accountAuthSubscription = window.__PIXIEED_ACCOUNT_AUTH_SUBSCRIPTION__;
      }
      return accountState.supabase;
    }
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) {
      accountSupabaseInitPromise = window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
    }
    if (accountSupabaseInitPromise) {
      return accountSupabaseInitPromise;
    }
    accountSupabaseInitPromise = (async () => {
      const module = await import(MULTI_SUPABASE_MODULE_URL);
      const supabase = module.createClient(MULTI_SUPABASE_URL, MULTI_SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: PIXIEED_AUTH_STORAGE_KEY,
        },
        global: { headers: { 'x-client-id': multiState.clientId || '' } },
      });
      accountState.supabase = supabase;
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = supabase;
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = Promise.resolve(supabase);
      return supabase;
    })();
    window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = accountSupabaseInitPromise;
    try {
      return await accountSupabaseInitPromise;
    } catch (error) {
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = null;
      throw error;
    } finally {
      accountSupabaseInitPromise = null;
    }
  }

  function readPixieedCachedAuthSession() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(PIXIEED_AUTH_SESSION_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token.trim() : '';
      const refreshToken = typeof parsed.refresh_token === 'string' ? parsed.refresh_token.trim() : '';
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

  function readPixieedStoredAuthSessionSnapshot() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(PIXIEED_AUTH_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      const session = parsed?.currentSession || parsed?.session || parsed;
      if (!session || typeof session !== 'object') {
        return null;
      }
      const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : '';
      const accessToken = typeof session.access_token === 'string' ? session.access_token.trim() : '';
      const refreshToken = typeof session.refresh_token === 'string' ? session.refresh_token.trim() : '';
      if (!userId || !accessToken || !refreshToken) {
        return null;
      }
      return session;
    } catch (_error) {
      return null;
    }
  }

  function hydratePixieedAccountFromLocalCache() {
    if (accountState.isLoggedIn) {
      return false;
    }
    const session = readPixieedStoredAuthSessionSnapshot();
    if (!session) {
      return false;
    }
    accountState.session = session;
    accountState.userId = session.user.id;
    accountState.isLoggedIn = true;
    accountState.isAnonymous = Boolean(
      session?.user?.is_anonymous
      || session?.user?.app_metadata?.provider === 'anonymous'
      || session?.user?.user_metadata?.provider === 'anonymous'
    );
    accountState.restoringFromLocalCache = true;
    accountState.profile = getPixieedAccountProfileFallback();
    updatePixieedAccountUi();
    return true;
  }

  function writePixieedCachedAuthSession(session) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      if (!session?.access_token || !session?.refresh_token) {
        window.localStorage.removeItem(PIXIEED_AUTH_SESSION_CACHE_KEY);
        return;
      }
      window.localStorage.setItem(PIXIEED_AUTH_SESSION_CACHE_KEY, JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }));
    } catch (_error) {
      // Ignore storage failures and continue with normal auth flow.
    }
  }

  async function restorePixieedAccountSessionFromCache(supabase) {
    if (!supabase?.auth || !accountState.supabase) {
      return null;
    }
    const cachedSession = readPixieedCachedAuthSession();
    if (!cachedSession) {
      return null;
    }
    try {
      const { data, error } = await supabase.auth.setSession(cachedSession);
      if (error) {
        writePixieedCachedAuthSession(null);
        return null;
      }
      return data?.session || null;
    } catch (_error) {
      writePixieedCachedAuthSession(null);
      return null;
    }
  }

  function syncPixieedAccountLoginAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    anchor.href = buildPixieedAccountLoginHref();
    if (isStandaloneAppDisplayMode()) {
      anchor.target = '_self';
      anchor.rel = 'noopener';
      return;
    }
    anchor.target = '_blank';
    anchor.rel = 'noopener';
  }

  function syncPixieedAccountLoginLink() {
    const loginLink = dom.controls.pixieedAccountLogin;
    syncPixieedAccountLoginAnchor(loginLink);
  }

  function syncPixieedAccountLoginPromptLink() {
    const goHome = dom.loginPrompt?.goHome;
    syncPixieedAccountLoginAnchor(goHome);
  }

  function ensurePwaInstallDialog() {
    if (window.__PIXIEED_PWA_INSTALL_DIALOG__) {
      return window.__PIXIEED_PWA_INSTALL_DIALOG__;
    }
    const overlay = document.createElement('div');
    overlay.className = 'pixieed-pwa-install-overlay';
    overlay.hidden = true;
    const dialog = document.createElement('div');
    dialog.className = 'pixieed-pwa-install-dialog';
    const title = document.createElement('h2');
    title.className = 'pixieed-pwa-install-title';
    const message = document.createElement('p');
    message.className = 'pixieed-pwa-install-text';
    const actions = document.createElement('div');
    actions.className = 'pixieed-pwa-install-actions';
    const secondaryButton = document.createElement('button');
    secondaryButton.type = 'button';
    secondaryButton.className = 'pixieed-pwa-install-action pixieed-pwa-install-action--ghost';
    const primaryButton = document.createElement('button');
    primaryButton.type = 'button';
    primaryButton.className = 'pixieed-pwa-install-action pixieed-pwa-install-action--primary';
    actions.appendChild(secondaryButton);
    actions.appendChild(primaryButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        overlay.hidden = true;
      }
    });
    document.body.appendChild(overlay);
    const api = {
      open(config = {}) {
        title.textContent = config.dialogTitle || 'PiXiEEDrawをインストール';
        message.textContent = config.dialogMessage || '';
        primaryButton.textContent = config.primaryLabel || '閉じる';
        secondaryButton.textContent = config.secondaryLabel || 'OK';
        primaryButton.onclick = () => {
          overlay.hidden = true;
          config.onPrimary?.();
        };
        secondaryButton.onclick = () => {
          overlay.hidden = true;
          config.onSecondary?.();
        };
        overlay.hidden = false;
      },
      close() {
        overlay.hidden = true;
      },
    };
    window.__PIXIEED_PWA_INSTALL_DIALOG__ = api;
    return api;
  }

  function initPwaInstallSupport() {
    if (window.pixieedPwaInstall) {
      syncPwaInstallUi();
      return;
    }
    const nav = window.navigator || {};
    const ua = nav.userAgent || '';
    const platform = nav.platform || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && nav.maxTouchPoints > 1);
    const isStandalone = (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || nav.standalone === true
    );
    let deferredPrompt = null;
    const notifyState = () => {
      syncPwaInstallUi();
      window.dispatchEvent(new CustomEvent('pixieed:pwa-install-availability-change', {
        detail: {
          available: !isStandalone && (Boolean(deferredPrompt) || isIOS),
          standalone: isStandalone,
          ios: isIOS,
        },
      }));
    };
    const openInstall = async () => {
      const dialog = ensurePwaInstallDialog();
      if (isStandalone) {
        return false;
      }
      if (isIOS) {
        const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
        dialog.open({
          dialogTitle: 'PiXiEEDrawをインストール',
          dialogMessage: isSafari
            ? 'Safariの共有ボタンをタップして「ホーム画面に追加」を選ぶと、PiXiEEDrawをアプリのように使えます。'
            : 'この端末ではSafariで開くと「ホーム画面に追加」できます。SafariでPiXiEEDrawを開いて共有メニューを使ってください。',
          primaryLabel: '閉じる',
          secondaryLabel: 'OK',
        });
        return true;
      }
      if (!deferredPrompt) {
        dialog.open({
          dialogTitle: 'インストール手順',
          dialogMessage: localizeText(
            'このブラウザでは今すぐインストール案内を出せません。対応ブラウザのメニューから「インストール」または「アプリを追加」を選択してください。',
            'Install guidance is not available right now. Use your supported browser menu and choose Install or Add to Home Screen.'
          ),
          primaryLabel: '閉じる',
          secondaryLabel: 'OK',
        });
        return false;
      }
      dialog.open({
        dialogTitle: 'PiXiEEDrawをインストール',
        dialogMessage: 'ホーム画面やデスクトップに追加すると、PiXiEEDrawをアプリのようにすぐ開けます。',
        primaryLabel: 'インストール',
        secondaryLabel: '後で',
        onPrimary: async () => {
          const promptEvent = deferredPrompt;
          deferredPrompt = null;
          notifyState();
          try {
            await promptEvent.prompt();
            await promptEvent.userChoice;
          } catch (_error) {
            // Ignore prompt failures.
          }
        },
      });
      return true;
    };
    window.pixieedPwaInstall = {
      open: openInstall,
      isAvailable() {
        return !isStandalone && (Boolean(deferredPrompt) || isIOS);
      },
      isStandalone,
      isIOS,
    };
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      notifyState();
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      ensurePwaInstallDialog().close();
      notifyState();
    });
    notifyState();
  }

  function syncPwaInstallUi() {
    const field = dom.controls.pwaInstallField;
    const status = dom.controls.pwaInstallStatus;
    const button = dom.controls.pwaInstallButton;
    if (!(field instanceof HTMLElement) || !(status instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
      return;
    }
    const installer = window.pixieedPwaInstall;
    const standalone = Boolean(installer?.isStandalone);
    const available = Boolean(installer?.isAvailable?.());
    const ios = Boolean(installer?.isIOS);
    field.hidden = false;
    button.hidden = false;
    button.disabled = standalone;
    if (standalone) {
      status.textContent = localizeText(
        'この端末ではすでにアプリとしてインストール済みです。',
        'This device already has PiXiEEDraw installed as an app.'
      );
      button.textContent = localizeText('インストール済み', 'Installed');
      return;
    }
    button.textContent = localizeText('インストール案内を開く', 'Open Install Guide');
    if (available) {
      status.textContent = ios
        ? localizeText(
          'ホーム画面に追加すると、PiXiEEDrawをアプリのように起動できます。',
          'Add PiXiEEDraw to the Home Screen to launch it like an app.'
        )
        : localizeText(
          'ホーム画面やデスクトップに追加すると、PiXiEEDrawをアプリのように開けます。',
          'Install PiXiEEDraw to your Home Screen or desktop to launch it like an app.'
        );
      return;
    }
    status.textContent = localizeText(
      'このブラウザでは今すぐインストール案内を出せません。対応ブラウザで開くと利用できます。',
      'Install guidance is not available in this browser right now. Open PiXiEEDraw in a supported browser to use it.'
    );
  }

  function startPixieedAccountLoginFlow({ closePrompt = false } = {}) {
    const href = buildPixieedAccountLoginHref();
    if (!href) {
      return false;
    }
    if (closePrompt) {
      closeLoginPromptDialog();
    }
    try {
      if (isStandaloneAppDisplayMode()) {
        window.location.assign(href);
      } else {
        window.open(href, '_blank', 'noopener');
      }
      return true;
    } catch (_error) {
      try {
        window.location.href = href;
        return true;
      } catch (_innerError) {
        return false;
      }
    }
  }

  function applyPixieedAccountSession(session) {
    writePixieedCachedAuthSession(session || null);
    accountState.session = session || null;
    accountState.userId = session?.user?.id || '';
    accountState.isLoggedIn = Boolean(accountState.userId);
    accountState.isAnonymous = Boolean(
      session?.user?.is_anonymous
      || session?.user?.app_metadata?.provider === 'anonymous'
      || session?.user?.user_metadata?.provider === 'anonymous'
    );
    accountState.restoringFromLocalCache = false;
    if (!accountState.isLoggedIn) {
      accountState.isAnonymous = false;
      accountState.profile = { nickname: '', avatarId: '', xUrl: '' };
      disconnectActiveSharedProjectRealtimeChannel().catch(() => {});
    }
    setRecentProjectsCache([]);
  }

  async function ensureSharedProjectBackendSession() {
    if (canUseSharedProjectsBackend()) {
      return true;
    }
    if (sharedProjectAuthEnsurePromise) {
      return sharedProjectAuthEnsurePromise;
    }
    sharedProjectAuthEnsurePromise = (async () => {
      await initPixieedAccount();
      return canUseSharedProjectsBackend();
    })();
    try {
      return await sharedProjectAuthEnsurePromise;
    } finally {
      sharedProjectAuthEnsurePromise = null;
    }
  }

  async function ensurePixieedAnonymousAccount({ silent = false } = {}) {
    try {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase?.auth || typeof supabase.auth.signInAnonymously !== 'function') {
        return false;
      }
      const currentSession = await supabase.auth.getSession();
      let session = currentSession?.data?.session || null;
      if (!session) {
        const signedIn = await supabase.auth.signInAnonymously();
        if (signedIn?.error) {
          throw signedIn.error;
        }
        session = signedIn?.data?.session || null;
      }
      if (!session) {
        const refreshed = await supabase.auth.getSession();
        session = refreshed?.data?.session || null;
      }
      applyPixieedAccountSession(session || null);
      if (accountState.isLoggedIn) {
        accountState.profile = getPixieedAccountProfileFallback();
        updatePixieedAccountUi();
        return true;
      }
    } catch (error) {
      if (!silent) {
        console.warn('Failed to create anonymous PiXiEED sharing session', error);
      }
    }
    return false;
  }

  async function ensurePixieedAccountReady({ forceRefresh = false, silent = false, allowAnonymous = false } = {}) {
    try {
      await initPixieedAccount();
      if (forceRefresh) {
        const supabase = await ensurePixieedAccountClient();
        if (supabase?.auth) {
          let { data } = await supabase.auth.getSession();
          let session = data?.session || null;
          if (!session) {
            session = await restorePixieedAccountSessionFromCache(supabase);
            if (session) {
              ({ data } = await supabase.auth.getSession());
              session = data?.session || session;
            }
          }
          applyPixieedAccountSession(session || null);
          if (accountState.isLoggedIn) {
            if (!accountState.isAnonymous) {
              try {
                await syncPixieedAccountProfile();
              } catch (error) {
                if (!shouldIgnorePixieedProfileError(error)) {
                  throw error;
                }
                accountState.profile = getPixieedAccountProfileFallback();
                updatePixieedAccountUi();
              }
            } else {
              accountState.profile = getPixieedAccountProfileFallback();
              updatePixieedAccountUi();
            }
            await syncSharedRecentProjectsFromAccount();
          } else {
            updatePixieedAccountUi();
          }
        }
      }
    } catch (error) {
      if (!silent) {
        console.warn('Failed to ensure PiXiEED account readiness', error);
      }
    }
    return Boolean(accountState.isLoggedIn && accountState.userId && (allowAnonymous || !accountState.isAnonymous));
  }

  async function ensureSharedProjectAuthenticatedStart({ requireLogin = true } = {}) {
    if (!requireLogin) {
      return true;
    }
    await ensurePixieedAccountReady({ forceRefresh: true, silent: true, allowAnonymous: false });
    if (accountState.isLoggedIn && accountState.userId && !accountState.isAnonymous) {
      return true;
    }
    setMultiStatus(
      localizeText(
        '共有を開始する前にPiXiEEDアカウントへログインしてください。',
        'Please sign in to your PiXiEED account before starting shared editing.'
      ),
      'error'
    );
    openLoginPromptDialog();
    return false;
  }

  async function ensurePublicSharedProjectUrlSession(projectRecord = null) {
    if (accountState.isLoggedIn && accountState.userId) {
      return true;
    }
    if (projectRecord?.visibility !== MULTI_ROOM_VISIBILITY_PUBLIC) {
      setMultiStatus(
        localizeText(
          '限定プロジェクトを開くにはログインしてください。',
          'Sign in to open this limited project.'
        ),
        'warn'
      );
      openLoginPromptDialog();
      return false;
    }
    const started = await ensurePixieedAnonymousAccount({ silent: true });
    if (started && accountState.isLoggedIn && accountState.userId) {
      return true;
    }
    setMultiStatus(
      localizeText(
        '公開プロジェクト用の一時セッションを開始できませんでした。',
        'Could not start a temporary session for the public project.'
      ),
      'error'
    );
    return false;
  }

  async function resumePendingSharedInviteAfterLogin() {
    if (pendingSharedInviteResumePromise) {
      return pendingSharedInviteResumePromise;
    }
    pendingSharedInviteResumePromise = (async () => {
      const pendingInvite = readPendingSharedInvite();
      if (!pendingInvite) {
        return false;
      }
      await ensurePixieedAccountReady({ forceRefresh: true, silent: true });
      if (!accountState.isLoggedIn || !accountState.userId || accountState.isAnonymous) {
        return false;
      }
      const opened = await openSharedProjectCanonical({
        inviteToken: pendingInvite.inviteToken || '',
        projectKey: pendingInvite.projectKey || '',
        requestedRole: pendingInvite.requestedRole || 'guest',
        autoJoin: pendingInvite.autoJoin !== false,
        reason: 'resume-pending-invite',
        hideStartup: true,
        silent: true,
      });
      if (opened) {
        clearPendingSharedInvite();
        closeLoginPromptDialog();
        clearMultiInviteQueryParamsFromUrl();
        setMultiStatus(
          localizeText(
            'ログイン後に共有プロジェクトへの参加を再開しました。',
            'Resumed joining the shared project after sign-in.'
          ),
          'success'
        );
        return true;
      }
      return false;
    })();
    try {
      return await pendingSharedInviteResumePromise;
    } finally {
      pendingSharedInviteResumePromise = null;
    }
  }

  function isBrokenSharedInviteBinding(projectRecord, {
    expectedInviteToken = '',
    expectedProjectKey = '',
  } = {}) {
    const normalizedExpectedToken = typeof expectedInviteToken === 'string' ? expectedInviteToken.trim() : '';
    const normalizedExpectedProjectKey = normalizeMultiProjectKey(expectedProjectKey);
    const projectKey = normalizeMultiProjectKey(projectRecord?.project_key || '');
    const inviteToken = typeof projectRecord?.invite_token === 'string' ? projectRecord.invite_token.trim() : '';
    if (!projectKey) {
      return true;
    }
    if (normalizedExpectedToken && (!inviteToken || inviteToken !== normalizedExpectedToken)) {
      return true;
    }
    if (normalizedExpectedProjectKey && projectKey !== normalizedExpectedProjectKey) {
      return true;
    }
    return false;
  }

  function getPixieedAccountProfileFallback() {
    const metadata = accountState.session?.user?.user_metadata || accountState.session?.user?.app_metadata || {};
    const nicknameFromMeta = typeof metadata?.nickname === 'string'
      ? metadata.nickname.trim()
      : (typeof metadata?.name === 'string' ? metadata.name.trim() : '');
    const avatarFromMeta = typeof metadata?.avatar === 'string'
      ? metadata.avatar.trim()
      : (typeof metadata?.avatar_url === 'string' ? metadata.avatar_url.trim() : '');
    const xUrlFromMeta = typeof metadata?.x_url === 'string'
      ? metadata.x_url.trim()
      : (typeof metadata?.xUrl === 'string' ? metadata.xUrl.trim() : '');
    return {
      nickname: accountState.profile?.nickname || readPixieedLocalNickname() || nicknameFromMeta || '',
      avatarId: normalizePixieedAvatarId(
        accountState.profile?.avatarId
          || readPixieedLocalAvatarId()
          || avatarFromMeta
          || ''
      ),
      xUrl: accountState.profile?.xUrl || readPixieedLocalXUrl() || xUrlFromMeta || '',
    };
  }

  async function syncPixieedAccountProfile() {
    const userId = accountState.userId;
    if (!userId) {
      const fallbackProfile = getPixieedAccountProfileFallback();
      accountState.profile = fallbackProfile;
      updatePixieedAccountUi();
      return fallbackProfile;
    }
    if (accountProfileSyncPromisesByUserId.has(userId)) {
      return accountProfileSyncPromisesByUserId.get(userId);
    }
    accountProfileSyncPromise = (async () => {
      const supabase = await ensurePixieedAccountClient();
      if (!supabase) {
        const fallbackProfile = getPixieedAccountProfileFallback();
        accountState.profile = fallbackProfile;
        updatePixieedAccountUi();
        return fallbackProfile;
      }
      const localNick = readPixieedLocalNickname();
      const localAvatar = readPixieedLocalAvatarId();
      const localXUrl = readPixieedLocalXUrl();
      let selectColumns = supportsPixieedProfileXUrl ? 'nickname, avatar, x_url' : 'nickname, avatar';
      let { data, error } = await supabase
        .from('user_profiles')
        .select(selectColumns)
        .eq('id', userId)
        .maybeSingle();
      if (error && supportsPixieedProfileXUrl && isMissingColumn(error, 'x_url')) {
        supportsPixieedProfileXUrl = false;
        selectColumns = 'nickname, avatar';
        ({ data, error } = await supabase
          .from('user_profiles')
          .select(selectColumns)
          .eq('id', userId)
          .maybeSingle());
      }
      if (shouldIgnorePixieedProfileError(error)) {
        accountState.profile = getPixieedAccountProfileFallback();
        updatePixieedAccountUi();
        return accountState.profile;
      }
      if (error) throw error;
      const serverNick = typeof data?.nickname === 'string' ? data.nickname.trim() : '';
      const serverAvatarRaw = typeof data?.avatar === 'string' ? data.avatar.trim() : '';
      const serverAvatar = serverAvatarRaw ? normalizePixieedAvatarId(serverAvatarRaw) : '';
      const serverXUrl = typeof data?.x_url === 'string' ? data.x_url.trim() : '';
      if (serverNick) {
        writePixieedLocalNickname(serverNick);
      }
      if (serverAvatarRaw) {
        writePixieedLocalAvatarId(serverAvatar);
      }
      if (serverXUrl) {
        writePixieedLocalXUrl(serverXUrl);
      }
      const nextProfile = {
        nickname: serverNick || localNick,
        avatarId: normalizePixieedAvatarId(serverAvatar || localAvatar),
        xUrl: serverXUrl || localXUrl,
      };
      accountState.profile = nextProfile;
      const payload = { id: userId };
      if (!serverNick && localNick) {
        payload.nickname = localNick;
      }
      if (!serverAvatarRaw && localAvatar) {
        payload.avatar = localAvatar;
      }
      if (supportsPixieedProfileXUrl && !serverXUrl && localXUrl) {
        payload.x_url = localXUrl;
      }
      if (Object.keys(payload).length > 1) {
        let upsert = await supabase.from('user_profiles').upsert(payload);
        if (upsert.error && supportsPixieedProfileXUrl && isMissingColumn(upsert.error, 'x_url')) {
          supportsPixieedProfileXUrl = false;
          delete payload.x_url;
          if (Object.keys(payload).length > 1) {
            upsert = await supabase.from('user_profiles').upsert(payload);
          } else {
            upsert = null;
          }
        }
        if (upsert?.error) throw upsert.error;
      }
      updatePixieedAccountUi();
      return nextProfile;
    })();
    accountProfileSyncPromisesByUserId.set(userId, accountProfileSyncPromise);
    try {
      return await accountProfileSyncPromise;
    } finally {
      accountProfileSyncPromisesByUserId.delete(userId);
      accountProfileSyncPromise = null;
    }
  }

  function updatePixieedShareAccountCard(statusNode, hintNode, loginAnchor) {
    const nickname = readPixieedAccountNickname();
    const isSignedInAccount = accountState.isLoggedIn && !accountState.isAnonymous;
    const canUseSharedAccount = canUseSharedProjectsBackend() || supportsSharedProjectsBackend;
    const { ownedProjectCount, effectiveLimit } = getSharedProjectOwnershipStatus();
    const maxSharedProjects = Math.max(1, effectiveLimit);
    const usageLabel = buildSharedProjectUsageLabel({ ownedProjectCount, effectiveLimit });
    if (statusNode instanceof HTMLElement) {
      if (isSignedInAccount) {
        const email = accountState.session?.user?.email || '';
        const label = nickname || email;
        const slotLabel = maxSharedProjects > SHARED_PROJECT_LIMIT_DEFAULT
          ? localizeText(`作成枠 ${usageLabel}`, `Slots ${usageLabel}`)
          : localizeText(`無料枠 ${usageLabel}`, `Free slot ${usageLabel}`);
        statusNode.textContent = label
          ? `${slotLabel} / ${label}`
          : slotLabel;
      } else if (canUseSharedAccount) {
        const label = nickname || localizeText('共有ゲスト', 'Shared guest');
        statusNode.textContent = `${localizeText(`無料枠 ${usageLabel}`, `Free slot ${usageLabel}`)} / ${label}`;
      } else {
        statusNode.textContent = localizeText(
          `無料枠 ${usageLabel}`,
          `Free slot ${usageLabel}`
        );
      }
    }
    if (hintNode instanceof HTMLElement) {
      if (isSignedInAccount) {
        hintNode.textContent = maxSharedProjects > SHARED_PROJECT_LIMIT_DEFAULT
          ? localizeText(
            `サポーター特典（500円）が適用中です。このアカウントで共有プロジェクトを最大${maxSharedProjects}件、共同編集最大4人、マルチキャンバス追加3つまで利用できます。`,
            `Supporter benefits (500 yen) are active. This account can create up to ${maxSharedProjects} shared projects, edit with up to 4 people, and add up to 3 Multi Canvases.`
          )
          : localizeText(
            'このアカウントで共有プロジェクトを1件作成できます。サポーター特典（500円）で4件、共同編集最大4人、マルチキャンバス追加3つまで拡張できます。',
            'This account can create 1 shared project. Supporter benefits (500 yen) expand this to 4 projects, shared editing for up to 4 people, and up to 3 extra Multi Canvases.'
          );
      } else if (canUseSharedAccount) {
        hintNode.textContent = localizeText(
          'ログインすると共有プロジェクトを1件作成できます。サポーター特典（500円）で4件、共同編集最大4人まで拡張できます。',
          'Sign in to create 1 shared project. Supporter benefits (500 yen) expand this to 4 projects and shared editing for up to 4 people.'
        );
      } else {
        hintNode.textContent = localizeText(
          '共有プロジェクトの作成とコード参加にはログインが必要です。サポーター特典は500円で共有枠と共同編集人数を拡張できます。',
          'Sign-in is required to create shared projects and join by code. Supporter benefits are 500 yen and expand shared slots and member limits.'
        );
      }
    }
    if (loginAnchor instanceof HTMLAnchorElement) {
      syncPixieedAccountLoginAnchor(loginAnchor);
      loginAnchor.textContent = localizeText('ログインして管理', 'Sign In to Manage');
      loginAnchor.hidden = isSignedInAccount;
      loginAnchor.setAttribute('aria-hidden', String(isSignedInAccount));
    }
  }

  function updatePixieedAccountUi() {
    const status = dom.controls.pixieedAccountStatus;
    const loginLink = dom.controls.pixieedAccountLogin;
    const logoutButton = dom.controls.pixieedAccountLogout;
    const detailAccountAction = dom.controls.detailAccountAction;
    const detailAccountActionLabel = dom.controls.detailAccountActionLabel;
    const dock = dom.controls.pixieedAccountDock;
    const isRestoringCachedAccount = Boolean(accountState.restoringFromLocalCache && accountState.isLoggedIn);
    const isSignedInAccount = accountState.isLoggedIn && !accountState.isAnonymous;
    const nickname = readPixieedAccountNickname();
    const email = accountState.session?.user?.email || '';
    const accountLabel = nickname || email || localizeText('ログイン', 'Sign In');
    syncPixieedAccountLoginPromptLink();
    syncPixieedAccountLoginAnchor(detailAccountAction);
    updatePixieedShareAccountCard(
      dom.controls.multiEntryAccountStatus,
      dom.controls.multiEntryAccountHint,
      dom.controls.multiEntryAccountLogin
    );
    updatePixieedShareAccountCard(
      dom.controls.multiFlowAccountStatus,
      dom.controls.multiFlowAccountHint,
      dom.controls.multiFlowAccountLogin
    );
    if (dom.controls.projectHomeJoinProjectKey instanceof HTMLInputElement) {
      dom.controls.projectHomeJoinProjectKey.disabled = !isSignedInAccount;
      dom.controls.projectHomeJoinProjectKey.placeholder = isSignedInAccount
        ? localizeText('参加コードを入力', 'Enter join code')
        : localizeText('ログインしてください', 'Please sign in');
    }
    if (dom.controls.projectHomeApplyAccessCode instanceof HTMLButtonElement) {
      dom.controls.projectHomeApplyAccessCode.disabled = !isSignedInAccount;
    }
    if (dom.controls.projectHomeJoinShared instanceof HTMLElement) {
      dom.controls.projectHomeJoinShared.hidden = false;
    }
    if (detailAccountActionLabel instanceof HTMLElement) {
      detailAccountActionLabel.textContent = isSignedInAccount
        ? accountLabel
        : localizeText('ログイン', 'Sign In');
    }
    if (detailAccountAction instanceof HTMLElement) {
      const actionLabel = isSignedInAccount
        ? localizeText(`${accountLabel} のアカウントページを開く`, `Open account page for ${accountLabel}`)
        : localizeText('ログイン', 'Sign In');
      detailAccountAction.setAttribute('aria-label', actionLabel);
      detailAccountAction.setAttribute('title', actionLabel);
    }
    if (status instanceof HTMLElement) {
      if (isRestoringCachedAccount && !accountState.isAnonymous) {
        const label = nickname || email;
        status.textContent = label
          ? localizeText(`ログイン確認中: ${label}`, `Checking sign-in: ${label}`)
          : localizeText('ログイン確認中', 'Checking sign-in');
      } else if (isSignedInAccount) {
        const email = accountState.session?.user?.email || '';
        const label = nickname || email;
        status.textContent = label
          ? localizeText(`ログイン中: ${label}`, `Signed in: ${label}`)
          : localizeText('ログイン中', 'Signed in');
      } else if (accountState.isAnonymous) {
        const label = nickname || localizeText('共有ゲスト', 'Shared guest');
        status.textContent = localizeText(`共有利用中: ${label}`, `Shared ready: ${label}`);
      } else {
        status.textContent = nickname
          ? localizeText(`未ログイン（ローカル: ${nickname}）`, `Signed out (local: ${nickname})`)
          : localizeText('未ログイン', 'Signed out');
      }
    }
    if (loginLink instanceof HTMLElement) {
      syncPixieedAccountLoginLink();
      loginLink.hidden = accountState.isLoggedIn && !accountState.isAnonymous;
      loginLink.setAttribute('aria-hidden', String(accountState.isLoggedIn && !accountState.isAnonymous));
    }
    if (logoutButton instanceof HTMLElement) {
      logoutButton.hidden = !accountState.isLoggedIn || accountState.isAnonymous;
      logoutButton.setAttribute('aria-hidden', String(!accountState.isLoggedIn || accountState.isAnonymous));
    }
    if (dock instanceof HTMLElement) {
      const nickname = readPixieedAccountNickname()
        || accountState.profile?.nickname
        || '';
      if (isRestoringCachedAccount && !accountState.isAnonymous) {
        dock.textContent = localizeText('確認中', 'Checking');
        const email = accountState.session?.user?.email || '';
        const label = nickname || email || localizeText('ログイン確認中', 'Checking sign-in');
        dock.setAttribute('title', label);
      } else if (accountState.isLoggedIn && !accountState.isAnonymous) {
        dock.textContent = localizeText('アカウント', 'Account');
        const email = accountState.session?.user?.email || '';
        const label = nickname || email || localizeText('ログイン中', 'Signed in');
        if (label) {
          dock.setAttribute('title', label);
        } else {
          dock.removeAttribute('title');
        }
      } else if (accountState.isAnonymous) {
        dock.textContent = localizeText('共有ゲスト', 'Shared guest');
        dock.setAttribute('title', nickname || localizeText('端末アカウントで共有を利用中', 'Using sharing with a local device account'));
      } else {
        dock.textContent = localizeText('ログイン', 'Sign In');
        dock.removeAttribute('title');
      }
    }
  }

  async function initPixieedAccount() {
    if (accountInitPromise) {
      return accountInitPromise;
    }
    accountInitPromise = (async () => {
      try {
        if (!pixieedAdFreeSharedLimitBound && window.pixieedAdFree?.subscribe) {
          pixieedAdFreeSharedLimitBound = true;
          window.pixieedAdFree.subscribe(nextState => {
            syncPixieedSupportBenefitUi(nextState);
            if (!accountState.isLoggedIn || accountState.isAnonymous) {
              return;
            }
            if (!nextState?.isReady) {
              return;
            }
            enforceSharedProjectOwnershipLimit().catch(error => {
              console.warn('Failed to enforce shared project limit after ad-free update', error);
            });
          });
        }
        syncPixieedSupportBenefitUi();
        const supabase = await ensurePixieedAccountClient();
        if (!supabase) {
          updatePixieedAccountUi();
          return;
        }
        let { data } = await supabase.auth.getSession();
        let session = data?.session || null;
        if (!session) {
          session = await restorePixieedAccountSessionFromCache(supabase);
          if (session) {
            ({ data } = await supabase.auth.getSession());
            session = data?.session || session;
          }
        }
        const previousUserId = accountState.userId || '';
        const wasSignedInNonAnonymous = Boolean(accountState.isLoggedIn && !accountState.isAnonymous && previousUserId);
        applyPixieedAccountSession(session);
        if (accountState.isLoggedIn) {
          if (!accountState.isAnonymous) {
            try {
              await syncPixieedAccountProfile();
            } catch (error) {
              if (!shouldIgnorePixieedProfileError(error)) {
                throw error;
              }
              accountState.profile = getPixieedAccountProfileFallback();
              updatePixieedAccountUi();
            }
          } else {
            accountState.profile = getPixieedAccountProfileFallback();
            updatePixieedAccountUi();
          }
          await syncSharedRecentProjectsFromAccount();
          if (!accountState.isAnonymous) {
            await maybePromptAndTransferRecentProjectsOnLogin({
              previousUserId,
              wasSignedInNonAnonymous,
            });
          }
          await refreshRecentProjectsUI({ sanitize: false });
          if (!accountState.isAnonymous) {
            window.setTimeout(() => {
              resumePendingSharedInviteAfterLogin().catch(() => {});
            }, 0);
          }
        } else {
          await refreshRecentProjectsUI({ sanitize: false });
          updatePixieedAccountUi();
        }
        if (!accountAuthListenerBound) {
          if (window.__PIXIEED_ACCOUNT_AUTH_BOUND__) {
            accountAuthListenerBound = true;
          } else {
            accountAuthListenerBound = true;
            window.__PIXIEED_ACCOUNT_AUTH_BOUND__ = true;
          }
          if (!accountAuthSubscription) {
            const authSubscription = supabase.auth.onAuthStateChange(async (_event, session) => {
              const previousUserId = accountState.userId || '';
              const wasSignedInNonAnonymous = Boolean(accountState.isLoggedIn && !accountState.isAnonymous && previousUserId);
              applyPixieedAccountSession(session || null);
              if (accountState.isLoggedIn) {
                if (!accountState.isAnonymous) {
                  try {
                    await syncPixieedAccountProfile();
                  } catch (error) {
                    if (!shouldIgnorePixieedProfileError(error)) {
                      throw error;
                    }
                    accountState.profile = getPixieedAccountProfileFallback();
                    updatePixieedAccountUi();
                  }
                } else {
                  accountState.profile = getPixieedAccountProfileFallback();
                  updatePixieedAccountUi();
                }
                await syncSharedRecentProjectsFromAccount();
                if (!accountState.isAnonymous) {
                  await maybePromptAndTransferRecentProjectsOnLogin({
                    previousUserId,
                    wasSignedInNonAnonymous,
                  });
                }
                await refreshRecentProjectsUI({ sanitize: false });
                if (!accountState.isAnonymous) {
                  window.setTimeout(() => {
                    resumePendingSharedInviteAfterLogin().catch(() => {});
                  }, 0);
                }
              } else {
                await refreshRecentProjectsUI({ sanitize: false });
                updatePixieedAccountUi();
              }
            });
            accountAuthSubscription = authSubscription?.data?.subscription || authSubscription?.subscription || null;
            window.__PIXIEED_ACCOUNT_AUTH_SUBSCRIPTION__ = accountAuthSubscription;
          }
        }
      } catch (error) {
        if (isRecoverableSharedBackendPreflightError(error)) {
          console.debug('Pixieed account init delayed by recoverable network error', {
            message: String(error?.message || error || ''),
          });
          if (activeSharedProjectKey) {
            setActiveSharedProjectSyncState('catching-up', { announce: true });
            queueSharedProjectReconnectRecovery('account-init-network', { immediate: false });
          }
        } else {
          console.warn('Pixieed account init failed', error);
        }
        updatePixieedAccountUi();
      } finally {
        accountInitPromise = null;
      }
    })();
    return accountInitPromise;
  }

  async function maybePromptAndTransferRecentProjectsOnLogin({
    previousUserId = '',
    wasSignedInNonAnonymous = false,
    forcePrompt = false,
  } = {}) {
    if (accountProjectTransferPromptInFlight) {
      return false;
    }
    const currentUserId = normalizeRecentProjectAccountUserId(accountState.userId || '');
    if (!currentUserId || currentUserId === 'anonymous' || accountState.isAnonymous) {
      return false;
    }
    if (!forcePrompt && wasSignedInNonAnonymous && normalizeRecentProjectAccountUserId(previousUserId || '') === currentUserId) {
      return false;
    }
    if (!forcePrompt && accountProjectTransferPromptedForUserId === currentUserId) {
      return false;
    }
    const allEntries = await loadRecentProjectsMetadata({ includeAllAccounts: true });
    const transferableEntries = allEntries.filter(entry => {
      const entryUserId = normalizeRecentProjectAccountUserId(entry?.accountUserId || '');
      return entryUserId !== currentUserId;
    });
    if (!transferableEntries.length) {
      accountProjectTransferPromptedForUserId = currentUserId;
      return false;
    }
    accountProjectTransferPromptInFlight = true;
    try {
      const accepted = window.confirm(localizeText(
        `この端末にある別アカウント分のプロジェクト ${transferableEntries.length} 件を、現在のアカウントに引き継ぎますか？`,
        `Transfer ${transferableEntries.length} projects on this device from other accounts to the current account?`
      ));
      accountProjectTransferPromptedForUserId = currentUserId;
      if (!accepted) {
        return false;
      }
      return await transferRecentProjectsToCurrentAccount(allEntries);
    } finally {
      accountProjectTransferPromptInFlight = false;
    }
  }

  async function maybePromptAndTransferRecentProjectsFromHome() {
    if (!accountState.isLoggedIn || accountState.isAnonymous) {
      return false;
    }
    return await maybePromptAndTransferRecentProjectsOnLogin({
      forcePrompt: true,
    });
  }

  async function transferRecentProjectsToCurrentAccount(allEntriesInput = null) {
    const currentUserId = normalizeRecentProjectAccountUserId(accountState.userId || '');
    if (!currentUserId || currentUserId === 'anonymous') {
      return false;
    }
    const allEntries = Array.isArray(allEntriesInput)
      ? allEntriesInput.slice()
      : await loadRecentProjectsMetadata({ includeAllAccounts: true });
    const existingCurrentOwnedShared = allEntries.filter(entry => {
      const entryUserId = normalizeRecentProjectAccountUserId(entry?.accountUserId || '');
      return entryUserId === currentUserId && isOwnedSharedRecentProjectEntry(entry) && !entry?.sharedProjectTransferLocked;
    });
    const maxShared = Math.max(1, getMaxSharedProjectCount());
    const remainingOwnedSlots = Math.max(0, maxShared - existingCurrentOwnedShared.length);
    let consumedOwnedSlots = 0;
    const transferred = allEntries.map(entry => {
      const entryUserId = normalizeRecentProjectAccountUserId(entry?.accountUserId || '');
      if (entryUserId === currentUserId) {
        return entry;
      }
      const nextEntry = {
        ...entry,
        accountUserId: currentUserId,
      };
      if (isOwnedSharedRecentProjectEntry(nextEntry)) {
        if (consumedOwnedSlots < remainingOwnedSlots) {
          nextEntry.sharedProjectTransferLocked = false;
          consumedOwnedSlots += 1;
        } else {
          nextEntry.sharedProjectTransferLocked = true;
        }
      } else if (Object.prototype.hasOwnProperty.call(nextEntry, 'sharedProjectTransferLocked')) {
        nextEntry.sharedProjectTransferLocked = false;
      }
      return nextEntry;
    });
    await saveRecentProjectsList(allEntries, transferred);
    await refreshRecentProjectsUI({ sanitize: false, syncSharedFromAccount: false });
    updateAutosaveStatus(
      localizeText(
        '端末内プロジェクトを現在のアカウントへ引き継ぎました。',
        'Transferred local projects to the current account.'
      ),
      'success'
    );
    return true;
  }

        return Object.freeze({
          ensurePixieedAccountClient,
          readPixieedCachedAuthSession,
          readPixieedStoredAuthSessionSnapshot,
          hydratePixieedAccountFromLocalCache,
          writePixieedCachedAuthSession,
          restorePixieedAccountSessionFromCache,
          syncPixieedAccountLoginAnchor,
          syncPixieedAccountLoginLink,
          syncPixieedAccountLoginPromptLink,
          ensurePwaInstallDialog,
          initPwaInstallSupport,
          syncPwaInstallUi,
          startPixieedAccountLoginFlow,
          applyPixieedAccountSession,
          ensureSharedProjectBackendSession,
          ensurePixieedAnonymousAccount,
          ensurePixieedAccountReady,
          ensureSharedProjectAuthenticatedStart,
          ensurePublicSharedProjectUrlSession,
          resumePendingSharedInviteAfterLogin,
          isBrokenSharedInviteBinding,
          getPixieedAccountProfileFallback,
          syncPixieedAccountProfile,
          updatePixieedShareAccountCard,
          updatePixieedAccountUi,
          initPixieedAccount,
          maybePromptAndTransferRecentProjectsOnLogin,
          maybePromptAndTransferRecentProjectsFromHome,
          transferRecentProjectsToCurrentAccount,
        });
      }
    })(scope);
  }

  root.pixieedAccountWorkflowUtils = Object.freeze({
    createPixieedAccountWorkflowUtils,
  });
})();
