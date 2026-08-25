import { sha256Hex } from "./canonical-json.js";
import type { CanonicalOperation } from "./types.js";

export interface JournalRecord {
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly recordHash: string;
  readonly operation: CanonicalOperation;
}

async function calculateRecordHash(
  sequence: number,
  previousRecordHash: string | null,
  operation: CanonicalOperation
): Promise<string> {
  return sha256Hex({
    sequence,
    previousRecordHash,
    operation,
  });
}

export class MemoryJournal {
  readonly #records: JournalRecord[] = [];
  readonly #operationIds = new Set<string>();

  get records(): readonly JournalRecord[] {
    return this.#records;
  }

  async append(operation: CanonicalOperation): Promise<JournalRecord> {
    if (this.#operationIds.has(operation.operationId)) {
      throw new Error(`Duplicate operation in journal: ${operation.operationId}`);
    }

    const sequence = this.#records.length + 1;
    const previousRecordHash =
      this.#records.at(-1)?.recordHash ?? null;
    const recordHash = await calculateRecordHash(
      sequence,
      previousRecordHash,
      operation
    );

    const record: JournalRecord = {
      sequence,
      previousRecordHash,
      recordHash,
      operation: structuredClone(operation),
    };

    this.#records.push(record);
    this.#operationIds.add(operation.operationId);
    return record;
  }
}

export async function verifyJournal(
  records: readonly JournalRecord[]
): Promise<{
  readonly ok: boolean;
  readonly error?: string;
}> {
  let previousRecordHash: string | null = null;
  const operationIds = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined) {
      return { ok: false, error: `Missing record at index ${index}.` };
    }

    const expectedSequence = index + 1;
    if (record.sequence !== expectedSequence) {
      return {
        ok: false,
        error: `Expected journal sequence ${expectedSequence}, received ${record.sequence}.`,
      };
    }

    if (record.previousRecordHash !== previousRecordHash) {
      return {
        ok: false,
        error: `Journal hash chain broke at sequence ${record.sequence}.`,
      };
    }

    if (operationIds.has(record.operation.operationId)) {
      return {
        ok: false,
        error: `Duplicate operation ID at sequence ${record.sequence}.`,
      };
    }

    const expectedHash = await calculateRecordHash(
      record.sequence,
      record.previousRecordHash,
      record.operation
    );

    if (record.recordHash !== expectedHash) {
      return {
        ok: false,
        error: `Journal record hash mismatch at sequence ${record.sequence}.`,
      };
    }

    operationIds.add(record.operation.operationId);
    previousRecordHash = record.recordHash;
  }

  return { ok: true };
}
