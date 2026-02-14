const dom = {
  app: document.getElementById('app'),
  startScreen: document.getElementById('startScreen'),
  difficultyScreen: document.getElementById('difficultyScreen'),
  gameScreen: document.getElementById('gameScreen'),
  startButton: document.getElementById('startButton'),
  difficultyBackButton: document.getElementById('difficultyBackButton'),
  gameBackButton: document.getElementById('gameBackButton'),
  backToTitleButton: document.getElementById('backButton'),
  resetButton: document.getElementById('resetButton'),
  deletePuzzleButton: document.getElementById('deletePuzzleButton'),
  difficultyChips: Array.from(document.querySelectorAll('[data-difficulty]')),
  modeChips: Array.from(document.querySelectorAll('[data-game-mode]')),
  modeDescription: document.getElementById('modeDescription'),
  puzzleList: document.getElementById('puzzleList'),
  gameTitle: document.getElementById('gameTitle'),
  gameModeLabel: document.getElementById('gameModeLabel'),
  gameAuthor: document.getElementById('gameAuthor'),
  foundLabel: document.getElementById('foundLabel'),
  foundCount: document.getElementById('foundCount'),
  totalCount: document.getElementById('totalCount'),
  timerLabel: document.getElementById('timerLabel'),
  mistakeLabel: document.getElementById('mistakeLabel'),
  canvasOriginal: document.getElementById('canvasOriginal'),
  canvasChallenge: document.getElementById('canvasChallenge'),
  overlayOriginal: document.getElementById('overlayOriginal'),
  overlayChallenge: document.getElementById('overlayChallenge'),
  completionOverlay: document.getElementById('completionOverlay'),
  failureOverlay: document.getElementById('failureOverlay'),
  targetPanel: document.getElementById('targetPanel'),
  targetCurrent: document.getElementById('targetCurrent'),
  targetList: document.getElementById('targetList'),
  hintMessage: document.getElementById('hintMessage'),
  creatorOverlay: document.getElementById('creatorOverlay'),
  creatorOpenButton: document.getElementById('createButton'),
  creatorCloseButton: document.getElementById('creatorClose'),
  creatorForm: document.getElementById('creatorForm'),
  creatorDescription: document.getElementById('creatorDescription'),
  creatorModeButtons: Array.from(document.querySelectorAll('[data-creator-mode]')),
  creatorDiffLabelText: document.getElementById('creatorDiffLabelText'),
  creatorPreviewDiffCaption: document.getElementById('creatorPreviewDiffCaption'),
  creatorModeNote: document.getElementById('creatorModeNote'),
  creatorTitleInput: document.getElementById('creatorTitleInput'),
  creatorSlugInput: document.getElementById('creatorSlugInput'),
  creatorDifficultyButtons: [],
  creatorOriginalInput: document.getElementById('creatorOriginalInput'),
  creatorDiffInput: document.getElementById('creatorDiffInput'),
  creatorPreviewOriginal: document.getElementById('creatorPreviewOriginal'),
  creatorPreviewDiff: document.getElementById('creatorPreviewDiff'),
  creatorContestToggle: document.getElementById('creatorContestToggle'),
  creatorExportButton: document.getElementById('creatorExport'),
  creatorStatus: document.getElementById('creatorStatus'),
  creatorSummary: document.getElementById('creatorSummary'),
  creatorDiffCount: document.getElementById('creatorDiffCount'),
  creatorSize: document.getElementById('creatorSize'),
  creatorTargets: document.getElementById('creatorTargets'),
  creatorTargetFields: document.getElementById('creatorTargetFields'),
};

const ctx = {
  original: dom.canvasOriginal?.getContext('2d') ?? null,
  challenge: dom.canvasChallenge?.getContext('2d') ?? null,
};

[ctx.original, ctx.challenge].forEach(context => {
  if (context) {
    context.imageSmoothingEnabled = false;
  }
});

const creatorCtx = {
  original: dom.creatorPreviewOriginal?.getContext('2d') ?? null,
  diff: dom.creatorPreviewDiff?.getContext('2d') ?? null,
};

[creatorCtx.original, creatorCtx.diff].forEach(context => {
  if (context) {
    context.imageSmoothingEnabled = false;
  }
});

function setViewportVars() {
  const vv = window.visualViewport;
  const width = Math.round(vv?.width || window.innerWidth || document.documentElement.clientWidth || 0);
  const height = Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || 0);
  if (width > 0) {
    document.documentElement.style.setProperty('--app-width', `${width}px`);
  }
  if (height > 0) {
    document.documentElement.style.setProperty('--app-height', `${height}px`);
  }
}

setViewportVars();
window.addEventListener('resize', setViewportVars, { passive: true });
window.addEventListener('orientationchange', setViewportVars, { passive: true });
window.visualViewport?.addEventListener('resize', setViewportVars, { passive: true });
window.visualViewport?.addEventListener('scroll', setViewportVars, { passive: true });

function isLocalFileProtocol() {
  return typeof window !== 'undefined' && window.location?.protocol === 'file:';
}

const MIN_CLUSTER_PIXELS = 1;
const MARKER_PADDING = 1;
const TAP_HIT_PADDING = 1;
const SHARE_HASHTAG = '#PiXiEED';
const REGION_MERGE_DISTANCE_BY_DIFFICULTY = {
  1: 2,
  2: 4,
  3: 8,
}; // Manhattan merge distance (px) per difficulty level
const CREATOR_MERGE_DISTANCE = REGION_MERGE_DISTANCE_BY_DIFFICULTY[2];
const CREATOR_HIDDEN_OBJECT_MIN_DISTANCE = 2; // Require at least 2 empty pixels between objects.
const HIDDEN_OBJECT_HIT_PADDING = 1;
const HIDDEN_OBJECT_LAYER_ALPHA_THRESHOLD = 12;
const HIDDEN_OBJECT_LAYER_BLACK_THRESHOLD = 72;
const HIDDEN_OBJECT_ALPHA_FALLBACK_MAX_COVERAGE = 0.95;
const MERGE_DISTANCE_SIZE_TIER_1 = 64;
const MERGE_DISTANCE_SIZE_TIER_2 = 256;
const MERGE_DISTANCE_MAX_SCALE = 3;
const MERGE_DISTANCE_MAX_ABS = 16;
const NORMALIZE_COLOR_TOLERANCE = 12;
const NORMALIZE_MATCH_RATIO = 0.985;
const MAX_MISTAKES = 3;
const TAP_MAX_MOVEMENT_PX = 8;
const TAP_MAX_DURATION_MS = 320;
const ZOOM_MIN_SCALE = 1;
const ZOOM_MAX_SCALE = 3.2;
const ZOOM_WHEEL_STEP = 0.12;
const GAME_MODE_SPOT_DIFFERENCE = 'spot-difference';
const GAME_MODE_HIDDEN_OBJECT = 'hidden-object';
const DEFAULT_GAME_MODE = GAME_MODE_SPOT_DIFFERENCE;
const GAME_MODE_METADATA = {
  [GAME_MODE_SPOT_DIFFERENCE]: {
    label: '間違い探し',
    description: '2枚の画像の違いをすべて探してください。',
    gameLabel: '間違い探しモード',
  },
  [GAME_MODE_HIDDEN_OBJECT]: {
    label: 'もの探し',
    description: '指定されたアイテムを見つけてください。',
    gameLabel: 'もの探しモード',
  },
};

const zoomControllers = {
  original: null,
  challenge: null,
};
let zoomSyncLock = false;

const FALLBACK_OFFICIAL_PUZZLES = [
  {
    id: 'd1-maousama',
    slug: 'd1-maousama',
    label: '魔王様!!',
    description: '秒で始められる避けゲーをモチーフにした公式間違い探し。まずはここから挑戦！',
    difficulty: 1,
    original: 'assets/puzzles/d1-maousama/original.png',
    diff: 'assets/puzzles/d1-maousama/diff.png',
    thumbnail: 'assets/puzzles/d1-maousama/diff.png',
  },
  {
    id: 'd2-si-sa-',
    slug: 'si-sa-',
    label: 'シーサー',
    description: '宮殿の狛犬に潜んだ細かな違いを見抜けるかな？色や向きに注目してみよう。',
    difficulty: 2,
    original: 'assets/puzzles/d2-si-sa-/original.png',
    diff: 'assets/puzzles/d2-si-sa-/diff.png',
    thumbnail: 'assets/puzzles/d2-si-sa-/diff.png',
  },
  {
    id: 'd3-tabun-shibuya',
    slug: 'tabun-shibuya',
    label: '多分いつもの渋谷',
    description: '交差点にあふれる人や看板の差分をすべて見抜けるかな？視線の誘導に惑わされずに挑戦しよう。',
    difficulty: 3,
    original: 'assets/puzzles/d3-tabun-shibuya/original.png',
    diff: 'assets/puzzles/d3-tabun-shibuya/diff.png',
    thumbnail: 'assets/puzzles/d3-tabun-shibuya/diff.png',
  },
];

const state = {
  currentDifficulty: 1,
  currentMode: DEFAULT_GAME_MODE,
  activeMode: DEFAULT_GAME_MODE,
  currentPuzzle: null,
  differences: [],
  hiddenTargets: [],
  found: 0,
  total: 0,
  mistakes: 0,
  missMarkers: [],
  roundCompleted: false,
  imageSize: { width: 0, height: 0 },
  startTimestamp: null,
  timerId: null,
  timerRunning: false,
  audioContext: null,
  completionTimeout: null,
  failureTimeout: null,
  resetTimeout: null,
  officialPuzzles: [],
};

const creatorState = {
  mode: GAME_MODE_SPOT_DIFFERENCE,
  autoDifficulty: true,
  difficulty: 1,
  title: '',
  slug: '',
  originalFile: null,
  diffFile: null,
  originalImage: null,
  diffImage: null,
  originalDataUrl: null,
  diffDataUrl: null,
  diffResult: null,
  size: { width: 0, height: 0 },
  targetLabels: [],
  activeTargetIndex: -1,
};

let creatorLastFocused = null;
let creatorAnalysisToken = 0;
let clientId = null;
let cachedAuthRaw = null;
let cachedAuthSession = null;

const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const SUPABASE_AUTH_STORAGE_KEY = (() => {
  try {
    const hostname = new URL(SUPABASE_URL).hostname;
    const ref = hostname.split('.')[0] || '';
    return ref ? `sb-${ref}-auth-token` : null;
  } catch (_) {
    return null;
  }
})();
const DEFAULT_PUZZLE_BUCKET = 'pixfind-puzzles';
const CONTEST_BUCKET = 'pixieed-contest';
const FALLBACK_PUZZLE_BUCKET = CONTEST_BUCKET;
const CONTEST_THUMB_SIZE = 256;
const SUPABASE_TABLE = 'pixfind_puzzles';
const CONTEST_TABLE = 'contest_entries';
const CONTEST_PROMPT_PREFIX = 'pixfind:';
const CONTEST_AUTHOR_NAME = 'PiXFiND';
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;
const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object`;
const CONTEST_PUBLIC_BASE = `${SUPABASE_STORAGE_URL}/public/${CONTEST_BUCKET}`;
const PIXFIND_SHARE_BASE_URL = 'https://pixieed.jp/pixfind/';
const PIXFIND_SHARE_OGP_WIDTH = 1200;
const PIXFIND_SHARE_OGP_HEIGHT = 630;
const PIXFIND_SHARE_PADDING = 56;
const PIXFIND_SHARE_GAP = 36;
const PIXFIND_SHARE_TITLE_SIZE = 32;
const CONTEST_SHARE_BASE_URL = 'https://pixieed.jp/contest/view.html';
const CONTEST_SHARE_OGP_WIDTH = 1200;
const CONTEST_SHARE_OGP_HEIGHT = 630;
const CONTEST_SHARE_PADDING = 60;
const CONTEST_SHARE_TITLE_SIZE = 32;
const SUPABASE_MAINTENANCE_KEY = 'pixieed_supabase_maintenance';
const PUBLISHED_CACHE_KEY = 'pixfind_published_cache';
const SHARE_QUEUE_KEY = 'pixfind_share_queue';
const SHARE_QUEUE_LIMIT = 20;
const CONTEST_SHARE_QUEUE_KEY = 'contest_share_queue';
const CONTEST_SHARE_QUEUE_LIMIT = 20;
const PENDING_CREATOR_UPLOAD_KEY = 'pixfind_creator_upload_v1';
const PUBLISH_QUEUE_KEY = 'pixfind_publish_queue';
const PUBLISH_QUEUE_LIMIT = 10;
const PUBLISH_QUEUE_RETRY_MS = 60000;
const PUBLISHED_CACHE_LIMIT = 60;
const PUZZLE_PLACEHOLDER_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#1f2937"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="18" y="18" width="204" height="144" rx="16" ry="16" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)"/><text x="50%" y="54%" text-anchor="middle" font-family="M PLUS Rounded 1c, sans-serif" font-size="18" fill="#e5e7eb">PiXFiND</text></svg>'
)}`;

let supabaseMaintenance = Boolean(readSupabaseMaintenance());
let publishQueueBusy = false;
let puzzleBucket = (typeof window !== 'undefined' && window.PIXFIND_STORAGE_BUCKET)
  ? window.PIXFIND_STORAGE_BUCKET
  : DEFAULT_PUZZLE_BUCKET;
let puzzleBucketFallbackUsed = false;

function normalizeGameMode(rawMode) {
  if (typeof rawMode !== 'string') return DEFAULT_GAME_MODE;
  const normalized = rawMode.trim().toLowerCase();
  if (normalized === GAME_MODE_HIDDEN_OBJECT) return GAME_MODE_HIDDEN_OBJECT;
  if (normalized === 'hidden' || normalized === 'hiddenobject' || normalized === 'object-find' || normalized === 'object-search') {
    return GAME_MODE_HIDDEN_OBJECT;
  }
  return GAME_MODE_SPOT_DIFFERENCE;
}

function getGameModeMeta(mode) {
  const normalized = normalizeGameMode(mode);
  return GAME_MODE_METADATA[normalized] ?? GAME_MODE_METADATA[DEFAULT_GAME_MODE];
}

function isHiddenObjectMode(mode = state.activeMode) {
  return normalizeGameMode(mode) === GAME_MODE_HIDDEN_OBJECT;
}

function normalizeTargetLabel(value, index = 0) {
  const raw = String(value ?? '').trim();
  return raw || `アイテム ${index + 1}`;
}

function normalizeComparableUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const base = (typeof window !== 'undefined' && window.location?.href) ? window.location.href : 'https://pixieed.jp/pixfind/';
    const url = new URL(raw, base);
    url.hash = '';
    return url.toString();
  } catch (_) {
    return raw;
  }
}

function inferPuzzleModeFromHints(hints = null) {
  if (!hints || typeof hints !== 'object') return null;
  const id = String(hints.id ?? '').trim().toLowerCase();
  if (id.startsWith('pixfind-ho-') || id.startsWith('pixfind-hidden-')) {
    return GAME_MODE_HIDDEN_OBJECT;
  }
  if (id.startsWith('pixfind-sd-')) {
    return GAME_MODE_SPOT_DIFFERENCE;
  }

  const slug = String(hints.slug ?? '').trim().toLowerCase();
  if (slug.startsWith('ho-') || slug.startsWith('hidden-') || slug.startsWith('object-')) {
    return GAME_MODE_HIDDEN_OBJECT;
  }
  if (slug.startsWith('sd-') || slug.startsWith('spot-')) {
    return GAME_MODE_SPOT_DIFFERENCE;
  }

  const original = normalizeComparableUrl(hints.original_url ?? hints.original);
  const diff = normalizeComparableUrl(hints.diff_url ?? hints.diff);
  const thumbnail = normalizeComparableUrl(hints.thumbnail_url ?? hints.thumbnail);
  if (thumbnail && original && thumbnail === original && (!diff || thumbnail !== diff)) {
    return GAME_MODE_HIDDEN_OBJECT;
  }
  if (thumbnail && diff && thumbnail === diff && (!original || thumbnail !== original)) {
    return GAME_MODE_SPOT_DIFFERENCE;
  }
  return null;
}

function resolvePuzzleMode(rawMode, targets = [], hints = null) {
  if (typeof rawMode === 'string' && rawMode.trim()) {
    return normalizeGameMode(rawMode);
  }
  if (Array.isArray(targets) && targets.length > 0) {
    return GAME_MODE_HIDDEN_OBJECT;
  }
  const inferred = inferPuzzleModeFromHints(hints);
  if (inferred) return inferred;
  return GAME_MODE_SPOT_DIFFERENCE;
}

function resolvePuzzleThumbnail(mode, original, diff, explicitThumbnail = null) {
  const normalizedMode = normalizeGameMode(mode);
  if (normalizedMode === GAME_MODE_HIDDEN_OBJECT) {
    return original || diff || explicitThumbnail || null;
  }
  return explicitThumbnail || diff || original || null;
}

function normalizePuzzleTargets(rawTargets) {
  let source = rawTargets;
  if (typeof source === 'string') {
    try {
      const parsed = JSON.parse(source);
      source = parsed;
    } catch (_) {
      source = source.split(',').map(part => part.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .map((target, index) => {
      if (typeof target === 'string') {
        return normalizeTargetLabel(target, index);
      }
      if (target && typeof target === 'object') {
        return normalizeTargetLabel(target.label ?? target.name ?? target.title ?? '', index);
      }
      return '';
    })
    .filter(Boolean);
}

function buildHiddenTargets(regions, labels = []) {
  return regions.map((region, index) => ({
    id: `target-${index + 1}`,
    regionId: region.id,
    label: normalizeTargetLabel(labels[index], index),
    found: false,
  }));
}

function getDifficultySelectionHint(mode = state.currentMode) {
  const modeMeta = getGameModeMeta(mode);
  return `${modeMeta.label}モードで遊ぶ難易度を選んでください。`;
}

function getRoundStartHint() {
  if (isHiddenObjectMode()) {
    const remaining = state.hiddenTargets.filter(target => !target.found).length;
    if (remaining > 0) {
      // For hidden-object mode we prefer to maximize the image area and
      // avoid a redundant hint text. The target panel already lists items.
      return '';
    }
    return '';
  }
  return '左右の画像を見比べて、違いをタップしてください。';
}

async function init() {
  ensureClientId();
  setActiveScreen('start');
  updateProgressLabel();
  setHint(getDifficultySelectionHint());
  if (supabaseMaintenance) {
    setSupabaseMaintenance(true, 'cached');
  }

  await loadOfficialPuzzles();
  selectGameMode(DEFAULT_GAME_MODE);
  selectDifficulty(1);
  if (!isLocalFileProtocol()) {
    flushPublishQueue().catch(error => console.warn('publish queue flush failed', error));
    flushShareQueue().catch(error => console.warn('share queue flush failed', error));
    schedulePublishQueueFlush();
  }
  await handleInitialPuzzleFromUrl();

  dom.startButton?.addEventListener('click', () => {
    setActiveScreen('difficulty');
  });

  dom.difficultyBackButton?.addEventListener('click', () => {
    setActiveScreen('start');
  });

  dom.gameBackButton?.addEventListener('click', () => {
    leaveGame('difficulty');
  });

  dom.backToTitleButton?.addEventListener('click', () => {
    leaveGame('start');
  });

  dom.resetButton?.addEventListener('click', () => {
    if (!state.currentPuzzle) return;
    resetRound();
  });

  dom.deletePuzzleButton?.addEventListener('click', () => {
    handleDeleteCurrentPuzzle();
  });

  initializeCanvasInteractions();
  setupCreator();
  await restorePendingCreatorUpload();

  dom.difficultyChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const level = Number(chip.dataset.difficulty);
      selectDifficulty(level);
    });
  });
  dom.modeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const mode = chip.dataset.gameMode;
      selectGameMode(mode);
    });
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (isCreatorOverlayOpen()) {
        event.preventDefault();
        closeCreatorOverlay();
        return;
      }
      if (dom.gameScreen && !dom.gameScreen.hidden) {
        leaveGame('difficulty');
      } else {
        setActiveScreen('start');
      }
    }
  });

}

