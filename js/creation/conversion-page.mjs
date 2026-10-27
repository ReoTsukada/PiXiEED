import {FILE_ACCEPT, loadConversionFile, conversionChoices, outputNotice, convertLocal, safeConvertedName} from './conversion-service.mjs?rev=20261028-flac-1';
import {notifyToolEntryReady} from '../tool-offerwall-entry.mjs?rev=20261024-common-tool-start-1';

/** Local-only task UI. File names and bytes never enter URLs, storage or analytics. */
export function mountConversionPage(doc=document, win=window) {
  const main=doc.getElementById('main');
  if(!main || main.dataset.simpleConversion) return;
  doc.body.classList.add('simple-conversion-page');
  main.dataset.simpleConversion='true';
  main.className='conversion-main';
  doc.title='ファイルを変換｜PiXiEED';
  const header=doc.querySelector('.output-header__label');
  if(header)header.textContent='ファイルを変換';
  main.innerHTML=`
    <div class="convert-heading"><a href="/output/">変換ガイド</a><span>端末内で処理 · 無料</span></div>
    <h1 tabindex="-1">ファイルを変換</h1>
    <p class="convert-lead">素材を選ぶ。保存形式を選ぶ。それだけ。</p>
    <section class="convert-card" aria-label="変換するファイル">
      <div class="convert-drop" data-drop>
        <span class="convert-drop-icon" aria-hidden="true">↥</span>
        <button class="convert-primary" type="button" data-pick>ファイルを選ぶ</button>
        <p>または、ここに1ファイルをドロップ</p>
        <small>画像・音声 · 1ファイル64MBまで</small>
      </div>
      <input data-file type="file" hidden>
      <div data-editor hidden>
        <div class="convert-file"><div><strong data-name></strong><p data-meta></p></div><button class="convert-secondary" data-replace type="button">選び直す</button></div>
        <div class="convert-preview" data-preview hidden></div>
        <p class="convert-source-note" data-source-note hidden></p>
        <div class="convert-format"><label for="convert-format">保存形式</label><select id="convert-format" data-format aria-describedby="convert-notice"></select></div>
        <p class="convert-notice" id="convert-notice" data-notice></p>
        <details class="convert-options"><summary>サイズ・画質などを調整</summary>
          <fieldset data-image-options><legend>画像の設定</legend>
            <div class="convert-fields"><label>幅（px）<input data-width type="number" min="1" max="4096" inputmode="numeric"></label><label>高さ（px）<input data-height type="number" min="1" max="4096" inputmode="numeric"></label></div>
            <label class="convert-check"><input data-ratio type="checkbox" checked>縦横比を保つ</label>
            <label data-quality-field>画質 <span data-quality-value>90%</span><input data-quality type="range" min="10" max="100" value="90"></label>
            <label data-background-field>透過部分の背景色 <input data-background type="color" value="#ffffff"></label>
            <label data-threshold-field>白黒のしきい値 <input data-threshold type="range" min="0" max="255" value="128"></label>
            <label data-frame-field>保存するコマ <input data-frame type="number" min="1" value="1" inputmode="numeric"></label>
          </fieldset>
          <fieldset data-audio-options hidden><legend>音声の設定</legend><label data-bits-field>PCMビット深度<select data-bits><option value="16">16bit（標準）</option><option value="24">24bit</option><option value="32">32bit</option></select></label><p>ビット深度を増やしても元音声の情報量は増えません。読み込み時にブラウザーが再サンプリングする場合があります。</p></fieldset>
        </details>
        <div class="convert-actions"><button class="convert-primary" data-convert type="button">変換する</button><a class="convert-primary" data-download download hidden>保存する</a></div>
      </div>
      <progress data-progress aria-label="変換の進行状況" hidden></progress><button class="convert-secondary" data-cancel type="button" hidden>中止</button>
      <p class="convert-status" data-status role="status" aria-live="polite"></p>
    </section>
    <div class="convert-support"><p>複数画像のGIF・動画と音楽の合成は <a href="/output/work/" data-advanced>詳細ワークスペース</a> へ。</p><details><summary>読み込める形式と制限</summary><p>PNG・JPEG・WebP・GIF・APNGに加え、BMP（24/32bit非圧縮）、TIFF（8bit RGB/グレー・非圧縮/PackBits/LZW・先頭ページ）、TGA（RGB/グレー、RLE）、QOI、ICO（PNG内包または24/32bit）、PBM・PGM・PPM・PAM、静的SVGに対応します。画像は各辺4096px・合計800万画素まで。アニメーションの読込はブラウザーに依存します。</p><p>音声はAIFF/AIFC（PCM）、AU（PCM/浮動小数点/μ-law/A-law）と、ブラウザーが読み込めるWAV・MP3等。120秒以内・モノラル/ステレオ・8〜48kHzが対象です。ブラウザー依存の一部入力は4MBまでです。FLACは16bit固定・非圧縮フレームで保存します。ファイルサイズの削減や16bitを超える精度の維持は保証しません。MP3への保存、HEIC/HEIF・PSD・RAW等は未対応です。</p><p>SVGは2MB・5000要素以内。スクリプト・外部参照・埋め込み・アニメーションは読み込めません。画像出力では色プロファイル・EXIF・レイヤーを、音声出力ではタグを保持しません。元のファイルは変更しません。</p></details></div>`;
  const $=selector=>main.querySelector(selector), input=$('[data-file]'), format=$('[data-format]'), status=$('[data-status]'), progress=$('[data-progress]');
  input.accept=FILE_ACCEPT;
  let source=null, controller=null, busy=false, resultUrl=null, previewUrl=null, revision=0, unsaved=false;
  const webp=(()=>{try{return doc.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');}catch{return false;}})();
  function text(message){status.textContent=message;}
  function releaseResult(){if(resultUrl)win.URL.revokeObjectURL(resultUrl);resultUrl=null;$('[data-download]').hidden=true;$('[data-download]').removeAttribute('href');$('[data-convert]').hidden=false;unsaved=false;}
  function disable(value){busy=value;for(const el of main.querySelectorAll('input,select,[data-convert],[data-replace],[data-pick]'))el.disabled=value;$('[data-cancel]').hidden=!value;progress.hidden=!value;main.setAttribute('aria-busy',String(value));if(value)progress.removeAttribute('value');}
  function updateOptions(){if(!source)return;const value=format.value,isImage=source.kind==='image';$('[data-image-options]').hidden=!isImage;$('[data-audio-options]').hidden=isImage;$('[data-bits-field]').hidden=!['wav','aiff','au'].includes(value);$('[data-quality-field]').hidden=!['jpeg','webp'].includes(value);$('[data-background-field]').hidden=!['jpeg','bmp','ppm','pgm','pbm','gif'].includes(value);$('[data-threshold-field]').hidden=value!=='pbm';$('[data-frame-field]').hidden=!isImage||source.frames.length<2||['gif','apng'].includes(value);$('[data-notice]').textContent=outputNotice(source,value);$('summary').textContent=isImage?'サイズ・画質などを調整':'音声の詳細設定';}
  async function preview(next,token){if(previewUrl)win.URL.revokeObjectURL(previewUrl);previewUrl=null;const area=$('[data-preview]');area.replaceChildren();area.hidden=true;if(next.kind!=='image')return;const f=next.frames[0],canvas=doc.createElement('canvas'),scale=Math.min(1,640/f.width,320/f.height);canvas.width=Math.max(1,Math.round(f.width*scale));canvas.height=Math.max(1,Math.round(f.height*scale));const raw=doc.createElement('canvas');raw.width=f.width;raw.height=f.height;raw.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.data),f.width,f.height),0,0);canvas.getContext('2d').drawImage(raw,0,0,canvas.width,canvas.height);raw.width=raw.height=1;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',next.frames.length>1?'読み込んだ画像の先頭コマ':'読み込んだ画像のプレビュー');if(token!==revision)return;area.append(canvas);area.hidden=false;}
  async function load(file){if(!file||busy)return;const token=++revision;controller=new AbortController();disable(true);text('ファイルを確認しています…');try{const next=await loadConversionFile(file,{signal:controller.signal});if(token!==revision)return;source=next;releaseResult();$('[data-drop]').hidden=true;$('[data-editor]').hidden=false;$('[data-name]').textContent=next.name;$('[data-meta]').textContent=next.kind==='image'?`${next.frames[0].width} × ${next.frames[0].height}px${next.frames.length>1?` · ${next.frames.length}コマ`:''}`:`${next.audio.sampleRate.toLocaleString()} Hz · ${next.audio.channels.length}ch · ${next.audio.durationSeconds.toFixed(2)}秒`;$('[data-source-note]').textContent=next.note;$('[data-source-note]').hidden=!next.note;format.replaceChildren(...conversionChoices(next,{webp}).map(choice=>{const option=doc.createElement('option');option.value=choice.value;option.textContent=choice.label;return option;}));format.value=next.kind==='image'?'png':'wav';if(next.kind==='image'){const f=next.frames[0];$('[data-width]').value=f.width;$('[data-height]').value=f.height;$('[data-frame]').value=1;$('[data-frame]').max=next.frames.length;}$('[data-ratio]').checked=true;updateOptions();await preview(next,token);text('保存形式を選んで変換できます。');format.focus({preventScroll:true});}catch(error){if(token===revision)text(error.name==='AbortError'?'読み込みを中止しました。':error.message||'読み込めませんでした。元のファイルは変更していません。');}finally{if(token===revision){disable(false);controller=null;}input.value='';}}
  function changed(){if(busy)return;releaseResult();updateOptions();text('設定を変更しました。変換すると反映されます。');}
  $('[data-pick]').addEventListener('click',()=>input.click());$('[data-replace]').addEventListener('click',()=>input.click());input.addEventListener('change',()=>load(input.files?.[0]));
  const drop=$('[data-drop]');for(const name of ['dragenter','dragover'])drop.addEventListener(name,event=>{event.preventDefault();if(!busy)drop.classList.add('is-dragging');});for(const name of ['dragleave','drop'])drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('is-dragging');});drop.addEventListener('drop',event=>{const files=event.dataTransfer?.files;if(files?.length!==1){text('一度に1ファイルを選んでください。');return;}load(files[0]);});
  main.addEventListener('change',event=>{if(event.target===format||event.target.closest('.convert-options'))changed();});
  main.addEventListener('input',event=>{if(!source||busy)return;const target=event.target;if(target.matches('[data-width],[data-height]')&&$('[data-ratio]').checked){const f=source.frames[0],value=Number(target.value);if(value>0&&Number.isFinite(value)){const other=target.matches('[data-width]')?$('[data-height]'):$('[data-width]');other.value=Math.max(1,Math.round(value*(target.matches('[data-width]')?f.height/f.width:f.width/f.height)));}}if(target.closest('.convert-options')){releaseResult();$('[data-quality-value]').textContent=$('[data-quality]').value+'%';}});
  $('[data-convert]').addEventListener('click',async()=>{if(!source||busy)return;releaseResult();controller=new AbortController();disable(true);text('変換しています…');const token=++revision;try{const options={width:Number($('[data-width]').value),height:Number($('[data-height]').value),quality:Number($('[data-quality]').value)/100,background:$('[data-background]').value,threshold:Number($('[data-threshold]').value),frameIndex:Number($('[data-frame]').value)-1,bitDepth:Number($('[data-bits]').value)};const blob=await convertLocal(source,format.value,options,controller.signal,value=>{if(Number.isFinite(value)){progress.max=1;progress.value=Math.max(0,Math.min(1,value));}});if(controller.signal.aborted)throw new DOMException('中止','AbortError');if(token!==revision)return;resultUrl=win.URL.createObjectURL(blob);const link=$('[data-download]');link.href=resultUrl;link.download=safeConvertedName(source.name,format.value);link.textContent=`保存する · ${blob.size>=1024*1024?(blob.size/1024/1024).toFixed(2)+' MB':(blob.size/1024).toFixed(1)+' KB'}`;link.hidden=false;$('[data-convert]').hidden=true;unsaved=true;text('変換できました。「保存する」で端末に保存できます。');link.focus({preventScroll:true});}catch(error){text(error.name==='AbortError'?'変換を中止しました。素材と設定はそのままです。':error.message||'変換できませんでした。');}finally{if(token===revision){disable(false);controller=null;}}});
  $('[data-cancel]').addEventListener('click',()=>controller?.abort());$('[data-download]').addEventListener('click',()=>{unsaved=false;});
  const hide=()=>{if(doc.visibilityState==='hidden'&&busy){controller?.abort();}};doc.addEventListener('visibilitychange',hide);
  const beforeLeave=event=>{if(busy||unsaved){event.preventDefault();event.returnValue='';}};win.addEventListener('beforeunload',beforeLeave);
  win.addEventListener('pagehide',()=>{controller?.abort();if(resultUrl)win.URL.revokeObjectURL(resultUrl);if(previewUrl)win.URL.revokeObjectURL(previewUrl);doc.removeEventListener('visibilitychange',hide);win.removeEventListener('beforeunload',beforeLeave);},{once:true});
  notifyToolEntryReady(false);
}
