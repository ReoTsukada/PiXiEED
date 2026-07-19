(function () {
  'use strict';

  const status = document.getElementById('marketSellerVerificationStatus');
  const requestButton = document.getElementById('marketSellerRequest');
  if (!status) return;

  function labelForSeller(profile, payout) {
    if (!profile) return '未申請';
    if (profile.seller_status === 'verified' && profile.identity_status === 'verified' && payout?.onboarding_status === 'verified' && payout?.payouts_enabled) return '販売者確認済み';
    if (profile.seller_status === 'restricted') return '制限中';
    if (profile.seller_status === 'disabled') return '利用停止';
    if (profile.identity_status === 'failed') return '再確認が必要';
    if (profile.contact_registered_at) return '受取設定待ち（出品可）';
    return '未登録';
  }

  async function waitForClient() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
        return window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
      }
      if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) {
        return await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return null;
  }

  async function render(client) {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session?.user) {
      status.textContent = 'ログインが必要';
      if (requestButton) requestButton.hidden = true;
      return;
    }
    const [{ data, error }, { data: payout, error: payoutError }] = await Promise.all([
      client.from('market_seller_profiles').select('seller_status,identity_status,terms_accepted_at,contact_registered_at').maybeSingle(),
      client.from('market_seller_payout_accounts').select('onboarding_status,payouts_enabled').maybeSingle()
    ]);
    status.textContent = error || payoutError ? '公開準備中' : labelForSeller(data, payout);
    const verified = data?.seller_status === 'verified' && data?.identity_status === 'verified' && payout?.onboarding_status === 'verified' && payout?.payouts_enabled;
    if (requestButton) requestButton.hidden = Boolean(verified);
  }

  async function init() {
    try {
      const devAccess = window.PiXiEEDDevAccess ? await window.PiXiEEDDevAccess.check() : null;
      if (!devAccess?.allowed) return;
      const client = await waitForClient();
      if (!client) throw new Error('Supabase client unavailable');
      await render(client);
      client.auth.onAuthStateChange(() => window.setTimeout(() => render(client), 0));
    } catch (_error) {
      status.textContent = '公開準備中';
    }
  }

  window.setTimeout(init, 0);
})();