function setupCreator() {
  if (!dom.creatorOverlay || !dom.creatorOpenButton) {
    return;
  }

  dom.creatorOpenButton.addEventListener('click', () => {
    openCreatorOverlay();
  });

  dom.creatorCloseButton?.addEventListener('click', () => {
    closeCreatorOverlay();
  });

  dom.creatorOverlay.addEventListener('click', event => {
    if (event.target === dom.creatorOverlay) {
      closeCreatorOverlay();
    }
  });

  dom.creatorForm?.addEventListener('submit', event => {
    event.preventDefault();
    handleCreatorAnalyze();
  });

  dom.creatorExportButton?.addEventListener('click', event => {
    event.preventDefault();
    handleCreatorPublish();
  });

  dom.creatorModeButtons.forEach(button => {
    button.addEventListener('click', () => {
      setCreatorMode(button.dataset.creatorMode || GAME_MODE_SPOT_DIFFERENCE);
    });
  });

  dom.creatorOriginalInput?.addEventListener('change', handleCreatorFileChange);
  dom.creatorDiffInput?.addEventListener('change', handleCreatorFileChange);

  resetCreatorForm();
}

function isCreatorOverlayOpen() {
  return Boolean(dom.creatorOverlay && !dom.creatorOverlay.hidden);
}

function openCreatorOverlay() {
  if (!dom.creatorOverlay) return;
  creatorLastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dom.creatorOverlay.hidden = false;
  dom.creatorOverlay.setAttribute('aria-hidden', 'false');
  if (dom.creatorTitleInput) {
    dom.creatorTitleInput.focus();
  }
  if (isSupabaseMaintenance()) {
    setCreatorStatus('メンテナンス中のため公開はキューに保存されます。');
  }
}

function closeCreatorOverlay() {
  if (!dom.creatorOverlay) return;
  dom.creatorOverlay.hidden = true;
  dom.creatorOverlay.setAttribute('aria-hidden', 'true');
  resetCreatorForm();
  if (creatorLastFocused) {
    creatorLastFocused.focus();
  }
  creatorLastFocused = null;
}

function resetCreatorForm() {
  creatorAnalysisToken += 1;
  if (dom.creatorForm) {
    dom.creatorForm.reset();
  }
  creatorState.mode = GAME_MODE_SPOT_DIFFERENCE;
  creatorState.difficulty = 1;
  creatorState.title = '';
  creatorState.slug = '';
  creatorState.originalFile = null;
  creatorState.diffFile = null;
  creatorState.originalImage = null;
  creatorState.diffImage = null;
  creatorState.originalDataUrl = null;
  creatorState.diffDataUrl = null;
  creatorState.diffResult = null;
  creatorState.size = { width: 0, height: 0 };
  creatorState.targetLabels = [];
  creatorState.activeTargetIndex = -1;
  setCreatorMode(creatorState.mode, true);
  clearCreatorPreview();
  renderCreatorTargetFields(0);
  if (dom.creatorSummary) {
    dom.creatorSummary.hidden = true;
  }
  setCreatorStatus('');
  setCreatorDifficulty(creatorState.difficulty, true);
  updateCreatorPublishAvailability();
}

async function restorePendingCreatorUpload() {
  let payload;
  try {
    const raw = localStorage.getItem(PENDING_CREATOR_UPLOAD_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_CREATOR_UPLOAD_KEY);
    payload = JSON.parse(raw);
  } catch (error) {
    console.warn('pending creator upload parse failed', error);
    return;
  }
  const originalDataUrl = payload?.originalDataUrl;
  const diffDataUrl = payload?.diffDataUrl;
  if (!originalDataUrl || !diffDataUrl) return;
  const suffix = payload?.canvasSize ? `${payload.canvasSize}px` : 'image';
  const [originalFile, diffFile] = await Promise.all([
    dataUrlToFile(originalDataUrl, `pixfind-${suffix}-original.png`),
    dataUrlToFile(diffDataUrl, `pixfind-${suffix}-diff.png`),
  ]);
  if (!originalFile || !diffFile) return;
  resetCreatorForm();
  openCreatorOverlay();
  const originalInput = dom.creatorOriginalInput;
  const diffInput = dom.creatorDiffInput;
  if (!originalInput || !diffInput) return;
  try {
    const originalTransfer = new DataTransfer();
    originalTransfer.items.add(originalFile);
    originalInput.files = originalTransfer.files;
    const diffTransfer = new DataTransfer();
    diffTransfer.items.add(diffFile);
    diffInput.files = diffTransfer.files;
  } catch (error) {
    console.warn('creator file inject failed', error);
    return;
  }
  handleCreatorFileChange();
}

function handleCreatorFileChange() {
  creatorState.originalFile = dom.creatorOriginalInput?.files?.[0] ?? null;
  creatorState.diffFile = dom.creatorDiffInput?.files?.[0] ?? null;
  creatorAnalysisToken += 1;
  creatorState.originalImage = null;
  creatorState.diffImage = null;
  creatorState.originalDataUrl = null;
  creatorState.diffDataUrl = null;
  creatorState.diffResult = null;
  creatorState.size = { width: 0, height: 0 };
  creatorState.targetLabels = [];
  creatorState.activeTargetIndex = -1;
  updateCreatorPublishAvailability();
  renderCreatorTargetFields(0);
  if (dom.creatorSummary) {
    dom.creatorSummary.hidden = true;
  }
  clearCreatorPreview();
  if (!creatorState.originalFile || !creatorState.diffFile) {
    setCreatorStatus('');
    return;
  }
  handleCreatorAnalyze();
}

function setCreatorDifficulty(level, silent = false) {
  const normalized = normalizeDifficulty(level);
  creatorState.difficulty = normalized;
  dom.creatorDifficultyButtons.forEach(button => {
    const isActive = Number(button.dataset.creatorDifficulty) === normalized;
    button.classList.toggle('is-active', isActive);
  });
  if (!silent) {
    creatorState.diffResult = null;
    creatorState.size = { width: 0, height: 0 };
    creatorState.targetLabels = [];
    creatorState.activeTargetIndex = -1;
    updateCreatorPublishAvailability();
    renderCreatorTargetFields(0);
    updateCreatorSummary(null);
    if (dom.creatorSummary) {
      dom.creatorSummary.hidden = true;
    }
    clearCreatorPreview();
    setCreatorStatus('難易度を変更しました。差分を再判定してください。');
  }
}

function setCreatorStatus(message, tone = 'info') {
  if (!dom.creatorStatus) return;
  const text = String(message ?? '');
  dom.creatorStatus.textContent = text;
  dom.creatorStatus.hidden = !text;
  if (!text) {
    delete dom.creatorStatus.dataset.tone;
    return;
  }
  if (tone === 'error') {
    dom.creatorStatus.dataset.tone = 'error';
  } else {
    delete dom.creatorStatus.dataset.tone;
  }
}

function setCreatorActionsEnabled(enabled) {
  const canPublish = enabled;
  if (dom.creatorExportButton) dom.creatorExportButton.disabled = !canPublish;
}

function setCreatorMode(mode, silent = false) {
  const normalizedMode = normalizeGameMode(mode);
  creatorState.mode = normalizedMode;
  creatorState.activeTargetIndex = -1;
  const isHiddenMode = isHiddenObjectMode(normalizedMode);

  dom.creatorModeButtons.forEach(button => {
    const active = normalizeGameMode(button.dataset.creatorMode) === normalizedMode;
    button.setAttribute('aria-pressed', String(active));
  });

  if (dom.creatorDescription) {
    dom.creatorDescription.textContent = isHiddenMode
      ? '元画像と探し物レイヤー（白地に黒で探し物を塗った2値画像）から探し物を自動検出します。'
      : '同じサイズの2枚の画像を選ぶと差分を自動検出します。';
  }
  if (dom.creatorDiffLabelText) {
    dom.creatorDiffLabelText.textContent = isHiddenMode ? '探し物レイヤー' : '間違い画像';
  }
  if (dom.creatorPreviewDiffCaption) {
    dom.creatorPreviewDiffCaption.textContent = isHiddenMode ? '探し物レイヤー' : '間違い';
  }
  if (dom.creatorModeNote) {
    dom.creatorModeNote.textContent = isHiddenMode
      ? '探し物レイヤーは白地に黒で作成してください。検出した番号ごとに探し物の名前を入力してください。'
      : '公開するとオンライン公開され、難易度一覧に追加されます。';
  }

  if (!isHiddenMode) {
    creatorState.targetLabels = [];
    renderCreatorTargetFields(0);
  }

  if (silent) {
    return;
  }

  creatorState.diffResult = null;
  creatorState.size = { width: 0, height: 0 };
  if (dom.creatorSummary) {
    dom.creatorSummary.hidden = true;
  }
  clearCreatorPreview();
  updateCreatorPublishAvailability();

  if (creatorState.originalFile && creatorState.diffFile) {
    handleCreatorAnalyze();
  } else {
    setCreatorStatus('');
  }
}

function setCreatorActiveTarget(index = -1) {
  const next = Number.isFinite(index) ? Math.floor(index) : -1;
  if (creatorState.activeTargetIndex === next) return;
  creatorState.activeTargetIndex = next;
  drawCreatorPreview();
  if (!dom.creatorTargetFields) return;
  const rows = Array.from(dom.creatorTargetFields.querySelectorAll('.creator-target-row'));
  rows.forEach((row, rowIndex) => {
    row.classList.toggle('is-active', rowIndex === next);
  });
}

function renderCreatorTargetFields(count) {
  if (!dom.creatorTargets || !dom.creatorTargetFields) return;
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const isHiddenMode = isHiddenObjectMode(creatorState.mode);
  setCreatorActiveTarget(-1);
  dom.creatorTargetFields.innerHTML = '';
  if (!isHiddenMode || normalizedCount <= 0) {
    dom.creatorTargets.hidden = true;
    return;
  }

  creatorState.targetLabels = Array.from({ length: normalizedCount }, (_, index) => {
    const existing = creatorState.targetLabels[index];
    return typeof existing === 'string' ? existing : '';
  });

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < normalizedCount; index += 1) {
    const label = document.createElement('label');
    label.className = 'creator-target-row';
    label.dataset.targetIndex = String(index);
    label.addEventListener('mouseenter', () => setCreatorActiveTarget(index));
    label.addEventListener('mouseleave', () => setCreatorActiveTarget(-1));

    const heading = document.createElement('span');
    heading.className = 'creator-target-index';
    heading.textContent = `#${index + 1}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'creator-target-input';
    input.maxLength = 24;
    input.placeholder = `探し物 ${index + 1}`;
    input.value = creatorState.targetLabels[index] || '';
    input.dataset.targetIndex = String(index);
    input.addEventListener('input', () => {
      const targetIndex = Number(input.dataset.targetIndex);
      creatorState.targetLabels[targetIndex] = input.value.trim();
      updateCreatorPublishAvailability();
    });
    input.addEventListener('focus', () => {
      const targetIndex = Number(input.dataset.targetIndex);
      setCreatorActiveTarget(targetIndex);
    });
    input.addEventListener('blur', () => {
      setCreatorActiveTarget(-1);
    });

    label.append(heading, input);
    fragment.append(label);
  }

  dom.creatorTargetFields.append(fragment);
  dom.creatorTargets.hidden = false;
}

function areCreatorTargetLabelsComplete() {
  if (!isHiddenObjectMode(creatorState.mode)) return true;
  const required = creatorState.diffResult?.regions?.length ?? 0;
  if (!required) return false;
  if (!Array.isArray(creatorState.targetLabels) || creatorState.targetLabels.length !== required) {
    return false;
  }
  return creatorState.targetLabels.every(label => String(label || '').trim().length > 0);
}

function getCreatorTargetLabels() {
  if (!isHiddenObjectMode(creatorState.mode)) return [];
  return (creatorState.targetLabels || []).map((label, index) => normalizeTargetLabel(label, index));
}

function updateCreatorPublishAvailability() {
  const hasAnalysis = Boolean(
    creatorState.diffResult &&
    creatorState.originalFile &&
    creatorState.diffFile &&
    creatorState.originalDataUrl &&
    creatorState.diffDataUrl,
  );
  const canPublish = hasAnalysis && areCreatorTargetLabelsComplete();
  setCreatorActionsEnabled(canPublish);
}

function updateCreatorSummary(diffResult, width, height) {
  if (!dom.creatorSummary || !dom.creatorDiffCount || !dom.creatorSize) return;
  if (!diffResult) {
    dom.creatorSummary.hidden = true;
    return;
  }
  dom.creatorDiffCount.textContent = String(diffResult.regions.length);
  dom.creatorSize.textContent = `${width}×${height}px`;
  dom.creatorSummary.hidden = false;
}

function clearCreatorPreview() {
  clearCanvas(creatorCtx.original, dom.creatorPreviewOriginal);
  clearCanvas(creatorCtx.diff, dom.creatorPreviewDiff);
}

function drawCreatorPreview() {
  if (!creatorState.originalImage || !creatorState.diffImage) return;
  drawCreatorPreviewCanvas(creatorCtx.original, dom.creatorPreviewOriginal, creatorState.originalImage, creatorState.diffResult);
  drawCreatorPreviewCanvas(creatorCtx.diff, dom.creatorPreviewDiff, creatorState.diffImage, creatorState.diffResult);
}

function drawCreatorPreviewCanvas(context, canvas, image, diffResult) {
  if (!context || !canvas || !image) return;
  canvas.width = image.width;
  canvas.height = image.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  if (!diffResult || !diffResult.regions.length) return;

  const hiddenMode = isHiddenObjectMode(creatorState.mode);
  const activeIndex = creatorState.activeTargetIndex;
  const strokeWidth = Math.max(2, Math.round(Math.min(image.width, image.height) / 160));
  diffResult.regions.forEach((region, index) => {
    const width = region.maxX - region.minX + 1;
    const height = region.maxY - region.minY + 1;
    const isActive = hiddenMode && index === activeIndex;
    context.lineWidth = isActive ? strokeWidth + 1 : strokeWidth;
    context.strokeStyle = isActive ? 'rgba(227, 70, 111, 0.98)' : 'rgba(255, 111, 141, 0.88)';
    context.fillStyle = isActive ? 'rgba(255, 111, 141, 0.34)' : 'rgba(255, 111, 141, 0.2)';
    context.fillRect(region.minX, region.minY, width, height);
    context.strokeRect(region.minX, region.minY, width, height);

    if (hiddenMode) {
      drawCreatorRegionIndexBadge(context, region, index, isActive, canvas.width, canvas.height);
    }
  });
}

function drawCreatorRegionIndexBadge(context, region, index, isActive, canvasWidth, canvasHeight) {
  const label = `#${index + 1}`;
  const centerX = Number.isFinite(region.centerX) ? region.centerX : (region.minX + region.maxX) / 2;
  const centerY = Number.isFinite(region.centerY) ? region.centerY : (region.minY + region.maxY) / 2;
  const fontSize = Math.max(10, Math.round(Math.min(canvasWidth, canvasHeight) / 17));
  const padX = Math.max(4, Math.round(fontSize * 0.34));
  const padY = Math.max(2, Math.round(fontSize * 0.24));

  context.save();
  context.font = `700 ${fontSize}px "M PLUS Rounded 1c", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const textWidth = context.measureText(label).width;
  const badgeWidth = Math.ceil(textWidth + padX * 2);
  const badgeHeight = Math.ceil(fontSize + padY * 2);
  const drawX = clamp(Math.round(centerX - badgeWidth / 2), 1, Math.max(1, canvasWidth - badgeWidth - 1));
  const drawY = clamp(Math.round(centerY - badgeHeight / 2), 1, Math.max(1, canvasHeight - badgeHeight - 1));

  context.fillStyle = isActive ? 'rgba(227, 70, 111, 0.94)' : 'rgba(36, 43, 73, 0.9)';
  context.strokeStyle = 'rgba(255,255,255,0.92)';
  context.lineWidth = 1;
  context.fillRect(drawX, drawY, badgeWidth, badgeHeight);
  context.strokeRect(drawX, drawY, badgeWidth, badgeHeight);

  context.fillStyle = '#ffffff';
  context.fillText(label, drawX + badgeWidth / 2, drawY + badgeHeight / 2 + 0.5);
  context.restore();
}

async function handleCreatorAnalyze() {
  const originalFile = dom.creatorOriginalInput?.files?.[0] ?? null;
  const diffFile = dom.creatorDiffInput?.files?.[0] ?? null;
  if (!originalFile || !diffFile) {
    setCreatorStatus('画像を選択してください。', 'error');
    return;
  }

  const token = ++creatorAnalysisToken;
  setCreatorStatus('画像を解析しています…');
  setCreatorActionsEnabled(false);

  try {
    const [rawOriginal, rawDiff] = await Promise.all([
      loadImageFromFile(originalFile),
      loadImageFromFile(diffFile),
    ]);
    if (token !== creatorAnalysisToken) return;

    const isHiddenMode = isHiddenObjectMode(creatorState.mode);
    let normalizedOriginal;
    let normalizedDiff;
    let hiddenPairInfo = null;
    if (isHiddenMode) {
      hiddenPairInfo = await normalizeHiddenModePair({
        originalImage: rawOriginal.image,
        originalDataUrl: rawOriginal.dataUrl,
        layerImage: rawDiff.image,
        layerDataUrl: rawDiff.dataUrl,
      });
      if (token !== creatorAnalysisToken) return;
      if (!hiddenPairInfo) {
        throw new Error('hidden mode normalize failed');
      }
      normalizedOriginal = hiddenPairInfo.normalizedOriginal;
      normalizedDiff = hiddenPairInfo.normalizedLayer;
    } else {
      [normalizedOriginal, normalizedDiff] = await Promise.all([
        normalizePixelImage(rawOriginal.image, rawOriginal.dataUrl),
        normalizePixelImage(rawDiff.image, rawDiff.dataUrl),
      ]);
    }
    if (token !== creatorAnalysisToken) return;

    if (normalizedOriginal.width !== normalizedDiff.width || normalizedOriginal.height !== normalizedDiff.height) {
      const sizeHint = hiddenPairInfo
        ? `（元画像 ${formatPixelSize(hiddenPairInfo.originalRawSize)} / レイヤー ${formatPixelSize(hiddenPairInfo.layerRawSize)}）`
        : '';
      setCreatorStatus(
        isHiddenMode
          ? `画像サイズが一致しません。2値レイヤーを元画像と同じサイズで書き出してください。${sizeHint}`
          : '画像サイズが一致しません。同じサイズの画像を選んでください。',
        'error',
      );
      creatorState.diffResult = null;
      creatorState.size = { width: 0, height: 0 };
      creatorState.targetLabels = [];
      clearCreatorPreview();
      renderCreatorTargetFields(0);
      updateCreatorSummary(null);
      updateCreatorPublishAvailability();
      return;
    }

    const diffResult = isHiddenMode
      ? computeHiddenObjectRegions(normalizedDiff.image, {
        minDistance: CREATOR_HIDDEN_OBJECT_MIN_DISTANCE,
      })
      : computeDifferenceRegions(normalizedOriginal.image, normalizedDiff.image, {
        mergeDistance: resolveMergeDistanceForSize(CREATOR_MERGE_DISTANCE, {
          width: normalizedOriginal.width,
          height: normalizedOriginal.height,
        }),
      });

    if (isHiddenMode && diffResult?.tooClosePair) {
      const left = diffResult.tooClosePair[0] + 1;
      const right = diffResult.tooClosePair[1] + 1;
      setCreatorStatus(`探し物 #${left} と #${right} が近すぎます。少なくとも2px以上離してください。`, 'error');
      creatorState.diffResult = null;
      creatorState.size = { width: 0, height: 0 };
      creatorState.targetLabels = [];
      clearCreatorPreview();
      renderCreatorTargetFields(0);
      updateCreatorSummary(null);
      updateCreatorPublishAvailability();
      return;
    }

    if (!diffResult || !diffResult.regions.length) {
      setCreatorStatus(
        isHiddenMode
          ? '探し物レイヤーの黒塗り部分からアイテムが検出できませんでした。'
          : '差分が見つかりませんでした。画像を確認してください。',
        'error',
      );
      creatorState.diffResult = null;
      creatorState.size = { width: 0, height: 0 };
      creatorState.targetLabels = [];
      clearCreatorPreview();
      renderCreatorTargetFields(0);
      updateCreatorSummary(null);
      updateCreatorPublishAvailability();
      return;
    }

    creatorState.originalFile = originalFile;
    creatorState.diffFile = diffFile;
    creatorState.originalImage = normalizedOriginal.image;
    creatorState.diffImage = normalizedDiff.image;
    creatorState.originalDataUrl = normalizedOriginal.dataUrl;
    creatorState.diffDataUrl = normalizedDiff.dataUrl;
    creatorState.diffResult = diffResult;
    creatorState.size = { width: normalizedOriginal.width, height: normalizedOriginal.height };
    creatorState.targetLabels = isHiddenMode
      ? Array.from({ length: diffResult.regions.length }, (_, index) => creatorState.targetLabels[index] || '')
      : [];
    creatorState.title = dom.creatorTitleInput?.value.trim() ?? '';
    creatorState.slug = dom.creatorSlugInput?.value.trim() ?? '';

    const estimatedDifficulty = estimatePuzzleDifficulty(diffResult);
    setCreatorDifficulty(estimatedDifficulty, true);

    drawCreatorPreview();
    renderCreatorTargetFields(isHiddenMode ? diffResult.regions.length : 0);
    updateCreatorSummary(diffResult, normalizedOriginal.width, normalizedOriginal.height);
    setCreatorStatus(
      isHiddenMode
        ? `探し物を${diffResult.regions.length}件検出しました。番号ごとに名前を入力してください。`
        : `差分を${diffResult.regions.length}箇所検出しました。内容を確認してください。`,
    );
    updateCreatorPublishAvailability();
  } catch (error) {
    console.error(error);
    creatorState.diffResult = null;
    creatorState.targetLabels = [];
    renderCreatorTargetFields(0);
    updateCreatorPublishAvailability();
    setCreatorStatus('画像の読み込みに失敗しました。', 'error');
  }
}

