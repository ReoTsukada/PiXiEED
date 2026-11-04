/** The loading boundary is separate from engines; a failed adapter is never a fallback UI. */
export function createConversionStartupView(doc = document) {
  const main = doc.getElementById('main');
  const startup = doc.getElementById('conversion-startup');
  const heading = startup.querySelector('[data-conversion-heading]');
  const status = doc.getElementById('conversion-startup-status');
  const skip = doc.querySelector?.('.output-skip');
  return {
    begin() {
      main.hidden = true; main.inert = true;
      startup.hidden = false; startup.setAttribute('aria-busy', 'true');
      if (skip) skip.setAttribute('href', '#conversion-startup');
      doc.body.dataset.conversionStartup = 'loading';
    },
    ready(adapter, { native = false } = {}) {
      // Embedded/native output still needs the same authored heading.
      if (native && heading) main.prepend(heading);
      main.hidden = false; main.inert = false;
      startup.hidden = true; startup.setAttribute('aria-busy', 'false');
      if (skip) skip.setAttribute('href', '#main');
      doc.body.dataset.conversionStartup = 'ready';
    },
    fail(error) {
      // A failed adapter may have moved nodes or attached listeners. Preserve
      // that state behind the boundary; do not claim to restore native controls.
      main.hidden = true; main.inert = true;
      if (heading) startup.prepend(heading);
      startup.hidden = false; startup.setAttribute('aria-busy', 'false');
      status.setAttribute('role', 'alert');
      status.textContent = error?.message || '出力画面を開けませんでした。通信を確認して再読み込みしてください。';
      if (skip) skip.setAttribute('href', '#conversion-startup');
      doc.body.dataset.conversionStartup = 'error';
    },
  };
}
