import { createDrawButtonContent } from './draw-button-content.mjs?rev=20261118-draw-button-label-1';
import {
  createNormalMap,
  convertPaintedNormalMap,
  encodeNormalMapPng,
  normalizeNormalMapSettings,
  renderNormalMapLighting
} from './draw-normal-map.mjs?rev=20261117-normal-apply-1';
import { quantizeNormalMapForAnimation } from './draw-normal-apply.mjs?rev=20261117-normal-apply-1';

const controlFields = {
  method: 'method', strength: 'strength', radius: 'radius', invertHeight: 'invert', format: 'format',
  azimuth: 'azimuth', elevation: 'elevation', ambient: 'ambient', intensity: 'intensity',
  lightColor: 'light-color', specular: 'specular', roughness: 'roughness',
  shadeUnpainted: 'shade-unpainted', initialFill: 'initial-fill', overlayOpacity: 'overlay-opacity', previewLighting: 'preview-lighting'
};
const numericFields = new Set(['strength', 'radius', 'azimuth', 'elevation', 'ambient', 'intensity', 'specular', 'roughness', 'overlayOpacity']);
const booleanFields = new Set(['invertHeight', 'shadeUnpainted', 'previewLighting']);
const rebuildFields = new Set(['method', 'strength', 'radius', 'invert', 'format']);
const lightPresets = {
  'upper-left': { azimuth: 225, elevation: 45 }, 'upper-right': { azimuth: 315, elevation: 45 },
  front: { azimuth: 315, elevation: 90 }, left: { azimuth: 180, elevation: 30 }, right: { azimuth: 0, elevation: 30 }
};

