/**
 * Ordinary display-ad gates and renderer. There is deliberately no provider
 * implementation here: live requests remain off until an operator confirms
 * a compatible active unit and injects an approved provider adapter.
 */
export const ORDINARY_ADS_LIVE_ENABLED = false;
export const ORDINARY_AD_METRICS = Object.freeze({
  maxWidth: 300,
  contentGap: 48,
  viewportGap: 24,
  safeObstacleGap: 48,
  inlineMinimumPosts: 24,
  gutterLabelHeight: 24,
  gutterUnitHeight: 600,
  minGutterViewportHeight: 672,
});

const VALID_SLOT = /^\d{6,20}$/;
const VALID_CLIENT = /^ca-pub-\d{16}$/;
const activatedCards = new WeakSet();

/** One provider attempt maximum for a feed/page lifetime, including remounts. */
export function createOrdinaryAdPageGate() {
  let attemptedAnchorId = null;
  return Object.freeze({
    get attempted() { return attemptedAnchorId !== null; },
    get attemptedAnchorId() { return attemptedAnchorId; },
    canAttempt(anchorId) { return attemptedAnchorId === null || attemptedAnchorId === anchorId; },
    markAttempt(anchorId) {
      if (attemptedAnchorId !== null || typeof anchorId !== 'string' || !anchorId) return false;
      attemptedAnchorId = anchorId;
      return true;
    },
  });
}

export function ordinaryAdUnitIsConfigured(unit) {
  return Boolean(unit && unit.verifiedActive === true
    && unit.format === 'display'
    && (unit.placement === 'inline' && unit.size === 'responsive'
      || unit.placement === 'gutter' && Number.isInteger(unit.size?.width)
        && unit.size.width >= 160 && unit.size.width <= ORDINARY_AD_METRICS.maxWidth
        && unit.size.height === ORDINARY_AD_METRICS.gutterUnitHeight)
    && VALID_CLIENT.test(unit.client || '')
    && VALID_SLOT.test(String(unit.slot || '').trim()));
}

/** Fail closed unless every caller-owned context gate is explicitly true. */
export function ordinaryAdEligibility({
  enabled = ORDINARY_ADS_LIVE_ENABLED,
  provider,
  unit,
  productionOrigin = false,
  topLevel = false,
  desktop = false,
  viewportWidth = 0,
  viewportHeight = 0,
  gutterFits = false,
  fullscreen = false,
  editor = false,
  publicFeed = false,
  placement = 'inline',
  contentReady = false,
  feedReady = false,
  partialWarning = true,
  loading = true,
  empty = true,
  privateView = true,
  composerOpen = true,
  detailOpen = true,
  trustedContentEligible = false,
  eligiblePostCount = 0,
} = {}) {
  if (enabled !== true || productionOrigin !== true || typeof provider !== 'function' || !ordinaryAdUnitIsConfigured(unit)) return false;
  if (unit.placement !== placement) return false;
  if (topLevel !== true || fullscreen || editor || viewportWidth <= 0) return false;
  if (privateView || composerOpen || detailOpen || loading || empty || partialWarning) return false;
  if (placement === 'gutter' && desktop && viewportWidth > 1190
      && viewportHeight >= ORDINARY_AD_METRICS.minGutterViewportHeight
      && gutterFits === true && contentReady) return true;
  if (placement === 'inline' && publicFeed && viewportWidth >= 320 && feedReady
      && trustedContentEligible && eligiblePostCount >= ORDINARY_AD_METRICS.inlineMinimumPosts) return true;
  return false;
}

function validRect(rect) {
  return rect && ['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(rect[key]))
    && rect.right > rect.left && rect.bottom > rect.top;
}

function visiblyMounted(card) {
  if (card?.isConnected !== true || typeof card.getClientRects !== 'function'
      || card.getClientRects().length === 0 || typeof card.getBoundingClientRect !== 'function') return false;
  const rect = card.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return false;
  const style = card.ownerDocument?.defaultView?.getComputedStyle?.(card);
  return !style || (style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility));
}

/** Return one ≤300px gutter rectangle, or null when geometry is tight/unsafe. */
export function desktopGutterPlacement({
  viewportWidth,
  viewportHeight,
  main,
  anchorTop = 0,
  obstacles = [],
  fullscreen = false,
  editor = false,
  mobileOrTablet = false,
  visualViewport = null,
  fixedWidth = null,
} = {}) {
  if (fullscreen || editor || mobileOrTablet || !validRect(main)
      || !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)
      || !Number.isFinite(anchorTop)) return null;
  if (visualViewport && (visualViewport.scale !== 1 || visualViewport.offsetLeft !== 0
      || visualViewport.offsetTop !== 0 || !Number.isFinite(visualViewport.width)
      || !Number.isFinite(visualViewport.height))) return null;
  const widthLimit = visualViewport?.width ?? viewportWidth;
  const heightLimit = visualViewport?.height ?? viewportHeight;
  const gap = ORDINARY_AD_METRICS.contentGap;
  const edge = ORDINARY_AD_METRICS.viewportGap;
  const left = main.right + gap;
  const availableWidth = Math.min(ORDINARY_AD_METRICS.maxWidth, Math.floor(widthLimit - edge - left));
  const width = Number.isInteger(fixedWidth) ? fixedWidth : availableWidth;
  const top = Math.max(anchorTop, main.top + gap);
  const height = ORDINARY_AD_METRICS.gutterUnitHeight + ORDINARY_AD_METRICS.gutterLabelHeight;
  const candidate = { left, top, right: left + width, bottom: top + height, width, height };
  if (width < 160 || width > availableWidth || main.left < 0 || main.right > widthLimit || top < 0
      || candidate.right > widthLimit - edge || candidate.bottom > heightLimit - edge
      || candidate.bottom > main.bottom) return null;
  for (const obstacle of obstacles) {
    if (!validRect(obstacle)) continue;
    const safeGap = ORDINARY_AD_METRICS.safeObstacleGap;
    if (candidate.left - safeGap < obstacle.right && candidate.right + safeGap > obstacle.left
        && candidate.top - safeGap < obstacle.bottom && candidate.bottom + safeGap > obstacle.top) return null;
  }
  return candidate;
}

