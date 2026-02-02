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
  canvasOriginal: document.getElementById('canvasOriginal'),
  canvasChallenge: document.getElementById('canvasChallenge'),
  overlayOriginal: document.getElementById('overlayOriginal'),
  overlayChallenge: document.getElementById('overlayChallenge'),
  completionOverlay: document.getElementById('completionOverlay'),
  failureOverlay: document.getElementById('failureOverlay'),
  hintMessage: document.getElementById('hintMessage'),
  creatorOverlay: document.getElementById('creatorOverlay'),
  creatorOpenButton: document.getElementById('createButton'),
  creatorCloseButton: document.getElementById('creatorClose'),
  creatorForm: document.getElementById('creatorForm'),
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

const MIN_CLUSTER_PIXELS = 1;
const MARKER_PADDING = 1;
const REGION_MERGE_DISTANCE_BY_DIFFICULTY = {
  1: 2,
  2: 4,
  3: 8,
}; // Manhattan merge distance (px) per difficulty level
const CREATOR_MERGE_DISTANCE = REGION_MERGE_DISTANCE_BY_DIFFICULTY[2];
const MERGE_DISTANCE_REFERENCE = 96;
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
  officialPuzzles: [],
};

const creatorState = {
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
};

let creatorLastFocused = null;
let creatorAnalysisToken = 0;

const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const SUPABASE_BUCKET = 'pixfind-puzzles';
const CONTEST_BUCKET = 'pixieed-contest';
const CONTEST_THUMB_SIZE = 256;
const SUPABASE_TABLE = 'pixfind_puzzles';
const CONTEST_TABLE = 'contest_entries';
const CONTEST_PROMPT_PREFIX = 'pixfind:';
const CONTEST_AUTHOR_NAME = 'PiXFiND';
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;
const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object`;
const SUPABASE_PUBLIC_BASE = `${SUPABASE_STORAGE_URL}/public/${SUPABASE_BUCKET}`;
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
const PUBLISH_QUEUE_KEY = 'pixfind_publish_queue';
const PUBLISH_QUEUE_LIMIT = 10;
const PUBLISH_QUEUE_RETRY_MS = 60000;
const PUBLISHED_CACHE_LIMIT = 60;
const PUZZLE_PLACEHOLDER_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#1f2937"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="18" y="18" width="204" height="144" rx="16" ry="16" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)"/><text x="50%" y="54%" text-anchor="middle" font-family="M PLUS Rounded 1c, sans-serif" font-size="18" fill="#e5e7eb">PiXFiND</text></svg>'
)}`;

let supabaseMaintenance = Boolean(readSupabaseMaintenance());
let publishQueueBusy = false;