async function handleCreatorPublish() {
  if (!creatorState.diffResult || !creatorState.originalFile || !creatorState.diffFile) {
    setCreatorStatus('公開には差分の自動判定が必要です。', 'error');
    return;
  }
  if (!areCreatorTargetLabelsComplete()) {
    setCreatorStatus('すべての探し物名を入力してください。', 'error');
    return;
  }

  ensureClientId();
  const mode = normalizeGameMode(creatorState.mode);
  const targets = getCreatorTargetLabels();
  const authContext = getSupabaseAuthContext();
  const title = dom.creatorTitleInput?.value.trim() || 'カスタムパズル';
  const slug = getCreatorSlug();
  const difficulty = creatorState.difficulty;
  const puzzleId = createPuzzleId(mode);
  const postToContest = dom.creatorContestToggle ? dom.creatorContestToggle.checked : true;
  const authorName = getCreatorNickname();
  const authorXUrl = getCreatorXUrl();
  const clientIdValue = clientId;
  const userId = authContext.userId;
  const publishTask = {
    puzzleId,
    title,
    slug,
    difficulty,
    postToContest,
    mode,
    targets,
    authorName,
    authorXUrl,
    clientId: clientIdValue,
    userId,
    originalDataUrl: creatorState.originalDataUrl,
    diffDataUrl: creatorState.diffDataUrl,
    size: { ...creatorState.size },
  };

  if (isSupabaseMaintenance()) {
    const queued = queuePublishTask(publishTask);
    if (queued) {
      setCreatorStatus('メンテ中のためキューに保存しました。復旧後に自動投稿します。');
    } else {
      setCreatorStatus('キューへの保存に失敗しました。時間を置いて再試行してください。', 'error');
    }
    return;
  }

  if (dom.creatorExportButton) dom.creatorExportButton.disabled = true;
  setCreatorStatus('アップロード中です…');

  try {
    const [originalUpload, diffUpload] = await Promise.all([
      buildUploadPayload(creatorState.originalDataUrl, creatorState.originalFile),
      buildUploadPayload(creatorState.diffDataUrl, creatorState.diffFile),
    ]);
    if (!originalUpload || !diffUpload) {
      throw new Error('upload payload missing');
    }
    const originalPath = `puzzles/${puzzleId}/original.${originalUpload.extension}`;
    const diffPath = `puzzles/${puzzleId}/diff.${diffUpload.extension}`;

    const [originalUrl, diffUrl] = await Promise.all([
      uploadPuzzleFile(originalPath, originalUpload.blob, originalUpload.mimeType),
      uploadPuzzleFile(diffPath, diffUpload.blob, diffUpload.mimeType),
    ]);

    const payload = {
      id: puzzleId,
      slug,
      label: title,
      description: '',
      difficulty,
      mode,
      author_name: authorName,
      original_url: originalUrl,
      diff_url: diffUrl,
      thumbnail_url: resolvePuzzleThumbnail(mode, originalUrl, diffUrl) || diffUrl || originalUrl,
    };
    // Also include snake_case aliases to increase chance the DB schema accepts the mode column
    payload.game_mode = mode;
    payload.play_mode = mode;
    if (mode === GAME_MODE_HIDDEN_OBJECT && targets.length) {
      payload.targets = targets;
    }
    if (clientIdValue) {
      payload.client_id = clientIdValue;
    }
    if (authorXUrl) {
      payload.author_x_url = authorXUrl;
    }
    if (userId) {
      payload.user_id = userId;
    }

    const inserted = await insertPublishedPuzzle(payload);
    const normalized = normalizePublishedPuzzleEntry(inserted ?? payload, payload);
    if (normalized) {
      state.officialPuzzles = mergePuzzles(state.officialPuzzles, normalized);
      const published = state.officialPuzzles.filter(entry => entry.source === 'published');
      savePublishedCache(published);
      renderPuzzles(state.currentDifficulty, state.currentMode);
    }

    let contestPosted = false;
    if (postToContest) {
      try {
        const contestImage = creatorState.originalImage;
        const contestDataUrl = await buildNormalizedDataUrl(
          creatorState.originalImage,
          creatorState.originalDataUrl,
          creatorState.originalFile,
        );
        if (!contestDataUrl || !contestImage) {
          throw new Error('contest data missing');
        }
        const contestWidth = contestImage.naturalWidth || contestImage.width || creatorState.size.width;
        const contestHeight = contestImage.naturalHeight || contestImage.height || creatorState.size.height;
        const colors = countUniqueColors(contestImage);
        let contestUpload = null;
        try {
          contestUpload = await uploadContestImages({
            puzzleId,
            image: contestImage,
            dataUrl: contestDataUrl,
          });
        } catch (error) {
          console.warn('contest image upload failed', error);
        }
        let contestPayload = createContestPayload({
          puzzleId,
          title,
          imageUrl: contestUpload?.imageUrl,
          thumbUrl: contestUpload?.thumbUrl,
          dataUrl: contestDataUrl,
          width: contestWidth,
          height: contestHeight,
          colors,
          userId,
          clientId: clientIdValue,
        });
        let contestEntry = null;
        try {
          contestEntry = await insertContestEntry(contestPayload);
          contestPosted = true;
        } catch (error) {
          const msg = String(error?.message || '').toLowerCase();
          if (contestUpload && (msg.includes('image_url') || msg.includes('thumb_url'))) {
            contestPayload = createContestPayload({
              puzzleId,
              title,
              dataUrl: contestDataUrl,
              width: contestWidth,
              height: contestHeight,
              colors,
              userId,
              clientId: clientIdValue,
            });
            contestEntry = await insertContestEntry(contestPayload);
            contestPosted = true;
          } else {
            throw error;
          }
        }
        if (contestEntry?.id) {
          try {
            await uploadContestShareAssets({
              entryId: contestEntry.id,
              title,
              image: contestImage,
            });
          } catch (error) {
            queueContestShareTask({ entryId: contestEntry.id, title });
            markSupabaseMaintenanceFromError(error);
            console.warn('contest share asset creation failed', error);
          }
        }
      } catch (error) {
        console.warn('Contest post failed', error);
      }
    }

    const shareUrl = createShareUrl(normalized ?? { id: puzzleId, slug, source: 'published' });
    const contestMessage = postToContest
      ? (contestPosted ? 'コンテストにも投稿しました。' : 'コンテスト投稿は失敗しました。')
      : 'コンテスト投稿はオフです。';
    const bucketNote = puzzleBucketFallbackUsed
      ? `pixfind-puzzles バケットが見つからないため ${FALLBACK_PUZZLE_BUCKET} に保存しています。`
      : '';
    const statusSuffix = bucketNote ? ` ${bucketNote}` : '';
    const shareMessage = `${shareUrl}\n${SHARE_HASHTAG}`;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareMessage);
        setCreatorStatus(`公開しました。共有リンクをコピーしました。${contestMessage}${statusSuffix}`);
      } catch (_) {
        window.prompt(`公開しました。${contestMessage}共有リンクをコピーしてください。`, shareMessage);
        setCreatorStatus(`公開しました。${contestMessage}${statusSuffix}`);
      }
    } else {
      window.prompt(`公開しました。${contestMessage}共有リンクをコピーしてください。`, shareMessage);
      setCreatorStatus(`公開しました。${contestMessage}${statusSuffix}`);
    }
    closeCreatorOverlay();
  } catch (error) {
    console.error(error);
    if (isPermissionError(error)) {
      setCreatorStatus('投稿権限がありません。ログインまたは権限設定をご確認ください。', 'error');
      return;
    }
    if (isBucketNotFoundError(error)) {
      setCreatorStatus(`ストレージバケットが見つかりません。Supabaseに ${DEFAULT_PUZZLE_BUCKET} を作成してください。`, 'error');
      return;
    }
    const shouldQueue = isSupabaseMaintenance() || shouldMarkSupabaseMaintenance(error);
    if (shouldQueue) {
      markSupabaseMaintenanceFromError(error);
      const queued = queuePublishTask(publishTask);
      if (queued) {
        setCreatorStatus('メンテ中のためキューに保存しました。復旧後に自動投稿します。');
      } else {
        setCreatorStatus('公開に失敗しました。キュー保存にも失敗しました。', 'error');
      }
    } else {
      setCreatorStatus('公開に失敗しました。時間を置いて再試行してください。', 'error');
    }
  } finally {
    updateCreatorPublishAvailability();
  }
}

function getCreatorSlug() {
  const rawSlug = dom.creatorSlugInput?.value ?? '';
  const rawTitle = dom.creatorTitleInput?.value ?? '';
  const fromSlug = sanitizeSlug(rawSlug);
  if (fromSlug) return fromSlug;
  const fromTitle = sanitizeSlug(rawTitle);
  if (fromTitle) return fromTitle;
  return `custom-${Date.now().toString(36)}`;
}

function createPuzzleId(mode = DEFAULT_GAME_MODE) {
  const modePrefix = normalizeGameMode(mode) === GAME_MODE_HIDDEN_OBJECT ? 'ho' : 'sd';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pixfind-${modePrefix}-${crypto.randomUUID()}`;
  }
  return `pixfind-${modePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFileExtension(file) {
  if (!file) return 'png';
  const name = file.name || '';
  const dot = name.lastIndexOf('.');
  if (dot !== -1 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]+$/.test(ext)) {
      return ext;
    }
  }
  const type = (file.type || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('webp')) return 'webp';
  return 'png';
}

function getDataUrlMimeType(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match ? match[1] : null;
}

function getExtensionFromMimeType(mimeType) {
  if (!mimeType) return null;
  const lowered = mimeType.toLowerCase();
  if (lowered.includes('png')) return 'png';
  if (lowered.includes('jpeg') || lowered.includes('jpg')) return 'jpg';
  if (lowered.includes('webp')) return 'webp';
  return null;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error('data url parse failed');
  }
  return await response.blob();
}

async function buildUploadPayload(dataUrl, fallbackFile) {
  if (dataUrl) {
    const blob = await dataUrlToBlob(dataUrl);
    const mimeType = getDataUrlMimeType(dataUrl) || blob.type || fallbackFile?.type || 'image/png';
    const extension = getExtensionFromMimeType(mimeType) || getFileExtension(fallbackFile) || 'png';
    return { blob, mimeType, extension };
  }
  if (fallbackFile) {
    return {
      blob: fallbackFile,
      mimeType: fallbackFile.type || 'application/octet-stream',
      extension: getFileExtension(fallbackFile),
    };
  }
  return null;
}

function encodeStoragePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

async function uploadPuzzleFile(path, body, contentType = null, allowFallback = true) {
  if (!body) {
    throw new Error('upload body is missing');
  }
  const safePath = encodeStoragePath(path);
  const bucket = getPuzzleBucket();
  const url = `${SUPABASE_STORAGE_URL}/${bucket}/${safePath}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        'Content-Type': contentType || body.type || 'application/octet-stream',
      },
      body,
    });
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    markSupabaseMaintenanceFromError(null, response.status);
    const error = buildSupabaseError(`upload failed: ${response.status} ${detail}`, response.status, detail);
    if (allowFallback && shouldFallbackPuzzleBucket(error, bucket)) {
      setPuzzleBucket(FALLBACK_PUZZLE_BUCKET);
      puzzleBucketFallbackUsed = true;
      console.warn(`PiXFiND bucket missing. Falling back to ${FALLBACK_PUZZLE_BUCKET}.`);
      return await uploadPuzzleFile(path, body, contentType, false);
    }
    throw error;
  }
  noteSupabaseSuccess();
  return getSupabasePublicUrl(path);
}

async function uploadContestFile(path, body, contentType = null) {
  if (!body) {
    throw new Error('upload body is missing');
  }
  const safePath = encodeStoragePath(path);
  const url = `${SUPABASE_STORAGE_URL}/${CONTEST_BUCKET}/${safePath}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        'Content-Type': contentType || body.type || 'application/octet-stream',
      },
      body,
    });
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    markSupabaseMaintenanceFromError(null, response.status);
    throw buildSupabaseError(`upload failed: ${response.status} ${detail}`, response.status, detail);
  }
  noteSupabaseSuccess();
  return getContestPublicUrl(path);
}

async function insertPublishedPuzzle(payload, { removedColumns = [] } = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_REST_URL}/${SUPABASE_TABLE}`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    const missing = parseMissingColumn(detail);
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing) && !removedColumns.includes(missing)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload[missing];
      return insertPublishedPuzzle(fallbackPayload, { removedColumns: [...removedColumns, missing] });
    }
    markSupabaseMaintenanceFromError(null, response.status);
    throw buildSupabaseError(`insert failed: ${response.status} ${detail}`, response.status, detail);
  }
  const data = await response.json();
  noteSupabaseSuccess();
  return Array.isArray(data) ? data[0] : null;
}

async function updatePublishedPuzzle(id, patch, { removedColumns = [] } = {}) {
  if (!id || !patch || Object.keys(patch).length === 0) return null;
  const params = new URLSearchParams({
    id: `eq.${id}`,
  });
  let response;
  try {
    response = await fetch(`${SUPABASE_REST_URL}/${SUPABASE_TABLE}?${params.toString()}`, {
      method: 'PATCH',
      headers: {
        ...supabaseHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    });
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    const missing = parseMissingColumn(detail);
    if (missing && Object.prototype.hasOwnProperty.call(patch, missing) && !removedColumns.includes(missing)) {
      const nextPatch = { ...patch };
      delete nextPatch[missing];
      if (!Object.keys(nextPatch).length) return null;
      return updatePublishedPuzzle(id, nextPatch, { removedColumns: [...removedColumns, missing] });
    }
    markSupabaseMaintenanceFromError(null, response.status);
    throw buildSupabaseError(`update failed: ${response.status} ${detail}`, response.status, detail);
  }
  const data = await response.json();
  noteSupabaseSuccess();
  return Array.isArray(data) ? data[0] : null;
}

async function deletePublishedPuzzle(id, { userId = null, clientIdValue = null } = {}) {
  if (!id) return null;
  const params = new URLSearchParams({
    id: `eq.${id}`,
  });
  if (userId) {
    params.set('user_id', `eq.${userId}`);
  } else if (clientIdValue) {
    params.set('client_id', `eq.${clientIdValue}`);
  }
  let response;
  try {
    response = await fetch(`${SUPABASE_REST_URL}/${SUPABASE_TABLE}?${params.toString()}`, {
      method: 'DELETE',
      headers: {
        ...supabaseHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    });
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    markSupabaseMaintenanceFromError(null, response.status);
    throw buildSupabaseError(`delete failed: ${response.status} ${detail}`, response.status, detail);
  }
  const data = await response.json();
  noteSupabaseSuccess();
  return Array.isArray(data) ? data[0] : null;
}

async function insertContestEntry(payload, { removedColumns = [] } = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_REST_URL}/${CONTEST_TABLE}`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    const missing = parseMissingColumn(detail);
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing) && !removedColumns.includes(missing)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload[missing];
      return insertContestEntry(fallbackPayload, { removedColumns: [...removedColumns, missing] });
    }
    markSupabaseMaintenanceFromError(null, response.status);
    throw buildSupabaseError(`contest insert failed: ${response.status} ${detail}`, response.status, detail);
  }
  const data = await response.json();
  noteSupabaseSuccess();
  return Array.isArray(data) ? data[0] : null;
}

function mergePuzzles(list, puzzle) {
  const next = Array.isArray(list) ? [...list] : [];
  const index = next.findIndex(item => item.id === puzzle.id);
  if (index >= 0) {
    next[index] = puzzle;
    return next;
  }
  return [puzzle, ...next];
}

function sanitizeSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveAuthorName(entry, fallback = '名無し') {
  const candidate = entry?.author_name
    ?? entry?.author
    ?? entry?.nickname
    ?? entry?.name
    ?? entry?.authorName
    ?? '';
  const trimmed = String(candidate ?? '').trim();
  return trimmed || fallback;
}

function normalizeXUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, '');
      if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
        return url.toString();
      }
    } catch (_) {
      // ignore
    }
    return '';
  }
  const handle = raw.replace(/^@+/, '').trim();
  if (!handle) return '';
  const candidate = /^(x\.com|twitter\.com)\//i.test(handle)
    ? `https://${handle}`
    : `https://x.com/${handle}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
      return url.toString();
    }
  } catch (_) {
    // ignore
  }
  return '';
}

function resolveAuthorUrl(entry) {
  const candidate = entry?.author_x_url
    ?? entry?.author_url
    ?? entry?.authorUrl
    ?? entry?.authorXUrl
    ?? entry?.x_url
    ?? '';
  return normalizeXUrl(candidate);
}

function getCreatorNickname() {
  try {
    const raw = localStorage.getItem('pixieed_nickname') || '';
    const trimmed = raw.trim();
    if (trimmed) return trimmed.slice(0, 24);
  } catch (_) {
    // ignore
  }
  return '名無し';
}

function getCreatorXUrl() {
  try {
    const raw = localStorage.getItem('pixieed_x_url') || '';
    return normalizeXUrl(raw);
  } catch (_) {
    return '';
  }
}

function ensureClientId() {
  const KEY = 'pixieed_client_id';
  try {
    const saved = localStorage.getItem(KEY) || window.PIXIEED_CLIENT_ID;
    if (saved) {
      clientId = saved;
      if (!localStorage.getItem(KEY)) {
        localStorage.setItem(KEY, saved);
      }
      return;
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
    clientId = id;
  } catch (_) {
    clientId = `guest-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function readSupabaseSession() {
  if (!SUPABASE_AUTH_STORAGE_KEY) return null;
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) {
      cachedAuthRaw = null;
      cachedAuthSession = null;
      return null;
    }
    if (raw === cachedAuthRaw) {
      return cachedAuthSession;
    }
    const parsed = JSON.parse(raw);
    cachedAuthRaw = raw;
    cachedAuthSession = parsed && typeof parsed === 'object' ? parsed : null;
    return cachedAuthSession;
  } catch (_) {
    cachedAuthRaw = null;
    cachedAuthSession = null;
    return null;
  }
}

