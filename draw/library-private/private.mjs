const shell = 'https://draw.pixieed.jp';
const returnUrl = 'https://pixieed.jp/draw/library-return/';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const status = document.querySelector('#status');
const list = document.querySelector('#items');
const search = document.querySelector('#search');
let started = false;

function decode(value, limit) {
  if (typeof value !== 'string' || value.length > limit || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

function thumbnail(value) {
  if (!value) return null;
  const rgb = decode(value, 1024);
  if (rgb.length !== 768) throw Error('thumbnail');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(16, 16);
  for (let p = 0; p < 256; p++) {
    image.data.set(rgb.subarray(p * 3, p * 3 + 3), p * 4);
    image.data[p * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function show(rows) {
  const indexed = rows.map(row => {
    if (!row || !uuid.test(row.ticket) || typeof row.title !== 'string') throw Error('entry');
    const title = row.title || '無題の作品';
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = returnUrl + '#' + row.ticket;
    link.target = '_top';
    link.rel = 'noreferrer';
    const preview = thumbnail(row.thumb);
    if (preview) link.append(preview);
    link.append(document.createTextNode(title));
    item.append(link);
    return { item, title: title.normalize('NFKC').toLocaleLowerCase('ja') };
  });
  const update = () => {
    const query = search.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
    let visible = 0;
    for (const { item, title } of indexed) {
      item.hidden = !title.includes(query);
      if (!item.hidden) visible++;
    }
    status.textContent = visible ? visible + '件の作品' : query ? '一致する作品がありません。' : '保存した作品はありません。';
  };
  list.replaceChildren(...indexed.map(row => row.item));
  document.querySelector('#filter').hidden = !indexed.length;
  search.addEventListener('input', update);
  update();
}

async function open(envelope) {
  if (envelope?.v !== 1 || !uuid.test(envelope.id)) throw Error('envelope');
  const name = '__Host-pxl-' + envelope.id + '=';
  const entry = document.cookie.split('; ').find(cookie => cookie.startsWith(name));
  if (!entry) throw Error('key');
  const key = await crypto.subtle.importKey('raw', decode(entry.slice(name.length), 43), 'AES-GCM', false, ['decrypt']);
  const iv = decode(envelope.iv, 16);
  if (iv.length !== 12) throw Error('iv');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, decode(envelope.cipher, 16000000));
  const rows = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(rows)) throw Error('catalog');
  show(rows);
  return rows.length > 0;
}

window.addEventListener('message', async event => {
  if (started || parent === window || event.source !== parent || event.origin !== shell || event.data?.type !== 'pixieed:list-open') return;
  started = true;
  try {
    if (await open(event.data.envelope)) parent.postMessage({ type: 'pixieed:list-ready' }, shell);
  } catch {
    status.textContent = '作品一覧を開けませんでした。「編集に戻る」から再度お試しください。';
  }
});
