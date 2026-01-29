const STORAGE_KEY = 'pixieed:pet-device-id';
const STORAGE_STAGE_KEY = 'pixieed:pet-stage';
const STORAGE_USAGE_KEY = 'pixieed:pet-usage-ms';
const PET_FEATURE_ENABLED = false;

const PET_STAGE = {
  EGG: 'egg',
  HATCHED: 'hatched'
};
const PET_RESET_EVENT = 'pixiePet:reset';
const PET_HATCH_THRESHOLD_MS = 10 * 60 * 1000; // 10分で孵化
const PET_EGG_STAGE_MS = 2 * 60 * 1000; // 2分ごとに段階が進む
const PET_EGG_WOBBLE_INTERVALS = [30000, 20000, 10000, 5000]; // egg1→4の揺れ周期
const EGG_CLICK_BONUS_MS = 10 * 1000; // 卵をクリックしたときの短縮

const CLICK_REACTIONS = [
  'ふよふよ…？',
  'むにっ',
  '遊ぼー！',
  'きらりん♪',
  '遊んでくれるの！？',
  'わーい！！',
  'もっと大っきくなりたいな',
  '魔王様に遊んでもらお',
  'もっとゲームで遊びたい！！'
];
const EGG_CLICK_REACTIONS = [
  'ぽよん…殻の中でぬくぬく',
  'あと少しで孵化しそう…？',
  'ゆっくり温めてね'
];
const IDLE_LINES = [
  'PiXiEEDを巡回中',
  '新作、もう見た？',
  'のしのし…',
  '今日も良い日だよ'
];
const EGG_IDLE_LINES = [
  'ころころ…',
  'すやすや…',
  '殻の中で準備中'
];
const GREETINGS = [
  'やっほー！相棒だよ',
  'PiXiEEDへようこそ！',
  '後ろで見守ってるからね'
];
const CANDY_CONFIG = {
  rewardMs: 10 * 60 * 1000,
  dailyLimit: 3,
  sprites: ['character-dots/pet/candy1.png', 'character-dots/pet/candy2.png', 'character-dots/pet/candy3.png'],
  storageKey: 'pixieed:candy-state',
  resetHourJST: 6
};
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PET_EXTERNAL_ACTIONS = {
  '1': {
    speech: 'ジャンプするよ！',
    jump: true
  }
};

const motionQuery = null;

const PET_HATCHED_STAGE_MS = 60 * 60 * 1000;
const PET_HATCHED_SPRITES = [
  'character-dots/JELLNALL1.png',
  'character-dots/JELLNALL2.png',
  'character-dots/JELLNALL3.png',
  'character-dots/JELLNALL4.png',
  'character-dots/JELLNALL5.png',
  'character-dots/JELLNALL6.png',
  'character-dots/JELLNALL7.png',
  'character-dots/JELLNALL8.png',
  'character-dots/JELLNALL9.png',
  'character-dots/JELLNALL10.png',
  'character-dots/JELLNALL11.png',
  'character-dots/JELLNALL12.png',
  'character-dots/JELLNALL13.png',
  'character-dots/JELLNALL14.png',
  'character-dots/JELLNALL15.png',
  'character-dots/JELLNALL16.png',
  'character-dots/JELLNALL17.png',
  'character-dots/JELLNALL18.png',
  'character-dots/JELLNALL19.png'
];
const PET_EGG_SPRITES = [
  'character-dots/pet/egg1.png',
  'character-dots/pet/egg2.png',
  'character-dots/pet/egg3.png',
  'character-dots/pet/egg4.png'
];
const PET_EGG_FALLBACK = 'character-dots/pet/egg-placeholder.png';