function getSupabaseAuthContext() {
  const session = readSupabaseSession();
  if (!session || !session.access_token) {
    return { userId: null, accessToken: '' };
  }
  const expiresAt = Number(session.expires_at || 0);
  if (expiresAt && Date.now() >= (expiresAt * 1000) - 30000) {
    return { userId: null, accessToken: '' };
  }
  return {
    userId: session.user?.id || null,
    accessToken: session.access_token || '',
  };
}

function supabaseHeaders() {
  const { accessToken } = getSupabaseAuthContext();
  const bearer = accessToken || SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${bearer}`,
    'x-client-id': clientId || '',
  };
}

function parseMissingColumn(detail) {
  if (!detail) return null;
  let message = String(detail);
  try {
    const parsed = JSON.parse(detail);
    if (parsed?.message) message = String(parsed.message);
  } catch (_) {
    // ignore
  }
  const match = message.match(/column \"([^\"]+)\"/) || message.match(/'([a-z0-9_]+)' column/i);
  return match ? match[1] : null;
}

function isPermissionError(error, status) {
  const code = Number(status ?? error?.status ?? error?.statusCode ?? 0);
  if (code === 401 || code === 403) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('permission') || msg.includes('not authorized') || msg.includes('row-level security');
}

function getPuzzleBucket() {
  return puzzleBucket;
}

function setPuzzleBucket(bucket) {
  if (!bucket) return;
  puzzleBucket = bucket;
}

function getSupabasePublicBase() {
  return `${SUPABASE_STORAGE_URL}/public/${getPuzzleBucket()}`;
}

function getSupabaseDetailMessage(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') {
    try {
      const parsed = JSON.parse(detail);
      return String(parsed?.message || parsed?.error || detail);
    } catch (_) {
      return detail;
    }
  }
  return String(detail);
}

function isBucketNotFoundError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('bucket not found') || (message.includes('bucket') && message.includes('not found'))) {
    return true;
  }
  const detailMessage = getSupabaseDetailMessage(error?.detail).toLowerCase();
  return detailMessage.includes('bucket not found') || (detailMessage.includes('bucket') && detailMessage.includes('not found'));
}

function shouldFallbackPuzzleBucket(error, bucket) {
  if (!isBucketNotFoundError(error)) return false;
  if (bucket !== DEFAULT_PUZZLE_BUCKET) return false;
  if (!FALLBACK_PUZZLE_BUCKET || FALLBACK_PUZZLE_BUCKET === bucket) return false;
  return true;
}

function buildSupabaseError(message, status, detail) {
  const err = new Error(message);
  if (typeof status !== 'undefined') {
    err.status = status;
  }
  if (detail) {
    err.detail = detail;
  }
  return err;
}

function readSupabaseMaintenance() {
  try {
    const raw = localStorage.getItem(SUPABASE_MAINTENANCE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.active) return data;
  } catch (_) {
    // ignore
  }
  return null;
}

function isSupabaseMaintenance() {
  return supabaseMaintenance;
}

function setSupabaseMaintenance(active, reason = '') {
  supabaseMaintenance = active;
  try {
    if (active) {
      localStorage.setItem(SUPABASE_MAINTENANCE_KEY, JSON.stringify({ active: true, reason, ts: Date.now() }));
    } else {
      localStorage.removeItem(SUPABASE_MAINTENANCE_KEY);
    }
  } catch (_) {
    // ignore
  }
  if (active) {
    if (!dom.app?.classList.contains('is-playing')) {
      setHint('現在メンテナンス中です。公開はキューに保存され、復旧後に自動投稿されます。');
    }
    if (isCreatorOverlayOpen()) {
      setCreatorStatus('メンテナンス中のため公開はキューに保存されます。');
    }
  }
  updateCreatorPublishAvailability();
}

function noteSupabaseSuccess() {
  if (supabaseMaintenance) {
    setSupabaseMaintenance(false);
  }
  if (!supabaseMaintenance) {
    if (loadPublishQueue().length) {
      flushPublishQueue().catch(error => console.warn('publish queue flush failed', error));
    }
    if (loadShareQueue().length) {
      flushShareQueue().catch(error => console.warn('share queue flush failed', error));
    }
  }
}

function shouldMarkSupabaseMaintenance(error, status) {
  if (status && status >= 500) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch failed') || msg.includes('503') || msg.includes('502') || msg.includes('504');
}

function markSupabaseMaintenanceFromError(error, status) {
  if (shouldMarkSupabaseMaintenance(error, status)) {
    setSupabaseMaintenance(true, 'network');
  }
}

async function probeSupabaseAvailability() {
  try {
    const response = await fetch(`${SUPABASE_REST_URL}/${SUPABASE_TABLE}?select=id&limit=1`, {
      headers: supabaseHeaders(),
    });
    if (response.ok) {
      noteSupabaseSuccess();
      return true;
    }
    markSupabaseMaintenanceFromError(null, response.status);
  } catch (error) {
    markSupabaseMaintenanceFromError(error);
  }
  return !isSupabaseMaintenance();
}

function loadPublishedCache() {
  try {
    const raw = localStorage.getItem(PUBLISHED_CACHE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map(normalizePublishedPuzzleEntry).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function savePublishedCache(items) {
  try {
    const trimmed = Array.isArray(items) ? items.slice(0, PUBLISHED_CACHE_LIMIT) : [];
    localStorage.setItem(PUBLISHED_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: trimmed }));
  } catch (_) {
    // ignore
  }
}

function loadPublishQueue() {
  try {
    const raw = localStorage.getItem(PUBLISH_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function savePublishQueue(queue) {
  try {
    localStorage.setItem(PUBLISH_QUEUE_KEY, JSON.stringify(queue.slice(0, PUBLISH_QUEUE_LIMIT)));
  } catch (_) {
    // ignore
  }
}

function normalizePublishTask(task) {
  if (!task) return null;
  const originalDataUrl = typeof task.originalDataUrl === 'string' ? task.originalDataUrl : '';
  const diffDataUrl = typeof task.diffDataUrl === 'string' ? task.diffDataUrl : '';
  if (!originalDataUrl || !diffDataUrl) return null;
  const mode = normalizeGameMode(task.mode);
  const puzzleId = task.puzzleId || createPuzzleId(mode);
  const title = task.title || 'カスタムパズル';
  const slug = task.slug || sanitizeSlug(title) || `custom-${puzzleId.slice(-6)}`;
  const difficulty = normalizeDifficulty(task.difficulty);
  const authorName = task.authorName || getCreatorNickname();
  const authorXUrl = task.authorXUrl || getCreatorXUrl();
  const targets = normalizePuzzleTargets(task.targets);
  const authContext = getSupabaseAuthContext();
  const userId = task.userId || authContext.userId || null;
  const clientIdValue = task.clientId || clientId || null;
  const size = task.size && Number.isFinite(task.size.width) && Number.isFinite(task.size.height)
    ? task.size
    : { width: 0, height: 0 };
  return {
    puzzleId,
    title,
    slug,
    difficulty,
    authorName,
    authorXUrl,
    clientId: clientIdValue,
    userId,
    postToContest: task.postToContest !== false,
    mode,
    targets,
    originalDataUrl,
    diffDataUrl,
    size,
  };
}

function queuePublishTask(task) {
  const normalized = normalizePublishTask(task);
  if (!normalized) return false;
  const queue = loadPublishQueue();
  const next = queue.filter(item => item.puzzleId !== normalized.puzzleId);
  next.unshift({ ...normalized, queuedAt: Date.now() });
  savePublishQueue(next);
  return true;
}

async function fetchPublishedPuzzleById(puzzleId) {
  const url = `${SUPABASE_REST_URL}/${SUPABASE_TABLE}?select=*&id=eq.${encodeURIComponent(puzzleId)}`;
  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }
  const data = await response.json();
  noteSupabaseSuccess();
  return Array.isArray(data) ? data[0] : null;
}

async function publishQueuedTask(task) {
  const normalized = normalizePublishTask(task);
  if (!normalized) return null;
  const {
    puzzleId,
    title,
    slug,
    difficulty,
    authorName,
    authorXUrl,
    clientId: clientIdValue,
    userId,
    postToContest,
    mode,
    targets,
    originalDataUrl,
    diffDataUrl,
    size,
  } = normalized;

  const [originalUpload, diffUpload] = await Promise.all([
    buildUploadPayload(originalDataUrl, null),
    buildUploadPayload(diffDataUrl, null),
  ]);
  if (!originalUpload || !diffUpload) {
    throw new Error('upload payload missing');
  }
  const originalPath = `puzzles/${puzzleId}/original.${originalUpload.extension}`;
  const diffPath = `puzzles/${puzzleId}/diff.${diffUpload.extension}`;
  const [originalUrl, diffUrl] = await Promise.all([
    uploadPuzzleFile(originalPath, originalUpload.blob, originalUpload.mimeType),
    uploadPuzzleFile(diffPath, diffUpload.blob, diffUpload.mimeType),
  ]);

  const payload = {
    id: puzzleId,
    slug,
    label: title,
    description: '',
    difficulty,
    mode,
    author_name: authorName,
    original_url: originalUrl,
    diff_url: diffUrl,
    thumbnail_url: resolvePuzzleThumbnail(mode, originalUrl, diffUrl) || diffUrl || originalUrl,
  };
  // Also include snake_case aliases to increase chance the DB schema accepts the mode column
  payload.game_mode = mode;
  payload.play_mode = mode;
  if (mode === GAME_MODE_HIDDEN_OBJECT && targets.length) {
    payload.targets = targets;
  }
  if (clientIdValue) {
    payload.client_id = clientIdValue;
  }
  if (authorXUrl) {
    payload.author_x_url = authorXUrl;
  }
  if (userId) {
    payload.user_id = userId;
  }

  let inserted = null;
  try {
    inserted = await insertPublishedPuzzle(payload);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('409')) {
      inserted = await fetchPublishedPuzzleById(puzzleId);
    } else {
      throw error;
    }
  }
  const normalizedEntry = normalizePublishedPuzzleEntry(inserted ?? payload, payload);
  if (normalizedEntry) {
    state.officialPuzzles = mergePuzzles(state.officialPuzzles, normalizedEntry);
    const published = state.officialPuzzles.filter(entry => entry.source === 'published');
    savePublishedCache(published);
    renderPuzzles(state.currentDifficulty, state.currentMode);
  }

  const originalImage = await loadImageFromDataUrl(originalDataUrl);

  if (postToContest) {
    try {
      const contestImage = originalImage;
      const contestDataUrl = await buildNormalizedDataUrl(
        originalImage,
        originalDataUrl,
        null,
      );
      if (!contestDataUrl || !contestImage) {
        throw new Error('contest data missing');
      }
      const contestWidth = contestImage.naturalWidth || contestImage.width || size.width || originalImage.width;
      const contestHeight = contestImage.naturalHeight || contestImage.height || size.height || originalImage.height;
      const colors = countUniqueColors(contestImage);
      let contestUpload = null;
      try {
        contestUpload = await uploadContestImages({
          puzzleId,
          image: contestImage,
          dataUrl: contestDataUrl,
        });
      } catch (error) {
        console.warn('contest image upload failed', error);
      }
      let contestPayload = createContestPayload({
        puzzleId,
        title,
        imageUrl: contestUpload?.imageUrl,
        thumbUrl: contestUpload?.thumbUrl,
        dataUrl: contestDataUrl,
        width: contestWidth,
        height: contestHeight,
        colors,
        userId,
        clientId: clientIdValue,
      });
      let contestEntry = null;
      try {
        contestEntry = await insertContestEntry(contestPayload);
      } catch (error) {
        const msg = String(error?.message || '').toLowerCase();
        if (contestUpload && (msg.includes('image_url') || msg.includes('thumb_url'))) {
          contestPayload = createContestPayload({
            puzzleId,
            title,
            dataUrl: contestDataUrl,
            width: contestWidth,
            height: contestHeight,
            colors,
            userId,
            clientId: clientIdValue,
          });
          contestEntry = await insertContestEntry(contestPayload);
        } else {
          throw error;
        }
      }
      if (contestEntry?.id) {
        try {
          await uploadContestShareAssets({
            entryId: contestEntry.id,
            title,
            image: contestImage,
          });
        } catch (error) {
          queueContestShareTask({ entryId: contestEntry.id, title });
          markSupabaseMaintenanceFromError(error);
          console.warn('contest share asset creation failed', error);
        }
      }
    } catch (error) {
      console.warn('Contest post failed', error);
    }
  }

  return normalizedEntry;
}

async function flushPublishQueue() {
  if (publishQueueBusy) return;
  const queue = loadPublishQueue();
  if (!queue.length) return;
  if (isSupabaseMaintenance()) {
    const recovered = await probeSupabaseAvailability();
    if (!recovered) return;
  }
  publishQueueBusy = true;
  const remaining = [];
  let postedCount = 0;
  for (const task of queue) {
    try {
      const result = await publishQueuedTask(task);
      if (result) postedCount += 1;
    } catch (error) {
      remaining.push(task);
      markSupabaseMaintenanceFromError(error);
      if (isSupabaseMaintenance()) break;
    }
  }
  savePublishQueue(remaining);
  publishQueueBusy = false;
  if (postedCount && isCreatorOverlayOpen()) {
    setCreatorStatus('キューに保存した投稿を自動公開しました。');
  }
}

function schedulePublishQueueFlush() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    flushPublishQueue().catch(error => console.warn('publish queue flush failed', error));
    flushShareQueue().catch(error => console.warn('share queue flush failed', error));
  });
  window.setInterval(() => {
    const hasPublishQueue = loadPublishQueue().length > 0;
    const hasShareQueue = loadShareQueue().length > 0;
    if (isSupabaseMaintenance() || hasPublishQueue || hasShareQueue) {
      flushPublishQueue().catch(error => console.warn('publish queue flush failed', error));
      flushShareQueue().catch(error => console.warn('share queue flush failed', error));
    }
  }, PUBLISH_QUEUE_RETRY_MS);
}

function loadShareQueue() {
  try {
    const raw = localStorage.getItem(SHARE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveShareQueue(queue) {
  try {
    localStorage.setItem(SHARE_QUEUE_KEY, JSON.stringify(queue.slice(0, SHARE_QUEUE_LIMIT)));
  } catch (_) {
    // ignore
  }
}

function queueShareTask(task) {
  if (!task?.puzzleId) return;
  const queue = loadShareQueue();
  const next = queue.filter(item => item.puzzleId !== task.puzzleId);
  next.unshift(task);
  saveShareQueue(next);
}

function loadContestShareQueue() {
  try {
    const raw = localStorage.getItem(CONTEST_SHARE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveContestShareQueue(queue) {
  try {
    localStorage.setItem(CONTEST_SHARE_QUEUE_KEY, JSON.stringify(queue.slice(0, CONTEST_SHARE_QUEUE_LIMIT)));
  } catch (_) {
    // ignore
  }
}

function queueContestShareTask(task) {
  if (!task?.entryId) return;
  const queue = loadContestShareQueue();
  const next = queue.filter(item => item.entryId !== task.entryId);
  next.unshift(task);
  saveContestShareQueue(next);
}

async function flushShareQueue() {
  const queue = loadShareQueue();
  if (!queue.length) return;
  // Puzzle share URLs are now always `?puzzle=...`; legacy queued OGP jobs can be discarded.
  saveShareQueue([]);
}

function getSupabasePublicUrl(path) {
  return `${getSupabasePublicBase()}/${path}`;
}

function getContestPublicUrl(path) {
  return `${CONTEST_PUBLIC_BASE}/${path}`;
}

function createContestPayload({
  puzzleId,
  title,
  imageUrl,
  thumbUrl,
  dataUrl,
  width,
  height,
  colors,
  userId,
  clientId: clientIdValue,
}) {
  const payload = {
    name: getCreatorNickname(),
    title: title || 'PiXFiND Puzzle',
    prompt: `${CONTEST_PROMPT_PREFIX}${puzzleId}`,
    mode: 'pixfind',
    started_at: null,
    submitted_at: new Date().toISOString(),
    width,
    height,
    colors: Number.isFinite(colors) ? colors : null,
  };
  const clientValue = clientIdValue || clientId || '';
  if (clientValue) {
    payload.client_id = clientValue;
  }
  if (userId) {
    payload.user_id = userId;
  }
  if (imageUrl) {
    payload.image_url = imageUrl;
  }
  if (thumbUrl) {
    payload.thumb_url = thumbUrl;
  }
  if (dataUrl) {
    payload.image_base64 = dataUrl;
  }
  return payload;
}

function countUniqueColors(image) {
  if (!image) return null;
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  let data;
  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch (error) {
    console.warn('Unable to count colors', error);
    return null;
  }
  const colors = new Set();
  for (let i = 0; i < data.length; i += 4) {
    colors.add(`${data[i]}-${data[i + 1]}-${data[i + 2]}-${data[i + 3]}`);
  }
  return colors.size;
}

function normalizePublishedPuzzleEntry(entry, fallback = null) {
  if (!entry && !fallback) return null;
  const primary = entry && typeof entry === 'object' ? entry : {};
  const secondary = fallback && typeof fallback === 'object' ? fallback : {};
  const source = { ...secondary, ...primary };
  const identifier = source.id ?? source.slug;
  if (!identifier) return null;
  const original = source.original_url ?? source.original ?? null;
  const diff = source.diff_url ?? source.diff ?? null;
  if (!original || !diff) return null;
  const targets = normalizePuzzleTargets(
    source.targets ?? source.target_items ?? source.targetItems ?? source.items,
  );
  const mode = resolvePuzzleMode(
    source.mode ?? source.game_mode ?? source.play_mode,
    targets,
  );
  const explicitThumbnail = source.thumbnail_url ?? source.thumbnail ?? null;
  return {
    id: source.id ?? identifier,
    slug: source.slug ?? identifier,
    label: source.label ?? source.slug ?? source.id ?? 'PiXFiND Puzzle',
    description: source.description ?? '',
    difficulty: normalizeDifficulty(source.difficulty),
    author: resolveAuthorName(source, '名無し'),
    authorUrl: resolveAuthorUrl(source),
    clientId: source.client_id ?? source.clientId ?? null,
    userId: source.user_id ?? source.userId ?? null,
    original,
    diff,
    mode,
    targets,
    thumbnail: resolvePuzzleThumbnail(mode, original, diff, explicitThumbnail),
    shareUrl: source.share_url ?? source.shareUrl ?? null,
    source: 'published',
    badge: '公開',
  };
}

async function loadPublishedPuzzles() {
  if (isLocalFileProtocol()) {
    return [];
  }
  const cached = loadPublishedCache();
  const cachedByKey = new Map();
  cached.forEach((entry) => {
    if (!entry) return;
    if (entry.id) cachedByKey.set(entry.id, entry);
    if (entry.slug) cachedByKey.set(entry.slug, entry);
  });
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
  });
  try {
    const response = await fetch(`${SUPABASE_REST_URL}/${SUPABASE_TABLE}?${params.toString()}`, {
      headers: supabaseHeaders(),
    });
    if (!response.ok) {
      console.warn('Failed to load published puzzles', response.status);
      markSupabaseMaintenanceFromError(null, response.status);
      return cached.length ? cached : [];
    }
    const data = await response.json();
    if (!Array.isArray(data)) return cached.length ? cached : [];
    const normalized = data.map((entry) => {
      const key = entry?.id ?? entry?.slug;
      const fallback = key ? cachedByKey.get(key) : null;
      return normalizePublishedPuzzleEntry(entry, fallback);
    }).filter(Boolean);
    savePublishedCache(normalized);
    noteSupabaseSuccess();
    return normalized;
  } catch (error) {
    console.warn('Failed to load published puzzles', error);
    markSupabaseMaintenanceFromError(error);
    return cached.length ? cached : [];
  }
}

async function loadOfficialPuzzles() {
  let basePuzzles = [];
  const localManifest = Array.isArray(window.PIXFIND_OFFICIAL_PUZZLES)
    ? window.PIXFIND_OFFICIAL_PUZZLES
    : null;
  if (isLocalFileProtocol()) {
    if (localManifest?.length) {
      basePuzzles = localManifest.map(normalizePuzzleEntry).filter(Boolean);
    }
    if (!basePuzzles.length) {
      basePuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
    }
    state.officialPuzzles = [...basePuzzles].filter(Boolean);
    renderPuzzles(state.currentDifficulty, state.currentMode);
    return;
  }

  try {
    const response = await fetch('assets/puzzles/manifest.json', { cache: 'no-store' });
    if (!response.ok) {
      console.warn('Could not load puzzles manifest');
      basePuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
    } else {
      const data = await response.json();
      if (Array.isArray(data)) {
        basePuzzles = data.map(normalizePuzzleEntry).filter(Boolean);
      }
      if (!basePuzzles.length) {
        basePuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
      }
    }
  } catch (error) {
    console.warn('Failed to load puzzles manifest', error);
    if (localManifest?.length) {
      basePuzzles = localManifest.map(normalizePuzzleEntry).filter(Boolean);
    }
    if (!basePuzzles.length) {
      basePuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
    }
  }
  const publishedPuzzles = await loadPublishedPuzzles();
  state.officialPuzzles = [...basePuzzles, ...publishedPuzzles].filter(Boolean);
  renderPuzzles(state.currentDifficulty, state.currentMode);
}

function getPuzzleIdFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const searchValue = params.get('puzzle');
  if (searchValue && searchValue.trim()) {
    return searchValue.trim();
  }
  const { hash } = window.location;
  if (hash && hash.startsWith('#puzzle=')) {
    const rawValue = hash.slice('#puzzle='.length);
    return rawValue.trim() ? decodeURIComponent(rawValue.trim()) : null;
  }
  return null;
}

async function handleInitialPuzzleFromUrl() {
  const puzzleId = getPuzzleIdFromLocation();
  if (!puzzleId) return;

  const puzzle = state.officialPuzzles.find(entry => entry.id === puzzleId || entry.slug === puzzleId);
  if (!puzzle) {
    console.warn(`Puzzle with id "${puzzleId}" was not found in manifest.`);
    setHint('指定されたパズルが見つかりませんでした。タイトル画面から選択してください。');
    return;
  }

  selectGameMode(puzzle.mode);
  selectDifficulty(puzzle.difficulty);
  await startOfficialPuzzle(puzzle);
}

function normalizeDifficulty(rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  const rounded = Math.round(numeric);
  return Math.min(Math.max(rounded, 1), 3);
}

function estimatePuzzleDifficulty(diffResult) {
  if (!diffResult || !diffResult.regions?.length) return 1;
  const totalPixels = diffResult.width * diffResult.height;
  if (!Number.isFinite(totalPixels) || totalPixels <= 0) return 1;

  const regionCount = diffResult.regions.length;
  const diffPixels = diffResult.regions.reduce((sum, region) => sum + (region.count ?? 0), 0);
  const diffRatio = diffPixels / totalPixels;
  const avgRegionRatio = diffPixels / regionCount / totalPixels;
  const smallRegionRatioThreshold = 0.001; // <= 0.1% of total pixels
  const smallRegionCount = diffResult.regions.reduce((sum, region) => {
    const ratio = (region.count ?? 0) / totalPixels;
    return sum + (ratio <= smallRegionRatioThreshold ? 1 : 0);
  }, 0);

  // Heuristic: fewer and smaller differences are harder.
  let score = 0;
  if (regionCount <= 3) {
    score += 2;
  } else if (regionCount <= 6) {
    score += 1;
  }

  if (diffRatio <= 0.004) {
    score += 2;
  } else if (diffRatio <= 0.012) {
    score += 1;
  }

  if (avgRegionRatio <= 0.0012) {
    score += 1;
  }

  // Heuristic: many small differences increase difficulty.
  if (smallRegionCount >= 6) {
    score += 2;
  } else if (smallRegionCount >= 3) {
    score += 1;
  }

  if (score >= 4) return 3;
  if (score >= 2) return 2;
  return 1;
}

function normalizePuzzleEntry(entry) {
  if (!entry) return null;
  const identifier = entry.id ?? entry.slug;
  if (!identifier) return null;
  const original = entry.original ?? null;
  const diff = entry.diff ?? null;
  if (!original || !diff) return null;
  const targets = normalizePuzzleTargets(entry.targets);
  const mode = resolvePuzzleMode(entry.mode, targets);
  return {
    id: entry.id ?? identifier,
    slug: entry.slug ?? identifier,
    label: entry.label ?? entry.slug ?? entry.id ?? 'PiXFiND Puzzle',
    description: entry.description ?? '',
    difficulty: normalizeDifficulty(entry.difficulty),
    author: resolveAuthorName(entry, '公式'),
    authorUrl: resolveAuthorUrl(entry),
    clientId: entry.client_id ?? entry.clientId ?? null,
    original,
    diff,
    mode,
    targets,
    thumbnail: resolvePuzzleThumbnail(mode, original, diff, entry.thumbnail ?? null),
    source: 'official',
    badge: '公式',
  };
}

function createShareUrl(puzzle) {
  const url = new URL(window.location.href);
  const shareId = puzzle?.source === 'published' ? puzzle.id : (puzzle.slug ?? puzzle.id);
  if (shareId) {
    url.searchParams.set('puzzle', shareId);
  }
  url.hash = '';
  return url.toString();
}

async function sharePuzzle(puzzle) {
  const shareUrl = createShareUrl(puzzle);
  const modeLabel = getGameModeMeta(puzzle?.mode).label;
  const shareText = `${modeLabel} | ${puzzle.label}（${createStarLabel(puzzle.difficulty)}）に挑戦してみてください。\n${SHARE_HASHTAG}`;
  const shareMessage = `${shareText}\n${shareUrl}`;
  const shareData = {
    title: `PiXFiND | ${puzzle.label}`,
    text: shareText,
    url: shareUrl,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.warn('Failed to invoke native share dialog', error);
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareMessage);
      window.alert('共有リンクをコピーしました。');
      return;
    } catch (error) {
      console.warn('Failed to copy share URL to clipboard', error);
    }
  }

  window.prompt('共有リンクをコピーしてください。', shareMessage);
}

function resolveMergeDistanceForSize(baseDistance, size) {
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  if (!width || !height) {
    return baseDistance;
  }
  const minDim = Math.min(width, height);
  let scale = 1;
  if (minDim > MERGE_DISTANCE_SIZE_TIER_2) {
    scale = 3;
  } else if (minDim > MERGE_DISTANCE_SIZE_TIER_1) {
    scale = 2;
  }
  const boundedScale = Math.min(scale, MERGE_DISTANCE_MAX_SCALE);
  const scaledDistance = Math.round(baseDistance * boundedScale);
  return Math.max(1, Math.min(scaledDistance, MERGE_DISTANCE_MAX_ABS));
}

function resolveRegionMergeDistance(difficultyOverride = null, size = null) {
  const normalized = normalizeDifficulty(
    difficultyOverride ?? state.currentPuzzle?.difficulty ?? state.currentDifficulty ?? 1,
  );
  const base = REGION_MERGE_DISTANCE_BY_DIFFICULTY[normalized] ?? REGION_MERGE_DISTANCE_BY_DIFFICULTY[1];
  return resolveMergeDistanceForSize(base, size);
}

function resolveBuildVersionToken() {
  const meta = document.querySelector('meta[name="build-version"]')?.content;
  const sanitizedMeta = meta?.trim();
  if (sanitizedMeta) {
    return sanitizedMeta;
  }
  const parsed = Date.parse(document.lastModified || '');
  const timestamp = Number.isNaN(parsed) ? Date.now() : parsed;
  return `pixfind-${timestamp}`;
}

function setActiveScreen(target) {
  const mapping = {
    start: dom.startScreen,
    difficulty: dom.difficultyScreen,
    game: dom.gameScreen,
  };

  Object.entries(mapping).forEach(([key, element]) => {
    if (!element) return;
    const active = key === target;
    element.hidden = !active;
    element.setAttribute('aria-hidden', String(!active));
  });

  if (target === 'game') {
    dom.app?.classList.add('is-playing');
    dom.app?.classList.toggle('is-hidden-object-mode', isHiddenObjectMode());
    document.body.classList.add('is-playing');
    // Prevent iOS pull-to-refresh / browser-close when entering game
    enablePreventPullToClose();
    requestAnimationFrame(() => {
      fitCanvasesToFrame();
      clearMarkers();
      state.differences.filter(region => region.found).forEach(region => renderMarker(region));
      paintAllMissMarkers();
    });
  } else {
    dom.app?.classList.remove('is-playing');
    dom.app?.classList.remove('is-hidden-object-mode');
    document.body.classList.remove('is-playing');
    // Restore default touch handling when leaving game
    disablePreventPullToClose();
  }
}

// ----- Prevent accidental browser close on iOS while playing -----
let _pixfindPreventTouchMoveHandler = null;
function enablePreventPullToClose() {
  if (typeof window === 'undefined') return;
  if (_pixfindPreventTouchMoveHandler) return;
  // Block global touchmove to avoid overscroll behaviors (passive:false required)
  _pixfindPreventTouchMoveHandler = function (e) {
    // Allow multi-touch gestures (pinch) to pass through
    if (e.touches && e.touches.length > 1) return;
    // Allow interactions that originate inside elements that explicitly allow scrolling
    // If the touch target is inside a scrollable element, do not block to allow inner scroll.
    const el = e.target;
    let node = el;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const overflowY = style?.overflowY || '';
      if (overflowY === 'auto' || overflowY === 'scroll') return;
      node = node.parentElement;
    }
    e.preventDefault();
  };
  window.addEventListener('touchmove', _pixfindPreventTouchMoveHandler, { passive: false });
}

function disablePreventPullToClose() {
  if (!_pixfindPreventTouchMoveHandler) return;
  window.removeEventListener('touchmove', _pixfindPreventTouchMoveHandler, { passive: false });
  _pixfindPreventTouchMoveHandler = null;
}

function selectGameMode(mode) {
  const normalizedMode = normalizeGameMode(mode);
  state.currentMode = normalizedMode;
  const modeMeta = getGameModeMeta(normalizedMode);
  dom.modeChips.forEach(chip => {
    const isActive = normalizeGameMode(chip.dataset.gameMode) === normalizedMode;
    chip.setAttribute('aria-pressed', String(isActive));
  });
  if (dom.modeDescription) {
    dom.modeDescription.textContent = modeMeta.description;
  }
  renderPuzzles(state.currentDifficulty, normalizedMode);
  if (!state.currentPuzzle) {
    setHint(getDifficultySelectionHint(normalizedMode));
  }
}

function selectDifficulty(level) {
  state.currentDifficulty = level;
  dom.difficultyChips.forEach(chip => {
    const isActive = Number(chip.dataset.difficulty) === level;
    chip.setAttribute('aria-pressed', String(isActive));
  });
  renderPuzzles(level, state.currentMode);
}

function renderPuzzles(level, mode = state.currentMode) {
  if (!dom.puzzleList) return;
  dom.puzzleList.innerHTML = '';

  const normalizedMode = normalizeGameMode(mode);
  const official = state.officialPuzzles.filter(puzzle => (
    puzzle.difficulty === level && normalizeGameMode(puzzle.mode) === normalizedMode
  ));
  official.forEach((puzzle, idx) => {
    dom.puzzleList.append(createOfficialCard(puzzle));
    if ((idx + 1) % 9 === 0) {
      dom.puzzleList.append(createPuzzleAdCard());
    }
  });

  if (!official.length) {
    const info = document.createElement('p');
    info.className = 'section-subtitle';
    info.textContent = `${getGameModeMeta(normalizedMode).label}の公式パズルはまだありません。`;
    dom.puzzleList.append(info);
  }

  try {
    if (window.pixieedObserveAds) {
      window.pixieedObserveAds(dom.puzzleList);
    }
  } catch (error) {
    console.warn('ads render skipped', error);
  }
}

function createPuzzleAdCard() {
  const card = document.createElement('div');
  card.className = 'puzzle-card puzzle-card--ad';
  card.innerHTML = `
    <div class="puzzle-ad-slot">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-9801602250480253"
           data-ad-slot="rotate"></ins>
    </div>
    <small class="puzzle-ad-note">広告</small>
  `;
  return card;
}

function renderGameAuthor(puzzle) {
  const authorEl = dom.gameAuthor;
  if (!authorEl) return;
  authorEl.textContent = '';
  const name = puzzle?.author || '';
  if (!name) {
    authorEl.hidden = true;
    return;
  }
  authorEl.hidden = false;
  const prefix = document.createElement('span');
  prefix.textContent = 'by ';
  authorEl.appendChild(prefix);
  const url = normalizeXUrl(puzzle?.authorUrl || '');
  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.textContent = name;
    link.target = '_blank';
    link.rel = 'noopener';
    authorEl.appendChild(link);
  } else {
    const label = document.createElement('span');
    label.textContent = name;
    authorEl.appendChild(label);
  }
}

function canDeletePuzzle(puzzle) {
  if (!puzzle) return false;
  if (puzzle.source !== 'published') return false;
  const authContext = getSupabaseAuthContext();
  if (puzzle.userId && authContext.userId && puzzle.userId === authContext.userId) {
    return true;
  }
  ensureClientId();
  if (!puzzle.clientId || !clientId) return false;
  return puzzle.clientId === clientId;
}

function updateDeleteButton(puzzle) {
  const btn = dom.deletePuzzleButton;
  if (!btn) return;
  const show = canDeletePuzzle(puzzle);
  btn.hidden = !show;
}

function createOfficialCard(puzzle) {
  const card = document.createElement('article');
  const badgeText = puzzle.badge ?? '公式';
  const modeMeta = getGameModeMeta(puzzle.mode);
  const badgeClass = puzzle.source === 'published' ? 'puzzle-card__badge puzzle-card__badge--published' : 'puzzle-card__badge';
  card.className = `puzzle-card puzzle-card--official${puzzle.source === 'published' ? ' puzzle-card--published' : ''}`;
  card.role = 'button';
  card.tabIndex = 0;
  card.dataset.puzzleId = puzzle.id;
  card.innerHTML = `
    <span class="${badgeClass}" aria-hidden="true">${badgeText}</span>
    <div class="puzzle-card__thumb puzzle-card__thumb--image">
      <img src="${puzzle.thumbnail}" alt="${puzzle.label} のプレビュー" />
    </div>
    <div class="puzzle-card__meta">
      <h4 class="puzzle-card__title">${puzzle.label}</h4>
      ${puzzle.description ? `<p class="puzzle-card__description">${puzzle.description}</p>` : ''}
      <span class="puzzle-card__mode">${modeMeta.label}</span>
      <span class="puzzle-card__author">${puzzle.author || '名無し'}</span>
    </div>
    <div class="puzzle-card__actions">
      <button type="button" class="button button--primary button--compact puzzle-card__play" aria-label="${puzzle.label} をプレイする">
        プレイ
      </button>
      <button type="button" class="button button--ghost button--compact puzzle-card__share" aria-label="${puzzle.label} をシェアする">
        シェア
      </button>
    </div>
  `;

  const thumbImage = card.querySelector('.puzzle-card__thumb img');
  if (thumbImage) {
    thumbImage.setAttribute('draggable', 'false');
    thumbImage.setAttribute('aria-hidden', 'true');
    if (!puzzle.thumbnail) {
      thumbImage.src = PUZZLE_PLACEHOLDER_DATA_URL;
    }
    thumbImage.addEventListener('error', () => {
      thumbImage.src = PUZZLE_PLACEHOLDER_DATA_URL;
    });
    ['pointerdown', 'touchstart', 'mousedown', 'contextmenu'].forEach((type) => {
      thumbImage.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
      }, { passive: false });
    });
  }

  const handleSelect = () => {
    startOfficialPuzzle(puzzle);
  };

  card.addEventListener('click', handleSelect);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    }
  });

  const playButton = card.querySelector('.puzzle-card__play');
  playButton?.addEventListener('click', event => {
    event.stopPropagation();
    event.preventDefault();
    handleSelect();
  });
  playButton?.addEventListener('keydown', event => {
    event.stopPropagation();
  });

  const shareButton = card.querySelector('.puzzle-card__share');
  shareButton?.addEventListener('click', event => {
    event.stopPropagation();
    event.preventDefault();
    sharePuzzle(puzzle);
  });
  shareButton?.addEventListener('keydown', event => {
    event.stopPropagation();
  });

  return card;
}

async function startOfficialPuzzle(puzzle) {
  if (!puzzle?.original || !puzzle?.diff) {
    setHint('このパズルを読み込めませんでした。');
    return;
  }
  try {
    const mode = normalizeGameMode(puzzle.mode);
    setHint('画像を読み込んでいます…');
    const [rawOriginal, rawChallenge] = await Promise.all([
      loadImageFromUrl(puzzle.original),
      loadImageFromUrl(puzzle.diff),
    ]);
    if (!rawOriginal || !rawChallenge) {
      setHint('画像の読み込みに失敗しました。');
      return;
    }
    let normalizedOriginal;
    let normalizedChallenge;
    let hiddenPairInfo = null;
    if (mode === GAME_MODE_HIDDEN_OBJECT) {
      hiddenPairInfo = await normalizeHiddenModePair({
        originalImage: rawOriginal,
        originalDataUrl: null,
        layerImage: rawChallenge,
        layerDataUrl: null,
      });
      if (!hiddenPairInfo) {
        setHint('もの探し画像の読み込みに失敗しました。');
        return;
      }
      normalizedOriginal = hiddenPairInfo.normalizedOriginal;
      normalizedChallenge = hiddenPairInfo.normalizedLayer;
    } else {
      [normalizedOriginal, normalizedChallenge] = await Promise.all([
        normalizePixelImage(rawOriginal, null),
        normalizePixelImage(rawChallenge, null),
      ]);
    }
    const originalImage = normalizedOriginal.image;
    const challengeImage = normalizedChallenge.image;
    if (originalImage.width !== challengeImage.width || originalImage.height !== challengeImage.height) {
      setHint(
        mode === GAME_MODE_HIDDEN_OBJECT
          ? `もの探し画像のサイズが一致しません。元画像 ${formatPixelSize(hiddenPairInfo?.originalRawSize)} / レイヤー ${formatPixelSize(hiddenPairInfo?.layerRawSize)}`
          : '公式画像のサイズが一致しません。',
      );
      return;
    }

    const diffResult = mode === GAME_MODE_HIDDEN_OBJECT
      ? computeHiddenObjectRegions(challengeImage, { minDistance: CREATOR_HIDDEN_OBJECT_MIN_DISTANCE })
      : computeDifferenceRegions(originalImage, challengeImage, { difficulty: puzzle.difficulty });
    if (!diffResult || !diffResult.regions.length) {
      setHint(mode === GAME_MODE_HIDDEN_OBJECT ? '探し物が見つかりませんでした。' : '差分が見つかりませんでした。');
      return;
    }
    if (mode === GAME_MODE_HIDDEN_OBJECT && diffResult.tooClosePair) {
      setHint('探し物の配置が近すぎるため、この問題は読み込めません。');
      return;
    }

    const metadata = {
      id: puzzle.id,
      name: puzzle.label,
      difficulty: puzzle.difficulty,
      size: `${originalImage.width}×${originalImage.height}px`,
      source: puzzle.source || 'official',
      mode,
      targets: normalizePuzzleTargets(puzzle.targets),
      author: puzzle.author || '',
      authorUrl: puzzle.authorUrl || '',
      clientId: puzzle.clientId || null,
      userId: puzzle.userId || null,
    };
    prepareGameBoard(
      originalImage,
      mode === GAME_MODE_HIDDEN_OBJECT ? originalImage : challengeImage,
      diffResult,
      metadata,
    );
    dom.gameTitle.textContent = metadata.name;
    renderGameAuthor(metadata);
    updateDeleteButton(metadata);
    setActiveScreen('game');
    resetRound();
  } catch (error) {
    console.error(error);
    setHint('パズルの読み込みに失敗しました。');
  }
}

async function handleDeleteCurrentPuzzle() {
  const puzzle = state.currentPuzzle;
  if (!canDeletePuzzle(puzzle)) {
    setHint('このパズルは削除できません。');
    return;
  }
  if (!confirm('このパズルを削除しますか？')) {
    return;
  }
  setHint('削除しています...');
  try {
    const authContext = getSupabaseAuthContext();
    ensureClientId();
    const canDeleteByUser = puzzle.userId && authContext.userId && puzzle.userId === authContext.userId;
    const canDeleteByClient = puzzle.clientId && clientId && puzzle.clientId === clientId;
    await deletePublishedPuzzle(puzzle.id, {
      userId: canDeleteByUser ? authContext.userId : null,
      clientIdValue: !canDeleteByUser && canDeleteByClient ? clientId : null,
    });
    state.officialPuzzles = state.officialPuzzles.filter(entry => entry.id !== puzzle.id);
    const published = state.officialPuzzles.filter(entry => entry.source === 'published');
    savePublishedCache(published);
    renderPuzzles(state.currentDifficulty, state.currentMode);
    leaveGame('difficulty');
    setHint('パズルを削除しました。');
  } catch (error) {
    console.warn('delete puzzle failed', error);
    setHint('削除に失敗しました。');
  }
}

function prepareGameBoard(originalImage, challengeImage, diffResult, metadata = null) {
  const activeMode = normalizeGameMode(metadata?.mode ?? state.currentMode);
  state.imageSize = { width: originalImage.width, height: originalImage.height };
  const orderedRegions = [...diffResult.regions].sort((a, b) => (
    a.minY - b.minY || a.minX - b.minX
  ));
  state.differences = orderedRegions.map((region, index) => ({
    ...region,
    id: `region-${index}`,
    found: false,
    markers: {},
  }));
  state.activeMode = activeMode;
  state.hiddenTargets = isHiddenObjectMode(activeMode)
    ? buildHiddenTargets(state.differences, metadata?.targets ?? [])
    : [];
  state.currentPuzzle = metadata || {
    name: 'PiXFiND Puzzle',
    difficulty: state.currentDifficulty,
    mode: activeMode,
    targets: [],
    size: `${originalImage.width}×${originalImage.height}px`,
  };
  state.total = state.differences.length;
  state.found = 0;
  state.mistakes = 0;
  state.missMarkers = [];
  state.roundCompleted = false;
  if (state.resetTimeout != null) {
    clearTimeout(state.resetTimeout);
    state.resetTimeout = null;
  }

  if (ctx.original && dom.canvasOriginal) {
    dom.canvasOriginal.width = originalImage.width;
    dom.canvasOriginal.height = originalImage.height;
    ctx.original.clearRect(0, 0, originalImage.width, originalImage.height);
    ctx.original.drawImage(originalImage, 0, 0);
  }
  if (ctx.challenge && dom.canvasChallenge) {
    dom.canvasChallenge.width = challengeImage.width;
    dom.canvasChallenge.height = challengeImage.height;
    ctx.challenge.clearRect(0, 0, challengeImage.width, challengeImage.height);
    ctx.challenge.drawImage(challengeImage, 0, 0);
  }
  fitCanvasesToFrame();
  resetAllZoomTransforms();
  clearMarkers();
  updateGameModePresentation();
  updateProgressLabel();
}

function updateGameModePresentation() {
  const modeMeta = getGameModeMeta(state.activeMode);
  if (dom.gameModeLabel) {
    dom.gameModeLabel.textContent = modeMeta.gameLabel;
  }
  if (dom.foundLabel) {
    dom.foundLabel.textContent = 'FOUND';
  }
  if (dom.canvasOriginal) {
    dom.canvasOriginal.setAttribute('aria-label', isHiddenObjectMode() ? '参照画像' : 'お手本画像');
  }
  if (dom.canvasChallenge) {
    dom.canvasChallenge.setAttribute('aria-label', isHiddenObjectMode() ? 'もの探し画像' : '間違いを探す画像');
  }
  renderTargetPanel();
}

function renderTargetPanel() {
  if (!dom.targetPanel || !dom.targetCurrent || !dom.targetList) return;
  const enabled = isHiddenObjectMode() && state.hiddenTargets.length > 0;
  dom.targetPanel.hidden = !enabled;
  dom.targetList.innerHTML = '';
  if (!enabled) {
    dom.targetCurrent.textContent = '-';
    return;
  }
  const remaining = state.hiddenTargets.filter(target => !target.found).length;
  dom.targetCurrent.textContent = remaining > 0
    ? `残り ${remaining} 個`
    : 'コンプリート！';
  state.hiddenTargets.forEach(target => {
    const item = document.createElement('li');
    item.className = `target-list__item${target.found ? ' is-found' : ''}`;
    item.textContent = target.label;
    dom.targetList.append(item);
  });
}

function fitCanvasesToFrame() {
  if (!state.imageSize.width) return;
  // In hidden-object mode we want the challenge image to fill the frame as
  // much as possible (not forced to a square). For spot-difference mode we
  // keep the previous square-fitting behavior to maintain parity between
  // original and challenge images.
  if (isHiddenObjectMode()) {
    const challenge = dom.canvasChallenge;
    if (challenge) {
      const frame = challenge.parentElement;
      if (frame) {
        const frameWidth = frame.clientWidth;
        const frameHeight = frame.clientHeight;
        if (frameWidth && frameHeight) {
          // Fill available frame area
          challenge.style.width = `${frameWidth}px`;
          challenge.style.height = `${frameHeight}px`;
        }
      }
    }
    return refreshZoomBounds();
  }

  const canvases = [dom.canvasOriginal, dom.canvasChallenge];
  canvases.forEach(canvas => {
    if (!canvas) return;
    const frame = canvas.parentElement;
    if (!frame) return;
    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    if (!frameWidth || !frameHeight) return;
    const maxSize = Math.min(frameWidth, frameHeight);
    canvas.style.width = `${maxSize}px`;
    canvas.style.height = `${maxSize}px`;
  });
  refreshZoomBounds();
}

window.addEventListener('resize', () => {
  setViewportVars();
  fitCanvasesToFrame();
  clearMarkers();
  state.differences.filter(region => region.found).forEach(region => renderMarker(region));
  paintAllMissMarkers();
});

function resetRound() {
  hideCompletionOverlay();
  hideFailureOverlay();
  if (state.resetTimeout != null) {
    clearTimeout(state.resetTimeout);
    state.resetTimeout = null;
  }
  if (!state.differences.length) {
    state.hiddenTargets.forEach(target => {
      target.found = false;
    });
    state.mistakes = 0;
    state.missMarkers = [];
    state.roundCompleted = false;
    updateGameModePresentation();
    updateProgressLabel();
    dom.timerLabel.textContent = formatTime(0);
    clearMarkers();
    setHint(getRoundStartHint());
    return;
  }
  state.differences.forEach(region => {
    region.found = false;
    region.markers = {};
  });
  state.hiddenTargets.forEach(target => {
    target.found = false;
  });
  state.found = 0;
  state.mistakes = 0;
  state.missMarkers = [];
  state.roundCompleted = false;
  updateGameModePresentation();
  updateProgressLabel();
  dom.timerLabel.textContent = formatTime(0);
  clearMarkers();
  startTimer();
  setHint(getRoundStartHint());
}

function leaveGame(targetScreen) {
  stopTimer();
  clearMarkers();
  resetAllZoomTransforms();
  clearCanvas(ctx.original, dom.canvasOriginal);
  clearCanvas(ctx.challenge, dom.canvasChallenge);
  hideCompletionOverlay();
  hideFailureOverlay();
  state.currentPuzzle = null;
  renderGameAuthor(null);
  updateDeleteButton(null);
  state.activeMode = state.currentMode;
  state.differences = [];
  state.hiddenTargets = [];
  state.found = 0;
  state.total = 0;
  state.mistakes = 0;
  state.missMarkers = [];
  state.roundCompleted = false;
  if (state.resetTimeout != null) {
    clearTimeout(state.resetTimeout);
    state.resetTimeout = null;
  }
  updateGameModePresentation();
  setHint(getDifficultySelectionHint(state.currentMode));
  updateProgressLabel();
  setActiveScreen(targetScreen);
}

function processCanvasSelection(targetCanvas, x, y) {
  if (!state.differences.length || state.roundCompleted) {
    return;
  }

  if (isHiddenObjectMode() && targetCanvas === dom.canvasOriginal) {
    setHint('もの探しモードは右側の絵から探してください。');
    return;
  }

  const region = state.differences.find(diff => (
    !diff.found && (
      isHiddenObjectMode()
        ? isPointInsideHiddenObjectRegion(diff, x, y, HIDDEN_OBJECT_HIT_PADDING)
        : isPointInsideRegion(diff, x, y)
    )
  ));
  if (!region) {
    const message = isHiddenObjectMode()
      ? '指定されたアイテムではありません。'
      : 'まだ間違いが隠れています。落ち着いて探し続けましょう。';
    registerMiss(targetCanvas, x, y, message);
    return;
  }

  if (isHiddenObjectMode()) {
    const targetForRegion = state.hiddenTargets.find(target => target.regionId === region.id && !target.found);
    if (!targetForRegion) {
      registerMiss(targetCanvas, x, y, '指定されたアイテムを探してください。');
      return;
    }
    targetForRegion.found = true;
    registerFound(region);
    renderTargetPanel();
    if (state.found >= state.total) {
      completeRound('すべてのアイテムを見つけました！');
    } else {
      const remaining = state.hiddenTargets.filter(target => !target.found).length;
      setHint(`ナイス！残り${remaining}個です。`);
    }
    return;
  }

  registerFound(region);
  if (state.found >= state.total) {
    completeRound('全ての間違いを発見しました！おめでとうございます。');
  } else {
    setHint('ナイス！まだ他にも間違いが潜んでいます。');
  }
}

function registerFound(region) {
  region.found = true;
  state.found += 1;
  updateProgressLabel();
  renderMarker(region);
  renderGlobalFlash();
  playSuccessSound();
}

function registerMiss(targetCanvas, x, y, message) {
  addMissMarker(targetCanvas, x, y);
  state.mistakes = Math.min(state.mistakes + 1, MAX_MISTAKES);
  updateMistakeLabel();
  if (state.mistakes >= MAX_MISTAKES) {
    setHint('ミスが3回に達したためラウンドをリセットします。');
    state.roundCompleted = true;
    showFailureOverlay();
    if (state.resetTimeout != null) {
      clearTimeout(state.resetTimeout);
    }
    state.resetTimeout = window.setTimeout(() => {
      resetRound();
    }, 1700);
    return;
  }
  setHint(message || 'ミスです。');
}

function completeRound(message) {
  state.roundCompleted = true;
  stopTimer();
  setHint(message);
  showCompletionOverlay();
}

function renderMarker(region) {
  if (!dom.overlayOriginal || !dom.overlayChallenge) return;
  const overlays = [
    { overlay: dom.overlayOriginal, canvas: dom.canvasOriginal },
    { overlay: dom.overlayChallenge, canvas: dom.canvasChallenge },
  ];

  overlays.forEach(({ overlay, canvas }) => {
    if (!overlay || !canvas) return;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const overlayWidth = overlay.clientWidth;
    const overlayHeight = overlay.clientHeight;
    if (!displayWidth || !displayHeight || !overlayWidth || !overlayHeight) return;

    const marker = document.createElement('div');
    marker.className = 'marker';

    const offsetX = (overlayWidth - displayWidth) / 2;
    const offsetY = (overlayHeight - displayHeight) / 2;
    const scaleX = displayWidth / state.imageSize.width;
    const scaleY = displayHeight / state.imageSize.height;
    const centerX = region.minX + (region.maxX - region.minX + 1) / 2;
    const centerY = region.minY + (region.maxY - region.minY + 1) / 2;
    const sizeScale = Math.max(0.6, (scaleX + scaleY) / 2);
    const markerSize = Math.max(18, Math.min(42, sizeScale * 28));

    marker.style.width = `${markerSize}px`;
    marker.style.height = `${markerSize}px`;
    marker.style.left = `${offsetX + centerX * scaleX - markerSize / 2}px`;
    marker.style.top = `${offsetY + centerY * scaleY - markerSize / 2}px`;
    overlay.append(marker);
    if (!region.markers) {
      region.markers = {};
    }
    if (overlay === dom.overlayOriginal) {
      region.markers.original = marker;
    } else {
      region.markers.challenge = marker;
    }
  });
}

function addMissMarker(canvas, imageX, imageY) {
  const target = canvas === dom.canvasOriginal ? 'original' : canvas === dom.canvasChallenge ? 'challenge' : null;
  if (!target || !state.imageSize.width || !state.imageSize.height) {
    return;
  }
  const record = { target, x: imageX, y: imageY };
  state.missMarkers.push(record);
  paintMissMarker(record);
}

function paintMissMarker(record) {
  const { target, x, y } = record;
  const canvas = target === 'original' ? dom.canvasOriginal : dom.canvasChallenge;
  const overlay = target === 'original' ? dom.overlayOriginal : dom.overlayChallenge;
  if (!canvas || !overlay || !state.imageSize.width || !state.imageSize.height) {
    return;
  }

  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  const overlayWidth = overlay.clientWidth;
  const overlayHeight = overlay.clientHeight;
  if (!displayWidth || !displayHeight || !overlayWidth || !overlayHeight) {
    return;
  }

  const offsetX = (overlayWidth - displayWidth) / 2;
  const offsetY = (overlayHeight - displayHeight) / 2;
  const scaleX = displayWidth / state.imageSize.width;
  const scaleY = displayHeight / state.imageSize.height;
  const sizeScale = Math.max(0.6, (scaleX + scaleY) / 2);
  const markerSize = Math.max(18, Math.min(42, sizeScale * 28));

  const marker = document.createElement('div');
  marker.className = 'miss-marker';
  marker.style.width = `${markerSize}px`;
  marker.style.height = `${markerSize}px`;
  marker.style.left = `${offsetX + x * scaleX - markerSize / 2}px`;
  marker.style.top = `${offsetY + y * scaleY - markerSize / 2}px`;
  overlay.append(marker);
}

function paintAllMissMarkers() {
  if (!state.missMarkers.length) return;
  state.missMarkers.forEach(record => paintMissMarker(record));
}

function clearMarkers() {
  if (dom.overlayOriginal) dom.overlayOriginal.innerHTML = '';
  if (dom.overlayChallenge) dom.overlayChallenge.innerHTML = '';
}

function renderGlobalFlash() {
  if (!dom.gameScreen) return;
  const flash = document.createElement('div');
  flash.className = 'global-flash';
  const circle = document.createElement('div');
  circle.className = 'global-flash__circle';
  flash.append(circle);
  dom.gameScreen.append(flash);
  flash.addEventListener('animationend', () => {
    flash.remove();
  });
}

function showCompletionOverlay() {
  if (!dom.completionOverlay) return;
  dom.completionOverlay.classList.add('is-visible');
  dom.completionOverlay.setAttribute('aria-hidden', 'false');
  clearTimeout(state.completionTimeout ?? undefined);
  state.completionTimeout = window.setTimeout(() => {
    hideCompletionOverlay();
  }, 2200);
}

function hideCompletionOverlay() {
  if (!dom.completionOverlay) return;
  dom.completionOverlay.classList.remove('is-visible');
  dom.completionOverlay.setAttribute('aria-hidden', 'true');
  clearTimeout(state.completionTimeout ?? undefined);
  state.completionTimeout = null;
}

function showFailureOverlay() {
  if (!dom.failureOverlay) return;
  dom.failureOverlay.classList.add('is-visible');
  dom.failureOverlay.setAttribute('aria-hidden', 'false');
  clearTimeout(state.failureTimeout ?? undefined);
  state.failureTimeout = window.setTimeout(() => {
    hideFailureOverlay();
  }, 1600);
}

function hideFailureOverlay() {
  if (!dom.failureOverlay) return;
  dom.failureOverlay.classList.remove('is-visible');
  dom.failureOverlay.setAttribute('aria-hidden', 'true');
  if (state.failureTimeout != null) {
    clearTimeout(state.failureTimeout);
    state.failureTimeout = null;
  }
}

function startTimer() {
  state.startTimestamp = performance.now();
  state.timerRunning = true;
  cancelAnimationFrame(state.timerId ?? 0);
  state.timerId = requestAnimationFrame(updateTimer);
}

function stopTimer() {
  state.timerRunning = false;
  cancelAnimationFrame(state.timerId ?? 0);
  state.timerId = null;
}

function updateTimer(now) {
  if (!state.timerRunning || state.startTimestamp == null) {
    dom.timerLabel.textContent = formatTime(0);
    return;
  }
  const elapsed = Math.max(0, now - state.startTimestamp);
  dom.timerLabel.textContent = formatTime(elapsed);
  state.timerId = requestAnimationFrame(updateTimer);
}

function computeDifferenceRegions(originalImage, challengeImage, options = {}) {
  const width = originalImage.width;
  const height = originalImage.height;
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctxOff = offscreen.getContext('2d');
  if (!ctxOff) return null;

  ctxOff.drawImage(originalImage, 0, 0);
  const baseData = ctxOff.getImageData(0, 0, width, height);
  ctxOff.clearRect(0, 0, width, height);
  ctxOff.drawImage(challengeImage, 0, 0);
  const diffData = ctxOff.getImageData(0, 0, width, height);

  const diffMask = new Uint8Array(width * height);
  const { data: basePixels } = baseData;
  const { data: diffPixels } = diffData;

  for (let i = 0, j = 0; i < diffMask.length; i += 1, j += 4) {
    if (
      basePixels[j] !== diffPixels[j] ||
      basePixels[j + 1] !== diffPixels[j + 1] ||
      basePixels[j + 2] !== diffPixels[j + 2] ||
      basePixels[j + 3] !== diffPixels[j + 3]
    ) {
      diffMask[i] = 1;
    }
  }

  const visited = new Uint8Array(width * height);
  const regions = [];
  const queue = [];
  const requestedMerge = Number.isFinite(options.mergeDistance) ? options.mergeDistance : null;
  const mergeDistance = Math.max(
    1,
    Math.floor(
      requestedMerge ?? resolveRegionMergeDistance(options.difficulty ?? null, { width, height }),
    ),
  );
  const neighborOffsets = [];

  for (let offsetY = -mergeDistance; offsetY <= mergeDistance; offsetY += 1) {
    for (let offsetX = -mergeDistance; offsetX <= mergeDistance; offsetX += 1) {
      const distance = Math.abs(offsetX) + Math.abs(offsetY);
      if (distance === 0 || distance > mergeDistance) {
        continue;
      }
      neighborOffsets.push({ offsetX, offsetY });
    }
  }

  for (let index = 0; index < diffMask.length; index += 1) {
    if (!diffMask[index] || visited[index]) {
      continue;
    }

    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;

    queue.push(index);
    visited[index] = 1;

    while (queue.length) {
      const idx = queue.pop();
      const x = idx % width;
      const y = Math.floor(idx / width);
      count += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (const { offsetX, offsetY } of neighborOffsets) {
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) {
          continue;
        }
        const neighborIndex = neighborY * width + neighborX;
        if (!diffMask[neighborIndex] || visited[neighborIndex]) {
          continue;
        }
        visited[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }

    if (count < MIN_CLUSTER_PIXELS) {
      continue;
    }

    regions.push({
      minX,
      maxX,
      minY,
      maxY,
      centerX: sumX / count,
      centerY: sumY / count,
      count,
    });
  }

  return { regions, width, height };
}

function computeHiddenObjectRegions(layerImage, options = {}) {
  const width = layerImage.width;
  const height = layerImage.height;
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const context = offscreen.getContext('2d');
  if (!context) return null;

  context.drawImage(layerImage, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const mask = new Uint8Array(width * height);
  const alphaThreshold = Number.isFinite(options.alphaThreshold)
    ? Math.max(0, Math.min(255, Math.floor(options.alphaThreshold)))
    : HIDDEN_OBJECT_LAYER_ALPHA_THRESHOLD;
  const blackThreshold = Number.isFinite(options.blackThreshold)
    ? Math.max(0, Math.min(255, Math.floor(options.blackThreshold)))
    : HIDDEN_OBJECT_LAYER_BLACK_THRESHOLD;

  let blackPixels = 0;
  let nonTransparentPixels = 0;
  for (let index = 0, offset = 0; index < mask.length; index += 1, offset += 4) {
    if (data[offset + 3] <= alphaThreshold) continue;
    nonTransparentPixels += 1;
    if (isHiddenObjectMaskPixel(data, offset, blackThreshold)) {
      mask[index] = 1;
      blackPixels += 1;
    }
  }

  // Fallback for legacy transparent layers: only when coverage is sparse.
  if (blackPixels === 0 && nonTransparentPixels > 0) {
    const coverage = nonTransparentPixels / mask.length;
    if (coverage <= HIDDEN_OBJECT_ALPHA_FALLBACK_MAX_COVERAGE) {
      for (let index = 0, offset = 0; index < mask.length; index += 1, offset += 4) {
        if (data[offset + 3] > alphaThreshold) {
          mask[index] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(width * height);
  const regions = [];
  const queue = [];
  const neighborOffsets = [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue;

    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    const pixels = [];

    queue.push(index);
    visited[index] = 1;

    while (queue.length) {
      const idx = queue.pop();
      const x = idx % width;
      const y = Math.floor(idx / width);
      pixels.push(idx);
      count += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (const neighbor of neighborOffsets) {
        const nx = x + neighbor.x;
        const ny = y + neighbor.y;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIndex = ny * width + nx;
        if (!mask[nIndex] || visited[nIndex]) continue;
        visited[nIndex] = 1;
        queue.push(nIndex);
      }
    }

    if (count < MIN_CLUSTER_PIXELS) continue;

    const maskWidth = maxX - minX + 1;
    const maskHeight = maxY - minY + 1;
    const localMask = new Uint8Array(maskWidth * maskHeight);
    pixels.forEach(pixelIndex => {
      const px = pixelIndex % width;
      const py = Math.floor(pixelIndex / width);
      localMask[(py - minY) * maskWidth + (px - minX)] = 1;
    });

    regions.push({
      minX,
      maxX,
      minY,
      maxY,
      centerX: sumX / count,
      centerY: sumY / count,
      count,
      maskWidth,
      maskHeight,
      mask: localMask,
      pixels,
    });
  }

  regions.sort((a, b) => a.minY - b.minY || a.minX - b.minX);

  const minDistance = Number.isFinite(options.minDistance)
    ? Math.max(0, Math.floor(options.minDistance))
    : 0;
  const tooClosePair = minDistance > 0
    ? detectTooCloseHiddenObjectPair(regions, width, minDistance)
    : null;

  const normalizedRegions = regions.map(({ pixels, ...region }) => region);
  return {
    regions: normalizedRegions,
    width,
    height,
    minDistance,
    tooClosePair,
  };
}

function isHiddenObjectMaskPixel(data, offset, blackThreshold) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return Math.max(r, g, b) <= blackThreshold;
}

function detectTooCloseHiddenObjectPair(regions, imageWidth, minDistance) {
  for (let left = 0; left < regions.length; left += 1) {
    for (let right = left + 1; right < regions.length; right += 1) {
      const first = regions[left];
      const second = regions[right];
      if (!couldRegionsBeNear(first, second, minDistance)) {
        continue;
      }
      if (areHiddenRegionsTooClose(first, second, imageWidth, minDistance)) {
        return [left, right];
      }
    }
  }
  return null;
}

function couldRegionsBeNear(a, b, distance) {
  const gapX = a.maxX < b.minX
    ? b.minX - a.maxX
    : b.maxX < a.minX
      ? a.minX - b.maxX
      : 0;
  const gapY = a.maxY < b.minY
    ? b.minY - a.maxY
    : b.maxY < a.minY
      ? a.minY - b.maxY
      : 0;
  return Math.max(gapX, gapY) <= distance;
}

function areHiddenRegionsTooClose(a, b, imageWidth, distance) {
  const first = (a.pixels?.length ?? 0) <= (b.pixels?.length ?? 0) ? a : b;
  const second = first === a ? b : a;
  const pixels = first.pixels || [];
  for (let i = 0; i < pixels.length; i += 1) {
    const index = pixels[i];
    const x = index % imageWidth;
    const y = Math.floor(index / imageWidth);
    for (let offsetY = -distance; offsetY <= distance; offsetY += 1) {
      for (let offsetX = -distance; offsetX <= distance; offsetX += 1) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) > distance) continue;
        if (hasPixelInHiddenRegion(second, x + offsetX, y + offsetY)) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasPixelInHiddenRegion(region, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (!region || !region.mask || !Number.isFinite(region.maskWidth) || !Number.isFinite(region.maskHeight)) {
    return false;
  }
  if (px < region.minX || px > region.maxX || py < region.minY || py > region.maxY) {
    return false;
  }
  const localX = px - region.minX;
  const localY = py - region.minY;
  return region.mask[(localY * region.maskWidth) + localX] === 1;
}

function isPointInsideHiddenObjectRegion(region, x, y, padding = HIDDEN_OBJECT_HIT_PADDING) {
  if (!region || !region.mask) return false;
  const px = Math.round(x);
  const py = Math.round(y);
  const span = Math.max(0, Math.floor(padding));
  for (let offsetY = -span; offsetY <= span; offsetY += 1) {
    for (let offsetX = -span; offsetX <= span; offsetX += 1) {
      if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) > span) continue;
      if (hasPixelInHiddenRegion(region, px + offsetX, py + offsetY)) {
        return true;
      }
    }
  }
  return false;
}

function isPointInsideRegion(region, x, y) {
  const tolerance = MARKER_PADDING + TAP_HIT_PADDING;
  return x >= region.minX - tolerance && x <= region.maxX + tolerance && y >= region.minY - tolerance && y <= region.maxY + tolerance;
}

function getImageCoordinates(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = state.imageSize.width / rect.width;
  const scaleY = state.imageSize.height / rect.height;
  const clientX = 'clientX' in event ? event.clientX : 0;
  const clientY = 'clientY' in event ? event.clientY : 0;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function initializeCanvasInteractions() {
  zoomControllers.original = createCanvasInteractionController(dom.canvasOriginal, dom.overlayOriginal, event => {
    if (!dom.canvasOriginal) return;
    const { x, y } = getImageCoordinates(dom.canvasOriginal, event);
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    processCanvasSelection(dom.canvasOriginal, x, y);
  }, transform => {
    syncZoomControllers('original', transform);
  });
  zoomControllers.challenge = createCanvasInteractionController(dom.canvasChallenge, dom.overlayChallenge, event => {
    if (!dom.canvasChallenge) return;
    const { x, y } = getImageCoordinates(dom.canvasChallenge, event);
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    processCanvasSelection(dom.canvasChallenge, x, y);
  }, transform => {
    syncZoomControllers('challenge', transform);
  });
}

function syncZoomControllers(sourceKey, transform) {
  if (zoomSyncLock || !transform) return;
  const targetKey = sourceKey === 'original' ? 'challenge' : 'original';
  const target = zoomControllers[targetKey];
  if (!target?.setTransform) return;
  zoomSyncLock = true;
  try {
    target.setTransform(transform, { sync: false });
  } finally {
    zoomSyncLock = false;
  }
}

function resetAllZoomTransforms() {
  Object.values(zoomControllers).forEach(controller => {
    if (controller?.reset) {
      controller.reset();
    }
  });
}

function refreshZoomBounds() {
  Object.values(zoomControllers).forEach(controller => {
    if (controller?.refresh) {
      controller.refresh();
    }
  });
}

function createCanvasInteractionController(canvas, overlay, onTap, onTransform) {
  if (!canvas) return null;
  const frame = canvas.parentElement;
  if (!frame) return null;

  frame.style.touchAction = 'none';
  canvas.style.touchAction = 'none';

  const controllerState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    pointers: new Map(),
    initialScale: 1,
    initialDistance: 0,
    lastPanPoint: null,
    tapCandidate: null,
  };

  const config = {
    minScale: ZOOM_MIN_SCALE,
    maxScale: ZOOM_MAX_SCALE,
  };

  function applyTransform({ sync = true } = {}) {
    const transform = `translate3d(${controllerState.offsetX}px, ${controllerState.offsetY}px, 0) scale(${controllerState.scale})`;
    canvas.style.transform = transform;
    if (overlay) {
      overlay.style.transform = transform;
    }
    if (sync && typeof onTransform === 'function') {
      onTransform({
        scale: controllerState.scale,
        offsetX: controllerState.offsetX,
        offsetY: controllerState.offsetY,
        frameWidth: frame.clientWidth || canvas.clientWidth || 0,
        frameHeight: frame.clientHeight || canvas.clientHeight || 0,
      });
    }
  }

  function clampOffsets() {
    const frameWidth = frame.clientWidth || canvas.clientWidth || 0;
    const frameHeight = frame.clientHeight || canvas.clientHeight || 0;
    if (!frameWidth || !frameHeight) {
      controllerState.offsetX = 0;
      controllerState.offsetY = 0;
      return;
    }
    const maxOffsetX = Math.max(0, (frameWidth * (controllerState.scale - 1)) / 2);
    const maxOffsetY = Math.max(0, (frameHeight * (controllerState.scale - 1)) / 2);
    controllerState.offsetX = clamp(controllerState.offsetX, -maxOffsetX, maxOffsetX);
    controllerState.offsetY = clamp(controllerState.offsetY, -maxOffsetY, maxOffsetY);
  }

  function updatePan(point) {
    if (!point) return;
    if (!controllerState.lastPanPoint) {
      controllerState.lastPanPoint = { x: point.x, y: point.y };
      return;
    }
    const deltaX = point.x - controllerState.lastPanPoint.x;
    const deltaY = point.y - controllerState.lastPanPoint.y;
    controllerState.lastPanPoint = { x: point.x, y: point.y };
    controllerState.offsetX += deltaX;
    controllerState.offsetY += deltaY;
    clampOffsets();
    applyTransform();
  }

  function setTransform(next, options = {}) {
    if (!next) return;
    const frameWidth = frame.clientWidth || canvas.clientWidth || 0;
    const frameHeight = frame.clientHeight || canvas.clientHeight || 0;
    let nextScale = Number.isFinite(next.scale) ? next.scale : controllerState.scale;
    let nextOffsetX = Number.isFinite(next.offsetX) ? next.offsetX : controllerState.offsetX;
    let nextOffsetY = Number.isFinite(next.offsetY) ? next.offsetY : controllerState.offsetY;
    if (Number.isFinite(next.frameWidth) && next.frameWidth > 0 && frameWidth > 0) {
      nextOffsetX *= frameWidth / next.frameWidth;
    }
    if (Number.isFinite(next.frameHeight) && next.frameHeight > 0 && frameHeight > 0) {
      nextOffsetY *= frameHeight / next.frameHeight;
    }
    controllerState.scale = clamp(nextScale, config.minScale, config.maxScale);
    controllerState.offsetX = nextOffsetX;
    controllerState.offsetY = nextOffsetY;
    clampOffsets();
    applyTransform({ sync: options.sync ?? false });
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      event.preventDefault();
    }
    canvas.setPointerCapture(event.pointerId);
    controllerState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (controllerState.pointers.size === 1) {
      controllerState.tapCandidate = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: getTimestamp(),
      };
      controllerState.lastPanPoint = { x: event.clientX, y: event.clientY };
    } else if (controllerState.pointers.size === 2) {
      const [first, second] = Array.from(controllerState.pointers.values());
      controllerState.initialDistance = calculatePointerDistance(first, second);
      controllerState.initialScale = controllerState.scale;
      controllerState.tapCandidate = null;
    } else {
      controllerState.tapCandidate = null;
    }
  }

  function handlePointerMove(event) {
    if (!controllerState.pointers.has(event.pointerId)) {
      return;
    }
    controllerState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (controllerState.pointers.size >= 2) {
      const [first, second] = Array.from(controllerState.pointers.values());
      if (!first || !second) {
        return;
      }
      if (controllerState.initialDistance <= 0) {
        controllerState.initialDistance = calculatePointerDistance(first, second);
      }
      if (controllerState.initialDistance <= 0) {
        return;
      }
      const prevScale = controllerState.scale;
      const distance = calculatePointerDistance(first, second);
      const rawScale = controllerState.initialScale * (distance / controllerState.initialDistance);
      const nextScale = clamp(rawScale, config.minScale, config.maxScale);
      if (!Number.isFinite(nextScale) || Number.isNaN(nextScale)) {
        return;
      }
      const scaleChange = prevScale ? nextScale / prevScale : 1;
      controllerState.scale = nextScale;

      if (scaleChange && Number.isFinite(scaleChange) && !Number.isNaN(scaleChange)) {
        const frameRect = frame.getBoundingClientRect();
        const centerX = ((first.x + second.x) / 2) - (frameRect.left + frameRect.width / 2);
        const centerY = ((first.y + second.y) / 2) - (frameRect.top + frameRect.height / 2);
        controllerState.offsetX -= (scaleChange - 1) * centerX;
        controllerState.offsetY -= (scaleChange - 1) * centerY;
      }
      clampOffsets();
      applyTransform();
      controllerState.tapCandidate = null;
    } else if (controllerState.pointers.size === 1) {
      const point = controllerState.pointers.get(event.pointerId);
      if (controllerState.tapCandidate) {
        const moveX = Math.abs(point.x - controllerState.tapCandidate.x);
        const moveY = Math.abs(point.y - controllerState.tapCandidate.y);
        if (moveX > TAP_MAX_MOVEMENT_PX || moveY > TAP_MAX_MOVEMENT_PX) {
          controllerState.tapCandidate = null;
        }
      }
      if (controllerState.scale > 1) {
        updatePan(point);
      } else {
        controllerState.lastPanPoint = { x: point.x, y: point.y };
      }
    }
  }

  function handlePointerUp(event) {
    const point = controllerState.pointers.get(event.pointerId) ?? { x: event.clientX, y: event.clientY };
    controllerState.pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    let shouldTap = false;
    if (controllerState.tapCandidate && controllerState.tapCandidate.id === event.pointerId) {
      const duration = getTimestamp() - controllerState.tapCandidate.time;
      const moveX = Math.abs(point.x - controllerState.tapCandidate.x);
      const moveY = Math.abs(point.y - controllerState.tapCandidate.y);
      if (moveX <= TAP_MAX_MOVEMENT_PX && moveY <= TAP_MAX_MOVEMENT_PX && duration <= TAP_MAX_DURATION_MS) {
        shouldTap = true;
      }
    }

    if (controllerState.pointers.size === 1) {
      const [remaining] = controllerState.pointers.values();
      controllerState.lastPanPoint = remaining ? { x: remaining.x, y: remaining.y } : null;
      controllerState.initialScale = controllerState.scale;
      controllerState.initialDistance = 0;
    } else {
      controllerState.lastPanPoint = null;
      controllerState.initialScale = controllerState.scale;
      controllerState.initialDistance = 0;
    }

    controllerState.tapCandidate = null;

    if (shouldTap && typeof onTap === 'function') {
      onTap(event);
    }
  }

  function handlePointerCancel(event) {
    controllerState.pointers.delete(event.pointerId);
    controllerState.tapCandidate = null;
    controllerState.lastPanPoint = null;
    controllerState.initialScale = controllerState.scale;
    controllerState.initialDistance = 0;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const prevScale = controllerState.scale;
    const delta = -event.deltaY * ZOOM_WHEEL_STEP;
    const factor = Math.exp(delta);
    const nextScale = clamp(prevScale * factor, config.minScale, config.maxScale);
    if (nextScale === prevScale) {
      return;
    }
    const frameRect = frame.getBoundingClientRect();
    const relativeX = event.clientX - (frameRect.left + frameRect.width / 2);
    const relativeY = event.clientY - (frameRect.top + frameRect.height / 2);
    const scaleChange = nextScale / prevScale;
    controllerState.scale = nextScale;
    controllerState.offsetX -= (scaleChange - 1) * relativeX;
    controllerState.offsetY -= (scaleChange - 1) * relativeY;
    clampOffsets();
    applyTransform();
  }

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerCancel);
  canvas.addEventListener('lostpointercapture', handlePointerCancel);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  applyTransform();

  return {
    reset() {
      controllerState.scale = 1;
      controllerState.offsetX = 0;
      controllerState.offsetY = 0;
      controllerState.tapCandidate = null;
      controllerState.lastPanPoint = null;
      controllerState.pointers.clear();
      controllerState.initialScale = 1;
      controllerState.initialDistance = 0;
      applyTransform();
    },
    refresh() {
      clampOffsets();
      applyTransform();
    },
    setTransform,
  };
}

function calculatePointerDistance(a, b) {
  if (!a || !b) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function getTimestamp() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    try {
      const resolved = new URL(url, window.location.href);
      const isSameOrigin = resolved.origin === window.location.origin;
      const isHttp = resolved.protocol === 'http:' || resolved.protocol === 'https:';
      if (!isSameOrigin && isHttp) {
        img.crossOrigin = 'anonymous';
      }
      img.src = resolved.toString();
    } catch {
      img.src = url;
    }
    img.onload = () => resolve(img);
    img.onerror = error => reject(error);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = error => reject(error);
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl, filename) {
  if (!dataUrl) return null;
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  } catch (error) {
    console.warn('data url convert failed', error);
    return null;
  }
}

async function loadImageFromFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);
  return { image, dataUrl };
}

function buildMergedLayerAsset(baseImage, overlayImage) {
  if (!baseImage || !overlayImage) return null;
  const baseWidth = baseImage.naturalWidth || baseImage.width || 0;
  const baseHeight = baseImage.naturalHeight || baseImage.height || 0;
  const overlayWidth = overlayImage.naturalWidth || overlayImage.width || 0;
  const overlayHeight = overlayImage.naturalHeight || overlayImage.height || 0;
  if (!baseWidth || !baseHeight || baseWidth !== overlayWidth || baseHeight !== overlayHeight) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = baseWidth;
  canvas.height = baseHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(baseImage, 0, 0, baseWidth, baseHeight);
  context.drawImage(overlayImage, 0, 0, baseWidth, baseHeight);
  try {
    return {
      image: canvas,
      dataUrl: canvas.toDataURL('image/png'),
      width: baseWidth,
      height: baseHeight,
    };
  } catch (error) {
    console.warn('merged layer serialization failed', error);
    return null;
  }
}

function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function buildNormalizedDataUrl(image, fallbackDataUrl, fallbackFile) {
  if (image) {
    try {
      const normalized = await normalizePixelImage(image, fallbackDataUrl ?? null);
      if (normalized?.dataUrl) {
        return normalized.dataUrl;
      }
    } catch (error) {
      console.warn('normalize failed for contest payload', error);
    }
  }
  if (fallbackDataUrl) return fallbackDataUrl;
  if (fallbackFile) return await readFileAsDataUrl(fallbackFile);
  return null;
}

async function createThumbnailDataUrl(image, fallbackDataUrl) {
  const source = image || (fallbackDataUrl ? await loadImageFromDataUrl(fallbackDataUrl) : null);
  if (!source) return null;
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const scale = Math.min(1, CONTEST_THUMB_SIZE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return fallbackDataUrl ?? null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/png');
}

async function uploadContestImages({ puzzleId, image, dataUrl }) {
  if (!puzzleId || !dataUrl) return null;
  const imageBlob = await dataUrlToBlob(dataUrl);
  const thumbDataUrl = await createThumbnailDataUrl(image, dataUrl);
  const thumbBlob = thumbDataUrl ? await dataUrlToBlob(thumbDataUrl) : imageBlob;
  const imagePath = `contest/${puzzleId}.png`;
  const thumbPath = `contest/${puzzleId}_thumb.png`;
  const [imageUrl, thumbUrl] = await Promise.all([
    uploadContestFile(imagePath, imageBlob, 'image/png'),
    uploadContestFile(thumbPath, thumbBlob, 'image/png'),
  ]);
  return { imageUrl, thumbUrl };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
  ));
}

function truncateText(ctx, text, maxWidth) {
  let output = String(text ?? '');
  if (!output) return '';
  if (ctx.measureText(output).width <= maxWidth) return output;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return output.length > 1 ? `${output}…` : output;
}

function getPixfindShareTargetUrl(puzzleId) {
  if (!puzzleId) return PIXFIND_SHARE_BASE_URL;
  const url = new URL(PIXFIND_SHARE_BASE_URL);
  url.searchParams.set('puzzle', puzzleId);
  return url.toString();
}

function getPixfindShareHtmlUrl(puzzleId) {
  if (!puzzleId) return null;
  return getSupabasePublicUrl(`puzzles/${puzzleId}/share.html`);
}

function getPixfindOgpImageUrl(puzzleId) {
  if (!puzzleId) return null;
  return getSupabasePublicUrl(`puzzles/${puzzleId}/ogp.png`);
}

function buildShareHtml({
  title,
  description,
  imageUrl,
  shareUrl,
  targetUrl,
  siteName = 'PiXFiND',
  ogWidth = PIXFIND_SHARE_OGP_WIDTH,
  ogHeight = PIXFIND_SHARE_OGP_HEIGHT,
}) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(imageUrl);
  const safeShareUrl = escapeHtml(shareUrl);
  const safeTargetUrl = escapeHtml(targetUrl);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${safeTitle}"/>
  <meta property="og:description" content="${safeDescription}"/>
  <meta property="og:image" content="${safeImage}"/>
  <meta property="og:image:width" content="${ogWidth}"/>
  <meta property="og:image:height" content="${ogHeight}"/>
  <meta property="og:url" content="${safeShareUrl}"/>
  <meta property="og:site_name" content="${escapeHtml(siteName)}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${safeTitle}"/>
  <meta name="twitter:description" content="${safeDescription}"/>
  <meta name="twitter:image" content="${safeImage}"/>
  <meta http-equiv="refresh" content="0; url=${safeTargetUrl}"/>
  <link rel="canonical" href="${safeTargetUrl}"/>
  <style>body{margin:0;font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh}</style>
</head>
<body>
  <p>Redirecting...</p>
  <script>window.location.replace('${safeTargetUrl}');</script>
</body>
</html>`;
}

