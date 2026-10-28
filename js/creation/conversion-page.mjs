import { FILE_ACCEPT, conversionChoices, outputNotice, safeConvertedName } from './conversion-service.mjs?rev=20261028-conversion-1';
import { loadTimelineFiles, animationPlan, frameAt, setFrameSeconds, moveFrame, convertWithTimeline } from './conversion-timeline.mjs?rev=20261028-motion-1';
import { notifyToolEntryReady } from '../tool-offerwall-entry.mjs?rev=20261024-common-tool-start-1';

/** Contextual, local-only conversion. Media, names and settings are never sent to analytics. */
export function mountConversionPage(doc = document, win = window) {
  const main = doc.getElementById('main');
  if (!main || main.dataset.simpleConversion) return;
  doc.body.classList.add('simple-conversion-page');
  main.dataset.simpleConversion = 'true'; main.className = 'conversion-main';
  doc.title = 'ファイル変換・GIFの速度調整｜PiXiEED';
  const header = doc.querySelector('.output-header__label');
  if (header) header.textContent = 'ファイルを変換';
  main.innerHTML = `
    <div class="convert-heading"><a href="/output/">← 変換ガイド</a><span><i aria-hidden="true"></i> 端末内で処理・無料</span></div>
    <header class="convert-intro"><p class="convert-eyebrow">PIXIEED / CONVERT</p><h1>欲しい形式に。<br><span>動きも、思いどおりに。</span></h1><p class="convert-lead">ファイルを選ぶと、必要な設定だけが現れます。</p></header>
    <section class="convert-card" aria-label="ファイル変換">
      <div class="convert-drop" data-drop>
        <div class="convert-drop-art" aria-hidden="true"><span></span><span></span><span>↥</span></div>
        <h2>ここから、つくり変える。</h2>
        <button class="convert-primary" type="button" data-pick>ファイルを選ぶ <span aria-hidden="true">＋</span></button>
        <p>GIFや画像をドロップ。複数画像もまとめて選べます。</p><small>1ファイル64MB / 一度に8ファイル・合計128MBまで</small>
        <button class="convert-demo" type="button" data-demo>サンプルで動きを試す <span aria-hidden="true">→</span></button>
      </div>
      <input data-file type="file" multiple hidden>
      <div data-editor hidden>
        <div class="convert-file"><div><span class="convert-eyebrow">YOUR MATERIAL</span><strong data-name></strong><p data-meta></p></div><button class="convert-secondary" data-replace type="button">選び直す</button></div>
        <div class="convert-workbench">
          <div class="convert-stage">
            <div class="convert-preview" data-preview hidden><canvas data-canvas role="img" aria-label="読み込んだ画像のプレビュー"></canvas><span class="convert-preview-tag">PREVIEW</span></div>
            <div class="convert-audio-poster" data-audio-poster hidden><span aria-hidden="true">♫</span><p>音声ファイルを変換</p></div>
            <div class="convert-player" data-player hidden><button type="button" class="convert-secondary" data-play aria-pressed="false">▶ 再生</button><label class="convert-scrub">コマ<input data-scrub type="range" min="1" max="2" value="1" step="1"></label><output data-position>1 / 2</output></div>
            <p class="convert-preview-note" data-preview-note hidden>プレビューは動きの確認用です。色数・画質は保存形式によって変わります。</p>
            <p class="convert-source-note" data-source-note hidden></p>
            <details class="convert-sequence" data-sequence hidden><summary>画像の順番・コマごとの時間 <span data-frame-count></span></summary><p>秒数には再生速度の倍率が適用されます。↑↓で順番を変えられます。</p><ol data-frame-list></ol></details>
          </div>
          <div class="convert-settings">
            <div class="convert-format"><label for="convert-format">保存形式</label><select id="convert-format" data-format aria-describedby="convert-notice"></select></div>
            <section class="convert-motion" data-motion hidden aria-labelledby="motion-title">
              <div class="convert-section-heading"><h2 id="motion-title">動きと時間</h2><button type="button" class="convert-text-button" data-reset>元に戻す</button></div>
              <div class="convert-duration" aria-live="polite"><div><span>元の1周</span><output data-original-duration>—</output></div><span aria-hidden="true">→</span><div><span>仕上がりの1周</span><output data-duration>—</output></div></div>
              <div class="convert-speed-label"><label for="convert-rate">再生速度</label><output data-rate-value for="convert-rate">1×</output></div>
              <div class="convert-presets" role="group" aria-label="再生速度のプリセット">${[.5, 1, 1.5, 2, 4].map(rate => `<button type="button" data-rate="${rate}" aria-pressed="${rate === 1}">${rate === 1 ? '標準' : rate + '×'}</button>`).join('')}</div>
              <input id="convert-rate" data-rate-input type="range" min="0.25" max="4" step="0.05" value="1" aria-describedby="convert-rate-help"><p id="convert-rate-help" class="convert-mini">0.25〜4倍。コマごとの時間の比率を保って調整。</p>
              <details class="convert-timing-details" data-timing-details><summary>1枚の表示時間をそろえる</summary><div class="convert-duration-input"><label for="convert-seconds">1枚あたり（秒）<input id="convert-seconds" data-seconds type="number" min="0.02" max="60" step="0.01" value="1" inputmode="decimal"></label><button class="convert-secondary" type="button" data-apply-seconds>全コマに適用</button></div><p class="convert-mini">写真は1〜3秒、コマ送りは0.1秒など。倍率は標準に戻ります。</p></details>
              <label for="convert-loop">合計再生回数<select id="convert-loop" data-loop><option value="0">ずっと繰り返す</option><option value="1">1回</option><option value="2">2回</option><option value="3">3回</option></select></label>
              <p class="convert-mini" data-timing-note></p>
            </section>
            <p class="convert-notice" id="convert-notice" data-notice></p>
            <details class="convert-options"><summary data-options-title>サイズ・画質など</summary>
              <fieldset data-image-options><legend>画像の設定</legend><div class="convert-fields"><label>幅（px）<input data-width type="number" min="1" max="4096" inputmode="numeric"></label><label>高さ（px）<input data-height type="number" min="1" max="4096" inputmode="numeric"></label></div>
                <label class="convert-check"><input data-ratio type="checkbox" checked>縦横比を保つ</label>
                <label data-quality-field>画質 <span data-quality-value>90%</span><input data-quality type="range" min="50" max="100" value="90"></label>
                <label data-background-field>透過部分の背景色<input data-background type="color" value="#ffffff"></label>
                <label data-threshold-field>白黒のしきい値<input data-threshold type="range" min="0" max="255" value="128"></label>
                <label data-frame-field>静止画にするコマ<input data-frame type="number" min="1" value="1" inputmode="numeric"></label>
              </fieldset>
              <fieldset data-audio-options hidden><legend>音声の設定</legend><label data-bits-field>PCMビット深度<select data-bits><option value="16">16bit（標準）</option><option value="24">24bit</option><option value="32">32bit</option></select></label><p>ビット深度を増やしても元音声の情報量は増えません。読み込み時に再サンプリングされる場合があります。</p></fieldset>
            </details>
            <div class="convert-actions"><button class="convert-primary" data-convert type="button">変換する <span aria-hidden="true">→</span></button><a class="convert-primary" data-download download hidden>保存する ↓</a><a class="convert-previous" data-previous download hidden>前回の結果を保存</a></div>
          </div>
        </div>
      </div>
      <progress data-progress aria-label="変換の進行状況" hidden></progress><button class="convert-secondary" data-cancel type="button" hidden>中止</button><p class="convert-status" data-status role="status" aria-live="polite"></p>
    </section>
    <div class="convert-support"><p><a href="/output/gif-speed/">GIFの速度変更・画像からGIFを作る方法</a><span aria-hidden="true"> · </span>音楽付き動画・複数出力は <a href="/output/work/" data-advanced>詳細ワークスペース</a> へ。</p><details><summary>対応形式と大切な制限</summary><p>画像はPNG・JPEG・WebP・GIF・APNG・BMP・TIFF・TGA・QOI・ICO・Netpbm系・静的SVGなど。詳細な内部方式の対応は<a href="/output/#guide-format-details">対応形式のガイド</a>で確認できます。画像は各辺4096px、合計800万画素・600コマ以内。アニメーションGIF/APNGの読み込みには対応ブラウザーが必要です。</p><p>複数選択は画像専用です。GIFの時間は10ms刻み・本ツールでは最短20msに調整します。再生アプリによって速さや繰り返しの扱いが異なる場合があります。GIFは最大256色で、音声は含められません。</p><p>音声は120秒以内・モノラル/ステレオ・8〜48kHz。ブラウザー依存の一部入力は4MBまでです。メタデータ、色プロファイル、元のレイヤー等は保持しません。元のファイルは変更せず、変換する素材をサーバーにアップロードしません。</p></details></div>`;
  const $ = selector => main.querySelector(selector);
  const input = $('[data-file]'), format = $('[data-format]'), status = $('[data-status]'), progress = $('[data-progress]');
  input.accept = FILE_ACCEPT;
  const canvas = $('[data-canvas]'), raw = doc.createElement('canvas');
  let source = null, original = null, controller = null, busy = false, rate = 1, plan = null, valid = true;
  let resultUrl = null, resultName = '', unsaved = false, playing = false, raf = null, elapsed = 0, epoch = 0, shown = -1;
  const webp = (() => { try { return doc.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } })();
  const text = message => { status.textContent = message; };
  const seconds = ms => `${(ms / 1000).toFixed(ms % 1000 ? 2 : 0)}秒`;
  const animated = () => source?.kind === 'image' && source.frames.length > 1 && ['gif', 'apng'].includes(format.value);
  function stop(reset = false) {
    if (raf !== null) win.cancelAnimationFrame(raf);
    raf = null; playing = false; $('[data-play]').textContent = '▶ 再生'; $('[data-play]').setAttribute('aria-pressed', 'false');
    if (reset) elapsed = 0;
  }
  function draw(index) {
    if (!source || source.kind !== 'image' || !source.frames[index]) return;
    const frame = source.frames[index];
    if (shown !== index) {
      raw.width = frame.width; raw.height = frame.height;
      raw.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
      const scale = Math.min(1, 800 / frame.width, 440 / frame.height);
      canvas.width = Math.max(1, Math.round(frame.width * scale)); canvas.height = Math.max(1, Math.round(frame.height * scale));
      canvas.getContext('2d').drawImage(raw, 0, 0, canvas.width, canvas.height); shown = index;
    }
    $('[data-scrub]').value = index + 1; $('[data-position]').textContent = `${index + 1} / ${source.frames.length}`;
  }
  function markDirty() {
    stop(true); unsaved = Boolean(resultUrl);
    $('[data-download]').hidden = true; $('[data-convert]').hidden = false;
    $('[data-previous]').hidden = !resultUrl;
  }
  function clearResult() {
    if (resultUrl) win.URL.revokeObjectURL(resultUrl);
    resultUrl = null; unsaved = false;
    for (const selector of ['[data-download]', '[data-previous]']) { $(selector).hidden = true; $(selector).removeAttribute('href'); }
    $('[data-convert]').hidden = false;
  }
  function disable(value) {
    busy = value; main.setAttribute('aria-busy', String(value));
    for (const el of main.querySelectorAll('button,input,select')) if (!el.matches('[data-cancel]')) el.disabled = value || el.dataset.boundary === 'true';
    $('[data-cancel]').hidden = !value; progress.hidden = !value;
    if (value) { progress.removeAttribute('value'); stop(); }
    else $('[data-convert]').disabled = !valid;
  }
  function setLoop(value) {
    const loop = $('[data-loop]');
    loop.querySelector('[data-original-loop]')?.remove();
    if (![0, 1, 2, 3].includes(value)) { const option = doc.createElement('option'); option.value = value; option.textContent = `${value}回（元の設定）`; option.dataset.originalLoop = ''; loop.append(option); }
    loop.value = value;
  }
  function renderFrames() {
    const list = $('[data-frame-list]'); list.replaceChildren();
    if (!source || !animated() || !$('[data-sequence]').open) return;
    source.frames.forEach((frame, index) => {
      const row = doc.createElement('li'); row.className = 'convert-frame-row';
      const name = doc.createElement('span'); name.textContent = `${index + 1}. ${frame.name || 'コマ'}`; name.title = name.textContent;
      const label = doc.createElement('label'); label.textContent = '秒';
      const duration = doc.createElement('input'); duration.type = 'number'; duration.min = '.02'; duration.max = '60'; duration.step = '.01'; duration.value = (frame.delayMs || 500) / 1000; duration.inputMode = 'decimal';
      duration.dataset.frameSeconds = index; duration.setAttribute('aria-label', `${index + 1}コマ目の表示秒数`); label.prepend(duration);
      row.append(name, label);
      for (const direction of [-1, 1]) { const button = doc.createElement('button'); button.type = 'button'; button.className = 'convert-frame-move'; button.textContent = direction === -1 ? '↑' : '↓'; button.dataset.move = index; button.dataset.direction = direction; button.dataset.boundary = String(index + direction < 0 || index + direction >= source.frames.length); button.disabled = button.dataset.boundary === 'true'; button.setAttribute('aria-label', `${index + 1}コマ目を${direction === -1 ? '前' : '後'}へ`); row.append(button); }
      list.append(row);
    });
  }
  function refresh() {
    if (!source) return;
    stop(true); valid = true; plan = null; shown = -1;
    const isImage = source.kind === 'image', motion = animated(), value = format.value;
    $('[data-motion]').hidden = !motion; $('[data-player]').hidden = !motion; $('[data-sequence]').hidden = !motion;
    $('[data-preview]').hidden = !isImage; $('[data-audio-poster]').hidden = isImage; $('[data-preview-note]').hidden = !isImage;
    $('[data-image-options]').hidden = !isImage; $('[data-audio-options]').hidden = isImage;
    $('[data-bits-field]').hidden = !['wav', 'aiff', 'au'].includes(value);
    $('[data-quality-field]').hidden = !['jpeg', 'webp'].includes(value);
    $('[data-background-field]').hidden = !['jpeg', 'bmp', 'ppm', 'pgm', 'pbm', 'gif'].includes(value);
    $('[data-threshold-field]').hidden = value !== 'pbm';
    $('[data-frame-field]').hidden = !isImage || source.frames.length < 2 || ['gif', 'apng'].includes(value);
    $('[data-options-title]').textContent = isImage ? 'サイズ・画質など' : '音声の詳細設定';
    $('[data-notice]').textContent = outputNotice(source, value);
    $('[data-rate-value]').textContent = `${Number(rate.toFixed(2))}×`; $('[data-rate-input]').value = rate;
    for (const button of main.querySelectorAll('[data-rate]')) button.setAttribute('aria-pressed', String(Number(button.dataset.rate) === rate));
    if (motion) {
      try {
        plan = animationPlan(source.frames, { format: value, playbackRate: rate, totalPlays: Number($('[data-loop]').value) });
        $('[data-original-duration]').textContent = seconds(original.frames.reduce((sum, f) => sum + (f.delayMs || 500), 0));
        $('[data-duration]').textContent = seconds(plan.durationMs);
        $('[data-timing-note]').textContent = `${plan.adjusted ? '保存形式に合わせ、コマ時間を調整しています。' : 'この時間設定を保存ファイルにも反映します。'}${plan.totalDurationMs === null ? ' 繰り返し：ずっと。' : ` 合計${seconds(plan.totalDurationMs)}。`}`;
        $('[data-scrub]').max = source.frames.length; $('[data-frame-count]').textContent = `${source.frames.length}コマ`;
      } catch (error) { valid = false; text(error.message); }
    }
    if (isImage) draw(motion ? 0 : Math.max(0, Math.min(source.frames.length - 1, Number($('[data-frame]').value) - 1)));
    $('[data-convert]').disabled = busy || !valid;
  }
  function acceptSource(next) {
    main.classList.add('has-source');
    main.querySelector('h1').textContent = next.kind === 'image' && next.frames.length > 1 ? '動きを整える。' : 'ファイルを変換';
    source = { ...next, frames: next.frames?.map(f => ({ ...f })) || [] }; original = { ...source, frames: [...source.frames] };
    clearResult(); rate = 1; $('[data-drop]').hidden = true; $('[data-editor]').hidden = false;
    $('[data-name]').textContent = next.sequence ? `${next.frames.length}コマの画像` : next.name;
    $('[data-meta]').textContent = next.kind === 'image' ? `${next.frames[0].width} × ${next.frames[0].height}px · ${next.frames.length}コマ` : `${next.audio.sampleRate.toLocaleString()} Hz · ${next.audio.channels.length}ch · ${(next.audio.channels[0].length / next.audio.sampleRate).toFixed(2)}秒`;
    $('[data-source-note]').textContent = next.note || ''; $('[data-source-note]').hidden = !next.note;
    format.replaceChildren(...conversionChoices(next, { webp }).map(choice => { const option = doc.createElement('option'); option.value = choice.value; option.textContent = choice.label; return option; }));
    format.value = next.kind === 'audio' ? 'wav' : next.frames.length > 1 ? (String(next.inputFormat).toLowerCase() === 'apng' ? 'apng' : 'gif') : 'png';
    if (next.kind === 'image') { $('[data-width]').value = next.frames[0].width; $('[data-height]').value = next.frames[0].height; $('[data-frame]').value = 1; $('[data-frame]').max = next.frames.length; }
    $('[data-ratio]').checked = true; setLoop(next.totalPlays ?? 1);
    $('[data-timing-details]').open = Boolean(next.sequence); $('[data-sequence]').open = false;
    renderFrames(); refresh(); text('形式と設定を確認して、変換できます。');
  }
  async function load(files) {
    if (busy || !files?.length) return;
    controller = new AbortController(); disable(true); text('ファイルを確認しています…');
    try { const next = await loadTimelineFiles(files, { signal: controller.signal }); acceptSource(next); }
    catch (error) { text(error.name === 'AbortError' ? '読み込みを中止しました。前の素材はそのままです。' : error.message || '読み込めませんでした。'); }
    finally { disable(false); controller = null; input.value = ''; if (source) format.focus({ preventScroll: true }); }
  }
  function changed() { if (busy) return; markDirty(); refresh(); if (valid) text('設定を変更しました。変換すると保存ファイルに反映されます。'); }
  function demo() {
    const frames = Array.from({ length: 3 }, (_, i) => {
      const c = doc.createElement('canvas'); c.width = 360; c.height = 240; const ctx = c.getContext('2d');
      ctx.fillStyle = '#edf2ea'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#1d513d'; ctx.fillRect(62 + i * 68, 85, 60, 60); ctx.fillStyle = '#dba669'; ctx.fillRect(82 + i * 68, 105, 20, 20);
      return { width: c.width, height: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data, delayMs: 500, name: `サンプル ${i + 1}` };
    });
    acceptSource({ kind: 'image', frames, totalPlays: 0, name: 'sample.gif', inputFormat: 'gif', note: '端末内で生成した3コマのサンプルです。速度や表示時間を試し、そのまま保存できます。' });
  }
  $('[data-pick]').addEventListener('click', () => input.click()); $('[data-replace]').addEventListener('click', () => input.click());
  $('[data-demo]').addEventListener('click', demo); input.addEventListener('change', () => load(input.files));
  const drop = $('[data-drop]');
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => { event.preventDefault(); if (!busy) drop.classList.add('is-dragging'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('is-dragging'); });
  drop.addEventListener('drop', event => load(event.dataTransfer?.files));
  $('[data-play]').addEventListener('click', () => {
    if (!plan || busy) return;
    if (playing) { stop(); return; }
    if (plan.totalDurationMs !== null && elapsed >= plan.totalDurationMs) elapsed = 0;
    epoch = win.performance.now() - elapsed; playing = true; $('[data-play]').textContent = 'Ⅱ 停止'; $('[data-play]').setAttribute('aria-pressed', 'true');
    const step = now => { if (!playing) return; elapsed = Math.max(0, now - epoch); const position = frameAt(plan, elapsed); draw(position.index); if (position.done) stop(); else raf = win.requestAnimationFrame(step); };
    raf = win.requestAnimationFrame(step);
  });
  $('[data-scrub]').addEventListener('input', () => { if (!plan) return; stop(); const index = Number($('[data-scrub]').value) - 1; elapsed = plan.frameDelaysMs.slice(0, index).reduce((a, b) => a + b, 0); draw(index); });
  main.addEventListener('click', event => {
    if (busy) return;
    const preset = event.target.closest('[data-rate]'); if (preset) { rate = Number(preset.dataset.rate); changed(); }
    const move = event.target.closest('[data-move]');
    if (move) { const index = Number(move.dataset.move), direction = Number(move.dataset.direction); source = { ...source, frames: moveFrame(source.frames, index, direction) }; changed(); renderFrames(); main.querySelector(`[data-move="${index + direction}"][data-direction="${-direction}"]`)?.focus({ preventScroll: true }); }
  });
  $('[data-rate-input]').addEventListener('input', event => { rate = Number(event.target.value); changed(); });
  $('[data-reset]').addEventListener('click', () => { source = { ...original, frames: [...original.frames] }; rate = 1; setLoop(original.totalPlays ?? 1); changed(); renderFrames(); });
  $('[data-apply-seconds]').addEventListener('click', () => { try { source = { ...source, frames: setFrameSeconds(source.frames, Number($('[data-seconds]').value)) }; rate = 1; changed(); renderFrames(); } catch (error) { text(error.message); } });
  $('[data-sequence]').addEventListener('toggle', renderFrames);
  main.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-frame-seconds]')) {
      try { source = { ...source, frames: setFrameSeconds(source.frames, Number(target.value), Number(target.dataset.frameSeconds)) }; changed(); }
      catch (error) { text(error.message); target.value = (source.frames[Number(target.dataset.frameSeconds)].delayMs || 500) / 1000; }
    } else if (target === format || target.matches('[data-loop]') || target.closest('.convert-options')) { changed(); if (target === format) renderFrames(); }
  });
  main.addEventListener('input', event => {
    if (!source || busy || !event.target.closest('.convert-options')) return;
    const target = event.target;
    if (target.matches('[data-width],[data-height]') && $('[data-ratio]').checked) {
      const f = source.frames[0], value = Number(target.value); if (value > 0 && Number.isFinite(value)) { const isWidth = target.matches('[data-width]'); $(isWidth ? '[data-height]' : '[data-width]').value = Math.max(1, Math.round(value * (isWidth ? f.height / f.width : f.width / f.height))); }
    }
    markDirty(); $('[data-quality-value]').textContent = $('[data-quality]').value + '%';
  });
  $('[data-convert]').addEventListener('click', async () => {
    if (!source || busy || !valid) return;
    for (const field of main.querySelectorAll('.convert-options input')) if (field.getClientRects().length && !field.checkValidity()) { field.reportValidity(); return; }
    controller = new AbortController(); disable(true); text('変換しています…');
    try {
      const options = { playbackRate: rate, totalPlays: Number($('[data-loop]').value), width: Number($('[data-width]').value), height: Number($('[data-height]').value), quality: Number($('[data-quality]').value) / 100, background: $('[data-background]').value, threshold: Number($('[data-threshold]').value), frameIndex: Number($('[data-frame]').value) - 1, bitDepth: Number($('[data-bits]').value) };
      const blob = await convertWithTimeline(source, format.value, options, controller.signal, value => { if (Number.isFinite(value)) { progress.max = 1; progress.value = Math.max(0, Math.min(1, value)); } });
      if (controller.signal.aborted) throw new DOMException('中止', 'AbortError');
      clearResult(); resultUrl = win.URL.createObjectURL(blob); resultName = safeConvertedName(source.name, format.value);
      for (const selector of ['[data-download]', '[data-previous]']) { $(selector).href = resultUrl; $(selector).download = resultName; }
      const link = $('[data-download]'); link.textContent = `保存する ↓ · ${blob.size >= 1048576 ? (blob.size / 1048576).toFixed(2) + ' MB' : (blob.size / 1024).toFixed(1) + ' KB'}`;
      link.hidden = false; $('[data-convert]').hidden = true; unsaved = true;
      text('変換できました。保存ボタンから端末に保存できます。'); link.focus({ preventScroll: true });
    } catch (error) { $('[data-previous]').hidden = !resultUrl; text(error.name === 'AbortError' ? '変換を中止しました。素材・設定と前回の結果は保持しています。' : error.message || '変換できませんでした。'); }
    finally { disable(false); controller = null; }
  });
  $('[data-cancel]').addEventListener('click', () => controller?.abort());
  for (const selector of ['[data-download]', '[data-previous]']) $(selector).addEventListener('click', () => { unsaved = false; });
  const hide = () => { if (doc.visibilityState === 'hidden') { stop(); if (busy) controller?.abort(); } }; doc.addEventListener('visibilitychange', hide);
  const beforeLeave = event => { if (busy || unsaved) { event.preventDefault(); event.returnValue = ''; } }; win.addEventListener('beforeunload', beforeLeave);
  win.addEventListener('pagehide', () => { stop(); controller?.abort(); if (resultUrl) win.URL.revokeObjectURL(resultUrl); raw.width = raw.height = canvas.width = canvas.height = 1; doc.removeEventListener('visibilitychange', hide); win.removeEventListener('beforeunload', beforeLeave); }, { once: true });
  notifyToolEntryReady(false);
  return {
    setSource(next, settings = {}) {
      if (busy) throw new Error('処理中は素材を変更できません。');
      acceptSource(next);
      if (Number.isFinite(settings.playbackRate) && settings.playbackRate >= .25 && settings.playbackRate <= 4) rate = settings.playbackRate;
      if ([...format.options].some(option => option.value === settings.format)) format.value = settings.format;
      refresh(); renderFrames();
    },
    offerOriginal(blob, filename) {
      if (busy || !blob?.size) return;
      clearResult(); resultUrl = win.URL.createObjectURL(blob); resultName = filename;
      for (const selector of ['[data-download]', '[data-previous]']) { $(selector).href = resultUrl; $(selector).download = resultName; }
      $('[data-download]').textContent = 'この作品を保存 ↓'; $('[data-download]').hidden = false; $('[data-convert]').hidden = true;
      unsaved = false;
      text('制作画面から引き継ぎました。そのまま保存するか、形式・設定を変更できます。');
    }
  };
}
