(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function normalizeCanonicalJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Canonical JSON cannot encode non-finite numbers.');
      return Object.is(value, -0) ? 0 : value;
    }
    if (value instanceof Uint8Array) return { $type: 'Uint8Array', data: Array.from(value) };
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
    if (!subtle) throw new Error('Web Crypto subtle.digest is required for journal integrity.');
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function clone(value) {
    if (typeof structuredClone !== 'function') throw new Error('structuredClone is required for recovery isolation.');
    return structuredClone(value);
  }

  function invalid(code, message, path = '') {
    return { code, message, ...(path ? { path } : {}) };
  }

  function validateProjectState(state) {
    if (!state || typeof state !== 'object') return invalid('CHECKPOINT_STATE_INVALID', 'Project state must be an object.', 'state');
    if (typeof state.projectId !== 'string' || !state.projectId) return invalid('CHECKPOINT_PROJECT_ID_INVALID', 'Project ID must be a non-empty string.', 'state.projectId');
    if (!Number.isSafeInteger(state.structureEpoch) || state.structureEpoch < 0) return invalid('CHECKPOINT_EPOCH_INVALID', 'Structure epoch must be a non-negative safe integer.', 'state.structureEpoch');
    if (!state.assets || typeof state.assets !== 'object' || Array.isArray(state.assets)) return invalid('CHECKPOINT_ASSETS_INVALID', 'Assets must be a keyed object.', 'state.assets');
    for (const [assetKey, asset] of Object.entries(state.assets)) {
      if (!asset || typeof asset !== 'object') return invalid('CHECKPOINT_ASSET_INVALID', 'Asset must be an object.', `state.assets.${assetKey}`);
      if (typeof asset.id !== 'string' || !asset.id || asset.id !== assetKey) return invalid('CHECKPOINT_ASSET_ID_INVALID', 'Asset ID must be stable and match its key.', `state.assets.${assetKey}.id`);
      if (!Number.isSafeInteger(asset.width) || asset.width < 1 || asset.width > 16384) return invalid('CHECKPOINT_WIDTH_INVALID', 'Asset width is invalid.', `state.assets.${assetKey}.width`);
      if (!Number.isSafeInteger(asset.height) || asset.height < 1 || asset.height > 16384) return invalid('CHECKPOINT_HEIGHT_INVALID', 'Asset height is invalid.', `state.assets.${assetKey}.height`);
      if (!Array.isArray(asset.palette) || asset.palette.length < 1 || asset.palette.length > 256) return invalid('CHECKPOINT_PALETTE_INVALID', 'Asset palette is invalid.', `state.assets.${assetKey}.palette`);
      if (!asset.pixels || typeof asset.pixels.length !== 'number' || asset.pixels.length < asset.width * asset.height) return invalid('CHECKPOINT_PIXELS_INVALID', 'Asset pixels do not cover its dimensions.', `state.assets.${assetKey}.pixels`);
    }
    return null;
  }

  function createCoreJournalRecovery({ hash = sha256Hex } = {}) {
    const records = [];
    const operationIds = new Set();

    async function append(operation) {
      if (!operation || typeof operation !== 'object' || typeof operation.operationId !== 'string' || !operation.operationId) {
        throw Object.assign(new Error('Operation ID is required.'), { code: 'JOURNAL_OPERATION_ID_INVALID' });
      }
      if (operationIds.has(operation.operationId)) {
        throw Object.assign(new Error(`Duplicate operation in journal: ${operation.operationId}`), { code: 'JOURNAL_DUPLICATE_OPERATION' });
      }
      const sequence = records.length + 1;
      const previousRecordHash = records.at(-1)?.recordHash || null;
      const recordHash = await hash({ sequence, previousRecordHash, operation });
      const record = Object.freeze({ sequence, previousRecordHash, recordHash, operation: clone(operation) });
      records.push(record);
      operationIds.add(operation.operationId);
      return record;
    }

    function snapshot() {
      return clone(records);
    }

    async function verify(input = records) {
      if (!Array.isArray(input)) return { ok: false, error: invalid('JOURNAL_RECORDS_INVALID', 'Journal records must be an array.') };
      let previousRecordHash = null;
      const seenOperationIds = new Set();
      for (let index = 0; index < input.length; index += 1) {
        const record = input[index];
        const expectedSequence = index + 1;
        if (!record || typeof record !== 'object') return { ok: false, error: invalid('JOURNAL_RECORD_INVALID', 'Journal record is missing.', `records.${index}`) };
        if (record.sequence !== expectedSequence) return { ok: false, error: invalid('JOURNAL_SEQUENCE_GAP', `Expected sequence ${expectedSequence}, received ${record.sequence}.`, `records.${index}.sequence`) };
        if (record.previousRecordHash !== previousRecordHash) return { ok: false, error: invalid('JOURNAL_HASH_CHAIN_BROKEN', 'Journal hash chain is broken.', `records.${index}.previousRecordHash`) };
        const operationId = record.operation?.operationId;
        if (typeof operationId !== 'string' || !operationId) return { ok: false, error: invalid('JOURNAL_OPERATION_ID_INVALID', 'Journal operation ID is invalid.', `records.${index}.operation.operationId`) };
        if (seenOperationIds.has(operationId)) return { ok: false, error: invalid('JOURNAL_DUPLICATE_OPERATION', 'Journal operation ID is duplicated.', `records.${index}.operation.operationId`) };
        const expectedHash = await hash({ sequence: record.sequence, previousRecordHash: record.previousRecordHash, operation: record.operation });
        if (record.recordHash !== expectedHash) return { ok: false, error: invalid('JOURNAL_RECORD_HASH_MISMATCH', 'Journal record hash does not match its content.', `records.${index}.recordHash`) };
        seenOperationIds.add(operationId);
        previousRecordHash = record.recordHash;
      }
      return { ok: true, length: input.length, lastRecordHash: previousRecordHash };
    }

    async function createCheckpoint(state, journalLength = records.length, lastOperationId = null) {
      const stateError = validateProjectState(state);
      if (stateError) throw Object.assign(new Error(stateError.message), stateError);
      if (!Number.isSafeInteger(journalLength) || journalLength < 0 || journalLength > records.length) {
        throw Object.assign(new Error('Checkpoint journal length is invalid.'), { code: 'CHECKPOINT_JOURNAL_LENGTH_INVALID' });
      }
      const clonedState = clone(state);
      return Object.freeze({ checkpointVersion: 1, projectId: state.projectId, stateHash: await hash(clonedState), journalLength, lastOperationId, state: clonedState });
    }

    async function validateCheckpoint(checkpoint) {
      if (!checkpoint || typeof checkpoint !== 'object') return { ok: false, error: invalid('CHECKPOINT_INVALID', 'Checkpoint must be an object.') };
      if (checkpoint.checkpointVersion !== 1) return { ok: false, error: invalid('CHECKPOINT_VERSION_UNSUPPORTED', 'Checkpoint version is unsupported.', 'checkpointVersion') };
      const stateError = validateProjectState(checkpoint.state);
      if (stateError) return { ok: false, error: stateError };
      if (checkpoint.projectId !== checkpoint.state.projectId) return { ok: false, error: invalid('CHECKPOINT_PROJECT_MISMATCH', 'Checkpoint project ID does not match embedded state.', 'projectId') };
      if (!Number.isSafeInteger(checkpoint.journalLength) || checkpoint.journalLength < 0) return { ok: false, error: invalid('CHECKPOINT_JOURNAL_LENGTH_INVALID', 'Checkpoint journal length is invalid.', 'journalLength') };
      if (checkpoint.lastOperationId !== null && (typeof checkpoint.lastOperationId !== 'string' || !checkpoint.lastOperationId)) return { ok: false, error: invalid('CHECKPOINT_OPERATION_ID_INVALID', 'Checkpoint last operation ID is invalid.', 'lastOperationId') };
      const actualHash = await hash(checkpoint.state);
      if (actualHash !== checkpoint.stateHash) return { ok: false, error: invalid('CHECKPOINT_STATE_HASH_MISMATCH', 'Checkpoint state hash does not match embedded state.', 'stateHash') };
      return { ok: true };
    }

    async function recover(checkpoint, input = records, applyOperation = () => {}) {
      const checkpointResult = await validateCheckpoint(checkpoint);
      if (!checkpointResult.ok) return { ok: false, error: checkpointResult.error };
      const journalResult = await verify(input);
      if (!journalResult.ok) return { ok: false, error: journalResult.error };
      if (checkpoint.journalLength > input.length) return { ok: false, error: invalid('RECOVERY_JOURNAL_TOO_SHORT', 'Journal does not contain the checkpoint length.') };
      if (checkpoint.journalLength > 0 && input[checkpoint.journalLength - 1].operation.operationId !== checkpoint.lastOperationId) return { ok: false, error: invalid('RECOVERY_CHECKPOINT_ANCHOR_MISMATCH', 'Checkpoint does not anchor the journal.') };
      const nextState = clone(checkpoint.state);
      try {
        for (const record of input.slice(checkpoint.journalLength)) applyOperation(nextState, clone(record.operation));
      } catch (error) {
        return { ok: false, error: invalid('RECOVERY_APPLY_FAILED', error?.message || String(error)) };
      }
      return { ok: true, state: nextState, appliedFromSequence: checkpoint.journalLength + 1, appliedThroughSequence: input.length };
    }

    return Object.freeze({ append, snapshot, verify, createCheckpoint, validateCheckpoint, recover });
  }

  root.coreJournalRecoveryUtils = Object.freeze({ canonicalJson, sha256Hex, createCoreJournalRecovery, validateProjectState });
})();
