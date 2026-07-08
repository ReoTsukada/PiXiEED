(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createMultiInviteUtils({
    normalizeMultiProjectKey,
    canUseSessionStorage,
    getCurrentSharedRecentProjectEntry,
    getCurrentMultiProjectKey,
    MULTI_INVITE_QUERY_FLAG,
    MULTI_INVITE_QUERY_KEY,
    MULTI_INVITE_QUERY_TOKEN,
    MULTI_INVITE_QUERY_AUTO_JOIN,
    MULTI_INVITE_QUERY_ROLE,
    MULTI_PENDING_INVITE_STORAGE_KEY,
    MULTI_PENDING_INVITE_TTL_MS,
  } = {}) {
    function parseMultiProjectAccessInput(value) {
      const raw = typeof value === 'string' ? value.trim() : '';
      if (!raw) {
        return {
          raw: '',
          projectKey: '',
          inviteToken: '',
        };
      }
      let projectKey = normalizeMultiProjectKey(raw);
      let inviteToken = '';
      const readParams = params => {
        if (!(params instanceof URLSearchParams)) {
          return;
        }
        const paramProjectKey = normalizeMultiProjectKey(
          params.get(MULTI_INVITE_QUERY_KEY)
          || params.get('projectKey')
          || params.get('sharedProjectId')
          || ''
        );
        if (paramProjectKey) {
          projectKey = paramProjectKey;
        }
        const paramInviteToken = typeof params.get(MULTI_INVITE_QUERY_TOKEN) === 'string'
          ? String(params.get(MULTI_INVITE_QUERY_TOKEN)).trim()
          : '';
        if (paramInviteToken) {
          inviteToken = paramInviteToken;
        }
      };
      try {
        const url = new URL(raw, window.location.href);
        readParams(url.searchParams);
        if (!inviteToken) {
          const hash = typeof url.hash === 'string' ? url.hash.replace(/^#/, '') : '';
          if (hash) {
            readParams(new URLSearchParams(hash));
          }
        }
      } catch (error) {
        // Ignore invalid URLs and keep raw parsing fallback below.
      }
      if (!inviteToken) {
        const tokenMatch = raw.match(/\bsp_[a-z0-9]+\b/i);
        if (tokenMatch) {
          inviteToken = tokenMatch[0].trim();
        }
      }
      if (!inviteToken) {
        const genericTokenMatch = raw.match(/\b[a-z]{2,12}_[a-z0-9]{8,}\b/i);
        if (genericTokenMatch) {
          inviteToken = genericTokenMatch[0].trim();
        }
      }
      return {
        raw,
        projectKey,
        inviteToken,
      };
    }

    function parseMultiBooleanQueryValue(value) {
      if (typeof value !== 'string') {
        return false;
      }
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }

    function resolveMultiInviteDefaultRole() {
      return 'guest';
    }

    function getSharedInviteBaseUrl() {
      const currentHref = typeof window.location?.href === 'string' ? window.location.href : '';
      if (currentHref) {
        try {
          const currentUrl = new URL(currentHref);
          if (currentUrl.protocol === 'http:' || currentUrl.protocol === 'https:') {
            return currentUrl;
          }
        } catch (error) {
          // Fall through to canonical/base URL fallback below.
        }
      }
      const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
      if (canonicalHref) {
        try {
          return new URL(canonicalHref, 'https://pixieed.jp/pixiedraw/');
        } catch (error) {
          // Fall through to the hard-coded production URL.
        }
      }
      return new URL('https://pixieed.jp/pixiedraw/');
    }

    function buildMultiInviteUrl(projectKey = getCurrentMultiProjectKey?.(), options = {}) {
      const normalizedKey = normalizeMultiProjectKey(projectKey);
      const inviteTokenSource = typeof options?.inviteToken === 'string' ? options.inviteToken.trim() : '';
      const fallbackEntry = getCurrentSharedRecentProjectEntry(normalizedKey);
      const inviteToken = inviteTokenSource || fallbackEntry?.sharedProjectInviteToken || '';
      if (!normalizedKey && !inviteToken) {
        return '';
      }
      const requestedRole = options && typeof options.role === 'string' ? options.role.trim().toLowerCase() : '';
      const autoJoin = options?.autoJoin === true;
      const inviteRole = requestedRole === 'master' || requestedRole === 'guest' || requestedRole === 'spectator'
        ? requestedRole
        : '';
      try {
        const url = getSharedInviteBaseUrl();
        url.searchParams.set(MULTI_INVITE_QUERY_FLAG, '1');
        if (normalizedKey) {
          url.searchParams.set(MULTI_INVITE_QUERY_KEY, normalizedKey);
        } else {
          url.searchParams.delete(MULTI_INVITE_QUERY_KEY);
        }
        if (inviteToken) {
          url.searchParams.set(MULTI_INVITE_QUERY_TOKEN, inviteToken);
        } else {
          url.searchParams.delete(MULTI_INVITE_QUERY_TOKEN);
        }
        url.searchParams.set(MULTI_INVITE_QUERY_AUTO_JOIN, autoJoin ? '1' : '0');
        if (inviteRole) {
          url.searchParams.set(MULTI_INVITE_QUERY_ROLE, inviteRole);
        } else {
          url.searchParams.delete(MULTI_INVITE_QUERY_ROLE);
        }
        return url.toString();
      } catch (error) {
        const origin = 'https://pixieed.jp';
        const path = '/pixiedraw/';
        const keyPart = normalizedKey
          ? `&${MULTI_INVITE_QUERY_KEY}=${encodeURIComponent(normalizedKey)}`
          : '';
        const tokenPart = inviteToken ? `&${MULTI_INVITE_QUERY_TOKEN}=${encodeURIComponent(inviteToken)}` : '';
        const rolePart = inviteRole ? `&${MULTI_INVITE_QUERY_ROLE}=${encodeURIComponent(inviteRole)}` : '';
        return `${origin}${path}?${MULTI_INVITE_QUERY_FLAG}=1${keyPart}${tokenPart}&${MULTI_INVITE_QUERY_AUTO_JOIN}=${autoJoin ? '1' : '0'}${rolePart}`;
      }
    }

    function clearMultiInviteQueryParamsFromUrl() {
      try {
        const url = new URL(window.location.href);
        let changed = false;
        [MULTI_INVITE_QUERY_FLAG, MULTI_INVITE_QUERY_KEY, MULTI_INVITE_QUERY_TOKEN, MULTI_INVITE_QUERY_AUTO_JOIN, MULTI_INVITE_QUERY_ROLE].forEach(key => {
          if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
          }
        });
        if (!changed || typeof window.history?.replaceState !== 'function') {
          return;
        }
        const search = url.searchParams.toString();
        const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash || ''}`;
        window.history.replaceState(null, '', next);
      } catch (error) {
        // Ignore URL rewrite errors.
      }
    }

    function clearPendingSharedInvite() {
      if (!canUseSessionStorage) {
        return;
      }
      try {
        window.localStorage.removeItem(MULTI_PENDING_INVITE_STORAGE_KEY);
      } catch (_error) {
        // Ignore localStorage cleanup failures.
      }
      try {
        window.sessionStorage.removeItem(MULTI_PENDING_INVITE_STORAGE_KEY);
      } catch (_error) {
        // Ignore sessionStorage cleanup failures.
      }
    }

    function storePendingSharedInvite(invite) {
      if (!canUseSessionStorage || !invite || typeof invite !== 'object') {
        clearPendingSharedInvite();
        return;
      }
      const normalizedInvite = {
        inviteToken: typeof invite.inviteToken === 'string' ? invite.inviteToken.trim() : '',
        projectKey: normalizeMultiProjectKey(invite.projectKey || ''),
        requestedRole: invite.requestedRole === 'master' || invite.requestedRole === 'guest' || invite.requestedRole === 'spectator'
          ? invite.requestedRole
          : 'guest',
        autoJoin: invite.autoJoin !== false,
        source: typeof invite.source === 'string' ? invite.source.trim() : '',
        createdAt: Date.now(),
      };
      if (!normalizedInvite.inviteToken && !normalizedInvite.projectKey) {
        clearPendingSharedInvite();
        return;
      }
      try {
        window.sessionStorage.setItem(MULTI_PENDING_INVITE_STORAGE_KEY, JSON.stringify(normalizedInvite));
      } catch (_error) {
        // If storage is unavailable, keep the previous behavior and avoid stale invites.
        clearPendingSharedInvite();
      }
    }

    function readPendingSharedInvite() {
      if (!canUseSessionStorage) {
        return null;
      }
      try {
        const raw = window.sessionStorage.getItem(MULTI_PENDING_INVITE_STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        const createdAt = Math.max(0, Math.round(Number(parsed?.createdAt) || 0));
        if (!createdAt || (Date.now() - createdAt) > MULTI_PENDING_INVITE_TTL_MS) {
          clearPendingSharedInvite();
          return null;
        }
        const invite = {
          inviteToken: typeof parsed?.inviteToken === 'string' ? parsed.inviteToken.trim() : '',
          projectKey: normalizeMultiProjectKey(parsed?.projectKey || ''),
          requestedRole: parsed?.requestedRole === 'master' || parsed?.requestedRole === 'guest' || parsed?.requestedRole === 'spectator'
            ? parsed.requestedRole
            : 'guest',
          autoJoin: parsed?.autoJoin !== false,
          source: typeof parsed?.source === 'string' ? parsed.source.trim() : '',
        };
        if (!invite.inviteToken && !invite.projectKey) {
          clearPendingSharedInvite();
          return null;
        }
        return invite;
      } catch (_error) {
        clearPendingSharedInvite();
        return null;
      }
    }

    function readStoredPendingMultiInvite() {
      const invite = readPendingSharedInvite();
      if (!invite) {
        return null;
      }
      return {
        projectKey: invite.projectKey,
        inviteToken: invite.inviteToken,
        autoJoin: invite.autoJoin,
        role: invite.requestedRole === 'master' || invite.requestedRole === 'guest' || invite.requestedRole === 'spectator'
          ? invite.requestedRole
          : '',
      };
    }

    function readMultiInviteFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        if (!parseMultiBooleanQueryValue(params.get(MULTI_INVITE_QUERY_FLAG) || '')) {
          return readStoredPendingMultiInvite();
        }
        const projectKey = normalizeMultiProjectKey(params.get(MULTI_INVITE_QUERY_KEY) || '');
        const inviteToken = typeof params.get(MULTI_INVITE_QUERY_TOKEN) === 'string'
          ? String(params.get(MULTI_INVITE_QUERY_TOKEN)).trim()
          : '';
        if (!projectKey && !inviteToken) {
          return null;
        }
        const autoJoin = parseMultiBooleanQueryValue(params.get(MULTI_INVITE_QUERY_AUTO_JOIN) || '1');
        // optional: request a role via invite (master / guest / spectator)
        const roleParam = typeof params.get(MULTI_INVITE_QUERY_ROLE) === 'string' ? String(params.get(MULTI_INVITE_QUERY_ROLE)).trim() : '';
        const role = (roleParam === 'master' || roleParam === 'guest' || roleParam === 'spectator') ? roleParam : '';
        const invite = {
          projectKey,
          inviteToken,
          autoJoin,
          role,
        };
        storePendingSharedInvite(invite);
        return invite;
      } catch (error) {
        return readStoredPendingMultiInvite();
      }
    }

    return Object.freeze({
      parseMultiProjectAccessInput,
      resolveMultiInviteDefaultRole,
      buildMultiInviteUrl,
      clearMultiInviteQueryParamsFromUrl,
      clearPendingSharedInvite,
      storePendingSharedInvite,
      readPendingSharedInvite,
      readMultiInviteFromUrl,
    });
  }

  root.multiInviteUtils = Object.freeze({
    createMultiInviteUtils,
  });
})();
