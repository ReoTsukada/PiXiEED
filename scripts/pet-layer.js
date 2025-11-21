const STORAGE_KEY = 'pixieed:pet-device-id';
const STORAGE_STAGE_KEY = 'pixieed:pet-stage';
const STORAGE_USAGE_KEY = 'pixieed:pet-usage-ms';
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
  'タップありがと！',
  'むにっ',
  '遊ぼー！',
  'きらりん♪'
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

const motionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

const PET_SPRITE = 'pet-assets/JELLNALL1.png';
const PET_EGG_SPRITES = [
  'pet-assets/egg1.png',
  'pet-assets/egg2.png',
  'pet-assets/egg3.png',
  'pet-assets/egg4.png'
];
const PET_EGG_FALLBACK = 'pet-assets/egg-placeholder.png';

const petReady = () => {
  const wrapper = document.getElementById('pixiePetWrapper');
  const petButton = document.getElementById('pixiePet');
  const sprite = document.getElementById('pixiePetSprite');
  const speech = document.getElementById('pixiePetSpeech');

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

  const isHatched = () => petStage === PET_STAGE.HATCHED;

  const deviceId = ensureDeviceId();
  const shortId = formatShortId(deviceId);
  wrapper.dataset.deviceId = deviceId;
  petButton.dataset.facing = 'right';

  const walker = createWalker(wrapper, petButton);
  let speechTimer = null;
  const eggWobbler = createEggWobbler();

  sprite.alt = 'PiXiEEDを歩き回るピクセルペット';
  applyStage();

  function applyStage() {
    sprite.src = isHatched() ? PET_SPRITE : getEggSprite(usageTotalMs);
    wrapper.dataset.petState = petStage;
    petButton.dataset.state = petStage;
    if (isHatched()) {
      eggWobbler.stop();
    } else {
      eggWobbler.schedule();
    }
  }

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

  function prefersReducedMotion() {
    return Boolean(motionQuery && motionQuery.matches);
  }

  createUsageTracker(handleUsageProgress);

  function addMotionListener() {
    if (!motionQuery) return;
    const handler = event => {
      if (event.matches) {
        walker.stop();
        idleSpeaker.stop();
        eggWobbler.stop();
      } else {
        if (isHatched()) {
          walker.resume();
          idleSpeaker.schedule(true);
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
      walker.start();
      idleSpeaker.schedule(true);
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

  petButton.addEventListener('click', () => {
    petButton.classList.remove('is-reacting');
    void petButton.offsetWidth; // restart animation
    petButton.classList.add('is-reacting');
    showSpeech(getClickReaction(), 3000);
    if (isHatched()) {
      walker.nudge();
    } else {
      applyEggClickBonus();
      eggWobbler.trigger();
    }
  });

  window.addEventListener('resize', () => walker.refreshBounds());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      walker.stop();
      idleSpeaker.stop();
      eggWobbler.stop();
    } else if (!prefersReducedMotion() && isHatched()) {
      walker.resume();
      idleSpeaker.schedule(true);
    } else {
      walker.refreshBounds();
      if (!document.hidden && !prefersReducedMotion() && !isHatched()) {
        eggWobbler.schedule();
      }
    }
  });

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
    if (!prefersReducedMotion()) {
      eggWobbler.schedule();
    }
    showSpeech('成長をリセットしたよ！', 3200);
  }

  function handleUsageProgress(totalMs) {
    usageTotalMs = totalMs;
    if (!isHatched()) {
      applyStage();
      if (totalMs >= PET_HATCH_THRESHOLD_MS) {
        hatchPet();
      } else {
        showSpeech(formatEggProgress(totalMs), 3200);
        eggWobbler.schedule();
      }
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
    usageTotalMs = nextTotal;
    setStoredUsageMs(nextTotal);
    if (usageTotalMs >= PET_HATCH_THRESHOLD_MS) {
      hatchPet();
    } else {
      applyStage();
    }
  }

  function hatchPet() {
    if (isHatched()) return;
    petStage = PET_STAGE.HATCHED;
    savePetStage(petStage);
    applyStage();
    showSpeech('孵化したよ！これからよろしくね！', 3600);
    if (!prefersReducedMotion()) {
      walker.start();
      idleSpeaker.schedule(true);
      eggWobbler.stop();
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
    return PET_EGG_SPRITES[stageIndex] || PET_EGG_FALLBACK;
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

  const applyPosition = (x, y) => {
    const deltaX = x - currentX;
    const deltaY = y - currentY;
    const travel = Math.hypot(deltaX, deltaY);
    const duration = Math.max(3800, Math.min(9000, travel * 24));
    wrapper.style.setProperty('--pet-duration', `${duration}ms`);
    wrapper.style.transform = `translate(${x}px, ${y}px)`;
    petButton.dataset.facing = deltaX < 0 ? 'left' : 'right';
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
      applyPosition(Math.min(currentX, maxX), Math.min(currentY, maxY));
    },
    nudge: () => {
      moveRandom();
      schedule();
    }
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
  if (typeof onUpdate === 'function') {
    onUpdate(totalMs);
  }

  let sessionStart = document.hidden ? null : Date.now();

  const commit = () => {
    if (sessionStart == null) {
      return;
    }
    const delta = Date.now() - sessionStart;
    if (delta <= 0) {
      return;
    }
    totalMs += delta;
    sessionStart = Date.now();
    setStoredUsageMs(totalMs);
    if (typeof onUpdate === 'function') {
      onUpdate(totalMs);
    }
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

  return {
    syncNow: commit,
    getTotal: () => totalMs
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', petReady);
} else {
  petReady();
}
