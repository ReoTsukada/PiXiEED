/** Compatibility URL for pages cached before ad-based unlocks were retired. */
export function mountSiteHeaderBenefits({ documentRef = globalThis.document } = {}) {
  if (!documentRef?.querySelectorAll) return null;
  for (const node of documentRef.querySelectorAll('[data-header-reward], .pixieed-site-reward')) node.remove?.();
  documentRef.body?.removeAttribute?.('data-header-reward-embedded');
  return null;
}

if (typeof document !== 'undefined') mountSiteHeaderBenefits();
