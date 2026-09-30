/**
 * The header's 特典 button: one ad = one hour, then it can be watched again.
 *
 *  data-state="ad"     gold coin that flips, a light sweep and twinkling pixels — 「1時間 / 広告を見る」
 *  data-state="free"   mint gift that hops — 「無料1時間 / タップで受取」
 *  data-state="active" pixel hourglass draining, 0:42, and a 12-pixel bar; red and blinking in the last 5 minutes
 *  data-state="pro"    Pro ∞
 * Transitions: into active → pop, the bar fills pixel by pixel, a pixel burst and 「+1時間」;
 * back to ad → the hourglass turns over and the button rings to say the next ad is ready.
 */
const HOUR_MS = 60 * 60 * 1000;
const CELLS = 12;
const LOW_MS = 5 * 60 * 1000;
const STAR = 'M4 0h2v2h2v2h2v2H8v2H6v2H4V8H2V6H0V4h2V2h2z';

export const passButtonMarkup = `<span class="pxb-icon" aria-hidden="true">
  <svg class="pxb-coin" viewBox="0 0 12 12" width="18" height="18" shape-rendering="crispEdges"><path class="pxb-coin-rim" d="M3 0h6v1h2v2h1v6h-1v2H9v1H3v-1H1V9H0V3h1V1h2z"/><path class="pxb-coin-face" d="M3 1h6v1h1v1h1v6h-1v1H9v1H3v-1H2V9H1V3h1V2h1z"/><path class="pxb-coin-star" transform="translate(1 1)" d="${STAR}"/></svg>
  <svg class="pxb-gift" viewBox="0 0 12 12" width="18" height="18" shape-rendering="crispEdges"><path class="pxb-gift-box" d="M1 5h10v7H1z"/><path class="pxb-gift-lid" d="M0 3h12v3H0z"/><path class="pxb-gift-ribbon" d="M5 3h2v9H5zM3 0h2v1h1v2H4V2H3zM7 0h2v2H8v1H6V1h1z"/></svg>
  <svg class="pxb-glass" viewBox="0 0 10 14" width="14" height="18" shape-rendering="crispEdges"><path class="pxb-glass-frame" d="M0 0h10v2H0zM0 12h10v2H0zM1 2h1v3h1v1h1v2H3v1H2v3H1zM8 2h1v10H8V9H7V8H6V6h1V5h1z"/><rect class="pxb-sand-top" x="2" y="2" width="6" height="3"/><rect class="pxb-sand-bottom" x="2" y="9" width="6" height="3"/><rect class="pxb-sand-drop" x="4.5" y="6" width="1" height="1"/></svg>
</span>
<span class="pxb-text"><b class="pxb-main" data-header-pass-label>1時間</b><small class="pxb-sub">広告を見る</small></span>
<span class="pxb-bar" aria-hidden="true">${Array.from({ length: CELLS }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>
<span class="pxb-shine" aria-hidden="true"></span>
<span class="pxb-sparks" aria-hidden="true"><i></i><i></i><i></i></span>`;

export function hasPassButtonMarkup(button) {
  return Boolean(button.querySelector('.pxb-bar') && button.querySelectorAll('.pxb-bar i').length === CELLS && button.querySelector('.pxb-glass'));
}

