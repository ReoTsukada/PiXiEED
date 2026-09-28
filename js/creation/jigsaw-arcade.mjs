/**
 * The game layer for かんたんジグソー. The page's own controls stay the source of truth (they keep working for
 * keyboards, tests and saved games); this module lays a game-like screen over them:
 *  - a title band where the chosen picture keeps assembling itself
 *  - big tiles for where the picture comes from, and a row of thumbnails to pick it
 *  - difficulty cards (かんたん / ふつう / むずかしい / げきむず) that show how the picture will be cut
 *  - a heads-up bar while playing (difficulty, timer, how much is joined), a click for every join
 *  - a celebration with time, best time and "もういちど / むずかしくする"
 */
import { createIndexedDbDraftAdapter } from './local-drafts.mjs';
import { documentRgba } from './draw-core.mjs';
import { ICON, pixelIcon, sfx, createTimer, formatTime, assembleTitle, winOverlay, floatText } from '../arcade.mjs?rev=20260928-arcade-1';

const $ = (s) => document.querySelector(s);
const setup = $('#jigsaw-setup'); const play = $('#jigsaw-play');
const kind = $('#jigsaw-source-kind'); const drawSelect = $('#jigsaw-source-version'); const publicSelect = $('#jigsaw-public-version');
const fileInput = $('#jigsaw-file'); const grid = $('#jigsaw-grid-size'); const start = $('#jigsaw-start'); const resume = $('#jigsaw-resume');
const workspace = $('#jigsaw-workspace');
const MAX_SOURCE_PIXELS = 2 * 1024 * 1024; const MAX_PIECES = 4096;
const LEVELS = [
  { name: 'かんたん', stars: 1, target: 12 },
  { name: 'ふつう', stars: 2, target: 36 },
  { name: 'むずかしい', stars: 3, target: 100 },
  { name: 'げきむず', stars: 4, target: 300 }
];
const LEVEL_KEY = 'pixieed:jigsaw:level:v1';
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

if (setup && play && kind && grid && start) build();