async function init() {
  setActiveScreen('start');
  updateProgressLabel();
  setHint('星を選んで、挑戦したい難易度を選んでください。');
  if (supabaseMaintenance) {
    setSupabaseMaintenance(true, 'cached');
  }

  await loadOfficialPuzzles();
  flushPublishQueue().catch(error => console.warn('publish queue flush failed', error));
  flushShareQueue().catch(error => console.warn('share queue flush failed', error));
  schedulePublishQueueFlush();
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

  initializeCanvasInteractions();
  setupCreator();

  dom.difficultyChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const level = Number(chip.dataset.difficulty);
      selectDifficulty(level);
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

  selectDifficulty(1);
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
  setCreatorActionsEnabled(false);
  clearCreatorPreview();
  if (dom.creatorSummary) {
    dom.creatorSummary.hidden = true;
  }
  setCreatorStatus('');
  setCreatorDifficulty(creatorState.difficulty, true);
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
  setCreatorActionsEnabled(false);
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
    setCreatorActionsEnabled(false);
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

  const strokeWidth = Math.max(2, Math.round(Math.min(image.width, image.height) / 160));
  context.lineWidth = strokeWidth;
  context.strokeStyle = 'rgba(255, 111, 141, 0.85)';
  context.fillStyle = 'rgba(255, 111, 141, 0.18)';

  diffResult.regions.forEach(region => {
    const width = region.maxX - region.minX + 1;
    const height = region.maxY - region.minY + 1;
    context.fillRect(region.minX, region.minY, width, height);
    context.strokeRect(region.minX, region.minY, width, height);
  });
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

    const [normalizedOriginal, normalizedDiff] = await Promise.all([
      normalizePixelImage(rawOriginal.image, rawOriginal.dataUrl),
      normalizePixelImage(rawDiff.image, rawDiff.dataUrl),
    ]);
    if (token !== creatorAnalysisToken) return;

    if (normalizedOriginal.width !== normalizedDiff.width || normalizedOriginal.height !== normalizedDiff.height) {
      setCreatorStatus('画像サイズが一致しません。同じサイズの画像を選んでください。', 'error');
      creatorState.diffResult = null;
      creatorState.size = { width: 0, height: 0 };
      clearCreatorPreview();
      updateCreatorSummary(null);
      return;
    }

    const mergeDistance = resolveMergeDistanceForSize(CREATOR_MERGE_DISTANCE, {
      width: normalizedOriginal.width,
      height: normalizedOriginal.height,
    });
    const diffResult = computeDifferenceRegions(normalizedOriginal.image, normalizedDiff.image, {
      mergeDistance,
    });
    if (!diffResult || !diffResult.regions.length) {
      setCreatorStatus('差分が見つかりませんでした。画像を確認してください。', 'error');
      creatorState.diffResult = null;
      creatorState.size = { width: 0, height: 0 };
      clearCreatorPreview();
      updateCreatorSummary(null);
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
    creatorState.title = dom.creatorTitleInput?.value.trim() ?? '';
    creatorState.slug = dom.creatorSlugInput?.value.trim() ?? '';

    const estimatedDifficulty = estimatePuzzleDifficulty(diffResult);
    setCreatorDifficulty(estimatedDifficulty, true);

    drawCreatorPreview();
    updateCreatorSummary(diffResult, normalizedOriginal.width, normalizedOriginal.height);
    setCreatorStatus(`差分を${diffResult.regions.length}箇所検出しました。内容を確認してください。`);
    setCreatorActionsEnabled(true);
  } catch (error) {
    console.error(error);
    setCreatorStatus('画像の読み込みに失敗しました。', 'error');
  }
}

