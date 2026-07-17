(function () {
  'use strict';
  const URL = 'https://kyyiuakrqomzlikfaire.supabase.co'; const KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const $ = (id) => document.getElementById(id); let client; let factorId = ''; let enrollmentStarted = false; let sellerProfile = null;
  const message = (id, value) => { $(id).textContent = value || ''; };
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
    const { data, error } = await client.from('market_seller_profiles').select('legal_name,postal_code,address,phone,seller_status,terms_accepted_at,contact_registered_at,mfa_confirmed_at').maybeSingle();
    if (error) throw error;
    sellerProfile = data || null;
    if (!data) return;
    $('sellerLegalName').value = data.legal_name || ''; $('sellerPostalCode').value = data.postal_code || ''; $('sellerAddress').value = data.address || ''; $('sellerPhone').value = data.phone || '';
    if (data.contact_registered_at) {
      message('registrationStatus', data.seller_status === 'verified' ? '販売者登録は完了しています。' : '販売者情報を保存済みです。続けてStripeの売上受取設定を完了してください。');
      $('stripeConnectSection').hidden = false;
      await refreshStripeStatus();
    }
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
        button.textContent = '売上受取設定済み'; button.disabled = true;
        message('stripeConnectDescription', 'Stripeの確認と売上受取設定が完了しています。');
        message('stripeConnectStatus', '出品機能を利用できます。');
      } else {
        button.textContent = 'Stripeの登録を続ける'; button.disabled = false;
        const due = Array.isArray(data.requirementsDue) ? data.requirementsDue.length : 0;
        message('stripeConnectStatus', due ? `Stripeで${due}件の確認事項が残っています。` : 'Stripeの登録を完了してください。');
      }
    } catch (error) {
      button.textContent = 'Stripeの登録を開始'; button.disabled = false;
      message('stripeConnectStatus', error.message || 'Stripeの状態を確認できませんでした');
    }
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
      const access = window.PiXiEEDMarketDevAccess ? await window.PiXiEEDMarketDevAccess.ready : null;
      if (!access?.allowed || !access.client || !access.user) return;
      client = access.client;
      $('sellerPageStatus').hidden = true; await prepareMfa();
      $('mfaAction').addEventListener('click', async () => { try { $('mfaAction').disabled = true; if (!enrollmentStarted && !(await verifiedTotpFactor())) await startEnrollment(); else await verifyFactor(); } catch (error) { message('mfaStatus', error.message || '二段階認証に失敗しました'); } finally { $('mfaAction').disabled = false; } });
      $('stripeConnectAction').addEventListener('click', openStripeOnboarding);
      $('sellerRegistrationForm').addEventListener('submit', async (event) => {
        event.preventDefault(); const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; message('registrationStatus', '申請しています...');
        const { error } = await client.rpc('market_submit_seller_registration', { input_legal_name: $('sellerLegalName').value.trim(), input_postal_code: $('sellerPostalCode').value.trim(), input_address: $('sellerAddress').value.trim(), input_phone: $('sellerPhone').value.trim(), input_terms_version: 'market-terms-v1' });
        if (error) message('registrationStatus', `保存できませんでした: ${error.message}`);
        else {
          message('registrationStatus', '販売者情報を保存しました。続けてStripeの売上受取設定を完了してください。');
          $('stripeConnectSection').hidden = false; await refreshStripeStatus();
        }
        submit.disabled = false;
      });
    } catch (error) { $('sellerPageStatus').textContent = `販売者登録を開始できませんでした: ${error.message || '接続エラー'}`; }
  }
  init();
})();
