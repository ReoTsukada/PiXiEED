import { decodeGeneratedPreview, needsDecodedOutputPreview } from './conversion-preview-decoder.mjs?rev=20261105-video-size-1';
import { createResultPreviewQueue } from './conversion-result-queue.mjs?rev=20261105-video-size-1';
import { classifyConversionPreview } from './conversion-preview-controller.mjs?rev=20261104-engine-boundaries-3';

export function decodedPreviewLabel(filename,frame) {
  const limit=frame.firstPageOnly?'TIFFの先頭ページのみを復号しています。総ページ数と後続ページの内容は、この表示では確認できません。':frame.partial?`${frame.frameCount}コマ／ページのうち先頭のみ。アニメーション全体の表示ではありません。`:'元素材や近似画像ではありません。';
  return `生成済み${filename}を復号した画素表示です。${limit}`;
}

export function generatedPreviewKind(filename,mime='') {
  if(/^audio\//.test(mime))return 'audio';
  if(/^video\//.test(mime))return 'video';
  return classifyConversionPreview(filename);
}

/** One result area; source inspection and stale bytes are always explicitly labelled. */
export function resultSurfacePresentation({ mode, loaded, ready, working, queue = {}, compare = false } = {}) {
  if (!loaded) return { state: 'empty', owner: 'empty', current: false };
  if (compare) return { state: 'source', owner: 'source', current: false };
  if (mode !== 'media') return { state: working ? 'rendering' : ready ? 'ready' : 'stale', owner: 'text', current: Boolean(ready && !working) };
  if (ready && !working) return { state: 'ready', owner: 'saved', current: true };
  const current = queue.state === 'ready' && queue.resultKey === queue.key && !working;
  return { state: working ? 'rendering' : queue.state || 'manual', owner: queue.result ? 'preview' : 'empty', current };
}

export function mountResultSurface({ main, doc = document, win = window, schedule = () => {}, refreshText = () => {}, cancelText = () => {}, decodeOutput = decodeGeneratedPreview } = {}) {
  const root = main.querySelector('[data-text-tools]'), composer = root?.querySelector('.sc-unified-composer');
  const card = root?.querySelector('.tx-result-card'), legacy = main.querySelector('.text-legacy');
  if (!root || !composer || !card || !legacy) return null;
  const summary = legacy.querySelector('.sc-preview-summary');
  const oldCardHidden=card.hidden;
  const positions = [card, legacy, summary].filter(Boolean).map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));
  const host = doc.createElement('section'); host.className = 'sc-result-surface'; host.setAttribute('aria-label', '選択した出力形式のプレビュー');
  host.innerHTML = '<header><strong>出力プレビュー</strong><button type="button" data-result-source aria-pressed="false">元の素材と比較</button></header><p data-result-state role="status" aria-live="polite"></p><div class="sc-result-operations"><button type="button" data-result-refresh hidden>プレビューを更新</button><button type="button" data-result-cancel hidden>更新を中止</button></div><div class="sc-result-content"><img alt="生成した出力ファイルのプレビュー" hidden><audio controls hidden></audio><video controls playsinline hidden></video><p data-result-fallback hidden></p></div>';
  composer.after(host);
  if (summary) host.prepend(summary);
  const content = host.querySelector('.sc-result-content'), message = host.querySelector('[data-result-state]');
  const sourceButton = host.querySelector('[data-result-source]'), refresh = host.querySelector('[data-result-refresh]'), cancel = host.querySelector('[data-result-cancel]'), fallback = host.querySelector('[data-result-fallback]');
  host.append(card, legacy);
  main.dataset.unifiedResult = 'true';
  const decodedCanvas=doc.createElement('canvas');decodedCanvas.hidden=true;decodedCanvas.setAttribute('aria-label','生成済みファイルを復号した画素プレビュー');content.prepend(decodedCanvas);
  const decodeNote=doc.createElement('p');decodeNote.dataset.resultDecoded='';decodeNote.hidden=true;content.append(decodeNote);
  let decodeVersion=0,decodeKey='',decodeController=null;
  let current = null, comparing = false, stopped = false, ownedBlob = null, ownedUrl = '', lastHref = '', lastType = null, decodeFailed = false, queue;
  const set = (node, key, value) => { if (node[key] !== value) node[key] = value; };
  const flag = (node, key, value) => { if (node.dataset[key] !== value) node.dataset[key] = value; };
  const clearUrl = () => { if (ownedUrl) win.URL.revokeObjectURL(ownedUrl); ownedUrl = ''; ownedBlob = null; };
  function clearDecode() {
    decodeVersion++;decodeController?.abort();decodeController=null;decodeKey='';set(decodedCanvas,'hidden',true);set(decodeNote,'hidden',true);decodedCanvas.width=decodedCanvas.height=1;
  }
  function startDecode(href,filename,blob) {
    if(decodeKey===href)return;
    clearDecode();decodeKey=href;const version=decodeVersion,controller=new AbortController();decodeController=controller;
    set(fallback,'hidden',false);set(fallback,'textContent','実ファイルを生成済みです。出力ファイルの画素を復号しています…');
    const input=blob?Promise.resolve(blob):/^blob:/.test(href)&&typeof win.fetch==='function'?win.fetch(href,{signal:controller.signal}).then(response=>{if(!response.ok)throw Error('生成済みファイルを読み取れません。');return response.blob();}):Promise.reject(Error('生成済みファイルの復号表示をこの環境では開始できません。'));
    input.then(blob=>decodeOutput({blob,filename,signal:controller.signal})).then(frame=>{
      if(stopped||controller.signal.aborted||version!==decodeVersion||lastHref!==href)return;
      if(!frame)throw Error('この形式の復号プレビューに対応していません。');
      const context=decodedCanvas.getContext('2d');if(!context)throw Error('画素表示を準備できません。');
      decodedCanvas.width=frame.width;decodedCanvas.height=frame.height;
      const image=context.createImageData(frame.width,frame.height);image.data.set(frame.data);context.putImageData(image,0,0);
      set(decodedCanvas,'hidden',false);set(fallback,'hidden',true);set(decodeNote,'hidden',false);
      set(decodeNote,'textContent',decodedPreviewLabel(filename,frame));schedule();
    }).catch(error=>{
      if(stopped||controller.signal.aborted||version!==decodeVersion||lastHref!==href)return;
      set(decodedCanvas,'hidden',true);set(fallback,'hidden',false);set(fallback,'textContent',`実ファイルは生成済みですが、復号表示できません。${error?.message||''} 形式・容量は上の生成結果で確認できます。`);schedule();
    }).finally(()=>{if(decodeController===controller)decodeController=null;});
  }
  function media(href = '', filename = '', mime = '', blob = null) {
    const type = generatedPreviewKind(filename,mime);
    if (href !== lastHref || type !== lastType) {
      clearDecode();lastHref = href; lastType = type; decodeFailed = false;
      for (const tag of ['img','audio','video']) {
        const node = content.querySelector(tag); node.pause?.(); node.onerror = null; node.removeAttribute('src'); set(node,'hidden',tag !== type || !href);
        if (tag === type && href) {
          node.onerror = () => { if (lastHref === href && lastType === type) { decodeFailed = true; set(node,'hidden',true); set(fallback,'hidden',false); set(fallback,'textContent','実ファイルを生成済みですが、このブラウザーでは表示・再生できません。保存前に形式と容量を確認できます。対応アプリでの再生確認は別途必要です。'); } };
          node.src = href;
        }
      }
    }
    if(href&&needsDecodedOutputPreview(filename)){startDecode(href,filename,blob);return;}
    set(fallback,'hidden',Boolean(type && href && !decodeFailed));
    if (!type || !href) set(fallback,'textContent',href ? '実ファイルを生成済みです。この形式の表示には対応していません。形式・容量を確認できます。対応アプリでの表示確認は別途必要です。' : 'まだ現在の設定の出力は生成されていません。');
  }
  function showBlob(blob, filename) {
    if (blob !== ownedBlob) { clearUrl(); ownedBlob = blob; ownedUrl = win.URL.createObjectURL(blob); }
    media(ownedUrl, filename,blob.type,blob);
  }
  function draw() {
    if (stopped || !current) return;
    const q = queue.snapshot, p = resultSurfacePresentation({ ...current, queue:q, compare:comparing });
    flag(main,'resultSource',String(comparing && current.mode === 'media'));
    flag(main,'resultMode',current.mode);
    flag(host,'state',p.state); flag(host,'current',String(p.current));
    set(sourceButton,'disabled',!current.loaded || (!current.originalFile && current.mode !== 'media'));
    if (sourceButton.getAttribute('aria-pressed') !== String(comparing)) sourceButton.setAttribute('aria-pressed',String(comparing));
    set(sourceButton,'textContent',comparing?'出力プレビューへ戻る':'元の素材と比較');
    const textVisible = current.mode !== 'media' && !comparing;
    set(card,'hidden',current.mode==='media');
    // The native text engine keeps all result, copy, encoding and restore controls.
    set(content,'hidden',textVisible || p.state === 'empty' || (comparing && current.mode === 'media'));
    let description;
    if (comparing) {
      description = '比較用の元の素材です。保存する出力結果ではありません。';
      if (current.mode !== 'media' && current.originalFile) showBlob(current.originalFile,current.originalFile.name);
    } else if (current.mode !== 'media') {
      clearUrl();media();
      description = current.ready && !current.working ? '現在の設定で生成した出力です。文字列の保存は全文です。復元コードの添付内容は文字列表示で確認できます。' : current.working ? '出力を更新中です。残っている表示は前回の結果です。' : '現在の設定は未生成または未反映です。表示が残っていれば前回の結果です。「プレビューを更新」で保存前に最新の出力を生成できます。';
    } else if (p.owner === 'saved') {
      media(current.link.href,current.link.download,current.link.type||(q.result?.format===current.capability?.format?q.result?.blob?.type:'')||((/^audio\//.test(current.originalFile?.type||''))?'audio/*':''));
      description = `現在の設定で生成済み：${current.link.download}`;
    } else {
      if (q.result?.blob) showBlob(q.result.blob,q.result.filename); else media();
      description = p.current ? `選択した形式で生成したプレビュー：${q.result.filename}（${q.result.blob.size.toLocaleString()} bytes）。保存時も現在の設定で生成します。`
        : p.state === 'queued' || p.state === 'rendering' ? '現在の設定の出力を更新中です。表示が残っていれば前回の結果です。'
        : p.state === 'error' ? `プレビュー更新に失敗しました。${q.error?.message || ''} 表示が残っていれば前回の結果です。素材と設定は保持しています。`
        : p.state === 'paused' ? '更新を中止しました。表示が残っていれば前回の結果です。素材と設定は保持しています。'
        : (current.capability?.reason || 'この形式の生成可否を確認してください。対応していれば保存前にプレビューを更新できます。')+(q.result?` 表示中は前回の${q.result.filename}です。現在の設定は未反映です。`:'');
    }
    if(p.current&&p.owner==='preview'&&q.result?.notice)description+=' '+q.result.notice;
    if(current.capability?.notice&&(p.current||comparing))description+=' '+current.capability.notice;
    set(message,'textContent',p.state==='empty'?'素材を追加すると、選択した出力形式のプレビューをここに表示します。':description);
    const queueWorking = ['queued','rendering'].includes(q.state);
    set(refresh,'hidden',!current.loaded || comparing || (current.mode==='media' ? !current.capability?.supported || (current.ready && !current.working) || (p.current && current.capability?.automatic) : current.working));
    set(refresh,'disabled',current.working || queueWorking);
    set(cancel,'hidden',comparing || (current.mode==='media'?!queueWorking:!current.working));
    for (const tag of ['audio','video']) if (content.hidden) content.querySelector(tag).pause?.();
  }
  queue = createResultPreviewQueue({ timers:win, render: (payload,{signal}) => payload.api.previewOutput({signal,pendingFps:payload.pendingFps,pendingSize:payload.pendingSize}), onState: () => { draw(); schedule(); } });
  sourceButton.addEventListener('click',()=>{comparing=!comparing;draw();schedule();});
  refresh.addEventListener('click',()=>{if(current?.mode==='media')queue.refresh();else refreshText();draw();});
  cancel.addEventListener('click',()=>{if(current?.mode==='media')queue.pause();else cancelText();draw();});
  return {
    update(next) {
      current=next;
      if (!next.loaded) comparing=false;
      const allow=next.mode==='media' && next.loaded && !next.working && !next.ready;
      queue.request({key:next.key,hasSource:allow,supported:Boolean(next.capability?.supported),automatic:Boolean(next.capability?.automatic),payload:{api:next.api,pendingFps:Boolean(next.pendingFps),pendingSize:Boolean(next.pendingSize)}});
      draw();
    },
    invalidate() { if(current)current={...current,ready:false};queue.pause(); },
    destroy() {
      stopped=true;queue.destroy();clearDecode();clearUrl();media();
      // Restore the summary before its material surface is destroyed, then the legacy subtree.
      for (const item of positions.slice().reverse()) item.parent.insertBefore(item.node,item.next?.parentNode===item.parent?item.next:null);
      card.hidden=oldCardHidden;host.remove();delete main.dataset.unifiedResult;delete main.dataset.resultSource;delete main.dataset.resultMode;
    },
  };
}
