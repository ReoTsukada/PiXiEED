(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  const LOCAL_STORAGE_KEY = 'pixieed:market-local-test-favorites:v1';
  const remoteFavoriteIds = new Set();
  let localFavoriteIds = readLocalFavorites();
  let clientPromise = null;
  let currentUser = null;

  function readLocalFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);
    } catch (_error) {
      return new Set();
    }
  }

  function saveLocalFavorites() {
    try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Array.from(localFavoriteIds))); } catch (_error) {}
  }

  async function getClient() {
    if (window.location.protocol === 'file:') return null;
    if (window.PiXiEEDDevAccess) {
      const sharedClient = await window.PiXiEEDDevAccess.getClient().catch(() => null);
      if (sharedClient) return sharedClient;
    }
    const devAccess = window.PiXiEEDMarketDevAccess ? await window.PiXiEEDMarketDevAccess.ready : null;
    if (devAccess?.allowed && devAccess.client) return devAccess.client;
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
    const ids = Array.from(new Set((assets || []).filter((asset) => asset?.local_test !== true).map((asset) => asset?.id).filter(Boolean)));
    if (!ids.length) return;
    const client = await getClient();
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    currentUser = user || null;
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
    const local = asset.local_test === true;
    let active = (local ? localFavoriteIds : remoteFavoriteIds).has(asset.id);
    let count = Math.max(0, Number(asset.favorite_count) || 0) + (local && active ? 1 : 0);
    renderButton(button, active, count);
    button.addEventListener('click', async (event) => {
      event.preventDefault(); event.stopPropagation();
      if (button.disabled) return;
      if (local) {
        active = !active;
        if (active) { localFavoriteIds.add(asset.id); count += 1; }
        else { localFavoriteIds.delete(asset.id); count = Math.max(0, count - 1); }
        saveLocalFavorites(); renderButton(button, active, count); return;
      }
      const client = await getClient();
      if (!client) return;
      if (!currentUser) {
        const { data: { user } } = await client.auth.getUser();
        currentUser = user || null;
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
