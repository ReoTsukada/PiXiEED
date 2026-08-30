(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixieedProfileLocalUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function normalizePixieedAvatarId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) {
      return 'mao';
    }
    if (raw === 'mao' || raw === 'baburin' || /^jerin[1-8]$/.test(raw) || /^jellnall([1-9]|1[0-9])$/.test(raw)) {
      return raw;
    }
    const fileName = raw
      .split('/')
      .pop()
      ?.split('?')[0]
      ?.split('#')[0]
      ?.replace(/\.[a-z0-9]+$/i, '')
      || '';
    if (fileName === 'mao' || fileName === 'mao1') {
      return 'mao';
    }
    if (fileName === 'baburin' || fileName === 'baburinpng') {
      return 'baburin';
    }
    if (/^jerin[1-8]$/.test(fileName) || /^jellnall([1-9]|1[0-9])$/.test(fileName)) {
      return fileName;
    }
    return 'mao';
  }

  function resolvePixieedAvatarSrcFromId(value) {
    const avatarId = normalizePixieedAvatarId(value);
    if (avatarId === 'mao') {
      return '../character-dots/mao1.png';
    }
    if (/^jerin[1-8]$/.test(avatarId)) {
      return `../character-dots/Jerin${avatarId.slice(5)}.png`;
    }
    if (/^jellnall([1-9]|1[0-9])$/.test(avatarId)) {
      return `../character-dots/${avatarId.toUpperCase()}.png`;
    }
    if (avatarId === 'baburin') {
      return '../character-dots/baburinpng.png';
    }
    return '../character-dots/mao1.png';
  }

  function readPixieedLocalNickname() {
    if (!canUseSessionStorage) {
      return '';
    }
    try {
      const raw = window.localStorage.getItem(PIXIEED_NICKNAME_STORAGE_KEY);
      if (typeof raw !== 'string') {
        return '';
      }
      const trimmed = raw.trim();
      return trimmed ? trimmed.slice(0, 32) : '';
    } catch (error) {
      return '';
    }
  }

  function writePixieedLocalNickname(value) {
    if (!canUseSessionStorage) {
      return;
    }
    const trimmed = typeof value === 'string' ? value.trim().slice(0, 32) : '';
    try {
      if (trimmed) {
        window.localStorage.setItem(PIXIEED_NICKNAME_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(PIXIEED_NICKNAME_STORAGE_KEY);
      }
    } catch (error) {
      // Ignore local storage write errors.
    }
  }

  function readPixieedLocalAvatarId() {
    if (!canUseSessionStorage) {
      return 'mao';
    }
    try {
      const raw = window.localStorage.getItem(PIXIEED_AVATAR_STORAGE_KEY);
      return normalizePixieedAvatarId(raw);
    } catch (error) {
      return 'mao';
    }
  }

  function writePixieedLocalAvatarId(value) {
    if (!canUseSessionStorage) {
      return;
    }
    const normalized = normalizePixieedAvatarId(value);
    try {
      window.localStorage.setItem(PIXIEED_AVATAR_STORAGE_KEY, normalized);
    } catch (error) {
      // Ignore local storage write errors.
    }
  }

  function readPixieedLocalXUrl() {
    if (!canUseSessionStorage) {
      return '';
    }
    try {
      const raw = window.localStorage.getItem(PIXIEED_X_URL_STORAGE_KEY);
      if (typeof raw !== 'string') {
        return '';
      }
      return raw.trim();
    } catch (error) {
      return '';
    }
  }

  function writePixieedLocalXUrl(value) {
    if (!canUseSessionStorage) {
      return;
    }
    const trimmed = typeof value === 'string' ? value.trim() : '';
    try {
      if (trimmed) {
        window.localStorage.setItem(PIXIEED_X_URL_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(PIXIEED_X_URL_STORAGE_KEY);
      }
    } catch (error) {
      // Ignore local storage write errors.
    }
  }

  function readPixieedAccountNickname() {
    const profileNickname = accountState.isLoggedIn ? accountState.profile.nickname : '';
    if (profileNickname) {
      return profileNickname.trim().slice(0, 32);
    }
    return readPixieedLocalNickname();
  }

  function readPixieedAccountAvatarId() {
    const profileAvatar = accountState.isLoggedIn ? accountState.profile.avatarId : '';
    if (profileAvatar) {
      return normalizePixieedAvatarId(profileAvatar);
    }
    return readPixieedLocalAvatarId();
  }

  function readPixieedAccountXUrl() {
    const profileXUrl = accountState.isLoggedIn ? accountState.profile.xUrl : '';
    if (profileXUrl) {
      return profileXUrl;
    }
    return readPixieedLocalXUrl();
  }

  function isMissingColumn(error, column) {
    const msg = String(error?.message || '').toLowerCase();
    const needle = String(column || '').toLowerCase();
    return Boolean(msg && needle && msg.includes(needle));
  }

  function isMissingTable(error, table) {
    const msg = [
      error?.message,
      error?.details,
      error?.hint,
      error?.code,
    ].filter(Boolean).join(' ').toLowerCase();
    const needle = String(table || '').toLowerCase();
    return Boolean(msg && needle && msg.includes(needle));
  }

  function shouldIgnorePixieedProfileError(error) {
    if (!error) {
      return false;
    }
    const status = Number(error?.status || 0);
    const msg = [
      error?.message,
      error?.details,
      error?.hint,
      error?.code,
    ].filter(Boolean).join(' ').toLowerCase();
    return (
      status === 404
      || msg.includes('relation does not exist')
      || msg.includes('table not found')
      || msg.includes('schema cache')
      || msg.includes('not found')
      || isMissingTable(error, 'user_profiles')
      || msg.includes('user_profiles')
    );
  }

  function shouldDisableSharedProjectsBackend(error) {
    if (!error) {
      return false;
    }
    return (
      isMissingTable(error, 'shared_projects')
      || isMissingTable(error, 'shared_project_members')
      || isMissingColumn(error, 'latest_snapshot')
      || String(error?.code || '') === 'PGRST204'
    );
  }

  function isMissingRpcFunction(error, functionName = '') {
    const normalizedFunctionName = String(functionName || '').trim().toLowerCase();
    if (!normalizedFunctionName) {
      return false;
    }
    const msg = [
      error?.message,
      error?.details,
      error?.hint,
      error?.code,
    ].filter(Boolean).join(' ').toLowerCase();
    return (
      String(error?.code || '') === 'PGRST202'
      && msg.includes(normalizedFunctionName)
    );
  }

        return Object.freeze({
          isMissingColumn,
          isMissingRpcFunction,
          isMissingTable,
          normalizePixieedAvatarId,
          readPixieedAccountAvatarId,
          readPixieedAccountNickname,
          readPixieedAccountXUrl,
          readPixieedLocalAvatarId,
          readPixieedLocalNickname,
          readPixieedLocalXUrl,
          resolvePixieedAvatarSrcFromId,
          shouldDisableSharedProjectsBackend,
          shouldIgnorePixieedProfileError,
          writePixieedLocalAvatarId,
          writePixieedLocalNickname,
          writePixieedLocalXUrl,
        });
      }
    })(scope);
  }

  root.pixieedProfileLocalUtils = Object.freeze({
    createPixieedProfileLocalUtils,
  });
})();
