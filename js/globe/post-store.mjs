/**
 * Prototype persistence for globe posts.
 *
 * The UI only talks to this small interface (`list / add / remove / subscribe`
 * and `auth`). The prototype backs it with IndexedDB and a demo login so the
 * whole posting flow can be exercised without a server; production swaps in a
 * Supabase-backed implementation with the same shape (see docs/globe/DESIGN.md).
 */

const DB_NAME = 'pixieed-globe-prototype';
const STORE = 'posts';
const USER_KEY = 'PiXiEED:globe:demo-user:v1';
const USER_ID_KEY = 'PiXiEED:globe:demo-user-id:v1';

// ---- Sample works (in-memory only, never written to the store) ---------------------------------
const SPRITES = {
  heart: { palette: { a: '#7d1233', b: '#ff4d79', c: '#ffc2d1' }, rows: ['............', '..aa....aa..', '.abbaaaabba.', 'abcbbbbbbbba', 'abbbbbbbbbba', 'abbbbbbbbbba', '.abbbbbbbba.', '..abbbbbba..', '...abbbba...', '....abba....', '.....aa.....', '............'] },
  cat: { palette: { a: '#2a2438', b: '#f2a65a', w: '#ffffff', k: '#1b1626', p: '#ff8fa3' }, rows: ['.a........a.', '.aa......aa.', '.abaaaaaaba.', '.abbbbbbbba.', '.abwkbbwkba.', '.abbbbbbbba.', '.abbbppbbba.', '.abbbbbbbba.', '..abbbbbba..', '...aaaaaa...', '............', '............'] },
  mushroom: { palette: { a: '#3b1e2b', r: '#e0364b', w: '#fff4dd', s: '#e9c9a0' }, rows: ['....aaaa....', '..aarrrraa..', '.arrwwrrrra.', '.arwwwrrwwa.', 'arrwwrrrwwra', 'arrrrrrrrrra', '.aaaaaaaaaa.', '...assssa...', '...assssa...', '...assssa...', '....aaaa....', '............'] },
  star: { palette: { a: '#5a3d00', y: '#ffd23f', w: '#fff2a8' }, rows: ['.....aa.....', '....ayya....', '....ayya....', '.aaaayyaaaa.', 'ayywyyyyyyya', '.ayyyyyyyya.', '..ayyyyyya..', '..ayyyyyya..', '.ayyyaayyya.', '.ayya..ayya.', '.aa......aa.', '............'] },
  ghost: { palette: { a: '#2b2f52', w: '#f4f6ff', k: '#232640', p: '#ffb3c6' }, rows: ['....aaaa....', '..aawwwwaa..', '.awwwwwwwwa.', '.awwkwwkwwa.', '.awwkwwkwwa.', '.awpwwwwpwa.', '.awwwwwwwwa.', '.awwwwwwwwa.', '.awwwwwwwwa.', '.awaawwaawa.', '..a..aa..a..', '............'] },
  sun: { palette: { a: '#8a3b00', o: '#ff9f1c', y: '#ffe066' }, rows: ['.....aa.....', '.a...oo...a.', '..a.aooa.a..', '...aooooa...', '..aoyyyyoa..', 'aooyyyyyyooa', 'aooyyyyyyooa', '..aoyyyyoa..', '...aooooa...', '..a.aooa.a..', '.a...oo...a.', '.....aa.....'] }
};

const SAMPLE_PLACES = [
  ['heart', 'はじまりのハート', 35.6895, 139.6917, '東京の上に、最初のひとつ。'],
  ['cat', 'ねこ大阪', 34.6937, 135.5023, ''],
  ['sun', '北のひなた', 43.0618, 141.3545, '雪の日でも、ドットの太陽。'],
  ['mushroom', 'フォレスト', 48.8566, 2.3522, ''],
  ['ghost', 'マンハッタンおばけ', 40.7128, -74.006, ''],
  ['star', 'サザンクロス', -33.8688, 151.2093, '南の空にも星を。']
];

function spriteToDataUrl({ palette, rows }) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length; canvas.height = rows.length;
  const context = canvas.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((char, x) => {
    if (palette[char]) { context.fillStyle = palette[char]; context.fillRect(x, y, 1, 1); }
  }));
  return canvas.toDataURL('image/png');
}

export function createSampleWorks(now = Date.UTC(2026, 8, 1)) {
  if (typeof document === 'undefined') return [];
  return SAMPLE_PLACES.map(([sprite, title, latitude, longitude, caption], index) => {
    const source = SPRITES[sprite];
    return {
      id: `sample-${sprite}`, sample: true, title, caption,
      image: { dataUrl: spriteToDataUrl(source), width: source.rows[0].length, height: source.rows.length, colorCount: Object.keys(source.palette).length },
      pin: { latitude, longitude, source: 'sample' },
      author: { id: 'pixieed-sample', name: 'PiXiEED サンプル' },
      createdAt: now - index * 86400000
    };
  });
}

// ---- IndexedDB with an in-memory fallback -------------------------------------------------------
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('indexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

export function createPostStore({ withSamples = false } = {}) {
  let db = null;
  let persisted = [];
  let samples = withSamples ? createSampleWorks() : [];
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => { try { listener(); } catch (error) { console.warn(error); } });

  const ready = (async () => {
    try {
      db = await openDb();
      persisted = await requestToPromise(db.transaction(STORE).objectStore(STORE).getAll());
    } catch (error) {
      console.info('[globe] posts are kept in memory only:', error?.message || error);
      db = null;
    }
    notify();
  })();

  return {
    ready,
    persistent: () => Boolean(db),
    list: () => [...persisted, ...samples].sort((a, b) => b.createdAt - a.createdAt),
    async add(post) {
      const record = { ...post, id: post.id || (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`), createdAt: post.createdAt || Date.now() };
      if (db) await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
      persisted = [...persisted, record];
      notify();
      return record;
    },
    async remove(id) {
      if (db) await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
      persisted = persisted.filter((post) => post.id !== id);
      samples = samples.filter((post) => post.id !== id);
      notify();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

// ---- Demo login (production: Supabase Auth) ---------------------------------------------------
export function createDemoAuth() {
  const listeners = new Set();
  let user = null;
  try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { user = null; }
  const notify = () => listeners.forEach((listener) => listener(user));
  return {
    getUser: () => user,
    login(name) {
      const trimmed = String(name || '').trim().slice(0, 24);
      if (!trimmed) throw new Error('表示名を入力してください。');
      let id = user?.id || '';
      try { id = id || localStorage.getItem(USER_ID_KEY) || ''; } catch { /* private mode */ }
      id = id || `demo-${Math.random().toString(16).slice(2, 10)}`;
      user = { id, name: trimmed };
      try { localStorage.setItem(USER_KEY, JSON.stringify(user)); localStorage.setItem(USER_ID_KEY, id); } catch { /* private mode */ }
      notify();
      return user;
    },
    logout() {
      user = null;
      try { localStorage.removeItem(USER_KEY); } catch { /* private mode */ }
      notify();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
