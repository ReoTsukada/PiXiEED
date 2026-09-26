/**
 * Time, Sun/Moon and eclipse controls for the globe, plus the telescope view.
 *
 * The panel owns one piece of state, the simulated instant. Every change is
 * turned into a celestial state (astronomy.mjs) and pushed to the orbit
 * renderer (day/night shading, eclipse shadow, Sun and Moon in the sky) and,
 * when open, to the telescope canvas.
 */

import { celestialState, geoToUnit, unitToGeo, listEclipses, peakObscurationAt, moonPhase, findGreatestEclipse, findSunEvent } from './astronomy.mjs?v=20260921-astro-4';
import { createScope } from './scope.mjs?v=20260921-astro-4';

const DEG = Math.PI / 180;
const SPEEDS = [
  { value: 1, label: '×1 等速' }, { value: 10, label: '×10' }, { value: 60, label: '×60（1分/秒）' },
  { value: 600, label: '×600（10分/秒）' }, { value: 3600, label: '×3600（1時間/秒）' }, { value: 86400, label: '×86400（1日/秒）' }
];
const KIND_LABEL = { total: '皆既日食', annular: '金環日食', partial: '部分日食', none: '食なし' };

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function pad(value, length = 2) { return String(value).padStart(length, '0'); }

function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatLocal(date) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