function drawContainImage(ctx, image, x, y, width, height) {
  if (!ctx || !image) return;
  const iw = image.naturalWidth || image.width || 1;
  const ih = image.naturalHeight || image.height || 1;
  const scale = Math.min(width / iw, height / ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const dx = Math.round(x + (width - dw) / 2);
  const dy = Math.round(y + (height - dh) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, dx, dy, dw, dh);
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('blob create failed'));
    }, type);
  });
}

async function createPuzzleOgpBlob({ title, originalImage, diffImage }) {
  if (!originalImage || !diffImage) return null;
  const canvas = document.createElement('canvas');
  canvas.width = PIXFIND_SHARE_OGP_WIDTH;
  canvas.height = PIXFIND_SHARE_OGP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#111827');
  gradient.addColorStop(1, '#1f2937');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f8fafc';
  ctx.font = `600 ${PIXFIND_SHARE_TITLE_SIZE}px "M PLUS Rounded 1c", sans-serif`;
  ctx.textBaseline = 'top';
  const maxTitleWidth = canvas.width - PIXFIND_SHARE_PADDING * 2;
  const titleText = truncateText(ctx, title || 'PiXFiND', maxTitleWidth);
  ctx.fillText(titleText, PIXFIND_SHARE_PADDING, PIXFIND_SHARE_PADDING);

  const top = PIXFIND_SHARE_PADDING + PIXFIND_SHARE_TITLE_SIZE + 20;
  const availableHeight = canvas.height - top - PIXFIND_SHARE_PADDING;
  const availableWidth = canvas.width - PIXFIND_SHARE_PADDING * 2 - PIXFIND_SHARE_GAP;
  const slotWidth = availableWidth / 2;

  const leftX = PIXFIND_SHARE_PADDING;
  const rightX = PIXFIND_SHARE_PADDING + slotWidth + PIXFIND_SHARE_GAP;
  const slotY = top;

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.fillRect(leftX, slotY, slotWidth, availableHeight);
  ctx.strokeRect(leftX, slotY, slotWidth, availableHeight);
  ctx.fillRect(rightX, slotY, slotWidth, availableHeight);
  ctx.strokeRect(rightX, slotY, slotWidth, availableHeight);

  drawContainImage(ctx, originalImage, leftX, slotY, slotWidth, availableHeight);
  drawContainImage(ctx, diffImage, rightX, slotY, slotWidth, availableHeight);

  return await canvasToBlob(canvas, 'image/png');
}

