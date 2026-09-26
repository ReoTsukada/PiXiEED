/**
 * Time, Sun/Moon and eclipse controls for the globe, plus the telescope view.
 *
 * The panel owns one piece of state, the simulated instant. Every change is
 * turned into a celestial state (astronomy.mjs) and pushed to the orbit
 * renderer (Sun and Moon in the sky) and, when open, to the telescope canvas.
 *
 * Interaction is direct: time is scrubbed by dragging a time tape (pinch or
 * wheel on the tape changes its scale), the Sun/Moon rows fly the globe to
 * them, eclipse cards jump to an eclipse, and a long press on the globe opens
 * the telescope at that spot. Play/pause is the only plain button.
 */

import { celestialState, geoToUnit, unitToGeo, listEclipses, peakObscurationAt, moonPhase, findGreatestEclipse, findSunEvent } from './astronomy.mjs?v=20260921-astro-4';
import { createScope } from './scope.mjs?v=20260926-gesture-v1';

const DEG = Math.PI / 180;
const HOUR = 3600000;
const SPEEDS = [
  { value: 1, label: '×1', long: '実時間' }, { value: 60, label: '1分/秒', long: '1秒で1分' },
  { value: 600, label: '10分/秒', long: '1秒で10分' }, { value: 3600, label: '1時間/秒', long: '1秒で1時間' },
  { value: 21600, label: '6時間/秒', long: '1秒で6時間' }, { value: 86400, label: '1日/秒', long: '1秒で1日' }
];
const BODY_SIZES = [{ value: 'off', label: '隠す' }, { value: 'real', label: '実寸' }, { value: 'large', label: '大きく' }];
const KIND_LABEL = { total: '皆既日食', annular: '金環日食', partial: '部分日食', none: '食なし' };
const WEEKDAYS = '日月火水木金土';
const TAPE_MIN_SCALE = 0.6; // px per hour: about three weeks across a phone-width tape
const TAPE_MAX_SCALE = 480; // px per hour: 8px per minute

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function pad(value, length = 2) { return String(value).padStart(length, '0'); }

