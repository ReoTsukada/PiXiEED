import { createModeScope } from './mode-scope.mjs?rev=20261001-independent-editors-1';
import { creationModeEntryUrl } from './mode-entry.mjs?rev=20261016-tool-shell-1';

const sharedEntry = creationModeEntryUrl('audio', location.search);
if (sharedEntry) {
  document.querySelector('#main')?.setAttribute('inert', '');
  location.replace(sharedEntry);
} else {
document.querySelector('#main')?.setAttribute('inert', '');
const scope = createModeScope();
scope.listen(window, 'pagehide', (event) => { if (!event.persisted) scope.dispose(); });
try {
  const { mountAudioMode } = await import('./audio-page.mjs?rev=20261019-draw-search-rail-1');
  await mountAudioMode({ scope });
  document.documentElement.dataset.audioReady = 'true';
} catch (error) {
  scope.dispose();
  const status = document.querySelector('#audio-status');
  if (status) {
    status.textContent = `編集画面を開けませんでした：${error?.message || 'もう一度お試しください。'}`;
    status.classList.add('is-visible');
  }
}
}
