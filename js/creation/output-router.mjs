/** One local file-delivery destination. No media bytes or names leave this device. */
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const EDITORS = /^\/(?:tools\/start\/(?:draw|camera|audio|jigsaw|spot-difference|hidden-object)(?:\/|$)|draw(?:\/|$)|camera(?:\/|$)|audio(?:\/|$)|jigsaw(?:\/|$)|spot-difference(?:\/|$)|hidden-object(?:\/|$)|play\/(?:spot-difference|hidden-object)(?:\/|$)|pixiee-lens(?:\/|$)|pixel-camera(?:-studio)?\.html$)/;
const DB = 'pixieed-output-files-v1', STORE = 'files', TTL = 7 * 86400000;
const installations = Symbol.for('pixieed.unified-output.installed');
const pending = new WeakMap();
export function isOutputWorkspace(location) { return /^\/output\/work\/(?:index\.html)?$/.test(location?.pathname || ''); }
export function isEditorOutput(location) { return EDITORS.test(location?.pathname || ''); }
export function outputReturnUrl(value, origin) {
  const url = new URL(value, origin);
  if (url.origin !== origin || !isEditorOutput(url)) throw new Error('編集画面への戻り先を確認できません。');
  url.pathname = url.pathname.replace(/^\/tools\/start\/(draw|camera|audio|jigsaw|spot-difference|hidden-object)\/?$/, '/$1/');
  if (url.pathname === '/draw/editor.html') url.pathname = '/draw/';
  if (url.pathname === '/audio/editor.html') url.pathname = '/audio/';
  for (const key of ['embed', 'embedRole', 'channel']) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}
