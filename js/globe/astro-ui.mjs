/**
 * Time, Sun/Moon and eclipse controls for the globe, plus the telescope view.
 *
 * The simulated instant is the one piece of state. Every change becomes a
 * celestial state (astronomy.mjs) that is pushed to the orbit renderer and,
 * when open, to the telescope.
 *
 * Nothing that belongs to the view lives in a panel:
 * - The Sun and Moon are labelled where they are on screen. When they are off
 *   screen or behind the globe, a marker sits on the edge pointing at them.
 *   Tapping a marker turns the globe (or the telescope) toward that body;
 *   tapping a body that is on screen opens the telescope on it.
 * - Time is a small capsule. Dragging the capsule sideways scrubs time; a tap
 *   folds out a drawer with the time tape, speed and eclipses.
 * - The telescope is a full-screen view with a thin HUD instead of a panel.
 * Play/pause is the only plain button.
 */

import { celestialState, geoToUnit, unitToGeo, listEclipses, peakObscurationAt, moonPhase, findGreatestEclipse, findSunEvent } from './astronomy.mjs?v=20260921-astro-4';
import { createScope, refracted } from './scope.mjs?v=20260926-sizes-v1';

const DEG = Math.PI / 180;
const MINUTE = 60000;
const HOUR = 3600000;
const SKY_FOCAL_HALF_ANGLE = 34; // must match the sky shader in webgl-renderer.mjs
const SPEEDS = [
  { value: 1, label: '×1', long: '実時間' }, { value: 60, label: '1分/秒', long: '1秒で1分' },
  { value: 3600, label: '1時間/秒', long: '1秒で1時間' }, { value: 86400, label: '1日/秒', long: '1秒で1日' }
];
const KIND_LABEL = { total: '皆既日食', annular: '金環日食', partial: '部分日食', none: '食なし' };
const WEEKDAYS = '日月火水木金土';
const TAPE_MIN_SCALE = 0.6; // px per hour: about three weeks across a phone-width tape
const TAPE_MAX_SCALE = 480; // px per hour: 8px per minute
const TAP_SLOP = 6;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function rotate(vector, q) {
  // Same convention as rotateVectorByQuaternion in geometry.mjs and the shaders.
  const [x, y, z] = vector; const { x: qx, y: qy, z: qz, w: qw } = q;
  const tx = 2 * (qy * z - qz * y); const ty = 2 * (qz * x - qx * z); const tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
const conjugate = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

function pad(value, length = 2) { return String(value).padStart(length, '0'); }
function toLocalInputValue(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
function formatDate(date) { return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}（${WEEKDAYS[date.getDay()]}）`; }
function formatClock(date, seconds = true) { return `${pad(date.getHours())}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ''}`; }
function formatShortDate(date) { return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS[date.getDay()]}）`; }
function formatLatLon(latitude, longitude) { return `${latitude >= 0 ? '北緯' : '南緯'}${Math.abs(latitude).toFixed(1)}° ${longitude >= 0 ? '東経' : '西経'}${Math.abs(longitude).toFixed(1)}°`; }

function phaseName(phase) {
  const e = phase.elongation;
  if (e < 12) return '新月';
  if (e > 168) return '満月';
  if (e < 78) return phase.waxing ? '三日月' : '有明の月';
  if (e < 102) return phase.waxing ? '上弦' : '下弦';
  return phase.waxing ? '十三夜' : '寝待月';
}

