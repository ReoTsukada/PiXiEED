/**
 * Bounded recording byte sinks for Phase 2-C.
 *
 * The recorder writes PCM frames to a temporary OPFS file while capture is in
 * progress.  At Stop it creates the final WAV header and copies the temp file
 * in bounded ranges, hashing the final bytes without ever assembling a long
 * recording in RAM.
 */

import {
  asAudioContentHash,
  AUDIO200_SCHEMA_VERSION,
  type Audio200Result,
  type AudioContentHash,
  audioFail,
  audioOk,
  sourcePathIsSafe,
} from "../audio-200/contracts.ts";

const MAX_WRITE_BYTES = 4 * 1024 * 1024;
const COPY_CHUNK_BYTES = 1024 * 1024;
const WAV_HEADER_BYTES = 44;

export interface AudioRecordingStorageBegin {
  readonly tempPath: string;
  readonly finalPath: string;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 16;
}

export interface AudioRecordingStoredSource {
  readonly relativePath: string;
  readonly codec: "WAV_PCM";
  readonly mimeType: "audio/wav";
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 16;
  readonly sampleFrames: number;
  readonly durationUs: number;
  readonly byteLength: number;
  readonly contentHash: AudioContentHash;
}

export interface AudioRecordingWriteSession {
  writePcm16(bytes: Uint8Array): Promise<Audio200Result<true>>;
  finalize(
    sampleFrames: number,
  ): Promise<Audio200Result<AudioRecordingStoredSource>>;
  cancel(): Promise<Audio200Result<true>>;
}

export interface AudioRecordingStorage {
  begin(
    input: AudioRecordingStorageBegin,
  ): Promise<Audio200Result<AudioRecordingWriteSession>>;
  remove(relativePath: string): Promise<Audio200Result<true>>;
}

/** Test-only view of the deterministic in-memory sink. */
export interface MemoryAudioRecordingStorage extends AudioRecordingStorage {
  get(relativePath: string): Uint8Array | undefined;
}

function fail<T>(
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(
    recoverable ? "AUDIO_SOURCE_UNAVAILABLE" : "AUDIO_INVALID_SOURCE",
    message,
    path,
    recoverable,
  );
}

function validPath(path: string): boolean {
  return sourcePathIsSafe(path) &&
    path.split("/").every((segment) =>
      segment.length > 0 && segment !== "." && segment !== ".."
    );
}

function validBegin(input: AudioRecordingStorageBegin): boolean {
  return validPath(input.tempPath) && validPath(input.finalPath) &&
    input.tempPath !== input.finalPath &&
    Number.isSafeInteger(input.sampleRateHz) &&
    input.sampleRateHz >= 8_000 && input.sampleRateHz <= 192_000 &&
    (input.channels === 1 || input.channels === 2) && input.bitDepth === 16;
}

