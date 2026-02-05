(function () {
  const root = document.getElementById('devNotes');
  const nav = document.getElementById('devNotesNav');
  if (!root) return;

  const devNotes = [
    {
      id: 'site',
      name: 'PiXiEED 全体',
      url: '../index.html',
      entries: [
        {
          date: '2026-02-05',
          items: [
            '開発ノートまとめページを追加',
            'プロジェクト紹介ページに更新メモを追加',
            'ホームの最近更新を直近1件表示に変更'
          ]
        }
      ]
    },
    {
      id: 'maou-war',
      name: '魔王様の100日',
      url: '../maou-war/index.html',
      entries: [
        {
          date: '2026-02-05',
          items: [
            '宝箱のチャリン報酬を運依存の10〜1000に変更',
            '宝箱が到達判定で消える挙動を修正',
            '地面/魔王スプライトのファイル名をASCII化'
          ]
        }
      ]
    },
    { id: 'pixiedraw', name: 'PiXiEEDraw', url: '../pixiedraw/index.html', entries: [] },
    { id: 'pixiedraw-lite', name: 'PiXiEEDraw Lite', url: '../jerin-maker/index.html', entries: [] },
    { id: 'pixiee-lens', name: 'PiXiEELENS', url: '../pixiee-lens/index.html', entries: [] },
    { id: 'pixfind', name: 'PiXFiND', url: '../pixfind/index.html', entries: [] },
    { id: 'qr-maker', name: 'QRコードメーカー', url: '../qr-maker/index.html', entries: [] },
    { id: 'maoitu', name: 'maoitu', url: '../maoitu/index.html', entries: [] },
    { id: 'contest', name: 'コンテスト', url: '../contest/index.html', entries: [] }
  ];

  const fragment = document.createDocumentFragment();

  devNotes.forEach((note) => {
    const section = document.createElement('section');
    section.className = 'note-section';
    section.id = `note-${note.id}`;

    const head = document.createElement('div');
    head.className = 'note-section__head';

    const title = document.createElement('h2');
    title.textContent = note.name;

    if (note.url) {
      const link = document.createElement('a');
      link.className = 'note-section__link';
      link.href = note.url;
      link.textContent = '開く';
      link.setAttribute('aria-label', `${note.name} を開く`);
      head.append(title, link);
    } else {
      head.appendChild(title);
    }

    section.appendChild(head);

    if (!note.entries.length) {
      const empty = document.createElement('p');
      empty.className = 'note-empty';
      empty.textContent = '準備中';
      section.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'note-entry-list';
      note.entries
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach((entry) => {
          const entryEl = document.createElement('article');
          entryEl.className = 'note-entry';

          const date = document.createElement('time');
          date.className = 'note-date';
          date.dateTime = entry.date;
          date.textContent = formatDate(entry.date);

          const items = document.createElement('ul');
          items.className = 'note-items';
          (entry.items || []).forEach((item) => {
            const li = document.createElement('li');
            li.textContent = item;
            items.appendChild(li);
          });

          entryEl.append(date, items);
          list.appendChild(entryEl);
        });
      section.appendChild(list);
    }

    fragment.appendChild(section);
  });

  root.appendChild(fragment);

  if (nav) {
    const navFragment = document.createDocumentFragment();
    devNotes.forEach((note) => {
      const chip = document.createElement('a');
      chip.className = 'note-chip';
      chip.href = `#note-${note.id}`;
      chip.textContent = note.name;
      navFragment.appendChild(chip);
    });
    nav.appendChild(navFragment);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }
})();