const petReady = () => {
  if (!PET_FEATURE_ENABLED) {
    if (typeof document !== 'undefined') {
      const layer = document.querySelector('.pixie-pet-layer');
      if (layer) {
        layer.remove();
      }
      const wrapper = document.getElementById('pixiePetWrapper');
      if (wrapper) wrapper.remove();
      const expBar = document.getElementById('pixiePetExp');
      if (expBar) expBar.remove();
      const candyField = document.getElementById('pixieCandyField');
      if (candyField) candyField.remove();
    }
    return;
  }
  const wrapper = document.getElementById('pixiePetWrapper');
  const petButton = document.getElementById('pixiePet');
  const sprite = document.getElementById('pixiePetSprite');
  const speech = document.getElementById('pixiePetSpeech');
  const expFill = document.getElementById('pixiePetExpFill');
  const expText = document.getElementById('pixiePetExpText');
  const expTrack = document.getElementById('pixiePetExpTrack');
  const candyField = document.getElementById('pixieCandyField');
  const nest = document.getElementById('pixiePetNest');

  if (!wrapper || !petButton || !sprite || !speech) {
    createUsageTracker(totalMs => {
      enforceStageFromUsage(totalMs);
    });
    if (typeof window !== 'undefined') {
      window.addEventListener(PET_RESET_EVENT, () => {
        setStoredUsageMs(0);
        savePetStage(PET_STAGE.EGG);
      });
    }
    return;
  }

  let petStage = loadPetStage();
  let usageTotalMs = getStoredUsageMs();
  let candyState = null;
  let isDocked = false;
  let isDragging = false;
  let dragPointerId = null;
  let dragStartPoint = null;
  let dragOffset = { x: 0, y: 0 };
  let suppressNextClick = false;
  let suppressResetTimer = null;
  let walkerHasStarted = false;

  const isHatched = () => petStage === PET_STAGE.HATCHED;

  const deviceId = ensureDeviceId();
  const shortId = formatShortId(deviceId);
  wrapper.dataset.deviceId = deviceId;
  petButton.dataset.facing = 'right';

  const walker = createWalker(wrapper, petButton);
  let speechTimer = null;
  function startRoaming() {}

  function showSpeech(text, ttl = 2600) {
    window.clearTimeout(speechTimer);
    speech.textContent = text.replace('#{id}', shortId);
    speech.hidden = false;
    speechTimer = window.setTimeout(() => {
      speech.hidden = true;
    }, ttl);
  }

  const idleSpeaker = createIdleSpeaker(() => {
    showSpeech(getIdleLine(), 3200);
  });

  const eggWobbler = createEggWobbler();

  sprite.alt = 'PiXiEEDを歩き回るピクセルペット';
  applyStage();

  function applyStage() {
    sprite.src = isHatched() ? getRandomHatchedSprite(usageTotalMs) : getEggSprite(usageTotalMs);
    wrapper.dataset.petState = petStage;
    wrapper.dataset.petStage = petStage;
    petButton.dataset.state = petStage;
    if (isHatched()) {
      eggWobbler.stop();
    } else {
      const left = 24;
      const bottomOffset = 140;
      walker.setPosition(left, window.innerHeight - bottomOffset, { immediate: true, lockFacing: true });
      eggWobbler.schedule();
    }
    updateExpBar();
  }

  function updateExpBar() {
    if (!expFill || !expText) {
      return;
    }
    const clamp = value => Math.min(Math.max(value, 0), 1);
    let ratio = 0;
    let label = '';
    if (!isHatched()) {
      ratio = clamp(PET_HATCH_THRESHOLD_MS ? usageTotalMs / PET_HATCH_THRESHOLD_MS : 0);
      const percent = Math.round(ratio * 100);
      label = ratio >= 1 ? '孵化準備完了' : `${percent}%`;
    } else {
      const stageData = getHatchedStageData(usageTotalMs);
      if (stageData.stageIndex >= stageData.maxIndex) {
        ratio = 1;
        label = 'MAX';
      } else {
        ratio = clamp(stageData.stageProgress / stageData.interval);
        const percent = Math.round(ratio * 100);
        label = `${percent}%`;
      }
    }
    const percentNow = Math.round(clamp(ratio) * 100);
    expFill.style.width = `${percentNow}%`;
    expText.textContent = label;
    if (expTrack) {
      expTrack.setAttribute('aria-valuenow', String(percentNow));
    }
  }

  const pendingExternalAction = consumeExternalActionCode();
  initCandyField();

  function createIdleSpeaker(render) {
    let timer = null;
    const schedule = (immediate = false) => {
      if (prefersReducedMotion()) {
        return;
      }
      window.clearTimeout(timer);
      const delay = immediate ? 2000 : randomBetween(9000, 16000);
      timer = window.setTimeout(() => {
        render();
        schedule(false);
      }, delay);
    };

    const stop = () => {
      window.clearTimeout(timer);
      timer = null;
    };

    return { schedule, stop };
  }

  function initCandyField() {
    if (!candyField) {
      return;
    }
    candyState = loadCandyStateFromStorage();
    ensureCandyState();
    renderCandyField();
    candyField.addEventListener('click', handleCandyClick);
    window.setInterval(() => {
      if (ensureCandyState()) {
        renderCandyField();
      }
    }, 60 * 1000);
  }

  function ensureCandyState() {
    const cycleStart = getCandyCycleStart();
    const expected = CANDY_CONFIG.dailyLimit;
    const needsReset = !candyState ||
      candyState.cycleStart !== cycleStart ||
      !Array.isArray(candyState.consumed) ||
      candyState.consumed.length !== expected ||
      !Array.isArray(candyState.positions) ||
      candyState.positions.length !== expected;
    if (needsReset) {
      candyState = createCandyState(cycleStart);
      saveCandyStateToStorage(candyState);
      return true;
    }
    return false;
  }

  function createCandyState(cycleStart) {
    return {
      cycleStart,
      consumed: Array.from({ length: CANDY_CONFIG.dailyLimit }, () => false),
      sprites: Array.from({ length: CANDY_CONFIG.dailyLimit }, () => Math.floor(Math.random() * CANDY_CONFIG.sprites.length)),
      positions: Array.from({ length: CANDY_CONFIG.dailyLimit }, () => randomCandyPosition())
    };
  }

  function renderCandyField() {
    if (!candyField || !candyState) {
      return;
    }
    if (!isHatched()) {
      candyField.innerHTML = '';
      return;
    }
    if (!Array.isArray(candyState.positions)) {
      candyState.positions = createCandyState(candyState.cycleStart).positions;
      saveCandyStateToStorage(candyState);
    }
    candyField.innerHTML = '';
    candyState.positions.forEach((pos, index) => {
      const consumed = Boolean(candyState.consumed?.[index]);
      if (consumed) {
        return;
      }
      const coords = clampCandyPosition(pos);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pixie-candy';
      button.dataset.candyIndex = String(index);
      button.style.left = `${coords.x}px`;
      button.style.top = `${coords.y}px`;
      const img = document.createElement('img');
      const spriteIndex = candyState.sprites?.[index] ?? 0;
      img.src = CANDY_CONFIG.sprites[spriteIndex % CANDY_CONFIG.sprites.length];
      img.alt = '';
      button.appendChild(img);
      candyField.appendChild(button);
    });
  }

  function handleCandyClick(event) {
    if (!candyState || !event.target) return;
    const button = event.target.closest('.pixie-candy');
    if (!(button instanceof HTMLButtonElement)) return;
    const index = Number(button.dataset.candyIndex);
    if (!Number.isInteger(index) || index < 0 || index >= CANDY_CONFIG.dailyLimit) {
      return;
    }
    if (ensureCandyState()) {
      renderCandyField();
    }
    if (candyState.consumed[index]) {
      return;
    }
    candyState.consumed[index] = true;
    saveCandyStateToStorage(candyState);
    renderCandyField();
    showSpeech('キャンディおいしい！', 2600);
    usageTracker.override(usageTotalMs + CANDY_CONFIG.rewardMs);
  }

  const canRoam = () => false;

  function createEggWobbler() {
    let timer = null;
    const schedule = () => {
      window.clearTimeout(timer);
      if (isHatched() || prefersReducedMotion()) {
        timer = null;
        petButton.classList.remove('is-wobbling');
        return;
      }
      const delay = getWobbleInterval(usageTotalMs);
      timer = window.setTimeout(() => {
        triggerWobble();
        schedule();
      }, delay);
    };

    const triggerWobble = () => {
      petButton.classList.remove('is-wobbling');
      void petButton.offsetWidth;
      petButton.classList.add('is-wobbling');
      window.setTimeout(() => {
        petButton.classList.remove('is-wobbling');
      }, 1100);
    };

    const stop = () => {
      window.clearTimeout(timer);
      timer = null;
      petButton.classList.remove('is-wobbling');
    };

    const triggerNow = () => {
      if (isHatched() || prefersReducedMotion()) {
        return;
      }
      triggerWobble();
      schedule();
    };

    return { schedule, stop, trigger: triggerNow };
  }

  function getNestRect() {
    return nest ? nest.getBoundingClientRect() : null;
  }

  function getNestPosition() {
    const { maxX, maxY } = walker.getBounds();
    const padding = 20;
    const targetX = Math.min(24, maxX);
    const targetY = Math.max(maxY - padding, 0);
    return { x: targetX, y: targetY };
  }

  function isPointInNest(x, y) {
    const rect = getNestRect();
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function updateNestHighlight(active) {
    // Nest removed
  }

  function dockPet(options = {}) {
    // noop
  }

  function undockPet(options = {}) {
    // noop
  }

  function clearDockingState() {
    isDocked = false;
    wrapper.classList.remove('is-docked');
  }

  function movePetTo(x, y) {
    walker.setPosition(x, y, { immediate: true, lockFacing: true });
  }

  function prefersReducedMotion() {
    return Boolean(motionQuery && motionQuery.matches);
  }

  const usageTracker = createUsageTracker(handleUsageProgress);

  function addMotionListener() {
    if (!motionQuery) return;
    const handler = event => {
      if (event.matches) {
        walker.stop();
        idleSpeaker.stop();
        eggWobbler.stop();
      } else {
        if (isHatched()) {
          if (!isDocked) {
            startRoaming();
          }
        } else {
          eggWobbler.schedule();
        }
      }
    };
    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', handler);
    } else if (typeof motionQuery.addListener === 'function') {
      motionQuery.addListener(handler);
    }
  }

  addMotionListener();

  if (!prefersReducedMotion()) {
    if (isHatched()) {
      startRoaming();
    } else {
      eggWobbler.schedule();
    }
  } else {
    walker.refreshBounds();
  }

  if (isHatched()) {
    showSpeech(randomFrom(GREETINGS), 3600);
  } else {
    showSpeech(formatEggProgress(usageTotalMs), 3600);
  }
  console.info('PiXiEED device id:', deviceId);

  if (pendingExternalAction) {
    window.setTimeout(() => {
      triggerExternalAction(pendingExternalAction);
    }, 800);
  }

  petButton.addEventListener('pointerdown', handlePointerDown);

  petButton.addEventListener('click', () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    petButton.classList.remove('is-reacting');
    void petButton.offsetWidth; // restart animation
    petButton.classList.add('is-reacting');
    showSpeech(getClickReaction(), 3000);
    if (!isHatched()) {
      applyEggClickBonus();
      eggWobbler.trigger();
    }
  });

  window.addEventListener('resize', () => {
    walker.refreshBounds();
    if (isDocked) {
      const target = getNestPosition();
      walker.setPosition(target.x, target.y, { immediate: true, lockFacing: true });
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      walker.stop();
      idleSpeaker.stop();
      eggWobbler.stop();
    } else if (canRoam()) {
      startRoaming();
    } else {
      walker.refreshBounds();
      if (!document.hidden && !prefersReducedMotion() && !isHatched()) {
        eggWobbler.schedule();
      }
      if (isDocked) {
        const target = getNestPosition();
        walker.setPosition(target.x, target.y, { immediate: true, lockFacing: true });
      }
    }
  });

  function handlePointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    dragPointerId = event.pointerId;
    const rect = wrapper.getBoundingClientRect();
    dragStartPoint = { x: event.clientX, y: event.clientY };
    dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    petButton.setPointerCapture(dragPointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  function handlePointerMove(event) {
    if (event.pointerId !== dragPointerId) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - dragStartPoint.x,
      event.clientY - dragStartPoint.y
    );
    if (!isDragging && distance > 6) {
      isDragging = true;
      walker.stop();
      idleSpeaker.stop();
      wrapper.classList.add('is-dragging');
    }
    if (!isDragging) {
      return;
    }
    event.preventDefault();
    movePetTo(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
    updateNestHighlight(isPointInNest(event.clientX, event.clientY));
  }

  function handlePointerUp(event) {
    if (event.pointerId !== dragPointerId) {
      return;
    }
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
    petButton.releasePointerCapture(dragPointerId);
    const droppedInNest = isDragging && isPointInNest(event.clientX, event.clientY);
    if (isDragging) {
      event.preventDefault();
      suppressNextClick = true;
      window.clearTimeout(suppressResetTimer);
      suppressResetTimer = window.setTimeout(() => {
        suppressNextClick = false;
      }, 400);
      wrapper.classList.remove('is-dragging');
      updateNestHighlight(false);
      if (droppedInNest) {
        dockPet();
      } else if (isDocked) {
        undockPet({ disableForEgg: true });
      } else if (canRoam()) {
        startRoaming();
      }
    } else {
      updateNestHighlight(false);
    }
    isDragging = false;
    dragPointerId = null;
    dragStartPoint = null;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(PET_RESET_EVENT, handlePetReset);
  }

  function handlePetReset() {
    usageTotalMs = 0;
    petStage = PET_STAGE.EGG;
    setStoredUsageMs(0);
    savePetStage(petStage);
    applyStage();
    walker.stop();
    idleSpeaker.stop();
    clearDockingState();
    walkerHasStarted = false;
    if (!prefersReducedMotion()) {
      eggWobbler.schedule();
    }
    showSpeech('成長をリセットしたよ！', 3200);
    updateExpBar();
  }

  function handleUsageProgress(totalMs) {
    usageTotalMs = totalMs;
    updateExpBar();
    if (!isHatched()) {
      applyStage();
      if (totalMs >= PET_HATCH_THRESHOLD_MS) {
        hatchPet();
      } else {
        showSpeech(formatEggProgress(totalMs), 3200);
        eggWobbler.schedule();
      }
    } else {
      applyStage();
    }
  }

  function triggerExternalAction(action) {
    if (!action) return;
    if (action.speech) {
      showSpeech(action.speech, 3600);
    }
    if (action.jump) {
      playJumpAnimation();
    }
  }

  function applyEggClickBonus() {
    if (isHatched()) {
      return;
    }
    const nextTotal = Math.min(PET_HATCH_THRESHOLD_MS, usageTotalMs + EGG_CLICK_BONUS_MS);
    if (nextTotal === usageTotalMs) {
      return;
    }
    usageTracker.override(nextTotal);
  }

  function hatchPet() {
    if (isHatched()) return;
    petStage = PET_STAGE.HATCHED;
    savePetStage(petStage);
    applyStage();
    showSpeech('孵化したよ！これからよろしくね！', 3600);
    if (!prefersReducedMotion()) {
      eggWobbler.stop();
      undockPet({ disableForEgg: true });
    }
  }

  function getIdleLine() {
    return randomFrom(isHatched() ? IDLE_LINES : EGG_IDLE_LINES);
  }

  function getClickReaction() {
    return randomFrom(isHatched() ? CLICK_REACTIONS : EGG_CLICK_REACTIONS);
  }

  function formatEggProgress(totalMs) {
    const remaining = Math.max(PET_HATCH_THRESHOLD_MS - totalMs, 0);
    if (remaining <= 0) {
      return 'もうすぐ孵化するよ！';
    }
    if (remaining < 60000) {
      return `あと約${Math.ceil(remaining / 1000)}秒で孵化しそう`;
    }
    return `あと約${Math.ceil(remaining / 60000)}分で孵化しそう`;
  }

  function getEggSprite(totalMs) {
    if (!PET_EGG_SPRITES.length) {
      return PET_EGG_FALLBACK;
    }
    const stageIndex = getEggStageIndex(totalMs);
    const spriteIndex = Math.min(stageIndex, PET_EGG_SPRITES.length - 1);
    return PET_EGG_SPRITES[spriteIndex] || PET_EGG_FALLBACK;
  }

  function getRandomHatchedSprite(totalMs) {
    return getHatchedSprite(totalMs);
  }

function getHatchedSprite(totalMs) {
  if (!PET_HATCHED_SPRITES.length) {
    return 'character-dots/JELLNALL1.png';
  }
  const cycleKey = Math.floor((Math.max(0, totalMs - PET_HATCH_THRESHOLD_MS)) / PET_HATCHED_STAGE_MS);
  const randomIndex = Math.floor((cycleKey * 9301 + 49297) % 233280) % PET_HATCHED_SPRITES.length;
  return PET_HATCHED_SPRITES[randomIndex] || PET_HATCHED_SPRITES[0];
}

function getEggStageIndex(totalMs) {
  if (!PET_EGG_SPRITES.length) {
    return 0;
  }
  const clampedMs = Math.max(0, Number.isFinite(totalMs) ? totalMs : 0);
  return Math.min(
    PET_EGG_SPRITES.length - 1,
    Math.floor(clampedMs / PET_EGG_STAGE_MS)
  );
}

function getWobbleInterval(totalMs) {
  const index = getEggStageIndex(totalMs);
  const fallback = PET_EGG_WOBBLE_INTERVALS[0] || 30000;
  return PET_EGG_WOBBLE_INTERVALS[Math.min(index, PET_EGG_WOBBLE_INTERVALS.length - 1)] || fallback;
}

function getHatchedStageData(totalMs) {
  const interval = PET_HATCHED_STAGE_MS || 1;
  if (!PET_HATCHED_SPRITES.length) {
    return { stageIndex: 0, stageProgress: 0, interval, maxIndex: 0 };
  }
  const baseline = Math.max(0, Number.isFinite(totalMs) ? totalMs : 0);
  const progress = Math.max(0, baseline - PET_HATCH_THRESHOLD_MS);
  const stageIndex = Math.max(0, Math.floor(progress / interval));
  const stageProgress = Math.min(Math.max(progress - stageIndex * interval, 0), interval);
  return { stageIndex, stageProgress, interval, maxIndex: Infinity };
}
};

