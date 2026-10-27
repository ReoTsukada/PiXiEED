/** Public task guidance only: no file access, network, storage or advertising calls. */
const purposes = Object.freeze(['image', 'audio', 'video']);
const labels = Object.freeze({ image: '画像の変換', audio: '音声の変換', video: '動画に音楽' });
const mounted = new WeakMap();

export function purposeFromHash(hash = '') {
  return purposes.find(key => hash === `#output-purpose-${key}`) || null;
}

export function nextPurpose(current, key) {
  const index = Math.max(0, purposes.indexOf(current));
  if (key === 'Home') return purposes[0];
  if (key === 'End') return purposes.at(-1);
  if (key === 'ArrowRight') return purposes[(index + 1) % purposes.length];
  if (key === 'ArrowLeft') return purposes[(index + purposes.length - 1) % purposes.length];
  return null;
}

export function mountOutputGuideUI({ doc = globalThis.document, win = globalThis.window } = {}) {
  const root = doc?.querySelector?.('[data-output-guide-ui]');
  if (!root || !win) return null;
  if (mounted.has(root)) return mounted.get(root);
  const list = root.querySelector('[data-guide-purposes]');
  const status = root.querySelector('[data-guide-current]');
  const tabs = purposes.map(key => root.querySelector(`[data-guide-purpose="${key}"]`));
  const panels = purposes.map(key => root.querySelector(`[data-guide-panel="${key}"]`));
  if (!list || tabs.some(node => !node) || panels.some(node => !node)) return null;
  let selected = 'image';
  list.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
  });
  function select(key, focus = false) {
    if (!purposes.includes(key)) return;
    selected = key;
    tabs.forEach((tab, index) => {
      const active = purposes[index] === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[index].hidden = !active;
    });
    if (status) { status.hidden = false; status.textContent = `使い方：${labels[key]}`; }
    root.dataset.guideSelected = key;
    if (focus) tabs[purposes.indexOf(key)].focus({ preventScroll: true });
  }
  function revealDetails(id) {
    if (id !== 'guide-format-details') return;
    const details = doc.getElementById(id);
    if (details?.tagName === 'DETAILS') details.open = true;
  }
  function onHash() {
    const key = purposeFromHash(win.location.hash);
    if (key) select(key);
    else if (win.location.hash === '#guide-format-details') revealDetails('guide-format-details');
  }
  function onClick(event) {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const tab = event.target?.closest?.('[data-guide-purpose]');
    if (tabs.includes(tab)) {
      event.preventDefault();
      select(tab.dataset.guidePurpose);
      return;
    }
    const link = event.target?.closest?.('[data-guide-reveal]');
    if (link && root.contains(link)) revealDetails(link.dataset.guideReveal);
  }
  function onKey(event) {
    const tab = event.target?.closest?.('[data-guide-purpose]');
    if (!tabs.includes(tab) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ') { event.preventDefault(); select(tab.dataset.guidePurpose); return; }
    const next = nextPurpose(tab.dataset.guidePurpose, event.key);
    if (next) { event.preventDefault(); select(next, true); }
  }
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  win.addEventListener('hashchange', onHash);
  select(purposeFromHash(win.location.hash) || 'image');
  onHash();
  root.dataset.guideEnhanced = 'true';
  const result = { get selected() { return selected; }, select };
  mounted.set(root, result);
  return result;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mountOutputGuideUI();
