const origin = 'https://pixieed.jp';
const destination = 'https://draw.pixieed.jp/library-import/#';
const limit = 131072;
const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function drawUrl(project) {
  if (![project.projectId, project.revisionId].every(value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value))) throw Error('invalid pointer');
  const url = new URL('/draw/', origin);
  url.search = new URLSearchParams({ workspace: '1', runtime: 'direct', mode: 'draw', pxd: project.projectId, pxdRevision: project.revisionId });
  return url.href;
}

function thumbnail(value) {
  if (!value) return null;
  const { width, height, rgb } = value;
  if (!(rgb instanceof Uint8Array) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || rgb.length !== width * height * 3) return null;
  const bytes = new Uint8Array(768);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const index = 3 * (Math.floor(y * height / 16) * width + Math.floor(x * width / 16));
      bytes.set(rgb.subarray(index, index + 3), 3 * (y * 16 + x));
    }
  }
  return base64url(bytes);
}

export function privateListSource(win) {
  return win.self === win.top && win.location.origin === origin && win.location.pathname === '/draw/';
}

export async function openPrivateList(current, projects, win = window, doc = document) {
  if (!privateListSource(win) || !projects.length || projects.length > 1200) return false;
  try {
    const response = await win.fetch('https://draw.pixieed.jp/library/ready.txt', {
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
      cache: 'no-store', signal: AbortSignal.timeout(2500)
    });
    if (response.status !== 200 || (await response.text()).trim() !== 'pixieed-library-v1') return false;
  } catch { return false; }
  const original = drawUrl(current);
  const choices = Object.create(null);
  const rows = projects.map(project => {
    const ticket = crypto.randomUUID();
    choices[ticket] = drawUrl(project);
    return { ticket, title: String(project.summary?.name || '無題の作品'), thumb: thumbnail(project.summary?.thumbnail) };
  });
  const id = crypto.randomUUID();
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt']);
  async function encode() {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = encoder.encode(JSON.stringify(rows));
    if (bytes.length > limit) return null;
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const result = base64url(encoder.encode(JSON.stringify({ v: 1, id, iv: base64url(iv), cipher: base64url(cipher) })));
    return result.length <= limit ? result : null;
  }
  let payload = await encode();
  if (!payload) {
    for (const row of rows) row.thumb = null;
    payload = await encode();
  }
  if (!payload) return false;
  const cookie = '__Host-pxl-' + id;
  const value = cookie + '=' + base64url(secret);
  try {
    doc.cookie = value + '; Secure; Path=/; SameSite=Strict; Max-Age=1800';
    if (!doc.cookie.split(';').some(item => item.trim() === value)) return false;
    win.sessionStorage.setItem('pixieed:private-list:return:v1', JSON.stringify({ id, original, choices }));
    const link = doc.createElement('a');
    link.href = destination + payload;
    link.referrerPolicy = 'no-referrer';
    link.rel = 'noreferrer';
    link.click();
    return true;
  } catch (error) {
    doc.cookie = cookie + '=; Secure; Path=/; SameSite=Strict; Max-Age=0';
    throw error;
  }
}
