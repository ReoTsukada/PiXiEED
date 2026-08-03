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
  const PENDING_INVITE_STORAGE_KEY = 'pixiedraw:pixisync:v1:pending-invite';
  const RESUME_NOTICE_STORAGE_KEY = 'pixieedraw:pixisync:resume-notice:20260803-v2';
  const RESUME_NOTICE_UI_VERSION = '20260803-v2';
  const RESUME_NOTICE_AUTO_CLOSE_MS = 10_000;
  const COMMENT_MAX_LENGTH = 140;
  const COMMENT_MAX_ITEMS = 50;
  const SLOT_PRICE_YEN = 100;
  const MAX_SLOT_QUANTITY = 20;

  function getWindowStorage(name) {
    try {
      return typeof window !== 'undefined' ? window[name] || null : null;
    } catch (error) {
      console.warn('[pixisync:v1-ui] browser storage unavailable', {
        storage: name,
        error: String(error?.message || error || ''),
      });
      return null;
    }
  }

  function createPiXiSyncMinimalUi({
    elements = {},
    navigatorRef = window.navigator,
    locationRef = window.location,
    historyRef = window.history,
    sessionStorageRef,
    localStorageRef,
    body = window.document?.body || null,
  } = {}) {
    if (sessionStorageRef === undefined) sessionStorageRef = getWindowStorage('sessionStorage');
    if (localStorageRef === undefined) localStorageRef = getWindowStorage('localStorage');
    let session = null;
    let commands = {};
    let participants = [];
    let comments = [];
    let slotStatus = null;
    let slotQuantity = 1;
    let ownedOpenRooms = [];
    let slotStatusLoading = false;
    let enabled = false;
    let externalDrawLocked = false;
    let externalDrawLockMessage = '';
    let busyAction = '';
    let activeView = 'participants';
    let disposed = false;
    let unsubscribeSession = null;
    let resumeNoticeAutoCloseTimer = null;

    const actionButtons = Object.freeze({
      start: elements.start,
      copyInvite: elements.copyInvite,
      copyInviteCode: elements.copyInviteCode,
      localize: elements.localize,
      joinCode: elements.joinCode,
      buySlot: elements.buySlot,
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
    const normalizeSlotQuantity = value => {
      const quantity = Number(value);
      return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_SLOT_QUANTITY
        ? quantity
        : 1;
    };
    const getDocument = () => (
      elements.panel?.ownerDocument
      || elements.participantList?.ownerDocument
      || window.document
    );

    function rememberResumeNotice() {
      try {
        localStorageRef?.setItem?.(RESUME_NOTICE_STORAGE_KEY, 'seen');
      } catch (_) {}
    }

    function clearResumeNoticeAutoClose() {
      if (resumeNoticeAutoCloseTimer === null) return;
      globalThis.clearTimeout(resumeNoticeAutoCloseTimer);
      resumeNoticeAutoCloseTimer = null;
    }

    function scheduleResumeNoticeAutoClose() {
      clearResumeNoticeAutoClose();
      resumeNoticeAutoCloseTimer = globalThis.setTimeout(() => {
        resumeNoticeAutoCloseTimer = null;
        closeResumeNotice();
      }, RESUME_NOTICE_AUTO_CLOSE_MS);
    }

    function closeResumeNotice() {
      clearResumeNoticeAutoClose();
      rememberResumeNotice();
      if (elements.resumeNoticeDialog?.open) elements.resumeNoticeDialog.close?.('seen');
    }

    function cancelResumeNotice(event) {
      event?.preventDefault?.();
      closeResumeNotice();
    }

    function getResumeNoticeMessage() {
      return 'シェアプロジェクト（PiXiSYNC）が復活しました。\n無料の作成枠は1枠で、必要な場合は1枠100円の買い切りで追加できます。\nシェアプロジェクトを楽しんでください。';
    }

    function getResumeNoticeDiagnostics(dialog, reason = '', error = null) {
      const scripts = Array.from(window.document?.scripts || [])
        .map(script => String(script?.src || ''))
        .filter(src => /pixisync-minimal-ui-utils|\/app\.js/.test(src));
      return {
        reason,
        dialogPresent: Boolean(dialog),
        dialogOpen: Boolean(dialog?.open),
        showModal: typeof dialog?.showModal === 'function',
        markupVersion: String(dialog?.dataset?.pixisyncResumeNoticeVersion || ''),
        expectedVersion: RESUME_NOTICE_UI_VERSION,
        scripts,
        error: error ? String(error?.message || error || '') : '',
      };
    }

    function showResumeNoticeFallback(reason, error = null) {
      const message = getResumeNoticeMessage();
      console.warn('[pixisync:v1-ui] resume notice fallback', getResumeNoticeDiagnostics(
        elements.resumeNoticeDialog,
        reason,
        error
      ));
      try {
        if (typeof window.alert === 'function') {
          window.alert(message);
          rememberResumeNotice();
          return true;
        }
      } catch (fallbackError) {
        console.warn('[pixisync:v1-ui] resume notice alert fallback failed', {
          ...getResumeNoticeDiagnostics(elements.resumeNoticeDialog, 'alert-threw', fallbackError),
        });
      }
      setNotice(message.split('\n').join(' '));
      return false;
    }

    function showResumeNoticeOnce() {
      const dialog = elements.resumeNoticeDialog;
      try {
        if (localStorageRef?.getItem?.(RESUME_NOTICE_STORAGE_KEY) === 'seen') return false;
      } catch (_) {}
      if (!dialog || typeof dialog.showModal !== 'function') {
        return showResumeNoticeFallback(
          !dialog ? 'dialog-missing' : 'showModal-unsupported'
        );
      }
      if (String(dialog.dataset?.pixisyncResumeNoticeVersion || '') !== RESUME_NOTICE_UI_VERSION) {
        return showResumeNoticeFallback('markup-version-mismatch');
      }
      if (dialog.open) return true;
      try {
        dialog.showModal();
        scheduleResumeNoticeAutoClose();
        window.requestAnimationFrame?.(() => {
          elements.resumeNoticeClose?.focus?.({ preventScroll: true });
        });
        return true;
      } catch (error) {
        return showResumeNoticeFallback('showModal-threw', error);
      }
    }

    function parseInviteToken(value) {
      return root.pixisyncProjectSwitchUtils?.parseInviteToken?.(value, {
        locationHref: locationRef.href,
      }) || '';
    }

    function readPendingInviteToken() {
      try {
        const stored = sessionStorageRef?.getItem?.(PENDING_INVITE_STORAGE_KEY) || '';
        return stored ? parseInviteToken(stored) : '';
      } catch (_) {
        return '';
      }
    }

    function writePendingInviteToken(token) {
      try {
        sessionStorageRef?.setItem?.(PENDING_INVITE_STORAGE_KEY, token);
        return sessionStorageRef?.getItem?.(PENDING_INVITE_STORAGE_KEY) === token;
      } catch (_) {
        return false;
      }
    }

    function clearPendingInviteToken() {
      try {
        sessionStorageRef?.removeItem?.(PENDING_INVITE_STORAGE_KEY);
      } catch (_) {}
    }

    function confirmShareStart() {
      const message = getResumeNoticeMessage();
      const dialog = elements.startConfirmDialog;
      if (!dialog || typeof dialog.showModal !== 'function') {
        return Promise.resolve(window.confirm(message));
      }
      return new Promise(resolve => {
        let settled = false;
        const finish = result => {
          if (settled) return;
          settled = true;
          elements.startConfirmCancel?.removeEventListener?.('click', onCancel);
          elements.startConfirmConfirm?.removeEventListener?.('click', onConfirm);
          dialog.removeEventListener?.('cancel', onDialogCancel);
          dialog.removeEventListener?.('close', onDialogClose);
          resolve(result);
        };
        const close = returnValue => {
          finish(returnValue === 'confirm');
          if (dialog.open) dialog.close?.(returnValue);
        };
        const onCancel = () => close('cancel');
        const onConfirm = () => close('confirm');
        const onDialogCancel = event => {
          event?.preventDefault?.();
          close('cancel');
        };
        const onDialogClose = () => finish(dialog.returnValue === 'confirm');
        elements.startConfirmCancel?.addEventListener?.('click', onCancel, { once: true });
        elements.startConfirmConfirm?.addEventListener?.('click', onConfirm, { once: true });
        dialog.addEventListener?.('cancel', onDialogCancel, { once: true });
        dialog.addEventListener?.('close', onDialogClose, { once: true });
        dialog.showModal();
        window.requestAnimationFrame?.(() => {
          elements.startConfirmConfirm?.focus?.({ preventScroll: true });
        });
      });
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
      const slotCommandsAvailable = typeof commands.getProjectSlotStatus === 'function';
      setHidden(elements.slotCard, !(enabled && slotCommandsAvailable));
      setText(elements.slotSummary, slotStatus
        ? (slotStatus.overLimitProjects > 0
          ? `利用中${slotStatus.openOwnedProjects}件・${slotStatus.overLimitProjects}件整理が必要`
          : `利用中 ${slotStatus.openOwnedProjects} / ${slotStatus.allowedSlots}枠`)
        : (slotStatusLoading ? '確認中…' : '枠を確認'));
      setText(elements.slotPurchaseStatus, slotStatus
        ? (slotStatus.overLimitProjects > 0
          ? `無料枠は1枠、購入枠は${slotStatus.purchasedSlots}枠です。現在${slotStatus.openOwnedProjects}件が共有中のため、${slotStatus.overLimitProjects}件をローカル専用に戻すか、同数の枠を追加してください。`
          : `無料1枠＋購入${slotStatus.purchasedSlots}枠＝上限${slotStatus.allowedSlots}枠（利用中${slotStatus.openOwnedProjects}枠）です。`)
        : (slotStatusLoading ? '現在の作成枠を確認しています…' : '作成枠を再確認してください。'));
      if (elements.slotQuantity) elements.slotQuantity.value = String(slotQuantity);
      setText(elements.slotTotal, `合計${slotQuantity * SLOT_PRICE_YEN}円`);
      setText(elements.slotPurchaseConfirm, `Stripeで${slotQuantity * SLOT_PRICE_YEN}円を支払う`);
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
      setHidden(actionButtons.localize, !(owner && active && typeof commands.localize === 'function'));
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
      if (elements.slotPurchaseRefresh) {
        elements.slotPurchaseRefresh.disabled = Boolean(!enabled || busyAction || slotStatusLoading);
      }
      if (elements.slotPurchaseConfirm) {
        elements.slotPurchaseConfirm.disabled = Boolean(
          !enabled || busyAction || typeof commands.createProjectSlotCheckout !== 'function'
        );
        elements.slotPurchaseConfirm.setAttribute('aria-busy', busyAction === 'purchaseSlot' ? 'true' : 'false');
      }
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

    function normalizeSlotStatus(value) {
      const normalized = {
        includedSlots: Number(value?.includedSlots),
        purchasedSlots: Number(value?.purchasedSlots),
        allowedSlots: Number(value?.allowedSlots),
        openOwnedProjects: Number(value?.openOwnedProjects),
        availableSlots: Number(value?.availableSlots),
        overLimitProjects: Number(value?.overLimitProjects),
      };
      if (
        !Number.isSafeInteger(normalized.includedSlots)
        || normalized.includedSlots < 1
        || !Number.isSafeInteger(normalized.purchasedSlots)
        || normalized.purchasedSlots < 0
        || normalized.allowedSlots !== normalized.includedSlots + normalized.purchasedSlots
        || !Number.isSafeInteger(normalized.openOwnedProjects)
        || normalized.openOwnedProjects < 0
        || !Number.isSafeInteger(normalized.availableSlots)
        || normalized.availableSlots < 0
        || !Number.isSafeInteger(normalized.overLimitProjects)
        || normalized.overLimitProjects < 0
      ) return null;
      return Object.freeze(normalized);
    }

    function renderOwnedOpenRooms() {
      setHidden(elements.slotResolution, ownedOpenRooms.length === 0);
      if (!elements.slotRoomList?.replaceChildren) return;
      const documentRef = getDocument();
      const rows = ownedOpenRooms.map(room => {
        const row = documentRef.createElement('div');
        const name = documentRef.createElement('span');
        const button = documentRef.createElement('button');
        row.className = 'pixisync-slot-purchase__room';
        name.textContent = `${room.title}（参加者${room.memberCount}人）`;
        button.type = 'button';
        button.className = 'button button--ghost';
        button.textContent = room.localAvailable ? '開いて整理' : 'この端末に保存なし';
        button.disabled = !room.localAvailable || typeof commands.openOwnedRoomForLocalization !== 'function';
        button.addEventListener('click', async () => {
          const opened = await runAction('openLocalizationTarget', () => (
            commands.openOwnedRoomForLocalization(room.roomId)
          ), {
            pendingMessage: '選択したシェアプロジェクトを開いています…',
            successMessage: '内容を確認し、共有解除ボタンを押してください。',
            failureMessage: '選択したプロジェクトを開けませんでした。',
          });
          if (opened) elements.slotPurchaseDialog?.close?.('localization-target');
        });
        row.append(name, button);
        return row;
      });
      elements.slotRoomList.replaceChildren(...rows);
    }

    async function refreshOwnedOpenRooms() {
      if (typeof commands.listOwnedOpenRooms !== 'function') return [];
      try {
        ownedOpenRooms = await commands.listOwnedOpenRooms();
      } catch (error) {
        console.warn('[pixisync:v1-ui] owned rooms failed', error?.message || 'unknown');
        ownedOpenRooms = [];
      }
      renderOwnedOpenRooms();
      return ownedOpenRooms;
    }

    async function refreshProjectSlotStatus({ quiet = false } = {}) {
      if (!enabled || slotStatusLoading || typeof commands.getProjectSlotStatus !== 'function') return slotStatus;
      slotStatusLoading = true;
      render();
      try {
        const nextStatus = normalizeSlotStatus(await commands.getProjectSlotStatus());
        if (!nextStatus) throw new Error('invalid-project-slot-status');
        slotStatus = nextStatus;
        if (slotStatus.availableSlots === 0 || slotStatus.overLimitProjects > 0) {
          void refreshOwnedOpenRooms();
        }
        if (!quiet) setText(elements.slotPurchaseNotice, '作成枠を更新しました。');
        return slotStatus;
      } catch (error) {
        console.warn('[pixisync:v1-ui] slot status failed', error?.message || 'unknown');
        if (!quiet) setText(elements.slotPurchaseNotice, '作成枠を確認できませんでした。');
        return null;
      } finally {
        slotStatusLoading = false;
        render();
      }
    }

    function showSlotPurchaseDialog(message = '') {
      const dialog = elements.slotPurchaseDialog;
      if (!dialog || typeof dialog.showModal !== 'function') return false;
      setText(elements.slotPurchaseNotice, message);
      if (!dialog.open) dialog.showModal();
      void refreshProjectSlotStatus({ quiet: true });
      void refreshOwnedOpenRooms();
      return true;
    }

    function removeSlotPurchaseFromUrl(url) {
      url.searchParams.delete('pixisync_slot_purchase');
      url.searchParams.delete('session_id');
      historyRef?.replaceState?.(historyRef.state, '', `${url.pathname}${url.search}${url.hash}`);
    }

    function readSlotPurchaseReturn() {
      try {
        const url = new URL(locationRef.href);
        const result = url.searchParams.get('pixisync_slot_purchase') || '';
        if (!['success', 'cancelled'].includes(result)) return null;
        return { url, result, sessionId: url.searchParams.get('session_id') || '' };
      } catch (_) {
        return null;
      }
    }

    async function consumeSlotPurchaseReturn() {
      const purchaseReturn = readSlotPurchaseReturn();
      if (!purchaseReturn || !enabled) return false;
      removeSlotPurchaseFromUrl(purchaseReturn.url);
      showSlotPurchaseDialog(purchaseReturn.result === 'cancelled'
        ? '購入はキャンセルされました。作成枠は変更されていません。'
        : 'Stripe決済を確認しています…');
      if (purchaseReturn.result === 'cancelled') {
        await refreshProjectSlotStatus({ quiet: true });
        return true;
      }
      if (
        !/^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(purchaseReturn.sessionId)
        || typeof commands.reconcileProjectSlotPurchase !== 'function'
      ) {
        setText(elements.slotPurchaseNotice, '決済情報を確認できません。枠を再確認してください。');
        return false;
      }
      try {
        const reconciledStatus = normalizeSlotStatus(
          await commands.reconcileProjectSlotPurchase(purchaseReturn.sessionId)
        );
        if (!reconciledStatus) throw new Error('invalid-project-slot-status');
        slotStatus = reconciledStatus;
        setText(elements.slotPurchaseNotice, '購入が完了し、作成枠を1枠追加しました。');
        render();
        return true;
      } catch (error) {
        console.warn('[pixisync:v1-ui] slot reconcile failed', error?.message || 'unknown');
        await refreshProjectSlotStatus({ quiet: true });
        setText(elements.slotPurchaseNotice, '決済処理を確認中です。少し待ってから「枠を再確認」を押してください。');
        return false;
      }
    }

    async function runAction(name, action, {
      pendingMessage = '',
      successMessage = '',
      failureMessage = '操作を完了できませんでした。',
      onFailure = null,
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
        onFailure?.(error);
        setNotice(typeof failureMessage === 'function'
          ? failureMessage(error)
          : failureMessage);
        return false;
      } finally {
        busyAction = '';
        render();
      }
    }

    const handlers = {
      start: async () => {
        if (!enabled || busyAction || typeof commands.start !== 'function') return false;
        if (!(await confirmShareStart())) return false;
        return runAction('start', commands.start, {
          pendingMessage: '共有を作成しています…',
          successMessage: '共有セッションを開始しました。',
          failureMessage: error => /pixisync_owner_room_limit_reached/.test(String(error?.message || error || ''))
            ? 'シェアプロジェクトの作成枠が上限に達しています。'
            : '共有を開始できませんでした。',
          onFailure: error => {
            if (/pixisync_owner_room_limit_reached/.test(String(error?.message || error || ''))) {
              showSlotPurchaseDialog('作成枠を追加すると、このプロジェクトをシェアできます。');
            }
          },
        });
      },
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
      localize: async () => {
        if (!window.confirm('このプロジェクトの共有を終了し、この端末ではローカル専用として保存します。参加者は各自の端末へ保存した後、共有データがサーバーから削除されます。続けますか？')) return false;
        return runAction('localize', commands.localize, {
          pendingMessage: '最終状態を保存して、ローカル専用へ変更しています…',
          successMessage: '共有を終了し、ローカル専用プロジェクトとして保存しました。',
          failureMessage: 'ローカル保存を確認できなかったため、共有データは削除していません。',
        });
      },
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
      buySlot: () => showSlotPurchaseDialog(),
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
    const slotHandlers = {
      refresh: () => refreshProjectSlotStatus(),
      close: () => elements.slotPurchaseDialog?.close?.('close'),
      confirm: () => runAction('purchaseSlot', async () => {
        setText(elements.slotPurchaseNotice, 'Stripeの購入画面を準備しています…');
        const checkoutUrl = await commands.createProjectSlotCheckout(slotQuantity);
        if (typeof locationRef.assign === 'function') locationRef.assign(checkoutUrl);
        else locationRef.href = checkoutUrl;
      }, {
        pendingMessage: '購入画面を準備しています…',
        failureMessage: '購入画面を開けませんでした。',
        onFailure: error => setText(
          elements.slotPurchaseNotice,
          /authentication-required/.test(String(error?.message || error || ''))
            ? '購入するにはPiXiEEDアカウントへログインしてください。'
            : '購入画面を開けませんでした。時間をおいてもう一度お試しください。'
        ),
      }),
    };
    const slotQuantityHandler = event => {
      slotQuantity = normalizeSlotQuantity(event?.target?.value ?? elements.slotQuantity?.value);
      render();
    };
    elements.slotPurchaseRefresh?.addEventListener?.('click', slotHandlers.refresh);
    elements.slotPurchaseClose?.addEventListener?.('click', slotHandlers.close);
    elements.slotPurchaseConfirm?.addEventListener?.('click', slotHandlers.confirm);
    elements.slotQuantity?.addEventListener?.('input', slotQuantityHandler);
    elements.slotQuantity?.addEventListener?.('change', slotQuantityHandler);
    elements.resumeNoticeClose?.addEventListener?.('click', closeResumeNotice);
    elements.resumeNoticeDialog?.addEventListener?.('cancel', cancelResumeNotice);
    const handleResumeNoticeClosed = () => {
      clearResumeNoticeAutoClose();
      rememberResumeNotice();
    };
    elements.resumeNoticeDialog?.addEventListener?.('close', handleResumeNoticeClosed);

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
      const hasUrlToken = Boolean(token);
      if (!token) token = readPendingInviteToken();
      if (!token) return false;
      token = parseInviteToken(token);
      if (!token) {
        clearPendingInviteToken();
        if (hasUrlToken) removeInviteTokenFromUrl(url);
        setNotice('招待リンクが正しくありません。');
        return false;
      }
      const pendingStored = writePendingInviteToken(token);
      let urlSanitized = false;
      if (hasUrlToken && pendingStored) {
        removeInviteTokenFromUrl(url);
        urlSanitized = true;
      }
      let actionError = null;
      const joined = await runAction('joinCode', async () => {
        try {
          await commands.join(token);
        } finally {
          token = '';
        }
      }, {
        pendingMessage: '招待を確認しています…',
        successMessage: '共有プロジェクトに参加しました。',
        failureMessage: '招待を確認できませんでした。',
        onFailure: error => { actionError = error; },
      });
      if (joined) {
        clearPendingInviteToken();
        if (hasUrlToken && !urlSanitized) removeInviteTokenFromUrl(url);
      } else if (!/authentication-required/.test(String(actionError?.message || actionError || ''))) {
        clearPendingInviteToken();
      }
      return joined;
    }

    function configure(runtime = {}) {
      unsubscribeSession?.();
      unsubscribeSession = null;
      const previousCommands = commands;
      session = runtime.session || null;
      commands = runtime.commands && typeof runtime.commands === 'object' ? runtime.commands : {};
      participants = Array.isArray(runtime.participants) ? runtime.participants.slice() : [];
      enabled = Boolean(session && runtime.enabled === true);
      externalDrawLocked = runtime.externalDrawLocked === true;
      externalDrawLockMessage = String(runtime.externalDrawLockMessage || '');
      unsubscribeSession = session?.subscribe?.(() => render()) || null;
      setNotice('');
      render();
      if (enabled && readSlotPurchaseReturn()) {
        void consumeSlotPurchaseReturn();
      } else if (enabled && commands !== previousCommands) {
        void refreshProjectSlotStatus({ quiet: true });
      }
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
      slotStatus = null;
      slotStatusLoading = false;
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
      elements.slotPurchaseRefresh?.removeEventListener?.('click', slotHandlers.refresh);
      elements.slotPurchaseClose?.removeEventListener?.('click', slotHandlers.close);
      elements.slotPurchaseConfirm?.removeEventListener?.('click', slotHandlers.confirm);
      elements.slotQuantity?.removeEventListener?.('input', slotQuantityHandler);
      elements.slotQuantity?.removeEventListener?.('change', slotQuantityHandler);
      elements.resumeNoticeClose?.removeEventListener?.('click', closeResumeNotice);
      elements.resumeNoticeDialog?.removeEventListener?.('cancel', cancelResumeNotice);
      elements.resumeNoticeDialog?.removeEventListener?.('close', handleResumeNoticeClosed);
      clearResumeNoticeAutoClose();
      clear();
    }

    clear();
    return Object.freeze({
      configure,
      render,
      consumeInviteFromUrl,
      consumeSlotPurchaseReturn,
      refreshProjectSlotStatus,
      showResumeNoticeOnce,
      hasPendingInvite: () => Boolean(readPendingInviteToken()),
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
