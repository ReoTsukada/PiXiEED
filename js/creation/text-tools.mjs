import { detectText, decodeTextFile, MAX_CODE_CHARS, MAX_FILE_BYTES, safeName, encodeDocument } from './text-codec.mjs?rev=20261028-text-1';
import { renderText, canvasBlob } from './text-render.mjs?rev=20261028-text-1';
import { installTextLivePreview } from './text-live-preview.mjs?rev=20261030-live-text-1';
import { createTextArtViewer } from './text-art-viewer.mjs?rev=20261030-text-fit-1';
import { textPixelOrigin } from './text-pixel-origin.mjs?rev=20261030-text-fit-1';

/** An additive local workspace. Existing conversion state is kept, never rebuilt. */
export async function installTextTools(doc = document, win = window) {
  const main = doc.getElementById('main');
  if (!main || main.querySelector('[data-text-tools]')) return;
  const sheet = doc.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/css/text-tools.css?rev=20261028-text-1'; doc.head.append(sheet);
  const legacy = doc.createElement('div'); legacy.className = 'text-legacy';
  while (main.firstChild) legacy.append(main.firstChild);
  const root = doc.createElement('section'); root.dataset.textTools = ''; root.className = 'text-tools'; root.hidden = true;
  const nav = doc.createElement('div'); nav.className = 'text-mode-nav'; nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', '変換するもの');
  nav.innerHTML = '<button type="button" data-text-mode="media" aria-pressed="true">画像・音声・動画</button><button type="button" data-text-mode="input" aria-pressed="false">文字・メモから</button><button type="button" data-text-mode="output" aria-pressed="false">文字で出力</button>';
  root.innerHTML = `
    <header class="tx-heading"><div><p class="tx-kicker">PIXIEED / TEXT STUDIO</p><h1 data-tx-heading>ことばを、かたちに。</h1><p data-tx-intro>メモを貼る。画像にする。復元コードなら、元のファイルへ。</p></div><span class="tx-local">端末内で処理</span></header>
    <div class="tx-layout">
      <section class="tx-card tx-input-card" aria-label="素材と変換設定">
        <div data-tx-input-pane>
          <div class="tx-section-title"><h2>文字を入れる</h2><button class="tx-link" type="button" data-tx-read>TXTを読み込む</button></div>
          <label class="tx-visually-hidden" for="tx-source">文章・文字アート・復元コード</label>
          <textarea id="tx-source" data-tx-source spellcheck="false" placeholder="文章・文字アート・復元コードを貼り付けてください。メモの前後に説明があっても、復元コードを見つけます。"></textarea>
          <div class="tx-input-meta"><span data-tx-detected>文章として画像にできます</span><output data-tx-count>0文字</output></div>
          <label class="tx-label">何をつくる？<select data-tx-action><option value="auto">内容に合わせる</option><option value="text">文章・文字アートを画像にする</option><option value="restore">PiXiEED復元コードを戻す</option><option value="pixels">画素テキストを画像にする</option><option value="document">文章とレイアウトを再編集する</option><option value="dataurl">Data URLからファイルを戻す</option><option value="base64">Base64からファイルを戻す</option></select></label>
          <details class="tx-details" data-tx-render-options><summary>文字の見た目を調整</summary>
            <div class="tx-fields"><label>画像の幅<input data-tx-width type="number" min="320" max="2400" step="1" value="1000"></label><label>文字サイズ<input data-tx-font-size type="number" min="12" max="96" step="1" value="28"></label><label>余白<input data-tx-padding type="number" min="0" max="160" step="1" value="48"></label><label>行間（%）<input data-tx-line-height type="number" min="100" max="220" value="160"></label></div>
            <label>書体<select data-tx-font><option value="sans">ゴシック</option><option value="mono">等幅（文字アート向け）</option></select></label>
            <div class="tx-fields"><label>文字色<input data-tx-foreground type="color" value="#213e32"></label><label>背景色<input data-tx-background type="color" value="#fffefb"></label></div>
            <label class="tx-check"><input data-tx-wrap type="checkbox" checked>幅に合わせて折り返す</label>
          </details>
          <details class="tx-details"><summary>ファイルの文字コード</summary><label>読み込み時の文字コード<select data-tx-encoding><option value="utf-8">UTF-8（標準）</option><option value="shift_jis">Shift_JIS</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option></select></label><p>BOM付きUTF-16は自動判別します。変更後にファイルを読み込み直してください。</p></details>
        </div>
        <div data-tx-output-pane hidden>
          <div class="tx-section-title"><h2>文字にする素材</h2><button class="tx-link" type="button" data-tx-pick>ファイルを選ぶ</button></div>
          <div class="tx-file-label"><span aria-hidden="true">↥</span><div><strong data-tx-file-name>ファイルを選んでください</strong><small data-tx-file-size>画像・音声・動画・PXDなど、16MBまで</small></div></div>
          <label class="tx-label">どう表現する？<select data-tx-style><option value="encode">元ファイルへ戻せる復元コード</option><option value="ascii">ASCII文字アート</option><option value="block">ブロック文字アート</option><option value="braille">点字パターンアート</option><option value="emoji">絵文字アート</option><option value="custom">好きな文字で描く</option><option value="pixels">画素を編集できる文字列</option><option value="base64">Base64（開発者向け）</option><option value="dataurl">Data URL（開発者向け）</option></select></label>
          <div data-tx-art-options hidden><label class="tx-label">横の文字数<input data-tx-columns type="range" min="8" max="160" value="64"><output data-tx-columns-value>64文字</output></label><label data-tx-custom-field hidden>使う文字<input data-tx-characters type="text" value="PiXiEED" maxlength="128"></label><label class="tx-check"><input data-tx-invert type="checkbox">明暗を反転</label><label class="tx-check"><input data-tx-attach type="checkbox">元ファイルの復元コードも添える</label></div>
          <div data-tx-native-options hidden><label class="tx-check"><input data-tx-native-grid type="checkbox" checked>拡大ドット絵を元のドット数で読む</label><p class="tx-native-hint" data-tx-native-hint>完全一致する整数倍拡大だけを縮小します。元ファイル・復元コードは変更しません。</p></div>
          <p class="tx-hint" data-tx-file-hint>元ファイルの内容を保った復元コードです。暗号化ではありません。共有すると元ファイル全体が相手に渡ります。</p>
        </div>
        <input type="file" data-tx-file hidden><input type="file" data-tx-text-file accept=".txt,.md,.json,.pxtxt,text/plain,text/markdown,application/json" hidden>
        <button class="tx-primary" type="button" data-tx-run>画像にする <span aria-hidden="true">→</span></button>
        <div class="tx-process" data-tx-process hidden><progress aria-label="変換中"></progress><button class="tx-link" type="button" data-tx-cancel>中止</button></div>
        <p class="tx-status" role="status" aria-live="polite" data-tx-status>ファイルは外部にアップロードしません。</p>
      </section>
      <section class="tx-card tx-result-card" aria-label="変換結果">
        <div class="tx-section-title"><h2>仕上がり</h2><span class="tx-badge" data-tx-badge>プレビュー</span></div>
        <div class="tx-empty" data-tx-empty><div class="tx-glyph" aria-hidden="true">Aa<span>↔</span>▦</div><h3>文字も、画像も。行き来する。</h3><p>結果を見てからコピー・保存。<br>変換が終わったら、すぐに使えます。</p><button type="button" class="tx-link" data-tx-example>文章のサンプルを試す →</button></div>
        <div data-tx-result hidden>
          <p class="tx-result-note" data-tx-result-note></p>
          <div class="tx-canvas" data-tx-preview hidden></div>
          <label class="tx-visually-hidden" for="tx-result">変換結果の文字列</label><textarea id="tx-result" data-tx-text-result readonly spellcheck="false" wrap="off" hidden></textarea>
          <p class="tx-mini" data-tx-preview-note hidden>表示は先頭64,000文字です。コピー・TXT保存には全文が含まれます。</p>
          <div class="tx-actions"><button class="tx-primary" data-tx-copy type="button" hidden>全文をコピー</button><button class="tx-secondary" data-tx-select type="button" hidden>全文を選択</button><a class="tx-primary" data-tx-download download hidden>ファイルを保存</a><a class="tx-secondary" data-tx-txt download hidden>TXTで保存</a></div>
          <div class="tx-more"><button class="tx-link" data-tx-art-image type="button" hidden>この文字を画像にする →</button><button class="tx-link" data-tx-use type="button" hidden>画像・音声の変換に使う →</button><a class="tx-link" data-tx-project download hidden>文章と設定を保存</a><a class="tx-link" data-tx-svg download hidden>SVGで保存</a><a class="tx-link" data-tx-grid download hidden>画素データをそのまま保存</a></div>
        </div>
        <p class="tx-privacy">復元コードは暗号化ではありません。公開前に、元ファイルや位置情報・編集情報を含めてよいか確認してください。</p>
      </section>
    </div>
    <footer class="tx-footer"><a href="/output/text/">文字アート・文章の画像化・復元コードのガイド</a><span>元ファイルは変更しません</span></footer>`;
  main.append(nav, legacy, root);
  const $ = selector => root.querySelector(selector), source = $('[data-tx-source]'), textResult = $('[data-tx-text-result]');
  source.maxLength = MAX_CODE_CHARS;
  const artViewer = createTextArtViewer(root, { document: doc, window: win });
  let mode = 'media', selected = null, outputText = '', artText = '', restoredFile = null, busy = false, aborter = null, dirtyResult = false;
  let frameCache = null, frameFile = null, originCache = null; const urls = new Map();
  const status = message => { $('[data-tx-status]').textContent = message; };
  const options = () => ({ width: Number($('[data-tx-width]').value), fontSize: Number($('[data-tx-font-size]').value), padding: Number($('[data-tx-padding]').value), lineHeight: Number($('[data-tx-line-height]').value), font: $('[data-tx-font]').value, foreground: $('[data-tx-foreground]').value, background: $('[data-tx-background]').value, wrap: $('[data-tx-wrap]').checked });
  function applyOptions(value) { for (const [key, selector] of Object.entries({ width:'width',fontSize:'font-size',padding:'padding',lineHeight:'line-height',font:'font',foreground:'foreground',background:'background' })) if (value[key] !== undefined) $(`[data-tx-${selector}]`).value = value[key]; if (typeof value.wrap === 'boolean') $('[data-tx-wrap]').checked = value.wrap; }
  function blobLink(selector, blob, name) { if (urls.has(selector)) win.URL.revokeObjectURL(urls.get(selector)); const url = win.URL.createObjectURL(blob); urls.set(selector, url); const link = $(selector); link.href = url; link.download = safeName(name); link.hidden = false; }
  function resetResult() {
    artViewer.clear();
    for (const url of urls.values()) win.URL.revokeObjectURL(url); urls.clear();
    for (const el of root.querySelectorAll('[data-tx-result] button,[data-tx-result] a')) { el.hidden = true; el.removeAttribute('href'); }
    $('[data-tx-preview]').replaceChildren(); $('[data-tx-preview]').hidden = true; textResult.hidden = true; textResult.value = ''; $('[data-tx-preview-note]').hidden = true;
    outputText = ''; artText = ''; restoredFile = null; $('[data-tx-empty]').hidden = true; $('[data-tx-result]').hidden = false;
    dirtyResult = true; root.dataset.txResultMode = mode;
  }
  function showText(text, note, art = '') {
    resetResult(); outputText = text; artText = art; textResult.value = text.slice(0,64000); textResult.hidden = false; $('[data-tx-preview-note]').hidden = text.length <= 64000;
    $('[data-tx-copy]').hidden = false; $('[data-tx-select]').hidden = false; $('[data-tx-art-image]').hidden = !art;
    $('[data-tx-result-note]').textContent = note; $('[data-tx-badge]').textContent = `${text.length.toLocaleString()}文字`;
    blobLink('[data-tx-txt]',new Blob([text],{type:'text/plain;charset=utf-8'}),`${safeName(selected?.name || 'pixieed')}.txt`);
    artViewer.show(art, { source: selected });
  }
  async function showTextImage(text, settings, signal) {
    await doc.fonts?.ready; if (signal.aborted) throw new DOMException('中止','AbortError');
    const rendered = renderText(text, settings, doc), png = await canvasBlob(rendered.canvas);
    if (signal.aborted) throw new DOMException('中止','AbortError');
    resetResult(); rendered.canvas.setAttribute('role','img'); rendered.canvas.setAttribute('aria-label','入力した文章を配置した画像'); $('[data-tx-preview]').append(rendered.canvas); $('[data-tx-preview]').hidden = false;
    $('[data-tx-result-note]').textContent = `${rendered.canvas.width} × ${rendered.canvas.height}px。文章と設定を保存すると、貼り付けて再編集できます。SVGの書体は表示環境によって変わります。`;
    $('[data-tx-badge]').textContent = 'PNG'; blobLink('[data-tx-download]',png,'pixieed-text.png'); blobLink('[data-tx-svg]',new Blob([rendered.svg],{type:'image/svg+xml'}),'pixieed-text.svg');
    const project = encodeDocument(text,rendered.options); blobLink('[data-tx-project]',new Blob([project],{type:'text/plain;charset=utf-8'}),'pixieed-text.pxtxt');
    restoredFile = new File([png],'pixieed-text.png',{type:'image/png'}); $('[data-tx-use]').hidden = false;
  }
  async function showPixels(frame, original, signal) {
    const canvas = doc.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height; canvas.getContext('2d').putImageData(new ImageData(frame.data,frame.width,frame.height),0,0);
    const png = await canvasBlob(canvas); if (signal.aborted) throw new DOMException('中止','AbortError');
    resetResult(); canvas.setAttribute('role','img'); canvas.setAttribute('aria-label','画素テキストから復元した画像'); $('[data-tx-preview]').append(canvas); $('[data-tx-preview]').hidden=false;
    $('[data-tx-badge]').textContent='画素データを復元'; $('[data-tx-result-note]').textContent='色・透明度・マス目を復元しました。PNG保存ではCanvasによる色の丸めが起こり得ます。厳密なRGBAは元の画素テキストを保管してください。';
    blobLink('[data-tx-download]',png,'restored-pixels.png'); blobLink('[data-tx-grid]',new Blob([original],{type:'text/plain;charset=utf-8'}),'restored-pixels.txt');
    restoredFile=new File([png],'restored-pixels.png',{type:'image/png'}); $('[data-tx-use]').hidden=false;
  }
  function showFile(result) {
    resetResult(); restoredFile = new File([result.bytes],safeName(result.name),{type:result.type});
    $('[data-tx-result-note]').textContent=`${restoredFile.name} · ${restoredFile.size.toLocaleString()} bytes。${result.verified ? '保存されたSHA-256と内容が一致しました。改ざん者の本人確認をする署名ではありません。' : '元の検査値がないため、元ファイルとの一致は未検証です。形式の誤りがある場合は元データを確認してください。'}`;
    $('[data-tx-badge]').textContent=result.verified?'復元・破損検査済み':'ファイルに復元'; blobLink('[data-tx-download]',restoredFile,restoredFile.name); $('[data-tx-use]').hidden=!/^(image|audio|video)\//.test(result.type);
  }
  function chooseFile(file) { if(!file)return; if(!$('[data-tx-result]').hidden)$('[data-tx-badge]').textContent='前回の結果'; selected=file; frameCache=frameFile=originCache=null; $('[data-tx-file-name]').textContent=file.name; $('[data-tx-file-size]').textContent=`${file.size.toLocaleString()} bytes · ${file.type||'形式未指定'}`; root.textLivePreview?.invalidate(); }
  function kind() { return $('[data-tx-action]').value==='auto'?detectText(source.value):$('[data-tx-action]').value; }
  function refresh() {
    const action=kind(); $('[data-tx-count]').textContent=`${source.value.length.toLocaleString()}文字`;
    const labels={text:'文章として画像にできます',restore:'元ファイルの復元コードを検出',pixels:'画素テキストを検出',document:'文章とレイアウトの保存データを検出',dataurl:'Data URLを検出',base64:'Base64を明示的に指定中'};
    $('[data-tx-detected]').textContent=labels[action]; $('[data-tx-render-options]').hidden=!['text','document'].includes(action);
    const style=$('[data-tx-style]').value, art=['ascii','block','braille','emoji','custom'].includes(style); $('[data-tx-art-options]').hidden=!art; $('[data-tx-custom-field]').hidden=style!=='custom'; $('[data-tx-columns-value]').textContent=$('[data-tx-columns]').value+'文字';
    $('[data-tx-native-options]').hidden=!(art||style==='pixels');
    $('[data-tx-file-hint]').textContent=art?'画像の先頭コマを文字で表現します。文字アートだけでは元画像へ完全復元できません。復元コードを添えると元ファイル全体を共有します。絵文字・点字パターンの見え方は環境によって異なります。':style==='pixels'?'65,536画素以内のRGBAを色番号で保存します。読み込んだ画素からの復元で、元画像ファイルの付加情報は含みません。色番号の書き換えでマス目を編集できます。':'元ファイルの内容を文字列にします。暗号化ではありません。元ファイルより大きくなります（16MBまで）。PXDはファイル内容を保持しますが、再編集には対応する制作画面で開いてください。';
    $('[data-tx-run]').textContent=mode==='output'?'文字にする →':action==='text'?'画像にする →':action==='document'?'文章を開いて再編集 →':'復元する →';
  }
  function showMode(next) {
    if(busy||main.getAttribute('aria-busy')==='true')return;
    mode=next; root.hidden=mode==='media'; legacy.hidden=mode!=='media';
    for(const button of nav.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.textMode===mode));
    $('[data-tx-input-pane]').hidden=mode!=='input'; $('[data-tx-output-pane]').hidden=mode!=='output';
    $('[data-tx-heading]').textContent=mode==='output'?'画像を、文字へ。':'ことばを、かたちに。';
    $('[data-tx-intro]').textContent=mode==='output'?'見て楽しむ文字アート。元のファイルへ戻せるコード。':'メモを貼る。画像にする。復元コードなら、元のファイルへ。';
    main.classList.toggle('has-text-tools',mode!=='media');refresh();root.textLivePreview?.invalidate();
  }
  function setBusy(value) { busy=value; root.setAttribute('aria-busy',String(value)); for(const el of root.querySelectorAll('button,input,select,textarea'))if(!el.matches('[data-tx-cancel]'))el.disabled=value;for(const button of nav.querySelectorAll('button'))button.disabled=value; $('[data-tx-process]').hidden=!value; }
  function worker(operation,data,options,signal) {
    return new Promise((resolve,reject)=>{
      if(signal.aborted)return reject(new DOMException('中止','AbortError'));
      let task;try{task=new Worker(new URL('./text-worker.mjs?rev=20261028-text-1',import.meta.url),{type:'module'});}catch{return reject(new Error('変換処理を起動できませんでした。再読み込みしてください。'));}
      const clean=()=>{task.terminate();clearTimeout(timer);signal.removeEventListener('abort',cancel);};
      const cancel=()=>{clean();reject(new DOMException('中止','AbortError'));};
      const timer=setTimeout(()=>{clean();reject(new Error('処理が完了しませんでした。小さい素材でお試しください。'));},60000);
      signal.addEventListener('abort',cancel,{once:true});task.onmessage=({data:reply})=>{clean();reply.ok?resolve(reply.result):reject(new Error(reply.message));};task.onerror=()=>{clean();reject(new Error('変換用の処理を読み込めませんでした。'));};
      try{task.postMessage({operation,data,options});}catch(error){clean();reject(error);}
    });
  }
  async function run(job) { if(busy)return;aborter=new AbortController();setBusy(true);status('素材を確認しています…');try{await new Promise(resolve=>win.requestAnimationFrame(resolve));await job(aborter.signal);if(!aborter.signal.aborted)status('完了しました。すぐにコピー・保存できます。');}catch(error){status(error.name==='AbortError'?'中止しました。入力と前回の結果は保持しています。':error.message||'変換できませんでした。');}finally{setBusy(false);aborter=null;} }
  async function createOutput(signal) {
    // Snapshot every control before awaiting; never combine two slider/file revisions.
    const file = selected, style = $('[data-tx-style]').value;
    const settings = { style, columns:Number($('[data-tx-columns]').value), invert:$('[data-tx-invert]').checked, characters:$('[data-tx-characters]').value };
    const attached = $('[data-tx-attach]').checked;
    const useNativeGrid = $('[data-tx-native-grid]').checked;
    const check = () => { if (signal.aborted) throw new DOMException('中止','AbortError'); };
    check();
    if(!file)throw new Error('文字にするファイルを選んでください。');
    if(file.size>MAX_FILE_BYTES)throw new Error('文字列化は16MBまでです。小さなファイルを選んでください。');
    if(['encode','base64','dataurl'].includes(style)){
      const bytes=await file.arrayBuffer();check();
      const text=await worker(style,bytes,{name:file.name,type:file.type},signal);check();
      showText(text,style==='encode'?'元ファイルを復元できるコードです。メモへ全文を保存し、後日「文字・メモから」に貼り付けてください。':'標準の文字列符号化です。暗号化・圧縮ではありません。Base64のみではファイル名・種類は含まれません。');return;
    }
    let frame = frameFile===file ? frameCache : null;
    if(!frame){
      const {loadConversionFile}=await import('./conversion-service.mjs?rev=20261028-conversion-1');check();
      const loaded=await loadConversionFile(file,{signal});check();
      if(loaded.kind!=='image'||!loaded.frames?.length)throw new Error('文字アート・画素テキストには画像を選んでください。');
      frame=loaded.frames[0];
      if(selected===file){frameCache=frame;frameFile=file;}
    }
    const fileFrame = frame;
    if (useNativeGrid) {
      let normalized = originCache;
      if (!normalized) {
        normalized = await textPixelOrigin(fileFrame, { signal }); check();
        if (selected === file && frameFile === file) originCache = normalized;
      }
      frame = normalized.frame;
      const d = normalized.detection;
      $('[data-tx-native-hint]').textContent = frame !== fileFrame
        ? `ファイル ${fileFrame.width} × ${fileFrame.height}px → 読み込み ${frame.width} × ${frame.height}px（完全一致 ${d.scale}倍）。画素からの推定で、制作時の原寸とは限りません。チェックを外すとファイル寸法に戻せます。`
        : `読み込み ${fileFrame.width} × ${fileFrame.height}px。${d.status === 'candidate' ? '単色・単純な縞模様は原寸を判断できないため、縮小しません。' : d.reason === 'pixel-limit' ? '自動検出の上限を超えるため、元の寸法を保ちます。' : '完全一致する縮小格子がないため、元の寸法を保ちます。'}`;
    } else {
      $('[data-tx-native-hint]').textContent = `ファイル寸法 ${fileFrame.width} × ${fileFrame.height}pxで読み込みます。元ファイルは変更しません。`;
    }
    check();
    if(style==='pixels'){
      const text=await worker('pixels',frame,{},signal);check();
      showText(text,`${frame.width} × ${frame.height}px。`+'画素の色・透明度・配置を保持します。元ファイルのメタデータは含みません。色番号の書き換えでマス目を編集できます。');return;
    }
    const art=await worker('art',frame,settings,signal);check();
    let text=art;
    if(attached){
      const bytes=await file.arrayBuffer();check();
      text+='\n\n'+await worker('encode',bytes,{name:file.name,type:file.type},signal);check();
    }
    showText(text,attached?'文字アートと元ファイルの復元コードです。共有すると元ファイル全体が相手に渡ります。':'文字アートのみです。元画像への完全復元データは含みません。',art);
  }
  async function createInput(signal) {
    const action=kind(), text=source.value;status(action==='text'?'文章を画像にしています…':'復元データを検査しています…');
    if(action==='text'){await showTextImage(text,options(),signal);return;}
    if(action==='document'){const result=await worker('decode-document',text,{},signal);source.value=result.text;applyOptions(result.options);$('[data-tx-action]').value='text';refresh();await showTextImage(result.text,result.options,signal);return;}
    if(action==='pixels'){const frame=await worker('decode-pixels',text,{},signal);await showPixels(frame,text,signal);return;}
    const operation={restore:'restore',dataurl:'decode-dataurl',base64:'decode-base64'}[action];if(!operation)throw new Error('変換方法を選んでください。');
    showFile(await worker(operation,text,{},signal));
  }
  nav.addEventListener('click',event=>{const button=event.target.closest('[data-text-mode]');if(button)showMode(button.dataset.textMode);});
  root.addEventListener('input',event=>{refresh();if(mode!=='output'&&!event.target.matches('[data-tx-text-result]')&&!$('[data-tx-result]').hidden)$('[data-tx-badge]').textContent='前回の結果';});
  root.addEventListener('change',refresh);
  $('[data-tx-native-grid]').addEventListener('change',()=>root.textLivePreview?.invalidate());
  $('[data-tx-run]').addEventListener('click',()=>mode==='output'&&root.textLivePreview?root.textLivePreview.refresh():run(mode==='output'?createOutput:createInput));$('[data-tx-cancel]').addEventListener('click',()=>aborter?.abort());
  $('[data-tx-pick]').addEventListener('click',()=>$('[data-tx-file]').click());$('[data-tx-read]').addEventListener('click',()=>$('[data-tx-text-file]').click());
  $('[data-tx-file]').addEventListener('change',event=>{chooseFile(event.target.files?.[0]);event.target.value='';});
  async function readTextFile(file){if(!file||busy)return;await run(async signal=>{if(file.size>MAX_CODE_CHARS)throw new Error('テキストファイルは24MBまでです。');const text=decodeTextFile(await file.arrayBuffer(),$('[data-tx-encoding]').value);if(signal.aborted)throw new DOMException('中止','AbortError');source.value=text;showModeAfterRead();refresh();});}
  function showModeAfterRead(){mode='input';root.textLivePreview?.invalidate();$('[data-tx-input-pane]').hidden=false;$('[data-tx-output-pane]').hidden=true;for(const button of nav.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.textMode==='input'));}
  $('[data-tx-text-file]').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';void readTextFile(file);});
  root.addEventListener('dragover',event=>{event.preventDefault();});root.addEventListener('drop',event=>{event.preventDefault();if(busy)return;const files=event.dataTransfer?.files;if(files?.length!==1){status('一度に1ファイルを選んでください。');return;}if(mode==='input')void readTextFile(files[0]);else chooseFile(files[0]);});
  const capture=event=>{if(root.contains(event.target))return;const files=event.type==='drop'?event.dataTransfer?.files:event.target?.files;if(files?.length===1)chooseFile(files[0]);else if(files?.length>1){selected=null;frameCache=frameFile=originCache=null;root.textLivePreview?.invalidate();$('[data-tx-file-name]').textContent='文字出力は1ファイルずつ選んでください';$('[data-tx-file-size]').textContent='複数画像のGIF・動画は画像・音声・動画タブから';}};
  legacy.addEventListener('change',capture,true);legacy.addEventListener('drop',capture,true);
  $('[data-tx-example]').addEventListener('click',()=>{showMode('input');source.value='つくる。つなぐ。\nまた、つくり直せる。\n\nPiXiEEDで、ことばをかたちに。';$('[data-tx-action]').value='text';refresh();void run(createInput);});
  $('[data-tx-copy]').addEventListener('click',async()=>{try{if(!win.navigator.clipboard?.writeText)throw new Error();await win.navigator.clipboard.writeText(outputText);dirtyResult=false;status('全文をコピーしました。');}catch{artViewer.openRaw();textResult.value=outputText;textResult.focus();textResult.select();$('[data-tx-preview-note]').hidden=true;status('自動コピーを利用できません。選択中の全文をコピーするか、TXTで保存してください。');}});
  $('[data-tx-select]').addEventListener('click',()=>{artViewer.openRaw();textResult.value=outputText;textResult.focus();textResult.select();$('[data-tx-preview-note]').hidden=true;status('全文を選択しました。端末のコピー操作で保存してください。');});
  $('[data-tx-art-image]').addEventListener('click',()=>{const text=artText;showMode('input');source.value=text;$('[data-tx-action]').value='text';applyOptions({font:'mono',fontSize:16,width:1600,padding:32,lineHeight:110,wrap:false});refresh();void run(createInput);});
  $('[data-tx-use]').addEventListener('click',()=>{const input=legacy.querySelector('[data-file],#output-file-input');if(!restoredFile||!input){status('ファイルを保存してから、画像・音声の変換に読み込んでください。');return;}try{const transfer=new DataTransfer();transfer.items.add(restoredFile);input.files=transfer.files;showMode('media');input.dispatchEvent(new Event('change',{bubbles:true}));}catch{status('ファイルを保存してから読み込んでください。');}});
  root.addEventListener('click',event=>{if(event.target.closest('a[download]'))dirtyResult=false;});
  installTextLivePreview({ root, getMode:()=>mode, hasSource:()=>Boolean(selected), render:async signal=>{await createOutput(signal);dirtyResult=false;}, document:doc, window:win });
  const leave=event=>{if(busy||dirtyResult){event.preventDefault();event.returnValue='';}};win.addEventListener('beforeunload',leave);
  win.addEventListener('pagehide',event=>{aborter?.abort();if(!event.persisted){for(const url of urls.values())win.URL.revokeObjectURL(url);win.removeEventListener('beforeunload',leave);}});
  const params=new URLSearchParams(win.location.search);const initial=params.get('text');
  if(initial==='input'||initial==='output')showMode(initial);
  const key=params.has('id')?'id':params.has('file')?'file':null, id=key&&params.get(key);
  if(id&&params.getAll(key).length===1&&!(params.has('id')&&params.has('file'))&&/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id)){
    try {
      const record=key==='id'
        ?await (await import('./output-handoff.mjs?rev=20261028-unified-output-1')).readToolOutput(id)
        :await (await import('./output-router.mjs?rev=20261028-unified-output-1')).readOutputFile(id);
      if(record.blob)chooseFile(new File([record.blob],record.filename,{type:record.blob.type}));
    }catch{/* The existing receiver reports unavailable private files. */}
  }
}
