(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createUiLocalizationUtils({
    AUTOSAVE_SUPPORTED,
    STREAMING_HIDE_MONETIZATION_UI,
    TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE,
    TOP_UI_ACTION_LOCAL_CANVAS_TOGGLE,
    TOP_UI_ACTION_MIRROR_POPUP,
    TOP_UI_ACTION_OPEN_DETAILS_PANEL,
    TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE,
    dom,
    recentProjectsCache,
    getCurrentPalettePresetId,
    getNewProjectPalettePresetId,
    getUiLanguage,
    setUiLanguageValue,
    localizeText,
    getExternalToolDefinition,
    getExternalToolDefinitionByAction,
    getExternalToolLocalizedActionLabel,
    syncExternalToolActionButtons,
    updateMirrorActionButtons,
    updateVirtualCursorActionToolButtons,
    updateLocalCanvasActionToolButtons,
    updateFloatingPreviewActionToolButtons,
    setLocalizedTextContent,
    setLocalizedAttribute,
    setLocalizedHtmlContent,
    setLocalizedControlLabel,
    setLocalizedSelectOption,
    setLocalizedToggleLabel,
    setDocumentLanguage,
    syncNewProjectDialogModeText,
    renderNewProjectPalettePresetOptions,
    renderNewProjectPalettePresetPicker,
    renderHelpGuideEntries,
    applyHelpGuideSearchFilter,
    renderMirrorToolPopover,
    syncMirrorToolPopoverControls,
    updateExportDestinationLabel,
    updateExportFolderButtonLabel,
    updateExportScaleHint,
    renderOpenProjectTabs,
    syncControlsWithState,
    renderColorPanelPalettePresetOptions,
    renderPalettePresetPreview,
    syncStartupResumeState,
    scheduleRecentProjectsListRender,
    normalizeUiLanguage,
    storeUiLanguage,
    isNativeAppRuntime,
    updatePixieedAccountUi,
  } = {}) {

    function applyTabLocalization() {
      const tabLabels = {
        tools: { ja: 'ツール', en: 'Tools', zh: '工具' },
        color: { ja: 'カラー', en: 'Color', zh: '颜色' },
        frames: { ja: 'フレームとレイヤー', en: 'Frames & Layers', zh: '帧与图层' },
        settings: { ja: '設定', en: 'Settings', zh: '设置' },
        extensions: { ja: '拡張', en: 'Extensions', zh: '扩展' },
        help: { ja: '使い方ヘルプ', en: 'Help', zh: '使用帮助' },
        file: { ja: 'ファイル', en: 'File', zh: '文件' },
        multi: { ja: '共有モード', en: 'Collab', zh: '协作模式' },
      };
  
      dom.mobileTabs.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const key = button.dataset.mobileTab || '';
        const entry = tabLabels[key];
        if (!entry) {
          return;
        }
        const label = localizeText(entry.ja, entry.en, entry.zh);
        button.setAttribute('aria-label', label);
        const srOnly = button.querySelector('.sr-only');
        if (srOnly instanceof HTMLElement) {
          srOnly.textContent = label;
        }
        const textLabel = button.classList.contains('detail-panel__action')
          ? button.querySelector('span:last-child')
          : null;
        if (textLabel instanceof HTMLElement) {
          textLabel.textContent = label;
        }
      });
  
      const railButtons = Array.from(document.querySelectorAll('.rail-tab[data-left-tab], .rail-tab[data-right-tab]'));
      railButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const key = button.dataset.leftTab || button.dataset.rightTab || '';
        const entry = tabLabels[key];
        if (!entry) {
          return;
        }
        const label = localizeText(entry.ja, entry.en, entry.zh);
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        const srOnly = button.querySelector('.sr-only');
        if (srOnly instanceof HTMLElement) {
          srOnly.textContent = label;
        }
        const groupLabel = button.querySelector('.tool-group-label');
        if (groupLabel instanceof HTMLElement) {
          groupLabel.textContent = label;
        }
      });
    }
  
  
    function applyTopActionLocalization() {
      const actionLabels = {
        [TOP_UI_ACTION_MIRROR_POPUP]: { ja: '対称', en: 'Mirror', zh: '对称' },
        [TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE]: { ja: '仮想カーソル', en: 'Virtual Cursor', zh: '虚拟光标' },
        [TOP_UI_ACTION_LOCAL_CANVAS_TOGGLE]: { ja: 'マルチキャンバス', en: 'Multi Canvas', zh: '多画布' },
        [TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE]: { ja: '小窓プレビュー', en: 'Floating Preview', zh: '浮动预览' },
        [TOP_UI_ACTION_OPEN_DETAILS_PANEL]: { ja: '詳細', en: 'Details', zh: '详情' },
      };
      const detailActionLabels = {
        account: { ja: 'ログイン', en: 'Sign In', zh: '登录' },
      };
      const quickRightTabLabels = {
        details: { ja: '詳細', en: 'Details', zh: '详情' },
        settings: { ja: '設定', en: 'Settings', zh: '设置' },
        file: { ja: 'ファイル', en: 'File', zh: '文件' },
        multi: { ja: '共有モード', en: 'Share Mode', zh: '协作模式' },
      };
  
      dom.topActionButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const key = button.dataset.uiAction || '';
        const externalTool = getExternalToolDefinition(button.dataset.externalTool || '') || getExternalToolDefinitionByAction(key);
        const label = externalTool
          ? getExternalToolLocalizedActionLabel(externalTool)
          : (() => {
            const entry = actionLabels[key];
            return entry ? localizeText(entry.ja, entry.en, entry.zh) : '';
          })();
        if (!label) {
          return;
        }
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        const srOnly = button.querySelector('.sr-only');
        if (srOnly instanceof HTMLElement) {
          srOnly.textContent = label;
        }
      });
      Array.from(document.querySelectorAll('[data-detail-action]')).forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const entry = detailActionLabels[button.dataset.detailAction || ''];
        if (!entry) {
          return;
        }
        const label = localizeText(entry.ja, entry.en, entry.zh);
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        const srOnly = button.querySelector('.sr-only');
        if (srOnly instanceof HTMLElement) {
          srOnly.textContent = label;
        }
      });
      Array.from(document.querySelectorAll('[data-quick-right-tab]')).forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const entry = quickRightTabLabels[button.dataset.quickRightTab || ''];
        if (!entry) {
          return;
        }
        const label = localizeText(entry.ja, entry.en, entry.zh);
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        const srOnly = button.querySelector('.sr-only');
        if (srOnly instanceof HTMLElement) {
          srOnly.textContent = label;
        }
        const textLabel = button.classList.contains('detail-panel__action')
          ? button.querySelector('span:last-child')
          : null;
        if (textLabel instanceof HTMLElement) {
          textLabel.textContent = label;
        }
      });
      syncExternalToolActionButtons();
      updateMirrorActionButtons();
      updateVirtualCursorActionToolButtons();
      updateLocalCanvasActionToolButtons();
      updateFloatingPreviewActionToolButtons();
    }
  
  
    function applyToolLocalization() {
      const toolGroupLabels = {
        selection: { ja: '範囲選択', en: 'Selection', zh: '选区' },
        pen: { ja: 'ペン', en: 'Pen', zh: '画笔' },
        eyedropper: { ja: 'スポイト', en: 'Eyedropper', zh: '吸管' },
        eraser: { ja: '消しゴム', en: 'Eraser', zh: '橡皮' },
        shape: { ja: '図形', en: 'Shapes', zh: '图形' },
        fill: { ja: '塗りつぶし', en: 'Fill', zh: '填充' },
      };
  
      dom.toolGroupButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const key = button.dataset.toolGroup || '';
        const entry = toolGroupLabels[key];
        if (!entry) {
          return;
        }
        const label = localizeText(entry.ja, entry.en, entry.zh);
        button.setAttribute('title', label);
        const labelNode = button.querySelector('.tool-group-label');
        if (labelNode instanceof HTMLElement) {
          labelNode.textContent = label;
        }
      });
  
      const toolLabels = {
        pen: { ja: 'ペン', en: 'Pen', zh: '画笔' },
        eyedropper: { ja: 'スポイト', en: 'Eyedropper', zh: '吸管' },
        eraser: { ja: '消しゴム', en: 'Eraser', zh: '橡皮' },
        line: { ja: '直線', en: 'Line', zh: '直线' },
        curve: { ja: '曲線', en: 'Curve', zh: '曲线' },
        rect: { ja: '四角', en: 'Rectangle', zh: '矩形' },
        rectFill: { ja: '塗り四角', en: 'Filled Rect', zh: '填充矩形' },
        ellipse: { ja: '丸', en: 'Ellipse', zh: '椭圆' },
        ellipseFill: { ja: '塗り丸', en: 'Filled Ellipse', zh: '填充椭圆' },
        fill: { ja: '単色塗り', en: 'Solid Fill', zh: '单色填充' },
        fillDither: { ja: 'ディザ塗り', en: 'Dither Fill', zh: '抖动填充' },
        fillGradient: { ja: 'グラデーション塗り', en: 'Gradient Fill', zh: '渐变填充' },
        move: { ja: '移動', en: 'Move', zh: '移动' },
        selectRect: { ja: '矩形選択', en: 'Rect Select', zh: '矩形选择' },
        selectLasso: { ja: '投げ縄', en: 'Lasso', zh: '套索' },
        selectSame: { ja: '同色', en: 'Same Color', zh: '同色' },
        mirrorPopup: { ja: '対称', en: 'Mirror', zh: '对称' },
        virtualCursorToggle: { ja: '仮想表示', en: 'Virtual Cursor', zh: '虚拟显示' },
      };
  
      const toolNodes = Array.from(document.querySelectorAll('.tool-button[data-tool]'));
      toolNodes.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const key = button.dataset.tool || '';
        const entry = toolLabels[key];
        if (!entry) {
          return;
        }
        const label = localizeText(entry.ja, entry.en, entry.zh);
        const span = button.querySelector('span');
        if (span instanceof HTMLElement) {
          span.textContent = label;
        }
        const icon = button.querySelector('img');
        if (icon instanceof HTMLImageElement) {
          icon.alt = label;
        }
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
      });
  
      setLocalizedTextContent('.tool-quick-color__palette + .help-text', 'クイックパレット', 'Quick Palette');
      setLocalizedTextContent('#selectionOutlineField > span', '選択編集', 'Selection Edit');
      setLocalizedTextContent('#selectionOutline4Action', '4方向', '4-way');
      setLocalizedTextContent('#selectionOutline8Action', '8方向', '8-way');
      setLocalizedTextContent('#outlineSizeField > span', 'アウトライン幅', 'Outline Width');
      setLocalizedTextContent('#brushSizeField > span', 'ブラシサイズ', 'Brush Size');
      setLocalizedTextContent('#brushShapeButtons [data-brush-shape="square"] span', '四角', 'Square');
      setLocalizedTextContent('#brushShapeButtons [data-brush-shape="circle"] span', '丸', 'Circle');
      setLocalizedTextContent('#brushShapeButtons [data-brush-shape="custom"] span', 'カスタム', 'Custom');
      setLocalizedTextContent('#selectSameModeField > span', '同色モード', 'Same Color Mode');
      setLocalizedTextContent('#selectSameModeField [data-select-same-mode="connected"]', '連結のみ', 'Connected');
      setLocalizedTextContent('#selectSameModeField [data-select-same-mode="global"]', '全体', 'Global');
      setLocalizedTextContent('#selectionShapeModeField > span', '範囲モード', 'Selection Shape');
      setLocalizedTextContent('#selectionShapeModeField [data-selection-shape-mode="content"]', '描画のみ', 'Paint Only');
      setLocalizedTextContent('#selectionShapeModeField [data-selection-shape-mode="shape"]', '図形のまま', 'Keep Shape');
    }
  
  
    function applyUiLocalization() {
      setDocumentLanguage();
  
      if (dom.controls.toggleLanguageMode instanceof HTMLButtonElement) {
        const switchLabel = 'あ/A/中';
        const languageIcon = dom.controls.toggleLanguageMode.querySelector('.detail-panel__text-icon');
        if (languageIcon instanceof HTMLElement) {
          languageIcon.textContent = switchLabel;
        }
        dom.controls.toggleLanguageMode.setAttribute(
          'aria-label',
          localizeText('言語を切り替え（あ/A/中）', 'Switch language (あ/A/中)', '切换语言（あ/A/中）')
        );
      }
  
      setLocalizedTextContent('.startup-screen__subtitle', 'PiXiEEDraw（ピクシードロー）でドット絵づくり・アニメ制作をはじめよう', 'Start pixel art and animation with PiXiEEDraw');
      setLocalizedTextContent('#startupActionResume', '最新の端末内プロジェクトを開く', 'Open Latest Local Project');
      setLocalizedTextContent('#startupActionNew', '新規作成', 'New Project');
      setLocalizedTextContent('#startupActionOpen', 'ファイルを開く', 'Open File');
      setLocalizedTextContent('#startupActionSkip', 'この画面を閉じる', 'Close');
      setLocalizedTextContent('#globalLoadingIndicatorCancel', 'キャンセル', 'Cancel');
      setLocalizedTextContent('#multiInviteShare', '共有', 'Share');
      setLocalizedAttribute('#projectTabsBar', 'aria-label', 'プロジェクト内シート', 'Project Sheets');
      setLocalizedAttribute('#projectTabsList', 'aria-label', 'シートタブ', 'Sheet Tabs');
      setLocalizedTextContent('#projectHomeTitle', 'プロジェクト一覧', 'Projects');
      setLocalizedTextContent('#projectHomeNew', '新規作成', 'New Project');
      setLocalizedTextContent('#projectHomeOpen', 'ファイルを開く', 'Open File');
      setLocalizedTextContent('#projectHomeAccessTitle', 'コード適用', 'Apply Codes');
      setLocalizedTextContent('#projectHomeAccessStatus', '購入番号または購入コードを入力してください。', 'Enter your purchase number or purchase code.');
      setLocalizedTextContent('#projectHomeApplyAccessCode', '適用', 'Apply');
      setLocalizedAttribute('#projectHomeJoinProjectKey', 'placeholder', '購入番号 / 購入コード', 'Purchase number / purchase code');
      setLocalizedTextContent('#projectHomeSupporterApply', '適用', 'Apply');
      setLocalizedTextContent('#projectHomeSupporterPurchase', 'サポーター特典を見る', 'View Supporter Benefits');
      setLocalizedAttribute('#projectHomeSupporterCode', 'placeholder', '購入番号 / シリアルコード', 'Purchase number / serial code');
      setLocalizedTextContent('#projectHomeRecentProjects .project-home-screen__section-title', 'プロジェクト', 'Projects');
      setLocalizedTextContent('#startupRecentProjects .startup-screen__recent-title', 'プロジェクト一覧', 'Projects');
      setLocalizedTextContent('#startupRecentAdContainer .export-ad__label', '広告', 'Ad');
      setLocalizedTextContent(
        '#startupScreenHint',
        AUTOSAVE_SUPPORTED
          ? '描画内容はこの端末に自動保存され、起動時に前回データを復元できます。'
          : 'このブラウザでは自動保存が利用できません。保存/出力から手動保存してください。',
        AUTOSAVE_SUPPORTED
          ? 'Your drawing is autosaved on this device and restored when you reopen.'
          : 'Autosave is not available in this browser. Please save manually from Save / Export.'
      );
      setLocalizedHtmlContent(
        '#startupLensHint',
        '写真をドット絵変換するなら <a href="../pixiee-lens/index.html" target="_blank" rel="noopener">PiXiEELENS</a>',
        'Convert photos to pixel art with <a href="../pixiee-lens/index.html" target="_blank" rel="noopener">PiXiEELENS</a>.'
      );
      setLocalizedTextContent('#updateToastCloseBtn', '閉じる', 'Close');
  
      applyTabLocalization();
      applyTopActionLocalization();
      applyToolLocalization();
  
      setLocalizedAttribute('#panelFrames .timeline-card', 'aria-label', 'レイヤーとフレームのタイムライン', 'Layer/Frame Timeline');
      setLocalizedAttribute('#panelFrames .timeline-toolbar__group--layer', 'aria-label', 'レイヤー操作', 'Layer Actions');
      setLocalizedAttribute('#panelFrames .timeline-toolbar__group--frame', 'aria-label', 'フレーム操作', 'Frame Actions');
      setLocalizedAttribute('#timelineMatrix', 'aria-label', 'フレームとレイヤーの一覧', 'Frame and Layer List');
      setLocalizedAttribute('#panelFrames .timeline-playback', 'aria-label', '再生ボタン群', 'Playback Controls');
      setLocalizedAttribute('#panelFrames .timeline-fps', 'aria-label', 'フレームレート設定', 'Frame Rate Settings');
      setLocalizedTextContent('#panelFrames .timeline-toolbar__group--layer .timeline-toolbar__label', 'レイヤー', 'Layers');
      setLocalizedTextContent('#panelFrames .timeline-toolbar__group--frame .timeline-toolbar__label', 'フレーム', 'Frames');
      setLocalizedTextContent('#applyFpsAll', '全体適用', 'Apply All');
      setLocalizedAttribute('#addLayer', 'aria-label', 'レイヤーを追加', 'Add layer');
      setLocalizedAttribute('#removeLayer', 'aria-label', 'レイヤーを削除', 'Remove layer');
      setLocalizedAttribute('#moveLayerUp', 'aria-label', '選択中のレイヤーを上に移動', 'Move selected layer up');
      setLocalizedAttribute('#moveLayerDown', 'aria-label', '選択中のレイヤーを下に移動', 'Move selected layer down');
      setLocalizedAttribute('#addFrame', 'aria-label', 'フレームを追加', 'Add frame');
      setLocalizedAttribute('#removeFrame', 'aria-label', 'フレームを削除', 'Remove frame');
      setLocalizedAttribute('#moveFrameUp', 'aria-label', '選択中のフレームを左に移動', 'Move selected frame left');
      setLocalizedAttribute('#moveFrameDown', 'aria-label', '選択中のフレームを右に移動', 'Move selected frame right');
      setLocalizedAttribute('#rewindAnimation', 'aria-label', '現在レイヤーの先頭フレームへ', 'Go to first frame on current layer');
      setLocalizedAttribute('#playAnimation', 'aria-label', '再生', 'Play');
      setLocalizedAttribute('#stopAnimation', 'aria-label', '停止', 'Stop');
      setLocalizedAttribute('#forwardAnimation', 'aria-label', '現在レイヤーの末尾フレームへ', 'Go to last frame on current layer');
      setLocalizedAttribute('#loopAnimation', 'aria-label', 'ループ再生', 'Loop playback');
      setLocalizedAttribute('#selectionTransformMenu', 'aria-label', '範囲選択の反転メニュー', 'Selection Flip Menu');
      setLocalizedAttribute('#selectionFlipHorizontal', 'aria-label', '選択範囲を左右反転', 'Flip selection horizontally');
      setLocalizedAttribute('#selectionFlipVertical', 'aria-label', '選択範囲を上下反転', 'Flip selection vertically');
      setLocalizedTextContent('#selectionFlipHorizontal', '左右反転', 'Flip H');
      setLocalizedTextContent('#selectionFlipVertical', '上下反転', 'Flip V');
      setLocalizedAttribute('#applyFpsAll', 'aria-label', '全フレームに現在の fps を適用', 'Apply current fps to all frames');
      setLocalizedAttribute('#timelineLayerSettings', 'aria-label', '選択中レイヤー設定', 'Selected Layer Settings');
      setLocalizedAttribute('#timelineFrameSettings', 'aria-label', '選択中フレーム設定', 'Selected Frame Settings');
      setLocalizedControlLabel('layerOpacity', '不透明度', 'Opacity');
      setLocalizedControlLabel('layerBlendMode', '合成モード', 'Blend Mode');
      setLocalizedControlLabel('onionSkinEnabled', 'オニオンスキン', 'Onion Skin');
      setLocalizedControlLabel('onionPrevFrames', '前フレーム', 'Prev Frames');
      setLocalizedControlLabel('onionNextFrames', '次フレーム', 'Next Frames');
      setLocalizedControlLabel('onionOpacity', '濃さ', 'Strength');
      setLocalizedAttribute('#onionSkinEnabled', 'aria-label', 'オニオンスキンを有効化', 'Enable onion skin');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'normal', '通常', 'Normal');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'multiply', '乗算', 'Multiply');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'screen', 'スクリーン', 'Screen');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'overlay', 'オーバーレイ', 'Overlay');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'soft-light', 'ソフトライト', 'Soft Light');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'hard-light', 'ハードライト', 'Hard Light');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'darken', '比較(暗)', 'Darken');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'lighten', '比較(明)', 'Lighten');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'color-dodge', '覆い焼きカラー', 'Color Dodge');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'color-burn', '焼き込みカラー', 'Color Burn');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'difference', '差の絶対値', 'Difference');
      setLocalizedSelectOption(dom.controls.layerBlendMode, 'exclusion', '除外', 'Exclusion');
  
      setLocalizedTextContent('#multiEntryMasterTitle', '共有', 'Share');
      setLocalizedTextContent('#multiEntryMasterMeta', '空欄なら作成、リンクなら開く', 'Create if empty, open if link pasted');
      setLocalizedTextContent('#multiEntryGuestTitle', '共有を開く', 'Open Shared');
      setLocalizedTextContent('#multiEntryGuestMeta', '共有リンクを貼り付け', 'Paste invite link');
      setLocalizedTextContent('#multiEntryJoinAsGuestTitle', '共有を開く', 'Open Shared Project');
      setLocalizedTextContent('#multiEntryJoinAsGuestMeta', '共有プロジェクトをそのまま開く', 'Open the shared project directly');
      setLocalizedTextContent('#multiEntrySpectatorTitle', '視聴で入る', 'Join as Viewer');
      setLocalizedTextContent('#multiEntrySpectatorMeta', '見るだけで入室', 'View-only mode');
      setLocalizedTextContent('#multiEntryJoinBack', '戻る', 'Back');
      setLocalizedTextContent('#multiToggleCodeVisibility', '表示', 'Show');
      setLocalizedTextContent('#multiApplyAccessCode', '確定', 'Apply');
      setLocalizedTextContent('#multiCopyAccessCode', 'コピー', 'Copy');
      setLocalizedSelectOption(dom.newProject?.createMode, 'local', '通常', 'Normal');
      setLocalizedSelectOption(dom.newProject?.createMode, 'shared', '共有', 'Shared');
      setLocalizedToggleLabel('multiDanmakuToggle', 'コメント弾幕', 'Comment Overlay');
      setLocalizedTextContent('#multiCommentSend', '送信', 'Send');
      setLocalizedTextContent('#multiLeaveSession', '切断', 'Disconnect');
      setLocalizedControlLabel('multiJoinProjectKey', '共有リンク / 招待コード', 'Invite Link / Code');
      setLocalizedControlLabel('multiProjectKey', '共有リンク / 招待コード', 'Invite Link / Code');
      setLocalizedTextContent('#multiProjectKeyFieldLabel', '共有リンク / 招待コード', 'Invite Link / Code');
      setLocalizedTextContent('#multiProjectKeyFieldHint', '空欄のまま下の共有ボタンを押すと、新しい共有プロジェクトを作成します。', 'Press Share below with an empty field to create a new shared project.');
      setLocalizedTextContent('#multiCopyKey', 'コピー', 'Copy');
      setLocalizedAttribute('#multiCopyKey', 'aria-label', '共有リンクまたは共有IDをコピー', 'Copy invite link or shared ID');
      setLocalizedAttribute('#multiCopyKey', 'title', '共有リンクまたは共有IDをコピー', 'Copy invite link or shared ID');
      setLocalizedTextContent('#panelMulti .multi-master-actions > span', '共有', 'Share');
      setLocalizedTextContent('#multiBroadcastState', '全員に同期', 'Sync to All');
      setLocalizedTextContent('#multiBroadcastStateLabel', '再同期', 'Resync');
      setLocalizedTextContent('#multiBroadcastStateHint', '表示ずれや割り当て反映ずれが起きた時だけ使います。', 'Use this only when displays or assignment updates fall out of sync.');
      setLocalizedTextContent('#multiInviteCopy', '共有URLをコピー', 'Copy Shared URL');
      setLocalizedTextContent('#multiInviteShare', '招待を共有', 'Share Invite');
      setLocalizedTextContent('#multiRequestGuestRole', 'そのまま編集できます', 'Edit Immediately');
      setLocalizedTextContent('#multiJoinRequestHint', '共有リンクを開いた人は、そのまま編集できます。', 'Anyone who opens the invite link can edit immediately.');
      setLocalizedTextContent('#multiStatus', '共有リンクを作成', 'Create Shared Link');
      setLocalizedTextContent('#multiFlowTabCollabLabel', '共同', 'Collab');
      setLocalizedTextContent('#multiFlowTabCommentsLabel', 'コメント', 'Comments');
      setLocalizedTextContent('#multiParticipantsPanelTabLabel', '参加者一覧', 'Participants');
      setLocalizedTextContent('#multiCommentsPanelTabLabel', 'コメント', 'Comments');
      setLocalizedTextContent('#multiOverviewSummary', '共有リンクで開いたプロジェクトを、そのまま共同編集できます。', 'Projects opened from invite links can be edited together immediately.');
      setLocalizedTextContent('#multiOverviewHint', '描画はリアルタイム反映され、共有プロジェクトの最新状態が基準になります。', 'Drawing updates live, and the shared project snapshot stays the source of truth.');
      setLocalizedAttribute('#multiHelpToggle', 'aria-label', 'マルチ説明を表示', 'Show collab help');
      setLocalizedTextContent('#multiHelpPanel > span', 'マルチ説明', 'Collab Help');
      setLocalizedTextContent('#multiHelpPanel .help-text:nth-of-type(1)', '共有リンクを開いた人は、そのまま同じプロジェクトを編集できます。', 'Anyone who opens the invite link can edit the same project immediately.');
      setLocalizedTextContent('#multiHelpPanel .help-text:nth-of-type(2)', '描画はリアルタイム反映され、構造変更は共有スナップショット基準で同期されます。', 'Drawing updates live, and structure changes sync from the shared snapshot.');
      setLocalizedTextContent('#multiHelpPanel .help-text:nth-of-type(3)', '共有プロジェクトは自分のプロジェクト一覧にも残るので、あとから開き直せます。', 'Shared projects stay in your project list so you can reopen them later.');
      setLocalizedTextContent('#multiHelpPanel .help-text:nth-of-type(4)', '上の入力欄には共有リンクをそのまま貼り付けできます。', 'You can paste the full invite link directly into the field above.');
      setLocalizedTextContent('#multiHelpClose', '閉じる', 'Close');
      setLocalizedTextContent('#panelMulti .multi-master-advanced > summary', '部屋設定', 'Room Settings');
      setLocalizedTextContent('#multiParticipants .help-text', '未接続', 'Not connected');
      setLocalizedTextContent('#multiPresetFriends', '友達向け', 'Friends');
      setLocalizedTextContent('#multiPresetStream', '配信向け', 'Streaming');
      setLocalizedTextContent('#multiPresetHint', '友達向け: 自動参加 / 配信向け: 承認制', 'Friends: auto join / Streaming: approval');
      setLocalizedTextContent('#multiMasterAdvanced > summary', '詳細設定（必要なときだけ）', 'Advanced (Only When Needed)');
      setLocalizedTextContent('#panelMulti .multi-capacity-field > span', '参加管理', 'Participant Management');
      setLocalizedControlLabel('multiMaxGuests', '参加枠 (1〜3)', 'Participant Slots (1-3)');
      setLocalizedTextContent('#multiGuestCapacityHint', '参加枠: 0 / 1（無料は最大2人）', 'Participant slots: 0 / 1 (2 people max on free)');
      setLocalizedControlLabel('multiRoomVisibility', '作成する共有', 'Shared Project Type');
      setLocalizedTextContent('#multiRoomVisibilityHint', '限定はログイン後にコードまたはURLで参加できます。公開はURLからログインなしで参加できます。', 'Limited projects require sign-in to join by code or URL. Public projects can be joined from the URL without signing in.');
      setLocalizedControlLabel('multiExportPermission', '出力権限', 'Export Permission');
      setLocalizedControlLabel('multiJoinPolicy', '参加方式', 'Join Policy');
      setLocalizedTextContent('#multiJoinPolicyHint', '自動参加: 招待リンクは参加者入室になります。', 'Auto Join: invite link opens as participant join.');
      setLocalizedToggleLabel('multiParticipantFreeCellMove', '参加者が空きセルへ自由移動できるようにする', 'Allow participants to move to any free cell');
      setLocalizedTextContent('#multiParticipantFreeCellMoveHint', '同じセルへの同時参加はできません。', 'Two participants cannot use the same cell at the same time.');
      setLocalizedTextContent('#panelMulti .multi-join-requests-field > span', '参加一覧', 'Participants');
      setLocalizedControlLabel('multiJoinRequestTarget', '対象', 'Target');
      setLocalizedTextContent('#multiJoinRequestApprove', '承認', 'Approve');
      setLocalizedTextContent('#multiJoinRequestReject', '却下', 'Reject');
      setLocalizedTextContent('#panelMulti .multi-master-ops-toggle-field > span', '運営モード', 'Ops Mode');
      setLocalizedToggleLabel('multiMasterOpsMode', 'キック / BAN / 強制切替を表示', 'Show kick / ban / force role switch');
      setLocalizedTextContent('#multiMasterOpsHint', '通常はOFF推奨です。', 'OFF is recommended for normal use.');
      setLocalizedTextContent('#panelMulti .multi-role-control-field > span', '参加/視聴の切替', 'Participant/Viewer Switch');
      setLocalizedControlLabel('multiAssignTarget', '対象', 'Target');
      setLocalizedTextContent('#multiForceGuest', '参加者にする', 'Set Participant');
      setLocalizedTextContent('#multiForceSpectator', '視聴者にする', 'Set Viewer');
      setLocalizedTextContent('#panelMulti .multi-assignment-field > span', '参加者セル移動', 'Move Participant Cell');
      setLocalizedControlLabel('multiAssignFrame', 'フレーム', 'Frame');
      setLocalizedControlLabel('multiAssignLayer', 'レイヤー', 'Layer');
      setLocalizedTextContent('#multiAssignApply', '参加者を移動', 'Move Participant');
      setLocalizedTextContent('#multiAssignLockToggle', 'セルロック', 'Cell Lock');
      setLocalizedTextContent('#multiAssignKick', 'キック', 'Kick');
      setLocalizedTextContent('#multiAssignBan', 'BAN', 'Ban');
  
      setLocalizedTextContent('#goHomeButton span:last-child', 'ホーム', 'Home');
      setLocalizedTextContent('#goContestButton span:last-child', '広場', 'Plaza');
      setLocalizedTextContent('#pixieedAdFreeField > span', 'サポーター特典', 'Supporter Benefits');
      setLocalizedTextContent('#pixieedAdFreeStatus', 'サポーター特典は500円です。広告非表示を利用できます。', 'Supporter benefits are 500 yen and remove ads.');
      setLocalizedTextContent('#pixieedAdFreePurchase', 'サポーター特典を見る', 'View Supporter Benefits');
      setLocalizedTextContent('#multiEntryAccountCard .multi-account-card__head > span', '共有プロジェクトを作成', 'Create Shared Project');
      setLocalizedTextContent('#multiFlowAccountCard .multi-account-card__head > span', '共有プロジェクトを作成', 'Create Shared Project');
      setLocalizedTextContent('#multiEntryAccountLogin', 'ログインして共有を作成', 'Sign In to Create Shared Project');
      setLocalizedTextContent('#multiFlowAccountLogin', 'ログインして共有を作成', 'Sign In to Create Shared Project');
      setLocalizedTextContent('#multiSupportCard .multi-support-card__head > span', 'サポーター特典', 'Supporter Benefits');
      setLocalizedTextContent('#multiSupportPurchase', 'サポーター特典を見る', 'View Supporter Benefits');
      setLocalizedTextContent('#detailSupportPurchase span:last-child', 'サポーター特典', 'Supporter Benefits');
      setLocalizedTextContent('#supportTipLink', 'サポート', 'Support');
      setLocalizedAttribute('#supportTipLink', 'aria-label', 'サポーター特典を見る（外部サイト）', 'View supporter benefits (external site)');
      setLocalizedTextContent('#openOperationHelpPanel span:last-child', '使い方ヘルプ', 'Help');
      setLocalizedTextContent('#openShortcutHelp span:last-child', 'ショートカット一覧', 'Keyboard Shortcuts');
      setLocalizedTextContent('#openUpdateHistory span:last-child', '更新情報', 'Updates');
      setLocalizedTextContent('#pixieedAccountLabel', 'アカウント', 'Account');
      setLocalizedTextContent('#pixieedAccountLogin', 'ログイン', 'Sign In');
      setLocalizedTextContent('#pixieedAccountLogout', 'ログアウト', 'Sign Out');
      setLocalizedTextContent('#detailAccountActionLabel', 'ログイン', 'Sign In');
      setLocalizedTextContent('#pixieedAccountDock', 'ログイン', 'Sign In');
      setLocalizedTextContent('#pixieedPwaInstallField > span', 'アプリとして使う', 'Install as App');
      setLocalizedTextContent('#pixieedPwaInstallButton', 'インストール案内を開く', 'Open Install Guide');
  
      setLocalizedTextContent('#settingsSizeTitle', 'サイズ', 'Size');
      setLocalizedControlLabel('canvasWidth', 'X', 'X');
      setLocalizedControlLabel('canvasHeight', 'Y', 'Y');
      setLocalizedTextContent('#applyCanvasResize', '確定', 'Apply');
      setLocalizedTextContent('#canvasSizeHint', 'X/Y と倍率をまとめて調整', 'Adjust X/Y and scale together.');
      setLocalizedControlLabel('spriteScaleInput', '倍率', 'Scale');
      setLocalizedTextContent('#applySpriteScale', '適用', 'Apply');
      setLocalizedTextContent('#panelSettings .settings-color-mode-field > span', 'カラーモード', 'Color Mode');
      setLocalizedAttribute('#settingsColorModeSwitch', 'aria-label', 'カラーモード', 'Color Mode');
      setLocalizedTextContent('#colorModeIndexLabel', 'インデックスカラー', 'Indexed Color');
      setLocalizedTextContent('#colorModeRgbLabel', 'RGBカラー', 'RGB Color');
      setLocalizedTextContent('#settingsColorModeHint', 'インデックスカラーとRGBカラーを切り替えます。', 'Switch between Indexed Color and RGB Color.');
      setLocalizedTextContent('#toggleQrModeLabel', 'QRモード', 'QR Mode');
      setLocalizedTextContent('#sortPaletteHue', '色相', 'H');
      setLocalizedTextContent('#sortPaletteSaturation', '彩度', 'S');
      setLocalizedTextContent('#sortPaletteValue', '明度', 'V');
      setLocalizedAttribute('#sortPaletteHue', 'aria-label', '色相順でソート', 'Sort by hue');
      setLocalizedAttribute('#sortPaletteSaturation', 'aria-label', '彩度順でソート', 'Sort by saturation');
      setLocalizedAttribute('#sortPaletteValue', 'aria-label', '明度順でソート', 'Sort by value');
      setLocalizedAttribute('#movePaletteBackward', 'aria-label', '選択した色を前へ移動', 'Move selected color earlier');
      setLocalizedAttribute('#movePaletteForward', 'aria-label', '選択した色を後ろへ移動', 'Move selected color later');
      setLocalizedAttribute('#movePaletteBackward', 'title', '選択した色を前へ移動', 'Move selected color earlier');
      setLocalizedAttribute('#movePaletteForward', 'title', '選択した色を後ろへ移動', 'Move selected color later');
      setLocalizedControlLabel('palettePresetSelect', 'プリセット', 'Preset');
      setLocalizedAttribute('#palettePresetPickerButton', 'aria-label', 'パレットプリセットを選択', 'Choose palette preset');
      setLocalizedAttribute('#palettePresetPickerMenu', 'aria-label', 'プリセット一覧', 'Preset list');
      setLocalizedAttribute('#newProjectPalettePresetPickerButton', 'aria-label', '新規作成のパレットプリセットを選択', 'Choose new project palette preset');
      setLocalizedAttribute('#newProjectPalettePresetPickerMenu', 'aria-label', '新規作成プリセット一覧', 'New project preset list');
      renderColorPanelPalettePresetOptions(getCurrentPalettePresetId());
      renderPalettePresetPreview(getCurrentPalettePresetId());
      setLocalizedAttribute('#panelSettings .field.field--list[role="group"]', 'aria-label', '表示設定', 'Display Settings');
      setLocalizedToggleLabel('toggleGrid', 'グリッド', 'Grid');
      setLocalizedToggleLabel('toggleMajorGrid', 'メジャー', 'Major');
      setLocalizedToggleLabel('toggleChecker', '16px グレーチェック', '16px Checker');
      setLocalizedToggleLabel('settingDanmakuToggle', 'コメント弾幕', 'Comment Overlay');
      setLocalizedToggleLabel('togglePixelPreview', '1px ガイド', '1px Guide');
      setLocalizedToggleLabel('toggleVirtualCursor', '仮想カーソル', 'Virtual Cursor');
      setLocalizedToggleLabel('toggleFloatingPreview', '小窓プレビュー', 'Floating Preview');
      setLocalizedToggleLabel('toggleCanvasResizeHandles', 'キャンバスサイズつまみ', 'Canvas Resize Handles');
      setLocalizedTextContent('#localCanvasCountLabel', 'キャンバス数', 'Canvas Count');
      setLocalizedAttribute('#toggleLocalCanvas', 'aria-label', 'マルチキャンバス', 'Multi Canvas');
      setLocalizedAttribute('#toggleLocalCanvas', 'title', 'マルチキャンバス', 'Multi Canvas');
      setLocalizedAttribute('#removeLocalCanvas', 'aria-label', 'マルチキャンバスを減らす', 'Remove multi canvas');
      setLocalizedAttribute('#addLocalCanvas', 'aria-label', 'マルチキャンバスを増やす', 'Add multi canvas');
      setLocalizedAttribute('#removeLocalCanvas', 'title', 'マルチキャンバスを減らす', 'Remove multi canvas');
      setLocalizedAttribute('#addLocalCanvas', 'title', 'マルチキャンバスを増やす', 'Add multi canvas');
      setLocalizedTextContent('#voxelExtensionTitle', 'ボクセルモード', 'Voxel Mode');
      setLocalizedToggleLabel('toggleVoxelExtensionMode', 'ボクセルモード', 'Voxel Mode');
      setLocalizedTextContent('#voxelExtensionHint', 'ON にすると Front / Back / Left / Right / Top / Bottom の6面構成へ切り替わり、小窓プレビューを自動生成します。小窓をドラッグすると左右と上下に回転できます。', 'When enabled, the workspace switches to Front / Back / Left / Right / Top / Bottom and generates the floating preview automatically. Drag the floating preview to rotate horizontally and vertically.');
      setLocalizedAttribute('#toggleVoxelExtensionMode', 'aria-label', 'ボクセルモード', 'Voxel mode');
      setLocalizedControlLabel('voxelDisplayPx', '表示PX', 'Display PX');
      setLocalizedToggleLabel('toggleTimelapse', 'タイムラプス記録', 'Timelapse Recording');
      setLocalizedToggleLabel('toggleOnionSkin', 'オニオンスキン', 'Onion Skin');
      setLocalizedToggleLabel('toggleMirrorMode', 'ミラーモード', 'Mirror Mode');
      setLocalizedToggleLabel('mirrorAxisVertical', '左右対称', 'Vertical Mirror');
      setLocalizedToggleLabel('mirrorAxisHorizontal', '上下対称', 'Horizontal Mirror');
      setLocalizedToggleLabel('mirrorAxisDiagonalA', '斜め対称 (＼)', 'Diagonal Mirror (\\)');
      setLocalizedToggleLabel('mirrorAxisDiagonalB', '斜め対称 (/)', 'Diagonal Mirror (/)');
      setLocalizedTextContent('#mirrorAxisHelp', 'ミラーモード中はキャンバス周囲の＋で対称軸をON/OFFし、ONの軸はそのままドラッグして位置を動かせます。', 'When mirror mode is on, use the + handles around the canvas to turn axes on or off. Drag an active + handle to move that axis.');
      setLocalizedTextContent('.virtual-cursor-scale__label', '仮想カーソルボタンサイズ', 'Virtual Cursor Button Size');
      setLocalizedTextContent('#mobileDrawHelp', 'スマホ描画: 仮想カーソルをONにしてキャンバスをドラッグでカーソル移動、「描画」ボタン長押しで描画します（左半分=主色 / 右半分=副色）。選択範囲を移動する時は「移動」ツール、または選択ツールのまま選択範囲上で描画ボタンを長押しし、もう1本の指でキャンバスをドラッグします。2本指ドラッグ/ピンチで移動と拡大縮小ができます。', 'Mobile draw: turn on Virtual Cursor, drag the canvas to move the cursor, and long-press Draw to paint (left half = primary / right half = secondary). To move a selection, use Move, or keep a selection tool active, hold Draw on the selected area, and drag the canvas with a second finger. Use two fingers to pan and pinch zoom.');
      setLocalizedTextContent('#settingsDisplayHint', '背景とUI配色を切り替えます（描画色には影響しません）。', 'Switch the background and UI colors (does not change drawing colors).');
      setLocalizedAttribute('#toggleBackgroundMode', 'aria-label', '背景色を切り替え', 'Change background color');
      setLocalizedAttribute('#toggleBackgroundMode', 'title', '背景色を切り替え', 'Change background color');
      updatePixieedAccountUi();
  
      setLocalizedTextContent('#floatingDrawButton', '描画', 'Draw');
      setLocalizedAttribute('#floatingDrawButton', 'aria-label', '描画ボタン（左=主色 / 右=副色）', 'Draw button (left = primary / right = secondary)');
      setLocalizedAttribute('#floatingMovePad', 'aria-label', '選択範囲移動', 'Selection Move Pad');
      setLocalizedAttribute('#floatingMovePad [data-move-pad-dir="up"]', 'aria-label', '選択範囲を上へ移動', 'Move selection up');
      setLocalizedAttribute('#floatingMovePad [data-move-pad-dir="left"]', 'aria-label', '選択範囲を左へ移動', 'Move selection left');
      setLocalizedAttribute('#floatingMovePad [data-move-pad-dir="right"]', 'aria-label', '選択範囲を右へ移動', 'Move selection right');
      setLocalizedAttribute('#floatingMovePad [data-move-pad-dir="down"]', 'aria-label', '選択範囲を下へ移動', 'Move selection down');
      setLocalizedAttribute('#floatingPreviewPanel', 'aria-label', '小窓プレビュー', 'Floating Preview');
      setLocalizedTextContent('#floatingPreviewTabPreview', 'プレビュー', 'Preview');
      setLocalizedTextContent('#floatingPreviewTabReference', '参考画像', 'Reference');
      setLocalizedTextContent('#floatingPreviewReferenceEmpty', '参考画像を押して追加', 'Tap Reference to add images');
      setLocalizedAttribute('#floatingPreviewTabPreview', 'title', 'プレビュー表示', 'Show preview');
      setLocalizedAttribute('#floatingPreviewTabReference', 'title', '参考メディアを開く', 'Open reference media');
      setLocalizedAttribute('#floatingPreviewZoom', 'title', 'プレビューの拡大率', 'Preview zoom');
      setLocalizedAttribute('#floatingPreviewPanReset', 'title', 'プレビュー位置をリセット', 'Reset preview position');
      setLocalizedAttribute('#floatingPreviewPlay', 'aria-label', '再生', 'Play');
      setLocalizedAttribute('#floatingPreviewStop', 'aria-label', '停止', 'Stop');
      setLocalizedAttribute('#floatingPreviewCanvas', 'aria-label', '小窓プレビューキャンバス', 'Floating preview canvas');
      setLocalizedAttribute('#floatingPreviewResize', 'aria-label', 'プレビューパネルのサイズを変更', 'Resize preview panel');
      setLocalizedAttribute('#canvasResizeHandleStart', 'aria-label', 'キャンバス左上をドラッグしてサイズ変更', 'Drag top-left corner to resize canvas');
      setLocalizedAttribute('#canvasResizeHandleStart', 'title', 'キャンバス左上をドラッグしてサイズ変更', 'Drag top-left corner to resize canvas');
      setLocalizedAttribute('#canvasResizeHandleCorner', 'aria-label', 'キャンバス右下をドラッグしてサイズ変更', 'Drag bottom-right corner to resize canvas');
      setLocalizedAttribute('#canvasResizeHandleCorner', 'title', 'キャンバス右下をドラッグしてサイズ変更', 'Drag bottom-right corner to resize canvas');
      setLocalizedAttribute('#resizeLeftUnifiedSplit', 'aria-label', 'ツールとカラーの縦割合を変更', 'Resize tools and color split');
      setLocalizedTextContent('#mirrorToolPopover .mirror-tool-popover__header strong', '対称軸', 'Mirror Axes');
      setLocalizedTextContent('#mirrorToolPopoverClose', '閉じる', 'Close');
      setLocalizedAttribute('#mirrorToolPopoverClose', 'aria-label', '対称ポップアップを閉じる', 'Close mirror popup');
      setLocalizedTextContent('#mirrorToolPopoverHelp', 'ここでは対称軸だけを切り替えられます。ON/OFF は上部ボタンか設定のミラーモードから変更できます。', 'This popup only changes mirror axes. Turn mirror mode on or off from the top button or Settings > Mirror Mode.');
  
      setLocalizedTextContent('#newProject', '新規作成', 'New Project');
      setLocalizedTextContent('#openDocument', 'ファイルを開く', 'Open File');
      setLocalizedTextContent('#showLocalProjects', '端末内プロジェクト', 'Local Projects');
      setLocalizedTextContent('#exportProject', '保存/出力', 'Save / Export');
      setLocalizedTextContent('#clearCanvas', 'キャンバスをクリア', 'Clear Canvas');
      setLocalizedTextContent('.file-panel-summary .help-text:nth-child(1)', '自動保存: ON（この端末）', 'Autosave: ON (this device)');
      setLocalizedTextContent('.file-panel-summary .help-text:nth-child(2)', '配布用の保存は「保存/出力」から手動で行います。', 'Use "Save / Export" for distributable files.');
      setLocalizedTextContent('#fileContestPromoTitle', 'コンテスト投稿', 'Contest Posting');
      setLocalizedTextContent('#fileContestPromoDescription', '保存/出力の「保存完了後にコンテスト投稿画面へ移動する」をONにすると、そのまま投稿できます。', 'Turn on "Go to contest post screen after save" to move directly to contest posting.');
      setLocalizedTextContent('#openContestFromFilePanel', 'コンテストページを見る', 'Open Contest Page');
      setLocalizedTextContent('#timelapseSectionTitle', 'タイムラプス', 'Timelapse');
      setLocalizedTextContent('#timelapseClear', '記録クリア', 'Clear Record');
      setLocalizedControlLabel('timelapseFps', '再生FPS', 'Playback FPS');
      setLocalizedTextContent('#timelapseDescription', '記録ON時は描画履歴を自動記録します。出力は通常の「出力」ボタンから選択してください。', 'When recording is ON, drawing history is captured automatically. Export from the regular Save / Export dialog.');
      setLocalizedTextContent('#memoryClear', 'メモリ削除', 'Clear Memory');
  
      setLocalizedTextContent('#exportDialogTitle', '保存/出力形式', 'Save / Export');
      setLocalizedTextContent('label[for="exportFormat"] > .export-format-label', '形式', 'Format');
      setLocalizedSelectOption(dom.exportDialog?.format, 'png', 'PNG（画像）', 'PNG (Image)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'jpeg', 'JPEG（画像）', 'JPEG (Image)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'svg', 'SVG（画像）', 'SVG (Image)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'glb', 'GLB（推奨 / 3Dボクセル）', 'GLB (Recommended / 3D Voxel)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'gridpng', 'PNG（グリッド分割）', 'PNG (Grid Split)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'gif', 'GIF（アニメーション）', 'GIF (Animation)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'timelapse', 'タイムラプスGIF（記録）', 'Timelapse GIF');
      setLocalizedSelectOption(dom.exportDialog?.format, 'project', 'プロジェクト（.pixieedraw）', 'Project (.pixieedraw)');
      setLocalizedTextContent('label[for="exportFileNameBase"] > span', '出力名', 'Export Name');
      setLocalizedAttribute('#exportFileNameBase', 'placeholder', '例: my_artwork', 'e.g. my_artwork');
      setLocalizedTextContent('#exportFileNameHint', '拡張子は自動で付きます。同名がある場合は .1 .2 ... を付けて保存します。', 'Extension is added automatically. If the same name exists, .1 .2 ... will be appended.');
      setLocalizedTextContent('#exportScaleControls > span', '出力倍率', 'Output Scale');
      setLocalizedTextContent('label[for="exportScaleSlider"]', '倍率 (×)', 'Scale (×)');
      setLocalizedTextContent('#exportOriginalOptionRow span:not(.export-toggle-icon)', '原寸も追加', 'Original too');
      setLocalizedTextContent('#exportCompanionOptionRow span:not(.export-toggle-icon)', 'PiXiEEDファイルも保存', 'Save project file');
      setLocalizedTextContent('#exportSpriteMapCompanionOptionRow span:not(.export-toggle-icon)', 'SpriteMAP出力', 'SpriteMAP export');
      setLocalizedTextContent('#exportContestPostOptionRow span:not(.export-toggle-icon)', 'コンテスト投稿へ移動', 'Go to contest post');
      setLocalizedTextContent('#exportSpriteMapColorSpritesRow span:not(.export-toggle-icon)', 'カラースプライト出力', 'Color sprite export');
      setLocalizedTextContent('#exportGridSettings > span', 'グリッド分割 (PNG)', 'Grid Split (PNG)');
      setLocalizedControlLabel('exportGridWidth', '幅 (px)', 'Width (px)');
      setLocalizedControlLabel('exportGridHeight', '高さ (px)', 'Height (px)');
      setLocalizedTextContent('#exportGridHint', '分割順: 右上から左へ、次の段へ進みます（右→左、上→下）。分割サイズは原寸px基準です。', 'Split order: starts at top-right, moves right-to-left, then top-to-bottom. Split size uses source pixels.');
      setLocalizedTextContent('#confirmExport', '保存/出力', 'Save / Export');
      setLocalizedTextContent('#cancelExport', 'キャンセル', 'Cancel');
      setLocalizedTextContent('#exportAdContainer .export-ad__label', '広告', 'Ad');
      setLocalizedTextContent('#exportInterstitialTitle', '広告', 'Ad');
      setLocalizedAttribute('#closeExportInterstitial', 'aria-label', '広告を閉じる', 'Close ad');
      setLocalizedTextContent('#closeExportInterstitial', '閉じる', 'Close');
      setLocalizedTextContent('.export-interstitial__lead', '広告を閉じると出力を開始します。', 'Close the ad to start export.');
  
      syncNewProjectDialogModeText();
      setLocalizedTextContent('.new-project__name-field > span', 'ファイル名', 'File Name');
      setLocalizedControlLabel('newProjectWidth', '横', 'W');
      setLocalizedControlLabel('newProjectHeight', '縦', 'H');
      setLocalizedTextContent('.new-project__palette-field > span', 'パレット', 'Palette');
      renderNewProjectPalettePresetOptions(getNewProjectPalettePresetId());
      renderNewProjectPalettePresetPicker(getNewProjectPalettePresetId());
      setLocalizedTextContent('.new-project__mode-field > span', '作成モード', 'Create Mode');
      setLocalizedTextContent('#newProjectModeLocal', '通常', 'Normal');
      setLocalizedTextContent('#newProjectAdContainer .export-ad__label', '広告', 'Ad');
      setLocalizedTextContent('#cancelNewProject', 'キャンセル', 'Cancel');
      setLocalizedTextContent('#globalHistoryConfirmTitle', '全体Undo', 'Shared Undo');
      setLocalizedTextContent('#globalHistoryConfirmMessage', 'この操作はプロジェクト全体に反映されます。', 'This action updates the whole project.');
      setLocalizedTextContent('#globalHistoryConfirmDetail', '続ける前に内容を確認してください。', 'Check before continuing.');
      setLocalizedTextContent('#globalHistoryConfirmCancel', 'キャンセル', 'Cancel');
      setLocalizedTextContent('#globalHistoryConfirmConfirm', '全体Undoする', 'Run Shared Undo');
  
      setLocalizedTextContent('#shortcutHelpTitle', 'ショートカット一覧', 'Keyboard Shortcuts');
      setLocalizedTextContent('#closeShortcutHelp', '閉じる', 'Close');
      setLocalizedTextContent('#shortcutHelpAdContainer .export-ad__label', '広告', 'Ad');
      setLocalizedTextContent('#updateHistoryTitle', '更新情報', 'Updates');
      setLocalizedTextContent('#updateHistoryDialog .help-text', '直近1年の更新内容を表示しています。', 'Shows update notes for the past year.');
      setLocalizedTextContent('#updateHistoryAdContainer .export-ad__label', '広告', 'Ad');
      setLocalizedTextContent('#closeUpdateHistory', '閉じる', 'Close');
      setLocalizedTextContent('#toolSpotlightTitle', '他ツールの紹介', 'More Tools');
      setLocalizedTextContent('#toolSpotlightLead', '出力ありがとうございます。次に遊べる・使えるツールです。', 'Thanks for exporting. Here are tools you can try next.');
      setLocalizedTextContent('#toolSpotlightLensTitle', 'PiXiEELENS', 'PiXiEELENS');
      setLocalizedTextContent('#toolSpotlightLensDesc', 'カメラ画像をドット化できるツール。撮影してそのまま編集導線につなげられます。', 'Turn camera images into pixel art and continue straight into editing.');
      setLocalizedTextContent('#toolSpotlightContestTitle', 'PiXiEEDコンテスト', 'PiXiEED Contest');
      setLocalizedTextContent('#toolSpotlightContestDesc', '保存した作品を投稿して、みんなの作品もチェックできます。', 'Post your saved artwork and browse creations from everyone.');
      setLocalizedTextContent('#toolSpotlightTipTitle', 'サポート', 'Support');
      setLocalizedTextContent('#toolSpotlightTipDesc', 'みんなの応援でPiXiEEDは成長することができます。', 'PiXiEED grows with everyone’s support.');
      setLocalizedTextContent('#toolSpotlightGoHome', 'ホームへ戻る', 'Back to Home');
      setLocalizedTextContent('#toolSpotlightOpenContest', '広場を見る', 'View Plaza');
      setLocalizedTextContent('#loginPromptTitle', 'ログイン', 'Sign In');
      setLocalizedTextContent('#loginPromptLead', 'ログインすると、プロフィール共有、端末間の引き継ぎ、ログイン限定機能を利用できます。', 'Sign in to sync your profile, carry it to other devices, and use account-only features.');
      setLocalizedTextContent('#loginPromptGoHome', 'マイページでログイン', 'Open My Page Login');
      setLocalizedTextContent('#closeLoginPrompt', '閉じる', 'Close');
      setLocalizedTextContent('#closeToolSpotlight', '閉じる', 'Close');
      setLocalizedTextContent('#helpPanelTitle', '使い方ヘルプ', 'Help');
      setLocalizedTextContent('#helpPanelLead', '操作方法を検索できます。必要なキーワードを入力してください。', 'Search operation guides by keyword.');
      setLocalizedTextContent('#helpSearchLabel', '検索', 'Search');
      setLocalizedAttribute('#helpSearchInput', 'placeholder', '例: 選択移動 / ミラー / GIF / マルチ', 'e.g. selection move / mirror / gif / collab');
      setLocalizedTextContent('#helpSearchHint', '検索は日本語/英語どちらでも使えます。', 'Search works with both Japanese and English terms.');
      setLocalizedTextContent('#toggleInlineHelpLabel', '画面内の説明ラベルを表示', 'Show inline guide labels');
      setLocalizedTextContent('#helpClearSearch', 'クリア', 'Clear');
      setLocalizedTextContent('#helpNoResults', '一致する項目はありません。', 'No matching guides found.');
      renderHelpGuideEntries();
      applyHelpGuideSearchFilter();
  
      renderMirrorToolPopover();
      syncMirrorToolPopoverControls();
      updateExportDestinationLabel();
      updateExportFolderButtonLabel();
      updateExportScaleHint();
      renderOpenProjectTabs();
    }
  
  
    function refreshLocalizedUi() {
      applyUiLocalization();
      syncSupportTipVisibility();
      syncControlsWithState();
      renderColorPanelPalettePresetOptions(getCurrentPalettePresetId());
      renderPalettePresetPreview(getCurrentPalettePresetId());
      renderNewProjectPalettePresetOptions(getNewProjectPalettePresetId());
      renderNewProjectPalettePresetPicker(getNewProjectPalettePresetId());
      const cachedEntries = Array.from(recentProjectsCache.values());
      syncStartupResumeState(cachedEntries);
      scheduleRecentProjectsListRender(cachedEntries, { immediate: true, force: true });
    }
  
  
    function setUiLanguage(nextLanguage, { persist = true } = {}) {
      const normalized = normalizeUiLanguage(nextLanguage, getUiLanguage());
      if (normalized === getUiLanguage()) {
        refreshLocalizedUi();
        return;
      }
      setUiLanguageValue(normalized);
      setDocumentLanguage();
      if (persist) {
        storeUiLanguage(normalized);
      }
      refreshLocalizedUi();
    }
  
  
    function syncSupportTipVisibility() {
      const hidden = isNativeAppRuntime() || STREAMING_HIDE_MONETIZATION_UI;
      if (dom.controls.supportTipLink instanceof HTMLElement) {
        dom.controls.supportTipLink.hidden = hidden;
        dom.controls.supportTipLink.setAttribute('aria-hidden', String(hidden));
      }
      if (dom.controls.adFreeField instanceof HTMLElement) {
        dom.controls.adFreeField.hidden = hidden;
        dom.controls.adFreeField.setAttribute('aria-hidden', String(hidden));
      }
      const spotlightTip = dom.toolSpotlight?.supportTip;
      if (spotlightTip instanceof HTMLElement) {
        spotlightTip.hidden = hidden;
        spotlightTip.setAttribute('aria-hidden', String(hidden));
      }
    }
  
  
    return {
      applyTabLocalization,
      applyTopActionLocalization,
      applyToolLocalization,
      applyUiLocalization,
      refreshLocalizedUi,
      setUiLanguage,
      syncSupportTipVisibility,
    };
  }

  root.uiLocalizationUtils = {
    createUiLocalizationUtils,
  };
})();
