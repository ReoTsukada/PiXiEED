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
  difficultyChips: Array.from(document.querySelectorAll('[data-difficulty]')),
  puzzleList: document.getElementById('puzzleList'),
  gameTitle: document.getElementById('gameTitle'),
  foundCount: document.getElementById('foundCount'),
  totalCount: document.getElementById('totalCount'),
  timerLabel: document.getElementById('timerLabel'),
  mistakeLabel: document.getElementById('mistakeLabel'),
  installButton: document.getElementById('installButton'),
  canvasOriginal: document.getElementById('canvasOriginal'),
  canvasChallenge: document.getElementById('canvasChallenge'),
  overlayOriginal: document.getElementById('overlayOriginal'),
  overlayChallenge: document.getElementById('overlayChallenge'),
  completionOverlay: document.getElementById('completionOverlay'),
  failureOverlay: document.getElementById('failureOverlay'),
  hintMessage: document.getElementById('hintMessage'),
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

const MIN_CLUSTER_PIXELS = 1;
const MARKER_PADDING = 1;
const REGION_MERGE_DISTANCE = 3; // Merge difference pixels that are this close (Manhattan distance)
const MAX_MISTAKES = 3;

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
  currentPuzzle: null,
  differences: [],
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
  installPromptEvent: null,
  officialPuzzles: [],
};

async function init() {
  setActiveScreen('start');
  updateProgressLabel();
  setHint('星を選んで、挑戦したい難易度を選んでください。');

  await loadOfficialPuzzles();
  await handleInitialPuzzleFromUrl();

  updateInstallButtonVisibility();

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

  dom.installButton?.addEventListener('click', () => {
    void handleInstallButtonClick();
  });

  dom.canvasChallenge?.addEventListener('click', event => handleCanvasClick(event, dom.canvasChallenge));
  dom.canvasOriginal?.addEventListener('click', event => handleCanvasClick(event, dom.canvasOriginal));
  dom.canvasChallenge?.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    handleCanvasClick(touch, dom.canvasChallenge);
    event.preventDefault();
  }, { passive: false });
  dom.canvasOriginal?.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    handleCanvasClick(touch, dom.canvasOriginal);
    event.preventDefault();
  }, { passive: false });

  dom.difficultyChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const level = Number(chip.dataset.difficulty);
      selectDifficulty(level);
    });
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (dom.gameScreen && !dom.gameScreen.hidden) {
        leaveGame('difficulty');
      } else {
        setActiveScreen('start');
      }
    }
  });

  selectDifficulty(1);
}

async function loadOfficialPuzzles() {
  try {
    const response = await fetch('assets/puzzles/manifest.json', { cache: 'no-store' });
    if (!response.ok) {
      console.warn('Could not load puzzles manifest');
      state.officialPuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
      renderPuzzles(state.currentDifficulty);
      return;
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      state.officialPuzzles = data.map(normalizePuzzleEntry).filter(Boolean);
    }
    if (!state.officialPuzzles.length) {
      state.officialPuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
    }
    renderPuzzles(state.currentDifficulty);
  } catch (error) {
    console.warn('Failed to load puzzles manifest', error);
    state.officialPuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
    renderPuzzles(state.currentDifficulty);
  }
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

function normalizePuzzleEntry(entry) {
  if (!entry) return null;
  const identifier = entry.id ?? entry.slug;
  if (!identifier) return null;
  const original = entry.original ?? null;
  const diff = entry.diff ?? null;
  if (!original || !diff) return null;
  return {
    id: entry.id ?? identifier,
    slug: entry.slug ?? identifier,
    label: entry.label ?? entry.slug ?? entry.id ?? 'PiXFIND Puzzle',
    description: entry.description ?? '',
    difficulty: normalizeDifficulty(entry.difficulty),
    original,
    diff,
    thumbnail: entry.thumbnail ?? original ?? diff,
  };
}

function createShareUrl(puzzle) {
  const url = new URL(window.location.href);
  url.searchParams.set('puzzle', puzzle.slug ?? puzzle.id);
  url.hash = '';
  return url.toString();
}

async function sharePuzzle(puzzle) {
  const shareUrl = createShareUrl(puzzle);
  const shareData = {
    title: `PiXFIND | ${puzzle.label}`,
    text: `${puzzle.label}（${createStarLabel(puzzle.difficulty)}）に挑戦してみてください。`,
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
      await navigator.clipboard.writeText(shareUrl);
      window.alert('共有リンクをコピーしました。');
      return;
    } catch (error) {
      console.warn('Failed to copy share URL to clipboard', error);
    }
  }

  window.prompt('共有リンクをコピーしてください。', shareUrl);
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
    document.body.classList.add('is-playing');
    requestAnimationFrame(() => {
      fitCanvasesToFrame();
      clearMarkers();
      state.differences.filter(region => region.found).forEach(region => renderMarker(region));
      paintAllMissMarkers();
    });
  } else {
    dom.app?.classList.remove('is-playing');
    document.body.classList.remove('is-playing');
  }
}