function wavHeader(
  sampleRateHz: number,
  channels: 1 | 2,
  sampleFrames: number,
): Uint8Array {
  const dataBytes = sampleFrames * channels * 2;
  const bytes = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

/** Small incremental SHA-256 implementation used only for streamed WAV bytes. */
class Sha256Accumulator {
  private static readonly K = new Uint32Array([
    0x428a2f98,
    0x71374491,
    0xb5c0fbcf,
    0xe9b5dba5,
    0x3956c25b,
    0x59f111f1,
    0x923f82a4,
    0xab1c5ed5,
    0xd807aa98,
    0x12835b01,
    0x243185be,
    0x550c7dc3,
    0x72be5d74,
    0x80deb1fe,
    0x9bdc06a7,
    0xc19bf174,
    0xe49b69c1,
    0xefbe4786,
    0x0fc19dc6,
    0x240ca1cc,
    0x2de92c6f,
    0x4a7484aa,
    0x5cb0a9dc,
    0x76f988da,
    0x983e5152,
    0xa831c66d,
    0xb00327c8,
    0xbf597fc7,
    0xc6e00bf3,
    0xd5a79147,
    0x06ca6351,
    0x14292967,
    0x27b70a85,
    0x2e1b2138,
    0x4d2c6dfc,
    0x53380d13,
    0x650a7354,
    0x766a0abb,
    0x81c2c92e,
    0x92722c85,
    0xa2bfe8a1,
    0xa81a664b,
    0xc24b8b70,
    0xc76c51a3,
    0xd192e819,
    0xd6990624,
    0xf40e3585,
    0x106aa070,
    0x19a4c116,
    0x1e376c08,
    0x2748774c,
    0x34b0bcb5,
    0x391c0cb3,
    0x4ed8aa4a,
    0x5b9cca4f,
    0x682e6ff3,
    0x748f82ee,
    0x78a5636f,
    0x84c87814,
    0x8cc70208,
    0x90befffa,
    0xa4506ceb,
    0xbef9a3f7,
    0xc67178f2,
  ]);
  private readonly state = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  private readonly buffer = new Uint8Array(64);
  private bufferLength = 0;
  private totalBytes = 0;
  private finalized = false;

  update(input: Uint8Array): void {
    if (this.finalized) throw new Error("SHA-256 accumulator is finalized.");
    this.totalBytes += input.byteLength;
    let offset = 0;
    if (this.bufferLength > 0) {
      const copied = Math.min(64 - this.bufferLength, input.byteLength);
      this.buffer.set(input.subarray(0, copied), this.bufferLength);
      this.bufferLength += copied;
      offset += copied;
      if (this.bufferLength === 64) {
        this.process(this.buffer);
        this.bufferLength = 0;
      }
    }
    while (offset + 64 <= input.byteLength) {
      this.process(input.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < input.byteLength) {
      this.buffer.set(input.subarray(offset), 0);
      this.bufferLength = input.byteLength - offset;
    }
  }

  digestHex(): string {
    if (this.finalized) throw new Error("SHA-256 accumulator is finalized.");
    const bitLength = this.totalBytes * 8;
    const paddingLength = this.bufferLength < 56
      ? 56 - this.bufferLength
      : 120 - this.bufferLength;
    const padding = new Uint8Array(paddingLength + 8);
    padding[0] = 0x80;
    const lengthView = new DataView(padding.buffer);
    lengthView.setUint32(padding.length - 4, bitLength >>> 0, false);
    lengthView.setUint32(
      padding.length - 8,
      Math.floor(bitLength / 0x1_0000_0000),
      false,
    );
    this.update(padding);
    this.finalized = true;
    return Array.from(this.state).map((value) =>
      value.toString(16).padStart(8, "0")
    )
      .join("");
  }

  private process(block: Uint8Array): void {
    const words = new Uint32Array(64);
    const view = new DataView(
      block.buffer,
      block.byteOffset,
      block.byteLength,
    );
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const value = words[index - 15]!;
      const s0 = (value >>> 7 | value << 25) ^
        (value >>> 18 | value << 14) ^ (value >>> 3);
      const previous = words[index - 2]!;
      const s1 = (previous >>> 17 | previous << 15) ^
        (previous >>> 19 | previous << 13) ^ (previous >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }
    let a = this.state[0]!;
    let b = this.state[1]!;
    let c = this.state[2]!;
    let d = this.state[3]!;
    let e = this.state[4]!;
    let f = this.state[5]!;
    let g = this.state[6]!;
    let h = this.state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^
        (e >>> 25 | e << 7);
      const choose = (e & f) ^ (~e & g);
      const temp1 =
        (h + s1 + choose + Sha256Accumulator.K[index]! + words[index]!) >>> 0;
      const s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^
        (a >>> 22 | a << 10);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    this.state[0] = (this.state[0]! + a) >>> 0;
    this.state[1] = (this.state[1]! + b) >>> 0;
    this.state[2] = (this.state[2]! + c) >>> 0;
    this.state[3] = (this.state[3]! + d) >>> 0;
    this.state[4] = (this.state[4]! + e) >>> 0;
    this.state[5] = (this.state[5]! + f) >>> 0;
    this.state[6] = (this.state[6]! + g) >>> 0;
    this.state[7] = (this.state[7]! + h) >>> 0;
  }
}

interface WritableHandle {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface FileHandle {
  createWritable(): Promise<WritableHandle>;
  getFile(): Promise<{
    readonly size: number;
    slice(
      start?: number,
      end?: number,
    ): { arrayBuffer(): Promise<ArrayBuffer> };
  }>;
}

interface DirectoryHandle {
  getDirectoryHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<DirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<FileHandle>;
  removeEntry(name: string): Promise<void>;
}

interface NavigatorStorage {
  getDirectory(): Promise<DirectoryHandle>;
}

function navigatorStorage(): NavigatorStorage | undefined {
  return (globalThis as {
    readonly navigator?: { readonly storage?: NavigatorStorage };
  })
    .navigator?.storage;
}

async function openOpfsFile(
  path: string,
  create: boolean,
): Promise<FileHandle> {
  if (!validPath(path)) throw new Error("Recording OPFS path is invalid.");
  const storage = navigatorStorage();
  if (storage === undefined) throw new Error("OPFS is unavailable.");
  let directory = await storage.getDirectory();
  const segments = path.split("/");
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return directory.getFileHandle(segments[segments.length - 1]!, { create });
}

async function removeOpfsFile(path: string): Promise<void> {
  if (!validPath(path)) return;
  const storage = navigatorStorage();
  if (storage === undefined) return;
  let directory = await storage.getDirectory();
  const segments = path.split("/");
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create: false });
  }
  await directory.removeEntry(segments[segments.length - 1]!);
}

