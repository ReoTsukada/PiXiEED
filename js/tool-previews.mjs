import { createVisibleAnimationScheduler } from './home-animation.mjs?rev=20260929-hero-smooth-1';
import { createToolToys, TOOL_TOY_NAMES, TOOL_TOY_SIZE } from './tool-toys.mjs?rev=20260929-shared-toys-2';

export const TOOL_PREVIEW_SIZE = TOOL_TOY_SIZE;
export const TOOL_PREVIEW_SCENES = TOOL_TOY_NAMES;

export function mountToolPreviews(root = document) {
  const canvases = [...root.querySelectorAll('canvas[data-tool-preview]')];
  const scheduler = createVisibleAnimationScheduler(globalThis);
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = Boolean(motionPreference?.matches) || document.documentElement.dataset.pixieedMotion === 'reduced';
  scheduler.setReducedMotion(reduced);

  const animations = new Set();
  const resizeObservers = new Map();
  const cards = new Set();
  const animate = (element, draw) => {
    const entry = { element, draw, stop: null };
    animations.add(entry);
    draw(reduced ? 4000 : performance.now());
    if (!reduced) entry.stop = scheduler.add(element, draw, { fps: 8 });
    return () => { if (reduced) draw(performance.now()); else scheduler.redraw(element); };
  };
  const toys = createToolToys({ note: () => {}, animate, interactive: false });

  for (const canvas of canvases) {
    canvas.width = TOOL_TOY_SIZE;
    canvas.height = TOOL_TOY_SIZE;
    canvas.style.imageRendering = 'pixelated';
    const frame = canvas.closest('.hp-view') || canvas.parentElement;
    const sizeToFrame = () => {
      const available = Math.min(frame?.clientWidth || 120, frame?.clientHeight || 120);
      const scale = Math.max(1, Math.min(6, Math.floor(available / TOOL_TOY_SIZE)));
      canvas.style.width = `${TOOL_TOY_SIZE * scale}px`;
      canvas.style.height = `${TOOL_TOY_SIZE * scale}px`;
    };
    sizeToFrame();
    if (frame && typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(sizeToFrame);
      observer.observe(frame);
      resizeObservers.set(canvas, observer);
    }
    const card = canvas.closest('.hp-toy, .tool-card');
    const toyName = canvas.dataset.toolPreview;
    if (!TOOL_TOY_NAMES.includes(toyName) || !card) continue;
    cards.add(card);
    try { toys[toyName](card); }
    catch (error) { console.warn('tool preview', toyName, error); }
  }

  const reveal = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      reveal.unobserve(entry.target);
    }
  }, { threshold: 0.2 }) : null;
  for (const card of cards) {
    if (reveal) reveal.observe(card);
    else card.classList.add('is-in');
  }

  const updateMotion = (event) => {
    reduced = Boolean(event?.matches || motionPreference?.matches) || document.documentElement.dataset.pixieedMotion === 'reduced';
    scheduler.setReducedMotion(reduced);
    for (const entry of animations) {
      entry.stop?.();
      entry.stop = reduced ? null : scheduler.add(entry.element, entry.draw, { fps: 8 });
      if (reduced) entry.draw(4000);
    }
  };
  const motionObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => updateMotion()) : null;
  motionObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pixieed-motion'] });
  motionPreference?.addEventListener?.('change', updateMotion);
  return () => {
    motionObserver?.disconnect();
    motionPreference?.removeEventListener?.('change', updateMotion);
    reveal?.disconnect();
    for (const observer of resizeObservers.values()) observer.disconnect();
    scheduler.dispose();
  };
}

if (typeof document !== 'undefined') mountToolPreviews(document);
