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

        const link = document.createElement('a');
        link.className = 'home-update-link';
        link.href = normalizeUrl(entry?.url || '/');
        link.textContent = entry?.name || '更新';

        const copy = document.createElement('p');
        copy.className = 'home-update-copy';
        copy.textContent = entry?.summary || '更新内容を調整';

        item.append(link, copy);
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

  function normalizeUrl(value) {
    if (!value) return './';
    if (/^https?:\/\//.test(value)) return value;
    if (value.startsWith('/')) return `.${value}`;
    return value;
  }
})();
