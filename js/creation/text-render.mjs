import { textOptions, MAX_TEXT_CHARS } from './text-codec.mjs?rev=20261028-text-1';
const escapeXml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function renderText(text, input = {}, doc = document) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS) throw new Error('画像化する文章は空白以外を含む2万文字以内にしてください。');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('画像化できない制御文字が含まれています。');
  const options = textOptions(input), canvas = doc.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('このブラウザーで画像を生成できません。');
  const family = options.font === 'mono' ? '"Noto Sans Mono CJK JP", "MS Gothic", monospace' : '"Hiragino Sans", "Yu Gothic", Meiryo, sans-serif';
  const font = `${options.fontSize}px ${family}`; ctx.font = font;
  const max = options.width - options.padding * 2, lines = [];
  if (max < options.fontSize) throw new Error('余白を小さくするか画像の幅を広げてください。');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
  for (const line of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (!options.wrap) { if (ctx.measureText(line).width > max + .5) throw new Error('文字が画像の幅を超えます。文字サイズを下げるか幅を広げてください。'); lines.push(line); continue; }
    let current = '';
    for (const token of segmenter ? Array.from(segmenter.segment(line), item => item.segment) : Array.from(line)) {
      if (ctx.measureText(token).width > max) throw new Error('文字が画像幅を超えます。');
      if (current && ctx.measureText(current + token).width > max) { lines.push(current); current = ''; }
      current += token;
    }
    lines.push(current);
  }
  const step = options.fontSize * options.lineHeight / 100;
  const metrics = lines.map(line => ctx.measureText(line || 'Mgあ'));
  const ascent = Math.max(options.fontSize, ...metrics.map(m => m.actualBoundingBoxAscent || 0));
  const descent = Math.max(Math.ceil(options.fontSize * .25), ...metrics.map(m => m.actualBoundingBoxDescent || 0));
  const height = Math.ceil((lines.length - 1) * step + ascent + descent + 2 * options.padding);
  if (height > 4096 || options.width * height > 8000000) throw new Error('画像が大きすぎます。文字数・余白・文字サイズを減らしてください（高さ4096px・800万画素まで）。');
  canvas.width = options.width; canvas.height = height; ctx.fillStyle = options.background; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.font = font; ctx.fillStyle = options.foreground; ctx.textBaseline = 'alphabetic';
  const baseline = options.padding + ascent;
  lines.forEach((line, i) => ctx.fillText(line, options.padding, baseline + i * step));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><rect width="100%" height="100%" fill="${options.background}"/><g fill="${options.foreground}" font-family="${options.font === 'mono' ? 'monospace' : 'sans-serif'}" font-size="${options.fontSize}" xml:space="preserve">${lines.map((line,i)=>`<text x="${options.padding}" y="${baseline+i*step}">${escapeXml(line)}</text>`).join('')}</g></svg>`;
  return { canvas, svg, options };
}
export async function canvasBlob(canvas, type = 'image/png') {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type, .92));
  if (!blob || blob.type !== type) throw new Error('このブラウザーでは選択した形式を作れません。PNGでお試しください。');
  return blob;
}