function ensureDeviceId() {
  const fallback = () => `pixie-${Math.random().toString(16).slice(2, 10)}`;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback();
    }
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached) {
      return cached;
    }
    const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallback();
    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch (error) {
    return fallback();
  }
}

function formatShortId(id) {
  return id.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || id.slice(-4).toUpperCase();
}

function createWalker(wrapper, petButton) {
  let timer = null;
  let currentX = 24;
  let currentY = 24;

  const prefersReducedMotion = () => Boolean(motionQuery && motionQuery.matches);

  const applyPosition = (x, y, options = {}) => {
    const { immediate = false, lockFacing = false } = options;
    const deltaX = x - currentX;
    const deltaY = y - currentY;
    const travel = Math.hypot(deltaX, deltaY);
    const duration = immediate ? 0 : Math.max(3800, Math.min(9000, travel * 24));
    wrapper.style.setProperty('--pet-duration', `${duration}ms`);
    wrapper.style.transform = `translate(${x}px, ${y}px)`;
    if (!lockFacing) {
      petButton.dataset.facing = deltaX < 0 ? 'left' : 'right';
    }
    currentX = x;
    currentY = y;
  };

  const bounds = () => {
    const rect = wrapper.getBoundingClientRect();
    const width = rect.width || 80;
    const height = rect.height || 60;
    const maxX = Math.max(window.innerWidth - width - 12, 0);
    const maxY = Math.max(window.innerHeight - height - 24, 0);
    return { width, height, maxX, maxY };
  };

  const clampToBounds = (x, y) => {
    const { maxX, maxY } = bounds();
    return {
      x: Math.min(Math.max(x, 0), maxX),
      y: Math.min(Math.max(y, 0), maxY)
    };
  };

  const moveRandom = () => {
    const { maxX, maxY } = bounds();
    const x = randomBetween(12, Math.max(12, maxX));
    const y = randomBetween(40, Math.max(40, maxY));
    applyPosition(x, y);
  };

  const schedule = (delay = randomBetween(5200, 8800)) => {
    if (prefersReducedMotion()) {
      return;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      moveRandom();
      schedule();
    }, delay);
  };

  return {
    start: () => {
      moveRandom();
      schedule(900);
    },
    stop: () => {
      window.clearTimeout(timer);
      timer = null;
    },
    resume: () => {
      if (timer || prefersReducedMotion()) {
        return;
      }
      schedule(900);
    },
    refreshBounds: () => {
      const { maxX, maxY } = bounds();
      applyPosition(Math.min(currentX, maxX), Math.min(currentY, maxY), { immediate: true, lockFacing: true });
    },
    nudge: () => {
      moveRandom();
      schedule();
    },
    setPosition: (x, y, options) => {
      const clamped = clampToBounds(x, y);
      applyPosition(clamped.x, clamped.y, options);
    },
    getBounds: () => bounds(),
    getPosition: () => ({ x: currentX, y: currentY })
  };
}

