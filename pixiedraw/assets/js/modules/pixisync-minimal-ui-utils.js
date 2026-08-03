(() => {
  'use strict';

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const PHASE_COPY = Object.freeze({
    disabled: ['未接続', '共同編集は現在利用できません。', 'オフライン'],
    local: ['未接続', '通常プロジェクトとして編集中です。', '未接続'],
    invited: ['招待あり', '招待リンクから同期用の作業コピーを開けます。', '未接続'],
    creating: ['シェアを作成中', '最初のチェックポイントを安全に保存しています。', '処理中'],
    joining: ['参加処理中', '参加権限を確認しています。', '確認中'],
    syncing: ['同期中', 'チェックポイントと最新の変更を同期しています。', '同期中'],
    active: ['接続中', 'サーバー正本と一致しています。', 'オンライン'],
    reconnecting: ['再接続中', '最新状態へ追いつくまで描画を停止しています。', '再接続中'],
    leaving: ['退出処理中', '共同編集から安全に退出しています。', '切断中'],
    left: ['退出済み', 'このシェアプロジェクトの編集権限はありません。', '切断済み'],
    permission_lost: ['権限なし', '共同編集の権限が失効しました。', '切断済み'],
    closing: ['終了処理中', '保留操作と最終状態を確認しています。', '終了中'],
    archived: ['共同編集終了', 'このセッションには新しい変更を送信できません。', '終了済み'],
  });
  const INVITE_QUERY_KEY = 'pixisync_invite';
  const COMMENT_MAX_LENGTH = 140;
  const COMMENT_MAX_ITEMS = 50;

  function createPiXiSyncMinimalUi({
    elements = {},
    navigatorRef = window.navigator,
    locationRef = window.location,
    historyRef = window.history,
    body = window.document?.body || null,
  } = {}) {
    let session = null;
    let commands = {};
    let participants = [];
    let comments = [];
    let enabled = false;
    let externalDrawLocked = false;
    let externalDrawLockMessage = '';
    let busyAction = '';
    let activeView = 'participants';
    let disposed = false;
    let unsubscribeSession = null;

    const actionButtons = Object.freeze({
      start: elements.start,
      copyInvite: elements.copyInvite,
      copyInviteCode: elements.copyInviteCode,
      joinCode: elements.joinCode,
    });

    const getSnapshot = () => session?.getSnapshot?.() || {
      phase: 'local',
      role: 'owner',
      roomId: '',
      roomStatus: 'local',
      memberStatus: 'local',
      pendingOperationCount: 0,
      lastError: '',
    };
    const canDraw = () => session?.canDraw?.() === true;
    const isEngaged = snapshot => (
      Boolean(snapshot.roomId)
      || ['creating', 'joining', 'syncing', 'active', 'reconnecting', 'leaving', 'closing', 'archived', 'permission_lost']
        .includes(snapshot.phase)
    );
    const setHidden = (element, hidden) => {
      if (element) element.hidden = Boolean(hidden);
    };
    const setText = (element, value) => {
      if (element) element.textContent = String(value ?? '');
    };
    const setNotice = message => setText(elements.notice, message);
    const getDocument = () => (
      elements.panel?.ownerDocument
      || elements.participantList?.ownerDocument
      || window.document
    );

    function parseInviteToken(value) {
      return root.pixisyncProjectSwitchUtils?.parseInviteToken?.(value, {
        locationHref: locationRef.href,
      }) || '';
    }

    function setActiveView(nextView) {
      activeView = nextView === 'comments' ? 'comments' : 'participants';
      const commentsActive = activeView === 'comments';
      elements.participantsTab?.classList?.toggle?.('is-active', !commentsActive);
      elements.commentsTab?.classList?.toggle?.('is-active', commentsActive);
      elements.participantsTab?.setAttribute?.('aria-selected', String(!commentsActive));
      elements.commentsTab?.setAttribute?.('aria-selected', String(commentsActive));
      elements.participantsTab?.setAttribute?.('tabindex', commentsActive ? '-1' : '0');
      elements.commentsTab?.setAttribute?.('tabindex', commentsActive ? '0' : '-1');
      setHidden(elements.participantsView, commentsActive);
      setHidden(elements.commentsView, !commentsActive);
      if (commentsActive) {
        elements.commentsTab?.classList?.remove?.('has-notification');
      }
    }

    function renderParticipants(snapshot) {
      const normalized = participants.length
        ? participants
        : [{ id: 'self', name: '自分', role: snapshot.role, connection: snapshot.phase === 'active' ? 'online' : 'offline' }];
      setText(elements.participantCount, normalized.length);
      if (!elements.participantList?.replaceChildren) return;
      const documentRef = elements.participantList.ownerDocument || window.document;
      const items = normalized.map(participant => {
        const item = documentRef.createElement('li');
        const avatar = documentRef.createElement('img');
        const name = documentRef.createElement('span');
        const meta = documentRef.createElement('small');
        const avatarId = String(participant?.avatarId || 'mao').toLowerCase();
        const avatarSrc = avatarId === 'baburin'
          ? '../character-dots/baburinpng.png'
          : /^jerin[1-8]$/.test(avatarId)
            ? `../character-dots/Jerin${avatarId.slice(5)}.png`
            : /^jellnall(?:[1-9]|1[0-9])$/.test(avatarId)
              ? `../character-dots/${avatarId.toUpperCase()}.png`
              : '../character-dots/mao1.png';
        avatar.className = 'pixisync-participant__avatar';
        avatar.src = avatarSrc;
        avatar.alt = '';
        avatar.width = 24;
        avatar.height = 24;
        name.textContent = String(participant?.name || '参加者');
        meta.textContent = `${participant?.role === 'owner' ? 'Owner' : 'Editor'}・${participant?.connection === 'online' ? '接続中' : 'オフライン'}`;
        item.append(avatar, name, meta);
        return item;
      });
      elements.participantList.replaceChildren(...items);
    }

    function renderComments() {
      if (!elements.commentList?.replaceChildren) return;
      const documentRef = getDocument();
      const items = comments.map(comment => {
        const item = documentRef.createElement('li');
        const header = documentRef.createElement('span');
        const bodyText = documentRef.createElement('p');
        const sender = comment?.self ? '自分' : '参加者';
        header.textContent = `${sender}・${String(comment?.sentAt || '').slice(11, 16) || '--:--'}`;
        bodyText.textContent = String(comment?.text || '');
        item.append(header, bodyText);
        return item;
      });
      if (!items.length) {
        const empty = documentRef.createElement('li');
        empty.classList?.add?.('is-empty');
        empty.textContent = 'コメントはまだありません。';
        items.push(empty);
      }
      elements.commentList.replaceChildren(...items);
      elements.commentList.scrollTop = elements.commentList.scrollHeight;
    }

    function appendComment(comment, { notify = true } = {}) {
      const id = String(comment?.id || '');
      const text = String(comment?.text || '').trim().slice(0, COMMENT_MAX_LENGTH);
      if (!id || !text || comments.some(item => item.id === id)) return false;
      comments = [...comments, { ...comment, id, text }].slice(-COMMENT_MAX_ITEMS);
      renderComments();
      if (notify && activeView !== 'comments') {
        elements.commentsTab?.classList?.add?.('has-notification');
      }
      return true;
    }

    function render() {
      const snapshot = getSnapshot();
      const phase = enabled
        ? (snapshot.lastError === 'room-access-revoked' ? 'permission_lost' : snapshot.phase)
        : 'disabled';
      const copy = PHASE_COPY[phase] || PHASE_COPY.reconnecting;
      const engaged = isEngaged(snapshot);
      const drawingAllowed = canDraw() && !externalDrawLocked;
      const owner = snapshot.role === 'owner';
      const active = phase === 'active';
      const commentMode = active && typeof commands.sendComment === 'function';
      const joinMode = (
        ['local', 'invited', 'left'].includes(phase)
        && typeof commands.join === 'function'
      );

      setHidden(elements.panel, false);
      if (elements.statusLabel) {
        elements.statusLabel.dataset.phase = phase;
        elements.statusLabel.textContent = copy[0];
      }
      setText(elements.connectionLabel, copy[2]);
      renderParticipants(snapshot);
      renderComments();
      setHidden(elements.quickOpen, false);
      setHidden(elements.mobileTab, false);
      setHidden(elements.accessCodeField, !(
        phase === 'disabled'
        || commentMode
        || joinMode
      ));

      setHidden(actionButtons.start, !(phase === 'local' && typeof commands.start === 'function'));
      if (actionButtons.start) {
        actionButtons.start.textContent = 'シェアモードを開始';
      }
      setHidden(actionButtons.copyInvite, !(owner && active && typeof commands.createInviteLink === 'function'));
      setHidden(actionButtons.copyInviteCode, !(owner && active && typeof commands.createInviteCode === 'function'));
      setHidden(actionButtons.joinCode, !(
        phase === 'disabled'
        || commentMode
        || joinMode
      ));
      if (actionButtons.joinCode) {
        actionButtons.joinCode.textContent = commentMode ? '送信' : '参加';
      }

      Object.entries(actionButtons).forEach(([name, button]) => {
        if (!button) return;
        button.disabled = Boolean(
          !enabled
          || busyAction
        );
        button.setAttribute('aria-busy', busyAction === name ? 'true' : 'false');
      });
      if (elements.accessCode) {
        elements.accessCode.disabled = Boolean(
          !enabled
          ||
          busyAction
          || (!commentMode && !['local', 'invited', 'left'].includes(phase))
        );
        elements.accessCode.placeholder = commentMode
          ? 'コメントを入力'
          : '招待リンク / コード';
        elements.accessCode.setAttribute('aria-label', commentMode
          ? 'コメント'
          : '招待リンクまたは招待コード');
        elements.accessCode.maxLength = commentMode ? COMMENT_MAX_LENGTH : 2048;
      }
      if (actionButtons.joinCode && commentMode) {
        actionButtons.joinCode.disabled = Boolean(
          busyAction || !String(elements.accessCode?.value || '').trim()
        );
      }

      const drawLocked = enabled && engaged && !drawingAllowed;
      setHidden(elements.drawLock, !drawLocked);
      setText(elements.drawLockLabel, externalDrawLocked && externalDrawLockMessage ? externalDrawLockMessage : copy[1]);
      if (elements.canvasViewport) {
        elements.canvasViewport.setAttribute('aria-disabled', drawLocked ? 'true' : 'false');
      }
      if (body?.dataset) {
        body.dataset.pixisyncPhase = enabled ? phase : 'disabled';
        body.dataset.pixisyncDrawLocked = drawLocked ? 'true' : 'false';
      }
      return { snapshot, drawLocked };
    }

    async function runAction(name, action, {
      pendingMessage = '',
      successMessage = '',
      failureMessage = '操作を完了できませんでした。',
    } = {}) {
      if (!enabled || busyAction || typeof action !== 'function') return false;
      busyAction = name;
      setNotice(pendingMessage);
      render();
      try {
        await action();
        setNotice(successMessage);
        return true;
      } catch (error) {
        console.warn('[pixisync:v1-ui] action failed', name, error?.message || 'unknown');
        setNotice(failureMessage);
        return false;
      } finally {
        busyAction = '';
        render();
      }
    }

    const handlers = {
      start: () => runAction('start', commands.start, {
        pendingMessage: '共有を作成しています…',
        successMessage: '共有セッションを開始しました。',
        failureMessage: '共有を開始できませんでした。',
      }),
      copyInvite: () => runAction('copyInvite', async () => {
        let inviteLink = await commands.createInviteLink();
        try {
          if (typeof inviteLink !== 'string' || !inviteLink) throw new Error('invite-link-unavailable');
          await navigatorRef?.clipboard?.writeText?.(inviteLink);
        } finally {
          inviteLink = '';
        }
      }, {
        pendingMessage: '招待リンクを発行しています…',
        successMessage: '招待リンクをコピーしました。',
        failureMessage: '招待リンクをコピーできませんでした。',
      }),
      copyInviteCode: () => runAction('copyInviteCode', async () => {
        let inviteCode = await commands.createInviteCode();
        try {
          if (typeof inviteCode !== 'string' || !inviteCode) throw new Error('invite-code-unavailable');
          await navigatorRef?.clipboard?.writeText?.(inviteCode);
        } finally {
          inviteCode = '';
        }
      }, {
        pendingMessage: '参加コードを用意しています…',
        successMessage: '参加コードをコピーしました。',
        failureMessage: '参加コードをコピーできませんでした。',
      }),
      joinCode: () => {
        const snapshot = getSnapshot();
        if (snapshot.phase === 'active' && typeof commands.sendComment === 'function') {
          const text = String(elements.accessCode?.value || '').trim().slice(0, COMMENT_MAX_LENGTH);
          if (!text) return false;
          return runAction('joinCode', async () => {
            const comment = await commands.sendComment(text);
            appendComment({ ...comment, text, self: true }, { notify: false });
            if (elements.accessCode) elements.accessCode.value = '';
          }, {
            pendingMessage: '',
            successMessage: '',
            failureMessage: 'コメントを送信できませんでした。',
          });
        }
        let token = parseInviteToken(elements.accessCode?.value);
        if (!token) {
          setNotice('招待リンクまたは64文字の招待コードを確認してください。');
          return false;
        }
        return runAction('joinCode', async () => {
          try {
            await commands.join(token);
            if (elements.accessCode) elements.accessCode.value = '';
          } finally {
            token = '';
          }
        }, {
          pendingMessage: '招待を確認しています…',
        successMessage: 'PiXiSYNCに参加しました。',
          failureMessage: '招待を確認できませんでした。',
        });
      },
    };

    Object.entries(actionButtons).forEach(([name, button]) => {
      button?.addEventListener?.('click', handlers[name]);
    });
    const viewHandlers = {
      participants: () => {
        setActiveView('participants');
        render();
      },
      comments: () => {
        setActiveView('comments');
        render();
      },
      input: event => {
        if (event?.key === 'Enter' && !event?.isComposing) {
          event.preventDefault?.();
          void handlers.joinCode();
          return;
        }
        render();
      },
    };
    elements.participantsTab?.addEventListener?.('click', viewHandlers.participants);
    elements.commentsTab?.addEventListener?.('click', viewHandlers.comments);
    elements.accessCode?.addEventListener?.('input', viewHandlers.input);
    elements.accessCode?.addEventListener?.('keydown', viewHandlers.input);

    function removeInviteTokenFromUrl(url) {
      url.searchParams.delete(INVITE_QUERY_KEY);
      if (url.hash.startsWith('#')) {
        const hashParams = new URLSearchParams(url.hash.slice(1));
        if (hashParams.has(INVITE_QUERY_KEY)) {
          hashParams.delete(INVITE_QUERY_KEY);
          const nextHash = hashParams.toString();
          url.hash = nextHash ? `#${nextHash}` : '';
        }
      }
      historyRef?.replaceState?.(historyRef.state, '', `${url.pathname}${url.search}${url.hash}`);
    }

    async function consumeInviteFromUrl() {
      if (!enabled || typeof commands.join !== 'function') return false;
      const url = new URL(locationRef.href);
      let token = url.searchParams.get(INVITE_QUERY_KEY) || '';
      if (!token && url.hash.startsWith('#')) {
        token = new URLSearchParams(url.hash.slice(1)).get(INVITE_QUERY_KEY) || '';
      }
      if (!token) return false;
      removeInviteTokenFromUrl(url);
      token = parseInviteToken(token);
      if (!token) {
        setNotice('招待リンクが正しくありません。');
        return false;
      }
      return runAction('joinCode', async () => {
        try {
          await commands.join(token);
        } finally {
          token = '';
        }
      }, {
        pendingMessage: '招待を確認しています…',
        successMessage: '共有プロジェクトに参加しました。',
        failureMessage: '招待を確認できませんでした。',
      });
    }

    function configure(runtime = {}) {
      unsubscribeSession?.();
      unsubscribeSession = null;
      session = runtime.session || null;
      commands = runtime.commands && typeof runtime.commands === 'object' ? runtime.commands : {};
      participants = Array.isArray(runtime.participants) ? runtime.participants.slice() : [];
      enabled = Boolean(session && runtime.enabled === true);
      externalDrawLocked = runtime.externalDrawLocked === true;
      externalDrawLockMessage = String(runtime.externalDrawLockMessage || '');
      unsubscribeSession = session?.subscribe?.(() => render()) || null;
      setNotice('');
      render();
      return enabled;
    }

    function updateParticipants(nextParticipants = []) {
      participants = Array.isArray(nextParticipants) ? nextParticipants.slice() : [];
      render();
    }

    function setExternalDrawLock(locked, message = '') {
      externalDrawLocked = locked === true;
      externalDrawLockMessage = String(message || '');
      render();
    }

    function receiveComment(comment) {
      return appendComment(comment);
    }

    function clear() {
      unsubscribeSession?.();
      unsubscribeSession = null;
      session = null;
      commands = {};
      participants = [];
      comments = [];
      enabled = false;
      externalDrawLocked = false;
      externalDrawLockMessage = '';
      busyAction = '';
      activeView = 'participants';
      if (elements.accessCode) elements.accessCode.value = '';
      setNotice('');
      setActiveView('participants');
      render();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      Object.entries(actionButtons).forEach(([name, button]) => {
        button?.removeEventListener?.('click', handlers[name]);
      });
      elements.participantsTab?.removeEventListener?.('click', viewHandlers.participants);
      elements.commentsTab?.removeEventListener?.('click', viewHandlers.comments);
      elements.accessCode?.removeEventListener?.('input', viewHandlers.input);
      elements.accessCode?.removeEventListener?.('keydown', viewHandlers.input);
      clear();
    }

    clear();
    return Object.freeze({
      configure,
      render,
      consumeInviteFromUrl,
      updateParticipants,
      setExternalDrawLock,
      receiveComment,
      clear,
      dispose,
      get enabled() { return enabled; },
      get busyAction() { return busyAction; },
    });
  }

  root.pixisyncMinimalUiUtils = Object.freeze({ createPiXiSyncMinimalUi });
})();