async function uploadPuzzleShareAssets({ puzzleId, title, originalImage, diffImage }) {
  if (!puzzleId || !originalImage || !diffImage) return null;
  const ogpBlob = await createPuzzleOgpBlob({ title, originalImage, diffImage });
  if (!ogpBlob) return null;

  const ogpPath = `puzzles/${puzzleId}/ogp.png`;
  const sharePath = `puzzles/${puzzleId}/share.html`;
  const ogpUrl = getPixfindOgpImageUrl(puzzleId);
  const shareUrl = getPixfindShareHtmlUrl(puzzleId);
  const targetUrl = getPixfindShareTargetUrl(puzzleId);
  const description = '2枚の画像を見比べて、間違いを探そう。';

  await uploadPuzzleFile(ogpPath, ogpBlob, 'image/png');
  const html = buildShareHtml({
    title: `PiXFiND | ${title || 'パズル'}`,
    description,
    imageUrl: ogpUrl,
    shareUrl,
    targetUrl,
  });
  const htmlBlob = new Blob([html], { type: 'text/html' });
  await uploadPuzzleFile(sharePath, htmlBlob, 'text/html');
  return { shareUrl, ogpUrl };
}

async function createContestOgpBlob({ title, image }) {
  if (!image) return null;
  const canvas = document.createElement('canvas');
  canvas.width = CONTEST_SHARE_OGP_WIDTH;
  canvas.height = CONTEST_SHARE_OGP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f8fafc';
  ctx.font = `600 ${CONTEST_SHARE_TITLE_SIZE}px "M PLUS Rounded 1c", sans-serif`;
  ctx.textBaseline = 'top';
  const maxTitleWidth = canvas.width - CONTEST_SHARE_PADDING * 2;
  const titleText = truncateText(ctx, title || '作品', maxTitleWidth);
  ctx.fillText(titleText, CONTEST_SHARE_PADDING, CONTEST_SHARE_PADDING);

  const top = CONTEST_SHARE_PADDING + CONTEST_SHARE_TITLE_SIZE + 20;
  const availableHeight = canvas.height - top - CONTEST_SHARE_PADDING;
  const availableWidth = canvas.width - CONTEST_SHARE_PADDING * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.fillRect(CONTEST_SHARE_PADDING, top, availableWidth, availableHeight);
  ctx.strokeRect(CONTEST_SHARE_PADDING, top, availableWidth, availableHeight);
  drawContainImage(ctx, image, CONTEST_SHARE_PADDING, top, availableWidth, availableHeight);

  return await canvasToBlob(canvas, 'image/png');
}

