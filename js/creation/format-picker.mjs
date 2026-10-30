/** A presentation-only format chooser. Native options are the capability authority. */
const GROUPS = { image: '画像', motion: '動画・アニメーション', audio: '音声', art: '文字アート', data: '復元・データ', other: 'その他' };
const INFO = {
  png: ['PNG', 'image', '透過を保って、くっきり保存', '透過 可逆 ドット絵'],
  jpeg: ['JPEG', 'image', '写真向け。透明部分は背景色に合成', 'jpg 写真 圧縮'],
  webp: ['WebP', 'image', '透過に対応。画質を調整して保存', 'ウェブピー 圧縮'],
  svg: ['SVG', 'image', '画素を図形で保存。輪郭の自動トレースではありません', 'ベクター ベクトル'],
  gif: ['GIF', 'motion', '最大256色。コマのある素材はアニメーションに', 'ジフ 動く アニメ'],
  apng: ['APNG', 'motion', '透明度を保ったアニメーション', '動く アニメ png'],
  mp4: ['MP4', 'motion', '映像を動画ファイルに保存', '動画 ビデオ'],
  webm: ['WebM', 'motion', 'ブラウザーで扱える動画形式', '動画 ビデオ'],
  wav: ['WAV', 'audio', 'PCM音声。音声編集にも使いやすい形式', 'wave ウェーブ 音楽'],
  aiff: ['AIFF', 'audio', 'PCM音声。制作ソフトで使う形式', 'aif 音楽'],
  au: ['AU', 'audio', 'Sun / NeXTのPCM音声形式', 'snd 音楽'],
  m4a: ['M4A', 'audio', '圧縮した音声を保存', 'aac 音楽'],
  ogg: ['OGG', 'audio', '音声用コンテナ形式', 'opus vorbis 音楽'],
  opus: ['Opus', 'audio', '音声を圧縮して保存', '音楽'],
  mp3: ['MP3', 'audio', '圧縮した音声を保存', '音楽'],
  flac: ['FLAC', 'audio', '可逆圧縮の音声形式', '音楽'],
  bmp: ['BMP', 'image', '非圧縮の画像。透明部分は背景色に合成', 'ビットマップ'],
  tiff: ['TIFF', 'image', 'RGBA画像を非圧縮で保存', 'tif'],
  tga: ['TGA', 'image', '透明度に対応する画像形式', 'targa'],
  qoi: ['QOI', 'image', '透明度に対応する可逆圧縮画像', '可逆'],
  ico: ['ICO', 'image', 'アイコン用。最大256px', 'アイコン favicon'],
  ppm: ['PPM', 'image', 'RGBの画素データを保存', 'netpbm'],
  pgm: ['PGM', 'image', 'グレースケールの画素データ', 'netpbm 白黒'],
  pbm: ['PBM', 'image', '白と黒の2色で保存', 'netpbm 白黒'],
  pam: ['PAM', 'image', '透明度を含むRGBA画素データ', 'netpbm'],
  ascii: ['ASCII', 'art', '明暗を記号で表す、定番の文字アート', 'アスキー 記号'],
  block: ['BLOCK', 'art', 'ブロック文字で濃淡を表現', 'ブロック'],
  braille: ['BRAILLE', 'art', '点字パターンで細かな形を表現', '点字 ドット'],
  emoji: ['EMOJI', 'art', '絵文字で色や形を表現', '絵文字 カラー'],
  custom: ['CUSTOM', 'art', '好きな文字を使ってアートに', 'カスタム 任意'],
  pixels: ['PIXELS', 'data', '色・透明度・配置を編集できる画素テキスト', '画素 ピクセル rgba'],
  encode: ['CODE', 'data', '元ファイルへ戻せるコード。暗号化ではありません', '復元 可逆'],
  base64: ['BASE64', 'data', 'バイナリを文字列に。暗号化ではありません', '符号化 バイナリ'],
  dataurl: ['DATA URL', 'data', '種類の情報を含んだファイルの文字列', 'data url データurl'],
  auto: ['AUTO', 'other', '入力の内容に合わせて変換方法を選択', '自動 おまかせ'],
  text: ['TEXT', 'image', '文章や文字アートを画像に配置', '文章 画像化'],
  restore: ['RESTORE', 'data', 'PiXiEEDの復元コードから元のファイルへ', '復元 戻す'],
  document: ['EDIT', 'data', '保存した文章とレイアウトを再編集', '再編集 ドキュメント'],
};

