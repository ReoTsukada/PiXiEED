(function () {
  function init() {
    ensureGlobalClientId();
    updateCopyrightYear();
    revealLastUpdated();
    setupContactOverlay();
    setupMobileInputViewportGuard();
    setupInstallGuides();
    setupProjectGate();
    setupHeroReel();
    setupShowcaseFilter();
    setupProjectBadges();
    setupRecentUpdates();
    setupProjectPlaceGrid();
    if (!window.__PIXIEED_DISABLE_LEGACY_PUBLIC_ROOMS__) {
      setupPublicRoomsLobby();
    }
    disableImageInteractions();
    injectFooterAd();
    scheduleProjectAds();
  }

  const PUBLIC_ROOM_SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
  const PUBLIC_ROOM_SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const PUBLIC_ROOM_SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const PUBLIC_ROOM_LOBBY_CHANNEL = 'pixiedraw-public-rooms-v1';
  const PUBLIC_ROOM_SCAN_TIMEOUT_MS = 5200;
  const PUBLIC_ROOM_MAX_ITEMS = 24;
  const PUBLIC_ROOM_MAX_AGE_MS = 20 * 60 * 1000;
  const RESIDENT_ROOM_PRESETS = Object.freeze([
    Object.freeze({
      projectKey: 'resident-256-main',
      title: '常設ルーム 256x256',
      maxGuests: 10,
      masterName: '待機中'
    })
  ]);
  let publicRoomSupabaseClientPromise = null;

  function updateCopyrightYear() {
    const yearElement = document.getElementById('year');
    if (yearElement) {
      yearElement.textContent = new Date().getFullYear().toString();
    }
  }

  function disableImageInteractions() {
    document.addEventListener('contextmenu', event => {
      if (event.target instanceof HTMLImageElement) {
        event.preventDefault();
      }
    });

    document.addEventListener('dragstart', event => {
      if (event.target instanceof HTMLImageElement) {
        event.preventDefault();
      }
    });
  }

  function setupMobileInputViewportGuard() {
    if (window.__PIXIEED_MOBILE_INPUT_GUARD_BOUND__) {
      return;
    }
    window.__PIXIEED_MOBILE_INPUT_GUARD_BOUND__ = true;

    const body = document.body;
    const root = document.documentElement;
    if (!(body instanceof HTMLElement) || !(root instanceof HTMLElement)) {
      return;
    }

    const styleId = 'pixieed-mobile-input-guard-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        :root{
          --pixieed-keyboard-inset:0px;
        }
        html{
          scroll-padding-bottom:calc(env(safe-area-inset-bottom, 0px) + var(--pixieed-keyboard-inset, 0px) + 20px);
        }
        input,
        textarea,
        select,
        [contenteditable="true"],
        [contenteditable=""],
        [contenteditable]{
          scroll-margin-bottom:calc(var(--pixieed-keyboard-inset, 0px) + 24px);
        }
        body.is-soft-keyboard-open{
          overscroll-behavior-y:contain;
        }
        body.is-soft-keyboard-open .bottom-nav,
        body.is-soft-keyboard-open .ad-footer{
          opacity:0 !important;
          pointer-events:none !important;
          transform:translateY(calc(100% + 20px)) !important;
          transition:opacity 140ms ease, transform 180ms ease;
        }
      `;
      document.head.appendChild(style);
    }

    const isCoarsePointerDevice = () => {
      if (typeof window.matchMedia !== 'function') {
        return false;
      }
      try {
        return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
      } catch (_error) {
        return false;
      }
    };

    const isSoftKeyboardInputTarget = target => {
      if (!(target instanceof Element)) {
        return false;
      }
      if (target instanceof HTMLTextAreaElement) {
        return true;
      }
      if (target instanceof HTMLInputElement) {
        const type = String(target.type || 'text').toLowerCase();
        return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
      }
      return Boolean(target.isContentEditable);
    };

    const getScrollableAncestor = node => {
      let current = node instanceof Element ? node : null;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const canScroll = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 1;
        if (canScroll) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    let baselineViewportHeight = 0;
    let keyboardLikelyOpen = false;
    let alignTimer = null;
    let viewportTickRaf = null;

    const getViewportMetrics = () => {
      const viewport = window.visualViewport;
      const top = Math.round(Number(viewport?.offsetTop) || 0);
      const height = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
      return {
        top,
        height,
        bottom: top + height,
      };
    };

    const updateBaselineViewportHeight = () => {
      if (isSoftKeyboardInputTarget(document.activeElement)) {
        return;
      }
      const viewport = window.visualViewport;
      const candidate = Math.max(
        0,
        Math.round(
          Math.max(
            Number(viewport?.height) || 0,
            Number(window.innerHeight) || 0
          )
        )
      );
      if (candidate > 0) {
        baselineViewportHeight = candidate;
      }
    };

    const computeKeyboardInset = () => {
      const viewport = window.visualViewport;
      const viewportHeight = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
      const baseline = Math.max(
        baselineViewportHeight || 0,
        Math.round(Number(window.innerHeight) || 0),
        viewportHeight
      );
      if (baseline <= 0 || viewportHeight <= 0) {
        return 0;
      }
      return Math.max(0, baseline - viewportHeight);
    };

    const isVirtualKeyboardLikelyOpen = () => {
      const active = document.activeElement;
      if (!isCoarsePointerDevice() || !isSoftKeyboardInputTarget(active)) {
        return false;
      }
      const viewport = window.visualViewport;
      const viewportHeight = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
      const innerHeight = Math.max(0, Math.round(Number(window.innerHeight) || 0));
      const baseline = Math.max(baselineViewportHeight || 0, innerHeight);
      if (viewportHeight <= 0 || innerHeight <= 0 || baseline <= 0) {
        return false;
      }
      const baselineLoss = baseline - viewportHeight;
      const innerLoss = innerHeight - viewportHeight;
      return (
        (baselineLoss > 84 && viewportHeight < baseline * 0.92)
        || (innerLoss > 110 && viewportHeight < innerHeight * 0.9)
      );
    };

    const alignFocusedInput = ({ force = false } = {}) => {
      if (!isCoarsePointerDevice()) {
        return;
      }
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !isSoftKeyboardInputTarget(active)) {
        return;
      }
      if (!force && !keyboardLikelyOpen) {
        return;
      }
      const viewport = getViewportMetrics();
      if (viewport.height <= 0) {
        return;
      }
      const rect = active.getBoundingClientRect();
      if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) {
        return;
      }
      const margin = Math.max(14, Math.min(28, Math.round(viewport.height * 0.08)));
      let deltaY = 0;
      if (rect.bottom > viewport.bottom - margin) {
        deltaY = rect.bottom - (viewport.bottom - margin);
      } else if (rect.top < viewport.top + margin) {
        deltaY = rect.top - (viewport.top + margin);
      }
      if (Math.abs(deltaY) <= 4) {
        return;
      }
      const container = getScrollableAncestor(active);
      if (container instanceof HTMLElement) {
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const nextScrollTop = clamp(container.scrollTop + deltaY, 0, maxScrollTop);
        if (Math.abs(nextScrollTop - container.scrollTop) > 1) {
          container.scrollTop = nextScrollTop;
        }
        return;
      }
      const rootScroll = document.scrollingElement;
      if (rootScroll) {
        const maxScrollTop = Math.max(0, rootScroll.scrollHeight - rootScroll.clientHeight);
        const nextScrollTop = clamp(rootScroll.scrollTop + deltaY, 0, maxScrollTop);
        if (Math.abs(nextScrollTop - rootScroll.scrollTop) > 1) {
          rootScroll.scrollTop = nextScrollTop;
        }
      }
    };

    const syncKeyboardState = () => {
      keyboardLikelyOpen = isVirtualKeyboardLikelyOpen();
      const inset = keyboardLikelyOpen ? computeKeyboardInset() : 0;
      root.style.setProperty('--pixieed-keyboard-inset', `${inset}px`);
      body.classList.toggle('is-soft-keyboard-open', keyboardLikelyOpen);
      if (!keyboardLikelyOpen) {
        updateBaselineViewportHeight();
      }
    };

    const scheduleAlign = ({ delay = 0, force = false } = {}) => {
      if (alignTimer !== null) {
        window.clearTimeout(alignTimer);
        alignTimer = null;
      }
      alignTimer = window.setTimeout(() => {
        alignTimer = null;
        syncKeyboardState();
        alignFocusedInput({ force });
      }, Math.max(0, Math.round(Number(delay) || 0)));
    };

    const handleViewportChange = () => {
      if (viewportTickRaf !== null) {
        window.cancelAnimationFrame(viewportTickRaf);
        viewportTickRaf = null;
      }
      viewportTickRaf = window.requestAnimationFrame(() => {
        viewportTickRaf = null;
        syncKeyboardState();
        if (isSoftKeyboardInputTarget(document.activeElement)) {
          alignFocusedInput();
        }
      });
    };

    document.addEventListener('focusin', event => {
      if (!isCoarsePointerDevice() || !isSoftKeyboardInputTarget(event.target)) {
        return;
      }
      syncKeyboardState();
      scheduleAlign({ delay: 90, force: true });
      window.setTimeout(() => alignFocusedInput({ force: true }), 220);
      window.setTimeout(() => alignFocusedInput({ force: true }), 360);
    }, true);

    document.addEventListener('focusout', event => {
      if (!isCoarsePointerDevice() || !isSoftKeyboardInputTarget(event.target)) {
        return;
      }
      window.setTimeout(() => {
        if (!isSoftKeyboardInputTarget(document.activeElement)) {
          syncKeyboardState();
        }
      }, 180);
    }, true);

    window.addEventListener('resize', handleViewportChange, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange, { passive: true });
      window.visualViewport.addEventListener('scroll', handleViewportChange, { passive: true });
    }
    window.addEventListener('orientationchange', () => {
      baselineViewportHeight = 0;
      window.setTimeout(() => {
        syncKeyboardState();
        alignFocusedInput({ force: true });
      }, 220);
    }, { passive: true });

    updateBaselineViewportHeight();
    syncKeyboardState();
  }

  // 端末ごとの共通クライアントIDを払い出す（全ページ共通）
  function ensureGlobalClientId() {
    const KEY = 'pixieed_client_id';
    if (window.PIXIEED_CLIENT_ID) return window.PIXIEED_CLIENT_ID;
    try {
      const existing = localStorage.getItem(KEY);
      if (existing) {
        window.PIXIEED_CLIENT_ID = existing;
        return existing;
      }
      const id = crypto.randomUUID ? crypto.randomUUID() : `pix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(KEY, id);
      window.PIXIEED_CLIENT_ID = id;
      return id;
    } catch (_) {
      const fallback = `guest-${Math.random().toString(36).slice(2, 8)}`;
      window.PIXIEED_CLIENT_ID = fallback;
      return fallback;
    }
  }

  async function ensurePublicRoomSupabaseClient() {
    if (publicRoomSupabaseClientPromise) {
      return publicRoomSupabaseClientPromise;
    }
    publicRoomSupabaseClientPromise = import(PUBLIC_ROOM_SUPABASE_MODULE_URL)
      .then((module) => {
        if (!module || typeof module.createClient !== 'function') {
          throw new Error('Supabase client unavailable');
        }
        return module.createClient(PUBLIC_ROOM_SUPABASE_URL, PUBLIC_ROOM_SUPABASE_ANON_KEY, {
          auth: { persistSession: false }
        });
      })
      .catch((error) => {
        publicRoomSupabaseClientPromise = null;
        throw error;
      });
    return publicRoomSupabaseClientPromise;
  }

  function normalizePublicRoomKey(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  }

  function normalizePublicRoomTimestamp(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.round(numeric);
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 0;
  }

  function normalizePublicRoomThumbnail(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed)) {
      return '';
    }
    return trimmed;
  }

  function createSolidPublicRoomThumbnailDataUrl(color = '#000000', size = 96) {
    try {
      const edge = Math.max(16, Math.round(Number(size) || 96));
      const canvas = document.createElement('canvas');
      canvas.width = edge;
      canvas.height = edge;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return '';
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, edge, edge);
      return canvas.toDataURL('image/png');
    } catch (_error) {
      return '';
    }
  }

  const RESIDENT_BLACK_THUMBNAIL_DATA_URL = createSolidPublicRoomThumbnailDataUrl('#000000', 96);

  function buildPublicRoomInviteUrl(projectKey, { role = '' } = {}) {
    const key = normalizePublicRoomKey(projectKey);
    if (!key) {
      return 'pixiedraw/index.html';
    }
    const params = new URLSearchParams();
    params.set('multiInvite', '1');
    params.set('multiKey', key);
    params.set('multiAutoJoin', '1');
    if (role === 'master' || role === 'guest' || role === 'spectator') {
      params.set('multiRole', role);
    }
    return `pixiedraw/index.html?${params.toString()}`;
  }

  function mergeResidentRoomCards(liveRooms) {
    const source = Array.isArray(liveRooms) ? liveRooms : [];
    const byKey = new Map();
    source.forEach((room) => {
      if (!room || typeof room !== 'object') {
        return;
      }
      const key = normalizePublicRoomKey(room.projectKey);
      if (!key) {
        return;
      }
      byKey.set(key, room);
    });
    const residentKeySet = new Set(RESIDENT_ROOM_PRESETS.map(preset => preset.projectKey));
    const residentCards = RESIDENT_ROOM_PRESETS.map((preset) => {
      const live = byKey.get(preset.projectKey) || null;
      const maxGuests = Number.isFinite(Number(live?.maxGuests))
        ? Math.max(1, Math.round(Number(live.maxGuests)))
        : preset.maxGuests;
      const guestCount = Number.isFinite(Number(live?.guestCount))
        ? Math.max(0, Math.round(Number(live.guestCount)))
        : 0;
      const spectatorCount = Number.isFinite(Number(live?.spectatorCount))
        ? Math.max(0, Math.round(Number(live.spectatorCount)))
        : 0;
      const participantCount = Number.isFinite(Number(live?.participantCount))
        ? Math.max(0, Math.round(Number(live.participantCount)))
        : guestCount;
      return {
        isResident: true,
        projectKey: preset.projectKey,
        title: preset.title,
        masterName: (typeof live?.masterName === 'string' && live.masterName.trim())
          ? live.masterName.trim().slice(0, 32)
          : preset.masterName,
        maxGuests,
        guestCount,
        spectatorCount,
        participantCount,
        thumbnailDataUrl: normalizePublicRoomThumbnail(live?.thumbnailDataUrl || '') || RESIDENT_BLACK_THUMBNAIL_DATA_URL,
        updatedAt: Number.isFinite(Number(live?.updatedAt)) ? Number(live.updatedAt) : 0,
        inviteUrl: buildPublicRoomInviteUrl(preset.projectKey, { role: 'guest' })
      };
    });
    const liveNonResident = source.filter((room) => {
      const key = normalizePublicRoomKey(room?.projectKey || '');
      return key && !residentKeySet.has(key);
    });
    return residentCards.concat(liveNonResident);
  }

  function formatPublicRoomUpdatedAt(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return '';
    }
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const min = Math.floor(diff / 60000);
    if (min < 1) {
      return '更新: たった今';
    }
    if (min < 60) {
      return `更新: ${min}分前`;
    }
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `更新: ${hh}:${mm}`;
  }

  function extractPublicRoomsFromPresence(presenceState) {
    const now = Date.now();
    const rows = new Map();
    const source = presenceState && typeof presenceState === 'object' ? presenceState : {};
    Object.keys(source).forEach((presenceKey) => {
      const entries = Array.isArray(source[presenceKey]) ? source[presenceKey] : [];
      entries.forEach((entry) => {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const projectKey = normalizePublicRoomKey(entry.projectKey || entry.project_key || '');
        if (!projectKey) {
          return;
        }
        const isPublic = entry.isPublic === true || entry.roomVisibility === 'public' || entry.visibility === 'public';
        if (!isPublic) {
          return;
        }
        const updatedAt = normalizePublicRoomTimestamp(entry.updatedAt || entry.updated_at || entry.sentAt || entry.sent_at) || now;
        if ((now - updatedAt) > PUBLIC_ROOM_MAX_AGE_MS) {
          return;
        }
        const next = {
          projectKey,
          masterName: typeof entry.masterName === 'string' && entry.masterName.trim()
            ? entry.masterName.trim().slice(0, 32)
            : 'マスター',
          maxGuests: Number.isFinite(Number(entry.maxGuests)) ? Math.max(1, Math.round(Number(entry.maxGuests))) : null,
          guestCount: Number.isFinite(Number(entry.guestCount)) ? Math.max(0, Math.round(Number(entry.guestCount))) : null,
          spectatorCount: Number.isFinite(Number(entry.spectatorCount)) ? Math.max(0, Math.round(Number(entry.spectatorCount))) : null,
          participantCount: Number.isFinite(Number(entry.participantCount)) ? Math.max(0, Math.round(Number(entry.participantCount))) : null,
          thumbnailDataUrl: normalizePublicRoomThumbnail(entry.thumbnailDataUrl || entry.thumbnail || entry.thumb || ''),
          updatedAt,
          inviteUrl: buildPublicRoomInviteUrl(projectKey)
        };
        const previous = rows.get(projectKey);
        if (!previous || next.updatedAt >= previous.updatedAt) {
          rows.set(projectKey, next);
        }
      });
    });
    return Array.from(rows.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, PUBLIC_ROOM_MAX_ITEMS);
  }

  async function fetchPublicRoomsSnapshot() {
    const supabase = await ensurePublicRoomSupabaseClient();
    const viewerKey = `home-scan-${ensureGlobalClientId()}-${Date.now()}`;
    const channel = supabase.channel(PUBLIC_ROOM_LOBBY_CHANNEL, {
      config: {
        presence: { key: viewerKey }
      }
    });
    try {
      const presenceState = await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            const fallbackState = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
            resolve(fallbackState || {});
          } catch (error) {
            resolve({});
          }
        }, PUBLIC_ROOM_SCAN_TIMEOUT_MS);
        channel.on('presence', { event: 'sync' }, () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          try {
            const synced = typeof channel.presenceState === 'function' ? channel.presenceState() : {};
            resolve(synced || {});
          } catch (error) {
            resolve({});
          }
        });
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try {
              if (typeof channel.track === 'function') {
                await channel.track({ page: 'home', joinedAt: Date.now() });
              }
            } catch (_error) {
              // Ignore track errors; sync timeout will handle fallback.
            }
            return;
          }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error(`public room subscribe failed: ${status}`));
          }
        });
      });
      return extractPublicRoomsFromPresence(presenceState);
    } finally {
      try {
        if (typeof channel.untrack === 'function') {
          await channel.untrack();
        }
      } catch (_error) {
        // ignore
      }
      try {
        if (typeof channel.unsubscribe === 'function') {
          await channel.unsubscribe();
        }
      } catch (_error) {
        // ignore
      }
    }
  }

  function setupPublicRoomsLobby() {
    const grid = document.getElementById('publicRoomGrid');
    if (!(grid instanceof HTMLElement)) {
      return;
    }
    const refreshButton = document.getElementById('refreshPublicRooms');
    let loading = false;

    const renderMessage = (message, { isError = false } = {}) => {
      grid.innerHTML = '';
      const empty = document.createElement('p');
      empty.className = `public-room-empty${isError ? ' is-error' : ''}`;
      empty.textContent = message;
      grid.appendChild(empty);
    };

    const renderRooms = (rooms) => {
      grid.innerHTML = '';
      if (!Array.isArray(rooms) || !rooms.length) {
        renderMessage('公開中の部屋はありません。');
        return;
      }
      const fragment = document.createDocumentFragment();
      rooms.forEach((room) => {
        const card = document.createElement('a');
        card.className = 'public-room-card';
        card.href = room.inviteUrl;
        const cardTitle = room.title || room.projectKey;
        if (room.isResident) {
          card.setAttribute('aria-label', `${cardTitle} に入室`);
        } else {
          card.setAttribute('aria-label', `${room.masterName} の部屋 (${room.projectKey}) を視聴する`);
        }
        const thumb = document.createElement('div');
        thumb.className = 'public-room-thumb';
        if (room.thumbnailDataUrl) {
          const img = document.createElement('img');
          img.src = room.thumbnailDataUrl;
          img.alt = '';
          img.loading = 'lazy';
          thumb.appendChild(img);
        } else {
          const fallback = document.createElement('span');
          fallback.textContent = 'NO PREVIEW';
          thumb.appendChild(fallback);
        }
        const meta = document.createElement('div');
        meta.className = 'public-room-meta';
        const title = document.createElement('p');
        title.className = 'public-room-title';
        title.textContent = cardTitle;
        const info = document.createElement('p');
        info.className = 'public-room-info';
        const stats = [];
        if (Number.isFinite(room.guestCount) && Number.isFinite(room.maxGuests)) {
          stats.push(`参加 ${room.guestCount}/${room.maxGuests}`);
        }
        if (Number.isFinite(room.spectatorCount)) {
          stats.push(`視聴 ${room.spectatorCount}`);
        } else if (Number.isFinite(room.participantCount)) {
          stats.push(`接続 ${room.participantCount}`);
        }
        info.textContent = `${room.masterName}${stats.length ? ` ・ ${stats.join(' ・ ')}` : ''}`;
        const time = document.createElement('p');
        time.className = 'public-room-time';
        const updatedText = formatPublicRoomUpdatedAt(room.updatedAt) || (room.isResident ? '更新: 待機中' : '');
        time.textContent = updatedText;
        time.hidden = !updatedText;
        meta.append(title, info, time);
        card.append(thumb, meta);
        fragment.appendChild(card);
      });
      grid.appendChild(fragment);
    };

    const load = async ({ manual = false } = {}) => {
      if (loading) {
        return;
      }
      loading = true;
      if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.disabled = true;
      }
      if (manual) {
        renderMessage('公開中の部屋を更新中…');
      }
      try {
        const rooms = await fetchPublicRoomsSnapshot();
        renderRooms(mergeResidentRoomCards(rooms));
      } catch (error) {
        renderRooms(mergeResidentRoomCards([]));
      } finally {
        loading = false;
        if (refreshButton instanceof HTMLButtonElement) {
          refreshButton.disabled = false;
        }
      }
    };

    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.addEventListener('click', () => {
        load({ manual: true });
      });
    }

    load({ manual: false });
  }

  function revealLastUpdated() {
    const targets = Array.from(document.querySelectorAll('[data-last-updated]'));
    if (!targets.length) return;

    const lastModifiedDate = new Date(document.lastModified);
    const isValidDate = !Number.isNaN(lastModifiedDate.getTime());
    if (!isValidDate) {
      targets.forEach(target => target.setAttribute('hidden', ''));
      return;
    }

    let formatted = '';
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      formatted = new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(lastModifiedDate);
    } else {
      const y = lastModifiedDate.getFullYear();
      const m = String(lastModifiedDate.getMonth() + 1).padStart(2, '0');
      const d = String(lastModifiedDate.getDate()).padStart(2, '0');
      formatted = `${y}年${m}月${d}日`;
    }
    const isoDate = lastModifiedDate.toISOString().split('T')[0];

    targets.forEach(target => {
      const valueElement = target.querySelector('.project-update__value');
      if (valueElement instanceof HTMLElement) {
        valueElement.textContent = formatted;
        if (valueElement.tagName === 'TIME') {
          valueElement.setAttribute('datetime', isoDate);
        }
      } else {
        target.textContent = formatted;
      }
      target.removeAttribute('hidden');
    });
  }

  function setupContactOverlay() {
    const overlay = document.getElementById('contactOverlay');
    if (!overlay) return;

    const openers = Array.from(document.querySelectorAll('.js-contact-open'));
    const closeBtn = overlay.querySelector('.js-contact-close');
    let lastFocusedElement = null;

    function openOverlay() {
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.setProperty('overflow', 'hidden');
      if (closeBtn instanceof HTMLElement) {
        closeBtn.focus();
      }
    }

    function closeOverlay() {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.removeProperty('overflow');
      if (lastFocusedElement) {
        lastFocusedElement.focus();
      }
    }

    openers.forEach(btn => btn.addEventListener('click', openOverlay));
    if (closeBtn) {
      closeBtn.addEventListener('click', closeOverlay);
    }

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) {
        event.preventDefault();
        closeOverlay();
      }
    });
  }

  function setupInstallGuides() {
    const toggles = Array.from(document.querySelectorAll('.js-install-toggle'));
    if (!toggles.length) {
      return;
    }

    const SHOW_LABEL = '手順を表示';
    const HIDE_LABEL = '手順を閉じる';

    const setExpandedState = (toggle, content, expanded) => {
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.textContent = expanded ? HIDE_LABEL : SHOW_LABEL;
      content.hidden = !expanded;
    };

    toggles.forEach(toggle => {
      const controlsId = toggle.getAttribute('aria-controls');
      const content = controlsId ? document.getElementById(controlsId) : null;
      if (!(content instanceof HTMLElement)) {
        return;
      }

      const initialExpanded = toggle.getAttribute('aria-expanded') === 'true';
      setExpandedState(toggle, content, initialExpanded);

      toggle.addEventListener('click', () => {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        setExpandedState(toggle, content, !isExpanded);
      });
    });
  }

  function injectFooterAd() {
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;
    if (document.querySelector('.ad-footer')) return; // 既に配置済みなら何もしない

    const STYLE_ID = 'pixieed-ad-footer-style';
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        :root{
          --pixieed-page-gutter:0px;
          --pixieed-layout-max-width:100vw;
          --pixieed-footer-ad-height:clamp(40px, 6.4vw, 52px);
          --pixieed-footer-ad-offset:calc(var(--pixieed-footer-ad-height) + 10px + env(safe-area-inset-bottom, 0px));
          --pixieed-footer-ad-bg:rgba(11,18,36,0.96);
        }
        @media (orientation: landscape){
          :root{
            --pixieed-page-gutter:clamp(18px, 3.6vw, 56px);
            --pixieed-layout-max-width:1160px;
          }
        }
        @media (min-width: 980px) and (orientation: landscape){
          :root{
            --pixieed-page-gutter:clamp(40px, 6vw, 128px);
            --pixieed-layout-max-width:1040px;
            --pixieed-footer-ad-height:44px;
            --pixieed-footer-ad-offset:calc(var(--pixieed-footer-ad-height) + 8px + env(safe-area-inset-bottom, 0px));
          }
        }
        body.has-footer-ad > .page,
        body.has-footer-ad > main{
          width:min(var(--pixieed-layout-max-width), calc(100vw - (var(--pixieed-page-gutter) * 2)));
          max-width:100%;
          margin-left:auto !important;
          margin-right:auto !important;
        }
        body.has-footer-ad > .page > header,
        body.has-footer-ad > .page > .top-nav,
        body.has-footer-ad > .page > [aria-label="top-nav"]{
          width:100vw;
          max-width:100vw !important;
          margin-left:calc(50% - 50vw) !important;
          margin-right:calc(50% - 50vw) !important;
        }
        body.has-footer-ad .bottom-nav{
          bottom:var(--pixieed-footer-ad-offset) !important;
          height:60px !important;
          padding:6px max(10px, env(safe-area-inset-right, 0px)) calc(6px + env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px)) !important;
        }
        body.has-footer-ad .bottom-nav__item{
          padding:4px 0 !important;
          gap:3px !important;
          font-size:11px !important;
        }
        body.has-footer-ad .bottom-nav__item .icon{
          width:20px;
          height:20px;
          font-size:18px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
        }
        .ad-footer{
          position:fixed;
          left:0;
          right:0;
          bottom:0;
          z-index:70;
          width:auto !important;
          max-width:none !important;
          padding:8px env(safe-area-inset-right, 0px) calc(8px + env(safe-area-inset-bottom, 0px)) env(safe-area-inset-left, 0px);
          box-sizing:border-box;
          display:flex !important;
          justify-content:center;
          align-items:center;
          margin:0 !important;
          margin-left:0 !important;
          margin-right:0 !important;
          overflow:visible !important;
          background:var(--pixieed-footer-ad-bg);
          border-top:1px solid rgba(255,255,255,0.08);
          backdrop-filter:blur(8px);
          min-height:var(--pixieed-footer-ad-height);
        }
        .ad-footer ins{
          display:block !important;
          width:100% !important;
          max-width:none !important;
          min-height:var(--pixieed-footer-ad-height);
          overflow:hidden;
          background:var(--pixieed-footer-ad-bg) !important;
        }
        .ad-footer ins iframe{
          background:var(--pixieed-footer-ad-bg) !important;
        }
        .ad-footer ins.adsbygoogle[data-ad-status="unfilled"]{
          background:var(--pixieed-footer-ad-bg) !important;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.classList.add('has-footer-ad');
    if (!document.body.dataset.footerAdPaddingApplied) {
      const currentPadding = window.getComputedStyle(document.body).paddingBottom || '0px';
      document.body.style.paddingBottom = `calc(${currentPadding} + var(--pixieed-footer-ad-offset))`;
      document.body.dataset.footerAdPaddingApplied = 'true';
    }

    const footer = document.createElement('div');
    footer.className = 'ad-footer';
    footer.setAttribute('aria-label', '広告');
    footer.innerHTML = `
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-9801602250480253"
           data-ad-slot="rotate"></ins>
    `;
    document.body.appendChild(footer);

    const adsScriptSelector = 'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]';
    if (!document.querySelector(adsScriptSelector)) {
      const adScript = document.createElement('script');
      adScript.async = true;
      adScript.crossOrigin = 'anonymous';
      adScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
      document.head.appendChild(adScript);
    }

    if (window.pixieedObserveAds) {
      window.pixieedObserveAds();
      return;
    }
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch (_error) {
      // ignore
    }
  }

  function ensureProjectAds() {
    if (!document.body || !document.body.classList.contains('project-page')) return;
    if (window.pixieedObserveAds) {
      window.pixieedObserveAds();
    }
  }

  function scheduleProjectAds() {
    if (!document.body || !document.body.classList.contains('project-page')) return;
    ensureProjectAds();
    window.setTimeout(ensureProjectAds, 1200);
    window.setTimeout(ensureProjectAds, 3200);
    window.addEventListener('load', () => {
      ensureProjectAds();
      window.setTimeout(ensureProjectAds, 1200);
    }, { once: true });
  }

  function setupRecentUpdates() {
    const updates = [
      {
        title: 'PiXiEEDraw 左レーンUIを統合調整',
        summary: 'ツール/カラーの統合運用、コンパクト時の1列+フライアウト、ボタンサイズ統一（44px）を反映しました。',
        date: '2026-02-25',
        tag: 'Tool',
        href: 'pixiedraw/index.html'
      },
      {
        title: 'ヒーローカードを矢印＆ドット付きカルーセル化',
        summary: '3枚並びのヒーローを左右ナビとドットで操作できるようにし、導線を整理しました。',
        date: '2025-11-18',
        tag: 'UI/UX',
        href: '#home-hero'
      },
      {
        title: 'メールアドレスをGmailに統一',
        summary: '全ページの連絡先を pixieed.arta@gmail.com に更新し、JSON-LDにも反映しました。',
        date: '2025-11-18',
        tag: 'Info',
        href: '#contact'
      },
      {
        title: 'ドット絵・プロジェクトに新着バッジ追加',
        summary: '未閲覧のドット絵サムネとプロジェクトカードに赤点を表示し、ヘッダーにも未読を連動。',
        date: '2025-11-17',
        tag: 'Feature',
        href: '#dot-gallery'
      },
      {
        title: 'サイトマップを追加',
        summary: 'sitemap.xmlを配置し、サーチコンソール送信用の準備を完了しました。',
        date: '2025-11-17',
        tag: 'SEO',
        href: '/sitemap.xml'
      }
    ];

    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const parsed = updates
      .map(entry => ({
        ...entry,
        timestamp: Date.parse(entry.date)
      }))
      .filter(entry => Number.isFinite(entry.timestamp));

    const recent = parsed.filter(entry => now - entry.timestamp <= ONE_WEEK && now >= entry.timestamp);
    const list = (recent.length ? recent : parsed).sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);

    // expose for hero cards
    window.__PIXIEED_RECENT_UPDATES = list;

    const container = document.getElementById('recentUpdates');
    if (!container) {
      return;
    }

    container.innerHTML = '';
    if (!list.length) {
      container.innerHTML = '<p class="news-item">最近の更新情報を準備中です。</p>';
      return;
    }

    // if someday revived, keep renderer:
    const fragment = document.createDocumentFragment();
    list.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'update-card';

      if (entry.tag) {
        const tag = document.createElement('span');
        tag.className = 'update-card__tag';
        tag.textContent = entry.tag;
        card.appendChild(tag);
      }

      const title = document.createElement('h3');
      title.textContent = entry.title;
      card.appendChild(title);

      const summary = document.createElement('p');
      summary.textContent = entry.summary;
      card.appendChild(summary);

      if (entry.date) {
        const time = document.createElement('time');
        time.dateTime = entry.date;
        time.textContent = formatDate(entry.timestamp);
        card.appendChild(time);
      }

      if (entry.href) {
        const link = document.createElement('a');
        link.href = entry.href;
        link.textContent = '詳しく見る';
        card.appendChild(link);
      }

      fragment.appendChild(card);
    });

    container.appendChild(fragment);

    function formatDate(timestamp) {
      if (!Number.isFinite(timestamp)) return '';
      const d = new Date(timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}/${m}/${day}`;
    }
  }

  function setupProjectPlaceGrid() {
    const container = document.querySelector('[data-project-place]');
    if (!container) return;
    const canvas = container.querySelector('.project-place__canvas');
    const fallback = container.querySelector('.project-place__fallback');
    const source = container.querySelector('.project-place__source');
    if (!(canvas instanceof HTMLCanvasElement) || !(source instanceof HTMLElement)) {
      return;
    }

    const items = Array.from(source.querySelectorAll('[data-image]')).map((node) => ({
      title: node.getAttribute('data-title') || '',
      image: node.getAttribute('data-image') || '',
      updated: node.getAttribute('data-updated') || '',
      update: node.getAttribute('data-update') || '',
      readme: node.getAttribute('data-readme') || ''
    })).filter(item => item.image);

    if (!items.length) return;

    const formatDate = (timestamp, fallback) => {
      if (!Number.isFinite(timestamp)) return fallback || '';
      const d = new Date(timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}/${m}/${day}`;
    };

    const parseReadmeUpdate = (text) => {
      if (!text) return null;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        const match = trimmed.match(/^[-*]\s+(\d{4}-\d{2}-\d{2})\s*[:\\-–]\\s*(.+)$/);
        if (match) {
          return {
            updated: match[1],
            update: match[2].trim()
          };
        }
      }
      return null;
    };

    const canFetch = typeof window.fetch === 'function';
    const loadReadme = (item) => {
      if (!item.readme || !canFetch) return Promise.resolve(item);
      return fetch(item.readme)
        .then(response => (response.ok ? response.text() : Promise.reject(new Error('readme fetch failed'))))
        .then(text => {
          const parsed = parseReadmeUpdate(text);
          if (!parsed) return item;
          return {
            ...item,
            updated: parsed.updated || item.updated,
            update: parsed.update || item.update
          };
        })
        .catch(() => item);
    };

    Promise.all(items.map(loadReadme)).then(loadedItems => {
      const sorted = loadedItems
        .map(item => {
          const timestamp = Date.parse(item.updated);
          return {
            ...item,
            timestamp: Number.isFinite(timestamp) ? timestamp : 0
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      const updatesList = document.getElementById('projectPlaceUpdates');
      if (updatesList) {
        updatesList.innerHTML = '';
        const withUpdates = sorted.filter(item => item.update);
        if (!withUpdates.length) {
          const emptyItem = document.createElement('li');
          emptyItem.className = 'project-place__update project-place__update--empty';
          emptyItem.textContent = '更新内容は準備中です。';
          updatesList.appendChild(emptyItem);
        } else {
          withUpdates.slice(0, 5).forEach(item => {
            const row = document.createElement('li');
            row.className = 'project-place__update';

            const time = document.createElement('time');
            if (item.updated) {
              time.dateTime = item.updated;
            }
            const formatted = formatDate(item.timestamp, item.updated);
            time.textContent = formatted || item.updated || '';

            const title = document.createElement('strong');
            title.textContent = item.title || 'プロジェクト';

            const desc = document.createElement('span');
            desc.textContent = item.update;

            row.append(time, title, desc);
            updatesList.appendChild(row);
          });
        }
      }

      const columns = Number(container.getAttribute('data-columns') || '3') || 3;
      const tileWidth = Number(container.getAttribute('data-tile-width') || '420') || 420;
      const tileHeight = Number(container.getAttribute('data-tile-height') || '280') || 280;
      const rows = Math.ceil(sorted.length / columns);
      const width = columns * tileWidth;
      const height = rows * tileHeight;

      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#0b1224';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in context) {
        context.imageSmoothingQuality = 'high';
      }

      const entries = sorted.map((item, index) => ({ ...item, index }));
      const loadImage = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`failed to load ${src}`));
        img.src = src;
      });

      Promise.allSettled(entries.map(entry => (
        loadImage(entry.image).then(img => ({ entry, img }))
      ))).then(results => {
        let hasDrawn = false;
        results.forEach(result => {
          if (result.status !== 'fulfilled') return;
          const { entry, img } = result.value;
          const x = (entry.index % columns) * tileWidth;
          const y = Math.floor(entry.index / columns) * tileHeight;
          context.drawImage(img, x, y, tileWidth, tileHeight);
          hasDrawn = true;
        });
        if (hasDrawn) {
          container.classList.add('is-ready');
          if (fallback instanceof HTMLElement) {
            fallback.hidden = true;
          }
        }
      });
    });
  }

  function getRecentUpdatesData() {
    const data = Array.isArray(window.__PIXIEED_RECENT_UPDATES) ? window.__PIXIEED_RECENT_UPDATES : [];
    return data;
  }

  function setupProjectBadges() {
    const cards = Array.from(document.querySelectorAll('.ogp-card:not(.ogp-card--ad)'));
    if (!cards.length) return;
    const navLink = document.querySelector('.portfolio-nav a[href="#projects"]');
    const STORAGE_KEY = 'pixieed:projectsSeen';
    let seenProjects = loadSeen();

    cards.forEach((card, index) => {
      const projectId = getProjectId(card, index);
      card.dataset.projectId = projectId;
      applyState(card, projectId);
      card.addEventListener('click', () => {
        markSeen(projectId);
        applyState(card, projectId);
        updateNav();
      });
    });

    updateNav();

    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY) return;
      seenProjects = loadSeen();
      cards.forEach((card, index) => applyState(card, getProjectId(card, index)));
      updateNav();
    });

    function getProjectId(card, index) {
      const href = card?.getAttribute('href') || '';
      if (href) return `href:${href}`;
      if (Number.isFinite(index)) return `project-${index + 1}`;
      return '';
    }

    function loadSeen() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (_error) {
        return {};
      }
    }

    function persistSeen() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seenProjects || {}));
      } catch (_error) {
        // ignore
      }
    }

    function isSeen(id) {
      if (!id || !seenProjects) return false;
      return Boolean(seenProjects[id]);
    }

    function markSeen(id) {
      if (!id || isSeen(id)) return;
      seenProjects = { ...(seenProjects || {}), [id]: true };
      persistSeen();
    }

    function applyState(card, id) {
      if (!card) return;
      if (id && !isSeen(id)) {
        card.setAttribute('data-unseen', 'true');
      } else {
        card.removeAttribute('data-unseen');
      }
    }

    function updateNav() {
      if (!navLink) return;
      const hasUnseen = cards.some((card, index) => !isSeen(getProjectId(card, index)));
      if (hasUnseen) {
        navLink.setAttribute('data-unseen', 'true');
      } else {
        navLink.removeAttribute('data-unseen');
      }
    }
  }

  function setupProjectGate() {
    const overlay = document.getElementById('projectGateOverlay');
    const projectLinkSelector = 'a[data-project-gate="project"]';
    if (!overlay || !document.querySelector(projectLinkSelector)) {
      return;
    }

    const AUTH_KEY = 'pixieed:project-pass';
    const PASS_HASH = '8752f24ec0a8ac50ef732fbaa26f2df1cea32e477b8d4ad4160748155ed23054';
    const PASS_FALLBACK = '00169785';

    const form = overlay.querySelector('#projectGateForm');
    const input = overlay.querySelector('#projectGateInput');
    const errorLabel = overlay.querySelector('#projectGateError');
    const closeBtn = overlay.querySelector('.project-gate__close');
    const cancelBtn = overlay.querySelector('.project-gate__cancel');
    let pendingHref = null;
    let lastFocusedElement = null;

    const isAuthorized = () => sessionStorage.getItem(AUTH_KEY) === '1';

    function openOverlay(targetHref) {
      pendingHref = targetHref || null;
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.setProperty('overflow', 'hidden');
      if (errorLabel) {
        errorLabel.hidden = true;
      }
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 0);
      }
    }

    function closeOverlay() {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.removeProperty('overflow');
      if (lastFocusedElement) {
        lastFocusedElement.focus();
      }
      pendingHref = null;
    }

    function toHex(buffer) {
      return Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    function digest(code) {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        try {
          const encoder = new TextEncoder();
          return window.crypto.subtle.digest('SHA-256', encoder.encode(code))
            .then(toHex)
            .catch(() => null);
        } catch (error) {
          return Promise.resolve(null);
        }
      }
      return Promise.resolve(null);
    }

    function simpleHash(value) {
      let acc = 0;
      for (let i = 0; i < value.length; i += 1) {
        acc = ((acc * 31) + value.charCodeAt(i)) >>> 0;
      }
      return acc.toString(16).padStart(8, '0');
    }

    function verify(code) {
      if (!code) {
        return Promise.resolve(false);
      }
      return digest(code).then(hash => {
        if (hash === PASS_HASH) {
          return true;
        }
        return simpleHash(code) === PASS_FALLBACK;
      });
    }

    function showError(message) {
      if (errorLabel) {
        errorLabel.textContent = message;
        errorLabel.hidden = false;
      }
      if (input) {
        input.focus();
        input.select();
      }
    }

    function markAuthorized() {
      sessionStorage.setItem(AUTH_KEY, '1');
    }

    function handleSubmit() {
      if (!input) {
        return;
      }
      const code = input.value.trim();
      verify(code).then((ok) => {
        if (!ok) {
          showError('コードが一致しません。');
          return;
        }
        markAuthorized();
        closeOverlay();
        if (pendingHref) {
          window.location.href = pendingHref;
        }
      });
    }

    if (!isAuthorized()) {
      document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest(projectLinkSelector) : null;
        if (!target) {
          return;
        }
        if (isAuthorized()) {
          return;
        }
        const href = target instanceof HTMLAnchorElement ? target.href : target.getAttribute('href');
        event.preventDefault();
        openOverlay(href);
      }, true);
    }

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleSubmit();
      });
    }

    const dismissors = [closeBtn, cancelBtn];
    dismissors.forEach((btn) => {
      if (btn) {
        btn.addEventListener('click', () => {
          closeOverlay();
        });
      }
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (overlay.hidden) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay();
      } else if (event.key === 'Enter' && document.activeElement === input) {
        event.preventDefault();
        handleSubmit();
      }
    });
  }

  function setupHeroReel() {
    const heroReel = document.querySelector('.hero-reel');
    const heroTrack = heroReel ? heroReel.querySelector('.hero-reel__track') : null;
    if (!heroReel || !heroTrack) return;

    const items = Array.from(heroTrack.children);
    if (!items.length) return;

    items.forEach(item => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      heroTrack.appendChild(clone);
    });

    let loopWidth = heroTrack.scrollWidth / 2;
    let offset = 0;
    let isPaused = false;
    const speed = 0.4;
    let last = performance.now();

    const recalcLoop = () => {
      loopWidth = heroTrack.scrollWidth / 2;
    };

    window.addEventListener('resize', recalcLoop);
    heroReel.addEventListener('mouseenter', () => { isPaused = true; });
    heroReel.addEventListener('mouseleave', () => { isPaused = false; });
    heroReel.addEventListener('focusin', () => { isPaused = true; });
    heroReel.addEventListener('focusout', () => { isPaused = false; });

    function tick(now) {
      const delta = now - last;
      last = now;
      if (!isPaused) {
        offset += (delta * speed) / 16.67;
        if (offset >= loopWidth) {
          offset -= loopWidth;
        }
        heroTrack.style.transform = `translateX(${-offset}px)`;
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function setupShowcaseFilter() {
    const searchInput = document.getElementById('showcaseSearch');
    const categoryChips = Array.from(document.querySelectorAll('.showcase-chip'));
    const showcaseCards = Array.from(document.querySelectorAll('.display-wall .display'));
    if (!searchInput || !categoryChips.length || !showcaseCards.length) {
      return;
    }

    let activeCategory = 'all';
    let searchTerm = '';

    function matchesCategory(type) {
      if (activeCategory === 'all') return true;
      return type === activeCategory;
    }

    function matchesSearch(card) {
      if (!searchTerm) return true;
      const haystack = `${card.dataset.title || ''} ${card.dataset.description || ''}`.toLowerCase();
      return haystack.includes(searchTerm);
    }

    function updateDifficultyBadge(card) {
      const difficulty = Number(card.dataset.difficulty || '0');
      const scale = card.querySelectorAll('.display__difficulty-scale span');
      const value = card.querySelector('.display__difficulty-value');
      scale.forEach((dot, index) => {
        dot.classList.toggle('is-filled', index < difficulty);
      });
      if (value) {
        value.textContent = difficulty.toString();
      }
    }

    function applyFilter() {
      showcaseCards.forEach(card => {
        const type = card.dataset.type || 'other';
        const visible = matchesCategory(type) && matchesSearch(card);
        updateDifficultyBadge(card);
        card.style.display = visible ? '' : 'none';
      });
    }

    categoryChips.forEach(chip => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.category || 'all';
        categoryChips.forEach(btn => {
          const isActive = btn === chip;
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        applyFilter();
      });
    });

    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      applyFilter();
    });

    applyFilter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