async function uploadContestShareAssets({ entryId, title, image }) {
  if (!entryId || !image) return null;
  const ogpBlob = await createContestOgpBlob({ title, image });
  if (!ogpBlob) return null;
  const ogpPath = `share/${entryId}.png`;
  const sharePath = `share/${entryId}.html`;
  const ogpUrl = getContestPublicUrl(ogpPath);
  const shareUrl = getContestPublicUrl(sharePath);
  const targetUrl = `${CONTEST_SHARE_BASE_URL}?id=${entryId}`;
  const html = buildShareHtml({
    title: `PiXiEED | ${title || '作品'}`,
    description: 'PiXiEEDのドット作品',
    imageUrl: ogpUrl,
    shareUrl,
    targetUrl,
    siteName: 'PiXiEED',
    ogWidth: CONTEST_SHARE_OGP_WIDTH,
    ogHeight: CONTEST_SHARE_OGP_HEIGHT,
  });
  const htmlBlob = new Blob([html], { type: 'text/html' });
  await uploadContestFile(ogpPath, ogpBlob, 'image/png');
  await uploadContestFile(sharePath, htmlBlob, 'text/html');
  return { shareUrl, ogpUrl };
}

async function normalizePixelImage(image, fallbackDataUrl, options = {}) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return { image, dataUrl: fallbackDataUrl ?? null, width, height, scale: 1 };
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);

  let imageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch (error) {
    console.warn('Canvas access blocked, using original image', error);
    return { image, dataUrl: fallbackDataUrl ?? null, width, height, scale: 1 };
  }
  const forcedScaleRaw = Number(options?.scale);
  const forceScaleOption = options?.forceScale === true;
  const hasForcedScale = Number.isFinite(forcedScaleRaw) && (
    forcedScaleRaw > 1 || (forceScaleOption && forcedScaleRaw >= 1)
  );
  let scale = hasForcedScale ? Math.max(1, Math.floor(forcedScaleRaw)) : 1;

  if (!hasForcedScale) {
    const scaleX = detectScaleFactor(imageData, width, height, 'x');
    const scaleY = detectScaleFactor(imageData, width, height, 'y');
    scale = Math.max(1, Math.min(scaleX, scaleY));
    const blockScale = detectScaleFactorByBlocks(imageData, width, height);
    if (blockScale > scale) {
      scale = blockScale;
    }
  }

  if (scale > 1 && (width % scale !== 0 || height % scale !== 0)) {
    scale = 1;
  }

  if (scale <= 1) {
    let dataUrl = fallbackDataUrl ?? null;
    if (!dataUrl) {
      try {
        dataUrl = canvas.toDataURL();
      } catch (error) {
        console.warn('toDataURL blocked, falling back to original image', error);
        return { image, dataUrl: fallbackDataUrl ?? null, width, height, scale: 1 };
      }
    }
    if (dataUrl) {
      const normalizedImage = await loadImageFromDataUrl(dataUrl);
      return { image: normalizedImage, dataUrl, width, height, scale: 1 };
    }
    return { image, dataUrl: fallbackDataUrl ?? null, width, height, scale: 1 };
  }

  const targetWidth = width / scale;
  const targetHeight = height / scale;
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetContext = targetCanvas.getContext('2d');
  if (!targetContext) {
    return { image, dataUrl: fallbackDataUrl ?? null, width, height, scale: 1 };
  }
  const targetData = targetContext.createImageData(targetWidth, targetHeight);
  const src = imageData.data;
  const dest = targetData.data;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcIndex = ((y * scale) * width + (x * scale)) * 4;
      const destIndex = (y * targetWidth + x) * 4;
      dest[destIndex] = src[srcIndex];
      dest[destIndex + 1] = src[srcIndex + 1];
      dest[destIndex + 2] = src[srcIndex + 2];
      dest[destIndex + 3] = src[srcIndex + 3];
    }
  }

  targetContext.putImageData(targetData, 0, 0);
  let dataUrl;
  try {
    dataUrl = targetCanvas.toDataURL();
  } catch (error) {
    console.warn('toDataURL failed during normalization', error);
    dataUrl = fallbackDataUrl ?? null;
  }
  if (dataUrl) {
    const normalizedImage = await loadImageFromDataUrl(dataUrl);
    return { image: normalizedImage, dataUrl, width: targetWidth, height: targetHeight, scale };
  }
  return { image, dataUrl: fallbackDataUrl ?? null, width, height, scale: 1 };
}

