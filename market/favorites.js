(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  const remoteFavoriteIds = new Set();
  let clientPromise = null;
  let currentUser = null;

  async function getClient() {
    if (window.location.protocol === 'file:') return null;
    if (window.PiXiEEDMarketAccess) {
      const sharedClient = await window.PiXiEEDMarketAccess.getClient().catch(() => null);
      if (sharedClient) return sharedClient;
    }
    if (!clientPromise) {
      clientPromise = import('https://esm.sh/@supabase/supabase-js@2.46.1?bundle')
        .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY }
        }))
        .catch(() => null);
    }
    return clientPromise;
  }

  async function prepare(assets) {
    const ids = Array.from(new Set((assets || []).map((asset) => asset?.id).filter(Boolean)));
    if (!ids.length) return;
    const client = await getClient();
    if (!client) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      currentUser = user || null;
    } catch (_error) {
      // Favorites are optional on the public catalog. Do not let a transient
      // Auth endpoint failure prevent anonymous browsing.
      currentUser = null;
    }
    if (!currentUser) return;
    const { data, error } = await client.from('market_asset_favorites').select('asset_id').in('asset_id', ids);
    if (!error) (data || []).forEach((row) => remoteFavoriteIds.add(row.asset_id));
  }

  function renderButton(button, active, count) {
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', `${active ? 'お気に入りから外す' : 'お気に入りに追加'}。現在${count}件`);
    button.innerHTML = `<span aria-hidden="true">${active ? '♥' : '♡'}</span>`;
  }

  function compactCount(value) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    if (count >= 1000000) return `${count < 10000000 ? (count / 1000000).toFixed(1) : Math.floor(count / 1000000)}M`;
    if (count >= 1000) return `${count < 10000 ? (count / 1000).toFixed(1) : Math.floor(count / 1000)}K`;
    return count.toLocaleString('ja-JP');
  }

  function bind(button, asset) {
    if (!(button instanceof HTMLButtonElement) || !asset?.id) return;
    let active = remoteFavoriteIds.has(asset.id);
    let count = Math.max(0, Number(asset.favorite_count) || 0);
    renderButton(button, active, count);
    button.addEventListener('click', async (event) => {
      event.preventDefault(); event.stopPropagation();
      if (button.disabled) return;
      const client = await getClient();
      if (!client) return;
      if (!currentUser) {
        try {
          const { data: { user } } = await client.auth.getUser();
          currentUser = user || null;
        } catch (_error) {
          button.title = 'ログイン状態を確認できませんでした。通信状態を確認してもう一度お試しください。';
          return;
        }
      }
      if (!currentUser) {
        window.location.href = new URL('../account/index.html', window.location.href).href;
        return;
      }
      button.disabled = true;
      const nextActive = !active;
      const query = nextActive
        ? client.from('market_asset_favorites').insert({ asset_id: asset.id, user_id: currentUser.id })
        : client.from('market_asset_favorites').delete().eq('asset_id', asset.id).eq('user_id', currentUser.id);
      const { error } = await query;
      button.disabled = false;
      if (error) {
        button.title = 'お気に入りを更新できませんでした。ログイン状態を確認してください。';
        return;
      }
      active = nextActive;
      if (active) { remoteFavoriteIds.add(asset.id); count += 1; }
      else { remoteFavoriteIds.delete(asset.id); count = Math.max(0, count - 1); }
      asset.favorite_count = count;
      renderButton(button, active, count);
    });
  }

  window.PiXiEEDMarketFavorites = Object.freeze({ prepare, bind, compactCount });
})();
