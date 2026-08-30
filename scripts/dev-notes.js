(function () {
  const root = document.getElementById('devNotes');
  const nav = document.getElementById('devNotesNav');
  if (!root) return;

  const baseNotes = [
    {
      id: 'site',
      name: 'PiXiEED Bridge',
      nameKey: 'notesSite',
      url: '../index.html',
      entries: []
    },
    {
      id: 'bridge',
      name: 'PiXiEED Bridge MVP',
      nameKey: 'notesBridge',
      url: '../help/index.html#bridge',
      entries: []
    }
  ];

  const fallbackAutoNotes = Object.freeze({});

  const indexLinkToNoteId = Object.freeze({
    'index.html': 'site',
    'notes/index.html': 'site',
    'glossary/index.html': 'site',
    'help/index.html': 'bridge'
  });

  const readmeSources = Object.freeze({});

  const notes = cloneNotes(baseNotes);
  applyFallbackNotes(notes);
  finalizeNotes(notes);
  render(notes);

  Promise.all([
    hydrateFromGeneratedManifest(notes),
    hydrateFromIndexSource(notes),
    hydrateFromReadmes(notes)
  ]).then(() => {
    finalizeNotes(notes);
    render(notes);
  }).catch(() => {
    // keep rendered fallback
  });

  window.addEventListener('pixieed:locale-changed', () => render(notes));

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

  async function hydrateFromGeneratedManifest(targetNotes) {
    let payload = null;
    try {
      const response = await fetch('../data/project-updates.json', { cache: 'no-store' });
      if (!response.ok) return;
      payload = await response.json();
    } catch (_error) {
      return;
    }
    const projects = Array.isArray(payload?.projects) ? payload.projects : [];
    projects.forEach((project) => {
      const note = targetNotes.find(item => item.id === project?.id);
      if (!note) return;
      mergeEntries(note, Array.isArray(project?.entries) ? project.entries : []);
      if (typeof project?.url === 'string' && project.url.trim()) {
        note.url = normalizeManifestUrl(project.url);
      }
      if (typeof project?.name === 'string' && project.name.trim()) {
        note.name = project.name.trim();
      }
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

  function normalizeManifestUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//.test(value)) return value;
    const normalized = value.startsWith('/') ? `..${value}` : value;
    if (window.location.protocol === 'file:' && /\/$/.test(normalized)) {
      return `${normalized}index.html`;
    }
    return normalized;
  }

  function resolveNoteId(link, title) {
    if (indexLinkToNoteId[link]) return indexLinkToNoteId[link];
    if (!title) return '';
    if (/PiXiEED Bridge|Realtime Protocol|Connector SDK/i.test(title)) return 'bridge';
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
      const displayName = localizedNoteName(note);
      title.textContent = displayName;

      if (note.url) {
        const link = document.createElement('a');
        link.className = 'note-section__link';
        link.href = note.url;
        link.textContent = localizedMessage('notesOpen', '開く');
        link.setAttribute('aria-label', localizedMessage('notesOpenAria', `${displayName} を開く`).replace('{name}', displayName));
        head.append(title, link);
      } else {
        head.appendChild(title);
      }

      section.appendChild(head);

      if (!note.entries.length) {
        const empty = document.createElement('p');
        empty.className = 'note-empty';
        empty.textContent = localizedMessage('notesPreparing', '準備中');
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
        chip.textContent = localizedNoteName(note);
        navFragment.appendChild(chip);
      });
      nav.appendChild(navFragment);
    }
  }

  function localizedNoteName(note) {
    return localizedMessage(note.nameKey, note.name);
  }

  function localizedMessage(key, fallback) {
    const locale = document.documentElement.dataset.pixieedLocale;
    const english = locale === 'en';
    const messages = {
      notesOpen: english ? 'Open' : '開く',
      notesOpenAria: english ? 'Open {name}' : '{name} を開く',
      notesPreparing: english ? 'Coming soon' : '準備中',
      notesSite: english ? 'PiXiEED Bridge' : 'PiXiEED Bridge',
      notesBridge: english ? 'PiXiEED Bridge MVP' : 'PiXiEED Bridge MVP'
    };
    return messages[key] || fallback || '';
  }

  function formatDate(value) {
    const normalized = normalizeDate(value);
    if (!normalized) return value || '';
    const [year, month, day] = normalized.split('-');
    return `${year}/${month}/${day}`;
  }
})();