function clock(ms) {
  const minutes = Math.ceil(ms / 60000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Pure view model. */
export function passButtonView({ remainingMs = 0, pro = false, freeReady = false }) {
  if (pro) return { state: 'pro', main: 'Pro', sub: '∞', lit: CELLS, low: false, fraction: 1 };
  const left = Math.max(0, Number(remainingMs) || 0);
  if (left > 0) {
    const fraction = Math.min(1, left / HOUR_MS);
    return { state: 'active', main: clock(left), sub: '残り', lit: Math.max(1, Math.ceil(fraction * CELLS)), low: left <= LOW_MS, fraction };
  }
  return freeReady
    ? { state: 'free', main: '無料1時間', sub: 'タップで受取', lit: 0, low: false, fraction: 0 }
    : { state: 'ad', main: '1時間', sub: '広告を見る', lit: 0, low: false, fraction: 0 };
}

const set = (el, key, value) => { const text = String(value); if (el.dataset[key] !== text) el.dataset[key] = text; };
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
const previous = new WeakMap();
const fxTimers = new WeakMap();
const reduced = () => document.documentElement.dataset.pixieedMotion === 'reduced'
  || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function renderPassButton(button, input) {
  const view = passButtonView(input);
  set(button, 'state', view.state);
  set(button, 'low', view.low);
  setText(button.querySelector('.pxb-main'), view.main);
  setText(button.querySelector('.pxb-sub'), view.sub);
  button.querySelectorAll('.pxb-bar i').forEach((cell, index) => {
    set(cell, 'on', index < view.lit);
    set(cell, 'edge', index === view.lit - 1 && view.state === 'active');
  });
  // hourglass: sand moves from top to bottom as the hour runs out
  const top = Math.round(view.fraction * 3); const bottom = 3 - top;
  const sandTop = button.querySelector('.pxb-sand-top'); const sandBottom = button.querySelector('.pxb-sand-bottom');
  if (sandTop) { sandTop.setAttribute('y', String(5 - top)); sandTop.setAttribute('height', String(top)); }
  if (sandBottom) { sandBottom.setAttribute('y', String(12 - bottom)); sandBottom.setAttribute('height', String(bottom)); }

  const before = previous.get(button);
  previous.set(button, view.state);
  if (!before || before === view.state || document.visibilityState === 'hidden' || reduced()) return view;
  if (view.state === 'active' && (before === 'ad' || before === 'free')) celebrate(button);
  else if ((view.state === 'ad' || view.state === 'free') && before === 'active') effect(button, 'ready', 1400);
  return view;
}

function effect(button, kind, ms) {
  window.clearTimeout(fxTimers.get(button));
  delete button.dataset.fx;
  void button.offsetWidth; // restart the CSS animation
  button.dataset.fx = kind;
  fxTimers.set(button, window.setTimeout(() => { delete button.dataset.fx; }, ms));
}

const BURST_COLORS = ['#ffd35a', '#ffb13b', '#fff3b0', '#ff7a59', '#7fd6a4', '#ffffff'];
function celebrate(button) {
  effect(button, 'grant', 1100);
  const box = button.getBoundingClientRect();
  if (!box.width) return;
  const layer = document.createElement('div');
  layer.className = 'pxb-burst';
  layer.style.cssText = `left:${box.left + box.width / 2}px;top:${box.top + box.height / 2}px`;
  document.body.append(layer);
  const pieces = [];
  for (let i = 0; i < 18; i += 1) {
    const dot = document.createElement('i');
    const size = i % 3 === 0 ? 6 : 4;
    dot.style.cssText = `width:${size}px;height:${size}px;background:${BURST_COLORS[i % BURST_COLORS.length]}`;
    layer.append(dot);
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const reach = 34 + Math.random() * 30;
    const dx = Math.round(Math.cos(angle) * reach); const dy = Math.round(Math.sin(angle) * reach * 0.7);
    pieces.push(dot.animate([
      { transform: 'translate(-50%,-50%) translate(0,0)', opacity: 1 },
      { transform: `translate(-50%,-50%) translate(${dx}px,${dy - 10}px)`, opacity: 1, offset: 0.55 },
      { transform: `translate(-50%,-50%) translate(${Math.round(dx * 1.15)}px,${dy + 18}px)`, opacity: 0 }
    ], { duration: 700 + Math.random() * 250, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }));
  }
  const plus = document.createElement('b');
  plus.textContent = '+1時間';
  layer.append(plus);
  pieces.push(plus.animate([
    { transform: 'translate(-50%,-50%) translateY(14px) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%,-50%) translateY(40px) scale(1.12)', opacity: 1, offset: 0.3 },
    { transform: 'translate(-50%,-50%) translateY(36px) scale(1)', opacity: 1, offset: 0.75 },
    { transform: 'translate(-50%,-50%) translateY(44px) scale(1)', opacity: 0 }
  ], { duration: 1300, easing: 'ease-out', fill: 'forwards' }));
  Promise.allSettled(pieces.map((a) => a.finished)).then(() => layer.remove());
}
