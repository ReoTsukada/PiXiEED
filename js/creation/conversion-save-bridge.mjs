/** Dispatch the existing engine link, retaining its own handlers and file bytes. */
export function downloadConversionResult({ link, expectedHref, available = () => true }) {
  if (!link || !available(link)) return false;
  const href = link.getAttribute('href');
  if (!/^blob:/.test(href || '') || !link.download || (expectedHref !== undefined && href !== expectedHref)) return false;
  link.click();
  return true; // Click dispatched; the browser/OS download result is outside this port.
}