function updateInstallButtonVisibility() {
  if (!dom.installButton) return;
  const available = Boolean(state.installPromptEvent);
  dom.installButton.hidden = !available;
  dom.installButton.disabled = !available;
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  state.installPromptEvent = event;
  updateInstallButtonVisibility();
}

async function handleInstallButtonClick() {
  const promptEvent = state.installPromptEvent;
  if (!promptEvent || !dom.installButton) {
    return;
  }

  try {
    dom.installButton.disabled = true;
    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => undefined);
  } catch (error) {
    console.warn('PWA install prompt failed', error);
  } finally {
    state.installPromptEvent = null;
    updateInstallButtonVisibility();
    if (state.installPromptEvent) {
      dom.installButton.disabled = false;
    }
  }
}

function handleAppInstalled() {
  state.installPromptEvent = null;
  updateInstallButtonVisibility();
}

function selectDifficulty(level) {
  state.currentDifficulty = level;
  dom.difficultyChips.forEach(chip => {
    const isActive = Number(chip.dataset.difficulty) === level;
    chip.setAttribute('aria-pressed', String(isActive));
  });
  renderPuzzles(level);
}

function renderPuzzles(level) {
  if (!dom.puzzleList) return;
  dom.puzzleList.innerHTML = '';

  const official = state.officialPuzzles.filter(puzzle => puzzle.difficulty === level);
  official.forEach(puzzle => {
    dom.puzzleList.append(createOfficialCard(puzzle));
  });

  if (!official.length) {
    const info = document.createElement('p');
    info.className = 'section-subtitle';
    info.textContent = '公式パズルはまだありません。';
    dom.puzzleList.append(info);
  }
}