/** Normal preview/settings are separate from the artwork and exact normal PNG. */
export function mountDrawNormalMapPanel({ scope, host, getSource, getPaintedNormal = () => null, onEditNormal = null,
  getSettings = () => null, onSettingsChange = () => {}, onApplyNormal = null, onSavePng = null, beforeOpen = () => {}, isActive = () => true } = {}) {
  if (!scope?.listen || !scope?.add || typeof scope.disposed !== 'boolean') throw new TypeError('Normal map panel requires a lifecycle scope');
  if (!host || typeof getSource !== 'function') throw new TypeError('Normal map panel requires a host and image source');

  const doc = host.ownerDocument || globalThis.document, win = doc.defaultView || globalThis;
  const urls = win.URL || globalThis.URL;
  const opener = doc.createElement('button');
  opener.type = 'button'; opener.className = 'draw-normal-map-open';
  createDrawButtonContent(opener, { icon: 'adjustments', label: '凹凸', doc });
  opener.setAttribute('aria-label', 'ノーマルマップを作成'); opener.setAttribute('aria-haspopup', 'dialog');
  opener.setAttribute('aria-expanded', 'false'); opener.title = 'ノーマルマップを作成';
  const dialog = doc.createElement('dialog');
  dialog.className = 'draw-normal-map'; dialog.setAttribute('aria-labelledby', 'draw-normal-map-title');
  dialog.innerHTML = `
    <header class="draw-normal-map__header">
      <div><h2 id="draw-normal-map-title">ノーマルマップ</h2><p data-frame-size>現在のコマ</p></div>
      <button type="button" class="draw-normal-map__close" data-close aria-label="キャンセルして閉じる">閉じる</button>
    </header>
    <div class="draw-normal-map__previews">
      <figure><figcaption>元の絵</figcaption><div class="draw-normal-map__canvas-wrap"><canvas data-source aria-label="元の絵"></canvas></div></figure>
      <figure><figcaption>法線</figcaption><div class="draw-normal-map__canvas-wrap"><canvas data-normal aria-label="生成したノーマルマップ"></canvas></div></figure>
      <figure><figcaption>照明</figcaption><div class="draw-normal-map__canvas-wrap"><canvas data-lit aria-label="ノーマルマップのライティング表示"></canvas></div></figure>
    </div>
    <div class="draw-normal-map__body">
      <p class="draw-normal-map__note" data-note></p>
      <section class="draw-normal-map__controls" aria-label="基本設定">
        <label class="draw-normal-map__field"><span>マップの作り方</span><select data-method><option value="silhouette">輪郭から丸みをつける</option><option value="luminance">明るさを高さとして使う</option><option data-painted-option value="painted" disabled>描いたノーマルマップレイヤー</option></select></label>
        <label class="draw-normal-map__field" data-strength-field><span>凹凸の強さ <output data-strength-value>2</output></span><input data-strength aria-label="凹凸の強さ" type="range" min="0" max="8" step="0.1" value="2"></label>
        <label class="draw-normal-map__field"><span>光のプリセット</span><select data-light-preset><option value="custom">自由に調整</option><option value="upper-left">左上</option><option value="upper-right">右上</option><option value="front">正面</option><option value="left">左</option><option value="right">右</option></select></label>
        <label class="draw-normal-map__check"><input data-preview-lighting type="checkbox">Drawで照明を表示する</label>
      </section>
      <details class="draw-normal-map__details"><summary>凹凸・形式の詳細</summary><div class="draw-normal-map__controls">
        <label class="draw-normal-map__field" data-radius-field><span>丸みの半径 <output data-radius-value>3</output></span><input data-radius aria-label="丸みの半径" type="range" min="1" max="32" step="1" value="3"></label>
        <label class="draw-normal-map__check" data-invert-field><input data-invert type="checkbox">高さを反転</label>
        <label class="draw-normal-map__field"><span>法線のY方向</span><select data-format><option value="opengl">OpenGL（Y+）</option><option value="directx">DirectX（Y−）</option></select></label>
      </div></details>
      <details class="draw-normal-map__details draw-normal-map__material"><summary>照明の詳細</summary><div class="draw-normal-map__controls">
        <label class="draw-normal-map__field"><span>光の向き（左右） <output data-azimuth-value>315°</output></span><input data-azimuth aria-label="光の向き（左右）" type="range" min="0" max="360" step="1" value="315"></label>
        <label class="draw-normal-map__field"><span>光の向き（上下） <output data-elevation-value>45°</output></span><input data-elevation aria-label="光の向き（上下）" type="range" min="0" max="90" step="1" value="45"></label>
        <label class="draw-normal-map__field"><span>艶の強さ <output data-specular-value>25%</output></span><input data-specular aria-label="艶の強さ" type="range" min="0" max="1" step="0.01" value="0.25"></label>
        <label class="draw-normal-map__field"><span>表面の粗さ <output data-roughness-value>50%</output></span><input data-roughness aria-label="表面の粗さ" type="range" min="0.05" max="1" step="0.01" value="0.5"></label>
        <label class="draw-normal-map__field"><span>環境光 <output data-ambient-value>25%</output></span><input data-ambient aria-label="環境光" type="range" min="0" max="1" step="0.01" value="0.25"></label>
        <label class="draw-normal-map__field"><span>光の強さ <output data-intensity-value>100%</output></span><input data-intensity aria-label="光の強さ" type="range" min="0" max="2" step="0.01" value="1"></label>
        <label class="draw-normal-map__field"><span>光の色</span><input data-light-color aria-label="光の色" type="color" value="#ffffff"></label>
        <label class="draw-normal-map__check" data-shade-unpainted-field><input data-shade-unpainted type="checkbox">法線を描いていない部分にも光を当てる</label>
      </div></details>
      <label class="draw-normal-map__field draw-normal-map__overlay"><span>編集中の重ね濃度 <output data-overlay-opacity-value>100%</output></span><input data-overlay-opacity aria-label="編集画面の重ね表示の濃度" type="range" min="0" max="1" step="0.01" value="1"></label>
      <details class="draw-normal-map__details" data-edit-section><summary>専用レイヤーで描く</summary><div class="draw-normal-map__edit">
        <label class="draw-normal-map__field" data-initial-fill-field><span>描き始めの状態</span><select data-initial-fill><option value="transparent">透明から描き始める</option><option value="flat">元の絵の範囲を平面色で埋める</option></select></label>
        <p>生成結果は使わず、専用パレットで描きます。既存レイヤーの絵は残ります。</p>
        <button type="button" data-edit-normal>専用レイヤーで描く</button>
      </div></details>
      <details class="draw-normal-map__details draw-normal-map__export" data-export-section><summary>PNGを書き出す</summary>
        <p class="draw-normal-map__note">プレビューをPNGにします。作品には適用しません。</p>
        <div class="draw-normal-map__exports"><button type="button" data-save>ノーマルマップPNG</button><button type="button" data-save-lit>照明済みPNG</button></div>
        <a class="draw-normal-map__download" data-download download hidden>PNGをもう一度ダウンロード</a>
      </details>
      <div class="draw-normal-map__source-row"><button type="button" data-refresh>現在の絵を読み直す</button><span data-refresh-status role="status" aria-live="polite"></span></div>
    </div>
    <footer class="draw-normal-map__footer">
      <p class="draw-normal-map__error" data-error role="alert" hidden></p>
      <p class="draw-normal-map__apply-note" data-apply-note>適用すると現在のコマの凹凸レイヤーと照明表示に反映します。元の絵は変更しません。</p>
      <div class="draw-normal-map__actions"><button type="button" data-cancel>キャンセル</button><button type="button" class="draw-normal-map__save" data-apply>適用してDrawへ</button></div>
    </footer>`;
  (doc.body || host).append(dialog);
  const $ = selector => dialog.querySelector(selector);
  createDrawButtonContent($('[data-close]'), { icon: 'close', label: '閉じる', doc });
  createDrawButtonContent($('[data-edit-normal]'), { icon: 'draw', label: '専用レイヤーで描く', doc });
  createDrawButtonContent($('[data-save]'), { icon: 'artwork', label: 'ノーマルマップPNG', doc });
  createDrawButtonContent($('[data-save-lit]'), { icon: 'sun', label: '照明済みPNG', doc });
  createDrawButtonContent($('[data-refresh]'), { icon: 'reset', label: '現在の絵を読み直す', doc });
  createDrawButtonContent($('[data-cancel]'), { icon: 'close', label: 'キャンセル', doc });
  createDrawButtonContent($('[data-apply]'), { icon: 'confirm', label: '適用してDrawへ', doc });
  const sourceCanvas = $('[data-source]'), normalCanvas = $('[data-normal]'), litCanvas = $('[data-lit]');
  const refreshStatus = $('[data-refresh-status]'), error = $('[data-error]'), save = $('[data-save]'), saveLit = $('[data-save-lit]'), apply = $('[data-apply]'), download = $('[data-download]');
  let settings = normalizeNormalMapSettings(null), settingsRestored = false;
  let source = null, paintedNormal = null, normal = null, lit = null, pending = false, disposed = false, open = false;
  let renderFrame = 0, renderToken = 0, viewToken = 0, pendingRebuild = false, downloadUrl = null;
  setSaveDisabled(true);
  $('[data-edit-section]').hidden = typeof onEditNormal !== 'function';

  function setSaveDisabled(disabled) {
    save.disabled = disabled; saveLit.disabled = disabled; apply.disabled = disabled;
    $('[data-edit-normal]').disabled = disabled;
  }
  function setBusy(value) {
    pending = value;
    for (const name of Object.values(controlFields)) $(`[data-${name}]`).disabled = value;
    for (const selector of ['[data-refresh]', '[data-edit-normal]', '[data-light-preset]']) $(selector).disabled = value;
    setSaveDisabled(value || !open || !normal || !lit || Boolean(renderFrame) || pendingRebuild);
  }
  function writeControls(value) {
    for (const [key, name] of Object.entries(controlFields)) {
      if (booleanFields.has(key)) $(`[data-${name}]`).checked = value[key];
      else $(`[data-${name}]`).value = String(value[key]);
    }
  }
  function currentOptions() {
    const value = {};
    for (const [key, name] of Object.entries(controlFields)) {
      const element = $(`[data-${name}]`);
      value[key] = booleanFields.has(key) ? element.checked : numericFields.has(key) ? Number(element.value) : element.value;
    }
    return normalizeNormalMapSettings(value);
  }
  function setError(message = '') { error.textContent = message; error.hidden = !message; }
  function clearDownload() {
    if (downloadUrl) urls.revokeObjectURL(downloadUrl);
    downloadUrl = null; download.hidden = true; download.removeAttribute('href');
  }
  function validateSource(value) {
    const width = Number(value?.width), height = Number(value?.height), rgba = value?.rgba;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1028 || height > 1028
        || !rgba || rgba.length !== width * height * 4) throw new TypeError('現在のコマを読み込めませんでした。Drawに戻って絵を確認してください。');
    return { width, height, rgba: new Uint8ClampedArray(rgba) };
  }
  function putImage(canvas, image) {
    canvas.width = image.width; canvas.height = image.height;
    // Natural bitmap dimensions keep the aspect ratio; CSS fits the preview to
    // its current column/viewport, including a resize while the dialog is open.
    const context = canvas.getContext('2d');
    if (!context) throw new Error('プレビューを表示できませんでした。');
    context.imageSmoothingEnabled = false;
    const pixels = image.rgba || image.data;
    if (!pixels || pixels.length !== image.width * image.height * 4) throw new TypeError('画像の画素データを確認できません。');
    const frame = context.createImageData(image.width, image.height); frame.data.set(pixels); context.putImageData(frame, 0, 0);
  }
  function render({ rebuildNormal = true } = {}) {
    if (!open || disposed || !source) return;
    pendingRebuild ||= rebuildNormal;
    if (renderFrame) win.cancelAnimationFrame?.(renderFrame);
    const token = ++renderToken;
    setSaveDisabled(true);
    renderFrame = win.requestAnimationFrame(() => {
      renderFrame = 0;
      if (!open || disposed || token !== renderToken) return;
      try {
        const options = currentOptions();
        if (pendingRebuild || !normal) {
          normal = options.method === 'painted' ? convertPaintedNormalMap(paintedNormal, { format: options.format })
            : convertPaintedNormalMap(quantizeNormalMapForAnimation(createNormalMap(source, options)), { format: options.format });
          pendingRebuild = false;
        }
        lit = renderNormalMapLighting(source, normal, options);
        putImage(sourceCanvas, source); putImage(normalCanvas, normal); putImage(litCanvas, lit);
        setError(); setSaveDisabled(pending);
      } catch (cause) {
        normal = lit = null; setSaveDisabled(true);
        setError(cause?.message || 'プレビューを作成できませんでした。');
      }
    });
  }
  function readSource({ explicit = false } = {}) {
    try {
      source = validateSource(getSource());
      paintedNormal = getPaintedNormal();
      if (paintedNormal) paintedNormal = validateSource(paintedNormal);
      $('[data-painted-option]').disabled = !paintedNormal;
      $('[data-initial-fill-field]').hidden = Boolean(paintedNormal);
      if (paintedNormal && !explicit && !settingsRestored) $('[data-method]').value = 'painted';
      if (!paintedNormal && !explicit) $('[data-preview-lighting]').checked = true;
      if (!paintedNormal && $('[data-method]').value === 'painted') $('[data-method]').value = 'silhouette';
      normal = lit = null; pendingRebuild = true; setSaveDisabled(true);
      $('[data-frame-size]').textContent = `現在のコマ · ${source.width} × ${source.height} px`;
      refreshStatus.textContent = explicit ? '現在のコマを読み直しました。' : '';
      syncControls(); render({ rebuildNormal: true });
      return true;
    } catch (cause) {
      source = normal = lit = null; pendingRebuild = false; setSaveDisabled(true); clearPreviews();
      $('[data-frame-size]').textContent = '現在のコマを取得できません';
      setError(cause?.message || '現在のコマを読み込めませんでした。'); return false;
    }
  }
  function syncControls(event) {
    if (event && pending) return;
    const options = currentOptions(), method = options.method;
    $('[data-note]').textContent = method === 'painted'
      ? '描いた方向を使って照明を調整します。法線の絵はそのまま残ります。'
      : paintedNormal ? '適用すると、このコマの既存の凹凸を生成結果に置き換えます。「元に戻す」で戻せます。'
        : '輪郭や明るさから凹凸を作り、編集用パレットの色に揃えます。適用すると専用レイヤーに追加します。';
    $('[data-strength-field]').hidden = method === 'painted'; $('[data-invert-field]').hidden = method === 'painted';
    $('[data-radius-field]').hidden = method !== 'silhouette'; $('[data-shade-unpainted-field]').hidden = method !== 'painted';
    $('[data-strength-value]').value = options.strength.toFixed(1).replace(/\.0$/, '');
    $('[data-radius-value]').value = String(options.radius);
    $('[data-azimuth-value]').value = `${options.azimuth}°`; $('[data-elevation-value]').value = `${options.elevation}°`;
    for (const field of ['specular', 'roughness', 'ambient', 'intensity', 'overlayOpacity']) {
      $(`[data-${controlFields[field]}-value]`).value = `${Math.round(options[field] * 100)}%`;
    }
    $('[data-light-preset]').value = Object.entries(lightPresets).find(([, preset]) => preset.azimuth === options.azimuth && preset.elevation === options.elevation)?.[0] || 'custom';
    if (event) {
      // Controls are a local draft. Only Apply or the explicit edit handoff commits it.
      setError();
      // A retry link must never silently refer to a different preview.
      clearDownload(); refreshStatus.textContent = '';
      const changed = Object.entries(controlFields).find(([, name]) => event.target === $(`[data-${name}]`))?.[1];
      if (changed === 'overlay-opacity' || changed === 'initial-fill' || changed === 'preview-lighting') return;
      render({ rebuildNormal: rebuildFields.has(changed) });
    }
  }
  function clearPreviews() {
    for (const canvas of [sourceCanvas, normalCanvas, litCanvas]) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }
  function setOpenState(value) {
    viewToken++; open = value; opener.setAttribute('aria-expanded', String(value));
    if (!value) {
      normal = lit = source = paintedNormal = null; pendingRebuild = false; setSaveDisabled(true); refreshStatus.textContent = '';
      clearPreviews(); if (renderFrame) win.cancelAnimationFrame?.(renderFrame); renderFrame = 0; renderToken++;
    }
  }
  function close() { setOpenState(false); if (dialog.open) dialog.close(); }
  function showOpenError(message) {
    if (!dialog.open) { try { dialog.showModal(); } catch { return false; } }
    setOpenState(true); clearDownload(); source = normal = lit = null; pendingRebuild = false; setSaveDisabled(true);
    $('[data-frame-size]').textContent = '現在のコマを取得できません'; clearPreviews(); setError(message); return false;
  }
  function show() {
    if (disposed || scope.disposed || !isActive() || doc.hidden) return false;
    try {
      if (beforeOpen() === false) return showOpenError('現在の操作を完了してから、ノーマルマップを開いてください。');
      const restored = getSettings(); settingsRestored = restored != null;
      settings = normalizeNormalMapSettings(restored ?? settings); writeControls(settings);
    } catch (cause) { return showOpenError(cause?.message || 'Drawの設定を読み込めませんでした。'); }
    if (!dialog.open) { try { dialog.showModal(); } catch { return false; } }
    setOpenState(true); clearDownload(); setError(); readSource(); return true;
  }
  async function applyDraft({ edit = false } = {}) {
    if (!open || disposed || scope.disposed || !source || !normal || !lit || pending || renderFrame || pendingRebuild || !isActive()) return;
    if (edit && typeof onEditNormal !== 'function') return;
    const token = viewToken, originalSource = source, options = currentOptions();
    const isCurrent = () => !disposed && !scope.disposed && open && isActive() && viewToken === token && source === originalSource;
    const snapshot = { width: normal.width, height: normal.height, rgba: new Uint8ClampedArray(normal.rgba), format: normal.format };
    setBusy(true); setError();
    try {
      // The editor callback owns the complete transaction; never save settings
      // first and then leave a partial commit when layer preparation is rejected.
      let result = edit ? onEditNormal({ initialFill: options.initialFill, settings: options })
        : typeof onApplyNormal === 'function' ? onApplyNormal({ settings: options, normal: snapshot }) : onSettingsChange(options);
      if (result && typeof result.then === 'function') result = await result;
      if (!isCurrent()) return;
      if (result === false) throw new Error(edit ? '専用レイヤーを開けませんでした。設定を確認して、もう一度お試しください。' : '設定を適用できませんでした。もう一度お試しください。');
      settings = options; close();
    } catch (cause) {
      if (isCurrent()) setError(cause?.message || '設定を適用できませんでした。');
    } finally { if (!disposed && !scope.disposed) setBusy(false); else pending = false; }
  }
  async function savePng(kind) {
    if (!open || disposed || scope.disposed || !source || !normal || !lit || pending || renderFrame || pendingRebuild || !isActive()) return;
    const token = viewToken, originalSource = source;
    const isCurrent = () => !disposed && !scope.disposed && open && isActive() && viewToken === token && source === originalSource;
    setBusy(true); setError(); refreshStatus.textContent = '';
    try {
      const snapshot = kind === 'lit' ? lit : normal;
      const image = { width: snapshot.width, height: snapshot.height, rgba: new Uint8ClampedArray(snapshot.rgba) };
      const bytes = encodeNormalMapPng(image);
      if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('PNGを作成できませんでした。');
      const blob = new Blob([bytes], { type: 'image/png' });
      const filename = kind === 'lit' ? `pixieed-lit-${image.width}x${image.height}.png` : `pixieed-normal-map-${image.width}x${image.height}-${normal.format}.png`;
      clearDownload();
      if (typeof onSavePng === 'function') {
        // The editor sends the Blob directly through its existing output route.
        // An anchor would be intercepted and re-fetched, losing this direct handoff.
        const result = await onSavePng(blob, filename);
        if (!isCurrent()) return;
        if (result === 'staged') refreshStatus.textContent = '出力画面へ渡しました。出力画面でPNGを保存してください。';
        else if (result === 'cancelled') refreshStatus.textContent = '保存を取り消しました。';
        else if (result === 'shared') refreshStatus.textContent = 'PNGを共有画面に渡しました。';
        else if (result === 'downloaded') refreshStatus.textContent = `${image.width} × ${image.height} px のPNGのダウンロードを開始しました。保存先を確認してください。`;
        else throw new Error('PNGの保存先への受け渡しを確認できませんでした。もう一度お試しください。');
      } else {
        downloadUrl = urls.createObjectURL(blob);
        download.href = downloadUrl; download.download = filename;
        download.textContent = kind === 'lit' ? '照明済みPNGをもう一度ダウンロード' : 'ノーマルマップPNGをもう一度ダウンロード';
        download.hidden = false;
        // Standalone fallback: keep the retry link inside the active modal.
        download.click();
        if (isCurrent()) refreshStatus.textContent = `${image.width} × ${image.height} px のPNGのダウンロードを開始しました。保存先を確認してください。始まらない場合は下のリンクを押してください。`;
      }
    } catch (cause) {
      if (isCurrent()) { refreshStatus.textContent = ''; clearDownload(); setError(cause?.message || 'PNGを保存先に渡せませんでした。'); }
    } finally { if (!disposed && !scope.disposed) setBusy(false); else pending = false; }
  }
  writeControls(settings);
  scope.listen(opener, 'click', () => { show(); }); scope.listen($('[data-close]'), 'click', close);
  scope.listen($('[data-cancel]'), 'click', close); scope.listen(apply, 'click', () => { void applyDraft(); });
  scope.listen($('[data-refresh]'), 'click', () => { if (pending) return; clearDownload(); readSource({ explicit: true }); });
  scope.listen(save, 'click', () => { void savePng('normal'); }); scope.listen(saveLit, 'click', () => { void savePng('lit'); });
  scope.listen($('[data-edit-normal]'), 'click', () => { void applyDraft({ edit: true }); });
  scope.listen($('[data-light-preset]'), 'change', () => {
    if (pending) return;
    const preset = lightPresets[$('[data-light-preset]').value]; if (!preset) return;
    $('[data-azimuth]').value = String(preset.azimuth); $('[data-elevation]').value = String(preset.elevation);
    syncControls({ target: $('[data-azimuth]') });
  });
  scope.listen(dialog, 'cancel', () => { setOpenState(false); }); scope.listen(dialog, 'close', () => { setOpenState(false); });
  for (const name of Object.values(controlFields)) {
    scope.listen($(`[data-${name}]`), 'input', syncControls); scope.listen($(`[data-${name}]`), 'change', syncControls);
  }
  scope.add(() => { disposed = true; close(); clearDownload(); opener.remove(); dialog.remove(); });
  return { opener, panel: dialog, open: show, close, get isOpen() { return dialog.open; } };
}
