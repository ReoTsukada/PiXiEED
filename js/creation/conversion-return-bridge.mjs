/** Legacy return control remains the authority for URL and pending writes. */
export function createNativeReturnBridge(getOrigin) {
  return {
    read() {
      const origin = getOrigin();
      return origin ? { href: origin.getAttribute('href') || '/output/', label: origin.textContent?.includes('編集') ? '← 編集へ' : '← ガイド' } : null;
    },
    activate() { const origin = getOrigin(); if (!origin) return false; origin.click(); return true; },
  };
}
