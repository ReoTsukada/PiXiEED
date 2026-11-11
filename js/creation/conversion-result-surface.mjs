import { decodeGeneratedPreview, needsDecodedOutputPreview } from './conversion-preview-decoder.mjs?rev=20261105-video-size-1';
import { createResultPreviewQueue } from './conversion-result-queue.mjs?rev=20261105-video-size-1';
import { classifyConversionPreview } from './conversion-preview-controller.mjs?rev=20261104-engine-boundaries-3';
import { mountConversionSourceInspector } from './conversion-source-inspector.mjs?rev=20261110-output-result-1';

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
  const settingsButton = main.querySelector('[data-sc-settings-open]');
  const oldCardHidden=card.hidden;
  const positions = [card, legacy, summary, settingsButton].filter(Boolean).map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));
  const host = doc.createElement('section'); host.className = 'sc-result-surface'; host.setAttribute('aria-label', '選択した出力形式のプレビュー');
  host.innerHTML = '<div class="sc-preview-toolbar" data-sc-preview-toolbar><header><strong>出力プレビュー</strong><div class="sc-preview-header-actions"><button type="button" data-result-refresh aria-label="プレビューを更新" title="プレビューを更新" hidden>更新</button><button type="button" data-result-cancel hidden>更新を中止</button></div></header></div><div class="sc-result-body" data-sc-result-body><div class="sc-result-content"><img alt="生成した出力ファイルのプレビュー" hidden><audio controls hidden></audio><video controls playsinline hidden></video><p data-result-fallback hidden></p><label data-result-text-label hidden></label><textarea data-result-text readonly spellcheck="false" wrap="off" hidden></textarea><p data-result-text-note hidden></p></div><p data-result-state role="status" aria-live="polite"></p></div><details class="sc-result-aux" aria-label="素材とコピーなどの操作"><summary>素材・コピーなどの操作</summary><div class="sc-result-aux-content"></div></details>';
  composer.after(host);
  const body = host.querySelector('[data-sc-result-body]'), auxiliary = host.querySelector('.sc-result-aux'), auxiliaryContent = host.querySelector('.sc-result-aux-content');
  const content = host.querySelector('.sc-result-content'), message = host.querySelector('[data-result-state]');
  const refresh = host.querySelector('[data-result-refresh]'), cancel = host.querySelector('[data-result-cancel]'), fallback = host.querySelector('[data-result-fallback]');
  const resultText = host.querySelector('[data-result-text]'), resultTextLabel = host.querySelector('[data-result-text-label]'), resultTextNote = host.querySelector('[data-result-text-note]');
  const sourceInspector = mountConversionSourceInspector({ doc, win });
  const headerActions = host.querySelector('.sc-preview-header-actions');
  headerActions.append(sourceInspector.element);
  const sourceAndSettings = composer.querySelector('.sc-unified-head');
  if (settingsButton && sourceAndSettings) sourceAndSettings.append(settingsButton);
  let sourceStyle = doc.querySelector?.('link[data-source-preview-style]') || null, ownsSourceStyle = false;
  if (!sourceStyle && doc.head) {
    sourceStyle = doc.createElement('link'); sourceStyle.rel = 'stylesheet';
    sourceStyle.href = '/css/conversion-source-preview.css?rev=20261110-output-layout-7'; sourceStyle.dataset.sourcePreviewStyle = '';
    doc.head.append(sourceStyle); ownsSourceStyle = true;
  }
  if (summary) auxiliaryContent.append(summary);
  auxiliaryContent.append(card, legacy);
  // Native materials/actions belong to the bounded settings pane, never the preview viewport.
  composer.append(auxiliary);
  main.dataset.unifiedResult = 'true';
  const decodedCanvas=doc.createElement('canvas');decodedCanvas.hidden=true;decodedCanvas.setAttribute('aria-label','生成済みファイルを復号した画素プレビュー');content.prepend(decodedCanvas);
  const decodeNote=doc.createElement('p');decodeNote.dataset.resultDecoded='';decodeNote.hidden=true;content.append(decodeNote);
  let decodeVersion=0,decodeKey='',decodeController=null;
  let current = null, stopped = false, ownedBlob = null, ownedUrl = '', lastHref = '', lastType = null, decodeFailed = false, queue;
  let previousMode = null, previousTab = null, previousActiveSourceId = null, previousOriginalFile = null, previousLoaded = null, previousMaterialFeedbackVisible = false;
  const set = (node, key, value) => { if (node[key] !== value) node[key] = value; };
  const flag = (node, key, value) => { if (node.dataset[key] !== value) node.dataset[key] = value; };
  const clearUrl = () => { if (ownedUrl) win.URL.revokeObjectURL(ownedUrl); ownedUrl = ''; ownedBlob = null; };
  function clearMediaNodes() {
    clearDecode(); lastHref = ''; lastType = null; decodeFailed = false;
    for (const tag of ['img','audio','video']) {
      const node = content.querySelector(tag); node.pause?.(); node.onerror = null; node.removeAttribute('src'); set(node,'hidden',true);
    }
  }
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
    const q = queue.snapshot;
    const output = current.mode === 'media' ? null : current.outputPreview;
    const outputMatches = Boolean(output && output.kind !== 'unknown' && output.matchesInput !== false && (!output.generationMode || output.generationMode === current.mode));
    const presentation = { ...current, ready: Boolean(current.ready && (current.mode === 'media' || outputMatches)) };
    const p = resultSurfacePresentation({ ...presentation, queue:q });
    flag(main,'resultSource','false');
    flag(main,'resultMode',current.mode);
    flag(host,'state',p.state); flag(host,'current',String(p.current));
    const sourceButton = sourceInspector.element.querySelector('[data-source-inspect-button]');
    const inspectorSources = current.mode === 'media' ? current.sources || [] : [];
    const inspectorActiveId = current.mode === 'media' ? current.activeSourceId || '' : '';
    const inspectorFile = current.mode === 'output' ? current.originalFile || null : null;
    const inspectorText = current.mode === 'input' ? current.sourceText || '' : '';
    const inspectorRevision = current.mode === 'input' ? current.sourceRevision || 0 : 0;
    const hasSources = Boolean(inspectorFile || inspectorText || (Array.isArray(inspectorSources) && inspectorSources.length));
    sourceInspector.update(inspectorSources, inspectorActiveId, inspectorFile, inspectorText, inspectorRevision);
    set(sourceButton,'disabled',!current.loaded || !hasSources);
    set(card,'hidden',current.mode==='media');
    const actualText = current.mode !== 'media' && output?.kind === 'text' && typeof output.text === 'string';
    const actualFile = current.mode !== 'media' && ['image','file'].includes(output?.kind) && output.blob;
    const previewType = actualFile ? generatedPreviewKind(output.filename, output.mimeType) : null;
    const actualMedia = Boolean(actualFile && previewType);
    const showText = Boolean(actualText && p.state !== 'empty');
    const showMedia = current.mode === 'media' ? p.state !== 'empty' : actualMedia && p.state !== 'empty';
    const showMetadata = Boolean(current.mode !== 'media' && output && output.kind !== 'unknown' && !actualText && !actualMedia && p.state !== 'empty');
    set(content,'hidden',!showText && !showMedia && !showMetadata);
    set(resultTextLabel,'hidden',!showText); set(resultText,'hidden',!showText); set(resultTextNote,'hidden',true);
    if (showText) {
      clearUrl(); clearMediaNodes(); set(fallback,'hidden',true);
      const project = output.format === 'pxtxt';
      set(resultTextLabel,'textContent',project ? `文章と設定データ（PXT） · ${output.filename || 'pixieed-text.pxtxt'}` : `保存されるTXT · ${output.filename || '文字出力.txt'}`);
      set(resultText,'value',output.text.slice(0,64000));
      const length = output.text.length;
      const truncated = length > 64000;
      set(resultTextNote,'textContent',truncated
        ? `表示は先頭64,000文字です。保存される${project ? 'PXT' : 'TXT'}には全文${length.toLocaleString()}文字${project ? 'の文章と設定' : '（添付された復元コードを含む）'}が含まれます。`
        : project ? `画像ではなく、保存される文章と設定のプロジェクトデータです。全文${length.toLocaleString()}文字。` : `保存されるTXTの全文${length.toLocaleString()}文字です。添付された復元コードも含みます。`);
      set(resultTextNote,'hidden',false);
    } else if (showMedia && current.mode !== 'media') {
      set(resultText,'value',''); set(resultTextNote,'hidden',true); set(resultTextLabel,'hidden',true);
      set(fallback,'hidden',true);
    } else if (showMetadata) {
      clearUrl(); clearMediaNodes(); set(fallback,'hidden',false);
      if (output && output.kind !== 'unknown') {
        const size = Number(output.blob?.size || 0);
        set(fallback,'textContent',`生成済みファイル ${output.filename || ''} · ${output.mimeType || '形式未指定'} · ${size.toLocaleString()} bytes。この形式の安全なインライン表示には対応していません。`);
      }
      set(resultText,'value',''); set(resultTextLabel,'hidden',true); set(resultTextNote,'hidden',true);
    } else if (current.mode !== 'media') {
      clearUrl(); clearMediaNodes(); set(fallback,'hidden',true);
      set(resultText,'value',''); set(resultTextLabel,'hidden',true); set(resultTextNote,'hidden',true);
    }
    let description;
    if (current.mode !== 'media') {
      if (actualMedia && showMedia) showBlob(output.blob, output.filename);
      if (!output || output.kind === 'unknown') description = current.working ? '更新中です。前回の出力があれば、その内容と形式を表示します。' : '現在の設定でまだ出力が生成されていません。';
      else if (p.current) description = actualMedia || actualText
        ? `現在の設定で生成した ${output.filename || output.format || '出力'} です。保存される内容をこの領域で確認できます。${output.format === 'svg' ? ' SVGの書体は表示環境によって変わることがあります。' : ''}`
        : `現在の設定で生成した ${output.filename || output.format || 'ファイル'} です。形式 ${output.mimeType || '未確認'}、${Number(output.blob?.size || 0).toLocaleString()} bytes。インライン表示には対応していません。`;
      else description = `${current.working ? '更新中です。' : '現在の設定には未反映です。'} 表示中は前回の ${output.filename || output.format || '出力'} です。`;
    } else if (p.owner === 'saved') {
      if (ownedUrl && ownedUrl !== current.link.href) clearUrl();
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
    if(current.capability?.notice&&p.current)description+=' '+current.capability.notice;
    set(message,'textContent',p.state==='empty'?'入力すると、ここで仕上がりを確認できます。':description);
    const queueWorking = ['queued','rendering'].includes(q.state);
    set(refresh,'hidden',!current.loaded || (current.mode==='media' ? !current.capability?.supported || (current.ready && !current.working) || (p.current && current.capability?.automatic) : current.working));
    set(refresh,'disabled',current.working || queueWorking);
    set(cancel,'hidden',current.mode==='media'?!queueWorking:!current.working);
    for (const tag of ['audio','video']) if (content.hidden) content.querySelector(tag).pause?.();
  }
  queue = createResultPreviewQueue({ timers:win, render: (payload,{signal}) => payload.api.previewOutput({signal,pendingFps:payload.pendingFps,pendingSize:payload.pendingSize}), onState: () => { draw(); schedule(); } });
  refresh.addEventListener('click',()=>{if(current?.mode==='media')queue.refresh();else refreshText();draw();});
  cancel.addEventListener('click',()=>{if(current?.mode==='media')queue.pause();else cancelText();draw();});
  return {
    update(next) {
      const tab = main.dataset.outputTab || '';
      const activeSourceId = next.activeSourceId || null, originalFile = next.originalFile || null;
      const identityChanged = previousMode === null || next.mode !== previousMode || tab !== previousTab
        || activeSourceId !== previousActiveSourceId || originalFile !== previousOriginalFile;
      if (identityChanged) body.scrollTop = 0;
      const loaded = Boolean(next.loaded);
      const mediaEmpty = next.mode === 'media' && !loaded;
      if (previousLoaded === null || loaded !== previousLoaded || next.mode !== previousMode) {
        if (mediaEmpty) auxiliary.open = true;
        else if (previousLoaded === false && loaded) auxiliary.open = false;
        else if (previousMode === 'media' && previousLoaded === false && next.mode !== 'media') auxiliary.open = false;
      }
      const materialFeedback = legacy.querySelector('.sc-material-feedback');
      const feedbackVisible = Boolean(materialFeedback && !materialFeedback.hidden);
      if (feedbackVisible && !previousMaterialFeedbackVisible) auxiliary.open = true;
      previousMaterialFeedbackVisible = feedbackVisible;
      previousMode = next.mode; previousTab = tab; previousActiveSourceId = activeSourceId;
      previousOriginalFile = originalFile; previousLoaded = loaded;
      current=next;
      const allow=next.mode==='media' && next.loaded && !next.working && !next.ready;
      queue.request({key:next.key,hasSource:allow,supported:Boolean(next.capability?.supported),automatic:Boolean(next.capability?.automatic),payload:{api:next.api,pendingFps:Boolean(next.pendingFps),pendingSize:Boolean(next.pendingSize)}});
      draw();
    },
    invalidate() { if(current)current={...current,ready:false};queue.pause(); },
    destroy() {
      stopped=true;queue.destroy();clearDecode();clearUrl();media();sourceInspector.destroy();
      // Restore the summary before its material surface is destroyed, then the legacy subtree.
      for (const item of positions.slice().reverse()) item.parent.insertBefore(item.node,item.next?.parentNode===item.parent?item.next:null);
      card.hidden=oldCardHidden;auxiliary.remove();host.remove();if(ownsSourceStyle)sourceStyle.remove();delete main.dataset.unifiedResult;delete main.dataset.resultSource;delete main.dataset.resultMode;
    },
  };
}