function loadPetStage() {
  try {
    const saved = window.localStorage ? window.localStorage.getItem(STORAGE_STAGE_KEY) : null;
    return saved === PET_STAGE.HATCHED ? PET_STAGE.HATCHED : PET_STAGE.EGG;
  } catch (error) {
    return PET_STAGE.EGG;
  }
}

function savePetStage(stage) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(STORAGE_STAGE_KEY, stage);
    }
  } catch (error) {
    // noop
  }
}

function getStoredUsageMs() {
  try {
    if (!window.localStorage) {
      return 0;
    }
    const value = Number(window.localStorage.getItem(STORAGE_USAGE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    return 0;
  }
}

function setStoredUsageMs(value) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(STORAGE_USAGE_KEY, String(Math.max(0, Math.floor(value))));
    }
  } catch (error) {
    // noop
  }
}

function createUsageTracker(onUpdate) {
  let totalMs = getStoredUsageMs();
  let sessionStart = document.hidden ? null : Date.now();

  const emitUpdate = () => {
    if (typeof onUpdate === 'function') {
      onUpdate(totalMs);
    }
  };

  const setTotal = value => {
    totalMs = Math.max(0, Math.floor(value));
    setStoredUsageMs(totalMs);
    emitUpdate();
  };

  emitUpdate();

  const commit = () => {
    if (sessionStart == null) {
      return;
    }
    const delta = Date.now() - sessionStart;
    if (delta <= 0) {
      return;
    }
    setTotal(totalMs + delta);
    sessionStart = Date.now();
  };

  const handleVisibility = () => {
    if (document.hidden) {
      commit();
      sessionStart = null;
    } else {
      sessionStart = Date.now();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('beforeunload', commit);
  window.setInterval(() => {
    if (!document.hidden) {
      commit();
    }
  }, 15000);

  const override = value => {
    setTotal(value);
    sessionStart = Date.now();
  };

  return {
    syncNow: commit,
    getTotal: () => totalMs,
    override
  };
}

function enforceStageFromUsage(totalMs) {
  if (totalMs >= PET_HATCH_THRESHOLD_MS && loadPetStage() !== PET_STAGE.HATCHED) {
    savePetStage(PET_STAGE.HATCHED);
  }
}

function resetStoredPetProgress() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_USAGE_KEY);
      window.localStorage.removeItem(STORAGE_STAGE_KEY);
    }
    return true;
  } catch (error) {
    return false;
  }
}

