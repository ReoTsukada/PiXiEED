/** Searchable keyboard command catalog for the draw editor. No artwork state is owned here. */
export const DRAW_SHORTCUTS_KEY = 'pixieed:draw:shortcuts:v1';
const command = (id, label, keywords, shortcut = null, options = {}) => ({ id, label, keywords, shortcut, repeat: false, ...options });
const toolNames = { pen: 'ペン', eraser: '消しゴム', fill: '塗りつぶし', line: '直線', rectangle: '四角形', rectangleFill: '塗り四角形', ellipse: '楕円', ellipseFill: '塗り楕円', spray: 'スプレー', select: '範囲選択・移動', picker: 'スポイト' };
const toolCommands = Object.entries(toolNames).map(([tool, label]) =>
  command(`tool.right.${tool}`, `右：${label}`, `${label} right 描画`, null));

export const DRAW_SHORTCUT_COMMANDS = Object.freeze([
  command('selection.copy', '選択をコピー', 'コピー clipboard', 'primary+KeyC', { canvasOnly: true }),
  command('selection.cut', '選択をカット', '切り取り clipboard', 'primary+KeyX', { canvasOnly: true }),
  command('selection.paste', 'このタブ内の絵を貼り付け', '貼付 clipboard', 'primary+KeyV', { canvasOnly: true }),
  command('selection.confirm', '選択の変形を確定', '選択 変形 commit', null),
  command('selection.operations', '選択の操作を開く', '選択 コピー 貼付 拡縮 回転 反転', null),
  command('selection.rotateLeft', '選択を左に90度回転', '選択 回転', null),
  command('selection.rotateRight', '選択を右に90度回転', '選択 回転', null),
  command('selection.flipX', '選択を左右反転', '選択 反転', null),
  command('selection.flipY', '選択を上下反転', '選択 反転', null),
  ...toolCommands,
  command('selection.cancel', '描画を取り消す・選択を解除', 'キャンセル escape selection', 'Escape', { fixed: true }),
  command('tool.left.pen', 'ペン', '描画 paint brush', 'KeyB', { aliases: ['KeyP'] }), command('tool.left.eraser', '消しゴム', '透明 削除 erase', 'KeyE'),
  command('tool.left.fill', '塗りつぶし', 'バケツ fill bucket', 'KeyG'), command('tool.left.line', '直線', '線 line', 'KeyL'),
  command('tool.left.rectangle', '四角形', '長方形 図形 rectangle', 'KeyR'), command('tool.left.rectangleFill', '塗り四角形', '四角形 塗りつぶし rectangle fill', 'shift+KeyR'),
  command('tool.left.ellipse', '楕円', '円 ellipse', 'KeyO'), command('tool.left.ellipseFill', '塗り楕円', '円 塗りつぶし ellipse fill', 'shift+KeyO'),
  command('tool.left.spray', 'スプレー', '散布 spray', 'KeyA'), command('tool.left.select', '範囲選択・移動', '選択 範囲 移動 select', 'KeyV'),
  command('tool.left.picker', 'スポイト', '色を取る picker eyedropper', 'KeyI'),
  command('mirror.horizontal', '左右対称', 'ミラー 水平 symmetry mirror', 'KeyM'),
  command('mirror.vertical', '上下対称', 'ミラー 垂直 symmetry'), command('mirror.diagonalDown', '右下がり対称', 'ミラー 対角線 symmetry'),
  command('mirror.diagonalUp', '右上がり対称', 'ミラー 対角線 symmetry'), command('mirror.center', 'ミラー中心を中央へ', '対称 中心 リセット'),
  command('toggle.grid', 'マス目の表示', 'グリッド 表示 grid'), command('toggle.onion', '前後のコマを重ねて表示', 'オニオン onion skin'),
  command('toggle.virtualCursor', '仮想カーソル', '仮想マウス ポインター virtual'),
  command('edit.undo', 'ひとつ戻す', '元に戻す undo', 'primary+KeyZ'),
  command('edit.redo', 'やり直す', 'redo', 'primary+shift+KeyZ'),
  command('edit.redoAlt', 'やり直す（別のキー）', 'redo', 'primary+KeyY', { hidden: true }),
  command('edit.clear', 'キャンバスを消去', '全消去 クリア clear erase'),
  command('view.zoomIn', '拡大', 'ズーム zoom', 'Equal', { aliases: ['shift+Equal'] }), command('view.zoomOut', '縮小', 'ズーム zoom', 'Minus'),
  command('view.reset', '全体を表示', 'ズーム リセット 100%', 'Digit0'),
  command('cursor.left', '仮想カーソルの左ボタン', 'クリック Enter', 'Enter', { canvasOnly: true, hold: true }),
  command('cursor.right', '仮想カーソルの右ボタン', '右クリック Shift Enter', 'shift+Enter', { canvasOnly: true, hold: true }),
  command('cursor.moveLeft', '仮想カーソルを左へ', '矢印 キーボード cursor', 'ArrowLeft', { canvasOnly: true, repeat: true }),
  command('cursor.moveRight', '仮想カーソルを右へ', '矢印 キーボード cursor', 'ArrowRight', { canvasOnly: true, repeat: true }),
  command('cursor.moveUp', '仮想カーソルを上へ', '矢印 キーボード cursor', 'ArrowUp', { canvasOnly: true, repeat: true }),
  command('cursor.moveDown', '仮想カーソルを下へ', '矢印 キーボード cursor', 'ArrowDown', { canvasOnly: true, repeat: true }),
  command('pan.hold', 'スペースを押しながら移動して画面を移動', 'キャンバス パン Space', 'Space', { canvasOnly: true, hold: true }),
  command('focus.palette', '色パレットへ移動', '色 パレット focus', null),
  command('focus.tools', '道具を選ぶ', '道具 ペン ツール focus', null), command('focus.settings', '描き方・表示の設定を開く', '設定 グリッド ミラー focus', null),
  command('focus.animation', 'レイヤー・コマを開く', 'アニメーション フレーム レイヤー focus', null), command('focus.fileMenu', 'ファイルを開く・保存する', 'ファイル PNG GIF PXD focus', null),
  command('focus.leftControls', '左ボタンのツールと色を編集', '左ボタン 色 ツール', null), command('focus.rightControls', '右ボタンのツールと色を編集', '右ボタン 色 ツール', null),
  command('controls.reset', '操作設定を初期値に戻す', '入力 操作 左右 リセット', null), command('focus.mirrorOriginX', 'ミラー中心Xを調整', '対称 中心 X slider', null), command('focus.mirrorOriginY', 'ミラー中心Yを調整', '対称 中心 Y slider', null),
  command('controls.left', '操作欄を左に配置', '配置 操作欄 左', null), command('controls.right', '操作欄を右に配置', '配置 操作欄 右', null),
  command('color.add', '色をパレットに追加', '色 パレット 新規', null),
  command('open.colorEditor', '現在の色を編集', '色 パレット カラー', null),
  command('open.canvasSettings', 'キャンバス設定', 'サイズ 幅 高さ resize', null), command('open.project', '作品を管理・開く', 'ファイル プロジェクト 読み込み 保存 PXD', null), command('project.save', 'プロジェクトをこのブラウザーに保存', '保存 project browser', null),
  command('open.copyLast', '前回の絵を複製', '前回 復元 copy last', null), command('open.resume', '前回の絵をひらく', '前回 復元 resume', null), command('open.importImage', '画像ファイルを開く', 'PNG WebP 読み込み 複製', null), command('export.png', '画像を保存（PNG）', '書き出し export', null),
  command('export.gif', 'アニメーションを保存（GIF）', '動画 書き出し export', null), command('export.timelapse', '描いた過程を保存', 'タイムラプス GIF export', null),
  command('export.timelapseDetail', '描いた過程を詳しく保存', 'タイムラプス GIF export', null), command('post.globe', '地球儀へ投稿', '投稿 globe', null),
  command('animation.play', 'アニメーションを再生・停止', '再生 playback', null), command('animation.workspace', 'レイヤー・コマを開く', 'アニメーション フレーム レイヤー', null),
  command('animation.previousFrame', '前のコマ', 'フレーム animation', 'BracketLeft'), command('animation.nextFrame', '次のコマ', 'フレーム animation', 'BracketRight'),
  command('animation.addFrame', 'コマを複製して追加', 'フレーム animation add', null), command('animation.addBlankFrame', '空のコマを追加', 'フレーム 白紙 blank animation', null), command('animation.deleteFrame', '選択中のコマを削除', 'フレーム animation delete', null),
  command('animation.moveFrameEarlier', 'コマを左へ移動', 'フレーム 並べ替え animation', null), command('animation.moveFrameLater', 'コマを右へ移動', 'フレーム 並べ替え animation', null),
  command('animation.addLayer', 'レイヤーを追加', 'animation layer add', null), command('animation.deleteLayer', '選択中のレイヤーを削除', 'animation layer delete', null),
  command('animation.renameLayer', 'レイヤー名を変更', 'animation layer rename', null), command('animation.previousLayer', '前のレイヤー', 'animation layer select', null), command('animation.nextLayer', '次のレイヤー', 'animation layer select', null),
  command('animation.moveLayerUp', 'レイヤーを上へ', 'animation layer order', null), command('animation.moveLayerDown', 'レイヤーを下へ', 'animation layer order', null),
  command('animation.toggleLayerVisibility', 'レイヤーの表示を切り替え', 'animation layer visibility', null), command('animation.toggleLayerLock', 'レイヤーのロックを切り替え', 'animation layer lock', null),
  command('animation.duration', 'コマの表示時間を編集', 'animation duration timing', null),
  command('shortcuts.open', 'ショートカット一覧を開く', 'キー 設定 ヘルプ shortcuts', 'Backslash', { launcher: true, aliases: ['shift+Slash'] })
]);
for (const item of DRAW_SHORTCUT_COMMANDS) {
  if (item.id.startsWith('tool.left.')) {
    const label = toolNames[item.id.slice('tool.left.'.length)];
    if (label) { item.label = `左：${label}`; item.keywords = `${item.keywords} left 左`; }
  }
}
const COMMANDS = new Map(DRAW_SHORTCUT_COMMANDS.map(item => [item.id, item]));
const MOD_ORDER = ['primary', 'ctrl', 'meta', 'alt', 'shift'];
const VALID_KEY = /^(?:Key[A-Z]|Digit[0-9]|Equal|Minus|Backslash|Slash|BracketLeft|BracketRight|Comma|Period|Semicolon|Quote|Backquote|Arrow(?:Up|Down|Left|Right)|Space|Enter|Escape|Tab|Delete|Backspace|F(?:[1-9]|1[0-2]))$/;
const RESERVED_KEYS = new Set(['Tab','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','Delete','Backspace']);
const RESERVED_PRIMARY = new Set(['KeyA','KeyB','KeyC','KeyD','KeyE','KeyF','KeyG','KeyH','KeyI','KeyJ','KeyK','KeyL','KeyM','KeyN','KeyO','KeyP','KeyQ','KeyR','KeyS','KeyT','KeyU','KeyV','KeyW','KeyX','Digit0','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Equal','Minus','BracketLeft','BracketRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);

export function detectDrawShortcutPlatform(nav = globalThis.navigator) {
  const value = nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(value) ? 'mac' : 'windows';
}
const CLIPBOARD_KEYS = new Map([['selection.copy', 'KeyC'], ['selection.cut', 'KeyX'], ['selection.paste', 'KeyV']]);
export function normalizeDrawShortcut(value, { commandId = null } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new TypeError('キーの形式が正しくありません');
  const parts = value.trim().split('+').map(part => part.trim()); const key = parts.pop();
  if (!VALID_KEY.test(key)) throw new TypeError('キーの形式が正しくありません');
  const mods = new Set(parts.map(part => part.toLowerCase()));
  if (mods.size !== parts.length || [...mods].some(part => !['primary','ctrl','meta','alt','shift'].includes(part))) throw new TypeError('修飾キーの形式が正しくありません');
  if (mods.has('primary') && (mods.has('ctrl') || mods.has('meta'))) throw new TypeError('修飾キーが重複しています');
  const primary = mods.has('primary') || mods.has('ctrl') || mods.has('meta');
  if (mods.has('ctrl') && mods.has('meta') || primary && mods.has('alt')) throw new TypeError('ブラウザーまたはOSが使うキーです');
  const selectionClipboard = primary && !mods.has('shift') && CLIPBOARD_KEYS.get(commandId) === key;
  if (RESERVED_KEYS.has(key) || (primary && RESERVED_PRIMARY.has(key) && !selectionClipboard) || (mods.has('alt') && (mods.has('ctrl') || key === 'ArrowLeft' || key === 'ArrowRight' || ['KeyF','KeyE','KeyD','KeyH','KeyV'].includes(key)))) throw new TypeError('ブラウザーまたはOSが使うキーです');
  if (key === 'Enter' && (primary || mods.has('alt'))) throw new TypeError('Enterは編集に使われます');
  if (key === 'Space' && (primary || mods.has('alt') || mods.has('shift'))) throw new TypeError('スペースはキャンバス移動に使います');
  return [...MOD_ORDER.filter(mod => mods.has(mod)), key].join('+');
}
function defaultsFor(platform) {
  const bindings = {};
  for (const item of DRAW_SHORTCUT_COMMANDS) if (item.shortcut) bindings[item.id] = normalizeDrawShortcut(item.shortcut, { commandId: item.id });
  if (platform === 'windows') bindings['edit.redo'] = bindings['edit.redoAlt'];
  delete bindings['edit.redoAlt']; return bindings;
}
function aliasesFor(item, binding, platform) {
  if (!item) return [];
  const defaultBinding = platform === 'windows' && item.id === 'edit.redo' ? 'primary+KeyY' : item.shortcut;
  if (!binding || binding !== defaultBinding) return [];
  const aliases = [...(item.aliases || [])];
  if (item.id === 'edit.redo' && platform === 'windows') aliases.push('primary+shift+KeyZ');
  if (item.canvasOnly && /^Arrow/.test(binding)) aliases.push('shift+' + binding);
  return aliases;
}
function shortcutOwners(bindings, platform) {
  const owners = new Map();
  for (const [id, key] of Object.entries(bindings)) {
    if (!key) continue;
    for (const binding of [key, ...aliasesFor(COMMANDS.get(id), key, platform)]) owners.set(binding.replace('primary+', platform === 'mac' ? 'meta+' : 'ctrl+'), id);
  }
  return owners;
}
function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
function cleanBindings(input, platform) {
  const bindings = defaultsFor(platform); if (!input || typeof input !== 'object' || Array.isArray(input)) return bindings;
  for (const [id, value] of Object.entries(input)) {
    if (!COMMANDS.has(id) || COMMANDS.get(id)?.fixed || id === 'shortcuts.open' || id === 'edit.redoAlt') continue;
    try {
      const key = normalizeDrawShortcut(value, { commandId: id }); if (!key) { if (!COMMANDS.get(id)?.fixed) bindings[id] = null; continue; }
      if (platform === 'mac' && (key === 'primary+KeyY' || key === 'meta+KeyY') || platform === 'windows' && key.split('+').includes('meta')) continue;
      if ((key === 'Space' || key.endsWith('+Space')) && !COMMANDS.get(id)?.canvasOnly) continue;
      if (key.endsWith('+Enter') || key === 'Enter') { if (!COMMANDS.get(id)?.canvasOnly || key !== 'Enter' && key !== 'shift+Enter') continue; }
      if (key === 'Escape' && id !== 'selection.cancel' || id === 'selection.cancel' && key !== 'Escape') continue;
      const other = shortcutOwners(bindings, platform).get(key.replace('primary+', platform === 'mac' ? 'meta+' : 'ctrl+')); if (other && other !== id) continue;
      bindings[id] = key;
    } catch { /* Bad saved values recover to that command's safe default. */ }
  }
  return bindings;
}
export function readDrawShortcutSettings(storage = safeStorage()) {
  const settings = { version: 1, bindings: { mac: defaultsFor('mac'), windows: defaultsFor('windows') }, recovered: false };
  try {
    const value = storage?.getItem(DRAW_SHORTCUTS_KEY); if (!value) return settings;
    let parsed;
    try { parsed = JSON.parse(value); } catch { settings.recovered = true; return settings; }
    if (parsed?.version !== 1 || !parsed.bindings || typeof parsed.bindings !== 'object') { settings.recovered = true; return settings; }
    for (const os of ['mac','windows']) settings.bindings[os] = cleanBindings(parsed.bindings[os], os);
  } catch { settings.recovered = true; /* Invalid or inaccessible storage restores defaults. */ }
  return settings;
}
export function writeDrawShortcutSettings(settings, storage = safeStorage()) {
  const value = { version: 1, bindings: { mac: cleanBindings(settings?.bindings?.mac, 'mac'), windows: cleanBindings(settings?.bindings?.windows, 'windows') } };
  if (!storage) return false;
  try { storage.setItem(DRAW_SHORTCUTS_KEY, JSON.stringify(value)); return true; } catch { return false; }
}
export function matchDrawShortcut(event, shortcut, platform = detectDrawShortcutPlatform(), commandId = null) {
  if (!shortcut) return false; let normalized;
  try { normalized = normalizeDrawShortcut(shortcut, { commandId }); } catch { return false; }
  const parts = normalized.split('+'); const key = parts.pop(); const primary = parts.includes('primary');
  return event.code === key && event.metaKey === (parts.includes('meta') || primary && platform === 'mac')
    && event.ctrlKey === (parts.includes('ctrl') || primary && platform !== 'mac')
    && event.altKey === parts.includes('alt') && event.shiftKey === parts.includes('shift');
}
export const isDrawShortcutEditableTarget = target => Boolean(target?.isContentEditable || target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]'));
const popupOpen = doc => Boolean(doc.querySelector('dialog[open], details[open], .draw-color-editor:not([hidden]), .animation-controls__workspace-panel:not([hidden]), body[data-tool-result-open], #pxd-panel[open], #pxd-panel:not(dialog):not([hidden])'));
export function shouldDispatchDrawShortcut(event, doc) {
  return !event?.defaultPrevented && !event?.isComposing && event?.keyCode !== 229
    && !isDrawShortcutEditableTarget(event?.target) && !popupOpen(doc);
}
export function isDrawShortcutCommandEligible(item, event) {
  return Boolean(item && event && (!event.repeat || item.repeat)
    && (!item.canvasOnly || event.target?.matches?.('#draw-canvas, .draw-board')));
}
const keyLabel = (shortcut, platform) => {
  if (!shortcut) return '未設定';
  const names = { primary: platform === 'mac' ? '⌘' : 'Ctrl', meta: '⌘', ctrl: 'Ctrl', alt: platform === 'mac' ? '⌥' : 'Alt', shift: platform === 'mac' ? '⇧' : 'Shift', Equal: '+', Minus: '−', Backslash: '\\', Slash: '?', BracketLeft: '[', BracketRight: ']', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  return shortcut.split('+').map(part => names[part] || part.replace(/^Key/, '').replace(/^Arrow/, '←')).join(platform === 'mac' ? '' : '+');
};

export function mountDrawShortcuts({ scope, root, onRun, getEnabled = () => true, onRelease = () => {}, beforeOpen = () => {}, storage, platform = detectDrawShortcutPlatform(), launcher = true } = {}) {
  if (!scope || !root || typeof onRun !== 'function') throw new TypeError('Shortcuts require scope, root, and onRun');
  const doc = root.ownerDocument, win = doc.defaultView, settings = readDrawShortcutSettings(storage);
  let dialog = null, previousFocus = null, disposed = false, editPlatform = platform; const held = new Map();
  const bindMap = () => settings.bindings[platform] || settings.bindings.windows;
  const editMap = () => settings.bindings[editPlatform] || settings.bindings.windows;
  const commands = DRAW_SHORTCUT_COMMANDS.filter(item => !item.hidden);
  const enabled = (item, event) => { try { return getEnabled(item.id, event) !== false; } catch { return false; } };
  function releaseAll(cancel = true, event) {
    for (const [code, id] of held) { try { onRelease(id, { cancel, event }); } catch {} held.delete(code); }
  }
  function invoke(id, event) {
    const item = COMMANDS.get(id); if (disposed || !item || !enabled(item, event)) return false;
    return onRun(id, event) !== false;
  }
  function invokeFromList(id, event) {
    const handled = invoke(id, event);
    if (handled && COMMANDS.get(id)?.hold) onRelease(id, { cancel: false, event });
    return handled;
  }
  function close() {
    if (!dialog) return; const active = dialog; dialog = null;
    if (active.open) active.close(); active.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); previousFocus = null;
  }
  function open() {
    if (disposed || dialog) { dialog?.querySelector('input[type="search"]')?.focus(); return; }
    releaseAll(true); beforeOpen(); previousFocus = doc.activeElement;
    const modal = doc.createElement('dialog'); modal.id = 'draw-shortcuts-dialog'; modal.className = 'draw-shortcuts-dialog'; modal.setAttribute('aria-labelledby', 'draw-shortcuts-title');
    const heading = doc.createElement('h2'); heading.id = 'draw-shortcuts-title'; heading.textContent = 'ショートカット';
    const osLabel = doc.createElement('label'); osLabel.htmlFor = 'draw-shortcuts-platform'; osLabel.textContent = '設定するOS';
    const os = doc.createElement('select'); os.id = 'draw-shortcuts-platform'; os.dataset.shortcutsPlatform = ''; os.setAttribute('aria-label', 'ショートカット設定のOS');
    for (const [value, label] of [['mac','macOS'], ['windows','Windows']]) { const option = doc.createElement('option'); option.value = value; option.textContent = label; os.append(option); }
    editPlatform = platform; os.value = editPlatform;
    const search = doc.createElement('input'); search.type = 'search'; search.autocomplete = 'off'; search.placeholder = '操作を検索'; search.setAttribute('aria-label', 'ショートカットを検索');
    const status = doc.createElement('p'); status.dataset.captureStatus = ''; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    if (settings.recovered) status.textContent = '保存データが読めないため、初期設定に戻しました。';
    const list = doc.createElement('div'); list.className = 'draw-shortcuts-list'; list.setAttribute('role', 'list');
    const reset = doc.createElement('button'); reset.type = 'button'; reset.dataset.shortcutsReset = ''; reset.textContent = 'このOSの設定を初期化';
    const closeButton = doc.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '×'; closeButton.setAttribute('aria-label', '閉じる');
    const head = doc.createElement('div'); head.className = 'draw-shortcuts-dialog__header'; head.append(heading, osLabel, os, closeButton);
    modal.append(head, search, status, list, reset); doc.body.append(modal); dialog = modal;
    let captureId = null;
    function render() {
      list.replaceChildren(); const query = search.value.trim().toLocaleLowerCase();
      for (const item of commands) {
        if (query && !`${item.label} ${item.keywords}`.toLocaleLowerCase().includes(query)) continue;
        const row = doc.createElement('div'); row.className = 'draw-shortcuts-row'; row.dataset.commandId = item.id; row.setAttribute('role', 'listitem');
        const label = doc.createElement('span'); label.className = 'draw-shortcuts-row__label'; label.textContent = item.label;
        const shortcut = editMap()[item.id]; const key = doc.createElement('kbd'); key.textContent = keyLabel(shortcut, editPlatform);
        const aliases = aliasesFor(item, shortcut, editPlatform);
        if (aliases.length) key.textContent += ` / ${aliases.map(alias => keyLabel(alias, editPlatform)).join(' / ')}`;

        key.setAttribute('aria-label', `現在のキー: ${key.textContent}`);
        const run = doc.createElement('button'); run.type = 'button'; run.dataset.commandRun = item.id; run.textContent = '実行'; run.setAttribute('aria-label', `${item.label}を実行`); run.disabled = !enabled(item);
        row.append(label, key, run);
        if (item.fixed || item.launcher) { const fixed = doc.createElement('span'); fixed.textContent = '固定'; row.append(fixed); }
        else {
          const edit = doc.createElement('button'); edit.type = 'button'; edit.textContent = '変更'; edit.dataset.capture = item.id; edit.setAttribute('aria-label', `${item.label}のキーを変更`);
          const unset = doc.createElement('button'); unset.type = 'button'; unset.textContent = '解除'; unset.dataset.unset = item.id; unset.setAttribute('aria-label', `${item.label}のキー設定を解除`); row.append(edit, unset);
        }
        list.append(row);
      }
      if (!list.childElementCount) { const empty = doc.createElement('p'); empty.textContent = '一致する操作がありません。'; list.append(empty); }
    }
    render(); search.addEventListener('input', render);
    search.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
      const query = search.value.trim().toLocaleLowerCase(); const item = query && commands.find(value => `${value.label} ${value.keywords}`.toLocaleLowerCase().includes(query));
      if (item && enabled(item, event)) { event.preventDefault(); event.stopPropagation(); close(); invokeFromList(item.id, event); }
    });
    list.addEventListener('click', event => {
      const runId = event.target.closest?.('[data-command-run]')?.dataset.commandRun;
      if (runId) { close(); invokeFromList(runId, event); return; }
      const unsetId = event.target.closest?.('[data-unset]')?.dataset.unset;
      if (unsetId) { editMap()[unsetId] = null; const saved = writeDrawShortcutSettings(settings, storage); status.textContent = saved ? 'ショートカットを解除しました。' : '保存できません。設定はこの画面でのみ有効です。'; render(); return; }
      const id = event.target.closest?.('[data-capture]')?.dataset.capture; if (!id) return;
      captureId = id; status.textContent = `${COMMANDS.get(id)?.label}：新しいキーを押してください。Escでキャンセルできます。`; event.target.focus();
    });
    list.addEventListener('keydown', event => {
      if (!captureId || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); captureId = null; status.textContent = '変更をキャンセルしました。'; return; }
      event.preventDefault(); event.stopPropagation();
      if (!event.code || ['Alt','Control','Meta','Shift'].includes(event.key)) { status.textContent = '修飾キーと文字キーを組み合わせてください。'; return; }
      if (event.ctrlKey && event.metaKey) { status.textContent = 'CtrlとCommandを同時に使う設定はできません。'; return; }
      const parts = [];
      if (event.metaKey && editPlatform === 'mac' || event.ctrlKey && editPlatform !== 'mac') parts.push('primary');
      else if (event.ctrlKey) parts.push('ctrl'); else if (event.metaKey) parts.push('meta');
      if (event.altKey) parts.push('alt'); if (event.shiftKey) parts.push('shift'); parts.push(event.code);
      let chord; try { chord = normalizeDrawShortcut(parts.join('+'), { commandId: captureId }); }
      catch (error) { status.textContent = `${error.message}。別のキーを選んでください。`; return; }
      if ((chord === 'Space' || chord.endsWith('+Space')) && !COMMANDS.get(captureId)?.canvasOnly) { status.textContent = 'スペースはキャンバス移動にだけ設定できます。'; return; }
      if (editPlatform === 'mac' && (chord === 'primary+KeyY' || chord === 'meta+KeyY') || editPlatform === 'windows' && chord.split('+').includes('meta')) { status.textContent = 'ブラウザーが使うキーです。別のキーを選んでください。'; return; }
      if (chord === 'Escape' || (/Enter$/.test(chord) && (!COMMANDS.get(captureId)?.canvasOnly || !['Enter', 'shift+Enter'].includes(chord)))) { status.textContent = 'このキーはキャンバス操作で使用中です。'; return; }
      const conflict = shortcutOwners(editMap(), editPlatform).get(chord.replace('primary+', editPlatform === 'mac' ? 'meta+' : 'ctrl+'));
      if (conflict && conflict !== captureId) { status.textContent = `「${COMMANDS.get(conflict)?.label || conflict}」で使用中です。先にその操作のキーを変更してください。`; return; }
      editMap()[captureId] = chord; const saved = writeDrawShortcutSettings(settings, storage); captureId = null; status.textContent = saved ? 'ショートカットを保存しました。' : '保存できません。設定はこの画面でのみ有効です。'; render();
    });
    os.addEventListener('change', () => { editPlatform = os.value; os.dataset.shortcutsPlatform = editPlatform; status.textContent = `${editPlatform === 'mac' ? 'macOS' : 'Windows'}の設定を表示しています。`; render(); });
    reset.addEventListener('click', () => { settings.bindings[editPlatform] = defaultsFor(editPlatform); const saved = writeDrawShortcutSettings(settings, storage); status.textContent = saved ? `${editPlatform === 'mac' ? 'macOS' : 'Windows'}のショートカットを初期化しました。` : '保存できません。設定はこの画面でのみ有効です。'; render(); });
    closeButton.addEventListener('click', close); modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.showModal?.(); if (!modal.open) modal.setAttribute('open', ''); search.focus();
  }
  function editorOwnsFocus(target) { return root.contains(target) || Boolean(target?.matches?.('#draw-canvas, .draw-board')); }
  function onKeydown(event) {
    if (event.repeat && held.has(event.code)) { event.preventDefault(); return; }
    if (disposed || !shouldDispatchDrawShortcut(event, doc) || dialog) return;
    if (!editorOwnsFocus(event.target)) return;
    if (launcher) {
      const launch = COMMANDS.get('shortcuts.open');
      const current = bindMap()[launch.id]; const aliasesActive = current === launch.shortcut;
      if (matchDrawShortcut(event, current, platform) || aliasesActive && launch.aliases.some(alias => matchDrawShortcut(event, alias, platform))) { event.preventDefault(); open(); return; }
    }
    for (const item of commands) {
      const chord = bindMap()[item.id]; if (!chord || item.launcher) continue;
      const defaultBinding = chord === (platform === 'windows' && item.id === 'edit.redo' ? 'primary+KeyY' : item.shortcut);
      const semanticAlias = defaultBinding && !event.ctrlKey && !event.metaKey && !event.altKey
        && ((item.id === 'view.zoomIn' && ['+', '='].includes(event.key))
          || (item.id === 'view.zoomOut' && event.key === '-')
          || (item.id === 'view.reset' && event.key === '0'));
      const matched = matchDrawShortcut(event, chord, platform, item.id)
        || aliasesFor(item, chord, platform).some(alias => matchDrawShortcut(event, alias, platform))
        || semanticAlias;
      if (!matched) continue;
      if (!isDrawShortcutCommandEligible(item, event)) continue;
      if (!enabled(item, event)) continue;
      const handled = invoke(item.id, event); if (!handled) continue;
      event.preventDefault(); if (item.hold && !event.repeat) held.set(event.code, item.id); return;
    }
  }
  function onKeyup(event) {
    const id = held.get(event.code); if (!id) return;
    held.delete(event.code); try { onRelease(id, { cancel: false, event }); } catch {}
  }
  scope.listen(doc, 'keydown', onKeydown, true); scope.listen(doc, 'keyup', onKeyup, true);
  scope.listen(win, 'blur', event => releaseAll(true, event)); scope.listen(win, 'pagehide', event => releaseAll(true, event));
  scope.listen(doc, 'focusin', event => { if (!event.target?.matches?.('#draw-canvas, .draw-board')) releaseAll(true, event); });
  scope.listen(doc, 'visibilitychange', event => { if (doc.hidden) releaseAll(true, event); });
  scope.listen(doc, 'toggle', event => { if (event.target?.matches?.('details[open]')) releaseAll(true, event); }, true);
  scope.add?.(() => { disposed = true; releaseAll(true); close(); });
  return { open, close, dispose: () => { disposed = true; releaseAll(true); close(); }, settings, platform, get isOpen() { return Boolean(dialog); }, getCommand: id => COMMANDS.get(id) || null, run: invoke };
}
