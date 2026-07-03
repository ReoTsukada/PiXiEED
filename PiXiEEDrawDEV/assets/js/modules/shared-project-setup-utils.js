(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectSetupUtils(rawScope = {}) {
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
  function setupMultiModeControls() {
    bindMultiCommentScrollHandoff();
    syncMultiProjectKeyInputValues(multiState.projectKey, { preserveFocused: false });
    getMultiProjectKeyInputElements().forEach(input => {
      if (!(input instanceof HTMLInputElement) || input.dataset.bound === 'true') {
        return;
      }
      input.dataset.bound = 'true';
      input.addEventListener('input', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        const parsed = parseMultiProjectAccessInput(event.target.value);
        const normalized = parsed.projectKey;
        if (normalized) {
          storeMultiProjectKey(normalized);
          if (event.target === dom.controls.multiProjectKey) {
            syncMultiProjectKeyInputValues(normalized, { preserveFocused: true });
          }
        } else if (!String(event.target.value || '').trim()) {
          storeMultiProjectKey('');
        }
        syncMultiControls();
      });
    });
    if (dom.controls.multiGenerateKey instanceof HTMLButtonElement && dom.controls.multiGenerateKey.dataset.bound !== 'true') {
      dom.controls.multiGenerateKey.dataset.bound = 'true';
      dom.controls.multiGenerateKey.addEventListener('click', () => {
        if (multiState.connected || multiState.connecting) {
          return;
        }
        const generated = generateMultiProjectKey();
        storeMultiProjectKey(generated);
        syncMultiProjectKeyInputValues(generated, { preserveFocused: false });
        setMultiStatus(`共有キーを生成しました: ${generated}`, 'success');
        syncMultiControls();
      });
    }
    if (dom.controls.multiCopyKey instanceof HTMLButtonElement && dom.controls.multiCopyKey.dataset.bound !== 'true') {
      dom.controls.multiCopyKey.dataset.bound = 'true';
      dom.controls.multiCopyKey.addEventListener('click', async () => {
        const projectKey = readCurrentMultiProjectKey();
        if (!projectKey) {
          setMultiStatus(localizeText('共有キーが空です。先にキーを入力してください', 'Project key is empty. Enter a key first.'), 'warn');
          syncMultiControls();
          return;
        }
        const copied = await writeTextToClipboard(projectKey);
        if (copied) {
          setMultiStatus(`共有キーをコピーしました: ${projectKey}`, 'success');
        } else {
          setMultiStatus(localizeText('共有キーのコピーに失敗しました', 'Failed to copy project key'), 'error');
        }
        syncMultiControls();
      });
    }
    if (dom.controls.multiToggleCodeVisibility instanceof HTMLButtonElement && dom.controls.multiToggleCodeVisibility.dataset.bound !== 'true') {
      dom.controls.multiToggleCodeVisibility.dataset.bound = 'true';
      dom.controls.multiToggleCodeVisibility.addEventListener('click', () => {
        const inputs = getMultiProjectKeyInputElements();
        inputs.forEach(input => {
          if (!(input instanceof HTMLInputElement)) {
            return;
          }
          input.type = 'text';
          if (input === dom.controls.multiJoinProjectKey) {
            input.dataset.visibilityToggled = 'true';
          }
        });
        syncMultiControls();
      });
    }
    if (dom.controls.multiApplyAccessCode instanceof HTMLButtonElement && dom.controls.multiApplyAccessCode.dataset.bound !== 'true') {
      dom.controls.multiApplyAccessCode.dataset.bound = 'true';
      dom.controls.multiApplyAccessCode.addEventListener('click', async () => {
        if (isMultiParticipantsCommentModeActive()) {
          const input = dom.controls.multiJoinProjectKey;
          const text = input instanceof HTMLInputElement ? input.value : '';
          const sent = await sendMultiComment(text);
          if (sent && input instanceof HTMLInputElement) {
            input.value = '';
            multiState.commentDraft = '';
          }
          syncMultiControls();
          return;
        }
        await openSharedProjectFromInput();
        syncMultiControls();
      });
    }
    if (dom.controls.multiCopyAccessCode instanceof HTMLButtonElement && dom.controls.multiCopyAccessCode.dataset.bound !== 'true') {
      dom.controls.multiCopyAccessCode.dataset.bound = 'true';
      dom.controls.multiCopyAccessCode.addEventListener('click', async () => {
        const access = readMultiJoinProjectAccessInputOnly();
        const code = (access.inviteToken || access.projectKey || '').trim();
        if (!code) {
          setMultiStatus(localizeText('コピーできる共有コードがありません', 'No share code available to copy'), 'warn');
          syncMultiControls();
          return;
        }
        const copied = await writeTextToClipboard(code);
        setMultiStatus(
          copied ? localizeText('共有コードをコピーしました', 'Share code copied') : localizeText('共有コードのコピーに失敗しました', 'Failed to copy share code'),
          copied ? 'success' : 'error'
        );
        window.alert(
          copied
            ? localizeText('共有コードをコピーしました', 'Share code copied')
            : localizeText('共有コードのコピーに失敗しました', 'Failed to copy share code')
        );
        syncMultiControls();
      });
    }
    if (dom.controls.multiJoinProjectKey instanceof HTMLInputElement && dom.controls.multiJoinProjectKey.dataset.commentBound !== 'true') {
      dom.controls.multiJoinProjectKey.dataset.commentBound = 'true';
      dom.controls.multiJoinProjectKey.addEventListener('input', event => {
        if (!isMultiParticipantsCommentModeActive()) {
          return;
        }
        multiState.commentDraft = event.target instanceof HTMLInputElement ? event.target.value : '';
      });
      dom.controls.multiJoinProjectKey.addEventListener('keydown', event => {
        const isComposing = event.isComposing || event.keyCode === 229;
        if (!isMultiParticipantsCommentModeActive() || event.key !== 'Enter' || isComposing) {
          return;
        }
        event.preventDefault();
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        const text = input ? input.value : '';
        sendMultiComment(text).then(sent => {
          if (sent && input) {
            input.value = '';
            multiState.commentDraft = '';
          }
          syncMultiControls();
        });
      });
    }
    if (dom.controls.multiMaxGuests instanceof HTMLInputElement && dom.controls.multiMaxGuests.dataset.bound !== 'true') {
      dom.controls.multiMaxGuests.dataset.bound = 'true';
      dom.controls.multiMaxGuests.addEventListener('change', event => {
        const nextMaxGuests = normalizeMultiMaxGuests(event.target.value, multiState.maxGuests);
        const changed = nextMaxGuests !== multiState.maxGuests;
        multiState.maxGuests = nextMaxGuests;
        event.target.value = String(nextMaxGuests);
        if (!changed) {
          syncMultiControls();
          return;
        }
        scheduleSessionPersist({ includeSnapshots: false });
        if (isMultiMasterMode()) {
          scheduleMultiSessionStateBroadcast({ immediate: true });
          const assignedGuestCount = getAssignedGuestCount();
          if (assignedGuestCount > nextMaxGuests) {
            setMultiStatus(
              `参加上限を ${nextMaxGuests} 人に変更しました（現在 ${assignedGuestCount} 人接続済み）`,
              'warn'
            );
          } else {
            setMultiStatus(`参加上限を ${nextMaxGuests} 人に変更しました`, 'success');
          }
        }
        syncMultiControls();
      });
    }
    if (dom.controls.multiRoomVisibility instanceof HTMLSelectElement && dom.controls.multiRoomVisibility.dataset.bound !== 'true') {
      dom.controls.multiRoomVisibility.dataset.bound = 'true';
      dom.controls.multiRoomVisibility.addEventListener('change', event => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }
        if (!prefersSharedProjectFlow() && !isMultiMasterConfigMode()) {
          event.target.value = normalizeMultiRoomVisibility(
            multiState.roomVisibility,
            MULTI_DEFAULT_ROOM_VISIBILITY
          );
          syncMultiControls();
          return;
        }
        const nextVisibility = normalizeMultiRoomVisibility(
          event.target.value,
          multiState.roomVisibility
        );
        const changed = nextVisibility !== multiState.roomVisibility;
        multiState.roomVisibility = nextVisibility;
        event.target.value = nextVisibility;
        scheduleSessionPersist({ includeSnapshots: false });
        if (isMultiMasterMode()) {
          if (changed) {
            setMultiStatus(
              nextVisibility === MULTI_ROOM_VISIBILITY_PUBLIC
                ? '共有モード: 部屋を公開しました（ホーム一覧に表示）'
                : '共有モード: 部屋を非公開にしました',
              'success'
            );
          }
          scheduleMultiPublicLobbyRoomSync({ immediate: true });
          scheduleMultiSessionStateBroadcast({ immediate: true });
        } else if (prefersSharedProjectFlow() && changed) {
          setMultiStatus(
            nextVisibility === MULTI_ROOM_VISIBILITY_PUBLIC
              ? localizeText('公開プロジェクトとして作成します', 'Will create a public project')
              : localizeText('限定プロジェクトとして作成します', 'Will create a limited project'),
            'info'
          );
        }
        syncMultiControls();
      });
    }
    if (dom.controls.multiExportPermission instanceof HTMLSelectElement && dom.controls.multiExportPermission.dataset.bound !== 'true') {
      dom.controls.multiExportPermission.dataset.bound = 'true';
      dom.controls.multiExportPermission.addEventListener('change', event => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }
        if (!isMultiMasterConfigMode()) {
          event.target.value = normalizeMultiExportPermission(
            multiState.exportPermission,
            MULTI_DEFAULT_EXPORT_PERMISSION
          );
          syncMultiControls();
          return;
        }
        const nextPermission = normalizeMultiExportPermission(
          event.target.value,
          multiState.exportPermission
        );
        const changed = nextPermission !== multiState.exportPermission;
        multiState.exportPermission = nextPermission;
        event.target.value = nextPermission;
        if (!changed) {
          syncMultiControls();
          return;
        }
        scheduleSessionPersist({ includeSnapshots: false });
        if (isMultiMasterMode()) {
          scheduleMultiSessionStateBroadcast({ immediate: true });
          setMultiStatus(`出力権限を「${getMultiExportPermissionLabel(nextPermission)}」に変更しました`, 'success');
        }
        syncMultiControls();
      });
    }
    if (dom.controls.multiJoinPolicy instanceof HTMLSelectElement && dom.controls.multiJoinPolicy.dataset.bound !== 'true') {
      dom.controls.multiJoinPolicy.dataset.bound = 'true';
      dom.controls.multiJoinPolicy.addEventListener('change', event => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }
        if (!isMultiMasterConfigMode()) {
          event.target.value = normalizeMultiJoinPolicy(
            multiState.joinPolicy,
            MULTI_DEFAULT_JOIN_POLICY
          );
          syncMultiControls();
          return;
        }
        const nextPolicy = normalizeMultiJoinPolicy(
          event.target.value,
          multiState.joinPolicy
        );
        const changed = nextPolicy !== multiState.joinPolicy;
        multiState.joinPolicy = nextPolicy;
        event.target.value = nextPolicy;
        if (!changed) {
          syncMultiControls();
          return;
        }
        scheduleSessionPersist({ includeSnapshots: false });
        if (isMultiMasterMode()) {
          scheduleMultiSessionStateBroadcast({ immediate: true });
          setMultiStatus(
            nextPolicy === MULTI_JOIN_POLICY_OPEN
              ? '参加方式を「自動参加」に変更しました'
              : '参加方式を「承認制」に変更しました',
            'success'
          );
        }
        syncMultiControls();
      });
    }
    if (dom.controls.multiPresetFriends instanceof HTMLButtonElement && dom.controls.multiPresetFriends.dataset.bound !== 'true') {
      dom.controls.multiPresetFriends.dataset.bound = 'true';
      dom.controls.multiPresetFriends.addEventListener('click', () => {
        applyMultiMasterPreset('friends');
      });
    }
    if (dom.controls.multiPresetStream instanceof HTMLButtonElement && dom.controls.multiPresetStream.dataset.bound !== 'true') {
      dom.controls.multiPresetStream.dataset.bound = 'true';
      dom.controls.multiPresetStream.addEventListener('click', () => {
        applyMultiMasterPreset('stream');
      });
    }
    if (dom.controls.multiParticipantFreeCellMove instanceof HTMLInputElement && dom.controls.multiParticipantFreeCellMove.dataset.bound !== 'true') {
      dom.controls.multiParticipantFreeCellMove.dataset.bound = 'true';
      dom.controls.multiParticipantFreeCellMove.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        const canUse = isMultiMasterConfigMode();
        if (!canUse) {
          event.target.checked = Boolean(multiState.participantFreeCellMove);
          syncMultiControls();
          return;
        }
        const nextValue = Boolean(event.target.checked);
        const changed = nextValue !== multiState.participantFreeCellMove;
        multiState.participantFreeCellMove = nextValue;
        event.target.checked = nextValue;
        if (!changed) {
          syncMultiControls();
          return;
        }
        scheduleSessionPersist({ includeSnapshots: false });
        if (isMultiMasterMode()) {
          scheduleMultiSessionStateBroadcast({ immediate: true });
          setMultiStatus(
            nextValue
              ? localizeText('参加者セルの自由移動をONにしました', 'Participant free cell movement enabled')
              : localizeText('参加者セルの自由移動をOFFにしました', 'Participant free cell movement disabled'),
            'success'
          );
        }
        syncMultiControls();
        renderTimelineMatrix();
      });
    }
    if (dom.controls.multiMasterOpsMode instanceof HTMLInputElement && dom.controls.multiMasterOpsMode.dataset.bound !== 'true') {
      dom.controls.multiMasterOpsMode.dataset.bound = 'true';
      dom.controls.multiMasterOpsMode.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        const canUseMasterOpsMode = isMultiMasterConfigMode();
        if (!canUseMasterOpsMode) {
          event.target.checked = Boolean(multiState.masterOpsMode);
          syncMultiControls();
          return;
        }
        const nextValue = Boolean(event.target.checked);
        if (multiState.masterOpsMode === nextValue) {
          syncMultiControls();
          return;
        }
        multiState.masterOpsMode = nextValue;
        scheduleSessionPersist({ includeSnapshots: false });
        syncMultiControls();
      });
    }
    if (dom.controls.multiRequestGuestRole instanceof HTMLButtonElement && dom.controls.multiRequestGuestRole.dataset.bound !== 'true') {
      dom.controls.multiRequestGuestRole.dataset.bound = 'true';
      dom.controls.multiRequestGuestRole.addEventListener('click', () => {
        sendMultiGuestJoinRequest();
      });
    }
    if (dom.controls.multiJoinRequestApprove instanceof HTMLButtonElement && dom.controls.multiJoinRequestApprove.dataset.bound !== 'true') {
      dom.controls.multiJoinRequestApprove.dataset.bound = 'true';
      dom.controls.multiJoinRequestApprove.addEventListener('click', () => {
        approveSelectedMultiJoinRequest();
      });
    }
    if (dom.controls.multiJoinRequestReject instanceof HTMLButtonElement && dom.controls.multiJoinRequestReject.dataset.bound !== 'true') {
      dom.controls.multiJoinRequestReject.dataset.bound = 'true';
      dom.controls.multiJoinRequestReject.addEventListener('click', () => {
        rejectSelectedMultiJoinRequest();
      });
    }
    if (dom.controls.multiJoinRequestTarget instanceof HTMLSelectElement && dom.controls.multiJoinRequestTarget.dataset.bound !== 'true') {
      dom.controls.multiJoinRequestTarget.dataset.bound = 'true';
      dom.controls.multiJoinRequestTarget.addEventListener('change', () => {
        syncMultiJoinRequestControls();
      });
    }
    if (dom.controls.multiInviteCopy instanceof HTMLButtonElement && dom.controls.multiInviteCopy.dataset.bound !== 'true') {
      dom.controls.multiInviteCopy.dataset.bound = 'true';
      dom.controls.multiInviteCopy.addEventListener('click', () => {
        copyMultiInviteLink();
      });
    }
    if (dom.controls.multiInviteShare instanceof HTMLButtonElement && dom.controls.multiInviteShare.dataset.bound !== 'true') {
      dom.controls.multiInviteShare.dataset.bound = 'true';
      dom.controls.multiInviteShare.addEventListener('click', () => {
        shareMultiInviteLink();
      });
    }
    if (dom.controls.multiHelpToggle instanceof HTMLButtonElement && dom.controls.multiHelpToggle.dataset.bound !== 'true') {
      dom.controls.multiHelpToggle.dataset.bound = 'true';
      dom.controls.multiHelpToggle.addEventListener('click', () => {
        const isOpen = dom.controls.multiHelpPanel instanceof HTMLElement && !dom.controls.multiHelpPanel.hidden;
        setMultiHelpPanelVisible(!isOpen);
      });
    }
    if (dom.controls.multiHelpClose instanceof HTMLButtonElement && dom.controls.multiHelpClose.dataset.bound !== 'true') {
      dom.controls.multiHelpClose.dataset.bound = 'true';
      dom.controls.multiHelpClose.addEventListener('click', () => {
        setMultiHelpPanelVisible(false);
      });
    }
    if (dom.controls.multiEntryMaster instanceof HTMLButtonElement && dom.controls.multiEntryMaster.dataset.bound !== 'true') {
      dom.controls.multiEntryMaster.dataset.bound = 'true';
      dom.controls.multiEntryMaster.addEventListener('click', async () => {
        if (!prefersSharedProjectFlow() && (multiState.connected || multiState.connecting)) {
          return;
        }
        if (prefersSharedProjectFlow()) {
          if (!(await ensureSharedProjectAuthenticatedStart({ requireLogin: true }))) {
            return;
          }
          if (!isCurrentProjectSharedEntry()) {
            const accepted = await openShareStartConfirmDialog();
            if (!accepted) {
              return;
            }
            await createSharedProjectFromCurrentDocument();
          }
          return;
        }
        multiEntryJoinPanelOpen = false;
        // Always start a newly opened room as private. The master can publish it after opening.
        multiState.roomVisibility = MULTI_DEFAULT_ROOM_VISIBILITY;
        if (dom.controls.multiRoomVisibility instanceof HTMLSelectElement) {
          dom.controls.multiRoomVisibility.value = multiState.roomVisibility;
        }
        const generated = generateMultiProjectKey();
        storeMultiProjectKey(generated);
        syncMultiProjectKeyInputValues(generated, { preserveFocused: false });
        syncMultiControls();
        await connectMultiSessionAs('master');
      });
    }
    if (dom.controls.multiEntryGuest instanceof HTMLButtonElement && dom.controls.multiEntryGuest.dataset.bound !== 'true') {
      dom.controls.multiEntryGuest.dataset.bound = 'true';
      dom.controls.multiEntryGuest.addEventListener('click', () => {
        if (multiState.connected || multiState.connecting) {
          return;
        }
        setMultiEntryJoinPanelOpen(true, { focusKey: true });
      });
    }
    if (dom.controls.multiEntryJoinAsGuest instanceof HTMLButtonElement && dom.controls.multiEntryJoinAsGuest.dataset.bound !== 'true') {
      dom.controls.multiEntryJoinAsGuest.dataset.bound = 'true';
      dom.controls.multiEntryJoinAsGuest.addEventListener('click', async () => {
        if (multiState.connected || multiState.connecting) {
          return;
        }
        if (prefersSharedProjectFlow()) {
          await openSharedProjectFromInput();
          return;
        }
        const connected = await connectMultiSessionAs('guest');
        if (connected && isMultiSpectatorMode()) {
          await sendMultiGuestJoinRequest();
        }
        syncMultiControls();
      });
    }
    if (dom.controls.multiEntrySpectator instanceof HTMLButtonElement && dom.controls.multiEntrySpectator.dataset.bound !== 'true') {
      dom.controls.multiEntrySpectator.dataset.bound = 'true';
      dom.controls.multiEntrySpectator.addEventListener('click', async () => {
        if (multiState.connected || multiState.connecting) {
          return;
        }
        await connectMultiSessionAs('spectator');
        syncMultiControls();
      });
    }
    if (dom.controls.multiEntryJoinBack instanceof HTMLButtonElement && dom.controls.multiEntryJoinBack.dataset.bound !== 'true') {
      dom.controls.multiEntryJoinBack.dataset.bound = 'true';
      dom.controls.multiEntryJoinBack.addEventListener('click', () => {
        if (multiState.connected || multiState.connecting) {
          return;
        }
        setMultiEntryJoinPanelOpen(false);
      });
    }
    if (dom.controls.multiEntryScreen instanceof HTMLElement && dom.controls.multiEntryScreen.dataset.bound !== 'true') {
      dom.controls.multiEntryScreen.dataset.bound = 'true';
      const handleResize = () => {
        scheduleMultiEntryScreenMetricsUpdate();
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);
      document.addEventListener('pixiedraw:panel-ad-dock-change', handleResize);
      document.addEventListener('pixiedraw:ad-layout-change', handleResize);
      if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
        window.visualViewport.addEventListener('resize', handleResize);
        window.visualViewport.addEventListener('scroll', handleResize);
      }
      if (multiEntryMetricsResizeObserver) {
        multiEntryMetricsResizeObserver.disconnect();
        multiEntryMetricsResizeObserver = null;
      }
      if (typeof ResizeObserver === 'function') {
        const targets = new Set();
        targets.add(dom.controls.multiEntryScreen);
        const panelBody = dom.controls.multiEntryScreen.closest('.panel-section__body');
        if (panelBody instanceof HTMLElement) {
          targets.add(panelBody);
        }
        if (dom.sections.multi instanceof HTMLElement) {
          targets.add(dom.sections.multi);
        }
        if (dom.mobilePanels.multi instanceof HTMLElement) {
          targets.add(dom.mobilePanels.multi);
        }
        multiEntryMetricsResizeObserver = new ResizeObserver(() => {
          scheduleMultiEntryScreenMetricsUpdate();
        });
        targets.forEach(target => {
          if (target instanceof HTMLElement) {
            multiEntryMetricsResizeObserver?.observe(target);
          }
        });
      }
      scheduleMultiEntryScreenMetricsUpdate();
    }
    getMultiFlowTabButtons().forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.bound === 'true') {
        return;
      }
      button.dataset.bound = 'true';
      bindTabKeyboardNavigation(button, getMultiFlowTabButtons);
      button.addEventListener('click', () => {
        setMultiFlowTab(button.dataset.multiFlowTab || '');
      });
    });
    [
      dom.controls.multiParticipantsPanelTab,
      dom.controls.multiCommentsPanelTab,
    ].forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.bound === 'true') {
        return;
      }
      button.dataset.bound = 'true';
      bindTabKeyboardNavigation(button, () => [
        dom.controls.multiParticipantsPanelTab,
        dom.controls.multiCommentsPanelTab,
      ].filter(item => item instanceof HTMLButtonElement));
      button.addEventListener('click', () => {
        setMultiParticipantsPanelTab(button.dataset.multiPanelTab || 'participants');
      });
    });
    if (dom.controls.multiStartSession instanceof HTMLButtonElement && dom.controls.multiStartSession.dataset.bound !== 'true') {
      dom.controls.multiStartSession.dataset.bound = 'true';
      dom.controls.multiStartSession.addEventListener('click', async () => {
        if (prefersSharedProjectFlow()) {
          if (isCurrentProjectSharedEntry() || resolveSharedProjectKeyForCurrentState()) {
            await copyMultiInviteLink();
            return;
          }
          if (!(await ensureSharedProjectAuthenticatedStart({ requireLogin: true }))) {
            return;
          }
          if (!isCurrentProjectSharedEntry()) {
            const accepted = await openShareStartConfirmDialog();
            if (!accepted) {
              return;
            }
            await createSharedProjectFromCurrentDocument();
          }
          return;
        }
        connectMultiSessionAs(normalizeMultiDesiredRole(multiState.desiredRole));
      });
    }
    if (dom.controls.multiLeaveSession instanceof HTMLButtonElement && dom.controls.multiLeaveSession.dataset.bound !== 'true') {
      dom.controls.multiLeaveSession.dataset.bound = 'true';
      dom.controls.multiLeaveSession.addEventListener('click', () => {
        if (multiState.connected || multiState.connecting) {
          disconnectMultiSession({ silent: false });
          return;
        }
        if (normalizeMultiUiView(multiState.uiView) !== 'entry') {
          setMultiUiView('entry');
          setMultiStatus(localizeText('部屋を開く / 参加する を選択してください', 'Choose Open Room / Join Room'), 'info');
          syncMultiControls();
        }
      });
    }
    if (dom.controls.multiBroadcastState instanceof HTMLButtonElement && dom.controls.multiBroadcastState.dataset.bound !== 'true') {
      dom.controls.multiBroadcastState.dataset.bound = 'true';
      dom.controls.multiBroadcastState.addEventListener('click', () => {
        if (!isMultiMasterMode()) {
          setMultiStatus(localizeText('全員同期はマスターのみ実行できます', 'Only the master can sync to all'), 'warn');
          return;
        }
        scheduleMultiSessionStateBroadcast({ immediate: true });
        setMultiStatus(localizeText('共有モード: 全員に最新状態を同期しました', 'Collab mode: synced latest state to everyone'), 'success');
      });
    }
    /* multiForceDanmakuToggle handler removed: danmaku control is per-client */
    if (
      dom.controls.multiRoleTarget instanceof HTMLSelectElement
      && dom.controls.multiRoleTarget !== dom.controls.multiAssignTarget
      && dom.controls.multiRoleTarget.dataset.bound !== 'true'
    ) {
      dom.controls.multiRoleTarget.dataset.bound = 'true';
      dom.controls.multiRoleTarget.addEventListener('change', event => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }
        setMultiSelectedControlClientId(event.target.value || '');
        syncMultiAssignmentControls();
      });
    }
    if (dom.controls.multiForceGuest instanceof HTMLButtonElement && dom.controls.multiForceGuest.dataset.bound !== 'true') {
      dom.controls.multiForceGuest.dataset.bound = 'true';
      dom.controls.multiForceGuest.addEventListener('click', async () => {
        const targetClientId = multiState.selectedRoleControlClientId
          || multiState.selectedAssignClientId
          || (dom.controls.multiRoleTarget instanceof HTMLSelectElement ? dom.controls.multiRoleTarget.value : '')
          || (dom.controls.multiAssignTarget instanceof HTMLSelectElement ? dom.controls.multiAssignTarget.value : '');
        if (!targetClientId) {
          setMultiStatus(localizeText('切替対象を選択してください', 'Select a target to switch'), 'warn');
          return;
        }
        await forceMultiParticipantRole(targetClientId, 'guest');
      });
    }
    if (dom.controls.multiForceSpectator instanceof HTMLButtonElement && dom.controls.multiForceSpectator.dataset.bound !== 'true') {
      dom.controls.multiForceSpectator.dataset.bound = 'true';
      dom.controls.multiForceSpectator.addEventListener('click', async () => {
        const targetClientId = multiState.selectedRoleControlClientId
          || multiState.selectedAssignClientId
          || (dom.controls.multiRoleTarget instanceof HTMLSelectElement ? dom.controls.multiRoleTarget.value : '')
          || (dom.controls.multiAssignTarget instanceof HTMLSelectElement ? dom.controls.multiAssignTarget.value : '');
        if (!targetClientId) {
          setMultiStatus(localizeText('切替対象を選択してください', 'Select a target to switch'), 'warn');
          return;
        }
        await forceMultiParticipantRole(targetClientId, 'spectator');
      });
    }
    if (dom.controls.multiAssignTarget instanceof HTMLSelectElement && dom.controls.multiAssignTarget.dataset.bound !== 'true') {
      dom.controls.multiAssignTarget.dataset.bound = 'true';
      dom.controls.multiAssignTarget.addEventListener('change', event => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }
        setMultiSelectedControlClientId(event.target.value || '');
        syncMultiAssignmentControls();
      });
    }
    if (dom.controls.multiAssignApply instanceof HTMLButtonElement && dom.controls.multiAssignApply.dataset.bound !== 'true') {
      dom.controls.multiAssignApply.dataset.bound = 'true';
      dom.controls.multiAssignApply.addEventListener('click', () => {
        const targetClientId = multiState.selectedAssignClientId
          || (dom.controls.multiAssignTarget instanceof HTMLSelectElement ? dom.controls.multiAssignTarget.value : '');
        const pendingRequest = targetClientId ? getPendingMultiAssignmentMoveRequest(targetClientId) : null;
        const assignment = targetClientId ? getMultiAssignment(targetClientId) : null;
        const targetCanvas = (() => {
          const pendingCanvasId = pendingRequest
            ? normalizeMultiAssignmentCanvasId(
              pendingRequest.canvasId,
              assignment?.canvasId || getActiveProjectCanvasDocument()?.id || ''
            )
            : '';
          return getProjectCanvasDocumentById(pendingCanvasId)
            || getAssignmentCanvasDocument(assignment, getActiveProjectCanvasDocument())
            || getActiveProjectCanvasDocument()
            || getProjectCanvasDocumentAt(0)
            || null;
        })();
        const frameNumber = dom.controls.multiAssignFrame instanceof HTMLInputElement
          ? Number(dom.controls.multiAssignFrame.value)
          : 1;
        const layerNumber = dom.controls.multiAssignLayer instanceof HTMLInputElement
          ? Number(dom.controls.multiAssignLayer.value)
          : 1;
        const moved = moveMultiParticipantToCell(
          targetClientId,
          (Number.isFinite(frameNumber) ? frameNumber : 1) - 1,
          (Number.isFinite(layerNumber) ? layerNumber : 1) - 1,
          {
            canvasId: targetCanvas?.id || pendingRequest?.canvasId || assignment?.canvasId || getActiveProjectCanvasDocument()?.id || '',
          }
        );
        if (moved) {
          updateMultiAssignmentControlsFromSelection();
        }
      });
    }
    if (dom.controls.multiAssignLockToggle instanceof HTMLButtonElement && dom.controls.multiAssignLockToggle.dataset.bound !== 'true') {
      dom.controls.multiAssignLockToggle.dataset.bound = 'true';
      dom.controls.multiAssignLockToggle.addEventListener('click', () => {
        const targetClientId = multiState.selectedAssignClientId
          || (dom.controls.multiAssignTarget instanceof HTMLSelectElement ? dom.controls.multiAssignTarget.value : '');
        const assignment = targetClientId ? getMultiAssignment(targetClientId) : null;
        if (!assignment) {
          setMultiStatus(localizeText('ロック対象の参加者を選択してください', 'Select a participant to lock'), 'warn');
          return;
        }
        setMultiParticipantCellLocked(targetClientId, !assignment.locked);
      });
    }
    if (dom.controls.multiAssignKick instanceof HTMLButtonElement && dom.controls.multiAssignKick.dataset.bound !== 'true') {
      dom.controls.multiAssignKick.dataset.bound = 'true';
      dom.controls.multiAssignKick.addEventListener('click', async () => {
        const targetClientId = multiState.selectedAssignClientId
          || (dom.controls.multiAssignTarget instanceof HTMLSelectElement ? dom.controls.multiAssignTarget.value : '');
        if (!targetClientId) {
          setMultiStatus(localizeText('キック対象の参加者を選択してください', 'Select a participant to kick'), 'warn');
          return;
        }
        await kickMultiParticipant(targetClientId);
      });
    }
    if (dom.controls.multiAssignBan instanceof HTMLButtonElement && dom.controls.multiAssignBan.dataset.bound !== 'true') {
      dom.controls.multiAssignBan.dataset.bound = 'true';
      dom.controls.multiAssignBan.addEventListener('click', async () => {
        const targetClientId = multiState.selectedAssignClientId
          || (dom.controls.multiAssignTarget instanceof HTMLSelectElement ? dom.controls.multiAssignTarget.value : '');
        if (!targetClientId) {
          setMultiStatus(localizeText('BAN対象の参加者を選択してください', 'Select a participant to ban'), 'warn');
          return;
        }
        await banMultiParticipant(targetClientId);
      });
    }
    if (dom.controls.multiBlockedRemove instanceof HTMLButtonElement && dom.controls.multiBlockedRemove.dataset.bound !== 'true') {
      dom.controls.multiBlockedRemove.dataset.bound = 'true';
      dom.controls.multiBlockedRemove.addEventListener('click', () => {
        if (!(dom.controls.multiBlockedTarget instanceof HTMLSelectElement)) {
          return;
        }
        const targetClientId = dom.controls.multiBlockedTarget.value || '';
        if (!targetClientId) {
          setMultiStatus(localizeText('BAN解除対象を選択してください', 'Select a participant to unban'), 'warn');
          return;
        }
        unbanMultiParticipant(targetClientId);
      });
    }
    if (dom.controls.multiCommentSend instanceof HTMLButtonElement && dom.controls.multiCommentSend.dataset.bound !== 'true') {
      dom.controls.multiCommentSend.dataset.bound = 'true';
      dom.controls.multiCommentSend.addEventListener('click', async () => {
        const text = dom.controls.multiCommentInput instanceof HTMLInputElement
          ? dom.controls.multiCommentInput.value
          : '';
        await sendMultiComment(text);
      });
    }
    if (dom.controls.multiCommentInput instanceof HTMLInputElement && dom.controls.multiCommentInput.dataset.bound !== 'true') {
      dom.controls.multiCommentInput.dataset.bound = 'true';
      dom.controls.multiCommentInput.addEventListener('keydown', event => {
        const isComposing = event.isComposing || event.keyCode === 229;
        if (event.key !== 'Enter' || isComposing) {
          return;
        }
        event.preventDefault();
        const text = event.target instanceof HTMLInputElement ? event.target.value : '';
        sendMultiComment(text);
      });
    }

    // bind danmaku toggle controls
    if (dom.controls.multiDanmakuToggle instanceof HTMLInputElement && dom.controls.multiDanmakuToggle.dataset.bound !== 'true') {
      dom.controls.multiDanmakuToggle.dataset.bound = 'true';
      dom.controls.multiDanmakuToggle.addEventListener('change', (ev) => {
        const next = Boolean(ev.target && ev.target.checked);
        setDanmakuEnabled(next);
      });
    }
    if (dom.controls.settingDanmakuToggle instanceof HTMLInputElement && dom.controls.settingDanmakuToggle.dataset.bound !== 'true') {
      dom.controls.settingDanmakuToggle.dataset.bound = 'true';
      dom.controls.settingDanmakuToggle.addEventListener('change', (ev) => {
        const next = Boolean(ev.target && ev.target.checked);
        setDanmakuEnabled(next);
      });
    }

    if (!multiState.connected) {
      setMultiStatus(localizeText('共有モード: OFF', 'Collab mode: OFF'), 'info');
    }
    setMultiHelpPanelVisible(false);
    syncMultiControls();
    syncSharedModeStatusDisplay();
    syncSharedProjectVisibleStatus();
    // sync danmaku UI state
    syncDanmakuControls();
    renderMultiParticipantsList();
    renderMultiComments();
    applyMultiRoleUiLocks();
    const inviteApplied = maybeApplyInviteAutoJoin();
    if (!inviteApplied) {
      maybeAutoResumeMultiSession();
    }
  }

        return Object.freeze({
          setupMultiModeControls,
        });
      }
    })(scope);
  }

  root.sharedProjectSetupUtils = Object.freeze({
    createSharedProjectSetupUtils,
  });
})();