async function handleCreatorPublish() {
  if (!creatorState.diffResult || !creatorState.originalFile || !creatorState.diffFile) {
    setCreatorStatus('公開には差分の自動判定が必要です。', 'error');
    return;
  }

  const title = dom.creatorTitleInput?.value.trim() || 'カスタムパズル';
  const slug = getCreatorSlug();
  const difficulty = creatorState.difficulty;
  const puzzleId = createPuzzleId();
  const postToContest = dom.creatorContestToggle ? dom.creatorContestToggle.checked : true;
  const authorName = getCreatorNickname();
  const publishTask = {
    puzzleId,
    title,
    slug,
    difficulty,
    postToContest,
    authorName,
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
      author_name: authorName,
      original_url: originalUrl,
      diff_url: diffUrl,
      thumbnail_url: diffUrl,
    };

    const inserted = await insertPublishedPuzzle(payload);
    const normalized = normalizePublishedPuzzleEntry(inserted ?? payload);
    if (normalized) {
      state.officialPuzzles = mergePuzzles(state.officialPuzzles, normalized);
      renderPuzzles(state.currentDifficulty);
    }

    let contestPosted = false;
    if (postToContest) {
      try {
        const contestDataUrl = await buildNormalizedDataUrl(
          creatorState.originalImage,
          creatorState.originalDataUrl,
          creatorState.originalFile,
        );
        if (!contestDataUrl) {
          throw new Error('contest data missing');
        }
        const colors = countUniqueColors(creatorState.originalImage);
        let contestUpload = null;
        try {
          contestUpload = await uploadContestImages({
            puzzleId,
            image: creatorState.originalImage,
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
          dataUrl: contestUpload ? null : contestDataUrl,
          width: creatorState.size.width,
          height: creatorState.size.height,
          colors,
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
              width: creatorState.size.width,
              height: creatorState.size.height,
              colors,
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
              image: creatorState.originalImage,
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

    let shareUrl = createShareUrl(normalized ?? { id: puzzleId, source: 'published' });
    try {
      const shareAssets = await uploadPuzzleShareAssets({
        puzzleId,
        title,
        originalImage: creatorState.originalImage,
        diffImage: creatorState.diffImage,
      });
      if (shareAssets?.shareUrl) {
        shareUrl = shareAssets.shareUrl;
        if (normalized) {
          normalized.shareUrl = shareAssets.shareUrl;
        }
      }
    } catch (error) {
      queueShareTask({
        puzzleId,
        title,
        originalUrl: normalized?.original || originalUrl || null,
        diffUrl: normalized?.diff || diffUrl || null,
      });
      markSupabaseMaintenanceFromError(error);
      console.warn('share asset creation failed', error);
    }
    const contestMessage = postToContest
      ? (contestPosted ? 'コンテストにも投稿しました。' : 'コンテスト投稿は失敗しました。')
      : 'コンテスト投稿はオフです。';
    if (isSupabaseMaintenance()) {
      setCreatorStatus(`公開しました。共有リンクはメンテナンス復旧後に生成されます。${contestMessage}`);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setCreatorStatus(`公開しました。共有リンクをコピーしました。${contestMessage}`);
    } else {
      window.prompt(`公開しました。${contestMessage}共有リンクをコピーしてください。`, shareUrl);
      setCreatorStatus(`公開しました。${contestMessage}`);
    }
  } catch (error) {
    console.error(error);
    if (isPermissionError(error)) {
      setCreatorStatus('投稿権限がありません。ログインまたは権限設定をご確認ください。', 'error');
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
    if (dom.creatorExportButton) dom.creatorExportButton.disabled = false;
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

function createPuzzleId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pixfind-${crypto.randomUUID()}`;
  }
  return `pixfind-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

async function uploadPuzzleFile(path, body, contentType = null) {
  if (!body) {
    throw new Error('upload body is missing');
  }
  const safePath = encodeStoragePath(path);
  const url = `${SUPABASE_STORAGE_URL}/${SUPABASE_BUCKET}/${safePath}`;
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

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
  const canPublish = Boolean(creatorState.diffResult && creatorState.originalFile && creatorState.diffFile);
  setCreatorActionsEnabled(canPublish);
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
  const puzzleId = task.puzzleId || createPuzzleId();
  const title = task.title || 'カスタムパズル';
  const slug = task.slug || sanitizeSlug(title) || `custom-${puzzleId.slice(-6)}`;
  const difficulty = normalizeDifficulty(task.difficulty);
  const authorName = task.authorName || getCreatorNickname();
  const size = task.size && Number.isFinite(task.size.width) && Number.isFinite(task.size.height)
    ? task.size
    : { width: 0, height: 0 };
  return {
    puzzleId,
    title,
    slug,
    difficulty,
    authorName,
    postToContest: task.postToContest !== false,
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
    postToContest,
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
    author_name: authorName,
    original_url: originalUrl,
    diff_url: diffUrl,
    thumbnail_url: diffUrl,
  };

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
  const normalizedEntry = normalizePublishedPuzzleEntry(inserted ?? payload);
  if (normalizedEntry) {
    state.officialPuzzles = mergePuzzles(state.officialPuzzles, normalizedEntry);
    renderPuzzles(state.currentDifficulty);
  }

  const [originalImage, diffImage] = await Promise.all([
    loadImageFromDataUrl(originalDataUrl),
    loadImageFromDataUrl(diffDataUrl),
  ]);
  const width = size.width || originalImage.width;
  const height = size.height || originalImage.height;

  if (postToContest) {
    try {
      const contestDataUrl = await buildNormalizedDataUrl(
        originalImage,
        originalDataUrl,
        null,
      );
      if (!contestDataUrl) {
        throw new Error('contest data missing');
      }
      const colors = countUniqueColors(originalImage);
      let contestUpload = null;
      try {
        contestUpload = await uploadContestImages({
          puzzleId,
          image: originalImage,
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
        dataUrl: contestUpload ? null : contestDataUrl,
        width,
        height,
        colors,
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
            width,
            height,
            colors,
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
            image: originalImage,
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

  try {
    const shareAssets = await uploadPuzzleShareAssets({
      puzzleId,
      title,
      originalImage,
      diffImage,
    });
    if (shareAssets?.shareUrl && normalizedEntry) {
      normalizedEntry.shareUrl = shareAssets.shareUrl;
    }
  } catch (error) {
    queueShareTask({
      puzzleId,
      title,
      originalUrl,
      diffUrl,
    });
    markSupabaseMaintenanceFromError(error);
    console.warn('share asset creation failed', error);
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
  if (isSupabaseMaintenance()) {
    const recovered = await probeSupabaseAvailability();
    if (!recovered) return;
  }
  const queue = loadShareQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const task of queue) {
    if (!task?.puzzleId || !task?.originalUrl || !task?.diffUrl) {
      continue;
    }
    try {
      const [originalImage, diffImage] = await Promise.all([
        loadImageFromUrl(task.originalUrl),
        loadImageFromUrl(task.diffUrl),
      ]);
      await uploadPuzzleShareAssets({
        puzzleId: task.puzzleId,
        title: task.title,
        originalImage,
        diffImage,
      });
    } catch (error) {
      remaining.push(task);
      markSupabaseMaintenanceFromError(error);
    }
  }
  saveShareQueue(remaining);
}

function getSupabasePublicUrl(path) {
  return `${SUPABASE_PUBLIC_BASE}/${path}`;
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
}) {
  const payload = {
    name: CONTEST_AUTHOR_NAME,
    title: title || 'PiXFiND Puzzle',
    prompt: `${CONTEST_PROMPT_PREFIX}${puzzleId}`,
    mode: 'pixfind',
    started_at: null,
    submitted_at: new Date().toISOString(),
    width,
    height,
    colors: Number.isFinite(colors) ? colors : null,
    client_id: `pixfind-${puzzleId}`,
  };
  if (imageUrl) {
    payload.image_url = imageUrl;
  }
  if (thumbUrl) {
    payload.thumb_url = thumbUrl;
  }
  if (!imageUrl && dataUrl) {
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

function normalizePublishedPuzzleEntry(entry) {
  if (!entry) return null;
  const identifier = entry.id ?? entry.slug;
  if (!identifier) return null;
  const original = entry.original_url ?? entry.original ?? null;
  const diff = entry.diff_url ?? entry.diff ?? null;
  if (!original || !diff) return null;
  return {
    id: entry.id ?? identifier,
    slug: entry.slug ?? identifier,
    label: entry.label ?? entry.slug ?? entry.id ?? 'PiXFiND Puzzle',
    description: entry.description ?? '',
    difficulty: normalizeDifficulty(entry.difficulty),
    author: resolveAuthorName(entry, '名無し'),
    original,
    diff,
    thumbnail: entry.thumbnail_url ?? entry.thumbnail ?? diff ?? original,
    shareUrl: entry.share_url ?? entry.shareUrl ?? null,
    source: 'published',
    badge: '公開',
  };
}

async function loadPublishedPuzzles() {
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
      const cached = loadPublishedCache();
      return cached.length ? cached : [];
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    const normalized = data.map(normalizePublishedPuzzleEntry).filter(Boolean);
    savePublishedCache(normalized);
    noteSupabaseSuccess();
    return normalized;
  } catch (error) {
    console.warn('Failed to load published puzzles', error);
    markSupabaseMaintenanceFromError(error);
    const cached = loadPublishedCache();
    return cached.length ? cached : [];
  }
}

async function loadOfficialPuzzles() {
  let basePuzzles = [];
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
    basePuzzles = FALLBACK_OFFICIAL_PUZZLES.map(normalizePuzzleEntry);
  }
  const publishedPuzzles = await loadPublishedPuzzles();
  state.officialPuzzles = [...basePuzzles, ...publishedPuzzles].filter(Boolean);
  renderPuzzles(state.currentDifficulty);
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

function estimatePuzzleDifficulty(diffResult) {
  if (!diffResult || !diffResult.regions?.length) return 1;
  const totalPixels = diffResult.width * diffResult.height;
  if (!Number.isFinite(totalPixels) || totalPixels <= 0) return 1;

  const regionCount = diffResult.regions.length;
  const diffPixels = diffResult.regions.reduce((sum, region) => sum + (region.count ?? 0), 0);
  const diffRatio = diffPixels / totalPixels;
  const avgRegionRatio = diffPixels / regionCount / totalPixels;

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
  return {
    id: entry.id ?? identifier,
    slug: entry.slug ?? identifier,
    label: entry.label ?? entry.slug ?? entry.id ?? 'PiXFiND Puzzle',
    description: entry.description ?? '',
    difficulty: normalizeDifficulty(entry.difficulty),
    author: resolveAuthorName(entry, '公式'),
    original,
    diff,
    thumbnail: entry.thumbnail ?? original ?? diff,
    source: 'official',
    badge: '公式',
  };
}

function createShareUrl(puzzle) {
  if (puzzle?.shareUrl) return puzzle.shareUrl;
  const url = new URL(window.location.href);
  const shareId = puzzle?.source === 'published' ? puzzle.id : (puzzle.slug ?? puzzle.id);
  if (shareId) {
    url.searchParams.set('puzzle', shareId);
  }
  url.hash = '';
  return url.toString();
}

async function sharePuzzle(puzzle) {
  let shareUrl = createShareUrl(puzzle);
  if (puzzle?.source === 'published' && !puzzle?.shareUrl && puzzle.original && puzzle.diff) {
    if (isSupabaseMaintenance()) {
      queueShareTask({
        puzzleId: puzzle.id,
        title: puzzle.label,
        originalUrl: puzzle.original,
        diffUrl: puzzle.diff,
      });
      window.alert('現在メンテナンス中のため共有リンクは後で生成されます。復旧後に再度共有してください。');
      return;
    }
    try {
      const [originalImage, diffImage] = await Promise.all([
        loadImageFromUrl(puzzle.original),
        loadImageFromUrl(puzzle.diff),
      ]);
      const shareAssets = await uploadPuzzleShareAssets({
        puzzleId: puzzle.id,
        title: puzzle.label,
        originalImage,
        diffImage,
      });
      if (shareAssets?.shareUrl) {
        puzzle.shareUrl = shareAssets.shareUrl;
        shareUrl = shareAssets.shareUrl;
      }
    } catch (error) {
      queueShareTask({
        puzzleId: puzzle.id,
        title: puzzle.label,
        originalUrl: puzzle.original,
        diffUrl: puzzle.diff,
      });
      markSupabaseMaintenanceFromError(error);
      console.warn('share asset creation failed', error);
    }
  }
  const shareData = {
    title: `PiXFiND | ${puzzle.label}`,
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

function resolveMergeDistanceForSize(baseDistance, size) {
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  if (!width || !height) {
    return baseDistance;
  }
  const minDim = Math.min(width, height);
  const scale = Math.max(1, Math.round(minDim / MERGE_DISTANCE_REFERENCE));
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
  const AD_SLOTS = ['2141591954', '9073878884', '2261515379'];
  official.forEach((puzzle, idx) => {
    dom.puzzleList.append(createOfficialCard(puzzle));
    if ((idx + 1) % 6 === 0) {
      const slotId = AD_SLOTS[Math.floor(idx / 6) % AD_SLOTS.length];
      dom.puzzleList.append(createPuzzleAdCard(slotId));
    }
  });

  if (!official.length) {
    const info = document.createElement('p');
    info.className = 'section-subtitle';
    info.textContent = '公式パズルはまだありません。';
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

function createPuzzleAdCard(slotId) {
  const card = document.createElement('div');
  card.className = 'puzzle-card puzzle-card--ad';
  card.innerHTML = `
    <div class="puzzle-ad-slot">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-9801602250480253"
           data-ad-slot="${slotId}"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
    <small class="puzzle-ad-note">広告</small>
  `;
  return card;
}

function createOfficialCard(puzzle) {
  const card = document.createElement('article');
  const badgeText = puzzle.badge ?? '公式';
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
    const diffResult = computeDifferenceRegions(originalImage, challengeImage, { difficulty: puzzle.difficulty });
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
    name: 'PiXFiND Puzzle',
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
  resetAllZoomTransforms();
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
  refreshZoomBounds();
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
  resetAllZoomTransforms();
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

function processCanvasSelection(targetCanvas, x, y) {
  if (!state.differences.length || state.roundCompleted) {
    return;
  }

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

async function loadImageFromFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);
  return { image, dataUrl };
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
  <style>body{margin:0;font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}</style>
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
  let scale = Math.max(1, Math.min(scaleX, scaleY));
  const blockScale = detectScaleFactorByBlocks(imageData, width, height);
  if (blockScale > scale) {
    scale = blockScale;
  }

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