function createOpfsSinkSession(
  input: AudioRecordingStorageBegin,
  tempWriter: WritableHandle,
): AudioRecordingWriteSession {
  const frameBytes = input.channels * 2;
  let dataBytes = 0;
  let closed = false;
  const closeTemp = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await tempWriter.close();
  };
  return {
    async writePcm16(bytes) {
      if (closed) return fail("Recording sink is already closed.", "recording");
      if (
        bytes.byteLength < 1 || bytes.byteLength > MAX_WRITE_BYTES ||
        bytes.byteLength % frameBytes !== 0
      ) {
        return fail(
          "PCM chunk is outside the bounded frame boundary.",
          "recording.chunk",
        );
      }
      try {
        await tempWriter.write(bytes);
        dataBytes += bytes.byteLength;
        return audioOk(true);
      } catch {
        return fail("OPFS recording write failed.", "storage.opfs", true);
      }
    },
    async finalize(sampleFrames) {
      if (!Number.isSafeInteger(sampleFrames) || sampleFrames < 1) {
        return fail(
          "Recording contains no complete PCM frames.",
          "recording.sampleFrames",
        );
      }
      if (dataBytes !== sampleFrames * frameBytes) {
        return fail(
          "Recorded PCM frame count does not match the byte sink.",
          "recording.sampleFrames",
        );
      }
      try {
        await closeTemp();
        const temp = await openOpfsFile(input.tempPath, false);
        const file = await temp.getFile();
        if (file.size !== dataBytes) {
          throw new Error("OPFS temp byte count changed during finalization.");
        }
        const finalHandle = await openOpfsFile(input.finalPath, true);
        const finalWriter = await finalHandle.createWritable();
        const header = wavHeader(
          input.sampleRateHz,
          input.channels,
          sampleFrames,
        );
        const hash = new Sha256Accumulator();
        hash.update(header);
        await finalWriter.write(header);
        for (let offset = 0; offset < file.size; offset += COPY_CHUNK_BYTES) {
          const length = Math.min(COPY_CHUNK_BYTES, file.size - offset);
          const bytes = new Uint8Array(
            await file.slice(offset, offset + length).arrayBuffer(),
          );
          if (bytes.byteLength !== length) {
            throw new Error("OPFS temp read was truncated.");
          }
          hash.update(bytes);
          await finalWriter.write(bytes);
        }
        await finalWriter.close();
        await removeOpfsFile(input.tempPath);
        const contentHash = asAudioContentHash(hash.digestHex());
        return audioOk({
          relativePath: input.finalPath,
          codec: "WAV_PCM",
          mimeType: "audio/wav",
          sampleRateHz: input.sampleRateHz,
          channels: input.channels,
          bitDepth: input.bitDepth,
          sampleFrames,
          durationUs: Math.round(sampleFrames * 1_000_000 / input.sampleRateHz),
          byteLength: WAV_HEADER_BYTES + dataBytes,
          contentHash,
        });
      } catch {
        await removeOpfsFile(input.tempPath).catch(() => undefined);
        await removeOpfsFile(input.finalPath).catch(() => undefined);
        return fail(
          "OPFS recording finalization failed.",
          "storage.opfs",
          true,
        );
      }
    },
    async cancel() {
      try {
        await closeTemp();
        // Cancellation is idempotent: a path that was never finalized is
        // already clean and must not turn a successful Cancel into an error.
        await removeOpfsFile(input.tempPath).catch(() => undefined);
        await removeOpfsFile(input.finalPath).catch(() => undefined);
        return audioOk(true);
      } catch {
        return fail(
          "OPFS recording cancellation failed.",
          "storage.opfs",
          true,
        );
      }
    },
  };
}