export const normalizeFormatQuery = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s._-]+/g, ' ').trim();
export function describeFormat(option, context = 'media') {
  const value = String(option.value), key = value.toLowerCase();
  const label = String(option.label || option.textContent || value).trim();
  const meta = INFO[key === 'jpg' ? 'jpeg' : key === 'tif' ? 'tiff' : key];
  let [badge, group, detail, aliases] = meta || [value.toUpperCase().slice(0, 12), 'other', label, ''];
  if (key === 'webm' && /音声|audio/i.test(label)) { group = 'audio'; detail = 'WebM形式の音声を保存'; }
  if (context === 'input' && key === 'pixels') detail = '色番号のテキストから画像を復元';
  if (context === 'input' && ['base64', 'dataurl'].includes(key)) detail = '文字列を読み取り、ファイルに戻す';
  const disabled = Boolean(option.disabled || option.parentElement?.disabled);
  const reason = disabled ? String(option.title || 'この素材・ブラウザーでは利用できません') : '';
  return { value, label, badge, group, groupLabel: GROUPS[group], detail, disabled, reason,
    search: normalizeFormatQuery([value, label, badge, detail, aliases, GROUPS[group]].join(' ')) };
}
export function filterFormats(items, query = '', group = 'all') {
  const terms = normalizeFormatQuery(query).split(' ').filter(Boolean);
  return items.filter(item => (group === 'all' || item.group === group) && terms.every(term => item.search.includes(term)));
}