function element(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function icon(name) { return element('img', { src: `/assets/icons/pixieed/${name}.svg`, alt: '', 'aria-hidden': 'true' }); }

/**
 * Horizontal drag-to-scrub on any element: follows the finger, flings on
 * release, and reports a clean tap separately. `pixelsPerHour()` sets the gearing.
 */
function attachScrub(target, { pixelsPerHour, onScrub, onEnd, onTap = null, onPinch = null }) {
  const pointers = new Map();
  let drag = null; let fling = null; let spread = 0;
  const stopFling = () => { if (fling) cancelAnimationFrame(fling.frame); fling = null; };
  const scrubBy = (pixels) => onScrub(-(pixels / pixelsPerHour()) * HOUR);
  target.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stopFling(); target.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, event.clientX);
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()]; spread = Math.max(8, Math.abs(a - b)); drag = null; return; }
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, moved: false, started: performance.now(), samples: [] };
  });
  target.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, event.clientX);
    if (pointers.size >= 2) { if (!onPinch) return; const [a, b] = [...pointers.values()]; const next = Math.max(8, Math.abs(a - b)); onPinch(next / spread); spread = next; return; }
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > TAP_SLOP) drag.moved = true;
    if (!drag.moved) return;
    const dx = event.clientX - drag.x; drag.x = event.clientX;
    const now = performance.now(); drag.samples.push({ x: event.clientX, t: now }); while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
    scrubBy(dx);
  });
  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size === 1) { const [[id, x]] = [...pointers.entries()]; drag = { id, startX: x, startY: 0, x, moved: true, started: 0, samples: [] }; return; }
    if (pointers.size > 0) return;
    const finished = drag; drag = null;
    if (!finished) { onEnd(); return; }
    if (!finished.moved) { if (event.type === 'pointerup' && onTap && performance.now() - finished.started < 450) onTap(event); return; }
    const samples = finished.samples;
    if (event.type === 'pointerup' && samples.length > 1 && !reducedMotion()) {
      const first = samples[0]; const last = samples[samples.length - 1]; const dt = last.t - first.t;
      let velocity = dt > 0 && performance.now() - last.t < 100 ? (last.x - first.x) / dt : 0;
      if (Math.abs(velocity) > .2) {
        let previous = performance.now();
        const step = (now) => { const elapsed = Math.min(48, now - previous); previous = now; scrubBy(velocity * elapsed); velocity *= Math.exp(-elapsed / 300); if (Math.abs(velocity) < .02) { fling = null; onEnd(); return; } fling.frame = requestAnimationFrame(step); };
        fling = { frame: requestAnimationFrame(step) };
        return;
      }
    }
    onEnd();
  };
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  return { isActive: () => Boolean(drag?.moved || fling || pointers.size > 1), stop: stopFling };
}

