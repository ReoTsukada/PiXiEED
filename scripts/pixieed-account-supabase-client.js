(function () {
  const READY_EVENT = 'pixieed:supabase-client-ready';
  const AUTH_EVENT = 'pixieed:account-auth-state';
  const host = window;
  const DEFAULT_CONFIG = Object.freeze({
    url: 'https://kyyiuakrqomzlikfaire.supabase.co',
    publishableKey: 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4',
    storageKey: 'sb-kyyiuakrqomzlikfaire-auth-token',
  });

  function readConfig() {
    const supplied = host.__PIXIEED_SUPABASE_CONFIG__;
    if (supplied === undefined) return DEFAULT_CONFIG;
    if (supplied === null || typeof supplied !== 'object') {
      throw new Error('Supabase config must be an object.');
    }
    const config = {
      url: String(supplied.url ?? '').trim(),
      publishableKey: String(supplied.publishableKey ?? '').trim(),
      storageKey: String(supplied.storageKey ?? '').trim(),
    };
    let url;
    try {
      url = new URL(config.url);
    } catch (_error) {
      throw new Error('Supabase URL must use HTTPS.');
    }
    const localHttp = url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol !== 'https:' && !localHttp) {
      throw new Error('Supabase URL must use HTTPS.');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('Supabase URL must not contain credentials or query data.');
    }
    if (config.publishableKey.length < 20 ||
      /service_role|sb_secret/i.test(config.publishableKey) ||
      !(config.publishableKey.startsWith('sb_publishable_') ||
        config.publishableKey.split('.').length === 3)) {
      throw new Error('Supabase key must be a publishable or anon key.');
    }
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(config.storageKey)) {
      throw new Error('Supabase storageKey is invalid.');
    }
    return Object.freeze(config);
  }

  function announce(name, detail) {
    host.dispatchEvent(new CustomEvent(name, { detail }));
  }

  if (host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
    announce(READY_EVENT, { client: host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ });
    return;
  }

  const existing = host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
  const clientPromise = existing || import('https://esm.sh/@supabase/supabase-js@2.46.1?bundle')
    .then(({ createClient }) => {
      const config = readConfig();
      return createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: config.storageKey,
        },
      });
    });

  host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = clientPromise;
  clientPromise.then((client) => {
    host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = client;
    announce(READY_EVENT, { client });
    client.auth.onAuthStateChange((event, session) => {
      announce(AUTH_EVENT, {
        event,
        authenticated: Boolean(session?.user),
      });
    });
  }).catch(() => {
    if (host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ === clientPromise) {
      delete host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
    }
  });
})();
