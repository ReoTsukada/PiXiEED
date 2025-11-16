(function () {
  const list = document.getElementById('notesList');
  if (!list) return;

  /**
   * ノート情報をここに追加すると自動で反映されます。
   * heartCount は note の「スキ」数。未定の場合は null で表示を「--」にします。
   * publishedAt は ISO 8601 の日時文字列です。
   * @type {Array<{id:string,title:string,url:string,heartCount:number|null,publishedAt:string}>}
   */
  const notes = [
    {
      id: 'nfe5a2805c7db',
      title: 'PiXiEED/ドット絵専門ブラウザツール',
      url: 'https://note.com/jaxya/n/nfe5a2805c7db',
      heartCount: null,
      publishedAt: '2025-11-16T12:57:17+09:00'
    },
    {
      id: 'ne69269ec8060',
      title: 'noteを始めてみる。',
      url: 'https://note.com/jaxya/n/ne69269ec8060',
      heartCount: 4,
      publishedAt: '2023-07-20T20:49:24+09:00'
    },
    {
      id: 'ndb0b6d864c41',
      title: '熊本【阿蘇山】絵です',
      url: 'https://note.com/jaxya/n/ndb0b6d864c41',
      heartCount: 2,
      publishedAt: '2023-07-30T08:24:59+09:00'
    },
    {
      id: 'n9a0ef6cd1f8c',
      title: '【夏】',
      url: 'https://note.com/jaxya/n/n9a0ef6cd1f8c',
      heartCount: 3,
      publishedAt: '2023-08-13T08:48:58+09:00'
    },
    {
      id: 'nd6d8d950ec35',
      title: '初のツール制作で悪戦苦闘',
      url: 'https://note.com/jaxya/n/nd6d8d950ec35',
      heartCount: 14,
      publishedAt: '2023-12-24T08:49:26+09:00'
    },
    {
      id: 'na3bee9442066',
      title: 'ドット絵旅行【In Kyoto 】',
      url: 'https://note.com/jaxya/n/na3bee9442066',
      heartCount: 11,
      publishedAt: '2024-01-13T08:27:11+09:00'
    }
  ];

  if (!notes.length) {
    list.innerHTML = '<li class="note-chip note-chip--empty">noteへの投稿を準備中です。</li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  const sortedNotes = sortByPublishedDate(notes);

  sortedNotes.forEach(note => {
    const item = document.createElement('li');
    item.className = 'note-chip';

    const link = document.createElement('a');
    link.className = 'note-chip__button';
    link.href = note.url;
    link.target = '_blank';
    link.rel = 'noopener';
    const formattedHearts = formatHeartCount(note.heartCount);
    const formattedDate = formatPublishedDate(note.publishedAt);
    const ariaParts = [];
    if (formattedDate) {
      ariaParts.push(`公開日 ${formattedDate}`);
    }
    ariaParts.push(`スキ ${formattedHearts}`);
    link.setAttribute('aria-label', `${note.title}（${ariaParts.join('、')}）`);

    const title = document.createElement('span');
    title.className = 'note-chip__title';
    title.textContent = note.title;

    const meta = document.createElement('div');
    meta.className = 'note-chip__meta';
    meta.appendChild(title);

    if (formattedDate) {
      const date = document.createElement('time');
      date.className = 'note-chip__date';
      date.dateTime = note.publishedAt;
      date.textContent = formattedDate;
      meta.appendChild(date);
    }

    const likes = document.createElement('span');
    likes.className = 'note-chip__likes';
    likes.setAttribute('aria-label', `スキ ${formattedHearts}`);

    const heart = document.createElement('span');
    heart.className = 'note-chip__heart';
    heart.setAttribute('aria-hidden', 'true');
    heart.textContent = '❤';

    const count = document.createElement('span');
    count.className = 'note-chip__likes-value';
    count.textContent = formatHeartCount(note.heartCount);

    likes.append(heart, count);
    link.append(meta, likes);
    item.appendChild(link);
    fragment.appendChild(item);
  });

  list.appendChild(fragment);

  function formatHeartCount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toLocaleString('ja-JP');
    }
    return '--';
  }

  function formatPublishedDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  function sortByPublishedDate(list) {
    return [...list].sort((a, b) => {
      const bTime = parsePublishedTime(b.publishedAt);
      const aTime = parsePublishedTime(a.publishedAt);
      return bTime - aTime;
    });
  }

  function parsePublishedTime(value) {
    if (!value) return Number.NEGATIVE_INFINITY;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return Number.NEGATIVE_INFINITY;
    }
    return date.getTime();
  }
})();
