(function () {
  if (window.pixieedSharedAuthPanel) {
    return;
  }

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
  const PANEL_SELECTOR = '#authPanel';
  const AUTH_BLOCK_ID = 'sharedAuthBlock';

  let supabaseClient = null;
  let supabaseUser = null;
  let initPromise = null;
  let supportsProfileXUrl = true;

  function loadNickname() {
    try {
      return localStorage.getItem('pixieed_nickname') || '';
    } catch (_error) {
      return '';
    }
  }

  function saveNickname(value) {
    try {
      localStorage.setItem('pixieed_nickname', String(value || '').trim());
    } catch (_error) {}
  }

  function loadAvatar() {
    try {
      return localStorage.getItem('pixieed_avatar') || 'mao';
    } catch (_error) {
      return 'mao';
    }
  }

  function saveAvatar(value) {
    try {
      localStorage.setItem('pixieed_avatar', value || 'mao');
    } catch (_error) {}
  }

  function normalizeXUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
      try {
        return new URL(raw).toString();
      } catch (_error) {
        return '';
      }
    }
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch (_error) {
        return '';
      }
    }
    const handle = raw.replace(/^@+/, '').trim();
    if (!handle) return '';
    const candidate = /^(x\.com|twitter\.com)\//i.test(handle)
      ? `https://${handle}`
      : `https://x.com/${handle}`;
    try {
      return new URL(candidate).toString();
    } catch (_error) {
      return '';
    }
  }

  function loadXUrl() {
    try {
      return localStorage.getItem('pixieed_x_url') || '';
    } catch (_error) {
      return '';
    }
  }

  function saveXUrl(value) {
    try {
      const normalized = normalizeXUrl(value);
      if (normalized) {
        localStorage.setItem('pixieed_x_url', normalized);
      } else {
        localStorage.removeItem('pixieed_x_url');
      }
    } catch (_error) {}
  }

  function setStatus(message) {
    const status = document.getElementById('authAccountStatus');
    if (status) {
      status.textContent = message || '';
    }
  }

  function getPanel() {
    return document.querySelector(PANEL_SELECTOR);
  }

  function getAuthBlock() {
    return document.getElementById(AUTH_BLOCK_ID);
  }

  function isConfirmError(error) {
    return String(error?.message || '').toLowerCase().includes('confirm');
  }

  function isAlreadyRegisteredError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('already') || message.includes('registered') || message.includes('exists');
  }

  function isMissingColumn(error, columnName) {
    return String(error?.message || '').toLowerCase().includes(String(columnName || '').toLowerCase());
  }

  function updateHeaderLabel() {
    const brandUser = document.getElementById('brandUser');
    if (!brandUser) return;
    if (supabaseUser?.email) {
      brandUser.textContent = loadNickname() || supabaseUser.email;
      return;
    }
    brandUser.textContent = loadNickname() || 'ユーザー';
  }

  async function ensureSupabase() {
    if (supabaseClient) {
      return supabaseClient;
    }
    const module = await import(SUPABASE_MODULE_URL);
    supabaseClient = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }

  async function syncProfileFromServer() {
    if (!supabaseClient || !supabaseUser?.id) {
      updateHeaderLabel();
      return;
    }
    try {
      let query = supabaseClient
        .from('user_profiles')
        .select('nickname, avatar, x_url')
        .eq('id', supabaseUser.id)
        .maybeSingle();
      let result = await query;
      if (result.error && supportsProfileXUrl && isMissingColumn(result.error, 'x_url')) {
        supportsProfileXUrl = false;
        result = await supabaseClient
          .from('user_profiles')
          .select('nickname, avatar')
          .eq('id', supabaseUser.id)
          .maybeSingle();
      }
      if (result.error) {
        throw result.error;
      }
      const profile = result.data || {};
      if (typeof profile.nickname === 'string' && profile.nickname.trim()) {
        saveNickname(profile.nickname.trim());
      }
      if (typeof profile.avatar === 'string' && profile.avatar.trim()) {
        saveAvatar(profile.avatar.trim());
      }
      if (supportsProfileXUrl && typeof profile.x_url === 'string') {
        saveXUrl(profile.x_url);
      }
    } catch (_error) {
      // keep local profile when online sync fails
    }
    updateHeaderLabel();
  }

  function updateAuthUi() {
    const loginBtn = document.getElementById('authLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const authInputs = document.getElementById('authInputs');
    const emailInput = document.getElementById('authEmail');
    const passInput = document.getElementById('authPasscode');
    const linkedEmail = document.getElementById('linkedEmail');
    const nickname = loadNickname();

    if (supabaseUser) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'block';
      if (authInputs) authInputs.style.display = 'none';
      if (emailInput) {
        emailInput.value = supabaseUser.email || emailInput.value;
        emailInput.disabled = true;
      }
      if (passInput) {
        passInput.value = '';
        passInput.disabled = true;
      }
      if (linkedEmail) {
        linkedEmail.style.display = 'inline-flex';
        linkedEmail.textContent = supabaseUser.email ? `紐付け済み: ${supabaseUser.email}` : '紐付け済み';
      }
      setStatus(`ログイン中${supabaseUser.email ? `: ${supabaseUser.email}` : ''}${nickname ? ` / ${nickname}` : ''}`);
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (authInputs) authInputs.style.display = 'grid';
      if (emailInput) emailInput.disabled = false;
      if (passInput) passInput.disabled = false;
      if (linkedEmail) {
        linkedEmail.style.display = 'none';
        linkedEmail.textContent = '';
      }
      setStatus(nickname ? `ニックネーム: ${nickname}` : '');
    }
    updateHeaderLabel();
  }

  async function sendLoginLink(email) {
    if (!supabaseClient) {
      setStatus('オンラインでログインしてください');
      return false;
    }
    setStatus('ログインリンクを送信しています...');
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href },
      });
      if (error) throw error;
      setStatus('ログインリンクを送信しました。メールを確認してください');
      return true;
    } catch (_error) {
      setStatus('ログインリンクの送信に失敗しました');
      return false;
    }
  }

  function readAuthInputs() {
    const emailInput = document.getElementById('authEmail');
    const passInput = document.getElementById('authPasscode');
    return {
      email: String(emailInput?.value || '').trim(),
      passcode: String(passInput?.value || '').trim(),
    };
  }

  async function validateAuthInputs() {
    const { email, passcode } = readAuthInputs();
    if (!email) {
      setStatus('メールアドレスを入力してください');
      return null;
    }
    if (!passcode) {
      await sendLoginLink(email);
      return null;
    }
    if (passcode.length < 6 || passcode.length > 20) {
      setStatus('パスコードは6〜20文字で入力してください');
      return null;
    }
    return { email, passcode };
  }

  async function saveProfileToServer() {
    if (!supabaseClient || !supabaseUser?.id) {
      return;
    }
    const nicknameInput = document.getElementById('profileNickname');
    const xInput = document.getElementById('profileX');
    const payload = {
      id: supabaseUser.id,
      nickname: String(nicknameInput?.value || '').trim() || null,
      avatar: loadAvatar() || null,
      x_url: normalizeXUrl(xInput?.value || '') || null,
    };
    let result = await supabaseClient.from('user_profiles').upsert(payload);
    if (result.error && supportsProfileXUrl && isMissingColumn(result.error, 'x_url')) {
      supportsProfileXUrl = false;
      delete payload.x_url;
      result = await supabaseClient.from('user_profiles').upsert(payload);
    }
    if (result.error) {
      throw result.error;
    }
  }

  function bindControls() {
    const loginBtn = document.getElementById('authLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const saveBtn = document.getElementById('saveProfile');
    if (loginBtn && loginBtn.dataset.bound !== 'true') {
      loginBtn.dataset.bound = 'true';
      loginBtn.addEventListener('click', async () => {
        if (!supabaseClient) {
          setStatus('オンラインでログインしてください');
          return;
        }
        const input = await validateAuthInputs();
        if (!input) return;
        const { email, passcode } = input;
        setStatus('サインインしています...');
        try {
          const { error } = await supabaseClient.auth.signInWithPassword({ email, password: passcode });
          if (error) {
            if (isConfirmError(error)) {
              await supabaseClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.href } });
              setStatus('確認メールを再送しました。メールを確認してください');
              return;
            }
            const { error: signUpError } = await supabaseClient.auth.signUp({ email, password: passcode, options: { emailRedirectTo: window.location.href } });
            if (signUpError) {
              if (isAlreadyRegisteredError(signUpError)) {
                setStatus('このメールは登録済みです。パスコードを確認してください');
                return;
              }
              setStatus('ログイン／登録に失敗しました');
              return;
            }
            setStatus('確認メールを送信しました。メールを確認してください');
          } else {
            setStatus('サインインしました');
          }
        } catch (_error) {
          setStatus('ログインに失敗しました');
        }
      });
    }

    if (logoutBtn && logoutBtn.dataset.bound !== 'true') {
      logoutBtn.dataset.bound = 'true';
      logoutBtn.addEventListener('click', async () => {
        if (!supabaseClient) return;
        try {
          await supabaseClient.auth.signOut();
        } catch (_error) {}
        supabaseUser = null;
        updateAuthUi();
      });
    }

    if (saveBtn && saveBtn.dataset.authSyncBound !== 'true') {
      saveBtn.dataset.authSyncBound = 'true';
      saveBtn.addEventListener('click', async () => {
        if (!supabaseUser) return;
        try {
          await saveProfileToServer();
          setStatus('プロフィールを保存しました');
        } catch (_error) {
          setStatus('ローカルに保存しました');
        }
      });
    }
  }

  function ensureAuthBlock() {
    const panel = getPanel();
    if (!panel || getAuthBlock() || document.getElementById('authLoginBtn')) {
      return;
    }
    const card = panel.querySelector('.auth-card');
    const statusNode = card?.querySelector('#authStatus');
    const block = document.createElement('div');
    block.className = 'profile-block';
    block.id = AUTH_BLOCK_ID;
    block.innerHTML = `
      <p class="helper" style="margin:0;">アカウントの保存（メール）</p>
      <div id="authInputs" style="display:grid; gap:8px;">
        <input class="auth-input" id="authEmail" type="email" placeholder="メールアドレス" autocomplete="email">
        <input class="auth-input" id="authPasscode" type="password" placeholder="パスコード（6〜20文字）" autocomplete="current-password">
      </div>
      <div class="auth-actions" style="display:grid; gap:8px;">
        <button class="auth-btn" id="authLoginBtn" type="button">ログイン</button>
      </div>
      <button class="auth-btn logout" id="logoutBtn" type="button" style="display:none;">ログアウト</button>
      <span class="helper" id="linkedEmail" style="display:none;"></span>
      <p class="helper" style="margin:0;">別端末でも同じアカウントで利用できます。</p>
      <p class="helper" id="authAccountStatus" style="margin:0;"></p>
    `;
    if (card) {
      if (statusNode) {
        statusNode.insertAdjacentElement('beforebegin', block);
      } else {
        card.appendChild(block);
      }
    }
  }

  async function init() {
    ensureAuthBlock();
    const block = getAuthBlock();
    if (!block && !document.getElementById('authLoginBtn')) {
      return;
    }
    bindControls();
    try {
      const supabase = await ensureSupabase();
      const { data } = await supabase.auth.getSession();
      supabaseUser = data?.session?.user || null;
      supabase.auth.onAuthStateChange(async (_event, session) => {
        supabaseUser = session?.user || null;
        await syncProfileFromServer();
        updateAuthUi();
      });
      await syncProfileFromServer();
    } catch (_error) {
      supabaseClient = null;
    }
    updateAuthUi();
  }

  window.pixieedSharedAuthPanel = {
    init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!initPromise) initPromise = init();
    }, { once: true });
  } else {
    initPromise = init();
  }
})();
