/** Receive staged editor files without sending private IDs or media to analytics. */
import { readToolOutput } from './output-handoff.mjs?rev=20261028-unified-output-1';
import { readOutputFile } from './output-router.mjs?rev=20261028-unified-output-1';
import { loadConversionFile } from './conversion-service.mjs?rev=20261028-conversion-1';
import { validateTimeline } from './conversion-timeline.mjs?rev=20261031-material-stage-1';
import { mountConversionPage } from './conversion-page.mjs?rev=20261031-material-stage-1';
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function sharedOutputRequest(search) {
  const query = new URLSearchParams(search);
  if (query.has('id') && query.has('file')) throw new Error('出力の指定が重複しています。');
  const key = query.has('id') ? 'id' : query.has('file') ? 'file' : null;
  if (!key) return null;
  const values = query.getAll(key);
  if (values.length !== 1 || !UUID.test(values[0])) throw new Error('出力を特定できません。制作画面からもう一度書き出してください。');
  return { key, id: values[0], advanced: query.get('view') === 'advanced' };
}
export function needsDetailedOutput(record) {
  return record.metadata?.previewOnly === true || record.outputs?.length > 1
    || record.mime?.startsWith('video/') || (record.mediaSources || []).length > 1
    || (record.mediaSources || []).some(item => ['audio-song', 'audio-video', 'video-source'].includes(item.kind));
}
function addStyles(doc) {
  if (doc.querySelector('link[data-conversion-style]')) return;
  const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/conversion-simple.css?rev=20261028-motion-1'; css.dataset.conversionStyle = ''; doc.head.append(css);
}
function addOriginControls(record, doc, win, request) {
  const main = doc.getElementById('main'), heading = main.querySelector('.convert-heading');
  if (heading) {
    const back = heading.querySelector('a'); back.href = record.returnUrl; back.textContent = '← 編集に戻る';
    const status = heading.querySelector('span'); if (status) status.textContent = '共通の出力画面 · 端末内で処理';
  }
  const details = doc.createElement('details'); details.className = 'convert-support';
  const summary = doc.createElement('summary'); summary.textContent = '元の作品ファイルを保持しています';
  const description = doc.createElement('p'); description.textContent = 'そのまま保存すると元のファイルの内容を保てます。別形式への変換では、再編集情報やメタデータを保持できない場合があります。';
  const link = doc.createElement('a'), url = win.URL.createObjectURL(record.sourceBlob || record.blob);
  link.href = url; link.download = record.sourceFilename || record.filename; link.textContent = '元の作品ファイルを保存';
  details.append(summary, description, link); main.append(details);
  win.addEventListener('pagehide', () => win.URL.revokeObjectURL(url), { once: true });
  const advanced = main.querySelector('[data-advanced]');
  if (advanced && request.key === 'id') advanced.href = `/output/work/?id=${encodeURIComponent(request.id)}&view=advanced`;
}
function renderFile(record, doc, win) {
  const main = doc.getElementById('main'); main.replaceChildren(); main.className = 'conversion-main'; doc.body.classList.add('simple-conversion-page');
  const top = doc.createElement('div'); top.className = 'convert-heading';
  const back = doc.createElement('a'); back.href = record.returnUrl; back.textContent = '← 編集に戻る'; top.append(back);
  const heading = doc.createElement('h1'); heading.textContent = '作品を書き出す。';
  const name = doc.createElement('p'); name.textContent = record.filename;
  const note = doc.createElement('p'); note.textContent = '元の内容を変更せずに保存します。';
  const url = win.URL.createObjectURL(record.blob), save = doc.createElement('a'); save.className = 'convert-primary'; save.href = url; save.download = record.filename; save.textContent = 'ファイルを保存 ↓';
  main.append(top, heading, name, note, save);
  if (record.blob.type.startsWith('video/') || record.blob.type.startsWith('audio/')) {
    const preview = doc.createElement(record.blob.type.startsWith('video/') ? 'video' : 'audio'); preview.controls = true; preview.preload = 'metadata'; preview.src = url; preview.style.maxWidth = '100%'; if ('playsInline' in preview) preview.playsInline = true; main.insertBefore(preview, note);
  }
  win.addEventListener('pagehide', () => win.URL.revokeObjectURL(url), { once: true });
}
export async function mountSharedOutput(request, doc = document, win = window) {
  const record = request.key === 'id' ? await readToolOutput(request.id) : await readOutputFile(request.id);
  if (request.key === 'id' && (request.advanced || needsDetailedOutput(record))) {
    await import('./output-page.mjs?rev=20261031-material-stage-1');
    return 'detailed';
  }
  addStyles(doc);
  const frames = record.mediaSources?.[0]?.mediaSource?.frames || record.mediaSources?.[0]?.frames || record.mediaSource?.frames;
  let source;
  try {
    if (frames?.length) {
      validateTimeline(frames);
      source = { kind: 'image', frames, name: record.filename, inputFormat: record.extension, totalPlays: record.mediaSettings?.totalPlays ?? record.mediaSource?.totalPlays ?? 1 };
    } else source = await loadConversionFile(new File([record.blob], record.filename, { type: record.blob.type }));
  } catch {
    renderFile(record, doc, win);
    return 'original';
  }
  const ui = mountConversionPage(doc, win);
  ui.setSource(source, { playbackRate: record.mediaSettings?.playbackRate, format: record.extension });
  ui.offerOriginal(record.blob, record.filename);
  addOriginControls(record, doc, win, request);
  return 'conversion';
}