/** The strip of time inside the drawer. The needle in the middle is "now" in the simulation. */
function createTimeTape({ onScrub, onEnd, onMarkTap }) {
  const canvas = element('canvas', { class: 'tc-tape__canvas', 'aria-hidden': 'true' });
  const root = element('div', { class: 'tc-tape', role: 'slider', tabindex: '0', 'aria-label': '時刻。左右にドラッグで時間を動かし、ピンチで目盛りを変更' }, [canvas, element('i', { class: 'tc-tape__needle', 'aria-hidden': 'true' })]);
  let scale = 14; // px per hour
  let time = Date.now();
  let marks = [];

  function tick() {
    if (scale >= 160) return { minor: 10 * MINUTE, major: HOUR };
    if (scale >= 10) return { minor: HOUR, major: 6 * HOUR };
    if (scale >= 2.5) return { minor: 6 * HOUR, major: 24 * HOUR };
    if (scale >= 0.9) return { minor: 24 * HOUR, major: 7 * 24 * HOUR };
    return { minor: 24 * HOUR, major: 30 * 24 * HOUR };
  }
  const localAlign = (ms, step) => { const offset = new Date(ms).getTimezoneOffset() * MINUTE; return Math.floor((ms - offset) / step) * step + offset; };
  function label(ms, step) {
    const date = new Date(ms);
    if (step < 24 * HOUR) return date.getHours() === 0 && date.getMinutes() === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : formatClock(date, false);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function draw() {
    const rect = root.getBoundingClientRect();
    if (!rect.width) return;
    const width = rect.width; const height = rect.height;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const center = width / 2; const perMs = scale / HOUR;
    const start = time - center / perMs; const end = time + center / perMs;
    const { minor, major } = tick();
    ctx.lineWidth = 1; ctx.textAlign = 'center'; ctx.font = '600 10px ui-rounded, system-ui, sans-serif';
    for (let t = localAlign(start, minor); t <= end; t += minor) {
      const x = Math.round(center + (t - time) * perMs) + .5;
      const isMajor = Math.abs(localAlign(t + 1, major) - t) < 1;
      ctx.strokeStyle = isMajor ? 'rgba(233, 246, 247, .75)' : 'rgba(140, 210, 226, .32)';
      ctx.beginPath(); ctx.moveTo(x, height); ctx.lineTo(x, height - (isMajor ? 14 : 7)); ctx.stroke();
      if (isMajor) { ctx.fillStyle = 'rgba(233, 246, 247, .78)'; ctx.fillText(label(t, minor), x, height - 19); }
    }
    for (const mark of marks) {
      const x = center + (mark.time - time) * perMs;
      if (x < -6 || x > width + 6) continue;
      ctx.fillStyle = mark.color; ctx.beginPath(); ctx.arc(x, 7, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  const setScale = (next) => { scale = clamp(next, TAPE_MIN_SCALE, TAPE_MAX_SCALE); draw(); };
  const scrub = attachScrub(root, {
    pixelsPerHour: () => scale,
    onScrub: (delta) => onScrub(time + delta),
    onEnd,
    onPinch: (ratio) => setScale(scale * ratio),
    onTap(event) {
      // Tapping an eclipse dot jumps there.
      const rect = root.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      if (y > 20) return;
      const hit = marks.map((mark) => ({ mark, dx: Math.abs(rect.width / 2 + (mark.time - time) * scale / HOUR - x) })).filter((entry) => entry.dx < 12).sort((a, b) => a.dx - b.dx)[0];
      if (hit) onMarkTap(hit.mark);
    }
  });
  root.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) { onScrub(time + (event.deltaX / scale) * HOUR); onEnd(); return; }
    setScale(scale * Math.exp(-clamp(event.deltaY, -60, 60) * 0.01));
  }, { passive: false });
  root.addEventListener('keydown', (event) => {
    const steps = tick(); let delta = 0;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -steps.minor;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = steps.minor;
    else if (event.key === 'PageUp') delta = steps.major; else if (event.key === 'PageDown') delta = -steps.major;
    else if (event.key === '+' || event.key === '=') { setScale(scale * 1.6); event.preventDefault(); return; }
    else if (event.key === '-' || event.key === '_') { setScale(scale / 1.6); event.preventDefault(); return; }
    else return;
    event.preventDefault(); onScrub(time + delta); onEnd();
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(root);

  return {
    root, draw,
    getScale: () => scale,
    isScrubbing: scrub.isActive,
    setTime(next) { time = next; root.setAttribute('aria-valuetext', `${formatDate(new Date(next))} ${formatClock(new Date(next))}`); draw(); },
    setMarks(next) { marks = next; draw(); }
  };
}

/** One eclipse card at a time; swipe sideways to flip through, tap to go there. */
function createEclipseSwiper({ onPick }) {
  const track = element('div', { class: 'tc-eclipses__track' });
  const count = element('span', { class: 'tc-eclipses__count' });
  const root = element('div', { class: 'tc-eclipses', role: 'group', 'aria-roledescription': 'カルーセル', 'aria-label': '日食。左右にスワイプで切り替え、タップで再現' }, [track, count]);
  let entries = []; let index = 0; let drag = null;
  function place(offset = 0, animate = true) {
    track.style.transition = animate && !reducedMotion() ? '' : 'none';
    track.style.transform = `translateX(calc(${-index * 100}% + ${offset}px))`;
    count.textContent = entries.length ? `${index + 1} / ${entries.length}` : '';
    [...track.children].forEach((card, i) => { card.tabIndex = i === index ? 0 : -1; card.setAttribute('aria-hidden', String(i !== index)); });
  }
  function show(next) { index = clamp(next, 0, Math.max(0, entries.length - 1)); place(); }
  root.addEventListener('pointerdown', (event) => { root.setPointerCapture?.(event.pointerId); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, moved: false }; });
  root.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(drag.dx) > TAP_SLOP) drag.moved = true;
    if (drag.moved) { const edge = (index === 0 && drag.dx > 0) || (index === entries.length - 1 && drag.dx < 0); place(edge ? drag.dx * .3 : drag.dx, false); }
  });
  const end = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const { moved, dx } = drag; drag = null;
    if (!moved) { if (event.type === 'pointerup' && entries[index]) onPick(entries[index]); place(); return; }
    const width = root.getBoundingClientRect().width || 1;
    show(index + (Math.abs(dx) > width * .18 ? (dx < 0 ? 1 : -1) : 0));
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { show(index - 1); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { show(index + 1); event.preventDefault(); }
    else if (event.key === 'Enter' || event.key === ' ') { if (entries[index]) onPick(entries[index]); event.preventDefault(); }
  });
  return {
    root,
    setEntries(next, cards) { entries = next; track.replaceChildren(...cards); place(0, false); },
    showNearest(time) { const next = entries.findIndex((entry) => entry.time.getTime() >= time - HOUR); show(next < 0 ? entries.length - 1 : next); },
    markActive(entry) { [...track.children].forEach((card, i) => card.classList.toggle('is-active', entries[i] === entry)); }
  };
}

