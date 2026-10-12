/** Decorative only: project, input, and media state stay in the mode controller. */
export function mountCreationModeMotion({ board, main, scope }) {
  const doc = board.ownerDocument, view = doc.defaultView;
  const overlay = doc.createElement('div');
  overlay.id = 'creation-mode-transition';
  overlay.className = 'creation-mode-transition';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  doc.body.append(overlay);

  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let epoch = 0, animations = [], activeTimer = null, pendingWake = null, phase = '';

  function stopAnimations() {
    for (const animation of animations) animation.cancel();
    animations = [];
  }

  function wakePending() {
    const wake = pendingWake;
    pendingWake = null;
    wake?.();
  }

  function clearTimer() {
    if (activeTimer !== null) view.clearTimeout(activeTimer);
    activeTimer = null;
  }

  function clearOverlay() {
    stopAnimations();
    clearTimer();
    overlay.hidden = true;
    overlay.replaceChildren();
    overlay.removeAttribute('data-effect');
    overlay.removeAttribute('data-phase');
    overlay.style.backgroundColor = '';
    overlay.style.opacity = '';
    phase = '';
  }

  function cancel() {
    epoch++;
    stopAnimations();
    clearTimer();
    wakePending();
    clearOverlay();
  }

  function waitFor(promise, timeout) {
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimer();
        if (pendingWake === finish) pendingWake = null;
        resolve();
      };
      pendingWake = finish;
      activeTimer = view.setTimeout(finish, timeout);
      if (promise) Promise.resolve(promise).then(finish, finish);
    });
  }

  function buildTiles(columns = 12, rows = 12) {
    const grid = doc.createElement('div');
    grid.className = 'creation-mode-transition__tiles';
    grid.dataset.motionEffect = 'draw';
    grid.style.setProperty('--tile-columns', columns);
    grid.style.setProperty('--tile-rows', rows);
    const tiles = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const tile = doc.createElement('i');
      tile.setAttribute('aria-hidden', 'true');
      tile.style.transform = 'scale(0)';
      tile.style.opacity = '0';
      tiles.push({ node: tile, x, y });
      grid.append(tile);
    }
    overlay.append(grid);
    return tiles;
  }

  function buildBars(count = 16) {
    const row = doc.createElement('div');
    row.className = 'creation-mode-transition__bars';
    row.dataset.motionEffect = 'audio';
    row.style.setProperty('--bar-count', count);
    const bars = [];
    for (let index = 0; index < count; index++) {
      const bar = doc.createElement('i');
      bar.setAttribute('aria-hidden', 'true');
      bar.style.transform = 'scaleY(0)';
      bar.style.opacity = '0';
      row.append(bar);
      bars.push({ node: bar, index });
    }
    overlay.append(row);
    return bars;
  }

  function buildIris() {
    const iris = doc.createElement('div');
    iris.className = 'creation-mode-transition__iris';
    iris.dataset.motionEffect = 'camera';
    iris.style.clipPath = 'circle(0% at 50% 50%)';
    overlay.append(iris);
    return iris;
  }

  function animate(node, frames, { duration, delay = 0, easing = 'cubic-bezier(.22,.68,.18,1)' }) {
    if (typeof node.animate !== 'function') return Promise.resolve();
    const animation = node.animate(frames, { duration, delay, easing, fill: 'forwards' });
    animations.push(animation);
    return animation.finished.catch(() => {});
  }

  function makeBlack(effect) {
    stopAnimations();
    overlay.replaceChildren();
    overlay.style.backgroundColor = '#000';
    overlay.style.opacity = '1';
    overlay.dataset.effect = effect;
    overlay.dataset.phase = 'black';
    phase = 'black';
  }

  async function leave(effect) {
    cancel();
    if (scope.disposed || doc.hidden) return;
    const token = epoch;
    overlay.hidden = false;
    overlay.dataset.effect = effect;
    overlay.dataset.phase = 'out';
    overlay.style.backgroundColor = 'transparent';
    overlay.style.opacity = '1';
    phase = 'out';

    let jobs = [], duration = 0;
    if (reducedMotion.matches || typeof doc.createElement('i').animate !== 'function') {
      overlay.style.backgroundColor = '#000';
      await waitFor(null, 80);
    } else if (effect === 'draw') {
      const tiles = buildTiles();
      duration = 270;
      for (const { node, x, y } of tiles) {
        const dx = (x + 0.5) / 12 - 0.5, dy = (y + 0.5) / 12 - 0.5;
        const distance = Math.hypot(dx, dy) / Math.SQRT1_2;
        const delay = Math.round(distance * 135) + ((x * 7 + y * 11) % 4) * 5;
        jobs.push(animate(node, [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.18)', opacity: 1 }
        ], { duration, delay, easing: 'cubic-bezier(.18,.7,.16,1)' }));
      }
      await waitFor(Promise.all(jobs), duration + 190);
    } else if (effect === 'audio') {
      const bars = buildBars();
      duration = 245;
      for (const { node, index } of bars) {
        const beat = Math.floor(index / 4), withinBeat = index % 4;
        const delay = beat * 38 + withinBeat * 18;
        const origin = index % 2 ? 'bottom' : 'top';
        node.style.transformOrigin = origin;
        jobs.push(animate(node, [
          { transform: 'scaleY(0)', opacity: 0 },
          { transform: 'scaleY(1)', opacity: 1 }
        ], { duration, delay, easing: 'cubic-bezier(.3,.7,.2,1)' }));
      }
      await waitFor(Promise.all(jobs), duration + 190);
    } else if (effect === 'camera') {
      const iris = buildIris();
      duration = 300;
      jobs.push(animate(iris, [
        { clipPath: 'circle(0% at 50% 50%)' },
        { clipPath: 'circle(155% at 50% 50%)' }
      ], { duration, easing: 'cubic-bezier(.65,0,.35,1)' }));
      await waitFor(Promise.all(jobs), duration + 120);
    } else {
      overlay.style.backgroundColor = '#000';
    }

    if (token !== epoch || scope.disposed) return;
    makeBlack(effect);
    // The viewport remains opaque black until the controller has completed
    // project saving and any lazy mode loader, then calls enter().
    await waitFor(null, 150);
  }

  async function enter(effect) {
    if (scope.disposed || doc.hidden) { cancel(); return; }
    const token = epoch;
    overlay.hidden = false;
    overlay.dataset.effect = effect;
    overlay.dataset.phase = 'in';
    phase = 'in';
    overlay.style.backgroundColor = 'transparent';
    overlay.style.opacity = '1';

    if (reducedMotion.matches || typeof doc.createElement('i').animate !== 'function') {
      overlay.style.backgroundColor = '#000';
      const fade = animate(overlay, [ { opacity: 1 }, { opacity: 0 } ], { duration: 95 });
      await waitFor(fade, 190);
      if (token === epoch) clearOverlay();
      return;
    }

    let jobs = [], duration = 0;
    if (effect === 'draw') {
      const tiles = buildTiles();
      // Rebuild in a fully covered state before the first reveal frame.
      for (const { node } of tiles) { node.style.transform = 'scale(1.18)'; node.style.opacity = '1'; }
      duration = 285;
      for (const { node, x, y } of tiles) {
        const dx = (x + 0.5) / 12 - 0.5, dy = (y + 0.5) / 12 - 0.5;
        const distance = Math.hypot(dx, dy) / Math.SQRT1_2;
        const delay = Math.round(distance * 120) + ((x * 5 + y * 13) % 4) * 5;
        jobs.push(animate(node, [
          { transform: 'scale(1.18)', opacity: 1 },
          { transform: 'scale(0)', opacity: 0 }
        ], { duration, delay, easing: 'cubic-bezier(.4,0,.7,.35)' }));
      }
    } else if (effect === 'audio') {
      const bars = buildBars();
      for (const { node, index } of bars) {
        node.style.transform = 'scaleY(1)';
        node.style.opacity = '1';
        node.style.transformOrigin = index % 2 ? 'top' : 'bottom';
      }
      duration = 245;
      for (const { node, index } of bars) {
        const beat = Math.floor((15 - index) / 4), withinBeat = (15 - index) % 4;
        const delay = beat * 38 + withinBeat * 18;
        jobs.push(animate(node, [
          { transform: 'scaleY(1)', opacity: 1 },
          { transform: 'scaleY(0)', opacity: 0 }
        ], { duration, delay, easing: 'cubic-bezier(.4,0,.7,.35)' }));
      }
    } else if (effect === 'camera') {
      const iris = buildIris();
      iris.style.clipPath = 'circle(155% at 50% 50%)';
      duration = 300;
      jobs.push(animate(iris, [
        { clipPath: 'circle(155% at 50% 50%)' },
        { clipPath: 'circle(0% at 50% 50%)' }
      ], { duration, easing: 'cubic-bezier(.65,0,.35,1)' }));
    }
    await waitFor(Promise.all(jobs), duration + 190);
    if (token === epoch) clearOverlay();
  }

  function onReducedMotionChange() {
    if (!reducedMotion.matches) return;
    if (phase === 'out') {
      stopAnimations();
      overlay.replaceChildren();
      overlay.style.backgroundColor = '#000';
      overlay.style.opacity = '1';
      // Resolve the decorative close early; leave() proceeds into its 150ms
      // opaque-black hold before the mode controller can reveal anything.
      wakePending();
    } else if (phase === 'in') {
      epoch++;
      const token = epoch;
      stopAnimations();
      clearTimer();
      wakePending();
      overlay.replaceChildren();
      overlay.style.backgroundColor = '#000';
      overlay.style.opacity = '1';
      overlay.dataset.phase = 'in';
      phase = 'in';
      void (async () => {
        const fade = animate(overlay, [ { opacity: 1 }, { opacity: 0 } ], { duration: 95 });
        await waitFor(fade, 190);
        if (token === epoch) clearOverlay();
      })();
    }
  }

  scope.listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  scope.listen(view, 'pagehide', cancel);
  scope.listen(reducedMotion, 'change', onReducedMotionChange);
  scope.add(() => { cancel(); overlay.remove(); });
  return { leave, enter, cancel };
}
