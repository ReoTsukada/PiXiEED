(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectCommentUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function normalizeMultiCommentText(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.slice(0, MULTI_COMMENT_MAX_LENGTH);
  }

  function makeMultiCommentId({ clientId = '', sentAt = 0, text = '' } = {}) {
    const safeClientId = typeof clientId === 'string' ? clientId.trim() : '';
    const safeTime = Number.isFinite(Number(sentAt)) ? Math.max(0, Math.round(Number(sentAt))) : 0;
    const safeText = normalizeMultiCommentText(text);
    return `${safeClientId}:${safeTime}:${safeText}`;
  }

  function resolveMultiCommentAuthorName(clientId, fallbackName = '') {
    const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (normalizedClientId && normalizedClientId === multiState.clientId) {
      return normalizeMultiParticipantName(getLocalMultiParticipantName(), DEFAULT_MULTI_PARTICIPANT_NAME);
    }
    const participant = normalizedClientId && multiState.participants instanceof Map
      ? multiState.participants.get(normalizedClientId)
      : null;
    if (participant?.name) {
      return normalizeMultiParticipantName(participant.name, DEFAULT_MULTI_PARTICIPANT_NAME);
    }
    const assignment = normalizedClientId ? getMultiAssignment(normalizedClientId) : null;
    if (assignment?.name) {
      return normalizeMultiParticipantName(assignment.name, DEFAULT_MULTI_PARTICIPANT_NAME);
    }
    return normalizeMultiParticipantName(fallbackName, DEFAULT_MULTI_PARTICIPANT_NAME);
  }

  function resolveMultiCommentProjectKey(projectKey = '') {
    return normalizeMultiProjectKey(
      projectKey
      || activeSharedProjectKey
      || multiState.projectKey
      || resolveSharedProjectKeyForCurrentState()
    );
  }

  function getMultiCommentStorageKey(projectKey = '') {
    const normalizedProjectKey = resolveMultiCommentProjectKey(projectKey);
    return normalizedProjectKey ? getScopedStorageKey(`${MULTI_COMMENT_STORAGE_KEY}:${normalizedProjectKey}`) : '';
  }

  function serializeMultiCommentEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const text = normalizeMultiCommentText(entry.text);
    if (!text) {
      return null;
    }
    return {
      clientId: typeof entry.clientId === 'string' ? entry.clientId.trim() : '',
      role: normalizeMultiRole(entry.role, 'guest'),
      name: normalizeMultiParticipantName(entry.name, DEFAULT_MULTI_PARTICIPANT_NAME),
      avatarId: normalizePixieedAvatarId(entry.avatarId || entry.avatar || ''),
      text,
      sentAt: Number.isFinite(Number(entry.sentAt)) ? Math.round(Number(entry.sentAt)) : Date.now(),
    };
  }

  function persistMultiCommentsForProject(projectKey = '') {
    if (!canUseSessionStorage) {
      return;
    }
    const storageKey = getMultiCommentStorageKey(projectKey);
    if (!storageKey) {
      return;
    }
    try {
      const entries = Array.isArray(multiState.comments)
        ? multiState.comments.slice(-MULTI_COMMENT_MAX_ITEMS).map(serializeMultiCommentEntry).filter(Boolean)
        : [];
      if (entries.length) {
        window.localStorage.setItem(storageKey, JSON.stringify(entries));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch (error) {
      // Ignore storage errors.
    }
  }

  function restoreMultiCommentsForProject(projectKey = '') {
    if (!canUseSessionStorage) {
      return false;
    }
    const storageKey = getMultiCommentStorageKey(projectKey);
    if (!storageKey) {
      return false;
    }
    let entries = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      entries = Array.isArray(parsed) ? parsed.slice(-MULTI_COMMENT_MAX_ITEMS) : [];
    } catch (error) {
      entries = [];
    }
    multiState.comments = [];
    multiState.commentIds = new Set();
    entries.forEach(entry => {
      appendMultiCommentEntry(entry, {
        persist: false,
        notify: false,
        spawn: false,
      });
    });
    renderMultiComments();
    return true;
  }

  function clearMultiComments({ persist = true } = {}) {
    multiState.comments = [];
    multiState.commentIds = new Set();
    if (persist) {
      persistMultiCommentsForProject();
    }
    renderMultiComments();
  }

  function appendMultiCommentEntry(entry, options = {}) {
    const shouldPersist = options.persist !== false;
    const shouldNotify = options.notify !== false;
    const shouldSpawn = options.spawn !== false;
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const commentText = normalizeMultiCommentText(entry.text);
    if (!commentText) {
      return false;
    }
    const clientId = typeof entry.clientId === 'string' ? entry.clientId.trim() : '';
    const sentAt = Number.isFinite(Number(entry.sentAt)) ? Math.round(Number(entry.sentAt)) : Date.now();
    const id = makeMultiCommentId({ clientId, sentAt, text: commentText });
    if (!id) {
      return false;
    }
    if (!(multiState.commentIds instanceof Set)) {
      multiState.commentIds = new Set();
    }
    if (multiState.commentIds.has(id)) {
      return false;
    }
    const role = normalizeMultiRole(entry.role, 'guest');
    const authorName = resolveMultiCommentAuthorName(clientId, entry.name);
    const avatarId = normalizePixieedAvatarId(entry.avatarId || entry.avatar || '');
    const next = {
      id,
      clientId,
      role,
      name: authorName,
      avatarId,
      avatarSrc: resolvePixieedAvatarSrcFromId(avatarId),
      text: commentText,
      sentAt,
    };
    const isSelfComment = Boolean(clientId) && clientId === multiState.clientId;
    if (!Array.isArray(multiState.comments)) {
      multiState.comments = [];
    }
    multiState.comments.push(next);
    multiState.commentIds.add(id);
    // show as danmaku (floating comment) when enabled
    try {
      if (shouldSpawn && state.danmakuEnabled && typeof spawnDanmaku === 'function') {
        spawnDanmaku(next);
      }
    } catch (e) {
      /* ignore danmaku errors */
    }
    // If the client has danmaku disabled, surface a red-dot notification on the multi tab
    try {
      const hasDanmaku = Boolean(state.danmakuEnabled);
      const multiPanelVisible = isMultiFlowPanelVisible();
      const commentsTabVisible = isMultiCommentsTabVisible();
      if (shouldNotify && !hasDanmaku && !isSelfComment) {
        if (!multiPanelVisible) {
          setMultiTabNotification(true);
        }
        if (multiPanelVisible && !commentsTabVisible) {
          setMultiCommentTabNotification(true);
        }
      }
    } catch (e) {
      /* ignore notification errors */
    }
    if (multiState.comments.length > MULTI_COMMENT_MAX_ITEMS) {
      const overflow = multiState.comments.length - MULTI_COMMENT_MAX_ITEMS;
      const removed = multiState.comments.splice(0, overflow);
      removed.forEach(item => {
        if (item && item.id) {
          multiState.commentIds.delete(item.id);
        }
      });
    }
    if (shouldPersist) {
      persistMultiCommentsForProject();
    }
    return true;
  }

  function formatMultiCommentTime(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function renderMultiComments() {
    const root = dom.controls.multiCommentList;
    if (!(root instanceof HTMLElement)) {
      return;
    }
    root.innerHTML = '';
    const entries = Array.isArray(multiState.comments) ? multiState.comments : [];
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'help-text multi-comment-empty';
      empty.textContent = localizeText('コメントはまだありません。', 'No comments yet.');
      root.appendChild(empty);
      if (isMultiCommentsTabVisible()) {
        try {
          setMultiCommentTabNotification(false);
          setMultiTabNotification(false);
        } catch (e) {
          /* ignore */
        }
      }
      return;
    }
    const list = document.createElement('ul');
    list.className = 'multi-comment-thread';
    entries.slice().reverse().forEach(entry => {
      const item = document.createElement('li');
      item.className = 'multi-comment-item';
      const entryClientId = typeof entry.clientId === 'string' ? entry.clientId.trim() : '';
      const isSelf = Boolean(entryClientId) && entryClientId === multiState.clientId;
      if (isSelf) {
        item.classList.add('is-self');
      }
      const avatarSrc = typeof entry.avatarSrc === 'string' && entry.avatarSrc.trim()
        ? entry.avatarSrc.trim()
        : resolvePixieedAvatarSrcFromId(entry.avatarId);
      const avatar = document.createElement('img');
      avatar.className = 'multi-comment-avatar';
      avatar.src = avatarSrc;
      avatar.alt = '';
      avatar.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      body.className = 'multi-comment-body';
      const header = document.createElement('div');
      header.className = 'multi-comment-header';
      const author = document.createElement('span');
      author.className = 'multi-comment-author';
      if (isSelf) {
        author.classList.add('is-self');
      }
      const canSelectTarget = isMultiMasterMode()
        && Boolean(entryClientId)
        && entryClientId !== multiState.clientId;
      if (canSelectTarget) {
        author.classList.add('is-target-selectable');
        author.tabIndex = 0;
        author.setAttribute('role', 'button');
        author.setAttribute('aria-label', localizeText('操作対象に設定', 'Set as operation target'));
        const selectTarget = () => {
          selectMultiControlTarget(entryClientId);
        };
        author.addEventListener('click', event => {
          event.preventDefault();
          selectTarget();
        });
        author.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }
          event.preventDefault();
          selectTarget();
        });
      }
      author.textContent = normalizeMultiParticipantName(entry.name, DEFAULT_MULTI_PARTICIPANT_NAME);
      const time = document.createElement('span');
      time.className = 'multi-comment-time';
      time.textContent = formatMultiCommentTime(entry.sentAt);
      const text = document.createElement('p');
      text.className = 'multi-comment-text';
      text.textContent = entry.text;
      header.append(author, time);
      body.append(header, text);
      item.append(avatar, body);
      list.appendChild(item);
    });
    root.appendChild(list);
    root.scrollTop = 0;
    if (isMultiCommentsTabVisible()) {
      try {
        setMultiCommentTabNotification(false);
        setMultiTabNotification(false);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function findMultiCommentPanelScrollTarget(deltaY) {
    const root = dom.controls.multiCommentList;
    if (!(root instanceof HTMLElement)) {
      return null;
    }
    const directAncestor = getScrollableAncestorForDeltaY(root.parentElement, deltaY);
    if (directAncestor instanceof HTMLElement) {
      return directAncestor;
    }
    const panelBody = root.closest('.panel-section__body');
    if (canScrollElementByDeltaY(panelBody, deltaY)) {
      return panelBody;
    }
    const panel = root.closest('.panel-section, .mobile-panel, .mobile-panels');
    if (canScrollElementByDeltaY(panel, deltaY)) {
      return panel;
    }
    return null;
  }

  function handOffMultiCommentScroll(deltaY) {
    const root = dom.controls.multiCommentList;
    if (!(root instanceof HTMLElement) || !Number.isFinite(deltaY) || Math.abs(deltaY) < 0.5) {
      return false;
    }
    if (canScrollElementByDeltaY(root, deltaY)) {
      return false;
    }
    const target = findMultiCommentPanelScrollTarget(deltaY);
    return scrollElementByDeltaY(target, deltaY);
  }

  function bindMultiCommentScrollHandoff() {
    const root = dom.controls.multiCommentList;
    if (!(root instanceof HTMLElement) || root.dataset.scrollHandoffBound === 'true') {
      return;
    }
    root.dataset.scrollHandoffBound = 'true';
    let lastTouchY = null;
    root.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) {
        return;
      }
      const deltaY = normalizeWheelDeltaY(event);
      if (!handOffMultiCommentScroll(deltaY)) {
        return;
      }
      event.preventDefault();
    }, { passive: false });
    root.addEventListener('touchstart', event => {
      if (!event.touches || event.touches.length !== 1) {
        lastTouchY = null;
        return;
      }
      const touch = event.touches[0];
      lastTouchY = touch ? touch.clientY : null;
    }, { passive: true });
    root.addEventListener('touchmove', event => {
      if (!event.touches || event.touches.length !== 1 || !Number.isFinite(lastTouchY)) {
        lastTouchY = null;
        return;
      }
      const touch = event.touches[0];
      const currentY = touch ? touch.clientY : null;
      if (!Number.isFinite(currentY)) {
        lastTouchY = null;
        return;
      }
      const deltaY = lastTouchY - currentY;
      if (handOffMultiCommentScroll(deltaY)) {
        event.preventDefault();
      }
      lastTouchY = currentY;
    }, { passive: false });
    const clearTouchState = () => {
      lastTouchY = null;
    };
    root.addEventListener('touchend', clearTouchState, { passive: true });
    root.addEventListener('touchcancel', clearTouchState, { passive: true });
  }

  function syncDanmakuControls() {
    const enabled = Boolean(state.danmakuEnabled);
    if (dom.controls.multiDanmakuToggle instanceof HTMLInputElement) {
      dom.controls.multiDanmakuToggle.checked = enabled;
    }
    if (dom.controls.settingDanmakuToggle instanceof HTMLInputElement) {
      dom.controls.settingDanmakuToggle.checked = enabled;
    }
    // Danmaku toggles are client-controlled; ensure inputs are enabled for users
    if (dom.controls.multiDanmakuToggle instanceof HTMLInputElement) {
      dom.controls.multiDanmakuToggle.disabled = false;
    }
    if (dom.controls.settingDanmakuToggle instanceof HTMLInputElement) {
      dom.controls.settingDanmakuToggle.disabled = false;
    }
  }

  function setDanmakuEnabled(enabled, { persist = true } = {}) {
    const next = Boolean(enabled);
    if (state.danmakuEnabled === next) {
      syncDanmakuControls();
      return;
    }
    state.danmakuEnabled = next;
    syncDanmakuControls();
    if (persist) scheduleSessionPersist({ includeSnapshots: false });
  }

  function spawnDanmaku(entry) {
    try {
      if (!state.danmakuEnabled) return;
      const overlay = dom.controls.danmakuOverlay;
      if (!(overlay instanceof HTMLElement)) return;
      // limit items
      if (overlay.children.length >= DANMAKU_MAX_ITEMS) return;
      const text = String(entry && entry.text ? entry.text : '').trim();
      if (!text) return;
      const item = document.createElement('span');
      item.className = 'danmaku-item';
      // size randomness for depth illusion
      const size = Math.round(DANMAKU_MIN_SIZE + Math.random() * (DANMAKU_MAX_SIZE - DANMAKU_MIN_SIZE));
      item.style.fontSize = `${size}px`;
      // vertical position: avoid overlapping edges
      const overlayHeight = Math.max(32, overlay.clientHeight || 200);
      const top = Math.floor(Math.random() * Math.max(1, overlayHeight - size - 8));
      item.style.top = `${top}px`;
      item.textContent = text;
      // initial transform at right outside
      item.style.transform = `translateX(${overlay.clientWidth}px)`;
      overlay.appendChild(item);
      // force layout
      // eslint-disable-next-line no-unused-expressions
      item.offsetWidth;
      // compute travel distance and duration: larger text -> faster (depth effect)
      const elWidth = item.offsetWidth || 100;
      const distance = (overlay.clientWidth || 800) + elWidth + 40;
      const sizeNorm = (size - DANMAKU_MIN_SIZE) / (DANMAKU_MAX_SIZE - DANMAKU_MIN_SIZE);
      const speed = DANMAKU_MIN_SPEED + sizeNorm * (DANMAKU_MAX_SPEED - DANMAKU_MIN_SPEED);
      const duration = Math.max(0.5, distance / Math.max(1, speed));
      item.style.transitionDuration = `${duration}s`;
      // start animation: translate left by distance
      window.requestAnimationFrame(() => {
        item.style.transform = `translateX(-${distance}px)`;
        item.style.opacity = '1';
      });
      // cleanup after animation
      const cleanup = () => {
        if (item && item.parentNode === overlay) overlay.removeChild(item);
      };
      // remove after duration + small buffer
      window.setTimeout(cleanup, Math.ceil(duration * 1000) + 300);
    } catch (err) {
      // don't let danmaku errors break app
      console.warn('danmaku spawn failed', err);
    }
  }

  function sendSharedProjectCommentBroadcast(payload) {
    if (!activeSharedProjectChannel || typeof activeSharedProjectChannel.send !== 'function') {
      ensureActiveSharedProjectRealtimeChannel().catch(() => {});
      return Promise.resolve(false);
    }
    return activeSharedProjectChannel.send({
      type: 'broadcast',
      event: SHARED_PROJECT_COMMENT_EVENT,
      payload,
    }).then(() => true).catch(error => {
      console.warn('[shared-realtime] comment-send-failed', error);
      return false;
    });
  }

  function handleSharedProjectCommentBroadcast(payload) {
    const entry = payload?.payload && typeof payload.payload === 'object' ? payload.payload : payload;
    if (!entry || entry.projectKey !== activeSharedProjectKey) {
      return;
    }
    appendMultiCommentEntry(entry);
    renderMultiComments();
  }

  async function sendMultiComment(text) {
    const sharedCommentMode = isSharedProjectCollaborativeMode() && activeSharedProjectKey;
    if (!sharedCommentMode && !multiState.connected) {
      setMultiStatus(localizeText('コメント送信には接続が必要です', 'Connection is required to send comments'), 'warn');
      return false;
    }
    const normalizedText = normalizeMultiCommentText(text);
    if (!normalizedText) {
      setMultiStatus(localizeText('コメントを入力してください', 'Enter a comment'), 'warn');
      return false;
    }
    const payload = {
      projectKey: sharedCommentMode ? activeSharedProjectKey : multiState.projectKey,
      clientId: multiState.clientId,
      userId: accountState.userId || '',
      sessionId: sharedProjectSessionInstanceId || '',
      role: sharedCommentMode
        ? getCurrentSharedProjectUiRole(activeSharedProjectKey)
        : normalizeMultiRole(multiState.role, 'guest'),
      membershipRole: sharedCommentMode
        ? getCurrentSharedProjectMembershipRole(activeSharedProjectKey)
        : '',
      name: getLocalMultiParticipantName(),
      avatarId: getLocalMultiParticipantAvatarId(),
      avatarSrc: resolvePixieedAvatarSrcFromId(getLocalMultiParticipantAvatarId()),
      text: normalizedText,
      sentAt: Date.now(),
    };
    appendMultiCommentEntry(payload);
    renderMultiComments();
    const sent = sharedCommentMode
      ? await sendSharedProjectCommentBroadcast(payload)
      : await sendMultiBroadcast('comment', payload);
    if (!sent) {
      setMultiStatus(localizeText('コメントの送信に失敗しました', 'Failed to send comment'), 'error');
      return false;
    }
    if (dom.controls.multiCommentInput instanceof HTMLInputElement) {
      dom.controls.multiCommentInput.value = '';
    }
    return true;
  }

        return Object.freeze({
          normalizeMultiCommentText,
          makeMultiCommentId,
          resolveMultiCommentAuthorName,
          resolveMultiCommentProjectKey,
          getMultiCommentStorageKey,
          serializeMultiCommentEntry,
          persistMultiCommentsForProject,
          restoreMultiCommentsForProject,
          clearMultiComments,
          appendMultiCommentEntry,
          formatMultiCommentTime,
          renderMultiComments,
          findMultiCommentPanelScrollTarget,
          handOffMultiCommentScroll,
          bindMultiCommentScrollHandoff,
          syncDanmakuControls,
          setDanmakuEnabled,
          spawnDanmaku,
          sendSharedProjectCommentBroadcast,
          handleSharedProjectCommentBroadcast,
          sendMultiComment,
        });
      }
    })(scope);
  }

  root.sharedProjectCommentUtils = Object.freeze({
    createSharedProjectCommentUtils,
  });
})();
