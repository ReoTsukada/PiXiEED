import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { mountAudioMode } from './audio-page.mjs?rev=20261002-palette-layout-1';

const scope = createModeScope();
scope.listen(window, 'pagehide', (event) => { if (!event.persisted) scope.dispose(); });
try {
  await mountAudioMode({ scope });
} catch (error) {
  scope.dispose();
  const status = document.querySelector('#audio-status');
  if (status) {
    status.textContent = `編集画面を開けませんでした：${error?.message || 'もう一度お試しください。'}`;
    status.classList.add('is-visible');
  }
}