export function initAstroUi({ renderer, stage, initiallyCollapsed = true }) {
  if (!renderer || !stage) return null;
  let time = Date.now();
  let speedIndex = 0;
  let playing = false;
  let resumeAfterScrub = false;
  let lastFrame = 0;
  let state = null;
  let eclipses = [];
  let timeTween = null;
  let sunEvents = { at: -Infinity, time: NaN, key: '', rise: null, set: null };

  // ---- Sky markers on the globe view and in the telescope -------------------
  const skyHud = element('div', { class: 'sky-hud', 'aria-label': '太陽と月' });
  function skyMark(kind, iconName, name) {
    const label = element('span', { class: 'sky-mark__label' });
    const button = element('button', { type: 'button', class: `sky-mark is-${kind}`, hidden: '', onClick: () => onMarkTap(kind) }, [
      element('i', { class: 'sky-mark__arrow', 'aria-hidden': 'true' }), icon(iconName), label
    ]);
    skyHud.append(button);
    return { button, label, name, kind };
  }
  const marks = { sun: skyMark('sun', 'sun', '太陽'), moon: skyMark('moon', 'moon', '月') };

  // ---- Time capsule --------------------------------------------------------
  const playButton = element('button', { type: 'button', class: 'tc-play', 'aria-label': '再生' }, [icon('play')]);
  const clockText = element('strong', { class: 'tc-clock' });
  const dateText = element('span', { class: 'tc-date' });
  const speedBadge = element('span', { class: 'tc-speed' });
  const face = element('div', { class: 'tc-face', role: 'button', tabindex: '0', 'aria-expanded': 'false', 'aria-controls': 'timeDrawer', 'aria-label': '時刻。左右にドラッグで時間を動かす。タップで詳細' }, [clockText, element('span', { class: 'tc-sub' }, [dateText, speedBadge])]);
  const nowChip = element('button', { type: 'button', class: 'tc-now', hidden: '', onClick: () => tweenTime(Date.now(), { pause: true }) }, [element('span', { text: 'いま' })]);
  const timeInput = element('input', { type: 'datetime-local', step: '1', class: 'tc-picker__input', 'aria-label': '日時を指定' });
  const fullDate = element('span', { class: 'tc-picker__text' });
  const picker = element('label', { class: 'tc-picker' }, [fullDate, timeInput]);
  const tape = createTimeTape({
    onScrub(next) { if (playing) { resumeAfterScrub = true; setPlaying(false); } setTime(next); },
    onEnd() { if (resumeAfterScrub) { resumeAfterScrub = false; setPlaying(true); } },
    onMarkTap(mark) { if (mark.entry) goToEclipse(mark.entry); }
  });
  const speedGroup = element('div', { class: 'tc-speeds', role: 'radiogroup', 'aria-label': '再生の速さ' }, SPEEDS.map((option, index) => element('label', {}, [
    element('input', { type: 'radio', name: 'tc-speed', value: String(index), ...(index === 0 ? { checked: '' } : {}) }), element('span', { text: option.label, title: option.long })
  ])));
  const swiper = createEclipseSwiper({ onPick: (entry) => goToEclipse(entry) });
  const drawer = element('div', { class: 'tc-drawer', id: 'timeDrawer' }, [element('div', { class: 'tc-drawer__inner' }, [
    picker, tape.root, speedGroup, swiper.root,
    element('p', { class: 'tc-foot', text: '地球を長押しすると、その場所から空を見られます' })
  ])]);
  const capsule = element('section', { class: 'time-capsule', 'aria-label': '時刻と天体' }, [
    element('div', { class: 'tc-bar' }, [playButton, face, nowChip]), drawer
  ]);

  // ---- Telescope HUD ---------------------------------------------------------
  const scopeCanvas = element('canvas', { id: 'scopeCanvas', class: 'scope-canvas', hidden: '', tabindex: '0', 'aria-label': '望遠鏡ビュー。ドラッグで向きを変え、ピンチまたはホイールで倍率を変更。Escで閉じる' });
  const fovPill = element('output', { class: 'scope-fov' });
  const where = element('span', { class: 'scope-where' });
  const eclipseLine = element('span', { class: 'scope-eclipse' });
  const riseChip = element('button', { type: 'button', class: 'scope-chip', onClick: () => watchSunEvent('rise') }, [icon('sun'), element('span')]);
  const setChip = element('button', { type: 'button', class: 'scope-chip is-set', onClick: () => watchSunEvent('set') }, [icon('sun'), element('span')]);
  const filterChip = element('button', { type: 'button', class: 'scope-chip scope-filter', 'aria-pressed': 'true', onClick: () => setFilter(filterChip.getAttribute('aria-pressed') !== 'true') }, [element('i', { 'aria-hidden': 'true' }), element('span', { text: '太陽フィルター' })]);
  const scopeHud = element('section', { class: 'scope-hud', hidden: '', 'aria-label': '望遠鏡' }, [
    element('button', { type: 'button', class: 'scope-close', 'aria-label': '望遠鏡を閉じる', onClick: () => closeScope() }, [icon('close')]),
    fovPill,
    element('div', { class: 'scope-dock' }, [
      element('p', { class: 'scope-status', role: 'status', 'aria-live': 'polite' }, [where, eclipseLine]),
      element('div', { class: 'scope-chips' }, [riseChip, setChip, filterChip]),
      element('p', { class: 'scope-warning', text: '実際の観測では、必ず日食グラスや太陽フィルターを使ってください。' })
    ])
  ]);
  stage.append(scopeCanvas, skyHud, scopeHud, capsule);

  let fovTimer = null;
  let lastFov = null;
  const scope = createScope({ canvas: scopeCanvas, onChange: onScopeChange });

  // ---- behaviour -----------------------------------------------------------
  function setOpen(open) {
    capsule.classList.toggle('is-open', open);
    face.setAttribute('aria-expanded', String(open));
    if (open) { requestAnimationFrame(() => tape.draw()); swiper.showNearest(time); }
  }

  function orbitParameters() {
    return { sunDirection: state.sunDirection, moonVector: state.moonVector, sunRadius: state.sunAngularRadius, gmstRadians: state.gmstDegrees * DEG, lighting: false, bodies: true, sunScale: 6, moonScale: 8 };
  }

  function renderClock() {
    const date = new Date(time);
    clockText.textContent = formatClock(date, false);
    dateText.textContent = formatShortDate(date);
    fullDate.textContent = `${formatDate(date)} ${formatClock(date)}`;
    speedBadge.textContent = playing && speedIndex > 0 ? SPEEDS[speedIndex].label : '';
    nowChip.hidden = Math.abs(time - Date.now()) < MINUTE || Boolean(timeTween);
    tape.setTime(time);
  }

  // Nudge a label down (or up at the bottom edge) so the Sun and Moon never cover each other.
  function avoid(x, y, button, occupied, bounds) {
    const width = button.offsetWidth || 80; const height = (button.offsetHeight || 30) + 6;
    let next = y;
    for (const other of occupied) if (Math.abs(other.x - x) < (width + other.width) / 2 && Math.abs(other.y - next) < height) next = other.y + (other.y + height * 2 > bounds.bottom ? -height : height);
    occupied.push({ x, y: next, width });
    return next;
  }

  // Place a marker at a screen point, or pinned to the edge of `bounds` pointing toward it.
  function placeMark(mark, { x, y, inside, dimmed, text, offset = 0, title }, bounds, occupied = []) {
    const { button, label } = mark;
    button.hidden = false;
    label.textContent = text;
    button.setAttribute('aria-label', title);
    button.classList.toggle('is-dim', Boolean(dimmed));
    if (inside) {
      button.classList.add('is-onscreen'); button.classList.remove('is-edge');
      const labelY = avoid(x, y + offset, button, occupied, bounds);
      button.style.transform = `translate(${x.toFixed(1)}px, ${labelY.toFixed(1)}px)`;
      return;
    }
    const cx = (bounds.left + bounds.right) / 2; const cy = (bounds.top + bounds.bottom) / 2;
    let dx = x - cx; let dy = y - cy; const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    const t = Math.min(Math.abs(dx) > 1e-6 ? (bounds.right - cx) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? (bounds.bottom - cy) / Math.abs(dy) : Infinity);
    button.classList.add('is-edge'); button.classList.remove('is-onscreen');
    // Keep the whole pill on screen, and park the arrow just outside it, pointing at the body.
    const halfWidth = (button.offsetWidth || 80) / 2; const halfHeight = (button.offsetHeight || 30) / 2;
    const px = clamp(cx + dx * t, bounds.left + halfWidth - 14, bounds.right - halfWidth + 14);
    const py = avoid(px, clamp(cy + dy * t, bounds.top + halfHeight - 14, bounds.bottom - halfHeight + 14), button, occupied, bounds);
    const reach = Math.min(Math.abs(dx) > 1e-6 ? halfWidth / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? halfHeight / Math.abs(dy) : Infinity);
    button.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    button.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`);
    button.style.setProperty('--reach', `${(reach + 3).toFixed(1)}px`);
  }

  function orbitMarks() {
    if (!state) return;
    let snapshot; try { snapshot = renderer.getSnapshot(); } catch { return; }
    const camera = snapshot.camera; if (!camera?.orientation) return;
    const { width, height, centerX, centerY } = camera.viewport;
    const focal = (height / 2) / Math.tan(SKY_FOCAL_HALF_ANGLE * DEG);
    const inverse = conjugate(camera.orientation);
    const eye = rotate([0, 0, 6], camera.orientation);
    const bounds = { left: 22, right: width - 22, top: 74, bottom: height - 90 };
    const phase = moonPhase(state);
    const occupied = [];
    const bodies = [
      { mark: marks.sun, direction: state.sunDirection, radius: state.sunAngularRadius * 6, text: '太陽', detail: '' },
      { mark: marks.moon, direction: [state.moonVector[0] - eye[0], state.moonVector[1] - eye[1], state.moonVector[2] - eye[2]], radius: 0, text: `月・${phaseName(phase)}` }
    ];
    for (const body of bodies) {
      const v = rotate(unit(body.direction), inverse);
      const front = v[2] < 0;
      const x = front ? width / 2 + focal * v[0] / -v[2] : width / 2 + v[0] * 1e4;
      const y = front ? height / 2 - focal * v[1] / -v[2] : height / 2 - v[1] * 1e4;
      const behind = front && Math.hypot(x - centerX, y - centerY) < camera.scale * 0.98;
      const inside = front && !behind && x > bounds.left && x < bounds.right && y > bounds.top && y < bounds.bottom;
      const radius = body.mark.kind === 'moon' ? Math.asin(Math.min(1, 0.27239 / Math.hypot(...body.direction))) * 8 * focal : body.radius * focal;
      placeMark(body.mark, {
        x, y, inside, dimmed: behind, offset: inside ? Math.min(60, Math.max(body.mark.kind === 'sun' ? 22 : 0, radius)) + 14 : 0,
        text: behind ? `${body.mark.name}（地球の裏）` : body.text,
        title: inside ? `${body.mark.name}を望遠鏡で見る` : `${body.mark.name}の方を向く`
      }, bounds, occupied);
    }
  }

  function scopeMarks(snapshot = scope.getSnapshot()) {
    const o = snapshot.observation; if (!o) return;
    // clientWidth/Height ignore the opening zoom animation's transform.
    const width = scopeCanvas.clientWidth || 1; const height = scopeCanvas.clientHeight || 1;
    const az = snapshot.aim.azimuth; const alt = snapshot.aim.altitude;
    const forward = [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
    const right = [Math.cos(az), -Math.sin(az), 0];
    const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
    const tanHalf = Math.tan((snapshot.fov * DEG) / 2);
    const bounds = { left: 22, right: width - 22, top: 74, bottom: height - 200 };
    const occupied = [];
    for (const [mark, local, altitude, radius] of [[marks.sun, o.sunLocal, o.sunAltitude, o.sunRadius], [marks.moon, o.moonLocal, o.moonAltitude, o.moonRadius]]) {
      const v = refracted(local);
      const fz = dot(v, forward); const fx = dot(v, right); const fy = dot(v, up);
      const front = fz > 1e-3;
      const x = front ? width / 2 + (fx / fz / tanHalf) * height / 2 : width / 2 + fx * 1e4;
      const y = front ? height / 2 - (fy / fz / tanHalf) * height / 2 : height / 2 - fy * 1e4;
      const inside = front && x > bounds.left && x < bounds.right && y > bounds.top && y < bounds.bottom;
      const tracking = snapshot.tracking === mark.kind;
      mark.button.classList.toggle('is-tracking', tracking);
      placeMark(mark, {
        x, y, inside, dimmed: altitude < -1, offset: inside ? Math.min(80, ((radius || 0.0047) / tanHalf) * height / 2) + 14 : 0,
        text: altitude < -1 ? `${mark.name}（地平線の下）` : `${mark.name} ${altitude.toFixed(1)}°`,
        title: tracking ? `${mark.name}を追尾中` : `${mark.name}を追う`
      }, bounds, occupied);
    }
  }

  function updateSunEvents(force = false) {
    const snapshot = scope.getSnapshot();
    const key = `${snapshot.observer.latitude.toFixed(2)},${snapshot.observer.longitude.toFixed(2)}`;
    const now = performance.now();
    const stale = force || key !== sunEvents.key || (Math.abs(time - sunEvents.time) > 30 * MINUTE && now - sunEvents.at > 500);
    if (!stale) return;
    const at = new Date(time);
    sunEvents = { at: now, time, key, rise: findSunEvent(at, snapshot.observer.latitude, snapshot.observer.longitude, 'rise'), set: findSunEvent(at, snapshot.observer.latitude, snapshot.observer.longitude, 'set') };
    riseChip.lastChild.textContent = sunEvents.rise ? `日の出 ${formatClock(sunEvents.rise, false)}` : '日の出なし';
    setChip.lastChild.textContent = sunEvents.set ? `日の入り ${formatClock(sunEvents.set, false)}` : '日の入りなし';
    riseChip.disabled = !sunEvents.rise; setChip.disabled = !sunEvents.set;
  }

  function onScopeChange(snapshot) {
    if (!snapshot || !snapshot.open || !snapshot.observation) return;
    const o = snapshot.observation;
    where.textContent = formatLatLon(o.latitude, o.longitude);
    eclipseLine.textContent = o.obscuration > 0 ? `${KIND_LABEL[o.kind]}・太陽の${(o.obscuration * 100).toFixed(1)}%が隠れています` : '';
    const fov = snapshot.fov;
    fovPill.textContent = fov >= 10 ? `視野 ${fov.toFixed(0)}°` : `視野 ${fov.toFixed(2)}°`;
    if (lastFov !== null && Math.abs(fov - lastFov) > 1e-6) {
      fovPill.classList.add('is-live'); clearTimeout(fovTimer); fovTimer = setTimeout(() => fovPill.classList.remove('is-live'), 900);
    }
    lastFov = fov;
    scopeMarks(snapshot);
    updateSunEvents();
  }

  function onMarkTap(kind) {
    if (scope.isOpen()) { scope.track(kind); return; }
    if (marks[kind].button.classList.contains('is-onscreen')) { openScope(undefined, { track: kind }); return; }
    lookAt(kind);
  }

  function apply() {
    state = celestialState(new Date(time));
    renderer.setAstronomy(orbitParameters());
    renderClock();
    if (scope.isOpen()) scope.setState(state); else orbitMarks();
  }

  function setTime(next, { pause = false } = {}) {
    if (timeTween && !timeTween.driving) timeTween = null;
    time = next;
    if (pause) setPlaying(false);
    apply();
  }

  // Jumps (to now, to an eclipse) glide instead of cutting, so the sky visibly moves there.
  function tweenTime(target, { pause = true, duration = 700 } = {}) {
    if (pause) setPlaying(false);
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') { setTime(target); return; }
    const from = time; const started = performance.now();
    const tween = { driving: false }; timeTween = tween;
    const step = (now) => {
      if (timeTween !== tween) return;
      const p = Math.min(1, (now - started) / duration); const eased = p < .5 ? 4 * p ** 3 : 1 - ((-2 * p + 2) ** 3) / 2;
      tween.driving = true; setTime(from + (target - from) * eased); tween.driving = false;
      if (p < 1) requestAnimationFrame(step); else { timeTween = null; renderClock(); }
    };
    requestAnimationFrame(step);
  }

  function setPlaying(next) {
    playing = next;
    playButton.replaceChildren(icon(playing ? 'pause' : 'play'));
    playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
    capsule.classList.toggle('is-playing', playing);
    lastFrame = 0;
    renderClock();
    if (playing) { timeTween = null; requestAnimationFrame(tick); }
  }

  function setSpeed(index, { play = false } = {}) {
    speedIndex = clamp(index, 0, SPEEDS.length - 1);
    for (const input of speedGroup.querySelectorAll('input')) input.checked = Number(input.value) === speedIndex;
    if (play && !playing) setPlaying(true); else renderClock();
  }

  function tick(now) {
    if (!playing) return;
    if (lastFrame) time += (now - lastFrame) * SPEEDS[speedIndex].value;
    lastFrame = now;
    apply();
    requestAnimationFrame(tick);
  }

  function centerAwayFrom(target, degrees) {
    const current = renderer.getSnapshot().view;
    const currentVector = geoToUnit(current.centerLongitude, current.centerLatitude);
    let side = [currentVector[0] - target[0] * dot(currentVector, target), currentVector[1] - target[1] * dot(currentVector, target), currentVector[2] - target[2] * dot(currentVector, target)];
    if (Math.hypot(...side) < 1e-3) side = [target[2], 0, -target[0]];
    side = unit(side);
    const angle = degrees * DEG;
    const center = [target[0] * Math.cos(angle) + side[0] * Math.sin(angle), target[1] * Math.cos(angle) + side[1] * Math.sin(angle), target[2] * Math.cos(angle) + side[2] * Math.sin(angle)];
    return unitToGeo(center);
  }

  function lookAt(kind) {
    const target = kind === 'sun' ? state.sunDirection : state.moonDirection;
    const center = centerAwayFrom(target, 155);
    const move = { centerLongitude: center.longitude, centerLatitude: center.latitude, zoom: 0.9 };
    if (typeof renderer.flyTo === 'function') renderer.flyTo(move); else renderer.setView(move);
  }

  function currentLocation() {
    const snapshot = renderer.getSnapshot();
    const picked = snapshot.selected;
    const center = picked?.center || picked?.cell?.center;
    if (center) return { latitude: center.latitude, longitude: center.longitude };
    return { latitude: snapshot.view.centerLatitude, longitude: snapshot.view.centerLongitude };
  }

  function openScope(location = currentLocation(), { track = null } = {}) {
    setOpen(false);
    stage.classList.add('is-scope');
    scopeCanvas.hidden = false;
    scopeHud.hidden = false;
    scope.open(location, state);
    scope.setFov(track ? 3 : 40);
    if (track) scope.track(track);
    updateSunEvents(true);
    onScopeChange(scope.getSnapshot());
    scopeCanvas.focus({ preventScroll: true });
  }

  function closeScope() {
    stage.classList.remove('is-scope');
    scopeCanvas.hidden = true;
    scopeHud.hidden = true;
    scope.close();
    for (const mark of Object.values(marks)) mark.button.classList.remove('is-tracking');
    orbitMarks();
  }

  function setFilter(on) {
    filterChip.setAttribute('aria-pressed', String(on));
    scope.setFilter(on);
  }

  // Jump to a few minutes before the next sunrise / sunset at the observer and play it slowly.
  function watchSunEvent(kind) {
    updateSunEvents(true);
    const event = kind === 'rise' ? sunEvents.rise : sunEvents.set;
    if (!event) return;
    setSpeed(1);
    scope.track('sun');
    scope.setFov(28);
    setTime(event.getTime() - 4 * MINUTE);
    setPlaying(true);
  }

  function goToEclipse(entry) {
    const detail = findGreatestEclipse(entry.time, 30);
    tweenTime(entry.time.getTime(), { duration: 900 });
    const move = { centerLongitude: detail.longitude, centerLatitude: detail.latitude, zoom: 1.35 };
    if (typeof renderer.flyTo === 'function') renderer.flyTo(move, { duration: 900 }); else renderer.setView(move);
    if (scope.isOpen()) scope.setObserver({ latitude: detail.latitude, longitude: detail.longitude });
    swiper.markActive(entry);
  }

  // ---- wiring --------------------------------------------------------------
  attachScrub(face, {
    pixelsPerHour: () => tape.getScale(),
    onScrub(delta) { if (playing) { resumeAfterScrub = true; setPlaying(false); } setTime(time + delta); },
    onEnd() { if (resumeAfterScrub) { resumeAfterScrub = false; setPlaying(true); } },
    onTap: () => setOpen(!capsule.classList.contains('is-open'))
  });
  face.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(!capsule.classList.contains('is-open')); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setTime(time + (event.key === 'ArrowLeft' ? -HOUR : HOUR)); }
  });
  picker.addEventListener('click', (event) => {
    if (event.target === timeInput) return;
    event.preventDefault();
    timeInput.value = toLocalInputValue(new Date(time));
    try { timeInput.showPicker(); } catch { timeInput.focus(); }
  });
  timeInput.addEventListener('focus', () => { timeInput.value = toLocalInputValue(new Date(time)); });
  timeInput.addEventListener('change', () => {
    const parsed = new Date(timeInput.value);
    if (!Number.isNaN(parsed.getTime())) tweenTime(parsed.getTime());
  });
  playButton.addEventListener('click', () => setPlaying(!playing));
  speedGroup.addEventListener('change', (event) => { if (event.target.name === 'tc-speed') setSpeed(Number(event.target.value), { play: true }); });
  // The scope canvas is the pointer target while open; keep the orbit view's gestures away from it.
  scopeCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
  stage.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (scope.isOpen()) closeScope(); else if (capsule.classList.contains('is-open')) { setOpen(false); face.focus(); }
  });
  // Tapping outside the capsule folds it away.
  stage.addEventListener('pointerdown', (event) => { if (capsule.classList.contains('is-open') && !capsule.contains(event.target)) setOpen(false); }, true);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (scope.isOpen()) scopeMarks(); else orbitMarks(); }).observe(stage);

  // Eclipse cards, built lazily so they never delay the first frame.
  const buildEclipseList = () => {
    try {
      eclipses = listEclipses(new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2036, 11, 31)));
      const tokyo = { latitude: 35.68, longitude: 139.69 };
      const cards = eclipses.map((entry) => {
        const japan = peakObscurationAt(entry.time, tokyo.latitude, tokyo.longitude);
        const note = japan > 0.02 ? `日本で${japan > 0.995 ? '皆既' : `${(japan * 100).toFixed(0)}%欠ける`}` : '';
        return element('div', { class: `tc-eclipse is-${entry.kind}`, role: 'button', tabindex: '-1', 'aria-label': `${KIND_LABEL[entry.kind]} ${formatDate(entry.time)}${note ? ` ${note}` : ''}。タップで再現` }, [
          element('span', { class: 'tc-eclipse__kind', text: KIND_LABEL[entry.kind] }),
          element('strong', { text: `${entry.time.getFullYear()}/${entry.time.getMonth() + 1}/${entry.time.getDate()}` }),
          element('small', { text: note || '日本では見えません' }),
          element('i', { class: 'tc-eclipse__go', 'aria-hidden': 'true' })
        ]);
      });
      swiper.setEntries(eclipses, cards);
      swiper.showNearest(time);
      tape.setMarks(eclipses.map((entry) => ({ entry, time: entry.time.getTime(), color: entry.kind === 'total' ? '#f4d45d' : entry.kind === 'annular' ? '#f0b26b' : '#7ccfe0' })));
    } catch (error) { console.warn('Eclipse list unavailable', error); }
  };
  (typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 200))(buildEclipseList);

  setOpen(!initiallyCollapsed);
  apply();

  const api = Object.freeze({
    refreshView() { if (state && !scope.isOpen()) orbitMarks(); },
    setTime, getTime: () => time, setPlaying, setSpeed, openScope, closeScope, goToEclipse, scope, setOpen,
    getState: () => state
  });
  globalThis.__PIXIEED_ASTRO__ = api;
  return api;
}
