/**
 * FP-004 isolated file-backed durability adapter.
 *
 * This is a local reference adapter for restart evidence. It is not a
 * production database, queue, provider, or cross-process concurrency layer.
 */

import {
  type Fp004AdapterOptions,
  type Fp004ConsumerFailure,
  type Fp004DurableSnapshot,
  type Fp004LeaseRequest,
  type Fp004LeaseResult,
  type Fp004ReplayResult,
  Fp004RestartableInMemoryAdapter,
} from "./durable-transaction.ts";
import type {
  Fp004CommitRequest,
  Fp004CommitResult,
  Fp004EventId,
  Fp004OutboxRecord,
  Fp004ReplayRequest,
  Fp004Result,
} from "./contracts.ts";

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const TEXT_ENCODER = new TextEncoder();

export interface Fp004FileDurabilityCapability {
  readonly adapterId: "FP004_FILE_DURABLE_REFERENCE";
  readonly storage: "LOCAL_FILE_ATOMIC_RENAME";
  readonly processDurable: true;
  readonly atomicFileReplace: true;
  readonly powerLossDurable: false;
  readonly powerLossDurability: "UNTESTED";
  readonly crossProcessConcurrency: false;
  readonly productionEquivalent: false;
  readonly productionEquivalentStatus: "UNTESTED";
  readonly productionReady: false;
}

export const FP004_FILE_DURABILITY_CAPABILITY: Fp004FileDurabilityCapability =
  Object.freeze({
    adapterId: "FP004_FILE_DURABLE_REFERENCE",
    storage: "LOCAL_FILE_ATOMIC_RENAME",
    processDurable: true,
    atomicFileReplace: true,
    powerLossDurable: false,
    powerLossDurability: "UNTESTED",
    crossProcessConcurrency: false,
    productionEquivalent: false,
    productionEquivalentStatus: "UNTESTED",
    productionReady: false,
  });

function assertAbsolutePath(filePath: string, label: string): void {
  if (
    !filePath.startsWith("/") ||
    filePath.startsWith("//") ||
    filePath.split("/").some((segment) => segment === "..") ||
    filePath.includes("//") ||
    filePath.endsWith("/") ||
    filePath.length > 1024
  ) {
    throw new Error(`FP-004 durable ${label} is unsafe.`);
  }
}

function assertRelativeSnapshotName(fileName: string): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}\.json$/.test(fileName) ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new Error("FP-004 durable snapshot name is unsafe.");
  }
}