function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(date) { return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}（${WEEKDAYS[date.getDay()]}）`; }
function formatClock(date, seconds = true) { return `${pad(date.getHours())}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ''}`; }
function formatShort(date) { return `${date.getMonth() + 1}/${date.getDate()} ${formatClock(date, false)}`; }

function formatLatLon(latitude, longitude) {
  return `${latitude >= 0 ? '北緯' : '南緯'}${Math.abs(latitude).toFixed(1)}° ${longitude >= 0 ? '東経' : '西経'}${Math.abs(longitude).toFixed(1)}°`;
}

function phaseName(phase) {
  const e = phase.elongation;
  if (e < 12) return '新月';
  if (e > 168) return '満月';
  if (e < 78) return phase.waxing ? '三日月' : '有明の月';
  if (e < 102) return phase.waxing ? '上弦' : '下弦';
  return phase.waxing ? '十三夜前後' : '寝待月前後';
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

function icon(name) {
  return element('img', { src: `/assets/icons/pixieed/${name}.svg`, alt: '', 'aria-hidden': 'true' });
}

// A row that reads like content but acts on tap: title, detail and a trailing hint.
function actionRow(className, iconName, title, onClick) {
  const detail = element('small');
  const row = element('button', { type: 'button', class: `astro-row-action ${className}`, onClick }, [
    icon(iconName), element('span', { class: 'astro-row-action__text' }, [element('b', { text: title }), detail]), element('i', { class: 'astro-row-action__go', 'aria-hidden': 'true' })
  ]);
  return { row, detail };
}

/**
 * A draggable strip of time. The needle in the middle is the current instant;
 * dragging the strip moves time (with a short fling), a pinch or wheel changes
 * how many hours fit on it, and arrow keys step by the current tick.
 */
function createTimeTape({ onScrub, onScrubEnd }) {
  const canvas = element('canvas', { class: 'astro-tape__canvas', 'aria-hidden': 'true' });
  const root = element('div', { class: 'astro-tape', role: 'slider', tabindex: '0', 'aria-label': '時刻。左右にドラッグで時間を動かし、ピンチで目盛りを変更' }, [canvas, element('i', { class: 'astro-tape__needle', 'aria-hidden': 'true' })]);
  let scale = 14; // px per hour
  let time = Date.now();
  let marks = [];
  let fling = null;
  const pointers = new Map();
  let pinchSpread = 0;
  let drag = null;

  function tick() {
    if (scale >= 160) return { minor: 10 * 60000, major: HOUR };
    if (scale >= 10) return { minor: HOUR, major: 6 * HOUR };
    if (scale >= 2.5) return { minor: 6 * HOUR, major: 24 * HOUR };
    if (scale >= 0.9) return { minor: 24 * HOUR, major: 7 * 24 * HOUR };
    return { minor: 24 * HOUR, major: 30 * 24 * HOUR };
  }

  function label(ms, step) {
    const date = new Date(ms);
    if (step < 24 * HOUR) return date.getHours() === 0 && date.getMinutes() === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : formatClock(date, false);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function localAlign(ms, step) {
    // Align ticks to local midnight/hours rather than UTC.
    const offset = new Date(ms).getTimezoneOffset() * 60000;
    return Math.floor((ms - offset) / step) * step + offset;
  }

  function draw() {
    const rect = root.getBoundingClientRect();
    const width = Math.max(1, rect.width); const height = Math.max(1, rect.height);
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const center = width / 2;
    const perMs = scale / HOUR;
    const start = time - center / perMs; const end = time + center / perMs;
    const { minor, major } = tick();
    // Night bands are not drawn: the globe carries no day/night shading either.
    ctx.lineWidth = 1;
    for (let t = localAlign(start, minor); t <= end; t += minor) {
      const x = Math.round(center + (t - time) * perMs) + .5;
      const isMajor = Math.abs(localAlign(t + 1, major) - t) < 1;
      ctx.strokeStyle = isMajor ? 'rgba(233, 246, 247, .75)' : 'rgba(140, 210, 226, .35)';
      ctx.beginPath(); ctx.moveTo(x, height); ctx.lineTo(x, height - (isMajor ? 16 : 8)); ctx.stroke();
      if (isMajor) { ctx.fillStyle = 'rgba(233, 246, 247, .8)'; ctx.font = '600 10px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label(t, minor), x, height - 21); }
    }
    for (const mark of marks) {
      const x = center + (mark.time - time) * perMs;
      if (x < -6 || x > width + 6) continue;
      ctx.fillStyle = mark.color; ctx.beginPath(); ctx.arc(x, 7, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function scrubBy(pixels) { onScrub(time - (pixels / scale) * HOUR); }
  function setScale(next) { scale = clamp(next, TAPE_MIN_SCALE, TAPE_MAX_SCALE); draw(); }
  function stopFling() { if (fling) cancelAnimationFrame(fling.frame); fling = null; }

  root.addEventListener('pointerdown', (event) => {
    stopFling(); root.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, event.clientX);
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()]; pinchSpread = Math.max(8, Math.abs(a - b)); drag = null; return; }
    drag = { id: event.pointerId, x: event.clientX, samples: [{ x: event.clientX, t: performance.now() }] };
  });
  root.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, event.clientX);
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()]; const spread = Math.max(8, Math.abs(a - b)); setScale(scale * spread / pinchSpread); pinchSpread = spread; return; }
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x; drag.x = event.clientX;
    const now = performance.now(); drag.samples.push({ x: event.clientX, t: now }); while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift();
    scrubBy(dx);
  });
  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size === 1) { const [[id, x]] = [...pointers.entries()]; drag = { id, x, samples: [] }; return; }
    if (pointers.size > 0) return;
    const finished = drag; drag = null;
    const samples = finished?.samples || [];
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (event.type === 'pointerup' && samples.length > 1 && !reduce) {
      const first = samples[0]; const last = samples[samples.length - 1]; const dt = last.t - first.t;
      let velocity = dt > 0 && performance.now() - last.t < 100 ? (last.x - first.x) / dt : 0;
      if (Math.abs(velocity) > .2) {
        let previous = performance.now();
        const step = (now) => { const elapsed = Math.min(48, now - previous); previous = now; scrubBy(velocity * elapsed); velocity *= Math.exp(-elapsed / 300); if (Math.abs(velocity) < .02) { fling = null; onScrubEnd(); return; } fling.frame = requestAnimationFrame(step); };
        fling = { frame: requestAnimationFrame(step) };
        return;
      }
    }
    onScrubEnd();
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('wheel', (event) => {
    event.preventDefault();
    // Horizontal wheel/trackpad swipes scrub; vertical wheel changes the scale.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) { scrubBy(-event.deltaX); onScrubEnd(); return; }
    setScale(scale * Math.exp(-clamp(event.deltaY, -60, 60) * 0.01));
  }, { passive: false });
  root.addEventListener('keydown', (event) => {
    const { minor } = tick(); let delta = 0;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -minor;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = minor;
    else if (event.key === 'PageUp') delta = tick().major; else if (event.key === 'PageDown') delta = -tick().major;
    else if (event.key === '+' || event.key === '=') { setScale(scale * 1.6); event.preventDefault(); return; }
    else if (event.key === '-' || event.key === '_') { setScale(scale / 1.6); event.preventDefault(); return; }
    else return;
    event.preventDefault(); onScrub(time + delta); onScrubEnd();
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(root);

  return {
    root,
    isScrubbing: () => Boolean(drag || fling || pointers.size),
    setTime(next) { time = next; root.setAttribute('aria-valuetext', `${formatDate(new Date(next))} ${formatClock(new Date(next))}`); draw(); },
    setMarks(next) { marks = next; draw(); },
    draw
  };
}

export function initAstroUi({ renderer, stage, initiallyCollapsed = false }) {
  if (!renderer || !stage) return null;
  let time = Date.now();
  let speedIndex = 0;
  let playing = false;
  let resumeAfterScrub = false;
  const lighting = false; // the globe itself carries no day/night or eclipse shading
  let bodySize = 'large';
  let lastFrame = 0;
  let state = null;
  let eclipses = [];

  // ---- DOM ---------------------------------------------------------------
  const scopeCanvas = element('canvas', { id: 'scopeCanvas', class: 'scope-canvas', hidden: '', tabindex: '0', 'aria-label': '望遠鏡ビュー。ドラッグで向きを変え、ピンチまたはホイールで倍率を変更' });
  const chipTime = element('span', { class: 'astro-chip__time' });
  const chip = element('button', { type: 'button', class: 'astro-chip', 'aria-expanded': 'false', 'aria-label': '時刻と天体を開く', onClick: () => setOpen(panel.classList.contains('is-collapsed')) }, [icon('celestial'), chipTime, element('i', { class: 'astro-chip__live', 'aria-hidden': 'true' })]);

  const playButton = element('button', { type: 'button', class: 'astro-play', 'aria-label': '再生' }, [icon('play')]);
  const timeInput = element('input', { type: 'datetime-local', step: '1', class: 'astro-when__input', tabindex: '-1', 'aria-hidden': 'true' });
  const dateText = element('span', { class: 'astro-when__date' });
  const clockText = element('strong', { class: 'astro-when__clock' });
  const when = element('button', { type: 'button', class: 'astro-when', 'aria-label': '日時を指定' }, [dateText, clockText]);
  const nowChip = element('button', { type: 'button', class: 'astro-now', hidden: '', onClick: () => setTime(Date.now(), { pause: true }) }, [element('span', { text: 'いま' })]);
  const tape = createTimeTape({
    onScrub(next) { if (playing) { resumeAfterScrub = true; setPlaying(false); } setTime(next); },
    onScrubEnd() { if (resumeAfterScrub) { resumeAfterScrub = false; setPlaying(true); } }
  });

  const speedInput = element('input', { type: 'range', class: 'astro-speed__input', min: '0', max: String(SPEEDS.length - 1), step: '1', value: '0', 'aria-label': '再生の速さ' });
  const speedText = element('output', { class: 'astro-speed__value' });
  const sizeGroup = element('div', { class: 'astro-seg', role: 'radiogroup', 'aria-label': '太陽と月の表示' }, BODY_SIZES.map((option) => element('label', {}, [
    element('input', { type: 'radio', name: 'astro-body-size', value: option.value, ...(option.value === bodySize ? { checked: '' } : {}) }), element('span', { text: option.label })
  ])));

  const sunRow = actionRow('is-sun', 'sun', '太陽', () => lookAt('sun'));
  const moonRow = actionRow('is-moon', 'moon', '月', () => lookAt('moon'));
  const scopeRow = actionRow('is-scope', 'telescope', '望遠鏡で空を見る', () => openScope());
  scopeRow.detail.textContent = '地球を長押しした場所からも開けます';
  const visibility = element('p', { class: 'astro-note', role: 'status', 'aria-live': 'polite' });
  const eclipseList = element('div', { class: 'astro-eclipses', role: 'list', 'aria-label': '日食' });

  const body = element('div', { class: 'astro-body', id: 'astroBody' }, [
    element('div', { class: 'astro-clock' }, [playButton, when, nowChip, timeInput]),
    tape.root,
    element('div', { class: 'astro-speed' }, [element('span', { class: 'astro-label', text: '速さ' }), speedInput, speedText]),
    element('div', { class: 'astro-sky' }, [sunRow.row, moonRow.row]),
    visibility,
    element('div', { class: 'astro-field' }, [element('span', { class: 'astro-label', text: '太陽と月' }), sizeGroup]),
    element('div', { class: 'astro-field astro-field--stack' }, [element('span', { class: 'astro-label', text: '日食を再現' }), eclipseList]),
    scopeRow.row
  ]);
  chip.setAttribute('aria-controls', 'astroBody');

  const panel = element('section', { class: 'astro-panel', 'aria-label': '時刻と天体' }, [chip, body]);
  if (initiallyCollapsed) panel.classList.add('is-collapsed');

  // Telescope panel: pinch/wheel sets magnification on the canvas itself.
  const fovText = element('strong', { class: 'scope-fov' });
  const filterBox = element('input', { type: 'checkbox', checked: '', role: 'switch' });
  const scopeInfo = element('div', { class: 'astro-info scope-info', role: 'status', 'aria-live': 'polite' });
  const scopeSun = actionRow('is-sun', 'sun', '太陽を追う', () => scope.track('sun'));
  const scopeMoon = actionRow('is-moon', 'moon', '月を追う', () => scope.track('moon'));
  const sunrise = actionRow('is-rise', 'sun', '日の出を見る', () => watchSunEvent('rise'));
  const sunset = actionRow('is-set', 'sun', '日の入りを見る', () => watchSunEvent('set'));
  const scopePanel = element('section', { class: 'scope-panel', hidden: '', 'aria-label': '望遠鏡' }, [
    element('header', { class: 'scope-head' }, [
      element('div', {}, [element('span', { class: 'astro-label', text: '望遠鏡' }), fovText]),
      element('button', { type: 'button', 'aria-label': '望遠鏡を閉じる', class: 'scope-close', onClick: () => closeScope() }, [icon('close')])
    ]),
    element('p', { class: 'astro-note', text: 'ドラッグで向き、ピンチ・ホイールで倍率' }),
    element('div', { class: 'astro-sky' }, [scopeSun.row, scopeMoon.row, sunrise.row, sunset.row]),
    element('label', { class: 'astro-switch' }, [element('span', { text: '太陽フィルター' }), filterBox, element('i', { 'aria-hidden': 'true' })]),
    scopeInfo,
    element('p', { class: 'scope-warning', text: '実際の観測では、必ず日食グラスや太陽フィルターを使ってください。' })
  ]);
  stage.append(scopeCanvas, panel, scopePanel);

  const scope = createScope({ canvas: scopeCanvas, onChange: renderScopeInfo });

  // ---- behaviour -----------------------------------------------------------
  function setOpen(open) {
    panel.classList.toggle('is-collapsed', !open);
    chip.setAttribute('aria-expanded', String(open));
    chip.setAttribute('aria-label', open ? '時刻と天体を閉じる' : '時刻と天体を開く');
    if (open) { tape.draw(); scrollToNextEclipse(); }
  }

  function orbitParameters() {
    const bodies = bodySize !== 'off'; const large = bodySize === 'large';
    return { sunDirection: state.sunDirection, moonVector: state.moonVector, sunRadius: state.sunAngularRadius, gmstRadians: state.gmstDegrees * DEG, lighting, bodies, sunScale: large ? 6 : 1, moonScale: large ? 8 : 1 };
  }

  function renderInfo() {
    const date = new Date(time);
    const phase = moonPhase(state);
    dateText.textContent = formatDate(date);
    clockText.textContent = formatClock(date);
    chipTime.textContent = formatShort(date);
    nowChip.hidden = Math.abs(time - Date.now()) < 60000;
    sunRow.detail.textContent = `真上に来る場所 ${formatLatLon(state.subSolar.latitude, state.subSolar.longitude)}`;
    moonRow.detail.textContent = `${phaseName(phase)}・光る面 ${(phase.illuminatedFraction * 100).toFixed(0)}%`;
    visibility.textContent = bodyVisibility();
    tape.setTime(time);
  }

  // Say where the Sun and Moon are relative to the current view, so a body that
  // vanishes is explained: behind the globe, or outside the field of view.
  function bodyVisibility() {
    if (bodySize === 'off' || !state || scope.isOpen()) return '';
    try {
      const snapshot = renderer.getSnapshot();
      const camera = snapshot.camera;
      const view = snapshot.view;
      const c = geoToUnit(view.centerLongitude, view.centerLatitude);
      const forward = [-c[0], -c[1], -c[2]];
      const focal = (camera.viewport.physicalHeight / 2) / Math.tan(34 * DEG);
      const globeAngle = Math.atan((camera.scale * camera.viewport.dpr) / focal) / DEG;
      const aspect = camera.viewport.physicalWidth / camera.viewport.physicalHeight;
      const halfVertical = 34;
      const halfHorizontal = Math.atan(Math.tan(halfVertical * DEG) * aspect) / DEG;
      const describe = (direction, label) => {
        const angle = Math.acos(Math.max(-1, Math.min(1, dot(unit(direction), forward)))) / DEG;
        return angle < globeAngle || angle > Math.min(halfHorizontal, 90) ? label : '';
      };
      const moonFromCamera = [state.moonVector[0] - c[0] * 6, state.moonVector[1] - c[1] * 6, state.moonVector[2] - c[2] * 6];
      const hidden = [describe(state.sunDirection, '太陽'), describe(moonFromCamera, '月')].filter(Boolean);
      return hidden.length ? `${hidden.join('と')}はいまの画面に見えていません。行をタップでそちらを向きます` : '';
    } catch { return ''; }
  }

  function renderScopeInfo(snapshot) {
    if (!snapshot || !snapshot.open || !snapshot.observation) return;
    const o = snapshot.observation;
    const fov = snapshot.fov;
    fovText.textContent = fov >= 10 ? `視野 ${fov.toFixed(0)}°` : `視野 ${fov.toFixed(2)}°`;
    scopeSun.detail.textContent = o.sunAltitude < -1 ? '地平線の下' : `高度 ${o.sunAltitude.toFixed(1)}°${snapshot.tracking === 'sun' ? '・追尾中' : ''}`;
    scopeMoon.detail.textContent = o.moonAltitude < -1 ? '地平線の下' : `高度 ${o.moonAltitude.toFixed(1)}°${snapshot.tracking === 'moon' ? '・追尾中' : ''}`;
    scopeSun.row.classList.toggle('is-active', snapshot.tracking === 'sun');
    scopeMoon.row.classList.toggle('is-active', snapshot.tracking === 'moon');
    const parts = [
      `観測地点 ${formatLatLon(o.latitude, o.longitude)}`,
      o.obscuration > 0 ? `${KIND_LABEL[o.kind]}：食分 ${o.magnitude.toFixed(3)}、太陽の ${(o.obscuration * 100).toFixed(1)}% が隠れています` : 'いまは食になっていません'
    ];
    scopeInfo.replaceChildren(...parts.map((line) => element('div', { text: line })));
  }

  function apply() {
    state = celestialState(new Date(time));
    renderer.setAstronomy(orbitParameters());
    renderInfo();
    if (scope.isOpen()) scope.setState(state);
  }

  function setTime(next, { pause = false } = {}) {
    time = next;
    if (pause) setPlaying(false);
    apply();
  }

  function setPlaying(next) {
    playing = next;
    playButton.replaceChildren(icon(playing ? 'pause' : 'play'));
    playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
    panel.classList.toggle('is-playing', playing);
    lastFrame = 0;
    if (playing) requestAnimationFrame(tick);
  }

  function setSpeed(index) {
    speedIndex = clamp(index, 0, SPEEDS.length - 1);
    speedInput.value = String(speedIndex);
    speedText.textContent = SPEEDS[speedIndex].label;
    speedInput.setAttribute('aria-valuetext', SPEEDS[speedIndex].long);
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
    if (bodySize === 'off') setBodySize('large');
    const target = kind === 'sun' ? state.sunDirection : state.moonDirection;
    const center = centerAwayFrom(target, 155);
    renderer.setView({ centerLongitude: center.longitude, centerLatitude: center.latitude, zoom: 0.9 });
  }

  function setBodySize(value) {
    bodySize = value;
    for (const input of sizeGroup.querySelectorAll('input')) input.checked = input.value === value;
    apply();
  }

  function currentLocation() {
    const snapshot = renderer.getSnapshot();
    const picked = snapshot.selected;
    const center = picked?.center || picked?.cell?.center;
    if (center) return { latitude: center.latitude, longitude: center.longitude };
    return { latitude: snapshot.view.centerLatitude, longitude: snapshot.view.centerLongitude };
  }

  function openScope(location = currentLocation()) {
    stage.classList.add('is-scope');
    scopeCanvas.hidden = false;
    scopePanel.hidden = false;
    scope.open(location, state);
    scope.setFov(3);
    scopeCanvas.focus({ preventScroll: true });
  }

  function closeScope() {
    stage.classList.remove('is-scope');
    scopeCanvas.hidden = true;
    scopePanel.hidden = true;
    scope.close();
    renderInfo();
  }

  // Jump to a few minutes before the next sunrise / sunset at the observer and play it slowly.
  function watchSunEvent(kind) {
    const where = scope.getSnapshot().observer;
    const event = findSunEvent(new Date(time), where.latitude, where.longitude, kind);
    if (!event) { scopeInfo.replaceChildren(element('div', { text: '24時間以内に日の出・日の入りはありません（白夜・極夜）' })); return; }
    setSpeed(1);
    scope.setFilter(filterBox.checked);
    scope.track('sun');
    scope.setFov(28);
    setTime(event.getTime() - 4 * 60000);
    setPlaying(true);
  }

  function goToEclipse(entry) {
    const detail = findGreatestEclipse(entry.time, 30);
    if (bodySize === 'off') bodySize = 'large';
    setPlaying(false);
    time = entry.time.getTime();
    for (const input of sizeGroup.querySelectorAll('input')) input.checked = input.value === bodySize;
    apply();
    renderer.setView({ centerLongitude: detail.longitude, centerLatitude: detail.latitude, zoom: 1.35 });
    if (scope.isOpen()) { scope.setObserver({ latitude: detail.latitude, longitude: detail.longitude }); }
    for (const card of eclipseList.children) card.classList.toggle('is-active', card.dataset.index === String(eclipses.indexOf(entry)));
  }

  function scrollToNextEclipse() {
    const next = eclipses.findIndex((entry) => entry.time.getTime() >= time);
    const card = eclipseList.children[next];
    if (card) eclipseList.scrollLeft = card.offsetLeft - eclipseList.offsetLeft - 4;
  }

  when.addEventListener('click', () => {
    timeInput.value = toLocalInputValue(new Date(time));
    try { timeInput.showPicker(); } catch { timeInput.classList.add('is-visible'); timeInput.focus(); }
  });
  timeInput.addEventListener('change', () => {
    const parsed = new Date(timeInput.value);
    if (!Number.isNaN(parsed.getTime())) setTime(parsed.getTime(), { pause: true });
    timeInput.classList.remove('is-visible');
  });
  timeInput.addEventListener('blur', () => timeInput.classList.remove('is-visible'));
  playButton.addEventListener('click', () => setPlaying(!playing));
  speedInput.addEventListener('input', () => setSpeed(Number(speedInput.value)));
  sizeGroup.addEventListener('change', (event) => { if (event.target.name === 'astro-body-size') setBodySize(event.target.value); });
  filterBox.addEventListener('change', () => scope.setFilter(filterBox.checked));
  // The scope canvas is the pointer target while open; keep the orbit view's
  // gestures away from it.
  scopeCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
  stage.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (scope.isOpen()) closeScope(); else if (!panel.classList.contains('is-collapsed')) { setOpen(false); chip.focus(); }
  });

  // Eclipse cards, built lazily so they never delay the first frame.
  const buildEclipseList = () => {
    try {
      eclipses = listEclipses(new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2036, 11, 31)));
      const tokyo = { latitude: 35.68, longitude: 139.69 };
      eclipseList.append(...eclipses.map((entry, index) => {
        const japan = peakObscurationAt(entry.time, tokyo.latitude, tokyo.longitude);
        const note = japan > 0.02 ? `日本で${japan > 0.995 ? '皆既' : `${(japan * 100).toFixed(0)}%欠ける`}` : '';
        return element('button', { type: 'button', role: 'listitem', class: `eclipse-card is-${entry.kind}`, 'data-index': String(index), onClick: () => goToEclipse(entry) }, [
          element('span', { class: 'eclipse-card__kind', text: KIND_LABEL[entry.kind] }),
          element('strong', { text: `${entry.time.getFullYear()}/${entry.time.getMonth() + 1}/${entry.time.getDate()}` }),
          note ? element('small', { text: note }) : null
        ]);
      }));
      tape.setMarks(eclipses.map((entry) => ({ time: entry.time.getTime(), color: entry.kind === 'total' ? '#f4d45d' : entry.kind === 'annular' ? '#f0b26b' : '#7ccfe0' })));
      if (!panel.classList.contains('is-collapsed')) scrollToNextEclipse();
    } catch (error) { console.warn('Eclipse list unavailable', error); }
  };
  (typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 200))(buildEclipseList);

  setSpeed(0);
  apply();

  const api = Object.freeze({
    refreshView() { if (state) visibility.textContent = bodyVisibility(); },
    setTime, getTime: () => time, setPlaying, openScope, closeScope, goToEclipse, scope, setOpen,
    getState: () => state
  });
  globalThis.__PIXIEED_ASTRO__ = api;
  return api;
}
