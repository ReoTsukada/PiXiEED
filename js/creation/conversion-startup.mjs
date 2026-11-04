/**
 * Run the output converter's startup gates in order. The view owns visibility
 * and failure presentation; this module never attempts to undo engine DOM work.
 */
export async function runConversionStartup({
  view,
  loadEngine,
  loadText,
  loadIntent,
  loadUI,
  onWarning = () => {},
  native = false,
}) {
  let stage = 'engine';
  try {
    view.begin();
    await loadEngine();

    stage = 'text-import';
    let textModule;
    try {
      textModule = await loadText();
    } catch (error) {
      try { onWarning(error, { stage }); } catch { /* An optional warning must not block media startup. */ }
      textModule = null;
    }
    if (textModule !== null) {
      stage = 'text-install';
      await textModule.installTextTools();
    }

    stage = 'intent-import';
    let intentModule;
    try {
      intentModule = await loadIntent();
    } catch (error) {
      try { onWarning(error, { stage }); } catch { /* An optional warning must not block media startup. */ }
      intentModule = null;
    }
    if (intentModule !== null) {
      stage = 'intent-install';
      await intentModule.installConversionIntent();
    }

    let adapter;
    if (!native) {
      stage = 'ui-import';
      const uiModule = await loadUI();
      stage = 'ui-mount';
      adapter = await uiModule.mountSmartConversion();
      if (!adapter) throw new Error('出力画面を準備できませんでした。再読み込みしてください。');
    }

    stage = 'ready';
    view.ready(adapter, { native });
    return { status: 'ready', stage };
  } catch (error) {
    try { view.fail(error, { stage }); } catch { /* Preserve the startup failure result. */ }
    return { status: 'error', stage, error };
  }
}
