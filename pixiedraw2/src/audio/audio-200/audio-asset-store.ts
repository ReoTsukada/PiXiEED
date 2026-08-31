/** Host-neutral byte storage boundary for Audio Asset revisions. */

import {
  type Audio200Result,
  audioDiagnostic,
  audioFail,
  audioOk,
  type AudioRevision,
} from "./contracts.ts";
import { verifySourceBlobAgainstRevision } from "./metadata-authority.ts";

/** A single streaming read is deliberately bounded to keep memory predictable. */
export const AUDIO200_MAX_RANGE_BYTES = 4 * 1024 * 1024;

function validateRange(
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

export interface AudioAssetByteStore {
  put(
    revision: AudioRevision,
    bytes: Uint8Array,
  ): Promise<Audio200Result<true>>;
  get(
    revision: AudioRevision,
  ): Promise<Audio200Result<Uint8Array | null>>;
  /** Read only the requested immutable source interval. */
  getRange(
    revision: AudioRevision,
    offset: number,
    length: number,
  ): Promise<Audio200Result<Uint8Array | null>>;
  has(revision: AudioRevision): Promise<Audio200Result<boolean>>;
  remove(revision: AudioRevision): Promise<Audio200Result<true>>;
}

function keyFor(revision: AudioRevision): string {
  return `${revision.assetId}/${revision.revisionId}`;
}

/** Deterministic test/preview store. Values are copied on both boundaries. */
export function createMemoryAudioAssetByteStore(): AudioAssetByteStore {
  const bytesByRevision = new Map<string, Uint8Array>();
  return {
    async put(revision, bytes) {
      const verified = await verifySourceBlobAgainstRevision(bytes, revision);
      if (!verified.ok) return verified;
      bytesByRevision.set(keyFor(revision), new Uint8Array(bytes));
      return audioOk(true);
    },
    async get(revision) {
      const value = bytesByRevision.get(keyFor(revision));
      if (value === undefined) {
        return audioOk(null, [
          audioDiagnostic(
            "AUDIO_SOURCE_UNAVAILABLE",
            "Audio Asset bytes are not present in the byte store.",
            "revision.source",
            true,
          ),
        ]);
      }
      const verified = await verifySourceBlobAgainstRevision(value, revision);
      if (!verified.ok) return verified as Audio200Result<Uint8Array | null>;
      return audioOk(new Uint8Array(value));
    },
    async getRange(revision, offset, length) {
      const valid = validateRange(revision, offset, length);
      if (!valid.ok) return valid as Audio200Result<Uint8Array | null>;
      const value = bytesByRevision.get(keyFor(revision));
      if (value === undefined) {
        return audioOk(null, [
          audioDiagnostic(
            "AUDIO_SOURCE_UNAVAILABLE",
            "Audio Asset bytes are not present in the byte store.",
            "revision.source",
            true,
          ),
        ]);
      }
      if (value.byteLength !== revision.source.metadata.byteLength) {
        return audioFail(
          "AUDIO_RAW_BLOB_MODIFIED",
          "Stored source byte length does not match the immutable Revision.",
          "revision.source.metadata.byteLength",
        );
      }
      return audioOk(new Uint8Array(value.slice(offset, offset + length)));
    },
    async has(revision) {
      return audioOk(bytesByRevision.has(keyFor(revision)));
    },
    async remove(revision) {
      bytesByRevision.delete(keyFor(revision));
      return audioOk(true);
    },
  };
}

export function unavailableAudioAssetStore(
  message = "This host does not provide a local Audio Asset byte store.",
): AudioAssetByteStore {
  return {
    async put() {
      return audioFail("AUDIO_HOST_BOUNDARY_INVALID", message, "storage", true);
    },
    async get() {
      return audioOk(null, [
        audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", message, "storage", true),
      ]);
    },
    async getRange() {
      return audioOk(null, [
        audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", message, "storage", true),
      ]);
    },
    async has() {
      return audioOk(false, [
        audioDiagnostic("AUDIO_SOURCE_UNAVAILABLE", message, "storage", true),
      ]);
    },
    async remove() {
      return audioOk(true);
    },
  };
}