export function outputFilename(name) {
  const result = String(name || 'pixieed-output').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-').replace(/^\.+/, '').slice(0, 160).trim();
  return result || 'pixieed-output';
}
export function navigationContext(win = globalThis.window, location = globalThis.location) {
  if (!location || !/^https?:$/.test(location.protocol || new URL(location.origin).protocol)) throw new Error('出力画面を開けません。');
  if (!win || !win.parent || win.parent === win) return { win, location };
  const boot = win.__PIXIEED_TOOL_EMBED__;
  if (!boot || !['draw', 'camera', 'audio'].includes(boot.role) || !UUID.test(boot.channel || '')) throw new Error('埋め込み画面からの出力は利用できません。PiXiEEDの制作画面を開いてください。');
  try {
    if (win.parent.location.origin !== location.origin) throw new Error();
    return { win: win.parent, location: win.parent.location };
  } catch { throw new Error('出力先の画面を確認できません。'); }
}
export async function flushOutputWorkspace(win = globalThis.window) {
  const host = win?.__PIXIEED_CREATION_HOST__;
  if (!host?.active) return;
  const workspace = host.runtime?.draw?.workspace;
  if (!workspace) throw new Error('制作データの保存準備が終わっていません。');
  await workspace.assertCanSave?.();
  if (workspace.dirty) {
    if (typeof workspace.save !== 'function') throw new Error('編集中の作品を保存できません。');
    await workspace.save();
    if (workspace.dirty) throw new Error('編集中の作品の保存が終わっていません。もう一度お試しください。');
  }
}
export function reportOutputError(error, doc = globalThis.document) {
  if (!doc?.createElement || !doc.body) return;
  let message = doc.getElementById('unified-output-status');
  if (!message) {
    message = doc.createElement('p'); message.id = 'unified-output-status'; message.setAttribute('role', 'alert');
    Object.assign(message.style, { position: 'fixed', insetInline: '1rem', bottom: '5rem', margin: '0 auto', maxWidth: '36rem', padding: '1rem', background: '#fffdf8', color: '#172333', border: '1px solid #637c60', borderRadius: '12px', zIndex: '2147483646' });
    doc.body.append(message);
  }
  message.textContent = `${error?.message || '出力画面を開けませんでした。'} この画面の素材はそのままです。保存ボタンからもう一度お試しください。`;
}
function open(indexedDBRef) {
  return new Promise((resolve, reject) => {
    if (!indexedDBRef?.open) return reject(new Error('端末内の出力保存を利用できません。'));
    const request = indexedDBRef.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('出力の保存に失敗しました。'));
    request.onblocked = () => reject(new Error('別のタブが出力保存を使用しています。'));
  });
}
function transaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); let value; const request = action(tx.objectStore(STORE));
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error || new Error('出力データを保持できませんでした。'));
  });
}
export async function storeOutputFile(blob, filename, returnUrl, { indexedDBRef = globalThis.indexedDB, cryptoRef = globalThis.crypto, origin = globalThis.location?.origin, now = Date.now } = {}) {
  if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > 128 * 1024 * 1024) throw new Error('出力ファイルは128MB以内で用意してください。');
  const id = cryptoRef?.randomUUID?.(); if (!UUID.test(id || '')) throw new Error('出力IDを作れませんでした。');
  const record = { id, blob, filename: outputFilename(filename), returnUrl: outputReturnUrl(returnUrl, origin), createdAt: now(), expiresAt: now() + TTL };
  const db = await open(indexedDBRef);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'), cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => { const c = cursor.result; if (c) { if (!Number.isFinite(c.value.expiresAt) || c.value.expiresAt <= now()) c.delete(); c.continue(); } };
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('期限切れの出力を整理できません。'));
    });
    await transaction(db, 'readwrite', store => store.add(record));
    const saved = await transaction(db, 'readonly', store => store.get(id));
    if (saved?.blob?.size !== blob.size || saved.filename !== record.filename) throw new Error('出力ファイルの保存を確認できませんでした。');
    return { id, url: `/output/work/?file=${encodeURIComponent(id)}` };
  } finally { db.close(); }
}
export async function readOutputFile(id, { indexedDBRef = globalThis.indexedDB, origin = globalThis.location?.origin, now = Date.now } = {}) {
  if (!UUID.test(id || '')) throw new Error('出力を特定できません。');
  const db = await open(indexedDBRef);
  try {
    const record = await transaction(db, 'readonly', store => store.get(id));
    if (!record || record.id !== id || !record.blob?.size || !Number.isFinite(record.expiresAt) || record.expiresAt <= now()) throw new Error('出力が見つからないか期限切れです。編集画面からもう一度書き出してください。');
    return { ...record, filename: outputFilename(record.filename), returnUrl: outputReturnUrl(record.returnUrl, origin) };
  } finally { db.close(); }
}
export function routeEditorFile(blob, filename, deps = {}) {
  const active = pending.get(blob); if (active) return active;
  const promise = (async () => {
    const context = navigationContext(deps.windowRef, deps.locationRef);
    await flushOutputWorkspace(context.win);
    const back = context.location.pathname + context.location.search + context.location.hash;
    const staged = await storeOutputFile(blob, filename, back, { ...deps, origin: context.location.origin });
    context.location.assign(staged.url);
    return 'staged';
  })();
  pending.set(blob, promise);
  void promise.finally(() => pending.delete(blob)).catch(() => {});
  return promise;
}
/** Catches legacy local download anchors, including PXD backups, but not publishing or remote links. */
export function installEditorDownloadRouting(doc = globalThis.document, win = globalThis.window) {
  if (!doc?.addEventListener || !win || doc[installations] || !isEditorOutput(win.location)) return;
  doc[installations] = true;
  doc.addEventListener('click', event => {
    const link = event.target?.closest?.('a[download]');
    if (event.defaultPrevented || !link || !isEditorOutput(win.location)) return;
    const url = new URL(link.href, win.location.href);
    if (url.protocol !== 'blob:' || url.origin !== win.location.origin) return;
    event.preventDefault();
    const filename = link.download;
    void win.fetch(url.href).then(response => { if (!response.ok) throw new Error('出力ファイルを読み込めません。'); return response.blob(); })
      .then(blob => routeEditorFile(blob, filename, { windowRef: win, locationRef: win.location }))
      .catch(error => reportOutputError(error, doc));
  });
}
installEditorDownloadRouting();
