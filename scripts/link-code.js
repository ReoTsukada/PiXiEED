(() => {
  const LINK_CODE_LENGTH = 8;
  const LINK_CODE_TTL_MIN = 15;
  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const CLIENT_ID_KEY = 'pixieed_client_id';
  let supabasePromise = null;

  function normalizeCode(value) {
    return String(value || '').replace(/[^0-9]/g, '').slice(0, LINK_CODE_LENGTH);
  }

  function formatCode(code) {
    const raw = normalizeCode(code);
    if (raw.length <= 4) return raw;
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }

  function randomCode() {
    const max = 10 ** LINK_CODE_LENGTH;
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return String(buf[0] % max).padStart(LINK_CODE_LENGTH, '0');
  }

  function getClientId() {
    try {
      const saved = localStorage.getItem(CLIENT_ID_KEY) || window.PIXIEED_CLIENT_ID;
      if (saved) {
        window.PIXIEED_CLIENT_ID = saved;
        if (!localStorage.getItem(CLIENT_ID_KEY)) localStorage.setItem(CLIENT_ID_KEY, saved);
        return saved;
      }
      const id = crypto.randomUUID ? crypto.randomUUID() : `pix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(CLIENT_ID_KEY, id);
      window.PIXIEED_CLIENT_ID = id;
      return id;
    } catch (_) {
      const fallback = `guest-${Math.random().toString(36).slice(2, 8)}`;
      window.PIXIEED_CLIENT_ID = fallback;
      return fallback;
    }
  }

  function setClientId(id) {
    try {
      localStorage.setItem(CLIENT_ID_KEY, id);
    } catch (_) {
      // ignore
    }
    window.PIXIEED_CLIENT_ID = id;
  }

  function getProfileSnapshot() {
    let nickname = '';
    let avatar = '';
    try {
      nickname = localStorage.getItem('pixieed_nickname') || '';
    } catch (_) {}
    try {
      avatar = localStorage.getItem('pixieed_avatar') || '';
    } catch (_) {}
    return {
      nickname: nickname.trim() || null,
      avatar: avatar.trim() || null
    };
  }

  function applyProfileSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.nickname) {
      try { localStorage.setItem('pixieed_nickname', snapshot.nickname); } catch (_) {}
    }
    if (snapshot.avatar) {
      try { localStorage.setItem('pixieed_avatar', snapshot.avatar); } catch (_) {}
    }
  }

  async function getSupabase() {
    if (window.__pixieedSupabase) return window.__pixieedSupabase;
    if (!supabasePromise) {
      supabasePromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.46.1/+esm')
        .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    }
    return supabasePromise;
  }

  async function updateLinkVisibility() {
    const block = document.getElementById('linkCodeBlock');
    if (!block) return;
    block.hidden = true;
    try {
      const conflict = (() => {
        try { return localStorage.getItem('pixieed_link_conflict') === '1'; } catch (_) { return false; }
      })();
      if (conflict) {
        block.hidden = true;
        return;
      }
      const supabase = await getSupabase();
      const { data } = await supabase.auth.getSession();
      const hasSession = !!data?.session;
      block.hidden = !hasSession;
    } catch (_) {
      block.hidden = true;
    }
  }

  function isDuplicateKey(error) {
    return String(error?.code || '') === '23505' || String(error?.message || '').includes('duplicate');
  }

  async function createLinkCode() {
    const supabase = await getSupabase();
    const clientId = getClientId();
    const profile = getProfileSnapshot();
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      const { error } = await supabase.from('device_links').insert({
        code,
        client_id: clientId,
        nickname: profile.nickname,
        avatar: profile.avatar
      });
      if (!error) return code;
      if (!isDuplicateKey(error)) throw error;
    }
    throw new Error('コードの発行に失敗しました');
  }

  async function consumeLinkCode(code) {
    const supabase = await getSupabase();
    const payload = { p_code: code };
    try {
      const { data, error } = await supabase.rpc('consume_device_link', payload);
      if (error) throw error;
      if (Array.isArray(data)) return data[0] || null;
      return data || null;
    } catch (rpcError) {
      const { data, error } = await supabase
        .from('device_links')
        .select('client_id, nickname, avatar, created_at')
        .eq('code', code)
        .maybeSingle();
      if (error) throw rpcError;
      if (!data) return null;
      const created = new Date(data.created_at || 0).getTime();
      const expired = Number.isNaN(created) || (Date.now() - created) > LINK_CODE_TTL_MIN * 60 * 1000;
      await supabase.from('device_links').delete().eq('code', code);
      if (expired) return null;
      return data;
    }
  }

  function setupLinkPanel() {
    const createBtn = document.getElementById('linkCodeCreateBtn');
    const copyBtn = document.getElementById('linkCodeCopy');
    const output = document.getElementById('linkCodeOutput');
    const input = document.getElementById('linkCodeInput');
    const useBtn = document.getElementById('linkCodeUseBtn');
    const status = document.getElementById('linkCodeStatus');
    if (!createBtn && !useBtn) return;
    updateLinkVisibility();

    const setStatus = (msg) => {
      if (!status) return;
      status.textContent = msg || '';
    };

    const setOutput = (code) => {
      if (!output) return;
      output.value = formatCode(code);
      output.dataset.code = normalizeCode(code);
    };

    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        setStatus('コードを発行しています...');
        try {
          const code = await createLinkCode();
          setOutput(code);
          setStatus(`コードを発行しました（${LINK_CODE_TTL_MIN}分以内に入力してください）`);
        } catch (err) {
          console.error(err);
          setStatus('コード発行に失敗しました');
        }
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (!output) return;
        const code = output.dataset.code || normalizeCode(output.value);
        if (!code) {
          setStatus('コピーするコードがありません');
          return;
        }
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(code);
          } else {
            output.focus();
            output.select();
            document.execCommand('copy');
          }
          setStatus('コードをコピーしました');
        } catch (_) {
          setStatus('コピーに失敗しました');
        }
      });
    }

    if (useBtn) {
      useBtn.addEventListener('click', async () => {
        if (!input) return;
        const code = normalizeCode(input.value);
        if (code.length !== LINK_CODE_LENGTH) {
          setStatus(`コードは${LINK_CODE_LENGTH}桁で入力してください`);
          return;
        }
        setStatus('コードを確認しています...');
        try {
          const data = await consumeLinkCode(code);
          if (!data || !data.client_id) {
            setStatus('コードが見つからないか期限切れです');
            return;
          }
          setClientId(data.client_id);
          applyProfileSnapshot(data);
          setStatus('引き継ぎ完了。再読み込みします...');
          setTimeout(() => location.reload(), 600);
        } catch (err) {
          console.error(err);
          setStatus('引き継ぎに失敗しました');
        }
      });
    }

    if (input) {
      input.addEventListener('input', () => {
        const value = normalizeCode(input.value);
        input.value = formatCode(value);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLinkPanel);
  } else {
    setupLinkPanel();
  }
})();