/** Create the visibly labelled shell without making a request. */
export function createOrdinaryDisplayAdCard(doc, unit, kind = 'inline') {
  if (!doc?.createElement || !ordinaryAdUnitIsConfigured(unit)) return null;
  const card = doc.createElement('aside');
  card.className = `ordinary-ad ordinary-ad--${kind}`;
  card.setAttribute('aria-label', '広告');
  card.dataset.adState = 'pending';
  const label = doc.createElement('p');
  label.className = 'ordinary-ad__label';
  label.textContent = '広告';
  const slot = doc.createElement('div');
  slot.className = 'ordinary-ad__slot';
  slot.dataset.adClient = unit.client;
  slot.dataset.adSlot = String(unit.slot).trim();
  card.append(label, slot);
  return { card, slot };
}

/**
 * Activate a connected, stable card through an injected provider. No unit,
 * provider, or live switch means no request. Call once per card, never per render.
 */
export function activateOrdinaryDisplayAd({
  card,
  slot = card?.querySelector?.('.ordinary-ad__slot'),
  provider,
  unit,
  enabled = ORDINARY_ADS_LIVE_ENABLED,
  eligibility = {},
  kind = 'inline',
  onOutcome = () => {},
} = {}) {
  if (!card || !slot || !visiblyMounted(card) || activatedCards.has(card)
      || !ordinaryAdEligibility({ ...eligibility, placement: kind === 'gutter' ? 'gutter' : 'inline', enabled, provider, unit })) {
    return { mounted: false, reason: 'ineligible', cleanup() {} };
  }
  activatedCards.add(card);
  let disposed = false;
  let providerCleanup;
  let cleanupCalled = false;
  const runProviderCleanup = () => {
    if (cleanupCalled || typeof providerCleanup !== 'function') return;
    cleanupCalled = true;
    try { providerCleanup(); } catch { /* provider cleanup is best-effort */ }
  };
  const acceptProviderCleanup = (cleanup) => {
    if (typeof cleanup !== 'function') return;
    providerCleanup = cleanup;
    if (disposed) runProviderCleanup();
  };
  const remove = (state) => {
    if (disposed) return;
    card.dataset.adState = state;
    card.remove?.();
    if (!card.remove) card.parentElement?.removeChild?.(card);
    disposed = true;
    runProviderCleanup();
  };
  const onStatus = (status) => {
    if (disposed) return;
    try { onOutcome(status); } catch { /* the host callback cannot break provider cleanup */ }
    if (status === 'filled') card.dataset.adState = 'filled';
    else if (['unfilled', 'blocked', 'failed', 'empty'].includes(status)) remove(status);
  };
  try {
    const result = provider(slot, { unit: { ...unit, client: unit.client, slot: String(unit.slot).trim(), format: 'display' }, placement: kind, eligibility, onStatus });
    if (typeof result === 'function') acceptProviderCleanup(result);
    else if (result && typeof result.then === 'function') {
      result.then(acceptProviderCleanup, () => onStatus('failed'));
    }
  } catch { onStatus('failed'); }
  return { mounted: !disposed, card, slot, cleanup: () => remove('removed') };
}

/** Convenience for placements that don't need keyed rendering. */
export function mountOrdinaryDisplayAd({ container, doc = container?.ownerDocument, ...options } = {}) {
  if (!container || !doc?.createElement || !ordinaryAdEligibility({
    ...options.eligibility, placement: options.kind === 'gutter' ? 'gutter' : 'inline', enabled: options.enabled ?? ORDINARY_ADS_LIVE_ENABLED,
    provider: options.provider, unit: options.unit,
  })) return { mounted: false, reason: 'ineligible', cleanup() {} };
  const shell = createOrdinaryDisplayAdCard(doc, options.unit, options.kind);
  if (!shell) return { mounted: false, reason: 'ineligible', cleanup() {} };
  container.append(shell.card);
  const mounted = activateOrdinaryDisplayAd({ ...options, ...shell });
  if (!mounted.mounted) shell.card.remove?.();
  return mounted;
}
