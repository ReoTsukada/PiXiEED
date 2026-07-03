(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectCreateProgressUtils(rawScope = {}) {
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
  function formatSharedProjectPayloadSize(bytes) {
    const safeBytes = Math.max(0, Math.round(Number(bytes) || 0));
    if (safeBytes >= 1024 * 1024) {
      const mb = safeBytes / (1024 * 1024);
      return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB`;
    }
    if (safeBytes >= 1024) {
      return `${Math.max(1, Math.round(safeBytes / 1024))}KB`;
    }
    return `${safeBytes}B`;
  }

  function getSharedProjectTypedArrayByteLength(value) {
    if (!value) {
      return 0;
    }
    if (ArrayBuffer.isView(value)) {
      return Math.max(0, value.byteLength || 0);
    }
    if (value instanceof ArrayBuffer) {
      return Math.max(0, value.byteLength || 0);
    }
    return 0;
  }

  function estimateSharedProjectLayerPayloadBytes(layer) {
    if (!layer || typeof layer !== 'object') {
      return 0;
    }
    if (isSimulationLayer(layer) || layer.type === SIM_LAYER_TYPE) {
      return [
        'elementMap',
        'sourceColorMap',
        'velXMap',
        'velYMap',
        'lifeMap',
        'tempMap',
        'lightMap',
        'depthMap',
        'airMap',
        'auxMap',
        'activeMap',
      ].reduce((total, key) => total + getSharedProjectTypedArrayByteLength(layer[key]), 0);
    }
    return getSharedProjectTypedArrayByteLength(layer.indices)
      + getSharedProjectTypedArrayByteLength(layer.direct);
  }

  function estimateSharedProjectSnapshotUpload(snapshot) {
    const metrics = {
      rawPixelBytes: 0,
      estimatedUploadBytes: 0,
      canvasCount: 0,
      frameCount: 0,
      layerCount: 0,
      simulationLayerCount: 0,
    };
    const visitFrames = (frames) => {
      if (!Array.isArray(frames)) {
        return;
      }
      metrics.frameCount += frames.length;
      frames.forEach(frame => {
        if (!frame || !Array.isArray(frame.layers)) {
          return;
        }
        metrics.layerCount += frame.layers.length;
        frame.layers.forEach(layer => {
          if (isSimulationLayer(layer) || layer?.type === SIM_LAYER_TYPE) {
            metrics.simulationLayerCount += 1;
          }
          metrics.rawPixelBytes += estimateSharedProjectLayerPayloadBytes(layer);
        });
      });
    };
    if (snapshot && typeof snapshot === 'object') {
      metrics.canvasCount = 1;
      visitFrames(snapshot.frames);
      if (Array.isArray(snapshot.canvases) && snapshot.canvases.length > 1) {
        metrics.canvasCount += snapshot.canvases.length;
        snapshot.canvases.forEach(canvas => {
          visitFrames(canvas?.frames);
        });
      }
    }
    metrics.estimatedUploadBytes = Math.ceil(metrics.rawPixelBytes * 1.4);
    return metrics;
  }

  function buildSharedProjectCreateProgressLabel(phase, metrics = null) {
    const normalizedPhase = String(phase || '').trim();
    const sizeLabel = metrics?.estimatedUploadBytes
      ? formatSharedProjectPayloadSize(metrics.estimatedUploadBytes)
      : '';
    if (!metrics || !sizeLabel) {
      return normalizedPhase;
    }
    const detail = localizeText(
      `推定 ${sizeLabel} / ${metrics.frameCount}フレーム・${metrics.layerCount}レイヤー`,
      `estimated ${sizeLabel} / ${metrics.frameCount} frames, ${metrics.layerCount} layers`
    );
    return `${normalizedPhase} (${detail})`;
  }

  function setSharedProjectCreateProgress(phase, { metrics = null, tone = 'info' } = {}) {
    const message = buildSharedProjectCreateProgressLabel(phase, metrics);
    if (!message) {
      return;
    }
    setMultiStatus(message, tone);
    updateAutosaveStatus(message, tone);
  }

  function waitForSharedProjectProgressPaint() {
    return new Promise(resolve => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => resolve());
        return;
      }
      window.setTimeout(resolve, 0);
    });
  }

  function getSharedProjectCreationVisibility() {
    return normalizeMultiRoomVisibility(
      dom.controls.multiRoomVisibility instanceof HTMLSelectElement
        ? dom.controls.multiRoomVisibility.value
        : multiState.roomVisibility,
      MULTI_DEFAULT_ROOM_VISIBILITY
    ) === MULTI_ROOM_VISIBILITY_PUBLIC
      ? MULTI_ROOM_VISIBILITY_PUBLIC
      : 'shared';
  }

  async function createSharedProjectFromCurrentDocument() {
    clearSharedProjectCreationFailureReason();
    if (!ensureInternetConnectedForAction('共有プロジェクトの作成', 'Creating a shared project')) {
      setSharedProjectCreationFailureReason(
        localizeText('ネットワーク接続を確認できませんでした。', 'Network connection could not be confirmed.'),
        localizeText('共有プロジェクトの作成にはインターネット接続が必要です。', 'Creating a shared project requires an internet connection.')
      );
      return false;
    }
    if (isSharedProjectsBlockedByRuntime()) {
      showSharedRuntimeBlockedStatus();
      setSharedProjectCreationFailureReason(
        localizeText('この環境では共有プロジェクト機能を利用できません。', 'Shared projects are unavailable in this environment.'),
        localizeText('ブラウザの機能制限または実行環境の制限により、共有機能がブロックされています。', 'Browser or runtime restrictions are blocking shared-project features.')
      );
      return false;
    }
    if (!(await ensureSharedProjectAuthenticatedStart({ requireLogin: true }))) {
      setSharedProjectCreationFailureReason(
        localizeText('共有用セッションを開始できませんでした。', 'The sharing session could not be started.'),
        localizeText('通信状態を確認するか、ログインしてからもう一度お試しください。', 'Check your connection or sign in, then try again.')
      );
      return false;
    }
    if (!await ensureSharedProjectBackendSession()) {
      const message = localizeText('共有プロジェクト用のセッションを開始できませんでした', 'Failed to initialize a shared-project session');
      setMultiStatus(message, 'warn');
      setSharedProjectCreationFailureReason(
        message,
        localizeText('Supabase接続または共有用セッションの状態を確認してください。', 'Check the Supabase connection or sharing session state.')
      );
      return false;
    }
    await ensureNoLegacyMultiSessionForSharedProject();
    const currentTrackedSharedEntry = getTrackedSharedRecentProjectEntry(activeSharedProjectKey || '');
    const currentProjectIsShared = Boolean(
      activeSharedProjectKey
      && isCurrentProjectSharedEntry()
      && currentTrackedSharedEntry
    );
    const originalLocalProjectId = normalizeAutosaveProjectId(autosaveProjectId || '');
    const shouldRemoveOriginalLocalProjectAfterShare = Boolean(
      !currentProjectIsShared
      && originalLocalProjectId
      && !originalLocalProjectId.startsWith(SHARED_PROJECT_ID_PREFIX)
    );
    const projectKey = normalizeMultiProjectKey(
      currentProjectIsShared ? activeSharedProjectKey : generateMultiProjectKey()
    );
    if (!projectKey) {
      const message = localizeText('共有プロジェクトを作成できませんでした', 'Failed to create shared project');
      setMultiStatus(message, 'error');
      setSharedProjectCreationFailureReason(
        message,
        localizeText('共有プロジェクトキーを生成できませんでした。', 'A shared project key could not be generated.')
      );
      return false;
    }
    if (!(await ensureSharedProjectCapacity(projectKey, { countOwned: true }))) {
      setSharedProjectCreationFailureReason(
        localizeText('共有プロジェクトの作成上限に達しています。', 'The shared project creation limit has been reached.'),
        localizeText('不要な共有プロジェクトを削除するか、共有プロジェクト作成枠を増やしてください。', 'Delete an unused shared project or increase your shared project creation slots.')
      );
      return false;
    }
    if (pointerState.active) {
      const message = localizeText(
        '現在の描画を確定してから共有プロジェクトを作成してください。',
        'Finish the current stroke before creating the shared project.'
      );
      setMultiStatus(message, 'warn');
      setSharedProjectCreationFailureReason(
        message,
        localizeText('描画中のストロークがまだ確定していません。', 'The current stroke has not been committed yet.')
      );
      return false;
    }
    if (!pointerState.active && history.pending?.dirty) {
      commitHistory();
    }
    if (
      currentProjectIsShared
      && !await ensureSharedProjectInviteIncludesCommittedLocalOps(projectKey, {
        reason: 'share-project-create',
      })
    ) {
      setSharedProjectCreationFailureReason(
        localizeText('未確定の共有描画をサーバーへ確定できませんでした。', 'Pending shared drawing could not be committed to the server.'),
        localizeText('ネットワーク状態を確認してからもう一度共有リンクを作成してください。', 'Check the network state and try creating the shared link again.')
      );
      return false;
    }
    const createStartedAt = performance.now();
    setSharedProjectCreateProgress(
      localizeText('共有プロジェクトのデータを確認中…', 'Checking shared project data...')
    );
    await waitForSharedProjectProgressPaint();
    const snapshot = makeHistorySnapshot({ clonePixelData: true });
    const uploadMetrics = estimateSharedProjectSnapshotUpload(snapshot);
    const isLargeSharedProjectPayload = uploadMetrics.estimatedUploadBytes >= 8 * 1024 * 1024;
    setSharedProjectCreateProgress(
      isLargeSharedProjectPayload
        ? localizeText(
          '共有データが大きいため作成に時間がかかります',
          'This shared project is large, so creation may take time'
        )
        : localizeText('共有データを準備中…', 'Preparing shared project data...'),
      { metrics: uploadMetrics, tone: isLargeSharedProjectPayload ? 'warn' : 'info' }
    );
    await waitForSharedProjectProgressPaint();
    setSharedProjectCreateProgress(
      localizeText('共有プロジェクトをSupabaseへ保存中…', 'Saving the shared project to Supabase...'),
      { metrics: uploadMetrics, tone: isLargeSharedProjectPayload ? 'warn' : 'info' }
    );
    await waitForSharedProjectProgressPaint();
    const packaged = buildPackagedProjectPayload(snapshot);
    packaged.sharedHistoryLabel = 'sharedProjectCreate';
    const creationVisibility = getSharedProjectCreationVisibility();
    const project = await persistSharedProjectSnapshot(projectKey, packaged, {
      title: createSharedProjectSnapshotTitle(state.documentName || DEFAULT_DOCUMENT_NAME),
      visibility: creationVisibility,
      reason: 'sharedProjectCreate',
    });
    if (!project) {
      const fallback = localizeText('共有プロジェクトの作成に失敗しました', 'Failed to create shared project');
      setMultiStatus(fallback, 'error');
      const failure = getSharedProjectCreationFailureReason(
        fallback,
        localizeText(
          'Supabaseへのスナップショット保存に失敗しました。共有用セッション、ネットワーク、SQL/RPCの適用状況を確認してください。',
          'Saving the snapshot to Supabase failed. Check sharing session state, network, and SQL/RPC deployment.'
        )
      );
      setSharedProjectCreationFailureReason(failure.reason, failure.detail);
      return false;
    }
    setSharedProjectCreateProgress(
      localizeText('共有URLを準備中…', 'Preparing the share URL...'),
      { metrics: uploadMetrics }
    );
    storeMultiProjectKey(projectKey);
    syncMultiProjectKeyInputValues(projectKey, { preserveFocused: false });
    setMultiDesiredRole('master');
    setMultiUiView('master');
    multiEntryJoinPanelOpen = false;
    setActiveSharedProjectSession(
      projectKey,
      Math.max(0, Math.round(Number(project.latest_revision) || 0)),
      Math.max(0, Math.round(Number(project.latest_structure_revision) || 0)),
      project.id || ''
    );
    activeSharedProjectMembershipRole = normalizeSharedProjectMembershipRole(project.membership_role || 'owner') || 'owner';
    markActiveSharedProjectDocumentLoaded(projectKey);
    await upsertSharedRecentProjectEntry({
      projectKey,
      projectId: project.id || '',
      inviteToken: project.invite_token || '',
      visibility: project.visibility || 'shared',
      name: createSharedProjectSnapshotTitle(project.title || state.documentName || projectKey),
      roleHint: 'master',
      membershipRole: project.membership_role || 'owner',
      ownerUserId: project.owner_user_id || accountState.userId || '',
      autoJoin: false,
      revision: Math.max(0, Math.round(Number(project.latest_revision) || 0)),
      structureRevision: Math.max(0, Math.round(Number(project.latest_structure_revision) || 0)),
      project: null,
    });
    const sharedRecentProjectId = buildSharedRecentProjectId(projectKey);
    setActiveAutosaveProjectId(sharedRecentProjectId);
    retargetAutosaveProjectId(originalLocalProjectId, sharedRecentProjectId);
    if (shouldRemoveOriginalLocalProjectAfterShare) {
      await removeRecentProjectEntry(originalLocalProjectId, {
        announce: false,
        reason: 'shared-project-converted',
      });
    }
    syncMultiControls();
    setMultiStatus(
      creationVisibility === MULTI_ROOM_VISIBILITY_PUBLIC
        ? localizeText(
          '公開プロジェクトを作成しました。イベント用リンクを共有してください。',
          'Public project created. Share the event link.'
        )
        : localizeText(
          '限定プロジェクトを作成しました。招待リンクを共有してください。',
          'Limited project created. Share the invite link.'
        ),
      'success'
    );
    console.info('[shared-sync]', {
      event: 'shared-project-create-finished',
      projectKey,
      estimatedUploadBytes: uploadMetrics.estimatedUploadBytes,
      frameCount: uploadMetrics.frameCount,
      layerCount: uploadMetrics.layerCount,
      elapsedMs: Math.round(performance.now() - createStartedAt),
    });
    return true;
  }

        return Object.freeze({
          formatSharedProjectPayloadSize,
          getSharedProjectTypedArrayByteLength,
          estimateSharedProjectLayerPayloadBytes,
          estimateSharedProjectSnapshotUpload,
          buildSharedProjectCreateProgressLabel,
          setSharedProjectCreateProgress,
          waitForSharedProjectProgressPaint,
          getSharedProjectCreationVisibility,
          createSharedProjectFromCurrentDocument,
        });
      }
    })(scope);
  }

  root.sharedProjectCreateProgressUtils = Object.freeze({
    createSharedProjectCreateProgressUtils,
  });
})();
