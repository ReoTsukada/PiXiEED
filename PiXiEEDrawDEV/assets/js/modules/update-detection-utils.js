(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const UPDATE_FETCH_TIMEOUT_MS = 8000;
  const DISMISSAL_STORAGE_KEY = 'pixieedraw:update-dismissed-build-v2';

  function parseSemver(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value || '').trim());
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      prerelease: match[4] ? match[4].split('.') : [],
    };
  }

  function compareSemver(left, right) {
    const a = typeof left === 'string' ? parseSemver(left) : left;
    const b = typeof right === 'string' ? parseSemver(right) : right;
    if (!a || !b) return null;
    for (const key of ['major', 'minor', 'patch']) {
      if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
    }
    if (!a.prerelease.length && !b.prerelease.length) return 0;
    if (!a.prerelease.length) return 1;
    if (!b.prerelease.length) return -1;
    const count = Math.max(a.prerelease.length, b.prerelease.length);
    for (let index = 0; index < count; index += 1) {
      const av = a.prerelease[index];
      const bv = b.prerelease[index];
      if (av === undefined) return -1;
      if (bv === undefined) return 1;
      if (av === bv) continue;
      const an = /^\d+$/.test(av) ? Number(av) : null;
      const bn = /^\d+$/.test(bv) ? Number(bv) : null;
      if (an !== null && bn !== null) return an > bn ? 1 : -1;
      if (an !== null) return -1;
      if (bn !== null) return 1;
      return av > bv ? 1 : -1;
    }
    return 0;
  }

  function compareBuildId(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    if (a === b) return 0;
    const partsA = a.match(/\d+|\D+/g) || [];
    const partsB = b.match(/\d+|\D+/g) || [];
    const count = Math.max(partsA.length, partsB.length);
    for (let index = 0; index < count; index += 1) {
      const av = partsA[index];
      const bv = partsB[index];
      if (av === undefined) return -1;
      if (bv === undefined) return 1;
      if (av === bv) continue;
      if (/^\d+$/.test(av) && /^\d+$/.test(bv)) {
        const an = Number(av);
        const bn = Number(bv);
        if (an !== bn) return an > bn ? 1 : -1;
        continue;
      }
      return av > bv ? 1 : -1;
    }
    return 0;
  }

  function validateVersionManifest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const schemaVersion = Number(value.schemaVersion);
    const edition = String(value.edition || '');
    const version = String(value.version || '');
    const buildId = String(value.buildId || '');
    const releasedAt = String(value.releasedAt || '');
    const minimumCompatibleVersion = String(value.minimumCompatibleVersion || '');
    if (schemaVersion !== 1 || !edition || !parseSemver(version) || !buildId || !parseSemver(minimumCompatibleVersion)) {
      return null;
    }
    if (!Number.isFinite(Date.parse(releasedAt))) return null;
    return { schemaVersion, edition, version, buildId, releasedAt, minimumCompatibleVersion };
  }

  function createUpdateDetector({
    manifestUrl = new URL('version.json', window.location.href).toString(),
    getBuildInfo = () => window.__PIXIEEDRAW_BUILD_INFO__ || null,
    fetchImpl = (...args) => window.fetch(...args),
    now = () => Date.now(),
    documentRef = document,
    windowRef = window,
  } = {}) {
    const state = {
      status: 'idle',
      currentVersion: '',
      availableVersion: '',
      currentBuildId: '',
      availableBuildId: '',
      edition: '',
      manifestUrl,
      releasedAt: '',
      reason: '',
      lastCheckedAt: 0,
    };
    let inFlight = null;
    let requestSequence = 0;
    let dismissedBuildId = '';
    let channel = null;

    function log(phase, reason = '') {
      console.info('[pixiedraw-dev:update]', {
        phase,
        currentVersion: state.currentVersion,
        availableVersion: state.availableVersion,
        currentBuildId: state.currentBuildId,
        availableBuildId: state.availableBuildId,
        edition: state.edition,
        manifestUrl: state.manifestUrl,
        reason,
      });
    }

    function renderNotice() {
      const notice = documentRef.getElementById('versionUpdateNotice');
      const message = documentRef.getElementById('versionUpdateNoticeMessage');
      if (!notice || !message) return;
      const show = state.status === 'update-available' && dismissedBuildId !== state.availableBuildId;
      notice.hidden = !show;
      if (show) {
        message.textContent = `現在 ${state.currentVersion} (${state.currentBuildId}) / 新版 ${state.availableVersion} (${state.availableBuildId})`;
      }
    }

    function setStatus(status, reason = '') {
      state.status = status;
      state.reason = reason;
      renderNotice();
    }

    function applyManifest(manifest) {
      state.availableVersion = manifest.version;
      state.availableBuildId = manifest.buildId;
      state.releasedAt = manifest.releasedAt;
      if (manifest.edition !== state.edition) {
        setStatus('incompatible', 'edition-mismatch');
        log('failed', 'edition-mismatch');
        return state;
      }
      const minimumComparison = compareSemver(state.currentVersion, manifest.minimumCompatibleVersion);
      if (minimumComparison === null || minimumComparison < 0) {
        setStatus('incompatible', 'minimum-compatible-version');
        log('failed', 'minimum-compatible-version');
        return state;
      }
      const versionComparison = compareSemver(manifest.version, state.currentVersion);
      const buildComparison = versionComparison === 0
        ? compareBuildId(manifest.buildId, state.currentBuildId)
        : 0;
      if (versionComparison > 0 || buildComparison > 0) {
        setStatus('update-available', versionComparison > 0 ? 'newer-version' : 'newer-build');
        channel?.postMessage({
          type: 'update-available',
          manifest,
        });
        log('update-available', state.reason);
        return state;
      }
      setStatus('up-to-date', versionComparison < 0 || buildComparison < 0 ? 'manifest-older' : 'same-build');
      log('up-to-date', state.reason);
      return state;
    }

    async function check({ force = false } = {}) {
      if (inFlight) return inFlight;
      if (!force && state.lastCheckedAt && now() - state.lastCheckedAt < UPDATE_CHECK_INTERVAL_MS) {
        return { ...state };
      }
      const buildInfo = getBuildInfo();
      if (!buildInfo || !parseSemver(buildInfo.version) || !buildInfo.buildId || !buildInfo.edition) {
        setStatus('failed', 'invalid-current-build-info');
        log('failed', 'invalid-current-build-info');
        return { ...state };
      }
      state.currentVersion = buildInfo.version;
      state.currentBuildId = buildInfo.buildId;
      state.edition = buildInfo.edition;
      state.manifestUrl = manifestUrl;
      if (windowRef.navigator?.onLine === false) {
        setStatus('offline', 'navigator-offline');
        log('offline', 'navigator-offline');
        return { ...state };
      }
      const sequence = ++requestSequence;
      setStatus('checking');
      log('check-start');
      inFlight = (async () => {
        const controller = new AbortController();
        let timedOut = false;
        const timeout = windowRef.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, UPDATE_FETCH_TIMEOUT_MS);
        try {
          const response = await fetchImpl(manifestUrl, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
            signal: controller.signal,
          });
          if (!response?.ok) throw new Error(`http-${response?.status || 0}`);
          const manifest = validateVersionManifest(await response.json());
          if (!manifest) throw new Error('invalid-manifest');
          if (sequence !== requestSequence) return { ...state };
          state.lastCheckedAt = now();
          log('manifest-loaded');
          return { ...applyManifest(manifest) };
        } catch (error) {
          if (sequence !== requestSequence) return { ...state };
          const reason = timedOut ? 'timeout' : String(error?.name === 'AbortError' ? 'aborted' : error?.message || error);
          setStatus(windowRef.navigator?.onLine === false ? 'offline' : 'failed', reason);
          log(state.status === 'offline' ? 'offline' : 'failed', reason);
          return { ...state };
        } finally {
          windowRef.clearTimeout(timeout);
          if (sequence === requestSequence) inFlight = null;
        }
      })();
      return inFlight;
    }

    function dismiss() {
      dismissedBuildId = state.availableBuildId;
      try {
        windowRef.sessionStorage.setItem(DISMISSAL_STORAGE_KEY, dismissedBuildId);
      } catch (_) {}
      renderNotice();
    }

    function init() {
      try {
        dismissedBuildId = windowRef.sessionStorage.getItem(DISMISSAL_STORAGE_KEY) || '';
      } catch (_) {}
      documentRef.getElementById('versionUpdateNoticeLater')?.addEventListener('click', dismiss);
      if ('BroadcastChannel' in windowRef) {
        channel = new windowRef.BroadcastChannel('pixieedraw-update-u2');
        channel.addEventListener('message', event => {
          const manifest = validateVersionManifest(event.data?.manifest);
          if (!manifest || manifest.edition !== state.edition) return;
          applyManifest(manifest);
        });
      }
      windowRef.setTimeout(() => { void check(); }, 0);
      windowRef.addEventListener('online', () => { void check({ force: true }); });
      windowRef.setInterval(() => { void check(); }, UPDATE_CHECK_INTERVAL_MS);
    }

    return {
      check,
      dismiss,
      getStatus: () => ({ ...state }),
      init,
    };
  }

  root.updateDetectionUtils = Object.freeze({
    parseSemver,
    compareSemver,
    compareBuildId,
    validateVersionManifest,
    createUpdateDetector,
  });

  const detector = createUpdateDetector();
  window.__pixieedrawCheckForUpdates = () => detector.check({ force: true });
  window.__pixieedrawGetUpdateStatus = () => detector.getStatus();
  window.__pixieedrawDismissUpdateNotice = () => detector.dismiss();
  window.addEventListener('load', () => detector.init(), { once: true });
})();