function build() {
  document.body.classList.add('arc-jigsaw');
  // ---------- title band (the page's h1 moves into it) ----------
  const title = document.createElement('div'); title.className = 'arc-title';
  const art = document.createElement('canvas'); art.setAttribute('aria-hidden', 'true');
  const h1 = document.querySelector('.jigsaw-heading h1');
  const name = h1 || document.createElement('h1'); name.classList.add('arc-title-name');
  if (!h1) name.textContent = 'ドット絵ジグソー';
  const tagline = document.createElement('p'); tagline.className = 'arc-title-sub'; tagline.textContent = 'えらんで、くずして、くみたてる';
  title.append(art, name, tagline);
  const titleArt = assembleTitle(art);

  // ---------- step 1: where the picture comes from ----------
  const step1 = stepLabel(1, 'えをえらぶ');
  const tiles = document.createElement('div'); tiles.className = 'arc-tiles'; tiles.setAttribute('role', 'radiogroup'); tiles.setAttribute('aria-label', '絵の種類');
  const TILE = [['draw', ICON.brush, '自分の絵'], ['public', ICON.globe, 'みんなの作品'], ['file', ICON.photo, '写真・画像']];
  for (const [value, icon, label] of TILE) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'arc-press arc-tile'; b.dataset.kind = value; b.setAttribute('role', 'radio');
    b.append(pixelIcon(icon), Object.assign(document.createElement('span'), { textContent: label }));
    b.addEventListener('click', () => {
      sfx.pick(TILE.findIndex((t) => t[0] === value));
      if (kind.value !== value) { kind.value = value; kind.dispatchEvent(new Event('change', { bubbles: true })); }
      if (value === 'file' && !fileInput.files?.[0]) fileInput.click();
      sync();
    });
    tiles.appendChild(b);
  }
  const picks = document.createElement('div'); picks.className = 'arc-picks'; picks.setAttribute('role', 'radiogroup'); picks.setAttribute('aria-label', 'パズルにする絵');

  // ---------- step 2: difficulty ----------
  const step2 = stepLabel(2, 'むずかしさ');
  const cards = document.createElement('div'); cards.className = 'arc-cards'; cards.setAttribute('role', 'radiogroup'); cards.setAttribute('aria-label', 'むずかしさ');
  const cardEls = LEVELS.map((level, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = `arc-press arc-card arc-card--${i + 1}`; b.setAttribute('role', 'radio');
    const c = document.createElement('canvas'); c.width = 52; c.height = 52; c.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.innerHTML = `<span class="arc-card-name"></span><span class="arc-card-stars"></span><span class="arc-card-count"></span>`;
    text.querySelector('.arc-card-name').textContent = level.name;
    text.querySelector('.arc-card-stars').innerHTML = '★'.repeat(level.stars) + `<i>${'★'.repeat(4 - level.stars)}</i>`;
    b.append(c, text);
    b.addEventListener('click', () => { chosen = i; store.set(LEVEL_KEY, String(i)); sfx.pick(i + 3); applyLevel(); });
    cards.appendChild(b); return { button: b, canvas: c, count: text.querySelector('.arc-card-count') };
  });

  // ---------- the page's controls: kept, but tucked away (the piece-size select stays as a fine control) ----------
  for (const id of ['#jigsaw-source-kind', '#jigsaw-source-version', '#jigsaw-public-version', '#jigsaw-file']) $(id)?.closest('label')?.classList.add('arc-tucked');
  $('#jigsaw-piece-count')?.classList.add('arc-tucked');
  const gridField = grid.closest('label'); gridField?.classList.add('arc-fine');
  if (gridField?.firstChild?.nodeType === Node.TEXT_NODE) gridField.firstChild.textContent = 'ピースの大きさ';
  start.classList.add('arc-start'); start.textContent = 'スタート';
  resume?.classList.add('arc-press', 'arc-sub-button'); if (resume) resume.textContent = 'つづきから';
  setup.classList.add('arc-panel');
  setup.prepend(title, step1, tiles, picks, step2, cards);
  start.addEventListener('click', () => { if (!start.disabled) sfx.start(); }, true);

  // ---------- state ----------
  let chosen = Math.min(LEVELS.length - 1, Math.max(0, Number(store.get(LEVEL_KEY) ?? 1) || 0));
  if (store.get(LEVEL_KEY) === null) chosen = 1;
  let dims = null; let plan = []; let picture = null; let applying = false; let fileUrl = null;
  const thumbs = new Map(); // key -> canvas/img, so rebuilding the row is cheap

  function stepLabel(n, text) { const d = document.createElement('p'); d.className = 'arc-step'; d.innerHTML = `<span class="arc-step-no">${n}</span>`; d.append(text); return d; }

  // the page's piece count, as the engine counts it
  const countFor = (w, h, px) => Math.max(1, Math.floor(w / px)) * Math.max(1, Math.floor(h / px));
  function planLevels(w, h) {
    let prev = null;
    return LEVELS.map((level) => {
      let best = null;
      for (let px = 3; px <= Math.max(w, h); px++) {
        const n = countFor(w, h, px); if (n > MAX_PIECES) continue;
        const score = Math.abs(Math.log(n / level.target));
        if (!best || score < best.score - 1e-9) best = { px, n, score };
      }
      const usable = best && (!prev || best.px !== prev.px) && best.n > 1;
      const out = usable ? { ...best, cols: Math.max(1, Math.floor(w / best.px)), rows: Math.max(1, Math.floor(h / best.px)) } : null;
      if (out) prev = out; return out;
    });
  }
  function bounded(w, h) { const s = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (w * h))); return { width: Math.max(2, Math.floor(w * s)), height: Math.max(2, Math.floor(h * s)) }; }

  function drawCards() {
    cardEls.forEach((card, i) => {
      const p = plan[i]; const g = card.canvas.getContext('2d'); g.clearRect(0, 0, 52, 52); g.imageSmoothingEnabled = false;
      card.button.disabled = !p; card.button.setAttribute('aria-checked', String(i === chosen && !!p));
      card.count.textContent = p ? `${p.n.toLocaleString('ja-JP')}ピース` : dims ? 'この絵では小さすぎます' : '絵をえらんでね';
      if (!picture || !dims) return;
      const s = Math.min(48 / dims.width, 48 / dims.height); const w = dims.width * s; const h = dims.height * s; const x = (52 - w) / 2; const y = (52 - h) / 2;
      g.drawImage(picture, x, y, w, h);
      if (!p) return;
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1; g.beginPath();
      for (let c = 1; c < p.cols; c++) { const lx = Math.round(x + (c * p.px) * s) + 0.5; g.moveTo(lx, y); g.lineTo(lx, y + h); }
      for (let r = 1; r < p.rows; r++) { const ly = Math.round(y + (r * p.px) * s) + 0.5; g.moveTo(x, ly); g.lineTo(x + w, ly); }
      g.stroke();
    });
  }
  function applyLevel() {
    if (!plan.length) { drawCards(); return; }
    if (!plan[chosen]) { const lower = plan.slice(0, chosen).map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop(); chosen = lower ?? plan.findIndex(Boolean); }
    const p = plan[chosen]; drawCards(); if (!p) return;
    const value = String(p.px);
    if (![...grid.options].some((o) => o.value === value)) grid.add(new Option(`${LEVELS[chosen].name}・約${p.px}px`, value));
    if (grid.value !== value) { applying = true; grid.value = value; grid.dispatchEvent(new Event('change', { bubbles: true })); applying = false; }
  }
  grid.addEventListener('change', () => {
    if (applying || !plan.length) return;
    const i = plan.findIndex((p) => p && String(p.px) === grid.value); chosen = i; drawCards(); // a fine choice that is no level lights none
  });

  function setPicture(source, w, h) {
    picture = source; dims = w && h ? bounded(w, h) : null; plan = dims ? planLevels(dims.width, dims.height) : [];
    titleArt.setPicture(source); applyLevel();
  }

  // ---------- thumbnails ----------
  let adapter = null; let drawRecord = null;
  async function drawThumb(revisionId) {
    if (thumbs.has(`d:${revisionId}`)) return thumbs.get(`d:${revisionId}`);
    try {
      adapter ??= createIndexedDbDraftAdapter();
      const draftId = store.get('pixieed:picture:jigsaw:v1'); if (!draftId) return null;
      drawRecord ??= await adapter.get(draftId);
      const revision = drawRecord?.revisions?.find((r) => r.revisionId === revisionId); if (!revision?.document) return null;
      const { width, height } = revision.document; const c = document.createElement('canvas'); c.width = width; c.height = height;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(documentRgba(revision.document)), width, height), 0, 0);
      thumbs.set(`d:${revisionId}`, c); return c;
    } catch { return null; }
  }
  function imageThumb(url) {
    const key = `u:${url}`; if (thumbs.has(key)) return thumbs.get(key);
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = url; img.alt = '';
    thumbs.set(key, img); return img;
  }
  const whenLoaded = (img) => (img.complete && img.naturalWidth ? Promise.resolve(img) : new Promise((res) => { img.addEventListener('load', () => res(img), { once: true }); img.addEventListener('error', () => res(null), { once: true }); }));

  function pickButton(label, selected, onClick) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'arc-press arc-pick'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(selected)); b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick); return b;
  }
  async function renderPicks() {
    const k = kind.value; picks.replaceChildren();
    if (k === 'file') {
      const file = fileInput.files?.[0];
      if (file) {
        if (fileUrl) URL.revokeObjectURL(fileUrl); fileUrl = URL.createObjectURL(file);
        const img = imageThumb(fileUrl); const b = pickButton(file.name || '選んだ画像', true, () => {}); b.appendChild(img); picks.appendChild(b);
        whenLoaded(img).then((ok) => ok && setPicture(img, img.naturalWidth, img.naturalHeight));
      } else setPicture(null);
      const add = pickButton('画像をえらぶ', false, () => fileInput.click()); add.classList.add('arc-pick--add'); add.textContent = '＋'; picks.appendChild(add);
      return;
    }
    const select = k === 'draw' ? drawSelect : publicSelect;
    const options = [...select.options].filter((o) => o.value);
    if (!options.length) { const p = document.createElement('p'); p.className = 'arc-picks-empty'; p.textContent = select.options[0]?.textContent || 'えらべる絵がありません'; picks.appendChild(p); setPicture(null); return; }
    for (const option of options.slice(0, 80)) {
      const selected = option.value === select.value;
      const b = pickButton(option.textContent, selected, () => {
        select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); sfx.tap();
        for (const other of picks.children) other.setAttribute('aria-checked', String(other === b)); usePick(option);
      });
      picks.appendChild(b);
      if (k === 'draw') drawThumb(option.value).then((c) => { if (c) b.appendChild(c.cloneNode ? copyCanvas(c) : c); });
      else { let url = null; try { url = JSON.parse(option.value).url; } catch { /* not a work */ } if (url) b.appendChild(imageThumb(url).cloneNode()); }
      if (selected) usePick(option);
    }
  }
  function copyCanvas(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }
  async function usePick(option) {
    if (kind.value === 'draw') {
      const c = await drawThumb(option.value);
      setPicture(c, Number(option.dataset.width) || c?.width, Number(option.dataset.height) || c?.height);
    } else {
      let url = null; try { url = JSON.parse(option.value).url; } catch { /* nothing */ }
      if (!url) return setPicture(null);
      const img = await whenLoaded(imageThumb(url)); if (img) setPicture(img, img.naturalWidth, img.naturalHeight); else setPicture(null);
    }
  }
  function sync() {
    for (const b of tiles.children) b.setAttribute('aria-checked', String(b.dataset.kind === kind.value));
    renderPicks();
  }
  kind.addEventListener('change', sync);
  fileInput.addEventListener('change', () => { if (kind.value === 'file') sync(); });
  for (const select of [drawSelect, publicSelect]) {
    new MutationObserver(() => { if ((kind.value === 'draw' && select === drawSelect) || (kind.value === 'public' && select === publicSelect)) renderPicks(); }).observe(select, { childList: true });
    select.addEventListener('change', () => { for (const b of picks.children) b.setAttribute?.('aria-checked', String(b.getAttribute('aria-label') === select.selectedOptions[0]?.textContent)); });
  }
  sync();

  // ---------- playing: heads-up bar, joins, celebration ----------
  const hud = document.createElement('div'); hud.className = 'arc-hud'; hud.setAttribute('aria-live', 'off');
  hud.innerHTML = '<span class="arc-badge"><b></b><span></span></span><span class="arc-timer" role="timer" aria-label="プレイ時間">00:00</span><span class="arc-progress"><span class="arc-progress-label">つながった <b>0 / 0</b></span><span class="arc-bar"><span></span></span></span>';
  play.prepend(hud);
  const badgeStars = hud.querySelector('.arc-badge b'); const badgeName = hud.querySelector('.arc-badge span');
  const timerEl = hud.querySelector('.arc-timer'); const progressLabel = hud.querySelector('.arc-progress-label b'); const bar = hud.querySelector('.arc-bar span');
  const timer = createTimer((ms) => { timerEl.textContent = formatTime(ms); }, 'pixieed:jigsaw:time:');
  const levelOf = (n) => (n <= 20 ? 0 : n <= 60 ? 1 : n <= 173 ? 2 : 3);
  let last = null; let combo = 0; let comboAt = 0; let won = null;

  document.addEventListener('jigsaw:state', (event) => {
    const s = event.detail; const joins = s.pieces - s.groups; const need = Math.max(1, s.pieces - 1);
    const level = LEVELS[levelOf(s.pieces)];
    badgeStars.textContent = '★'.repeat(level.stars); badgeName.textContent = level.name;
    progressLabel.textContent = `${joins} / ${need}`; bar.style.width = `${Math.round((joins / need) * 100)}%`;
    const fresh = !last || last.gameId !== s.gameId;
    timer.use(s.gameId);
    if (fresh) { won?.close(); won = null; combo = 0; }
    if (!fresh && s.groups < last.groups) {
      const now = performance.now(); combo = now - comboAt < 2500 ? combo + 1 : 0; comboAt = now;
      sfx.snap(combo); hud.classList.remove('is-bump'); requestAnimationFrame(() => hud.classList.add('is-bump'));
      const r = workspace.getBoundingClientRect(); const host = play.getBoundingClientRect();
      floatText(play, r.left - host.left + r.width / 2, r.top - host.top + r.height * 0.4, combo > 0 ? `+${last.groups - s.groups}  ×${combo + 1}` : `+${last.groups - s.groups}`);
    }
    if (s.complete) {
      timer.stop();
      if (!last?.complete || fresh) celebrate(s, level);
    } else if (!play.hidden) timer.start();
    last = s;
  });
  $('#jigsaw-new')?.addEventListener('click', () => { timer.stop(); won?.close(); won = null; last = null; });

  function celebrate(s, level) {
    const ms = timer.elapsed(); const key = `pixieed:jigsaw:best:${s.pieces}:${s.width}x${s.height}`;
    const best = Number(store.get(key)) || 0; const record = !best || ms < best; if (record) store.set(key, String(Math.round(ms)));
    const next = levelOf(s.pieces) + 1; const harder = plan[next] && next < LEVELS.length;
    won = winOverlay(play, {
      title: record && best ? 'しんきろく！' : 'かんせい！', stars: level.stars,
      stats: [['タイム', formatTime(ms)], ['ベスト', formatTime(record ? ms : best)], ['ピース', s.pieces.toLocaleString('ja-JP')], ['むずかしさ', level.name]],
      actions: [
        { label: 'もういちど', primary: true, onClick: () => { won?.close(); start.click(); } },
        ...(harder ? [{ label: `${LEVELS[next].name}にする`, onClick: () => { won?.close(); chosen = next; store.set(LEVEL_KEY, String(next)); applyLevel(); start.click(); } }] : []),
        { label: 'べつの絵をえらぶ', onClick: () => { won?.close(); $('#jigsaw-new')?.click(); } }
      ]
    });
  }
}
