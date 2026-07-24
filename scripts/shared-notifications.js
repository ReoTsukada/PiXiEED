(function () {
  'use strict';

  if (window.__PIXIEED_NOTIFICATION_CONTROLLER__) return;
  window.__PIXIEED_NOTIFICATION_CONTROLLER__ = true;

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  // Product updates are public announcements rather than account-bound rows.
  // Keep their read state on this device so the common notification button can
  // surface them even before a visitor signs in.
  const UPDATE_NOTICE_STORAGE_KEY = 'pixieed:notifications:last-read-product-update';
  const UPDATE_FEED_PATH = 'data/project-updates.json';
  const UPDATE_PROJECT_ID = 'pixiedraw';
  const script = document.currentScript;
  const rootUrl = new URL('../', script?.src || window.location.href);
  let clientPromise = null;
  let currentUserId = '';
  let channel = null;
  let panel = null;
  let list = null;
  let latestProductUpdate = null;
  let latestRows = [];
  let latestSignedIn = false;
  let hasUnreadAccountNotification = false;
  let hasUnreadProductUpdate = false;

  function href(path) {
    return new URL(path, rootUrl).href;
  }

  async function getClient() {
    if (window.location.protocol === 'file:') return null;
    if (window.PiXiEEDMarketAccess?.getClient) return window.PiXiEEDMarketAccess.getClient().catch(() => null);
    if (!clientPromise) {
      clientPromise = import('https://esm.sh/@supabase/supabase-js@2.46.1?bundle')
        .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY }
        }))
        .catch(() => null);
    }
    return clientPromise;
  }

  function notificationButton() {
    return document.querySelector('[data-common-action="notifications"]');
  }

  function setBadge(hasUnread) {
    const button = notificationButton();
    if (!button) return;
    button.dataset.hasUnread = hasUnread ? 'true' : 'false';
    button.querySelector('.pixieed-notification-badge')?.remove();
    const badge = document.createElement('span');
    badge.className = 'pixieed-notification-badge';
    badge.setAttribute('aria-hidden', 'true');
    button.append(badge);
  }

  function syncBadge() {
    setBadge(hasUnreadAccountNotification || hasUnreadProductUpdate);
  }

  function getProductUpdateKey(update) {
    if (!update) return '';
    return `${String(update.date || '')}:${String(update.summary || '')}`;
  }

  function readLastProductUpdateKey() {
    try {
      return window.localStorage.getItem(UPDATE_NOTICE_STORAGE_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function markProductUpdateRead() {
    const key = getProductUpdateKey(latestProductUpdate);
    if (!key) return;
    try {
      window.localStorage.setItem(UPDATE_NOTICE_STORAGE_KEY, key);
    } catch (error) {
      // Storage can be disabled. Leave the announcement unread in that case.
    }
    hasUnreadProductUpdate = false;
    syncBadge();
  }

  function parseLatestProductUpdate(payload) {
    const project = Array.isArray(payload?.projects)
      ? payload.projects.find((entry) => entry?.id === UPDATE_PROJECT_ID)
      : null;
    const entry = Array.isArray(project?.entries) ? project.entries[0] : null;
    const summary = Array.isArray(entry?.items) ? entry.items.filter(Boolean).join(' ') : '';
    if (!entry?.date || !summary) return null;
    return { date: String(entry.date), summary };
  }

  async function refreshProductUpdateNotice() {
    if (window.location.protocol === 'file:') return;
    try {
      const response = await fetch(href(UPDATE_FEED_PATH), { cache: 'no-store' });
      if (!response.ok) return;
      latestProductUpdate = parseLatestProductUpdate(await response.json());
      const key = getProductUpdateKey(latestProductUpdate);
      hasUnreadProductUpdate = Boolean(key) && key !== readLastProductUpdateKey();
      syncBadge();
      render(latestRows, latestSignedIn);
    } catch (error) {
      // Account notifications remain available if the public update feed is offline.
    }
  }

  function itemText(row) {
    const title = String(row?.title || '作品');
    if (row?.kind === 'favorite') return `「${title}」を${Math.max(1, Number(row.count) || 1)}件お気に入りされました！！`;
    if (row?.kind === 'lineage_royalty') return '新しい継承ロイヤリティーがあります';
    return '新しい売り上げがあります';
  }

  function destination(row) {
    if (row?.kind === 'favorite' && row.asset_id) return href(`market/items/${encodeURIComponent(row.asset_id)}/`);
    return href('account/index.html#accountRewardDashboard');
  }

  function createPanel() {
    if (panel) return;
    const layer = document.createElement('div');
    layer.className = 'pixieed-notifications-layer';
    layer.hidden = true;
    layer.innerHTML = '<div class="pixieed-notifications-backdrop"></div><aside class="pixieed-notifications-panel" role="dialog" aria-modal="true" aria-labelledby="pixieedNotificationsTitle"><header><h2 id="pixieedNotificationsTitle">通知</h2><button type="button" aria-label="通知を閉じる">×</button></header><div class="pixieed-notifications-list" aria-live="polite"></div></aside>';
    document.body.append(layer);
    panel = layer;
    list = layer.querySelector('.pixieed-notifications-list');
    layer.querySelector('.pixieed-notifications-backdrop').addEventListener('click', close);
    layer.querySelector('header button').addEventListener('click', close);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !layer.hidden) close(); });
  }

  function close() {
    if (!panel) return;
    panel.hidden = true;
    notificationButton()?.focus({ preventScroll: true });
  }

  function renderProductUpdate() {
    if (!latestProductUpdate) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pixieed-notification pixieed-notification--product-update${hasUnreadProductUpdate ? ' is-unread' : ''}`;
    button.textContent = '最新のアップデートがあります';
    button.addEventListener('click', () => {
      markProductUpdateRead();
      if (/\/pixiedraw(?:\/|$)/.test(window.location.pathname || '')) {
        document.dispatchEvent(new CustomEvent('pixieed:open-update-history'));
        close();
        return;
      }
      window.location.href = href('pixiedraw/');
    });
    return button;
  }

  function render(rows, signedIn) {
    createPanel();
    latestRows = Array.isArray(rows) ? rows : [];
    latestSignedIn = Boolean(signedIn);
    list.replaceChildren();
    const productUpdate = renderProductUpdate();
    if (productUpdate) list.append(productUpdate);
    if (!signedIn) {
      const message = document.createElement('p');
      message.textContent = productUpdate
        ? '個別の通知を見るにはログインしてください。'
        : '通知を見るにはログインしてください。';
      list.append(message);
      return;
    }
    if (!rows.length) {
      const message = document.createElement('p');
      message.textContent = productUpdate
        ? '個別の新しい通知はありません。通知は1か月で自動的に消えます。'
        : '新しい通知はありません。通知は1か月で自動的に消えます。';
      list.append(message);
      return;
    }
    rows.forEach((row) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `pixieed-notification${row.read_at ? '' : ' is-unread'}`;
      button.textContent = itemText(row);
      button.addEventListener('click', async () => {
        const client = await getClient();
        if (client && !row.read_at) await client.from('market_user_notifications').update({ read_at: new Date().toISOString() }).eq('id', row.id);
        window.location.href = destination(row);
      });
      list.append(button);
    });
  }

  async function refresh(options = {}) {
    const client = await getClient();
    if (!client) { hasUnreadAccountNotification = false; syncBadge(); render([], false); return; }
    const { data: { user } } = await client.auth.getUser().catch(() => ({ data: {} }));
    currentUserId = user?.id || '';
    if (!currentUserId) { hasUnreadAccountNotification = false; syncBadge(); render([], false); return; }
    const { data, error } = await client.from('market_user_notifications')
      .select('id,kind,asset_id,title,count,read_at,created_at,expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = error ? [] : (data || []);
    hasUnreadAccountNotification = rows.some((row) => !row.read_at);
    syncBadge();
    render(rows, true);
    if (!options.skipChannel) subscribe(client);
  }

  function subscribe(client) {
    if (channel || !currentUserId) return;
    channel = client.channel(`market-user-notifications-${currentUserId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'market_user_notifications', filter: `recipient_user_id=eq.${currentUserId}`
      }, () => { void refresh({ skipChannel: true }); })
      .subscribe();
  }

  async function open() {
    createPanel();
    panel.hidden = false;
    await refresh();
    const client = await getClient();
    if (client && currentUserId) {
      await client.from('market_user_notifications').update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', currentUserId).is('read_at', null);
      hasUnreadAccountNotification = false;
      syncBadge();
    }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = '.pixieed-notifications-layer{position:fixed;inset:0;z-index:14120}.pixieed-notifications-layer[hidden]{display:none}.pixieed-notifications-backdrop{position:absolute;inset:0;background:rgba(2,6,23,.72)}.pixieed-notifications-panel{position:absolute;top:max(62px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));width:min(410px,calc(100vw - 20px));max-height:min(70vh,620px);display:flex;flex-direction:column;border:1px solid rgba(148,163,184,.3);border-radius:14px;background:#0b1224;color:#f8fafc;box-shadow:0 20px 48px rgba(0,0,0,.45)}.pixieed-notifications-panel header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.2)}.pixieed-notifications-panel h2{margin:0;font-size:16px}.pixieed-notifications-panel header button{border:0;background:transparent;color:inherit;font-size:26px;line-height:1;cursor:pointer}.pixieed-notifications-list{display:grid;gap:8px;overflow:auto;padding:10px;min-height:76px;color:#cbd5e1;font-size:13px;line-height:1.55}.pixieed-notification{width:100%;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#101b33;color:inherit;padding:12px;text-align:left;font:inherit;cursor:pointer}.pixieed-notification.is-unread{border-color:rgba(255,80,100,.78);background:#17213a}.pixieed-notification:hover,.pixieed-notification:focus-visible{outline:2px solid #93c5fd;outline-offset:1px}@media (max-width:520px){.pixieed-notifications-panel{top:max(58px,env(safe-area-inset-top));right:10px;left:10px;width:auto;max-height:calc(100vh - 150px)}}';
    document.head.append(style);
  }

  injectStyles();
  document.addEventListener('pixieed:open-notifications', () => { void open(); });
  void refreshProductUpdateNotice();
  getClient().then((client) => {
    if (!client) return;
    client.auth.onAuthStateChange(() => { channel = null; void refresh(); });
    void refresh();
  });
})();
