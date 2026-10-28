/** Local text interchange. No evaluation, HTML parsing, fetch, storage or network. */
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_CODE_CHARS = 24 * 1024 * 1024;
export const MAX_TEXT_CHARS = 20000;
export const MAX_GRID_PIXELS = 65536;
export const BEGIN = '-----BEGIN PIXIEED RESTORE 1-----';
export const END = '-----END PIXIEED RESTORE 1-----';
const fail = message => { throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function safeName(value = 'restored.bin') {
  return String(value).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '-').replace(/^\.+/, '').trim().slice(0, 160) || 'restored.bin';
}
function mime(value) { return typeof value === 'string' && /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(value) ? value.toLowerCase() : 'application/octet-stream'; }
export function checkedBytes(value) {
  const data = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : fail('ファイルのデータを読み取れません。');
  if (data.length > MAX_FILE_BYTES) fail('文字列化・復元は1ファイル16MBまでです。');
  return data;
}
export function toBase64(value) {
  const bytes = checkedBytes(value); let text = '';
  for (let i = 0; i < bytes.length; i += 24576) text += btoa(String.fromCharCode(...bytes.subarray(i, i + 24576)));
  return text;
}
export function fromBase64(value) {
  if (typeof value !== 'string' || value.length > MAX_CODE_CHARS) fail('復元する文字列が大きすぎます。');
  const clean = value.replace(/[\t\n\r ]/g, '');
  if (clean.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 || (clean.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(clean) || /=/.test(clean.slice(0, -2)) || (clean.at(-2) === '=' && clean.at(-1) !== '='))) fail('Base64が不正です。途中で切れていないか確認してください。');
  const decoded = atob(clean), bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
  checkedBytes(bytes);
  if (toBase64(bytes) !== clean) fail('Base64の末尾が不正です。');
  return bytes;
}
export async function digest(value) {
  if (!globalThis.crypto?.subtle) fail('安全な復元にはHTTPS接続が必要です。');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), n => n.toString(16).padStart(2, '0')).join('');
}
export async function encodeRestore(bytes, name, type) {
  bytes = checkedBytes(bytes);
  const record = { version: 1, name: safeName(name), type: mime(type), size: bytes.length, sha256: await digest(bytes), data: toBase64(bytes) };
  return `${BEGIN}\n${JSON.stringify(record)}\n${END}`;
}
export async function decodeRestore(text) {
  if (typeof text !== 'string' || text.length > MAX_CODE_CHARS) fail('復元コードは24MB以内で読み込んでください。');
  const start = text.indexOf(BEGIN), end = text.indexOf(END);
  if (start < 0 || end <= start || text.indexOf(BEGIN, start + BEGIN.length) >= 0 || text.indexOf(END, end + END.length) >= 0) fail('復元コードの開始・終了が不正か、複数のコードが含まれています。');
  let record; try { record = JSON.parse(text.slice(start + BEGIN.length, end)); } catch { fail('復元コードが壊れています。全文をコピーし直してください。'); }
  if (!object(record) || record.version !== 1 || !Number.isSafeInteger(record.size) || record.size < 0 || record.size > MAX_FILE_BYTES || typeof record.name !== 'string' || record.name.length > 160 || typeof record.type !== 'string' || record.type.length > 128 || !/^[a-f0-9]{64}$/.test(record.sha256) || typeof record.data !== 'string') fail('この復元コードの形式・版には対応していません。');
  const bytes = fromBase64(record.data);
  if (bytes.length !== record.size || await digest(bytes) !== record.sha256) fail('復元データの検査に失敗しました。文字が欠けたり変更されたりしています。');
  return { bytes, name: safeName(record.name), type: mime(record.type), verified: true };
}
export function decodeDataUrl(text) {
  if (typeof text !== 'string' || text.length > MAX_CODE_CHARS) fail('Data URLが大きすぎます。');
  const match = /^data:([\w!#$&^.+-]+\/[\w!#$&^.+-]+)?;base64,([\s\S]*)$/i.exec(text.trim());
  if (!match) fail('Base64形式のData URLを入力してください。');
  const type = mime(match[1]), extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'text/plain': 'txt' }[type] || 'bin';
  return { bytes: fromBase64(match[2]), name: `restored.${extension}`, type, verified: false };
}
export function detectText(text) {
  if (typeof text !== 'string' || text.length > MAX_CODE_CHARS) fail('入力は24MB以内にしてください。');
  if (text.includes('-----BEGIN PIXIEED RESTORE') || text.includes(END)) return 'restore';
  const trimmed = text.replace(/^\uFEFF/, '').trimStart();
  if (trimmed.startsWith('PIXIEED-PIXELS/')) return 'pixels';
  if (trimmed.startsWith('PIXIEED-TEXT/')) return 'document';
  if (/^data:/i.test(trimmed)) return 'dataurl';
  return 'text'; // Normal words can be valid Base64. Never silently decode them.
}
export function decodeTextFile(buffer, encoding = 'utf-8') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length > MAX_CODE_CHARS) fail('テキストファイルは24MB以内にしてください。');
  if (!['utf-8', 'shift_jis', 'utf-16le', 'utf-16be'].includes(encoding)) fail('文字コードを選び直してください。');
  if (bytes[0] === 255 && bytes[1] === 254) encoding = 'utf-16le';
  if (bytes[0] === 254 && bytes[1] === 255) encoding = 'utf-16be';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { fail('文字コードが一致しません。UTF-8・Shift_JIS・UTF-16から選んで読み込み直してください。'); }
}
export function validateFrame(frame, max = MAX_GRID_PIXELS) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 4096 || frame.height > 4096 || frame.width * frame.height > max || !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) || frame.data.length !== frame.width * frame.height * 4) fail(`画素テキストは${max.toLocaleString()}画素以内のRGBA画像に対応します。`);
  return frame;
}
export function encodePixels(frame) {
  validateFrame(frame); const palette = [], indices = [], colors = new Map();
  for (let i = 0; i < frame.data.length; i += 4) {
    const color = Array.from(frame.data.subarray(i, i + 4), n => n.toString(16).padStart(2, '0')).join('');
    if (!colors.has(color)) { colors.set(color, palette.length); palette.push('#' + color); }
    indices.push(colors.get(color).toString(36));
  }
  const rows = Array.from({ length: frame.height }, (_, i) => indices.slice(i * frame.width, (i + 1) * frame.width).join(' '));
  return 'PIXIEED-PIXELS/1\n' + JSON.stringify({ width: frame.width, height: frame.height, palette, rows }, null, 2);
}
export function decodePixels(text) {
  if (typeof text !== 'string' || text.length > MAX_CODE_CHARS) fail('画素テキストが大きすぎます。');
  const match = /^\uFEFF?\s*PIXIEED-PIXELS\/1\r?\n([\s\S]*)$/.exec(text);
  if (!match) fail('画素テキストの版には対応していません。');
  let record; try { record = JSON.parse(match[1]); } catch { fail('画素テキストのJSONが不正です。'); }
  const { width, height, palette, rows } = record || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > MAX_GRID_PIXELS || !Array.isArray(palette) || palette.length < 1 || palette.length > MAX_GRID_PIXELS || !palette.every(c => typeof c === 'string' && /^#[a-f0-9]{8}$/i.test(c)) || !Array.isArray(rows) || rows.length !== height) fail('画素テキストのサイズ・配色が不正です。');
  const colors = palette.map(c => [1, 3, 5, 7].map(i => parseInt(c.slice(i, i + 2), 16))), data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    if (typeof row !== 'string') fail('画素テキストの行が不正です。');
    const values = row.trim().split(/\s+/); if (values.length !== width) fail('画素テキストの列数が一致しません。');
    values.forEach((token, x) => { const index = parseInt(token, 36); if (!/^[a-z0-9]{1,4}$/i.test(token) || !colors[index]) fail('画素の色番号が不正です。'); data.set(colors[index], (y * width + x) * 4); });
  });
  return { width, height, data };
}
export function textOptions(input = {}) {
  const n = (key, min, max, fallback) => { const value = input[key] ?? fallback; if (!Number.isInteger(value) || value < min || value > max) fail('文字画像の設定が範囲外です。'); return value; };
  const color = (key, fallback) => { const value = input[key] ?? fallback; if (!/^#[a-f\d]{6}$/i.test(value)) fail('色の指定が不正です。'); return value; };
  return { width: n('width', 320, 2400, 1000), fontSize: n('fontSize', 12, 96, 28), padding: n('padding', 0, 160, 48), lineHeight: n('lineHeight', 100, 220, 160), foreground: color('foreground', '#213e32'), background: color('background', '#fffefb'), font: input.font === 'mono' ? 'mono' : 'sans', wrap: input.wrap !== false };
}
export function encodeDocument(text, options) {
  if (typeof text !== 'string' || text.length > MAX_TEXT_CHARS) fail('文章の画像化は2万文字以内です。');
  return 'PIXIEED-TEXT/1\n' + JSON.stringify({ text, options: textOptions(options) });
}
export function decodeDocument(text) {
  const match = /^\uFEFF?\s*PIXIEED-TEXT\/1\r?\n([\s\S]*)$/.exec(text);
  if (!match || text.length > MAX_CODE_CHARS) fail('文章データの形式・版に対応していません。');
  let record; try { record = JSON.parse(match[1]); } catch { fail('文章データが破損しています。'); }
  if (!object(record) || typeof record.text !== 'string' || record.text.length > MAX_TEXT_CHARS || !object(record.options)) fail('文章データの内容が不正です。');
  return { text: record.text, options: textOptions(record.options) };
}
const emoji = [['⬜',255,255,255],['⬛',0,0,0],['🟥',220,40,40],['🟧',235,140,35],['🟨',240,210,40],['🟩',60,165,65],['🟦',40,100,215],['🟪',155,70,180],['🟫',140,90,50]];
export function imageToArt(frame, { style = 'ascii', columns = 72, invert = false, characters = 'PiXiEED' } = {}) {
  validateFrame(frame, 8000000);
  if (!['ascii','block','braille','emoji','custom'].includes(style) || !Number.isInteger(columns) || columns < 8 || columns > 160) fail('文字アートの設定が不正です。');
  const glyphs = Array.from(style === 'block' ? '█▓▒░ ' : style === 'custom' ? characters : '@%#*+=-:. ');
  if (!glyphs.length || glyphs.length > 64 || glyphs.some(c => /[\u0000-\u001f\u007f]/.test(c))) fail('使用文字は改行を含まない1〜64文字にしてください。');
  const rows = Math.min(160, Math.max(1, Math.round(frame.height / frame.width * columns * (style === 'emoji' ? 1 : .5))));
  const color = (x, y, w = columns, h = rows) => {
    const p = (Math.min(frame.height - 1, Math.floor((y + .5) * frame.height / h)) * frame.width + Math.min(frame.width - 1, Math.floor((x + .5) * frame.width / w))) * 4, alpha = frame.data[p + 3] / 255;
    return [0,1,2].map(i => frame.data[p+i] * alpha + 255 * (1-alpha));
  };
  const dark = rgb => { const light = (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255; return invert ? light : 1-light; };
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < columns; x++) {
      if (style === 'braille') {
        let pattern = 0; const bits = [[0,3],[1,4],[2,5],[6,7]];
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) if (dark(color(x*2+dx,y*4+dy,columns*2,rows*4)) >= .5) pattern |= 1 << bits[dy][dx];
        line += String.fromCodePoint(0x2800 + pattern);
      } else if (style === 'emoji') {
        const rgb = color(x,y).map(v => invert ? 255-v : v);
        line += emoji.reduce((best, item) => { const distance = rgb.reduce((sum,v,i)=>sum+(v-item[i+1])**2,0); return distance < best.distance ? { item, distance } : best; }, { item:emoji[0],distance:Infinity }).item[0];
      } else line += glyphs[Math.min(glyphs.length-1,Math.floor((1-dark(color(x,y))) * glyphs.length))];
    }
    lines.push(line);
  }
  return lines.join('\n');
}
