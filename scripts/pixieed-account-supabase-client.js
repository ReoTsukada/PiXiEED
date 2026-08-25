(function () {
  const READY_EVENT = 'pixieed:supabase-client-ready';
  const AUTH_EVENT = 'pixieed:account-auth-state';
  const host = window;

  function announce(name, detail) {
    host.dispatchEvent(new CustomEvent(name, { detail }));
  }

  if (host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
    announce(READY_EVENT, { client: host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ });
    return;
  }

  const existing = host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
  const clientPromise = existing || import('https://esm.sh/@supabase/supabase-js@2.46.1?bundle')
    .then(({ createClient }) => createClient(
      'https://kyyiuakrqomzlikfaire.supabase.co',
      'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'sb-kyyiuakrqomzlikfaire-auth-token',
        },
      },
    ));

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