export function initAstroUi({ renderer, stage, initiallyCollapsed = false }) {
  if (!renderer || !stage) return null;
  let time = Date.now();
  let speed = 1;
  let playing = false;
  const lighting = false; // the globe itself carries no day/night or eclipse shading
  let bodies = true;
  let enlarge = true;
  let lastFrame = 0;
  let state = null;
  let eclipses = [];

  // ---- DOM ---------------------------------------------------------------
  const scopeCanvas = element('canvas', { id: 'scopeCanvas', class: 'scope-canvas', hidden: '', tabindex: '0', 'aria-label': '望遠鏡ビュー。ドラッグで向きを変え、ホイールで倍率を変更' });
  const timeInput = element('input', { type: 'datetime-local', step: '1', 'aria-label': '日時（この端末の時刻）' });
  const utcText = element('span', { class: 'astro-utc' });
  const playButton = element('button', { type: 'button', class: 'astro-play', 'aria-label': '再生' }, [icon('play')]);
  const speedSelect = element('select', { 'aria-label': '時間の進む速さ' }, SPEEDS.map((s) => element('option', { value: String(s.value), text: s.label })));
  const eclipseSelect = element('select', { 'aria-label': '日食を選ぶ' }, [element('option', { value: '', text: '日食を選んで再現…' })]);
  const bodiesBox = element('input', { type: 'checkbox', checked: '' });
  const enlargeBox = element('input', { type: 'checkbox', checked: '' });
  const info = element('div', { class: 'astro-info', role: 'status', 'aria-live': 'polite' });
  const body = element('div', { class: 'astro-body' });

  const panel = element('section', { class: 'astro-panel', 'aria-label': '時刻と天体' }, [
    element('header', { class: 'astro-head' }, [
      element('button', { type: 'button', class: 'astro-collapse', 'aria-label': '時刻と天体を開閉', onClick: () => panel.classList.toggle('is-collapsed') }, [icon('celestial')])
    ]),
    body
  ]);
  if (initiallyCollapsed) {
    panel.classList.add('is-collapsed');
  }
  body.append(
    element('div', { class: 'astro-row' }, [timeInput, element('button', { type: 'button', class: 'astro-now', 'aria-label': '現在時刻', onClick: () => setTime(Date.now(), { pause: true }) }, [icon('now')])]),
    utcText,
    element('div', { class: 'astro-row' }, [
      element('button', { type: 'button', 'aria-label': '1時間戻す', onClick: () => setTime(time - 3600000) }, [icon('rewind')]),
      playButton,
      element('button', { type: 'button', 'aria-label': '1時間進める', onClick: () => setTime(time + 3600000) }, [icon('forward')]),
      speedSelect
    ]),
    eclipseSelect,
    element('label', { class: 'astro-check' }, [bodiesBox, element('span', { text: '太陽・月を表示' })]),
    element('label', { class: 'astro-check' }, [enlargeBox, element('span', { text: '太陽・月を大きく描く' })]),
    info,
    element('div', { class: 'astro-row astro-actions' }, [
      element('button', { type: 'button', 'aria-label': '太陽を見る', onClick: () => lookAt('sun') }, [icon('sun')]),
      element('button', { type: 'button', 'aria-label': '月を見る', onClick: () => lookAt('moon') }, [icon('moon')]),
      element('button', { type: 'button', class: 'astro-scope-open', 'aria-label': '望遠鏡で観測', onClick: () => openScope() }, [icon('telescope')])
    ])
  );

  // Telescope panel.
  const fovInput = element('input', { type: 'range', min: '-0.82', max: '2', step: '0.01', value: '0.48', 'aria-label': '視野（望遠倍率）' });
  const fovText = element('span', { class: 'scope-fov' });
  const filterBox = element('input', { type: 'checkbox', checked: '' });
  const scopeInfo = element('div', { class: 'astro-info scope-info', role: 'status', 'aria-live': 'polite' });
  const scopePanel = element('section', { class: 'scope-panel', hidden: '', 'aria-label': '望遠鏡' }, [
    element('header', { class: 'astro-head' }, [
      element('strong', { text: '望遠鏡ビュー' }),
      element('button', { type: 'button', 'aria-label': '望遠鏡を閉じる', class: 'scope-close', onClick: () => closeScope() }, [icon('close')])
    ]),
    element('label', { class: 'scope-fovrow' }, [element('span', { text: '倍率' }), fovInput, fovText]),
    element('label', { class: 'astro-check' }, [filterBox, element('span', { text: '太陽フィルター（皆既中は自動で外れます）' })]),
    element('div', { class: 'astro-row astro-actions' }, [
      element('button', { type: 'button', 'aria-label': '太陽へ向ける', onClick: () => scope.track('sun') }, [icon('sun')]),
      element('button', { type: 'button', 'aria-label': '月へ向ける', onClick: () => scope.track('moon') }, [icon('moon')]),
      element('button', { type: 'button', 'aria-label': '全天表示', onClick: () => { fovInput.value = '1.7'; scope.setFov(50); } }, [icon('globe')])
    ]),
    element('div', { class: 'astro-row astro-actions' }, [
      element('button', { type: 'button', 'aria-label': '日の出を見る', onClick: () => watchSunEvent('rise') }, [icon('sun')]),
      element('button', { type: 'button', 'aria-label': '日の入りを見る', onClick: () => watchSunEvent('set') }, [icon('sun')])
    ]),
    scopeInfo,
    element('p', { class: 'scope-warning', text: '実際の観測では、必ず日食グラスや太陽フィルターを使ってください。' })
  ]);
  stage.append(scopeCanvas, panel, scopePanel);

  const scope = createScope({ canvas: scopeCanvas, onChange: renderScopeInfo });

  // ---- behaviour -----------------------------------------------------------
  function orbitParameters() {
    return { sunDirection: state.sunDirection, moonVector: state.moonVector, sunRadius: state.sunAngularRadius, gmstRadians: state.gmstDegrees * DEG, lighting, bodies, sunScale: enlarge ? 6 : 1, moonScale: enlarge ? 8 : 1 };
  }

  function renderInfo() {
    const phase = moonPhase(state);
    const date = new Date(time);
    utcText.textContent = `UTC ${date.toISOString().slice(0, 19).replace('T', ' ')}`;
    const lines = [
      `太陽 直下点 ${formatLatLon(state.subSolar.latitude, state.subSolar.longitude)}`,
      `月 直下点 ${formatLatLon(state.subLunar.latitude, state.subLunar.longitude)}`,
      `月の形 ${phaseName(phase)}（照らされる割合 ${(phase.illuminatedFraction * 100).toFixed(0)}%）`
    ];
    lines.push(bodyVisibility());
    info.replaceChildren(...lines.filter(Boolean).map((line) => element('div', { text: line })));
  }

  // Say where the Sun and Moon are relative to the current view, so a body that
  // vanishes is explained: behind the globe, or outside the field of view.
  function bodyVisibility() {
    if (!bodies || !state || scope.isOpen()) return '';
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
        if (angle < globeAngle) return `${label}は地球の陰に隠れています`;
        if (angle > Math.min(halfHorizontal, 90)) return `${label}は視界の外です（「${label}を見る」で向きを合わせます）`;
        return '';
      };
      const moonFromCamera = [state.moonVector[0] - c[0] * 6, state.moonVector[1] - c[1] * 6, state.moonVector[2] - c[2] * 6];
      return [describe(moonFromCamera, '月'), describe(state.sunDirection, '太陽')].filter(Boolean).join(' / ');
    } catch { return ''; }
  }

  function renderScopeInfo(snapshot) {
    if (!snapshot || !snapshot.open || !snapshot.observation) return;
    const o = snapshot.observation;
    const parts = [
      `観測地点 ${formatLatLon(o.latitude, o.longitude)}`,
      `太陽 高度 ${o.sunAltitude.toFixed(1)}°  月 高度 ${o.moonAltitude.toFixed(1)}°`,
      o.obscuration > 0 ? `${KIND_LABEL[o.kind]}：食分 ${o.magnitude.toFixed(3)}、太陽の ${(o.obscuration * 100).toFixed(1)}% が隠れています` : 'いまは食になっていません',
    ].filter(Boolean);
    // Where are the Sun and Moon relative to the field of view?
    const aim = [Math.cos(snapshot.aim.altitude) * Math.sin(snapshot.aim.azimuth), Math.cos(snapshot.aim.altitude) * Math.cos(snapshot.aim.azimuth), Math.sin(snapshot.aim.altitude)];
    const halfField = snapshot.fov * 0.62;
    for (const [label, local, altitude] of [['太陽', o.sunLocal, o.sunAltitude], ['月', o.moonLocal, o.moonAltitude]]) {
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(local, aim)))) / DEG;
      if (altitude < -1) parts.push(`${label}は地平線の下です`);
      else if (angle > halfField) parts.push(`${label}は視野の外（中心から${angle.toFixed(angle < 10 ? 1 : 0)}°）。「${label}へ向ける」で追いかけます`);
    }
    scopeInfo.replaceChildren(...parts.filter(Boolean).map((line) => element('div', { text: line })));
    const fov = snapshot.fov;
    fovText.textContent = fov >= 10 ? `視野 ${fov.toFixed(0)}°` : `視野 ${fov.toFixed(2)}°`;
  }

  function apply() {
    state = celestialState(new Date(time));
    renderer.setAstronomy(orbitParameters());
    renderInfo();
    if (scope.isOpen()) scope.setState(state);
    const value = toLocalInputValue(new Date(time));
    if (document.activeElement !== timeInput) timeInput.value = value;
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
    lastFrame = 0;
    if (playing) requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!playing) return;
    if (lastFrame) time += (now - lastFrame) * speed;
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
    if (!bodiesBox.checked) { bodiesBox.checked = true; bodies = true; apply(); }
    const target = kind === 'sun' ? state.sunDirection : state.moonDirection;
    const center = centerAwayFrom(target, 155);
    renderer.setView({ centerLongitude: center.longitude, centerLatitude: center.latitude, zoom: 0.9 });
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
    fovInput.value = String(Math.log10(3));
    scopeCanvas.focus({ preventScroll: true });
  }

  function closeScope() {
    stage.classList.remove('is-scope');
    scopeCanvas.hidden = true;
    scopePanel.hidden = true;
    scope.close();
  }

  // Jump to a few minutes before the next sunrise / sunset at the observer and play it slowly.
  function watchSunEvent(kind) {
    const where = scope.getSnapshot().observer;
    const event = findSunEvent(new Date(time), where.latitude, where.longitude, kind);
    if (!event) { scopeInfo.replaceChildren(element('div', { text: '24時間以内に日の出・日の入りはありません（白夜・極夜）' })); return; }
    speed = 10;
    speedSelect.value = '10';
    scope.setFilter(filterBox.checked);
    scope.track('sun');
    scope.setFov(28);
    fovInput.value = String(Math.log10(28));
    setTime(event.getTime() - 4 * 60000);
    setPlaying(true);
  }

  function goToEclipse(entry) {
    const detail = findGreatestEclipse(entry.time, 30);
    bodies = true;
    bodiesBox.checked = true;
    setPlaying(false);
    time = entry.time.getTime();
    apply();
    renderer.setView({ centerLongitude: detail.longitude, centerLatitude: detail.latitude, zoom: 1.35 });
    if (scope.isOpen()) { scope.setObserver({ latitude: detail.latitude, longitude: detail.longitude }); }
    selectedEclipse = { ...entry, latitude: detail.latitude, longitude: detail.longitude };
  }
  let selectedEclipse = null;

  timeInput.addEventListener('change', () => {
    const parsed = new Date(timeInput.value);
    if (!Number.isNaN(parsed.getTime())) setTime(parsed.getTime(), { pause: true });
  });
  playButton.addEventListener('click', () => setPlaying(!playing));
  speedSelect.addEventListener('change', () => { speed = Number(speedSelect.value) || 1; });
  bodiesBox.addEventListener('change', () => { bodies = bodiesBox.checked; apply(); });
  enlargeBox.addEventListener('change', () => { enlarge = enlargeBox.checked; apply(); });
  eclipseSelect.addEventListener('change', () => {
    const entry = eclipses[Number(eclipseSelect.value)];
    if (entry) goToEclipse(entry);
  });
  fovInput.addEventListener('input', () => scope.setFov(10 ** Number(fovInput.value)));
  filterBox.addEventListener('change', () => scope.setFilter(filterBox.checked));
  scopeCanvas.addEventListener('wheel', () => { queueMicrotask(() => { const snapshot = scope.getSnapshot(); fovInput.value = String(Math.log10(snapshot.fov)); }); }, { passive: true });
  // The scope canvas is the pointer target while open; keep the orbit view's
  // gestures away from it.
  scopeCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

  // Eclipse list, built lazily so it never delays the first frame.
  const buildEclipseList = () => {
    try {
      eclipses = listEclipses(new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2036, 11, 31)));
      const tokyo = { latitude: 35.68, longitude: 139.69 };
      eclipseSelect.append(...eclipses.map((entry, index) => {
        const japan = peakObscurationAt(entry.time, tokyo.latitude, tokyo.longitude);
        const note = japan > 0.02 ? `　日本で${japan > 0.995 ? '皆既' : `部分食 ${(japan * 100).toFixed(0)}%`}` : '';
        return element('option', { value: String(index), text: `${formatLocal(entry.time)} ${KIND_LABEL[entry.kind]}${note}` });
      }));
    } catch (error) { console.warn('Eclipse list unavailable', error); }
  };
  (typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 200))(buildEclipseList);

  apply();

  const api = Object.freeze({
    refreshView() { if (state) renderInfo(); },
    setTime, getTime: () => time, setPlaying, openScope, closeScope, goToEclipse, scope,
    getState: () => state
  });
  globalThis.__PIXIEED_ASTRO__ = api;
  return api;
}
