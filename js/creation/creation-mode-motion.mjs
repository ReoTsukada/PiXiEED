/** Decorative only: no project, input or media state belongs to a transition. */
export function mountCreationModeMotion({ board, main, scope }) {
  const doc = board.ownerDocument, view = doc.defaultView;
  const ns = 'http://www.w3.org/2000/svg';
  const overlay = doc.createElement('div');
  overlay.id = 'creation-mode-transition'; overlay.className = 'creation-mode-transition'; overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  // All marks are native vector geometry with explicit black fills. The SVG
  // stays transparent, so no curtain, tint, glow or colored flash can appear.
  overlay.innerHTML = `<svg data-motion-art viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <g data-motion-effect="draw" style="display:none;fill:#000;">
      <path data-ink d="M50 32 C56 31 58 37 63 39 C68 42 65 47 69 51 C71 56 63 57 61 62 C58 68 52 63 47 68 C42 71 39 64 35 62 C29 59 35 53 31 49 C28 44 37 42 39 38 C42 33 46 37 50 32 Z"/>
      <path data-splat d="M45 43 C48 39 53 41 54 45 C55 49 51 52 47 51 C43 50 42 46 45 43 Z"/>
      <path data-splat d="M50 45 C53 41 58 44 58 48 C58 51 55 53 52 52 C48 51 48 48 50 45 Z"/>
      <path data-splat d="M42 47 C44 44 48 46 48 49 C48 52 45 54 42 52 C40 51 40 49 42 47 Z"/>
      <path data-splat d="M55 44 C58 41 61 44 60 47 C60 50 56 50 55 48 C54 47 54 45 55 44 Z"/>
      <path data-splat d="M46 53 C48 50 51 52 50 55 C50 58 46 58 45 56 C44 55 45 54 46 53 Z"/>
    </g>
    <g data-motion-effect="audio" style="display:none;fill:#000;">
      <g data-note><path transform="translate(13 32)" d="M0 7 C0 3 9 0 14 2 L14 20 C14 25 3 27 0 23 C-3 20 2 16 9 16 L9 5 C5 5 2 6 0 7 Z"/></g>
      <g data-note><path transform="translate(40 18)" d="M0 8 C0 4 8 1 13 3 L13 20 C13 25 3 27 0 23 C-2 20 2 17 9 16 L9 6 C5 6 2 7 0 8 Z"/></g>
      <g data-note><path transform="translate(68 38)" d="M0 6 C0 2 9 0 15 1 L15 19 C15 24 4 27 0 23 C-3 19 3 16 10 16 L10 4 C6 4 2 5 0 6 Z"/></g>
      <g data-note><path transform="translate(36 64)" d="M0 8 C0 4 8 1 13 2 L13 20 C13 25 3 27 0 23 C-2 20 2 17 9 16 L9 6 C5 6 2 7 0 8 Z"/></g>
    </g>
    <g data-motion-effect="camera" style="display:none;fill:#000;">
      <g data-shutter><path d="M50 50 L8 -22 L92 -22 L80 8 Z"/></g>
      <g data-shutter><path d="M50 50 L8 -22 L92 -22 L80 8 Z" transform="rotate(60 50 50)"/></g>
      <g data-shutter><path d="M50 50 L8 -22 L92 -22 L80 8 Z" transform="rotate(120 50 50)"/></g>
      <g data-shutter><path d="M50 50 L8 -22 L92 -22 L80 8 Z" transform="rotate(180 50 50)"/></g>
      <g data-shutter><path d="M50 50 L8 -22 L92 -22 L80 8 Z" transform="rotate(240 50 50)"/></g>
      <g data-shutter><path d="M50 50 L8 -22 L92 -22 L80 8 Z" transform="rotate(300 50 50)"/></g>
      <circle data-aperture cx="50" cy="50" r="17"/>
    </g>
  </svg>`;
  const art = overlay.querySelector('[data-motion-art]');
  Object.assign(art.style, { position:'absolute', inset:'0', width:'100%', height:'100%', overflow:'visible', pointerEvents:'none' });
  for (const node of art.querySelectorAll('[data-ink],[data-splat],[data-note],[data-shutter],[data-aperture]')) Object.assign(node.style,{transformBox:'fill-box',transformOrigin:'center'});
  main.append(overlay);
  let epoch = 0, animations = [], settle = null;
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  function fit() {
    const r = board.getBoundingClientRect();
    Object.assign(overlay.style, { left:`${r.left}px`, top:`${r.top}px`, width:`${r.width}px`, height:`${r.height}px` });
  }
  const observer = new ResizeObserver(fit); observer.observe(board);
  scope.listen(view, 'resize', fit);
  function cancel() {
    epoch++;
    for (const animation of animations) animation.cancel();
    animations = []; settle?.(); settle = null;
    overlay.hidden = true; delete overlay.dataset.effect;
    for (const group of art.querySelectorAll('[data-motion-effect]')) group.style.display = 'none';
  }
  async function play(effect, entering) {
    cancel();
    if (scope.disposed || doc.hidden || reduced.matches || typeof art.animate !== 'function') return;
    const token = epoch; fit(); overlay.dataset.effect = effect; overlay.hidden = false;
    const duration = entering ? 170 : 110;
    const options = { duration, easing:'cubic-bezier(.22,.68,.18,1)', fill:'forwards' };
    const animate = (node, frames, extra = {}) => {
      const animation = node.animate(frames, { ...options, ...extra }); animations.push(animation);
      return animation.finished.catch(() => {});
    };
    const group = art.querySelector(`[data-motion-effect="${effect}"]`);
    if (!group) { cancel(); return; }
    group.style.display = 'inline';
    const jobs = [];
    if (effect === 'draw') {
      const ink = group.querySelector('[data-ink]');
      const splats = [...group.querySelectorAll('[data-splat]')];
      const inkFrames = entering
        ? [{ opacity:0, transform:'translateY(-18px) scale(.6,1.25)' }, { opacity:1, transform:'translateY(3px) scale(1.38,.58)', offset:.25 },
          { opacity:1, transform:'translateY(0px) scale(1.7,.86)', offset:.48 }, { opacity:.65, transform:'scale(1.94,.56)', offset:.72 },
          { opacity:0, transform:'scale(2.16,.3)' }]
        : [{ opacity:1, transform:'scale(.08,1.5)' }, { opacity:.9, transform:'scale(.7,.56)', offset:.31 },
          { opacity:.55, transform:'scale(1.3,1.12)', offset:.52 }, { opacity:0, transform:'scale(.02)' }];
      jobs.push(animate(ink, inkFrames));
      const vectors = [[-58,-27],[42,-51],[-28,53],[64,32],[-74,17]];
      splats.forEach((node, index) => {
        const [x,y] = vectors[index];
        const delay = entering ? 45 + index * 9 : 18 + index * 7;
        const frames = entering
          ? [{ opacity:0, transform:'scale(.08)' }, { opacity:.96, transform:'scale(.62)', offset:.24 },
            { opacity:.9, transform:`translate(${x*.42}px,${y*.42}px) scale(.92)`, offset:.54 },
            { opacity:0, transform:`translate(${x}px,${y}px) scale(.18)` }]
          : [{ opacity:0, transform:`translate(${x}px,${y}px) scale(.18)` },
            { opacity:.92, transform:`translate(${x*.42}px,${y*.42}px) scale(.8)`, offset:.42 },
            { opacity:0, transform:'scale(.06)' }];
        jobs.push(animate(node, frames, { delay, duration:duration-delay }));
      });
    } else if (effect === 'audio') {
      const trajectories = [[-42,-32],[-15,-48],[34,-24],[45,-49]];
      [...group.querySelectorAll('[data-note]')].forEach((node, index) => {
        const [x,y] = trajectories[index];
        const delay = entering ? index * 17 : (3 - index) * 13;
        const frames = entering
          ? [{ opacity:0, transform:'translate(0px,26px) rotate(-18deg) scale(.48)' },
            { opacity:1, transform:`translate(${x*.48}px,${y*.48}px) rotate(8deg) scale(1.04)`, offset:.46 },
            { opacity:.9, transform:`translate(${x*.7}px,${y*.7}px) rotate(-5deg) scale(.94)`, offset:.7 },
            { opacity:0, transform:`translate(${x}px,${y}px) rotate(14deg) scale(.42)` }]
          : [{ opacity:0, transform:`translate(${x}px,${y}px) rotate(14deg) scale(.42)` },
            { opacity:1, transform:`translate(${x*.35}px,${y*.35}px) rotate(-7deg) scale(1)`, offset:.5 },
            { opacity:0, transform:'translate(0px,20px) rotate(-22deg) scale(.5)' }];
        jobs.push(animate(node, frames, { delay, duration:duration-delay }));
      });
    } else if (effect === 'camera') {
      const blades = [...group.querySelectorAll('[data-shutter]')];
      const vectors = [[0,-54],[47,-27],[47,27],[0,54],[-47,27],[-47,-27]];
      blades.forEach((node, index) => {
        const [x,y] = vectors[index];
        const frames = entering
          ? [{ opacity:1, transform:'translate(0px,0px) scale(1)' }, { opacity:1, transform:`translate(${x*.32}px,${y*.32}px) scale(.94)`, offset:.34 },
            { opacity:.94, transform:`translate(${x*.82}px,${y*.82}px) scale(.72)`, offset:.72 },
            { opacity:0, transform:`translate(${x}px,${y}px) scale(.48)` }]
          : [{ opacity:0, transform:`translate(${x}px,${y}px) scale(.48)` },
            { opacity:.96, transform:`translate(${x*.68}px,${y*.68}px) scale(.74)`, offset:.52 },
            { opacity:1, transform:'translate(0px,0px) scale(1)' }];
        jobs.push(animate(node, frames, { delay:index * 4, duration:duration-index*4 }));
      });
      const aperture = group.querySelector('[data-aperture]');
      jobs.push(animate(aperture, entering
        ? [{ opacity:1, transform:'scale(1)' }, { opacity:1, transform:'scale(.48)', offset:.35 }, { opacity:0, transform:'scale(.02)' }]
        : [{ opacity:0, transform:'scale(.02)' }, { opacity:1, transform:'scale(.52)', offset:.56 }, { opacity:1, transform:'scale(1)' }], { easing:'cubic-bezier(.5,0,.75,.35)' }));
    }
    // A hidden tab or missing animation completion must never leave an input blocker.
    let timer;
    await Promise.race([Promise.all(jobs), new Promise(resolve => { settle = resolve; timer = view.setTimeout(resolve, duration + 100); })]);
    view.clearTimeout(timer);
    if (token !== epoch) return;
    settle = null;
    if (entering) cancel();
  }
  scope.listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  scope.listen(reduced, 'change', () => { if (reduced.matches) cancel(); });
  scope.listen(view, 'pagehide', cancel);
  scope.add(() => { cancel(); observer.disconnect(); overlay.remove(); });
  return { leave: from => play(from, false), enter: to => play(to, true), cancel };
}