function createOfficialCard(puzzle) {
  const card = document.createElement('article');
  card.className = 'puzzle-card puzzle-card--official';
  card.role = 'button';
  card.tabIndex = 0;
  card.dataset.puzzleId = puzzle.id;
  card.innerHTML = `
    <span class="puzzle-card__badge" aria-hidden="true">公式</span>
    <div class="puzzle-card__thumb puzzle-card__thumb--image">
      <img src="${puzzle.thumbnail}" alt="${puzzle.label} のプレビュー" />
    </div>
    <div class="puzzle-card__meta">
      <h4 class="puzzle-card__title">${puzzle.label}</h4>
      ${puzzle.description ? `<p class="puzzle-card__description">${puzzle.description}</p>` : ''}
      <span>${createStarLabel(puzzle.difficulty)}</span>
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
    setHint('画像を読み込んでいます…');
    const [rawOriginal, rawChallenge] = await Promise.all([
      loadImageFromUrl(puzzle.original),
      loadImageFromUrl(puzzle.diff),
    ]);
    if (!rawOriginal || !rawChallenge) {
      setHint('画像の読み込みに失敗しました。');
      return;
    }
    const { image: originalImage } = await normalizePixelImage(rawOriginal);
    const { image: challengeImage } = await normalizePixelImage(rawChallenge);
    if (originalImage.width !== challengeImage.width || originalImage.height !== challengeImage.height) {
      setHint('公式画像のサイズが一致しません。');
      return;
    }
    const diffResult = computeDifferenceRegions(originalImage, challengeImage);
    if (!diffResult || !diffResult.regions.length) {
      setHint('差分が見つかりませんでした。');
      return;
    }
    const metadata = {
      name: puzzle.label,
      difficulty: puzzle.difficulty,
      size: `${originalImage.width}×${originalImage.height}px`,
      source: 'official',
    };
    prepareGameBoard(originalImage, challengeImage, diffResult, metadata);
    dom.gameTitle.textContent = metadata.name;
    dom.totalCount.textContent = String(diffResult.regions.length);
    setHint('左右の画像を見比べて、違いをタップしてください。');
    setActiveScreen('game');
    resetRound();
  } catch (error) {
    console.error(error);
    setHint('パズルの読み込みに失敗しました。');
  }
}

function prepareGameBoard(originalImage, challengeImage, diffResult, metadata = null) {
  state.imageSize = { width: originalImage.width, height: originalImage.height };
  state.differences = diffResult.regions.map((region, index) => ({
    ...region,
    id: `region-${index}`,
    found: false,
    markers: {},
  }));
  state.currentPuzzle = metadata || {
    name: 'PiXFIND Puzzle',
    difficulty: state.currentDifficulty,
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
  clearMarkers();
  updateProgressLabel();
}

function fitCanvasesToFrame() {
  if (!state.imageSize.width) return;
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
}

window.addEventListener('resize', () => {
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
    state.mistakes = 0;
    state.missMarkers = [];
    state.roundCompleted = false;
    updateProgressLabel();
    dom.timerLabel.textContent = formatTime(0);
    clearMarkers();
    return;
  }
  state.differences.forEach(region => {
    region.found = false;
    region.markers = {};
  });
  state.found = 0;
  state.mistakes = 0;
  state.missMarkers = [];
  state.roundCompleted = false;
  updateProgressLabel();
  dom.timerLabel.textContent = formatTime(0);
  clearMarkers();
  startTimer();
}

function leaveGame(targetScreen) {
  stopTimer();
  clearMarkers();
  clearCanvas(ctx.original, dom.canvasOriginal);
  clearCanvas(ctx.challenge, dom.canvasChallenge);
  hideCompletionOverlay();
  hideFailureOverlay();
  state.currentPuzzle = null;
  state.differences = [];
  state.found = 0;
  state.total = 0;
  state.mistakes = 0;
  state.missMarkers = [];
  state.roundCompleted = false;
  if (state.resetTimeout != null) {
    clearTimeout(state.resetTimeout);
    state.resetTimeout = null;
  }
  setHint('星を選んで、挑戦したい難易度を選んでください。');
  updateProgressLabel();
  setActiveScreen(targetScreen);
}

function handleCanvasClick(event, canvas) {
  if (!state.differences.length || state.roundCompleted) {
    return;
  }
  const targetCanvas = canvas ?? dom.canvasChallenge;
  if (!targetCanvas) return;
  const { x, y } = getImageCoordinates(targetCanvas, event);
  if (Number.isNaN(x) || Number.isNaN(y)) return;

  const region = state.differences.find(diff => !diff.found && isPointInsideRegion(diff, x, y));
  if (!region) {
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
    } else {
      setHint('まだ間違いが隠れています。落ち着いて探し続けましょう。');
    }
    return;
  }

  region.found = true;
  state.found += 1;
  updateProgressLabel();
  renderMarker(region);
  renderGlobalFlash();
  playSuccessSound();

  if (state.found >= state.total) {
    state.roundCompleted = true;
    stopTimer();
    setHint('全ての間違いを発見しました！おめでとうございます。');
    showCompletionOverlay();
  } else {
    setHint('ナイス！まだ他にも間違いが潜んでいます。');
  }
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

function computeDifferenceRegions(originalImage, challengeImage) {
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
  const mergeDistance = Math.max(1, Math.floor(REGION_MERGE_DISTANCE));
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

function isPointInsideRegion(region, x, y) {
  const tolerance = MARKER_PADDING;
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

async function normalizePixelImage(image, fallbackDataUrl) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return { image, dataUrl: fallbackDataUrl ?? null, width, height };
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);

  let imageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch (error) {
    console.warn('Canvas access blocked, using original image', error);
    return { image, dataUrl: fallbackDataUrl ?? null, width, height };
  }
  const scaleX = detectScaleFactor(imageData, width, height, 'x');
  const scaleY = detectScaleFactor(imageData, width, height, 'y');
  const scale = Math.max(1, Math.min(scaleX, scaleY));

  if (scale <= 1) {
    let dataUrl = fallbackDataUrl ?? null;
    if (!dataUrl) {
      try {
        dataUrl = canvas.toDataURL();
      } catch (error) {
        console.warn('toDataURL blocked, falling back to original image', error);
        return { image, dataUrl: fallbackDataUrl ?? null, width, height };
      }
    }
    if (dataUrl) {
      const normalizedImage = await loadImageFromDataUrl(dataUrl);
      return { image: normalizedImage, dataUrl, width, height };
    }
    return { image, dataUrl: fallbackDataUrl ?? null, width, height };
  }

  const targetWidth = Math.round(width / scale);
  const targetHeight = Math.round(height / scale);
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetContext = targetCanvas.getContext('2d');
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
    return { image: normalizedImage, dataUrl, width: targetWidth, height: targetHeight };
  }
  return { image, dataUrl: fallbackDataUrl ?? null, width: targetWidth, height: targetHeight };
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

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('Service worker registration failed', error);
    });
  });
}

registerServiceWorker();
window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
window.addEventListener('appinstalled', handleAppInstalled);

init();
