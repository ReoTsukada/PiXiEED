(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectStorageAdapterUtils({ console: logger = console } = {}) {
    function normalizeAdapterRecord(adapter) {
      if (!adapter || typeof adapter !== 'object') {
        return null;
      }
      const id = typeof adapter.id === 'string' ? adapter.id.trim() : '';
      if (!id) {
        return null;
      }
      return {
        ...adapter,
        id,
      };
    }

    function createProjectStorageAdapterRegistry({
      adapters = [],
      defaultAdapterId = '',
    } = {}) {
      const normalizedAdapters = adapters
        .map(normalizeAdapterRecord)
        .filter(Boolean);
      const adapterMap = new Map(normalizedAdapters.map(adapter => [adapter.id, adapter]));
      const resolvedDefaultAdapterId = adapterMap.has(defaultAdapterId)
        ? defaultAdapterId
        : (normalizedAdapters[0]?.id || '');

      function getAdapterById(adapterId = '') {
        const normalizedId = typeof adapterId === 'string' ? adapterId.trim() : '';
        return normalizedId ? (adapterMap.get(normalizedId) || null) : null;
      }

      function getDefaultAdapter() {
        return getAdapterById(resolvedDefaultAdapterId);
      }

      function listAdapters() {
        return normalizedAdapters.slice();
      }

      function resolveWriterAdapter(preferredAdapterId = '') {
        return getAdapterById(preferredAdapterId) || getDefaultAdapter();
      }

      function findReaderAdapterForParsedValue(parsed, preferredAdapterId = '') {
        const preferredAdapter = getAdapterById(preferredAdapterId);
        if (preferredAdapter && typeof preferredAdapter.canReadParsedValue === 'function') {
          try {
            if (preferredAdapter.canReadParsedValue(parsed)) {
              return preferredAdapter;
            }
          } catch (error) {
            logger?.warn?.('Preferred project storage adapter probe failed', error);
          }
        }
        for (let index = 0; index < normalizedAdapters.length; index += 1) {
          const adapter = normalizedAdapters[index];
          if (typeof adapter.canReadParsedValue !== 'function') {
            continue;
          }
          try {
            if (adapter.canReadParsedValue(parsed)) {
              return adapter;
            }
          } catch (error) {
            logger?.warn?.('Project storage adapter probe failed', error);
          }
        }
        return preferredAdapter || getDefaultAdapter();
      }

      function parseText(text, options = {}) {
        const adapter = resolveWriterAdapter(options?.preferredAdapterId);
        if (!adapter || typeof adapter.parseText !== 'function') {
          throw new Error('No project storage adapter is available for text parsing');
        }
        const parsed = adapter.parseText(text, options);
        return {
          adapterId: adapter.id,
          parsed,
        };
      }

      function parseParsedValue(parsed, options = {}) {
        const adapter = findReaderAdapterForParsedValue(parsed, options?.preferredAdapterId);
        if (!adapter) {
          throw new Error('No project storage adapter accepted the parsed value');
        }
        const normalizedParsed = typeof adapter.normalizeParsedValue === 'function'
          ? adapter.normalizeParsedValue(parsed, options)
          : parsed;
        return {
          adapterId: adapter.id,
          parsed: normalizedParsed,
        };
      }

      function serializeProject(projectState, options = {}) {
        const adapter = resolveWriterAdapter(options?.preferredAdapterId);
        if (!adapter || typeof adapter.serializeProject !== 'function') {
          throw new Error('No project storage adapter is available for serialization');
        }
        const serialized = adapter.serializeProject(projectState, options) || {};
        return {
          adapterId: adapter.id,
          ...serialized,
        };
      }

      return Object.freeze({
        getDefaultAdapter,
        getAdapterById,
        listAdapters,
        resolveWriterAdapter,
        findReaderAdapterForParsedValue,
        parseText,
        parseParsedValue,
        serializeProject,
      });
    }

    return Object.freeze({
      normalizeAdapterRecord,
      createProjectStorageAdapterRegistry,
    });
  }

  root.projectStorageAdapterUtils = Object.freeze({
    createProjectStorageAdapterUtils,
  });
})();
