/** Loading boundary with one explicit basic-screen recovery for UI chunk failure. */
export function createConversionStartupView(doc = document) {
  const main = doc.getElementById('main');
  const startup = doc.getElementById('conversion-startup');
  const heading = startup.querySelector('[data-conversion-heading]');
  const status = doc.getElementById('conversion-startup-status');
  const basic = doc.querySelector?.('[data-conversion-basic]');
  const technical = doc.querySelector?.('[data-conversion-technical]');
  const technicalText = doc.querySelector?.('[data-conversion-error]');
  const skip = doc.querySelector?.('.output-skip');
  let basicAllowed = false;
  const showBasic = () => {
    if (!basicAllowed) return false;
    basicAllowed = false;
    if (heading) main.prepend(heading);
    const warning = doc.createElement('p');
    warning.className = 'sc-basic-warning';
    warning.setAttribute('role', 'status');
    warning.textContent = '追加の操作パネルを読み込めませんでした。基本画面で続けます。必要なファイルを保存してからページを閉じてください。';
    if (heading?.nextSibling) main.insertBefore(warning, heading.nextSibling);
    else main.append(warning);
    main.hidden = false; main.inert = false;
    startup.hidden = true;
    if (skip) skip.setAttribute('href', '#main');
    doc.body.dataset.conversionStartup = 'basic';
    return true;
  };
  basic?.addEventListener?.('click', showBasic);
  const reload = doc.querySelector?.('[data-conversion-reload]');
  reload?.addEventListener?.('click',event=>{
    if(typeof doc.defaultView?.location?.reload!=='function')return;
    event.preventDefault();doc.defaultView.location.reload();
  });
  return {
    begin() {
      main.hidden = true; main.inert = true;
      startup.hidden = false; startup.setAttribute('aria-busy', 'true');
      if (basic) basic.hidden = true;
      if (technical) technical.hidden = true;
      if (skip) skip.setAttribute('href', '#conversion-startup');
      doc.body.dataset.conversionStartup = 'loading';
    },
    ready(adapter, { native = false } = {}) {
      if (native && heading) main.prepend(heading);
      main.hidden = false; main.inert = false;
      startup.hidden = true; startup.setAttribute('aria-busy', 'false');
      if (skip) skip.setAttribute('href', '#main');
      doc.body.dataset.conversionStartup = 'ready';
    },
    fail(error, { stage = '' } = {}) {
      main.hidden = true; main.inert = true;
      if (heading) startup.prepend(heading);
      startup.hidden = false; startup.setAttribute('aria-busy', 'false');
      status.setAttribute('role', 'alert');
      status.textContent = stage === 'ui-import'
        ? '追加の操作パネルを読み込めませんでした。必要なファイルはページを閉じる前に保存してください。'
        : '出力画面を安全に準備できませんでした。保存操作をせず、再読み込みしてください。';
      basicAllowed = stage === 'ui-import';
      if (basic) basic.hidden = !basicAllowed;
      if (technical) technical.hidden = false;
      if (technicalText) technicalText.textContent = error?.message || String(error || 'Unknown startup error');
      if (skip) skip.setAttribute('href', '#conversion-startup');
      doc.body.dataset.conversionStartup = 'error';
    },
  };
}
