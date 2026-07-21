(function () {
  'use strict';
  if (window.PiXiEEDMarketAccess) return;

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  let clientPromise = null;
  let accessPromise = null;

  async function getClient() {
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) return window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) {
      const sharedClient = await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
      if (sharedClient) return sharedClient;
    }
    if (!clientPromise) {
      clientPromise = import('https://esm.sh/@supabase/supabase-js@2.46.1?bundle')
        .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
          global: { headers: { 'x-client-id': getClientId() } }
        }))
        .then((client) => {
          window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = client;
          return client;
        });
      // Set this before the module import finishes. Other page modules can
      // then await this exact client instead of creating a second GoTrueClient.
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = clientPromise;
    }
    return clientPromise;
  }

  function getClientId() {
    try {
      const key = 'pixieed_client_id';
      const existing = window.localStorage.getItem(key) || window.PIXIEED_CLIENT_ID || '';
      if (existing) return existing;
      const created = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      window.localStorage.setItem(key, created);
      window.PIXIEED_CLIENT_ID = created;
      return created;
    } catch (_error) {
      return 'browser';
    }
  }

  async function check(options = {}) {
    if (!options.refresh && accessPromise) return accessPromise;
    accessPromise = (async () => {
      try {
        const client = await getClient();
        try {
          const { data, error } = await client.auth.getUser();
          const user = error ? null : data?.user || null;
          const allowed = Boolean(user && !user.is_anonymous && user.email && user.email_confirmed_at);
          return { allowed, authenticated: Boolean(user), user, client, error: error || null };
        } catch (error) {
          // Public catalog calls do not require Auth. For gated pages, a
          // locally cached, still-valid session is enough to render the page;
          // every privileged market RPC still verifies the JWT server-side.
          let cachedUser = null;
          try {
            const { data } = await client.auth.getSession();
            cachedUser = data?.session?.user || null;
          } catch (_sessionError) {}
          const allowed = Boolean(
            cachedUser
            && !cachedUser.is_anonymous
            && cachedUser.email
            && cachedUser.email_confirmed_at
          );
          return {
            allowed,
            authenticated: Boolean(cachedUser),
            user: cachedUser,
            client,
            error,
            usingCachedSession: allowed,
          };
        }
      } catch (error) {
        return { allowed: false, authenticated: false, user: null, client: null, error };
      }
    })();
    return accessPromise;
  }

  window.PiXiEEDMarketAccess = Object.freeze({ check, getClient });
})();
