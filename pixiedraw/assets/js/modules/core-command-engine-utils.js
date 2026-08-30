(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function fail(code, message, path = '') {
    return Object.freeze({
      code,
      severity: 'error',
      message,
      ...(path ? { path } : {}),
    });
  }

  function normalizeCanonicalJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new TypeError('Canonical JSON cannot encode non-finite numbers.');
      }
      return Object.is(value, -0) ? 0 : value;
    }
    if (value instanceof Uint8Array) {
      return { $type: 'Uint8Array', data: Array.from(value) };
    }
    if (Array.isArray(value)) return value.map(normalizeCanonicalJson);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((result, key) => {
        if (value[key] !== undefined) result[key] = normalizeCanonicalJson(value[key]);
        return result;
      }, {});
    }
    throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
  }

  function canonicalJson(value) {
    return JSON.stringify(normalizeCanonicalJson(value));
  }

  async function sha256Hex(value) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto subtle.digest is required for Core operation IDs.');
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function cloneState(state) {
    if (typeof structuredClone !== 'function') {
      throw new Error('structuredClone is required for atomic Core command application.');
    }
    return structuredClone(state);
  }

  function validateEnvelope(state, command) {
    const diagnostics = [];
    if (!command || typeof command !== 'object') {
      return [fail('COMMAND_ENVELOPE_INVALID', 'Command envelope must be an object.')];
    }
    if (command.schemaVersion !== 1) {
      diagnostics.push(fail('COMMAND_SCHEMA_UNSUPPORTED', 'Unsupported command schema version.', 'schemaVersion'));
    }
    if (command.projectId !== state.projectId) {
      diagnostics.push(fail('COMMAND_PROJECT_MISMATCH', 'The command belongs to a different project.', 'projectId'));
    }
    if (command.baseStructureEpoch !== state.structureEpoch) {
      diagnostics.push(fail(
        'COMMAND_STRUCTURE_EPOCH_MISMATCH',
        `Expected structure epoch ${state.structureEpoch}, received ${command.baseStructureEpoch}.`,
        'baseStructureEpoch',
      ));
    }
    if ((state.appliedCommandIds || []).includes(command.commandId)) {
      diagnostics.push(fail('COMMAND_DUPLICATE', 'The command has already been applied.', 'commandId'));
    }
    const previousSequence = state.lastClientSequenceByClient?.[command.clientId] || 0;
    if (command.clientSequence !== previousSequence + 1) {
      diagnostics.push(fail(
        'COMMAND_CLIENT_SEQUENCE_GAP',
        `Expected client sequence ${previousSequence + 1}, received ${command.clientSequence}.`,
        'clientSequence',
      ));
    }
    for (const [field, value] of Object.entries({
      commandId: command.commandId,
      commandType: command.commandType,
      actorId: command.actorId,
      clientId: command.clientId,
      assetId: command.assetId,
    })) {
      if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
        diagnostics.push(fail('COMMAND_REQUIRED_FIELD', `${field} must be a non-empty string.`, field));
      }
    }
    if (!Number.isSafeInteger(command.clientSequence) || command.clientSequence < 1) {
      diagnostics.push(fail('COMMAND_CLIENT_SEQUENCE_INVALID', 'clientSequence must be a positive safe integer.', 'clientSequence'));
    }
    if (!Number.isFinite(command.createdAtMonotonicMs) || command.createdAtMonotonicMs < 0) {
      diagnostics.push(fail('COMMAND_MONOTONIC_TIME_INVALID', 'createdAtMonotonicMs must be finite and non-negative.', 'createdAtMonotonicMs'));
    }
    return diagnostics;
  }

  async function makeOperation(command, structureEpoch, payload, inverseOf, hash = sha256Hex) {
    const operationWithoutId = {
      operationType: command.commandType,
      schemaVersion: 1,
      commandId: command.commandId,
      projectId: command.projectId,
      assetId: command.assetId,
      actorId: command.actorId,
      clientId: command.clientId,
      clientSequence: command.clientSequence,
      structureEpoch,
      payload,
      ...(inverseOf ? { inverseOf } : {}),
    };
    const digest = await hash(operationWithoutId);
    return Object.freeze({ operationId: `op_${digest}`, ...operationWithoutId });
  }

  function createRasterSetPixelHandler() {
    return Object.freeze({
      commandType: 'raster.setPixel',
      validate(state, command) {
        const asset = state.assets?.[command.assetId];
        if (!asset) return [fail('RASTER_ASSET_NOT_FOUND', `Raster asset not found: ${command.assetId}.`, 'assetId')];
        const payload = command.payload;
        const diagnostics = [];
        if (!payload || typeof payload !== 'object') {
          return [fail('RASTER_PAYLOAD_INVALID', 'Raster payload must be an object.', 'payload')];
        }
        if (!Number.isInteger(payload.x) || payload.x < 0 || payload.x >= asset.width) {
          diagnostics.push(fail('RASTER_X_OUT_OF_BOUNDS', `x must be between 0 and ${asset.width - 1}.`, 'payload.x'));
        }
        if (!Number.isInteger(payload.y) || payload.y < 0 || payload.y >= asset.height) {
          diagnostics.push(fail('RASTER_Y_OUT_OF_BOUNDS', `y must be between 0 and ${asset.height - 1}.`, 'payload.y'));
        }
        if (!Number.isInteger(payload.colorIndex) || payload.colorIndex < 0 || payload.colorIndex >= asset.palette.length) {
          diagnostics.push(fail('RASTER_COLOR_INDEX_INVALID', 'colorIndex must reference the current palette.', 'payload.colorIndex'));
        }
        if (!asset.pixels || typeof asset.pixels.length !== 'number' || asset.pixels.length < asset.width * asset.height) {
          diagnostics.push(fail('RASTER_PIXELS_INVALID', 'Raster pixels do not cover the declared dimensions.', 'assets'));
        }
        return diagnostics;
      },
      apply(draft, command) {
        const asset = draft.assets[command.assetId];
        const { x, y, colorIndex } = command.payload;
        const index = y * asset.width + x;
        const previousColorIndex = asset.pixels[index];
        if (previousColorIndex === undefined) throw new Error(`Raster pixel index is missing: ${index}`);
        asset.pixels[index] = colorIndex;
        asset.revision = (Number(asset.revision) || 0) + 1;
        return {
          operationPayload: { x, y, colorIndex, previousColorIndex },
          inversePayload: { x, y, colorIndex: previousColorIndex, previousColorIndex: colorIndex },
          dirtyAssets: [asset.id],
          dirtyRegions: [{ assetId: asset.id, x, y, width: 1, height: 1 }],
          buildInvalidations: [{ kind: 'preview', targetId: asset.id, reason: 'Raster pixel changed.' }],
          memoryDeltaBytes: 0,
        };
      },
    });
  }

  function applyRasterOperation(state, operation) {
    if (operation?.operationType !== 'raster.setPixel') throw new Error('Unsupported raster operation.');
    const next = cloneState(state);
    const asset = next.assets?.[operation.assetId];
    if (!asset) throw new Error(`Raster asset not found during replay: ${operation.assetId}`);
    const { x, y, colorIndex } = operation.payload || {};
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= asset.width || y >= asset.height) {
      throw new Error('Journal operation contains an out-of-bounds pixel.');
    }
    if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= asset.palette.length) {
      throw new Error('Journal operation contains an invalid palette index.');
    }
    asset.pixels[y * asset.width + x] = colorIndex;
    asset.revision = (Number(asset.revision) || 0) + 1;
    return next;
  }

  function createCoreCommandEngine({ hash = sha256Hex, handlers = [] } = {}) {
    const registry = new Map();
    handlers.forEach(handler => register(handler));

    function register(handler) {
      if (!handler?.commandType || typeof handler.validate !== 'function' || typeof handler.apply !== 'function') {
        throw new TypeError('A Core command handler requires commandType, validate, and apply.');
      }
      if (registry.has(handler.commandType)) throw new Error(`Command handler already registered: ${handler.commandType}`);
      registry.set(handler.commandType, handler);
      return handler;
    }

    async function execute(state, command) {
      const envelopeDiagnostics = validateEnvelope(state, command);
      const handler = registry.get(command?.commandType);
      if (!handler) envelopeDiagnostics.push(fail('COMMAND_HANDLER_NOT_FOUND', `No command handler is registered for ${command?.commandType}.`, 'commandType'));
      if (envelopeDiagnostics.some(item => item.severity === 'error')) return { ok: false, state, diagnostics: envelopeDiagnostics };
      const handlerDiagnostics = handler.validate(state, command);
      if (handlerDiagnostics.some(item => item.severity === 'error')) return { ok: false, state, diagnostics: handlerDiagnostics };
      const draft = cloneState(state);
      let outcome;
      try {
        outcome = handler.apply(draft, command);
      } catch (error) {
        return { ok: false, state, diagnostics: [fail('COMMAND_APPLY_FAILED', `The command failed atomically: ${error?.message || String(error)}`)] };
      }
      draft.appliedCommandIds = [...(draft.appliedCommandIds || []), command.commandId];
      draft.lastClientSequenceByClient = { ...(draft.lastClientSequenceByClient || {}), [command.clientId]: command.clientSequence };
      const operation = await makeOperation(command, draft.structureEpoch, outcome.operationPayload, '', hash);
      const inverse = outcome.inversePayload === undefined
        ? undefined
        : await makeOperation(command, draft.structureEpoch, outcome.inversePayload, operation.operationId, hash);
      return {
        ok: true,
        state: draft,
        result: {
          operation,
          ...(inverse ? { inverse } : {}),
          dirtyAssets: [...(outcome.dirtyAssets || [])],
          dirtyRegions: [...(outcome.dirtyRegions || [])],
          buildInvalidations: [...(outcome.buildInvalidations || [])],
          memoryDeltaBytes: outcome.memoryDeltaBytes || 0,
          warnings: handlerDiagnostics.filter(item => item.severity !== 'error').concat(outcome.warnings || []),
        },
      };
    }

    return Object.freeze({ execute, register, has: commandType => registry.has(commandType) });
  }

  root.coreCommandEngineUtils = Object.freeze({
    canonicalJson,
    sha256Hex,
    createCoreCommandEngine,
    createRasterSetPixelHandler,
    applyRasterOperation,
  });
})();
