(function () {
  'use strict';

  const status = document.getElementById('marketSellerVerificationStatus');
  const requestButton = document.getElementById('marketSellerRequest');
  if (!status) return;

  function labelForSeller(profile, payout) {
    if (!profile) return '未申請';
    if (profile.seller_status === 'verified' && profile.identity_status === 'verified' && payout?.onboarding_status === 'verified' && payout?.payouts_enabled) return '販売者・受取設定済み';
    if (profile.seller_status === 'verified' && profile.identity_status === 'verified') return '販売者許可済み・受取設定待ち';
    if (profile.seller_status === 'restricted') return '制限中';
    if (profile.seller_status === 'disabled') return '利用停止';
    if (profile.identity_status === 'failed') return '販売者情報の再送信が必要';
    if (profile.contact_registered_at) return '販売者情報を送信済み';
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
    const approved = data?.seller_status === 'verified' && data?.identity_status === 'verified';
    const readyForPayout = approved && payout?.onboarding_status === 'verified' && payout?.payouts_enabled;
    if (requestButton) {
      requestButton.hidden = Boolean(readyForPayout);
      if (approved && !readyForPayout) {
        requestButton.querySelector('strong').textContent = '売上受取を設定';
        requestButton.querySelector('span').textContent = '販売者情報は許可済みです。次はStripe設定です。';
      }
    }
  }

  async function init() {
    try {
      const marketAccess = window.PiXiEEDMarketAccess ? await window.PiXiEEDMarketAccess.check() : null;
      if (!marketAccess?.client) return;
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
