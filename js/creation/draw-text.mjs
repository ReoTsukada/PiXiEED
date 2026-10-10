import { validateDrawDocument } from './draw-core.mjs';

export const DRAW_TEXT_FONTS = Object.freeze([
  { id: 'sans', label: 'ゴシック', css: 'sans-serif' },
  { id: 'serif', label: '明朝', css: 'serif' },
  { id: 'mono', label: '等幅', css: 'monospace' },
  { id: 'dotgothic', label: 'ドットゴシック', css: 'PiXiEED DotGothic16', url: '/assets/fonts/DotGothic16/DotGothic16-Regular.ttf' },
  { id: 'pressstart', label: 'ピクセル英字', css: 'PiXiEED Press Start 2P', url: '/assets/fonts/PressStart2P/PressStart2P-Regular.ttf' }
]);
/** Build an injectable lazy loader; a timed-out load can never register its font later. */
export function createDrawTextFontLoader({ FontFaceCtor = globalThis.FontFace, fontSet = globalThis.document?.fonts,
  timeoutMs = 5000, schedule = globalThis.setTimeout, unschedule = globalThis.clearTimeout } = {}) {
  const cache = new Map();
  return function loadDrawTextFont(id) {
    const definition = DRAW_TEXT_FONTS.find((font) => font.id === id);
    if (!definition) return Promise.reject(new TypeError('フォントの指定が不正です。'));
    if (!definition.url) return Promise.resolve(definition.css);
    if (!FontFaceCtor || !fontSet?.add) return Promise.resolve('sans-serif');
    if (cache.has(id)) return cache.get(id);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) return Promise.reject(new RangeError('フォント読み込み期限が不正です。'));
    let timedOut = false, timer = null, resolveDeadline;
    let request;
    const loading = Promise.resolve().then(async () => {
      const face = new FontFaceCtor(definition.css, `url("${definition.url}")`);
      await face.load();
      if (timedOut) return 'sans-serif';
      fontSet.add(face);
      return definition.css;
    }).catch(() => {
      if (cache.get(id) === request) cache.delete(id);
      return 'sans-serif';
    });
    const deadline = new Promise((resolve) => { resolveDeadline = resolve; });
    request = Promise.race([loading, deadline]).finally(() => { if (timer !== null) unschedule(timer); });
    cache.set(id, request);
    timer = schedule(() => {
      timedOut = true;
      if (cache.get(id) === request) cache.delete(id);
      resolveDeadline('sans-serif');
    }, timeoutMs);
    return request;
  };
}

/** Lazily load a self-hosted font and keep text usable if the browser rejects it. */
export const loadDrawTextFont = createDrawTextFontLoader();

/** Composite a grayscale text mask into an indexed document without mutating its source. */
export function applyTextMaskToDocument(document, alphaMask, { colorIndex, selectionMask = null, threshold = 128 } = {}) {
  validateDrawDocument(document);
  const length = document.width * document.height;
  if (!(alphaMask instanceof Uint8Array) || alphaMask.length !== length) throw new TypeError('文字マスクの寸法が不正です。');
  if (selectionMask != null && (!(selectionMask instanceof Uint8Array) || selectionMask.length !== length || selectionMask.some((value) => value !== 0 && value !== 1))) throw new TypeError('選択マスクが不正です。');
  if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= document.palette.length) throw new RangeError('文字色をパレットから選んでください。');
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 255) throw new RangeError('文字のしきい値が不正です。');
  const pixels = [...document.pixels];
  let changed = false;
  for (let index = 0; index < length; index += 1) {
    if (alphaMask[index] >= threshold && (!selectionMask || selectionMask[index]) && pixels[index] !== colorIndex) {
      pixels[index] = colorIndex; changed = true;
    }
  }
  return changed ? { ...document, palette: [...document.palette], pixels } : document;
}

/** Draw text into a one-channel mask. x/y are pixel coordinates; y is the top edge. */
export function rasterizeTextMask({ text, font = 'sans-serif', fontSize = 8, x = 0, y = 0, align = 'left', width, height, documentRef = globalThis.document } = {}) {
  if (typeof text !== 'string' || !text.length || text.length > 256) throw new RangeError('文字を入力してください（256文字まで）。');
  if (typeof font !== 'string' || !/^[\w\s,"'-]{1,96}$/.test(font)) throw new TypeError('フォントの指定が不正です。');
  if (!['left', 'center', 'right'].includes(align)) throw new TypeError('文字の配置が不正です。');
  if (!Number.isFinite(fontSize) || fontSize < 1 || fontSize > 128 || !Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('文字の大きさと位置を確認してください。');
  if (!Number.isInteger(width) || width < 1 || width > 512 || !Number.isInteger(height) || height < 1 || height > 512) throw new RangeError('キャンバスの寸法が不正です。');
  if (!documentRef?.createElement) throw new TypeError('Canvas APIを利用できません。');
  const canvas = documentRef.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new TypeError('文字プレビューを作成できません。');
  const family = font.includes(' ') ? `"${font}", sans-serif` : font;
  context.clearRect(0, 0, width, height); context.font = `${fontSize}px ${family}`;
  context.textBaseline = 'top'; context.textAlign = align; context.fillStyle = '#fff';
  text.split('\n').slice(0, 32).forEach((line, index) => context.fillText(line, x, y + index * fontSize));
  const rgba = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = rgba[i * 4 + 3];
  return mask;
}
