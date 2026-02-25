(function () {
  const root = document.getElementById('devNotes');
  const nav = document.getElementById('devNotesNav');
  if (!root) return;

  const baseNotes = [
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
            'ホームの最近更新を直近5件表示に変更',
            'フッターの空き枠にPiXiEELENSボタンを配置',
            'maoituのゲームオーバー画面に他ゲーム導線を追加'
          ]
        }
      ]
    },
    {
      id: 'maou-war',
      name: '魔王様奪還',
      url: '../maou-war/index.html',
      entries: [
        {
          date: '2026-02-11',
          items: [
            'UIレイアウトを再調整し、縦画面でマップ表示を最大化',
            '下部広告を小バナーサイズで統一し、表示崩れを修正',
            'ステータスシートをタブ間で同サイズ化し、スキル一覧を6列表示に変更',
            'ログを1文字ずつ表示する演出に変更',
            'HP路の上昇量を強化し、優勢色ボーナス（パラメータ加算）を追加',
            'ground-sprite-14の4コマPNGアニメーションをミミックタイルに適用',
            '固定マップの拠点周辺タイル・ショップ配置を調整（宿を右下端へ移動）'
          ]
        },
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
    { id: 'maoitu', name: 'maoitu', url: '../maoitu/index.html', entries: [] }
  ];

  // file:// 直開きなど fetch が失敗する環境でも主要ツールだけは空欄にしない
  const fallbackAutoNotes = Object.freeze({
    pixiedraw: [
      {
        date: '2026-02-25',
        items: [
          'ツール/カラーパネルを統合 / 左レーンコンパクト時を1列固定+フライアウト化 / ボタンサイズ44px統一 / カラーパネルを縦スクロール最適化'
        ]
      },
      {
        date: '2026-02-19',
        items: [
          '共有モード（マルチ）を強化（マスター/参加者、セル割当、差分同期） / 共有キー操作と役割フローを改善 / 共同制作ルーム導線を調整'
        ]
      }
    ],
    'pixiedraw-lite': [
      {
        date: '2026-02-11',
        items: [
          '「描く」導線の初心者向けとして案内を強化'
        ]
      }
    ],
    'pixiee-lens': [
      {
        date: '2026-02-16',
        items: [
          'ボタン長押しGIF撮影（最大5秒） / FPS設定（5・8・10・20・30） / PNG保存のドット倍率 / 5MB超過時の自動調整 / GIF保存の5MB制御を追加'
        ]
      }
    ]
  });

  const indexLinkToNoteId = Object.freeze({
    'pixiedraw/index.html': 'pixiedraw',
    'jerin-maker/index.html': 'pixiedraw-lite',
    'pixiee-lens/index.html': 'pixiee-lens',
    'pixfind/index.html': 'pixfind',
    'qr-maker/index.html': 'qr-maker',
    'maoitu/index.html': 'maoitu',
    'maou-war/index.html': 'maou-war',
    'projects/maou-war/index.html': 'maou-war'
  });

  const readmeSources = Object.freeze({
    pixiedraw: '../pixiedraw/README.md',
    'pixiedraw-lite': '../jerin-maker/README.md',
    'pixiee-lens': '../pixiee-lens/README.md',
    pixfind: '../pixfind/README.md',
    'qr-maker': '../qr-maker/README.md'
  });

  const notes = cloneNotes(baseNotes);
  applyFallbackNotes(notes);
  finalizeNotes(notes);
  render(notes);

  Promise.all([
    hydrateFromIndexSource(notes),
    hydrateFromReadmes(notes)
  ]).then(() => {
    finalizeNotes(notes);
    render(notes);
  }).catch(() => {
    // keep rendered fallback
  });

  function cloneNotes(source) {
    return source.map(note => ({
      ...note,
      entries: Array.isArray(note.entries)
        ? note.entries.map(entry => ({
          date: entry.date || '',
          items: Array.isArray(entry.items) ? [...entry.items] : []
        }))
        : []
    }));
  }

  function applyFallbackNotes(targetNotes) {
    targetNotes.forEach(note => {
      const fallback = fallbackAutoNotes[note.id];
      if (!fallback) return;
      mergeEntries(note, fallback);
    });
  }

  async function hydrateFromIndexSource(targetNotes) {
    let html = '';
    try {
      const response = await fetch('../index.html', { cache: 'no-store' });
      if (!response.ok) return;
      html = await response.text();
    } catch (_error) {
      return;
    }
    if (!html) return;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const source = doc.getElementById('gameGalleryItems');
    if (!source) return;

    const bucketByNoteId = new Map();
    Array.from(source.querySelectorAll('li')).forEach(node => {
      const link = normalizeLink(node.getAttribute('data-link') || '');
      const noteId = resolveNoteId(link, node.getAttribute('data-title') || '');
      if (!noteId) return;

      const date = normalizeDate(node.getAttribute('data-updated') || '');
      const message = normalizeItem(node.getAttribute('data-update') || node.getAttribute('data-desc') || '');
      if (!date || !message) return;

      const rows = bucketByNoteId.get(noteId) || [];
      rows.push({ date, items: [message] });
      bucketByNoteId.set(noteId, rows);
    });

    bucketByNoteId.forEach((entries, noteId) => {
      const note = targetNotes.find(item => item.id === noteId);
      if (!note) return;
      mergeEntries(note, entries);
    });
  }

  async function hydrateFromReadmes(targetNotes) {
    const jobs = Object.entries(readmeSources).map(async ([noteId, path]) => {
      let text = '';
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) return;
        text = await response.text();
      } catch (_error) {
        return;
      }
      if (!text) return;
      const parsed = parseReadmeEntries(text);
      if (!parsed.length) return;
      const note = targetNotes.find(item => item.id === noteId);
      if (!note) return;
      mergeEntries(note, parsed);
    });
    await Promise.all(jobs);
  }

  function parseReadmeEntries(text) {
    const lines = String(text || '').split(/\r?\n/);
    const rows = [];
    let scopedDate = '';

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const headingDate = trimmed.match(/^##\s*(\d{4}-\d{2}-\d{2})\s*$/);
      if (headingDate) {
        scopedDate = headingDate[1];
        return;
      }

      const inlineDate = trimmed.match(/^[-*]\s*\(?(\d{4}-\d{2}-\d{2})\)?\s*[:：\-–]\s*(.+)$/);
      if (inlineDate) {
        const date = normalizeDate(inlineDate[1]);
        const item = normalizeItem(inlineDate[2]);
        if (date && item && !isPlaceholderItem(item)) {
          rows.push({ date, items: [item] });
        }
        return;
      }

      if (!scopedDate) return;
      if (!/^[-*]\s+/.test(trimmed)) return;
      const item = normalizeItem(trimmed.replace(/^[-*]\s+/, ''));
      const date = normalizeDate(scopedDate);
      if (!date || !item || isPlaceholderItem(item)) return;
      rows.push({ date, items: [item] });
    });

    return rows;
  }

  function isPlaceholderItem(item) {
    return /(add entries here|newest first|format: YYYY-MM-DD)/i.test(item);
  }

  function normalizeLink(link) {
    let value = String(link || '').trim();
    value = value.replace(/^[./]+/, '');
    value = value.replace(/^\//, '');
    return value;
  }

  function resolveNoteId(link, title) {
    if (indexLinkToNoteId[link]) return indexLinkToNoteId[link];
    if (!title) return '';
    if (/PiXiEEDraw Lite/i.test(title)) return 'pixiedraw-lite';
    if (/PiXiEEDraw/i.test(title)) return 'pixiedraw';
    if (/PiXiEELENS/i.test(title)) return 'pixiee-lens';
    if (/PiXFiND/i.test(title)) return 'pixfind';
    return '';
  }

  function normalizeDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeItem(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function mergeEntries(note, incomingEntries) {
    const map = new Map();
    const push = (entry) => {
      const date = normalizeDate(entry?.date || '');
      if (!date) return;
      const list = map.get(date) || [];
      (entry.items || []).forEach(item => {
        const text = normalizeItem(item);
        if (!text) return;
        if (!list.includes(text)) list.push(text);
      });
      if (list.length) map.set(date, list);
    };

    (note.entries || []).forEach(push);
    (incomingEntries || []).forEach(push);

    note.entries = Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }

  function finalizeNotes(targetNotes) {
    targetNotes.forEach(note => {
      note.entries = (note.entries || [])
        .filter(entry => entry.date && Array.isArray(entry.items) && entry.items.length)
        .map(entry => ({
          date: normalizeDate(entry.date),
          items: entry.items.slice(0, 10)
        }))
        .filter(entry => entry.date)
        .sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  function render(targetNotes) {
    root.innerHTML = '';
    const fragment = document.createDocumentFragment();

    targetNotes.forEach((note) => {
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
        note.entries.forEach((entry) => {
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
      nav.innerHTML = '';
      const navFragment = document.createDocumentFragment();
      targetNotes.forEach((note) => {
        const chip = document.createElement('a');
        chip.className = 'note-chip';
        chip.href = `#note-${note.id}`;
        chip.textContent = note.name;
        navFragment.appendChild(chip);
      });
      nav.appendChild(navFragment);
    }
  }

  function formatDate(value) {
    const normalized = normalizeDate(value);
    if (!normalized) return value || '';
    const [year, month, day] = normalized.split('-');
    return `${year}/${month}/${day}`;
  }
})();