async function assertNoSymlink(path: string, label: string): Promise<void> {
  try {
    const info = await Deno.lstat(path);
    if (info.isSymlink) {
      throw new Error(`FP-004 durable ${label} symlink is unsafe.`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
}

async function resolveStoragePath(
  storageRoot: string,
  snapshotName: string,
): Promise<{ storageRoot: string; filePath: string }> {
  assertAbsolutePath(storageRoot, "storage root");
  assertRelativeSnapshotName(snapshotName);
  await assertNoSymlink(storageRoot, "storage root");
  const realRoot = await Deno.realPath(storageRoot);
  const rootInfo = await Deno.lstat(realRoot);
  if (!rootInfo.isDirectory || rootInfo.isSymlink) {
    throw new Error("FP-004 durable storage root is unsafe.");
  }
  const filePath = `${realRoot}/${snapshotName}`;
  await assertNoSymlink(filePath, "snapshot");
  await assertNoSymlink(`${filePath}.tmp`, "temporary snapshot");
  return { storageRoot: realRoot, filePath };
}

export interface Fp004FileAdapterTestHooks {
  /** Test-only seam for deterministic failure injection. */
  readonly rename?: (from: string, to: string) => Promise<void>;
}

function snapshotBytes(snapshot: Fp004DurableSnapshot): Uint8Array {
  const json = JSON.stringify(snapshot);
  const bytes = TEXT_ENCODER.encode(json);
  if (bytes.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error("FP-004 durable snapshot exceeds the size bound.");
  }
  return bytes;
}

async function writeAtomically(
  filePath: string,
  bytes: Uint8Array,
  hooks: Fp004FileAdapterTestHooks = {},
): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await assertNoSymlink(temporaryPath, "temporary snapshot");
  try {
    const file = await Deno.open(temporaryPath, {
      create: true,
      truncate: true,
      write: true,
    });
    try {
      await file.write(bytes);
      await file.sync();
    } finally {
      file.close();
    }
    await (hooks.rename ?? Deno.rename)(temporaryPath, filePath);
  } catch (error) {
    try {
      await Deno.remove(temporaryPath);
    } catch {
      // Preserve the original write error and the previous committed file.
    }
    throw error;
  }
}

async function loadSnapshot(
  filePath: string,
): Promise<Fp004DurableSnapshot | undefined> {
  try {
    const text = await Deno.readTextFile(filePath);
    const bytes = TEXT_ENCODER.encode(text);
    if (bytes.byteLength > MAX_SNAPSHOT_BYTES) {
      throw new Error("FP-004 durable snapshot exceeds the size bound.");
    }
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object") {
      throw new Error("FP-004 durable snapshot is not an object.");
    }
    return parsed as Fp004DurableSnapshot;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw new Error("FP-004 durable snapshot could not be loaded.", {
      cause: error,
    });
  }
}

export class Fp004FileDurableAdapter {
  readonly capability = FP004_FILE_DURABILITY_CAPABILITY;
  readonly storageRoot: string;
  readonly filePath: string;
  readonly #testHooks: Fp004FileAdapterTestHooks;
  readonly #memory: Fp004RestartableInMemoryAdapter;

  private constructor(
    storageRoot: string,
    filePath: string,
    memory: Fp004RestartableInMemoryAdapter,
    testHooks: Fp004FileAdapterTestHooks,
  ) {
    this.storageRoot = storageRoot;
    this.filePath = filePath;
    this.#memory = memory;
    this.#testHooks = testHooks;
  }

  static async open(
    storageRoot: string,
    snapshotName: string,
    options: Fp004AdapterOptions = {},
  ): Promise<Fp004FileDurableAdapter> {
    return await Fp004FileDurableAdapter.#open(
      storageRoot,
      snapshotName,
      options,
      {},
    );
  }

  static async openForTest(
    storageRoot: string,
    snapshotName: string,
    options: Fp004AdapterOptions = {},
    testHooks: Fp004FileAdapterTestHooks = {},
  ): Promise<Fp004FileDurableAdapter> {
    return await Fp004FileDurableAdapter.#open(
      storageRoot,
      snapshotName,
      options,
      testHooks,
    );
  }

  static async #open(
    storageRoot: string,
    snapshotName: string,
    options: Fp004AdapterOptions,
    testHooks: Fp004FileAdapterTestHooks,
  ): Promise<Fp004FileDurableAdapter> {
    const validatedPath = await resolveStoragePath(storageRoot, snapshotName);
    const snapshot = await loadSnapshot(validatedPath.filePath);
    const memory = snapshot === undefined
      ? new Fp004RestartableInMemoryAdapter(options)
      : Fp004RestartableInMemoryAdapter.fromSnapshot(snapshot, options);
    const adapter = new Fp004FileDurableAdapter(
      validatedPath.storageRoot,
      validatedPath.filePath,
      memory,
      testHooks,
    );
    if (snapshot === undefined) await adapter.#persist();
    return adapter;
  }

  snapshot(): Fp004DurableSnapshot {
    return this.#memory.snapshot();
  }

  async commit(
    request: Fp004CommitRequest,
  ): Promise<Fp004Result<Fp004CommitResult>> {
    try {
      return await this.#memory.commit(request);
    } finally {
      // A post-commit crash is persisted before the caller receives/retries it.
      await this.#persist();
    }
  }

  async leaseOutbox(
    request: Fp004LeaseRequest,
  ): Promise<Fp004Result<Fp004LeaseResult<Fp004OutboxRecord>>> {
    try {
      return this.#memory.leaseOutbox(request);
    } finally {
      await this.#persist();
    }
  }

  async acknowledgeOutbox(
    id: string,
    lease: Fp004LeaseResult<Fp004OutboxRecord>["lease"],
  ): Promise<ReturnType<Fp004RestartableInMemoryAdapter["acknowledgeOutbox"]>> {
    try {
      return this.#memory.acknowledgeOutbox(id, lease);
    } finally {
      await this.#persist();
    }
  }

  replay(
    request: Fp004ReplayRequest,
  ): Fp004Result<Fp004ReplayResult> {
    return this.#memory.replay(request);
  }

  getEvent(eventId: Fp004EventId) {
    return this.#memory.getEvent(eventId);
  }

  getInbox(id: string) {
    return this.#memory.getInbox(id);
  }

  getOutbox(id: string) {
    return this.#memory.getOutbox(id);
  }

  listConsumerFailures(): readonly Fp004ConsumerFailure[] {
    return this.#memory.listConsumerFailures();
  }

  async #persist(): Promise<void> {
    await writeAtomically(
      this.filePath,
      snapshotBytes(this.#memory.snapshot()),
      this.#testHooks,
    );
  }
}
