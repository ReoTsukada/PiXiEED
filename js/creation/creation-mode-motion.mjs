/** Decorative only: keep the live artwork and shell visible throughout loading. */
export function mountCreationModeMotion({ board, main, scope }) {
  const doc = board.ownerDocument, view = doc.defaultView;
  const cue = doc.createElement('div');
  cue.id = 'creation-mode-transition';
  cue.className = 'creation-mode-transition';
  cue.hidden = true;
  cue.setAttribute('aria-hidden', 'true');
  const icon = doc.createElement('span'), label = doc.createElement('span');
  icon.className = 'creation-mode-transition__icon';
  for (let i = 0; i < 4; i++) icon.append(doc.createElement('i'));
  cue.append(icon, label);
  doc.body.append(cue);

  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const names = { draw: '描画', audio: '音楽', camera: 'カメラ' };
  let epoch = 0, animations = [], activeTimer = null, pendingWake = null;
  let previousRect = null, previousMode = null;
  const canAnimate = () => !reducedMotion.matches && typeof cue.animate === 'function';

  function stopAnimations() {
    for (const animation of animations) animation.cancel();
    animations = [];
    delete board.dataset.creationModeMotion;
  }
  function wakePending() {
    if (activeTimer !== null) view.clearTimeout(activeTimer);
    activeTimer = null;
    const wake = pendingWake; pendingWake = null; wake?.();
  }
  function clearCue() {
    cue.hidden = true;
    cue.removeAttribute('data-effect'); cue.removeAttribute('data-phase');
  }
  function cancel() {
    epoch++; stopAnimations(); wakePending(); clearCue();
    previousRect = null; previousMode = null;
  }
  function animate(node, frames, options) {
    if (typeof node?.animate !== 'function') return Promise.resolve();
    const animation = node.animate(frames, { easing: 'cubic-bezier(.22,.68,.18,1)', fill: 'both', ...options });
    animations.push(animation);
    return animation.finished.catch(() => {});
  }
  function waitFor(jobs, timeout) {
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (pendingWake === finish) {
          pendingWake = null;
          if (activeTimer !== null) view.clearTimeout(activeTimer);
          activeTimer = null;
        }
        resolve();
      };
      pendingWake = finish;
      activeTimer = view.setTimeout(finish, timeout);
      Promise.all(jobs).then(finish, finish);
    });
  }

  function leave(effect, next = effect) {
    cancel();
    if (scope.disposed || doc.hidden) return;
    previousMode = effect;
    previousRect = board.getBoundingClientRect();
    cue.dataset.effect = next;
    cue.dataset.phase = 'loading';
    label.textContent = `${names[next] || ''}へ切替中`;
    cue.hidden = false;
    // Loading never hides the current mode, blocks on decoration, or flashes black.
    if (canAnimate()) animate(cue, [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 160 });
  }

  async function enter(effect) {
    if (scope.disposed || doc.hidden) { cancel(); return; }
    const token = epoch;
    // Let the retained desktop layout's MutationObserver move its controls before
    // measuring. This microtask completes before paint, unlike a delayed RAF.
    await Promise.resolve();
    if (token !== epoch || scope.disposed || doc.hidden) return;
    stopAnimations();
    cue.dataset.effect = effect;
    cue.dataset.phase = 'in';
    label.textContent = `${names[effect] || ''}モード`;
    if (!canAnimate()) { clearCue(); previousRect = null; previousMode = null; return; }
    const jobs = [];
    // FLIP the same board, not a screenshot or a replacement canvas. Artwork and
    // editor history remain owned by Draw. Camera's fixed preview is not scaled.
    if (previousRect && previousMode !== 'camera' && effect !== 'camera') {
      const rect = board.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && previousRect.width > 0 && previousRect.height > 0) {
        board.dataset.creationModeMotion = 'true';
        const x = previousRect.left - rect.left, y = previousRect.top - rect.top;
        const sx = previousRect.width / rect.width, sy = previousRect.height / rect.height;
        jobs.push(animate(board, [
          { transformOrigin: '0 0', transform: `translate(${x}px,${y}px) scale(${sx},${sy})` },
          { transformOrigin: '0 0', transform: 'translate(0,0) scale(1,1)' }
        ], { duration: 280 }));
      }
    }
    const controls = main.querySelector('.draw-control-dock');
    if (controls) jobs.push(animate(controls, [
      { opacity: .65, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 240 }));
    for (const [index, node] of [...icon.children].entries()) jobs.push(animate(node, [
      { transform: effect === 'audio' ? 'scaleY(.35)' : 'scale(.65)', opacity: .45 },
      { transform: 'scale(1)', opacity: 1, offset: .45 },
      { transform: 'scale(1)', opacity: 0 }
    ], { duration: 260, delay: index * 25 }));
    jobs.push(animate(cue, [ { opacity: 1 }, { opacity: 1, offset: .6 }, { opacity: 0 } ], { duration: 360 }));
    await waitFor(jobs, 480);
    if (token === epoch) { stopAnimations(); clearCue(); previousRect = null; previousMode = null; }
  }

  scope.listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  scope.listen(view, 'pagehide', cancel);
  scope.listen(view, 'resize', cancel, { passive: true });
  scope.listen(reducedMotion, 'change', () => {
    if (!reducedMotion.matches) return;
    stopAnimations(); wakePending();
    if (cue.dataset.phase === 'in') clearCue();
  });
  scope.add(() => { cancel(); cue.remove(); });
  return { leave, enter, cancel };
}