function exposePetReset() {
  if (typeof window === 'undefined' || typeof window.pixiePetReset === 'function') {
    return;
  }
  window.pixiePetReset = function pixiePetReset(options = {}) {
    const { reload = false } = options || {};
    const success = resetStoredPetProgress();
    window.dispatchEvent(new CustomEvent(PET_RESET_EVENT));
    if (reload) {
      window.location.reload();
    }
    return success;
  };
}

function randomBetween(min, max) {
  const range = Math.max(max - min, 0);
  return min + Math.random() * range;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

exposePetReset();

function playJumpAnimation() {
  try {
    const button = document.getElementById('pixiePet');
    if (!button) return;
    button.classList.remove('is-jumping');
    void button.offsetWidth;
    button.classList.add('is-jumping');
    window.setTimeout(() => {
      button.classList.remove('is-jumping');
    }, 900);
  } catch (error) {
    // ignore animation failures
  }
}

function consumeExternalActionCode() {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const codeParam = params.get('petcode') || params.get('code');
    if (!codeParam) {
      return null;
    }
    const normalized = codeParam.trim().toLowerCase();
    params.delete('petcode');
    params.delete('code');
    const nextSearch = params.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
    return PET_EXTERNAL_ACTIONS[normalized] || null;
  } catch (error) {
    return null;
  }
}

