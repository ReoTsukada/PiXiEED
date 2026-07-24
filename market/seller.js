(function () {
  'use strict';
  const URL = 'https://kyyiuakrqomzlikfaire.supabase.co'; const KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const $ = (id) => document.getElementById(id); const PAYOUT_MINIMUM_YEN = 5000; let client; let factorId = ''; let enrollmentStarted = false; let sellerProfile = null; let payoutReady = false; let pendingPayoutQuote = null;
  const message = (id, value) => { $(id).textContent = value || ''; };
  const hasSubmittedRegistration = (profile) => Boolean(profile?.contact_registered_at && profile?.mfa_confirmed_at);
  const isApprovedSeller = (profile) => profile?.seller_status === 'verified' && profile?.identity_status === 'verified';
  const canResubmitRegistration = (profile) => profile?.identity_status === 'failed' || profile?.seller_status === 'restricted';
  function showProgress(profile) {
    const section = $('sellerProgressSection');
    if (!hasSubmittedRegistration(profile)) { section.hidden = true; return; }
    section.hidden = false;
    if (isApprovedSeller(profile)) {
      message('sellerProgressTitle', '販売者情報は自動許可済みです');
      message('sellerProgressDescription', '販売者情報の再入力や二段階認証は必要ありません。次は売上を受け取るためのStripe設定です。');
    } else if (profile.identity_status === 'failed') {
      message('sellerProgressTitle', '販売者情報の再確認が必要です');
      message('sellerProgressDescription', profile.restricted_reason || '入力内容を確認して、もう一度送信してください。');
    } else if (profile.seller_status === 'disabled') {
      message('sellerProgressTitle', '販売者設定を利用できません');
      message('sellerProgressDescription', profile.restricted_reason || 'サポートへお問い合わせください。');
    } else {
      message('sellerProgressTitle', '販売者情報は送信済みです');
      message('sellerProgressDescription', '確認結果を反映しています。完了後は売上受取設定へ進めます。');
    }
  }
  async function assurance() { const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(); if (error) throw error; return data; }
  async function verifiedTotpFactor() { const { data, error } = await client.auth.mfa.listFactors(); if (error) throw error; return data?.totp?.find((factor) => factor.status === 'verified') || null; }
  async function startEnrollment() {
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PiXiEED 販売者認証' }); if (error) throw error;
    factorId = data.id; enrollmentStarted = true; const qr = $('mfaQr'); qr.hidden = false; qr.replaceChildren();
    const image = new Image(); image.src = data.totp.qr_code; image.alt = '認証アプリ登録用QRコード'; qr.appendChild(image);
    $('mfaAction').textContent = 'コードを確認'; message('mfaDescription', 'QRコードをGoogle Authenticator、1Password、iPhoneのパスワードなどで読み取り、表示されたコードを入力してください。');
  }
  async function verifyFactor() {
    const code = $('mfaCode').value.replace(/\D/g, ''); if (code.length < 6) { message('mfaStatus', '6桁のコードを入力してください'); return; }
    if (!factorId) { const factor = await verifiedTotpFactor(); factorId = factor?.id || ''; }
    if (!factorId) throw new Error('認証要素が見つかりません');
    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId }); if (challengeError) throw challengeError;
    const { error } = await client.auth.mfa.verify({ factorId, challengeId: challenge.id, code }); if (error) throw error;
    message('mfaStatus', '二段階認証を確認しました'); $('mfaSection').hidden = true; $('sellerRegistrationForm').hidden = false; await loadProfile();
  }
  async function prepareMfa() {
    const level = await assurance();
    if (level.currentLevel === 'aal2') { $('mfaSection').hidden = true; $('sellerRegistrationForm').hidden = false; await loadProfile(); return; }
    $('mfaSection').hidden = false;
    const factor = await verifiedTotpFactor();
    if (factor) { factorId = factor.id; $('mfaAction').textContent = 'コードを確認'; message('mfaDescription', '認証アプリに表示されたコードを入力してください。'); }
  }
  async function loadProfile() {
    const { data, error } = await client.from('market_seller_profiles').select('legal_name,postal_code,address,phone,seller_status,identity_status,restricted_reason,terms_accepted_at,contact_registered_at,mfa_confirmed_at').maybeSingle();
    if (error) throw error;
    sellerProfile = data || null;
    showProgress(data);
    if (!data) return false;
    $('sellerLegalName').value = data.legal_name || ''; $('sellerPostalCode').value = data.postal_code || ''; $('sellerAddress').value = data.address || ''; $('sellerPhone').value = data.phone || '';
    if (hasSubmittedRegistration(data) && isApprovedSeller(data)) {
      $('mfaSection').hidden = true; $('sellerRegistrationForm').hidden = true;
      message('registrationStatus', '販売者情報は自動許可済みです。');
      $('stripeConnectSection').hidden = false;
      await refreshStripeStatus();
      return true;
    }
    if (hasSubmittedRegistration(data) && !canResubmitRegistration(data)) {
      $('mfaSection').hidden = true; $('sellerRegistrationForm').hidden = true;
      return true;
    }
    return false;
  }
  async function invokeStripe(action) {
    const { data, error } = await client.functions.invoke('market-stripe-connect', { body: { action } });
    if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Stripeへ接続できませんでした');
    return data;
  }
  async function refreshStripeStatus() {
    const button = $('stripeConnectAction');
    button.disabled = true; message('stripeConnectStatus', 'Stripeの登録状態を確認しています...');
    try {
      const data = await invokeStripe('status');
      if (data.onboardingStatus === 'verified') {
        payoutReady = true;
        button.textContent = '売上受取設定済み'; button.disabled = true;
        message('stripeConnectDescription', 'Stripeの確認と売上受取設定が完了しています。');
        message('stripeConnectStatus', '売上受取設定が完了しました。');
      } else {
        payoutReady = false;
        button.textContent = 'Stripeの登録を続ける'; button.disabled = false;
        const due = Array.isArray(data.requirementsDue) ? data.requirementsDue.length : 0;
        message('stripeConnectStatus', due ? `Stripeで${due}件の確認事項が残っています。` : 'Stripeの登録を完了してください。');
      }
    } catch (error) {
      payoutReady = false;
      button.textContent = 'Stripeの登録を開始'; button.disabled = false;
      message('stripeConnectStatus', error.message || 'Stripeの状態を確認できませんでした');
    }
    await refreshPayoutRequest();
  }

  function yen(value) { return `${new Intl.NumberFormat('ja-JP').format(Math.max(0, Number(value) || 0))}円`; }
  async function refreshPayoutRequest() {
    const section = $('payoutRequestSection'); const button = $('payoutRequestAction');
    if (!section || !client) return;
    section.hidden = false; button.disabled = true;
    try {
      const [{ data: quote, error: quoteError }, { data: requests, error: requestError }] = await Promise.all([
        client.rpc('market_quote_stripe_payout_v1'),
        client.from('market_payout_requests').select('status,requested_at,failure_message').order('requested_at', { ascending: false }).limit(1),
      ]);
      if (quoteError) throw quoteError; if (requestError) throw requestError;
      const availableYen = Math.max(0, Number(quote?.gross_amount_yen || 0));
      const latest = requests?.[0];
      if (latest?.status === 'requested' || latest?.status === 'processing') {
        message('payoutRequestDescription', `出金申請を処理しています。対象額: ${yen(availableYen)}`);
        message('payoutRequestStatus', 'Stripeへの送金結果を確認中です。');
      } else if (latest?.status === 'completed') {
        message('payoutRequestDescription', '今月の出金申請は完了しました。次の申請は翌月にできます。');
        message('payoutRequestStatus', '送金済みの金額は出金履歴で確認できます。');
      } else if (!payoutReady) {
        message('payoutRequestDescription', `確定済み残高（販売・継承・表示報酬）: ${yen(availableYen)}。出金前にStripeの売上受取設定を完了してください。`);
        message('payoutRequestStatus', '出品・販売は受取設定前でも続けられます。');
      } else if (availableYen < PAYOUT_MINIMUM_YEN) {
        message('payoutRequestDescription', `確定済み残高（販売・継承・表示報酬）: ${yen(availableYen)}。${yen(PAYOUT_MINIMUM_YEN)}以上で申請できます。`);
        message('payoutRequestStatus', 'Stripeの入金費用を抑えるため、10,000円以上まで貯めてからの申請もおすすめします。');
      } else {
        message('payoutRequestDescription', `確定済み残高（販売・継承・表示報酬）: ${yen(availableYen)}。申請すると全額をStripeへ自動送金します。`);
        message('payoutRequestStatus', '出金は月1回までです。Stripeの決済・入金費用は受取人の売上から精算します。');
        button.textContent = `${yen(availableYen)}を出金申請`; button.disabled = false;
      }
    } catch (error) { message('payoutRequestDescription', '確定済み残高を確認できませんでした。'); message('payoutRequestStatus', error.message || '接続エラー'); }
  }
  function amountRow(label, value, net = false) {
    const term = document.createElement('dt'); term.textContent = label;
    const amount = document.createElement('dd'); amount.textContent = typeof value === 'string' ? `${value}円` : yen(value); if (net) amount.classList.add('is-net');
    return [term, amount];
  }
  function openPayoutDialog(quote) {
    const dialog = $('payoutConfirmDialog'); const amounts = $('payoutConfirmAmounts'); pendingPayoutQuote = quote;
    amounts.replaceChildren(
      ...amountRow('確定済み残高（販売・継承・表示報酬）', quote.gross_amount_yen),
      ...amountRow('Stripe Transfer費用（見込み）', `-${Number(quote.transfer_fee_yen || 0)}`),
      ...amountRow('銀行口座への入金費用（見込み）', `-${Number(quote.bank_payout_fee_yen || 0)}`),
      ...amountRow('当月の受取口座利用料（見込み）', `-${Number(quote.active_account_fee_yen || 0)}`),
      ...amountRow('Stripeへ送金する額', quote.transfer_amount_yen, true),
    );
    message('payoutConfirmReason', String(quote.reason || 'Stripeの実費を差し引いて送金します。'));
    dialog.showModal();
  }
  async function showPayoutConfirmation() {
    const button = $('payoutRequestAction'); button.disabled = true; message('payoutRequestStatus', 'Stripe費用を計算しています...');
    try {
      const { data: quote, error } = await client.rpc('market_quote_stripe_payout_v1');
      if (error || !quote?.eligible) throw new Error(error?.message || '出金できる状態ではありません');
      openPayoutDialog(quote); message('payoutRequestStatus', '内容を確認してから確定してください。');
    } catch (error) { message('payoutRequestStatus', error.message || '出金内容を確認できませんでした'); }
    await refreshPayoutRequest();
  }
  async function requestPayout() {
    const button = $('payoutConfirmAction'); if (!pendingPayoutQuote) return;
    button.disabled = true; message('payoutRequestStatus', 'Stripeへの送金を開始しています...');
    try {
      const { data, error } = await client.functions.invoke('market-request-payout', { body: {} });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || '出金申請を開始できませんでした');
      message('payoutRequestStatus', `${yen(data.amount_yen)}をStripeへ送金しました。銀行口座への入金時期はStripeの案内に従います。`);
    } catch (error) { message('payoutRequestStatus', error.message || '出金申請を開始できませんでした'); }
    pendingPayoutQuote = null;
    await refreshPayoutRequest();
  }
  async function openStripeOnboarding() {
    const button = $('stripeConnectAction'); button.disabled = true; message('stripeConnectStatus', 'Stripeの登録画面を準備しています...');
    try {
      const data = await invokeStripe('onboard');
      if (data.onboardingStatus === 'verified') { await refreshStripeStatus(); return; }
      if (!/^https:\/\/connect\.stripe\.com\//i.test(data.url || '')) throw new Error('Stripe登録URLを確認できませんでした');
      window.location.assign(data.url);
    } catch (error) {
      button.disabled = false; message('stripeConnectStatus', error.message || 'Stripeの登録を開始できませんでした');
    }
  }
  async function init() {
    try {
      const access = window.PiXiEEDMarketPageAccess ? await window.PiXiEEDMarketPageAccess.ready : null;
      if (!access?.allowed || !access.client || !access.user) return;
      client = access.client;
      $('sellerPageStatus').hidden = true;
      if (!(await loadProfile())) await prepareMfa();
      $('mfaAction').addEventListener('click', async () => { try { $('mfaAction').disabled = true; if (!enrollmentStarted && !(await verifiedTotpFactor())) await startEnrollment(); else await verifyFactor(); } catch (error) { message('mfaStatus', error.message || '二段階認証に失敗しました'); } finally { $('mfaAction').disabled = false; } });
      $('stripeConnectAction').addEventListener('click', openStripeOnboarding);
      $('payoutRequestAction').addEventListener('click', showPayoutConfirmation);
      $('payoutConfirmDialog').querySelector('form').addEventListener('submit', async (event) => {
        if (event.submitter?.value !== 'confirm') { pendingPayoutQuote = null; return; }
        event.preventDefault(); await requestPayout(); $('payoutConfirmDialog').close();
      });
      $('sellerRegistrationForm').addEventListener('submit', async (event) => {
        event.preventDefault(); const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; message('registrationStatus', '申請しています...');
        const { error } = await client.rpc('market_submit_seller_registration', { input_legal_name: $('sellerLegalName').value.trim(), input_postal_code: $('sellerPostalCode').value.trim(), input_address: $('sellerAddress').value.trim(), input_phone: $('sellerPhone').value.trim(), input_terms_version: 'market-terms-v1' });
        if (error) message('registrationStatus', `保存できませんでした: ${error.message}`);
        else {
          message('registrationStatus', '販売者情報を送信し、自動許可しました。');
          await loadProfile();
        }
        submit.disabled = false;
      });
    } catch (error) { $('sellerPageStatus').textContent = `販売者登録を開始できませんでした: ${error.message || '接続エラー'}`; }
  }
  init();
})();