const SELECTORS = '[data-sc-format],#output-format-select,[data-format],[data-tx-style],[data-tx-action]';
const INSTANCES = new WeakMap();
let serial = 0;
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Progressive enhancement: the native select and its change handler remain intact. */
export async function mountConversionFormatPicker(doc = globalThis.document, win = globalThis.window) {
  const main = doc?.getElementById('main');
  if (!main || !win || INSTANCES.has(main)) return INSTANCES.get(main) || null;
  if (typeof win.HTMLDialogElement?.prototype.showModal !== 'function') return null;
  const sheet = doc.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/css/format-picker.css?rev=20261030-format-picker-1';
  // A missing stylesheet must leave the working native selectors available.
  const styled = await new Promise(resolve => {
    const timer = win.setTimeout(() => resolve(false), 8000);
    sheet.onload = () => { win.clearTimeout(timer); resolve(true); };
    sheet.onerror = () => { win.clearTimeout(timer); resolve(false); };
    doc.head.append(sheet);
  });
  if (!styled || !main.isConnected || INSTANCES.has(main)) return INSTANCES.get(main) || null;
  const id = `px-format-${++serial}`;
  const dialog = doc.createElement('dialog'); dialog.className = 'px-format-dialog'; dialog.id = `${id}-dialog`;
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = `<div class="px-format-grip" aria-hidden="true"></div>
    <header class="px-format-head"><div><p>PIXIEED / FORMAT</p><h2 id="${id}-title">出力形式を選ぶ</h2></div><button type="button" class="px-format-close" aria-label="形式選択を閉じる">${ICON}<path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div class="px-format-searchbox">${ICON}<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" class="px-format-search" aria-label="形式名・用途で検索" placeholder="形式名・用途で検索" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"><button type="button" class="px-format-clear" aria-label="検索をクリア" hidden>×</button></div>
    <div class="px-format-filters" role="group" aria-label="形式の分類"></div>
    <p class="px-format-count" role="status" aria-live="polite" aria-atomic="true"></p>
    <div class="px-format-list" id="${id}-list" role="listbox" tabindex="0" aria-label="選べる形式"></div>
    <div class="px-format-empty" hidden><strong>一致する形式がありません</strong><p>「PNG」「透過」「文字」などで検索できます。</p><button type="button">検索条件をリセット</button></div>
    <footer class="px-format-foot"><span class="px-format-current"></span><span>選ぶとすぐに反映</span></footer>`;
  doc.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const title = $('h2'), search = $('.px-format-search'), clear = $('.px-format-clear');
  const filters = $('.px-format-filters'), list = $('.px-format-list'), empty = $('.px-format-empty');
  const count = $('.px-format-count'), current = $('.px-format-current');
  const bindings = new Map(), removers = [];
  let owner = null, items = [], shown = [], group = 'all', active = -1, frame = 0, disposed = false, backdropDown = false;
  let previousOverflow = null, previousGutter = null;
  const on = (el, type, handler, options) => { el.addEventListener(type, handler, options); removers.push(() => el.removeEventListener(type, handler, options)); };
  const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  const context = select => select.matches('[data-tx-action]') ? 'input' : select.matches('[data-tx-style]') ? 'output'
    : select.matches('[data-sc-format]') ? main.querySelector('.text-mode-nav [aria-pressed="true"]')?.dataset.textMode || 'media' : 'media';
  const titleFor = select => context(select) === 'output' ? '文字の表現を選ぶ' : context(select) === 'input' ? '文字の変換方法を選ぶ' : '出力形式を選ぶ';
  const read = select => [...select.options].filter(option => !option.hidden && !(option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.hidden)).map(option => describeFormat(option, context(select)));
  const usable = binding => binding.select.isConnected && !binding.select.disabled && !binding.select.matches(':disabled') && !binding.trigger.closest('[hidden]') && binding.trigger.getClientRects().length > 0;
  function focusTrigger(binding) { if (binding?.trigger.isConnected && !binding.trigger.disabled && binding.trigger.getClientRects().length) binding.trigger.focus({ preventScroll: true }); }
  function close(restore = true) {
    const old = owner; owner = null;
    if (dialog.open) dialog.close();
    if (old) old.trigger.setAttribute('aria-expanded', 'false');
    if (previousOverflow !== null) { doc.documentElement.style.overflow = previousOverflow; previousOverflow = null; }
    if (previousGutter !== null) { doc.documentElement.style.scrollbarGutter = previousGutter; previousGutter = null; }
    if (restore) focusTrigger(old);
  }
  function position() {
    if (!dialog.open || !owner) return;
    const vv = win.visualViewport, width = Math.min(vv?.width || win.innerWidth, doc.documentElement.clientWidth), height = vv?.height || win.innerHeight;
    const ox = vv?.offsetLeft || 0, oy = vv?.offsetTop || 0, mobile = width <= 640 || height < 500;
    dialog.dataset.layout = mobile ? 'sheet' : 'popover';
    const w = mobile ? Math.min(560, width - 16) : Math.min(480, width - 32);
    const bounds = owner.trigger.getBoundingClientRect();
    const below = oy + height - bounds.bottom - 24, above = bounds.top - oy - 24;
    const useBelow = below >= 320 || below >= above;
    const h = mobile ? height - 16 : Math.min(620, Math.max(180, useBelow ? below : above));
    dialog.style.width = `${w}px`; dialog.style.maxHeight = `${Math.max(100, h)}px`;
    let left = mobile ? ox + (width - w) / 2 : Math.min(Math.max(ox + 16, bounds.right - w), ox + width - w - 16);
    let top;
    if (mobile) top = oy + height - dialog.getBoundingClientRect().height - 8;
    else {
      const actual = dialog.getBoundingClientRect().height;
      top = useBelow ? bounds.bottom + 8 : bounds.top - actual - 8;
      top = Math.max(oy + 16, Math.min(top, oy + height - actual - 16));
    }
    dialog.style.left = `${left}px`; dialog.style.top = `${Math.max(oy + 8, top)}px`;
  }
  function setActive(index, scroll = false) {
    active = shown.length ? Math.max(0, Math.min(shown.length - 1, index)) : -1;
    list.querySelectorAll('[role="option"]').forEach((node, i) => node.classList.toggle('is-active', i === active));
    const node = active < 0 ? null : list.querySelector(`[data-format-index="${active}"]`);
    if (node) { list.setAttribute('aria-activedescendant', node.id); if (scroll) node.scrollIntoView({ block: 'nearest' }); }
    else list.removeAttribute('aria-activedescendant');
  }
  function renderList() {
    if (!owner) return;
    const activeValue = shown[active]?.value;
    shown = filterFormats(items, search.value, group);
    const fragment = doc.createDocumentFragment();
    const groups = [...new Set(shown.map(item => item.group))];
    let rowIndex = 0;
    // Keep DOM order and keyboard order identical, even when the engine interleaves formats.
    shown = groups.flatMap(key => shown.filter(item => item.group === key));
    for (const key of groups) {
      const section = doc.createElement('div'); section.className = 'px-format-group'; section.setAttribute('role', 'group');
      const heading = doc.createElement('div'); heading.className = 'px-format-group-title'; heading.id = `${id}-${key}`; heading.textContent = GROUPS[key];
      section.setAttribute('aria-labelledby', heading.id); section.append(heading);
      for (const item of shown.filter(entry => entry.group === key)) {
        const node = doc.createElement('div'); node.className = 'px-format-option'; node.id = `${id}-option-${rowIndex}`;
        node.setAttribute('role', 'option'); node.dataset.formatIndex = rowIndex++; node.dataset.value = item.value;
        node.setAttribute('aria-selected', String(item.value === owner.select.value));
        if (item.disabled) node.setAttribute('aria-disabled', 'true');
        const badge = doc.createElement('span'); badge.className = 'px-format-badge'; badge.dataset.family = item.group; badge.textContent = item.badge; badge.setAttribute('aria-hidden', 'true');
        const copy = doc.createElement('span'); copy.className = 'px-format-option-copy';
        const name = doc.createElement('strong'); name.textContent = item.label; name.id = `${node.id}-name`;
        const detail = doc.createElement('span'); detail.textContent = item.disabled ? item.reason : item.detail; detail.id = `${node.id}-detail`;
        copy.append(name, detail); node.setAttribute('aria-labelledby', name.id); node.setAttribute('aria-describedby', detail.id);
        const mark = doc.createElement('span'); mark.className = 'px-format-mark'; mark.textContent = item.disabled ? '非対応' : item.value === owner.select.value ? '✓' : ''; mark.setAttribute('aria-hidden', 'true');
        node.append(badge, copy, mark); section.append(node);
      }
      fragment.append(section);
    }
    list.replaceChildren(fragment); list.hidden = !shown.length; empty.hidden = !!shown.length;
    text(count, `${shown.filter(item => !item.disabled).length}種類を選択できます`);
    clear.hidden = !search.value;
    const selected = shown.findIndex(item => item.value === owner.select.value);
    const oldActive = shown.findIndex(item => item.value === activeValue);
    setActive(oldActive >= 0 ? oldActive : selected >= 0 ? selected : 0);
    text(current, `選択中：${owner.select.selectedOptions[0]?.textContent || '未選択'}`);
    position();
  }
  function renderFilters() {
    const keys = [...new Set(items.map(item => item.group))];
    if (group !== 'all' && !keys.includes(group)) group = 'all';
    filters.replaceChildren(); filters.hidden = keys.length <= 1;
    for (const key of ['all', ...keys]) {
      const button = doc.createElement('button'); button.type = 'button'; button.dataset.group = key;
      button.textContent = key === 'all' ? 'すべて' : GROUPS[key]; button.setAttribute('aria-pressed', String(key === group)); filters.append(button);
    }
  }
  function sync(binding) {
    const options = read(binding.select), selected = options.find(item => item.value === binding.select.value);
    const disabled = binding.select.disabled || binding.select.matches(':disabled') || !options.length;
    if (binding.trigger.disabled !== disabled) binding.trigger.disabled = disabled;
    text(binding.name, selected?.label || '形式を選ぶ'); text(binding.badge, selected?.badge || 'FORMAT');
    binding.badge.dataset.family = selected?.group || 'other';
    text(binding.hint, selected?.disabled ? selected.reason : selected?.detail || '素材に対応した形式を表示');
    binding.trigger.setAttribute('aria-label', `${titleFor(binding.select)}。現在：${selected?.label || '未選択'}`);
    if (owner === binding) {
      if (!usable(binding)) { close(false); return; }
      const signature = JSON.stringify([options, binding.select.value, context(binding.select)]);
      if (signature !== binding.signature) { items = options; text(title, titleFor(binding.select)); renderFilters(); renderList(); }
      binding.signature = signature;
    }
  }
  function open(binding, keyboard = false) {
    if (!usable(binding)) return;
    if (owner === binding && dialog.open) { close(); return; }
    if (dialog.open) close(false);
    owner = binding; group = 'all'; search.value = ''; shown = []; active = -1;
    items = read(binding.select); text(title, titleFor(binding.select)); renderFilters(); renderList();
    binding.signature = JSON.stringify([items, binding.select.value, context(binding.select)]);
    // Lock page scroll without moving the preview; modal focus is handled by <dialog>.
    previousOverflow = doc.documentElement.style.overflow; previousGutter = doc.documentElement.style.scrollbarGutter;
    doc.documentElement.style.scrollbarGutter = 'stable'; doc.documentElement.style.overflow = 'hidden';
    binding.trigger.setAttribute('aria-expanded', 'true'); dialog.showModal(); position();
    // Avoid opening the software keyboard automatically on a touch screen.
    if (keyboard) { list.focus({ preventScroll: true }); setActive(active, true); }
    else if (win.matchMedia('(max-width: 640px), (pointer: coarse)').matches) list.focus({ preventScroll: true });
    else search.focus({ preventScroll: true });
    position();
  }
  function commit(index) {
    if (!owner || !shown[index] || shown[index].disabled || !usable(owner)) return;
    const binding = owner, value = shown[index].value;
    // Re-check the current native options: capabilities can change while the dialog is open.
    if (!read(binding.select).some(item => item.value === value && !item.disabled)) { sync(binding); return; }
    close();
    if (binding.select.value === value) return;
    binding.select.value = value;
    binding.select.dispatchEvent(new win.Event('change', { bubbles: true }));
    schedule();
  }
  function enhance(select) {
    if (bindings.has(select) || select.multiple) return;
    const trigger = doc.createElement('button'); trigger.type = 'button'; trigger.className = 'px-format-trigger'; trigger.id = `${id}-trigger-${bindings.size}`;
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', dialog.id); trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="px-format-badge" aria-hidden="true"></span><span class="px-format-trigger-copy"><strong></strong><span></span></span><span class="px-format-chevron">${ICON}<path d="m7 10 5 5 5-5"/></svg></span>`;
    const parent = select.closest('label'); const originalFor = parent?.getAttribute('for');
    // The hidden select remains in place: no loss of labels, native references or state.
    select.insertAdjacentElement('afterend', trigger);
    if (parent) parent.htmlFor = trigger.id;
    const oldHidden = select.hidden, oldTabindex = select.getAttribute('tabindex'), oldAria = select.getAttribute('aria-hidden');
    select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const binding = { select, trigger, parent, originalFor, oldHidden, oldTabindex, oldAria, signature: '', name: trigger.querySelector('strong'), hint: trigger.querySelector('.px-format-trigger-copy > span'), badge: trigger.querySelector('.px-format-badge') };
    bindings.set(select, binding); sync(binding);
    on(trigger, 'click', event => { event.preventDefault(); open(binding, event.detail === 0); });
    on(trigger, 'keydown', event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(binding, true); } });
  }
  function refresh() {
    frame = 0; if (disposed) return;
    main.querySelectorAll(SELECTORS).forEach(enhance);
    for (const [select, binding] of bindings) {
      if (!select.isConnected) { if (owner === binding) close(false); binding.trigger.remove(); bindings.delete(select); }
      else sync(binding);
    }
    position();
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(refresh); }
  on(search, 'input', () => { active = -1; shown = []; renderList(); });
  on(clear, 'click', () => { search.value = ''; shown = []; renderList(); search.focus({ preventScroll: true }); });
  on($('.px-format-empty button'), 'click', () => { search.value = ''; group = 'all'; shown = []; renderFilters(); renderList(); search.focus({ preventScroll: true }); });
  on(filters, 'click', event => { const button = event.target.closest('[data-group]'); if (!button) return; group = button.dataset.group; shown = []; filters.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === button))); renderList(); });
  on(list, 'click', event => { const node = event.target.closest('[data-format-index]'); if (node) commit(Number(node.dataset.formatIndex)); });
  on(list, 'pointermove', event => { const node = event.target.closest('[data-format-index]'); if (node && event.pointerType !== 'touch') setActive(Number(node.dataset.formatIndex)); });
  on(list, 'keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : event.key === 'End' ? shown.length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1), true);
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit(active); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); search.value += event.key; search.focus(); shown = []; renderList(); }
  });
  on(search, 'keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); list.focus(); setActive(active < 0 ? 0 : active, true); }
    else if (event.key === 'Enter') { event.preventDefault(); commit(active); }
  });
  on($('.px-format-close'), 'click', () => close());
  on(dialog, 'cancel', event => { event.preventDefault(); close(); });
  on(dialog, 'close', () => { if (owner) close(); });
  on(dialog, 'pointerdown', event => {
    const b = dialog.getBoundingClientRect(); backdropDown = event.target === dialog && (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom);
  });
  on(dialog, 'click', event => {
    const b = dialog.getBoundingClientRect();
    if (backdropDown && event.target === dialog && (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom)) close();
    backdropDown = false;
  });
  // Mirrors native engine changes, including asynchronously replaced capabilities.
  const observer = new win.MutationObserver(records => {
    if (records.some(record => !record.target.closest?.('.px-format-trigger') && (record.type !== 'attributes' || !record.target.matches?.('.px-format-trigger')))) schedule();
  });
  observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'selected', 'aria-pressed', 'href'] });
  on(main, 'change', schedule); on(main, 'input', schedule); on(main, 'click', schedule); on(main, 'pixieed:text-preview', schedule);
  on(win, 'resize', position); on(win, 'scroll', position, { passive: true });
  if (win.visualViewport) { on(win.visualViewport, 'resize', position); on(win.visualViewport, 'scroll', position); }
  on(win, 'pagehide', event => { close(false); if (!event.persisted) destroy(); }); on(win, 'pageshow', schedule);
  function destroy() {
    if (disposed) return; close(false); disposed = true; observer.disconnect(); if (frame) win.cancelAnimationFrame(frame);
    removers.forEach(remove => remove()); dialog.remove();
    for (const binding of bindings.values()) {
      const { select, trigger, parent } = binding; trigger.remove(); select.hidden = binding.oldHidden;
      for (const [name, value] of [['tabindex', binding.oldTabindex], ['aria-hidden', binding.oldAria]]) value === null ? select.removeAttribute(name) : select.setAttribute(name, value);
      if (parent) binding.originalFor === null ? parent.removeAttribute('for') : parent.setAttribute('for', binding.originalFor);
    }
    bindings.clear(); INSTANCES.delete(main);
  }
  const api = { refresh: schedule, destroy }; INSTANCES.set(main, api); refresh(); return api;
}
