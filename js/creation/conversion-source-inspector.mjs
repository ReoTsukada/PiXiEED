const KIND_LABELS = Object.freeze({
  image: '画像', 'rgba-frames': '画像', raster: '画像',
  audio: '音声', 'audio-buffer': '音声',
  video: '動画', 'video-source': '動画', 'audio-video': '動画・音声',
});

function kindLabel(kind) { return KIND_LABELS[kind] || String(kind || '形式未確認'); }

/**
 * A read-only source inspector. It renders existing decoded pixels or local Blobs,
 * never encodes/fetches a source and never calls the conversion selection API.
 */
export function mountConversionSourceInspector({ doc = document, win = window } = {}) {
  const wrapper = doc.createElement('div'); wrapper.className = 'sc-source-inspector';
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'sc-source-inspector__trigger';
  button.dataset.sourceInspectButton = '';
  const icon = doc.createElementNS?.('http://www.w3.org/2000/svg', 'svg');
  if (icon) {
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
    const outline = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    outline.setAttribute('d', 'M2.2 12s3.4-6.2 9.8-6.2 9.8 6.2 9.8 6.2-3.4 6.2-9.8 6.2S2.2 12 2.2 12Z');
    outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', 'currentColor'); outline.setAttribute('stroke-width', '1.7');
    const pupil = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pupil.setAttribute('cx', '12'); pupil.setAttribute('cy', '12'); pupil.setAttribute('r', '2.6');
    pupil.setAttribute('fill', 'none'); pupil.setAttribute('stroke', 'currentColor'); pupil.setAttribute('stroke-width', '1.7');
    icon.append(outline, pupil); button.append(icon);
  } else button.textContent = '確認';
  button.setAttribute('aria-label', '元の素材を確認'); button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'sc-source-inspector-panel');
  const panel = doc.createElement('div'); panel.id = 'sc-source-inspector-panel'; panel.className = 'sc-source-inspector__panel';
  panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', '元の素材のプレビューと情報');
  const heading = doc.createElement('div'); heading.className = 'sc-source-inspector__heading';
  const title = doc.createElement('strong'); title.textContent = '元の素材';
  const close = doc.createElement('button'); close.type = 'button'; close.className = 'sc-source-inspector__close'; close.textContent = '閉じる'; close.setAttribute('aria-label', '素材の確認を閉じる');
  heading.append(title, close);
  const list = doc.createElement('div'); list.className = 'sc-source-inspector__list';
  const note = doc.createElement('p'); note.className = 'sc-source-inspector__note';
  note.textContent = '素材の確認だけを行います。現在の素材選択と保存する出力は変わりません。';
  panel.append(heading, list, note); wrapper.append(button, panel);

  let opened = false, hovered = false, focused = false, toggled = false, dismissed = false, suppressNextFocus = false, lastPointerType = '';
  let assetsKey = '', disposed = false;
  const ownedUrls = new Set();
  const objectIds = new WeakMap(); let objectSequence = 0;
  const objectId = value => {
    if (!value || typeof value !== 'object') return '';
    if (!objectIds.has(value)) objectIds.set(value, ++objectSequence);
    return objectIds.get(value);
  };
  function clearUrls() {
    for (const url of ownedUrls) win.URL?.revokeObjectURL?.(url);
    ownedUrls.clear();
  }
  function setOpen(next) {
    if (disposed || opened === next) return;
    if (!next) for (const media of panel.querySelectorAll?.('audio,video') || []) media.pause?.();
    opened = next; panel.hidden = !next; button.setAttribute('aria-expanded', String(next));
    if (next) drawActive();
  }
  const wantsOpen = () => !dismissed && (hovered || focused || toggled);
  function reconcile() { setOpen(wantsOpen()); }
  function dismiss(restoreFocus = false) {
    hovered = focused = toggled = false; dismissed = true; setOpen(false);
    if (restoreFocus) {
      suppressNextFocus = true;
      button.focus?.({ preventScroll: true });
    }
  }
  function addPreview(asset, card) {
    const file = asset?.file;
    const mime = String(file?.type || asset?.mimeType || '');
    const frame = asset?.firstFrame;
    const width = Number(frame?.width), height = Number(frame?.height), data = frame?.data;
    if (!(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 && data && data.length >= width * height * 4)
        && file && typeof file.arrayBuffer === 'function' && Number.isFinite(file.size)) {
      let tag = '';
      if (/^image\//.test(mime)) tag = 'img';
      else if (/^audio\//.test(mime)) tag = 'audio';
      else if (/^video\//.test(mime)) tag = 'video';
      if (tag && typeof win.URL?.createObjectURL === 'function') {
        const media = doc.createElement(tag), url = win.URL.createObjectURL(file); ownedUrls.add(url);
        if (tag === 'img') media.alt = `${asset.name || file.name || '元の素材'}のプレビュー`;
        if (tag === 'audio' || tag === 'video') {
          media.controls = true; media.preload = 'metadata';
          if (tag === 'video') media.playsInline = true;
        }
        const fallback = doc.createElement('p'); fallback.className = 'sc-source-inspector__fallback';
        fallback.textContent = 'この素材を読み込めませんでした。種類とファイル情報は上に表示しています。';
        media.onerror = () => { media.pause?.(); media.hidden = true; fallback.hidden = false; };
        fallback.hidden = true; media.src = url; card.append(media, fallback); return true;
      }
    }
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !data || data.length < width * height * 4) return false;
    try {
      const scale = Math.min(1, 640 / width, 400 / height);
      const targetWidth = Math.max(1, Math.floor(width * scale)), targetHeight = Math.max(1, Math.floor(height * scale));
      const canvas = doc.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${asset.name || '元の素材'}の縮小プレビュー`);
      const context = canvas.getContext('2d');
      if (!context?.createImageData) return false;
      const pixels = context.createImageData(targetWidth, targetHeight);
      for (let y = 0; y < targetHeight; y++) {
        const sourceY = Math.min(height - 1, Math.floor(y * height / targetHeight));
        for (let x = 0; x < targetWidth; x++) {
          const sourceX = Math.min(width - 1, Math.floor(x * width / targetWidth));
          const from = (sourceY * width + sourceX) * 4, to = (y * targetWidth + x) * 4;
          pixels.data[to] = data[from]; pixels.data[to + 1] = data[from + 1];
          pixels.data[to + 2] = data[from + 2]; pixels.data[to + 3] = data[from + 3];
        }
      }
      context.putImageData(pixels, 0, 0); card.append(canvas); return true;
    } catch { return false; }
  }
  let latest = { sources: [], activeSourceId: '', originalFile: null, sourceText: '', sourceRevision: 0 };
  function render(sources = [], activeSourceId = '', originalFile = null, sourceText = '', sourceRevision = 0) {
    latest = { sources: Array.isArray(sources) ? sources : [], activeSourceId: activeSourceId || '', originalFile,
      sourceText: typeof sourceText === 'string' ? sourceText : '', sourceRevision: Number(sourceRevision) || 0 };
    const assets = Array.isArray(sources) && sources.length ? sources : originalFile ? [{
      id: 'original-file', name: originalFile.name || '元の素材', kind: originalFile.type?.split('/')[0] || 'file',
      file: originalFile, size: originalFile.size, mimeType: originalFile.type,
    }] : [];
    const selected = activeSourceId ? assets.find(asset => asset?.id === activeSourceId) || null : assets[0] || null;
    const textKey = !assets.length ? [latest.sourceRevision, latest.sourceText.length] : [];
    const key = JSON.stringify([activeSourceId || '', selected?.id || '', selected?.name || '', selected?.kind || '', selected?.mimeType || '', selected?.size || 0,
      objectId(selected?.file), Number(selected?.firstFrame?.width) || 0, Number(selected?.firstFrame?.height) || 0, objectId(selected?.firstFrame?.data), textKey]);
    if (key === assetsKey) return;
    assetsKey = key;
    if (opened) drawActive();
  }
  function drawActive() {
    if (!opened) return;
    const sources = latest.sources, activeSourceId = latest.activeSourceId, originalFile = latest.originalFile, sourceText = latest.sourceText;
    const assets = Array.isArray(sources) && sources.length ? sources : originalFile ? [{
      id: 'original-file', name: originalFile.name || '元の素材', kind: originalFile.type?.split('/')[0] || 'file',
      file: originalFile, size: originalFile.size, mimeType: originalFile.type,
    }] : [];
    const selected = activeSourceId ? assets.find(asset => asset?.id === activeSourceId) || null : assets[0] || null;
    for (const media of list.querySelectorAll?.('audio,video') || []) media.pause?.();
    clearUrls(); list.replaceChildren();
    if (!assets.length && sourceText) {
      const card = doc.createElement('article'); card.className = 'sc-source-inspector__asset';
      const name = doc.createElement('strong'); name.textContent = '入力した文章';
      const text = doc.createElement('textarea'); text.readOnly = true; text.spellcheck = false; text.wrap = 'off';
      text.setAttribute('aria-label', '変換元の文章'); text.value = sourceText.slice(0, 64000);
      const detail = doc.createElement('p'); detail.className = 'sc-source-inspector__fallback';
      detail.textContent = sourceText.length > 64000 ? `先頭64,000文字を表示しています。全文は${sourceText.length.toLocaleString()}文字です。` : `${sourceText.length.toLocaleString()}文字。`;
      card.append(name, text, detail); list.append(card); return;
    }
    if (!assets.length) {
      const empty = doc.createElement('p'); empty.className = 'sc-source-inspector__fallback'; empty.textContent = '元の素材の情報はありません。'; list.append(empty); return;
    }
    if (activeSourceId && !selected) {
      const pending = doc.createElement('p'); pending.className = 'sc-source-inspector__fallback';
      pending.textContent = '現在の素材を確認できません。選択状態の更新を待っています。'; list.append(pending); return;
    }
    const card = doc.createElement('article'); card.className = 'sc-source-inspector__asset';
    const meta = doc.createElement('div'); meta.className = 'sc-source-inspector__meta';
    const name = doc.createElement('strong'); name.textContent = String(selected?.name || selected?.file?.name || '名前のない素材');
    const kind = doc.createElement('span'); kind.textContent = kindLabel(selected?.kind || selected?.mimeType || selected?.file?.type?.split('/')[0]);
    meta.append(name, kind);
    if (selected?.id && selected.id === activeSourceId) {
      const badge = doc.createElement('span'); badge.className = 'sc-source-inspector__active'; badge.textContent = '現在の素材'; meta.append(badge);
    }
    const file = selected?.file;
    const size = Number(selected?.size ?? file?.size);
    if (Number.isFinite(size) && size >= 0) {
      const bytes = doc.createElement('small'); bytes.textContent = `${size.toLocaleString()} bytes${selected?.mimeType || file?.type ? ` · ${selected?.mimeType || file.type}` : ''}`; meta.append(bytes);
    } else if (selected?.mimeType || file?.type) {
      const type = doc.createElement('small'); type.textContent = selected?.mimeType || file.type; meta.append(type);
    }
    card.append(meta);
    if (!addPreview(selected || {}, card)) {
      const fallback = doc.createElement('p'); fallback.className = 'sc-source-inspector__fallback';
      fallback.textContent = /^(audio|video|audio-video|audio-buffer|video-source)$/.test(String(selected?.kind || ''))
        ? 'この素材はメタデータのみ表示しています。ここでは再生用データを作成しません。'
        : 'この素材の画像プレビューは利用できません。素材の種類と名前を表示しています。';
      card.append(fallback);
    }
    list.append(card);
    if (assets.length > 1) {
      const count = doc.createElement('p'); count.className = 'sc-source-inspector__note';
      count.textContent = `素材 ${assets.length} 件。ここでは現在の素材だけを表示しています。`; list.append(count);
    }
  }
  function onPointerDown(event) { lastPointerType = event.pointerType || 'mouse'; }
  function onPointerEnter(event) { if (event.pointerType === 'touch') return; hovered = true; dismissed = false; reconcile(); }
  function onPointerLeave(event) {
    if (event.pointerType === 'touch' || wrapper.contains?.(event.relatedTarget)) return;
    hovered = false; reconcile();
  }
  function onFocus() { if (suppressNextFocus || lastPointerType === 'touch') return; focused = true; dismissed = false; reconcile(); }
  function onBlur(event) {
    if (suppressNextFocus) suppressNextFocus = false;
    if (wrapper.contains?.(event.relatedTarget)) return;
    focused = false; reconcile();
  }
  function onToggle() {
    if (opened && !toggled) { dismissed = false; toggled = true; setOpen(true); }
    else if (opened) { dismissed = true; toggled = false; hovered = false; focused = false; setOpen(false); }
    else { dismissed = false; toggled = true; setOpen(true); }
  }
  function onKeyDown(event) {
    if (event.key === 'Escape' && opened) { event.preventDefault(); dismiss(true); return; }
    if (event.key && !event.metaKey && !event.ctrlKey && !event.altKey) lastPointerType = 'keyboard';
  }
  function onOutside(event) { if (opened && !wrapper.contains?.(event.target)) dismiss(false); }
  wrapper.addEventListener('pointerdown', onPointerDown); wrapper.addEventListener('pointerenter', onPointerEnter); wrapper.addEventListener('pointerleave', onPointerLeave);
  wrapper.addEventListener('focusin', onFocus); wrapper.addEventListener('focusout', onBlur);
  button.addEventListener('click', onToggle); close.addEventListener('click', () => dismiss(true));
  doc.addEventListener?.('keydown', onKeyDown, true); doc.addEventListener?.('pointerdown', onOutside, true);

  return {
    element: wrapper,
    update: render,
    isOpen: () => opened,
    destroy() {
      disposed = true; clearUrls();
      for (const media of panel.querySelectorAll?.('audio,video') || []) media.pause?.();
      wrapper.removeEventListener('pointerdown', onPointerDown); wrapper.removeEventListener('pointerenter', onPointerEnter); wrapper.removeEventListener('pointerleave', onPointerLeave);
      wrapper.removeEventListener('focusin', onFocus); wrapper.removeEventListener('focusout', onBlur);
      button.removeEventListener('click', onToggle); doc.removeEventListener?.('keydown', onKeyDown, true); doc.removeEventListener?.('pointerdown', onOutside, true);
      wrapper.remove();
    },
  };
}
