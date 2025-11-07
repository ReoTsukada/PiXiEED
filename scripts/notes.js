(function () {
  const list = document.getElementById('notesList');
  if (!list) return;

  /**
   * ノート情報をここに追加すると自動で反映されます。
   * heartCount は note の「スキ」数。未定の場合は null で表示を「--」にします。
   * @type {Array<{id:string,title:string,url:string,heartCount:number|null}>}
   */
  const notes = [
    {
      id: 'n219b6958829c',
      title: 'ドット絵専門ブラウザツール',
      url: 'https://note.com/pixieed_arta/n/n219b6958829c',
      heartCount: 2
    }
  ];

  if (!notes.length) {
    list.innerHTML = '<li class="note-chip note-chip--empty">noteへの投稿を準備中です。</li>';
    return;
  }

  const fragment = document.createDocumentFragment();

  notes.forEach(note => {
    const item = document.createElement('li');
    item.className = 'note-chip';

    const link = document.createElement('a');
    link.className = 'note-chip__button';
    link.href = note.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', `${note.title}（スキ ${formatHeartCount(note.heartCount)}）`);

    const title = document.createElement('span');
    title.className = 'note-chip__title';
    title.textContent = note.title;

    const likes = document.createElement('span');
    likes.className = 'note-chip__likes';
    likes.setAttribute('aria-label', `スキ ${formatHeartCount(note.heartCount)}`);

    const heart = document.createElement('span');
    heart.className = 'note-chip__heart';
    heart.setAttribute('aria-hidden', 'true');
    heart.textContent = '❤';

    const count = document.createElement('span');
    count.className = 'note-chip__likes-value';
    count.textContent = formatHeartCount(note.heartCount);

    likes.append(heart, count);
    link.append(title, likes);
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
})();
