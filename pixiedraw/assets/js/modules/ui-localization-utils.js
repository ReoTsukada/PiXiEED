(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createUiLocalizationUtils({
    AUTOSAVE_SUPPORTED,
    STREAMING_HIDE_MONETIZATION_UI,
    TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE,
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
        multi: { ja: 'シェアプロジェクト', en: 'Share Project', zh: '共享项目' },
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
        ellipse: { ja: '丸', en: 'Circle', zh: '圆' },
        ellipseFill: { ja: '塗り丸', en: 'Filled Circle', zh: '填充圆' },
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
  
      setLocalizedTextContent('#startupScreenTitle', 'プロジェクト', 'Projects');
      setLocalizedTextContent('.startup-screen__subtitle', 'PiXiEEDraw', 'PiXiEEDraw');
      setLocalizedTextContent('#startupActionNew', '新規作成', 'New Project');
      setLocalizedTextContent('#startupActionOpen', 'ファイルを開く', 'Open File');
      setLocalizedTextContent('#startupWorkspaceTitle', '端末内プロジェクト', 'On-device projects');
      setLocalizedAttribute('#startupWorkspaceSearch', 'placeholder', 'プロジェクト名を検索', 'Search projects');
      setLocalizedTextContent('#startupWorkspaceConnect', 'PiXiEEDフォルダに接続', 'Connect PiXiEED Folder');
      setLocalizedTextContent('#startupActionSkip', '編集へ戻る', 'Back to editor');
      setLocalizedTextContent('#globalLoadingIndicatorCancel', 'キャンセル', 'Cancel');
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
  
      setLocalizedSelectOption(dom.newProject?.createMode, 'local', '通常', 'Normal');
      setLocalizedTextContent('#goHomeButton span:last-child', 'ホーム', 'Home');
      setLocalizedTextContent('#detailSupportPurchase span:last-child', '利用可能', 'Available');
      setLocalizedTextContent('#supportTipLink', 'サポート', 'Support');
      setLocalizedAttribute('#supportTipLink', 'aria-label', 'サポート', 'Support');
      setLocalizedTextContent('#openOperationHelpPanel span:last-child', '使い方ヘルプ', 'Help');
      setLocalizedTextContent('#openShortcutHelp span:last-child', 'ショートカット一覧', 'Keyboard Shortcuts');
      setLocalizedTextContent('#openUpdateHistory > span:first-child', '更新情報', 'Updates');
      setLocalizedTextContent('#openUpdateHistory .detail-panel__notice', '新着', 'New');
      setLocalizedTextContent('#pixieedAccountLabel', 'アカウント', 'Account');
      setLocalizedTextContent('#pixieedAccountLogin', 'ログイン', 'Sign In');
      setLocalizedTextContent('#pixieedAccountLogout', 'ログアウト', 'Sign Out');
      setLocalizedTextContent('#detailAccountActionLabel', 'ログイン', 'Sign In');
      setLocalizedTextContent('#pixieedAccountDock', 'ログイン', 'Sign In');
      setLocalizedTextContent('#pixieedPwaInstallField > span', 'アプリとして使う', 'Install as App');
      setLocalizedTextContent('#pixieedPwaInstallButton', 'インストール案内を開く', 'Open Install Guide');
  
      setLocalizedTextContent('#settingsSizeTitle', 'キャンバスを広げる・切り取る', 'Extend or Crop Canvas');
      setLocalizedTextContent('#applySpriteScale', 'サイズを適用', 'Apply Size');
      setLocalizedTextContent('#resetCanvasResize', '変更を戻す', 'Reset Changes');
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
      setLocalizedTextContent('#voxelExtensionTitle', 'ボクセルモード', 'Voxel Mode');
      setLocalizedToggleLabel('toggleVoxelExtensionMode', 'ボクセルモード', 'Voxel Mode');
      setLocalizedTextContent('#voxelExtensionHint', 'ON にすると Front / Back / Left / Right / Top / Bottom の6面構成へ切り替わり、小窓プレビューを自動生成します。小窓をドラッグすると左右と上下に回転できます。', 'When enabled, the workspace switches to Front / Back / Left / Right / Top / Bottom and generates the floating preview automatically. Drag the floating preview to rotate horizontally and vertically.');
      setLocalizedAttribute('#toggleVoxelExtensionMode', 'aria-label', 'ボクセルモード', 'Voxel mode');
      setLocalizedControlLabel('voxelDisplayPx', '表示PX', 'Display PX');
      setLocalizedToggleLabel('toggleOnionSkin', 'オニオンスキン', 'Onion Skin');
      setLocalizedToggleLabel('toggleMirrorMode', 'ミラーモード', 'Mirror Mode');
      setLocalizedToggleLabel('mirrorAxisVertical', '左右対称', 'Vertical Mirror');
      setLocalizedToggleLabel('mirrorAxisHorizontal', '上下対称', 'Horizontal Mirror');
      setLocalizedToggleLabel('mirrorAxisDiagonalA', '斜め対称 (＼)', 'Diagonal Mirror (\\)');
      setLocalizedToggleLabel('mirrorAxisDiagonalB', '斜め対称 (/)', 'Diagonal Mirror (/)');
      setLocalizedTextContent('#mirrorAxisHelp', 'ミラーモード中はキャンバス周囲の＋で対称軸をON/OFFし、ONの軸はそのままドラッグして位置を動かせます。', 'When mirror mode is on, use the + handles around the canvas to turn axes on or off. Drag an active + handle to move that axis.');
      setLocalizedTextContent('.virtual-cursor-scale__label', '仮想カーソルボタンサイズ', 'Virtual Cursor Button Size');
      setLocalizedTextContent('#mobileDrawHelp', 'スマホ描画: 仮想カーソルをONにしてキャンバスをドラッグでカーソル移動。描画ボタンは左=主色、右=副色です。長押しで描画し、ドラッグするとボタンを移動できます。選択範囲を移動する時は「移動」ツール、または選択ツールのまま選択範囲上で描画ボタンを長押しし、もう1本の指でキャンバスをドラッグします。2本指ドラッグ/ピンチで移動と拡大縮小ができます。', 'Mobile draw: turn on Virtual Cursor and drag the canvas to move the cursor. The left half of Draw uses the primary color and the right half uses the secondary color. Long-press to draw; drag the button to move it. To move a selection, use Move, or keep a selection tool active, hold Draw on the selected area, and drag the canvas with a second finger. Use two fingers to pan and pinch zoom.');
      setLocalizedTextContent('#settingsDisplayHint', '背景とUI配色を切り替えます（描画色には影響しません）。', 'Switch the background and UI colors (does not change drawing colors).');
      setLocalizedAttribute('#toggleBackgroundMode', 'aria-label', '背景色を切り替え', 'Change background color');
      setLocalizedAttribute('#toggleBackgroundMode', 'title', '背景色を切り替え', 'Change background color');
      updatePixieedAccountUi();
  
      setLocalizedTextContent('#floatingDrawButton .floating-draw-button__side--primary .floating-draw-button__side-key', '左', 'Left');
      setLocalizedTextContent('#floatingDrawButton .floating-draw-button__side--primary .floating-draw-button__side-label', '主', 'Primary');
      setLocalizedTextContent('#floatingDrawButton .floating-draw-button__side--secondary .floating-draw-button__side-key', '右', 'Right');
      setLocalizedTextContent('#floatingDrawButton .floating-draw-button__side--secondary .floating-draw-button__side-label', '副', 'Secondary');
      setLocalizedAttribute('#floatingDrawButton', 'aria-label', '描画ボタン。左半分で主色、右半分で副色を描画', 'Draw button. Left half uses the primary color; right half uses the secondary color.');
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
      setLocalizedTextContent('#showLocalProjects', 'プロジェクト一覧', 'Projects');
      setLocalizedTextContent('#exportProject', '出力設定を開く', 'Open Export Settings');
      setLocalizedTextContent('#clearCanvas', 'キャンバスをクリア', 'Clear Canvas');
      setLocalizedTextContent('.file-panel-summary .help-text:nth-child(1)', '描画内容はこの端末に自動保存されます。', 'Drawing changes are autosaved on this device.');
      setLocalizedTextContent('.file-panel-summary .help-text:nth-child(2)', '外部ファイルへは自動出力しません。画像・GIF・PiXiEEDraw形式は出力パネルからダウンロードします。', 'Files are never exported automatically. Download images, GIFs, and PiXiEEDraw files from the Export panel.');

      setLocalizedTextContent('#exportDialogTitle', '出力設定', 'Export Settings');
      setLocalizedTextContent('#exportFormatPadTitle', '出力形式', 'Export format');
      setLocalizedSelectOption(dom.exportDialog?.format, 'png', 'PNG（画像）', 'PNG (Image)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'jpeg', 'JPEG（画像）', 'JPEG (Image)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'spritemap', 'SpriteMAP（並び画像）', 'SpriteMAP (Sprite sheet)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'svg', 'SVG（画像）', 'SVG (Image)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'glb', 'GLB（推奨 / 3Dボクセル）', 'GLB (Recommended / 3D Voxel)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'gridpng', 'PNG（グリッド分割）', 'PNG (Grid Split)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'gif', 'GIF（アニメーション）', 'GIF (Animation)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'batchzip', '選択形式ZIP', 'Selected formats ZIP');
      setLocalizedSelectOption(dom.exportDialog?.format, 'allzip', '全形式ZIP（時間・容量大）', 'All formats ZIP (Large)');
      setLocalizedSelectOption(dom.exportDialog?.format, 'project', 'プロジェクト（.pxd / V2）', 'Project (.pxd / V2)');
      setLocalizedTextContent('#exportBatchFormatOptions legend', 'ZIPに含める形式', 'Formats to include');
      setLocalizedTextContent('#exportBatchFormatHint', '必要な形式だけを1つのZIPにまとめます。選ばないGIF・SVG・JPEGは生成しません。', 'Bundle only the formats you select. GIF, SVG, and JPEG are not generated unless selected.');
      setLocalizedAttribute('#exportFormatHelpButton', 'aria-label', '出力形式の説明を開く', 'Open export format help');
      setLocalizedTextContent('#exportFormatHelp strong', '使い方', 'How it works');
      setLocalizedTextContent('label[for="exportFileNameBase"] > span', '出力名', 'Export Name');
      setLocalizedAttribute('#exportFileNameBase', 'placeholder', '例: my_artwork', 'e.g. my_artwork');
      setLocalizedTextContent('#exportFileNameHint', '拡張子は自動で付きます。保存先と同名処理はブラウザが案内します。', 'The extension is added automatically. Your browser handles the destination and duplicate names.');
      setLocalizedTextContent('#exportScaleControls > span', '出力倍率', 'Output Scale');
      setLocalizedTextContent('label[for="exportScaleSlider"]', '倍率 (×)', 'Scale (×)');
      setLocalizedTextContent('#exportOriginalOptionRow span:not(.export-toggle-icon)', '原寸も追加', 'Original too');
      setLocalizedTextContent('#exportCompanionOptionRow span:not(.export-toggle-icon)', 'PiXiEEDrawもダウンロード', 'Download PiXiEEDraw too');
      setLocalizedTextContent('#exportSpriteMapCompanionOptionRow span:not(.export-toggle-icon)', 'SpriteMAP出力', 'SpriteMAP export');
      setLocalizedTextContent('#exportGridSplitOptionRow span', 'グリッド分割', 'Grid split');
      setLocalizedTextContent('#exportSpriteMapColorSpritesRow span:not(.export-toggle-icon)', 'カラースプライト出力', 'Color sprite export');
      setLocalizedTextContent('#exportGridSettings > .export-option-icons__label', '1枚ごとの出力サイズ（px）', 'Output size per image (px)');
      setLocalizedControlLabel('exportGridWidth', '幅 (px)', 'Width (px)');
      setLocalizedControlLabel('exportGridHeight', '高さ (px)', 'Height (px)');
      setLocalizedTextContent('#exportGridHint', '分割順: 右上から左へ、次の段へ進みます（右→左、上→下）。分割サイズは原寸px基準です。', 'Split order: starts at top-right, moves right-to-left, then top-to-bottom. Split size uses source pixels.');
      setLocalizedTextContent('#confirmExport', 'この設定で出力', 'Export with These Settings');
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
      setLocalizedTextContent('#toolSpotlightTipTitle', 'サポート', 'Support');
      setLocalizedTextContent('#toolSpotlightTipDesc', 'みんなの応援でPiXiEEDは成長することができます。', 'PiXiEED grows with everyone’s support.');
      setLocalizedTextContent('#toolSpotlightGoHome', 'ホームへ戻る', 'Back to Home');
      setLocalizedTextContent('#loginPromptTitle', 'ログイン', 'Sign In');
      setLocalizedTextContent('#loginPromptLead', 'ログインすると、プロフィール共有、端末間の引き継ぎ、ログイン限定機能を利用できます。', 'Sign in to sync your profile, carry it to other devices, and use account-only features.');
      setLocalizedTextContent('#loginPromptGoHome', 'マイページでログイン', 'Open My Page Login');
      setLocalizedTextContent('#closeLoginPrompt', '閉じる', 'Close');
      setLocalizedTextContent('#closeToolSpotlight', '閉じる', 'Close');
      setLocalizedTextContent('#helpPanelTitle', '使い方ヘルプ', 'Help');
      setLocalizedTextContent('#helpPanelLead', '操作方法を検索できます。必要なキーワードを入力してください。', 'Search operation guides by keyword.');
      setLocalizedTextContent('#helpSearchLabel', '検索', 'Search');
      setLocalizedAttribute('#helpSearchInput', 'placeholder', '例: 選択移動 / ミラー / GIF', 'e.g. selection move / mirror / gif');
      setLocalizedTextContent('#helpSearchHint', '検索は日本語/英語どちらでも使えます。', 'Search works with both Japanese and English terms.');
      setLocalizedTextContent('#toggleInlineHelpLabel', '画面内の説明ラベルを表示', 'Show inline guide labels');
      setLocalizedTextContent('#helpClearSearch', 'クリア', 'Clear');
      setLocalizedTextContent('#helpNoResults', '一致する項目はありません。', 'No matching guides found.');
      setLocalizedTextContent('#closeOperationHelp', '閉じる', 'Close');
      renderHelpGuideEntries();
      applyHelpGuideSearchFilter();
  
      renderMirrorToolPopover();
      syncMirrorToolPopoverControls();
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
