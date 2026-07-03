(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createUpdateHistoryUtils({
    canUseSessionStorage,
    UPDATE_HISTORY_STORAGE_KEY,
    UPDATE_HISTORY_RETENTION_MS,
    BUILTIN_UPDATE_HISTORY_ENTRIES,
    SUPPRESSED_UPDATE_HISTORY_IDS,
  } = {}) {
    function parseUpdateHistoryTimestamp(value) {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function normalizeUpdateHistoryEntry(entry) {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const at = typeof entry.at === 'string' ? entry.at : '';
      const timestamp = parseUpdateHistoryTimestamp(at);
      if (!timestamp) {
        return null;
      }
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      if (!title) {
        return null;
      }
      const detailsSource = Array.isArray(entry.details) ? entry.details : [];
      const details = detailsSource
        .map(detail => (typeof detail === 'string' ? detail.trim() : ''))
        .filter(Boolean);
      const idSource = typeof entry.id === 'string' ? entry.id.trim() : '';
      const id = idSource || `${at}:${title}`;
      return {
        id,
        at,
        timestamp,
        title,
        details,
      };
    }

    function formatUpdateHistoryDate(timestamp, fallback = '') {
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return fallback;
      }
      const d = new Date(timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}/${m}/${day} ${hh}:${mm}`;
    }

    function loadStoredUpdateHistoryEntries() {
      if (!canUseSessionStorage) {
        return [];
      }
      try {
        const raw = window.localStorage.getItem(UPDATE_HISTORY_STORAGE_KEY);
        if (!raw) {
          return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed;
      } catch (error) {
        return [];
      }
    }

    function saveStoredUpdateHistoryEntries(entries) {
      if (!canUseSessionStorage) {
        return;
      }
      try {
        const payload = Array.isArray(entries)
          ? entries.map(entry => ({
            id: entry.id,
            at: entry.at,
            title: entry.title,
            details: Array.isArray(entry.details) ? entry.details : [],
          }))
          : [];
        window.localStorage.setItem(UPDATE_HISTORY_STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        // Ignore localStorage errors.
      }
    }

    function getUpdateHistoryEntries() {
      const cutoff = Date.now() - UPDATE_HISTORY_RETENTION_MS;
      const mergedById = new Map();
      const source = [
        ...loadStoredUpdateHistoryEntries(),
        ...BUILTIN_UPDATE_HISTORY_ENTRIES,
      ];
      source.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const entryId = typeof entry.id === 'string' ? entry.id.trim() : '';
        if ((entry.published === false) || (entryId && SUPPRESSED_UPDATE_HISTORY_IDS.has(entryId))) {
          return;
        }
        const normalized = normalizeUpdateHistoryEntry(entry);
        if (!normalized) {
          return;
        }
        if (normalized.timestamp < cutoff) {
          return;
        }
        const previous = mergedById.get(normalized.id);
        if (!previous || normalized.timestamp >= previous.timestamp) {
          mergedById.set(normalized.id, normalized);
        }
      });
      const merged = Array.from(mergedById.values()).sort((a, b) => b.timestamp - a.timestamp);
      saveStoredUpdateHistoryEntries(merged);
      return merged;
    }

    return Object.freeze({
      parseUpdateHistoryTimestamp,
      normalizeUpdateHistoryEntry,
      formatUpdateHistoryDate,
      loadStoredUpdateHistoryEntries,
      saveStoredUpdateHistoryEntries,
      getUpdateHistoryEntries,
    });
  }

  root.updateHistoryUtils = Object.freeze({
    createUpdateHistoryUtils,
  });
})();