function randomCandyPosition() {
  const margin = 60;
  const width = Math.max(window.innerWidth, margin * 2);
  const height = Math.max(window.innerHeight, margin * 2);
  return {
    x: margin + Math.random() * (width - margin * 2),
    y: margin + Math.random() * (height - margin * 2)
  };
}

function clampCandyPosition(pos) {
  const margin = 60;
  const width = Math.max(window.innerWidth, margin * 2);
  const height = Math.max(window.innerHeight, margin * 2);
  return {
    x: Math.min(Math.max(pos.x, margin), width - margin),
    y: Math.min(Math.max(pos.y, margin), height - margin)
  };
}

function getCandyCycleStart(date = new Date()) {
  const now = date.getTime();
  const jstTime = now + JST_OFFSET_MS;
  const jstDate = new Date(jstTime);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();
  const day = jstDate.getUTCDate();
  const resetHour = CANDY_CONFIG.resetHourJST || 0;
  let anchor = Date.UTC(year, month, day, resetHour, 0, 0);
  if (jstDate.getUTCHours() < resetHour) {
    anchor = Date.UTC(year, month, day - 1, resetHour, 0, 0);
  }
  return anchor - JST_OFFSET_MS;
}

function loadCandyStateFromStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(CANDY_CONFIG.storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveCandyStateToStorage(state) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(CANDY_CONFIG.storageKey, JSON.stringify(state));
  } catch (error) {
    // ignore
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', petReady);
} else {
  petReady();
}
