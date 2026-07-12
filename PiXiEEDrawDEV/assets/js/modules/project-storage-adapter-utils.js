(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectStorageAdapterUtils({ console: logger = console } = {}) {
    function isBlobLike(value) {
      return Boolean(value && typeof value === 'object' && typeof value.arrayBuffer === 'function');
    }

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
        const preferredId = typeof options?.preferredAdapterId === 'string'
          ? options.preferredAdapterId
          : '';
        const preferredAdapter = preferredId
          ? normalizedAdapters.find(candidate => candidate.id === preferredId)
          : null;
        const candidates = [
          preferredAdapter,
          ...normalizedAdapters.filter(candidate => candidate !== preferredAdapter),
        ].filter(candidate => typeof candidate?.parseText === 'function');
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
          const adapter = candidates[index];
          try {
            const parsed = adapter.parseText(text, options);
            if (typeof adapter.canReadParsedValue === 'function' && !adapter.canReadParsedValue(parsed)) {
              continue;
            }
            return {
              adapterId: adapter.id,
              parsed,
            };
          } catch (error) {
            lastError = error;
          }
        }
        if (lastError) {
          throw lastError;
        }
        if (!candidates.length) {
          throw new Error('No project storage adapter is available for text parsing');
        }
        throw new Error('No project storage adapter accepted the text payload');
      }

      function findReaderAdapterForBytes(bytes, options = {}) {
        const preferredAdapter = getAdapterById(options?.preferredAdapterId);
        if (preferredAdapter && typeof preferredAdapter.canReadBytes === 'function') {
          try {
            if (preferredAdapter.canReadBytes(bytes, options)) {
              return preferredAdapter;
            }
          } catch (error) {
            logger?.warn?.('Preferred project storage adapter byte probe failed', error);
          }
        }
        for (let index = 0; index < normalizedAdapters.length; index += 1) {
          const adapter = normalizedAdapters[index];
          if (typeof adapter.canReadBytes !== 'function') {
            continue;
          }
          try {
            if (adapter.canReadBytes(bytes, options)) {
              return adapter;
            }
          } catch (error) {
            logger?.warn?.('Project storage adapter byte probe failed', error);
          }
        }
        return preferredAdapter || getDefaultAdapter();
      }

      async function parseBytes(bytes, options = {}) {
        const adapter = findReaderAdapterForBytes(bytes, options);
        if (!adapter) {
          throw new Error('No project storage adapter accepted the byte payload');
        }
        if (typeof adapter.parseBytes === 'function') {
          const parsed = await adapter.parseBytes(bytes, options);
          return {
            adapterId: adapter.id,
            parsed,
          };
        }
        if (typeof adapter.parseText === 'function') {
          const decoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
          if (!decoder) {
            throw new Error('TextDecoder is not available for fallback project parsing');
          }
          const parsed = adapter.parseText(decoder.decode(bytes), options);
          return {
            adapterId: adapter.id,
            parsed,
          };
        }
        throw new Error(`Project storage adapter "${adapter.id}" cannot parse bytes`);
      }

      async function parseBlob(blob, options = {}) {
        if (!isBlobLike(blob)) {
          throw new Error('Project blob is not readable');
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return await parseBytes(bytes, {
          ...options,
          fileName: options?.fileName || (typeof blob.name === 'string' ? blob.name : ''),
        });
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

      async function serializeProject(projectState, options = {}) {
        const adapter = resolveWriterAdapter(options?.preferredAdapterId);
        if (!adapter || typeof adapter.serializeProject !== 'function') {
          throw new Error('No project storage adapter is available for serialization');
        }
        const serialized = await adapter.serializeProject(projectState, options) || {};
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
        findReaderAdapterForBytes,
        findReaderAdapterForParsedValue,
        parseText,
        parseBytes,
        parseBlob,
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
