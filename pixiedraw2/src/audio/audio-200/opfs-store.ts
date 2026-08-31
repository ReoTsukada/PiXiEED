/** Browser-only OPFS adapter. It stores bytes by the canonical revision path. */

import {
  type Audio200Result,
  audioDiagnostic,
  audioFail,
  audioOk,
  type AudioRevision,
  sourcePathIsSafe,
} from "./contracts.ts";
import { verifySourceBlobAgainstRevision } from "./metadata-authority.ts";
import {
  AUDIO200_MAX_RANGE_BYTES,
  type AudioAssetByteStore,
} from "./audio-asset-store.ts";

interface OpfsFileHandle {
  createWritable(): Promise<
    { write(data: Uint8Array): Promise<void>; close(): Promise<void> }
  >;
  getFile(): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    slice(start?: number, end?: number): {
      arrayBuffer(): Promise<ArrayBuffer>;
    };
  }>;
}

interface OpfsDirectoryHandle {
  getDirectoryHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<OpfsDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<OpfsFileHandle>;
  removeEntry(name: string): Promise<void>;
}

interface OpfsNavigatorStorage {
  getDirectory(): Promise<OpfsDirectoryHandle>;
}

function opfsStorage(): OpfsNavigatorStorage | undefined {
  const candidate = (globalThis as {
    readonly navigator?: { readonly storage?: OpfsNavigatorStorage };
  }).navigator;
  return candidate?.storage;
}

function unavailable<T>(message: string): Audio200Result<T> {
  return audioFail(
    "AUDIO_HOST_BOUNDARY_INVALID",
    message,
    "storage.opfs",
    true,
  );
}

function validRange(
  revision: AudioRevision,
  offset: number,
  length: number,
): Audio200Result<true> {
  const byteLength = revision.source.metadata.byteLength;
  if (
    !Number.isSafeInteger(offset) || offset < 0 ||
    !Number.isSafeInteger(length) || length < 0 ||
    length > AUDIO200_MAX_RANGE_BYTES ||
    !Number.isSafeInteger(offset + length) || offset + length > byteLength
  ) {
    return audioFail(
      "AUDIO_INVALID_NUMBER",
      "Audio range must be a bounded interval inside the immutable source.",
      "range",
    );
  }
  return audioOk(true);
}

function pathSegments(revision: AudioRevision): Audio200Result<string[]> {
  const locator = revision.source.locator;
  if (locator.placement !== "OPFS" || locator.namespace !== "audio") {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "OPFS storage requires a canonical OPFS audio locator.",
      "revision.source.locator",
    );
  }
  if (!sourcePathIsSafe(locator.relativePath)) {
    return audioFail(
      "AUDIO_PATH_TRAVERSAL",
      "OPFS path is not a bounded relative path.",
      "revision.source.locator.relativePath",
    );
  }
  return audioOk(locator.relativePath.split("/"));
}

async function openFile(
  revision: AudioRevision,
  create: boolean,
): Promise<Audio200Result<OpfsFileHandle>> {
  const storage = opfsStorage();
  if (storage === undefined) {
    return unavailable(
      "This browser does not expose Origin Private File System.",
    );
  }
  const segments = pathSegments(revision);
  if (!segments.ok) return segments;
  if (segments.value.length === 0) {
    return audioFail(
      "AUDIO_INVALID_SOURCE",
      "OPFS path is empty.",
      "storage.opfs",
    );
  }
  try {
    let directory = await storage.getDirectory();
    for (const segment of segments.value.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(segment, { create });
    }
    return audioOk(
      await directory.getFileHandle(
        segments.value[segments.value.length - 1]!,
        {
          create,
        },
      ),
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "OPFS access failed.";
    return audioFail(
      "AUDIO_SOURCE_UNAVAILABLE",
      message,
      "storage.opfs",
      true,
    );
  }
}

export function createOpfsAudioAssetByteStore(): AudioAssetByteStore {
  return {
    async put(revision, bytes) {
      const verified = await verifySourceBlobAgainstRevision(bytes, revision);
      if (!verified.ok) return verified;
      const handle = await openFile(revision, true);
      if (!handle.ok) return handle;
      try {
        const writable = await handle.value.createWritable();
        await writable.write(new Uint8Array(bytes));
        await writable.close();
        return audioOk(true);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "OPFS write failed.";
        return audioFail(
          "AUDIO_SOURCE_UNAVAILABLE",
          message,
          "storage.opfs",
          true,
        );
      }
    },
    async get(revision) {
      const handle = await openFile(revision, false);
      if (!handle.ok) {
        if (handle.diagnostics[0]?.code === "AUDIO_SOURCE_UNAVAILABLE") {
          return audioOk(null, handle.diagnostics);
        }
        return handle as Audio200Result<Uint8Array | null>;
      }
      try {
        const file = await handle.value.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const verified = await verifySourceBlobAgainstRevision(bytes, revision);
        if (!verified.ok) return verified as Audio200Result<Uint8Array | null>;
        return audioOk(bytes);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "OPFS read failed.";
        return audioFail(
          "AUDIO_SOURCE_UNAVAILABLE",
          message,
          "storage.opfs",
          true,
        );
      }
    },
    async getRange(revision, offset, length) {
      const valid = validRange(revision, offset, length);
      if (!valid.ok) return valid as Audio200Result<Uint8Array | null>;
      const handle = await openFile(revision, false);
      if (!handle.ok) {
        if (handle.diagnostics[0]?.code === "AUDIO_SOURCE_UNAVAILABLE") {
          return audioOk(null, handle.diagnostics);
        }
        return handle as Audio200Result<Uint8Array | null>;
      }
      try {
        const file = await handle.value.getFile();
        const bytes = new Uint8Array(
          await file.slice(offset, offset + length).arrayBuffer(),
        );
        if (bytes.byteLength !== length) {
          return audioFail(
            "AUDIO_RAW_BLOB_MODIFIED",
            "OPFS returned fewer bytes than the immutable range requested.",
            "range",
          );
        }
        return audioOk(bytes);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "OPFS range read failed.";
        return audioFail(
          "AUDIO_SOURCE_UNAVAILABLE",
          message,
          "storage.opfs",
          true,
        );
      }
    },
    async has(revision) {
      const handle = await openFile(revision, false);
      if (!handle.ok) {
        if (handle.diagnostics[0]?.code === "AUDIO_SOURCE_UNAVAILABLE") {
          return audioOk(false, handle.diagnostics);
        }
        return handle as Audio200Result<boolean>;
      }
      return audioOk(true);
    },
    async remove(revision) {
      const segments = pathSegments(revision);
      if (!segments.ok) return segments;
      const storage = opfsStorage();
      if (storage === undefined) {
        return unavailable(
          "This browser does not expose Origin Private File System.",
        );
      }
      try {
        let directory = await storage.getDirectory();
        for (const segment of segments.value.slice(0, -1)) {
          directory = await directory.getDirectoryHandle(segment, {
            create: false,
          });
        }
        await directory.removeEntry(segments.value[segments.value.length - 1]!);
        return audioOk(true);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotFoundError") return audioOk(true);
        const message = error instanceof Error
          ? error.message
          : "OPFS remove failed.";
        return audioFail(
          "AUDIO_SOURCE_UNAVAILABLE",
          message,
          "storage.opfs",
          true,
        );
      }
    },
  };
}
