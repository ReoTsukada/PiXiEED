import { detectExtraFormat, encodeIco, checkDimensions, LIMITS } from './conversion-codecs.mjs?rev=20261028-formats-1';

const ABORT = () => new DOMException('処理を中止しました。', 'AbortError');
const units = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
export function outputName(name, extension) {
  const base = String(name || 'converted').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/^\.+|\.+$/g, '').trim().slice(0, 75) || 'converted';
  return `${base}.${extension}`;
}
function workerJob(operation, value, format, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(ABORT()); return; }
    const worker = new Worker(new URL('./conversion-worker.mjs?rev=20261028-formats-1', import.meta.url), { type: 'module' });
    let done = false;
    const finish = (err, result) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); err ? reject(err) : resolve(result); };
    const abort = () => finish(ABORT());
    const timer = setTimeout(() => finish(new Error('処理が上限時間を超えました。ファイルを小さくしてお試しください。')), 60_000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.result);
    worker.onerror = () => finish(new Error('変換処理を起動できません。ページを再読み込みしてください。'));
    try { worker.postMessage({ operation, value, format }); } catch (e) { finish(e); }
  });
}
const raster = (frame, mime = 'image/png', quality = .9) => new Promise((resolve, reject) => {
  const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
  const ctx = canvas.getContext('2d'); if (!ctx) { reject(new Error('画像の描画に対応していません。')); return; }
  ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
  canvas.toBlob(blob => { canvas.width = canvas.height = 1; blob ? resolve(blob) : reject(new Error('画像を作成できません。')); }, mime, quality);
});
function resize(frame, width, height) {
  checkDimensions(width, height); if (width === frame.width && height === frame.height) return frame;
  const input = document.createElement('canvas'), output = document.createElement('canvas'); input.width = frame.width; input.height = frame.height; output.width = width; output.height = height;
  try { input.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0); const ctx = output.getContext('2d'); ctx.drawImage(input, 0, 0, width, height); return { width, height, data: ctx.getImageData(0, 0, width, height).data, delayMs: frame.delayMs }; }
  finally { input.width = input.height = output.width = output.height = 1; }
}
export async function mountConversionStudio(root, { onAdvanced } = {}) {
  root.classList.add('conversion-simple');
  root.innerHTML = `<header class="cs-heading"><p class="cs-kicker">この端末で処理 · アップロード不要</p><h1>ファイルを変換</h1><p>ファイルを選ぶと、保存できる形式が表示されます。</p></header>
  <section class="cs-card" aria-label="ファイル変換">
    <div id="cs-drop" class="cs-drop"><button id="cs-choose" class="cs-primary" type="button">ファイルを選ぶ</button><p id="cs-drop-hint">ここにドロップもできます</p><input id="cs-input" type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/apng,audio/*,video/mp4,video/webm,.bmp,.tga,.qoi,.pbm,.pgm,.ppm,.pnm,.tif,.tiff,.ico,.aif,.aiff,.au,.snd,.flac,.ogg,.mp3,.wav,.m4a,.mp4,.webm"></div>
    <section id="cs-editor" hidden aria-label="変換設定"><div class="cs-file"><canvas id="cs-preview" aria-label="選択した画像のプレビュー" hidden></canvas><div><strong id="cs-name"></strong><p id="cs-meta"></p></div></div>
      <audio id="cs-audio" controls preload="none" hidden></audio>
      <label class="cs-label" for="cs-format">保存する形式</label><select id="cs-format" aria-describedby="cs-note"></select><p id="cs-note" class="cs-note"></p>
      <details id="cs-settings"><summary>サイズ・画質を調整</summary><div id="cs-image-settings"><div class="cs-dimensions"><label for="cs-width">幅（px）<input id="cs-width" type="number" min="1" max="4096" step="1" inputmode="numeric"></label><span aria-hidden="true">×</span><label for="cs-height">高さ（px）<input id="cs-height" type="number" min="1" max="4096" step="1" inputmode="numeric"></label></div><label class="cs-check"><input id="cs-ratio" type="checkbox" checked>縦横比を保つ</label><label id="cs-quality-label" for="cs-quality" hidden>画質 <output id="cs-quality-value">90%</output><input id="cs-quality" type="range" min="50" max="100" value="90" step="5"></label><label id="cs-frame-label" for="cs-frame" hidden>静止画にするコマ<select id="cs-frame"></select></label></div></details>
      <button id="cs-convert" class="cs-primary" type="button">変換する</button><a id="cs-download" class="cs-primary" download hidden>保存する</a>
    </section>
    <p id="cs-status" role="status" aria-live="polite"></p><progress id="cs-progress" aria-label="変換処理中" hidden></progress><button id="cs-cancel" class="cs-secondary" type="button" hidden>中止する</button>
  </section>
  <div class="cs-secondary-row"><button id="cs-advanced" class="cs-link" type="button">動画合成・複数ファイルなどの詳細画面</button><a href="/output/">対応形式と使い方</a></div>
  <details class="cs-supported"><summary>対応形式と制限</summary><p>PNG・JPEG・WebP・GIF・APNGに加えて、BMP・TGA・QOI・PBM/PGM/PPM・非圧縮TIFF・PNG内包ICOを読み書きできます。音声はWAV・AIFF・AUに保存でき、M4A・Ogg・WebMはブラウザーが作成できる場合に表示します。MP3・FLACなどの読み込みはブラウザーの対応範囲です。MP3/FLAC書き出し、HEIC、圧縮/複数ページTIFF、AIFC、DIB形式ICOは未対応です。</p><p>ファイル64MB以下、画像は各辺4096px・800万画素、音声120秒・8〜48kHz・1〜2チャンネルまで。長さを事前確認できない音声は4MBまでです。メタデータ・カラープロファイルは保持しません。詳細画面には従来の制作データ・合成機能があります。</p></details>`;
  const $ = id => root.querySelector(`#cs-${id}`), controls = ['choose', 'format', 'width', 'height', 'ratio', 'quality', 'frame', 'convert', 'advanced'];
  let current = null, controller = null, resultURL = '', audioURL = '', disposed = false, currentFile = null, operation = 0;
  const urls = new Set();
  const makeURL = blob => { const u = URL.createObjectURL(blob); urls.add(u); return u; };
  const revoke = u => { if (u) { URL.revokeObjectURL(u); urls.delete(u); } };
  const clearOutput = () => { revoke(resultURL); resultURL = ''; $('download').hidden = true; $('download').removeAttribute('href'); $('convert').hidden = false; };
  function busy(value) { for (const id of controls) $(id).disabled = value; $('progress').hidden = !value; $('cancel').hidden = !value; $('drop').setAttribute('aria-busy', String(value)); $('download').hidden = value || !resultURL; }
  const say = message => { $('status').textContent = message; };
  function options() {
    const list = [];
    if (current.frames?.length) {
      list.push(['png', 'PNG · 透過を保つ'], ['jpeg', 'JPEG · 写真向け']);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      if (canvas.toDataURL('image/webp').startsWith('data:image/webp;')) list.push(['webp', 'WebP']);
      list.push(['gif', current.frames.length > 1 ? 'GIF · アニメーション' : 'GIF']);
      if (current.frames.length > 1) list.push(['apng', 'APNG · アニメーション']);
      for (const name of ['bmp', 'tga', 'qoi', 'tiff', 'pbm', 'pgm', 'ppm', 'ico']) list.push([name, name.toUpperCase()]);
    } else list.push(['wav', 'WAV · PCM'], ['aiff', 'AIFF · PCM'], ['au', 'AU · PCM'], ...current.audioFormats.filter(f => f.available && f.value !== 'wav').map(f => [f.value, f.label]));
    $('format').replaceChildren(...list.map(([value, label]) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }));
  }
  function updateNote() {
    const f = $('format').value, many = current?.frames?.length > 1;
    const notes = { png: '透過を保ちます。', jpeg: '透過部分は白になります。非可逆圧縮です。', webp: '透過を保ちます。非可逆圧縮です。', gif: '最大256色。半透明は白背景に合成します。', apng: '全コマと透過を保ちます。', bmp: '非圧縮24bit。透過部分は白になります。', tga: '非圧縮32bit。透過を保ちます。', qoi: '可逆RGBA。圧縮率より互換性を優先した出力です。', tiff: '非圧縮8bit RGBA、単一ページ。透過を保ちます。', pbm: '白黒2値。透過部分は白、明るさ128を境に白黒に変換します。', pgm: '8bitグレースケール。透過部分は白になります。', ppm: '8bit RGB。透過部分は白になります。', ico: 'PNG内包の単一サイズ。長辺256px以内に縮小します。', wav: '16bit PCM。サンプルレートとチャンネル数を保ちます。', aiff: '非圧縮16bit PCM。サンプルレートとチャンネル数を保ちます。', au: '線形16bit PCM。サンプルレートとチャンネル数を保ちます。' };
    $('note').textContent = (notes[f] || 'ブラウザーで音声を記録します。元音声の長さ程度の時間がかかり、前後に約120msの無音が加わります。作成中はこの画面を開いてください。') + (many && !['gif', 'apng'].includes(f) ? ' 選択した1コマだけを保存します。' : '');
    $('quality-label').hidden = !['jpeg', 'webp'].includes(f);
    $('frame-label').hidden = !many || ['gif', 'apng'].includes(f);
  }
  async function load(file) {
    if (controller || !file) return;
    if (file.size < 1 || file.size > LIMITS.bytes) { say('空でない64MB以下のファイルを選んでください。'); return; }
    const id = ++operation; controller = new AbortController(); const signal = controller.signal; busy(true); say('ファイルの内容を確認しています…');
    try {
      const header = new Uint8Array(await file.slice(0, 32).arrayBuffer()), extra = detectExtraFormat(header, file.name); let imported;
      if (extra) {
        const value = await file.arrayBuffer();
        if (['aiff', 'au'].includes(extra)) imported = { audio: await workerJob('decode-audio', value, extra, signal) };
        else { const frame = await workerJob('decode-image', value, extra, signal); if (frame.png) { const { importOutputFiles } = await import('./output-import.mjs?rev=20261020-format-conversion-1'); imported = await importOutputFiles([new File([frame.png], 'icon.png', { type: 'image/png' })], { signal }); } else imported = { frames: [frame], totalPlays: 1 }; }
      } else {
        if (/^video\//.test(file.type) || /\.(mp4|webm)$/i.test(file.name) && !file.type.startsWith('audio/')) { controller = null; busy(false); await onAdvanced?.([file]); return; }
        const { importOutputFiles } = await import('./output-import.mjs?rev=20261020-format-conversion-1'); imported = await importOutputFiles([file], { signal });
        if (imported.previewOnly) throw new Error('簡易変換は800万画素までです。元画像のプレビューは詳細画面をお使いください。');
      }
      if (imported.audio) { const { listAudioOutputFormats } = await import('./output-audio-capabilities.mjs?rev=20261020-format-conversion-1'); imported.audioFormats = listAudioOutputFormats(); }
      if (signal.aborted || disposed || id !== operation) throw ABORT();
      clearOutput(); revoke(audioURL); audioURL = ''; $('audio').pause(); $('audio').removeAttribute('src'); $('audio').load();
      current = imported; currentFile = file; $('editor').hidden = false; $('name').textContent = file.name;
      $('drop-hint').textContent = '別のファイルに入れ替えられます'; $('choose').textContent = 'ファイルを変更'; $('drop').dataset.loaded = 'true';
      $('preview').hidden = !current.frames?.length; $('audio').hidden = true; $('settings').hidden = !current.frames?.length; $('settings').open = false;
      if (current.frames?.length) { const f = current.frames[0]; $('width').value = f.width; $('height').value = f.height; const ratio = Math.min(1, 240 / Math.max(f.width, f.height)); const canvas = $('preview'); canvas.width = Math.max(1, Math.round(f.width * ratio)); canvas.height = Math.max(1, Math.round(f.height * ratio)); canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(resize(f, canvas.width, canvas.height).data), canvas.width, canvas.height), 0, 0); $('meta').textContent = `${f.width} × ${f.height}px · ${units(file.size)}${current.frames.length > 1 ? ` · ${current.frames.length}コマ` : ''}`; $('frame').replaceChildren(...current.frames.map((_, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${i + 1}コマ目`; return o; })); }
      else { $('meta').textContent = `${current.audio.durationSeconds.toFixed(1)}秒 · ${current.audio.sampleRate}Hz · ${current.audio.channels.length}ch`; }
      options(); updateNote(); say('保存する形式を選んで、変換できます。'); $('format').focus();
    } catch (e) { if (id === operation && !disposed) say(e.name === 'AbortError' ? '読み込みを中止しました。' : e.message || '読み込めませんでした。'); }
    finally { if (id === operation && !disposed) { controller = null; busy(false); } }
  }
  async function convert() {
    if (!current || controller) return;
    const id = ++operation, f = $('format').value; controller = new AbortController(); const signal = controller.signal; busy(true); clearOutput(); say('変換しています…');
    try {
      let blob;
      if (current.frames?.length) {
        const width = Number($('width').value), height = Number($('height').value); checkDimensions(width, height);
        const animated = ['gif', 'apng'].includes(f); if (animated && width * height * current.frames.length > LIMITS.pixels) throw new Error('全コマの合計が800万画素を超えています。出力サイズを小さくしてください。');
        let frames = (animated ? current.frames : [current.frames[Number($('frame').value) || 0]]).map(frame => resize(frame, width, height));
        if (f === 'ico') { const scale = Math.min(1, 256 / Math.max(width, height)); const frame = resize(frames[0], Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))); blob = encodeIco(await (await raster(frame)).arrayBuffer(), frame.width, frame.height); }
        else if (['bmp', 'tga', 'qoi', 'tiff', 'pbm', 'pgm', 'ppm'].includes(f)) blob = await workerJob('encode-image', frames[0], f, signal);
        else { const { encodeOutput } = await import('./output-encoders.mjs?rev=20261020-format-conversion-1'); blob = await encodeOutput({ format: f, frames, totalPlays: current.totalPlays ?? 1, quality: Number($('quality').value) / 100, gifBackground: '#ffffff' }, { encodeRaster: raster, signal }); }
      } else if (['wav', 'aiff', 'au'].includes(f)) blob = await workerJob('encode-audio', current.audio, f, signal);
      else { const { encodeNativeAudio } = await import('./output-audio-encode.mjs?rev=20261020-format-conversion-1'); const result = await encodeNativeAudio(current.audio, { formatChoice: current.audioFormats.find(c => c.value === f), signal }); blob = result.blob; }
      if (signal.aborted || disposed || id !== operation) throw ABORT();
      if (!(blob instanceof Blob) || !blob.size) throw new Error('出力を確認できませんでした。');
      resultURL = makeURL(blob); $('download').href = resultURL; $('download').download = outputName(currentFile.name, f); $('download').textContent = `保存する · ${units(blob.size)}`; $('convert').hidden = true; $('download').hidden = false;
      if (current.audio && f === 'wav') { revoke(audioURL); audioURL = makeURL(blob); $('audio').src = audioURL; $('audio').hidden = false; }
      say(`${f.toUpperCase()}を作成しました。元のファイルは変更していません。`); $('download').focus();
    } catch (e) { if (!disposed && id === operation) say(e.name === 'AbortError' ? '変換を中止しました。設定を変えて再試行できます。' : e.message || '変換できませんでした。'); }
    finally { if (!disposed && id === operation) { controller = null; busy(false); } }
  }
  $('choose').onclick = () => $('input').click();
  $('input').onchange = () => { const file = $('input').files[0]; $('input').value = ''; void load(file); };
  root.ondragover = e => { e.preventDefault(); if (!controller) $('drop').dataset.over = 'true'; };
  root.ondragleave = e => { if (!root.contains(e.relatedTarget)) delete $('drop').dataset.over; };
  root.ondrop = e => { e.preventDefault(); delete $('drop').dataset.over; if (e.dataTransfer.files.length !== 1) { say('簡易変換は1ファイルずつです。複数画像の合成は詳細画面をご利用ください。'); return; } void load(e.dataTransfer.files[0]); };
  $('format').onchange = () => { clearOutput(); updateNote(); say('形式を変更しました。変換すると保存できます。'); };
  for (const axis of ['width', 'height']) $(axis).oninput = () => { if ($('ratio').checked && current?.frames?.length) { const f = current.frames[0], other = axis === 'width' ? 'height' : 'width'; if (Number($(axis).value) > 0) $(other).value = Math.max(1, Math.round(Number($(axis).value) * f[other] / f[axis])); } clearOutput(); };
  $('quality').oninput = () => { $('quality-value').textContent = `${$('quality').value}%`; clearOutput(); }; $('frame').onchange = clearOutput;
  $('convert').onclick = () => void convert(); $('cancel').onclick = () => controller?.abort();
  $('advanced').onclick = async () => { if (controller) return; try { if (!currentFile) { await onAdvanced?.(); return; } controller = new AbortController(); busy(true); say('詳細画面へ引き継いでいます…'); let file = currentFile;
    const extra = detectExtraFormat(new Uint8Array(await currentFile.slice(0, 32).arrayBuffer()), currentFile.name);
    if (extra) { const blob = current.audio ? await workerJob('encode-audio', current.audio, 'wav', controller.signal) : await raster(current.frames[0]); file = new File([blob], outputName(currentFile.name, current.audio ? 'wav' : 'png'), { type: blob.type }); }
    await onAdvanced?.([file]);
  } catch (e) { if (!disposed) { say(e.message); controller = null; busy(false); } } };
  const onHidden = () => { if (document.hidden && current?.audio) controller?.abort(); };
  document.addEventListener('visibilitychange', onHidden);
  return () => { disposed = true; operation++; controller?.abort(); document.removeEventListener('visibilitychange', onHidden); for (const u of urls) URL.revokeObjectURL(u); $('audio')?.pause(); root.ondrop = root.ondragover = root.ondragleave = null; };
}
