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
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY }
        }));
    }
    return clientPromise;
  }

  async function check(options = {}) {
    if (!options.refresh && accessPromise) return accessPromise;
    accessPromise = (async () => {
      try {
        const client = await getClient();
        const { data, error } = await client.auth.getUser();
        const user = error ? null : data?.user || null;
        const allowed = Boolean(user && !user.is_anonymous && user.email && user.email_confirmed_at);
        return { allowed, authenticated: Boolean(user), user, client, error: error || null };
      } catch (error) {
        return { allowed: false, authenticated: false, user: null, client: null, error };
      }
    })();
    return accessPromise;
  }

  window.PiXiEEDMarketAccess = Object.freeze({ check, getClient });
})();