/** Browser OPFS sink. The final WAV is never assembled in memory. */
export function createOpfsAudioRecordingStorage(): AudioRecordingStorage {
  return {
    async begin(input) {
      if (!validBegin(input)) {
        return fail(
          "Recording storage parameters are invalid.",
          "recording.storage",
        );
      }
      try {
        const temp = await openOpfsFile(input.tempPath, true);
        const writer = await temp.createWritable();
        return audioOk(createOpfsSinkSession(input, writer));
      } catch {
        return fail(
          "OPFS recording could not be opened.",
          "storage.opfs",
          true,
        );
      }
    },
    async remove(relativePath) {
      try {
        await removeOpfsFile(relativePath);
        return audioOk(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return audioOk(true);
        }
        return fail("OPFS recording cleanup failed.", "storage.opfs", true);
      }
    },
  };
}

/** Small deterministic sink for host-neutral tests; production uses OPFS. */
export function createMemoryAudioRecordingStorage(): MemoryAudioRecordingStorage {
  const files = new Map<string, Uint8Array>();
  return {
    get(relativePath) {
      const bytes = files.get(relativePath);
      return bytes === undefined ? undefined : new Uint8Array(bytes);
    },
    async begin(input) {
      if (!validBegin(input)) {
        return fail("Recording storage path is invalid.", "recording.storage");
      }
      const chunks: Uint8Array[] = [];
      let dataBytes = 0;
      let cancelled = false;
      return audioOk({
        async writePcm16(bytes) {
          const frameBytes = input.channels * 2;
          if (
            cancelled || bytes.byteLength < 1 ||
            bytes.byteLength > MAX_WRITE_BYTES ||
            bytes.byteLength % frameBytes !== 0
          ) {
            return fail(
              "PCM chunk is outside the bounded frame boundary.",
              "recording.chunk",
            );
          }
          chunks.push(new Uint8Array(bytes));
          dataBytes += bytes.byteLength;
          return audioOk(true);
        },
        async finalize(sampleFrames) {
          const frameBytes = input.channels * 2;
          if (
            cancelled || dataBytes !== sampleFrames * frameBytes ||
            sampleFrames < 1
          ) {
            return fail(
              "Recorded PCM frame count is invalid.",
              "recording.sampleFrames",
            );
          }
          const header = wavHeader(
            input.sampleRateHz,
            input.channels,
            sampleFrames,
          );
          const all = new Uint8Array(header.byteLength + dataBytes);
          all.set(header, 0);
          let offset = header.byteLength;
          const hash = new Sha256Accumulator();
          hash.update(header);
          for (const chunk of chunks) {
            all.set(chunk, offset);
            hash.update(chunk);
            offset += chunk.byteLength;
          }
          files.set(input.finalPath, all);
          chunks.length = 0;
          return audioOk({
            relativePath: input.finalPath,
            codec: "WAV_PCM",
            mimeType: "audio/wav",
            sampleRateHz: input.sampleRateHz,
            channels: input.channels,
            bitDepth: input.bitDepth,
            sampleFrames,
            durationUs: Math.round(
              sampleFrames * 1_000_000 / input.sampleRateHz,
            ),
            byteLength: all.byteLength,
            contentHash: asAudioContentHash(hash.digestHex()),
          });
        },
        async cancel() {
          cancelled = true;
          chunks.length = 0;
          files.delete(input.finalPath);
          return audioOk(true);
        },
      });
    },
    async remove(relativePath) {
      files.delete(relativePath);
      return audioOk(true);
    },
  };
}

export { AUDIO200_SCHEMA_VERSION };
