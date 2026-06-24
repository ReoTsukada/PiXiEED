(function () {
  const root = document.getElementById('homeUpdates');
  if (!root) return;

  if (window.location.protocol === 'file:') {
    render([]);
    return;
  }

  fetch('data/project-updates.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('Failed to load updates');
      return response.json();
    })
    .then((payload) => {
      render(Array.isArray(payload?.recentByDate) ? payload.recentByDate : []);
    })
    .catch(() => {
      render([]);
    });

  function render(groups) {
    root.innerHTML = '';
    if (!groups.length) {
      const empty = document.createElement('p');
      empty.className = 'home-updates-empty';
      empty.textContent = '更新情報は準備中です。';
      root.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'home-update-group';

      const time = document.createElement('time');
      time.className = 'home-update-date';
      time.dateTime = group.date || '';
      time.textContent = formatDate(group.date || '');

      const list = document.createElement('div');
      list.className = 'home-update-list';

      (group.updates || []).forEach((entry) => {
        const item = document.createElement('article');
        item.className = 'home-update-item';

        const meta = document.createElement('div');
        meta.className = 'home-update-meta';

        const type = document.createElement('span');
        type.className = 'home-update-type';
        type.textContent = formatType(entry?.id || '');

        const link = document.createElement('a');
        link.className = 'home-update-link';
        link.href = normalizeUrl(entry?.url || '/');
        link.textContent = entry?.name || '更新';

        const copy = document.createElement('p');
        copy.className = 'home-update-copy';
        copy.textContent = formatSummary(entry?.summary || '', entry?.name || '', group?.date || '');

        meta.appendChild(type);
        item.append(meta, link, copy);
        list.appendChild(item);
      });

      section.append(time, list);
      fragment.appendChild(section);
    });

    root.appendChild(fragment);
  }

  function formatDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value || '';
    return `${match[1]}/${match[2]}/${match[3]}`;
  }

  function formatType(value) {
    const key = String(value || '').toLowerCase();
    if (key === 'site') return 'Home';
    if (key === 'maoitu') return 'Game';
    if (key.includes('lens') || key.includes('draw') || key.includes('qr')) return 'Tool';
    return 'Update';
  }

  function normalizeUrl(value) {
    if (!value) return './';
    if (/^https?:\/\//.test(value)) return value;
    const normalized = value.startsWith('/') ? `.${value}` : value;
    if (window.location.protocol === 'file:' && /\/$/.test(normalized)) {
      return `${normalized}index.html`;
    }
    return normalized;
  }

  function formatSummary(summary, projectName, date) {
    const normalized = String(summary || '').trim();
    if (!normalized) return '更新内容を調整しました。';
    const isGenericUiOnly = normalized === '画面を更新';
    const isGenericUiFeature = normalized === '機能 / 画面を更新';
    const isGenericUiFeatureStyle = normalized === '機能 / 画面 / スタイルを更新';
    const isGenericSite = normalized === '画面 / 機能 / SEOを更新';
    if (isGenericUiOnly) {
      return `${projectName || '各プロジェクト'}のUIレイアウトを調整し、表示崩れと操作導線を改善しました。`;
    }
    if (isGenericUiFeature) {
      return `${projectName || '各プロジェクト'}の機能動作を見直し、画面操作と同期挙動を安定化しました。`;
    }
    if (isGenericUiFeatureStyle) {
      return `${projectName || '各プロジェクト'}の機能改善に加えて、UIスタイルと操作感を調整しました。`;
    }
    if (isGenericSite) {
      return `サイト導線の見直し、主要機能の調整、検索向けメタ情報の更新を行いました。`;
    }
    if (normalized === '画面 / 機能 / スタイルを更新') {
      return `${projectName || '各プロジェクト'}の画面、機能、スタイルを一括調整し、日常利用時の操作性を改善しました。`;
    }
    if (normalized === '機能 / ドキュメントを更新') {
      return `${projectName || '各プロジェクト'}の機能更新と、利用時に参照する説明内容の最新化を行いました。`;
    }
    if (normalized === 'ドキュメント / 機能 / 画像 / 画面を更新') {
      return `${projectName || '各プロジェクト'}の機能・画面・画像素材・説明文をまとめて更新しました。`;
    }
    return normalized;
  }
})();