function getImagePixelSize(image) {
  return {
    width: image?.naturalWidth || image?.width || 0,
    height: image?.naturalHeight || image?.height || 0,
  };
}

function formatPixelSize(size) {
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  return `${width}x${height}px`;
}

function resolveHiddenModeScalePair(originalRawSize, layerRawSize) {
  const originalWidth = originalRawSize?.width ?? 0;
  const originalHeight = originalRawSize?.height ?? 0;
  const layerWidth = layerRawSize?.width ?? 0;
  const layerHeight = layerRawSize?.height ?? 0;
  if (!originalWidth || !originalHeight || !layerWidth || !layerHeight) return null;

  if (originalWidth === layerWidth && originalHeight === layerHeight) {
    return { originalScale: null, layerScale: null };
  }
  if (originalWidth * layerHeight !== layerWidth * originalHeight) {
    return null;
  }

  if (originalWidth > layerWidth && originalHeight > layerHeight) {
    if (originalWidth % layerWidth !== 0 || originalHeight % layerHeight !== 0) return null;
    const ratioW = originalWidth / layerWidth;
    const ratioH = originalHeight / layerHeight;
    if (!Number.isInteger(ratioW) || ratioW <= 1 || ratioW !== ratioH) return null;
    return { originalScale: ratioW, layerScale: 1 };
  }

  if (layerWidth > originalWidth && layerHeight > originalHeight) {
    if (layerWidth % originalWidth !== 0 || layerHeight % originalHeight !== 0) return null;
    const ratioW = layerWidth / originalWidth;
    const ratioH = layerHeight / originalHeight;
    if (!Number.isInteger(ratioW) || ratioW <= 1 || ratioW !== ratioH) return null;
    return { originalScale: 1, layerScale: ratioW };
  }

  return null;
}

async function normalizeHiddenModePair({
  originalImage,
  originalDataUrl = null,
  layerImage,
  layerDataUrl = null,
}) {
  if (!originalImage || !layerImage) return null;

  const originalRawSize = getImagePixelSize(originalImage);
  const layerRawSize = getImagePixelSize(layerImage);
  const scalePair = resolveHiddenModeScalePair(originalRawSize, layerRawSize);

  if (scalePair) {
    const normalizedOriginal = await normalizePixelImage(
      originalImage,
      originalDataUrl,
      scalePair.originalScale ? { scale: scalePair.originalScale, forceScale: true } : undefined,
    );
    const sharedScale = normalizedOriginal.scale && normalizedOriginal.scale > 1 ? normalizedOriginal.scale : 1;
    let normalizedLayer;
    if (scalePair.layerScale != null) {
      normalizedLayer = await normalizePixelImage(layerImage, layerDataUrl, {
        scale: scalePair.layerScale,
        forceScale: true,
      });
    } else {
      normalizedLayer = await normalizePixelImage(layerImage, layerDataUrl, {
        scale: sharedScale,
        forceScale: true,
      });
    }
    if (normalizedOriginal.width === normalizedLayer.width && normalizedOriginal.height === normalizedLayer.height) {
      return { normalizedOriginal, normalizedLayer, originalRawSize, layerRawSize };
    }
  }

  const [normalizedOriginal, normalizedLayer] = await Promise.all([
    normalizePixelImage(originalImage, originalDataUrl),
    normalizePixelImage(layerImage, layerDataUrl),
  ]);
  return { normalizedOriginal, normalizedLayer, originalRawSize, layerRawSize };
}

function detectScaleFactor(imageData, width, height, axis) {
  const { data } = imageData;
  const length = axis === 'x' ? width : height;
  const compare = axis === 'x' ? (indexA, indexB) => columnsMatch(data, width, height, indexA, indexB) : (indexA, indexB) => rowsMatch(data, width, height, indexA, indexB);

  let run = 1;
  let best = 0;
  for (let i = 1; i < length; i++) {
    if (compare(i, i - 1)) {
      run += 1;
    } else {
      best = best ? gcd(best, run) : run;
      run = 1;
    }
  }
  best = best ? gcd(best, run) : run;
  return Math.max(1, best);
}

function detectScaleFactorByBlocks(imageData, width, height) {
  const common = gcd(width, height);
  if (common <= 1) return 1;
  const candidates = getDivisors(common).filter(value => value > 1).sort((a, b) => b - a);
  for (const factor of candidates) {
    if (isLikelyUpscaledByFactor(imageData.data, width, height, factor)) {
      return factor;
    }
  }
  return 1;
}

function isLikelyUpscaledByFactor(data, width, height, factor) {
  const totalPixels = width * height;
  const allowedMismatch = Math.floor(totalPixels * (1 - NORMALIZE_MATCH_RATIO));
  let mismatches = 0;

  for (let blockY = 0; blockY < height; blockY += factor) {
    for (let blockX = 0; blockX < width; blockX += factor) {
      const baseIndex = (blockY * width + blockX) * 4;
      const baseR = data[baseIndex];
      const baseG = data[baseIndex + 1];
      const baseB = data[baseIndex + 2];
      const baseA = data[baseIndex + 3];

      for (let y = 0; y < factor; y++) {
        const rowStart = (blockY + y) * width;
        for (let x = 0; x < factor; x++) {
          const idx = (rowStart + blockX + x) * 4;
          if (!isColorNear(data, idx, baseR, baseG, baseB, baseA)) {
            mismatches += 1;
            if (mismatches > allowedMismatch) {
              return false;
            }
          }
        }
      }
    }
  }

  return true;
}

function isColorNear(data, idx, r, g, b, a) {
  return (
    Math.abs(data[idx] - r) <= NORMALIZE_COLOR_TOLERANCE &&
    Math.abs(data[idx + 1] - g) <= NORMALIZE_COLOR_TOLERANCE &&
    Math.abs(data[idx + 2] - b) <= NORMALIZE_COLOR_TOLERANCE &&
    Math.abs(data[idx + 3] - a) <= NORMALIZE_COLOR_TOLERANCE
  );
}

function getDivisors(value) {
  const divisors = new Set();
  for (let i = 2; i <= Math.sqrt(value); i += 1) {
    if (value % i === 0) {
      divisors.add(i);
      divisors.add(value / i);
    }
  }
  divisors.add(value);
  return Array.from(divisors);
}

function columnsMatch(data, width, height, a, b) {
  for (let y = 0; y < height; y++) {
    const idxA = (y * width + a) * 4;
    const idxB = (y * width + b) * 4;
    if (
      data[idxA] !== data[idxB] ||
      data[idxA + 1] !== data[idxB + 1] ||
      data[idxA + 2] !== data[idxB + 2] ||
      data[idxA + 3] !== data[idxB + 3]
    ) {
      return false;
    }
  }
  return true;
}

function rowsMatch(data, width, height, a, b) {
  const rowLength = width * 4;
  const startA = a * rowLength;
  const startB = b * rowLength;
  for (let offset = 0; offset < rowLength; offset++) {
    if (data[startA + offset] !== data[startB + offset]) {
      return false;
    }
  }
  return true;
}

function gcd(a, b) {
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

function clearCanvas(context, canvas) {
  if (!context || !canvas) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
}

function updateProgressLabel() {
  dom.foundCount.textContent = String(state.found);
  dom.totalCount.textContent = String(state.total);
  updateMistakeLabel();
}

function updateMistakeLabel() {
  if (!dom.mistakeLabel) return;
  dom.mistakeLabel.textContent = `${state.mistakes} / ${MAX_MISTAKES}`;
}

function setHint(message) {
  if (!dom.hintMessage) return;
  dom.hintMessage.textContent = message || '';
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function playSuccessSound() {
  if (!('AudioContext' in window || 'webkitAudioContext' in window)) {
    return;
  }
  if (!state.audioContext) {
    const AudioContextCls = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextCls();
  }
  const ctxAudio = state.audioContext;
  if (!ctxAudio) return;
  if (ctxAudio.state === 'suspended') {
    ctxAudio.resume().catch(() => {});
  }
  const now = ctxAudio.currentTime;
  createBeep(ctxAudio, 880, now, 0.12);
  createBeep(ctxAudio, 988, now + 0.15, 0.12);
}

function createBeep(audioContext, frequency, startTime, duration) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.25, startTime + 0.01);
  gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function createStarLabel(level) {
  const maxLevel = 3;
  const clamped = Math.min(Math.max(level, 1), maxLevel);
  const stars = '★★★';
  const blanks = '☆☆☆';
  return stars.slice(0, clamped) + blanks.slice(clamped);
}

init();
