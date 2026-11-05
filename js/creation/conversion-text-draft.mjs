/** Append decoded text transactionally, committing against the latest draft. */
export function createConversionTextDraftController({
  readText,
  writeText,
  readFile,
  decode,
  maxLength,
  isComposing = () => false,
  waitComposition = () => Promise.resolve(),
  isCurrent = () => true,
} = {}) {
  if (typeof readText !== 'function' || typeof writeText !== 'function' || typeof readFile !== 'function' || typeof decode !== 'function') {
    throw new TypeError('text draft controller requires readText, writeText, readFile and decode functions');
  }
  let importing = false, disposed = false, releaseDisposed;
  const disposedPromise = new Promise(resolve => { releaseDisposed = resolve; });
  const current = () => !disposed && isCurrent();

  return Object.freeze({
    get importing() { return importing; },
    async append(files) {
      if (!current() || importing) return false;
      const selected = Array.from(files || []);
      if (!selected.length) return false;
      importing = true;
      try {
        const parts = [];
        for (const file of selected) {
          if (!current()) return false;
          if (Number.isFinite(file?.size) && Number.isFinite(maxLength) && file.size > maxLength) {
            throw new RangeError('テキストファイルは24MB以内のものを選んでください。');
          }
          parts.push(await decode(await readFile(file), file));
        }
        if (!current()) return false;
        while (isComposing()) {
          const completed = await Promise.race([waitComposition().then(() => true), disposedPromise.then(() => false)]);
          if (!completed || !current()) return false;
        }
        const latest = readText();
        const value = [latest, ...parts].filter(Boolean).join('\n');
        if (Number.isFinite(maxLength) && value.length > maxLength) return false;
        if (!current()) return false;
        writeText(value);
        return true;
      } finally {
        importing = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseDisposed();
    },
  });
}

const copyDraft = value => value && typeof value === 'object'
  ? { ...value, options: value.options && typeof value.options === 'object' ? { ...value.options } : value.options }
  : value;

/** Keep only the current draft and the immediately displaced nonempty draft. */
export function createTextDraftSwap({ read, write } = {}) {
  if (typeof read !== 'function' || typeof write !== 'function') throw new TypeError('text draft swap requires read and write functions');
  let alternate = null;
  return Object.freeze({
    get available() { return Boolean(alternate); },
    get alternateLength() { return alternate?.text?.length || 0; },
    capture() { return copyDraft(alternate); },
    replace(next) {
      const current = copyDraft(read()), incoming = copyDraft(next);
      if (current?.text && current.text !== incoming?.text) alternate = current;
      write(incoming);
      return true;
    },
    swap() {
      if (!alternate) return false;
      const current = copyDraft(read()), previous = alternate;
      alternate = current;
      write(copyDraft(previous));
      return true;
    },
    restore(value) {
      if (value === null) { alternate = null; return true; }
      if (!value || typeof value !== 'object' || typeof value.text !== 'string' || !value.options || typeof value.options !== 'object' || typeof value.action !== 'string') return false;
      alternate = copyDraft(value);
      return true;
    },
  });
}

export function validateTextRecoverySnapshot(value, { maxLength = 24 * 1024 * 1024, actions = [], styles = [], encodings = [] } = {}) {
  const fail = message => { throw new TypeError(message); };
  const object = item => Boolean(item && typeof item === 'object' && !Array.isArray(item));
  const validOptions = options => object(options)
    && Number.isInteger(options.width) && options.width >= 320 && options.width <= 2400
    && Number.isInteger(options.fontSize) && options.fontSize >= 12 && options.fontSize <= 96
    && Number.isInteger(options.padding) && options.padding >= 0 && options.padding <= 160
    && Number.isInteger(options.lineHeight) && options.lineHeight >= 100 && options.lineHeight <= 220
    && ['sans', 'mono'].includes(options.font)
    && /^#[a-f0-9]{6}$/i.test(options.foreground) && /^#[a-f0-9]{6}$/i.test(options.background)
    && typeof options.wrap === 'boolean';
  if (!object(value) || value.schemaVersion !== 1) fail('この入力復元データの形式には対応していません。');
  if (typeof value.text !== 'string' || value.text.length > maxLength) fail('復元する文章が上限を超えています。');
  if (!['media', 'input', 'output'].includes(value.mode)) fail('復元する入力モードが不正です。');
  if (typeof value.action !== 'string' || (actions.length && !actions.includes(value.action))) fail('復元する文章の用途が現在の選択肢にありません。');
  if (typeof value.style !== 'string' || (styles.length && !styles.includes(value.style))) fail('復元する文字表現が現在の選択肢にありません。');
  if (typeof value.encoding !== 'string' || (encodings.length && !encodings.includes(value.encoding))) fail('復元する文字コードが現在の選択肢にありません。');
  const renderFormat = value.renderFormat ?? 'png';
  if (!['png', 'svg', 'pxtxt'].includes(renderFormat)) fail('復元する出力形式が現在の選択肢にありません。');
  if (!validOptions(value.options)) fail('復元する文字の見た目設定が不正です。');
  const art = value.art;
  if (!object(art) || !Number.isInteger(art.columns) || art.columns < 8 || art.columns > 160
    || typeof art.invert !== 'boolean' || typeof art.characters !== 'string' || art.characters.length > 128
    || typeof art.attach !== 'boolean' || typeof art.nativeGrid !== 'boolean') fail('復元する文字アート設定が不正です。');
  if (value.alternateDraft !== null && (!object(value.alternateDraft) || typeof value.alternateDraft.text !== 'string'
    || value.alternateDraft.text.length > maxLength || !validOptions(value.alternateDraft.options)
    || typeof value.alternateDraft.action !== 'string' || (actions.length && !actions.includes(value.alternateDraft.action)))) {
    fail('復元する代替文章の内容が不正です。');
  }
  let selectedFile = null;
  if (value.selectedFile !== null) {
    const file = value.selectedFile;
    if (!object(file) || !file.blob || typeof file.blob.arrayBuffer !== 'function' || typeof file.name !== 'string'
      || typeof file.type !== 'string' || !Number.isFinite(file.lastModified) || file.lastModified < 0) fail('復元する選択ファイルの情報が不正です。');
    selectedFile = { blob: file.blob, name: file.name, type: file.type, lastModified: file.lastModified };
  }
  return Object.freeze({
    schemaVersion: 1, text: value.text, mode: value.mode, selectedFile,
    options: { ...value.options }, action: value.action, style: value.style, encoding: value.encoding, renderFormat,
    art: { ...art }, alternateDraft: copyDraft(value.alternateDraft),
  });
}
