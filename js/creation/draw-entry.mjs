import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { mountDrawMode } from './draw-page.mjs?rev=20261004-audio-fixed-panel-3';

const scope = createModeScope();
scope.listen(window, 'pagehide', (event) => { if (!event.persisted) scope.dispose(); });
try {
  await mountDrawMode({ scope });
} catch (error) {
  scope.dispose();
  const status = document.querySelector('#draw-status');
  if (status) {
    status.textContent = `編集画面を開けませんでした：${error?.message || 'もう一度お試しください。'}`;
    status.classList.add('is-visible');
  }
}
