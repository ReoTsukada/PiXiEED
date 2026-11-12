import { createMyPostsApi } from '../globe/my-posts.mjs?rev=20261112-home-consent-1';

export function mountHomeArtworkSettings(host, api = createMyPostsApi()) {
  let generation = 0;
  const node = (tag, text = '') => { const element = document.createElement(tag); element.textContent = text; return element; };
  async function load() {
    const current = ++generation;
    host.replaceChildren(node('h2', 'ホームへの作品掲載'), node('p', '設定を確認しています…'));
    try {
      const preferences = await api.listHomeArtworkPreferences();
      if (current !== generation) return;
      host.replaceChildren(node('h2', 'ホームへの作品掲載'));
      if (!preferences.length) { host.append(node('p', '投稿したアカウントでログインすると設定できます。')); return; }
      for (const preference of preferences) {
        const form = node('form');
        const label = node('label');
        const checkbox = node('input'); checkbox.type = 'checkbox';
        checkbox.checked = preference.enabled && !preference.needsReconfirmation;
        label.append(checkbox, document.createTextNode(preference.sessionScope === 'device' ? 'この端末のゲスト投稿をホームに掲載してよい' : 'このアカウントの投稿をホームに掲載してよい'));
        const explanation = node('p', '過去・今後の公開投稿から、運営が確認した静止画像をホームに掲載します。作者名・作品名も表示します。すべての作品が掲載されるとは限りません。いつでもチェックを外して保存できます。OFFは次回の読み込みから反映され、投稿自体は削除されません。');
        const status = node('p', preference.needsReconfirmation ? '取り込んだゲスト投稿の掲載には、もう一度チェックして保存してください。既存の同意対象作品は引き続き掲載候補です。' : preference.enabled ? '許可済みです。運営確認を通過した作品が、ホームのランダム表示候補になります。' : '現在はホーム掲載を許可していません。');
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const save = node('button', '掲載設定を保存'); save.type = 'submit';
        form.append(label, explanation, save, status); host.append(form);
        let busy = false;
        form.addEventListener('submit', async (event) => {
          event.preventDefault(); if (busy || current !== generation) return;
          busy = true; checkbox.disabled = true; save.disabled = true; status.textContent = '保存しています…';
          try {
            const saved = await api.saveHomeArtworkPreference(preference.sessionScope, checkbox.checked, preference.revision);
            if (current !== generation) return;
            Object.assign(preference, saved); checkbox.checked = saved.enabled;
            status.textContent = saved.enabled ? 'ホーム掲載を許可しました。運営確認後、ランダム表示の候補になります。' : 'ホーム掲載をOFFにしました。次回の読み込みから対象外になります。';
            try { localStorage.setItem('PiXiEED:home-artwork-preference:v1', String(Date.now())); } catch { /* Server remains authoritative. */ }
          } catch {
            if (current !== generation) return;
            checkbox.disabled = true; save.disabled = true;
            status.textContent = '保存結果を確認できません。最新の設定を読み直してください。';
            const retry = node('button', '設定を読み直す'); retry.type = 'button'; retry.addEventListener('click', load); form.append(retry);
            return;
          } finally { busy = false; }
          if (current === generation) { checkbox.disabled = false; save.disabled = false; }
        });
      }
    } catch {
      if (current !== generation) return;
      host.replaceChildren(node('h2', 'ホームへの作品掲載'), node('p', '設定を読み込めませんでした。現在の設定は変更していません。'));
      const retry = node('button', '設定を読み直す'); retry.type = 'button'; retry.addEventListener('click', load); host.append(retry);
    }
  }
  document.addEventListener('pixieed:legacy-owner-signed-out', load);
  window.addEventListener('pixieed:guest-account-confirmed', load);
  window.addEventListener('pageshow', load);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(); });
  window.addEventListener('storage', (event) => {
    if (event.key == null || event.key === 'PiXiEED:legacy-owner-session:v1' || event.key === 'PiXiEED:supabase-session:v1' || event.key === 'PiXiEED:home-artwork-preference:v1' || /^sb-.+-auth-token$/.test(event.key)) void load();
  });
  void load();
  return { reload: load };
}
if (typeof document !== 'undefined') for (const host of document.querySelectorAll('[data-home-artwork-settings]')) mountHomeArtworkSettings(host);
