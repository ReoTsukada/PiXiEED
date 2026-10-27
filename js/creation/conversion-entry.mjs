import { notifyToolEntryReady } from '../tool-offerwall-entry.mjs?rev=20261024-common-tool-start-1';
import { getToolStartRoute, isFreshToolStartRequest } from '../tool-start-routes.mjs?rev=20261024-common-tool-start-1';

const root = document.querySelector('main#main');
const params = new URLSearchParams(location.search);
async function legacy() { await import('./output-page.mjs?rev=20261024-common-tool-start-1'); }
async function boot() {
  // Preserve existing saved-project URLs, validation of malformed IDs and embeds.
  if (!root || params.has('id') || params.get('mode') === 'advanced' || window.top !== window.self) { await legacy(); return; }
  const original = root.innerHTML;
  let dispose;
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/css/conversion-simple.css?rev=20261028-formats-1'; document.head.append(style);
  async function onAdvanced(files = []) {
    const transfer = files.length ? new DataTransfer() : null;
    files.forEach(f => transfer.items.add(f));
    dispose?.(); root.classList.remove('conversion-simple'); root.innerHTML = original;
    history.replaceState(history.state, '', `${location.pathname}?mode=advanced`);
    try {
      await legacy();
      if (transfer) {
        const input = document.getElementById('output-file-input');
        if (!input) throw new Error('素材の引き継ぎ先を確認できません。');
        input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch {
      const note = document.createElement('p'); note.setAttribute('role', 'alert');
      note.textContent = '詳細画面の読み込みに失敗しました。再読み込みして、ファイルをもう一度選んでください。元のファイルは変更していません。'; root.prepend(note);
    }
  }
  try {
    const { mountConversionStudio } = await import('./conversion-studio.mjs?rev=20261028-formats-1');
    dispose = await mountConversionStudio(root, { onAdvanced });
    const label = document.querySelector('.output-header__label'); if (label) label.textContent = 'ファイル変換';
    document.title = 'ファイル変換｜PiXiEED';
    notifyToolEntryReady(getToolStartRoute(location.pathname)?.id === 'convert' && isFreshToolStartRequest(location.href, history.state));
    window.addEventListener('pagehide', event => { if (!event.persisted) dispose?.(); });
  } catch (error) {
    root.classList.remove('conversion-simple'); root.innerHTML = original;
    await legacy();
    const note = document.createElement('p'); note.setAttribute('role', 'status'); note.textContent = '簡易画面を読み込めなかったため、従来の変換画面を開きました。'; root.prepend(note);
  }
}
void boot().catch(() => {
  const note = document.createElement('p'); note.setAttribute('role', 'alert'); note.textContent = '変換画面を読み込めませんでした。ページを再読み込みしてください。'; root?.prepend(note);
});
